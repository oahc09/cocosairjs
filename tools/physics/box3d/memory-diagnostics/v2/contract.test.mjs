/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU-only fake ABI/actual facade and extracted backend method tests. Never loads WASM or runs physics.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createBox3DBinding } from '../../../../../src/air/physics/box3d/binding/facade.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const profile = JSON.parse(readFileSync(resolve(root, 'tools/physics/box3d/memory-diagnostics/v2/schema.json')));
const schema = readFileSync(resolve(root, 'tools/physics/box3d/abi-schema.json'));
const versions = JSON.parse(readFileSync(resolve(root, 'tools/physics/box3d/versions.lock.json')));
const identity = {
    coreSha: versions.core.commit,
    bindingBaseSha: versions.bindingBase.commit,
    patchChainSha256: versions.patchLock.patchChainSha256,
    schemaSha256: createHash('sha256').update(schema).digest('hex'),
    abiVersion: 1,
    variant: 'st-simd',
};
function fixture() {
    let heap = new Uint8Array(65536),
        next = 4096,
        serial = 65536;
    const active = new Set(),
        calls = [],
        allocations = [],
        frees = [];
    const module = {};
    const views = () => {
        module.HEAPU8 = heap;
        module.HEAPU32 = new Uint32Array(heap.buffer);
        module.HEAPF32 = new Float32Array(heap.buffer);
    };
    views();
    const str = (at, value) => {
        heap.set(new TextEncoder().encode(value + '\0'), at);
        return at;
    };
    const core = str(32, identity.coreSha),
        patch = str(128, identity.patchChainSha256),
        schemaAt = str(256, identity.schemaSha256);
    const pair = (out, at, value) => {
        out[at] = Number(value & 0xffffffffn);
        out[at + 1] = Number(value >> 32n);
    };
    const wire = (world) => {
        const out = new Uint32Array(profile.wireWords);
        out[0] = 2;
        out[1] = profile.wireWords;
        out[2] = profile.rowCount;
        out[3] = world;
        out[18] = 1;
        out[19] = 27;
        pair(out, 20, 131072n);
        pair(out, 22, 900001n);
        pair(out, 24, 128n);
        out[26] = 1;
        pair(out, 30, 4096n);
        out[32] = 5;
        pair(out, 36, 3n);
        pair(out, 38, 2n);
        out[40] = 1;
        let sum = 0n;
        for (const row of profile.rows) {
            const at = profile.headerWords + (row.id - 1) * profile.rowWords;
            out[at] = row.id;
            out[at + 1] = row.countUnit === 'unavailable' ? 2 : 3;
            pair(out, at + 2, row.countUnit === 'unavailable' ? 0n : 1n);
            pair(out, at + 4, row.id > 87 ? 1n : 2n);
            const bytes = row.id === 88 ? 36n : row.id === 89 ? 20n : BigInt(4 + row.id);
            pair(out, at + 6, bytes);
            sum += bytes;
        }
        pair(out, 6, sum);
        return out;
    };
    Object.assign(module, {
        _air_b3_abi_version: () => 1,
        _air_b3_core_sha: () => core,
        _air_b3_patch_chain_sha: () => patch,
        _air_b3_schema_sha: () => schemaAt,
        _air_b3_mesh_lifetime_counters: () => 0,
        _malloc: (bytes) => {
            allocations.push(bytes);
            const p = next;
            next += bytes;
            return p;
        },
        _free: (p) => {
            frees.push(p);
        },
        _air_b3_world_create: () => {
            const world = serial++;
            active.add(world);
            return world;
        },
        _air_b3_world_destroy: (world) => {
            active.delete(world);
            return 0;
        },
        _air_b3_bridge_memory: (world, out) => {
            calls.push(['legacy-bridge', world]);
            module.HEAPU32.set([128, 0, 1, 0, 0, 0], out >>> 2);
            return 0;
        },
        _air_b3_world_memory_diagnostics_v2: (world, out, capacity) => {
            calls.push(['diagnostics', world, capacity]);
            if (control.reenter) control.reenter();
            if (control.status) return control.status;
            if (!active.has(world)) return 1;
            if (capacity < profile.wireWords) return 4;
            const data = wire(world);
            control.mutate?.(data);
            if (control.grow) {
                const grown = new Uint8Array(heap.length * 2);
                grown.set(heap);
                heap = grown;
                views();
            }
            module.HEAPU32.set(data, out >>> 2);
            return 0;
        },
    });
    const control = { status: 0, mutate: null, grow: false, reenter: null };
    const api = createBox3DBinding(module, identity),
        world = api.createWorld();
    return { api, world, module, control, calls, allocations, frees, pair };
}
const bad = (name, mutate, code = 'AIR_E_BOX3D_ABI') =>
    test(name, () => {
        const f = fixture();
        f.control.mutate = mutate;
        assert.throws(
            () => f.api.memoryDiagnostics(f.world),
            (error) => error.code === code,
        );
        f.api.dispose();
    });
