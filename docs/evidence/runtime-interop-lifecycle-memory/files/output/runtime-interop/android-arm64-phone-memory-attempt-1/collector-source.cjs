/* Physical-device foreground baseline. No installation, keyguard dismissal, device settings changes or emulator comparison.
 * Run from the repository root with a new --out directory. The dedicated APK must already be installed and unlocked.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const JSZip = require('jszip');
const life = require('./runtime-interop-android-lifecycle.cjs');
const memory = require('./runtime-interop-android-memory.cjs');
const { cropScreen } = require('./runtime-interop-android.cjs');
const helperRoot = './runtime-interop-android/verification-snapshots/output/runtime-interop/';
const { inspectRuntime, inputFiles: colorInputs, normalizeScreen } = require(
    helperRoot + 'android-phone-color-presentation.cjs',
);
const { parseProcessTable, isPackageProcess } = require(helperRoot + 'android-phone-process-table.cjs');
const PACKAGE = 'com.mystral.engine.interop';
const COMPONENT = PACKAGE + '/com.mystral.engine.MystralActivity';
const MEMORY_SHA = '680db112c9bfa3308f8592cc9626db7b9ce583bbeab262dfe3be49b7bbeebf15';
const LIFE_SHA = '12c360ece283e99b8fae3925b43e7afeb4772d083e98dc9da6b5332ccfec6ef7';
const mono = () => Number(process.hrtime.bigint()) / 1000000;
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(process.cwd(), file).replace(/\\/g, '/');
const check = (condition, message) => {
    if (!condition) throw Error(message);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function deadline(ms, label) {
    const end = mono() + ms;
    const remaining = () => {
        check(mono() < end, label + ' original deadline exceeded');
        return Math.max(1, Math.ceil(end - mono()));
    };
    remaining.end = end;
    return remaining;
}
async function wait(operation, remaining) {
    let last;
    while (mono() < remaining.end) {
        try {
            const value = await operation();
            if (value) {
                remaining();
                return value;
            }
        } catch (error) {
            last = error;
        }
        const delay = remaining.end - mono();
        if (delay > 0) await sleep(Math.min(100, delay));
    }
    throw last || Error('Original observation deadline exceeded');
}
function parseArgs(argv) {
    const values = { 'expected-page-size': 4096, 'soak-seconds': 900 };
    const provided = new Set();
    for (const argument of argv) {
        const match = /^--(serial|apk|out|python|expected-page-size|soak-seconds)=(.+)$/.exec(argument);
        check(match && !provided.has(match[1]), 'Unknown or duplicate option: ' + argument);
        provided.add(match[1]);
        values[match[1]] = match[2];
    }
    for (const key of ['serial', 'apk', 'out']) check(values[key]?.trim(), '--' + key + ' is required');
    check(
        !/\s/.test(values.serial) && !values.serial.startsWith('emulator-'),
        'Exactly one physical device serial is required',
    );
    for (const key of ['expected-page-size', 'soak-seconds']) {
        check(/^\d+$/.test(String(values[key])), 'Integer required: ' + key);
        values[key] = Number(values[key]);
        check(Number.isSafeInteger(values[key]), 'Option exceeds integer range');
    }
    check([4096, 16384].includes(values['expected-page-size']), 'Expected page size must be 4096 or 16384');
    check([0, 900].includes(values['soak-seconds']), 'Use 900 seconds or 0 for diagnostic only');
    return values;
}

async function main(argv) {
    const args = parseArgs(argv),
        out = path.resolve(args.out),
        apk = path.resolve(args.apk);
    fs.mkdirSync(out);
    fs.mkdirSync(path.join(out, 'commands'));
    const save = (name, value) =>
        fs.writeFileSync(
            path.join(out, name),
            typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n',
            { flag: 'wx' },
        );
    const source = fs.readFileSync(__filename);
    save('collector-source.cjs', source);
    const report = {
        schema: 'air-android-physical-foreground-memory-v1',
        createdAt: new Date().toISOString(),
        scope: 'physical-foreground-only',
        physicalBaseline: true,
        physicalAcceptance: false,
        comparison: { status: 'NOT_RUN_NO_MATCHED_PHYSICAL_BASELINE' },
        runId: 'android-phone-foreground-' + Date.now(),
        serial: args.serial,
        requestedSoakSeconds: args['soak-seconds'],
        completed: false,
        pass: false,
        subset: true,
        releaseReady: false,
        allResourcesLeakFree: 'NOT_ESTABLISHED',
        lifecycleCoverage: { foreground: 'NOT_RUN', home: 'NOT_RUN', settings: 'NOT_RUN', secureLock: 'NOT_RUN' },
        budgets: {
            startupMs: 30000,
            heartbeatOperationMs: 15000,
            nativeExitMs: 10000,
            logcatCloseMs: 2000,
            heartbeatMs: 10000,
            maximumHeartbeatGapMs: 15000,
            imageMs: 30000,
            memoryMs: 300000,
            meaning: 'Bounded sampling integrity, not a user-facing performance target',
        },
        producer: { file: relative(__filename), sha256: sha(source), retainedSource: 'collector-source.cjs' },
        samples: [],
        observations: [],
        commands: 0,
        openFindings: [],
        pixelCopy: 'NOT_REQUESTED_BY_FOREGROUND_CONTRACT',
    };
    let owned = false,
        session,
        privateDir,
        request,
        port,
        logcat,
        logcatClosed,
        closedResult;
    let inputFiles = [],
        taps = 0,
        lastFrames = -1,
        shot = 0;
    const fingerprint = () =>
        Object.fromEntries([...new Set(inputFiles)].sort().map((file) => [relative(file), sha(fs.readFileSync(file))]));
    const adb = (values, remaining = deadline(15000, 'ADB'), binary = false) => {
        const name = 'commands/' + String(++report.commands).padStart(5, '0');
        const timeout = Math.min(15000, remaining());
        const command = {
            arguments: ['-s', args.serial, ...values],
            startedAt: new Date().toISOString(),
            monotonicStartMs: mono(),
            absoluteDeadlineMs: remaining.end,
            timeoutMs: timeout,
        };
        const result = spawnSync('adb', command.arguments, {
            timeout,
            windowsHide: true,
            maxBuffer: 64 * 1024 * 1024,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        save(name + '.stdout', result.stdout || Buffer.alloc(0));
        save(name + '.stderr', result.stderr || Buffer.alloc(0));
        Object.assign(command, {
            exitCode: result.status,
            signal: result.signal,
            error: result.error ? String(result.error) : null,
            finishedAt: new Date().toISOString(),
            monotonicEndMs: mono(),
        });
        save(name + '.json', command);
        check(
            !result.error && result.status === 0,
            'ADB operation failed: ' + values.join(' ') + (result.error ? ' ' + result.error : ''),
        );
        remaining();
        return binary ? result.stdout : result.stdout.toString('utf8').trim();
    };
    const shell = (values, remaining) => adb(['shell', ...values], remaining);
    const privateBytes = (name, remaining) =>
        adb(['exec-out', 'run-as', PACKAGE, 'cat', privateDir + name], remaining, true);
    const privateJson = (name, remaining) => JSON.parse(privateBytes(name, remaining));
    const ensureForeground = (label, remaining) => {
        const activity = shell(['dumpsys', 'activity', 'activities'], remaining);
        save(label + '.activity.txt', activity);
        check(life.topActivity(activity) === COMPONENT, 'Dedicated app is not the actual foreground Activity');
        const policy = shell(['dumpsys', 'window', 'policy'], remaining);
        save(label + '.keyguard.txt', policy);
        const states = [
            ...policy.matchAll(
                /\b(?:showing|mKeyguardShowing|mShowingLockscreen|isStatusBarKeyguard)\s*[=:]\s*(true|false)\b/g,
            ),
        ].map((match) => match[1]);
        check(
            states.length > 0 && states.every((value) => value === 'false'),
            'Phone keyguard state is locked or unrecognized; manual unlock is required',
        );
        const xml = adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], remaining);
        save(label + '.ui.xml', xml);
        return life.surfaceBounds(xml);
    };
    const identity = async (label, remaining) => {
        const state = await request('/state', undefined, remaining);
        check(
            state.session.pid === session.pid &&
                state.session.runId === session.runId &&
                state.session.caseId === 'demo',
            'Original physical native session changed',
        );
        check(
            state.runtime.nativeStarted &&
                state.runtime.loadedABI === 'arm64-v8a' &&
                state.runtime.jsEngine === 'v8' &&
                state.runtime.backend === 'dawn' &&
                state.runtime.v8StartupMode === 'embedded' &&
                state.runtime.v8Version === report.runtime.v8Version,
            'Actual ARM64 native runtime identity changed',
        );
        save(label + '.state.json', state);
    };
    const photograph = async (label, bounds, wanted, remaining) =>
        wait(() => {
            const prefix = label + '-image-' + String(shot++).padStart(4, '0');
            const raw = adb(['exec-out', 'screencap', '-p'], remaining, true);
            save(prefix + '.screen.png', raw);
            const crop = cropScreen(raw, bounds);
            save(prefix + '.screen-crop.png', crop);
            const normalized = normalizeScreen({
                python: args.python || process.env.AIR_PYTHON || 'python',
                runtime: report.colorRuntime,
                inputFile: path.join(out, prefix + '.screen.png'),
                outputFile: path.join(out, prefix + '.screen-srgb.png'),
                metadataFile: path.join(out, prefix + '.screen-color.json'),
                iccFile: path.join(out, prefix + '.screen-source.icc'),
                timeoutMs: remaining(),
            });
            const srgbCrop = cropScreen(normalized.bytes, bounds);
            save(prefix + '.screen-srgb-crop.png', srgbCrop);
            const colors = life.colors(srgbCrop);
            const value = {
                prefix,
                measuredAt: new Date().toISOString(),
                bounds,
                wanted,
                originalSha256: sha(raw),
                originalCropSha256: sha(crop),
                interpretedSha256: sha(normalized.bytes),
                interpretedCropSha256: sha(srgbCrop),
                colors,
                pass: life.imagePassed(colors, wanted),
                colorMetadata: prefix + '.screen-color.json',
            };
            save(prefix + '.verification.json', value);
            report.observations.push(value);
            return value.pass && value;
        }, remaining);
    try {
        check(
            sha(fs.readFileSync(require.resolve('./runtime-interop-android-lifecycle.cjs'))) === LIFE_SHA &&
                sha(fs.readFileSync(require.resolve('./runtime-interop-android-memory.cjs'))) === MEMORY_SHA,
            'Frozen common consumer source differs',
        );
        const buildFile = path.join(path.dirname(apk), 'build-report.json');
        const build = JSON.parse(fs.readFileSync(buildFile));
        report.apk = { file: relative(apk), bytes: fs.statSync(apk).size, sha256: sha(fs.readFileSync(apk)) };
        check(
            build.compiled &&
                build.apk.sha256 === report.apk.sha256 &&
                build.abi === 'arm64-v8a' &&
                build.androidStl === 'c++_static' &&
                build.v8LibraryKind === 'static' &&
                build.v8StartupMode === 'embedded' &&
                build.sdlVersion === '3.2.30' &&
                build.elf16kCompatible &&
                build.zipalign16kVerified &&
                build.signatureVerified,
            'Physical APK/build identity is not the fixed ARM64 SDL/static candidate',
        );
        const zip = await JSZip.loadAsync(fs.readFileSync(apk));
        report.packagedAssets = {};
        for (const [name, expected] of Object.entries(build.payload.assets)) {
            const entry = zip.file('assets/' + name);
            check(entry, 'Missing packaged asset: ' + name);
            const bytes = await entry.async('nodebuffer');
            check(sha(bytes) === expected, 'Packaged SDK/asset bytes differ: ' + name);
            report.packagedAssets[name] = { bytes: bytes.length, sha256: sha(bytes) };
        }
        check(
            report.packagedAssets['interop/sdk/cocosair.module.js'] && report.packagedAssets['assets-manifest.json'],
            'Packaged SDK and manifest are absent',
        );
        report.colorRuntime = inspectRuntime(args.python || process.env.AIR_PYTHON || 'python');
        inputFiles = [...Object.keys(require.cache), __filename, apk, buildFile, ...colorInputs(report.colorRuntime)];
        report.inputs = fingerprint();
        check(
            adb(['get-state']) === 'device' && adb(['get-serialno']) === args.serial,
            'ADB did not select the requested phone',
        );
        const getprop = (name) => shell(['getprop', name]);
        report.device = {
            serial: args.serial,
            qemu: getprop('ro.kernel.qemu'),
            model: getprop('ro.product.model'),
            fingerprint: getprop('ro.build.fingerprint'),
            api: Number(getprop('ro.build.version.sdk')),
            abiList: getprop('ro.product.cpu.abilist'),
            nativeBridge: getprop('ro.dalvik.vm.native.bridge'),
            pageBytes: Number(shell(['getconf', 'PAGE_SIZE'])),
        };
        check(
            ['', '0'].includes(report.device.qemu) &&
                report.device.abiList.split(',').includes('arm64-v8a') &&
                ['', '0'].includes(report.device.nativeBridge) &&
                report.device.pageBytes === args['expected-page-size'],
            'Actual physical ARM64/page-size identity differs',
        );
        const compat = () => ({
            linker: getprop('bionic.linker.16kb.app_compat.enabled'),
            pmDisabled: getprop('pm.16kb.app_compat.disabled'),
        });
        report.initialCompat = compat();
        if (report.device.pageBytes === 16384)
            check(
                report.initialCompat.linker === 'fatal' && report.initialCompat.pmDisabled === 'true',
                '16 KB compatibility fallback policy is not strict',
            );
        const installed = shell(['pm', 'path', PACKAGE])
            .split(/\r?\n/)
            .find((row) => row.startsWith('package:'));
        check(
            installed && shell(['sha256sum', installed.slice(8)]).split(/\s/)[0] === report.apk.sha256,
            'Installed physical APK differs',
        );
        const admission = deadline(15000, 'Awake/unlocked phone admission');
        const power = shell(['dumpsys', 'power'], admission);
        const policy = shell(['dumpsys', 'window', 'policy'], admission);
        save('preflight-power.txt', power);
        save('preflight-window-policy.txt', policy);
        const keyguardStates = [
            ...policy.matchAll(
                /\b(?:showing|mKeyguardShowing|mShowingLockscreen|isStatusBarKeyguard|inputRestricted|mInputRestricted)\s*[=:]\s*(true|false)\b/g,
            ),
        ].map((match) => ({ field: match[0], value: match[1] }));
        report.phoneAdmission = {
            awake: /\bmWakefulness=Awake\b/.test(power),
            keyguardStates,
            keyguardKnownUnlocked:
                keyguardStates.length > 0 && keyguardStates.every((state) => state.value === 'false'),
            packageMutated: false,
        };
        check(
            report.phoneAdmission.awake && report.phoneAdmission.keyguardKnownUnlocked,
            'Phone preflight requires Awake and an unlocked keyguard. Unlock the phone normally before retrying; no wakeup, keyguard dismissal or package stop was performed.',
        );
        owned = true;
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
        logcatClosed = new Promise((resolve) => {
            logcat.once('close', (code, signal) => {
                closedResult = { observed: true, code, signal, monotonicMs: mono() };
                resolve(closedResult);
            });
            logcat.once('error', (error) => {
                report.logcatSpawnError = String(error);
            });
        });
        fs.closeSync(fd);
        shell(['am', 'force-stop', PACKAGE]);
        report.logBounds = { startEpochSecondsInclusive: Number(shell(['date', '+%s'])) };
        check(Number.isSafeInteger(report.logBounds.startEpochSecondsInclusive), 'Device log clock is unavailable');
        report.launch = shell(['am', 'start', '-W', '-n', COMPONENT, '--es', 'run_id', report.runId]);
        privateDir = 'files/interop/' + report.runId + '/';
        const startup = deadline(30000, 'Startup');
        session = await wait(() => privateJson('session.json', startup), startup);
        check(
            session.runId === report.runId && session.caseId === 'demo' && session.demo === true,
            'Actual phone demo session differs',
        );
        save('session.json', session);
        port = adb(['forward', 'tcp:0', 'tcp:' + new URL(session.origin).port], startup);
        request = async (route, body, remaining) => {
            const response = await fetch('http://127.0.0.1:' + port + route, {
                method: body === undefined ? 'GET' : 'POST',
                headers: {
                    'X-Interop-Token': session.token,
                    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: AbortSignal.timeout(remaining()),
            });
            const bytes = Buffer.from(await response.arrayBuffer());
            remaining();
            check(response.ok, route + ' HTTP ' + response.status);
            return JSON.parse(bytes);
        };
        const ready = await wait(async () => {
            const state = await request('/state', undefined, startup);
            return state.reportSaved && state;
        }, startup);
        report.runtime = ready.runtime;
        check(
            report.runtime.nativeStarted &&
                report.runtime.loadedABI === 'arm64-v8a' &&
                report.runtime.jsEngine === 'v8' &&
                report.runtime.backend === 'dawn' &&
                report.runtime.v8StartupMode === 'embedded' &&
                report.runtime.v8Version === build.v8Version,
            'Actual static ARM64 V8/Dawn startup differs',
        );
        report.application = privateJson('report.json', startup);
        save('application.json', report.application);
        check(
            report.application.schema === 'air-android-demo-v1' &&
                report.application.runId === session.runId &&
                report.application.pass === true &&
                report.application.ready &&
                report.application.gpuErrors?.length === 0,
            'Demo startup did not pass',
        );
        lastFrames = report.application.frames;
        const initial = deadline(15000, 'Initial foreground image');
        const bounds = ensureForeground('initial', initial);
        report.initialImage = await photograph('initial', bounds, 'orange', initial);
        const start = mono();
        let next = start,
            nextImage = start,
            nextMemory = start;
        report.lifecycleCoverage.foreground = 'RUNNING';
        for (let index = 0; ; index++) {
            while (mono() < next) await sleep(Math.min(1000, next - mono()));
            const started = mono(),
                wall = Date.now(),
                operation = deadline(15000, 'Foreground heartbeat');
            const label = 'foreground-' + String(index).padStart(3, '0');
            const previous = report.samples.at(-1);
            const sample = {
                label,
                sampledAt: new Date(wall).toISOString(),
                monotonicStartMs: started,
                actualWallStartMs: wall,
                elapsedMs: started - start,
                intervalMs: previous ? started - previous.monotonicStartMs : null,
                wallIntervalMs: previous ? wall - previous.actualWallStartMs : null,
                status: 'RUNNING',
            };
            report.samples.push(sample);
            if (previous)
                check(
                    sample.intervalMs >= 10000 &&
                        sample.intervalMs <= 15000 &&
                        sample.wallIntervalMs >= 0 &&
                        sample.wallIntervalMs <= 15000,
                    'Phone heartbeat coverage gap exceeded the original fifteen-second sampling allowance',
                );
            const currentBounds = ensureForeground(label, operation);
            const expectedTaps = taps + 1;
            shell(
                [
                    'input',
                    'tap',
                    String(currentBounds.x + currentBounds.width / 2),
                    String(currentBounds.y + currentBounds.height / 2),
                ],
                operation,
            );
            const event = await wait(() => {
                const bytes = privateBytes('events.jsonl', operation);
                return bytes
                    .toString('utf8')
                    .trim()
                    .split(/\r?\n/)
                    .filter(Boolean)
                    .map((row) => JSON.parse(row))
                    .find((row) => row.stage === 'demo-input' && row.taps === expectedTaps);
            }, operation);
            check(
                event.isTrusted === true &&
                    event.type === 'mousedown' &&
                    Math.abs(event.clientX - 160) <= 1 &&
                    Math.abs(event.clientY - 120) <= 1 &&
                    event.frames > lastFrames &&
                    Array.isArray(event.gpuErrors) &&
                    event.gpuErrors.length === 0 &&
                    event.color === (expectedTaps % 2 ? 'green' : 'orange'),
                'Real phone input/frame/material/GPU contract failed',
            );
            taps = expectedTaps;
            lastFrames = event.frames;
            sample.event = event;
            sample.bounds = currentBounds;
            if (started >= nextImage) {
                sample.image = await photograph(label, currentBounds, event.color, operation);
                nextImage = started + 30000;
            }
            if (started >= nextMemory) {
                save(label + '.meminfo.txt', shell(['dumpsys', 'meminfo', String(session.pid)], operation));
                nextMemory = started + 300000;
            }
            await identity(label, operation);
            operation();
            sample.status = 'PASS';
            sample.monotonicEndMs = mono();
            fs.writeFileSync(path.join(out, 'progress.json'), JSON.stringify(report, null, 2) + '\n');
            console.log(
                JSON.stringify({
                    stage: 'phone-foreground',
                    sample: index,
                    elapsedSeconds: Math.round(sample.elapsedMs / 1000),
                    frames: event.frames,
                    taps: event.taps,
                    image: !!sample.image,
                    status: sample.status,
                }),
            );
            if (args['soak-seconds'] === 0 || started - report.samples[0].monotonicStartMs >= 900000) break;
            next = started + 10000;
        }
        if (args['soak-seconds'] > 0)
            check(
                report.samples.at(-1).monotonicStartMs - report.samples[0].monotonicStartMs >= 900000 &&
                    report.samples.length >= 61,
                'Physical foreground window was incomplete',
            );
        report.lifecycleCoverage.foreground = 'PASS';
        report.foregroundObserved = true;
    } catch (error) {
        report.error = String(error.stack || error);
        if (report.lifecycleCoverage.foreground === 'RUNNING') report.lifecycleCoverage.foreground = 'FAIL';
        if (report.samples.at(-1)?.status === 'RUNNING') report.samples.at(-1).status = 'FAIL';
    } finally {
        if (owned && session && request) {
            try {
                const exit = deadline(10000, 'Native finish');
                const table = adb(['shell', 'ps', '-A', '-o', 'PID,NAME'], exit);
                save('processes-before-finish.txt', table);
                check(
                    parseProcessTable(table).some((row) => row.pid === session.pid && row.name === PACKAGE),
                    'Original phone PID is not live before finish',
                );
                await request('/finish', {}, exit);
                report.nativeExit = await wait(() => privateJson('native-exit.json', exit), exit);
                check(
                    report.nativeExit.pid === session.pid && report.nativeExit.code === 0 && !report.nativeExit.error,
                    'Actual phone native exit failed',
                );
                save('native-exit.json', report.nativeExit);
                report.teardown = await wait(() => {
                    const lines = fs
                        .readFileSync(path.join(out, 'logcat.txt'), 'utf8')
                        .split(/\r?\n/)
                        .filter((row) => new RegExp('\\s' + session.pid + '\\s+\\d+\\s+[VDIWEF]\\s').test(row));
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
                        markers.map((marker) => [marker, lines.some((row) => row.includes('EXIT_STAGE ' + marker))]),
                    );
                    const sdlReturned = lines.some((row) => /\bSDL\s*: Finished main function\s*$/.test(row));
                    return (
                        Object.values(stages).every(Boolean) &&
                        sdlReturned && { pass: true, stages, sdlReturned, elapsedMs: 10000 - exit() }
                    );
                }, exit);
            } catch (error) {
                report.teardownError = String(error.stack || error);
            }
        }
        if (owned) {
            if (privateDir)
                for (const name of [
                    'session.json',
                    'native-ready.json',
                    'native-exit.json',
                    'lifecycle.jsonl',
                    'events.jsonl',
                ])
                    try {
                        save('final-' + name, privateBytes(name, deadline(3000, 'Private artifact')));
                    } catch (error) {
                        (report.privateArtifactErrors ||= {})[name] = String(error);
                    }
            try {
                report.finalCompat = {
                    linker: shell(['getprop', 'bionic.linker.16kb.app_compat.enabled']),
                    pmDisabled: shell(['getprop', 'pm.16kb.app_compat.disabled']),
                };
                if (report.device.pageBytes === 16384)
                    check(
                        report.finalCompat.linker === 'fatal' && report.finalCompat.pmDisabled === 'true',
                        '16 KB compatibility policy changed',
                    );
                shell(['am', 'force-stop', PACKAGE]);
                const table = adb(['shell', 'ps', '-A', '-o', 'PID,NAME']);
                save('processes-after-stop.txt', table);
                check(
                    !parseProcessTable(table).some((row) => isPackageProcess(row, PACKAGE)) &&
                        adb(['get-state']) === 'device',
                    'Physical package cleanup or device connection failed',
                );
                report.logBounds.endEpochSecondsExclusive = Number(shell(['date', '+%s'])) + 1;
                check(
                    Number.isSafeInteger(report.logBounds.endEpochSecondsExclusive),
                    'Final device log clock is unavailable',
                );
                report.processCleanup = {
                    pass: true,
                    pidGone: true,
                    nativeExitBeforeCleanup: report.teardown?.pass === true,
                };
            } catch (error) {
                report.cleanupError = String(error.stack || error);
            }
        }
        if (port)
            try {
                adb(['forward', '--remove', 'tcp:' + port]);
            } catch (error) {
                report.forwardError = String(error);
            }
        if (logcat) {
            const started = mono(),
                closedBeforeRequest = !!closedResult;
            let timer;
            const timeout = new Promise((resolve) => {
                timer = setTimeout(resolve, 2000);
            });
            const killRequested = logcat.kill();
            await Promise.race([logcatClosed, timeout]);
            clearTimeout(timer);
            report.logcatShutdown = {
                close: closedResult || null,
                closedBeforeRequest,
                killRequested,
                elapsedMs: mono() - started,
                budgetMs: 2000,
            };
            if (
                !closedResult?.observed ||
                closedBeforeRequest ||
                report.logcatShutdown.elapsedMs > 2000 ||
                report.logcatSpawnError
            )
                report.collectorCloseError = 'Logcat did not remain live and physically close inside two seconds';
        }
        if (session && report.logBounds?.endEpochSecondsExclusive) {
            try {
                const log = fs.readFileSync(path.join(out, 'logcat.txt'));
                const rows = log
                    .toString('utf8')
                    .split(/\r?\n/)
                    .map((raw, line) => {
                        const found = /^\s*(\d+\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s?(.*)$/.exec(raw);
                        return (
                            found && {
                                raw,
                                line: line + 1,
                                epochSeconds: Number(found[1]),
                                pid: Number(found[2]),
                                tag: found[5].trim(),
                                message: found[6],
                            }
                        );
                    })
                    .filter(Boolean);
                const bounded = rows.filter(
                    (row) =>
                        row.epochSeconds >= report.logBounds.startEpochSecondsInclusive &&
                        row.epochSeconds < report.logBounds.endEpochSecondsExclusive,
                );
                const created = bounded.find(
                    (row) =>
                        row.pid === session.pid &&
                        row.tag === 'MystralInterop' &&
                        /LIFECYCLE.*"event":"created"/.test(row.message),
                );
                check(created, 'Current physical PID created marker is absent');
                let targetsCurrent = false;
                const fatal = [];
                for (const row of bounded.filter((value) => value.epochSeconds >= created.epochSeconds)) {
                    if (
                        row.pid === session.pid &&
                        ((row.tag === 'AndroidRuntime' &&
                            /FATAL EXCEPTION|Process:.*com\.mystral\.engine\.interop/.test(row.message)) ||
                            (row.tag === 'libc' && /Fatal signal\s+\d+/.test(row.message)))
                    )
                        fatal.push(row);
                    if (row.tag === 'DEBUG') {
                        if (/^\*\*\* \*\*\*/.test(row.message)) targetsCurrent = false;
                        const target = /\bpid:\s*(\d+)\s*,\s*tid:/.exec(row.message);
                        if (target) targetsCurrent = Number(target[1]) === session.pid;
                        if (targetsCurrent && /\bsignal\s+\d+\s*\(/.test(row.message)) fatal.push(row);
                    }
                }
                report.crashAudit = {
                    pass: fatal.length === 0,
                    nativePid: session.pid,
                    lowerEpochSeconds: created.epochSeconds,
                    upperEpochSecondsExclusive: report.logBounds.endEpochSecondsExclusive,
                    fatal,
                    logSha256: sha(log),
                };
                save('crash-audit.json', report.crashAudit);
                const context = {
                    runId: report.runId,
                    crashAudit: report.crashAudit,
                    stages: {
                        continuous: {
                            samples:
                                args['soak-seconds'] > 0 ? report.samples.filter((row) => row.status === 'PASS') : [],
                        },
                    },
                };
                report.ownershipConsumerContext = {
                    schema: 'physical-foreground-consumer-context-v1',
                    runId: context.runId,
                    nativePid: session.pid,
                    continuousSamples: context.stages.continuous.samples.length,
                    meaning:
                        'Data adapter for pure ownership/memory consumers; this is not a lifecycle acceptance report',
                };
                report.javascriptExceptions = memory.consumeJsExceptions(context, out);
                save('javascript-exceptions.json', report.javascriptExceptions);
                report.nativeOwnership = memory.consumeResources(context, out, report.openFindings);
                save('native-ownership.json', report.nativeOwnership);
                report.memory = memory.consumeMemory(context, out);
                if (report.memory.nativeHeapPssStrictlyIncreasing)
                    report.openFindings.push({
                        kind: 'native-heap-pss-increasing-at-all-four-observations',
                        growthKiB: report.memory.nativeHeapPssGrowthKiB,
                        meaning:
                            'First physical baseline observation remains open; no cross-device PSS comparison is performed',
                    });
                check(
                    report.crashAudit.pass && report.javascriptExceptions.pass && report.nativeOwnership.pass,
                    'Physical crash, uncaught V8 exception or owned native-resource gate failed',
                );
                if (args['soak-seconds'] > 0)
                    check(report.memory.samples.length >= 4, 'Physical memory observation window is incomplete');
            } catch (error) {
                report.resourceAuditError = String(error.stack || error);
            }
        }
        try {
            report.finalInputs = fingerprint();
            report.inputsUnchanged =
                !!report.inputs &&
                JSON.stringify(report.inputs) === JSON.stringify(report.finalInputs) &&
                fs.readFileSync(path.join(out, 'collector-source.cjs')).equals(source);
        } catch (error) {
            report.inputError = String(error);
            report.inputsUnchanged = false;
        }
        const sound =
            report.foregroundObserved &&
            report.teardown?.pass &&
            report.processCleanup?.pass &&
            report.nativeOwnership?.pass &&
            report.javascriptExceptions?.pass &&
            report.crashAudit?.pass &&
            report.inputsUnchanged &&
            !report.error &&
            !report.teardownError &&
            !report.cleanupError &&
            !report.forwardError &&
            !report.collectorCloseError &&
            !report.resourceAuditError;
        report.diagnosticCompleted = args['soak-seconds'] === 0 && !!sound;
        report.completed = args['soak-seconds'] > 0 && !!sound;
        report.pass = report.completed;
        report.physicalAcceptance = report.pass;
        report.status = !sound
            ? 'FAIL'
            : !report.completed
              ? 'PARTIAL'
              : report.openFindings.length
                ? 'PASS_WITH_OPEN_FINDINGS'
                : 'PASS';
        report.finishedAt = new Date().toISOString();
        save('report.json', report);
        console.log(
            JSON.stringify({
                status: report.status,
                physicalAcceptance: report.physicalAcceptance,
                samples: report.samples.length,
                error: report.error,
                teardownError: report.teardownError,
                resourceAuditError: report.resourceAuditError,
                report: relative(path.join(out, 'report.json')),
            }),
        );
        process.exitCode = report.pass ? 0 : 1;
    }
    return report;
}
module.exports = { parseArgs, main };
if (require.main === module)
    main(process.argv.slice(2)).catch((error) => {
        console.error(error.stack || error);
        process.exitCode = 1;
    });
