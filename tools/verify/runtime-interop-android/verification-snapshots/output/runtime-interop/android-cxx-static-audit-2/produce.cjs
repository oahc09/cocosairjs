/* Offline independent static-runtime and x64 functional audit. No ADB, builds, or input writes. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { isDeepStrictEqual: equal } = require('node:util');
const JSZip = require('jszip');
const { PNG } = require('pngjs');
const root = path.resolve(__dirname, '../../..');
const host = path.join(root, 'output/runtime-interop/mystral-source');
const base = '3cea6b450b71661e114a04b8bde777ff6d29f67f';
const matrixDir = 'output/runtime-interop/android-cxx-static-matrix-attempt-1';
const output = path.join(__dirname, 'report.json');
if (fs.existsSync(output)) throw Error('Preserve the previous audit; use a new attempt');
const { sourceBinding, probesPassed, verifyPresentation } = require(
    path.join(root, 'tools/verify/runtime-interop.cjs'),
);
const { SCENE_IDS, scenePassed } = require(path.join(root, 'tools/verify/runtime-interop/scene-contract.cjs'));
const { verifyScenePresentation } = require(path.join(root, 'tools/verify/runtime-interop/scene-oracles.cjs'));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const evidence = {};
const read = (file) => {
    const data = fs.readFileSync(path.resolve(root, file));
    evidence[file.replaceAll('\\', '/')] = sha(data);
    return data;
};
const json = (file) => JSON.parse(read(file));
const canonical = (v) =>
    JSON.stringify(Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b, 'en'))));
const result = {
    schema: 'air-android-cxx-static-independent-audit-v1',
    startedAt: new Date().toISOString(),
    scope: 'ARM64 build/ELF closure and x86_64 API37 emulator six-case runtime matrix. ARM64 runtime not run.',
    noDeviceOperations: true,
    noBuildOperations: true,
    noSourceOrInputMutations: true,
    checks: [],
    builds: [],
    captures: [],
    cases: [],
    completed: false,
    pass: false,
    arm64Runtime: 'NOT_RUN',
    actual16KBEnvironmentAcceptance: 'NOT_RUN',
    releaseReady: false,
};
const check = (name, pass, details) =>
    result.checks.push({ name, pass: !!pass, ...(details === undefined ? {} : { details }) });
function elf(data) {
    if (!data.subarray(0, 4).equals(Buffer.from([127, 69, 76, 70])) || data[4] !== 2 || data[5] !== 1)
        throw Error('Expected ELF64 little endian');
    const phoff = Number(data.readBigUInt64LE(32)),
        phsize = data.readUInt16LE(54),
        phnum = data.readUInt16LE(56);
    const segments = [];
    for (let i = 0; i < phnum; i++) {
        const p = phoff + i * phsize;
        segments.push({
            type: data.readUInt32LE(p),
            offset: Number(data.readBigUInt64LE(p + 8)),
            vaddr: Number(data.readBigUInt64LE(p + 16)),
            filesz: Number(data.readBigUInt64LE(p + 32)),
            memsz: Number(data.readBigUInt64LE(p + 40)),
            align: Number(data.readBigUInt64LE(p + 48)),
        });
    }
    const loads = segments.filter((p) => p.type === 1),
        dynamic = segments.find((p) => p.type === 2);
    const tags = [];
    for (let p = dynamic.offset; p < dynamic.offset + dynamic.filesz; p += 16) {
        const tag = Number(data.readBigInt64LE(p)),
            value = Number(data.readBigUInt64LE(p + 8));
        if (!tag) break;
        tags.push({ tag, value });
    }
    const straddr = tags.find((x) => x.tag === 5).value;
    const strseg = loads.find((x) => straddr >= x.vaddr && straddr < x.vaddr + x.filesz);
    const strbase = strseg.offset + straddr - strseg.vaddr;
    const needed = tags
        .filter((x) => x.tag === 1)
        .map((x) => data.toString('utf8', strbase + x.value, data.indexOf(0, strbase + x.value)));
    return { machine: data.readUInt16LE(18), needed, loads };
}
function cropEqual(screen, bounds, crop) {
    const a = PNG.sync.read(screen),
        b = PNG.sync.read(crop),
        { x, y, width, height } = bounds;
    if (
        ![x, y, width, height].every(Number.isInteger) ||
        x < 0 ||
        y < 0 ||
        width !== b.width ||
        height !== b.height ||
        x + width > a.width ||
        y + height > a.height
    )
        return false;
    const p = new PNG({ width, height });
    PNG.bitblt(a, p, x, y, width, height, 0, 0);
    return p.data.equals(b.data);
}
function ps(file) {
    const lines = read(file).toString().trim().split(/\r?\n/);
    if (!/^\s*PID\s+NAME\s*$/.test(lines.shift() || '') || !lines.length) throw Error('Invalid ps header/empty table');
    return lines.map((line) => {
        const m = /^\s*(\d+)\s+(.+?)\s*$/.exec(line),
            pid = Number(m?.[1]);
        if (!m || !Number.isSafeInteger(pid) || pid <= 0) throw Error('Invalid ps row');
        return { pid, name: m[2] };
    });
}
function logTime(line) {
    const m = /^\S+\s+(\d+):(\d+):(\d+)\.(\d+)/.exec(line || '');
    return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4] : NaN;
}

(async () => {
    try {
        const diffNames = execFileSync('git', ['-C', host, 'diff', '--name-only', base], { encoding: 'utf8' })
            .trim()
            .split(/\r?\n/)
            .sort();
        const expected = [
            'CMakeLists.txt',
            'android/app/build.gradle.kts',
            'android/app/src/main/java/com/mystral/engine/InteropServer.java',
            'android/app/src/main/java/com/mystral/engine/MystralActivity.java',
            'src/js/v8_engine.cpp',
            'src/platform/android_main.cpp',
        ].sort();
        check('exact six-file source change boundary', equal(diffNames, expected), { base, files: diffNames });
        const diff = execFileSync('git', ['-C', host, 'diff', base, '--', ...expected], { encoding: 'utf8' });
        fs.writeFileSync(path.join(__dirname, 'reviewed-host.diff'), diff, { flag: 'wx' });
        execFileSync('git', ['-C', host, 'diff', '--check', base], { encoding: 'utf8' });
        const cmake = read('output/runtime-interop/mystral-source/CMakeLists.txt').toString();
        const v8Source = read('output/runtime-interop/mystral-source/src/js/v8_engine.cpp').toString();
        const java = read(
            'output/runtime-interop/mystral-source/android/app/src/main/java/com/mystral/engine/MystralActivity.java',
        ).toString();
        check(
            'explicit snapshot mode and real version without fake startup data',
            v8Source.includes('#if defined(__ANDROID__) && MYSTRAL_V8_EXTERNAL_STARTUP_DATA') &&
                v8Source.includes('return v8::V8::GetVersion();') &&
                java.includes('nativeV8StartupMode()') &&
                java.includes('nativeV8Version()') &&
                cmake.includes('c++_static cannot use shared V8'),
        );
        const previousAudit = json('output/runtime-interop/android-cxx-static-audit-1/report.json');
        result.retainedPreviousAudit = {
            file: 'output/runtime-interop/android-cxx-static-audit-1/report.json',
            status: previousAudit.status,
            correction:
                'The first audit incorrectly treated weak optional imports as strong unresolved C++ runtime imports. All weak symbols are retained separately below; no input evidence changed.',
        };
        result.optionalWeakSourceEvidence = [
            'https://github.com/v8/v8/blob/11.6.189.22/src/base/platform/memory-protection-key.cc#L15',
            'https://github.com/v8/v8/blob/11.6.189.22/src/libplatform/default-thread-isolated-allocator.cc#L21',
            'https://github.com/v8/v8/blob/11.6.189.22/src/trap-handler/handler-shared.cc#L29',
            'https://github.com/v8/v8/blob/11.6.189.22/src/common/code-memory-access.cc#L15',
        ];
        const maps = json('output/runtime-interop/android-cxx-static-audit-2/map-report.json');
        check(
            'coherent selected compression and static runtime providers',
            maps.records.length === 2 &&
                maps.records.every(
                    (r) =>
                        r.singleCompressionArchiveProvider &&
                        r.staticRuntimeProviders.some((p) => p.endsWith('/libc++_static.a')) &&
                        r.staticRuntimeProviders.some((p) => p.endsWith('/libc++abi.a')) &&
                        r.selectedCompressionObjects.every(
                            (p) => p.includes('/v8/') && p.includes('/libv8_monolith.a('),
                        ) &&
                        r.cpuSymbols.every((p) => p.provider.includes('/libv8_monolith.a(cpu-features.o)')),
                ),
        );
        const download = json('output/runtime-interop/deps-static-attempt-1/v8-download-receipt.json');
        check(
            'fixed V8 provider and all 119 source files including headers',
            download.pass &&
                download.ref === '0be13f7e2e9034d123744935ea73b410b2085b15' &&
                download.v8Version === '11.6.189.22' &&
                download.files.length === 119 &&
                download.files.every((f) => {
                    const data = read('output/runtime-interop/deps-static-attempt-1/' + f.destination);
                    const blob = crypto
                        .createHash('sha1')
                        .update(Buffer.from('blob ' + data.length + '\0'))
                        .update(data)
                        .digest('hex');
                    return (
                        f.pass &&
                        data.length === f.expectedBytes &&
                        sha(data) === f.sha256 &&
                        blob === f.expectedGitBlobSha1
                    );
                }),
        );
        const nm = 'D:/Android/Sdk/ndk/29.0.14206865/toolchains/llvm/prebuilt/windows-x86_64/bin/llvm-nm.exe';
        const profiles = {};
        for (const directory of ['android-static-build-attempt-1', 'android-static-x64-build-attempt-1']) {
            const dir = 'output/runtime-interop/' + directory,
                b = json(dir + '/build-report.json');
            const apk = read(dir + '/app-debug.apk'),
                archive = await JSZip.loadAsync(apk, { checkCRC32: true });
            const payload = {},
                native = [];
            for (const [file, entry] of Object.entries(archive.files))
                if (!entry.dir && /^(assets\/|lib\/)/.test(file)) {
                    const data = await entry.async('nodebuffer');
                    payload[file] = { bytes: data.length, sha256: sha(data) };
                    if (file.startsWith('lib/')) {
                        const identity = elf(data),
                            localFile = dir + '/' + file;
                        check(directory + ' extracted binary ' + file, read(localFile).equals(data));
                        const undefinedText = execFileSync(nm, ['-D', '-u', path.resolve(root, localFile)], {
                            encoding: 'utf8',
                        });
                        const cppCandidates = undefinedText
                            .split(/\r?\n/)
                            .filter((s) =>
                                /\b(_Z|__gxx_|__cxa_(?:guard|throw|rethrow|allocate_exception|free_exception|pure_virtual))/.test(
                                    s,
                                ),
                            );
                        const cppUndefined = cppCandidates.filter((s) => /^\s*U\s/.test(s));
                        const optionalWeakCppImports = cppCandidates.filter((s) => /^\s*[wv]\s/.test(s));
                        const knownOptional = new Set([
                            '_Z10pkey_allocjj',
                            '_Z13pkey_mprotectPvmii',
                            '_Z8pkey_geti',
                            '_Z8pkey_setij',
                            '_Z9pkey_freei',
                            '_ZTHN2v88internal12trap_handler21g_thread_in_wasm_codeE',
                            '_ZTHN2v88internal19RwxMemoryWriteScope31code_space_write_nesting_level_E',
                        ]);
                        check(
                            directory + ' retained optional weak hooks ' + file,
                            cppCandidates.length === cppUndefined.length + optionalWeakCppImports.length &&
                                optionalWeakCppImports.every((s) => knownOptional.has(s.trim().split(/\s+/).at(-1))),
                            { optionalWeakCppImports },
                        );
                        native.push({ file, ...payload[file], ...identity, cppUndefined, optionalWeakCppImports });
                    }
                }
            check(
                directory + ' exact two SOs and complete shared-library dependency closure',
                native.length === 2 &&
                    native.every(
                        (l) => l.file === `lib/${b.abi}/libSDL3.so` || l.file === `lib/${b.abi}/libmystral-runtime.so`,
                    ) &&
                    native.every((l) => !l.needed.some((n) => /libc\+\+|libv8/.test(n)) && !l.cppUndefined.length) &&
                    native.every((l) =>
                        l.needed.every(
                            (n) =>
                                n === 'libSDL3.so' ||
                                [
                                    'libc.so',
                                    'libm.so',
                                    'libdl.so',
                                    'liblog.so',
                                    'libandroid.so',
                                    'libGLESv1_CM.so',
                                    'libGLESv2.so',
                                    'libGLESv3.so',
                                    'libEGL.so',
                                    'libz.so',
                                    'libOpenSLES.so',
                                ].includes(n),
                        ),
                    ) &&
                    native.every((l) => l.machine === (b.abi === 'arm64-v8a' ? 183 : 62)),
                native.map(({ file, needed, cppUndefined }) => ({ file, needed, cppUndefined })),
            );
            const before = json(dir + '/source-before.json'),
                after = json(dir + '/source-after.json');
            check(
                directory + ' 115 current compiled sources',
                canonical(before) === canonical(after) &&
                    Object.keys(after).length === 115 &&
                    Object.entries(after).every(
                        ([p, h]) => sha(read('output/runtime-interop/mystral-source/' + p)) === h,
                    ) &&
                    b.sourceInputsUnchanged &&
                    b.assetsInputsUnchanged &&
                    b.sourceCount === 115 &&
                    b.sourceBaseCommit === base,
            );
            const command = json(dir + '/command.json'),
                closure = json(dir + '/static-link-closure.json');
            const cache = read(dir + '/CMakeCache.txt').toString();
            const map = maps.records.find((r) => r.file.startsWith(dir + '/'));
            check(
                directory + ' normal static link and actual map',
                command.pass &&
                    command.exitCode === 0 &&
                    command.arguments.includes('-PmystralAndroidStl=c++_static') &&
                    command.arguments.includes('-PmystralV8LibraryKind=static') &&
                    command.arguments.includes('-PmystralV8StartupData=embedded') &&
                    !/allow-multiple-definition|FORCE:MULTIPLE/.test(JSON.stringify(command)) &&
                    !/allow-multiple-definition|FORCE:MULTIPLE/.test(cache) &&
                    /^ANDROID_STL:[^=]+=c\+\+_static$/m.test(cache) &&
                    sha(read(map.file)) === map.sha256 &&
                    closure.normalLinkWithoutDuplicateSuppression &&
                    closure.cppUndefinedSymbols.length === 0 &&
                    closure.cppRuntimeCopiesInOtherApplicationDSOs === 0,
            );
            check(
                directory + ' actual APK profile and assets',
                b.compiled &&
                    b.signatureVerified &&
                    b.pass &&
                    b.androidStl === 'c++_static' &&
                    b.v8LibraryKind === 'static' &&
                    b.v8StartupMode === 'embedded' &&
                    b.v8Version === '11.6.189.22' &&
                    b.apk.sha256 === sha(apk) &&
                    b.apk.bytes === apk.length &&
                    b.payload.assetCount === 29 &&
                    b.payload.apkAssets === 29 &&
                    Object.entries(b.payload.assets).every(([p, h]) => payload['assets/' + p]?.sha256 === h) &&
                    Object.keys(payload).filter((p) => p.startsWith('assets/')).length === 29 &&
                    !Object.keys(payload).some((p) =>
                        /assets\/v8\/|snapshot_blob|libv8android|libc\+\+_shared/.test(p),
                    ) &&
                    /Verifies/.test(read(dir + '/apksigner.stdout').toString()),
            );
            const monolith = 'output/runtime-interop/deps-static-attempt-1/v8/' + b.abi + '/libv8_monolith.a';
            check(
                directory + ' actual static V8 archive fingerprint',
                sha(read(monolith)) === b.payload.v8StaticArchiveSha256,
            );
            profiles[b.abi] = { build: b, payload, source: after, buildDir: dir };
            result.builds.push({
                abi: b.abi,
                apk: { file: dir + '/app-debug.apk', sha256: sha(apk), bytes: apk.length },
                nativeLibraries: native,
                staticArchiveSha256: b.payload.v8StaticArchiveSha256,
                runtimeAcceptance: b.abi === 'arm64-v8a' ? 'NOT_RUN' : 'Audited separately below',
            });
        }
        check(
            'ARM64/x64 identical compiled source inputs',
            canonical(profiles['arm64-v8a'].source) === canonical(profiles.x86_64.source),
        );
        const m = json(matrixDir + '/report.json');
        const mismatches = Object.entries(m.inputs)
            .filter(([p, h]) => sha(read(p)) !== h)
            .map(([p]) => p);
        check(
            'completed x64 six-case matrix and every current input',
            m.pass &&
                m.completed &&
                m.inputsUnchanged &&
                !mismatches.length &&
                m.device.emulator === true &&
                m.physicalAcceptance === false &&
                m.simulatorAcceptance === true &&
                m.device.pageSize === 4096 &&
                m.releaseReady === false &&
                equal(m.requiredCases, ['probes', 'air', ...SCENE_IDS]),
            { count: Object.keys(m.inputs).length, mismatches },
        );
        const manifest = json(m.assetsManifest.file),
            bundle = read(manifest.bundle.file),
            binding = sourceBinding(path.resolve(root, manifest.bundle.file));
        check(
            'same real SDK source binding and installed candidate',
            binding.matches &&
                binding.compared === 945 &&
                sha(bundle) === '417509cb4774f85346158c7c27f580a7afe5ace70c7486e095b4bbb216de518a' &&
                m.apk.sha256 === profiles.x86_64.build.apk.sha256 &&
                m.installedSha256 === m.apk.sha256 &&
                sha(read(m.hostBuild.file)) === m.hostBuild.sha256 &&
                canonical(profiles.x86_64.source) &&
                sha(Buffer.from(canonical(profiles.x86_64.source))) === m.hostBuild.compiledSourcesSha256,
        );
        const log = read(matrixDir + '/logcat.txt').toString();
        for (const row of m.cases) {
            const id = row.caseId,
                dir = matrixDir + '/' + id,
                app = json(dir + '/app-report.json'),
                session = json(dir + '/session.json');
            check(
                id + ' unchanged application contract and actual V8 boot',
                row.pass &&
                    row.completed &&
                    app.pass &&
                    app.completed &&
                    equal(app, row.application) &&
                    app.runId === row.runId &&
                    session.runId === row.runId &&
                    app.consoleErrors.length === 0 &&
                    row.runtime.loadedABI === 'x86_64' &&
                    row.runtime.v8StartupMode === 'embedded' &&
                    row.runtime.v8Version === '11.6.189.22' &&
                    row.runtime.jsEngine === 'v8' &&
                    row.runtime.backend === 'dawn' &&
                    row.runtime.nativeStarted &&
                    !Object.hasOwn(row.runtime, 'snapshotSha256') &&
                    !Object.hasOwn(row.runtime, 'snapshotPath') &&
                    (id === 'probes'
                        ? probesPassed(app.result)
                        : id === 'air'
                          ? app.result.status === 'PASS'
                          : scenePassed(app.result, id)),
            );
            if (id === 'probes') {
                const wasm = app.result.cases.find((c) => c.id === 'wasm-shader').observations;
                const modules = app.result.cases.find((c) => c.id === 'module-assets').observations;
                const gpu = app.result.cases.find((c) => c.id === 'gpu-submit-present').observations;
                const errors = app.result.cases.find((c) => c.id === 'gpu-errors-loss').observations;
                check(
                    'static V8 actual module and two real WASM factories',
                    modules.module.token === 'air-runtime-interop-fixture-v1' &&
                        wasm.glslang.instantiated &&
                        wasm.twgsl.instantiated &&
                        wasm.glslang.wasmBytes === 1192271 &&
                        wasm.twgsl.wasmBytes === 1702916 &&
                        wasm.vertex.spirvWords === 273 &&
                        wasm.fragment.spirvWords === 88 &&
                        wasm.vertex.wgsl.includes('@vertex') &&
                        wasm.fragment.wgsl.includes('@fragment') &&
                        equal(gpu.readback.rgba, [255, 0, 0, 255]) &&
                        !/Null backend/.test(gpu.adapter.device) &&
                        errors.lost.reason === 'destroyed' &&
                        errors.scopedError &&
                        errors.uncapturedError.message &&
                        errors.uncapturedError.defaultPrevented,
                );
            } else {
                const o = app.result.observations,
                    cleanup = o.cleanup;
                const phases =
                    id === 'air' ? [{ steps: o.render.steps, draws: o.render.draws }] : Object.values(o.phases);
                let step = 0;
                check(
                    id + ' original step clock and resources',
                    phases.every(
                        (p) =>
                            p.draws >= 1 &&
                            p.steps.every((s) => s.afterDraw && Math.abs(s.dt - 1 / 60) < 1e-12 && s.step === ++step),
                    ) &&
                        cleanup.nativePacingRestored &&
                        cleanup.sceneReleased &&
                        cleanup.release.status === 'released' &&
                        !cleanup.failures &&
                        (id === 'air'
                            ? cleanup.meshValid === false && cleanup.materialValid === false
                            : cleanup.resources.every((r) =>
                                  r.contract === 'material-instance-passes'
                                      ? r.destroyRequested && r.passes === 0 && r.bound === false
                                      : r.valid === false,
                              )),
                );
            }
            let previousSurface, previousCrop, previous;
            for (const c of row.captures) {
                const meta = c.metadata,
                    scene = SCENE_IDS.includes(id),
                    kind = scene ? 'scene-' + id : id,
                    prefix = kind + (meta.phase ? '-' + meta.phase : '');
                const pc = read(dir + '/' + meta.file),
                    raw = read(dir + '/' + prefix + '.screen.png'),
                    rawCrop = read(dir + '/' + prefix + '.screen-crop.png');
                const srgb = read(dir + '/' + prefix + '.screen-srgb.png'),
                    crop = read(dir + '/' + prefix + '.screen-srgb-crop.png');
                const color = json(dir + '/' + prefix + '.screen-color.json');
                const verify = (b, p) =>
                    scene
                        ? verifyScenePresentation(b, kind, { phase: meta.phase, previousBytes: p })
                        : verifyPresentation(b, kind);
                const surface = verify(pc, previousSurface),
                    compositor = verify(crop, previousCrop),
                    rawOracle = verify(rawCrop, previousCrop);
                check(
                    prefix + ' independent raw pixels and original oracles',
                    c.pass &&
                        surface.pass &&
                        compositor.pass &&
                        equal(surface, c.surface) &&
                        equal(compositor, c.compositor) &&
                        equal(rawOracle, c.rawOracle) &&
                        sha(pc) === meta.sha256 &&
                        sha(raw) === c.screenSha256 &&
                        sha(rawCrop) === c.cropSha256 &&
                        sha(srgb) === c.srgbScreenSha256 &&
                        sha(crop) === c.srgbCropSha256 &&
                        raw.equals(srgb) &&
                        cropEqual(raw, meta.bounds, rawCrop) &&
                        cropEqual(srgb, meta.bounds, crop) &&
                        meta.pid === session.pid &&
                        meta.runId === row.runId &&
                        meta.resultCode === 0 &&
                        meta.channel === 'android-pixelcopy' &&
                        meta.width === 320 &&
                        meta.height === 240 &&
                        color.action === 'no-icc-byte-preserving-copy' &&
                        color.icc.present === false &&
                        color.transform === null &&
                        equal(color, c.normalization.metadata) &&
                        color.input.sha256 === sha(raw) &&
                        color.output.sha256 === sha(srgb),
                );
                if (meta.phase === 'after')
                    check(
                        prefix + ' true before pair',
                        meta.previous.sha256 === previous.sha256 &&
                            meta.previous.file === previous.file &&
                            meta.previous.pid === session.pid &&
                            meta.previous.surfaceGeneration === meta.surfaceGeneration &&
                            previous.surfaceGeneration === meta.surfaceGeneration,
                    );
                result.captures.push({
                    id: prefix,
                    pass: surface.pass && compositor.pass,
                    rawSha256: sha(raw),
                    pixelCopySha256: sha(pc),
                });
                previousSurface = pc;
                previousCrop = crop;
                previous = meta;
            }
            const exit = json(dir + '/native-exit.json');
            const lines = log.split(/\r?\n/).filter((s) => new RegExp(`^\\S+\\s+\\S+\\s+${session.pid}\\s+`).test(s));
            const finish = lines.find((s) => s.includes('finish-request') && s.includes(row.runId)),
                end = lines.find((s) => s.includes('Finished main function'));
            const elapsed = logTime(end) - logTime(finish),
                live = ps(dir + '/process-table-before-finish.txt'),
                gone = ps(dir + '/process-table-after-stop.txt');
            check(
                id + ' actual SDL exit and physical cleanup',
                equal(exit, row.nativeExit) &&
                    exit.pid === session.pid &&
                    exit.code === 0 &&
                    !exit.error &&
                    [
                        'shutdown-complete',
                        'runtime-reset-return',
                        'Native SDL_main ended code=0 error=',
                        'java-exit-notify-return',
                        'Finished main function',
                    ].every((s) => lines.some((l) => l.includes(s))) &&
                    elapsed >= 0 &&
                    elapsed < 10000 &&
                    live.some((p) => p.pid === session.pid && p.name === m.package) &&
                    !gone.some(
                        (p) => p.pid === session.pid || p.name === m.package || p.name.startsWith(m.package + ':'),
                    ) &&
                    row.pidGone &&
                    row.pidGoneCheck.connected,
                { pid: session.pid, finishToSDLMainMs: elapsed },
            );
            result.cases.push({ id, pid: session.pid, nativeExit: exit.code });
        }
        check(
            'full fixed functional matrix capture count',
            result.cases.length === 6 && result.captures.length === 10 && result.captures.every((c) => c.pass),
        );
        check(
            'inputs still unchanged after offline audit',
            Object.entries(m.inputs).every(([p, h]) => sha(read(p)) === h),
        );
        result.notes = [
            'Exactly one packaged application DSO owns C++: libmystral-runtime.so. SDL3 remains a C-only DSO; no libc++_shared.so or libv8android.so is packaged or needed.',
            'Both maps select a coherent V8 compression implementation. No concrete mixed private-zlib-object ABI defect is identified; normal linking alone was not the evidence for this conclusion.',
            'Existing original module/WASM/GPU/presentation/cleanup contracts pass on native x64 emulator. ARM64 build and ELF closure do not establish ARM64 execution.',
            'SDL3 remains 3.2.8 with real 4096-byte LOAD segments. Static C++ linkage does not establish 16 KB compatibility or release readiness.',
        ];
        result.completed = true;
        result.pass = result.checks.every((c) => c.pass);
    } catch (error) {
        result.error = String(error.stack || error);
    } finally {
        result.status = result.pass ? 'PASS' : 'FAIL';
        result.failedChecks = result.checks.filter((c) => !c.pass);
        result.evidenceFilesSha256 = evidence;
        result.producer = {
            file: path.relative(root, __filename).replaceAll('\\', '/'),
            sha256: sha(fs.readFileSync(__filename)),
        };
        result.finishedAt = new Date().toISOString();
        fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
        console.log(
            JSON.stringify(
                {
                    status: result.status,
                    completed: result.completed,
                    checks: result.checks.length,
                    failedChecks: result.failedChecks,
                    error: result.error,
                    captures: result.captures.length,
                    evidenceFiles: Object.keys(evidence).length,
                    report: path.relative(root, output).replaceAll('\\', '/'),
                },
                null,
                2,
            ),
        );
        if (!result.pass) process.exitCode = 1;
    }
})();
