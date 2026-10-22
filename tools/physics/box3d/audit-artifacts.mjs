// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Audits one successful real ST build against current inputs; writes only its output directory.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, sha256, verifySources } from './verify-sources.mjs';
import { inspectWasmMemory } from './verify-wasm.mjs';
import { readPatchPlan, verifyStagedCore } from './patch-intake.mjs';

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
const patchPlan = readPatchPlan();
const stagedCore = resolve(dir, 'staged-core');
const staged = verifyStagedCore(stagedCore, patchPlan);
assert.equal(manifest.patchChainSha256, patchPlan.patchChainSha256);
assert.equal(manifest.patchLockSha256, patchPlan.patchLockSha256);
assert.deepEqual(manifest.appliedPatches, patchPlan.lock.patches);
assert.deepEqual(receipt.stagedCore, staged);
assert.deepEqual(manifest.artifacts, receipt.artifacts);
for (const artifact of manifest.artifacts) assert.deepEqual(fileHash(artifact.path), artifact);
const commands = json('compile_commands.json');
const expectedSources = [
    ...readdirSync(resolve(stagedCore, 'src'))
        .filter((name) => name.endsWith('.c'))
        .map((name) => relative(root, resolve(stagedCore, 'src', name))),
    'tools/physics/box3d/native/air_box3d.c',
    'tools/physics/box3d/native/snapshot.c',
    'tools/physics/box3d/native/geometry.c',
    'tools/physics/box3d/native/world_bridge.c',
    'tools/physics/box3d/native/body_control.c',
    'tools/physics/box3d/native/body_contract.c',
    'tools/physics/box3d/native/world_contract.c',
    'tools/physics/box3d/native/wasm_entry.c',
    'tools/physics/box3d/native/geometry_contract.c',
].sort();
assert.deepEqual(commands.map((c) => relative(root, c.file)).sort(), expectedSources);
const requiredFlags = ['-msimd128', '-msse2', '-fno-fast-math', '-ffp-contract=off'];
const forbiddenFlags =
    /pthread|SHARED_MEMORY|USE_PTHREADS|-ffast-math|-Ofast|BOX3D_DISABLE_SIMD|BOX3D_DOUBLE_PRECISION/;
