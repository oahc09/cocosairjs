/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU mocks only: no SDK import, WASM instantiation, app creation or native physics call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import {
    loadObserverLayout,
    copiedJSON,
    validateObservation,
    createMemoryObserver,
    preserveFixtureOutcome,
} from './observer.mjs';
import { verifyOriginalFiles, runObservedSceneCycles } from './consumer-adapter.mjs';
import {
    NATIVE_IDENTITY,
    ORIGINAL_FILES,
    SAFE_RECORDS,
    DIAGNOSTIC_PROFILE,
    SCHEMA_SHA256,
    HISTORICAL_REPLAY,
} from './profile.mjs';

const originalRoot = process.env.BOX3D_ORIGINAL_APP_SOURCE_ROOT;
const diagnosticRoot = process.env.BOX3D_DIAGNOSTIC_SOURCE_ROOT;
assert(
    originalRoot && diagnosticRoot,
    'Provide read-only original APP source and reviewed diagnostic candidate source',
);
const schemaBytes = readFileSync(join(diagnosticRoot, 'tools/physics/box3d/abi-schema.json'));
const layout = loadObserverLayout(schemaBytes);
const baseline = { native: { bodies: 0, shapes: 0, contacts: 0, joints: 0, liveBytes: '12345' }, resources: [] };
const active = {
    native: { bodies: 50, shapes: 50, contacts: 0, joints: 1, liveBytes: '45678' },
    resources: [{ cacheLeases: 1, shapeBorrows: 3, users: 3 }],
};
const released = { native: { bodies: 0, shapes: 0, contacts: 0, joints: 0, liveBytes: '54321' }, resources: [] };
function deepFreeze(value) {
    if (value && typeof value === 'object') {
        for (const item of Object.values(value)) deepFreeze(item);
        Object.freeze(value);
    }
    return value;
}
function diagnostic(snapshot = baseline, step = 0n, modify = () => {}) {
    const value = {
        profile: DIAGNOSTIC_PROFILE,
        schemaVersion: 2,
        identity: {
            ...NATIVE_IDENTITY,
            worldId: 65536,
            bindingGeneration: 1,
            nativeStepIndex: step,
            bindingMutationRevision: Number(step),
        },
        worldLedger: {
            accounting: 'CPU mock of separate capacity ledger',
            coreReportedBytes: BigInt(snapshot.native.liveBytes),
            classifiedBytes: BigInt(snapshot.native.liveBytes),
            sumMatchesCore: true,
            rows: layout.map((row, index) => ({
                ...row,
                count: row.countUnit === 'unavailable' ? null : 0n,
                capacity: 0n,
                bytes:
                    row.name === 'worldFixed.identityHistory'
                        ? 36n
                        : row.name === 'worldFixed.creationCapacity'
                          ? 20n
                          : index === 0
                            ? BigInt(snapshot.native.liveBytes) - 56n
                            : 0n,
            })),
        },
        liveCounts: {
            bodies: snapshot.native.bodies,
            shapes: snapshot.native.shapes,
            contacts: snapshot.native.contacts,
            joints: snapshot.native.joints,
            islands: 0,
        },
        maxWorkload: {
            meaning: 'historical maximum, not capacity',
            staticShapeCount: 0,
            dynamicShapeCount: 0,
            staticBodyCount: 0,
            dynamicBodyCount: 0,
            contactCount: 0,
        },
        moduleCoreTrackedRequestedBytes: 9007199254740993n,
        nativeWorldBridge: {
            trackedBytes: 17n,
            allocations: 1,
            debugShapeHandles: 0,
            debugPrimitiveCapacity: 0,
            capturedPrimitives: 0,
        },
        nativeGlobalBridge: {
            trackedBytes: 31n,
            allocations: 2,
            debugShapeHandles: 0,
            debugPrimitiveCapacity: 0,
            capturedPrimitives: 0,
        },
        mesh: {
            moduleSuccessfulCooks: 1n,
            moduleDestroys: 0n,
            liveResourceSnapshots: structuredClone(snapshot.resources),
        },
        excludedObservations: {
            workerArenaBackingCapacityBytes: 345n,
            workerArenaPeakDemand: 123,
            meaning: 'distinct, excluded from ledger',
        },
        unavailable: ['after-app-close module observation', 'all-native-handle census', 'global-world census'],
        excludedFromWorldLedger: [
            'worker arena backing/shared/overflow allocations',
            'WASM memory capacity/JS heap/RSS',
        ],
        observer: { facadeScratchBytes: 4096, queryNativeAllocationPolicy: 'none-by-source-design' },
    };
    modify(value);
    return deepFreeze(value);
}
function harness(options = {}) {
    let current = diagnostic(),
        step = 0,
        calls = 0;
    const primary = [],
        diagnosticJournal = [];
    const world = {
        getNativeMemoryDiagnostics() {
            calls++;
            if (options.getterError) throw options.getterError;
            return current;
        },
    };
    let backend = world;
    const observer = createMemoryObserver({
        world,
        getWorld: () => backend,
        primaryRecord: options.primaryRecord ?? ((kind, value) => primary.push({ kind, value })),
        appendDiagnostic: options.appendDiagnostic ?? ((row) => diagnosticJournal.push(row)),
        layout,
        publicStep: () => step,
    });
    return {
        observer,
        primary,
        diagnosticJournal,
        calls: () => calls,
        replaceWorld: () => {
            backend = {};
        },
        set: (snapshot, nextStep, modify) => {
            step = nextStep;
            current = diagnostic(snapshot, BigInt(nextStep), modify);
        },
    };
}
function completeThree(h) {
    h.observer.record(SAFE_RECORDS[0], baseline);
    h.set(active, 3);
    h.observer.record(SAFE_RECORDS[1], { cycle: 1, active });
    h.set(released, 58);
    h.observer.record(SAFE_RECORDS[2], { cycle: 1, afterRelease: released });
}

