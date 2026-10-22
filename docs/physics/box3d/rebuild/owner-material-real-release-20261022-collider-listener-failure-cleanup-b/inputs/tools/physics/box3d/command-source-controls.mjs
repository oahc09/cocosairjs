// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Source-only design/identity checks. No compilation, WASM load or physics execution.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { root, sha256, verifySources } from './verify-sources.mjs';
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const schema = JSON.parse(read('tools/physics/box3d/abi-schema.json')),
    command = schema.commandBatch;
assert.equal(schema.abiVersion, 1);
assert.equal(schema.bodySnapshotFloats, 29);
assert.equal(schema.bodyControls.stateFloats, 49);
assert.equal(schema.motionBatch.inputWords, 18);
assert.equal(schema.motionBatch.outputFloats, 61);
for (const [key, hash] of [
    ['wireContract', 'f88641a6e924ae3de4f4fe1d1cba20a1d8b82ac01bea28c221e1a6bf7d5079b9'],
    ['decisionContract', '56303d162e12346729c66461c1fa9976e69c941fb549804c7a110d1887c695d6'],
]) {
    assert.equal(command[key].sha256, hash);
    assert.equal(sha256(read(command[key].path)), hash);
}
const constants = {
    wireVersion: 1,
    inputMagic: 0x314d4355,
    outputMagic: 0x31524355,
    headerWords: 12,
    bodyInputWords: 4,
    operationWords: 16,
    bodyResultWords: 160,
    operationResultWords: 80,
    maximumBodies: 4096,
    maximumOperations: 16384,
    maximumInputWords: 278540,
    maximumOutputWords: 1966092,
};
for (const [key, value] of Object.entries(constants)) assert.equal(command[key], value);
assert.equal(12 + 4 * 4096 + 16 * 16384, command.maximumInputWords);
assert.equal(12 + 160 * 4096 + 80 * 16384, command.maximumOutputWords);
for (const [table, stride] of [
    ['bodyResult', 160],
    ['operationResult', 80],
]) {
    let next = 0;
    for (const range of Object.keys(command[table])) {
        const [start, end] = range.split(':').map(Number);
        assert.equal(start, next);
        assert.ok(end > start);
        next = end;
    }
    assert.equal(next, stride);
}
const source = read('tools/physics/box3d/native/command_bridge.c'),
    exports = JSON.parse(read('tools/physics/box3d/exports.json'));
assert.equal(exports.filter((x) => x === '_air_b3_command_batch').length, 1);
assert.ok(!exports.some((x) => x.includes('bridge_temp')));
assert.equal((source.match(/b3Body_SetTransform\(/g) ?? []).length, 1);
assert.equal((source.match(/b3Body_SetTargetTransform\(/g) ?? []).length, 1);
assert.ok(!source.includes('b3World_Step('));
assert.ok(!/SetLinearDamping|SetAngularDamping|SetMassData/.test(source));
assert.ok(source.indexOf('status=rows(') < source.indexOf('CommandBody* bodies=air_b3_bridge_temp_alloc'));
assert.ok(source.indexOf('status=plan_op(') < source.indexOf('if(apply){'));
assert.ok(source.indexOf('replay(world,') < source.indexOf('memcpy(output,result,resultBytes)'));
assert.match(source, /if\(!operations\)return 0;/);
assert.match(source, /state_read\(world,b,out\+95\)/);
const facade = read('src/air/physics/box3d/binding/facade.mjs');
for (const method of ['validateCommandBatch', 'applyCommandBatch']) {
    assert.ok(facade.includes(`${method}(world, commands, dt, substeps)`));
    assert.ok(read('src/air/physics/box3d/binding/facade.d.mts').includes(method));
}
assert.ok(facade.includes('commandAdmission.reentered'));
assert.ok(facade.includes('const length = commands.length'));
assert.ok(
    !facade
        .slice(facade.indexOf('function commandBatch('), facade.indexOf('function decodeCommandResult('))
        .includes('commands.map'),
);
const build = read('tools/physics/box3d/build.mjs'),
    inputs = [...build.match(/const inputs = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
assert.equal(inputs.length, 50);
assert.equal(new Set(inputs).size, 50);
for (const path of [
    'tools/physics/box3d/native/command_bridge.c',
    'tools/physics/box3d/native/command_bridge.h',
    'tools/physics/box3d/native/command_contract.c',
    'tools/physics/box3d/wasm-command-contract.mjs',
    command.wireContract.path,
    command.decisionContract.path,
])
    assert.ok(inputs.includes(path));
assert.ok(
    read('tools/physics/box3d/CMakeLists.txt').includes(
        'add_executable(air_box3d_command_contract native/command_contract.c)',
    ),
);
console.log(
    JSON.stringify(
        {
            status: 'PASS_SOURCE_CONTROLS_ONLY',
            sources: verifySources(),
            constants,
            inputCount: inputs.length,
            nativeQualification: 'NOT_RUN',
            wasmQualification: 'NOT_RUN',
            publicQueue: 'NOT_IMPLEMENTED_BY_THIS_CHANGE',
        },
        null,
        2,
    ),
);
