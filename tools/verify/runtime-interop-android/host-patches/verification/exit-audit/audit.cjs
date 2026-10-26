// Independent read-only audit of the final APK10 build binding and final Android execution logs.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');

const root = path.resolve(__dirname, '../../..');
const output = __dirname;
const file = (relative) => path.join(root, relative);
const read = (relative) => JSON.parse(fs.readFileSync(file(relative), 'utf8'));
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileSha = (relative) => sha(fs.readFileSync(file(relative)));
const canonical = (value) =>
    JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en'))));
const save = (name, value) => {
    const target = path.join(output, name);
    if (fs.existsSync(target)) throw Error('Refusing to replace audit output ' + name);
    fs.writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
};
const candidate = 'output/runtime-interop/android-host-patch-candidate8';
const buildDirectory = 'output/runtime-interop/android-build-attempt-10';
const matrixDirectory = 'output/runtime-interop/android-matrix-final-20261025';
const demoDirectory = 'output/runtime-interop/android-demo-final-20261025';
const manifest = read(candidate + '/manifest.json');
const build = read(buildDirectory + '/build-report.json');
const before = read(buildDirectory + '/source-before.json');
const after = read(buildDirectory + '/source-after.json');
const compiled = read(buildDirectory + '/source-verified.json');
const matrix = read(matrixDirectory + '/report.json');
const demo = read(demoDirectory + '/report.json');
assert.equal(manifest.upstream.commit, 'bafab09d599bd55aeb7433ba7131c3f320334c99');
assert.equal(manifest.files.length, 22);
assert.equal(manifest.verification.passed, true);
assert.equal(fileSha(candidate + '/' + manifest.patch.file), manifest.patch.sha256);
assert.deepEqual(before, after);
assert.deepEqual(after, compiled);
assert.equal(build.compiled, true);
assert.equal(build.sourceInputsUnchanged, true);
assert.equal(build.signatureVerified, true);
assert.equal(matrix.hostBuild.sha256, fileSha(buildDirectory + '/build-report.json'));
assert.equal(matrix.hostBuild.compiledSourcesSha256, sha(Buffer.from(canonical(after))));
const comparisons = manifest.files.map((entry) => {
    const current = fileSha('output/runtime-interop/mystral-source/' + entry.path);
    const applied = fileSha(candidate + '/verification-checkout/' + entry.path);
    assert.equal(current, entry.modifiedSha256, entry.path + ' current source');
    assert.equal(applied, entry.modifiedSha256, entry.path + ' applied source');
    assert.equal(compiled[entry.path], entry.modifiedSha256, entry.path + ' compiled source');
    return {
        path: entry.path,
        candidateSha256: entry.modifiedSha256,
        currentSha256: current,
        cleanApplySha256: applied,
        compiledSha256: compiled[entry.path],
        matches: true,
    };
});
const apkSha256 = fileSha(buildDirectory + '/app-debug.apk');
assert.equal(apkSha256, build.apk.sha256);
assert.equal(matrix.apk.sha256, apkSha256);
assert.equal(demo.apkSha256, apkSha256);
assert.equal(matrix.installedSha256, apkSha256);
save('source-binding.json', {
    schema: 'android-final-source-binding-audit-v1',
    pass: true,
    candidate,
    patchSha256: manifest.patch.sha256,
    buildReceipt: buildDirectory + '/build-report.json',
    buildReceiptSha256: fileSha(buildDirectory + '/build-report.json'),
    compiledMapFiles: Object.keys(compiled).length,
    intersectionCount: comparisons.length,
    apkSha256,
    files: comparisons,
});

