/* Bounded native API probe runner. New output only, with exact source/EXE/fixture identities and physical process close. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../../..');
const out = path.join(__dirname, 'probe-attempt-1');
fs.mkdirSync(out);
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const save = (name, value) => fs.writeFileSync(path.join(out, name),
    typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const buildBytes = fs.readFileSync(path.join(__dirname, 'build-report.json'));
const build = JSON.parse(buildBytes);
const source = path.resolve(root, build.source);
const currentSources = () => Object.fromEntries(Object.keys(build.sourceAfter).sort().map((file) =>
    [file, hash(fs.readFileSync(path.join(source, file)))]));
const report = { schema: 'air-native-resource-ownership-run-v1', startedAt: new Date().toISOString(),
    nativePlatform: 'Windows x64 V8+Dawn', operationBudgetMs: 90000, completed: false, pass: false,
    subset: true, releaseReady: false, sourceBuild: { file: path.relative(root, path.join(__dirname, 'build-report.json')),
        sha256: hash(buildBytes) }, limitations: ['Native API ownership probe only; no browser/Android, image presentation or performance acceptance', 'Windows CLI calls ExitProcess without Runtime destruction; runtime cleanup is NOT_RUN, never inferred from process exit'] };
let child, timer, ended = false;
const stdout = [], stderr = [];
const sourceBefore = currentSources();
const fixture = path.resolve(root, build.probe.file);
const executable = path.resolve(root, build.executable.file);
try {
    if (!build.compiled || !build.sourceInputsUnchanged ||
        JSON.stringify(sourceBefore) !== JSON.stringify(build.sourceAfter) ||
        hash(fs.readFileSync(fixture)) !== build.probe.sha256 ||
        hash(fs.readFileSync(executable)) !== build.executable.sha256) throw Error('Frozen candidate differs before the probe');
    report.fixture = build.probe;
    report.executable = build.executable;
    report.arguments = ['run', fixture, '--headless', '--width', '320', '--height', '240'];
    save('source-before.json', sourceBefore);
    child = spawn(executable, report.arguments, { cwd: out, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    report.pid = child.pid;
    report.spawnedAt = new Date().toISOString();
    child.stdout.on('data', (bytes) => stdout.push(bytes));
    child.stderr.on('data', (bytes) => stderr.push(bytes));
    child.once('error', (error) => { report.spawnError = String(error); });
    child.once('exit', (code, signal) => {
        report.exit = { code, signal, measuredAt: new Date().toISOString() };
    });
    timer = setTimeout(() => {
        if (!ended) {
            report.timedOut = true;
            report.timeoutKillRequested = child.kill('SIGKILL');
        }
    }, 90000);
    child.once('close', (code, signal) => {
        ended = true;
        clearTimeout(timer);
        report.close = { code, signal, measuredAt: new Date().toISOString(), observed: true };
        const output = Buffer.concat(stdout), errors = Buffer.concat(stderr);
        save('stdout.txt', output); save('stderr.txt', errors);
        try {
            const lines = output.toString('utf8').split(/\r?\n/);
            const markers = lines.filter((line) => /^(?:\[log\] )?AIR_RESOURCE_OWNERSHIP_RESULT /.test(line));
            if (markers.length !== 1) throw Error('Expected exactly one native result marker');
            report.result = JSON.parse(markers[0].slice(markers[0].indexOf('AIR_RESOURCE_OWNERSHIP_RESULT ') + 'AIR_RESOURCE_OWNERSHIP_RESULT '.length));
            report.resourceSnapshots = lines.filter((line) => line.startsWith('RESOURCE_SNAPSHOT '))
                .map((line) => JSON.parse(line.slice('RESOURCE_SNAPSHOT '.length)));
            const cleanup = report.resourceSnapshots.filter((value) => value.stage === 'cleanup');
            report.runtimeTeardown = 'NOT_RUN_BY_WINDOWS_CLI_EXITPROCESS';
            report.resourceCleanup = cleanup.length === 0 ? null : cleanup.length === 1 && cleanup[0].total.live === 0 &&
                cleanup[0].total.acquired === cleanup[0].total.released &&
                Object.values(cleanup[0].types).every((value) => value.live === 0 && value.acquired === value.released);
            const sourceAfter = currentSources();
            save('source-after.json', sourceAfter);
            report.inputsUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter) &&
                hash(fs.readFileSync(fixture)) === build.probe.sha256 &&
                hash(fs.readFileSync(executable)) === build.executable.sha256;
            try { process.kill(report.pid, 0); report.pidGone = false; }
            catch (error) { report.pidGone = error.code === 'ESRCH'; }
            report.completed = true;
            report.pass = code === 0 && signal === null && report.exit?.code === 0 && !report.timedOut &&
                !report.spawnError && report.result.completed === true && report.result.pass === true &&
                report.result.checks.length === 8 && report.result.checks.every((value) => value.pass === true) &&
                report.result.uncapturedErrors.length === 0 && report.result.subsequentOrdinaryFrameCompleted === true && report.inputsUnchanged && report.pidGone;
        } catch (error) { report.error = String(error.stack || error); }
        report.finishedAt = new Date().toISOString();
        report.status = report.pass ? 'PASS_API_SCOPE_ONLY' : 'FAIL';
        save('report.json', report);
        console.log(JSON.stringify({ status: report.status, exit: report.exit, result: report.result,
            nativeResourceCleanup: report.resourceCleanup, inputsUnchanged: report.inputsUnchanged, pidGone: report.pidGone,
            report: path.relative(root, path.join(out, 'report.json')) }));
        process.exitCode = report.pass ? 0 : 1;
    });
} catch (error) {
    report.error = String(error.stack || error);
    report.finishedAt = new Date().toISOString(); report.status = 'FAIL';
    save('report.json', report); console.error(report.error); process.exitCode = 1;
}