for (const command of commands) {
    const flags = command.command ?? command.arguments.join(' ');
    assert.ok(!forbiddenFlags.test(flags), command.file);
    for (const flag of requiredFlags) assert.ok(flags.includes(flag), `${command.file}: missing ${flag}`);
    if (command.file.startsWith(stagedCore + '/')) assert.ok(flags.includes('-DBOX3D_DISABLE_AVX2'));
    if (command.file.endsWith('/native/air_box3d.c'))
        assert.ok(flags.includes(patchPlan.patchChainSha256), 'Compiled patch identity missing');
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
assert.equal(contract.identity.patchChainSha256, manifest.patchChainSha256);
assert.equal(contract.identity.schemaSha256, sources.schemaSha256);
assert.deepEqual(contract.memoryDeclaration, memory);
assert.equal(contract.freefallTicks.length, 60);
const ownership = json('wasm-ownership-contract.raw.json');
assert.equal(ownership.status, 'PASS');
assert.equal(ownership.identity.coreSha, manifest.coreSha);
assert.equal(ownership.identity.patchChainSha256, manifest.patchChainSha256);
assert.equal(ownership.identity.schemaSha256, sources.schemaSha256);
assert.equal(ownership.slotReuseCycles.length, 128);
assert.equal(ownership.worldLifetimeCycles.length, 128);
const snapshots = json('wasm-snapshot-contract.raw.json');
assert.equal(snapshots.status, 'PASS');
assert.equal(snapshots.identity.schemaSha256, manifest.schemaSha256);
const geometry = json('wasm-geometry-contract.raw.json');
assert.equal(geometry.status, 'PASS');
assert.deepEqual(fileHash('geometry-samples.raw.jsonl'), {
    path: geometry.samplesArtifact.path,
    bytes: geometry.samplesArtifact.bytes,
    sha256: geometry.samplesArtifact.sha256,
});
assert.equal(read('geometry-samples.raw.jsonl').toString().trim().split('\n').length, geometry.samplesArtifact.records);
for (const field of ['coreSha', 'bindingBaseSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'])
    assert.equal(geometry.identity[field], manifest[field]);
assert.equal(
    geometry.fixtureSha256,
    sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-geometry-contract.mjs'))),
);
assert.equal(
    geometry.samplesArtifact.records,
    Object.values(geometry.observations).reduce((sum, item) => sum + (item.contactSamples ?? 0), 0),
);
const nativeGeometry = json('native-geometry-contract.raw.json');
assert.equal(nativeGeometry.status, 'PASS');
assert.equal(nativeGeometry.pointerBytes, 4);
for (const field of [
    'zeroDtDistinctRevision',
    'invalidLockedCOMNoWrite',
    'actualContactSlotReuseInitialized',
    'uint64ExhaustionFailsClosed',
    'ccdRetainsFloorGeneration',
    'firstTOINoFabricatedManifold',
])
    assert.equal(nativeGeometry[field], true, `Missing native geometry assertion: ${field}`);
assert.deepEqual(nativeGeometry, receipt.geometryContract);
assert.ok(
    receipt.commands.some(
        (entry) => entry.args.some((arg) => arg.endsWith('air_box3d_geometry_contract.cjs')) && entry.exitCode === 0,
    ),
);
const world = json('wasm-world-contract.raw.json');
assert.equal(world.status, 'PASS');
for (const field of ['coreSha', 'bindingBaseSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'])
    assert.equal(world.identity[field], manifest[field]);
assert.equal(world.fixtureSha256, sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-world-contract.mjs'))));
assert.equal(world.checks.length, 8);
assert.ok(world.checks.every((check) => check.status === 'PASS'));
const nativeWorld = json('native-world-contract.raw.json');
assert.equal(nativeWorld.status, 'PASS');
assert.equal(nativeWorld.pointerBytes, 4);
for (const name of [
    'creationAllocationFailure',
    'shapeAndGrowthAllocationFailure',
    'realCallbackOverflow',
    'capacityNoPartialWrite',
    'shapeBodyWorldCleanup',
    'worldIsolationAndMaterialNoWrite',
])
    assert.equal(nativeWorld[name], true);
assert.equal(nativeWorld.finalBridgeBytes, 0);
assert.deepEqual(nativeWorld, receipt.worldContract);
assert.ok(
    receipt.commands.some(
        (entry) => entry.args.some((arg) => arg.endsWith('air_box3d_world_contract.cjs')) && entry.exitCode === 0,
    ),
);
const nativeBody = json('native-body-contract.raw.json');
assert.equal(nativeBody.status, 'PASS');
assert.equal(nativeBody.pointerBytes, 4);
assert.deepEqual(nativeBody, receipt.bodyContract);
for (const name of [
    'lockedWorldNoWrite',
    'fullGenerationWorldNoWrite',
    'boxMassAndAngularImpulse',
    'clearActualForceNotImpulse',
    'actualSleepTimerAndZeroThreshold',
    'sensorFallbackAndMixedExclusion',
    'pendingGeometryLifecycle',
    'coreBytesRestored',
    'immediateImpulseLocks',
    'smallBoxNoSilentClamp',
])
    assert.equal(nativeBody[name], true);
const body = json('wasm-body-contract.raw.json');
assert.equal(body.status, 'PASS');
for (const field of ['coreSha', 'bindingBaseSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'])
    assert.equal(body.identity[field], manifest[field]);
assert.equal(body.fixtureSha256, sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-body-contract.mjs'))));
assert.equal(body.observations.idCycles.length, 128);
assert.equal(body.observations.damping.length, 12);
assert.ok(body.negatives.length >= 45);
for (const name of [
    'bodyControlsValidationAndOldSnapshotImmutable',
    'totalMassAnalytic',
    'offsetCOMImpulse',
    'sensorFallbackAndMixedExclusion',
    'localForceAndTorque',
    'dampingGrid',
    'gravityDoesNotClearVelocity',
    'sleepAndThresholdNative',
    'axisLocks',
    'immediateImpulseLocks',
    'smallBoxNoSilentClamp',
    'fullId128Cycles',
    'bodyBeforeColliderAndRemoval',
    'rotatedOffsetBox',
    'coreAndBridgeRestored',
])
    assert.equal(body.checks[name], true);
const report = {
    schemaVersion: 1,
    status: 'PASS',
    checkedAt: new Date().toISOString(),
    command: `node tools/physics/box3d/audit-artifacts.mjs ${relative(root, dir)}`,
    auditScriptSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    nodeVersion: process.version,
    scope: 'Current-input artifact/compile/link audit only; not browser, sanitizer or full G1 acceptance',
    sources,
    patchChainSha256: patchPlan.patchChainSha256,
    stagedCoreFiles: staged.files.length,
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
        'staged-core.receipt.json',
        'compile_commands.json',
        linkPath,
        'wasm-contract.raw.json',
        'wasm-ownership-contract.raw.json',
        'wasm-snapshot-contract.raw.json',
        'wasm-geometry-contract.raw.json',
        'native-geometry-contract.raw.json',
        'air_box3d_geometry_contract.cjs',
        'geometry-samples.raw.jsonl',
        'native-world-contract.raw.json',
        'wasm-world-contract.raw.json',
        'air_box3d_world_contract.cjs',
        'native-body-contract.raw.json',
        'wasm-body-contract.raw.json',
        'air_box3d_body_contract.cjs',
    ].map(fileHash),
};
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(
    JSON.stringify({ status: report.status, compiledSourceCount: commands.length, output: relative(root, reportPath) }),
);