test('exact original APP v2 source files remain byte-identical', () => verifyOriginalFiles(originalRoot));
test('new schema/layout is pinned; old225 schema and altered bytes fail closed', () => {
    assert.equal(layout.length, 89);
    assert.throws(() => loadObserverLayout(Buffer.concat([schemaBytes, Buffer.from(' ')])), /schema/i);
    const old = JSON.parse(schemaBytes);
    old.memoryDiagnosticsV2.rowCount = 1;
    assert.throws(() => loadObserverLayout(Buffer.from(JSON.stringify(old))), /schema/i);
});
test('original SHA gate rejects changing strict corefixture', () => {
    const root = mkdtempSync(join(tmpdir(), 'c20-memory-original-gate-'));
    try {
        for (const item of ORIGINAL_FILES) {
            const dest = join(root, item.path);
            mkdirSync(dirname(dest), { recursive: true });
            writeFileSync(dest, readFileSync(join(originalRoot, item.path)));
        }
        verifyOriginalFiles(root);
        writeFileSync(join(root, ORIGINAL_FILES[0].path), '// changed fixture\n');
        assert.throws(() => verifyOriginalFiles(root), /bytes changed/);
    } finally {
        rmSync(root, { recursive: true });
    }
});
test('adapter rejects SDK225 before executing the original fixture', async () => {
    const root = mkdtempSync(join(tmpdir(), 'c20-memory-sdk-gate-'));
    try {
        for (const item of ORIGINAL_FILES) {
            const dest = join(root, item.path);
            mkdirSync(dirname(dest), { recursive: true });
            writeFileSync(dest, readFileSync(join(originalRoot, item.path)));
        }
        const schema = join(root, 'tools/physics/box3d/abi-schema.json');
        mkdirSync(dirname(schema), { recursive: true });
        writeFileSync(schema, schemaBytes);
        await assert.rejects(
            runObservedSceneCycles({ sourceRoot: root, sdk: { AIR_BUILD_NUMBER: 225 }, report: {} }),
            /old225\/226\/227 forbidden/,
        );
        await assert.rejects(
            runObservedSceneCycles({
                sourceRoot: root,
                sdk: { AIR_BUILD_NUMBER: 228 },
                report: { moduleFactoryReplaced: true },
            }),
            /strictly equal/,
        );
        await assert.rejects(
            runObservedSceneCycles({
                sourceRoot: root,
                sdk: { AIR_BUILD_NUMBER: 228 },
                report: { moduleFactoryReplaced: false, hostSha256: 'instrumented' },
            }),
            /strictly equal/,
        );
    } finally {
        rmSync(root, { recursive: true });
    }
});
test('three safe points only; original primary record runs first with original references', () => {
    const h = harness();
    completeThree(h);
    assert.equal(h.calls(), 3);
    assert.equal(h.primary[0].value, baseline);
    assert.equal(h.observer.summary().status, 'COMPLETE_REACHED_SCENE_SNAPSHOT_SETS');
    assert.deepEqual(h.observer.summary().completeSceneSnapshotSets, [1]);
    assert.equal(h.diagnosticJournal[2].originalSnapshot.native.liveBytes, '54321');
    assert.equal(h.diagnosticJournal[2].observation.moduleCoreTrackedRequestedBytes, '9007199254740993');
    assert.equal(h.diagnosticJournal[2].observation.nativeWorldBridge.trackedBytes, '17');
    assert.equal(h.diagnosticJournal[2].observation.nativeGlobalBridge.trackedBytes, '31');
    assert.equal(h.diagnosticJournal[2].observation.excludedObservations.workerArenaBackingCapacityBytes, '345');
});
test('callback/frame/close records never invoke the getter', () => {
    const h = harness();
    for (const kind of [
        'fixed-frame',
        'public-trigger-callback',
        'before-scene-release',
        'one-normal-app-close',
        'close-failure',
        'terminal',
    ])
        h.observer.record(kind, {});
    assert.equal(h.calls(), 0);
    assert.equal(h.observer.summary().status, 'PARTIAL');
});
test('primary journal failure is not swallowed or replaced; getter is not invoked', () => {
    const error = new Error('primary append failed');
    const h = harness({
        primaryRecord() {
            throw error;
        },
    });
    assert.throws(
        () => h.observer.record(SAFE_RECORDS[0], baseline),
        (caught) => caught === error,
    );
    assert.equal(h.calls(), 0);
});
test('getter error stays separate and primary fixture Error propagates by identity', async () => {
    const h = harness({ getterError: Object.assign(new Error('observer failure'), { code: 'AIR_E_BOX3D_REENTRANT' }) });
    const primaryError = new Error('ORIGINAL_STRICT_BASELINE_MISMATCH'),
        report = {};
    await assert.rejects(
        preserveFixtureOutcome(
            async (record) => {
                record(SAFE_RECORDS[0], baseline);
                throw primaryError;
            },
            h.observer,
            report,
        ),
        (error) => error === primaryError,
    );
    assert.equal(report.memoryDiagnostics.status, 'DIAGNOSTIC_FAILURE');
    assert.equal(report.memoryDiagnostics.errors[0].code, 'AIR_E_BOX3D_REENTRANT');
});
test('diagnostic journal error stays separate and never overwrites primary Error', async () => {
    const h = harness({
        appendDiagnostic() {
            throw new Error('diagnostic disk write failed');
        },
    });
    const error = new Error('primary baseline'),
        report = {};
    await assert.rejects(
        preserveFixtureOutcome(
            async () => {
                completeThree(h);
                throw error;
            },
            h.observer,
            report,
        ),
        (caught) => caught === error,
    );
    assert.equal(report.memoryDiagnostics.errors.length, 3);
    assert.equal(report.memoryDiagnostics.errors[0].stage, 'diagnostic-journal-write');
    assert.equal(report.memoryDiagnostics.observations.length, 3);
});
test('complete diagnostic snapshots do not turn original strict failure into success', async () => {
    const h = harness(),
        report = { status: 'FAIL', completedCycles: 0 };
    const error = new Error('12345 != 54321');
    await assert.rejects(
        preserveFixtureOutcome(
            async () => {
                completeThree(h);
                throw error;
            },
            h.observer,
            report,
        ),
        (caught) => caught === error,
    );
    assert.equal(report.memoryDiagnostics.status, 'COMPLETE_REACHED_SCENE_SNAPSHOT_SETS');
    assert.equal(report.status, 'FAIL');
    assert.equal(report.completedCycles, 0);
});
test('fixture return value and original strict report are untouched on successful return', async () => {
    const h = harness(),
        callback = () => {},
        report = { status: 'ORIGINAL', completedCycles: 100 };
    const result = await preserveFixtureOutcome(
        async () => {
            completeThree(h);
            return callback;
        },
        h.observer,
        report,
    );
    assert.equal(result, callback);
    assert.equal(report.status, 'ORIGINAL');
    assert.equal(report.completedCycles, 100);
});
test('sealed/afterclose observer never calls a getter even if an old safe record is replayed', () => {
    const h = harness();
    completeThree(h);
    h.observer.seal();
    h.observer.record('one-normal-app-close', { status: 'released' });
    h.observer.record(SAFE_RECORDS[2], { cycle: 1, afterRelease: released });
    assert.equal(h.calls(), 3);
    assert.equal(h.observer.summary().status, 'DIAGNOSTIC_FAILURE');
    assert.match(h.observer.summary().afterAppClose, /^UNAVAILABLE/);
});
test('world object replacement does not query the replacement or existing backend', () => {
    const h = harness();
    h.replaceWorld();
    h.observer.record(SAFE_RECORDS[0], baseline);
    assert.equal(h.calls(), 0);
    assert.equal(h.observer.summary().status, 'DIAGNOSTIC_FAILURE');
});
test('duplicate baseline and missing active snapshot are rejected before additional native query', () => {
    const h = harness();
    h.observer.record(SAFE_RECORDS[0], baseline);
    h.observer.record(SAFE_RECORDS[0], baseline);
    h.observer.record(SAFE_RECORDS[2], { cycle: 1, afterRelease: released });
    assert.equal(h.calls(), 1);
    assert.equal(h.observer.summary().errors.length, 2);
});
test('one baseline or baseline plus active is partial, not complete diagnostics', () => {
    const h = harness();
    h.observer.record(SAFE_RECORDS[0], baseline);
    assert.equal(h.observer.summary().status, 'PARTIAL');
    h.set(active, 3);
    h.observer.record(SAFE_RECORDS[1], { cycle: 1, active });
    assert.equal(h.observer.summary().status, 'PARTIAL');
});
test('copied snapshots do not alias source or journal sink; bigint precision is exact', () => {
    const value = { bytes: 9007199254740993n, child: { value: 1 } };
    const copy = copiedJSON(value);
    value.child.value = 2;
    assert.equal(copy.bytes, '9007199254740993');
    assert.equal(copy.child.value, 1);
    const h = harness();
    completeThree(h);
    h.diagnosticJournal[0].observation.worldLedger.coreReportedBytes = '0';
    assert.equal(h.observer.summary().observations[0].observation.worldLedger.coreReportedBytes, '12345');
});
for (const [label, change] of [
    [
        'old ABI identity',
        (v) => {
            v.identity.schemaSha256 = 'ce98aca1a40c4999df838c1eaab2b08b0533c85adca9866eb48180c6190575d6';
        },
    ],
    [
        'wrong core',
        (v) => {
            v.identity.coreSha = 'foreign';
        },
    ],
    [
        'wrong profile',
        (v) => {
            v.profile = 'unknown';
        },
    ],
    [
        'fewer rows',
        (v) => {
            v.worldLedger.rows.pop();
        },
    ],
    [
        'duplicate row ID',
        (v) => {
            v.worldLedger.rows[1].id = 1;
        },
    ],
    [
        'wrong row name',
        (v) => {
            v.worldLedger.rows[1].name = 'replacement';
        },
    ],
    [
        'unknown count silently zero',
        (v) => {
            v.worldLedger.rows.find((r) => r.countUnit === 'unavailable').count = 0n;
        },
    ],
    [
        'Number byte rounding',
        (v) => {
            v.moduleCoreTrackedRequestedBytes = 9007199254740993;
        },
    ],
    [
        'bad category sum',
        (v) => {
            v.worldLedger.rows[0].bytes++;
        },
    ],
    [
        'false sum marker',
        (v) => {
            v.worldLedger.sumMatchesCore = false;
        },
    ],
    [
        'nonzero released body',
        (v) => {
            v.liveCounts.bodies = 1;
        },
    ],
    [
        'resource mismatch',
        (v) => {
            v.mesh.liveResourceSnapshots = [{}];
        },
    ],
    [
        'global bridge smaller',
        (v) => {
            v.nativeGlobalBridge.trackedBytes = 0n;
        },
    ],
    [
        'negative module',
        (v) => {
            v.moduleCoreTrackedRequestedBytes = -1n;
        },
    ],
    [
        'mesh destroys exceeds cooks',
        (v) => {
            v.mesh.moduleDestroys = 2n;
        },
    ],
    [
        'missing afterclose boundary',
        (v) => {
            v.unavailable = [];
        },
    ],
    [
        'included arena falsely claimed',
        (v) => {
            v.excludedFromWorldLedger = [];
        },
    ],
    [
        'wrong facade scratch identity',
        (v) => {
            v.observer.facadeScratchBytes = 512;
        },
    ],
])
    test('diagnostic negative: ' + label, () =>
        assert.throws(() => validateObservation(diagnostic(baseline, 0n, change), baseline, layout)),
    );