test('six inactive rebuild rows describe core ledger estimates, not backing allocations', () => {
    const f = fixture();
    const value = f.api.memoryDiagnostics(f.world);
    const names = ['static', 'kinematic', 'dynamic'].flatMap((kind) =>
        ['leafBoxes', 'binIndices'].map((field) => `tree.${kind}.${field}`),
    );
    for (const name of names) {
        const expected = profile.rows.find((row) => row.name === name);
        const actual = value.worldLedger.rows.find((row) => row.name === name);
        assert.equal(
            expected.capacityMeaning,
            'Shared rebuildCapacity ledger estimate; backing is unallocated in pinned B3_TREE_HEURISTIC=0',
        );
        assert.equal(actual.capacityMeaning, expected.capacityMeaning);
        assert.equal(actual.count, null);
        assert(actual.capacity > 0n && actual.bytes > 0n);
    }
    f.api.dispose();
});
test('actual facade copies separate scopes and immutable plain storage rows without query malloc', () => {
    const f = fixture();
    assert.deepEqual(f.allocations, [4096]);
    const result = f.api.memoryDiagnostics(f.world);
    assert.equal(result.profile, profile.profile);
    assert.equal(result.identity.worldId, f.world.id);
    assert.equal(result.identity.nativeStepIndex, 0n);
    assert.equal(result.worldLedger.rows.length, 89);
    assert.equal(
        result.worldLedger.rows.reduce((sum, row) => sum + row.bytes, 0n),
        result.worldLedger.coreReportedBytes,
    );
    assert.equal(result.moduleCoreTrackedRequestedBytes, 900001n);
    assert.equal(result.nativeWorldBridge.trackedBytes, 128n);
    assert.equal(result.nativeGlobalBridge.trackedBytes, 4096n);
    assert.equal(result.excludedObservations.workerArenaBackingCapacityBytes, 131072n);
    assert(result.worldLedger.rows.some((row) => row.count === null && row.countUnit === 'unavailable'));
    assert(result.unavailable.includes('after-app-close module observation'));
    assert.equal(result.mesh.moduleSuccessfulCooks, 3n);
    assert.equal(result.mesh.moduleDestroys, 2n);
    f.module.HEAPU8.fill(0, 4096);
    assert.equal(result.worldLedger.rows[0].bytes, 5n);
    assert.throws(() => {
        result.worldLedger.rows[0].bytes = 1n;
    }, TypeError);
    assert.deepEqual(f.allocations, [4096]);
    f.api.dispose();
    assert.equal(f.frees.length, 1);
    f.api.dispose();
    assert.equal(f.frees.length, 1);
});
test('reacquires heap views after a fake buffer replacement', () => {
    const f = fixture();
    f.control.grow = true;
    assert.equal(f.api.memoryDiagnostics(f.world).moduleCoreTrackedRequestedBytes, 900001n);
    f.api.dispose();
});
test('a missing extension is rejected before any diagnostic call', () => {
    const f = fixture();
    delete f.module._air_b3_world_memory_diagnostics_v2;
    assert.throws(() => f.api.memoryDiagnostics(f.world), /export unavailable/);
    assert.equal(f.calls.length, 0);
    f.api.dispose();
});
test('old production schema identity is rejected, never relabelled current', () => {
    const f = fixture();
    const old = { ...identity, schemaSha256: 'ce98aca1a40c4999df838c1eaab2b08b0533c85adca9866eb48180c6190575d6' };
    assert.throws(() => createBox3DBinding(f.module, old), /identity mismatch/);
    f.api.dispose();
});
for (const [label, status, code] of [
    ['locked', 9, 'AIR_E_BOX3D_LOCKED'],
    ['invalid ID', 1, 'AIR_E_BOX3D_NATIVE'],
    ['capacity/overflow', 4, 'AIR_E_BOX3D_NATIVE'],
    ['inconsistent/partial refusal', 13, 'AIR_E_BOX3D_ABI'],
])
    test(`propagates native ${label} refusal without returning a partial record (fake only)`, () => {
        const f = fixture();
        f.control.status = status;
        assert.throws(
            () => f.api.memoryDiagnostics(f.world),
            (error) => error.code === code,
        );
        f.api.dispose();
    });
