// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Independent UBSan-only diagnosis. Never represents full ASan/LSan qualification.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, sha256, verifySources } from '../../verify-sources.mjs';
import { readPatchPlan, stageCore, verifyStagedCore } from '../../patch-intake.mjs';
const out = resolve(process.argv[2]);
assert.ok(!existsSync(out));
mkdirSync(out, { recursive: true });
const report = {
    status: 'RUNNING',
    scope: 'UBSAN_ONLY_DIAGNOSTIC_NOT_ASAN_LSAN_PASS',
    startedAt: new Date().toISOString(),
    commands: [],
    inputs: [],
};
const persist = () =>
    writeFileSync(resolve(out, 'native-motion-ubsan.raw.json'), JSON.stringify(report, null, 2) + '\n');
function run(command, args) {
    const r = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    const i = report.commands.length + 1;
    writeFileSync(resolve(out, `command-${i}.stdout.txt`), r.stdout ?? '');
    writeFileSync(resolve(out, `command-${i}.stderr.txt`), r.stderr ?? '');
    report.commands.push({
        command,
        args: args.map((a) => a.replaceAll(root, '<repo>')),
        exitCode: r.status,
        error: r.error?.message ?? null,
    });
    persist();
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
}
function checkFrozenInputs() {
    const receipt = JSON.parse(
        readFileSync(resolve(root, 'tools/physics/box3d/output/motion-wasm-release-20261022-m2/build-receipt.json')),
    );
    assert.equal(receipt.status, 'PASS');
    assert.equal(receipt.inputHashes.length, 43);
    for (const input of receipt.inputHashes)
        assert.equal(sha256(readFileSync(resolve(root, input.path))), input.sha256, input.path);
    return receipt.inputHashes;
}
try {
    report.bindingInputHashes = checkFrozenInputs();
    report.sources = verifySources();
    const plan = readPatchPlan(),
        core = resolve(out, 'staged-core');
    report.stagedCore = stageCore(core);
    report.compiler = run('gcc', ['--version']);
    const flags = [
        '-std=gnu17',
        '-O1',
        '-g',
        '-fno-fast-math',
        '-ffp-contract=off',
        '-DBOX3D_DISABLE_AVX2',
        '-DBOX3D_VALIDATE',
        '-fsanitize=undefined',
        '-fno-sanitize-recover=all',
        '-fno-omit-frame-pointer',
        '-I' + core + '/include',
        '-I' + core + '/src',
        '-Itools/physics/box3d/native',
        `-DAIR_B3_SCHEMA_SHA="${report.sources.schemaSha256}"`,
        `-DAIR_B3_PATCH_CHAIN_SHA="${plan.patchChainSha256}"`,
    ];
    const sources = [
        ...readdirSync(resolve(core, 'src'))
            .filter((f) => f.endsWith('.c'))
            .sort()
            .map((f) => resolve(core, 'src', f)),
        ...[
            'air_box3d.c',
            'snapshot.c',
            'geometry.c',
            'world_bridge.c',
            'body_control.c',
            'filter_bridge.c',
            'motion_bridge.c',
        ].map((f) => 'tools/physics/box3d/native/' + f),
    ];
    const objects = [];
    for (const source of sources) {
        const object = resolve(out, basename(source) + '.o');
        run('gcc', [...flags, '-c', source, '-o', object]);
        objects.push(object);
        report.inputs.push({ path: source.replaceAll(root, '<repo>'), sha256: sha256(readFileSync(source)) });
    }
    report.contracts = {};
    for (const name of [
        'contract',
        'geometry_contract',
        'world_contract',
        'body_contract',
        'filter_contract',
        'motion_contract',
    ]) {
        const source = `tools/physics/box3d/native/${name}.c`,
            exe = resolve(out, name);
        report.inputs.push({ path: source, sha256: sha256(readFileSync(source)) });
        run('gcc', [
            ...flags,
            source,
            ...objects.filter(
                (p) => !['world_contract', 'motion_contract'].includes(name) || !p.endsWith('/world_bridge.c.o'),
            ),
            '-lm',
            '-o',
            exe,
        ]);
        const raw = run(exe, []);
        writeFileSync(resolve(out, name + '.raw.json'), raw);
        report.contracts[name] = JSON.parse(raw);
        assert.equal(report.contracts[name].status, 'PASS');
    }
    verifyStagedCore(core);
    assert.deepEqual(checkFrozenInputs(), report.bindingInputHashes);
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = error.stack;
    process.exitCode = 1;
} finally {
    report.scriptSha256 = sha256(readFileSync(fileURLToPath(import.meta.url)));
    report.completedAt = new Date().toISOString();
    persist();
    console.log(JSON.stringify({ status: report.status, scope: report.scope, error: report.error }));
}
