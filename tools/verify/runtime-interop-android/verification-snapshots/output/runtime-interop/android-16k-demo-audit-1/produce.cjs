/* Small offline audit of supplemental interactive demo evidence, not a new runtime campaign. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual: equal } = require('node:util');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '../../..');
const dir = 'output/runtime-interop/android-16k-demo-attempt-2';
const output = path.join(__dirname, 'report.json');
if (fs.existsSync(output)) throw Error('Preserve the existing audit; use a new attempt');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const evidence = {};
const read = (file) => {
    const data = fs.readFileSync(path.resolve(root, file));
    evidence[file.replaceAll('\\', '/')] = sha(data);
    return data;
};
const json = (file) => JSON.parse(read(file));
const report = {
    schema: 'air-16k-supplemental-demo-independent-audit-v1',
    startedAt: new Date().toISOString(),
    scope: 'Supplemental ordinary demo on the same x64 16 KB emulator/APK only; main 107-check audit unchanged.',
    noDeviceOperations: true,
    noInputMutations: true,
    checks: [],
    completed: false,
    pass: false,
    releaseReady: false,
    arm64Runtime: 'NOT_RUN',
};
const check = (name, pass, details) =>
    report.checks.push({ name, pass: !!pass, ...(details === undefined ? {} : { details }) });
function colors(bytes) {
    const p = PNG.sync.read(bytes);
    let orange = 0,
        green = 0,
        blue = 0;
    for (let i = 0; i < p.data.length; i += 4) {
        const [r, g, b] = p.data.subarray(i, i + 3);
        if (r > g + 50 && r > b + 50) orange++;
        if (g > r + 50 && g > b + 50) green++;
        if (b > r + 20 && b > g + 10) blue++;
    }
    return { width: p.width, height: p.height, orange, green, blue, sha256: sha(bytes) };
}
function cropExact(raw, crop, bounds) {
    const a = PNG.sync.read(raw),
        b = PNG.sync.read(crop),
        { x, y, width, height } = bounds;
    if (
        ![x, y, width, height].every(Number.isInteger) ||
        x < 0 ||
        y < 0 ||
        x + width > a.width ||
        y + height > a.height ||
        b.width !== width ||
        b.height !== height
    )
        return false;
    const target = new PNG({ width, height });
    PNG.bitblt(a, target, x, y, width, height, 0, 0);
    return target.data.equals(b.data);
}
try {
    const r = json(dir + '/report.json'),
        session = json(dir + '/session.json'),
        ready = json(dir + '/state-ready.json');
    const mainFile = 'output/runtime-interop/android-16k-final-audit-1/report.json';
    const main = json(mainFile),
        matrix = json('output/runtime-interop/android-16k-matrix-attempt-2/report.json');
    const toolFile = 'output/runtime-interop/android-16k-demo-verify-v1.cjs',
        tool = read(toolFile).toString();
    check(
        'same fixed APK and unchanged main evidence',
        main.pass &&
            main.completed &&
            main.checks.length === 107 &&
            sha(read(mainFile)) === '9ed6edcc521cd4ffce40c7271348ab8fa81c3bceecd70607408e1dc820edf8fc' &&
            r.apkSha256 === matrix.apk.sha256 &&
            sha(read(matrix.apk.file)) === r.apkSha256 &&
            Object.entries(matrix.inputs).every(([p, h]) => sha(read(p)) === h),
    );
    check(
        'actual source hash and 16 KB startup identity',
        r.pass === true &&
            r.status === 'PASS' &&
            r.releaseReady === false &&
            r.physicalAcceptance === false &&
            sha(Buffer.from(tool)) === r.toolSha256 &&
            r.memoryPageBytes === 16384 &&
            r.compat.linker === 'fatal' &&
            r.compat.pmDisabled === 'true' &&
            session.runId === r.runId &&
            session.caseId === 'demo' &&
            ready.session.pid === session.pid &&
            ready.runtime.loadedABI === 'x86_64' &&
            ready.runtime.v8StartupMode === 'embedded' &&
            ready.runtime.v8Version === '11.6.189.22' &&
            ready.runtime.nativeStarted === true,
    );
    check(
        'real AIR startup and two trusted OS input effects',
        r.application.ready &&
            r.application.pass &&
            r.application.frames >= 3 &&
            r.application.gpuErrors.length === 0 &&
            r.application.color === 'orange' &&
            r.input1.isTrusted === true &&
            r.input1.type === 'mousedown' &&
            r.input1.taps === 1 &&
            r.input1.color === 'green' &&
            Math.abs(r.input1.clientX - 160) <= 1 &&
            Math.abs(r.input1.clientY - 120) <= 1 &&
            r.input2.isTrusted === true &&
            r.input2.type === 'mousedown' &&
            r.input2.taps === 2 &&
            r.input2.color === 'orange' &&
            r.input2.frames > r.input1.frames &&
            r.input1.gpuErrors.length === 0 &&
            r.input2.gpuErrors.length === 0,
    );
    const events = read(dir + '/events.jsonl')
        .toString()
        .trim()
        .split(/\r?\n/)
        .map((s) => JSON.parse(s));
    check(
        'raw input records match the aggregate',
        events.some((e) => equal(e, r.input1)) && events.some((e) => equal(e, r.input2)),
    );
    let before;
    for (const [index, wanted] of ['orange', 'green'].entries()) {
        const capture = r.captures[index],
            m = capture.metadata,
            phase = index ? 'after' : 'before';
        const pc = read(dir + '/' + m.file),
            raw = read(dir + '/' + phase + '.screen.png'),
            crop = read(dir + '/' + phase + '.screen-crop.png');
        const one = colors(pc),
            two = colors(crop);
        check(
            phase + ' exact independent presentation and fixed original thresholds',
            capture.pass &&
                equal(one, capture.surface) &&
                equal(two, capture.compositor) &&
                [one, two].every((v) => v.width === 320 && v.height === 240 && v[wanted] > 1000 && v.blue > 30000) &&
                sha(pc) === m.sha256 &&
                m.pid === session.pid &&
                m.runId === session.runId &&
                m.phase === phase &&
                m.channel === 'android-pixelcopy' &&
                m.resultCode === 0 &&
                m.surfaceGeneration === 1 &&
                cropExact(raw, crop, m.bounds),
        );
        if (index)
            check(
                'before/after same surface pair',
                m.previous.sha256 === before.sha256 &&
                    m.previous.file === before.file &&
                    m.previous.pid === session.pid &&
                    m.previous.surfaceGeneration === before.surfaceGeneration &&
                    equal(m.bounds, before.bounds),
            );
        before = m;
    }
    const boundary = json(dir + '/material-paint-boundary.json');
    check(
        'every retained paint-wait sample exactly recomputes',
        equal(boundary, r.materialPaintBoundary) &&
            boundary.samples.length > 0 &&
            boundary.samples.every((sample, i) => {
                const raw = read(dir + '/paint-wait-' + i + '.screen.png'),
                    crop = read(dir + '/paint-wait-' + i + '.crop.png');
                return (
                    sample.index === i &&
                    equal(colors(crop), Object.fromEntries(Object.entries(sample).filter(([k]) => k !== 'index'))) &&
                    cropExact(raw, crop, before.bounds)
                );
            }) &&
            boundary.samples.at(-1).green > 1000 &&
            boundary.samples.at(-1).blue > 30000,
    );
    check(
        'paint readiness precedes independent after capture without changing thresholds',
        tool.indexOf('const end = Date.now() + timeout;') < tool.indexOf('while (Date.now() < end)') &&
            tool.includes('}, 2000);') &&
            tool.indexOf("await capture('after', 'green')") > tool.indexOf('const paintSamples = []') &&
            tool.includes('v[wanted] > 1000 && v.blue > 30000'),
    );
    const lifecycle = read(dir + '/lifecycle.jsonl')
        .toString()
        .trim()
        .split(/\r?\n/)
        .map((s) => JSON.parse(s));
    const pause = lifecycle.find((e) => e.event === 'pause'),
        resume = lifecycle.find((e) => e.event === 'resume' && e.elapsedRealtime > pause?.elapsedRealtime);
    check(
        'HOME resume retains the same PID and surface generation',
        equal(lifecycle, r.resumedLifecycle) &&
            pause &&
            resume &&
            lifecycle.every((e) => e.pid === session.pid) &&
            pause.surfaceGeneration === 1 &&
            resume.surfaceGeneration === 1 &&
            !lifecycle.some((e) => e.event === 'surface-destroyed') &&
            lifecycle.filter((e) => e.event === 'surface-created').length === 1,
    );
    const resumeRaw = read(dir + '/resume.screen.png'),
        resumeCrop = read(dir + '/resume.screen-crop.png'),
        resumeColors = colors(resumeCrop);
    check(
        'actual resumed orange material presentation',
        cropExact(resumeRaw, resumeCrop, before.bounds) &&
            equal(resumeColors, r.resumePixels) &&
            resumeColors.width === 320 &&
            resumeColors.height === 240 &&
            resumeColors.orange > 1000 &&
            resumeColors.blue > 30000,
    );
    const log = read(dir + '/logcat.txt').toString(),
        lines = log.split(/\r?\n/).filter((s) => new RegExp(`^\\S+\\s+\\S+\\s+${session.pid}\\s+`).test(s));
    const native = lines.find((s) => s.includes('NATIVE_FINISHED '));
    check(
        'normal native return corroborated by raw shutdown log',
        r.nativeExit.pid === session.pid &&
            r.nativeExit.code === 0 &&
            !r.nativeExit.error &&
            native &&
            equal(JSON.parse(native.slice(native.indexOf('NATIVE_FINISHED ') + 16)), r.nativeExit) &&
            [
                'shutdown-complete',
                'runtime-reset-return',
                'Native SDL_main ended code=0 error=',
                'java-exit-notify-return',
            ].every((needle) => lines.some((s) => s.includes(needle))),
    );
    const table = read(dir + '/process-table-after-stop.txt')
        .toString()
        .trim()
        .split(/\r?\n/);
    const header = table.shift(),
        rows = table.map((line) => /^\s*(\d+)\s+(.+?)\s*$/.exec(line));
    check(
        'retained physical process table confirms cleanup',
        /^\s*PID\s+NAME\s*$/.test(header) &&
            rows.length > 0 &&
            rows.every(Boolean) &&
            !rows.some(
                (p) =>
                    Number(p[1]) === session.pid ||
                    p[2] === 'com.mystral.engine.interop' ||
                    p[2].startsWith('com.mystral.engine.interop:'),
            ),
    );
    const old = json('output/runtime-interop/android-16k-demo-attempt-1/report.json');
    check(
        'original orange-after failure remains retained',
        old.status === 'FAIL' && old.pass === false && /after actual material color failed/.test(old.error),
    );
    report.sourceBinding = {
        toolFile,
        sha256: r.toolSha256,
        apkSha256: r.apkSha256,
        currentMainInputCount: Object.keys(matrix.inputs).length,
    };
    report.paintWaitSamples = boundary.samples;
    report.limitations = [
        'Supplemental demo schema has no general completed/inputs/finalCompat records. The tool SHA, exact APK, current unchanged main inputs and retained raw observations bind this audit; the main 107 checks remain the formal matrix contract.',
        'The paint polling deadline is computed once as 2000 ms, but synchronous ADB calls have a 15000 ms command timeout and no post-callback deadline check. This is not a hard two-second screenshot-duration proof. The retained sample0 already showed green.',
        'Initial compatibility values are recorded; the producer performs a fail-closed final check, but does not retain separate final property values in this supplemental report.',
        'The log filter excludes SDL Finished main function. Demo native return is independently corroborated by NATIVE_FINISHED and completed runtime/Java notification stages; the main matrix separately retains SDL Finished.',
        'HOME/resume preserved PID and generation=1. No Surface destruction/recreation, process restoration, physical ARM64 or release acceptance is established.',
    ];
    report.completed = true;
    report.pass = report.checks.every((c) => c.pass);
} catch (error) {
    report.error = String(error.stack || error);
}
report.failedChecks = report.checks.filter((c) => !c.pass);
report.evidenceFilesSha256 = evidence;
report.producer = {
    file: path.relative(root, __filename).replaceAll('\\', '/'),
    sha256: sha(fs.readFileSync(__filename)),
};
report.finishedAt = new Date().toISOString();
report.status = report.pass ? 'PASS' : 'FAIL';
fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
console.log(
    JSON.stringify(
        {
            status: report.status,
            completed: report.completed,
            checks: report.checks.length,
            failedChecks: report.failedChecks,
            error: report.error,
            evidenceFiles: Object.keys(evidence).length,
            report: path.relative(root, output).replaceAll('\\', '/'),
        },
        null,
        2,
    ),
);
if (!report.pass) process.exitCode = 1;
