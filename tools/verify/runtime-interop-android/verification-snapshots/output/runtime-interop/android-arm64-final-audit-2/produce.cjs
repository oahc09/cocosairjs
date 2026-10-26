/* Independent offline audit of the fixed ARM64 phone matrix. Never writes input evidence or uses ADB. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual: equal } = require('node:util');
const JSZip = require('jszip');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '../../..');
const matrixDir = 'output/runtime-interop/android-arm64-matrix-attempt-1';
const reportFile = path.join(__dirname, 'report.json');
const { sourceBinding, probesPassed, verifyPresentation } = require(
    path.join(root, 'tools/verify/runtime-interop.cjs'),
);
const { SCENE_IDS, scenePassed } = require(path.join(root, 'tools/verify/runtime-interop/scene-contract.cjs'));
const { verifyScenePresentation } = require(path.join(root, 'tools/verify/runtime-interop/scene-oracles.cjs'));
if (fs.existsSync(reportFile)) throw Error('Preserve the prior audit; use a new attempt directory');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const evidence = {};
const bytes = (file) => {
    const data = fs.readFileSync(path.resolve(root, file));
    evidence[file.replaceAll('\\', '/')] = sha(data);
    return data;
};
const json = (file) => JSON.parse(bytes(file));
const canonical = (value) =>
    JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'en'))));
const audit = {
    schema: 'air-android-arm64-matrix-independent-audit-v1',
    startedAt: new Date().toISOString(),
    scope: 'Six-case ARM64 V2520A/API37/4096-byte-page physical phone functional matrix only.',
    noDeviceOperations: true,
    noInputMutations: true,
    checks: [],
    captures: [],
    cases: [],
    completed: false,
    pass: false,
    releaseReady: false,
    elf16kCompatible: false,
    actual16KBEnvironmentAcceptance: 'NOT_RUN',
};
const check = (name, pass, details) =>
    audit.checks.push({ name, pass: !!pass, ...(details === undefined ? {} : { details }) });
function table(file) {
    const rows = bytes(file).toString().trim().split(/\r?\n/);
    if (!/^\s*PID\s+NAME\s*$/.test(rows.shift() || '') || !rows.length) throw Error('Invalid retained ps table');
    return rows.map((line) => {
        const match = /^\s*(\d+)\s+(.+?)\s*$/.exec(line);
        if (!match) throw Error('Invalid retained ps row');
        const pid = Number(match[1]);
        if (!Number.isSafeInteger(pid) || pid <= 0) throw Error('Invalid retained ps PID');
        return { pid, name: match[2] };
    });
}
function cropPixels(screen, bounds, crop) {
    const a = PNG.sync.read(screen),
        b = PNG.sync.read(crop);
    const { x, y, width, height } = bounds;
    if (
        ![x, y, width, height].every(Number.isInteger) ||
        x < 0 ||
        y < 0 ||
        width <= 0 ||
        height <= 0 ||
        x + width > a.width ||
        y + height > a.height ||
        width !== b.width ||
        height !== b.height
    )
        return false;
    const target = new PNG({ width, height });
    PNG.bitblt(a, target, x, y, width, height, 0, 0);
    return target.data.equals(b.data);
}
function logTime(line) {
    const match = /^\S+\s+(\d+):(\d+):(\d+)\.(\d+)/.exec(line);
    return match ? ((+match[1] * 60 + +match[2]) * 60 + +match[3]) * 1000 + +match[4] : NaN;
}
function elfLoads(data) {
    if (
        !data.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])) ||
        data[4] !== 2 ||
        data[5] !== 1 ||
        data.readUInt16LE(18) !== 183
    )
        throw Error('Expected ELF64 little-endian AArch64');
    const start = Number(data.readBigUInt64LE(32)),
        size = data.readUInt16LE(54),
        count = data.readUInt16LE(56);
    const loads = [];
    for (let i = 0; i < count; i++) {
        const p = start + size * i;
        if (data.readUInt32LE(p) === 1)
            loads.push({
                offset: Number(data.readBigUInt64LE(p + 8)),
                vaddr: Number(data.readBigUInt64LE(p + 16)),
                align: Number(data.readBigUInt64LE(p + 48)),
            });
    }
    return loads;
}

(async () => {
    try {
        const m = json(matrixDir + '/report.json');
        const previousAudit = json('output/runtime-interop/android-arm64-final-audit-1/report.json');
        audit.retainedFirstAudit = {
            file: 'output/runtime-interop/android-arm64-final-audit-1/report.json',
            status: previousAudit.status,
            error: previousAudit.error,
            correction:
                'Independent audit PID/NAME parser now preserves the complete nonempty NAME remainder, including legitimate kernel-thread spaces. No input or process evidence was changed.',
        };
        check(
            'fixed completed physical 4 KB matrix scope',
            m.pass &&
                m.completed &&
                m.inputsUnchanged &&
                m.matrixRequested &&
                m.physicalAcceptance === true &&
                m.simulatorAcceptance === false &&
                m.functional4kOnly === true &&
                m.elf16kCompatible === false &&
                m.releaseReady === false &&
                m.device.emulator === false &&
                m.device.pageSize === 4096 &&
                m.device.api === 37 &&
                m.serial === '10CG4G0BE1003M8' &&
                equal(m.device.abiList, ['arm64-v8a']) &&
                equal(m.requiredCases, ['probes', 'air', ...SCENE_IDS]),
        );
        const inputMismatches = Object.entries(m.inputs)
            .filter(([file, expected]) => sha(bytes(file)) !== expected)
            .map(([file]) => file);
        check('all current matrix input hashes', !inputMismatches.length, {
            count: Object.keys(m.inputs).length,
            inputMismatches,
        });
        check(
            'collector and unchanged canonical collector identities',
            sha(bytes('output/runtime-interop/android-arm64-collector-v2.cjs')) === m.collectorSha256 &&
                sha(bytes('tools/verify/runtime-interop-android.cjs')) === m.canonicalCollectorSha256,
        );
        const manifest = json(m.assetsManifest.file);
        const sdk = bytes(manifest.bundle.file);
        const binding = sourceBinding(path.resolve(root, manifest.bundle.file));
        const sdkBuild = /const AIR_BUILD_NUMBER = (\d+);/.exec(sdk.toString());
        check(
            'same frozen SDK bytes and 945 source mappings',
            sha(sdk) === m.assetsManifest.sdkSha256 &&
                sha(sdk) === '417509cb4774f85346158c7c27f580a7afe5ace70c7486e095b4bbb216de518a' &&
                binding.matches &&
                binding.compared === 945 &&
                Number(sdkBuild?.[1]) === 216,
            { sdkSha256: sha(sdk), sourceBinding: binding, actualBuildNumber: Number(sdkBuild?.[1]) },
        );
        check(
            'staged manifest and generator',
            sha(bytes(m.assetsManifest.file)) === m.assetsManifest.sha256 &&
                sha(bytes(manifest.generator.file)) === manifest.generator.sha256 &&
                Object.values(manifest.files).every(
                    (v) => v.source === 'generated Android test transport' || sha(bytes(v.source)) === v.sha256,
                ),
        );
        const apk = bytes(m.apk.file);
        check(
            'actual APK and installed bytes',
            sha(apk) === m.apk.sha256 &&
                apk.length === m.apk.bytes &&
                sha(apk) === 'b59938748912dcbfe76ab8b96cf849301b6b18519d3706418c380a535903a86e' &&
                m.installedSha256 === m.apk.sha256,
        );
        const zip = await JSZip.loadAsync(apk, { checkCRC32: true });
        const payload = {},
            native = {};
        for (const [file, entry] of Object.entries(zip.files))
            if (!entry.dir && /^(assets\/|lib\/)/.test(file)) {
                const b = await entry.async('nodebuffer');
                payload[file] = { bytes: b.length, sha256: sha(b) };
                if (file.startsWith('lib/')) native[file] = b;
            }
        const build = json(m.hostBuild.file),
            buildDir = path.posix.dirname(m.hostBuild.file);
        check(
            'all APK assets and ABI snapshot',
            Object.entries(m.apkFiles).every(([file, v]) => equal(payload[file], v)) &&
                Object.entries(manifest.files).every(([file, v]) =>
                    equal(payload['assets/' + file], { bytes: v.bytes, sha256: v.sha256 }),
                ) &&
                Object.keys(manifest.files).length === 27 &&
                build.payload.assetCount === 29 &&
                build.payload.apkAssets === 30 &&
                Object.entries(build.payload.assets).every(
                    ([file, hash]) => payload['assets/' + file]?.sha256 === hash,
                ) &&
                payload['assets/interop/manifest.json'].sha256 === m.assetsManifest.sha256 &&
                payload['assets/assets-manifest.json'].sha256 === m.assetsManifest.sha256,
        );
        const before = json(buildDir + '/source-before.json'),
            after = json(buildDir + '/source-after.json');
        const hostMismatches = Object.entries(after)
            .filter(([file, hash]) => sha(bytes('output/runtime-interop/mystral-source/' + file)) !== hash)
            .map(([file]) => file);
        check(
            '115 compiled host sources build receipt and signature',
            Object.keys(after).length === 115 &&
                !hostMismatches.length &&
                canonical(before) === canonical(after) &&
                sha(Buffer.from(canonical(after))) === m.hostBuild.compiledSourcesSha256 &&
                sha(bytes(m.hostBuild.file)) === m.hostBuild.sha256 &&
                build.compiled &&
                build.sourceInputsUnchanged &&
                build.assetsInputsUnchanged &&
                build.signatureVerified &&
                build.payload.pass &&
                build.abi === 'arm64-v8a' &&
                build.apk.sha256 === m.apk.sha256 &&
                /Verifies\r?\n/.test(bytes(buildDir + '/apksigner.log').toString()),
            { hostMismatches },
        );
        check(
            'actual native payload',
            build.payload.nativeLibraries.every((v) => equal(payload[v.file], { bytes: v.bytes, sha256: v.sha256 })),
        );
        const elfAudit = json('output/runtime-interop/android-arm64-elf-audit-1/report.json');
        const actualLoads = Object.fromEntries(Object.entries(native).map(([file, b]) => [file, elfLoads(b)]));
        check(
            '16 KB gap remains explicit and actual',
            elfAudit.apk.sha256 === m.apk.sha256 &&
                elfAudit.wholeApkStatic16KBAligned === false &&
                sha(bytes(elfAudit.producer.file)) === elfAudit.producer.sha256 &&
                elfAudit.libraries.every(
                    (v) =>
                        v.sha256 === payload[v.file].sha256 &&
                        equal(
                            v.loadAlignments,
                            actualLoads[v.file].map((p) => p.align),
                        ),
                ) &&
                ['libSDL3.so', 'libv8android.so'].every((name) =>
                    actualLoads['lib/arm64-v8a/' + name].every((p) => p.align === 4096),
                ) &&
                ['libmystral-runtime.so', 'libc++_shared.so'].every((name) =>
                    actualLoads['lib/arm64-v8a/' + name].every((p) => p.align === 16384),
                ),
            {
                file: 'output/runtime-interop/android-arm64-elf-audit-1/report.json',
                sha256: sha(bytes('output/runtime-interop/android-arm64-elf-audit-1/report.json')),
            },
        );
        const fullLog = bytes(matrixDir + '/logcat.txt').toString();
        const replayPlan = [];
        for (const row of m.cases) {
            const id = row.caseId,
                dir = matrixDir + '/' + id;
            const app = json(dir + '/app-report.json'),
                session = json(dir + '/session.json');
            check(
                id + ' raw app session and selected native ABI',
                row.pass &&
                    row.completed &&
                    equal(app, row.application) &&
                    app.completed &&
                    app.pass &&
                    app.caseId === id &&
                    app.runId === row.runId &&
                    app.runId === session.runId &&
                    app.consoleErrors.length === 0 &&
                    row.runtime.nativeStarted &&
                    row.runtime.jsEngine === 'v8' &&
                    row.runtime.backend === 'dawn' &&
                    row.runtime.loadedABI === 'arm64-v8a' &&
                    payload['assets/v8/arm64-v8a/snapshot_blob.bin'].sha256 === row.runtime.snapshotSha256 &&
                    manifest.files['interop/entry.js'].sha256 === row.runtime.entrySha256,
            );
            check(
                id + ' business contract',
                id === 'probes'
                    ? probesPassed(app.result)
                    : id === 'air'
                      ? app.result.id === 'air-webgpu-smoke' && app.result.status === 'PASS'
                      : scenePassed(app.result, id),
            );
            if (id === 'probes') {
                const wasm = app.result.cases.find((c) => c.id === 'wasm-shader').observations;
                const gpu = app.result.cases.find((c) => c.id === 'gpu-submit-present').observations;
                const errors = app.result.cases.find((c) => c.id === 'gpu-errors-loss').observations;
                check(
                    'two real WASM translators and actual GPU readback and limits',
                    wasm.glslang.instantiated &&
                        wasm.twgsl.instantiated &&
                        wasm.glslang.wasmBytes === 1192271 &&
                        wasm.twgsl.wasmBytes === 1702916 &&
                        wasm.vertex.spirvWords === 273 &&
                        wasm.fragment.spirvWords === 88 &&
                        wasm.vertex.wgsl.includes('@vertex') &&
                        wasm.fragment.wgsl.includes('@fragment') &&
                        equal(gpu.readback.rgba, [255, 0, 0, 255]) &&
                        !/Null backend/i.test(gpu.adapter.device) &&
                        Object.entries(gpu.requiredLimits).every(([key, value]) => gpu.deviceLimits[key] >= value) &&
                        errors.scopedError.length > 0 &&
                        errors.uncapturedError.message.length > 0 &&
                        errors.uncapturedError.defaultPrevented === true &&
                        errors.lost.reason === 'destroyed',
                );
            } else {
                const o = app.result.observations,
                    cleanup = o.cleanup;
                const phases =
                    id === 'air' ? [{ steps: o.render.steps, draws: o.render.draws }] : Object.values(o.phases);
                let prior = 0;
                const clock = phases.every(
                    (p) =>
                        p.draws >= 1 &&
                        p.steps.length > 0 &&
                        p.steps.every(
                            (s) => s.afterDraw === true && Math.abs(s.dt - 1 / 60) < 1e-12 && s.step === ++prior,
                        ),
                );
                check(
                    id + ' controlled clock and actual resource cleanup',
                    clock &&
                        cleanup.nativePacingRestored === true &&
                        cleanup.sceneReleased === true &&
                        cleanup.release.status === 'released' &&
                        !cleanup.failures &&
                        (id === 'air'
                            ? cleanup.meshValid === false &&
                              cleanup.materialValid === false &&
                              o.render.health.gamePaused === true
                            : o.gpuErrors.length === 0 &&
                              Object.values(o.phases).every((p) => p.frame === p.steps.at(-1).step) &&
                              cleanup.resources.every((r) =>
                                  r.contract === 'material-instance-passes'
                                      ? r.destroyRequested === true &&
                                        r.passes === 0 &&
                                        r.bound === false &&
                                        typeof r.valid === 'boolean'
                                      : r.valid === false,
                              )),
                );
                if (id === 'compute') {
                    const a = o.phases.before.state,
                        b = o.phases.after.state;
                    check(
                        'true direct and indirect compute numeric values and offset',
                        equal(
                            a.direct.actual,
                            [11, 26, 35, 46, 59, 74, 91, 110, 131, 154, 179, 206, 235, 266, 299, 334, 371],
                        ) &&
                            equal(
                                b.indirect.actual,
                                [
                                    47, 62, 71, 82, 95, 110, 127, 146, 167, 190, 215, 242, 271, 3735928559, 3735928559,
                                    3735928559, 3735928559,
                                ],
                            ) &&
                            equal(b.indirect.argumentReadback, [0, 12, 1, 1]) &&
                            b.indirect.indirectOffsetBytes === 4 &&
                            a.path === 'compute-readback-material' &&
                            /CPU material/.test(a.visualization),
                    );
                }
            }
            let previousSurface, previousRaw, previousSrgb, previousMeta;
            for (const c of row.captures) {
                const meta = c.metadata,
                    scene = SCENE_IDS.includes(id),
                    kind = scene ? 'scene-' + id : id;
                const prefix = kind + (meta.phase ? '-' + meta.phase : '');
                const surfaceBytes = bytes(dir + '/' + meta.file),
                    rawScreen = bytes(dir + '/' + prefix + '.screen.png');
                const rawCrop = bytes(dir + '/' + prefix + '.screen-crop.png'),
                    srgbScreen = bytes(dir + '/' + prefix + '.screen-srgb.png');
                const srgbCrop = bytes(dir + '/' + prefix + '.screen-srgb-crop.png');
                const colorMeta = json(dir + '/' + prefix + '.screen-color.json');
                const verify = (data, previous) =>
                    scene
                        ? verifyScenePresentation(data, kind, { phase: meta.phase, previousBytes: previous })
                        : verifyPresentation(data, kind);
                const surface = verify(surfaceBytes, previousSurface),
                    rawOracle = verify(rawCrop, previousRaw),
                    compositor = verify(srgbCrop, previousSrgb);
                check(
                    prefix + ' exact raw independent pixels and unchanged oracles',
                    c.pass &&
                        surface.pass &&
                        compositor.pass &&
                        equal(surface, c.surface) &&
                        equal(rawOracle, c.rawOracle) &&
                        equal(compositor, c.compositor) &&
                        sha(surfaceBytes) === meta.sha256 &&
                        sha(rawScreen) === c.screenSha256 &&
                        sha(rawCrop) === c.cropSha256 &&
                        sha(srgbScreen) === c.srgbScreenSha256 &&
                        sha(srgbCrop) === c.srgbCropSha256 &&
                        cropPixels(rawScreen, meta.bounds, rawCrop) &&
                        cropPixels(srgbScreen, meta.bounds, srgbCrop) &&
                        meta.pid === session.pid &&
                        meta.runId === row.runId &&
                        meta.kind === kind &&
                        meta.channel === 'android-pixelcopy' &&
                        meta.resultCode === 0 &&
                        meta.width === 320 &&
                        meta.height === 240 &&
                        meta.bounds.width === 320 &&
                        meta.bounds.height === 240,
                );
                check(
                    prefix + ' actual ICC metadata and frozen transform dependencies',
                    equal(colorMeta, c.normalization.metadata) &&
                        colorMeta.schema === 'air-android-png-icc-normalization-v1' &&
                        colorMeta.completed &&
                        colorMeta.pass &&
                        colorMeta.action === 'icc-to-srgb' &&
                        colorMeta.input.sha256 === sha(rawScreen) &&
                        colorMeta.output.sha256 === sha(srgbScreen) &&
                        colorMeta.input.width === colorMeta.output.width &&
                        colorMeta.input.height === colorMeta.output.height &&
                        colorMeta.icc.sha256 === sha(bytes(dir + '/' + prefix + '.screen-source.icc')) &&
                        colorMeta.icc.sha256 === sha(Buffer.from(colorMeta.icc.base64, 'base64')) &&
                        colorMeta.icc.sha256 === '6e72ac49fd45d1275f29daca1038a0b9af5befd0e891af9267f47ab066a5dffb' &&
                        colorMeta.transform.renderingIntent === 1 &&
                        colorMeta.transform.flags === 0 &&
                        colorMeta.transform.resize === false &&
                        colorMeta.transform.fittedFromExpectedPixels === false &&
                        colorMeta.output.mode === 'RGBA' &&
                        sha(bytes(colorMeta.producer.file)) === colorMeta.producer.sha256 &&
                        Object.values(colorMeta.modules).every((v) => sha(bytes(v.file)) === v.sha256),
                );
                if (meta.phase === 'after')
                    check(
                        prefix + ' before-after pairing',
                        meta.previous.sha256 === previousMeta.sha256 &&
                            meta.previous.file === previousMeta.file &&
                            meta.previous.pid === session.pid &&
                            meta.previous.surfaceGeneration === previousMeta.surfaceGeneration &&
                            meta.surfaceGeneration === previousMeta.surfaceGeneration,
                    );
                replayPlan.push({
                    id: prefix,
                    raw: dir + '/' + prefix + '.screen.png',
                    srgb: dir + '/' + prefix + '.screen-srgb.png',
                    metadata: dir + '/' + prefix + '.screen-color.json',
                    icc: dir + '/' + prefix + '.screen-source.icc',
                    rawCrop: dir + '/' + prefix + '.screen-crop.png',
                    srgbCrop: dir + '/' + prefix + '.screen-srgb-crop.png',
                    bounds: meta.bounds,
                });
                audit.captures.push({
                    id: prefix,
                    pass: surface.pass && compositor.pass,
                    rawOraclePass: rawOracle.pass,
                    rawSha256: sha(rawScreen),
                    srgbSha256: sha(srgbScreen),
                    sourceIccSha256: colorMeta.icc.sha256,
                });
                previousSurface = surfaceBytes;
                previousRaw = rawCrop;
                previousSrgb = srgbCrop;
                previousMeta = meta;
            }
            check(id + ' exact capture count', row.captures.length === (SCENE_IDS.includes(id) ? 2 : 1));
            const admission = json(dir + '/elf-warning-admission.json');
            check(
                id + ' no warning overlay was suppressed',
                admission.action === 'NO_MATCH' &&
                    admission.changesGlobalSettings === false &&
                    sha(bytes(dir + '/elf-warning-ui.xml')) === row.admission.xml.sha256,
            );
            const exit = json(dir + '/native-exit.json');
            const lines = fullLog
                .split(/\r?\n/)
                .filter((line) => new RegExp(`^\\S+\\s+\\S+\\s+${session.pid}\\s+`).test(line));
            const markers = [
                'shutdown-complete',
                'runtime-reset-return',
                'Native SDL_main ended code=0 error=',
                'java-exit-notify-return',
                'Finished main function',
            ];
            const finish = lines.find((line) => line.includes('finish-request') && line.includes(row.runId));
            const sdl = lines.find((line) => line.includes('Finished main function'));
            const elapsed = logTime(sdl || '') - logTime(finish || '');
            const live = table(dir + '/process-table-before-finish.txt'),
                stopped = table(dir + '/process-table-after-stop.txt');
            check(
                id + ' real native exit then physical process cleanup',
                equal(exit, row.nativeExit) &&
                    exit.code === 0 &&
                    !exit.error &&
                    exit.pid === session.pid &&
                    markers.every((value) => lines.some((line) => line.includes(value))) &&
                    elapsed >= 0 &&
                    elapsed < 10000 &&
                    live.some((p) => p.pid === session.pid && p.name === m.package) &&
                    !stopped.some(
                        (p) => p.pid === session.pid || p.name === m.package || p.name.startsWith(m.package + ':'),
                    ) &&
                    row.pidGone &&
                    row.pidGoneCheck.connected &&
                    row.pidGoneCheck.remainingPids.length === 0,
                { pid: session.pid, finishToSDLMainMs: elapsed },
            );
            audit.cases.push({
                id,
                pid: session.pid,
                runId: row.runId,
                nativeExit: exit.code,
                finishToSDLMainMs: elapsed,
            });
        }
        check('ten original capture groups', audit.captures.length === 10 && audit.captures.every((c) => c.pass));
        fs.writeFileSync(path.join(__dirname, 'icc-inputs.json'), JSON.stringify(replayPlan, null, 2) + '\n', {
            flag: 'wx',
        });
        const python = m.colorRuntime.executable.file;
        check(
            'actual Python runtime matches frozen capture toolchain',
            sha(bytes(python)) === m.colorRuntime.executable.sha256 &&
                Object.values(m.colorRuntime.modules).every((v) => sha(bytes(v.file)) === v.sha256),
        );
        const replayOutput = execFileSync(python, [path.join(__dirname, 'replay-icc.py')], {
            encoding: 'utf8',
            timeout: 120000,
            windowsHide: true,
        });
        fs.writeFileSync(path.join(__dirname, 'icc-replay.stdout.txt'), replayOutput, { flag: 'wx' });
        const replay = json(path.relative(root, path.join(__dirname, 'icc-replay.json')));
        check(
            'independent whole-image ImageCms replay and exact crops',
            replay.completed &&
                replay.pass &&
                replay.records.length === 10 &&
                replay.records.every(
                    (r) =>
                        r.pass &&
                        r.wholeImagePixelsExact &&
                        r.rawCropPixelsExact &&
                        r.srgbCropPixelsExact &&
                        r.renderingIntent === 1 &&
                        r.flags === 0,
                ) &&
                Object.entries(replay.modules).every(([name, v]) => v.sha256 === m.colorRuntime.modules[name].sha256),
        );
        const oldDemo = json('output/runtime-interop/android-arm64-demo-attempt-1/report.json');
        audit.demo = {
            includedInMatrixAudit: false,
            retainedAttempt: 'output/runtime-interop/android-arm64-demo-attempt-1/report.json',
            status: oldDemo.status,
            pass: oldDemo.pass,
            completed: oldDemo.completed,
            boundary:
                'Failed HOME/resume attempt retained. Interactive Android lifecycle is not certified by this six-case functional matrix.',
        };
        audit.notes = [
            'Current SDK build number is 216. The number 945 identifies sourceBinding.compared source mappings, not a build number.',
            'GPU readback, PixelCopy, and ADB screen presentation remain separate evidence. Raw Display P3 samples are retained; only standard whole-image ICC-to-sRGB conversion precedes the unchanged existing oracle.',
            'Scene capture uses the original bounded step clock and asserts pause before/during capture; native pacing is restored before actual resource cleanup. MaterialInstance follows its recorded passes=0/unbound/destroyRequested contract; ordinary assets must have valid=false.',
            'Native SDL_main exit occurs before package force-stop. Retained ps tables separately prove the expected live PID before finish and no package/PID afterward.',
            'SDL3/V8 real LOAD alignment is still 4096. This 4096-byte-page phone matrix does not establish 16 KB operation, release readiness, general conformance, or performance.',
        ];
        check(
            'current capture inputs remained unchanged during the offline audit',
            Object.entries(m.inputs).every(([file, hash]) => sha(bytes(file)) === hash),
        );
        audit.completed = true;
        audit.pass = audit.checks.every((c) => c.pass);
    } catch (error) {
        audit.error = String(error.stack || error);
    } finally {
        audit.failedChecks = audit.checks.filter((c) => !c.pass);
        audit.evidenceFilesSha256 = evidence;
        audit.producer = {
            file: path.relative(root, __filename).replaceAll('\\', '/'),
            sha256: sha(fs.readFileSync(__filename)),
            iccReplaySha256: sha(fs.readFileSync(path.join(__dirname, 'replay-icc.py'))),
        };
        audit.finishedAt = new Date().toISOString();
        audit.status = audit.pass ? 'PASS' : 'FAIL';
        fs.writeFileSync(reportFile, JSON.stringify(audit, null, 2) + '\n', { flag: 'wx' });
        console.log(
            JSON.stringify(
                {
                    status: audit.status,
                    completed: audit.completed,
                    checks: audit.checks.length,
                    failedChecks: audit.failedChecks,
                    error: audit.error,
                    captures: audit.captures.length,
                    evidenceFiles: Object.keys(evidence).length,
                    report: path.relative(root, reportFile).replaceAll('\\', '/'),
                },
                null,
                2,
            ),
        );
        if (!audit.pass) process.exitCode = 1;
    }
})();
