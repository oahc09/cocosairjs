/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual facade with explicitly synthetic ABI. Source/CPU only; no WASM or physics.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createBox3DBinding } from '../../../../../src/air/physics/box3d/binding/facade.mjs';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const lock = JSON.parse(read('tools/physics/box3d/versions.lock.json'));
const schema = JSON.parse(read('tools/physics/box3d/abi-schema.json'));
const identity = {
    coreSha: lock.core.commit,
    bindingBaseSha: lock.bindingBase.commit,
    patchChainSha256: lock.patchLock.patchChainSha256,
    schemaSha256: lock.apiSchemaSha256,
    abiVersion: 1,
    variant: 'st-simd',
};
function fixture() {
    const buffer = new ArrayBuffer(16384);
    const module = {
        HEAPU8: new Uint8Array(buffer),
        HEAPU32: new Uint32Array(buffer),
        HEAPF32: new Float32Array(buffer),
    };
    let serial = 100,
        calls = 0,
        status = 0,
        reenter;
    const active = new Set();
    const text = (at, value) => {
        module.HEAPU8.set(new TextEncoder().encode(value + '\0'), at);
        return at;
    };
    const core = text(16, identity.coreSha),
        patch = text(80, identity.patchChainSha256),
        schemaAt = text(160, identity.schemaSha256);
    Object.assign(module, {
        _air_b3_abi_version: () => 1,
        _air_b3_core_sha: () => core,
        _air_b3_patch_chain_sha: () => patch,
        _air_b3_schema_sha: () => schemaAt,
        _air_b3_module_release_snapshot_v1: () => 0,
        _air_b3_mesh_lifetime_counters: () => 0,
        _malloc: () => 4096,
        _free: () => {},
        _air_b3_world_create: () => {
            active.add(++serial);
            return serial;
        },
        _air_b3_world_valid: (id) => active.has(id),
        _air_b3_world_destroy: (id) => {
            active.delete(id);
            return 0;
        },
        _air_b3_world_trim_empty: () => {
            ++calls;
            if (reenter) reenter();
            if (status instanceof Error) throw status;
            return status;
        },
    });
    const api = createBox3DBinding(module, identity),
        world = api.createWorld();
    return {
        module,
        api,
        world,
        get calls() {
            return calls;
        },
        set status(value) {
            status = value;
        },
        set reenter(value) {
            reenter = value;
        },
    };
}
test('new production ABI pins six patches and complete embedded metadata ledger', () => {
    assert.equal(lock.corePatches.length, 6);
    assert.equal(lock.patchLock.patchChainSha256, '14b3b0e85702c42f436fa1b5e570c78ed8d46f30476a3bedc11ded38a2328303');
    assert.equal(
        createHash('sha256').update(read('tools/physics/box3d/abi-schema.json')).digest('hex'),
        identity.schemaSha256,
    );
    assert.equal(schema.memoryDiagnosticsV2.version, 2);
    assert.equal(schema.memoryDiagnosticsV2.rowCount, 89);
    assert.equal(schema.memoryDiagnosticsV2.wireWords, 756);
    assert.deepEqual(
        schema.memoryDiagnosticsV2.rows.slice(-2).map((r) => r.name),
        ['worldFixed.identityHistory', 'worldFixed.creationCapacity'],
    );
    const exports = JSON.parse(read('tools/physics/box3d/exports.json'));
    assert(exports.includes('_air_b3_world_trim_empty'));
    assert(exports.includes('_air_b3_world_memory_diagnostics_v2'));
    assert(!exports.includes('_air_b3_world_memory_diagnostics_v1'));
    assert(!('memoryDiagnosticsV1' in schema));
});
test('trim success preserves world and step without Step or rebuild API calls', () => {
    const f = fixture();
    const before = f.api.stepDiagnostics(f.world);
    assert.equal(f.api.trimEmptyWorld(f.world, true), true);
    assert.equal(f.calls, 1);
    assert.deepEqual(f.api.stepDiagnostics(f.world), before);
    assert(Object.isFrozen(f.world));
    f.api.dispose();
});
test('only NONEMPTY returns false and does not issue another native mutation', () => {
    const f = fixture();
    f.status = 14;
    assert.equal(f.api.trimEmptyWorld(f.world, true), false);
    assert.equal(f.calls, 1);
    f.api.dispose();
});
for (const status of [1, 2, 9, 13, 15, 16])
    test(`known trim refusal ${status} is readonly not-mutated`, () => {
        const f = fixture();
        f.status = status;
        let caught;
        try {
            f.api.trimEmptyWorld(f.world, true);
        } catch (e) {
            caught = e;
        }
        assert(caught instanceof Error);
        assert.equal(caught.mutationOutcome, 'not-mutated');
        assert.equal(Object.getOwnPropertyDescriptor(caught, 'mutationOutcome').writable, false);
        if (status === 15) assert.equal(caught.code, 'AIR_E_BOX3D_IDENTITY_EXHAUSTED');
        f.api.dispose();
    });