for (const [label, change] of [
    [
        'different world ID',
        (v) => {
            v.identity.worldId++;
        },
    ],
    [
        'different binding generation',
        (v) => {
            v.identity.bindingGeneration++;
        },
    ],
    [
        'old native step',
        (v) => {
            v.identity.nativeStepIndex = 0n;
        },
    ],
    [
        'old mutation revision',
        (v) => {
            v.identity.bindingMutationRevision = 0;
        },
    ],
])
    test('generation/epoch negative: ' + label, () => {
        const old = diagnostic(active, 3n).identity;
        assert.throws(() => validateObservation(diagnostic(released, 58n, change), released, layout, old));
    });
test('synthetic strict-baseline mismatch preserves original validator error; NOT historical raw replay', async () => {
    const { validateCycle, CONFIG } = await import(pathToFileURL(join(originalRoot, ORIGINAL_FILES[1].path)).href);
    // Reuse only the clearly synthetic CPU helper from the unchanged original validator tests.
    // This is not a reconstruction of, or substitute for, any historical native journal.
    const helperSource = readFileSync(
        join(originalRoot, 'tools/physics/box3d/c20-app-scene-cycles/v2/contract.test.mjs'),
        'utf8',
    );
    const start = helperSource.indexOf('function cycleRow(cycle) {');
    const end = helperSource.indexOf('function result()', start);
    assert(start >= 0 && end > start);
    const row = new Function('baseline', helperSource.slice(start, end) + '\nreturn cycleRow(1);')(() =>
        structuredClone(baseline),
    );
    validateCycle(row, baseline, 0);
    row.afterRelease.native.liveBytes = '12346';
    let primaryError;
    try {
        validateCycle(row, baseline, 0);
    } catch (e) {
        primaryError = e;
    }
    assert(primaryError);
    assert.match(String(primaryError), /12346/);
    assert.match(String(primaryError), /12345/);
    assert.deepEqual(
        [CONFIG.cycles, CONFIG.bodies, CONFIG.shapes, CONFIG.joints, CONFIG.terrainUsers, CONFIG.consumerTimeoutMs],
        [100, 50, 50, 1, 3, 300000],
    );
    const h = harness(),
        report = {};
    await assert.rejects(
        preserveFixtureOutcome(
            async () => {
                completeThree(h);
                throw primaryError;
            },
            h.observer,
            report,
        ),
        (e) => e === primaryError,
    );
    assert.equal(report.memoryDiagnostics.status, 'COMPLETE_REACHED_SCENE_SNAPSHOT_SETS');
    assert.equal(HISTORICAL_REPLAY.status, 'UNAVAILABLE_ORIGINAL_RAW_NOT_RECOVERED');
});

