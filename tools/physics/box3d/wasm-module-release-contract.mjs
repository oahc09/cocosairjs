/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// One actual production factory/module. Not app.close, all malloc/handles or GC qualification.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import {
    captureModuleReleaseSnapshot,
    verifyModuleReleased,
} from '../../../src/air/physics/box3d/binding/module-release.mjs';
const directory = resolve(process.argv[2]);
const output = resolve(directory, 'wasm-module-release-contract.raw.json');
assert(!existsSync(output), 'Preserve previous module release qualification');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
    schema: 'air-box3d-module-release-wasm-v1',
    status: 'RUNNING',
    fixtureSha256: sha(readFileSync(new URL(import.meta.url))),
    identity: null,
    checks: {},
    observations: {},
    factoryCalls: 0,
    disposeCalls: 0,
    cleanupErrors: [],
    scope: 'Same-module registered-native terminal state; not app.close, full C20, all handles, malloc or GC',
};
const persist = () => writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
const check = (name, action) => {
    action();
    report.checks[name] = true;
    persist();
};
let module,
    api,
    scratch = 0;
try {
    const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json')));
    report.identity = manifest;
    const { default: factory } = await import(pathToFileURL(resolve(directory, 'box3d-st.mjs')));
    const { createBox3DBinding } = await import(pathToFileURL(resolve(directory, 'facade.mjs')));
    report.factoryCalls++;
    module = await factory({ wasmBinary: readFileSync(resolve(directory, 'box3d-st.wasm')) });
    const baseline = (report.observations.baseline = captureModuleReleaseSnapshot(module, manifest));
    persist();
    check('initialZeroRegisteredStateAtFactory', () => assert.equal(verifyModuleReleased(baseline, baseline), true));
    scratch = module._malloc(38 * 4);
    assert(scratch && scratch % 4 === 0);
    check('nativeInvalidAndShortOutputAtomic', () => {
        new Uint32Array(module.HEAPU8.buffer, scratch, 38).fill(0x91cb005a);
        assert.notEqual(module._air_b3_module_release_snapshot_v1(0, 38), 0);
        assert.notEqual(module._air_b3_module_release_snapshot_v1(scratch, 37), 0);
        assert.deepEqual(Array.from(new Uint32Array(module.HEAPU8.buffer, scratch, 38)), Array(38).fill(0x91cb005a));
    });
    module._free(scratch);
    scratch = 0;
    api = createBox3DBinding(module, manifest);
    const world = api.createWorld([0, 0, 0]);
    const bodyA = api.createBody(world, { type: 0, position: [0, 0, 0] });
    const bodyB = api.createBody(world, { type: 0, position: [10, 0, 0] });
    const points = new Float32Array([-1, 0, -1, 1, 0, -1, 1, 0, 1, -1, 0, 1]);
    const triangles = new Uint32Array([0, 2, 1, 0, 3, 2]);
    const mesh = api.cookStaticMesh(world, points, triangles);
    api.retainStaticMesh(mesh);
    api.createStaticMeshShape(bodyA, mesh);
    api.createStaticMeshShape(bodyB, mesh);
    const active = (report.observations.active = captureModuleReleaseSnapshot(module, manifest));
    persist();
    check('liveCoreWorldAndRegisteredBridgeBothObserved', () => {
        assert.equal(active.core.worlds, 1);
        assert.equal(active.bridge.worlds, 1);
        assert(active.core.trackedRequestedBytes > baseline.core.trackedRequestedBytes);
        assert(active.bridge.bytes > 0 && active.bridge.allocations > 0);
        assert.throws(() => verifyModuleReleased(baseline, active));
    });
    check('meshLeasesReferencesAndBorrowsObserved', () => {
        assert.equal(active.mesh.resources, 1);
        assert.equal(active.mesh.leases, 2);
        assert.equal(active.mesh.references, 2);
        assert.equal(active.mesh.borrowNodes, 2);
        assert(active.mesh.resourceStorageBytes > 0);
    });
    const debug = api.debugSnapshot(world, 1, 1);
    assert(debug.primitives.length > 0);
    const afterDebug = (report.observations.afterDebug = captureModuleReleaseSnapshot(module, manifest));
    persist();
    check('debugCacheAndTemporaryScopesObserved', () => {
        assert.equal(afterDebug.bridge.debugShapeHandles, 2);
        assert(afterDebug.bridge.temporaryNodes > 0 && afterDebug.bridge.temporaryBytes > 0);
        assert.equal(afterDebug.bridge.wireBuffers, 0);
        assert.equal(afterDebug.bridge.capturedWorlds, 0);
        assert(afterDebug.bridge.bytes >= afterDebug.bridge.temporaryBytes);
        assert(afterDebug.bridge.temporaryBytes >= afterDebug.mesh.resourceStorageBytes);
    });
    ++report.disposeCalls;
    api.dispose();
    const terminal = (report.observations.terminal = captureModuleReleaseSnapshot(module, manifest));
    persist();
    check('bindingDisposeReturnsOriginalModuleBaseline', () =>
        assert.equal(verifyModuleReleased(baseline, terminal), true),
    );
    ++report.disposeCalls;
    api.dispose();
    check('repeatedDisposeAndTerminalReadsStable', () =>
        assert.deepEqual(captureModuleReleaseSnapshot(module, manifest), terminal),
    );
    api = null;
    module = null;
    check('detachedSnapshotSurvivesModuleReferenceRelease', () => {
        assert(
            Object.isFrozen(terminal) &&
                Object.isFrozen(terminal.core) &&
                Object.isFrozen(terminal.bridge) &&
                Object.isFrozen(terminal.mesh),
        );
        assert.deepEqual(JSON.parse(JSON.stringify(terminal)), baseline);
    });
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = { name: error.name, code: error.code ?? null, message: error.message, stack: error.stack };
    process.exitCode = 1;
} finally {
    if (scratch && module)
        try {
            module._free(scratch);
        } catch (error) {
            report.cleanupErrors.push(String(error));
        }
    if (api)
        try {
            api.dispose();
        } catch (error) {
            report.cleanupErrors.push(String(error));
        }
    if (report.cleanupErrors.length) {
        report.status = 'FAIL';
        process.exitCode = 1;
    }
    api = null;
    module = null;
    persist();
}
