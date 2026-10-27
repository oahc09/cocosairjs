/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Source inventory and synthetic parser controls only. Never runs native/WASM/physics.
 * Prefix hashes bind the f55843f6 consumer inventories, not artifacts supplied by a producer.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const expected = require('./box3d-command-expectations.json');
const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const sorted = (values) => [...values].sort();
const addedInputs = [
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
];
const addedCompile = ['tools/physics/box3d/native/world_storage_contract.c'];
const addedEvidence = [
    'native-world-storage-contract.raw.json',
    'air_box3d_world_storage_contract.cjs',
    'wasm-storage-contract.raw.json',
];
function exactExtension(values, prefixLength, prefixHash, addition) {
    assert.equal(values.length, prefixLength + addition.length);
    assert.equal(new Set(values).size, values.length);
    assert.equal(hash(values.slice(0, prefixLength)), prefixHash, 'Frozen ordered prefix changed');
    assert.deepEqual(values.slice(prefixLength), addition, 'Exact additive suffix changed');
}
const sphereInputs = expected.sphereCapsuleExtension.inputs;
const sphereEvidence = expected.sphereCapsuleExtension.evidence;
const frozen = {
    inputs: [92, '3dd1a14c3595df14d1e184108d31d1d69f71c13633ff8f27f354ba03082644eb', [...addedInputs, ...sphereInputs]],
    compileUnits: [84, '2c736923cc8acf26bf83fd1da0acedbcbe2b235d51d8bfe0a9bd0a3acdd98ef4', addedCompile],
    evidence: [
        55,
        '8e6ab780bb5afc917b238ff5e2b0294349a776bec69f3a72deabbf0271bac690',
        [...addedEvidence, ...sphereEvidence],
    ],
};
test('consumer retains complete ordered 92/84/55 inventories and exact storage additions', () => {
    for (const [key, args] of Object.entries(frozen)) exactExtension(expected.gate[key], ...args);
    assert.equal(expected.gate.commands, 43);
    assert.equal(
        hash({ native: expected.native, wasm: expected.wasm, provenance: expected.provenance }),
        'b51feb1774c4e86f0ba41a7b84d11879f2318c583a0e2a93b714c1ee7026b3e1',
    );
    assert.deepEqual(expected.storageExtension.inputs, addedInputs);
    assert.deepEqual(expected.storageExtension.compileUnits, addedCompile);
    assert.deepEqual(expected.storageExtension.evidence, addedEvidence);
    assert.equal(expected.storageExtension.formalC20, 'NOT_QUALIFIED');
});
test('synthetic omission, duplicate, old-only, unknown and reordering cannot match migrated inventories', () => {
    for (const [key, args] of Object.entries(frozen)) {
        for (const change of [
            (a) => a.pop(),
            (a) => a.push(a[0]),
            (a) => a.splice(args[0]),
            (a) => {
                a[args[0]] = 'unknown-artifact';
            },
            (a) => {
                [a[0], a[1]] = [a[1], a[0]];
            },
        ]) {
            const changed = [...expected.gate[key]];
            change(changed);
            assert.throws(() => exactExtension(changed, ...args));
        }
    }
});
test('build and asset consumers retain their own ordered original inputs, then the same exact additions', () => {
    for (const [file, variable, digest] of [
        ['tools/physics/box3d/build.mjs', 'inputs', 'cf27e91b2a38dfa6b47b38c1dd71d458ea8325241eb4b1f4a0b75ce71ed61a7c'],
        ['tools/build/box3d-assets.cjs', 'INPUTS', 'e9a28c783bc0abd487d52f36ee2cb0e01b78f911abfc06a2dd468b752dba97b7'],
    ]) {
        const block = read(file).match(new RegExp(`const ${variable} = \\[([\\s\\S]*?)\\];`));
        assert(block, file);
        const inputs = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
        exactExtension(inputs, 92, digest, [...addedInputs, ...sphereInputs]);
        assert.deepEqual(sorted(inputs), sorted(expected.gate.inputs));
    }
});
test('all current build/audit/asset consumers require production storage and v2 diagnostic evidence', () => {
    const build = read('tools/physics/box3d/build.mjs');
    assert.match(
        build,
        /run\(process\.execPath, \['tools\/physics\/box3d\/empty-world-trim\/production\/contract\.test\.mjs'\]\)/,
    );
    assert.match(build, /result\.storageContract = JSON\.parse\(storageRaw\)/);
    assert.match(build, /file\.endsWith\('\/world_bridge\.c\.o'\)/);
    assert.match(build, /wasm-storage-contract\.mjs/);
    for (const name of ['tools/physics/box3d/audit-artifacts.mjs', 'tools/build/box3d-assets.cjs']) {
        const source = read(name);
        assert.match(source, /verifyStorageQualification\(\{/);
        assert.match(source, /memory-diagnostics\/v2\/qualification\.mjs/);
        for (const evidence of addedEvidence) assert(source.includes(`'${evidence}'`), `${name}: ${evidence}`);
    }
    const cmake = read('tools/physics/box3d/CMakeLists.txt');
    assert(cmake.includes('add_executable(air_box3d_world_storage_contract native/world_storage_contract.c)'));
    assert(cmake.includes('target_link_libraries(air_box3d_world_storage_contract PRIVATE air_box3d_abi)'));
    for (const name of ['motion-source-controls.mjs', 'command-source-controls.mjs']) {
        const source = read('tools/physics/box3d/' + name);
        assert(source.includes('assert.equal(inputs.length, 120)'));
        assert(source.includes('assert.equal(new Set(inputs).size, 120)'));
    }
});

test('synthetic five-patch plans retain only the exact original two-patch Hull baseline', () => {
    const { preHullPrefix } = require('./box3d-hull-qualification.cjs');
    const plan = {
        patchChainSha256: 'fce7869b3888ff9bfd417095e70ce72591893b2c3add1802e1a5bc32ca918bfe',
        lock: {
            patches: [
                'sse2-loadv-float-alignment-v1',
                'contact-generation-geometry-v2',
                'checked-hull-cooking-v1',
                'same-world-identity-v1-candidate',
                'same-world-empty-storage-v1',
            ].map((id) => ({ id })),
        },
    };
    const before = JSON.stringify(plan);
    assert.deepEqual(preHullPrefix(plan).patches, plan.lock.patches.slice(0, 2));
    assert.equal(JSON.stringify(plan), before);
    for (const alter of [
        (p) => p.lock.patches.pop(),
        (p) => p.lock.patches.push(p.lock.patches[0]),
        (p) => {
            [p.lock.patches[2], p.lock.patches[4]] = [p.lock.patches[4], p.lock.patches[2]];
        },
        (p) => {
            p.lock.patches[3].id = 'unreviewed';
        },
        (p) => {
            p.patchChainSha256 = '0'.repeat(64);
        },
    ]) {
        const copy = structuredClone(plan);
        alter(copy);
        assert.throws(() => preHullPrefix(copy));
    }
    assert(read('tools/physics/box3d/hull-legacy-contract.mjs').includes('hullQualification.preHullPrefix(plan)'));
    assert(
        read('tools/physics/box3d/audit-artifacts.mjs').includes('hullQualification.preHullPrefix(patchPlan).patches'),
    );
});
