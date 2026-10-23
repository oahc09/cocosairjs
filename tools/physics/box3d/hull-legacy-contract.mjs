// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Independently rebuild the exact pre-Hull patch prefix, then compare the unchanged
// legacy fingerprint fixture with the current build. Writes only a fresh child of --out.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve } from 'node:path';
import { root, sha256, verifySources } from './verify-sources.mjs';
import { readPatchPlan, stageCore, validatePatchLock, verifyStagedCore } from './patch-intake.mjs';

const parent = resolve(process.argv[2]);
const native = process.argv.includes('--native');
const debug = process.argv.includes('--debug');
const sanitize = process.argv.includes('--sanitize');
assert.ok(!sanitize || native, 'Sanitizer comparison is native-only');
const out = resolve(parent, 'hull-legacy-baseline');
assert.ok(!existsSync(out), 'Preserve earlier baseline evidence; select a new build output');
mkdirSync(out);
const report = {
    schemaVersion: 1,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    kind: native ? 'native-diagnostic' : 'st-simd-wasm',
    mode: debug ? 'Debug' : 'Release',
    scope: 'Independent pre-checked-Hull fixed-core comparison, not historical 8441 core or full geometry qualification',
    commands: [],
};
const persist = () => writeFileSync(resolve(out, 'comparison.raw.json'), JSON.stringify(report, null, 2) + '\n');
function run(command, args) {
    const item = { command, args: args.map((a) => a.replaceAll(out, '<baseline>').replaceAll(root, '<repo>')) };
    report.commands.push(item);
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const index = report.commands.length;
    writeFileSync(resolve(out, `command-${index}.stdout.txt`), result.stdout ?? '');
    writeFileSync(resolve(out, `command-${index}.stderr.txt`), result.stderr ?? '');
    Object.assign(item, { exitCode: result.status, signal: result.signal, error: result.error?.message ?? null });
    persist();
    assert.ok(
        !result.error && result.status === 0,
        `Baseline command failed: ${command}; retained command-${index} logs`,
    );
    return result.stdout;
}
try {
    report.sources = verifySources();
    const plan = readPatchPlan();
    assert.equal(plan.lock.patches.at(-1).id, 'checked-hull-cooking-v1', 'Review comparison prefix when chain changes');
    const prefixLock = { ...plan.lock, patches: plan.lock.patches.slice(0, -1) };
    assert.equal(prefixLock.patches.length, 2, 'Expected exact pre-Hull two-patch baseline');
    const prefixChain = validatePatchLock(prefixLock, plan.lock.baseCoreCommit, (path) =>
        readFileSync(resolve(root, path)),
    );
    const prefixPlan = {
        lock: prefixLock,
        patchChainSha256: prefixChain,
        patchLockSha256: sha256(Buffer.from(JSON.stringify(prefixLock) + '\n')),
    };
    writeFileSync(resolve(out, 'prefix-lock.json'), JSON.stringify(prefixLock) + '\n');
    report.baselineIdentity = {
        coreSha: plan.lock.baseCoreCommit,
        patchChainSha256: prefixChain,
        patchLockSha256: prefixPlan.patchLockSha256,
        appliedPatches: prefixLock.patches,
    };
    report.patchedIdentity = { patchChainSha256: plan.patchChainSha256, schemaSha256: report.sources.schemaSha256 };
    const staged = resolve(out, 'staged-core');
    report.baselineStage = stageCore(staged, prefixPlan);
    const cc = native ? (process.env.CC ?? 'gcc') : 'emcc';
    report.compiler = run(cc, ['--version']).trim();
    const flags = [
        '-std=gnu17',
        '-fno-fast-math',
        '-ffp-contract=off',
        '-DBOX3D_DISABLE_AVX2',
        '-DBOX3D_VALIDATE',
        ...(native ? [] : ['-msimd128', '-msse2']),
        ...(debug ? ['-O0', '-g'] : [native ? '-O2' : '-O3', '-DNDEBUG']),
        ...(sanitize ? ['-fsanitize=address,undefined', '-fno-sanitize-recover=all', '-fno-omit-frame-pointer'] : []),
        `-I${staged}/include`,
        `-I${staged}/src`,
    ];
    const fixture = resolve(root, 'tools/physics/box3d/native/hull_legacy_fingerprint.c');
    report.fixtureSha256 = sha256(readFileSync(fixture));
    const sources = [
        ...readdirSync(resolve(staged, 'src'))
            .filter((name) => name.endsWith('.c'))
            .sort()
            .map((name) => resolve(staged, 'src', name)),
        fixture,
    ];
    const commands = [],
        objects = [];
    for (const source of sources) {
        const object = resolve(out, basename(source) + '.o');
        const args = [...flags, '-c', source, '-o', object];
        run(cc, args);
        objects.push(object);
        commands.push({ directory: root, file: source, arguments: [cc, ...args] });
    }
    writeFileSync(resolve(out, 'compile_commands.json'), JSON.stringify(commands, null, 2) + '\n');
    const exe = resolve(out, native ? 'legacy-fingerprint' : 'legacy-fingerprint.cjs');
    run(cc, [
        ...flags,
        ...objects,
        '-lm',
        ...(native
            ? []
            : [
                  '-sENVIRONMENT=node',
                  '-sSINGLE_FILE=1',
                  '-sEXIT_RUNTIME=1',
                  '-sFILESYSTEM=0',
                  '-sASSERTIONS=2',
                  '-sALLOW_MEMORY_GROWTH=1',
              ]),
        '-o',
        exe,
    ]);
    const patched = resolve(
        parent,
        native ? 'native-hull-legacy-fingerprint' : 'air_box3d_hull_legacy_fingerprint.cjs',
    );
    const baselineRaw = native ? run(exe, []) : run(process.execPath, [exe]);
    const patchedRaw = native ? run(patched, []) : run(process.execPath, [patched]);
    writeFileSync(resolve(out, 'baseline.raw.txt'), baselineRaw);
    writeFileSync(resolve(out, 'patched.raw.txt'), patchedRaw);
    assert.equal(patchedRaw, baselineRaw, 'Independent old/new legacy hull bytes/topology fingerprint differs');
    assert.deepEqual(
        baselineRaw
            .trim()
            .split('\n')
            .map((line) => line.split(' ')[0]),
        ['tetra', 'prism', 'duplicates256'],
    );
    report.outputs = {
        baselineSha256: sha256(baselineRaw),
        patchedSha256: sha256(patchedRaw),
        baselineExecutableSha256: sha256(readFileSync(exe)),
        patchedExecutableSha256: sha256(readFileSync(patched)),
        cases: ['tetra', 'prism', 'duplicates256'],
        byteEqual: true,
    };
    assert.equal(sha256(readFileSync(fixture)), report.fixtureSha256, 'Fixture changed while baseline ran');
    verifyStagedCore(staged, prefixPlan);
    assert.deepEqual(verifySources(), report.sources, 'Inputs changed while baseline ran');
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    persist();
    console.log(JSON.stringify({ status: report.status, output: relative(root, out), error: report.error }));
}
