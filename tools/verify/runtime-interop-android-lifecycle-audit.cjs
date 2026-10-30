/* Offline audit of a closed Android lifecycle run. Reads retained evidence; never invokes ADB or modifies inputs. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual: equal } = require('node:util');
const { PNG } = require('pngjs');

const PACKAGE = 'com.mystral.engine.interop';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const assert = (value, message) => {
    if (!value) throw Error(message);
};
const milliseconds = (value) => {
    const result = Date.parse(value);
    assert(Number.isFinite(result), 'Invalid retained timestamp');
    return result;
};

function parseArgs(argv) {
    const args = {};
    for (const value of argv) {
        const match = /^--(report|out)=(.+)$/.exec(value);
        assert(match && !args[match[1]], 'Unknown or duplicate argument: ' + value);
        args[match[1]] = match[2];
    }
    assert(args.report && args.out, '--report=<closed-report.json> and --out=<new-directory> are required');
    return args;
}

function pixelCounts(png) {
    const counts = { width: png.width, height: png.height, orange: 0, green: 0, blue: 0 };
    for (let i = 0; i < png.data.length; i += 4) {
        const [r, g, b] = png.data.subarray(i, i + 3);
        if (r > g + 50 && r > b + 50) counts.orange++;
        if (g > r + 50 && g > b + 50) counts.green++;
        if (b > r + 20 && b > g + 10) counts.blue++;
    }
    return counts;
}

function cropPixels(png, bounds) {
    const { x, y, width, height } = bounds;
    assert(
        [x, y, width, height].every(Number.isSafeInteger) &&
            x >= 0 &&
            y >= 0 &&
            width === 320 &&
            height === 240 &&
            x + width <= png.width &&
            y + height <= png.height,
        'Physical crop bounds differ',
    );
    const data = Buffer.alloc(width * height * 4);
    for (let row = 0; row < height; row++) {
        const start = ((y + row) * png.width + x) * 4;
        png.data.copy(data, row * width * 4, start, start + width * 4);
    }
    return data;
}

function hasIcc(bytes) {
    assert(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'Invalid PNG signature');
    let offset = 8;
    while (offset + 12 <= bytes.length) {
        const size = bytes.readUInt32BE(offset);
        assert(size <= bytes.length - offset - 12, 'Truncated PNG chunk');
        const type = bytes.toString('ascii', offset + 4, offset + 8);
        if (type === 'iCCP') return true;
        offset += size + 12;
        if (type === 'IEND') return false;
    }
    throw Error('PNG has no IEND');
}

function processes(text) {
    const lines = text.trim().split(/\r?\n/);
    assert(/^\s*PID\s+NAME\s*$/.test(lines.shift()), 'Missing real process-table header');
    const rows = lines.map((line) => {
        const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
        assert(match && Number(match[1]) > 0, 'Invalid process-table row');
        return { pid: Number(match[1]), name: match[2] };
    });
    assert(new Set(rows.map((row) => row.pid)).size === rows.length, 'Duplicate process IDs');
    return rows;
}

function main(argv) {
    const args = parseArgs(argv);
    const root = process.cwd();
    const reportFile = path.resolve(args.report);
    const directory = path.dirname(reportFile);
    const output = path.resolve(args.out);
    assert(!fs.existsSync(output), 'Preserve the prior audit; choose a new output directory');
    fs.mkdirSync(output);
    const hashes = {};
    const read = (file) => {
        const absolute = path.resolve(file);
        const bytes = fs.readFileSync(absolute);
        const name = path.relative(root, absolute).replace(/\\/g, '/');
        const digest = sha(bytes);
        assert(!hashes[name] || hashes[name] === digest, 'Evidence changed while being read: ' + name);
        hashes[name] = digest;
        return bytes;
    };
    const local = (name) => {
        const file = path.resolve(directory, name);
        assert(file.startsWith(directory + path.sep), 'Evidence reference escapes the report directory');
        return file;
    };
    const json = (file) =>
        JSON.parse(
            read(file)
                .toString('utf8')
                .replace(/^\uFEFF/, ''),
        );
    const text = (name) => read(local(name)).toString('utf8');
    const rows = (name) => text(name).trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
    const result = {
        schema: 'air-android-runtime-lifecycle-offline-audit-v1',
        startedAt: new Date().toISOString(),
        scope: 'Closed lifecycle evidence, image pixels, state preservation, bounded sampling and physical shutdown',
        deviceOperations: false,
        inputMutations: false,
        completed: false,
        pass: false,
        subset: true,
        releaseReady: false,
        checks: [],
        limitations: [
            'PNG replay currently admits only retained no-ICC byte-preserving captures; profiled inputs fail closed.',
            'Bounded lifecycle stability is not a performance, long-run stress or per-object leak-free certification.',
            'PixelCopy acknowledgement expiry is checked against the real server state and bound producer; HTTP timing is not independently traced.',
        ],
    };
    const checked = (id, value, observations) => {
        result.checks.push({ id, pass: !!value, observations });
        assert(value, id);
    };
    try {
        read(__filename);
        const report = json(reportFile);
        checked(
            'closed-complete-formal-report',
            report.schema === 'air-android-runtime-lifecycle-v1' &&
                report.completed === true &&
                report.pass === true &&
                report.status === 'PASS' &&
                report.subset === true &&
                report.releaseReady === false &&
                report.requestedSoakSeconds >= 900 &&
                milliseconds(report.finishedAt) >= milliseconds(report.createdAt),
            { report: path.relative(root, reportFile), status: report.status },
        );
        checked(
            'five-full-stages',
            equal(Object.keys(report.stages).sort(), ['background', 'continuous', 'initial', 'lock', 'surface']) &&
                Object.values(report.stages).every((stage) => stage.status === 'PASS'),
            report.stages && Object.keys(report.stages),
        );
        const session = json(local('session.json'));
        assert(
            session.pid > 0 && session.runId === report.runId && session.caseId === 'demo',
            'Session identity differs',
        );
        assert(equal(session, json(local('final-session.json'))), 'Final native session differs');
        const pid = session.pid;
        const buildFile = path.join(path.dirname(path.resolve(root, report.apk.file)), 'build-report.json');
        const build = json(buildFile);
        const apk = read(path.resolve(root, report.apk.file));
        checked(
            'same-static-sdl-apk-and-runtime',
            sha(apk) === report.apk.sha256 &&
                apk.length === report.apk.bytes &&
                build.apk.sha256 === report.apk.sha256 &&
                build.compiled === true &&
                build.sourceCount === 116 &&
                build.androidStl === 'c++_static' &&
                build.sdlVersion === '3.2.30' &&
                build.v8LibraryKind === 'static' &&
                build.v8StartupMode === 'embedded' &&
                report.runtime.nativeStarted === true &&
                report.runtime.jsEngine === 'v8' &&
                report.runtime.backend === 'dawn' &&
                report.runtime.v8Version === '11.6.189.22' &&
                report.runtime.v8StartupMode === 'embedded',
            { apkSha256: sha(apk), pid, runId: session.runId, sourceCount: build.sourceCount },
        );
        checked(
            'actual-page-policy',
            report.device.pageBytes === report.expectedPageBytes &&
                [4096, 16384].includes(report.device.pageBytes) &&
                (report.device.pageBytes !== 16384 ||
                    [report.initialCompat, report.finalCompat].every(
                        (value) => value.linker === 'fatal' && value.pmDisabled === 'true',
                    )),
            { device: report.device, initial: report.initialCompat, final: report.finalCompat },
        );
        assert(
            equal(report.inputs, report.finalInputs) && report.inputsUnchanged === true,
            'Original input fingerprints differ',
        );
        for (const [file, digest] of Object.entries(report.inputs))
            assert(sha(read(path.resolve(root, file))) === digest, 'Input changed: ' + file);
        checked('current-and-original-input-hashes', true, { count: Object.keys(report.inputs).length });

        const commands = Array.from({ length: report.commandCount }, (_, index) => {
            const stem = 'commands/' + String(index + 1).padStart(5, '0');
            const row = json(local(stem + '.json'));
            assert(row.arguments[0] === '-s' && row.arguments[1] === report.serial, 'Retained ADB target differs');
            assert(row.timeoutMs > 0 && row.timeoutMs <= 15000, 'ADB operation timeout was widened');
            assert(milliseconds(row.finishedAt) >= milliseconds(row.startedAt), 'Command timestamp order differs');
            const stdout = read(local(stem + '.stdout'));
            if (fs.existsSync(local(stem + '.stderr'))) read(local(stem + '.stderr'));
            return { ...row, index, stdout, digest: sha(stdout) };
        });
        const successful = (tail) =>
            commands.filter((row) => row.exitCode === 0 && equal(row.arguments.slice(2), tail));
        assert(
            report.budgets.captureAndAckMs === 15000 &&
                report.budgets.nativeExitMs === 10000 &&
                report.budgets.resumeIncludingAutomaticPaintAndInputMs === 15000 &&
                report.budgets.maximumHeartbeatIntervalMs === 45000,
            'Original evidence budgets differ',
        );
        assert(
            successful(['shell', 'getconf', 'PAGE_SIZE']).some(
                (row) => Number(row.stdout.toString().trim()) === report.device.pageBytes,
            ),
            'Page size has no raw command proof',
        );
        if (report.device.pageBytes === 16384) {
            for (const [property, value] of [
                ['bionic.linker.16kb.app_compat.enabled', 'fatal'],
                ['pm.16kb.app_compat.disabled', 'true'],
            ]) {
                const values = successful(['shell', 'getprop', property]);
                assert(
                    values.length >= 2 && values.every((row) => row.stdout.toString().trim() === value),
                    'Strict initial/final compatibility policy has no raw command proof',
                );
            }
        }
        const inputs = commands.filter(
            (row) => row.exitCode === 0 && row.arguments.slice(2, 5).join(' ') === 'shell input tap',
        );
        const samples = report.stages.continuous.samples;
        checked(
            'bounded-monotonic-fifteen-minute-samples',
            samples.length >= 31 &&
                samples.every(
                    (sample, index) =>
                        sample.status === 'PASS' &&
                        Number.isFinite(sample.monotonicStartMs) &&
                        sample.monotonicEndMs >= sample.monotonicStartMs &&
                        sample.monotonicEndMs - sample.monotonicStartMs <= 15000 &&
                        sample.actualWallStartMs === milliseconds(sample.sampledAt) &&
                        (index === 0 ||
                            (sample.monotonicStartMs - samples[index - 1].monotonicStartMs >= 30000 &&
                                sample.monotonicStartMs - samples[index - 1].monotonicStartMs <= 45000 &&
                                Math.abs(
                                    sample.intervalMs - (sample.monotonicStartMs - samples[index - 1].monotonicStartMs),
                                ) < 0.001 &&
                                sample.wallIntervalMs >= 0 &&
                                sample.wallIntervalMs <= 45000)),
                ) &&
                samples.at(-1).monotonicStartMs - samples[0].monotonicStartMs >= 900000 &&
                report.stages.continuous.observedWindowMs >= 900000,
            {
                count: samples.length,
                windowMs: report.stages.continuous.observedWindowMs,
                intervalsMs: samples.slice(1).map((sample) => sample.intervalMs),
            },
        );
        assert(inputs.length === 4 + samples.length, 'Real input command count differs');

        const observed = new Map();
        for (const observation of report.observations) {
            assert(!observed.has(observation.label), 'Duplicate observation label');
            const name = observation.label;
            const original = read(local(name + '.screen.png'));
            const originalCrop = read(local(name + '.screen-crop.png'));
            const interpreted = read(local(name + '.screen-srgb.png'));
            const interpretedCrop = read(local(name + '.screen-srgb-crop.png'));
            const metadata = json(local(observation.colorMetadata));
            assert(equal(observation, json(local(name + '.verification.json'))), 'Retained observation differs');
            assert(
                sha(original) === observation.originalSha256 &&
                    sha(originalCrop) === observation.originalCropSha256 &&
                    sha(interpreted) === observation.interpretedSha256 &&
                    sha(interpretedCrop) === observation.interpretedCropSha256,
                'Original/interpreted capture hashes differ',
            );
            assert(
                !hasIcc(original) &&
                    metadata.icc.present === false &&
                    metadata.action === 'no-icc-byte-preserving-copy' &&
                    metadata.transform === null &&
                    original.equals(interpreted),
                'Profiled or altered image needs a separate independent ICC replay',
            );
            assert(
                metadata.completed === true &&
                    metadata.pass === true &&
                    metadata.input.sha256 === sha(original) &&
                    metadata.output.sha256 === sha(interpreted),
                'Color interpretation receipt differs',
            );
            const full = PNG.sync.read(original),
                crop = PNG.sync.read(originalCrop),
                srgbCrop = PNG.sync.read(interpretedCrop);
            assert(
                cropPixels(full, observation.bounds).equals(crop.data) && crop.data.equals(srgbCrop.data),
                'Physical crop pixels differ',
            );
            const counts = { ...pixelCounts(srgbCrop), sha256: sha(interpretedCrop) };
            assert(equal(counts, observation.colors), 'Independent PNG color counts differ');
            const passed =
                counts.width === 320 &&
                counts.height === 240 &&
                counts[observation.wanted] > 1000 &&
                counts.blue > 30000;
            assert(passed === observation.pass, 'Observation classification differs');
            observed.set(name, observation);
        }
        checked('all-retained-compositor-pixels-recomputed', true, { images: observed.size });
        const acceptedVisual = (value) =>
            assert(
                value && value.pass === true && equal(value, observed.get(value.label)),
                'Required presentation is absent or failed',
            );
        const stateAt = (label) => {
            const state = json(local(label + '.state.json'));
            assert(
                equal(state.session, session) && equal(state.runtime, report.runtime),
                'Same-PID/session/runtime state differs',
            );
            assert(
                processes(text(label + '.processes.txt')).some((row) => row.pid === pid && row.name === PACKAGE),
                'Same PID lacks a live process proof',
            );
            return state;
        };
        let previousFrames = -1;
        const checkInput = (value, index, label) => {
            const event = value.event;
            assert(
                event.taps === index + 1 &&
                    event.isTrusted === true &&
                    event.type === 'mousedown' &&
                    Math.abs(event.clientX - 160) <= 1 &&
                    Math.abs(event.clientY - 120) <= 1 &&
                    event.frames > previousFrames &&
                    equal(event.gpuErrors, []) &&
                    event.color === ((index + 1) % 2 ? 'green' : 'orange'),
                'Trusted input or preserved scene state differs',
            );
            assert(
                rows(label + '.events.jsonl').some((row) => equal(row, event)),
                'Input event is absent from raw Java publication',
            );
            previousFrames = event.frames;
            acceptedVisual(value.visual);
            assert(value.visual.wanted === event.color, 'Input response color differs');
            stateAt(label);
            const ui = text(label + '.ui.xml');
            const actual = `[${value.visual.bounds.x},${value.visual.bounds.y}][${value.visual.bounds.x + 320},${value.visual.bounds.y + 240}]`;
            assert(
                ui.includes('class="android.view.SurfaceView"') && ui.includes('bounds="' + actual + '"'),
                'Real Surface UI bounds differ',
            );
            const tap = inputs[index].arguments.slice(2);
            assert(
                Number(tap[3]) === value.visual.bounds.x + 160 && Number(tap[4]) === value.visual.bounds.y + 120,
                'Actual ADB tap coordinates differ',
            );
        };
        checkInput(report.stages.initial.evidence, 0, 'initial-input');
        for (const [index, stage] of ['background', 'lock', 'surface'].entries()) {
            const recovery = report.stages[stage].recovery;
            const attempt = report.recoveryAttempts.find((value) => value.label === stage + '-recovery');
            assert(
                attempt &&
                    recovery.beforeFirstInput === true &&
                    attempt.beforeFirstInput === true &&
                    attempt.existingTaps === index + 1 &&
                    attempt.elapsedMs <= 15000 &&
                    recovery.elapsedMs === attempt.elapsedMs,
                'Recovery lacks the original unified budget or preserved input count',
            );
            acceptedVisual(recovery.automaticPresentation);
            assert(
                recovery.automaticPresentation.wanted === ((index + 1) % 2 ? 'green' : 'orange'),
                'Automatic recovery did not retain the previous material',
            );
            stateAt(stage + '-recovery-automatic');
            const candidates = commands.filter(
                (row) =>
                    row.exitCode === 0 &&
                    equal(row.arguments.slice(2), ['exec-out', 'screencap', '-p']) &&
                    row.digest === recovery.automaticPresentation.originalSha256 &&
                    row.index > inputs[index].index &&
                    row.index < inputs[index + 1].index,
            );
            assert(candidates.length > 0, 'No independent automatic image before the first recovery tap');
            assert(
                milliseconds(recovery.automaticPresentation.measuredAt) <= milliseconds(inputs[index + 1].startedAt),
                'Automatic presentation was captured after the recovery tap',
            );
            const boundary = report.stages[stage].boundary.paused || report.stages[stage].boundary.event;
            assert(
                recovery.lifecycle.some(
                    (row) =>
                        row.pid === pid && row.event === 'resume' && row.elapsedRealtime > boundary.elapsedRealtime,
                ),
                'No actual resume after the interruption',
            );
            checkInput(recovery, index + 1, stage + '-recovery');
        }
        for (const [index, sample] of samples.entries()) checkInput(sample, index + 4, sample.label);
        checked('all-inputs-preserve-session-and-render-state', true, {
            trustedInputs: inputs.length,
            automaticRecoveries: 3,
        });

        const acknowledgedState = stateAt('background-recovery-automatic');
        assert(report.captures.length === 2, 'Initial PixelCopy pair is incomplete');
        for (const [index, capture] of report.captures.entries()) {
            const meta = capture.metadata;
            const data = read(local(meta.file));
            const measured = { ...pixelCounts(PNG.sync.read(data)), sha256: sha(data) };
            const row = acknowledgedState.captures.find((value) => value.captureId === meta.captureId);
            assert(
                row &&
                    row.acknowledged === true &&
                    row.expired === false &&
                    equal(row.metadata, meta) &&
                    meta.channel === 'android-pixelcopy' &&
                    meta.pid === pid &&
                    meta.runId === session.runId &&
                    meta.resultCode === 0 &&
                    measured.width === 320 &&
                    measured.height === 240 &&
                    capture.pass === true &&
                    ['width', 'surfaceWidth', 'bitmapWidth', 'viewWidth'].every((key) => meta[key] === 320) &&
                    ['height', 'surfaceHeight', 'bitmapHeight', 'viewHeight'].every((key) => meta[key] === 240) &&
                    meta.sha256 === sha(data) &&
                    equal(measured, capture.surface) &&
                    measured[index ? 'green' : 'orange'] > 1000 &&
                    measured.blue > 30000,
                'Original PixelCopy identity, pixels or server deadline acknowledgement differs',
            );
            acceptedVisual(capture.compositor);
        }
        assert(
            report.captures[1].metadata.surfaceGeneration === report.captures[0].metadata.surfaceGeneration &&
                report.captures[1].metadata.previous.sha256 === report.captures[0].metadata.sha256,
            'Original same-Surface PixelCopy chain differs',
        );
        checked('pixelcopy-original-server-deadline-and-chain', true, {
            captureCount: 2,
            captureBudgetMs: report.budgets.captureAndAckMs,
        });

        const lifecycle = rows('final-lifecycle.jsonl');
        const hasLifecycle = (event) => lifecycle.some((row) => equal(row, event));
        const locked = report.stages.lock.boundary;
        checked(
            'actual-power-keyguard-and-pause',
            /mWakefulness=Asleep\b/.test(text('locked-power.txt')) &&
                /KeyguardServiceDelegate[\s\S]*?\bshowing=true\b/.test(text('locked-window-policy.txt')) &&
                hasLifecycle(locked.paused) &&
                locked.paused.pid === pid &&
                locked.paused.event === 'pause' &&
                successful(['shell', 'dumpsys', 'power']).some(
                    (row) => row.stdout.toString().trim() === text('locked-power.txt'),
                ) &&
                successful(['shell', 'dumpsys', 'window', 'policy']).some(
                    (row) => row.stdout.toString().trim() === text('locked-window-policy.txt'),
                ) &&
                successful(['shell', 'input', 'keyevent', 'KEYCODE_SLEEP']).length === 1 &&
                successful(['shell', 'wm', 'dismiss-keyguard']).length === 1,
            { paused: locked.paused },
        );
        const surface = report.stages.surface;
        checked(
            'actual-settings-surface-destroy-and-create',
            hasLifecycle(surface.boundary.event) &&
                hasLifecycle(surface.created) &&
                surface.boundary.event.pid === pid &&
                surface.boundary.event.event === 'surface-destroyed' &&
                surface.created.pid === pid &&
                surface.created.event === 'surface-created' &&
                surface.created.elapsedRealtime > surface.boundary.event.elapsedRealtime &&
                surface.created.surfaceGeneration > surface.boundary.event.surfaceGeneration &&
                surface.boundary.top.startsWith('com.android.settings/') &&
                successful(['shell', 'dumpsys', 'activity', 'activities']).some((row) =>
                    /^\s*topResumedActivity=.*\bcom\.android\.settings\//m.test(row.stdout.toString()),
                ) &&
                successful(['shell', 'am', 'start', '-W', '-a', 'android.settings.SETTINGS']).length === 1,
            { destroyed: surface.boundary.event, created: surface.created },
        );

        const rawLog = text('logcat.txt');
        const logRows = rawLog
            .split(/\r?\n/)
            .map((line) => {
                const match = /^\s*(\d+\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s?(.*)$/.exec(line);
                return (
                    match && {
                        time: Number(match[1]),
                        pid: Number(match[2]),
                        tid: Number(match[3]),
                        priority: match[4],
                        tag: match[5].trim(),
                        message: match[6],
                    }
                );
            })
            .filter(Boolean);
        const lower = report.logTimeBounds.startEpochSecondsInclusive,
            upper = report.logTimeBounds.endEpochSecondsExclusive;
        assert(
            Number.isSafeInteger(lower) && Number.isSafeInteger(upper) && upper > lower,
            'Invalid device log time bounds',
        );
        const bounded = logRows.filter((row) => row.time >= lower && row.time < upper);
        const created = bounded.find(
            (row) =>
                row.pid === pid && row.tag === 'MystralInterop' && /LIFECYCLE.*"event":"created"/.test(row.message),
        );
        assert(created, 'No current-PID creation in the log window');
        const current = bounded.filter((row) => row.time >= created.time);
        const native = current.filter((row) => row.pid === pid);
        const owner = native.filter((row) => /SURFACE_(INITIAL|RETIRED|RESTORED)\b/.test(row.message));
        const pointers = owner.map((row) => /\bdevice=(0x[\da-f]+)\s+thread=(\d+)/i.exec(row.message));
        checked(
            'same-device-and-native-owner-thread',
            owner.length >= 3 &&
                pointers.every(Boolean) &&
                new Set(pointers.map((value) => value[1])).size === 1 &&
                pointers[0][1] !== '0x0' &&
                new Set(pointers.map((value) => value[2])).size === 1 &&
                new Set(owner.map((row) => row.tid)).size === 1 &&
                native.some((row) =>
                    row.message.includes('SURFACE_RESTORED generation=' + surface.created.surfaceGeneration + ' '),
                ) &&
                !native.some((row) => row.message.includes('SURFACE_RESTORE_FAILED')),
            { records: owner, devicePointer: pointers[0]?.[1], ownerThread: pointers[0]?.[2] },
        );
        const markers = [
            'shutdown-jsEngine-return',
            'context-surface-release-return',
            'context-device-destroy-return',
            'context-device-release-return',
            'context-instance-release-return',
            'shutdown-window-return',
            'shutdown-complete',
            'runtime-reset-return',
            'java-exit-notify-return',
        ];
        const quit = native.find((row) => row.message.includes('EXIT_STAGE java-quit-schedule'));
        const sdl = native.find((row) => row.tag === 'SDL' && /^Finished main function\s*$/.test(row.message));
        const exits = markers.map((marker) => native.find((row) => row.message.includes('EXIT_STAGE ' + marker)));
        checked(
            'nine-real-teardown-markers-and-sdl-return',
            quit &&
                sdl &&
                exits.every(Boolean) &&
                exits.every(
                    (row, index) => row.time >= quit.time && (index === 0 || row.time >= exits[index - 1].time),
                ) &&
                sdl.time >= exits.at(-1).time &&
                (sdl.time - quit.time) * 1000 <= 10000 &&
                report.nativeExit.pid === pid &&
                report.nativeExit.code === 0 &&
                report.nativeExit.error === '' &&
                report.teardown.pass === true &&
                report.teardown.elapsedMs <= 10000,
            { nativeExit: report.nativeExit, elapsedFromQuitScheduleMs: sdl && quit && (sdl.time - quit.time) * 1000 },
        );
        const fatal = [];
        let debuggerTarget = false;
        for (const row of current) {
            if (
                row.pid === pid &&
                ((row.tag === 'AndroidRuntime' &&
                    /FATAL EXCEPTION|Process:.*com\.mystral\.engine\.interop/.test(row.message)) ||
                    (row.tag === 'libc' && /Fatal signal\s+\d+/.test(row.message)))
            )
                fatal.push(row);
            if (row.tag === 'DEBUG') {
                if (/^\*\*\* \*\*\*/.test(row.message)) debuggerTarget = false;
                const match = /\bpid:\s*(\d+)\s*,\s*tid:/.exec(row.message);
                if (match) debuggerTarget = Number(match[1]) === pid;
                if (debuggerTarget && /\bsignal\s+\d+\s*\(/.test(row.message)) fatal.push(row);
            }
        }
        checked(
            'original-pid-time-bounded-crash-replay',
            fatal.length === 0 &&
                report.crashAudit.pass === true &&
                report.crashAudit.logSha256 === sha(Buffer.from(rawLog)) &&
                report.crashAudit.nativePid === pid,
            { currentRunRows: current.length, fatal },
        );
        checked(
            'physical-logcat-close',
            report.logcatShutdown.close?.observed === true &&
                report.logcatShutdown.closedBeforeRequest === false &&
                report.logcatShutdown.killRequested === true &&
                report.logcatShutdown.elapsedMs <= 2000 &&
                !report.collectorCloseError &&
                !report.logcatSpawnError,
            report.logcatShutdown,
        );
        const before = processes(text('processes-before-finish.txt')),
            after = processes(text('processes-after-stop.txt'));
        checked(
            'real-positive-live-and-negative-gone',
            before.some((row) => row.pid === pid && row.name === PACKAGE) &&
                !after.some((row) => row.name === PACKAGE || row.name.startsWith(PACKAGE + ':')) &&
                report.processCleanup.pass === true &&
                report.processCleanup.normalNativeExitBeforeCleanup === true &&
                report.processCleanup.finishRequested === true,
            report.processCleanup,
        );
        for (const [file, digest] of Object.entries(hashes))
            assert(
                sha(fs.readFileSync(path.resolve(root, file))) === digest,
                'Evidence changed before closure: ' + file,
            );
        checked('audit-inputs-stable-through-closure', true, { files: Object.keys(hashes).length });
        result.completed = true;
        result.pass = true;
    } catch (error) {
        result.error = String(error.stack || error);
    }
    result.evidenceHashes = hashes;
    result.producer = {
        file: path.relative(root, __filename).replace(/\\/g, '/'),
        sha256: sha(fs.readFileSync(__filename)),
    };
    result.finishedAt = new Date().toISOString();
    result.status = result.pass ? 'PASS' : 'FAIL';
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
    console.log(
        JSON.stringify({
            status: result.status,
            checks: result.checks.length,
            evidenceFiles: Object.keys(hashes).length,
            output,
        }),
    );
    process.exitCode = result.pass ? 0 : 1;
    return result;
}

module.exports = { parseArgs, pixelCounts, cropPixels, hasIcc, processes, main };
if (require.main === module) main(process.argv.slice(2));
