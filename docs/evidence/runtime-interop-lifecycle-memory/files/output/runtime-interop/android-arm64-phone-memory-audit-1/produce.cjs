/* Offline audit only. Run after report.json is closed, with the collector's configured NODE_PATH. No ADB. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual: equal } = require('node:util');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '../../..');
const directory = path.join(root, 'output/runtime-interop/android-arm64-phone-memory-attempt-1');
const memory = require(path.join(root, 'tools/verify/runtime-interop-android-memory.cjs'));
const counters = require(path.join(root, 'tools/verify/runtime-interop-android-memory-audit.cjs'));
const life = require(path.join(root, 'tools/verify/runtime-interop-android-lifecycle.cjs'));
const PHONE_SHA = '9341fc6ae2fdcef326766e9cea4f8a0174f3fc0b8e865496228b835103fcc165';
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(root, path.resolve(file)).replaceAll('\\', '/');
const evidence = {};
const read = (file) => {
    const absolute = path.resolve(root, file),
        bytes = fs.readFileSync(absolute),
        key = relative(absolute);
    if (evidence[key] && evidence[key] !== sha(bytes)) throw Error('Input changed: ' + key);
    evidence[key] = sha(bytes);
    return bytes;
};
const json = (file) =>
    JSON.parse(
        read(file)
            .toString('utf8')
            .replace(/^\uFEFF/, ''),
    );
const local = (file) => path.join(directory, file);
const text = (file) => read(local(file)).toString('utf8');
const save = (name, value) =>
    fs.writeFileSync(path.join(__dirname, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const audit = {
    schema: 'air-physical-foreground-memory-independent-audit-v1',
    startedAt: new Date().toISOString(),
    completed: false,
    pass: false,
    subset: true,
    releaseReady: false,
    deviceOperations: false,
    inputMutations: false,
    checks: [],
    scope: 'V2520A/ARM64/4KB first foreground baseline; not HOME, Settings, lock or emulator comparison',
    limitations: [
        'Physical ARM64 16KB runtime NOT_RUN',
        'No prior matched physical memory baseline is available',
        'Owned API counters and a bounded observation do not prove that all native allocations are leak-free',
    ],
};
const check = (id, pass, observations) => {
    audit.checks.push({ id, pass: !!pass, observations });
    if (!pass) throw Error(id);
};
const ms = (value) => {
    const result = Date.parse(value);
    if (!Number.isFinite(result)) throw Error('Invalid original date');
    return result;
};
function processTable(value) {
    const rows = value.trim().split(/\r?\n/);
    if (!/^\s*PID\s+NAME\s*$/.test(rows.shift()) || !rows.length) throw Error('Incomplete process table');
    return rows.map((line) => {
        const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
        if (!m || +m[1] <= 0) throw Error('Invalid process row');
        return { pid: +m[1], name: m[2] };
    });
}
function cropMatches(full, bounds, crop) {
    const a = PNG.sync.read(full),
        b = PNG.sync.read(crop),
        { x, y, width, height } = bounds;
    if (
        ![x, y, width, height].every(Number.isInteger) ||
        x < 0 ||
        y < 0 ||
        width !== 320 ||
        height !== 240 ||
        x + width > a.width ||
        y + height > a.height ||
        b.width !== width ||
        b.height !== height
    )
        return false;
    const result = new PNG({ width, height });
    PNG.bitblt(a, result, x, y, width, height, 0, 0);
    return result.data.equals(b.data);
}
function unlocked(policy) {
    const states = [
        ...policy.matchAll(
            /\b(?:showing|mKeyguardShowing|mShowingLockscreen|isStatusBarKeyguard|inputRestricted|mInputRestricted)\s*[=:]\s*(true|false)\b/g,
        ),
    ];
    return states.length > 0 && states.every((m) => m[1] === 'false');
}
async function main() {
    try {
        read(__filename);
        read(path.join(__dirname, 'replay-icc.py'));
        const m = json(local('report.json'));
        check(
            'closed-physical-foreground-baseline-only',
            m.schema === 'air-android-physical-foreground-memory-v1' &&
                m.completed === true &&
                m.pass === true &&
                ['PASS', 'PASS_WITH_OPEN_FINDINGS'].includes(m.status) &&
                m.physicalAcceptance === true &&
                m.physicalBaseline === true &&
                m.scope === 'physical-foreground-only' &&
                m.requestedSoakSeconds === 900 &&
                m.subset === true &&
                m.releaseReady === false &&
                m.allResourcesLeakFree === 'NOT_ESTABLISHED' &&
                m.comparison.status === 'NOT_RUN_NO_MATCHED_PHYSICAL_BASELINE' &&
                equal(m.lifecycleCoverage, {
                    foreground: 'PASS',
                    home: 'NOT_RUN',
                    settings: 'NOT_RUN',
                    secureLock: 'NOT_RUN',
                }) &&
                m.pixelCopy === 'NOT_REQUESTED_BY_FOREGROUND_CONTRACT',
            { status: m.status, scope: m.scope, comparison: m.comparison },
        );
        check(
            'original-phone-producer-and-start-end-inputs',
            m.producer.sha256 === PHONE_SHA &&
                sha(read(local('collector-source.cjs'))) === PHONE_SHA &&
                sha(read(path.join(root, m.producer.file))) === PHONE_SHA &&
                m.inputsUnchanged === true &&
                equal(m.inputs, m.finalInputs) &&
                Object.entries(m.inputs).every(([file, digest]) => sha(read(path.resolve(root, file))) === digest),
            { count: Object.keys(m.inputs).length },
        );
        check(
            'frozen-common-consumers',
            sha(read(path.join(root, 'tools/verify/runtime-interop-android-memory.cjs'))) ===
                '680db112c9bfa3308f8592cc9626db7b9ce583bbeab262dfe3be49b7bbeebf15' &&
                sha(read(path.join(root, 'tools/verify/runtime-interop-android-lifecycle.cjs'))) ===
                    '12c360ece283e99b8fae3925b43e7afeb4772d083e98dc9da6b5332ccfec6ef7',
        );
        read(path.join(root, 'tools/verify/runtime-interop-android-memory-audit.cjs'));
        const matrixAudit = json('output/runtime-interop/android-arm64-memory-matrix-audit-1/report.json');
        check(
            'closed-86-check-same-arm64-functional-matrix',
            sha(read('output/runtime-interop/android-arm64-memory-matrix-audit-1/report.json')) ===
                '481899c0cad821d7b0d33bef33b2264e367eddaf381169fac3e4691673f3caed' &&
                matrixAudit.completed === true &&
                matrixAudit.pass === true &&
                matrixAudit.checks.length === 86 &&
                matrixAudit.captures.length === 10,
        );
        const sources = json('output/runtime-interop/android-memory-arm64-build-attempt-1/source-verified.json');
        check(
            'current116-and-compiled-source-binding',
            Object.keys(sources).length === 116 &&
                equal(
                    sources,
                    json('output/runtime-interop/android-memory-arm64-build-attempt-1/source-before.json'),
                ) &&
                equal(sources, json('output/runtime-interop/android-memory-arm64-build-attempt-1/source-after.json')) &&
                equal(
                    sources,
                    json(
                        'tools/verify/runtime-interop-android/host-patches/memory/compiled-source/source-verified.json',
                    ),
                ) &&
                Object.entries(sources).every(
                    ([file, digest]) => sha(read('output/runtime-interop/mystral-source/' + file)) === digest,
                ),
        );
        const build = json('output/runtime-interop/android-memory-arm64-build-attempt-1/build-report.json');
        check(
            'exact-current-installed-arm-candidate-and-packaged-sdk',
            m.apk.bytes === 22948135 &&
                m.apk.sha256 === 'c6d833035389e1e434db3d0957d21a68a8fdfaac03e3422564e5b6515b205819' &&
                sha(read(m.apk.file)) === m.apk.sha256 &&
                build.apk.sha256 === m.apk.sha256 &&
                build.androidStl === 'c++_static' &&
                build.sdlVersion === '3.2.30' &&
                m.packagedAssets['interop/sdk/cocosair.module.js'].sha256 ===
                    '417509cb4774f85346158c7c27f580a7afe5ace70c7486e095b4bbb216de518a' &&
                m.packagedAssets['assets-manifest.json'].sha256 ===
                    '18615a9c5b1760074f82296c664d5d894032c62fc1e6671239f94e8c18f418df',
        );
        check(
            'actual-untranslated-physical-4kb-device',
            m.serial === '10CG4G0BE1003M8' &&
                m.device.serial === m.serial &&
                m.device.model === 'V2520A' &&
                m.device.api === 37 &&
                m.device.abiList === 'arm64-v8a' &&
                ['', '0'].includes(m.device.qemu) &&
                m.device.nativeBridge === '0' &&
                m.device.pageBytes === 4096 &&
                m.runtime.nativeStarted === true &&
                m.runtime.loadedABI === 'arm64-v8a' &&
                m.runtime.jsEngine === 'v8' &&
                m.runtime.backend === 'dawn' &&
                m.runtime.v8StartupMode === 'embedded' &&
                m.runtime.v8Version === '11.6.189.22',
            m.device,
        );
        check(
            'manual-awake-unlocked-admission',
            m.phoneAdmission.awake === true &&
                m.phoneAdmission.keyguardKnownUnlocked === true &&
                /\bmWakefulness=Awake\b/.test(text('preflight-power.txt')) &&
                unlocked(text('preflight-window-policy.txt')),
        );
        const commands = Array.from({ length: m.commands }, (_, index) => {
            const stem = 'commands/' + String(index + 1).padStart(5, '0'),
                row = json(local(stem + '.json'));
            check(
                'command-' + (index + 1) + '-original-target-budget',
                row.arguments[0] === '-s' &&
                    row.arguments[1] === m.serial &&
                    row.timeoutMs > 0 &&
                    row.timeoutMs <= 15000 &&
                    Number.isFinite(row.monotonicStartMs) &&
                    row.monotonicEndMs >= row.monotonicStartMs &&
                    row.monotonicEndMs <= row.absoluteDeadlineMs,
            );
            const stdout = read(local(stem + '.stdout'));
            read(local(stem + '.stderr'));
            return { ...row, index, stdout, hash: sha(stdout) };
        });
        const writes = commands.filter(
            (row) =>
                row.arguments.slice(2, 4).join(' ') === 'shell settings' ||
                row.arguments.includes('dismiss-keyguard') ||
                row.arguments.includes('KEYCODE_WAKEUP') ||
                row.arguments.includes('KEYCODE_SLEEP') ||
                row.arguments.includes('KEYCODE_HOME') ||
                row.arguments.includes('android.settings.SETTINGS'),
        );
        check('no-security-settings-or-lifecycle-recovery-operations', writes.length === 0);
        const session = json(local('session.json')),
            finalSession = json(local('final-session.json'));
        check(
            'one-native-session',
            equal(session, finalSession) &&
                session.pid > 0 &&
                session.runId === m.runId &&
                session.caseId === 'demo' &&
                session.demo === true,
        );
        const taps = commands.filter(
            (row) => row.exitCode === 0 && equal(row.arguments.slice(2, 5), ['shell', 'input', 'tap']),
        );
        const samples = m.samples,
            duration = samples.at(-1).monotonicStartMs - samples[0].monotonicStartMs;
        check(
            '900-second-noncatchup-10-second-heartbeats',
            samples.length >= 61 &&
                duration >= 900000 &&
                taps.length === samples.length &&
                samples.every(
                    (sample, index) =>
                        sample.status === 'PASS' &&
                        sample.label === 'foreground-' + String(index).padStart(3, '0') &&
                        sample.actualWallStartMs === ms(sample.sampledAt) &&
                        sample.monotonicEndMs >= sample.monotonicStartMs &&
                        sample.monotonicEndMs - sample.monotonicStartMs <= 15000 &&
                        (!index ||
                            (sample.monotonicStartMs - samples[index - 1].monotonicStartMs >= 10000 &&
                                sample.monotonicStartMs - samples[index - 1].monotonicStartMs <= 15000 &&
                                Math.abs(
                                    sample.intervalMs - (sample.monotonicStartMs - samples[index - 1].monotonicStartMs),
                                ) < 0.001 &&
                                sample.wallIntervalMs ===
                                    sample.actualWallStartMs - samples[index - 1].actualWallStartMs &&
                                sample.wallIntervalMs >= 0 &&
                                sample.wallIntervalMs <= 15000)),
                ),
            {
                samples: samples.length,
                durationMs: duration,
                maximumIntervalMs: Math.max(...samples.slice(1).map((s) => s.intervalMs)),
            },
        );
        const events = text('final-events.jsonl').trim().split(/\r?\n/).map(JSON.parse);
        let nextImage = samples[0].monotonicStartMs,
            nextMemory = samples[0].monotonicStartMs,
            priorFrames = m.application.frames;
        const imageSamples = [],
            memoryLabels = [];
        for (const [index, sample] of samples.entries()) {
            const state = json(local(sample.label + '.state.json')),
                event = sample.event;
            check(
                sample.label + '-actual-foreground-keyguard-ui-trusted-input',
                life.topActivity(text(sample.label + '.activity.txt')) === COMPONENT &&
                    unlocked(text(sample.label + '.keyguard.txt')) &&
                    equal(life.surfaceBounds(text(sample.label + '.ui.xml')), sample.bounds) &&
                    equal(state.session, session) &&
                    equal(state.runtime, m.runtime) &&
                    event.taps === index + 1 &&
                    event.isTrusted === true &&
                    event.type === 'mousedown' &&
                    Math.abs(event.clientX - 160) <= 1 &&
                    Math.abs(event.clientY - 120) <= 1 &&
                    event.frames > priorFrames &&
                    equal(event.gpuErrors, []) &&
                    event.color === ((index + 1) % 2 ? 'green' : 'orange') &&
                    events.some((e) => equal(e, event)) &&
                    Number(taps[index].arguments[5]) === sample.bounds.x + 160 &&
                    Number(taps[index].arguments[6]) === sample.bounds.y + 120 &&
                    taps[index].monotonicStartMs >= sample.monotonicStartMs &&
                    taps[index].monotonicEndMs <= sample.monotonicEndMs,
            );
            priorFrames = event.frames;
            const imageDue = sample.monotonicStartMs >= nextImage,
                memoryDue = sample.monotonicStartMs >= nextMemory;
            check(
                sample.label + '-actual-image-and-memory-schedule',
                !!sample.image === imageDue && fs.existsSync(local(sample.label + '.meminfo.txt')) === memoryDue,
            );
            if (imageDue) {
                imageSamples.push(sample);
                nextImage = sample.monotonicStartMs + 30000;
            }
            if (memoryDue) {
                memoryLabels.push(sample.label);
                nextMemory = sample.monotonicStartMs + 300000;
            }
        }
        check(
            'planned-periods-and-retained-memory-observations',
            imageSamples.length >= 21 && memoryLabels.length >= 4,
            {
                imageSamples: imageSamples.length,
                memoryLabels,
                nominalImageMs: 30000,
                nominalMemoryMs: 300000,
                actualImageStartIntervalsMs: imageSamples
                    .slice(1)
                    .map((s, i) => s.monotonicStartMs - imageSamples[i].monotonicStartMs),
            },
        );
        const needed = new Map([
            [m.initialImage.prefix, m.initialImage],
            ...imageSamples.map((sample) => [sample.image.prefix, sample.image]),
        ]);
        const plan = [];
        for (const observation of m.observations) {
            const prefix = observation.prefix,
                raw = read(local(prefix + '.screen.png')),
                rawCrop = read(local(prefix + '.screen-crop.png'));
            const srgb = read(local(prefix + '.screen-srgb.png')),
                crop = read(local(prefix + '.screen-srgb-crop.png')),
                meta = json(local(observation.colorMetadata));
            const actualColors = life.colors(crop),
                pass = life.imagePassed(actualColors, observation.wanted);
            check(
                prefix + '-unaltered-images-crops-and-original-threshold',
                equal(observation, json(local(prefix + '.verification.json'))) &&
                    observation.originalSha256 === sha(raw) &&
                    observation.originalCropSha256 === sha(rawCrop) &&
                    observation.interpretedSha256 === sha(srgb) &&
                    observation.interpretedCropSha256 === sha(crop) &&
                    cropMatches(raw, observation.bounds, rawCrop) &&
                    cropMatches(srgb, observation.bounds, crop) &&
                    equal(actualColors, observation.colors) &&
                    pass === observation.pass,
            );
            check(
                prefix + '-actual-known-icc-and-standard-whole-image-transform',
                meta.completed === true &&
                    meta.pass === true &&
                    meta.action === 'icc-to-srgb' &&
                    meta.input.sha256 === sha(raw) &&
                    meta.output.sha256 === sha(srgb) &&
                    meta.icc.present === true &&
                    meta.icc.bytes === 520 &&
                    meta.icc.sha256 === '6e72ac49fd45d1275f29daca1038a0b9af5befd0e891af9267f47ab066a5dffb' &&
                    sha(read(local(prefix + '.screen-source.icc'))) === meta.icc.sha256 &&
                    sha(Buffer.from(meta.icc.base64, 'base64')) === meta.icc.sha256 &&
                    meta.transform.renderingIntent === 1 &&
                    meta.transform.flags === 0 &&
                    meta.transform.resize === false &&
                    meta.transform.alphaPreserved === true &&
                    meta.transform.fittedFromExpectedPixels === false &&
                    sha(read(meta.producer.file)) === meta.producer.sha256 &&
                    Object.values(meta.modules).every((mod) => sha(read(mod.file)) === mod.sha256),
            );
            const wanted = needed.get(prefix);
            if (wanted)
                check(
                    prefix + '-required-successful-presentation',
                    equal(wanted, observation) && observation.pass === true,
                );
            const imageSample = imageSamples.find((sample) => sample.image.prefix === prefix);
            if (imageSample)
                check(
                    prefix + '-image-follows-the-real-tap',
                    observation.wanted === imageSample.event.color &&
                        observation.prefix.startsWith(imageSample.label + '-image-') &&
                        ms(observation.measuredAt) >= ms(taps[imageSample.event.taps - 1].finishedAt) &&
                        ms(observation.measuredAt) <= imageSample.actualWallStartMs + 15001,
                );
            plan.push({
                id: prefix,
                raw: relative(local(prefix + '.screen.png')),
                srgb: relative(local(prefix + '.screen-srgb.png')),
                metadata: relative(local(observation.colorMetadata)),
                icc: relative(local(prefix + '.screen-source.icc')),
                rawCrop: relative(local(prefix + '.screen-crop.png')),
                srgbCrop: relative(local(prefix + '.screen-srgb-crop.png')),
                bounds: observation.bounds,
            });
        }
        check(
            'all-required-photographs-present',
            [...needed.keys()].every((prefix) => m.observations.some((o) => o.prefix === prefix && o.pass === true)),
        );
        save('icc-inputs.json', plan);
        const output = execFileSync(m.colorRuntime.executable.file, [path.join(__dirname, 'replay-icc.py')], {
            cwd: root,
            windowsHide: true,
            timeout: 180000,
            maxBuffer: 1024 * 1024,
        });
        fs.writeFileSync(path.join(__dirname, 'icc-replay.stdout.txt'), output, { flag: 'wx' });
        const replay = json(path.join(__dirname, 'icc-replay.json'));
        check(
            'independent-littlecms-full-rgba-replay',
            replay.completed === true &&
                replay.pass === true &&
                replay.records.length === m.observations.length &&
                replay.records.every(
                    (r) =>
                        r.pass === true &&
                        r.wholeImagePixelsExact === true &&
                        r.rawCropPixelsExact === true &&
                        r.srgbCropPixelsExact === true,
                ),
            { images: replay.records.length, versions: replay.versions },
        );
        for (const row of replay.records) read(path.join(__dirname, row.replayedFile));
        const context = { runId: m.runId, crashAudit: m.crashAudit, stages: { continuous: { samples: m.samples } } };
        const findings = [],
            ownership = memory.consumeResources(context, directory, findings),
            measured = memory.consumeMemory(context, directory);
        const exceptions = memory.consumeJsExceptions(context, directory),
            rawLog = text('logcat.txt');
        counters.verifyBigIntLedger(ownership.snapshots);
        const partCount = counters.verifyPartProof(ownership.snapshots, rawLog.split(/\r?\n/), context);
        check(
            'real-pid-and-time-bound-part-accounting',
            equal(ownership, m.nativeOwnership) &&
                ownership.pass === true &&
                ownership.nativeCleanupLive === 0 &&
                ownership.canvasTextureMaximumOwned === 1 &&
                ownership.coverage.status === 'PASS' &&
                ownership.coverage.maximumEpochGapMs <= 15000 &&
                ownership.coverage.maximumNativeSteadyGapMs <= 15000 &&
                equal(exceptions, m.javascriptExceptions) &&
                exceptions.pass === true,
            {
                snapshots: ownership.snapshots.length,
                originalParts: partCount,
                finalNative: ownership.snapshots.at(-1).total,
                finalWrapper: ownership.snapshots.at(-1).wrapper,
            },
        );
        check(
            'first-physical-memory-baseline-only',
            equal(measured, m.memory) &&
                measured.samples.length >= 4 &&
                equal(
                    measured.samples.map((s) => s.sample),
                    memoryLabels,
                ),
            measured,
        );
        for (const sample of measured.samples) read(sample.evidence.file);
        if (measured.nativeHeapPssStrictlyIncreasing)
            findings.push({
                kind: 'native-heap-pss-increasing-at-all-four-observations',
                growthKiB: measured.nativeHeapPssGrowthKiB,
                meaning:
                    'First physical baseline observation remains open; no cross-device PSS comparison is performed',
            });
        check('open-findings-not-dropped', equal(findings, m.openFindings), findings);
        const rows = rawLog
            .split(/\r?\n/)
            .map((raw) => {
                const x = /^\s*(\d+\.\d+)\s+(\d+)\s+(\d+)\s+([VDIWEF])\s+([^:]+):\s?(.*)$/.exec(raw);
                return x && { epoch: +x[1], pid: +x[2], tag: x[5].trim(), message: x[6] };
            })
            .filter(Boolean)
            .filter(
                (row) =>
                    row.epoch >= m.crashAudit.lowerEpochSeconds && row.epoch < m.crashAudit.upperEpochSecondsExclusive,
            );
        const own = rows.filter((row) => row.pid === session.pid),
            markers = [
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
        const finish = own.find((row) => row.message.includes('EXIT_STAGE finish-request run=' + m.runId)),
            sdl = own.find((row) => row.tag === 'SDL' && /^Finished main function\s*$/.test(row.message));
        const exits = markers.map((marker) => own.find((row) => row.message.includes('EXIT_STAGE ' + marker)));
        const before = processTable(text('processes-before-finish.txt')),
            after = processTable(text('processes-after-stop.txt'));
        check(
            'real-nine-step-teardown-within-ten-seconds-and-context-zero',
            equal(json(local('native-exit.json')), m.nativeExit) &&
                m.nativeExit.code === 0 &&
                m.nativeExit.pid === session.pid &&
                m.nativeExit.error === '' &&
                exits.every(Boolean) &&
                finish &&
                sdl &&
                exits.every(
                    (row, index) => row.epoch >= finish.epoch && (!index || row.epoch >= exits[index - 1].epoch),
                ) &&
                sdl.epoch >= exits.at(-1).epoch &&
                (sdl.epoch - finish.epoch) * 1000 <= 10000 &&
                m.teardown.pass === true &&
                m.teardown.elapsedMs <= 10000 &&
                own.some((row) => row.message === 'SURFACE_CONTEXT_CLEANUP surface=0 window=0 contextWindowRefs=0'),
            { pid: session.pid, finishToSDLMainMs: finish && sdl && (sdl.epoch - finish.epoch) * 1000 },
        );
        check(
            'positive-live-negative-gone-and-physical-logcat-close',
            before.some((row) => row.pid === session.pid && row.name === 'com.mystral.engine.interop') &&
                !after.some(
                    (row) =>
                        row.pid === session.pid ||
                        row.name === 'com.mystral.engine.interop' ||
                        row.name.startsWith('com.mystral.engine.interop:'),
                ) &&
                m.processCleanup.pass === true &&
                m.processCleanup.pidGone === true &&
                m.processCleanup.nativeExitBeforeCleanup === true &&
                m.logcatShutdown.close.observed === true &&
                m.logcatShutdown.closedBeforeRequest === false &&
                m.logcatShutdown.killRequested === true &&
                m.logcatShutdown.elapsedMs <= 2000,
        );
        check(
            'bound-crash-audit-and-zero-v8-exceptions',
            m.crashAudit.pass === true &&
                m.crashAudit.nativePid === session.pid &&
                m.crashAudit.fatal.length === 0 &&
                m.crashAudit.logSha256 === sha(Buffer.from(rawLog)) &&
                exceptions.exceptions.length === 0,
        );
        for (const [file, digest] of Object.entries(evidence))
            if (sha(fs.readFileSync(path.resolve(root, file))) !== digest) throw Error('Audit input drift: ' + file);
        check('all-inputs-stable-through-offline-audit', true, { files: Object.keys(evidence).length });
        audit.summary = {
            heartbeats: samples.length,
            observedWindowMs: duration,
            imageSamples: imageSamples.length,
            replayedImages: plan.length,
            memorySamples: measured.samples.length,
            nativeCleanupLive: ownership.nativeCleanupLive,
            wrapperCleanupLive: ownership.wrapperCleanupLive,
            nativeHeapPssGrowthKiB: measured.nativeHeapPssGrowthKiB,
            totalPssGrowthKiB: measured.totalPssGrowthKiB,
            openFindings: findings,
        };
        audit.completed = true;
        audit.pass = true;
    } catch (error) {
        audit.error = String(error.stack || error);
    }
    audit.evidenceSha256 = evidence;
    audit.producer = { file: relative(__filename), sha256: sha(fs.readFileSync(__filename)) };
    audit.finishedAt = new Date().toISOString();
    audit.status = audit.pass ? 'PASS' : 'FAIL';
    save('report.json', audit);
    console.log(
        JSON.stringify({
            status: audit.status,
            checks: audit.checks.length,
            summary: audit.summary,
            error: audit.error,
        }),
    );
    process.exitCode = audit.pass ? 0 : 1;
}
const COMPONENT = 'com.mystral.engine.interop/com.mystral.engine.MystralActivity';
void main();
