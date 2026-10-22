/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Read-only consumer of frozen n4 qualification evidence. This is not a physics oracle.
 * Expected inventories are consumer-owned, never supplied by the inspected artifact.
 */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const EXPECTED = require('./box3d-command-expectations.json');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sorted = (values) => [...values].sort();
const requireChecks = (actual, names, label) => {
    assert.deepEqual(sorted(Object.keys(actual)), sorted(names), `${label} check inventory`);
    for (const name of names) assert.equal(actual[name], true, `${label}: ${name}`);
};
const words = (value, size, label) => {
    assert(Array.isArray(value), `${label} word array`);
    assert.equal(value.length, size, `${label} word count`);
    assert(value.every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff), `${label} uint32 words`);
};
function floats(input) {
    const buffer = Buffer.alloc(input.length * 4);
    input.forEach((v, i) => buffer.writeUInt32LE(v, i * 4));
    return input.map((_, i) => buffer.readFloatLE(i * 4));
}
function packet(input) {
    assert(Array.isArray(input) && input.length >= 12 && input.length <= EXPECTED.native.limits.inputWords);
    words(input, input.length, 'input');
    const b = input[3], o = input[4];
    assert(b <= EXPECTED.native.limits.bodies && o <= EXPECTED.native.limits.operations);
    assert.deepEqual(input.slice(0, 9), [0x314d4355, 1, input.length, b, o, 4, 16, 12, 12 + 4 * b]);
    assert.equal(input.length, 12 + b * 4 + o * 16);
    assert.equal(input[11], 0);
    // Refused packets deliberately contain bad sequences/types or tiny dt. Do not
    // require successful admission of their payload to retain authentic negatives.
    return { b, o };
}
function outputPacket(input, output) {
    const { b, o } = packet(input);
    assert(o > 0 && b > 0);
    words(output, 12 + b * 160 + o * 80, 'output');
    assert.deepEqual(output.slice(0, 12), [0x31524355, 1, output.length, b, o, 160, 80, 12, 12 + b * 160, 1, 0, 0]);
    const f = floats(output);
    const zero = (at, n) => assert(output.slice(at, at + n).every((v) => v === 0), 'Reserved output bits');
    const finite = (at, n) => assert(f.slice(at, at + n).every(Number.isFinite), 'Nonfinite output');
    const pose = (at) => {
        finite(at, 10);
        assert(Math.abs(f.slice(at + 3, at + 7).reduce((sum, x) => sum + x * x, 0) - 1) <= 1e-4, 'Output quaternion');
    };
    const state = (at) => {
        finite(at, 49);
        assert([0, 1, 2].includes(f[at]));
        for (const j of [1, 2, 3, 4, 5, 6, 25, 26, 27, 28, 29, 30, 47, 48]) assert([0, 1].includes(f[at + j]));
    };
    const counts = Array(b).fill(0), last = Array(b);
    for (let i = 0; i < o; ++i) {
        const a = 12 + b * 4 + i * 16, r = 12 + b * 160 + i * 80;
        assert(input[a] < b);
        assert.deepEqual(output.slice(r, r + 5), input.slice(a, a + 5), 'Operation identity');
        const kind = input[a + 1];
        assert(kind >= 1 && kind <= 10);
        const actions = kind <= 2 ? [2] : kind === 3 ? [6, 7] : kind === 4 ? [6] : kind === 8 ? [16, 18] : kind === 9 ? [2, 8] : [0];
        assert(actions.includes(output[r + 5]), 'Opcode action bits');
        zero(r + 6, 2); finite(r + 8, 52); zero(r + 62, 2); zero(r + 74, 6);
        pose(r + 8); pose(r + 64);
        assert([0, 1].includes(output[r + 60]) && [0, 1].includes(output[r + 61]));
        if (kind > 4) zero(r + 18, 12);
        else if (kind === 2 || kind === 4) zero(r + 21, 6);
        if (kind !== 8 && kind !== 9) zero(r + 42, 6);
        assert.deepEqual(output.slice(r + 30, r + 42), output.slice(r + 48, r + 60), 'Exact per-op float replay');
        ++counts[input[a]]; last[input[a]] = input.slice(a + 3, a + 5);
    }
    for (let i = 0; i < b; ++i) {
        const r = 12 + i * 160;
        assert.deepEqual(output.slice(r, r + 2), input.slice(12 + i * 4, 14 + i * 4));
        assert.equal(output[r + 2], counts[i]); zero(r + 3, 1);
        assert.deepEqual(output.slice(r + 158, r + 160), last[i]);
        pose(r + 4); state(r + 14); pose(r + 63); finite(r + 73, 12); pose(r + 85); state(r + 95); finite(r + 144, 13);
        assert.deepEqual(output.slice(r + 11, r + 14), output.slice(r + 58, r + 61), 'Before duplicate COM');
        assert.deepEqual(output.slice(r + 92, r + 95), output.slice(r + 139, r + 142), 'Actual duplicate COM');
        assert.deepEqual(output.slice(r + 63, r + 73), output.slice(r + 85, r + 95), 'Final pose replay');
        assert.deepEqual(output.slice(r + 73, r + 85), output.slice(r + 108, r + 120), 'Final v/w/F/T replay');
        assert([0, 1].includes(output[r + 157]));
        assert(f[r + 153] >= 0 && f[r + 154] >= 0 && f[r + 155] > 0);
        assert.equal(output[r + 154], input[14 + 4 * i], 'Requested mass bits');
        assert(output[r + 157] ? f[r + 156] === 0 : f[r + 156] > 0);
    }
}
function verifyCommandSchedule(receipt) {
    assert.equal(receipt.commands.length, 21, 'Exact successful WASM command inventory');
    assert(receipt.commands.every((row) => row.exitCode === 0 && !row.error));
    assert.equal(receipt.motionSourceControls?.status, 'PASS_SOURCE_CONTROLS_ONLY');
    assert.equal(receipt.commandSourceControls?.status, 'PASS_SOURCE_CONTROLS_ONLY');
    const scripts = [
        'motion-source-controls.mjs', 'command-source-controls.mjs',
        null, null, null, null,
        ...['geometry', 'world', 'body', 'filter', 'motion', 'command'].map((n) => `air_box3d_${n}_contract.cjs`),
        ...['', 'ownership-', 'snapshot-', 'geometry-', 'world-', 'body-', 'filter-', 'motion-', 'command-'].map((n) => `wasm-${n}contract.mjs`),
    ];
    scripts.forEach((script, i) => {
        const row = receipt.commands[i];
        assert(Array.isArray(row.args) && row.args.every((arg) => typeof arg === 'string'));
        if (script) assert(row.args[0]?.endsWith('/' + script), `Command ${i + 1}: ${script}`);
    });
    assert.equal(receipt.commands[2].command, 'emcc'); assert.deepEqual(receipt.commands[2].args, ['--version']);
    assert.equal(receipt.commands[3].command, 'cmake'); assert.deepEqual(receipt.commands[3].args, ['--version']);
    assert.equal(receipt.commands[4].command, 'emcmake'); assert.equal(receipt.commands[4].args[0], 'cmake');
    assert.equal(receipt.commands[5].command, 'cmake'); assert.equal(receipt.commands[5].args[0], '--build');
    assert.deepEqual(receipt.commands[5].args.slice(-2), ['--parallel', '1']);
}
function verifyCommandQualification({ native, wasm, samplesBytes, identity, fixtureSha256, receipt }) {
    assert.equal(native.status, 'PASS'); assert.equal(native.pointerBytes, 4);
    assert.equal(native.schemaSha256, identity.schemaSha256); assert.equal(native.patchChainSha256, identity.patchChainSha256);
    assert.deepEqual(native, receipt.commandContract, 'Native raw/receipt mismatch');
    requireChecks(native.checks, EXPECTED.native.checks, 'Native command');
    assert.equal(native.negativeCases, EXPECTED.native.negativeCases); assert.deepEqual(native.limits, EXPECTED.native.limits);
    words(native.mixedInputWords, EXPECTED.native.mixedInputWords, 'Native mixed input');
    words(native.mixedOutputWords, EXPECTED.native.mixedOutputWords, 'Native mixed output');
    outputPacket(native.mixedInputWords, native.mixedOutputWords);
    assert.equal(wasm.status, 'PASS'); assert.equal(wasm.error, undefined); assert.equal(wasm.cleanupError, undefined);
    assert.deepEqual(wasm.identity, identity); assert.equal(wasm.fixtureSha256, fixtureSha256);
    requireChecks(wasm.checks, EXPECTED.wasm.checks, 'WASM command');
    assert.deepEqual(wasm.negatives.map((r) => r.name), EXPECTED.wasm.negativeNames);
    wasm.negatives.forEach((r) => {
        assert.equal(r.error.mutationOutcome, 'not-mutated'); assert.equal(typeof r.error.code, 'string');
        assert.equal(typeof r.error.message, 'string');
    });
    assert.equal(wasm.sampleCount, EXPECTED.wasm.samples);
    assert.equal(wasm.samplesArtifact.path, 'command-samples.raw.jsonl');
    assert.equal(wasm.samplesArtifact.bytes, samplesBytes.length); assert.equal(wasm.samplesArtifact.sha256, hash(samplesBytes));
    assert.equal(wasm.samplesArtifact.records, EXPECTED.wasm.samples);
    const lines = samplesBytes.toString('utf8').split('\n');
    assert.equal(lines.pop(), '', 'JSONL final newline'); assert.equal(lines.length, EXPECTED.wasm.samples);
    const samples = lines.map((line) => JSON.parse(line)), kinds = {};
    for (const row of samples) kinds[row.kind] = (kinds[row.kind] ?? 0) + 1;
    assert.deepEqual(kinds, EXPECTED.wasm.sampleKinds);
    const select = (kind) => samples.filter((r) => r.kind === kind);
    assert.deepEqual(select('rejection').map(({ name, error }) => ({ name, error })), wasm.negatives);
    for (const row of select('rejection')) assert.deepEqual(row.after, row.before, `Rejection mutated: ${row.name}`);
    assert.deepEqual(select('caught-reentry-zero-native-calls')[0].allNativeCalls, []);
    for (const kind of ['single-read', 'pose-single-read']) {
        const row = select(kind)[0]; assert.deepEqual(row.after, row.before);
        const reads = kind === 'single-read' ? row.readCounts : row.poseReads;
        assert(Object.keys(reads).length > 0 && Object.values(reads).every((n) => n === 1));
    }
    assert.deepEqual(select('analytic-box').map((r) => r.scene), Array.from({ length: 32 }, (_, i) => i));
    assert.deepEqual(select('id-reuse').map((r) => r.index), Array.from({ length: 128 }, (_, i) => i));
    assert.equal(wasm.observations.idCycles.length, EXPECTED.wasm.idCycles);
    select('id-reuse').forEach((row, i) => {
        const cycle = wasm.observations.idCycles[i];
        assert.deepEqual(row.result.bodies[0].body, cycle.old); assert.deepEqual(row.replacement, cycle.replacement);
        assert.deepEqual(row.error, cycle.error); assert.equal(cycle.old.high, cycle.replacement.high);
        assert.notEqual(cycle.old.low, cycle.replacement.low); assert.equal(row.error.mutationOutcome, 'not-mutated');
    });
    const calls = wasm.nativeCommandInvocations;
    assert.equal(calls.length, EXPECTED.wasm.nativeCommandInvocations.total);
    const summary = { total: calls.length, validation: 0, committed: 0, empty: 0, refused: 0 };
    calls.forEach((row, index) => {
        assert.equal(row.index, index); assert.equal(row.throwMessage, undefined); assert([0, 1].includes(row.apply));
        assert([0, 1, 2, 4, 5, 8, 9, 10, 11, 12].includes(row.nativeStatus));
        const { b, o } = packet(row.input);
        assert.equal(row.inputWords, row.input.length); assert.equal(row.bodyCount, b); assert.equal(row.operationCount, o);
        if (row.apply === 0) ++summary.validation;
        if (row.nativeStatus !== 0) ++summary.refused;
        if (row.apply === 1 && row.nativeStatus === 0 && o > 0) { ++summary.committed; outputPacket(row.input, row.actualOutput); }
        else { assert.equal(row.actualOutput, undefined); if (row.apply === 1 && row.nativeStatus === 0 && o === 0) ++summary.empty; }
    });
    assert.deepEqual(summary, EXPECTED.wasm.nativeCommandInvocations);
    assert.deepEqual(wasm.observations.invocationSummary, summary, 'Invocation summary differs from retained calls');
    const phases = [
        ['real validation then delivery throw', undefined],
        ['real commit then injected corrupt-copy', 'committed'],
        ['real commit then injected unknown-status', undefined],
        ['real commit then injected delivery-throw', undefined],
        ['real commit then injected corrupt-actions', 'committed'],
        ['real commit then injected inconsistent-com', 'committed'],
    ];
    assert.equal(wasm.injectedMechanisms.length, EXPECTED.wasm.injectedMechanisms);
    wasm.injectedMechanisms.forEach((row, i) => {
        assert.equal(row.kind, phases[i][0]); assert.equal(row.error.mutationOutcome, phases[i][1]);
        if (i > 0) {
            assert.equal(row.calls, 1); assert.equal(row.diagnostics.snapshotAvailable, false);
            assert(Number.isSafeInteger(row.diagnostics.nativeStepIndex) && row.diagnostics.nativeStepIndex >= 0);
            for (const key of ['linearVelocity', 'angularVelocity', 'force', 'torque', 'worldCenter'])
                assert(Array.isArray(row.actual[key]) && row.actual[key].length === 3 && row.actual[key].every(Number.isFinite));
        }
        if ([1, 4, 5].includes(i)) assert.equal(row.error.code, 'AIR_E_BOX3D_ABI');
        if (i === 2) { assert.equal(row.error.nativeStatus, 77); assert.equal(row.error.code, 'AIR_E_BOX3D_ABI'); }
    });
    return { samples: samples.length, sampleKinds: kinds, invocationSummary: summary, injectedMechanisms: phases.length };
}
module.exports = { verifyCommandQualification, verifyCommandSchedule };
