// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Audits one successful real ST build against current inputs; writes only its output directory.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { root, sha256, verifySources } from './verify-sources.mjs';
import { inspectWasmMemory } from './verify-wasm.mjs';
import { readPatchPlan, validatePatchLock, verifyStagedCore } from './patch-intake.mjs';
import { verifyMemoryDiagnosticSources } from './memory-diagnostics/v2/source-gate.mjs';
import { verifyMemoryDiagnosticQualification } from './memory-diagnostics/v2/qualification.mjs';
import { verifyStorageQualification } from './empty-world-trim/production/qualification.mjs';
import { verifySphereCapsuleQualification } from './sphere-capsule/qualification.mjs';
import commandQualification from '../../build/box3d-command-qualification.cjs';
import hullQualification from '../../build/box3d-hull-qualification.cjs';

const dir = resolve(process.argv[2]);
const reportPath = resolve(dir, 'artifact-audit.raw.json');
assert.ok(!existsSync(reportPath), 'Preserve earlier audit evidence; choose a new build output');
const read = (path) => readFileSync(resolve(dir, path));
const json = (path) => JSON.parse(read(path));
const fileHash = (path) => ({ path, bytes: read(path).length, sha256: sha256(read(path)) });
const receipt = json('build-receipt.json');
assert.equal(receipt.status, 'PASS');
assert.equal(receipt.kind, 'st-simd-wasm');
commandQualification.verifyCommandSchedule(receipt);
assert.ok(receipt.commands.every((c) => c.exitCode === 0 && !c.error));
assert.equal(receipt.inputHashes.length, 120);
assert.equal(new Set(receipt.inputHashes.map((input) => input.path)).size, 120);
const expectedGate = JSON.parse(
    readFileSync(resolve(root, 'tools/build/box3d-command-expectations.json'), 'utf8'),
).gate;
assert.deepEqual(
    receipt.inputHashes.map((input) => input.path).sort(),
    [...expectedGate.inputs].sort(),
    'Exact producer input set',
);
assert.equal(receipt.motionSourceControls.status, 'PASS_SOURCE_CONTROLS_ONLY');
assert.equal(receipt.commandSourceControls.status, 'PASS_SOURCE_CONTROLS_ONLY');
assert.deepEqual(receipt.memoryCpuContract, { status: 'PASS_CPU_FAKE_DIAGNOSTICS_ONLY', nativeRuntimeExecuted: false });
for (const input of receipt.inputHashes) {
    assert.equal(sha256(readFileSync(resolve(root, input.path))), input.sha256, `Build input drift: ${input.path}`);
}
const sources = verifySources();
const manifest = json('manifest.json');
const patchPlan = readPatchPlan();
const stagedCore = resolve(dir, 'staged-core');
const staged = verifyStagedCore(stagedCore, patchPlan);
assert.deepEqual(receipt.memorySourceControls, verifyMemoryDiagnosticSources(root, stagedCore));
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
    'tools/physics/box3d/native/filter_bridge.c',
    'tools/physics/box3d/native/motion_bridge.c',
    'tools/physics/box3d/native/command_bridge.c',
    'tools/physics/box3d/native/query_bridge.c',
    'tools/physics/box3d/native/hull_bridge.c',
    'tools/physics/box3d/native/joint_bridge.c',
    'tools/physics/box3d/native/joint_contract.c',
    'tools/physics/box3d/native/hinge_bridge.c',
    'tools/physics/box3d/native/hinge_contract.c',
    'tools/physics/box3d/native/p2p_bridge.c',
    'tools/physics/box3d/native/p2p_contract.c',
    'tools/physics/box3d/native/mesh_bridge.c',
    'tools/physics/box3d/native/memory_diagnostics.c',
    'tools/physics/box3d/native/memory_contract.c',
    'tools/physics/box3d/native/mesh_contract.c',
    'tools/physics/box3d/native/hull_contract.c',
    'tools/physics/box3d/native/hull_core_contract.c',
    'tools/physics/box3d/native/hull_legacy_fingerprint.c',
    'tools/physics/box3d/native/capsule_contract.c',
    'tools/physics/box3d/native/query_contract.c',
    'tools/physics/box3d/native/command_contract.c',
    'tools/physics/box3d/native/filter_contract.c',
    'tools/physics/box3d/native/motion_contract.c',
    'tools/physics/box3d/native/body_contract.c',
    'tools/physics/box3d/native/world_contract.c',
    'tools/physics/box3d/native/wasm_entry.c',
    'tools/physics/box3d/native/geometry_contract.c',
    'tools/physics/box3d/native/world_storage_contract.c',
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
const nativeJoint = json('native-joint-contract.raw.json');
assert.equal(nativeJoint.status, 'PASS');
assert.equal(nativeJoint.pointerBytes, 4);
assert.deepEqual(nativeJoint, receipt.jointContract);
assert.equal(nativeJoint.ticksPerDynamicsCase, 600);
assert.ok(Math.abs(nativeJoint.positionLimitMeters - 0.02) < 1e-8);
assert.ok(Math.abs(nativeJoint.angularLimitRadians - 0.02) < 1e-8);
for (const field of [
    'shapeFreeStaticAnchor',
    'configurePreservesFramesPosesAndReaction',
    'nativeThresholdDoesNotDestroy',
    'fullEventIdCopied',
    'explicitDestroyReleasesConstraint',
    'bodyDestroyInvalidatesJoint',
    'worldDestroyInvalidatesJoint',
])
    assert.equal(nativeJoint[field], true, field);
