/* Independent retained-source and raw-exit audit. Never starts a device or changes an input. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { parseProcessTable, isPackageProcess } = require('../android-phone-process-table.cjs');
const root = process.cwd(),
    out = __dirname,
    runtime = path.resolve('output/runtime-interop');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(root, file).replace(/\\/g, '/');
const record = (file) => ({ file: relative(file), sha256: sha256(fs.readFileSync(file)) });
const manifest = JSON.parse(fs.readFileSync(path.join(out, 'manifest.json')));
const sourceFiles = manifest.files.map((row) => path.join(runtime, 'mystral-source', row.file));
const before = sourceFiles.map(record);
const compiled = [];
for (const folder of ['android-16k-arm64-build-attempt-1', 'android-16k-x64-build-attempt-1']) {
    const directory = path.join(runtime, folder),
        read = (file) => JSON.parse(fs.readFileSync(path.join(directory, file)));
    const build = read('build-report.json'),
        first = read('source-before.json'),
        after = read('source-after.json');
    assert.deepEqual(first, after);
    assert(build.compiled === true && build.sourceInputsUnchanged === true && build.sdlVersion === '3.2.30');
    const files = manifest.files.map((row) => {
        assert.equal(first[row.file], row.afterSha256);
        for (const prefix of ['modified-source', 'fresh-base'])
            assert.equal(sha256(fs.readFileSync(path.join(out, prefix, row.file))), row.afterSha256);
        assert.equal(sha256(fs.readFileSync(path.join(runtime, 'mystral-source', row.file))), row.afterSha256);
        return { file: row.file, sha256: row.afterSha256, matches: true };
    });
    compiled.push({
        abi: build.abi,
        build: record(path.join(directory, 'build-report.json')),
        sourceMap: record(path.join(directory, 'source-after.json')),
        files,
    });
}
const stagePatterns = [
    /EXIT_STAGE finish-request .* outcome=0$/,
    /EXIT_STAGE runtime-run-return\b/,
    /EXIT_STAGE reported-outcome-return value=0$/,
    /EXIT_STAGE runtime-reset-enter\b/,
    /EXIT_STAGE shutdown-webgpu-return\b/,
    /EXIT_STAGE shutdown-window-enter\b/,
    /EXIT_STAGE shutdown-window-return\b/,
    /EXIT_STAGE shutdown-complete\b/,
    /EXIT_STAGE runtime-reset-return\b/,
    /Native SDL_main ended code=0 error=$/,
    /EXIT_STAGE java-exit-notify-enter\b/,
    /EXIT_STAGE java-native-finished code=0 activity=true server=true$/,
    /NATIVE_FINISHED \{/,
    /EXIT_STAGE java-exit-notify-return\b/,
    /Finished main function$/,
];
const time = (raw) => {
    const match = /^(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\.(\d{3})/.exec(raw);
    assert(match, 'Missing original log timestamp');
    return Date.UTC(
        2026,
        Number(match[1]) - 1,
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6]),
    );
};
const matrices = [];
for (const folder of ['android-16k-matrix-attempt-2', 'android-sdl330-4k-regression-attempt-1']) {
    const directory = path.join(runtime, folder),
        reportFile = path.join(directory, 'report.json');
    const report = JSON.parse(fs.readFileSync(reportFile));
    assert(
        report.pass === true &&
            report.completed === true &&
            report.inputsUnchanged === true &&
            report.cases.length === 6,
    );
    assert.deepEqual(
        report.cases.map((row) => row.caseId).sort(),
        ['probes', 'air', 'pbr', 'skin', 'ui', 'compute'].sort(),
    );
    const lines = fs.readFileSync(path.join(directory, 'logcat.txt'), 'utf8').split(/\r?\n/);
    const parsed = lines.map((raw, index) => ({
        raw,
        line: index + 1,
        pid: Number(/^\S+\s+\S+\s+(\d+)\s+/.exec(raw)?.[1]),
    }));
    const cases = report.cases.map((row) => {
        const pid = row.session.pid,
            own = parsed.filter((line) => line.pid === pid);
        let next = 0;
        const stages = stagePatterns.map((pattern) => {
            const found = own.slice(next).findIndex((line) => pattern.test(line.raw));
            assert(found >= 0, folder + '/' + row.caseId + ' missing ordered ' + pattern);
            next += found;
            const selected = own[next++];
            return { line: selected.line, raw: selected.raw };
        });
        assert.equal(own.filter((line) => /Native SDL_main ended/.test(line.raw)).length, 1);
        const native = JSON.parse(
            stages.find((stage) => /NATIVE_FINISHED \{/.test(stage.raw)).raw.match(/NATIVE_FINISHED (\{.*\})/)[1],
        );
        assert.deepEqual(native, row.nativeExit);
        assert.equal(native.pid, pid);
        assert.equal(native.code, 0);
        assert.equal(native.error, '');
        const returnedAt = stages.at(-1).line,
            requestedAt = stages[0].line;
        const elapsed = time(stages.at(-1).raw) - time(stages[0].raw);
        assert(elapsed >= 0 && elapsed < 10000, 'Original ten-second native-exit budget exceeded');
        const forced = /ActivityManager: Force stopping com\.mystral\.engine\.interop\b/;
        assert(
            !parsed.some((line) => line.line >= requestedAt && line.line <= returnedAt && forced.test(line.raw)),
            'Process was force-stopped before native/SDL returned',
        );
        const stop = parsed.find((line) => line.line > returnedAt && forced.test(line.raw));
        assert(stop, 'No retained subsequent dedicated-package stop');
        const liveFile = path.join(directory, row.caseId, 'process-table-before-finish.txt');
        const deadFile = path.join(directory, row.caseId, 'process-table-after-stop.txt');
        assert(
            parseProcessTable(fs.readFileSync(liveFile, 'utf8')).some(
                (process) => process.pid === pid && process.name === 'com.mystral.engine.interop',
            ),
        );
        assert(
            !parseProcessTable(fs.readFileSync(deadFile, 'utf8')).some((process) =>
                isPackageProcess(process, 'com.mystral.engine.interop'),
            ),
        );
        assert(row.pidGone === true && row.processCheckCompleted === true && row.pidGoneCheck.connected === true);
        return {
            caseId: row.caseId,
            pid,
            exitElapsedMs: elapsed,
            stages,
            laterForceStop: { line: stop.line, raw: stop.raw },
            nativeExit: record(path.join(directory, row.caseId, 'native-exit.json')),
            liveProcessTable: record(liveFile),
            afterStopProcessTable: record(deadFile),
            pass: true,
        };
    });
    matrices.push({
        report: record(reportFile),
        log: record(path.join(directory, 'logcat.txt')),
        pageSize: report.device.pageSize,
        apkSha256: report.apk.sha256,
        cases,
    });
}
assert.equal(matrices[0].apkSha256, matrices[1].apkSha256);
const historyFile = path.join(runtime, 'android-16k-matrix-attempt-1/report.json');
const history = JSON.parse(fs.readFileSync(historyFile));
assert.equal(history.status, 'FAIL');
const admissionFile = path.join(runtime, 'android-16k-env-1/immersive-admission.json');
const admission = JSON.parse(fs.readFileSync(admissionFile));
assert(
    admission.package === 'com.android.systemui' &&
        admission.text === 'Got it' &&
        admission.changesPageSizeCompatibility === false &&
        admission.ordinaryUiAcknowledgement === true,
);
assert.deepEqual(sourceFiles.map(record), before);
const audit = {
    schema: 'mystral-sdl330-source-and-native-exit-audit-v1',
    pass: true,
    status: 'PASS',
    adbExecuted: false,
    base: manifest.base,
    patchSha256: manifest.patch.sha256,
    compiledProfiles: compiled,
    rawExitMatrices: matrices,
    historicalFailurePreserved: {
        report: record(historyFile),
        status: history.status,
        failedCases: history.cases.filter((row) => !row.pass).map((row) => row.caseId),
    },
    ordinaryFullscreenAdmission: { ...admission, retainedFile: record(admissionFile) },
    sourceInputsUnchanged: true,
    producer: record(__filename),
    scope: 'Six-file source identities and twelve actual shutdown/SDL-return timelines only. Pixel and full environment auditing is separate.',
};
fs.writeFileSync(path.join(out, 'source-and-exit-audit.json'), JSON.stringify(audit, null, 2) + '\n', { flag: 'wx' });
console.log(
    JSON.stringify({
        status: audit.status,
        compiledProfiles: compiled.map((row) => row.abi),
        matrices: matrices.map((row) => ({
            pageSize: row.pageSize,
            cases: row.cases.map((entry) => ({ id: entry.caseId, pid: entry.pid, exitElapsedMs: entry.exitElapsedMs })),
        })),
    }),
);
