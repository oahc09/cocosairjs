/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Opt-in Box3D ST asset staging and build-descriptor injection. No downloads,
 * compilation, publication or runtime evaluation. Default builds read/copy no Box3D assets.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { pathToFileURL } = require('node:url');
const { verifyCommandQualification, verifyCommandSchedule } = require('./box3d-command-qualification.cjs');
const { verifyQueryQualification } = require('./box3d-query-qualification.cjs');
const { verifyCapsuleQualification } = require('./box3d-capsule-qualification.cjs');
const { verifyHullQualification } = require('./box3d-hull-qualification.cjs');
const COMMAND_EXPECTATIONS = require('./box3d-command-expectations.json');
const ROOT = path.resolve(__dirname, '../..');
const FEATURE = 'physics-box3d';
const ENTRY = 'src/air/physics/box3d/feature.ts';
const DESCRIPTOR_MARKER = "'__AIR_BOX3D_ST_DESCRIPTOR__'";
const BASE_MARKER = "'__AIR_BOX3D_ST_ASSET_BASE__'";
const ARTIFACTS = ['box3d-st.mjs', 'box3d-st.wasm', 'facade.mjs', 'facade.d.mts'];
const INPUTS = [
    'tools/build/box3d-command-expectations.json',
    'tools/build/box3d-command-qualification.cjs',

    'tools/physics/box3d/native/memory_contract.c',
    'tools/physics/box3d/wasm-memory-contract.mjs',
    'tools/physics/box3d/memory-diagnostics/v1/qualification.mjs',

    'tools/physics/box3d/native/memory_diagnostics.c',
    'tools/physics/box3d/native/memory_diagnostics.h',
    'tools/physics/box3d/memory-diagnostics/v1/schema.json',
    'tools/physics/box3d/memory-diagnostics/v1/source-lock.json',
    'tools/physics/box3d/memory-diagnostics/v1/source-gate.mjs',
    'tools/physics/box3d/memory-diagnostics/v1/contract.test.mjs',
    'tools/physics/box3d/memory-diagnostics/v1/README.md',
    'src/air/physics/box3d/world.ts',

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
    'tools/physics/box3d/capsule-bridge-contract.md',
    'tools/physics/box3d/native/capsule_contract.c',
    'tools/physics/box3d/native/hull_bridge.c',
    'tools/physics/box3d/native/hull_bridge.h',
    'tools/physics/box3d/native/joint_bridge.c',
    'tools/physics/box3d/native/joint_bridge.h',
    'tools/physics/box3d/native/joint_contract.c',
    'tools/physics/box3d/native/hinge_bridge.c',
    'tools/physics/box3d/native/hinge_bridge.h',
    'tools/physics/box3d/native/hinge_contract.c',
    'tools/physics/box3d/native/p2p_bridge.c',
    'tools/physics/box3d/native/p2p_bridge.h',
    'tools/physics/box3d/native/p2p_contract.c',
    'tools/physics/box3d/native/hull_contract.c',
    'tools/physics/box3d/native/hull_core_contract.c',
    'tools/physics/box3d/native/hull_legacy_fingerprint.c',
    'tools/physics/box3d/hull-bridge-contract.md',
    'tools/physics/box3d/hull-legacy-contract.mjs',
    'tools/physics/box3d/patches/checked-hull-cooking.patch',
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
    'tools/physics/box3d/native/mesh_bridge.c',
    'tools/physics/box3d/native/mesh_bridge.h',
    'tools/physics/box3d/native/mesh_contract.c',
    'tools/physics/box3d/wasm-mesh-contract.mjs',
    'tools/physics/box3d/static-mesh-bridge-contract.md',
    'tools/physics/box3d/patches/same-world-identity-v1.candidate.patch',
    'tools/physics/box3d/patches/same-world-empty-storage-v1.candidate.patch',
    'tools/physics/box3d/memory-diagnostics/v2/schema.json',
    'tools/physics/box3d/memory-diagnostics/v2/source-lock.json',
    'tools/physics/box3d/memory-diagnostics/v2/source-gate.mjs',
    'tools/physics/box3d/memory-diagnostics/v2/contract.test.mjs',
    'tools/physics/box3d/memory-diagnostics/v2/README.md',
    'tools/physics/box3d/memory-diagnostics/v2/qualification.mjs',
    'tools/physics/box3d/native/world_storage_contract.c',
    'tools/physics/box3d/wasm-storage-contract.mjs',
    'tools/physics/box3d/empty-world-trim/production/contract.test.mjs',
    'tools/physics/box3d/empty-world-trim/production/qualification.mjs',
    'src/air/app.ts',
    'src/air/physics/preparation.ts',
    'src/air/physics/box3d/world-command-owner.ts',
    'src/air/physics/box3d/world-binding.ts',
    'src/air/session-scope.ts',
    'tools/verify/box3d/empty-world-release.test.mjs',
    'tools/build/box3d-hull-qualification.cjs',
    'tools/physics/box3d/sphere-capsule/oracle.mjs',
    'tools/physics/box3d/sphere-capsule/contract.test.mjs',
    'tools/physics/box3d/wasm-sphere-capsule-contract.mjs',
    'tools/physics/box3d/sphere-capsule/qualification.mjs',
    'tools/build/box3d-sphere-capsule-gates.test.cjs',
    'src/air/physics/box3d/collision-events.ts',
    'tools/physics/box3d/sphere-capsule/public-contract.mjs',
    'tools/physics/box3d/sphere-capsule/public-contract.test.mjs',
    'src/air/physics/box3d/contact-equation.ts',
    'tools/physics/box3d/native/module_release.c',
    'tools/physics/box3d/native/module_release.h',
    'tools/physics/box3d/native/module_release_contract.c',
    'src/air/physics/box3d/binding/module-release.mjs',
    'src/air/physics/box3d/binding/module-release.d.mts',
    'tools/physics/box3d/module-release/contract.test.mjs',
    'tools/physics/box3d/module-release/README.md',
    'tools/physics/box3d/module-release/qualification.mjs',
    'tools/physics/box3d/wasm-module-release-contract.mjs',
    'tools/build/box3d-module-release-gates.test.cjs',
    'src/air/physics/box3d/loader/st-loader.mjs',
    'src/air/physics/box3d/loader/st-loader.d.mts',
    'tools/physics/box3d/module-release/loader-contract.test.mjs',
    'tools/physics/box3d/module-release/public-contract.mjs',
    'tools/verify/box3d/loader-lifecycle.test.mjs',
    'src/air/physics/box3d/prepare.ts',
];
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(file);
const json = (file) => JSON.parse(read(file));
const sorted = (items) => [...items].sort();
const freeze = (value) => {
    if (value && typeof value === 'object') {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
    }
    return value;
};
function safeRelative(name) {
    assert.equal(typeof name, 'string', 'Artifact path must be a string');
    assert(/^[a-zA-Z0-9._-]+(?:\/[a-zA-Z0-9._-]+)*$/.test(name), `Unsafe relative path: ${name}`);
    assert(!name.split('/').some((part) => part === '.' || part === '..'), `Unsafe relative path: ${name}`);
    return name;
}
function fileInside(directory, name) {
    const resolved = path.resolve(directory, safeRelative(name));
    const relative = path.relative(fs.realpathSync(directory), fs.realpathSync(resolved));
    assert(relative && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative), 'Symlink escapes source');
    assert(fs.statSync(resolved).isFile(), `Not a regular file: ${name}`);
    return resolved;
}
function verifyRecord(directory, record) {
    assert(record && typeof record === 'object', 'Invalid file record');
    assert(/^[a-f0-9]{64}$/.test(record.sha256), `Invalid SHA: ${record.path}`);
    assert(Number.isSafeInteger(record.bytes) && record.bytes > 0, `Invalid size: ${record.path}`);
    const bytes = read(fileInside(directory, record.path));
    assert.equal(bytes.length, record.bytes, `Size mismatch: ${record.path}`);
    assert.equal(sha256(bytes), record.sha256, `Hash mismatch: ${record.path}`);
    return bytes;
}
/** Read-only consistency gate; physical/browser acceptance is not inferred from staging. */
async function verifySTBuild(buildDirectory, { provenanceRoot = ROOT } = {}) {
    assert(typeof buildDirectory === 'string' && buildDirectory.trim(), 'AIR_BOX3D_ST_BUILD_DIR is required');
    const directory = path.resolve(buildDirectory);
    const { verifySources } = await import(pathToFileURL(path.join(ROOT, 'tools/physics/box3d/verify-sources.mjs')));
    const sources = verifySources();
    const { readPatchPlan, validatePatchLock, verifyStagedCore } = await import(
        pathToFileURL(path.join(ROOT, 'tools/physics/box3d/patch-intake.mjs'))
    );
    const { verifyMemoryDiagnosticSources } = await import(
        pathToFileURL(path.join(ROOT, 'tools/physics/box3d/memory-diagnostics/v2/source-gate.mjs'))
    );
    const { verifyMemoryDiagnosticQualification } = await import(
        pathToFileURL(path.join(ROOT, 'tools/physics/box3d/memory-diagnostics/v2/qualification.mjs'))
    );
    const { verifyStorageQualification } = await import(
        pathToFileURL(path.join(ROOT, 'tools/physics/box3d/empty-world-trim/production/qualification.mjs'))
    );
    const { verifySphereCapsuleQualification } = await import(
        pathToFileURL(path.join(ROOT, 'tools/physics/box3d/sphere-capsule/qualification.mjs'))
    );
    const { verifyModuleReleaseQualification } = await import(
        pathToFileURL(path.join(ROOT, 'tools/physics/box3d/module-release/qualification.mjs'))
    );
    const patch = readPatchPlan();
    const lock = json(path.join(ROOT, 'tools/physics/box3d/versions.lock.json'));
    const receipt = json(fileInside(directory, 'build-receipt.json'));
    const manifestBytes = read(fileInside(directory, 'manifest.json'));
    const manifest = JSON.parse(manifestBytes);
    const audit = json(fileInside(directory, 'artifact-audit.raw.json'));
    assert.equal(receipt.status, 'PASS', 'Native build did not pass');
    assert.equal(receipt.kind, 'st-simd-wasm');
    assert(['Debug', 'Release'].includes(receipt.mode));
    verifyCommandSchedule(receipt);
    assert.deepEqual(
        receipt.memorySourceControls,
        verifyMemoryDiagnosticSources(ROOT, path.join(directory, 'staged-core')),
    );
    assert.equal(INPUTS.length, 136);
    assert.deepEqual(sorted(INPUTS), sorted(COMMAND_EXPECTATIONS.gate.inputs));
    assert.deepEqual(sorted(receipt.inputHashes.map((row) => row.path)), sorted(INPUTS), 'Build input inventory drift');
    for (const input of receipt.inputHashes) {
        safeRelative(input.path);
        assert.equal(sha256(read(path.join(ROOT, input.path))), input.sha256, `Build input drift: ${input.path}`);
    }
    const identity = {
        coreSha: lock.core.commit,
        bindingBaseSha: lock.bindingBase.commit,
        patchChainSha256: patch.patchChainSha256,
        abiVersion: 1,
        variant: 'st-simd',
        schemaSha256: sources.schemaSha256,
    };
    assert.equal(manifest.schemaVersion, 1);
    for (const [key, value] of Object.entries(identity))
        assert.equal(manifest[key], value, `Identity mismatch: ${key}`);
    assert.equal(manifest.patchLockSha256, patch.patchLockSha256);
    assert.deepEqual(manifest.appliedPatches, patch.lock.patches);
    assert.deepEqual(sorted(manifest.artifacts.map((row) => row.path)), sorted(ARTIFACTS), 'Artifact inventory drift');
    assert.deepEqual(manifest.artifacts, receipt.artifacts);
    const bytes = new Map(manifest.artifacts.map((record) => [record.path, verifyRecord(directory, record)]));
    for (const name of ['facade.mjs', 'facade.d.mts']) {
        assert(bytes.get(name).equals(read(path.join(ROOT, 'src/air/physics/box3d/binding', name))), `Stale ${name}`);
    }
    assert.equal(audit.status, 'PASS');
    const memoryQualification = verifyMemoryDiagnosticQualification({
        native: json(fileInside(directory, 'native-memory-contract.raw.json')),
        wasm: json(fileInside(directory, 'wasm-memory-contract.raw.json')),
        identity,
        fixtureSha256: sha256(read(path.join(ROOT, 'tools/physics/box3d/wasm-memory-contract.mjs'))),
        receipt,
    });
    assert.deepEqual(audit.memoryQualification, memoryQualification);
    const storageQualification = verifyStorageQualification({
        native: json(fileInside(directory, 'native-world-storage-contract.raw.json')),
        wasm: json(fileInside(directory, 'wasm-storage-contract.raw.json')),
        identity,
        fixtureSha256: sha256(read(path.join(ROOT, 'tools/physics/box3d/wasm-storage-contract.mjs'))),
        receipt,
    });
    assert.deepEqual(audit.storageQualification, storageQualification);
    const moduleReleaseQualification = verifyModuleReleaseQualification({
        native: json(fileInside(directory, 'native-module-release-contract.raw.json')),
        wasm: json(fileInside(directory, 'wasm-module-release-contract.raw.json')),
        identity: manifest,
        fixtureSha256: sha256(read(path.join(ROOT, 'tools/physics/box3d/wasm-module-release-contract.mjs'))),
        receipt,
    });
    assert.deepEqual(audit.moduleReleaseQualification, moduleReleaseQualification);
    const sphereCapsuleQualification = verifySphereCapsuleQualification({
        report: json(fileInside(directory, 'wasm-sphere-capsule-contract.raw.json')),
        samplesText: read(fileInside(directory, 'sphere-capsule-samples.raw.jsonl')).toString('utf8'),
        identity: manifest,
        fixtureSha256: sha256(read(path.join(ROOT, 'tools/physics/box3d/wasm-sphere-capsule-contract.mjs'))),
        oracleSha256: sha256(read(path.join(ROOT, 'tools/physics/box3d/sphere-capsule/oracle.mjs'))),
    });
    assert.deepEqual(audit.sphereCapsuleQualification, sphereCapsuleQualification);
    assert.equal(audit.auditScriptSha256, sha256(read(path.join(ROOT, 'tools/physics/box3d/audit-artifacts.mjs'))));
    assert.deepEqual(audit.sources, sources);
    assert.deepEqual(audit.artifacts, manifest.artifacts);
    assert.equal(audit.buildInputHashesMatched, INPUTS.length);
    assert.equal(audit.sharedMemory, false);
    assert.equal(audit.dynamicExecutionOrWorkerConstructorFound, false);
    assert.equal(audit.compiledSourceCount, audit.compiledSourceHashes.length);
    assert.equal(audit.compiledSourceCount, 87, 'Compile audit inventory drift');
    assert.equal(new Set(audit.compiledSourceHashes.map((row) => row.path)).size, audit.compiledSourceCount);
    for (const name of [
        'body_control.c',
        'body_contract.c',
        'filter_bridge.c',
        'filter_contract.c',
        'motion_bridge.c',
        'motion_contract.c',
        'command_bridge.c',
        'command_contract.c',
        'query_bridge.c',
        'query_contract.c',
        'capsule_contract.c',
        'joint_bridge.c',
        'joint_contract.c',
        'hinge_bridge.c',
        'hinge_contract.c',
        'p2p_bridge.c',
        'p2p_contract.c',
        'mesh_bridge.c',
        'mesh_contract.c',
        'hull_bridge.c',
        'hull_contract.c',
        'hull_core_contract.c',
        'hull_legacy_fingerprint.c',
    ]) {
        assert(audit.compiledSourceHashes.some((row) => row.path === `tools/physics/box3d/native/${name}`));
    }
    const stagedPrefix = path.relative(ROOT, path.join(directory, 'staged-core')).split(path.sep).join('/') + '/';
    assert.deepEqual(
        sorted(
            audit.compiledSourceHashes.map((row) =>
                row.path.startsWith(stagedPrefix) ? 'staged-core/' + row.path.slice(stagedPrefix.length) : row.path,
            ),
        ),
        sorted(COMMAND_EXPECTATIONS.gate.compileUnits),
        'Exact compiled source inventory',
    );
    for (const input of audit.compiledSourceHashes) {
        safeRelative(input.path);
        assert.equal(sha256(read(fileInside(ROOT, input.path))), input.sha256, `Compiled input drift: ${input.path}`);
    }
    assert.deepEqual(
        sorted(audit.evidence.map((row) => row.path)),
        sorted([
            'native-memory-contract.raw.json',
            'air_box3d_memory_contract.cjs',
            'wasm-memory-contract.raw.json',
            'build-receipt.json',
            'manifest.json',
            'staged-core.receipt.json',
            'compile_commands.json',
            'CMakeFiles/air_box3d.dir/link.txt',
            'wasm-contract.raw.json',
            'wasm-ownership-contract.raw.json',
            'wasm-snapshot-contract.raw.json',
            'native-geometry-contract.raw.json',
            'wasm-geometry-contract.raw.json',
            'geometry-samples.raw.jsonl',
            'air_box3d_geometry_contract.cjs',
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
            'motion-samples.raw.jsonl',
            'air_box3d_motion_contract.cjs',
            'native-joint-contract.raw.json',
            'air_box3d_joint_contract.cjs',
            'native-hinge-contract.raw.json',
            'air_box3d_hinge_contract.cjs',
            'native-p2p-contract.raw.json',
            'air_box3d_p2p_contract.cjs',
            'air_box3d_mesh_contract.cjs',
            'native-mesh-contract.raw.json',
            'wasm-mesh-contract.raw.json',
            'native-capsule-contract.raw.json',
            'air_box3d_capsule_contract.cjs',
            'native-hull-contract.raw.json',
            'native-hull-core-contract.raw.json',
            'air_box3d_hull_contract.cjs',
            'air_box3d_hull_core_contract.cjs',
            'air_box3d_hull_legacy_fingerprint.cjs',
            'hull-legacy-baseline/comparison.raw.json',
            'hull-legacy-baseline/compile_commands.json',
            'hull-legacy-baseline/baseline.raw.txt',
            'hull-legacy-baseline/patched.raw.txt',
            'native-query-contract.raw.json',
            'wasm-query-contract.raw.json',
            'air_box3d_query_contract.cjs',
            'native-command-contract.raw.json',
            'wasm-command-contract.raw.json',
            'command-samples.raw.jsonl',
            'air_box3d_command_contract.cjs',
            'native-world-storage-contract.raw.json',
            'air_box3d_world_storage_contract.cjs',
            'wasm-storage-contract.raw.json',
            'sphere-capsule-samples.raw.jsonl',
            'wasm-sphere-capsule-contract.raw.json',
            'native-module-release-contract.raw.json',
            'air_box3d_module_release_contract.cjs',
            'wasm-module-release-contract.raw.json',
        ]),
    );
    assert.deepEqual(sorted(audit.evidence.map((row) => row.path)), sorted(COMMAND_EXPECTATIONS.gate.evidence));
    for (const record of audit.evidence) verifyRecord(directory, record);
    verifyCapsuleQualification({
        native: json(fileInside(directory, 'native-capsule-contract.raw.json')),
        receipt,
    });
    verifyHullQualification({
        directory,
        root: ROOT,
        provenanceRoot,
        receipt,
        identity,
        sources,
        patch,
        readArtifact: (name) => read(fileInside(directory, name)),
        readSource: (name) => read(fileInside(ROOT, name)),
        validatePatchLock,
        verifyStagedCore,
    });
    verifyQueryQualification({
        native: json(fileInside(directory, 'native-query-contract.raw.json')),
        wasm: json(fileInside(directory, 'wasm-query-contract.raw.json')),
        identity,
        receipt,
        fixtureSha256: sha256(read(path.join(ROOT, 'tools/physics/box3d/wasm-query-contract.mjs'))),
    });
    const nativeJoint = json(fileInside(directory, 'native-joint-contract.raw.json'));
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
    const nativeHinge = json(fileInside(directory, 'native-hinge-contract.raw.json'));
    assert.equal(nativeHinge.status, 'PASS');
    assert.equal(nativeHinge.pointerBytes, 4);
    assert.deepEqual(nativeHinge, receipt.hingeContract);
    assert.ok(
        receipt.commands.some(
            (entry) => entry.args.some((arg) => arg.endsWith('air_box3d_hinge_contract.cjs')) && entry.exitCode === 0,
        ),
    );
    const wasmMesh = json(fileInside(directory, 'wasm-mesh-contract.raw.json'));
    assert.equal(wasmMesh.status, 'PASS');
    assert.equal(wasmMesh.orders.length, 4);
    assert.equal(wasmMesh.fixtureSha256, sha256(read(fileInside(ROOT, 'tools/physics/box3d/wasm-mesh-contract.mjs'))));
    for (const passed of Object.values(wasmMesh.checks)) assert.equal(passed, true);
    const nativeMesh = json(fileInside(directory, 'native-mesh-contract.raw.json'));
    assert.equal(nativeMesh.status, 'PASS');
    assert.equal(nativeMesh.pointerBytes, 4);
    assert.equal(nativeMesh.releaseOrders, 4);
    assert.ok(nativeMesh.checks >= 618);
    assert.deepEqual(nativeMesh, receipt.meshContract);
    const nativeP2P = json(fileInside(directory, 'native-p2p-contract.raw.json'));
    assert.equal(nativeP2P.status, 'PASS');
    assert.equal(nativeP2P.pointerBytes, 4);
    assert.equal(nativeP2P.coreSha, identity.coreSha);
    assert.deepEqual(nativeP2P, receipt.p2pContract);
    assert.equal(nativeP2P.rejectionChecks, 126);
    assert.equal(nativeP2P.geometryChecks, 15);
    for (const field of [
        'nativeSpherical',
        'fullGenerationWorldOwnership',
        'independentBodyOriginQuaternionAnchorOracle',
        'configurePreservesFramesAndPoses',
        'nativePositionalSoftnessUnchanged',
        'actualCollisionManifolds',
        'wholeSolverBodyStateUnchanged',
    ])
        assert.equal(nativeP2P[field], true, field);
    for (const field of [
        'anchoredMaxAnchorMeters',
        'twoDynamicMaxAnchorMeters',
        'mismatchFinalMeters',
        'mismatchMaxSettledMeters',
    ])
        assert.ok(Number.isFinite(nativeP2P[field]) && nativeP2P[field] >= 0 && nativeP2P[field] <= 0.02, field);
    assert.ok(nativeP2P.mismatchInitialMeters > 0.3);
    assert.equal(nativeP2P.independentFreeRotationAxes, 3);
    assert.ok(
        Number.isFinite(nativeP2P.maxQuaternionErrorRadians) &&
            nativeP2P.maxQuaternionErrorRadians >= 0 &&
            nativeP2P.maxQuaternionErrorRadians <= 0.005,
    );
    assert.equal(nativeP2P.pureStateReads, 8684);
    assert.equal(nativeP2P.finalCoreBytes, 0);
    assert.equal(nativeP2P.finalBridgeBytes, 0);
    const nativeGeometry = json(fileInside(directory, 'native-geometry-contract.raw.json'));
    assert.equal(nativeGeometry.status, 'PASS', 'Native geometry qualification did not pass');
    assert.equal(nativeGeometry.pointerBytes, 4, 'Geometry qualification must execute WASM32');
    const geometry = json(fileInside(directory, 'wasm-geometry-contract.raw.json'));
    assert.equal(geometry.status, 'PASS', 'Independent geometry oracle did not pass');
    for (const [key, value] of Object.entries(identity))
        assert.equal(geometry.identity?.[key], value, `Geometry qualification identity mismatch: ${key}`);
    const nativeWorld = json(fileInside(directory, 'native-world-contract.raw.json'));
    assert.equal(nativeWorld.status, 'PASS', 'Native world qualification did not pass');
    assert.equal(nativeWorld.pointerBytes, 4, 'World qualification must execute WASM32');
    const world = json(fileInside(directory, 'wasm-world-contract.raw.json'));
    assert.equal(world.status, 'PASS', 'Real WASM world qualification did not pass');
    assert.equal(
        world.fixtureSha256,
        sha256(read(path.join(ROOT, 'tools/physics/box3d/wasm-world-contract.mjs'))),
        'World fixture input drift',
    );
    for (const [key, value] of Object.entries(identity))
        assert.equal(world.identity?.[key], value, `World qualification identity mismatch: ${key}`);
    const nativeBody = json(fileInside(directory, 'native-body-contract.raw.json'));
    assert.equal(nativeBody.status, 'PASS', 'Native body qualification did not pass');
    assert.equal(nativeBody.pointerBytes, 4, 'Body qualification must execute WASM32');
    for (const key of [
        'lockedWorldNoWrite',
        'fullGenerationWorldNoWrite',
        'boxMassAndAngularImpulse',
        'clearActualForceNotImpulse',
        'actualSleepTimerAndZeroThreshold',
        'sensorFallbackAndMixedExclusion',
        'pendingGeometryLifecycle',
        'immediateImpulseLocks',
        'smallBoxNoSilentClamp',
        'coreBytesRestored',
    ]) {
        assert.equal(nativeBody[key], true, `Native body qualification missing: ${key}`);
    }
    const body = json(fileInside(directory, 'wasm-body-contract.raw.json'));
    assert.equal(body.status, 'PASS', 'Real WASM body qualification did not pass');
    assert.equal(
        body.fixtureSha256,
        sha256(read(path.join(ROOT, 'tools/physics/box3d/wasm-body-contract.mjs'))),
        'Body fixture input drift',
    );
    for (const [key, value] of Object.entries(identity))
        assert.equal(body.identity?.[key], value, `Body qualification identity mismatch: ${key}`);
    for (const key of [
        'bodyControlsValidationAndOldSnapshotImmutable',
        'immediateImpulseLocks',
        'smallBoxNoSilentClamp',
        'totalMassAnalytic',
        'offsetCOMImpulse',
        'sensorFallbackAndMixedExclusion',
        'localForceAndTorque',
        'dampingGrid',
        'gravityDoesNotClearVelocity',
        'sleepAndThresholdNative',
        'axisLocks',
        'fullId128Cycles',
        'bodyBeforeColliderAndRemoval',
        'rotatedOffsetBox',
        'coreAndBridgeRestored',
    ]) {
        assert.equal(body.checks?.[key], true, `Body qualification missing: ${key}`);
    }
    const nativeFilter = json(fileInside(directory, 'native-filter-contract.raw.json'));
    assert.equal(nativeFilter.status, 'PASS', 'Native filter qualification did not pass');
    assert.equal(nativeFilter.pointerBytes, 4, 'Filter qualification must execute WASM32');
    assert.deepEqual(nativeFilter.acceptedBitsets, [0, 2147483648, 4294967295]);
    for (const key of [
        'nativeUpperBitsAndGroupReject',
        'batchNoPartialMutation',
        'lockedCapacityOverlapCanaries',
        'fullGenerationWorld',
        'defaultAllCreationPaths',
        'coreBytesRestored',
    ]) {
        assert.equal(nativeFilter[key], true, `Native filter qualification missing: ${key}`);
    }
    const filter = json(fileInside(directory, 'wasm-filter-contract.raw.json'));
    assert.equal(filter.status, 'PASS', 'Real WASM filter qualification did not pass');
    assert.equal(
        filter.fixtureSha256,
        sha256(read(path.join(ROOT, 'tools/physics/box3d/wasm-filter-contract.mjs'))),
        'Filter fixture input drift',
    );
    for (const [key, value] of Object.entries(identity))
        assert.equal(filter.identity?.[key], value, `Filter qualification identity mismatch: ${key}`);
    for (const key of [
        'bitsetsAndDefaults',
        'batchAdmissionAtomic',
        'copiesAndGrowth',
        'fullIdReuse',
        'contactNextStep',
        'sleepWake',
        'sensorNextStep',
        'bodyMutationOutcome',
        'filterMutationOutcome',
        'cleanup',
    ]) {
        assert.equal(filter.checks?.[key], true, `Filter qualification missing: ${key}`);
    }
    const nativeMotion = json(fileInside(directory, 'native-motion-contract.raw.json'));
    assert.equal(nativeMotion.status, 'PASS', 'Native motion qualification did not pass');
    assert.equal(nativeMotion.pointerBytes, 4, 'Motion qualification must execute WASM32');
    for (const key of [
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
        assert.equal(nativeMotion[key], true, `Native motion qualification missing: ${key}`);
    const motion = json(fileInside(directory, 'wasm-motion-contract.raw.json'));
    assert.equal(motion.status, 'PASS', 'Real WASM motion qualification did not pass');
    assert.equal(
        motion.fixtureSha256,
        sha256(read(path.join(ROOT, 'tools/physics/box3d/wasm-motion-contract.mjs'))),
        'Motion fixture input drift',
    );
    for (const [key, value] of Object.entries(identity))
        assert.equal(motion.identity?.[key], value, `Motion qualification identity mismatch: ${key}`);
    for (const key of [
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
        assert.equal(motion.checks?.[key], true, `Motion qualification missing: ${key}`);
    assert.equal(motion.sampleCount, 7201, 'Motion finite sample inventory drift');
    const motionSamples = verifyRecord(directory, motion.samplesArtifact);
    assert.equal(motion.samplesArtifact.path, 'motion-samples.raw.jsonl');
    assert.equal(motion.samplesArtifact.records, motion.sampleCount);
    assert.equal(motionSamples.toString('utf8').trim().split('\n').length, motion.sampleCount);
    const grid = motion.observations?.grid;
    assert(Array.isArray(grid), 'Motion grid missing');
    assert.deepEqual(
        sorted(grid.map((row) => `${row.n}:${row.damping}:${row.ticks}`)),
        sorted([1, 2, 4, 8].flatMap((n) => [0, 0.25, 1].map((damping) => `${n}:${damping}:600`))),
        'Motion finite qualification grid drift',
    );
    for (const row of grid)
        for (const key of ['origin', 'center', 'angle'])
            assert(
                Number.isFinite(row.max?.[key]) && row.max[key] >= 0 && row.max[key] <= 1e-4,
                `Motion prediction budget failed: ${row.n}/${row.damping}/${key}`,
            );
    const command = json(fileInside(directory, 'wasm-command-contract.raw.json'));
    const commandSamples = verifyRecord(directory, command.samplesArtifact);
    verifyCommandQualification({
        native: json(fileInside(directory, 'native-command-contract.raw.json')),
        wasm: command,
        samplesBytes: commandSamples,
        identity,
        fixtureSha256: sha256(read(path.join(ROOT, 'tools/physics/box3d/wasm-command-contract.mjs'))),
        receipt,
    });
    const descriptor = freeze({
        manifestSha256: sha256(manifestBytes),
        facadeSha256: sha256(bytes.get('facade.mjs')),
        identity,
    });
    bytes.set('manifest.json', manifestBytes);
    bytes.set('LICENSE.Box3D.txt', read(path.join(ROOT, 'vendor/box3d/core/LICENSE')));
    return {
        directory,
        descriptor,
        bytes,
        mode: receipt.mode,
        auditSha256: sha256(read(path.join(directory, 'artifact-audit.raw.json'))),
        qualificationGateSources: [
            'tools/physics/box3d/memory-diagnostics/v2/qualification.mjs',
            'tools/physics/box3d/empty-world-trim/production/qualification.mjs',
            'tools/physics/box3d/sphere-capsule/qualification.mjs',
            'tools/physics/box3d/sphere-capsule/oracle.mjs',
            'box3d-command-qualification.cjs',
            'box3d-command-expectations.json',
            'box3d-query-qualification.cjs',
            'box3d-capsule-qualification.cjs',
            'box3d-hull-qualification.cjs',
        ].map((name) => {
            const logicalPath = name.startsWith('tools/') ? name : 'tools/build/' + name;
            const data = read(path.join(ROOT, logicalPath));
            return { path: logicalPath, bytes: data.length, sha256: sha256(data) };
        }),
    };
}
/** Validates every input before writing. Not selected means no source reads or output writes. */
async function stageBox3DAssets({
    features,
    outputDirectory,
    buildDirectory,
    provenanceRoot = process.env.AIR_BOX3D_PROVENANCE_ROOT ?? ROOT,
}) {
    assert(Array.isArray(features), 'Explicit effective feature list is required');
    if (!features.includes(FEATURE)) return null;
    assert(typeof outputDirectory === 'string' && outputDirectory.trim(), 'Output directory is required');
    const verified = await verifySTBuild(buildDirectory, { provenanceRoot });
    const output = path.resolve(outputDirectory, 'physics/box3d/st');
    assert(
        output !== verified.directory &&
            !verified.directory.startsWith(output + path.sep) &&
            !output.startsWith(verified.directory + path.sep),
        'Output overlaps source',
    );
    let ancestor = output;
    while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
    assert.equal(fs.realpathSync(ancestor), path.resolve(ancestor), 'Output parent must not contain symlinks');
    const outputNames = [...verified.bytes.keys(), 'distribution-receipt.json'];
    if (fs.existsSync(output)) {
        assert(fs.statSync(output).isDirectory(), 'Output must be a directory');
        for (const name of fs.readdirSync(output)) {
            assert(outputNames.includes(name), `Unexpected existing output: ${name}`);
            const stat = fs.lstatSync(path.join(output, name));
            assert(stat.isFile() && !stat.isSymbolicLink(), 'Output file must be a regular file, never a symlink');
        }
    }
    fs.mkdirSync(output, { recursive: true });
    const records = [];
    for (const [name, bytes] of verified.bytes) {
        const target = path.join(output, name);
        fs.writeFileSync(target, bytes);
        assert(read(target).equals(bytes), `Copied artifact drift: ${name}`);
        records.push({ path: name, bytes: bytes.length, sha256: sha256(bytes) });
    }
    const receipt = {
        schemaVersion: 1,
        status: 'VERIFIED_ST_ASSET_COPY_NOT_BROWSER_OR_RELEASE_ACCEPTANCE',
        feature: FEATURE,
        mode: verified.mode,
        descriptor: verified.descriptor,
        artifactAuditSha256: verified.auditSha256,
        stagingToolSha256: sha256(read(__filename)),
        qualificationGateSources: verified.qualificationGateSources,
        artifacts: records,
        runtimeAssetRelativeDirectory: './physics/box3d/st/',
        unusedMTAssetsCopied: 0,
    };
    fs.writeFileSync(path.join(output, 'distribution-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
    return freeze({ descriptor: verified.descriptor, receipt, directory: output });
}
function box3DAssetsPlugin(staged) {
    if (!staged) return null;
    const MagicString = require('magic-string');
    return {
        name: 'air-box3d-assets',
        transform(code, id) {
            if (path.resolve(id) !== path.join(ROOT, ENTRY)) return null;
            for (const marker of [DESCRIPTOR_MARKER, BASE_MARKER])
                assert.equal(code.split(marker).length - 1, 1, `Expected one ${marker}`);
            const changed = new MagicString(code);
            for (const [marker, value] of [
                [DESCRIPTOR_MARKER, JSON.stringify(staged.descriptor)],
                [BASE_MARKER, "new URL('./physics/box3d/st/', import.meta.url).href"],
            ]) {
                const at = code.indexOf(marker);
                changed.overwrite(at, at + marker.length, value);
            }
            return { code: changed.toString(), map: changed.generateMap({ hires: true }) };
        },
    };
}
module.exports = { verifySTBuild, stageBox3DAssets, box3DAssetsPlugin };
