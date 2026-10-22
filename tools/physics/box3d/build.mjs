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
        run(process.execPath, ['tools/physics/box3d/wasm-contract.mjs', out]);
        run(process.execPath, ['tools/physics/box3d/wasm-ownership-contract.mjs', out]);
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
        'tools/physics/box3d/wasm-contract.mjs',
        'tools/physics/box3d/wasm-ownership-contract.mjs',
        'tools/physics/box3d/verify-sources.mjs',
        'tools/physics/box3d/verify-wasm.mjs',
        'tools/physics/box3d/native/air_box3d.c',
        'tools/physics/box3d/native/air_box3d.h',
        'tools/physics/box3d/native/contract.c',
        'tools/physics/box3d/native/wasm_entry.c',
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
