/* Native APK/device collector. Only controls its dedicated debug package; never calls an emulator a phone. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const { PNG } = require('pngjs');
const { parseProcessTable, isPackageProcess } = require('./android-phone-process-table.cjs');
const {
    inspectRuntime,
    inputFiles: colorInputFiles,
    normalizeScreen,
} = require('./android-phone-color-presentation.cjs');
const root = path.resolve(process.cwd());
const verifyRoot = path.join(root, 'tools/verify');
const { probesPassed, verifyPresentation, sourceBinding } = require(path.join(verifyRoot, 'runtime-interop.cjs'));
const { SCENE_IDS, scenePassed } = require(path.join(verifyRoot, 'runtime-interop/scene-contract.cjs'));
const { verifyScenePresentation } = require(path.join(verifyRoot, 'runtime-interop/scene-oracles.cjs'));
const PACKAGE = 'com.mystral.engine.interop';
const COMPONENT = `${PACKAGE}/com.mystral.engine.MystralActivity`;
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (value, message) => {
    if (!value) throw Error(message);
};

function parseArgs(argv) {
    const args = {};
    for (const arg of argv) {
        const m =
            /^--(serial|apk|assets|out|python|case|matrix|install|timeout-ms|build-report|host-source|acknowledge-4k-elf-warning)(?:=(.*))?$/.exec(
                arg,
            );
        if (!m || Object.hasOwn(args, m[1])) throw Error(`Unknown or duplicate argument: ${arg}`);
        args[m[1]] = m[2] ?? true;
    }
    for (const key of ['serial', 'apk', 'assets', 'out', 'build-report'])
        assert(typeof args[key] === 'string' && args[key], `--${key}=<value> required`);
    for (const key of ['matrix', 'install', 'acknowledge-4k-elf-warning'])
        if (args[key] !== undefined) assert(args[key] === true, `--${key} does not take a value`);
    if (args.case) assert(['probes', 'air', ...SCENE_IDS].includes(args.case), 'Unknown Android diagnostic case');
    assert(!(args.case && args.matrix), '--case and --matrix cannot be combined');
    args.timeout = Number(args['timeout-ms'] || 120000);
    assert(
        Number.isInteger(args.timeout) && args.timeout >= 15000 && args.timeout <= 300000,
        'Case budget must be 15000..300000ms',
    );
    return args;
}

function inspectApk(apk, python) {
    const code = `import zipfile,hashlib,json,sys\nz=zipfile.ZipFile(sys.argv[1]); r={}\nfor n in z.namelist():\n if n.startswith(('assets/interop/','assets/v8/','lib/')) and not n.endswith('/'):\n  h=hashlib.sha256(); size=0\n  with z.open(n) as f:\n   while True:\n    b=f.read(1024*1024)\n    if not b: break\n    h.update(b);size+=len(b)\n  r[n]={'bytes':size,'sha256':h.hexdigest()}\nprint(json.dumps(r))`;
    return JSON.parse(execFileSync(python, ['-c', code, apk], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
}

function cropScreen(bytes, bounds) {
    const source = PNG.sync.read(bytes);
    const { x, y, width, height } = bounds;
    assert(
        [x, y, width, height].every(Number.isInteger) &&
            x >= 0 &&
            y >= 0 &&
            width > 0 &&
            height > 0 &&
            x + width <= source.width &&
            y + height <= source.height,
        'Surface bounds do not fit the real screen PNG',
    );
    const target = new PNG({ width, height });
    PNG.bitblt(source, target, x, y, width, height, 0, 0);
    return PNG.sync.write(target);
}

// A narrow selector for the Android system's debug-only ELF alignment warning.
// A different dialog, a different package, or an ambiguous button never produces a tap.
function select4kElfWarning(raw, pageSize) {
    if (pageSize !== 4096 || typeof raw !== 'string' || /<!DOCTYPE/i.test(raw)) return null;
    const document = /<hierarchy\b[^>]*>[\s\S]*<\/hierarchy>/.exec(raw)?.[0];
    if (!document || (document.match(/<hierarchy\b/g) || []).length !== 1) return null;
    const decode = (value) =>
        value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (_, entity) => {
            if (entity[0] === '#')
                return String.fromCodePoint(
                    entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)),
                );
            return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' }[entity.toLowerCase()];
        });
    const roots = [],
        stack = [];
    try {
        for (const token of document.matchAll(/<node\b[^>]*>|<\/node\s*>/g)) {
            if (token[0].startsWith('</')) {
                if (!stack.length) return null;
                stack.pop();
                continue;
            }
            const node = { children: [] };
            for (const attr of token[0].matchAll(/([\w:-]+)="([^"]*)"/g)) {
                if (Object.hasOwn(node, attr[1])) return null;
                node[attr[1]] = decode(attr[2]);
            }
            if (stack.length) stack.at(-1).children.push(node);
            else roots.push(node);
            if (!/\/\s*>$/.test(token[0])) stack.push(node);
        }
    } catch {
        return null;
    }
    if (stack.length || !roots.length) return null;
    const flatten = (node) => [node, ...node.children.flatMap(flatten)];
    const nodes = roots.flatMap(flatten),
        matches = [];
    for (const panel of nodes.filter(
        (node) => node.package === 'android' && node['resource-id'] === 'android:id/parentPanel',
    )) {
        const contents = flatten(panel);
        const messages = contents.filter(
            (node) => node.package === 'android' && node['resource-id'] === 'android:id/message',
        );
        const buttons = contents.filter((node) => node['resource-id'] === 'android:id/button2');
        if (messages.length !== 1 || buttons.length !== 1) continue;
        const warning = messages[0].text || '',
            button = buttons[0];
        if (
            !/\b16\s*KB\b/i.test(warning.replace(/https?:\/\/\S+/gi, '')) ||
            !['libmystral-runtime.so', 'libv8android.so', 'libSDL3.so'].every((library) => warning.includes(library)) ||
            button.package !== 'android' ||
            button.class !== 'android.widget.Button' ||
            button.enabled !== 'true' ||
            button.clickable !== 'true' ||
            !['确定', 'OK'].includes(button.text)
        )
            continue;
        const bounds = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(button.bounds || '');
        if (!bounds) continue;
        const [left, top, right, bottom] = bounds.slice(1).map(Number);
        if (right <= left || bottom <= top) continue;
        matches.push({
            warningText: warning,
            button: {
                text: button.text,
                resourceId: button['resource-id'],
                package: button.package,
                bounds: { left, top, right, bottom },
                x: Math.floor((left + right) / 2),
                y: Math.floor((top + bottom) / 2),
            },
        });
    }
    return matches.length === 1 ? matches[0] : null;
}

async function acknowledge4kWarning({ enabled, pageSize, adb, directory, started }) {
    const admission = {
        requested: enabled,
        pageSize,
        action: 'NOT_REQUESTED',
        originalCaseBudgetStart: started,
        admissionDeadline: started + 15000,
        changesGlobalSettings: false,
    };
    if (!enabled) return admission;
    const save = () =>
        fs.writeFileSync(path.join(directory, 'elf-warning-admission.json'), JSON.stringify(admission, null, 2) + '\n');
    const remaining = () => {
        assert(Date.now() < admission.admissionDeadline, 'Original fifteen-second admission/capture budget exceeded');
        return Math.min(5000, admission.admissionDeadline - Date.now());
    };
    admission.startedAt = new Date().toISOString();
    try {
        if (pageSize !== 4096) {
            admission.action = 'NO_MATCH_PAGE_SIZE';
            return admission;
        }
        const raw = adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], false, remaining());
        fs.writeFileSync(path.join(directory, 'elf-warning-ui.xml'), raw);
        admission.xml = { file: 'elf-warning-ui.xml', sha256: sha256(Buffer.from(raw)) };
        const selected = select4kElfWarning(raw, pageSize);
        if (!selected) {
            admission.action = 'NO_MATCH';
            return admission;
        }
        admission.warningText = selected.warningText;
        admission.button = selected.button;
        const screen = adb(['exec-out', 'screencap', '-p'], true, remaining());
        const image = PNG.sync.read(screen),
            bounds = selected.button.bounds;
        fs.writeFileSync(path.join(directory, 'elf-warning-screen.png'), screen);
        admission.screen = {
            file: 'elf-warning-screen.png',
            sha256: sha256(screen),
            width: image.width,
            height: image.height,
        };
        assert(
            bounds.left >= 0 && bounds.top >= 0 && bounds.right <= image.width && bounds.bottom <= image.height,
            'System warning button bounds do not fit the original screen PNG',
        );
        admission.action = 'PLAIN_OK_TAP_ATTEMPTED';
        save();
        admission.tapOutput = adb(
            ['shell', 'input', 'tap', String(selected.button.x), String(selected.button.y)],
            false,
            remaining(),
        ).trim();
        remaining();
        admission.action = 'ACKNOWLEDGED_4K_ELF_WARNING';
    } catch (error) {
        admission.action = admission.action === 'PLAIN_OK_TAP_ATTEMPTED' ? 'PLAIN_OK_TAP_FAILED' : 'INSPECTION_FAILED';
        admission.error = String(error.stack || error);
    } finally {
        admission.finishedAt = new Date().toISOString();
        save();
    }
    return admission;
}

async function main(argv) {
    const args = parseArgs(argv);
    const out = path.resolve(root, args.out),
        apk = path.resolve(root, args.apk);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.mkdirSync(out);
    const report = {
        schema: 'air-android-acceptance-v1',
        measuredAt: new Date().toISOString(),
        subset: true,
        releaseReady: false,
        functional4kOnly: true,
        elf16kCompatible: false,
        canonicalCollectorSha256: sha256(fs.readFileSync(path.join(verifyRoot, 'runtime-interop-android.cjs'))),
        package: PACKAGE,
        serial: args.serial,
        cases: [],
        completed: false,
        pass: false,
        matrixRequested: !!args.matrix,
        diagnosticCase: args.case || null,
        physicalAcceptance: false,
    };
    const save = () => fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    const adb = (values, binary = false, timeout = 15000) =>
        execFileSync('adb', ['-s', args.serial, ...values], {
            encoding: binary ? undefined : 'utf8',
            timeout,
            maxBuffer: 32 * 1024 * 1024,
            windowsHide: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    const shell = (...values) => adb(['shell', ...values]).trim();
    const getprop = (key) => shell('getprop', key);
    const required = args.case ? [args.case] : ['probes', 'air', ...(args.matrix ? SCENE_IDS : [])];
    report.requiredCases = required;
    let logcat, nativeBuild, nativeCppClosure;
    save();
    try {
        assert(shell('getprop', 'sys.boot_completed') === '1', 'Android device has not completed boot');
        report.device = {
            qemu: getprop('ro.kernel.qemu'),
            model: getprop('ro.product.model'),
            fingerprint: getprop('ro.build.fingerprint'),
            api: Number(getprop('ro.build.version.sdk')),
            abiList: getprop('ro.product.cpu.abilist').split(','),
            nativeBridge: getprop('ro.dalvik.vm.native.bridge'),
            pageSize: Number(shell('getconf', 'PAGESIZE')),
        };
        report.device.emulator = report.device.qemu === '1' || args.serial.startsWith('emulator-');
        report.colorRuntime = inspectRuntime(args.python || process.env.AIR_PYTHON || 'python');
        report.apk = {
            file: path.relative(root, apk).replace(/\\/g, '/'),
            bytes: fs.statSync(apk).size,
            sha256: sha256(fs.readFileSync(apk)),
        };
        const stageFile = path.resolve(root, args.assets);
        const stageBytes = fs.readFileSync(stageFile),
            manifest = JSON.parse(stageBytes);
        assert(manifest.schema === 'air-android-assets-v1', 'Unknown Android asset manifest');
        assert(sourceBinding(path.resolve(root, manifest.bundle.file)).matches, 'Local SDK source binding is stale');
        report.assetsManifest = {
            file: path.relative(root, stageFile).replace(/\\/g, '/'),
            sha256: sha256(stageBytes),
            sdkSha256: manifest.bundle.sha256,
        };
        const inputFiles = [
            __filename,
            require.resolve('./android-phone-process-table.cjs'),
            ...colorInputFiles(report.colorRuntime),
            path.join(verifyRoot, 'runtime-interop-android.cjs'),
            stageFile,
            apk,
            path.join(root, 'tools/build/runtime-interop-android.cjs'),
            path.join(verifyRoot, 'runtime-interop.cjs'),
            path.join(verifyRoot, 'runtime-interop/scene-contract.cjs'),
            path.join(verifyRoot, 'runtime-interop/scene-oracles.cjs'),
            path.join(root, 'package-lock.json'),
        ];
        assert(
            sha256(fs.readFileSync(path.join(root, manifest.generator.file))) === manifest.generator.sha256,
            'Asset generator changed after staging; prepare a new APK candidate',
        );
        for (const expected of Object.values(manifest.files)) {
            const source = path.resolve(root, expected.source);
            if (fs.existsSync(source) && fs.statSync(source).isFile()) {
                assert(
                    sha256(fs.readFileSync(source)) === expected.sha256,
                    'Staged source changed: ' + expected.source,
                );
                inputFiles.push(source);
            }
        }
        if (args['build-report']) {
            const buildFile = path.resolve(root, args['build-report']);
            const build = JSON.parse(fs.readFileSync(buildFile));
            nativeBuild = build;
            const closureFile = path.join(path.dirname(buildFile), 'static-link-closure.json');
            nativeCppClosure = JSON.parse(fs.readFileSync(closureFile));
            assert(
                nativeCppClosure.passVerified === true &&
                    nativeCppClosure.normalLinkWithoutDuplicateSuppression === true &&
                    nativeCppClosure.cppUndefinedSymbols.length === 0,
                'Static C++ closure is not verified',
            );
            assert(
                nativeCppClosure.nativeLibraries.length === 2 &&
                    nativeCppClosure.nativeLibraries.every((lib) =>
                        lib.needed.every((n) => n !== 'libc++_shared.so' && n !== 'libv8android.so'),
                    ),
                'Dynamic C++ dependency remains',
            );
            inputFiles.push(closureFile);
            const beforeFile = path.join(path.dirname(buildFile), 'source-before.json');
            const afterFile = path.join(path.dirname(buildFile), 'source-after.json');
            const before = JSON.parse(fs.readFileSync(beforeFile)),
                after = JSON.parse(fs.readFileSync(afterFile));
            const canonical = (v) =>
                JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b, 'en'))));
            assert(
                build.schema === 'mystral-android-build-v1' &&
                    build.compiled === true &&
                    build.sourceInputsUnchanged === true &&
                    build.assetsInputsUnchanged === true &&
                    build.signatureVerified === true &&
                    build.payload?.pass === true &&
                    build.apk.sha256 === report.apk.sha256 &&
                    build.apk.bytes === report.apk.bytes &&
                    build.package === PACKAGE &&
                    canonical(before) === canonical(after),
                'Android build receipt/source/APK binding failed',
            );
            const sourceRoot = path.resolve(root, args['host-source'] || 'output/runtime-interop/mystral-source');
            for (const [relative, expected] of Object.entries(after)) {
                const file = path.resolve(sourceRoot, relative);
                assert(
                    file.startsWith(sourceRoot + path.sep) && sha256(fs.readFileSync(file)) === expected,
                    'Native source changed after APK compilation: ' + relative,
                );
                inputFiles.push(file);
            }
            inputFiles.push(buildFile, beforeFile, afterFile);
            report.hostBuild = {
                matches: true,
                file: path.relative(root, buildFile).replace(/\\/g, '/'),
                sha256: sha256(fs.readFileSync(buildFile)),
                compiledSourcesSha256: sha256(Buffer.from(canonical(after))),
                abi: build.abi,
            };
        }
        const fingerprintInputs = () =>
            Object.fromEntries(
                [...new Set(inputFiles)].map((file) => [
                    path.relative(root, file).replace(/\\/g, '/'),
                    sha256(fs.readFileSync(file)),
                ]),
            );
        report.inputs = fingerprintInputs();
        const zip = inspectApk(apk, args.python || process.env.AIR_PYTHON || 'python');
        report.apkFiles = zip;
        assert(
            nativeCppClosure.nativeLibraries.every(
                (lib) => zip[lib.file]?.sha256 === lib.sha256 && zip[lib.file]?.bytes === lib.bytes,
            ),
            'Closure belongs to a different APK',
        );
        for (const archive of ['libc++_static.a', 'libc++abi.a', 'libv8_monolith.a'])
            assert(
                nativeCppClosure.map.origins[archive]?.count > 0,
                'Static archive absent from real link map: ' + archive,
            );
        for (const [file, expected] of Object.entries(manifest.files))
            assert(
                zip[`assets/${file}`]?.sha256 === expected.sha256 && zip[`assets/${file}`].bytes === expected.bytes,
                `APK asset differs: ${file}`,
            );
        assert(zip['assets/interop/manifest.json']?.sha256 === sha256(stageBytes), 'APK/staging manifests differ');
        assert(
            Object.keys(zip).some((n) => /^lib\/[^/]+\/libmystral-runtime\.so$/.test(n)),
            'APK has no native runtime',
        );
        report.collectorSha256 = sha256(fs.readFileSync(__filename));
        if (args.install) {
            report.install = adb(['install', '-r', apk], false, 120000);
            assert(/\bSuccess\b/.test(report.install), 'ADB did not confirm package installation');
        }
        const installed = shell('pm', 'path', PACKAGE)
            .split(/\r?\n/)
            .find((v) => v.startsWith('package:'));
        assert(installed, 'Dedicated debug package is not installed');
        report.installedApk = installed.slice(8);
        report.installedSha256 = shell('sha256sum', report.installedApk).split(/\s/)[0];
        assert(report.installedSha256 === report.apk.sha256, 'Installed APK does not match the collected APK');
        const log = fs.openSync(path.join(out, 'logcat.txt'), 'wx');
        logcat = spawn(
            'adb',
            [
                '-s',
                args.serial,
                'logcat',
                '-v',
                'threadtime',
                '-T',
                '1',
                'MystralInterop:V',
                'MystralRuntime:V',
                'MystralJS:V',
                'SDL:V',
                'AndroidRuntime:E',
                'ActivityManager:I',
                'ActivityTaskManager:I',
                'libc:F',
                '*:S',
            ],
            { windowsHide: true, stdio: ['ignore', log, log] },
        );
        fs.closeSync(log);
        for (const id of required) {
            const directory = path.join(out, id);
            fs.mkdirSync(directory);
            const runId = `android-${Date.now()}-${id}-${crypto.randomBytes(3).toString('hex')}`;
            const row = { caseId: id, runId, captures: [], completed: false, pass: false, timeoutMs: args.timeout };
            report.cases.push(row);
            save();
            let port, session;
            const started = Date.now();
            const privateRoot = `files/interop/${runId}/`;
            try {
                row.preStop = shell('am', 'force-stop', PACKAGE);
                row.launch = shell(
                    'am',
                    'start',
                    '-W',
                    '-n',
                    COMPONENT,
                    '--es',
                    'run_id',
                    runId,
                    '--es',
                    'case_id',
                    id,
                );
                assert(!/Error:|Exception/.test(row.launch), 'Android did not start the Activity');
                row.admission = await acknowledge4kWarning({
                    enabled: args['acknowledge-4k-elf-warning'] === true,
                    pageSize: report.device.pageSize,
                    adb,
                    directory,
                    started,
                });
                save();
                while (Date.now() - started < 20000 && !session) {
                    try {
                        session = JSON.parse(shell('run-as', PACKAGE, 'cat', privateRoot + 'session.json'));
                    } catch {
                        await sleep(150);
                    }
                }
                assert(session?.runId === runId && session.caseId === id, 'No matching Android session');
                row.session = session;
                fs.writeFileSync(path.join(directory, 'session.json'), JSON.stringify(session, null, 2) + '\n');
                port = adb(['forward', 'tcp:0', `tcp:${new URL(session.origin).port}`]).trim();
                const origin = `http://127.0.0.1:${port}`;
                const request = async (route, body, binary = false) => {
                    const response = await fetch(origin + route, {
                        method: body === undefined ? 'GET' : 'POST',
                        headers: {
                            'X-Interop-Token': session.token,
                            ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                        },
                        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                        signal: AbortSignal.timeout(5000),
                    });
                    assert(response.ok, `Android transport ${route} HTTP ${response.status}`);
                    return binary ? Buffer.from(await response.arrayBuffer()) : response.json();
                };
                const done = new Set();
                let state;
                const previous = {};
                while (Date.now() - started < args.timeout) {
                    state = await request('/state');
                    row.runtime = state.runtime;
                    for (const capture of state.captures)
                        if (capture.metadata && !capture.acknowledged && !done.has(capture.captureId)) {
                            done.add(capture.captureId);
                            const meta = capture.metadata;
                            assert(
                                meta.pid === session.pid &&
                                    meta.runId === runId &&
                                    meta.resultCode === 0 &&
                                    meta.channel === 'android-pixelcopy',
                                'Capture does not bind the native session',
                            );
                            const kind = id === 'probes' || id === 'air' ? id : `scene-${id}`;
                            assert(
                                meta.kind === kind && meta.phase === (capture.phase || ''),
                                'Capture case/phase mismatch',
                            );
                            assert(/^[A-Za-z0-9_.-]+$/.test(meta.file), 'Invalid private capture artifact name');
                            const bytes = await request('/artifact/' + meta.file, undefined, true);
                            assert(sha256(bytes) === meta.sha256, 'PixelCopy PNG hash mismatch');
                            fs.writeFileSync(path.join(directory, meta.file), bytes);
                            const scene = SCENE_IDS.includes(id),
                                phase = capture.phase || undefined;
                            const surface = scene
                                ? verifyScenePresentation(bytes, kind, { phase, previousBytes: previous.surface })
                                : verifyPresentation(bytes, kind);
                            if (phase === 'after')
                                assert(
                                    meta.previous?.sha256 === previous.sha256 &&
                                        meta.previous.pid === session.pid &&
                                        meta.previous.surfaceGeneration === meta.surfaceGeneration,
                                    'Before/after Android surface identity changed',
                                );
                            const screen = adb(['exec-out', 'screencap', '-p'], true);
                            const prefix = kind + (phase ? '-' + phase : '');
                            fs.writeFileSync(path.join(directory, prefix + '.screen.png'), screen);
                            const cropped = cropScreen(screen, meta.bounds);
                            fs.writeFileSync(path.join(directory, prefix + '.screen-crop.png'), cropped);
                            const rawOracle = scene
                                ? verifyScenePresentation(cropped, kind, {
                                      phase,
                                      previousBytes: previous.rawCompositor,
                                  })
                                : verifyPresentation(cropped, kind);
                            const normalized = normalizeScreen({
                                python: args.python || process.env.AIR_PYTHON || 'python',
                                runtime: report.colorRuntime,
                                inputFile: path.join(directory, prefix + '.screen.png'),
                                outputFile: path.join(directory, prefix + '.screen-srgb.png'),
                                metadataFile: path.join(directory, prefix + '.screen-color.json'),
                                iccFile: path.join(directory, prefix + '.screen-source.icc'),
                            });
                            const srgbCrop = cropScreen(normalized.bytes, meta.bounds);
                            fs.writeFileSync(path.join(directory, prefix + '.screen-srgb-crop.png'), srgbCrop);
                            const compositor = scene
                                ? verifyScenePresentation(srgbCrop, kind, { phase, previousBytes: previous.compositor })
                                : verifyPresentation(srgbCrop, kind);
                            const verified = {
                                ...surface,
                                pass: surface.pass && compositor.pass,
                                status: surface.pass && compositor.pass ? 'PASS' : 'FAIL',
                                channel: 'android-pixelcopy-and-adb-compositor',
                            };
                            const evidence = {
                                captureId: capture.captureId,
                                metadata: meta,
                                surface,
                                compositor,
                                screenSha256: sha256(screen),
                                cropSha256: sha256(cropped),
                                rawOracle,
                                srgbScreenSha256: sha256(normalized.bytes),
                                srgbCropSha256: sha256(srgbCrop),
                                normalization: {
                                    metadataFile: prefix + '.screen-color.json',
                                    metadata: normalized.metadata,
                                    icc: normalized.icc,
                                },
                                pass: verified.pass,
                            };
                            row.captures.push(evidence);
                            fs.writeFileSync(
                                path.join(directory, prefix + '.verification.json'),
                                JSON.stringify(evidence, null, 2) + '\n',
                            );
                            if (phase === 'before') {
                                previous.surface = bytes;
                                previous.rawCompositor = cropped;
                                previous.compositor = srgbCrop;
                                previous.sha256 = meta.sha256;
                            }
                            row.lastAck = await request('/ack', {
                                captureId: capture.captureId,
                                sha256: meta.sha256,
                                result: verified,
                            });
                            save();
                        }
                    if (state.reportSaved) break;
                    assert(!state.nativeFinished, 'Native runtime ended before saving its complete report');
                    await sleep(75);
                }
                assert(state?.reportSaved, 'Original Android case execution budget exceeded');
                const raw = await request('/artifact/report.json', undefined, true);
                fs.writeFileSync(path.join(directory, 'app-report.json'), raw);
                const app = JSON.parse(raw);
                row.application = app;
                assert(
                    app.schema === 'air-android-case-v1' && app.runId === runId && app.caseId === id,
                    'App report identity mismatch',
                );
                const nativeABI = row.runtime.loadedABI;
                assert(
                    row.runtime.nativeStarted === true &&
                        row.runtime.jsEngine === 'v8' &&
                        row.runtime.backend === 'dawn',
                    'Runtime did not acknowledge the selected native V8/Dawn configuration',
                );
                assert(
                    zip[`lib/${nativeABI}/libmystral-runtime.so`] && report.device.abiList.includes(nativeABI),
                    'Runtime ABI does not match APK/device',
                );
                const mode = row.runtime.v8StartupMode;
                assert(['external', 'embedded'].includes(mode), 'Native V8 startup mode is missing');
                assert(mode === nativeBuild.v8StartupMode, 'Runtime/build startup modes differ');
                const parseVersion = (v) => /^(\d+\.\d+\.\d+\.\d+)(?:$|[-+ (])/.exec(String(v))?.[1];
                assert(
                    parseVersion(row.runtime.v8Version) &&
                        parseVersion(row.runtime.v8Version) === parseVersion(nativeBuild.v8Version),
                    'Actual native V8 version differs from provider',
                );
                if (mode === 'external') {
                    const snapshot = zip[`assets/v8/${nativeABI}/snapshot_blob.bin`];
                    assert(
                        typeof snapshot?.sha256 === 'string' && snapshot.sha256 === row.runtime.snapshotSha256,
                        'Runtime external snapshot differs from APK',
                    );
                } else {
                    assert(
                        nativeBuild.v8LibraryKind === 'static' && nativeBuild.androidStl === 'c++_static',
                        'Embedded profile is not the requested static runtime',
                    );
                    assert(
                        !Object.keys(zip).some((n) => n.startsWith('assets/v8/') && n.endsWith('/snapshot_blob.bin')),
                        'Stale external snapshot was packaged',
                    );
                    assert(
                        row.runtime.snapshotSha256 === undefined && row.runtime.snapshotPath === undefined,
                        'Embedded startup must not report an external snapshot',
                    );
                    const libraries = Object.keys(zip).filter((n) => n.startsWith('lib/'));
                    assert(
                        libraries.length === 2 &&
                            libraries.includes(`lib/${nativeABI}/libSDL3.so`) &&
                            libraries.includes(`lib/${nativeABI}/libmystral-runtime.so`),
                        'Static C++ profile contains unexpected native libraries',
                    );
                    assert(
                        nativeCppClosure?.passVerified === true && nativeCppClosure?.cppUndefinedSymbols?.length === 0,
                        'Native static C++ closure was not verified',
                    );
                }
                row.v8Boot = {
                    mode,
                    actualVersion: row.runtime.v8Version,
                    libraryKind: nativeBuild.v8LibraryKind,
                    androidStl: nativeBuild.androidStl,
                };
                assert(
                    manifest.files['interop/entry.js'].sha256 === row.runtime.entrySha256,
                    'Private native entry differs from packaged entry',
                );
                const businessPass =
                    id === 'probes'
                        ? probesPassed(app.result)
                        : id === 'air'
                          ? app.result?.id === 'air-webgpu-smoke' && app.result.status === 'PASS'
                          : scenePassed(app.result, id);
                row.completed = app.completed === true;
                row.pass =
                    row.completed &&
                    app.pass === true &&
                    app.consoleErrors?.length === 0 &&
                    businessPass &&
                    row.captures.length === (SCENE_IDS.includes(id) ? 2 : 1) &&
                    row.captures.every((c) => c.pass);
                for (const name of ['lifecycle.jsonl', 'events.jsonl', 'snapshot-receipt.json', 'native-ready.json']) {
                    try {
                        fs.writeFileSync(
                            path.join(directory, name),
                            await request('/artifact/' + name, undefined, true),
                        );
                    } catch {}
                }
                const liveTable = adb(['shell', 'ps', '-A', '-o', 'PID,NAME']);
                fs.writeFileSync(path.join(directory, 'process-table-before-finish.txt'), liveTable);
                const liveRows = parseProcessTable(liveTable);
                assert(
                    liveRows.some((row) => row.pid === session.pid && row.name === PACKAGE),
                    'The original native session PID/package is not live before finish',
                );
                row.liveProcessCheck = { completed: true, pid: session.pid, package: PACKAGE };
                const exitDeadline = Date.now() + 10000;
                row.finish = await request('/finish', {});
                while (Date.now() < exitDeadline && !row.nativeExit) {
                    try {
                        const bytes = adb(
                            ['shell', 'run-as', PACKAGE, 'cat', privateRoot + 'native-exit.json'],
                            true,
                            Math.max(1, exitDeadline - Date.now()),
                        );
                        assert(Date.now() <= exitDeadline, 'Original native exit budget exceeded');
                        row.nativeExit = JSON.parse(bytes);
                        fs.writeFileSync(path.join(directory, 'native-exit.json'), bytes);
                    } catch {
                        await sleep(100);
                    }
                }
                row.pass &&= row.nativeExit?.pid === session.pid && row.nativeExit.code === 0 && !row.nativeExit.error;
                assert(row.nativeExit, 'Native SDL_main exit was not acknowledged');
            } catch (error) {
                row.pass = false;
                row.error = String(error.stack || error);
                try {
                    fs.writeFileSync(
                        path.join(directory, 'crash-logcat.txt'),
                        adb(['logcat', '-d', '-b', 'crash', '-t', '200']),
                    );
                } catch {}
            } finally {
                try {
                    row.stop = shell('am', 'force-stop', PACKAGE);
                } catch (error) {
                    row.stopError = String(error);
                    row.pass = false;
                }
                let remaining = [];
                let connected = false;
                try {
                    const table = adb(['shell', 'ps', '-A', '-o', 'PID,NAME']);
                    fs.writeFileSync(path.join(directory, 'process-table-after-stop.txt'), table);
                    const processes = parseProcessTable(table);
                    remaining = processes.filter((row) => isPackageProcess(row, PACKAGE)).map((row) => String(row.pid));
                    row.processCheckCompleted = true;
                } catch (error) {
                    row.processCheckError = String(error);
                }
                try {
                    connected = adb(['get-state']).trim() === 'device';
                } catch {}
                row.pidGoneCheck = { connected, remainingPids: remaining };
                row.pidGone = connected && row.processCheckCompleted === true && remaining.length === 0;
                row.pass &&= row.pidGone;
                if (port)
                    try {
                        adb(['forward', '--remove', 'tcp:' + port]);
                    } catch {}
                row.elapsedMs = Date.now() - started;
                save();
            }
        }
        report.completed = report.cases.length === required.length && report.cases.every((c) => c.completed);
        report.inputsUnchanged = JSON.stringify(fingerprintInputs()) === JSON.stringify(report.inputs);
        report.pass = report.completed && report.cases.every((c) => c.pass) && report.inputsUnchanged;
        report.simulatorAcceptance = report.pass && report.device.emulator;
        report.physicalAcceptance = report.pass && !report.device.emulator;
    } catch (error) {
        report.error = String(error.stack || error);
    } finally {
        if (logcat) {
            logcat.kill();
            await Promise.race([new Promise((resolve) => logcat.once('close', resolve)), sleep(1000)]);
        }
        report.finishedAt = new Date().toISOString();
        report.status = report.pass ? 'PASS' : 'FAIL';
        save();
        console.log(
            JSON.stringify({
                status: report.status,
                completed: report.completed,
                emulator: report.device?.emulator,
                physicalAcceptance: report.physicalAcceptance,
                report: path.relative(root, path.join(out, 'report.json')).replace(/\\/g, '/'),
            }),
        );
    }
    return report.pass ? 0 : 1;
}
module.exports = { parseArgs, cropScreen, inspectApk, select4kElfWarning };
if (require.main === module)
    main(process.argv.slice(2))
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error) => {
            console.error(String(error));
            process.exitCode = 1;
        });