test('SDK226 identity cannot enter the SDK228 adapter even with a current schema file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'c20-memory-sdk226-reject-'));
    try {
        for (const item of ORIGINAL_FILES) {
            const dest = join(root, item.path);
            mkdirSync(dirname(dest), { recursive: true });
            writeFileSync(dest, readFileSync(join(originalRoot, item.path)));
        }
        const schema = join(root, 'tools/physics/box3d/abi-schema.json');
        mkdirSync(dirname(schema), { recursive: true });
        writeFileSync(schema, schemaBytes);
        await assert.rejects(
            runObservedSceneCycles({ sourceRoot: root, sdk: { AIR_BUILD_NUMBER: 226 }, report: {} }),
            /old225\/226\/227 forbidden/,
        );
    } finally {
        rmSync(root, { recursive: true });
    }
});
test('SDK226 diagnostic schema is rejected rather than relabelled as the new cohort', () => {
    assert.throws(() =>
        validateObservation(
            diagnostic(baseline, 0n, (value) => {
                value.identity.schemaSha256 = 'bef78296f8fff850570799c65d6f4b0a47115cf38aed898a58cf88275348fd84';
            }),
            baseline,
            layout,
        ),
    );
});
test('final schema has89rows but explicitly marks six tree rows as shared ledger estimates, not allocated backing', () => {
    const rows = layout.filter((row) => row.name.endsWith('.leafBoxes') || row.name.endsWith('.binIndices'));
    assert.equal(rows.length, 6);
    for (const row of rows)
        assert.equal(
            row.capacityMeaning,
            'Shared rebuildCapacity ledger estimate; backing is unallocated in pinned B3_TREE_HEURISTIC=0',
        );
});