const requiredStages = [
    'shutdown-webgpu-return',
    'shutdown-window-enter',
    'shutdown-window-return',
    'shutdown-complete',
    'runtime-reset-return',
    'Native SDL_main ended code=0',
    'java-exit-notify-enter',
    'java-native-finished code=0',
    'NATIVE_FINISHED',
    'java-exit-notify-return',
    'Finished main function',
];
const time = (line) => {
    const match = /^\d\d-\d\d (\d\d):(\d\d):(\d\d)\.(\d+)/.exec(line);
    assert.ok(match);
    return Number(match[1]) * 3600000 + Number(match[2]) * 60000 + Number(match[3]) * 1000 + Number(match[4]);
};
function auditExit(directory, identity, requireSdlFinished) {
    const bytes = fs.readFileSync(file(directory + '/logcat.txt'));
    const lines = bytes.toString('utf8').split(/\r?\n/);
    const pid = identity.pid;
    const own = lines
        .map((text, index) => ({ text, index }))
        .filter((entry) => new RegExp('^\\d\\d-\\d\\d \\S+\\s+' + pid + '\\s+').test(entry.text));
    let previous = -1;
    const matched = [];
    for (const stage of requireSdlFinished ? requiredStages : requiredStages.slice(0, -1)) {
        const entry = own.find((row) => row.index > previous && row.text.includes(stage));
        assert.ok(entry, `${directory} missing ${stage}`);
        previous = entry.index;
        matched.push({ stage, line: entry.index + 1, text: entry.text });
    }
    const start = own.find((entry) => entry.text.includes('EXIT_STAGE finish-request'));
    assert.ok(start);
    let elapsed = time(matched.find((row) => row.stage === 'Native SDL_main ended code=0').text) - time(start.text);
    if (elapsed < 0) elapsed += 24 * 3600000;
    assert.ok(elapsed >= 0 && elapsed <= 10000);
    const kill = lines
        .map((text, index) => ({ text, index }))
        .find(
            (entry) => entry.index > previous && entry.text.includes('Killing ' + pid + ':com.mystral.engine.interop'),
        );
    assert.ok(kill, directory + ': physical stop must occur after native return');
    assert.equal(identity.code, 0);
    assert.equal(identity.error, '');
    return {
        pid,
        nativeExitCode: 0,
        finishToNativeEndedMs: elapsed,
        log: directory + '/logcat.txt',
        logSha256: sha(bytes),
        orderedStages: matched,
        physicalStopAfterNativeReturn: { line: kill.index + 1, text: kill.text },
    };
}
assert.equal(matrix.status, 'PASS');
assert.equal(matrix.completed, true);
assert.equal(matrix.pass, true);
assert.deepEqual(
    matrix.cases.map((entry) => entry.caseId),
    ['probes', 'air', 'pbr', 'skin', 'ui', 'compute'],
);
const matrixRows = matrix.cases.map((entry) => {
    assert.equal(entry.pass, true);
    assert.equal(entry.pidGone, true);
    assert.equal(entry.nativeExit.pid, entry.session.pid);
    const native = read(`${matrixDirectory}/${entry.caseId}/native-exit.json`);
    assert.deepEqual(native, entry.nativeExit);
    return { caseId: entry.caseId, runId: entry.runId, ...auditExit(matrixDirectory, native, true) };
});
save('matrix-exit-log-audit.json', {
    schema: 'android-final-matrix-exit-log-audit-v1',
    pass: true,
    report: matrixDirectory + '/report.json',
    reportSha256: fileSha(matrixDirectory + '/report.json'),
    apkSha256,
    cases: matrixRows,
});

assert.equal(demo.status, 'PASS');
assert.equal(demo.pass, true);
assert.equal(demo.application.schema, 'air-android-demo-v1');
assert.equal(demo.application.scope, 'interactive-startup-only');
assert.equal(demo.application.caseId, 'demo');
assert.equal(demo.application.ready, true);
assert.deepEqual(demo.application.gpuErrors, []);
assert.equal(demo.input1.isTrusted, true);
assert.equal(demo.input2.isTrusted, true);
assert.equal(demo.input1.taps, 1);
assert.equal(demo.input2.taps, 2);
assert.ok(demo.input2.frames > demo.input1.frames);
assert.deepEqual(demo.input1.gpuErrors, []);
assert.deepEqual(demo.input2.gpuErrors, []);
assert.ok(demo.resumedLifecycle.some((entry) => entry.event === 'pause'));
assert.ok(demo.resumedLifecycle.filter((entry) => entry.event === 'resume').length >= 2);
assert.ok(demo.resumePixels.orange >= 64);
assert.equal(fileSha(demoDirectory + '/resume.screen-crop.png'), demo.resumePixels.sha256);
const demoExit = auditExit(demoDirectory, demo.nativeExit, false);
save('demo-audit.json', {
    schema: 'android-final-demo-audit-v1',
    pass: true,
    report: demoDirectory + '/report.json',
    reportSha256: fileSha(demoDirectory + '/report.json'),
    apkSha256,
    scope: 'Interactive startup, two trusted taps, same-surface pause/resume and native shutdown; not rotation/surface-recreation acceptance',
    input1: demo.input1,
    input2: demo.input2,
    resumedLifecycle: demo.resumedLifecycle,
    exit: demoExit,
});
const summary = {
    schema: 'android-final-independent-audit-v1',
    pass: true,
    producerSha256: sha(fs.readFileSync(__filename)),
    apkSha256,
    candidatePatchSha256: manifest.patch.sha256,
    sourceFilesCompared: comparisons.length,
    compiledMapFiles: Object.keys(compiled).length,
    matrixCases: matrixRows.map(({ caseId, pid, finishToNativeEndedMs }) => ({ caseId, pid, finishToNativeEndedMs })),
    demoExitPid: demoExit.pid,
    demoFinishToNativeEndedMs: demoExit.finishToNativeEndedMs,
    records: ['source-binding.json', 'matrix-exit-log-audit.json', 'demo-audit.json'].map((name) => ({
        file: name,
        sha256: sha(fs.readFileSync(path.join(output, name))),
    })),
};
save('report.json', summary);
console.log(JSON.stringify(summary, null, 2));