bad('reject fixed metadata count drift', (w) => {
    w[44 + 87 * 8 + 2] = 2;
});
bad('reject fixed metadata bytes despite matching total', (w) => {
    w[44 + 88 * 8 + 6]++;
    w[6]++;
});
bad('reject wrong profile version', (w) => {
    w[0] = 1;
});
bad('reject shortened record length', (w) => {
    w[1]--;
});
bad('reject wrong row count', (w) => {
    w[2]--;
});
bad('reject different world identity', (w) => {
    w[3]++;
});
bad('reject different native step identity', (w) => {
    w[4]++;
});
bad('reject incomplete formula flag', (w) => {
    w[40] = 0;
});
bad('reject reserved header drift', (w) => {
    w[41] = 1;
});
bad('reject missing/duplicate row', (w) => {
    w[44] = 2;
});
bad('reject unknown row validity flags', (w) => {
    w[45] = 0;
});
bad('reject nonzero classification mismatch without residual repair', (w) => {
    w[6]++;
});
bad('reject negative signed core ledger cast to u64', (w) => {
    w[23] = 0xffffffff;
});
bad('reject classified u64 overflow', (w) => {
    for (const i of [50, 58]) {
        w[i] = 0xffffffff;
        w[i + 1] = 0xffffffff;
    }
});
bad('reject impossible global bridge accounting', (w) => {
    w[30] = 0;
});
bad('reject impossible mesh counter ordering', (w) => {
    w[38] = 4;
});
test('foreign and disposed world capabilities are rejected before native invocation', () => {
    const f = fixture();
    assert.throws(() => f.api.memoryDiagnostics({ id: f.world.id }), /foreign or disposed/);
    f.api.destroyWorld(f.world);
    assert.throws(() => f.api.memoryDiagnostics(f.world), /foreign or disposed/);
    assert.equal(f.calls.length, 0);
    f.api.dispose();
});
test('exclusive guard rejects nested diagnostics', () => {
    const f = fixture();
    let rejected = 0;
    f.control.reenter = () => {
        assert.throws(
            () => f.api.memoryDiagnostics(f.world),
            (e) => e.code === 'AIR_E_BOX3D_REENTRANT',
        );
        rejected++;
    };
    f.api.memoryDiagnostics(f.world);
    assert.equal(rejected, 1);
    f.api.dispose();
});
// Use the exact new method source, with CPU-only owner/binding stubs. No engine module is loaded.
const worldSource = readFileSync(resolve(root, 'src/air/physics/box3d/world.ts'), 'utf8');
const method = worldSource.slice(
    worldSource.indexOf('    getNativeMemoryDiagnostics() {'),
    worldSource.indexOf('    getNativeCounts() {'),
);
const Backend = new Function(
    'worldError',
    `return class {
    #binding; #token; state = 'ready'; phase = 'idle'; description = { generation: 7 };
    constructor(binding, token) { this.#binding = binding; this.#token = token; }
    assertCommittedRead() { if (this.phase !== 'idle') throw new Error('committed read refused'); }
    getStaticMeshResourceDiagnostics() { return Object.freeze([]); }
    ${method}
}`,
)((code, operation, message) => Object.assign(new Error(operation + ': ' + message), { code }));
test('actual backend method admits initial zero-step and released empty-world data without stepping', () => {
    const f = fixture(),
        backend = new Backend(f.api, f.world);
    const initial = backend.getNativeMemoryDiagnostics(),
        released = backend.getNativeMemoryDiagnostics();
    assert.equal(initial.identity.nativeStepIndex, 0n);
    assert.equal(released.identity.nativeStepIndex, 0n);
    assert.equal(initial.identity.bindingGeneration, 7);
    assert.deepEqual(released.mesh.liveResourceSnapshots, []);
    assert.equal(f.calls.length, 2);
    assert.deepEqual(f.allocations, [4096]);
    f.api.dispose();
});
for (const state of ['stepping', 'destroying', 'destroyed', 'faulted', 'destroy-failed'])
    test(`backend refuses ${state} before native access`, () => {
        const f = fixture(),
            backend = new Backend(f.api, f.world);
        backend.state = state;
        assert.throws(() => backend.getNativeMemoryDiagnostics(), /idle ready world/);
        assert.equal(f.calls.length, 0);
        f.api.dispose();
    });