test('v2 diagnostic rejects old schemaVersion1 even with updated identity', () =>
    assert.throws(() =>
        validateObservation(
            diagnostic(baseline, 0n, (v) => {
                v.schemaVersion = 1;
            }),
            baseline,
            layout,
        ),
    ));
test('new layout contains fixed identity history and creation capacity metadata without claiming old baseline', () => {
    assert.equal(layout.length, 89);
    assert.deepEqual(
        layout.slice(-2).map((r) => r.name),
        ['worldFixed.identityHistory', 'worldFixed.creationCapacity'],
    );
});
for (const old of [225, 226, 227])
    test('adapter refuses previous runtime ' + old + ' before world/getter access', async () => {
        const sdk = { AIR_BUILD_NUMBER: old };
        await assert.rejects(runObservedSceneCycles({ sourceRoot: originalRoot, sdk, report: {} }));
    });

for (const name of ['worldFixed.identityHistory', 'worldFixed.creationCapacity'])
    test('fixed metadata cannot disappear while total is kept equal: ' + name, () =>
        assert.throws(() =>
            validateObservation(
                diagnostic(baseline, 0n, (v) => {
                    const row = v.worldLedger.rows.find((r) => r.name === name);
                    v.worldLedger.rows[0].bytes += row.bytes;
                    row.bytes = 0n;
                }),
                baseline,
                layout,
            ),
        ),
    );
