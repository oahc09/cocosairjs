/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Consumer-owned exact new diagnostic evidence contract. Pure CPU validation, no execution/writes.
import assert from 'node:assert/strict';
export const MEMORY_NATIVE_CHECKS = Object.freeze([
    'readonlyRepeat',
    'initialZeroStep',
    'liveAndReleasedWorld',
    'sumMatchesCore',
    'trueGlobalBridge',
    'invalidNoWrite',
    'shortNoWrite',
    'lockedBeforeCoreGetter',
    'overflowBeforeCoreGetter',
    'injectedMismatchNoWrite',
    'bridgeOverflowNoWrite',
]);
export const MEMORY_WASM_CHECKS = Object.freeze([
    'initialZeroStepSameWorld',
    'exactLedgerSum',
    'moduleAndNativeGlobalScopes',
    'readonlyRepeat',
    'invalidAndShortNoPartial',
    'nonemptyCopiedImmutable',
    'releasedWorldNoWarmupOrBaselineRewrite',
    'afterCloseNotClaimed',
]);
export function verifyMemoryDiagnosticQualification({ native, wasm, identity, fixtureSha256, receipt }) {
    assert.equal(native.schema, 'air-box3d-memory-native-contract-v1');
    assert.equal(native.status, 'PASS');
    assert.equal(native.pointerBytes, 4);
    assert.equal(native.rowCount, 87);
    assert.equal(native.wireWords, 740);
    assert.equal(native.checks, 31);
    assert.equal(native.controlledFixture, true);
    assert.equal(native.injectionsAreProductionObservations, false);
    for (const key of MEMORY_NATIVE_CHECKS) assert.equal(native[key], true, key);
    for (const key of ['coreSha', 'schemaSha256', 'patchChainSha256']) assert.equal(native[key], identity[key], key);
    assert.equal(native.finalCoreDelta, 0);
    assert.equal(native.finalBridgeBytes, 0);
    assert.deepEqual(receipt.memoryContract, native);
    assert.equal(wasm.schema, 'air-box3d-memory-wasm-contract-v1');
    assert.equal(wasm.status, 'PASS');
    for (const key of ['coreSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'])
        assert.equal(wasm.identity[key], identity[key], key);
    assert.equal(wasm.fixtureSha256, fixtureSha256);
    assert.deepEqual(Object.keys(wasm.checks).sort(), [...MEMORY_WASM_CHECKS].sort());
    for (const key of MEMORY_WASM_CHECKS) assert.equal(wasm.checks[key], true, key);
    assert.equal(wasm.acceptancePassed, false);
    assert.equal(
        wasm.runtimeScope,
        'Production WASM exports in an independent low-level fixture; not the C20 app host',
    );
    assert.equal(
        wasm.controlledNativeBranches,
        'Locked/overflow/mismatch are covered separately by the labeled native unit fixture, not fabricated production observations',
    );
    for (const suffix of ['air_box3d_memory_contract.cjs', 'wasm-memory-contract.mjs']) {
        const matched = receipt.commands.filter((entry) => entry.args?.[0]?.endsWith('/' + suffix));
        assert.equal(matched.length, 1, suffix);
        assert.equal(matched[0].exitCode, 0);
        assert(!matched[0].error);
    }
    return Object.freeze({
        status: 'PASS_LIMITED_MEMORY_DIAGNOSTIC_CONTRACT',
        nativeUnitControlled: true,
        appC20Acceptance: false,
        afterCloseAppObservation: 'UNAVAILABLE',
    });
}
