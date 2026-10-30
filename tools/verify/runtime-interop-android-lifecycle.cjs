/* Explicit Android lifecycle evidence. Operates only the dedicated debug package; does not install or rebuild it.
 * Each run requires a new --out directory. Real 16 KB runs require the existing strict compatibility policy.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, spawn } = require('node:child_process');
const JSZip = require('jszip');
const { PNG } = require('pngjs');
const { cropScreen } = require('./runtime-interop-android.cjs');
const helperRoot = './runtime-interop-android/lib/';
const { parseProcessTable, isPackageProcess } = require(helperRoot + 'android-phone-process-table.cjs');
const { inspectRuntime, inputFiles: colorInputs, normalizeScreen } = require(
    helperRoot + 'android-phone-color-presentation.cjs',
);
const PACKAGE = 'com.mystral.engine.interop';
const COMPONENT = PACKAGE + '/com.mystral.engine.MystralActivity';
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const monotonicMs = () => Number(process.hrtime.bigint()) / 1000000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const check = (value, message) => {
    if (!value) throw Error(message);
};

function parseArgs(argv) {
    const args = { 'expected-page-size': 16384, 'soak-seconds': 900 };
    const supplied = new Set();
    for (const arg of argv) {
        const match = /^--(serial|apk|out|python|expected-page-size|soak-seconds)=(.+)$/.exec(arg);
        check(match && !supplied.has(match[1]), 'Unknown or duplicate argument: ' + arg);
        supplied.add(match[1]);
        args[match[1]] = match[2];
    }
    for (const name of ['serial', 'apk', 'out']) check(args[name]?.trim(), '--' + name + ' is required');
    check(!/\s/.test(args.serial), 'Exactly one ADB serial is required');
    for (const name of ['expected-page-size', 'soak-seconds']) {
        check(/^\d+$/.test(String(args[name])), '--' + name + ' must be an integer');
        args[name] = Number(args[name]);
        check(Number.isSafeInteger(args[name]), '--' + name + ' is out of range');
    }
    check([4096, 16384].includes(args['expected-page-size']), 'Expected page size must be 4096 or 16384');
    check(args['soak-seconds'] === 0 || args['soak-seconds'] >= 900, 'Soak must be 0 (diagnostic) or at least 900s');
    return args;
}

function component(value) {
    const match = /^([A-Za-z0-9_.$]+)\/([A-Za-z0-9_.$]+)$/.exec(value || '');
    return match ? match[1] + '/' + (match[2].startsWith('.') ? match[1] + match[2] : match[2]) : null;
}

function topActivity(raw) {
    const rows = raw.split(/\r?\n/).filter((line) => /^\s*topResumedActivity=/.test(line));
    if (rows.length !== 1) return null;
    return component(/\b([A-Za-z0-9_.$]+\/[A-Za-z0-9_.$]+)(?=\s|})/.exec(rows[0])?.[1]);
}

function surfaceBounds(raw) {
    check(/<hierarchy\b/.test(raw) && /<\/hierarchy>/.test(raw), 'Incomplete UI hierarchy');
    const rows = [];
    for (const match of raw.matchAll(/<node\b[^>]*>/g)) {
        const attributes = Object.fromEntries([...match[0].matchAll(/([\w:-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
        if (attributes.package === PACKAGE && attributes.class === 'android.view.SurfaceView') rows.push(attributes);
    }
    check(rows.length === 1 && rows[0].enabled === 'true', 'No unique enabled native SurfaceView');
    const found = /^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/.exec(rows[0].bounds || '');
    check(found, 'Native Surface bounds are unavailable');
    const [x, y, right, bottom] = found.slice(1).map(Number);
    const value = { x, y, width: right - x, height: bottom - y };
    check(value.width === 320 && value.height === 240, 'Actual native Surface dimensions changed');
    return value;
}

function colors(bytes) {
    const png = PNG.sync.read(bytes);
    let orange = 0,
        green = 0,
        blue = 0;
    for (let i = 0; i < png.data.length; i += 4) {
        const [r, g, b] = png.data.subarray(i, i + 3);
        if (r > g + 50 && r > b + 50) orange++;
        if (g > r + 50 && g > b + 50) green++;
        if (b > r + 20 && b > g + 10) blue++;
    }
    return { width: png.width, height: png.height, orange, green, blue, sha256: hash(bytes) };
}

function imagePassed(value, wanted) {
    return value.width === 320 && value.height === 240 && value[wanted] > 1000 && value.blue > 30000;
}

async function poll(operation, timeout = 15000) {
    const deadline = Date.now() + timeout;
    let last;
    while (Date.now() < deadline) {
        const remaining = () => {
            check(Date.now() < deadline, 'Original operation deadline exceeded');
            return Math.max(1, deadline - Date.now());
        };
        try {
            const result = await operation(remaining);
            if (result && Date.now() <= deadline) return result;
        } catch (error) {
            last = error;
        }
        if (Date.now() < deadline) await sleep(Math.min(100, deadline - Date.now()));
    }
    throw last || Error('Original operation deadline exceeded');
}

async function main(argv) {
    const args = parseArgs(argv);
    const root = process.cwd();
    const out = path.resolve(args.out);
    const apk = path.resolve(args.apk);
    const python = args.python || process.env.AIR_PYTHON || 'python';
    fs.mkdirSync(out);
    fs.mkdirSync(path.join(out, 'commands'));
    const save = (name, value) => {
        fs.writeFileSync(
            path.join(out, name),
            typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n',
        );
    };
    const report = {
        schema: 'air-android-runtime-lifecycle-v1',
        createdAt: new Date().toISOString(),
        serial: args.serial,
        runId: 'android-lifecycle-' + Date.now(),
        scope: 'existing-demo-lifecycle-and-bounded-stability',
        subset: true,
        releaseReady: false,
        completed: false,
        pass: false,
        expectedPageBytes: args['expected-page-size'],
        requestedSoakSeconds: args['soak-seconds'],
        budgets: {
            operationMs: 15000,
            captureAndAckMs: 15000,
            resumeIncludingAutomaticPaintAndInputMs: 15000,
            nativeExitMs: 10000,
            heartbeatMs: 30000,
            maximumHeartbeatIntervalMs: 45000,
            collectorLogCloseMs: 2000,
            samplingLimitMeaning: 'Bounded evidence sampling mechanics; not an application performance target',
        },
        stages: Object.fromEntries(
            ['initial', 'background', 'lock', 'surface', 'continuous'].map((n) => [n, { status: 'NOT_RUN' }]),
        ),
        captures: [],
        observations: [],
        commandCount: 0,
        limitations: [
            'Initial PixelCopy pair retains the original same-Surface scene contract; lifecycle recovery uses fresh independent compositor captures.',
            'Continuous running is a bounded stability check, not long-run stress, performance or leak-free certification.',
            'Resource release means the real existing native teardown and process shutdown contract; no per-object GPU leak census is available.',
        ],
    };
    const ownFiles = [
        __filename,
        require.resolve('./runtime-interop-android.cjs'),
        require.resolve(helperRoot + 'android-phone-process-table.cjs'),
        require.resolve('pngjs'),
        require.resolve('jszip'),
        apk,
    ];
    const fingerprint = () =>
        Object.fromEntries(
            [...new Set(ownFiles)]
                .sort()
                .map((file) => [path.relative(root, file).replace(/\\/g, '/'), hash(fs.readFileSync(file))]),
        );
    const adb = (values, binary = false, timeout = 15000) => {
        const index = ++report.commandCount;
        const name = 'commands/' + String(index).padStart(5, '0');
        const row = {
            arguments: ['-s', args.serial, ...values],
            startedAt: new Date().toISOString(),
            timeoutMs: Math.max(1, Math.min(15000, timeout)),
        };
        try {
            const result = execFileSync('adb', row.arguments, {
                timeout: row.timeoutMs,
                windowsHide: true,
                maxBuffer: 64 * 1024 * 1024,
                stdio: ['ignore', 'pipe', 'pipe'],
            });
            save(name + '.stdout', result);
            row.exitCode = 0;
            return binary ? result : result.toString('utf8');
        } catch (error) {
            save(name + '.stdout', error.stdout || Buffer.alloc(0));
            save(name + '.stderr', error.stderr || String(error));
            row.exitCode = error.status;
            row.error = String(error);
            throw error;
        } finally {
            row.finishedAt = new Date().toISOString();
            save(name + '.json', row);
        }
    };
    const shell = (values, timeout) => adb(['shell', ...values], false, timeout).trim();
    let logcat,
        logcatClose,
        logcatCloseResult,
        port,
        session,
        privateDir,
        request,
        ownsPackage = false,
        finishRequested = false;
    let taps = 0,
        lastFrames = -1,
        shotSequence = 0;
    const privateFile = (name, timeout = 15000) =>
        adb(['shell', 'run-as', PACKAGE, 'cat', privateDir + name], false, timeout);
    const privateJson = (name, timeout) => JSON.parse(privateFile(name, timeout));
    const lifecycle = (timeout = 15000) => {
        const raw = privateFile('lifecycle.jsonl', timeout);
        save('lifecycle.jsonl', raw);
        return raw
            .trim()
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => JSON.parse(line));
    };
    const top = (timeout = 15000) => topActivity(shell(['dumpsys', 'activity', 'activities'], timeout));
    const getBounds = (label, timeout = 15000) => {
        const raw = adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], false, timeout);
        save(label + '.ui.xml', raw);
        return surfaceBounds(raw);
    };
    const currentIdentity = async (label, remaining) => {
        const state = await request('/state', undefined, false, remaining());
        check(
            state.session.pid === session.pid &&
                state.session.runId === session.runId &&
                state.session.caseId === 'demo',
            'Original native session changed',
        );
        check(
            state.runtime.nativeStarted &&
                state.runtime.loadedABI === report.runtime.loadedABI &&
                state.runtime.jsEngine === 'v8' &&
                state.runtime.backend === 'dawn' &&
                state.runtime.v8StartupMode === report.runtime.v8StartupMode &&
                state.runtime.v8Version === report.runtime.v8Version,
            'Actual native runtime identity changed',
        );
        const table = adb(['shell', 'ps', '-A', '-o', 'PID,NAME'], false, remaining());
        save(label + '.processes.txt', table);
        check(
            parseProcessTable(table).some((row) => row.pid === session.pid && row.name === PACKAGE),
            'Original native process is not live',
        );
        save(label + '.state.json', state);
        return state;
    };
    const captureScreen = (label, bounds, wanted, remaining) => {
        const raw = adb(['exec-out', 'screencap', '-p'], true, remaining());
        save(label + '.screen.png', raw);
        const rawCrop = cropScreen(raw, bounds);
        save(label + '.screen-crop.png', rawCrop);
        const normalized = normalizeScreen({
            python,
            runtime: report.colorRuntime,
            inputFile: path.join(out, label + '.screen.png'),
            outputFile: path.join(out, label + '.screen-srgb.png'),
            metadataFile: path.join(out, label + '.screen-color.json'),
            iccFile: path.join(out, label + '.screen-source.icc'),
            timeoutMs: remaining(),
        });
        const crop = cropScreen(normalized.bytes, bounds);
        save(label + '.screen-srgb-crop.png', crop);
        const values = colors(crop);
        const result = {
            label,
            bounds,
            wanted,
            measuredAt: new Date().toISOString(),
            originalSha256: hash(raw),
            originalCropSha256: hash(rawCrop),
            interpretedSha256: hash(normalized.bytes),
            interpretedCropSha256: hash(crop),
            colors: values,
            pass: imagePassed(values, wanted),
            colorMetadata: label + '.screen-color.json',
        };
        report.observations.push(result);
        save(label + '.verification.json', result);
        return result;
    };
    const touchAndObserve = async (label, externalRemaining) => {
        const deadline = Date.now() + 15000;
        const remaining = () => {
            check(Date.now() < deadline, 'Original touch/render deadline exceeded');
            return Math.min(deadline - Date.now(), externalRemaining ? externalRemaining() : 15000);
        };
        await poll(() => top(remaining()) === COMPONENT, remaining());
        const bounds = getBounds(label, remaining());
        const expectedTaps = taps + 1;
        shell(['input', 'tap', String(bounds.x + bounds.width / 2), String(bounds.y + bounds.height / 2)], remaining());
        const event = await poll((inner) => {
            const raw = privateFile('events.jsonl', Math.min(inner(), remaining()));
            save(label + '.events.jsonl', raw);
            return raw
                .trim()
                .split(/\r?\n/)
                .filter(Boolean)
                .map((line) => JSON.parse(line))
                .find((value) => value.stage === 'demo-input' && value.taps === expectedTaps);
        }, remaining());
        check(
            event.isTrusted === true &&
                event.type === 'mousedown' &&
                Math.abs(event.clientX - 160) <= 1 &&
                Math.abs(event.clientY - 120) <= 1 &&
                event.frames > lastFrames &&
                Array.isArray(event.gpuErrors) &&
                event.gpuErrors.length === 0,
            'Trusted input, frame progress or GPU error contract failed',
        );
        check(event.color === (expectedTaps % 2 ? 'green' : 'orange'), 'Material state differs from real input');
        taps = expectedTaps;
        lastFrames = event.frames;
        const visual = await poll((inner) => {
            const observation = captureScreen(
                label + '-paint-' + String(shotSequence++).padStart(4, '0'),
                bounds,
                event.color,
                () => Math.min(inner(), remaining()),
            );
            return observation.pass && observation;
        }, remaining());
        check(visual.pass, 'Actual compositor did not show the changed material');
        await currentIdentity(label, remaining);
        return { event, visual, lifecycle: lifecycle(remaining()) };
    };
    const resume = async (label, boundary) => {
        const startedAt = monotonicMs();
        const deadline = Date.now() + 15000;
        const remaining = () => {
            check(Date.now() < deadline, 'Original fifteen-second resume deadline exceeded');
            return deadline - Date.now();
        };
        const recovery = {
            label,
            startedAt: new Date().toISOString(),
            monotonicStartMs: startedAt,
            budgetMs: 15000,
            existingTaps: taps,
            automaticColor: taps % 2 ? 'green' : 'orange',
        };
        (report.recoveryAttempts ||= []).push(recovery);
        shell(
            ['am', 'start', '-W', '-n', COMPONENT, '--activity-reorder-to-front', '--activity-single-top'],
            remaining(),
        );
        await poll(() => {
            if (top(remaining()) !== COMPONENT) return false;
            const rows = lifecycle(remaining());
            return (
                rows.some(
                    (row) => row.pid === session.pid && row.event === 'resume' && row.elapsedRealtime > boundary,
                ) && rows
            );
        }, remaining());
        await currentIdentity(label + '-automatic', remaining);
        const bounds = getBounds(label + '-automatic', remaining());
        recovery.automaticPresentation = await poll((inner) => {
            const observation = captureScreen(
                label + '-automatic-paint-' + String(shotSequence++).padStart(4, '0'),
                bounds,
                recovery.automaticColor,
                () => Math.min(inner(), remaining()),
            );
            return observation.pass && observation;
        }, remaining());
        recovery.beforeFirstInput = true;
        const input = await touchAndObserve(label, remaining);
        recovery.elapsedMs = monotonicMs() - startedAt;
        remaining();
        return {
            ...input,
            automaticPresentation: recovery.automaticPresentation,
            beforeFirstInput: true,
            elapsedMs: recovery.elapsedMs,
        };
    };
    const compat = () => ({
        linker: shell(['getprop', 'bionic.linker.16kb.app_compat.enabled']),
        pmDisabled: shell(['getprop', 'pm.16kb.app_compat.disabled']),
    });
    try {
        const buildFile = path.join(path.dirname(apk), 'build-report.json');
        ownFiles.push(buildFile);
        const build = JSON.parse(fs.readFileSync(buildFile));
        report.apk = {
            file: path.relative(root, apk).replace(/\\/g, '/'),
            bytes: fs.statSync(apk).size,
            sha256: hash(fs.readFileSync(apk)),
        };
        check(
            build.compiled &&
                build.apk.sha256 === report.apk.sha256 &&
                build.androidStl === 'c++_static' &&
                build.sdlVersion === '3.2.30' &&
                build.v8LibraryKind === 'static' &&
                build.v8StartupMode === 'embedded',
            'APK does not bind the accepted SDL/static candidate',
        );
        const zip = await JSZip.loadAsync(fs.readFileSync(apk));
        const assets = {};
        for (const [name, expected] of Object.entries(build.payload.assets)) {
            const entry = zip.file('assets/' + name);
            check(entry, 'Missing packaged asset: ' + name);
            const bytes = await entry.async('nodebuffer');
            check(hash(bytes) === expected, 'Packaged asset differs: ' + name);
            assets[name] = { bytes: bytes.length, sha256: hash(bytes) };
        }
        report.packagedAssets = assets;
        check(
            assets['interop/sdk/cocosair.module.js'] && assets['assets-manifest.json'],
            'SDK/manifest identity is absent',
        );
        save('packaged-assets.json', assets);
        report.colorRuntime = inspectRuntime(python);
        ownFiles.push(...colorInputs(report.colorRuntime));
        report.inputs = fingerprint();
        check(
            adb(['get-state']).trim() === 'device' && adb(['get-serialno']).trim() === args.serial,
            'ADB target differs',
        );
        report.device = {
            qemu: shell(['getprop', 'ro.kernel.qemu']),
            model: shell(['getprop', 'ro.product.model']),
            fingerprint: shell(['getprop', 'ro.build.fingerprint']),
            abiList: shell(['getprop', 'ro.product.cpu.abilist']),
            pageBytes: Number(shell(['getconf', 'PAGE_SIZE'])),
        };
        check(report.device.pageBytes === args['expected-page-size'], 'Actual page size differs');
        report.initialCompat = compat();
        if (report.device.pageBytes === 16384)
            check(
                report.initialCompat.linker === 'fatal' && report.initialCompat.pmDisabled === 'true',
                '16 KB fallback policy is not strict',
            );
        const installed = shell(['pm', 'path', PACKAGE])
            .split(/\r?\n/)
            .find((line) => line.startsWith('package:'));
        check(installed, 'Dedicated APK is not installed');
        check(shell(['sha256sum', installed.slice(8)]).split(/\s/)[0] === report.apk.sha256, 'Installed APK differs');
        ownsPackage = true;
        const fd = fs.openSync(path.join(out, 'logcat.txt'), 'wx');
        logcat = spawn(
            'adb',
            [
                '-s',
                args.serial,
                'logcat',
                '-v',
                'epoch',
                '-T',
                '1',
                'MystralInterop:V',
                'MystralRuntime:V',
                'MystralJS:V',
                'SDL:V',
                'AndroidRuntime:E',
                'libc:F',
                'DEBUG:F',
                'BufferQueueProducer:E',
                'vulkan:E',
                'ActivityManager:I',
                '*:S',
            ],
            { windowsHide: true, stdio: ['ignore', fd, fd] },
        );
        logcatClose = new Promise((resolve) => {
            logcat.once('close', (code, signal) => {
                logcatCloseResult = {
                    observed: true,
                    code,
                    signal,
                    monotonicMs: monotonicMs(),
                    measuredAt: new Date().toISOString(),
                };
                resolve(logcatCloseResult);
            });
            logcat.once('error', (error) => {
                report.logcatSpawnError = String(error);
            });
        });
        fs.closeSync(fd);
        shell(['am', 'force-stop', PACKAGE]);
        report.logTimeBounds = {
            format: 'logcat epoch',
            startEpochSecondsInclusive: Number(shell(['date', '+%s'])),
            precision:
                'Device seconds; final upper bound is the exclusive next second. The native PID and created lifecycle marker further bind the current run.',
        };
        check(Number.isSafeInteger(report.logTimeBounds.startEpochSecondsInclusive), 'Cannot bind device log clock');
        report.launch = shell(['am', 'start', '-W', '-n', COMPONENT, '--es', 'run_id', report.runId]);
        privateDir = 'files/interop/' + report.runId + '/';
        session = await poll((remaining) => privateJson('session.json', remaining()), 20000);
        check(
            session.runId === report.runId && session.caseId === 'demo' && session.demo === true,
            'Demo session differs',
        );
        save('session.json', session);
        port = adb(['forward', 'tcp:0', 'tcp:' + new URL(session.origin).port]).trim();
        request = async (route, body, binary = false, remaining = 15000) => {
            const response = await fetch('http://127.0.0.1:' + port + route, {
                method: body === undefined ? 'GET' : 'POST',
                headers: {
                    'X-Interop-Token': session.token,
                    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: AbortSignal.timeout(Math.max(1, Math.min(15000, remaining))),
            });
            const bytes = Buffer.from(await response.arrayBuffer());
            check(response.ok, route + ' HTTP ' + response.status + ' ' + bytes.toString().slice(0, 300));
            return binary ? bytes : JSON.parse(bytes);
        };
        const ready = await poll(async (remaining) => {
            const state = await request('/state', undefined, false, remaining());
            return state.reportSaved && state;
        }, 30000);
        report.runtime = ready.runtime;
        check(
            report.runtime.nativeStarted &&
                report.runtime.jsEngine === 'v8' &&
                report.runtime.backend === 'dawn' &&
                report.runtime.v8StartupMode === 'embedded' &&
                report.runtime.v8Version === '11.6.189.22',
            'Actual native V8/Dawn identity differs',
        );
        report.application = JSON.parse(await request('/artifact/report.json', undefined, true));
        check(
            report.application.schema === 'air-android-demo-v1' &&
                report.application.runId === session.runId &&
                report.application.pass === true &&
                report.application.ready &&
                report.application.scope === 'interactive-startup-only' &&
                report.application.gpuErrors?.length === 0,
            'Demo startup failed',
        );
        save('application.json', report.application);

        const capture = async (phase, wanted) => {
            const deadline = Date.now() + 15000;
            const remaining = () => {
                check(Date.now() < deadline, 'Original fifteen-second capture budget exceeded');
                return deadline - Date.now();
            };
            const pending = request('/capture', { kind: 'scene-demo', phase }, false, remaining());
            pending.catch(() => {});
            const row = await poll(async () => {
                const state = await request('/state', undefined, false, remaining());
                return state.captures.find((value) => value.phase === phase && value.metadata);
            }, remaining());
            const meta = row.metadata;
            check(
                !row.expired &&
                    meta.pid === session.pid &&
                    meta.runId === session.runId &&
                    meta.resultCode === 0 &&
                    meta.kind === 'scene-demo' &&
                    meta.phase === phase,
                'PixelCopy identity differs',
            );
            check(
                ['width', 'surfaceWidth', 'bitmapWidth', 'viewWidth'].every((key) => meta[key] === 320) &&
                    ['height', 'surfaceHeight', 'bitmapHeight', 'viewHeight'].every((key) => meta[key] === 240),
                'PixelCopy physical dimensions differ',
            );
            if (phase === 'after') {
                const before = report.captures[0].metadata;
                check(
                    meta.surfaceGeneration === before.surfaceGeneration &&
                        meta.previous?.sha256 === before.sha256 &&
                        meta.previous.pid === before.pid &&
                        meta.previous.surfaceGeneration === before.surfaceGeneration,
                    'Initial capture pair changed Surface identity',
                );
            }
            const bytes = await request('/artifact/' + meta.file, undefined, true, remaining());
            check(hash(bytes) === meta.sha256, 'PixelCopy bytes differ');
            save(meta.file, bytes);
            const surface = colors(bytes);
            const compositor = captureScreen('initial-' + phase, meta.bounds, wanted, remaining);
            const pass = imagePassed(surface, wanted) && compositor.pass;
            const evidence = { metadata: meta, surface, compositor, pass };
            report.captures.push(evidence);
            await request(
                '/ack',
                { captureId: row.captureId, sha256: meta.sha256, result: { pass, status: pass ? 'PASS' : 'FAIL' } },
                false,
                remaining(),
            );
            const accepted = await pending;
            check(
                accepted.pass === pass && accepted.sha256 === meta.sha256 && pass,
                'Initial PixelCopy acknowledgement or image failed',
            );
            remaining();
        };
        report.stages.initial.status = 'RUNNING';
        await capture('before', 'orange');
        const initial = await touchAndObserve('initial-input');
        await capture('after', 'green');
        report.stages.initial = { status: 'PASS', evidence: initial };

        report.stages.background.status = 'RUNNING';
        const previous = lifecycle().at(-1).elapsedRealtime;
        const home = shell([
            'cmd',
            'package',
            'resolve-activity',
            '--brief',
            '-a',
            'android.intent.action.MAIN',
            '-c',
            'android.intent.category.HOME',
        ])
            .split(/\r?\n/)
            .map(component)
            .filter(Boolean);
        check(home.length === 1, 'HOME launcher is ambiguous');
        shell(['input', 'keyevent', 'KEYCODE_HOME']);
        const background = await poll((remaining) => {
            const rows = lifecycle(remaining());
            const paused = rows.find(
                (row) => row.pid === session.pid && row.event === 'pause' && row.elapsedRealtime > previous,
            );
            return paused && top(remaining()) === home[0] && { paused, rows };
        });
        report.stages.background = { status: 'RUNNING', boundary: background };
        report.stages.background.recovery = await resume('background-recovery', background.paused.elapsedRealtime);
        report.stages.background.status = 'PASS';

        report.stages.lock.status = 'RUNNING';
        check(
            report.device.qemu === '1' && args.serial.startsWith('emulator-'),
            'Automated keyguard dismissal is restricted to the owned emulator',
        );
        const lockBoundary = lifecycle().at(-1).elapsedRealtime;
        shell(['input', 'keyevent', 'KEYCODE_SLEEP']);
        const locked = await poll((remaining) => {
            const power = shell(['dumpsys', 'power'], remaining());
            const windows = shell(['dumpsys', 'window', 'policy'], remaining());
            save('locked-power.txt', power);
            save('locked-window-policy.txt', windows);
            const rows = lifecycle(remaining());
            const paused = rows.find(
                (row) => row.pid === session.pid && row.event === 'pause' && row.elapsedRealtime > lockBoundary,
            );
            const showing = /(?:mShowingLockscreen|mKeyguardShowing|showing|isStatusBarKeyguard)\s*[=:]\s*true\b/i.test(
                windows,
            );
            return (
                /mWakefulness=Asleep\b/.test(power) &&
                showing &&
                paused && { paused, keyguardShowing: true, asleep: true, rows }
            );
        });
        save('locked-display.txt', shell(['dumpsys', 'display']));
        report.stages.lock = { status: 'RUNNING', boundary: locked };
        shell(['input', 'keyevent', 'KEYCODE_WAKEUP']);
        shell(['wm', 'dismiss-keyguard']);
        report.stages.lock.recovery = await resume('lock-recovery', locked.paused.elapsedRealtime);
        report.stages.lock.status = 'PASS';

        report.stages.surface.status = 'RUNNING';
        const surfaceRows = lifecycle();
        const surfaceBoundary = surfaceRows.at(-1).elapsedRealtime;
        const initialGeneration = surfaceRows.at(-1).surfaceGeneration;
        shell(['am', 'start', '-W', '-a', 'android.settings.SETTINGS']);
        const destroyed = await poll((remaining) => {
            const rows = lifecycle(remaining());
            const event = rows.find(
                (row) =>
                    row.pid === session.pid &&
                    row.event === 'surface-destroyed' &&
                    row.elapsedRealtime > surfaceBoundary &&
                    row.surfaceGeneration > initialGeneration,
            );
            const actualTop = top(remaining());
            return event && actualTop?.startsWith('com.android.settings/') && { event, rows, top: actualTop };
        });
        report.stages.surface = { status: 'RUNNING', boundary: destroyed };
        report.stages.surface.recovery = await resume('surface-recovery', destroyed.event.elapsedRealtime);
        const created = report.stages.surface.recovery.lifecycle.find(
            (row) =>
                row.pid === session.pid &&
                row.event === 'surface-created' &&
                row.elapsedRealtime > destroyed.event.elapsedRealtime &&
                row.surfaceGeneration > destroyed.event.surfaceGeneration,
        );
        check(created, 'No real Surface creation after destruction');
        report.stages.surface.created = created;
        report.stages.surface.status = 'PASS';

        if (args['soak-seconds'] > 0) {
            const start = monotonicMs();
            const wallStart = Date.now();
            const samples = [];
            report.stages.continuous = {
                status: 'RUNNING',
                startedAt: new Date(wallStart).toISOString(),
                monotonicStartMs: start,
                requestedSeconds: args['soak-seconds'],
                heartbeatMs: 30000,
                maximumHeartbeatIntervalMs: 45000,
                scheduling:
                    'Next sample starts thirty seconds after the actual previous sample start; no catch-up samples',
                samples,
            };
            let next = start,
                nextMemory = start;
            for (let index = 0; ; index++) {
                while (monotonicMs() < next) await sleep(Math.min(1000, next - monotonicMs()));
                const actualStart = monotonicMs();
                const actualWallStart = Date.now();
                const label = 'continuous-' + String(index).padStart(3, '0');
                const sample = {
                    label,
                    sampledAt: new Date(actualWallStart).toISOString(),
                    monotonicStartMs: actualStart,
                    elapsedMs: actualStart - start,
                    actualWallStartMs: actualWallStart,
                    intervalMs: samples.length ? actualStart - samples.at(-1).monotonicStartMs : null,
                    wallIntervalMs: samples.length ? actualWallStart - samples.at(-1).actualWallStartMs : null,
                    status: 'RUNNING',
                };
                samples.push(sample);
                if (sample.intervalMs !== null) {
                    check(
                        sample.intervalMs >= 30000 &&
                            sample.intervalMs <= 45000 &&
                            sample.wallIntervalMs >= 0 &&
                            sample.wallIntervalMs <= 45000,
                        'Continuous heartbeat gap exceeded the original 45-second sampling contract',
                    );
                }
                const value = await touchAndObserve(label);
                Object.assign(sample, value, {
                    status: 'PASS',
                    monotonicEndMs: monotonicMs(),
                    finishedAt: new Date().toISOString(),
                });
                if (actualStart >= nextMemory) {
                    save(label + '.meminfo.txt', shell(['dumpsys', 'meminfo', String(session.pid)]));
                    nextMemory = actualStart + 300000;
                }
                save('report-progress.json', report);
                console.log(
                    JSON.stringify({
                        stage: 'continuous',
                        sample: index,
                        elapsedSeconds: Math.round((actualStart - start) / 1000),
                        intervalMs: sample.intervalMs,
                        frames: value.event.frames,
                        status: sample.status,
                    }),
                );
                if (actualStart - samples[0].monotonicStartMs >= args['soak-seconds'] * 1000) break;
                next = actualStart + 30000;
            }
            check(
                samples.at(-1).monotonicStartMs - samples[0].monotonicStartMs >= args['soak-seconds'] * 1000 &&
                    samples.length >= Math.ceil(args['soak-seconds'] / 45) + 1,
                'Continuous observation window was incomplete',
            );
            report.stages.continuous.durationMs = monotonicMs() - start;
            report.stages.continuous.observedWindowMs = samples.at(-1).monotonicStartMs - samples[0].monotonicStartMs;
            report.stages.continuous.wallDurationMs = Date.now() - wallStart;
            report.stages.continuous.status = 'PASS';
        }
        report.completed = args['soak-seconds'] > 0;
    } catch (error) {
        report.error = String(error.stack || error);
        for (const stage of Object.values(report.stages)) if (stage.status === 'RUNNING') stage.status = 'FAIL';
        for (const sample of report.stages.continuous.samples || [])
            if (sample.status === 'RUNNING') sample.status = 'FAIL';
    } finally {
        if (ownsPackage && session && request) {
            try {
                const live = adb(['shell', 'ps', '-A', '-o', 'PID,NAME']);
                save('processes-before-finish.txt', live);
                check(
                    parseProcessTable(live).some((row) => row.pid === session.pid && row.name === PACKAGE),
                    'Original process is not live before finish',
                );
                const deadline = Date.now() + 10000;
                const remaining = () => {
                    check(Date.now() < deadline, 'Original native exit deadline exceeded');
                    return deadline - Date.now();
                };
                finishRequested = true;
                await request('/finish', {}, false, remaining());
                report.nativeExit = await poll(
                    (inner) => privateJson('native-exit.json', Math.min(inner(), remaining())),
                    remaining(),
                );
                check(
                    report.nativeExit.pid === session.pid && report.nativeExit.code === 0 && !report.nativeExit.error,
                    'Native SDL exit failed',
                );
                report.teardown = await poll(() => {
                    const raw = fs.readFileSync(path.join(out, 'logcat.txt'), 'utf8');
                    const lines = raw
                        .split(/\r?\n/)
                        .filter((line) => new RegExp('\\s' + session.pid + '\\s+\\d+\\s+[VDIWEF]\\s').test(line));
                    const markers = [
                        'runtime-reset-return',
                        'shutdown-jsEngine-return',
                        'context-surface-release-return',
                        'context-device-destroy-return',
                        'context-device-release-return',
                        'context-instance-release-return',
                        'shutdown-window-return',
                        'shutdown-complete',
                        'java-exit-notify-return',
                    ];
                    const stages = Object.fromEntries(
                        markers.map((name) => [name, lines.some((line) => line.includes('EXIT_STAGE ' + name))]),
                    );
                    const sdlReturned = lines.some((line) => /\bSDL\s*: Finished main function\s*$/.test(line));
                    return (
                        Object.values(stages).every(Boolean) &&
                        sdlReturned && {
                            pass: true,
                            stages,
                            sdlReturned,
                            elapsedMs: 10000 - remaining(),
                            rawLog: 'logcat.txt',
                        }
                    );
                }, remaining());
                save('native-exit.json', report.nativeExit);
            } catch (error) {
                report.teardownError = String(error.stack || error);
            }
        }
        if (ownsPackage) {
            for (const name of [
                'session.json',
                'native-ready.json',
                'native-exit.json',
                'lifecycle.jsonl',
                'events.jsonl',
            ]) {
                if (privateDir)
                    try {
                        save('final-' + name, privateFile(name, 3000));
                    } catch (error) {
                        (report.finalPrivateErrors ||= {})[name] = String(error);
                    }
            }
            try {
                report.finalCompat = compat();
                if (report.device.pageBytes === 16384)
                    check(
                        report.finalCompat.linker === 'fatal' && report.finalCompat.pmDisabled === 'true',
                        '16 KB compatibility policy changed',
                    );
                shell(['input', 'keyevent', 'KEYCODE_WAKEUP']);
                shell(['am', 'force-stop', PACKAGE]);
                const table = adb(['shell', 'ps', '-A', '-o', 'PID,NAME']);
                save('processes-after-stop.txt', table);
                check(
                    !parseProcessTable(table).some((row) => isPackageProcess(row, PACKAGE)),
                    'Dedicated package process remains',
                );
                check(adb(['get-state']).trim() === 'device', 'ADB target disconnected');
                report.logTimeBounds.endEpochSecondsExclusive = Number(shell(['date', '+%s'])) + 1;
                check(
                    Number.isSafeInteger(report.logTimeBounds.endEpochSecondsExclusive),
                    'Cannot bind final device log clock',
                );
                report.processCleanup = {
                    pass: true,
                    pidGone: true,
                    normalNativeExitBeforeCleanup: !!report.teardown?.pass,
                    finishRequested,
                };
            } catch (error) {
                report.cleanupError = String(error.stack || error);
            }
        }
        if (port)
            try {
                adb(['forward', '--remove', 'tcp:' + port]);
            } catch (error) {
                report.forwardCleanupError = String(error);
            }
        if (logcat) {
            const requestedAt = monotonicMs();
            const closedBeforeRequest = !!logcatCloseResult;
            let timer;
            const timeout = new Promise((resolve) => {
                timer = setTimeout(resolve, 2000);
            });
            const killRequested = logcat.kill();
            await Promise.race([logcatClose, timeout]);
            clearTimeout(timer);
            report.logcatShutdown = {
                budgetMs: 2000,
                killRequested,
                closedBeforeRequest,
                close: logcatCloseResult || null,
                elapsedMs: monotonicMs() - requestedAt,
            };
            if (
                !logcatCloseResult?.observed ||
                closedBeforeRequest ||
                report.logcatShutdown.elapsedMs > 2000 ||
                report.logcatSpawnError
            ) {
                report.collectorCloseError =
                    'Logcat collector did not remain live and physically close inside the original two-second budget';
            }
            if (session && report.logTimeBounds) {
                try {
                    const text = fs.readFileSync(path.join(out, 'logcat.txt'), 'utf8');
                    const records = text
                        .split(/\r?\n/)
                        .map((line) => {
                            const match = /^\s*(\d+\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s?(.*)$/.exec(line);
                            return (
                                match && {
                                    epochSeconds: Number(match[1]),
                                    pid: Number(match[2]),
                                    tid: Number(match[3]),
                                    priority: match[4],
                                    tag: match[5].trim(),
                                    message: match[6],
                                    raw: line,
                                }
                            );
                        })
                        .filter(Boolean);
                    const lower = report.logTimeBounds.startEpochSecondsInclusive;
                    const upper = report.logTimeBounds.endEpochSecondsExclusive;
                    check(
                        Number.isSafeInteger(lower) && Number.isSafeInteger(upper) && upper > lower,
                        'Incomplete current-run log time bounds',
                    );
                    const bounded = records.filter((row) => row.epochSeconds >= lower && row.epochSeconds < upper);
                    const created = bounded.find(
                        (row) =>
                            row.pid === session.pid &&
                            row.tag === 'MystralInterop' &&
                            /LIFECYCLE.*"event":"created"/.test(row.message),
                    );
                    check(created, 'Current PID created marker is absent from the retained epoch log');
                    const current = bounded.filter((row) => row.epochSeconds >= created.epochSeconds);
                    const fatal = [];
                    let debuggerTargetsCurrentPid = false;
                    for (const row of current) {
                        if (
                            row.pid === session.pid &&
                            ((row.tag === 'AndroidRuntime' &&
                                /FATAL EXCEPTION|Process:.*com\.mystral\.engine\.interop/.test(row.message)) ||
                                (row.tag === 'libc' && /Fatal signal\s+\d+/.test(row.message)))
                        )
                            fatal.push(row);
                        if (row.tag === 'DEBUG') {
                            const target = /\bpid:\s*(\d+)\s*,\s*tid:/.exec(row.message);
                            if (target) debuggerTargetsCurrentPid = Number(target[1]) === session.pid;
                            if (debuggerTargetsCurrentPid && /\bsignal\s+\d+\s*\(/.test(row.message)) fatal.push(row);
                            if (/^\*\*\* \*\*\*/.test(row.message)) debuggerTargetsCurrentPid = false;
                        }
                    }
                    report.crashAudit = {
                        pass: fatal.length === 0,
                        nativePid: session.pid,
                        nativeRunId: session.runId,
                        lowerEpochSeconds: created.epochSeconds,
                        upperEpochSecondsExclusive: upper,
                        scope: 'Fatal current-PID Java/libc records and debugger blocks explicitly naming this PID, inside retained run time bounds',
                        fatal,
                        retainedEpochRows: records.length,
                        currentRunRows: current.length,
                        logSha256: hash(Buffer.from(text)),
                    };
                    save('crash-audit.json', report.crashAudit);
                } catch (error) {
                    report.crashAuditError = String(error.stack || error);
                }
            }
        }
        try {
            report.finalInputs = fingerprint();
            report.inputsUnchanged = JSON.stringify(report.inputs) === JSON.stringify(report.finalInputs);
        } catch (error) {
            report.inputError = String(error);
            report.inputsUnchanged = false;
        }
        report.pass =
            report.completed &&
            !report.error &&
            !report.teardownError &&
            !report.cleanupError &&
            !report.forwardCleanupError &&
            !report.collectorCloseError &&
            !report.crashAuditError &&
            report.crashAudit?.pass === true &&
            report.inputsUnchanged &&
            report.teardown?.pass === true &&
            report.processCleanup?.pass === true &&
            Object.values(report.stages).every((stage) => stage.status === 'PASS');
        report.physicalAcceptance = report.pass && report.device?.qemu !== '1';
        report.page16kRuntimeAcceptance = report.pass && report.device?.pageBytes === 16384;
        report.status = report.pass
            ? 'PASS'
            : report.error ||
                report.teardownError ||
                report.cleanupError ||
                report.collectorCloseError ||
                report.crashAuditError ||
                report.crashAudit?.pass === false
              ? 'FAIL'
              : 'PARTIAL';
        report.finishedAt = new Date().toISOString();
        save('report.json', report);
        console.log(
            JSON.stringify({
                status: report.status,
                stages: Object.fromEntries(Object.entries(report.stages).map(([name, value]) => [name, value.status])),
                error: report.error,
                teardownError: report.teardownError,
                report: path.relative(root, path.join(out, 'report.json')),
            }),
        );
        process.exitCode = report.pass ? 0 : 1;
    }
    return report;
}

module.exports = { parseArgs, component, topActivity, surfaceBounds, colors, imagePassed, poll, main };
if (require.main === module)
    main(process.argv.slice(2)).catch((error) => {
        console.error(error.stack || error);
        process.exitCode = 1;
    });
