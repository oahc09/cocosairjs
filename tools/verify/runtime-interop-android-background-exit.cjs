/* Explicit short Android exit probe. Uses the already prepared immutable SDK fixture.
 * Only the dedicated debug package is installed/stopped. No unlock, device policy or SDK rebuild.
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync, execFileSync } = require('node:child_process');
const JSZip = require('jszip');
const life = require('./runtime-interop-android-lifecycle.cjs');
const memory = require('./runtime-interop-android-memory.cjs');
const { cropScreen } = require('./runtime-interop-android.cjs');
const color = require('./runtime-interop-android/lib/android-phone-color-presentation.cjs');
const {
    parseProcessTable,
    isPackageProcess,
} = require('./runtime-interop-android/lib/android-phone-process-table.cjs');
const PACKAGE = 'com.mystral.engine.interop';
const COMPONENT = PACKAGE + '/com.mystral.engine.MystralActivity';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const mono = () => Number(process.hrtime.bigint()) / 1000000;
const check = (value, message) => {
    if (!value) throw Error(message);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function deadline(ms) {
    const end = mono() + ms;
    const remaining = () => {
        check(mono() < end, 'Original deadline exceeded');
        return Math.max(1, Math.floor(end - mono()));
    };
    remaining.end = end;
    return remaining;
}
async function poll(operation, remaining) {
    let error;
    while (mono() < remaining.end) {
        try {
            const value = await operation();
            if (value) {
                remaining();
                return value;
            }
        } catch (value) {
            error = value;
        }
        if (mono() < remaining.end) await sleep(Math.min(100, remaining.end - mono()));
    }
    throw error || Error('Original deadline exceeded');
}
function parseArgs(argv) {
    const args = {};
    for (const value of argv) {
        if (value === '--install') {
            check(!args.install, 'Duplicate install option');
            args.install = true;
            continue;
        }
        const m = /^--(serial|apk|host-source|out|python|case|expected-page-size)=(.+)$/.exec(value);
        check(m && args[m[1]] === undefined, 'Unknown or duplicate argument: ' + value);
        args[m[1]] = m[2];
    }
    for (const key of ['serial', 'apk', 'host-source', 'out', 'case', 'expected-page-size'])
        check(args[key], 'Missing ' + key);
    check(!/\s/.test(args.serial), 'One serial required');
    check(['foreground', 'home', 'settings'].includes(args.case), 'Unknown case');
    check(['4096', '16384'].includes(args['expected-page-size']), 'Explicit page size required');
    return args;
}
async function main(argv) {
    const args = parseArgs(argv),
        out = path.resolve(args.out),
        apk = path.resolve(args.apk);
    fs.mkdirSync(out);
    fs.mkdirSync(path.join(out, 'commands'));
    const save = (file, value) =>
        fs.writeFileSync(
            path.join(out, file),
            Buffer.isBuffer(value) || typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n',
        );
    const report = {
        schema: 'air-android-background-exit-v1',
        createdAt: new Date().toISOString(),
        serial: args.serial,
        case: args.case,
        runId: 'android-background-exit-' + Date.now(),
        subset: true,
        releaseReady: false,
        scope: 'Short host exit while foreground or actually STOPPED; existing SDK fixture, not current AIR main acceptance',
        completed: false,
        pass: false,
        budgets: { operationMs: 15000, nativeExitMs: 10000, logcatCloseMs: 2000 },
        commandCount: 0,
    };
    save('collector-source.cjs', fs.readFileSync(__filename));
    let owned = false,
        privateDir,
        session,
        port,
        request,
        logcat,
        closePromise,
        closed;
    const sources = new Set([__filename, apk]);
    const inputs = () => Object.fromEntries([...sources].sort().map((file) => [file, sha(fs.readFileSync(file))]));
    const adb = (values, remaining = deadline(15000), binary = false) => {
        const name = 'commands/' + String(++report.commandCount).padStart(5, '0');
        const row = {
            arguments: ['-s', args.serial, ...values],
            startedAt: new Date().toISOString(),
            timeoutMs: Math.min(15000, remaining()),
        };
        const result = spawnSync('adb', row.arguments, {
            timeout: row.timeoutMs,
            windowsHide: true,
            maxBuffer: 64 * 1024 * 1024,
        });
        save(name + '.stdout', result.stdout || Buffer.alloc(0));
        save(name + '.stderr', result.stderr || Buffer.alloc(0));
        Object.assign(row, {
            exitCode: result.status,
            error: result.error ? String(result.error) : null,
            finishedAt: new Date().toISOString(),
        });
        save(name + '.json', row);
        check(!result.error && result.status === 0, 'ADB command failed: ' + values.join(' '));
        remaining();
        return binary ? result.stdout : result.stdout.toString('utf8').trim();
    };
    const shell = (values, remaining) => adb(['shell', ...values], remaining);
    const privateBytes = (name, remaining) =>
        adb(['exec-out', 'run-as', PACKAGE, 'cat', privateDir + name], remaining, true);
    const privateJson = (name, remaining) => JSON.parse(privateBytes(name, remaining));
    const lifecycle = (remaining) => {
        const bytes = privateBytes('lifecycle.jsonl', remaining);
        save('lifecycle.jsonl', bytes);
        return bytes.toString().trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    };
    const top = (label, remaining) => {
        const raw = shell(['dumpsys', 'activity', 'activities'], remaining);
        save(label + '.activities.txt', raw);
        return { raw, top: life.topActivity(raw) };
    };
    try {
        const buildFile = path.join(path.dirname(apk), 'build-report.json'),
            mapFile = path.join(path.dirname(apk), 'source-verified.json');
        sources.add(buildFile);
        sources.add(mapFile);
        const build = JSON.parse(fs.readFileSync(buildFile)),
            sourceMap = JSON.parse(fs.readFileSync(mapFile));
        report.apk = { file: apk, bytes: fs.statSync(apk).size, sha256: sha(fs.readFileSync(apk)) };
        check(
            build.pass &&
                build.compiled &&
                build.apk.sha256 === report.apk.sha256 &&
                build.androidStl === 'c++_static' &&
                build.sdlVersion === '3.2.30' &&
                build.v8StartupMode === 'embedded',
            'APK/build profile differs',
        );
        for (const [file, digest] of Object.entries(sourceMap)) {
            const actual = path.resolve(args['host-source'], file);
            check(sha(fs.readFileSync(actual)) === digest, 'Source mismatch: ' + file);
            sources.add(actual);
        }
        report.source = {
            root: path.resolve(args['host-source']),
            count: Object.keys(sourceMap).length,
            head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: args['host-source'], encoding: 'utf8' }).trim(),
            status: execFileSync('git', ['status', '--porcelain=v1'], {
                cwd: args['host-source'],
                encoding: 'utf8',
            }).trim(),
        };
        const zip = await JSZip.loadAsync(fs.readFileSync(apk));
        for (const [file, digest] of Object.entries(build.payload.assets))
            check(
                sha(await zip.file('assets/' + file).async('nodebuffer')) === digest,
                'Packaged asset mismatch: ' + file,
            );
        report.sdkFixtureSha256 = build.payload.assets['interop/sdk/cocosair.module.js'];
        report.colorRuntime = color.inspectRuntime(args.python || process.env.AIR_PYTHON || 'python');
        for (const file of [...Object.keys(require.cache), ...color.inputFiles(report.colorRuntime)]) sources.add(file);
        report.inputs = inputs();
        check(adb(['get-state']) === 'device' && adb(['get-serialno']) === args.serial, 'ADB selection differs');
        report.device = {
            model: shell(['getprop', 'ro.product.model']),
            abi: shell(['getprop', 'ro.product.cpu.abilist']),
            qemu: shell(['getprop', 'ro.kernel.qemu']),
            pageBytes: Number(shell(['getconf', 'PAGE_SIZE'])),
        };
        check(report.device.pageBytes === Number(args['expected-page-size']), 'Page size differs');
        report.compat = {
            linker: shell(['getprop', 'bionic.linker.16kb.app_compat.enabled']),
            pmDisabled: shell(['getprop', 'pm.16kb.app_compat.disabled']),
        };
        if (report.device.pageBytes === 16384)
            check(
                report.compat.linker === 'fatal' && report.compat.pmDisabled === 'true',
                'Strict 16KB compatibility policy required',
            );
        const power = shell(['dumpsys', 'power']),
            policy = shell(['dumpsys', 'window', 'policy']);
        save('preflight-power.txt', power);
        save('preflight-policy.txt', policy);
        const states = [
            ...policy.matchAll(
                /\b(?:showing|inputRestricted|mKeyguardShowing|mShowingLockscreen)\s*[=:]\s*(true|false)\b/g,
            ),
        ].map((m) => m[1]);
        check(
            /mWakefulness=Awake\b/.test(power) && states.length && states.every((value) => value === 'false'),
            'Awake and normally unlocked device required; no device changes performed',
        );
        if (args.install) adb(['install', '-r', apk], deadline(15000));
        const installed = shell(['pm', 'path', PACKAGE])
            .split(/\r?\n/)
            .find((line) => line.startsWith('package:'));
        check(
            installed && shell(['sha256sum', installed.slice(8)]).split(/\s/)[0] === report.apk.sha256,
            'Installed APK differs',
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
                '*:S',
            ],
            { windowsHide: true, stdio: ['ignore', fd, fd] },
        );
        closePromise = new Promise((resolve) => {
            logcat.once('close', (code, signal) => {
                closed = { observed: true, code, signal, monotonicMs: mono() };
                resolve(closed);
            });
            logcat.once('error', (error) => {
                report.logcatError = String(error);
            });
        });
        fs.closeSync(fd);
        shell(['am', 'force-stop', PACKAGE]);
        report.startEpoch = Number(shell(['date', '+%s']));
        shell(['am', 'start', '-W', '-n', COMPONENT, '--es', 'run_id', report.runId]);
        privateDir = 'files/interop/' + report.runId + '/';
        session = await poll(() => privateJson('session.json'), deadline(20000));
        save('session.json', session);
        check(session.runId === report.runId && session.caseId === 'demo', 'Session mismatch');
        port = adb(['forward', 'tcp:0', 'tcp:' + new URL(session.origin).port]);
        request = async (route, body, remaining = deadline(15000)) => {
            const response = await fetch('http://127.0.0.1:' + port + route, {
                method: body === undefined ? 'GET' : 'POST',
                headers: {
                    'X-Interop-Token': session.token,
                    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
                },
                ...(body === undefined ? {} : { body: JSON.stringify(body) }),
                signal: AbortSignal.timeout(Math.min(15000, remaining())),
            });
            const value = await response.json();
            check(response.ok, 'HTTP ' + route + ' failed');
            remaining();
            return value;
        };
        const readyDeadline = deadline(30000);
        report.ready = await poll(async () => {
            const state = await request('/state', undefined, readyDeadline);
            return state.reportSaved && state;
        }, readyDeadline);
        check(
            report.ready.runtime.jsEngine === 'v8' &&
                report.ready.runtime.backend === 'dawn' &&
                report.ready.runtime.v8StartupMode === 'embedded' &&
                report.ready.session.pid === session.pid,
            'Native runtime mismatch',
        );
        const render = deadline(15000);
        check(top('initial', render).top === COMPONENT, 'App is not foreground');
        const xml = adb(['exec-out', 'uiautomator', 'dump', '/dev/tty'], render);
        save('initial.ui.xml', xml);
        const bounds = life.surfaceBounds(xml);
        shell(['input', 'tap', String(bounds.x + bounds.width / 2), String(bounds.y + bounds.height / 2)], render);
        report.input = await poll(() => {
            const raw = privateBytes('events.jsonl', render);
            save('events.jsonl', raw);
            return raw
                .toString()
                .trim()
                .split(/\r?\n/)
                .filter(Boolean)
                .map(JSON.parse)
                .find((e) => e.stage === 'demo-input' && e.taps === 1);
        }, render);
        check(
            report.input.isTrusted &&
                report.input.frames > 3 &&
                report.input.color === 'green' &&
                report.input.gpuErrors.length === 0,
            'Real AIR draw/input failed',
        );
        const rawPng = adb(['exec-out', 'screencap', '-p'], render, true);
        save('initial.screen.png', rawPng);
        const normalized = color.normalizeScreen({
            python: args.python || process.env.AIR_PYTHON || 'python',
            runtime: report.colorRuntime,
            inputFile: path.join(out, 'initial.screen.png'),
            outputFile: path.join(out, 'initial.screen-srgb.png'),
            metadataFile: path.join(out, 'initial.screen-color.json'),
            iccFile: path.join(out, 'initial.screen-source.icc'),
            timeoutMs: render(),
        });
        const crop = cropScreen(normalized.bytes, bounds);
        save('initial.screen-crop.png', crop);
        report.visual = { bounds, colors: life.colors(crop) };
        check(life.imagePassed(report.visual.colors, 'green'), 'Actual compositor failed');
        report.beforeBackground = lifecycle().at(-1);
        if (args.case !== 'foreground') {
            if (args.case === 'home') shell(['input', 'keyevent', 'KEYCODE_HOME']);
            else shell(['am', 'start', '-W', '-a', 'android.settings.SETTINGS']);
            const stoppedDeadline = deadline(15000);
            report.stopped = await poll(() => {
                const state = top('stopped', stoppedDeadline),
                    rows = lifecycle(stoppedDeadline),
                    index = state.raw.indexOf('mActivityComponent=' + COMPONENT);
                const stopped = index >= 0 && /^\s*state=STOPPED\b/m.test(state.raw.slice(index, index + 12000));
                const paused = rows.find(
                    (r) =>
                        r.pid === session.pid &&
                        r.event === 'pause' &&
                        r.elapsedRealtime > report.beforeBackground.elapsedRealtime,
                );
                const destroyed = rows.find(
                    (r) =>
                        r.pid === session.pid &&
                        r.event === 'surface-destroyed' &&
                        r.elapsedRealtime > report.beforeBackground.elapsedRealtime,
                );
                return (
                    stopped &&
                    paused &&
                    state.top !== COMPONENT &&
                    (args.case !== 'settings' || (destroyed && state.top?.startsWith('com.android.settings/'))) && {
                        top: state.top,
                        paused,
                        destroyed,
                        rows,
                    }
                );
            }, stoppedDeadline);
        }
        save('before-finish-state.json', await request('/state'));
        report.finishBoundary = { at: new Date().toISOString(), monotonicMs: mono(), rows: lifecycle() };
        save('processes-before-finish.txt', adb(['shell', 'ps', '-A', '-o', 'PID,NAME']));
        const exitDeadline = deadline(10000);
        await request('/finish', {}, exitDeadline);
        report.nativeExit = await poll(() => privateJson('native-exit.json', exitDeadline), exitDeadline);
        check(
            report.nativeExit.pid === session.pid && report.nativeExit.code === 0 && !report.nativeExit.error,
            'Native exit failed',
        );
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
        report.teardown = await poll(() => {
            const log = fs.readFileSync(path.join(out, 'logcat.txt'), 'utf8'),
                lines = log
                    .split(/\r?\n/)
                    .filter((l) => new RegExp('\\s' + session.pid + '\\s+\\d+\\s+[VDIWEF]\\s').test(l));
            return (
                markers.every((m) => lines.some((l) => l.includes('EXIT_STAGE ' + m))) &&
                lines.some((l) => /\bSDL\s*: Finished main function\s*$/.test(l)) && {
                    pass: true,
                    elapsedMs: mono() - report.finishBoundary.monotonicMs,
                    markers,
                    sdlReturned: true,
                }
            );
        }, exitDeadline);
        report.completed = true;
    } catch (error) {
        report.error = String(error.stack || error);
    } finally {
        if (owned) {
            if (session)
                for (const file of ['lifecycle.jsonl', 'events.jsonl', 'native-exit.json'])
                    try {
                        save('final-' + file, privateBytes(file, deadline(3000)));
                    } catch (error) {
                        (report.finalReadErrors ||= {})[file] = String(error);
                    }
            try {
                report.endEpoch = Number(shell(['date', '+%s'])) + 1;
                shell(['am', 'force-stop', PACKAGE]);
                const table = adb(['shell', 'ps', '-A', '-o', 'PID,NAME']);
                save('processes-after-stop.txt', table);
                check(!parseProcessTable(table).some((r) => isPackageProcess(r, PACKAGE)), 'Package process remains');
                report.processCleanup = { pidGone: true, normalExitBeforeStop: !!report.teardown?.pass };
            } catch (error) {
                report.cleanupError = String(error);
            }
        }
        if (port)
            try {
                adb(['forward', '--remove', 'tcp:' + port]);
            } catch (error) {
                report.forwardError = String(error);
            }
        if (logcat) {
            const start = mono(),
                alreadyClosed = !!closed;
            let timer;
            const killed = logcat.kill();
            await Promise.race([
                closePromise,
                new Promise((resolve) => {
                    timer = setTimeout(resolve, 2000);
                }),
            ]);
            clearTimeout(timer);
            report.logcatClose = { closed, killed, alreadyClosed, elapsedMs: mono() - start };
            if (!closed || alreadyClosed || report.logcatClose.elapsedMs > 2000)
                report.logcatError = 'Physical logcat close failed';
        }
        if (session)
            try {
                const rows = fs
                    .readFileSync(path.join(out, 'final-lifecycle.jsonl'), 'utf8')
                    .trim()
                    .split(/\r?\n/)
                    .filter(Boolean)
                    .map(JSON.parse);
                check(
                    rows.filter((r) => r.pid === session.pid && r.event === 'created').length === 1,
                    'Activity identity changed',
                );
                if (args.case !== 'foreground')
                    check(
                        !rows.some(
                            (r) => r.event === 'resume' && r.elapsedRealtime > report.stopped.paused.elapsedRealtime,
                        ),
                        'App resumed before exit',
                    );
                const text = fs.readFileSync(path.join(out, 'logcat.txt'), 'utf8');
                const current = text
                    .split(/\r?\n/)
                    .map((raw) => {
                        const m = /^\s*(\d+\.\d+)\s+(\d+)\s+\d+\s+([VDIWEF])\s+([^:]+):\s?(.*)$/.exec(raw);
                        return m && { epoch: Number(m[1]), pid: Number(m[2]), tag: m[4].trim(), message: m[5], raw };
                    })
                    .filter(Boolean)
                    .filter((r) => r.epoch >= report.startEpoch && r.epoch < report.endEpoch);
                const created = current.find(
                    (r) =>
                        r.pid === session.pid &&
                        r.tag === 'MystralInterop' &&
                        /LIFECYCLE.*"event":"created"/.test(r.message),
                );
                check(created, 'Missing current log identity');
                let debugTarget = false;
                const fatal = [];
                for (const row of current.filter((r) => r.epoch >= created.epoch)) {
                    if (
                        row.pid === session.pid &&
                        ((row.tag === 'AndroidRuntime' && /FATAL EXCEPTION/.test(row.message)) ||
                            (row.tag === 'libc' && /Fatal signal/.test(row.message)))
                    )
                        fatal.push(row.raw);
                    if (row.tag === 'DEBUG') {
                        if (row.message.startsWith('*** ***')) debugTarget = false;
                        const m = /pid:\s*(\d+)\s*,\s*tid:/.exec(row.message);
                        if (m) debugTarget = Number(m[1]) === session.pid;
                        if (debugTarget && /signal\s+\d+/.test(row.message)) fatal.push(row.raw);
                    }
                }
                report.crashAudit = {
                    nativePid: session.pid,
                    lowerEpochSeconds: created.epoch,
                    upperEpochSecondsExclusive: report.endEpoch,
                    pass: fatal.length === 0,
                    fatal,
                };
                const adapter = {
                    runId: report.runId,
                    crashAudit: report.crashAudit,
                    stages: { continuous: { samples: [] } },
                };
                report.javascriptExceptions = memory.consumeJsExceptions(adapter, out);
                report.nativeOwnership = memory.consumeResources(adapter, out, []);
                check(
                    current.some(
                        (r) =>
                            r.pid === session.pid && /SURFACE_CONTEXT_CLEANUP.*contextWindowRefs=0\b/.test(r.message),
                    ),
                    'Context window refs did not clear',
                );
                check(
                    report.crashAudit.pass && report.javascriptExceptions.pass && report.nativeOwnership.pass,
                    'Crash/exception/ownership gate failed',
                );
            } catch (error) {
                report.resourceError = String(error.stack || error);
            }
        report.finalInputs = inputs();
        report.inputsUnchanged =
            !!report.inputs && JSON.stringify(report.inputs) === JSON.stringify(report.finalInputs);
        report.pass = !!(
            report.completed &&
            report.teardown?.pass &&
            report.processCleanup?.normalExitBeforeStop &&
            report.nativeOwnership?.pass &&
            report.inputsUnchanged &&
            !report.error &&
            !report.cleanupError &&
            !report.resourceError &&
            !report.logcatError &&
            !report.forwardError
        );
        report.status = report.pass ? 'PASS' : 'FAIL';
        report.finishedAt = new Date().toISOString();
        save('report.json', report);
        console.log(
            JSON.stringify({
                status: report.status,
                case: args.case,
                report: path.join(out, 'report.json'),
                error: report.error,
                resourceError: report.resourceError,
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
