/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * SYNTHETIC PARSER CONTROLS ONLY. Memory-only receipts below are not physics evidence,
 * not staged artifacts, and never written as native/WASM PASS files.
 */
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { verifyCommandQualification, verifyCommandSchedule } = require('./box3d-command-qualification.cjs');
const expected = require('./box3d-command-expectations.json');
const hash = (b) => createHash('sha256').update(b).digest('hex');
const f32 = (n) => {
    const b = Buffer.alloc(4);
    b.writeFloatLE(n);
    return b.readUInt32LE();
};
function transport(b = 1, o = 1) {
    const input = Array(12 + 4 * b + 16 * o).fill(0);
    input.splice(0, 12, 0x314d4355, 1, input.length, b, o, 4, 16, 12, 12 + 4 * b, f32(1 / 60), 4, 0);
    for (let i = 0; i < b; ++i) input.splice(12 + i * 4, 2, 100 + i, 1);
    const output = Array(12 + 160 * b + 80 * o).fill(0);
    output.splice(0, 12, 0x31524355, 1, output.length, b, o, 160, 80, 12, 12 + 160 * b, 1, 0, 0);
    for (let i = 0; i < b; ++i) {
        const r = 12 + 160 * i;
        output[r] = 100 + i;
        output[r + 1] = 1;
        for (const at of [r + 4, r + 63, r + 85]) output[at + 6] = f32(1);
        output[r + 155] = f32(200);
        output[r + 156] = f32(10);
    }
    for (let i = 0; i < o; ++i) {
        const bi = i % b,
            at = 12 + 4 * b + 16 * i,
            r = 12 + 160 * b + 80 * i,
            br = 12 + 160 * bi;
        input.splice(at, 5, bi, 5, 0, i + 1, 0);
        output.splice(r, 5, bi, 5, 0, i + 1, 0);
        output[r + 14] = f32(1);
        output[r + 70] = f32(1);
        ++output[br + 2];
        output[br + 158] = i + 1;
    }
    return { input, output };
}
function synthetic() {
    const identity = { schemaSha256: 'a'.repeat(64), patchChainSha256: 'b'.repeat(64) };
    const mixed = transport(2, 9);
    const native = {
        status: 'PASS',
        pointerBytes: 4,
        ...identity,
        negativeCases: 25,
        checks: Object.fromEntries(expected.native.checks.map((k) => [k, true])),
        limits: { ...expected.native.limits },
        mixedInputWords: mixed.input,
        mixedOutputWords: mixed.output,
    };
    const error = { code: 'AIR_E_BOX3D_ARGUMENT', message: 'SYNTHETIC parser control', mutationOutcome: 'not-mutated' };
    const negatives = expected.wasm.negativeNames.map((name) => ({ name, error: { ...error } }));
    const rows = [];
    for (const [kind, n] of Object.entries(expected.wasm.sampleKinds))
        for (let i = 0; i < n; ++i) {
            let fields = {};
            if (kind === 'rejection') fields = { ...negatives[i], before: { synthetic: 1 }, after: { synthetic: 1 } };
            if (kind === 'caught-reentry-zero-native-calls') fields = { allNativeCalls: [] };
            if (kind === 'single-read' || kind === 'pose-single-read')
                fields = {
                    before: {},
                    after: {},
                    readCounts: Object.fromEntries(
                        ['body', 'kind', 'sequence', 'value', 'space', 'offset'].map((k) => [k, 1]),
                    ),
                    poseReads: Object.fromEntries(
                        [
                            ...['body', 'kind', 'sequence', 'pose', 'mode', 'preserveVelocity', 'wake'].map(
                                (k) => 'command.' + k,
                            ),
                            'position',
                            'rotation',
                            'p.length',
                            'p.0',
                            'p.1',
                            'p.2',
                            'q.length',
                            'q.0',
                            'q.1',
                            'q.2',
                            'q.3',
                        ].map((k) => [k, 1]),
                    ),
                };
            if (kind === 'analytic-box') fields = { scene: i };
            if (kind === 'id-reuse')
                fields = {
                    index: i,
                    result: { bodies: [{ body: { low: i, high: 1 } }] },
                    replacement: { low: i + 1, high: 1 },
                    error: { ...error },
                };
            rows.push({ kind, ...fields });
        }
    const calls = [];
    function call(apply, status, empty = false) {
        const p = transport(empty ? 0 : 1, empty ? 0 : 1);
        const row = {
            index: calls.length,
            apply,
            inputWords: p.input.length,
            bodyCount: p.input[3],
            operationCount: p.input[4],
            input: p.input,
            nativeStatus: status,
        };
        if (apply && status === 0 && !empty) row.actualOutput = p.output;
        calls.push(row);
    }
    for (let i = 0; i < 4; ++i) call(0, 0);
    for (let i = 0; i < 176; ++i) call(1, 0);
    call(1, 0, true);
    for (let i = 0; i < 17; ++i) call(1, 2);
    // Synthetic injection-adjacent calls use reset except the clearForces corruption.
    for (const i of [0, 1, 2, 4]) {
        const row = calls[4 + i];
        row.input[17] = 8;
        row.input[27] = f32(1);
        row.actualOutput[173] = 8;
        row.actualOutput[177] = 16;
    }
    const phases = [
        'real validation then delivery throw',
        ...['corrupt-copy', 'unknown-status', 'delivery-throw', 'corrupt-actions', 'inconsistent-com'].map(
            (m) => 'real commit then injected ' + m,
        ),
    ];
    const wasm = {
        status: 'PASS',
        identity: { ...identity, schemaVersion: 1, artifacts: [] },
        fixtureSha256: 'c'.repeat(64),
        checks: Object.fromEntries(expected.wasm.checks.map((k) => [k, true])),
        negatives,
        sampleCount: 217,
        nativeCommandInvocations: calls,
        observations: {
            invocationSummary: { ...expected.wasm.nativeCommandInvocations },
            idCycles: rows
                .filter((r) => r.kind === 'id-reuse')
                .map((r) => ({ old: r.result.bodies[0].body, replacement: r.replacement, error: r.error })),
        },
        injectedMechanisms: phases.map((kind, i) => ({
            kind,
            error: {
                code: [1, 2, 4, 5].includes(i) ? 'AIR_E_BOX3D_ABI' : undefined,
                mutationOutcome: [1, 4, 5].includes(i) ? 'committed' : undefined,
                nativeStatus: i === 2 ? 77 : undefined,
            },
            ...(i
                ? {
                      calls: 1,
                      diagnostics: { snapshotAvailable: false, nativeStepIndex: 10 + i },
                      actual: Object.fromEntries(
                          ['linearVelocity', 'angularVelocity', 'force', 'torque', 'worldCenter'].map((k) => [
                              k,
                              [0, 0, 0],
                          ]),
                      ),
                  }
                : {}),
        })),
    };
    const data = {
        native,
        wasm,
        identity,
        fixtureSha256: wasm.fixtureSha256,
        receipt: { commandContract: structuredClone(native) },
        rows,
    };
    refreshSamples(data);
    return data;
}
function refreshSamples(data) {
    data.samplesBytes = Buffer.from(data.rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    data.wasm.samplesArtifact = {
        path: 'command-samples.raw.jsonl',
        bytes: data.samplesBytes.length,
        sha256: hash(data.samplesBytes),
        records: 217,
    };
}
test('SYNTHETIC ONLY: internally coherent parser fixture is accepted without creating artifacts', () => {
    assert.equal(verifyCommandQualification(synthetic()).samples, 217);
});
const mutations = [
    ['native status', (d) => (d.native.status = 'FAIL')],
    ['native pointer', (d) => (d.native.pointerBytes = 8)],
    ['native count', (d) => d.native.negativeCases--],
    ['native bounds', (d) => d.native.limits.operations++],
    ['native schema', (d) => (d.native.schemaSha256 = 'old')],
    ['native receipt inconsistency', (d) => (d.receipt.commandContract.pointerBytes = 8)],
    ['native truncated output', (d) => d.native.mixedOutputWords.pop()],
    ['WASM failed', (d) => (d.wasm.status = 'FAIL')],
    ['cleanup error', (d) => (d.wasm.cleanupError = 'failure')],
    ['stale schema', (d) => (d.wasm.identity = { ...d.identity, schemaSha256: 'old-m2' })],
    ['fixture drift', (d) => (d.wasm.fixtureSha256 = 'old')],
    ['negative missing', (d) => d.wasm.negatives.pop()],
    ['negative duplicate', (d) => (d.wasm.negatives[1].name = d.wasm.negatives[0].name)],
    ['negative phase', (d) => (d.wasm.negatives[0].error.mutationOutcome = 'committed')],
    ['sample total', (d) => d.wasm.sampleCount--],
    ['sample hash', (d) => (d.wasm.samplesArtifact.sha256 = '0'.repeat(64))],
    ['sample size', (d) => d.wasm.samplesArtifact.bytes--],
    ['sample records', (d) => d.wasm.samplesArtifact.records--],
    [
        'sample rehashed missing',
        (d) => {
            d.rows.pop();
            refreshSamples(d);
        },
    ],
    [
        'sample rehashed unknown kind',
        (d) => {
            d.rows[0].kind = 'invented';
            refreshSamples(d);
        },
    ],
    [
        'rejection mutation',
        (d) => {
            d.rows[0].after.synthetic = 2;
            refreshSamples(d);
        },
    ],
    [
        'reentrant calls',
        (d) => {
            d.rows.find((r) => r.kind === 'caught-reentry-zero-native-calls').allNativeCalls = ['native'];
            refreshSamples(d);
        },
    ],
    [
        'single read count',
        (d) => {
            d.rows.find((r) => r.kind === 'single-read').readCounts.body = 2;
            refreshSamples(d);
        },
    ],
    [
        'analytic index duplication',
        (d) => {
            d.rows.find((r) => r.kind === 'analytic-box').scene = 1;
            refreshSamples(d);
        },
    ],
    [
        'reuse stale generation',
        (d) => {
            d.wasm.observations.idCycles[0].old.low = 99;
        },
    ],
    ['invocation dropped', (d) => d.wasm.nativeCommandInvocations.pop()],
    ['invocation summary lies', (d) => d.wasm.observations.invocationSummary.committed++],
    ['invocation duplicate index', (d) => (d.wasm.nativeCommandInvocations[1].index = 0)],
    ['native unexpected throw', (d) => (d.wasm.nativeCommandInvocations[0].throwMessage = 'trap')],
    ['native unexpected status', (d) => (d.wasm.nativeCommandInvocations[0].nativeStatus = 77)],
    ['raw word not uint32', (d) => (d.wasm.nativeCommandInvocations[4].input[2] = -1)],
    ['raw input mismatched count', (d) => d.wasm.nativeCommandInvocations[4].bodyCount++],
    ['raw output missing', (d) => delete d.wasm.nativeCommandInvocations[4].actualOutput],
    ['raw refused fabricated output', (d) => (d.wasm.nativeCommandInvocations.at(-1).actualOutput = [])],
    ['raw wrong header', (d) => (d.wasm.nativeCommandInvocations[4].actualOutput[0] = 0)],
    ['raw illegal action', (d) => (d.wasm.nativeCommandInvocations[7].actualOutput[177] = 16)],
    ['raw nonfinite', (d) => (d.wasm.nativeCommandInvocations[4].actualOutput[202] = f32(Infinity))],
    ['raw finite actual drift', (d) => (d.wasm.nativeCommandInvocations[4].actualOutput[220] = f32(1))],
    ['raw duplicate COM drift', (d) => (d.wasm.nativeCommandInvocations[4].actualOutput[104] = f32(1))],
    ['raw reserved data', (d) => (d.wasm.nativeCommandInvocations[4].actualOutput[15] = 1)],
    ['injection missing', (d) => d.wasm.injectedMechanisms.pop()],
    ['injection duplicate', (d) => (d.wasm.injectedMechanisms[2].kind = d.wasm.injectedMechanisms[1].kind)],
    ['postcommit false rollback', (d) => (d.wasm.injectedMechanisms[1].error.mutationOutcome = 'not-mutated')],
    ['unknown false rollback', (d) => (d.wasm.injectedMechanisms[2].error.mutationOutcome = 'not-mutated')],
    ['injection replay', (d) => (d.wasm.injectedMechanisms[1].calls = 2)],
    ['injection actual capture drift', (d) => (d.wasm.injectedMechanisms[1].actual.force[0] = 1)],
    ['injection diagnostic replay', (d) => d.wasm.injectedMechanisms[2].diagnostics.nativeStepIndex++],
    [
        'injection wrong actual opcode',
        (d) => {
            d.wasm.nativeCommandInvocations[4].input[17] = 5;
            d.wasm.nativeCommandInvocations[4].actualOutput[173] = 5;
            d.wasm.nativeCommandInvocations[4].actualOutput[177] = 0;
        },
    ],
    ['injection stale snapshot', (d) => (d.wasm.injectedMechanisms[1].diagnostics.snapshotAvailable = true)],
    ...expected.native.checks.map((key) => ['native check ' + key, (d) => delete d.native.checks[key]]),
    ...expected.wasm.checks.map((key) => ['WASM check ' + key, (d) => delete d.wasm.checks[key]]),
];
for (const [name, mutate] of mutations)
    test('SYNTHETIC rejection: ' + name, () => {
        const data = synthetic();
        mutate(data);
        if (name !== 'native receipt inconsistency') data.receipt.commandContract = structuredClone(data.native);
        assert.throws(() => verifyCommandQualification(data));
    });
test('Consumer preserves every n4 expectation and adds exact query inventory', () => {
    const root = path.resolve(__dirname, '../..');
    const original = fs.readFileSync(path.join(root, expected.provenance.path));
    assert.equal(hash(original), expected.provenance.sha256);
    const e = JSON.parse(original);
    assert.deepEqual(expected.native, e.native);
    assert.deepEqual(expected.wasm, e.wasm);
    const inventory = JSON.parse(
        fs.readFileSync(
            path.join(root, 'docs/physics/box3d/rebuild/unified-native-source-20261022-n4/inventory-4.json'),
        ),
    );
    const additions = {
        inputs: [
            'tools/physics/box3d/native/query_bridge.c',
            'tools/physics/box3d/native/query_bridge.h',
            'tools/physics/box3d/native/query_contract.c',
            'tools/physics/box3d/wasm-query-contract.mjs',
            'tools/physics/box3d/query-admission-contract.mjs',
        ],
        compileUnits: ['tools/physics/box3d/native/query_bridge.c', 'tools/physics/box3d/native/query_contract.c'],
        evidence: ['native-query-contract.raw.json', 'wasm-query-contract.raw.json', 'air_box3d_query_contract.cjs'],
    };
    for (const key of Object.keys(additions)) {
        assert.deepEqual(expected.queryExtension[key], additions[key]);
        assert.deepEqual(
            expected.gate[key].filter((name) =>
                (key === 'inputs'
                    ? inventory.inputs
                    : key === 'compileUnits'
                      ? inventory.expectedCompileUnits
                      : inventory.expectedEvidence
                ).includes(name),
            ),
            key === 'inputs'
                ? inventory.inputs
                : key === 'compileUnits'
                  ? inventory.expectedCompileUnits
                  : inventory.expectedEvidence,
        );
    }
    // Historical n4 + query projection remains 55/69/32; later extensions are not deleted.
    assert.equal(inventory.inputs.length + additions.inputs.length, 55);
    assert.equal(inventory.expectedCompileUnits.length + additions.compileUnits.length, 69);
    assert.equal(inventory.expectedEvidence.length + additions.evidence.length, 32);
});
test('SYNTHETIC ONLY: exact 43-command schedule rejects omissions, additions and reordered qualifications', () => {
    const scripts = [
        'query-admission-contract.mjs',
        'motion-source-controls.mjs',
        'command-source-controls.mjs',
        'memory-diagnostics/v2/source-gate.mjs',
        'memory-diagnostics/v2/contract.test.mjs',
        'empty-world-trim/production/contract.test.mjs',
        'tools/verify/box3d/empty-world-release.test.mjs',
        null,
        null,
        null,
        null,
        ...[
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
            'memory',
        ].map((n) => `air_box3d_${n}_contract.cjs`),
        'hull-legacy-contract.mjs',
        ...[
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
            'memory-',
        ].map((n) => `wasm-${n}contract.mjs`),
        'air_box3d_world_storage_contract.cjs',
        'wasm-storage-contract.mjs',
        'sphere-capsule/contract.test.mjs',
        'wasm-sphere-capsule-contract.mjs',
    ];
    const r = {
        commands: scripts.map((n) => ({ command: 'node', args: ['synthetic/' + n], exitCode: 0, error: null })),
        queryAdmission: { status: 'PASS_ADMISSION_NO_NATIVE_CALLS', nativeQueryCalls: 0 },
        motionSourceControls: { status: 'PASS_SOURCE_CONTROLS_ONLY' },
        commandSourceControls: { status: 'PASS_SOURCE_CONTROLS_ONLY' },
        memorySourceControls: { status: 'PASS_SOURCE_CONTROLS_ONLY' },
        memoryCpuContract: { status: 'PASS_CPU_FAKE_DIAGNOSTICS_ONLY', nativeRuntimeExecuted: false },
        sphereCapsuleCpuContract: { status: 'PASS_CPU_SPHERE_CAPSULE_ONLY', nativeRuntimeExecuted: false },
        storageCpuContract: { status: 'PASS_CPU_STORAGE_CONTRACT_ONLY', nativeRuntimeExecuted: false },
        emptyWorldReleaseCpuContract: { status: 'PASS_CPU_TS_NATIVE_MOCKS_ONLY', nativeRuntimeExecuted: false },
    };
    const set = (i, command, args) => Object.assign(r.commands[i], { command, args });
    set(6, 'node', ['--test', 'tools/verify/box3d/empty-world-release.test.mjs']);
    set(7, 'emcc', ['--version']);
    set(8, 'cmake', ['--version']);
    set(9, 'emcmake', ['cmake']);
    set(10, 'cmake', ['--build', 'synthetic', '--parallel', '1']);
    verifyCommandSchedule(r);
    for (const alter of [
        (x) => x.commands.pop(),
        (x) => x.commands.push(x.commands[0]),
        (x) => x.commands.reverse(),
        (x) => (x.commands[20].exitCode = 1),
        (x) => (x.commands[0].args[0] = 'different.mjs'),
        (x) => (x.commands[3].args[0] = 'synthetic/memory-diagnostics/v1/source-gate.mjs'),
        (x) => (x.commands[39].args[0] = 'synthetic/air_box3d_world_contract.cjs'),
        (x) => (x.commands[40].args[0] = 'synthetic/wasm-world-contract.mjs'),
        (x) => delete x.storageCpuContract,
        (x) => delete x.emptyWorldReleaseCpuContract,
        (x) => (x.commands[6].args = ['tools/verify/box3d/empty-world-release.test.mjs']),
        (x) => (x.emptyWorldReleaseCpuContract.nativeRuntimeExecuted = true),
        (x) => (x.storageCpuContract.nativeRuntimeExecuted = true),
    ]) {
        const copy = structuredClone(r);
        alter(copy);
        assert.throws(() => verifyCommandSchedule(copy));
    }
});
