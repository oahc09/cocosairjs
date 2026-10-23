// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Writes only the chosen output directory. Native is a diagnostic, not WASM evidence.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, relative, basename } from 'node:path';
import { root, sha256, verifySources } from './verify-sources.mjs';
import { inspectWasmMemory } from './verify-wasm.mjs';
import { readPatchPlan, stageCore, verifyStagedCore } from './patch-intake.mjs';

const native = process.argv.includes('--native');
const debug = process.argv.includes('--debug');
const sanitize = process.argv.includes('--sanitize');
if (sanitize && !native) throw new Error('--sanitize currently applies only to native diagnostic builds');
const outIndex = process.argv.indexOf('--out');
const out = resolve(
    root,
    outIndex < 0
        ? `tools/physics/box3d/output/${native ? 'native' : 'wasm'}-${debug ? 'debug' : 'release'}${sanitize ? '-sanitized' : ''}`
        : process.argv[outIndex + 1],
);
if (existsSync(out)) throw new Error(`Keep previous raw evidence; select a new --out directory: ${out}`);
mkdirSync(out, { recursive: true });
const result = {
    schemaVersion: 1,
    kind: native ? 'native-diagnostic' : 'st-simd-wasm',
    mode: debug ? 'Debug' : 'Release',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    commands: [],
};
const receipt = () => writeFileSync(resolve(out, 'build-receipt.json'), JSON.stringify(result, null, 2) + '\n');
function run(command, args) {
    result.commands.push({ command, args: args.map((a) => a.replaceAll(root, '<repo>').replaceAll(out, '<output>')) });
    const r = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const n = result.commands.length;
    writeFileSync(resolve(out, `command-${n}.stdout.txt`), r.stdout ?? '');
    writeFileSync(resolve(out, `command-${n}.stderr.txt`), r.stderr ?? '');
    Object.assign(result.commands[n - 1], { exitCode: r.status, error: r.error?.message ?? null });
    receipt();
    if (r.error || r.status !== 0) throw new Error(`${command} failed: ${r.error?.message ?? r.stderr}`);
    return r.stdout;
}
try {
    result.sources = verifySources();
    result.queryAdmission = JSON.parse(run(process.execPath, ['tools/physics/box3d/query-admission-contract.mjs']));
    if (result.queryAdmission.status !== 'PASS_ADMISSION_NO_NATIVE_CALLS') throw new Error('Query admission failed');
    const motionSources = run(process.execPath, ['tools/physics/box3d/motion-source-controls.mjs']);
    result.motionSourceControls = JSON.parse(motionSources);
    if (result.motionSourceControls.status !== 'PASS_SOURCE_CONTROLS_ONLY')
        throw new Error('Motion source controls failed');
    const commandSources = run(process.execPath, ['tools/physics/box3d/command-source-controls.mjs']);
    result.commandSourceControls = JSON.parse(commandSources);
    if (result.commandSourceControls.status !== 'PASS_SOURCE_CONTROLS_ONLY')
        throw new Error('Command source controls failed');
    const lock = JSON.parse(readFileSync(resolve(root, 'tools/physics/box3d/versions.lock.json'), 'utf8'));
    const patchPlan = readPatchPlan();
    const stagedCore = resolve(out, 'staged-core');
    result.stagedCore = stageCore(stagedCore, patchPlan);
    result.identity = {
        patchChainSha256: patchPlan.patchChainSha256,
        coreSha: lock.core.commit,
        bindingBaseSha: lock.bindingBase.commit,
        abiVersion: 1,
        schemaSha256: result.sources.schemaSha256,
    };
    const sources = readdirSync(resolve(stagedCore, 'src'))
        .filter((x) => x.endsWith('.c'))
        .sort();
    if (native) {
        const cc = process.env.CC ?? 'gcc';
        result.compiler = run(cc, ['--version']).trim();
        const flags = [
            '-std=gnu17',
            '-fno-fast-math',
            '-ffp-contract=off',
            '-DBOX3D_DISABLE_AVX2',
            '-DBOX3D_VALIDATE',
            ...(debug ? ['-O0', '-g'] : ['-O2', '-DNDEBUG']),
            ...(sanitize
                ? ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer']
                : []),
            `-I${stagedCore}/include`,
            `-I${stagedCore}/src`,
            '-Itools/physics/box3d/native',
            `-DAIR_B3_SCHEMA_SHA="${result.sources.schemaSha256}"`,
            `-DAIR_B3_PATCH_CHAIN_SHA="${patchPlan.patchChainSha256}"`,
        ];
        const objects = [];
        const commands = [];
        for (const source of [
            ...sources.map((s) => resolve(stagedCore, 'src', s)),
            'tools/physics/box3d/native/air_box3d.c',
            'tools/physics/box3d/native/snapshot.c',
            'tools/physics/box3d/native/geometry.c',
            'tools/physics/box3d/native/world_bridge.c',
            'tools/physics/box3d/native/body_control.c',
            'tools/physics/box3d/native/filter_bridge.c',
            'tools/physics/box3d/native/motion_bridge.c',
            'tools/physics/box3d/native/command_bridge.c',
            'tools/physics/box3d/native/query_bridge.c',
            'tools/physics/box3d/native/hull_bridge.c',
            'tools/physics/box3d/native/contract.c',
        ]) {
            const object = resolve(out, basename(source) + '.o');
            const args = [...flags, '-c', source, '-o', object];
            run(cc, args);
            objects.push(object);
            commands.push({ directory: root, file: resolve(root, source), arguments: [cc, ...args] });
        }
        writeFileSync(resolve(out, 'compile_commands.json'), JSON.stringify(commands, null, 2) + '\n');
        const exe = resolve(out, 'native-contract');
        run(cc, [...objects, ...(sanitize ? ['-fsanitize=address,undefined'] : []), '-lm', '-o', exe]);
        const raw = run(exe, []);
        writeFileSync(resolve(out, 'contract.raw.json'), raw);
        const contract = JSON.parse(raw);
        if (
            contract.status !== 'PASS' ||
            contract.schemaSha256 !== result.sources.schemaSha256 ||
            contract.patchChainSha256 !== patchPlan.patchChainSha256
        )
            throw new Error('Native contract did not pass current schema');
        result.contract = contract;
        const geometryExe = resolve(out, 'native-geometry-contract');
        run(cc, [
            ...flags,
            'tools/physics/box3d/native/geometry_contract.c',
            ...objects.filter((file) => !file.endsWith('/contract.c.o')),
            ...(sanitize ? ['-fsanitize=address,undefined'] : []),
            '-lm',
            '-o',
            geometryExe,
        ]);
        const geometryRaw = run(geometryExe, []);
        writeFileSync(resolve(out, 'native-geometry-contract.raw.json'), geometryRaw);
        result.geometryContract = JSON.parse(geometryRaw);
        if (result.geometryContract.status !== 'PASS') throw new Error('Native geometry contract failed');
        const worldExe = resolve(out, 'native-world-contract');
        run(cc, [
            ...flags,
            'tools/physics/box3d/native/world_contract.c',
            ...objects.filter((file) => !file.endsWith('/contract.c.o') && !file.endsWith('/world_bridge.c.o')),
            ...(sanitize ? ['-fsanitize=address,undefined'] : []),
            '-lm',
            '-o',
            worldExe,
        ]);
        const worldRaw = run(worldExe, []);
        writeFileSync(resolve(out, 'native-world-contract.raw.json'), worldRaw);
        result.worldContract = JSON.parse(worldRaw);
        if (result.worldContract.status !== 'PASS') throw new Error('Native world contract failed');
        const bodyExe = resolve(out, 'native-body-contract');
        run(cc, [
            ...flags,
            'tools/physics/box3d/native/body_contract.c',
            ...objects.filter((file) => !file.endsWith('/contract.c.o')),
            ...(sanitize ? ['-fsanitize=address,undefined'] : []),
            '-lm',
            '-o',
            bodyExe,
        ]);
        const bodyRaw = run(bodyExe, []);
        writeFileSync(resolve(out, 'native-body-contract.raw.json'), bodyRaw);
        result.bodyContract = JSON.parse(bodyRaw);
        if (result.bodyContract.status !== 'PASS') throw new Error('Native body contract failed');
        const filterExe = resolve(out, 'native-filter-contract');
        run(cc, [
            ...flags,
            'tools/physics/box3d/native/filter_contract.c',
            ...objects.filter((file) => !file.endsWith('/contract.c.o')),
            ...(sanitize ? ['-fsanitize=address,undefined'] : []),
            '-lm',
            '-o',
            filterExe,
        ]);
        const filterRaw = run(filterExe, []);
        writeFileSync(resolve(out, 'native-filter-contract.raw.json'), filterRaw);
        result.filterContract = JSON.parse(filterRaw);
        if (result.filterContract.status !== 'PASS') throw new Error('Native filter contract failed');
        const motionExe = resolve(out, 'native-motion-contract');
        run(cc, [
            ...flags,
            'tools/physics/box3d/native/motion_contract.c',
            ...objects.filter((file) => !file.endsWith('/contract.c.o') && !file.endsWith('/world_bridge.c.o')),
            ...(sanitize ? ['-fsanitize=address,undefined'] : []),
            '-lm',
            '-o',
            motionExe,
        ]);
        const motionRaw = run(motionExe, []);
        writeFileSync(resolve(out, 'native-motion-contract.raw.json'), motionRaw);
        result.motionContract = JSON.parse(motionRaw);
        if (result.motionContract.status !== 'PASS') throw new Error('Native motion contract failed');
        const commandExe = resolve(out, 'native-command-contract');
        run(cc, [
            ...flags,
            'tools/physics/box3d/native/command_contract.c',
            ...objects.filter((file) => !file.endsWith('/contract.c.o') && !file.endsWith('/world_bridge.c.o')),
            ...(sanitize ? ['-fsanitize=address,undefined'] : []),
            '-lm',
            '-o',
            commandExe,
        ]);
        const commandRaw = run(commandExe, []);
        writeFileSync(resolve(out, 'native-command-contract.raw.json'), commandRaw);
        result.commandContract = JSON.parse(commandRaw);
        if (result.commandContract.status !== 'PASS') throw new Error('Native command contract failed');
        const queryExe = resolve(out, 'native-query-contract');
        run(cc, [
            ...flags,
            'tools/physics/box3d/native/query_contract.c',
            ...objects.filter((file) => !file.endsWith('/contract.c.o')),
            ...(sanitize ? ['-fsanitize=address,undefined'] : []),
            '-lm',
            '-o',
            queryExe,
        ]);
        const queryRaw = run(queryExe, []);
        writeFileSync(resolve(out, 'native-query-contract.raw.json'), queryRaw);
        result.queryContract = JSON.parse(queryRaw);
        if (result.queryContract.status !== 'PASS') throw new Error('Native query contract failed');
        const capsuleExe = resolve(out, 'native-capsule-contract');
        run(cc, [
            ...flags,
            'tools/physics/box3d/native/capsule_contract.c',
            ...objects.filter((file) => !file.endsWith('/contract.c.o') && !file.endsWith('/world_bridge.c.o')),
            ...(sanitize ? ['-fsanitize=address,undefined'] : []),
            '-lm',
            '-o',
            capsuleExe,
        ]);
        const capsuleRaw = run(capsuleExe, []);
        writeFileSync(resolve(out, 'native-capsule-contract.raw.json'), capsuleRaw);
        result.capsuleContract = JSON.parse(capsuleRaw);
        if (result.capsuleContract.status !== 'PASS') throw new Error('Native capsule contract failed');
        // Real point-cloud tests, including exact private core workspace/containment.
        for (const [name, omitted, field] of [
            ['hull', ['world_bridge.c.o'], 'hullContract'],
            ['hull-core', ['hull.c.o'], 'hullCoreContract'],
            ['hull-legacy-fingerprint', [], null],
        ]) {
            const source =
                name === 'hull-legacy-fingerprint'
                    ? 'hull_legacy_fingerprint.c'
                    : `${name.replaceAll('-', '_')}_contract.c`;
            const executable = resolve(out, `native-${name}${field ? '-contract' : ''}`);
            run(cc, [
                ...flags,
                `tools/physics/box3d/native/${source}`,
                ...objects.filter(
                    (file) => !file.endsWith('/contract.c.o') && !omitted.some((suffix) => file.endsWith('/' + suffix)),
                ),
                ...(sanitize ? ['-fsanitize=address,undefined'] : []),
                '-lm',
                '-o',
                executable,
            ]);
            if (field) {
                const raw = run(executable, []);
                writeFileSync(resolve(out, `native-${name}-contract.raw.json`), raw);
                result[field] = JSON.parse(raw);
                if (result[field].status !== 'PASS') throw new Error(`Native ${name} contract failed`);
            }
        }
        const legacyRaw = run(process.execPath, [
            'tools/physics/box3d/hull-legacy-contract.mjs',
            out,
            '--native',
            ...(debug ? ['--debug'] : []),
            ...(sanitize ? ['--sanitize'] : []),
        ]);
        result.hullLegacyComparison = JSON.parse(legacyRaw);
        if (result.hullLegacyComparison.status !== 'PASS')
            throw new Error('Independent old/new native Hull comparison failed');
        result.artifacts = [
            { path: 'native-contract', sha256: sha256(readFileSync(exe)), bytes: readFileSync(exe).length },
        ];
    } else {
        const compiler = run('emcc', ['--version']);
        if (!new RegExp(`\\b${lock.emsdk.candidateVersion.replaceAll('.', '\\.')}\\b`).test(compiler))
            throw new Error('Emscripten differs from the reviewed candidate; review before changing the lock');
        result.compiler = compiler.trim();
        run('cmake', ['--version']);
        run('emcmake', [
            'cmake',
            '-S',
            'tools/physics/box3d',
            '-B',
            out,
            `-DCMAKE_BUILD_TYPE=${result.mode}`,
            `-DAIR_STAGED_CORE=${stagedCore}`,
            `-DAIR_PATCH_CHAIN_SHA=${patchPlan.patchChainSha256}`,
        ]);
        run('cmake', ['--build', out, '--parallel', '1']);
        const commands = JSON.parse(readFileSync(resolve(out, 'compile_commands.json'), 'utf8'));
        for (const command of commands) {
            const text = command.command ?? command.arguments.join(' ');
            if (
                /pthread|SHARED_MEMORY|USE_PTHREADS|-ffast-math|-Ofast/.test(text) ||
                !text.includes('-msimd128') ||
                !text.includes('-msse2') ||
                !text.includes('-ffp-contract=off')
            )
                throw new Error(`Non-ST compile flags: ${command.file}`);
        }
        const wasm = readFileSync(resolve(out, 'box3d-st.wasm'));
        const loader = readFileSync(resolve(out, 'box3d-st.mjs'), 'utf8');
        if (/\bnew\s+Function\s*\(|\beval\s*\(|\bnew\s+Worker\s*\(/.test(loader))
            throw new Error('Generated loader uses forbidden dynamic JS or worker');
        result.wasmMemory = inspectWasmMemory(wasm);
        const compiled = await WebAssembly.compile(wasm);
        if (WebAssembly.Module.imports(compiled).some((i) => /pthread|worker|atomic/i.test(i.name)))
            throw new Error('Thread-related WASM import');
        copyFileSync(resolve(root, 'src/air/physics/box3d/binding/facade.mjs'), resolve(out, 'facade.mjs'));
        copyFileSync(resolve(root, 'src/air/physics/box3d/binding/facade.d.mts'), resolve(out, 'facade.d.mts'));
        const identity = { ...result.identity, variant: 'st-simd' };
        const artifacts = ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts'].map((path) => {
            const data = readFileSync(resolve(out, path));
            return { path, sha256: sha256(data), bytes: data.length };
        });
        writeFileSync(
            resolve(out, 'manifest.json'),
            JSON.stringify(
                {
                    schemaVersion: 1,
                    ...identity,
                    patchLockSha256: patchPlan.patchLockSha256,
                    appliedPatches: patchPlan.lock.patches,
                    artifacts,
                },
                null,
                2,
            ) + '\n',
        );
        const geometryRaw = run(process.execPath, [resolve(out, 'air_box3d_geometry_contract.cjs')]);
        writeFileSync(resolve(out, 'native-geometry-contract.raw.json'), geometryRaw);
        result.geometryContract = JSON.parse(geometryRaw);
        if (result.geometryContract.status !== 'PASS' || result.geometryContract.pointerBytes !== 4)
            throw new Error('WASM32 geometry native contract failed');
        const worldRaw = run(process.execPath, [resolve(out, 'air_box3d_world_contract.cjs')]);
        writeFileSync(resolve(out, 'native-world-contract.raw.json'), worldRaw);
        result.worldContract = JSON.parse(worldRaw);
        if (result.worldContract.status !== 'PASS' || result.worldContract.pointerBytes !== 4)
            throw new Error('WASM32 world native contract failed');
        const bodyRaw = run(process.execPath, [resolve(out, 'air_box3d_body_contract.cjs')]);
        writeFileSync(resolve(out, 'native-body-contract.raw.json'), bodyRaw);
        result.bodyContract = JSON.parse(bodyRaw);
        if (result.bodyContract.status !== 'PASS' || result.bodyContract.pointerBytes !== 4)
            throw new Error('WASM32 body native contract failed');
        const filterRaw = run(process.execPath, [resolve(out, 'air_box3d_filter_contract.cjs')]);
        writeFileSync(resolve(out, 'native-filter-contract.raw.json'), filterRaw);
        result.filterContract = JSON.parse(filterRaw);
        if (result.filterContract.status !== 'PASS' || result.filterContract.pointerBytes !== 4)
            throw new Error('WASM32 filter native contract failed');
        const motionRaw = run(process.execPath, [resolve(out, 'air_box3d_motion_contract.cjs')]);
        writeFileSync(resolve(out, 'native-motion-contract.raw.json'), motionRaw);
        result.motionContract = JSON.parse(motionRaw);
        if (result.motionContract.status !== 'PASS' || result.motionContract.pointerBytes !== 4)
            throw new Error('WASM32 motion native contract failed');
        const commandRaw = run(process.execPath, [resolve(out, 'air_box3d_command_contract.cjs')]);
        writeFileSync(resolve(out, 'native-command-contract.raw.json'), commandRaw);
        result.commandContract = JSON.parse(commandRaw);
        if (result.commandContract.status !== 'PASS' || result.commandContract.pointerBytes !== 4)
            throw new Error('WASM32 command native contract failed');
        const queryRaw = run(process.execPath, [resolve(out, 'air_box3d_query_contract.cjs')]);
        writeFileSync(resolve(out, 'native-query-contract.raw.json'), queryRaw);
        result.queryContract = JSON.parse(queryRaw);
        if (result.queryContract.status !== 'PASS' || result.queryContract.pointerBytes !== 4)
            throw new Error('WASM32 query native contract failed');
        const capsuleRaw = run(process.execPath, [resolve(out, 'air_box3d_capsule_contract.cjs')]);
        writeFileSync(resolve(out, 'native-capsule-contract.raw.json'), capsuleRaw);
        result.capsuleContract = JSON.parse(capsuleRaw);
        if (result.capsuleContract.status !== 'PASS' || result.capsuleContract.pointerBytes !== 4)
            throw new Error('WASM32 capsule native contract failed');
        for (const [name, field] of [
            ['hull', 'hullContract'],
            ['hull-core', 'hullCoreContract'],
        ]) {
            const raw = run(process.execPath, [resolve(out, `air_box3d_${name.replaceAll('-', '_')}_contract.cjs`)]);
            writeFileSync(resolve(out, `native-${name}-contract.raw.json`), raw);
            result[field] = JSON.parse(raw);
            if (result[field].status !== 'PASS' || result[field].pointerBytes !== 4)
                throw new Error(`WASM32 ${name} native contract failed`);
        }
        const legacyRaw = run(process.execPath, [
            'tools/physics/box3d/hull-legacy-contract.mjs',
            out,
            ...(debug ? ['--debug'] : []),
        ]);
        result.hullLegacyComparison = JSON.parse(legacyRaw);
        if (result.hullLegacyComparison.status !== 'PASS')
            throw new Error('Independent old/new WASM Hull comparison failed');
        run(process.execPath, ['tools/physics/box3d/wasm-contract.mjs', out]);
        run(process.execPath, ['tools/physics/box3d/wasm-ownership-contract.mjs', out]);
        run(process.execPath, ['tools/physics/box3d/wasm-snapshot-contract.mjs', out]);
        run(process.execPath, ['tools/physics/box3d/wasm-geometry-contract.mjs', out]);
        run(process.execPath, ['tools/physics/box3d/wasm-world-contract.mjs', out]);
        run(process.execPath, ['tools/physics/box3d/wasm-body-contract.mjs', out]);
        run(process.execPath, ['tools/physics/box3d/wasm-filter-contract.mjs', out]);
        run(process.execPath, ['tools/physics/box3d/wasm-motion-contract.mjs', out]);
        run(process.execPath, ['tools/physics/box3d/wasm-command-contract.mjs', out]);
        run(process.execPath, ['tools/physics/box3d/wasm-query-contract.mjs', out]);
        result.artifacts = artifacts;
        result.browserStatus = 'NOT_RUN';
    }
    verifyStagedCore(stagedCore, patchPlan);
    result.status = 'PASS';
} catch (error) {
    result.status = result.commands.some((c) => c.error?.includes('ENOENT')) ? 'BLOCKED' : 'FAIL';
    result.error = error.message;
    process.exitCode = 1;
} finally {
    result.completedAt = new Date().toISOString();
    const inputs = [
        'tools/physics/box3d/abi-schema.json',
        'tools/physics/box3d/versions.lock.json',
        'vendor/box3d/source-manifest.json',
        'tools/physics/box3d/CMakeLists.txt',
        'tools/physics/box3d/exports.json',
        'tools/physics/box3d/build.mjs',
        'tools/physics/box3d/patch-intake.mjs',
        'tools/physics/box3d/patches/lock.json',
        'tools/physics/box3d/patches/sse2-loadv-alignment.patch',
        'tools/physics/box3d/patches/contact-geometry-epoch.patch',
        'tools/physics/box3d/wasm-contract.mjs',
        'tools/physics/box3d/wasm-ownership-contract.mjs',
        'tools/physics/box3d/wasm-snapshot-contract.mjs',
        'tools/physics/box3d/wasm-geometry-contract.mjs',
        'tools/physics/box3d/wasm-world-contract.mjs',
        'tools/physics/box3d/wasm-body-contract.mjs',
        'tools/physics/box3d/wasm-filter-contract.mjs',
        'tools/physics/box3d/wasm-motion-contract.mjs',
        'tools/physics/box3d/verify-sources.mjs',
        'tools/physics/box3d/verify-wasm.mjs',
        'tools/physics/box3d/native/air_box3d.c',
        'tools/physics/box3d/native/snapshot.c',
        'tools/physics/box3d/native/geometry.c',
        'tools/physics/box3d/native/world_bridge.c',
        'tools/physics/box3d/native/world_bridge.h',
        'tools/physics/box3d/native/body_control.c',
        'tools/physics/box3d/native/body_control.h',
        'tools/physics/box3d/native/filter_bridge.c',
        'tools/physics/box3d/native/filter_bridge.h',
        'tools/physics/box3d/native/motion_bridge.c',
        'tools/physics/box3d/native/motion_bridge.h',
        'tools/physics/box3d/motion-source-controls.mjs',
        'docs/physics/box3d/contracts/motion-command-decisions-v1.md',
        'tools/physics/box3d/native/filter_contract.c',
        'tools/physics/box3d/native/motion_contract.c',
        'tools/physics/box3d/native/body_contract.c',
        'tools/physics/box3d/native/world_contract.c',
        'tools/physics/box3d/native/air_box3d.h',
        'tools/physics/box3d/native/contract.c',
        'tools/physics/box3d/native/geometry_contract.c',
        'tools/physics/box3d/native/wasm_entry.c',
        'tools/physics/box3d/native/query_bridge.c',
        'tools/physics/box3d/native/query_bridge.h',
        'tools/physics/box3d/native/hull_bridge.c',
        'tools/physics/box3d/native/hull_bridge.h',
        'tools/physics/box3d/native/hull_contract.c',
        'tools/physics/box3d/native/hull_core_contract.c',
        'tools/physics/box3d/native/hull_legacy_fingerprint.c',
        'tools/physics/box3d/hull-bridge-contract.md',
        'tools/physics/box3d/hull-legacy-contract.mjs',
        'tools/physics/box3d/patches/checked-hull-cooking.patch',
        'tools/physics/box3d/capsule-bridge-contract.md',
        'tools/physics/box3d/native/capsule_contract.c',
        'tools/physics/box3d/native/query_contract.c',
        'tools/physics/box3d/wasm-query-contract.mjs',
        'tools/physics/box3d/query-admission-contract.mjs',
        'tools/physics/box3d/native/command_bridge.c',
        'tools/physics/box3d/native/command_bridge.h',
        'tools/physics/box3d/native/command_contract.c',
        'tools/physics/box3d/wasm-command-contract.mjs',
        'tools/physics/box3d/command-source-controls.mjs',
        'docs/physics/box3d/contracts/unified-command-wire-v1.md',
        'docs/physics/box3d/contracts/unified-command-decisions-v1.md',
        'src/air/physics/box3d/binding/facade.mjs',
        'src/air/physics/box3d/binding/facade.d.mts',
    ];
    result.inputHashes = inputs.map((path) => ({ path, sha256: sha256(readFileSync(resolve(root, path))) }));
    receipt();
    console.log(
        JSON.stringify(
            { status: result.status, kind: result.kind, output: relative(root, out), error: result.error },
            null,
            2,
        ),
    );
}
