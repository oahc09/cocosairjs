/* Offline final evidence audit. Does not launch a process, contact a device, or modify input evidence. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const JSZip = require('jszip');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '../../..');
const { probesPassed, verifyPresentation, sourceBinding } = require(path.join(root, 'tools/verify/runtime-interop.cjs'));
const { SCENE_IDS, scenePassed } = require(path.join(root, 'tools/verify/runtime-interop/scene-contract.cjs'));
const { verifyScenePresentation } = require(path.join(root, 'tools/verify/runtime-interop/scene-oracles.cjs'));
const matrixDir = 'output/runtime-interop/android-matrix-final-20261025';
const demoDir = 'output/runtime-interop/android-demo-final-20261025';
const output = path.join(__dirname, 'audit.json');
if (fs.existsSync(output)) throw Error('Preserve the previous audit; choose a new output directory');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const canonical = (value) =>
    JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en'))));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const inputs = {};
const bytes = (relative) => {
    const content = fs.readFileSync(path.resolve(root, relative));
    inputs[relative.replaceAll('\\', '/')] = sha(content);
    return content;
};
const json = (relative) => JSON.parse(bytes(relative));
const audit = {
    schema: 'air-android-offline-independent-audit-v1',
    startedAt: new Date().toISOString(),
    scope: 'APK10 x86_64 API37 emulator; fixed six-case matrix and interactive demo only',
    method: 'Offline hashes, APK ZIP payloads, PNG pixels, raw exit/lifecycle/process-table records',
    noDeviceOperations: true,
    noInputMutations: true,
    checks: [],
    captureGroups: [],
    cases: [],
    notes: [],
    pass: false,
};
const check = (name, pass, detail) => audit.checks.push({ name, pass: !!pass, ...(detail === undefined ? {} : { detail }) });
function processTable(relative, pid, pkg) {
    const lines = bytes(relative).toString().trim().split(/\r?\n/);
    if (!/^\s*PID\s+NAME\s*$/.test(lines.shift() || '')) return false;
    const rows = lines.map((line) => /^\s*(\d+)\s+(\S+)\s*$/.exec(line));
    return rows.every(Boolean) && !rows.some((row) => Number(row[1]) === pid || row[2] === pkg || row[2].startsWith(pkg + ':'));
}
function crop(raw, bounds) {
    const source = PNG.sync.read(raw);
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isInteger) || bounds.x < 0 || bounds.y < 0 ||
        bounds.x + bounds.width > source.width || bounds.y + bounds.height > source.height) throw Error('Invalid captured screen bounds');
    const target = new PNG({ width: bounds.width, height: bounds.height });
    PNG.bitblt(source, target, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0);
    return PNG.sync.write(target);
}
function logForPid(log, pid) {
    return log.split(/\r?\n/).filter((line) => new RegExp(`^\\S+\\s+\\S+\\s+${pid}\\s+`).test(line));
}
function logTime(line) {
    const match = /^\S+\s+(\d+):(\d+):(\d+)\.(\d+)/.exec(line);
    return match ? ((+match[1] * 60 + +match[2]) * 60 + +match[3]) * 1000 + +match[4] : NaN;
}
function colors(raw) {
    const png = PNG.sync.read(raw);
    const result = { width: png.width, height: png.height, orange: 0, green: 0, blue: 0, sha256: sha(raw) };
    for (let i = 0; i < png.data.length; i += 4) {
        const [r, g, b] = png.data.subarray(i, i + 3);
        if (r > g + 50 && r > b + 50) result.orange++;
        if (g > r + 50 && g > b + 50) result.green++;
        if (b > r + 20 && b > g + 10) result.blue++;
    }
    return result;
}

(async () => {
    try {
        const matrix = json(matrixDir + '/report.json');
        const demo = json(demoDir + '/report.json');
        check('matrix fixed six cases and emulator scope', matrix.pass && matrix.completed && matrix.inputsUnchanged &&
            equal(matrix.requiredCases, ['probes', 'air', ...SCENE_IDS]) && matrix.cases.length === 6 &&
            matrix.simulatorAcceptance === true && matrix.physicalAcceptance === false && matrix.releaseReady === false &&
            matrix.device.emulator === true && matrix.serial === 'emulator-5554');
        const mismatches = [];
        for (const [relative, expected] of Object.entries(matrix.inputs)) if (sha(bytes(relative)) !== expected) mismatches.push(relative);
        check('all current acceptance input hashes', mismatches.length === 0, { count: Object.keys(matrix.inputs).length, mismatches });
        const manifest = json(matrix.assetsManifest.file);
        const sdk = bytes(manifest.bundle.file);
        check('same SDK and source map binding', sha(sdk) === manifest.bundle.sha256 && sha(sdk) === matrix.assetsManifest.sdkSha256 &&
            sourceBinding(path.resolve(root, manifest.bundle.file)).matches, { sdkSha256: sha(sdk) });
        check('asset manifest hash and generator binding', inputs[matrix.assetsManifest.file] === matrix.assetsManifest.sha256 &&
            sha(bytes(manifest.generator.file)) === manifest.generator.sha256);
        const sourceAssets = [];
        for (const entry of Object.values(manifest.files)) {
            if (entry.source === 'generated Android test transport') continue;
            sourceAssets.push(sha(bytes(entry.source)) === entry.sha256);
        }
        check('all real staged source files current', sourceAssets.every(Boolean), { count: sourceAssets.length });
        const apk = bytes(matrix.apk.file);
        check('APK bytes and installed APK fingerprint', apk.length === matrix.apk.bytes && sha(apk) === matrix.apk.sha256 &&
            matrix.installedSha256 === matrix.apk.sha256 && demo.apkSha256 === matrix.apk.sha256, matrix.apk);
        const zip = await JSZip.loadAsync(apk, { checkCRC32: true });
        const apkHash = {};
        for (const [name, entry] of Object.entries(zip.files)) if (!entry.dir && /^(?:assets\/|lib\/)/.test(name)) {
            const data = await entry.async('nodebuffer');
            apkHash[name] = { bytes: data.length, sha256: sha(data) };
        }
        const apkMismatches = [];
        for (const [name, expected] of Object.entries(matrix.apkFiles)) if (!equal(apkHash[name], expected)) apkMismatches.push(name);
        for (const [name, expected] of Object.entries(manifest.files)) if (apkHash['assets/' + name]?.sha256 !== expected.sha256 ||
            apkHash['assets/' + name]?.bytes !== expected.bytes) apkMismatches.push('assets/' + name);
        check('APK ZIP payload and 27 staged files plus two manifest copies', !apkMismatches.length && Object.keys(manifest.files).length === 27 &&
            apkHash['assets/interop/manifest.json'].sha256 === matrix.assetsManifest.sha256 &&
            apkHash['assets/assets-manifest.json'].sha256 === matrix.assetsManifest.sha256,
            { stagedFiles: Object.keys(manifest.files).length, manifests: 2, apkMismatches });
        const build = json(matrix.hostBuild.file);
        const buildDir = path.posix.dirname(matrix.hostBuild.file);
        const before = json(buildDir + '/source-before.json');
        const after = json(buildDir + '/source-after.json');
        const hostMismatches = [];
        for (const [relative, expected] of Object.entries(after)) if (sha(bytes('output/runtime-interop/mystral-source/' + relative)) !== expected)
            hostMismatches.push(relative);
        check('native source build receipt matches current sources', build.compiled && build.sourceInputsUnchanged && build.assetsInputsUnchanged &&
            build.signatureVerified && build.payload.pass && canonical(before) === canonical(after) && !hostMismatches.length &&
            sha(Buffer.from(canonical(after))) === matrix.hostBuild.compiledSourcesSha256 &&
            inputs[matrix.hostBuild.file] === matrix.hostBuild.sha256 && build.apk.sha256 === matrix.apk.sha256 &&
            build.apk.bytes === matrix.apk.bytes && build.abi === 'x86_64', { sources: Object.keys(after).length, hostMismatches });
        check('all 29 asset receipt entries match APK bytes plus the ABI snapshot', build.payload.assetCount === 29 &&
            Object.keys(build.payload.assets).length === 29 && build.payload.apkAssets === 30 &&
            Object.entries(build.payload.assets).every(([name, expected]) => apkHash['assets/' + name]?.sha256 === expected) &&
            Object.keys(apkHash).filter((name) => name.startsWith('assets/')).length === 30 &&
            !!apkHash['assets/v8/x86_64/snapshot_blob.bin']);
        check('raw APK signature verification retained', /Verifies\r?\n/.test(bytes(buildDir + '/apksigner.log').toString()) &&
            /v2.*true/.test(bytes(buildDir + '/apksigner.log').toString()));
        for (const entry of build.payload.nativeLibraries) check('native APK library ' + entry.file,
            equal(apkHash[entry.file], { bytes: entry.bytes, sha256: entry.sha256 }));
        const log = bytes(matrixDir + '/logcat.txt').toString();
        for (const row of matrix.cases) {
            const dir = matrixDir + '/' + row.caseId;
            const session = json(dir + '/session.json');
            const app = json(dir + '/app-report.json');
            check(row.caseId + ' raw application/session identity', row.pass && row.completed && app.pass && app.completed &&
                app.runId === row.runId && app.caseId === row.caseId && app.runId === session.runId && session.caseId === row.caseId &&
                equal(app, row.application) && app.consoleErrors.length === 0);
            const business = row.caseId === 'probes' ? probesPassed(app.result) : row.caseId === 'air' ?
                app.result.id === 'air-webgpu-smoke' && app.result.status === 'PASS' : scenePassed(app.result, row.caseId);
            check(row.caseId + ' business result', business);
            check(row.caseId + ' native runtime and snapshot binding', row.runtime.nativeStarted && row.runtime.jsEngine === 'v8' &&
                row.runtime.backend === 'dawn' && row.runtime.loadedABI === build.abi &&
                apkHash[`assets/v8/${build.abi}/snapshot_blob.bin`].sha256 === row.runtime.snapshotSha256 &&
                manifest.files['interop/entry.js'].sha256 === row.runtime.entrySha256);
            if (row.caseId === 'probes') {
                const wasm = app.result.cases.find((item) => item.id === 'wasm-shader').observations;
                const gpu = app.result.cases.find((item) => item.id === 'gpu-submit-present').observations;
                check('real two WASM factories and non-Null renderer', wasm.glslang.instantiated && wasm.twgsl.instantiated &&
                    wasm.glslang.wasmBytes === 1192271 && wasm.twgsl.wasmBytes === 1702916 &&
                    wasm.glslang.stage === 'factory-ready' && wasm.twgsl.stage === 'factory-ready' &&
                    wasm.vertex.spirvWords === 273 && wasm.fragment.spirvWords === 88 &&
                    wasm.vertex.wgsl.includes('@vertex') && wasm.fragment.wgsl.includes('@fragment') &&
                    !/Null backend/i.test(gpu.adapter.device) && /Goldfish\s+GFXStream/.test(gpu.adapter.device), gpu.adapter);
            }
            if (row.caseId === 'compute') {
                const first = app.result.observations.phases.before.state;
                const second = app.result.observations.phases.after.state;
                const direct = [11,26,35,46,59,74,91,110,131,154,179,206,235,266,299,334,371];
                const indirect = [47,62,71,82,95,110,127,146,167,190,215,242,271,3735928559,3735928559,3735928559,3735928559];
                check('compute direct/indirect numeric and offset receipts', equal(first.direct.actual, direct) &&
                    equal(second.indirect.actual, indirect) && equal(second.indirect.argumentReadback, [0,12,1,1]) &&
                    second.indirect.indirectOffsetBytes === 4 && first.path === 'compute-readback-material' &&
                    /CPU material/.test(first.visualization));
            }
            let previousSurface, previousCrop, previousMeta;
            for (const capture of row.captures) {
                const meta = capture.metadata;
                const scene = SCENE_IDS.includes(row.caseId);
                const kind = scene ? 'scene-' + row.caseId : row.caseId;
                const prefix = kind + (meta.phase ? '-' + meta.phase : '');
                const surfaceBytes = bytes(dir + '/' + meta.file);
                const screenBytes = bytes(dir + '/' + prefix + '.screen.png');
                const cropBytes = bytes(dir + '/' + prefix + '.screen-crop.png');
                const surface = scene ? verifyScenePresentation(surfaceBytes, kind, { phase: meta.phase, previousBytes: previousSurface }) :
                    verifyPresentation(surfaceBytes, kind);
                const compositor = scene ? verifyScenePresentation(cropBytes, kind, { phase: meta.phase, previousBytes: previousCrop }) :
                    verifyPresentation(cropBytes, kind);
                check(prefix + ' independent PNG and metadata', capture.pass && surface.pass && compositor.pass &&
                    equal(surface, capture.surface) && equal(compositor, capture.compositor) &&
                    sha(surfaceBytes) === meta.sha256 && sha(screenBytes) === capture.screenSha256 && sha(cropBytes) === capture.cropSha256 &&
                    crop(screenBytes, meta.bounds).equals(cropBytes) && meta.channel === 'android-pixelcopy' && meta.resultCode === 0 &&
                    meta.pid === session.pid && meta.runId === row.runId && meta.kind === kind);
                if (meta.phase === 'after') check(prefix + ' before-pair identity', previousMeta &&
                    meta.previous.sha256 === previousMeta.sha256 && meta.previous.file === previousMeta.file &&
                    meta.previous.pid === session.pid && meta.previous.surfaceGeneration === meta.surfaceGeneration);
                audit.captureGroups.push({ caseId: row.caseId, phase: meta.phase || null, surface: surface.sha256,
                    compositor: compositor.sha256, pass: surface.pass && compositor.pass,
                    ...(row.caseId === 'ui' ? { pixelcopyInterior: surface.spriteInteriorSamples, compositorInterior: compositor.spriteInteriorSamples } : {}) });
                previousSurface = surfaceBytes; previousCrop = cropBytes; previousMeta = meta;
            }
            check(row.caseId + ' exact presentation count', row.captures.length === (SCENE_IDS.includes(row.caseId) ? 2 : 1));
            const exit = json(dir + '/native-exit.json');
            check(row.caseId + ' raw native exit', exit.pid === session.pid && exit.code === 0 && exit.error === '' && equal(exit, row.nativeExit));
            const lines = logForPid(log, session.pid);
            const markers = ['shutdown-complete', 'runtime-reset-return', 'Native SDL_main ended code=0 error=', 'java-exit-notify-return', 'Finished main function'];
            const allMarkers = markers.every((marker) => lines.some((line) => line.includes(marker)));
            const finished = lines.find((line) => line.includes('Finished main function'));
            const request = lines.find((line) => line.includes('EXIT_STAGE finish-request'));
            const elapsed = logTime(finished) - logTime(request);
            check(row.caseId + ' real SDL main return within unchanged closing budget', allMarkers && elapsed >= 0 && elapsed < 10000,
                { pid: session.pid, finishToSDLMainMs: elapsed });
            check(row.caseId + ' actual retained process table', row.pidGone && row.pidGoneCheck.connected &&
                row.pidGoneCheck.remainingPids.length === 0 && processTable(dir + '/process-table-after-stop.txt', session.pid, matrix.package));
            audit.cases.push({ caseId: row.caseId, pid: session.pid, nativeExitCode: exit.code, finishToSDLMainMs: elapsed });
        }
        check('ten formal independent capture pairs', audit.captureGroups.length === 10 && audit.captureGroups.every((row) => row.pass));
        const demoSession = json(demoDir + '/session.json');
        const demoState = json(demoDir + '/state-ready.json');
        check('demo shares exact APK and current verifier', demo.pass && demo.status === 'PASS' && demo.physicalAcceptance === false &&
            demo.releaseReady === false && demo.apkSha256 === matrix.apk.sha256 &&
            sha(bytes('output/runtime-interop/android-demo-verify.cjs')) === demo.toolSha256 && demo.runId === demoSession.runId && demoSession.caseId === 'demo');
        check('demo startup uses real AIR draws', demo.application.ready && demo.application.pass && demo.application.frames >= 3 &&
            demo.application.gpuErrors.length === 0 && demoState.runtime.loadedABI === build.abi && demoState.runtime.nativeStarted &&
            /Director.EVENT_AFTER_DRAW/.test(bytes('tools/verify/runtime-interop/android-demo.mjs').toString()));
        for (const [index, wanted] of [[0, 'orange'], [1, 'green']]) {
            const capture = demo.captures[index], meta = capture.metadata, phase = index ? 'after' : 'before';
            const image = bytes(demoDir + '/' + meta.file), screen = bytes(demoDir + '/' + phase + '.screen.png');
            const cropped = bytes(demoDir + '/' + phase + '.screen-crop.png');
            const surface = colors(image), compositor = colors(cropped);
            check('demo ' + phase + ' independent PixelCopy and screen', capture.pass && equal(surface, capture.surface) && equal(compositor, capture.compositor) &&
                [surface, compositor].every((result) => result.width === 320 && result.height === 240 && result[wanted] > 1000 && result.blue > 30000) &&
                sha(image) === meta.sha256 && crop(screen, meta.bounds).equals(cropped) &&
                meta.pid === demoSession.pid && meta.runId === demo.runId && meta.resultCode === 0 && meta.channel === 'android-pixelcopy');
        }
        check('demo before/after pair', demo.captures[1].metadata.previous.sha256 === demo.captures[0].metadata.sha256 &&
            demo.captures[1].metadata.previous.pid === demoSession.pid &&
            demo.captures[1].metadata.previous.surfaceGeneration === demo.captures[1].metadata.surfaceGeneration);
        const events = bytes(demoDir + '/events.jsonl').toString().trim().split(/\r?\n/).map(JSON.parse);
        const actualInputs = events.filter((event) => event.stage === 'demo-input');
        check('demo two actual trusted OS input events with subpixel coordinates', actualInputs.length === 2 && equal(actualInputs[0], demo.input1) &&
            equal(actualInputs[1], demo.input2) && actualInputs.every((input) => input.isTrusted && input.type === 'mousedown' &&
                Math.abs(input.clientX - 160) <= 1 && Math.abs(input.clientY - 120) <= 1 && input.gpuErrors.length === 0) &&
            demo.input1.taps === 1 && demo.input1.color === 'green' && demo.input2.taps === 2 && demo.input2.color === 'orange' &&
            demo.input2.frames > demo.input1.frames, { inputs: actualInputs });
        const lifecycle = bytes(demoDir + '/lifecycle.jsonl').toString().trim().split(/\r?\n/).map(JSON.parse);
        const pause = lifecycle.find((event) => event.event === 'pause');
        const resume = lifecycle.find((event) => event.event === 'resume' && event.elapsedRealtime > pause?.elapsedRealtime);
        check('demo real background/resume preserves native session', pause && resume && lifecycle.every((event) => event.pid === demoSession.pid) &&
            pause.surfaceGeneration === 1 && resume.surfaceGeneration === 1 &&
            !lifecycle.some((event) => event.event === 'destroy' && event.elapsedRealtime < resume.elapsedRealtime));
        const resumeScreen = bytes(demoDir + '/resume.screen.png');
        const resumeCrop = bytes(demoDir + '/resume.screen-crop.png');
        const resumed = colors(resumeCrop);
        check('resumed demo compositor shows the second OS input effect', equal(resumed, demo.resumePixels) && resumed.orange > 1000 && resumed.green === 0 &&
            resumed.blue > 30000 && crop(resumeScreen, demo.captures[1].metadata.bounds).equals(resumeCrop));
        const demoLog = logForPid(bytes(demoDir + '/logcat.txt').toString(), demoSession.pid);
        check('demo native exit and real PID cleanup', demo.nativeExit.pid === demoSession.pid && demo.nativeExit.code === 0 && !demo.nativeExit.error &&
            ['shutdown-complete', 'runtime-reset-return', 'java-exit-notify-return'].every((marker) => demoLog.some((line) => line.includes(marker))) &&
            processTable(demoDir + '/process-table-after-stop.txt', demoSession.pid, matrix.package));
        const prior = [];
        for (const name of ['android-demo-attempt-1', 'android-demo-attempt-2', 'android-demo-attempt-3']) {
            const file = 'output/runtime-interop/' + name + '/report.json';
            if (fs.existsSync(path.join(root, file))) {
                const value = json(file);
                prior.push({ file, status: value.status, pass: value.pass, error: value.error || null });
            }
        }
        audit.retainedDemoAttempts = prior;
        audit.correctedAuditOnly = {
            previousAttempt: 'output/runtime-interop/android-final-independent-audit-20261025/audit.json',
            explanation: 'Retained prior FAIL is an audit implementation error: localeCompare(en) source canonicalization; 27 staged files plus two manifest copies; renderer name contains a space. Original runtime evidence is unchanged.',
            previousAuditSha256: sha(bytes('output/runtime-interop/android-final-independent-audit-20261025/audit.json')),
        };
        check('earlier failed input diagnostic remains retained', prior.some((entry) => entry.status === 'FAIL' && /input contract/i.test(entry.error || '')));
        audit.notes.push('PID disappearance is proven after the collector force-stops its own package; clean native runtime/SDL return is separately retained before that cleanup.');
        audit.notes.push('Fractional SDL-derived client coordinates remain within one physical pixel; graphics/numeric/interior thresholds are unchanged.');
        audit.notes.push('Background/resume retained the same PID and surfaceGeneration=1; this does not certify surface recreation, rotation, context recovery, ARM, phones, performance, or release readiness.');
        audit.notes.push('Demo log capture excludes the SDL tag; six formal cases independently retain SDL Finished main function plus raw native-exit files.');
        audit.completed = true;
        audit.pass = audit.checks.every((item) => item.pass);
    } catch (error) {
        audit.completed = false;
        audit.error = String(error.stack || error);
    } finally {
        audit.evidenceFilesSha256 = inputs;
        audit.auditScriptSha256 = sha(fs.readFileSync(__filename));
        audit.failedChecks = audit.checks.filter((item) => !item.pass);
        audit.status = audit.pass ? 'PASS' : 'FAIL';
        audit.finishedAt = new Date().toISOString();
        fs.writeFileSync(output, JSON.stringify(audit, null, 2) + '\n');
        console.log(JSON.stringify({ status: audit.status, completed: audit.completed, checks: audit.checks.length,
            failedChecks: audit.failedChecks, error: audit.error, captureGroups: audit.captureGroups.length,
            evidenceFiles: Object.keys(inputs).length, output: path.relative(root, output).replaceAll('\\', '/') }, null, 2));
    }
})();