for (const field of [
    'anchoredMaxPositionError',
    'anchoredMaxAngularError',
    'reversedAnchoredMaxPositionError',
    'reversedAnchoredMaxAngularError',
    'movingMaxPositionError',
    'movingMaxAngularError',
])
    assert.ok(Number.isFinite(nativeJoint[field]) && nativeJoint[field] >= 0 && nativeJoint[field] <= 0.02, field);
assert.equal(nativeJoint.finalCoreBytes, 0);
assert.equal(nativeJoint.finalBridgeBytes, 0);
assert.ok(
    receipt.commands.some(
        (entry) => entry.args.some((arg) => arg.endsWith('air_box3d_joint_contract.cjs')) && entry.exitCode === 0,
    ),
);
const nativeHinge = json('native-hinge-contract.raw.json');
assert.equal(nativeHinge.status, 'PASS');
assert.equal(nativeHinge.pointerBytes, 4);
assert.deepEqual(nativeHinge, receipt.hingeContract);
assert.ok(
    receipt.commands.some(
        (entry) => entry.args.some((arg) => arg.endsWith('air_box3d_hinge_contract.cjs')) && entry.exitCode === 0,
    ),
);
const wasmMesh = json('wasm-mesh-contract.raw.json');
assert.equal(wasmMesh.status, 'PASS');
assert.equal(wasmMesh.orders.length, 4);
assert.equal(wasmMesh.fixtureSha256, sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-mesh-contract.mjs'))));
for (const passed of Object.values(wasmMesh.checks)) assert.equal(passed, true);
const memoryQualification = verifyMemoryDiagnosticQualification({
    native: json('native-memory-contract.raw.json'),
    wasm: json('wasm-memory-contract.raw.json'),
    identity: manifest,
    fixtureSha256: sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-memory-contract.mjs'))),
    receipt,
});
const nativeMesh = json('native-mesh-contract.raw.json');
assert.equal(nativeMesh.status, 'PASS');
assert.equal(nativeMesh.pointerBytes, 4);
assert.equal(nativeMesh.releaseOrders, 4);
assert.ok(nativeMesh.checks >= 618);
assert.deepEqual(nativeMesh, receipt.meshContract);
const nativeP2P = json('native-p2p-contract.raw.json');
assert.equal(nativeP2P.status, 'PASS');
assert.equal(nativeP2P.pointerBytes, 4);
assert.deepEqual(nativeP2P, receipt.p2pContract);
assert.ok(
    receipt.commands.some(
        (entry) => entry.args.some((arg) => arg.endsWith('air_box3d_p2p_contract.cjs')) && entry.exitCode === 0,
    ),
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
const filters = json('wasm-filter-contract.raw.json');
assert.equal(filters.status, 'PASS');
for (const field of ['coreSha', 'bindingBaseSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'])
    assert.equal(filters.identity[field], manifest[field]);
assert.equal(
    filters.fixtureSha256,
    sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-filter-contract.mjs'))),
);
for (const check of [
    'bitsetsAndDefaults',
    'batchAdmissionAtomic',
    'contactNextStep',
    'sensorNextStep',
    'sleepWake',
    'copiesAndGrowth',
    'fullIdReuse',
    'bodyMutationOutcome',
    'filterMutationOutcome',
    'cleanup',
])
    assert.equal(filters.checks[check], true, check);
const nativeCapsule = json('native-capsule-contract.raw.json');
assert.equal(nativeCapsule.status, 'PASS');
assert.equal(nativeCapsule.pointerBytes, 4);
assert.deepEqual(nativeCapsule, receipt.capsuleContract);
for (const check of [
    'allThreeAxes',
    'analyticMassAndImpulse',
    'exactZeroSphere',
    'shortPositiveRejectNoWrite',
    'finiteDerivedAndAutomaticMassPreflight',
    'commandAndMotion',
    'trueCapsuleDebugSurface',
    'sensorMassLifecycle',
    'debugAllocationFailures',
    'lifecycle128',
    'coreAndBridgeBytesRestored',
])
    assert.equal(nativeCapsule[check], true, check);
const nativeQuery = json('native-query-contract.raw.json');
assert.equal(nativeQuery.status, 'PASS');
assert.equal(nativeQuery.pointerBytes, 4);
assert.deepEqual(nativeQuery, receipt.queryContract);
for (const check of [
    'genericAll',
    'triggerContinuation',
    'insideZero',
    'halfOpenEndpoint',
    'unsigned32Filters',
    'capacityAlignmentCanaries',
    'worldLockGeneration',
    'coreBytesRestored',
])
    assert.equal(nativeQuery[check], true, check);
assert.equal(receipt.queryAdmission.status, 'PASS_ADMISSION_NO_NATIVE_CALLS');
assert.equal(receipt.queryAdmission.nativeQueryCalls, 0);
const query = json('wasm-query-contract.raw.json');
assert.equal(query.status, 'PASS');
for (const field of ['coreSha', 'bindingBaseSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'])
    assert.equal(query.identity[field], manifest[field]);
assert.equal(query.fixtureSha256, sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-query-contract.mjs'))));
for (const check of [
    'triggerContinuationAndZero',
    'unsigned32AndDynamicMask',
    'halfOpenEndpoint',
    'copiedFrozenNonOwningIdsAndHeapGrowth',
    'noNativeForZeroInvalid',
    'cleanup',
])
    assert.equal(query.checks[check], true, check);
const nativeFilter = json('native-filter-contract.raw.json');
assert.equal(nativeFilter.status, 'PASS');
assert.equal(nativeFilter.pointerBytes, 4);
assert.deepEqual(nativeFilter, receipt.filterContract);
for (const check of [
    'nativeUpperBitsAndGroupReject',
    'batchNoPartialMutation',
    'lockedCapacityOverlapCanaries',
    'fullGenerationWorld',
    'defaultAllCreationPaths',
    'coreBytesRestored',
])
    assert.equal(nativeFilter[check], true, check);
const nativeMotion = json('native-motion-contract.raw.json');
assert.equal(nativeMotion.status, 'PASS');
assert.equal(nativeMotion.pointerBytes, 4);
assert.deepEqual(nativeMotion, receipt.motionContract);
for (const check of [
    'batchPreflightNoPartialMutation',
    'capacityOverlapLockedCanaries',
    'strictQuaternionAndOverflow',
    'disabledResetForcePreserve',
    'tinyTargetWakeAndStationaryCap',
    'postResetCOMTarget',
    'worldAxisLockAndCaps',
    'actualFastRotationFlag',
    'fullGenerationWorld',
    'scratchTrackedAndCleanup',
    'substepDomain',
    'emptyNoOutputWrite',
    'coreBytesRestored',
])
    assert.equal(nativeMotion[check], true, check);
const motion = json('wasm-motion-contract.raw.json');
assert.equal(motion.status, 'PASS');
for (const field of ['coreSha', 'bindingBaseSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'])
    assert.equal(motion.identity[field], manifest[field]);
assert.equal(motion.fixtureSha256, sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-motion-contract.mjs'))));
for (const check of [
    'admissionAndEmptyValidate',
    'lockAndCapRejection',
    'teleportOptionsCOMAndForces',
    'mergedResetTargetAndClear',
    'immutableCopiesAndHeapGrowth',
    'fullId128Cycles',
    'independentDampedTargetGrid',
    'modeledShortfallNotTeleport',
    'realContactAndSensorTiming',
    'mutationPhasesNoReplay',
    'cleanup',
])
    assert.equal(motion.checks[check], true, check);
assert.equal(motion.observations.idCycles.length, 128);
assert.equal(motion.observations.grid.length, 12);
assert.ok(motion.observations.grid.every((entry) => entry.ticks === 600));
assert.equal(motion.injectedMechanisms.length, 3);
assert.ok(motion.negatives.length >= 35);
assert.equal(motion.sampleCount, 7201);
assert.equal(motion.samplesArtifact.records, motion.sampleCount);
assert.deepEqual(fileHash('motion-samples.raw.jsonl'), {
    path: motion.samplesArtifact.path,
    bytes: motion.samplesArtifact.bytes,
    sha256: motion.samplesArtifact.sha256,
});
assert.equal(read('motion-samples.raw.jsonl').toString().trim().split('\n').length, motion.sampleCount);
for (const filename of ['air_box3d_motion_contract.cjs', 'wasm-motion-contract.mjs'])
    assert.ok(
        receipt.commands.some((entry) => entry.args.some((arg) => arg.endsWith(filename)) && entry.exitCode === 0),
    );
const nativeCommand = json('native-command-contract.raw.json');
assert.equal(nativeCommand.status, 'PASS');
assert.equal(nativeCommand.pointerBytes, 4);
assert.equal(nativeCommand.schemaSha256, manifest.schemaSha256);
assert.equal(nativeCommand.patchChainSha256, manifest.patchChainSha256);
for (const name of [
    'pureValidation',
    'lateRejectNoMutation',
    'allocationFailures',
    'exactFloatReplay',
    'rotatedOffsetAndLocks',
    'kinematicOffsetCOM',
    'tinyCapStationary',
    'protectedSequenceZero',
    'maxTransport',
    'temporaryCleanup',
    'coreCleanup',
])
    assert.equal(nativeCommand.checks[name], true);
assert.equal(nativeCommand.negativeCases, 25);
assert.deepEqual(nativeCommand.limits, { bodies: 4096, operations: 16384, inputWords: 278540, outputWords: 1966092 });
const command = json('wasm-command-contract.raw.json');
assert.equal(command.status, 'PASS');
for (const key of ['coreSha', 'bindingBaseSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'])
    assert.equal(command.identity[key], manifest[key]);
assert.equal(
    command.fixtureSha256,
    sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-command-contract.mjs'))),
);
for (const name of [
    'rejectsOldMotionSchema',
    'singleReadStrictAdmission',
    'validationAndEmptyPreserveSnapshot',
    'pendingRecovery',
    'orderedAnalyticArithmetic',
    'immediateLocks',
    'targetReductionBoundaries',
    'disabledAndStaticReset',
    'mutationPhasesNoReplay',
    'realSleepingIslandWake',
    'growthAndImmutableCopies',
    'fullGenerationReuse',
    'cleanupAndModuleIsolation',
])
    assert.equal(command.checks[name], true);
assert.equal(command.observations.idCycles.length, 128);
assert.deepEqual(
    command.negatives.map((row) => row.name),
    [
        'foreign-world',
        'foreign-module',
        'forged-token',
        'later-static-force',
        'later-target-type',
        'NaN',
        'Infinity',
        'float32-overflow',
        'accumulation-overflow',
        'sequence-duplicate',
        'sequence-zero-user',
        'sequence-unsafe',
        'sequence-reversal',
        'target-then-reset',
        'target-then-clear-velocity',
        'duplicate-target',
        'idle-with-reset',
        'cleanup-not-last',
        'zero-quaternion',
        'bad-quaternion',
        'scene-dynamic',
        'public-static',
        'unknown-opcode',
        'unused-offset',
        'explicit-null-space',
        'explicit-null-offset',
        'explicit-null-mode',
        'explicit-null-wake',
        'explicit-null-preserveVelocity',
        'strict-wake-0',
        'strict-wake-1',
        'strict-wake-false',
        'dt-0',
        'dt--1',
        'dt-1e-50',
        'dt-NaN',
        'dt-Infinity',
        'dt-1e-40',
        'substeps-0',
        'substeps-3',
        'substeps-16',
        'substeps-4',
        'caught-reentry',
        'caught-reentry-no-native-control',
        'caught-reentry-zero-all-native-exports',
        'target-native-speed-cap',
        'target-native-lock-conflict',
    ],
);
assert.equal(command.sampleCount, 217);
assert.equal(command.nativeCommandInvocations.length, 198);
const invocations = command.nativeCommandInvocations;
assert.deepEqual(
    {
        total: invocations.length,
        validation: invocations.filter((r) => r.apply === 0).length,
        committed: invocations.filter((r) => r.apply === 1 && r.operationCount > 0 && r.nativeStatus === 0).length,
        empty: invocations.filter((r) => r.apply === 1 && r.operationCount === 0 && r.nativeStatus === 0).length,
        refused: invocations.filter((r) => r.nativeStatus !== 0).length,
    },
    { total: 198, validation: 4, committed: 176, empty: 1, refused: 17 },
);
for (const [index, row] of invocations.entries()) {
    assert.equal(row.index, index);
    assert.equal(row.throwMessage, undefined);
    assert.ok([0, 1].includes(row.apply));
    assert.ok([0, 1, 2, 4, 5, 8, 9, 10, 11, 12].includes(row.nativeStatus));
    assert.equal(row.input.length, row.inputWords);
    assert.equal(row.input[0], 0x314d4355);
    assert.equal(row.input[1], 1);
    assert.equal(row.input[2], row.inputWords);
    assert.equal(row.input[3], row.bodyCount);
    assert.equal(row.input[4], row.operationCount);
    assert.equal(row.inputWords, 12 + row.bodyCount * 4 + row.operationCount * 16);
    if (row.apply === 1 && row.operationCount > 0 && row.nativeStatus === 0) {
        assert.equal(row.actualOutput.length, 12 + row.bodyCount * 160 + row.operationCount * 80);
        assert.deepEqual(row.actualOutput.slice(0, 12), [
            0x31524355,
            1,
            row.actualOutput.length,
            row.bodyCount,
            row.operationCount,
            160,
            80,
            12,
            12 + row.bodyCount * 160,
            1,
            0,
            0,
        ]);
    } else assert.equal(row.actualOutput, undefined);
}
const commandSamples = read('command-samples.raw.jsonl')
    .toString()
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
const commandSampleKinds = {};
for (const row of commandSamples) commandSampleKinds[row.kind] = (commandSampleKinds[row.kind] ?? 0) + 1;
assert.deepEqual(commandSampleKinds, {
    rejection: 47,
    'caught-reentry-zero-native-calls': 1,
    'single-read': 1,
    'pose-single-read': 1,
    'mass-pending-recovery': 1,
    'analytic-box': 32,
    'clear-prevents-later-force-overflow': 1,
    'locked-impulses': 1,
    'target-is-velocity-not-arrival': 1,
    'preserve-idle-cleanup': 1,
    'real-contact-island-wake': 1,
    'growth-result': 1,
    'id-reuse': 128,
});
assert.deepEqual(
    commandSamples.filter((row) => row.kind === 'rejection').map((row) => row.name),
    command.negatives.map((row) => row.name),
);
assert.deepEqual(
    commandSamples.filter((row) => row.kind === 'analytic-box').map((row) => row.scene),
    Array.from({ length: 32 }, (_, i) => i),
);
assert.deepEqual(
    commandSamples.filter((row) => row.kind === 'id-reuse').map((row) => row.index),
    Array.from({ length: 128 }, (_, i) => i),
);

assert.equal(command.negatives.length, 47);
assert.equal(command.injectedMechanisms.length, 6);
assert.deepEqual(fileHash('command-samples.raw.jsonl'), {
    path: command.samplesArtifact.path,
    bytes: command.samplesArtifact.bytes,
    sha256: command.samplesArtifact.sha256,
});
assert.equal(read('command-samples.raw.jsonl').toString().trim().split('\n').length, command.sampleCount);
assert.equal(command.samplesArtifact.records, command.sampleCount);
for (const filename of ['air_box3d_command_contract.cjs', 'wasm-command-contract.mjs'])
    assert.ok(
        receipt.commands.some((entry) => entry.args.some((arg) => arg.endsWith(filename)) && entry.exitCode === 0),
    );
const nativeHull = json('native-hull-contract.raw.json');
assert.equal(nativeHull.status, 'PASS');
assert.equal(nativeHull.pointerBytes, 4);
assert.deepEqual(nativeHull, receipt.hullContract);
for (const check of [
    'pureGeometryValidation',
    'trueTetraMassInertia',
    'nonBoxRayAndDebug',
    'ordinaryFailureNoWrite',
    'finiteAndDegenerateInputs',
    'copiedInputLifetime',
    'commandMotionCompatibility',
    'raw256Points',
    'exact128EdgeBoundary',
    'derivedCapacityBoundary',
    'sensor128Lifetimes',
    'coreCleanup',
])
    assert.equal(nativeHull.checks[check], true, check);
const nativeHullCore = json('native-hull-core-contract.raw.json');
assert.equal(nativeHullCore.status, 'PASS');
assert.equal(nativeHullCore.pointerBytes, 4);
assert.deepEqual(nativeHullCore, receipt.hullCoreContract);
for (const check of [
    'realHullEquivalence',
    'budgetSpikeRejected',
    'strictMinOutsideBoundary',
    'exactWorkspaceBoundary',
])
    assert.equal(nativeHullCore.checks[check], true, check);
assert.ok(nativeHullCore.maximumPointCount > 128 && nativeHullCore.workBytes <= 2147483647);
const legacyHull = json('hull-legacy-baseline/comparison.raw.json');
assert.equal(legacyHull.status, 'PASS');
assert.equal(legacyHull.kind, 'st-simd-wasm');
assert.equal(legacyHull.mode, receipt.mode);
assert.equal(
    legacyHull.fixtureSha256,
    sha256(readFileSync(resolve(root, 'tools/physics/box3d/native/hull_legacy_fingerprint.c'))),
);
assert.equal(legacyHull.patchedIdentity.patchChainSha256, manifest.patchChainSha256);
assert.equal(legacyHull.patchedIdentity.schemaSha256, manifest.schemaSha256);
assert.deepEqual(legacyHull.baselineIdentity.appliedPatches, hullQualification.preHullPrefix(patchPlan).patches);
assert.ok(legacyHull.commands.length > 2 && legacyHull.commands.every((c) => c.exitCode === 0 && !c.error));
assert.equal(legacyHull.outputs.byteEqual, true);
assert.deepEqual(legacyHull.outputs.cases, ['tetra', 'prism', 'duplicates256']);
assert.equal(sha256(read('hull-legacy-baseline/baseline.raw.txt')), legacyHull.outputs.baselineSha256);
assert.equal(sha256(read('hull-legacy-baseline/patched.raw.txt')), legacyHull.outputs.patchedSha256);
assert.equal(legacyHull.outputs.baselineSha256, legacyHull.outputs.patchedSha256);
assert.equal(sha256(read('air_box3d_hull_legacy_fingerprint.cjs')), legacyHull.outputs.patchedExecutableSha256);
assert.equal(sha256(read('hull-legacy-baseline/legacy-fingerprint.cjs')), legacyHull.outputs.baselineExecutableSha256);
const legacyPlan = {
    lock: json('hull-legacy-baseline/prefix-lock.json'),
    patchChainSha256: legacyHull.baselineIdentity.patchChainSha256,
    patchLockSha256: legacyHull.baselineIdentity.patchLockSha256,
};
assert.equal(sha256(read('hull-legacy-baseline/prefix-lock.json')), legacyPlan.patchLockSha256);
assert.deepEqual(legacyPlan.lock.patches, hullQualification.preHullPrefix(patchPlan).patches);
assert.equal(
    validatePatchLock(legacyPlan.lock, manifest.coreSha, (path) => readFileSync(resolve(root, path))),
    legacyPlan.patchChainSha256,
);
const legacyCoreDir = resolve(dir, 'hull-legacy-baseline/staged-core');
const legacyCommands = json('hull-legacy-baseline/compile_commands.json');
assert.deepEqual(
    legacyCommands.map((c) => c.file).sort(),
    [
        ...readdirSync(resolve(legacyCoreDir, 'src'))
            .filter((name) => name.endsWith('.c'))
            .map((name) => resolve(legacyCoreDir, 'src', name)),
        resolve(root, 'tools/physics/box3d/native/hull_legacy_fingerprint.c'),
    ].sort(),
);
for (const command of legacyCommands) {
    const flags = command.arguments.join(' ');
    for (const flag of requiredFlags) assert.ok(flags.includes(flag), `Legacy baseline missing ${flag}`);
    assert.ok(!forbiddenFlags.test(flags), command.file);
    assert.equal(flags.includes('-DNDEBUG'), receipt.mode === 'Release', command.file);
}

assert.deepEqual(
    verifyStagedCore(resolve(dir, 'hull-legacy-baseline/staged-core'), legacyPlan),
    legacyHull.baselineStage,
);
for (const filename of ['air_box3d_hull_contract.cjs', 'air_box3d_hull_core_contract.cjs', 'hull-legacy-contract.mjs'])
    assert.ok(
        receipt.commands.some((entry) => entry.args.some((arg) => arg.endsWith(filename)) && entry.exitCode === 0),
    );
const sphereCapsuleQualification = verifySphereCapsuleQualification({
    report: json('wasm-sphere-capsule-contract.raw.json'),
    samplesText: read('sphere-capsule-samples.raw.jsonl').toString('utf8'),
    identity: manifest,
    fixtureSha256: sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-sphere-capsule-contract.mjs'))),
    oracleSha256: sha256(readFileSync(resolve(root, 'tools/physics/box3d/sphere-capsule/oracle.mjs'))),
});
const storageQualification = verifyStorageQualification({
    native: json('native-world-storage-contract.raw.json'),
    wasm: json('wasm-storage-contract.raw.json'),
    identity: manifest,
    fixtureSha256: sha256(readFileSync(resolve(root, 'tools/physics/box3d/wasm-storage-contract.mjs'))),
    receipt,
});
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
    memoryQualification,
    storageQualification,
    sphereCapsuleQualification,
    evidence: [
        'native-memory-contract.raw.json',
        'air_box3d_memory_contract.cjs',
        'wasm-memory-contract.raw.json',

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
        'native-filter-contract.raw.json',
        'wasm-filter-contract.raw.json',
        'air_box3d_filter_contract.cjs',
        'native-motion-contract.raw.json',
        'wasm-motion-contract.raw.json',
        'air_box3d_motion_contract.cjs',
        'motion-samples.raw.jsonl',
        'native-hull-contract.raw.json',
        'native-hull-core-contract.raw.json',
        'air_box3d_hull_contract.cjs',
        'air_box3d_hull_core_contract.cjs',
        'air_box3d_hull_legacy_fingerprint.cjs',
        'hull-legacy-baseline/comparison.raw.json',
        'hull-legacy-baseline/compile_commands.json',
        'hull-legacy-baseline/baseline.raw.txt',
        'hull-legacy-baseline/patched.raw.txt',
        'native-joint-contract.raw.json',
        'air_box3d_joint_contract.cjs',
        'native-hinge-contract.raw.json',
        'air_box3d_hinge_contract.cjs',
        'native-p2p-contract.raw.json',
        'air_box3d_p2p_contract.cjs',
        'native-mesh-contract.raw.json',
        'wasm-mesh-contract.raw.json',
        'air_box3d_mesh_contract.cjs',
        'native-capsule-contract.raw.json',
        'air_box3d_capsule_contract.cjs',
        'native-query-contract.raw.json',
        'wasm-query-contract.raw.json',
        'air_box3d_query_contract.cjs',
        'native-command-contract.raw.json',
        'wasm-command-contract.raw.json',
        'air_box3d_command_contract.cjs',
        'command-samples.raw.jsonl',
        'native-world-storage-contract.raw.json',
        'air_box3d_world_storage_contract.cjs',
        'wasm-storage-contract.raw.json',
        'sphere-capsule-samples.raw.jsonl',
        'wasm-sphere-capsule-contract.raw.json',
    ].map(fileHash),
};
assert.deepEqual(
    report.evidence.map((entry) => entry.path).sort(),
    [...expectedGate.evidence].sort(),
    'Exact evidence set',
);
assert.equal(report.compiledSourceCount, 85, 'Exact current compiled source inventory');
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(
    JSON.stringify({ status: report.status, compiledSourceCount: commands.length, output: relative(root, reportPath) }),
);
