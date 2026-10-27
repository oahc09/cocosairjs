// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Pure facade admission only. The query native spy must never be called: NOT physics/WASM evidence.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBox3DBinding } from '../../../src/air/physics/box3d/binding/facade.mjs';
const lock = JSON.parse(readFileSync(new URL('./versions.lock.json', import.meta.url)));
const buffer = new ArrayBuffer(65536);
const module = { HEAPU8: new Uint8Array(buffer), HEAPU32: new Uint32Array(buffer), HEAPF32: new Float32Array(buffer) };
let cursor = 16;
let scratchAllocations = 0;
let meshCounterCalls = 0;
const text = (value) => {
    const at = cursor;
    const bytes = new TextEncoder().encode(`${value}\0`);
    module.HEAPU8.set(bytes, at);
    cursor += bytes.length;
    return at;
};
const core = text(lock.core.commit),
    schema = text(lock.apiSchemaSha256),
    patch = text(lock.patchLock.patchChainSha256);
Object.assign(module, {
    _air_b3_core_sha: () => core,
    _air_b3_schema_sha: () => schema,
    _air_b3_patch_chain_sha: () => patch,
    _air_b3_abi_version: () => 1,
    _malloc: () => {
        ++scratchAllocations;
        return 4096;
    },
    // Identity presence only: this CPU fixture must never fabricate native lifetime evidence.
    _air_b3_module_release_snapshot_v1: () => 0,
    _air_b3_mesh_lifetime_counters: () => {
        ++meshCounterCalls;
        throw new Error('Unexpected native mesh lifetime counter call');
    },
    _free: () => {},
    _air_b3_world_create: () => 1,
    _air_b3_world_destroy: () => 0,
});
let calls = 0;
module._air_b3_ray_query = () => {
    ++calls;
    throw new Error('Unexpected native query call');
};
const expected = {
    coreSha: lock.core.commit,
    bindingBaseSha: lock.bindingBase.commit,
    schemaSha256: lock.apiSchemaSha256,
    patchChainSha256: lock.patchLock.patchChainSha256,
    abiVersion: 1,
    variant: 'st-simd',
};
// Fail closed before scratch allocation even when the claimed schema is current.
const missingProbe = { ...module };
delete missingProbe._air_b3_mesh_lifetime_counters;
assert.throws(
    () => createBox3DBinding(missingProbe, expected),
    (e) => e.code === 'AIR_E_BOX3D_ABI',
);
assert.equal(scratchAllocations, 0);
assert.equal(meshCounterCalls, 0);
assert.throws(
    () =>
        createBox3DBinding(module, {
            ...expected,
            schemaSha256: 'd0a917e85e800605295296ca0820fbcb54847ea5d00f6bfc296a3ce527243551',
        }),
    (e) => e.code === 'AIR_E_BOX3D_ABI',
);
assert.equal(scratchAllocations, 0);
const binding = createBox3DBinding(module, expected);
assert.equal(scratchAllocations, 1);
const world = binding.createWorld();
const options = { group: -1, mask: -1, queryTrigger: false };
const empty = binding.rayAllRaw(world, [0, 0, 0], [0, 0, 0], options);
assert.deepEqual(empty, []);
assert.ok(Object.isFrozen(empty));
assert.deepEqual(binding.rayAllRaw(world, [0, 0, 0], [10, 0, 0], { ...options, mask: 0 }), []);
assert.deepEqual(binding.rayAllRaw(world, [0, 0, 0], [10, 0, 0], { ...options, group: 0 }), []);
let rejected = 0;
const reject = (origin, delta, opts = options) => {
    assert.throws(
        () => binding.rayAllRaw(world, origin, delta, opts),
        (e) => e.code === 'AIR_E_BOX3D_ARGUMENT',
    );
    ++rejected;
};
for (const bad of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
    reject([bad, 0, 0], [1, 0, 0]);
    reject([0, 0, 0], [bad, 0, 0]);
}
reject([0, 0], [1, 0, 0]);
reject([0, 0, 0], [1, 0]);
reject([0, 0, 0], [1, 0, 0], null);
for (const key of ['group', 'mask'])
    for (const bad of [1.5, 4294967296, -2147483649, NaN]) reject([0, 0, 0], [1, 0, 0], { ...options, [key]: bad });
reject([0, 0, 0], [1, 0, 0], { ...options, queryTrigger: 1 });
reject([3e38, 0, 0], [3e38, 0, 0]);
assert.throws(
    () => binding.rayAllRaw({ id: 1 }, [0, 0, 0], [1, 0, 0], options),
    (e) => e.code === 'AIR_E_BOX3D_DISPOSED',
);
binding.destroyWorld(world);
assert.throws(
    () => binding.rayAllRaw(world, [0, 0, 0], [1, 0, 0], options),
    (e) => e.code === 'AIR_E_BOX3D_DISPOSED',
);
binding.dispose();
assert.equal(calls, 0);
assert.equal(meshCounterCalls, 0);
console.log(
    JSON.stringify({
        status: 'PASS_ADMISSION_NO_NATIVE_CALLS',
        nativeQueryCalls: calls,
        nativeMeshCounterCalls: meshCounterCalls,
        identityNegativeControls: 2,
        rejected,
        physicsEvidence: false,
    }),
);
