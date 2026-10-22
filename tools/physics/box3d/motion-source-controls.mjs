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
const sources = verifySources();
assert.equal(sources.patchChainSha256, '434fb89494867f515051d5ac0dfc0c694556ba1f0da9ac3fc895a27097b1c7c7');
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
