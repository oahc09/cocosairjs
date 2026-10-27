/* Closed ARM64 phone matrix audit. Original APK, source, raw images and reports are read-only. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual: equal } = require('node:util');
const JSZip = require('jszip');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '../../..');
const base = 'output/runtime-interop/android-arm64-memory-matrix-attempt-1';
const native = 'output/runtime-interop/mystral-source';
const buildDir = 'output/runtime-interop/android-memory-arm64-build-attempt-1';
const python = 'C:/Users/caosh/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/python.exe';
const { sourceBinding, probesPassed, verifyPresentation } = require(path.join(root, 'tools/verify/runtime-interop.cjs'));
const { SCENE_IDS, scenePassed } = require(path.join(root, 'tools/verify/runtime-interop/scene-contract.cjs'));
const { verifyScenePresentation } = require(path.join(root, 'tools/verify/runtime-interop/scene-oracles.cjs'));
const elf = require(path.join(root, 'output/runtime-interop/android-16k-collector-v1.cjs'));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const evidence = {};
const read = (file) => {
    const absolute = path.resolve(root, file), data = fs.readFileSync(absolute);
    const name = path.relative(root, absolute).replaceAll('\\', '/');
    if (evidence[name] && evidence[name] !== sha(data)) throw Error('Evidence changed: ' + name);
    evidence[name] = sha(data); return data;
};
const json = (file) => JSON.parse(read(file).toString('utf8').replace(/^\uFEFF/, ''));
const save = (name, value) => fs.writeFileSync(path.join(__dirname, name), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
const audit = { schema: 'air-arm64-memory-candidate-matrix-audit-v1', startedAt: new Date().toISOString(),
    completed: false, pass: false, deviceOperations: false, inputMutations: false, subset: true, releaseReady: false,
    scope: 'Current ARM64 candidate, V2520A/API37/4096-byte physical-phone six-case functional matrix', checks: [], captures: [], cases: [],
    limitations: ['Actual 16KB ARM64 runtime NOT_RUN', 'No phone long-run, lifecycle recreation, power or performance acceptance from this six-case matrix',
        'Functional matrix is not a claim that every native allocation is leak-free'] };
const check = (id, value, observations) => {
    audit.checks.push({ id, pass: !!value, observations });
    if (!value) throw Error(id);
};
function table(file) {
    const lines = read(file).toString().trim().split(/\r?\n/);
    if (!/^\s*PID\s+NAME\s*$/.test(lines.shift()) || !lines.length) throw Error('Incomplete retained process table');
    return lines.map((line) => { const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line); if (!m || !Number.isSafeInteger(+m[1]) || +m[1] <= 0) throw Error('Invalid PID row'); return { pid: +m[1], name: m[2] }; });
}
function cropMatches(fullBytes, bounds, cropBytes) {
    const a = PNG.sync.read(fullBytes), b = PNG.sync.read(cropBytes);
    const { x, y, width, height } = bounds;
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width !== 320 || height !== 240 || x + width > a.width || y + height > a.height || b.width !== width || b.height !== height) return false;
    const out = new PNG({ width, height }); PNG.bitblt(a, out, x, y, width, height, 0, 0); return out.data.equals(b.data);
}
function time(line) {
    const m = /^(\d+)-(\d+)\s+(\d+):(\d+):(\d+)\.(\d+)/.exec(line);
    return m ? Date.UTC(2026, +m[1] - 1, +m[2], +m[3], +m[4], +m[5], +m[6]) : NaN;
}
async function main() {
    try {
        read(__filename); read(path.relative(root, path.join(__dirname, 'replay-icc.py')));
        const m = json(base + '/report.json'), b = json(buildDir + '/build-report.json');
        check('complete-current-physical-matrix', m.completed === true && m.pass === true && m.status === 'PASS' &&
            m.physicalAcceptance === true && m.simulatorAcceptance === false && m.device.emulator === false && m.device.qemu === '' &&
            m.serial === '10CG4G0BE1003M8' && m.device.model === 'V2520A' && m.device.api === 37 && equal(m.device.abiList, ['arm64-v8a']) &&
            m.device.nativeBridge === '0' && m.device.pageSize === 4096 && m.expectedPageSize === 4096 &&
            m.functional4kOnly === true && m.page16kRuntimeAcceptance === false && m.subset === true && m.releaseReady === false &&
            equal(m.cases.map((c) => c.caseId), ['probes', 'air', ...SCENE_IDS]), { device: m.device, cases: m.cases.map((c) => c.caseId) });
        check('current-inputs-match-start-and-recorded-end', m.inputsUnchanged === true &&
            Object.entries(m.inputs).every(([file, digest]) => sha(read(file)) === digest), { count: Object.keys(m.inputs).length,
                note: 'Collector retains the initial map and end-stability verdict; this audit independently rehashes every original input.' });
        const sources = json(buildDir + '/source-verified.json');
        check('all-current-116-native-inputs-and-memory-source-package', Object.keys(sources).length === 116 &&
            equal(sources, json(buildDir + '/source-before.json')) && equal(sources, json(buildDir + '/source-after.json')) &&
            equal(sources, json('tools/verify/runtime-interop-android/host-patches/memory/compiled-source/source-verified.json')) &&
            Object.entries(sources).every(([file, digest]) => sha(read(native + '/' + file)) === digest) &&
            json('tools/verify/runtime-interop-android/host-patches/memory/manifest.json').files.every((f) => sha(read(native + '/' + f.file)) === f.afterSha256), { count: Object.keys(sources).length });
        const apk = read(m.apk.file), zip = await JSZip.loadAsync(apk);
        check('exact-arm64-static-sdl-candidate', apk.length === 22948135 && sha(apk) === 'c6d833035389e1e434db3d0957d21a68a8fdfaac03e3422564e5b6515b205819' &&
            b.compiled === true && b.apk.sha256 === sha(apk) && b.signatureVerified === true && b.sourceInputsUnchanged === true && b.assetsInputsUnchanged === true &&
            b.abi === 'arm64-v8a' && b.androidStl === 'c++_static' && b.v8LibraryKind === 'static' && b.v8StartupMode === 'embedded' &&
            b.v8Version === '11.6.189.22' && b.sdlVersion === '3.2.30' && m.installedSha256 === sha(apk) &&
            equal(Object.keys(zip.files).filter((n) => /^lib\/.*\.so$/.test(n)).sort(), ['lib/arm64-v8a/libSDL3.so', 'lib/arm64-v8a/libmystral-runtime.so']) &&
            !Object.keys(zip.files).some((n) => n.startsWith('assets/v8/')), { bytes: apk.length, sha256: sha(apk) });
        const manifest = json(m.assetsManifest.file);
        for (const [file, digest] of Object.entries(b.payload.assets)) {
            const entry = zip.file('assets/' + file); check('packaged-asset-' + file, !!entry && sha(await entry.async('nodebuffer')) === digest);
        }
        check('same-sdk-stage4-and-source-binding', sha(read(m.assetsManifest.file)) === m.assetsManifest.sha256 &&
            manifest.bundle.sha256 === '417509cb4774f85346158c7c27f580a7afe5ace70c7486e095b4bbb216de518a' &&
            sha(read(manifest.bundle.file)) === manifest.bundle.sha256 && sourceBinding(path.resolve(root, manifest.bundle.file)).matches === true &&
            m.assetsManifest.sha256 === '18615a9c5b1760074f82296c664d5d894032c62fc1e6671239f94e8c18f418df');
        const elfEvidence = elf.loadElfEvidence(path.resolve(root, buildDir + '/build-report.json'), path.resolve(root, m.apk.file));
        const inspected = elf.inspectApk(path.resolve(root, m.apk.file), python);
        elf.verifyElfBinding(b, elfEvidence.audit, inspected);
        const closure = json(buildDir + '/static-link-closure.json');
        check('16kb-static-package-and-no-dynamic-cpp', m.elf16kCompatible === true && m.zipalign16kVerified === true && closure.passVerified === true &&
            closure.normalLinkWithoutDuplicateSuppression === true && closure.cppUndefinedSymbols.length === 0 &&
            closure.nativeLibraries.every((lib) => inspected[lib.file].sha256 === lib.sha256 && lib.needed.every((n) => !['libc++_shared.so', 'libv8android.so'].includes(n))),
            { note: 'Static package compatibility only; this phone actually runs 4096-byte pages.' });
        const log = read(base + '/logcat.txt').toString(); const replayPlan = [];
        for (const row of m.cases) {
            const id = row.caseId, directory = base + '/' + id;
            const session = json(directory + '/session.json'), app = json(directory + '/app-report.json'), runtime = json(directory + '/native-ready.json');
            check(id + '-actual-session-and-embedded-arm64-runtime', row.pass === true && row.completed === true &&
                equal(session, row.session) && equal(app, row.application) && equal(runtime, row.runtime) && app.completed === true && app.pass === true &&
                app.consoleErrors.length === 0 && app.runId === session.runId && session.runId === row.runId && app.caseId === id && session.caseId === id &&
                runtime.loadedABI === 'arm64-v8a' && runtime.nativeStarted === true && runtime.jsEngine === 'v8' && runtime.backend === 'dawn' &&
                runtime.v8Version === '11.6.189.22' && runtime.v8StartupMode === 'embedded' && runtime.entrySha256 === manifest.files['interop/entry.js'].sha256);
            check(id + '-real-business-contract', id === 'probes' ? probesPassed(app.result) : id === 'air' ? app.result.id === 'air-webgpu-smoke' && app.result.status === 'PASS' : scenePassed(app.result, id));
            let priorSurface, priorRaw, priorSrgb, priorMeta;
            for (const capture of row.captures) {
                const meta = capture.metadata, scene = SCENE_IDS.includes(id), kind = scene ? 'scene-' + id : id;
                const prefix = kind + (meta.phase ? '-' + meta.phase : '');
                const surface = read(directory + '/' + meta.file), raw = read(directory + '/' + prefix + '.screen.png');
                const rawCrop = read(directory + '/' + prefix + '.screen-crop.png'), srgb = read(directory + '/' + prefix + '.screen-srgb.png'), srgbCrop = read(directory + '/' + prefix + '.screen-srgb-crop.png');
                const color = json(directory + '/' + prefix + '.screen-color.json');
                const verify = (bytes, previousBytes) => scene ? verifyScenePresentation(bytes, kind, { phase: meta.phase, previousBytes }) : verifyPresentation(bytes, kind);
                const actualSurface = verify(surface, priorSurface), actualRaw = verify(rawCrop, priorRaw), actualSrgb = verify(srgbCrop, priorSrgb);
                check(prefix + '-original-and-independent-physical-pixels', capture.pass === true && actualSurface.pass === true && actualSrgb.pass === true &&
                    equal(actualSurface, capture.surface) && equal(actualRaw, capture.rawOracle) && equal(actualSrgb, capture.compositor) &&
                    sha(surface) === meta.sha256 && sha(raw) === capture.screenSha256 && sha(rawCrop) === capture.cropSha256 &&
                    sha(srgb) === capture.srgbScreenSha256 && sha(srgbCrop) === capture.srgbCropSha256 &&
                    cropMatches(raw, meta.bounds, rawCrop) && cropMatches(srgb, meta.bounds, srgbCrop) &&
                    meta.pid === session.pid && meta.runId === row.runId && meta.kind === kind && meta.channel === 'android-pixelcopy' &&
                    meta.resultCode === 0 && ['width', 'bitmapWidth', 'surfaceWidth', 'viewWidth'].every((key) => meta[key] === 320) &&
                    ['height', 'bitmapHeight', 'surfaceHeight', 'viewHeight'].every((key) => meta[key] === 240));
                check(prefix + '-actual-profile-and-unfitted-standard-transform', equal(color, capture.normalization.metadata) && color.completed === true && color.pass === true &&
                    color.action === 'icc-to-srgb' && color.icc.present === true && color.icc.bytes === 520 &&
                    color.icc.sha256 === '6e72ac49fd45d1275f29daca1038a0b9af5befd0e891af9267f47ab066a5dffb' &&
                    sha(read(directory + '/' + prefix + '.screen-source.icc')) === color.icc.sha256 && sha(Buffer.from(color.icc.base64, 'base64')) === color.icc.sha256 &&
                    color.input.sha256 === sha(raw) && color.output.sha256 === sha(srgb) && color.input.width === color.output.width && color.input.height === color.output.height &&
                    color.transform.renderingIntent === 1 && color.transform.flags === 0 && color.transform.resize === false && color.transform.alphaPreserved === true &&
                    color.transform.fittedFromExpectedPixels === false && sha(read(color.producer.file)) === color.producer.sha256 &&
                    Object.values(color.modules).every((mod) => sha(read(mod.file)) === mod.sha256));
                if (meta.phase === 'after') check(prefix + '-same-surface-before-after-chain', meta.previous.sha256 === priorMeta.sha256 && meta.previous.pid === session.pid &&
                    meta.previous.surfaceGeneration === priorMeta.surfaceGeneration && meta.surfaceGeneration === priorMeta.surfaceGeneration);
                replayPlan.push({ id: prefix, raw: directory + '/' + prefix + '.screen.png', srgb: directory + '/' + prefix + '.screen-srgb.png',
                    metadata: directory + '/' + prefix + '.screen-color.json', icc: directory + '/' + prefix + '.screen-source.icc',
                    rawCrop: directory + '/' + prefix + '.screen-crop.png', srgbCrop: directory + '/' + prefix + '.screen-srgb-crop.png', bounds: meta.bounds });
                audit.captures.push({ id: prefix, pass: true, rawOraclePass: actualRaw.pass, originalSha256: sha(raw), pixelCopySha256: sha(surface), srgbSha256: sha(srgb), sourceIccSha256: color.icc.sha256 });
                priorSurface = surface; priorRaw = rawCrop; priorSrgb = srgbCrop; priorMeta = meta;
            }
            check(id + '-complete-capture-pair-count', row.captures.length === (SCENE_IDS.includes(id) ? 2 : 1));
            const lines = log.split(/\r?\n/).filter((line) => new RegExp('^\\S+\\s+\\S+\\s+' + session.pid + '\\s+').test(line));
            const markers = ['shutdown-jsEngine-return', 'context-surface-release-return', 'context-device-destroy-return', 'context-device-release-return',
                'context-instance-release-return', 'shutdown-window-return', 'shutdown-complete', 'runtime-reset-return', 'java-exit-notify-return'];
            const exit = json(directory + '/native-exit.json'), finish = lines.find((line) => line.includes('EXIT_STAGE finish-request run=' + row.runId));
            const ended = lines.find((line) => /\bSDL\s*: Finished main function\s*$/.test(line));
            const before = table(directory + '/process-table-before-finish.txt'), after = table(directory + '/process-table-after-stop.txt');
            const elapsed = time(ended || '') - time(finish || '');
            check(id + '-real-teardown-context-window-zero-and-live-gone', equal(exit, row.nativeExit) && exit.pid === session.pid && exit.code === 0 && exit.error === '' &&
                markers.every((marker) => lines.some((line) => line.includes('EXIT_STAGE ' + marker))) &&
                lines.some((line) => line.includes('SURFACE_CONTEXT_CLEANUP surface=0 window=0 contextWindowRefs=0')) &&
                elapsed >= 0 && elapsed < 10000 && before.some((p) => p.pid === session.pid && p.name === m.package) &&
                !after.some((p) => p.pid === session.pid || p.name === m.package || p.name.startsWith(m.package + ':')) &&
                row.pidGone === true && row.pidGoneCheck.connected === true && row.pidGoneCheck.remainingPids.length === 0,
                { pid: session.pid, finishToSDLMainMs: elapsed });
            audit.cases.push({ id, runId: row.runId, pid: session.pid, pass: true, realNativeExit: 0, finishToSDLMainMs: elapsed });
        }
        check('ten-complete-independent-capture-groups', audit.captures.length === 10);
        save('icc-inputs.json', replayPlan);
        const replayOut = execFileSync(python, [path.join(__dirname, 'replay-icc.py')], { cwd: root, windowsHide: true, encoding: 'utf8', timeout: 120000, maxBuffer: 1024 * 1024 });
        fs.writeFileSync(path.join(__dirname, 'icc-replay.stdout.txt'), replayOut, { flag: 'wx' });
        const replay = json(path.relative(root, path.join(__dirname, 'icc-replay.json')));
        check('independent-full-image-littlecms-replay', replay.completed === true && replay.pass === true && replay.records.length === 10 &&
            replay.records.every((r) => r.pass === true && r.wholeImagePixelsExact === true && r.rawCropPixelsExact === true && r.srgbCropPixelsExact === true),
            { records: replay.records.length, versions: replay.versions, producerSha256: replay.producerSha256 });
        for (const record of replay.records) read(path.relative(root, path.join(__dirname, record.replayedFile)));
        for (const [file, digest] of Object.entries(evidence)) if (sha(fs.readFileSync(path.resolve(root, file))) !== digest) throw Error('Final evidence changed: ' + file);
        check('all-original-inputs-stable-through-audit', true, { count: Object.keys(evidence).length });
        audit.completed = true; audit.pass = true;
    } catch (error) { audit.error = String(error.stack || error); }
    audit.evidenceSha256 = evidence;
    audit.producer = { file: path.relative(root, __filename).replaceAll('\\', '/'), sha256: sha(fs.readFileSync(__filename)) };
    audit.finishedAt = new Date().toISOString(); audit.status = audit.pass ? 'PASS' : 'FAIL'; save('report.json', audit);
    console.log(JSON.stringify({ status: audit.status, checks: audit.checks.length, cases: audit.cases.length, captureGroups: audit.captures.length, evidenceFiles: Object.keys(evidence).length, error: audit.error }));
    process.exitCode = audit.pass ? 0 : 1;
}
void main();
