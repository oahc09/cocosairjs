/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Pure evidence consumer. Never executes native, WASM, SDK or app lifecycle.
import assert from 'node:assert/strict';
const GROUPS = Object.freeze({
    core: ['worlds', 'trackedRequestedBytes'],
    bridge: [
        'worlds',
        'allocations',
        'bytes',
        'debugShapeHandles',
        'temporaryNodes',
        'temporaryBytes',
        'wireBuffers',
        'wireCapacityRecords',
        'wireLengthRecords',
        'capturedWorlds',
    ],
    mesh: ['resources', 'leases', 'references', 'borrowNodes', 'resourceStorageBytes'],
});
const keys = (value, expected, label) => {
    assert(value && typeof value === 'object' && !Array.isArray(value), label);
    assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), label);
};
const integer = (value) => assert(Number.isSafeInteger(value) && value >= 0);
function snapshot(value) {
    keys(value, ['schema', 'schemaVersion', 'core', 'bridge', 'mesh'], 'Snapshot exact fields');
    assert.equal(value.schema, 'air-box3d-module-release-snapshot-v1');
    assert.equal(value.schemaVersion, 1);
    for (const [group, names] of Object.entries(GROUPS)) {
        keys(value[group], names, group);
        for (const name of names) integer(value[group][name]);
    }
    return value;
}
function rawSnapshot(words) {
    assert(Array.isArray(words));
    assert.equal(words.length, 38);
    for (const word of words) assert(Number.isInteger(word) && word >= 0 && word <= 0xffffffff);
    assert.deepEqual(words.slice(0, 4), [1, 38, 17, 0]);
    const result = { schema: 'air-box3d-module-release-snapshot-v1', schemaVersion: 1 };
    let at = 4;
    for (const [group, names] of Object.entries(GROUPS)) {
        result[group] = {};
        for (const name of names) result[group][name] = words[at++] + words[at++] * 0x100000000;
    }
    return snapshot(result);
}
function released(baseline, terminal) {
    snapshot(baseline);
    snapshot(terminal);
    for (const row of [baseline, terminal]) {
        assert.equal(row.core.worlds, 0);
        for (const group of ['bridge', 'mesh']) for (const count of Object.values(row[group])) assert.equal(count, 0);
    }
    assert.equal(terminal.core.trackedRequestedBytes, baseline.core.trackedRequestedBytes);
}
// Entry point follows only the frozen producer schema; no permissive fallback is allowed.
export const MODULE_RELEASE_WASM_CHECKS = Object.freeze([
    'initialZeroRegisteredStateAtFactory',
    'nativeInvalidAndShortOutputAtomic',
    'liveCoreWorldAndRegisteredBridgeBothObserved',
    'meshLeasesReferencesAndBorrowsObserved',
    'debugCacheAndTemporaryScopesObserved',
    'bindingDisposeReturnsOriginalModuleBaseline',
    'repeatedDisposeAndTerminalReadsStable',
    'detachedSnapshotSurvivesModuleReferenceRelease',
]);
function verifyWasm(wasm, identity, fixtureSha256) {
    keys(
        wasm,
        [
            'schema',
            'status',
            'fixtureSha256',
            'identity',
            'checks',
            'observations',
            'factoryCalls',
            'disposeCalls',
            'cleanupErrors',
            'scope',
        ],
        'WASM exact report fields',
    );
    assert.equal(wasm.schema, 'air-box3d-module-release-wasm-v1');
    assert.equal(wasm.status, 'PASS');
    assert.match(fixtureSha256, /^[a-f0-9]{64}$/);
    assert.equal(wasm.fixtureSha256, fixtureSha256);
    assert.deepEqual(wasm.identity, identity, 'Exact producer manifest identity');
    assert.equal(wasm.factoryCalls, 1);
    assert.equal(wasm.disposeCalls, 2);
    assert.deepEqual(wasm.cleanupErrors, []);
    assert.equal(
        wasm.scope,
        'Same-module registered-native terminal state; not app.close, full C20, all handles, malloc or GC',
    );
    keys(wasm.checks, MODULE_RELEASE_WASM_CHECKS, 'Exact WASM check inventory');
    for (const name of MODULE_RELEASE_WASM_CHECKS) assert.equal(wasm.checks[name], true, name);
    keys(wasm.observations, ['baseline', 'active', 'afterDebug', 'terminal'], 'Exact observed snapshots');
    const { baseline, active, afterDebug, terminal } = wasm.observations;
    for (const row of [baseline, active, afterDebug, terminal]) snapshot(row);
    released(baseline, terminal);
    assert.equal(active.core.worlds, 1);
    assert.equal(active.bridge.worlds, 1);
    assert(active.core.trackedRequestedBytes > baseline.core.trackedRequestedBytes);
    assert(active.bridge.bytes > 0 && active.bridge.allocations > 0);
    assert.deepEqual(
        [active.mesh.resources, active.mesh.leases, active.mesh.references, active.mesh.borrowNodes],
        [1, 2, 2, 2],
    );
    assert(active.mesh.resourceStorageBytes > 0);
    assert.equal(afterDebug.core.worlds, 1);
    assert.equal(afterDebug.bridge.worlds, 1);
    assert.equal(afterDebug.bridge.debugShapeHandles, 2);
    assert(afterDebug.bridge.temporaryNodes > 0 && afterDebug.bridge.temporaryBytes > 0);
    assert.equal(afterDebug.bridge.wireBuffers, 0);
    assert.equal(afterDebug.bridge.capturedWorlds, 0);
    assert(afterDebug.bridge.bytes >= afterDebug.bridge.temporaryBytes);
    assert(afterDebug.bridge.temporaryBytes >= afterDebug.mesh.resourceStorageBytes);
    assert.deepEqual(afterDebug.mesh, active.mesh);
}
export const MODULE_RELEASE_NATIVE_CHECKS = 120;
export function verifyModuleReleaseQualification({ native, wasm, identity, fixtureSha256, receipt }) {
    keys(
        native,
        [
            'profile',
            'schema',
            'status',
            'checks',
            'coreSha',
            'schemaSha256',
            'patchChainSha256',
            'snapshotWords',
            'globalCoreWorldNegative',
            'meshLeaseBorrowNegative',
            'noPartialOutput',
            'repeatedRead',
            'finalCoreDelta',
            'finalRegisteredStateZero',
            'controlledFixture',
            'simulationSteps',
            'pointerBytes',
            'baselineWords',
            'directCoreWords',
            'meshWords',
            'temporaryWords',
            'debugWords',
            'borrowedWords',
            'terminalWords',
        ],
        'Native exact report fields',
    );
    assert.equal(native.profile, 'air-box3d-module-release-native-v1');
    assert.equal(native.schema, native.profile);
    assert.equal(native.status, 'PASS');
    assert.equal(native.checks, MODULE_RELEASE_NATIVE_CHECKS);
    assert.equal(native.pointerBytes, 4);
    assert.equal(native.snapshotWords, 38);
    for (const name of ['coreSha', 'schemaSha256', 'patchChainSha256'])
        assert.equal(native[name], identity[name], name);
    for (const name of [
        'globalCoreWorldNegative',
        'meshLeaseBorrowNegative',
        'noPartialOutput',
        'repeatedRead',
        'finalRegisteredStateZero',
        'controlledFixture',
    ])
        assert.equal(native[name], true, name);
    assert.equal(native.simulationSteps, 0);
    assert.equal(native.finalCoreDelta, 0);
    const baseline = rawSnapshot(native.baselineWords),
        terminal = rawSnapshot(native.terminalWords);
    released(baseline, terminal);
    assert.deepEqual(native.terminalWords, native.baselineWords);
    const direct = rawSnapshot(native.directCoreWords);
    assert.equal(direct.core.worlds, 1);
    assert(direct.core.trackedRequestedBytes > baseline.core.trackedRequestedBytes);
    for (const group of ['bridge', 'mesh']) for (const value of Object.values(direct[group])) assert.equal(value, 0);
    const mesh = rawSnapshot(native.meshWords),
        temporary = rawSnapshot(native.temporaryWords),
        debug = rawSnapshot(native.debugWords),
        borrowed = rawSnapshot(native.borrowedWords);
    for (const row of [mesh, temporary, debug, borrowed]) {
        assert.equal(row.core.worlds, 1);
        assert.equal(row.bridge.worlds, 1);
        assert(row.core.trackedRequestedBytes > baseline.core.trackedRequestedBytes);
        assert(row.bridge.bytes > 0 && row.bridge.allocations > 0);
        assert.equal(row.mesh.resources, 1);
        assert.equal(row.mesh.references, 2);
        assert.equal(row.mesh.borrowNodes, 2);
        assert(row.mesh.resourceStorageBytes > 0);
    }
    assert.equal(mesh.mesh.leases, 2);
    assert.equal(temporary.mesh.leases, 2);
    assert.equal(debug.mesh.leases, 2);
    assert.equal(borrowed.mesh.leases, 0);
    assert.deepEqual(temporary.mesh, mesh.mesh);
    // WASM32 BridgeTemp is one 4-byte pointer plus one 4-byte size_t; payload is 37 bytes.
    assert.equal(temporary.bridge.temporaryNodes, mesh.bridge.temporaryNodes + 1);
    assert.equal(temporary.bridge.temporaryBytes, mesh.bridge.temporaryBytes + 45);
    assert.equal(temporary.bridge.allocations, mesh.bridge.allocations + 1);
    assert.equal(temporary.bridge.bytes, mesh.bridge.bytes + 45);
    assert.equal(debug.bridge.debugShapeHandles, 2);
    assert.equal(debug.bridge.wireBuffers, 1);
    assert(debug.bridge.wireCapacityRecords >= debug.bridge.wireLengthRecords && debug.bridge.wireLengthRecords > 0);
    assert.equal(debug.bridge.capturedWorlds, 1);
    assert.deepEqual(receipt.moduleReleaseContract, native, 'Build receipt exact native result');
    verifyWasm(wasm, identity, fixtureSha256);
    for (const suffix of ['air_box3d_module_release_contract.cjs', 'wasm-module-release-contract.mjs']) {
        const matches = receipt.commands.filter((row) => row.args?.[0]?.endsWith('/' + suffix));
        assert.equal(matches.length, 1, suffix);
        assert.equal(matches[0].exitCode, 0);
        assert(!matches[0].error);
    }
    return Object.freeze({
        status: 'PASS_LIMITED_SAME_MODULE_REGISTERED_NATIVE_RELEASE',
        nativeChecks: MODULE_RELEASE_NATIVE_CHECKS,
        wasmChecks: MODULE_RELEASE_WASM_CHECKS.length,
        factoryCalls: 1,
        originalFactoryBaselinePreserved: true,
        appCloseExecuted: false,
        fullC20Acceptance: false,
        allHandlesOrMallocOrGC: false,
    });
}
