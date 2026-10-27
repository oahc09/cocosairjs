/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Pure evidence consumer. Never executes native/WASM/APP or turns CPU mocks into runtime proof.
import assert from 'node:assert/strict';
export const STORAGE_NATIVE_CHECKS = Object.freeze([
    'metadataRows',
    'nonemptyNoMutation',
    'ownershipRefusal',
    'sameWorldStepPreserved',
    'realStepReleaseBaseline',
    'secondCycleBaseline',
    'staleIdsRejected',
    'twoWorldIsolation',
    'controlledFaultClose',
]);
export const STORAGE_WASM_CHECKS = Object.freeze([
    'fresh89RowBaselineAndFixedMetadata',
    'realStepHasContactSensorJointAndGrowth',
    'nonemptyRefusalPreservesNativeAndBindingSnapshot',
    'destroyedLiveCountsZeroWithRetiredNativeEvents',
    'missingAcknowledgementIsMutationFree',
    'sameWorldInitialLedgerRestoredWithoutRebase',
    'successfulTrimAdvancesRevisionOnceNotNativeStep',
    'allRetiredEventArraysIncludingBothEndRolesCleared',
    'secondWorldAndItsCurrentSnapshotUnaffected',
    'regrownLowAndHighSlotsKeepAllOldRawIdsStale',
    'secondRealEpochRestoresSameOriginalLedger',
    'afterCloseAndFullC20NotClaimed',
]);
const unsigned = (value) => {
    assert.equal(typeof value, 'string');
    assert(/^(0|[1-9][0-9]*)$/.test(value));
    return BigInt(value);
};
function ledger(snapshot) {
    assert.equal(snapshot.profile, 'air-box3d-memory-diagnostics-v2');
    assert.equal(snapshot.schemaVersion, 2);
    assert.equal(snapshot.worldLedger.rows.length, 89);
    assert.deepEqual(
        snapshot.worldLedger.rows.map((r) => r.id),
        Array.from({ length: 89 }, (_, i) => i + 1),
    );
    assert.equal(new Set(snapshot.worldLedger.rows.map((r) => r.name)).size, 89);
    const sum = snapshot.worldLedger.rows.reduce((n, r) => n + unsigned(r.bytes), 0n);
    assert.equal(sum, unsigned(snapshot.worldLedger.coreReportedBytes));
    assert.equal(sum, unsigned(snapshot.worldLedger.classifiedBytes));
    assert.equal(snapshot.worldLedger.sumMatchesCore, true);
    for (const [name, bytes] of [
        ['worldFixed.identityHistory', 36n],
        ['worldFixed.creationCapacity', 20n],
    ]) {
        const row = snapshot.worldLedger.rows.find((r) => r.name === name);
        assert(row);
        assert.equal(unsigned(row.bytes), bytes);
        assert.equal(unsigned(row.count), 1n);
        assert.equal(unsigned(row.capacity), 1n);
    }
    return sum;
}
export function verifyStorageQualification({ native, wasm, identity, fixtureSha256, receipt }) {
    assert.equal(native.schema, 'air-box3d-storage-native-contract-v1');
    assert.equal(native.status, 'PASS');
    assert.equal(native.pointerBytes, 4);
    assert.equal(native.checks, 51);
    for (const key of STORAGE_NATIVE_CHECKS) assert.equal(native[key], true, key);
    assert.equal(native.controlledFixture, true);
    assert.equal(native.injectionsAreProductionObservations, false);
    assert.equal(native.identityMetadataBytes, 36);
    assert.equal(native.creationCapacityBytes, 20);
    assert(Number.isSafeInteger(native.initialLedgerBytes) && native.initialLedgerBytes > 56);
    assert.equal(native.finalCoreDelta, 0);
    assert.equal(native.finalBridgeBytes, 0);
    for (const key of ['coreSha', 'schemaSha256', 'patchChainSha256']) assert.equal(native[key], identity[key], key);
    assert.deepEqual(receipt.storageContract, native);
    assert.equal(wasm.schema, 'air-box3d-storage-wasm-contract-v1');
    assert.equal(wasm.status, 'PASS');
    for (const key of ['coreSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'])
        assert.equal(wasm.identity[key], identity[key], key);
    assert.equal(wasm.fixtureSha256, fixtureSha256);
    assert.match(wasm.manifestSha256, /^[a-f0-9]{64}$/);
    assert.equal(wasm.factoryCalls, 1);
    assert.deepEqual(wasm.cleanupErrors, []);
    assert.equal(wasm.acceptancePassed, false);
    assert.equal(wasm.afterCloseMemory, 'UNAVAILABLE_NOT_PROBED');
    assert.equal(
        wasm.scope,
        'Production facade/native empty-storage regression, one module and two worlds; not APP/C20/I05/I06',
    );
    assert.deepEqual(Object.keys(wasm.checks).sort(), [...STORAGE_WASM_CHECKS].sort());
    for (const key of STORAGE_WASM_CHECKS) assert.equal(wasm.checks[key], true, key);
    const { initial, active, releasedBeforeTrim, trimmed, secondTrimmed } = wasm.observations;
    const base = ledger(initial);
    assert.equal(BigInt(native.initialLedgerBytes), base);
    assert(ledger(active) > base);
    ledger(releasedBeforeTrim);
    const columns = (s) => s.worldLedger.rows.map((r) => [r.name, r.bytes]);
    for (const s of [initial, active, releasedBeforeTrim, trimmed, secondTrimmed]) {
        assert.equal(s.identity.worldId, initial.identity.worldId);
        for (const key of ['coreSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'])
            assert.equal(s.identity[key], identity[key]);
    }
    for (const s of [trimmed, secondTrimmed]) {
        assert.equal(ledger(s), base);
        assert.deepEqual(columns(s), columns(initial));
        assert.deepEqual(s.liveCounts, { bodies: 0, shapes: 0, contacts: 0, joints: 0, islands: 0 });
        for (const row of s.worldLedger.rows.filter((r) => r.name.startsWith('event.')))
            assert.equal(unsigned(row.count), 0n);
    }
    assert.equal(unsigned(initial.identity.nativeStepIndex), 0n);
    assert.equal(unsigned(trimmed.identity.nativeStepIndex), 1n);
    assert.equal(unsigned(secondTrimmed.identity.nativeStepIndex), 2n);
    assert.equal(trimmed.identity.bindingMutationRevision, releasedBeforeTrim.identity.bindingMutationRevision + 1);
    for (const suffix of ['air_box3d_world_storage_contract.cjs', 'wasm-storage-contract.mjs']) {
        const entries = receipt.commands.filter((r) => r.args?.[0]?.endsWith('/' + suffix));
        assert.equal(entries.length, 1, suffix);
        assert.equal(entries[0].exitCode, 0);
        assert(!entries[0].error);
    }
    return Object.freeze({
        status: 'PASS_LIMITED_PRODUCTION_EMPTY_STORAGE_CONTRACT',
        appC20Acceptance: false,
        afterCloseAppObservation: 'UNAVAILABLE',
        sameWorldOnly: true,
    });
}
