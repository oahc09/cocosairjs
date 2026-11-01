// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Compiles header-only old/new layout probes to real WASM32. No old physics core is linked.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, sha256, verifySources } from './verify-sources.mjs';

const dir = resolve(process.argv[2]);
assert.ok(!existsSync(dir), 'Keep earlier layout evidence; select a new output');
mkdirSync(dir, { recursive: true });
const report = {
    schemaVersion: 1,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Header-only Node WASM32 layout probes, not an old-core physics build or browser acceptance',
    commands: [],
    layouts: {},
    artifacts: [],
};
const persist = () => writeFileSync(resolve(dir, 'layout-receipt.json'), JSON.stringify(report, null, 2) + '\n');
const run = (command, args) => {
    const number = report.commands.length + 1;
    const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    writeFileSync(resolve(dir, `command-${number}.stdout.txt`), result.stdout ?? '');
    writeFileSync(resolve(dir, `command-${number}.stderr.txt`), result.stderr ?? '');
    report.commands.push({ command, args, exitCode: result.status, error: result.error?.message ?? null });
    persist();
    assert.ok(!result.error && result.status === 0, `${command} failed: ${result.error?.message ?? result.stderr}`);
    return result.stdout;
};
try {
    report.sources = verifySources();
    const lock = JSON.parse(readFileSync(resolve(root, 'tools/physics/box3d/versions.lock.json')));
    report.inputHashes = [
        'tools/physics/box3d/versions.lock.json',
        'tools/physics/box3d/native/layout_probe.c',
        'vendor/box3d/source-manifest.json',
    ].map((path) => ({ path, sha256: sha256(readFileSync(resolve(root, path))) }));
    report.runnerSha256 = sha256(readFileSync(fileURLToPath(import.meta.url)));
    report.compiler = run('emcc', ['--version']).trim();
    assert.ok(report.compiler.includes(` ${lock.emsdk.compilerVersion} (`));
    assert.ok(report.compiler.includes(lock.emsdk.emscriptenCommit));
    report.nodeVersion = run(process.execPath, ['--version']).trim();
    for (const [name, sourceRoot, sourceCommit] of [
        ['core', 'vendor/box3d/core', lock.core.commit],
        ['old-core-review', 'vendor/box3d/old-core-review', lock.bindingBase.vendorCoreCommit],
    ]) {
        const executable = resolve(dir, `${name}-layout.cjs`);
        const flags = [
            '-std=gnu17',
            '-O0',
            '-g',
            '-fno-fast-math',
            '-ffp-contract=off',
            '-msimd128',
            '-msse2',
            '-DBOX3D_DISABLE_AVX2',
            '-sENVIRONMENT=node',
            '-sDYNAMIC_EXECUTION=0',
            '-sASSERTIONS=2',
            '-sEXIT_RUNTIME=1',
            '-sWASM_ASYNC_COMPILATION=0',
            '-sFILESYSTEM=0',
        ];
        run('emcc', [
            ...flags,
            `-I${sourceRoot}/include`,
            'tools/physics/box3d/native/layout_probe.c',
            '-o',
            executable,
        ]);
        const raw = run(process.execPath, [executable]);
        writeFileSync(resolve(dir, `${name}-layout.raw.json`), raw);
        const layout = JSON.parse(raw);
        assert.equal(layout.pointerBytes, 4, 'This must be measured WASM32, not reused host layout');
        assert.equal(layout.sizes.b3BodyId, 8);
        assert.equal(layout.sizes.b3ShapeId, 8);
        assert.equal(layout.sizes.b3WorldId, 4);
        assert.equal(layout.hashBytes.hull, name === 'core' ? 8 : 4);
        assert.equal(layout.enumValues.dynamicBody, 2);
        report.layouts[name] = { sourceCommit, rawPath: `${name}-layout.raw.json`, layout };
        for (const path of [`${name}-layout.cjs`, `${name}-layout.wasm`, `${name}-layout.raw.json`]) {
            const data = readFileSync(resolve(dir, path));
            report.artifacts.push({ path, bytes: data.length, sha256: sha256(data) });
        }
    }
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    persist();
    console.log(JSON.stringify({ status: report.status, output: relative(root, dir), error: report.error?.message }));
}
