// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Read-only source admission controls. NOT native execution, physics qualification, or T11 completion.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, sha256, verifySources } from './verify-sources.mjs';
const read = (p) => readFileSync(resolve(root, p), 'utf8');
const schema = JSON.parse(read('tools/physics/box3d/abi-schema.json'));
const decision = schema.motionBatch.decisionContract;
assert.equal(decision.path, 'docs/physics/box3d/contracts/motion-command-decisions-v1.md');
assert.equal(decision.sha256, '30951da3f296ac17acac9ff594c91ee96db62d5b3a3a1bdaf1ec0feb8f2f7a6a');
assert.equal(sha256(read(decision.path)), decision.sha256);
assert.equal(schema.abiVersion, 1);
assert.equal(schema.bodyInputFloats, 16);
assert.equal(schema.bodySnapshotFloats, 29);
assert.equal(schema.bodyControls.stateFloats, 49);
assert.equal(schema.motionBatch.inputWords, 18);
assert.equal(schema.motionBatch.outputFloats, 61);
const source = read('tools/physics/box3d/native/motion_bridge.c');
const header = read('tools/physics/box3d/native/motion_bridge.h');
assert.match(header, /AIR_B3_MOTION_INPUT_WORDS = 18/);
assert.match(header, /AIR_B3_MOTION_OUTPUT_FLOATS = 61/);
assert.match(source, /make_plan\(world,wid,record,dt,substeps,plans\+i\)/);
assert.ok(source.indexOf('status=make_plan(') < source.indexOf('if(apply){'));
assert.match(source, /air_b3_bridge_temp_alloc\(wid,bytes\)/);
assert.match(source, /air_b3_bridge_temp_free\(wid,plans,bytes\)/);
assert.match(source, /if\(plan->flags&AIR_B3_MOTION_RESET\)\{\s*b3Body_SetTransform/);
assert.equal((source.match(/b3Body_SetTransform\(/g) ?? []).length, 1);
assert.equal((source.match(/b3Body_SetTargetTransform\(/g) ?? []).length, 1);
assert.ok(!/SetLinearDamping|SetAngularDamping|SetAllowFastRotation/.test(source));
assert.ok(!/sim->force\s*=|sim->torque\s*=/.test(source));
assert.match(source, /8\.0\*FLT_EPSILON\*fmax\(1\.0,cap\)/);
assert.match(source, /fabsf\(p\[i\]\)>1e-6f/);
const exports = JSON.parse(read('tools/physics/box3d/exports.json'));
assert.equal(exports.filter((name) => name === '_air_b3_motion_batch').length, 1);
assert.ok(!exports.some((name) => /bridge_temp_(alloc|free)/.test(name)));
const facade = read('src/air/physics/box3d/binding/facade.mjs');
for (const name of ['validateMotionBatch', 'applyMotionBatch']) {
    assert.ok(facade.includes(`${name}(world, records, dt, substeps)`));
    assert.ok(read('src/air/physics/box3d/binding/facade.d.mts').includes(name));
}
const build = read('tools/physics/box3d/build.mjs');
assert.ok(build.includes("'tools/physics/box3d/native/motion_bridge.c'"));
assert.ok(build.includes(`'${decision.path}'`));
const inputBlock = build.match(/const inputs = \[([\s\S]*?)\];/)[1];
const inputs = [...inputBlock.matchAll(/'([^']+)'/g)].map((match) => match[1]);
assert.equal(inputs.length, 79);
assert.equal(new Set(inputs).size, 79);
for (const path of [
    'tools/physics/box3d/native/mesh_bridge.c',
    'tools/physics/box3d/native/mesh_bridge.h',
    'tools/physics/box3d/native/mesh_contract.c',
    'tools/physics/box3d/wasm-mesh-contract.mjs',
    'tools/physics/box3d/static-mesh-bridge-contract.md',
])
    assert.ok(inputs.includes(path));
for (const path of [
    'tools/physics/box3d/native/joint_bridge.c',
    'tools/physics/box3d/native/joint_bridge.h',
    'tools/physics/box3d/native/joint_contract.c',
    'tools/physics/box3d/native/hinge_bridge.c',
    'tools/physics/box3d/native/hinge_bridge.h',
    'tools/physics/box3d/native/hinge_contract.c',
    'tools/physics/box3d/native/p2p_bridge.c',
    'tools/physics/box3d/native/p2p_bridge.h',
    'tools/physics/box3d/native/p2p_contract.c',
    'tools/physics/box3d/native/hull_bridge.c',
    'tools/physics/box3d/native/hull_bridge.h',
    'tools/physics/box3d/native/hull_contract.c',
    'tools/physics/box3d/native/hull_core_contract.c',
    'tools/physics/box3d/native/hull_legacy_fingerprint.c',
    'tools/physics/box3d/hull-bridge-contract.md',
    'tools/physics/box3d/hull-legacy-contract.mjs',
    'tools/physics/box3d/patches/checked-hull-cooking.patch',
    'tools/physics/box3d/native/query_bridge.c',
    'tools/physics/box3d/native/query_bridge.h',
    'tools/physics/box3d/capsule-bridge-contract.md',
    'tools/physics/box3d/native/capsule_contract.c',
    'tools/physics/box3d/native/query_contract.c',
    'tools/physics/box3d/wasm-query-contract.mjs',
    'tools/physics/box3d/query-admission-contract.mjs',
])
    assert.ok(inputs.includes(path));
for (const path of ['tools/physics/box3d/native/motion_contract.c', 'tools/physics/box3d/wasm-motion-contract.mjs'])
    assert.ok(inputs.includes(path));
assert.ok(
    read('tools/physics/box3d/CMakeLists.txt').includes(
        'add_executable(air_box3d_motion_contract native/motion_contract.c)',
    ),
);
assert.match(source, /substeps!=1&&substeps!=2&&substeps!=4&&substeps!=8/);
assert.match(source, /if\(v.x==0 && v.y==0 && v.z==0\)return AIR_B3_OK/);
assert.match(read('tools/physics/box3d/native/motion_contract.c'), /b3Body_AllowFastRotation\(kinematic,true\)/);
const sources = verifySources();
assert.equal(sources.patchChainSha256, '4c9d057fe6d7403f6f2c7672c4a7abe38041d845942540a6b5c5abbc6f4bc45c');
console.log(
    JSON.stringify(
        {
            status: 'PASS_SOURCE_CONTROLS_ONLY',
            scope: 'Source identity/layout/wiring inspection; no native compiler, WASM instantiation, or simulated physics',
            sources,
            decision,
            nativeQualification: 'NOT_RUN',
            wasmQualification: 'NOT_RUN',
            publicT11: 'NOT_IMPLEMENTED',
        },
        null,
        2,
    ),
);