for (const status of [999, new Error('transport unknown')])
    test(`unknown trim outcome ${String(status)} is not relabeled pre-mutation`, () => {
        const f = fixture();
        f.status = status;
        let caught;
        try {
            f.api.trimEmptyWorld(f.world, true);
        } catch (e) {
            caught = e;
        }
        assert(caught);
        assert.equal(caught.mutationOutcome, undefined);
        assert.equal(f.calls, 1);
        f.api.dispose();
    });
test('wrong ACK, forged world and missing native entry reject before invocation', () => {
    const f = fixture();
    for (const ack of [0, 1, null, undefined, 'true']) assert.throws(() => f.api.trimEmptyWorld(f.world, ack));
    assert.throws(() => f.api.trimEmptyWorld({ id: f.world.id }, true));
    assert.equal(f.calls, 0);
    delete f.module._air_b3_world_trim_empty;
    assert.throws(
        () => f.api.trimEmptyWorld(f.world, true),
        (e) => e.code === 'AIR_E_BOX3D_ABI' && e.mutationOutcome === 'not-mutated',
    );
    f.api.dispose();
});
test('reentry refuses and original exception stays unknown; teardown remains available', () => {
    const f = fixture();
    f.reenter = () => f.api.trimEmptyWorld(f.world, true);
    assert.throws(() => f.api.trimEmptyWorld(f.world, true));
    assert.equal(f.calls, 1);
    f.api.dispose();
});
test('native bridge uses explicit ownership preflight and fault status before success', () => {
    const bridge = read('tools/physics/box3d/native/world_bridge.c');
    const start = bridge.indexOf('int air_b3_world_trim_empty(');
    const body = bridge.slice(start);
    for (const field of [
        'w->temporary',
        'w->wire',
        'w->captured',
        'w->shapes',
        'w->allocations != 1',
        'w->bytes != sizeof(*w)',
    ])
        assert(body.includes(field));
    assert(body.indexOf('AIR_B3_WORLD_NONEMPTY') < body.indexOf('w->temporary'));
    assert(body.indexOf('w->temporary') < body.indexOf('b3World_TrimEmptyStorage('));
    assert(!/\b(?:malloc|free|b3World_Step|b3DestroyWorld|b3CreateWorld)\s*\(/.test(body));
    const step = read('tools/physics/box3d/native/air_box3d.c')
        .split('int air_b3_world_step(')[1]
        .split('int air_b3_world_counts(')[0];
    assert.equal((step.match(/b3World_HasIdentityFault/g) || []).length, 2);
    assert(step.includes('? AIR_B3_IDENTITY_EXHAUSTED : AIR_B3_OK'));
});

import { verifyStorageQualification, STORAGE_NATIVE_CHECKS, STORAGE_WASM_CHECKS } from './qualification.mjs';
function syntheticReports() {
    // Deliberately synthetic validator inputs, never a saved production observation.
    const snapshot = (step, revision) => ({
        profile: 'air-box3d-memory-diagnostics-v2',
        schemaVersion: 2,
        identity: { ...identity, worldId: 101, nativeStepIndex: String(step), bindingMutationRevision: revision },
        liveCounts: { bodies: 0, shapes: 0, contacts: 0, joints: 0, islands: 0 },
        worldLedger: {
            rows: schema.memoryDiagnosticsV2.rows.map((r) => ({
                id: r.id,
                name: r.name,
                bytes: r.id === 88 ? '36' : r.id === 89 ? '20' : '1',
                count: r.name.startsWith('event.') ? '0' : '1',
                capacity: '1',
            })),
            sumMatchesCore: true,
        },
    });
    const finalize = (s) => {
        const sum = s.worldLedger.rows.reduce((n, r) => n + BigInt(r.bytes), 0n).toString();
        s.worldLedger.classifiedBytes = sum;
        s.worldLedger.coreReportedBytes = sum;
        return s;
    };
    const initial = finalize(snapshot(0, 0)),
        active = snapshot(1, 2),
        releasedBeforeTrim = finalize(snapshot(1, 3));
    active.worldLedger.rows[0].bytes = '2';
    finalize(active);
    const trimmed = finalize(snapshot(1, 4)),
        secondTrimmed = finalize(snapshot(2, 9));
    const native = {
        schema: 'air-box3d-storage-native-contract-v1',
        status: 'PASS',
        pointerBytes: 4,
        checks: 153,
        coreSha: identity.coreSha,
        schemaSha256: identity.schemaSha256,
        patchChainSha256: identity.patchChainSha256,
        initialLedgerBytes: Number(initial.worldLedger.coreReportedBytes),
        identityMetadataBytes: 36,
        creationCapacityBytes: 20,
        ...Object.fromEntries(STORAGE_NATIVE_CHECKS.map((k) => [k, true])),
        controlledFixture: true,
        injectionsAreProductionObservations: false,
        finalCoreDelta: 0,
        finalBridgeBytes: 0,
    };
    const wasm = {
        schema: 'air-box3d-storage-wasm-contract-v1',
        status: 'PASS',
        identity,
        fixtureSha256: 'f'.repeat(64),
        manifestSha256: 'a'.repeat(64),
        factoryCalls: 1,
        cleanupErrors: [],
        acceptancePassed: false,
        afterCloseMemory: 'UNAVAILABLE_NOT_PROBED',
        scope: 'Production facade/native empty-storage regression, one module and two worlds; not APP/C20/I05/I06',
        checks: Object.fromEntries(STORAGE_WASM_CHECKS.map((k) => [k, true])),
        observations: { initial, active, releasedBeforeTrim, trimmed, secondTrimmed },
    };
    const receipt = {
        storageContract: native,
        commands: ['air_box3d_world_storage_contract.cjs', 'wasm-storage-contract.mjs'].map((n) => ({
            args: ['/build/' + n],
            exitCode: 0,
            error: null,
        })),
    };
    return { native, wasm, identity, fixtureSha256: wasm.fixtureSha256, receipt };
}
test('pure consumer accepts only its explicitly synthetic complete contract shape', () => {
    const result = verifyStorageQualification(syntheticReports());
    assert.equal(result.appC20Acceptance, false);
});
for (const [name, alter] of Object.entries({
    hostNotWasm: (r) => {
        r.native.pointerBytes = 8;
    },
    oldNativeChecks: (r) => {
        r.native.checks = 51;
    },
    unknownWasmCheck: (r) => {
        r.wasm.checks.extra = true;
    },
    missingRealStep: (r) => {
        delete r.wasm.checks.realStepHasContactSensorJointAndGrowth;
    },
    missingOwnership: (r) => {
        r.native.ownershipRefusal = false;
    },
    unlabelledInjection: (r) => {
        r.native.injectionsAreProductionObservations = true;
    },
    staleSchema: (r) => {
        r.native.schemaSha256 = '0'.repeat(64);
    },
    changedFactory: (r) => {
        r.wasm.factoryCalls = 2;
    },
    aftercloseClaim: (r) => {
        r.wasm.afterCloseMemory = 'ZERO';
    },
    appClaim: (r) => {
        r.wasm.acceptancePassed = true;
    },
    cleanupFailure: (r) => {
        r.wasm.cleanupErrors = ['close failed'];
    },
    wrongSource: (r) => {
        r.wasm.fixtureSha256 = '0'.repeat(64);
    },
    hiddenMetadata: (r) => {
        r.wasm.observations.trimmed.worldLedger.rows.pop();
    },
    rebase: (r) => {
        r.wasm.observations.trimmed.worldLedger.rows[0].bytes = '2';
    },
    differentWorld: (r) => {
        r.wasm.observations.trimmed.identity.worldId = 102;
    },
    implicitStep: (r) => {
        r.wasm.observations.trimmed.identity.nativeStepIndex = '2';
    },
    eventNotRetired: (r) => {
        r.wasm.observations.trimmed.worldLedger.rows.find((x) => x.name.startsWith('event.')).count = '1';
    },
    notExecuted: (r) => {
        r.receipt.commands[1].exitCode = 1;
    },
    missingNative: (r) => {
        r.receipt.storageContract = {};
    },
}))
    test(`consumer rejects ${name} (synthetic negative control)`, () => {
        const reports = syntheticReports();
        alter(reports);
        assert.throws(() => verifyStorageQualification(reports));
    });

for (const key of [
    'sleepDisableCycles',
    'sharedSleepingConstraintSets',
    'reEnablePreservesJoints',
    'baseSetsPreserved',
]) {
    test(`consumer rejects missing new sleeping-set native check ${key}`, () => {
        const reports = syntheticReports();
        delete reports.native[key];
        assert.throws(() => verifyStorageQualification(reports));
    });
}
for (const key of STORAGE_WASM_CHECKS.slice(12)) {
    test(`consumer rejects false new sleeping-set WASM check ${key}`, () => {
        const reports = syntheticReports();
        reports.wasm.checks[key] = false;
        assert.throws(() => verifyStorageQualification(reports));
    });
}