test('backend respects command owner committed-read refusal', () => {
    const f = fixture(),
        backend = new Backend(f.api, f.world);
    backend.phase = 'committing';
    assert.throws(() => backend.getNativeMemoryDiagnostics(), /committed read refused/);
    assert.equal(f.calls.length, 0);
    f.api.dispose();
});

// Exact source-only gate wiring and consumer negatives. Synthetic receipts are test inputs, not runtime evidence.
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { verifyCommandSchedule } = require(resolve(root, 'tools/build/box3d-command-qualification.cjs'));
const expected = JSON.parse(readFileSync(resolve(root, 'tools/build/box3d-command-expectations.json')));
const { verifyMemoryDiagnosticQualification, MEMORY_NATIVE_CHECKS, MEMORY_WASM_CHECKS } =
    await import('./qualification.mjs');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const nativeNames = [
    'geometry',
    'world',
    'body',
    'filter',
    'motion',
    'command',
    'query',
    'capsule',
    'joint',
    'hinge',
    'p2p',
    'mesh',
    'hull',
    'hull_core',
];
const wasmNames = [
    '',
    'ownership-',
    'snapshot-',
    'geometry-',
    'world-',
    'body-',
    'filter-',
    'motion-',
    'command-',
    'query-',
    'mesh-',
];
const originalSchedule = [
    'query-admission-contract.mjs',
    'motion-source-controls.mjs',
    'command-source-controls.mjs',
    null,
    null,
    null,
    null,
    ...nativeNames.map((n) => `air_box3d_${n}_contract.cjs`),
    'hull-legacy-contract.mjs',
    ...wasmNames.map((n) => `wasm-${n}contract.mjs`),
];
const addedCommands = [
    'memory-diagnostics/v2/source-gate.mjs',
    'memory-diagnostics/v2/contract.test.mjs',
    'air_box3d_memory_contract.cjs',
    'wasm-memory-contract.mjs',
];
const diagnosticSchedule = [
    ...originalSchedule.slice(0, 3),
    ...addedCommands.slice(0, 2),
    ...originalSchedule.slice(3, 21),
    addedCommands[2],
    ...originalSchedule.slice(21),
    addedCommands[3],
];
const storageCommands = [
    'empty-world-trim/production/contract.test.mjs',
    'tools/verify/box3d/empty-world-release.test.mjs',
    'air_box3d_world_storage_contract.cjs',
    'wasm-storage-contract.mjs',
];
const newSchedule = [
    ...diagnosticSchedule.slice(0, 5),
    ...storageCommands.slice(0, 2),
    ...diagnosticSchedule.slice(5),
    ...storageCommands.slice(2),
];
function scheduleReceipt() {
    const commands = newSchedule.map((script) => ({
        command: 'node',
        args: script ? ['/repo/' + script] : [],
        exitCode: 0,
        error: null,
    }));
    commands[6] = { command: 'node', args: ['--test', storageCommands[1]], exitCode: 0, error: null };
    commands[7] = { command: 'emcc', args: ['--version'], exitCode: 0, error: null };
    commands[8] = { command: 'cmake', args: ['--version'], exitCode: 0, error: null };
    commands[9] = { command: 'emcmake', args: ['cmake', 'source'], exitCode: 0, error: null };
    commands[10] = { command: 'cmake', args: ['--build', 'output', '--parallel', '1'], exitCode: 0, error: null };
    return {
        commands,
        motionSourceControls: { status: 'PASS_SOURCE_CONTROLS_ONLY' },
        commandSourceControls: { status: 'PASS_SOURCE_CONTROLS_ONLY' },
        memorySourceControls: { status: 'PASS_SOURCE_CONTROLS_ONLY' },
        memoryCpuContract: { status: 'PASS_CPU_FAKE_DIAGNOSTICS_ONLY', nativeRuntimeExecuted: false },
        storageCpuContract: { status: 'PASS_CPU_STORAGE_CONTRACT_ONLY', nativeRuntimeExecuted: false },
        emptyWorldReleaseCpuContract: { status: 'PASS_CPU_TS_NATIVE_MOCKS_ONLY', nativeRuntimeExecuted: false },
        queryAdmission: { status: 'PASS_ADMISSION_NO_NATIVE_CALLS', nativeQueryCalls: 0 },
    };
}
test('exact 41-command gate preserves historical 33 and diagnostic 37-command sequences', () => {
    assert.equal(originalSchedule.length, 33);
    assert.equal(diagnosticSchedule.length, 37);
    assert.equal(newSchedule.length, 41);
    assert.deepEqual(
        newSchedule.filter((name) => !storageCommands.includes(name)),
        diagnosticSchedule,
    );
    assert.deepEqual(
        diagnosticSchedule.filter((name) => !addedCommands.includes(name)),
        originalSchedule,
    );
    verifyCommandSchedule(scheduleReceipt());
    for (const alter of [
        (r) => {
            r.commands.pop();
        },
        (r) => {
            [r.commands[11], r.commands[12]] = [r.commands[12], r.commands[11]];
        },
        (r) => {
            r.commands[3].exitCode = 1;
        },
        (r) => {
            r.memoryCpuContract.nativeRuntimeExecuted = true;
        },
        (r) => {
            r.commands.push({ command: 'node', args: ['/extra'], exitCode: 0 });
        },
    ]) {
        const r = scheduleReceipt();
        alter(r);
        assert.throws(() => verifyCommandSchedule(r));
    }
});
test('exact 111-input, 85-compile-unit and 58-evidence inventories retain original 79 and diagnostic 92 input sets', () => {
    const additions = expected.memoryDiagnosticExtension.inputs;
    assert.equal(additions.length, 13);
    assert.equal(new Set(additions).size, 13);
    assert.equal(expected.gate.inputs.length, 111);
    assert.equal(expected.storageExtension.inputs.length, 19);
    const diagnosticInputs = expected.gate.inputs.filter((path) => !expected.storageExtension.inputs.includes(path));
    assert.equal(diagnosticInputs.length, 92);
    assert.equal(
        sha(JSON.stringify(diagnosticInputs)),
        '3dd1a14c3595df14d1e184108d31d1d69f71c13633ff8f27f354ba03082644eb',
    );
    const oldInputs = diagnosticInputs.filter((path) => !additions.includes(path)).sort();
    assert.equal(oldInputs.length, 79);
    assert.equal(sha(JSON.stringify(oldInputs)), '6d0064fb5ab71bfd1e1016c78101af0205ba02d82d18e9321a1586ae3b47897a');
    const units = expected.gate.compileUnits
        .filter(
            (p) =>
                ![
                    'tools/physics/box3d/native/memory_diagnostics.c',
                    'tools/physics/box3d/native/memory_contract.c',
                    'tools/physics/box3d/native/world_storage_contract.c',
                ].includes(p),
        )
        .sort();
    assert.equal(expected.gate.compileUnits.length, 85);
    assert.equal(sha(JSON.stringify(units)), '3e0408096fcee766114b61342449f8034bd68b69da1fe24972a6bd3741e1fdd8');
    const evidence = expected.gate.evidence
        .filter(
            (p) =>
                !expected.memoryDiagnosticExtension.evidence.includes(p) &&
                !expected.storageExtension.evidence.includes(p),
        )
        .sort();
    assert.equal(expected.gate.evidence.length, 58);
    assert.equal(sha(JSON.stringify(evidence)), 'bbddcd57693c296da26561827cb76e7b14310a08e8228b0fadb56c61bc340bf6');
    const readList = (file, expression) => {
        const text = readFileSync(resolve(root, file), 'utf8');
        return [...expression.exec(text)[1].matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
    };
    assert.deepEqual(
        readList('tools/physics/box3d/build.mjs', /const inputs = \[([\s\S]*?)\n    \];/),
        [...expected.gate.inputs].sort(),
    );
    assert.deepEqual(
        readList('tools/build/box3d-assets.cjs', /const INPUTS = \[([\s\S]*?)\n\];/),
        [...expected.gate.inputs].sort(),
    );
    const exports = JSON.parse(readFileSync(resolve(root, 'tools/physics/box3d/exports.json')));
    assert.equal(exports.filter((name) => name === '_air_b3_world_memory_diagnostics_v1').length, 0);
    assert.equal(exports.filter((name) => name === '_air_b3_world_memory_diagnostics_v2').length, 1);
    assert.equal(exports.filter((name) => name === '_air_b3_world_trim_empty').length, 1);
    assert.equal(
        sha(
            JSON.stringify(
                exports.filter(
                    (name) => !['_air_b3_world_memory_diagnostics_v2', '_air_b3_world_trim_empty'].includes(name),
                ),
            ),
        ),
        '8f0a8f65ba731716e8c87e2c4bcf02f60ee4b44864d8ebdeb7a39fba3793547b',
    );
});
test('current source controls execute and exact input/compile guards reject stale or nonexact counts', () => {
    for (const name of ['motion-source-controls.mjs', 'command-source-controls.mjs']) {
        const path = resolve(root, 'tools/physics/box3d', name);
        const text = readFileSync(path, 'utf8');
        const guards = text.match(/assert\.equal\((?:inputs\.length|new Set\(inputs\)\.size), \d+\);/g);
        assert.equal(guards?.length, 2, 'Both exact length and uniqueness guards required');
        const checkInputs = new Function('assert', 'inputs', guards.join('\n'));
        assert.doesNotThrow(() => checkInputs(assert, expected.gate.inputs));
        for (const invalid of [
            expected.gate.inputs.slice(0, -1),
            [...expected.gate.inputs, 'unexpected-extra-input'],
            [...expected.gate.inputs.slice(0, -1), expected.gate.inputs[0]],
        ])
            assert.throws(() => checkInputs(assert, invalid));
        const stale = new Function('assert', 'inputs', guards.join('\n').replaceAll(', 111);', ', 79);'));
        assert.throws(() => stale(assert, expected.gate.inputs), 'Old 79-input guard must reject the real 111 set');
        const result = spawnSync(process.execPath, [path], { cwd: root, encoding: 'utf8', timeout: 30000 });
        assert.ifError(result.error);
        assert.equal(result.signal, null);
        assert.equal(result.status, 0, `${name}: ${result.stderr}`);
        assert.equal(JSON.parse(result.stdout).status, 'PASS_SOURCE_CONTROLS_ONLY');
    }
    const assets = readFileSync(resolve(root, 'tools/build/box3d-assets.cjs'), 'utf8');
    const guards = assets.match(/assert\.equal\(audit\.compiledSourceCount, \d+, 'Compile audit inventory drift'\);/g);
    assert.equal(guards?.length, 1, 'One exact asset compile-unit count guard required');
    const checkCompiled = new Function('assert', 'audit', guards[0]);
    assert.doesNotThrow(() => checkCompiled(assert, { compiledSourceCount: expected.gate.compileUnits.length }));
    for (const compiledSourceCount of [82, 84, 86]) assert.throws(() => checkCompiled(assert, { compiledSourceCount }));
    const stale = new Function('assert', 'audit', guards[0].replace(', 85,', ', 82,'));
    assert.throws(() => stale(assert, { compiledSourceCount: expected.gate.compileUnits.length }));
});

function syntheticQualification() {
    const native = {
        schema: 'air-box3d-memory-native-contract-v2',
        status: 'PASS',
        pointerBytes: 4,
        rowCount: 89,
        wireWords: 756,
        checks: 39,
        coreSha: identity.coreSha,
        schemaSha256: identity.schemaSha256,
        patchChainSha256: identity.patchChainSha256,
        controlledFixture: true,
        injectionsAreProductionObservations: false,
        ...Object.fromEntries(MEMORY_NATIVE_CHECKS.map((key) => [key, true])),
        finalCoreDelta: 0,
        finalBridgeBytes: 0,
    };
    const wasm = {
        schema: 'air-box3d-memory-wasm-contract-v2',
        status: 'PASS',
        identity,
        fixtureSha256: 'f'.repeat(64),
        checks: Object.fromEntries(MEMORY_WASM_CHECKS.map((key) => [key, true])),
        acceptancePassed: false,
        runtimeScope: 'Production WASM exports in an independent low-level fixture; not the C20 app host',
        controlledNativeBranches:
            'Locked/overflow/mismatch are covered separately by the labeled native unit fixture, not fabricated production observations',
    };
    return {
        native,
        wasm,
        identity,
        fixtureSha256: 'f'.repeat(64),
        receipt: { ...scheduleReceipt(), memoryContract: native },
    };
}
test('new consumer qualification rejects partial, stale, injected-as-production and missing gate reports', () => {
    verifyMemoryDiagnosticQualification(syntheticQualification());
    for (const alter of [
        (d) => {
            d.native.pointerBytes = 8;
        },
        (d) => {
            d.native.checks = 30;
        },
        (d) => {
            d.native.controlledFixture = false;
        },
        (d) => {
            d.native.injectionsAreProductionObservations = true;
        },
        (d) => {
            d.native.schemaSha256 = '0'.repeat(64);
        },
        (d) => {
            delete d.native.shortNoWrite;
        },
        (d) => {
            delete d.wasm.checks.readonlyRepeat;
        },
        (d) => {
            d.wasm.checks.unreviewed = true;
        },
        (d) => {
            d.wasm.fixtureSha256 = '0'.repeat(64);
        },
        (d) => {
            d.wasm.acceptancePassed = true;
        },
        (d) => {
            d.receipt.commands = d.receipt.commands.filter((r) => !r.args[0]?.endsWith('/wasm-memory-contract.mjs'));
        },
    ]) {
        const d = syntheticQualification();
        alter(d);
        assert.throws(() => verifyMemoryDiagnosticQualification(d));
    }
});

test('qualification rejects the old zero-step-only memory evidence', () => {
    for (const mutate of [
        (q) => {
            q.native.checks = 31;
        },
        (q) => {
            delete q.native.postStepRebuildAndRelease;
        },
        (q) => {
            q.native.requiredScratchNullNoWrite = false;
        },
        (q) => {
            delete q.wasm.checks.postStepRebuildLedger;
        },
        (q) => {
            delete q.wasm.checks.releasedPostStepRetainedLedger;
        },
    ]) {
        const q = syntheticQualification();
        mutate(q);
        assert.throws(() => verifyMemoryDiagnosticQualification(q));
    }
});

test('actual CMake configure invokes exactly the current diagnostic gate and fails before core admission', () => {
    // Source/CPU route contract, not a CMake/native execution claim. The v1 files
    // remain retained historical inputs; no current execute_process may select them.
    const source = readFileSync(resolve(root, 'tools/physics/box3d/CMakeLists.txt'), 'utf8');
    const verifyRoute = (text) => {
        const calls = [
            ...text.matchAll(
                /execute_process\(\s*COMMAND\s+"\$\{AIR_NODE\}"\s+"([^"\n]*memory-diagnostics\/[^"\n]+)"([\s\S]*?)\)/g,
            ),
        ];
        assert.equal(calls.length, 1, 'Exactly one executable memory source gate');
        const call = calls[0];
        assert.equal(call[1], '${CMAKE_CURRENT_LIST_DIR}/memory-diagnostics/v2/source-gate.mjs');
        assert.equal(
            call[2].trim().replace(/\s+/g, ' '),
            '--root "${AIR_REPO_ROOT}" --core "${AIR_STAGED_CORE}" RESULT_VARIABLE AIR_MEMORY_SOURCE_STATUS',
        );
        const refusals = [
            ...text.matchAll(
                /if\(NOT AIR_MEMORY_SOURCE_STATUS EQUAL 0\)\s*message\(FATAL_ERROR "Read-only memory diagnostic source\/profile verification failed"\)\s*endif\(\)/g,
            ),
        ];
        assert.equal(refusals.length, 1, 'A failed gate must fail configure, not become an ignored status');
        const admission = text.indexOf('add_subdirectory("${AIR_STAGED_CORE}" "core")');
        assert(admission >= 0);
        assert(call.index + call[0].length < refusals[0].index);
        assert(refusals[0].index + refusals[0][0].length < admission, 'No core admission before gate success');
    };
    verifyRoute(source);
    for (const mutate of [
        (s) => s.replace('memory-diagnostics/v2/source-gate.mjs', 'memory-diagnostics/v1/source-gate.mjs'),
        (s) => s.replace('memory-diagnostics/v2/source-gate.mjs', 'memory-diagnostics/v3/source-gate.mjs'),
        (s) => s.replace('RESULT_VARIABLE AIR_MEMORY_SOURCE_STATUS', 'RESULT_VARIABLE IGNORED_STATUS'),
        (s) => s.replace('--core "${AIR_STAGED_CORE}"', '--core "${AIR_REPO_ROOT}/vendor/box3d/core"'),
        (s) => s.replace('if(NOT AIR_MEMORY_SOURCE_STATUS EQUAL 0)', 'if(FALSE)'),
        (s) =>
            s.replace(
                'message(FATAL_ERROR "Read-only memory diagnostic source/profile verification failed")',
                'message(STATUS "ignored")',
            ),
        (s) =>
            s.replace(
                'execute_process(COMMAND "${AIR_NODE}" "${CMAKE_CURRENT_LIST_DIR}/memory-diagnostics/v2/source-gate.mjs"',
                'add_subdirectory("${AIR_STAGED_CORE}" "core")\nexecute_process(COMMAND "${AIR_NODE}" "${CMAKE_CURRENT_LIST_DIR}/memory-diagnostics/v2/source-gate.mjs"',
            ),
        (s) =>
            s +
            '\n' +
            s.match(
                /execute_process\(COMMAND "\$\{AIR_NODE\}" "\$\{CMAKE_CURRENT_LIST_DIR\}\/memory-diagnostics\/v2\/source-gate\.mjs"[\s\S]*?\)/,
            )[0],
    ])
        assert.throws(() => verifyRoute(mutate(source)));
});
