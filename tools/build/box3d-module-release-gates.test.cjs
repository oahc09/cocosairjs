/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU source/parser controls only. No native, WASM, SDK or application execution.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const expected = require('./box3d-command-expectations.json');
const hash = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const prefix = {
    inputs: '565d1911f0e449b45f659982672404b38ac144ccfa8b79dc911b3716678d1c90',
    compileUnits: '8ba0887b8de875a73833b36c0f70b3cdfd82d7144b9a67170952ab086fa47de6',
    evidence: '44caf2ea63b8b5e833333e0ba3ef28b05916fe31e94f99f3cab1040abefa7e03',
};
test('module-release exact inventories retain every prior ordered source/unit/evidence entry', () => {
    for (const [key, n, total] of [
        ['inputs', 120, 136],
        ['compileUnits', 85, 87],
        ['evidence', 60, 63],
    ]) {
        const rows = expected.gate[key];
        assert.equal(rows.length, total);
        assert.equal(new Set(rows).size, total);
        assert.equal(hash(rows.slice(0, n)), prefix[key]);
        assert.deepEqual(rows.slice(n), expected.moduleReleaseExtension[key]);
    }
    assert.equal(expected.gate.commands, 47);
    assert.equal(expected.moduleReleaseExtension.formalC20, 'NOT_QUALIFIED');
});
test('new inventories reject synthetic missing/duplicate/unknown/reordered and old-only lists', () => {
    for (const [key, n] of [
        ['inputs', 120],
        ['compileUnits', 85],
        ['evidence', 60],
    ]) {
        const current = expected.gate[key];
        const verify = (rows) => {
            assert.equal(rows.length, current.length);
            assert.equal(new Set(rows).size, current.length);
            assert.equal(hash(rows.slice(0, n)), prefix[key]);
            assert.deepEqual(rows.slice(n), expected.moduleReleaseExtension[key]);
        };
        for (const invalid of [
            current.slice(0, n),
            current.slice(0, -1),
            [...current, 'unknown'],
            [...current.slice(0, -1), current[0]],
            [...current.slice(0, n), ...current.slice(n).reverse()],
        ])
            assert.throws(() => verify(invalid));
    }
});
test('production compiler and consumers wire same-module native qualification, never only report labels', () => {
    const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
    for (const p of ['tools/physics/box3d/audit-artifacts.mjs', 'tools/build/box3d-assets.cjs']) {
        const source = read(p);
        assert.match(source, /verifyModuleReleaseQualification/);
        for (const n of expected.moduleReleaseExtension.evidence) assert(source.includes("'" + n + "'"));
    }
    const cmake = read('tools/physics/box3d/CMakeLists.txt');
    assert.match(cmake, /add_library\(air_box3d_abi STATIC[^\n]*native\/module_release\.c\)/);
    assert.match(cmake, /add_executable\(air_box3d_module_release_contract native\/module_release_contract\.c\)/);
    const build = read('tools/physics/box3d/build.mjs');
    assert.match(build, /result\.moduleReleaseContract = JSON\.parse\(moduleReleaseRaw\)/);
    assert.match(build, /moduleReleaseContract\.pointerBytes !== 4/);
    assert.match(build, /moduleReleaseLoaderCpuContract/);
});
const qualification = import('../physics/box3d/module-release/qualification.mjs');
function syntheticFixture(checkNames) {
    const baseline = {
        schema: 'air-box3d-module-release-snapshot-v1',
        schemaVersion: 1,
        core: { worlds: 0, trackedRequestedBytes: 128 },
        bridge: {
            worlds: 0,
            allocations: 0,
            bytes: 0,
            debugShapeHandles: 0,
            temporaryNodes: 0,
            temporaryBytes: 0,
            wireBuffers: 0,
            wireCapacityRecords: 0,
            wireLengthRecords: 0,
            capturedWorlds: 0,
        },
        mesh: { resources: 0, leases: 0, references: 0, borrowNodes: 0, resourceStorageBytes: 0 },
    };
    const copy = (x) => structuredClone(x);
    const active = copy(baseline);
    active.core = { worlds: 1, trackedRequestedBytes: 1024 };
    Object.assign(active.bridge, { worlds: 1, allocations: 5, bytes: 400, temporaryNodes: 4, temporaryBytes: 352 });
    Object.assign(active.mesh, { resources: 1, leases: 2, references: 2, borrowNodes: 2, resourceStorageBytes: 300 });
    const afterDebug = copy(active);
    afterDebug.bridge.debugShapeHandles = 2;
    afterDebug.bridge.bytes = 500;
    const direct = copy(baseline);
    direct.core = { worlds: 1, trackedRequestedBytes: 700 };
    const temporary = copy(active);
    temporary.bridge.temporaryNodes++;
    temporary.bridge.temporaryBytes += 45;
    temporary.bridge.allocations++;
    temporary.bridge.bytes += 45;
    const debug = copy(afterDebug);
    Object.assign(debug.bridge, { wireBuffers: 1, wireCapacityRecords: 10, wireLengthRecords: 4, capturedWorlds: 1 });
    const borrowed = copy(afterDebug);
    borrowed.mesh.leases = 0;
    const words = (s) => [
        1,
        38,
        17,
        0,
        ...['core', 'bridge', 'mesh'].flatMap((g) =>
            Object.values(s[g]).flatMap((v) => [v >>> 0, Math.floor(v / 0x100000000)]),
        ),
    ];
    const identity = {
        coreSha: 'a'.repeat(40),
        schemaSha256: 'b'.repeat(64),
        patchChainSha256: 'c'.repeat(64),
        abiVersion: 1,
        variant: 'st-simd',
        schemaVersion: 1,
        artifacts: [],
    };
    const native = {
        profile: 'air-box3d-module-release-native-v1',
        schema: 'air-box3d-module-release-native-v1',
        status: 'PASS',
        checks: 120,
        coreSha: identity.coreSha,
        schemaSha256: identity.schemaSha256,
        patchChainSha256: identity.patchChainSha256,
        snapshotWords: 38,
        globalCoreWorldNegative: true,
        meshLeaseBorrowNegative: true,
        noPartialOutput: true,
        repeatedRead: true,
        finalCoreDelta: 0,
        finalRegisteredStateZero: true,
        controlledFixture: true,
        simulationSteps: 0,
        pointerBytes: 4,
        baselineWords: words(baseline),
        directCoreWords: words(direct),
        meshWords: words(active),
        temporaryWords: words(temporary),
        debugWords: words(debug),
        borrowedWords: words(borrowed),
        terminalWords: words(baseline),
    };
    const fixtureSha256 = 'd'.repeat(64);
    const wasm = {
        schema: 'air-box3d-module-release-wasm-v1',
        status: 'PASS',
        fixtureSha256,
        identity: copy(identity),
        checks: Object.fromEntries(checkNames.map((n) => [n, true])),
        observations: { baseline, active, afterDebug, terminal: copy(baseline) },
        factoryCalls: 1,
        disposeCalls: 2,
        cleanupErrors: [],
        scope: 'Same-module registered-native terminal state; not app.close, full C20, all handles, malloc or GC',
    };
    return {
        native,
        wasm,
        identity,
        fixtureSha256,
        receipt: {
            moduleReleaseContract: copy(native),
            commands: ['air_box3d_module_release_contract.cjs', 'wasm-module-release-contract.mjs'].map((n) => ({
                args: ['/output/' + n],
                exitCode: 0,
                error: null,
            })),
        },
    };
}
test('SYNTHETIC ONLY: shared consumer independently recomputes all retained native/decoded observations', async () => {
    const { verifyModuleReleaseQualification: verify, MODULE_RELEASE_WASM_CHECKS: names } = await qualification;
    const result = verify(syntheticFixture(names));
    assert.equal(result.status, 'PASS_LIMITED_SAME_MODULE_REGISTERED_NATIVE_RELEASE');
    assert.equal(result.appCloseExecuted, false);
    assert.equal(result.fullC20Acceptance, false);
    assert.equal(result.allHandlesOrMallocOrGC, false);
});
const corruptions = {
    nativeMissing: (a) => delete a.native.baselineWords,
    nativeUnknown: (a) => (a.native.extra = true),
    nativeWrongCount: (a) => a.native.checks--,
    native64bit: (a) => (a.native.pointerBytes = 8),
    nativeStaleSchema: (a) => (a.native.schemaSha256 = 'e'.repeat(64)),
    nativeFalseCheck: (a) => (a.native.meshLeaseBorrowNegative = false),
    nativeBadWord: (a) => (a.native.baselineWords[0] = 2),
    nativeShortWords: (a) => a.native.terminalWords.pop(),
    nativeOverflow: (a) => (a.native.terminalWords[7] = 0x200000),
    nativeNonInteger: (a) => (a.native.baselineWords[4] = 0.5),
    nativeRemainingCore: (a) => (a.native.terminalWords[4] = 1),
    nativeRemainingBridge: (a) => (a.native.terminalWords[8] = 1),
    nativeRemainingMesh: (a) => (a.native.terminalWords[28] = 1),
    nativeBytesDrift: (a) => a.native.terminalWords[6]++,
    nativeCoreNegativeMissing: (a) => (a.native.directCoreWords[4] = 0),
    nativeMeshMissingBorrow: (a) => (a.native.meshWords[34] = 0),
    nativeTemporaryMissingHeader: (a) => (a.native.temporaryWords[18] -= 8),
    nativeDebugMissingWire: (a) => (a.native.debugWords[20] = 0),
    nativeBorrowLeaseStillPresent: (a) => (a.native.borrowedWords[30] = 2),
    wasmMissing: (a) => delete a.wasm.observations.terminal,
    wasmUnknown: (a) => (a.wasm.extra = true),
    wasmMissingCheck: (a) => delete a.wasm.checks.initialZeroRegisteredStateAtFactory,
    wasmUnknownCheck: (a) => (a.wasm.checks.unknown = true),
    wasmFalseCheck: (a) => (a.wasm.checks.bindingDisposeReturnsOriginalModuleBaseline = false),
    wasmIdentity: (a) => (a.wasm.identity.variant = 'mt'),
    wasmFixture: (a) => (a.wasm.fixtureSha256 = 'e'.repeat(64)),
    wasmFactoryCalls: (a) => (a.wasm.factoryCalls = 2),
    wasmDisposeCalls: (a) => (a.wasm.disposeCalls = 1),
    wasmCleanup: (a) => a.wasm.cleanupErrors.push('failed'),
    wasmRebase: (a) => a.wasm.observations.terminal.core.trackedRequestedBytes++,
    wasmTerminalWorld: (a) => (a.wasm.observations.terminal.core.worlds = 1),
    wasmTerminalBridge: (a) => (a.wasm.observations.terminal.bridge.allocations = 1),
    wasmTerminalMesh: (a) => (a.wasm.observations.terminal.mesh.borrowNodes = 1),
    wasmUnknownCounter: (a) => (a.wasm.observations.terminal.mesh.other = 0),
    wasmUnsafe: (a) => (a.wasm.observations.baseline.core.trackedRequestedBytes = 2 ** 53),
    wasmActiveNoWorld: (a) => (a.wasm.observations.active.core.worlds = 0),
    wasmActiveNoBorrow: (a) => (a.wasm.observations.active.mesh.borrowNodes = 0),
    wasmDebugNoTemp: (a) => (a.wasm.observations.afterDebug.bridge.temporaryNodes = 0),
    wasmDebugResourceDrift: (a) => (a.wasm.observations.afterDebug.mesh.resources = 0),
    receiptMismatch: (a) => (a.receipt.moduleReleaseContract.checks = 0),
    missingExecution: (a) => a.receipt.commands.pop(),
    duplicateExecution: (a) => a.receipt.commands.push(a.receipt.commands[0]),
    failedExecution: (a) => (a.receipt.commands[0].exitCode = 1),
};
for (const [name, change] of Object.entries(corruptions))
    test('SYNTHETIC ONLY: reject ' + name, async () => {
        const { verifyModuleReleaseQualification: verify, MODULE_RELEASE_WASM_CHECKS: names } = await qualification;
        const args = syntheticFixture(names);
        change(args);
        if (name !== 'receiptMismatch') args.receipt.moduleReleaseContract = structuredClone(args.native);
        assert.throws(() => verify(args));
    });
