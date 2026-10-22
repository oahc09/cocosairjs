// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Audits one successful real ST build against current inputs; writes only its output directory.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, sha256, verifySources } from './verify-sources.mjs';
import { inspectWasmMemory } from './verify-wasm.mjs';

const dir = resolve(process.argv[2]);
const reportPath = resolve(dir, 'artifact-audit.raw.json');
assert.ok(!existsSync(reportPath), 'Preserve earlier audit evidence; choose a new build output');
const read = (path) => readFileSync(resolve(dir, path));
const json = (path) => JSON.parse(read(path));
const fileHash = (path) => ({ path, bytes: read(path).length, sha256: sha256(read(path)) });
const receipt = json('build-receipt.json');
assert.equal(receipt.status, 'PASS');
assert.equal(receipt.kind, 'st-simd-wasm');
assert.ok(receipt.commands.length >= 6 && receipt.commands.every((c) => c.exitCode === 0 && !c.error));
for (const input of receipt.inputHashes) {
    assert.equal(sha256(readFileSync(resolve(root, input.path))), input.sha256, `Build input drift: ${input.path}`);
}
const sources = verifySources();
const manifest = json('manifest.json');
assert.deepEqual(manifest.artifacts, receipt.artifacts);
for (const artifact of manifest.artifacts) assert.deepEqual(fileHash(artifact.path), artifact);
const commands = json('compile_commands.json');
const expectedSources = [
    ...readdirSync(resolve(root, 'vendor/box3d/core/src'))
        .filter((name) => name.endsWith('.c'))
        .map((name) => `vendor/box3d/core/src/${name}`),
    'tools/physics/box3d/native/air_box3d.c',
    'tools/physics/box3d/native/wasm_entry.c',
].sort();
assert.deepEqual(commands.map((c) => relative(root, c.file)).sort(), expectedSources);
const requiredFlags = ['-msimd128', '-msse2', '-fno-fast-math', '-ffp-contract=off'];
const forbiddenFlags =
    /pthread|SHARED_MEMORY|USE_PTHREADS|-ffast-math|-Ofast|BOX3D_DISABLE_SIMD|BOX3D_DOUBLE_PRECISION/;
for (const command of commands) {
    const flags = command.command ?? command.arguments.join(' ');
    assert.ok(!forbiddenFlags.test(flags), command.file);
    for (const flag of requiredFlags) assert.ok(flags.includes(flag), `${command.file}: missing ${flag}`);
    if (command.file.includes('/vendor/box3d/core/')) assert.ok(flags.includes('-DBOX3D_DISABLE_AVX2'));
    assert.equal(flags.includes('-DNDEBUG'), receipt.mode === 'Release', `Wrong assertion mode: ${command.file}`);
}
const linkPath = 'CMakeFiles/air_box3d.dir/link.txt';
const link = read(linkPath).toString();
assert.ok(!forbiddenFlags.test(link));
for (const flag of [
    ...requiredFlags,
    "-sINCOMING_MODULE_JS_API=['wasmBinary','locateFile']",
    '-sDYNAMIC_EXECUTION=0',
    '-sALLOW_MEMORY_GROWTH=1',
    '-sMODULARIZE=1',
    '-sEXPORT_ES6=1',
    receipt.mode === 'Debug' ? '-sASSERTIONS=2' : '-sASSERTIONS=1',
])
    assert.ok(link.includes(flag), `Missing link option ${flag}`);
const loader = read('box3d-st.mjs').toString();
assert.ok(!/\bnew\s+Function\s*\(|\beval\s*\(|\bnew\s+Worker\s*\(/.test(loader));
const wasm = read('box3d-st.wasm');
const memory = inspectWasmMemory(wasm);
const compiled = await WebAssembly.compile(wasm);
const imports = WebAssembly.Module.imports(compiled);
assert.ok(!imports.some((entry) => /pthread|worker|atomic/i.test(entry.name)));
const contract = json('wasm-contract.raw.json');
assert.equal(contract.status, 'PASS');
assert.equal(contract.identity.coreSha, manifest.coreSha);
assert.equal(contract.identity.schemaSha256, sources.schemaSha256);
assert.deepEqual(contract.memoryDeclaration, memory);
assert.equal(contract.freefallTicks.length, 60);
const ownership = json('wasm-ownership-contract.raw.json');
assert.equal(ownership.status, 'PASS');
assert.equal(ownership.identity.coreSha, manifest.coreSha);
assert.equal(ownership.identity.schemaSha256, sources.schemaSha256);
assert.equal(ownership.slotReuseCycles.length, 128);
assert.equal(ownership.worldLifetimeCycles.length, 128);
const report = {
    schemaVersion: 1,
    status: 'PASS',
    checkedAt: new Date().toISOString(),
    command: `node tools/physics/box3d/audit-artifacts.mjs ${relative(root, dir)}`,
    auditScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    nodeVersion: process.version,
    scope: 'Current-input artifact/compile/link audit only; not browser, sanitizer or full G1 acceptance',
    sources,
    buildInputHashesMatched: receipt.inputHashes.length,
    compiledSourceCount: commands.length,
    compiledSourceHashes: expectedSources.map((path) => ({ path, sha256: sha256(readFileSync(resolve(root, path))) })),
    requiredFlags,
    incomingModuleApi: ['wasmBinary', 'locateFile'],
    sharedMemory: memory.shared,
    memory,
    imports,
    dynamicExecutionOrWorkerConstructorFound: false,
    artifacts: manifest.artifacts,
    evidence: [
        'build-receipt.json',
        'manifest.json',
        'compile_commands.json',
        linkPath,
        'wasm-contract.raw.json',
        'wasm-ownership-contract.raw.json',
    ].map(fileHash),
};
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(
    JSON.stringify({ status: report.status, compiledSourceCount: commands.length, output: relative(root, reportPath) }),
);
