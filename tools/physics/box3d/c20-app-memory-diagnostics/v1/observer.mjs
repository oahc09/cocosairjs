/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Synchronous copied observations only. Never flush, step, trim, create or destroy native objects.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PROFILE, DIAGNOSTIC_PROFILE, SCHEMA_SHA256, NATIVE_IDENTITY, SAFE_RECORDS, BOUNDARIES } from './profile.mjs';

export function loadObserverLayout(schemaBytes) {
    assert.equal(
        createHash('sha256').update(schemaBytes).digest('hex'),
        SCHEMA_SHA256,
        'New reviewed ABI schema required',
    );
    const layout = JSON.parse(schemaBytes).memoryDiagnosticsV1;
    assert.equal(layout.profile, DIAGNOSTIC_PROFILE);
    assert.equal(layout.rowCount, 87);
    assert.equal(layout.wireWords, 740);
    assert.equal(layout.rows.length, 87);
    return Object.freeze(layout.rows.map((row) => Object.freeze(row)));
}

// Decimal strings preserve every bigint bit; JSON copies retain no native views or original object aliases.
export function copiedJSON(value) {
    return JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item)));
}
const integer = (value) => assert(Number.isSafeInteger(value) && value >= 0, 'Nonnegative safe integer required');
const bigint = (value) =>
    assert(typeof value === 'bigint' && value >= 0n, 'Nonnegative bigint required; no Number coercion');
const bridgeKeys = ['trackedBytes', 'allocations', 'debugShapeHandles', 'debugPrimitiveCapacity', 'capturedPrimitives'];

export function validateObservation(value, snapshot, layout, previousIdentity) {
    assert(value && Object.isFrozen(value), 'Real getter must return its frozen copied diagnostic');
    assert.equal(value.profile, DIAGNOSTIC_PROFILE);
    assert.equal(value.schemaVersion, 1);
    for (const [key, expected] of Object.entries(NATIVE_IDENTITY)) assert.equal(value.identity[key], expected, key);
    integer(value.identity.worldId);
    assert(value.identity.worldId > 0 && value.identity.worldId <= 0xffffffff);
    integer(value.identity.bindingGeneration);
    assert(value.identity.bindingGeneration > 0);
    integer(value.identity.bindingMutationRevision);
    bigint(value.identity.nativeStepIndex);
    if (previousIdentity) {
        for (const key of ['worldId', 'bindingGeneration'])
            assert.equal(value.identity[key], previousIdentity[key], 'Same world identity required');
        assert(value.identity.nativeStepIndex >= previousIdentity.nativeStepIndex, 'Native step must not regress');
        assert(
            value.identity.bindingMutationRevision >= previousIdentity.bindingMutationRevision,
            'Binding revision must not regress',
        );
    }
    bigint(value.worldLedger.coreReportedBytes);
    bigint(value.worldLedger.classifiedBytes);
    assert.equal(value.worldLedger.sumMatchesCore, true);
    assert.equal(
        value.worldLedger.coreReportedBytes,
        BigInt(snapshot.native.liveBytes),
        'Same safe-point original byte ledger',
    );
    assert.equal(value.worldLedger.rows.length, layout.length);
    let sum = 0n;
    for (let i = 0; i < layout.length; i++) {
        const row = value.worldLedger.rows[i],
            expected = layout[i];
        for (const key of ['id', 'name', 'countUnit', 'capacityUnit', 'capacityMeaning'])
            assert.equal(row[key], expected[key], 'Exact reviewed row ' + key);
        assert.equal(typeof row.countMeaning, 'string');
        if (expected.countUnit === 'unavailable') assert.equal(row.count, null, 'Unknown count is not zero');
        else bigint(row.count);
        bigint(row.capacity);
        bigint(row.bytes);
        sum += row.bytes;
    }
    assert.equal(sum, value.worldLedger.classifiedBytes);
    assert.equal(sum, value.worldLedger.coreReportedBytes);
    for (const key of ['bodies', 'shapes', 'contacts', 'joints']) {
        integer(value.liveCounts[key]);
        assert.equal(value.liveCounts[key], snapshot.native[key], 'Same safe-point original live count ' + key);
    }
    integer(value.liveCounts.islands);
    bigint(value.moduleCoreTrackedRequestedBytes);
    for (const key of bridgeKeys) {
        const check = key === 'trackedBytes' ? bigint : integer;
        check(value.nativeWorldBridge[key]);
        check(value.nativeGlobalBridge[key]);
        assert(value.nativeGlobalBridge[key] >= value.nativeWorldBridge[key]);
    }
    bigint(value.mesh.moduleSuccessfulCooks);
    bigint(value.mesh.moduleDestroys);
    assert(value.mesh.moduleDestroys <= value.mesh.moduleSuccessfulCooks);
    assert.deepEqual(copiedJSON(value.mesh.liveResourceSnapshots), copiedJSON(snapshot.resources));
    bigint(value.excludedObservations.workerArenaBackingCapacityBytes);
    integer(value.excludedObservations.workerArenaPeakDemand);
    assert.equal(typeof value.excludedObservations.meaning, 'string');
    for (const key of ['staticShapeCount', 'dynamicShapeCount', 'staticBodyCount', 'dynamicBodyCount', 'contactCount'])
        integer(value.maxWorkload[key]);
    assert.equal(typeof value.maxWorkload.meaning, 'string');
    assert(value.unavailable.includes('after-app-close module observation'));
    assert(value.unavailable.includes('all-native-handle census'));
    assert(value.unavailable.includes('global-world census'));
    assert(value.excludedFromWorldLedger.includes('worker arena backing/shared/overflow allocations'));
    assert(value.excludedFromWorldLedger.includes('WASM memory capacity/JS heap/RSS'));
    assert.equal(value.observer.facadeScratchBytes, 4096);
    assert.equal(value.observer.queryNativeAllocationPolicy, 'none-by-source-design');
    return value.identity;
}

function safeError(error) {
    try {
        return {
            name: String(error?.name ?? 'Error'),
            code: error?.code == null ? null : String(error.code),
            message: String(error?.stack ?? error),
        };
    } catch {
        return { name: 'UnprintableObserverError', code: null, message: 'Observer error could not be stringified' };
    }
}

export function createMemoryObserver({ world, getWorld, primaryRecord, appendDiagnostic, layout, publicStep }) {
    assert(
        world &&
            typeof getWorld === 'function' &&
            typeof primaryRecord === 'function' &&
            typeof appendDiagnostic === 'function',
    );
    assert(Array.isArray(layout) && layout.length === 87);
    const attempts = [],
        errors = [];
    let baselineSeen = false,
        previousIdentity,
        sealed = false;
    const cycles = new Map();
    function observe(kind, value) {
        const row = {
            sequence: attempts.length + 1,
            kind,
            cycle: kind === SAFE_RECORDS[0] ? null : value.cycle,
            status: 'RUNNING',
        };
        attempts.push(row);
        try {
            assert(!sealed, 'Observer already sealed; no after-close getter allowed');
            assert.equal(getWorld(), world, 'Backend object replacement is not allowed');
            assert.equal(typeof world.getNativeMemoryDiagnostics, 'function', 'New production getter unavailable');
            row.publicStep = publicStep();
            integer(row.publicStep);
            let snapshot;
            if (kind === SAFE_RECORDS[0]) {
                assert(!baselineSeen && attempts.length === 1, 'Exactly one original baseline observation');
                baselineSeen = true;
                assert.equal(row.publicStep, 0);
                snapshot = value;
            } else {
                integer(row.cycle);
                assert(row.cycle > 0 && baselineSeen, 'Scene observation requires original baseline');
                const seen = cycles.get(row.cycle) ?? [];
                if (kind === SAFE_RECORDS[1]) assert.equal(seen.length, 0, 'One nonempty snapshot per cycle');
                else assert.deepEqual(seen, [SAFE_RECORDS[1]], 'Release observation must follow its nonempty scene');
                seen.push(kind);
                cycles.set(row.cycle, seen);
                snapshot = kind === SAFE_RECORDS[1] ? value.active : value.afterRelease;
            }
            const diagnostic = world.getNativeMemoryDiagnostics();
            // Keep even a malformed copied return as evidence before validation when serializable.
            row.observation = copiedJSON(diagnostic);
            row.originalSnapshot = copiedJSON(snapshot);
            const identity = validateObservation(diagnostic, snapshot, layout, previousIdentity);
            if (kind === SAFE_RECORDS[0]) assert.equal(identity.nativeStepIndex, 0n);
            previousIdentity = { ...identity };
            row.status = 'OBSERVED_VALIDATED';
        } catch (error) {
            row.status = 'OBSERVER_FAILURE';
            row.error = safeError(error);
            errors.push({ sequence: row.sequence, stage: 'observe', ...row.error });
        }
        try {
            appendDiagnostic(copiedJSON(row));
        } catch (error) {
            row.journalError = safeError(error);
            errors.push({ sequence: row.sequence, stage: 'diagnostic-journal-write', ...row.journalError });
        }
    }
    return Object.freeze({
        record(kind, value) {
            // Preserve the primary journal's original behavior and exception. Never observe an unsafe record.
            primaryRecord(kind, value);
            if (SAFE_RECORDS.includes(kind)) observe(kind, value);
        },
        seal() {
            sealed = true;
        },
        summary() {
            const completeCycles = [...cycles].filter(([, kinds]) => kinds.length === 2).map(([cycle]) => cycle);
            const fullSets = baselineSeen && completeCycles.length > 0 && completeCycles.length === cycles.size;
            return copiedJSON({
                profile: PROFILE,
                status: errors.length
                    ? 'DIAGNOSTIC_FAILURE'
                    : fullSets
                      ? 'COMPLETE_REACHED_SCENE_SNAPSHOT_SETS'
                      : 'PARTIAL',
                attemptedSnapshots: attempts.length,
                validatedSnapshots: attempts.filter((row) => row.status === 'OBSERVED_VALIDATED').length,
                completeSceneSnapshotSets: completeCycles,
                errors,
                observations: attempts,
                afterAppClose: BOUNDARIES.afterAppClose,
                strictAcceptance: 'SEPARATE_UNMODIFIED_APP_V2_RESULT; never inferred from this status',
                historicalAttribution: BOUNDARIES.historicalRuns,
                bigintEncoding: 'Base-10 strings, never rounded JavaScript numbers',
                sealed,
            });
        },
    });
}

// Used by the thin consumer adapter. An original fixture Error always propagates unchanged.
export async function preserveFixtureOutcome(invokeOriginal, observer, report) {
    try {
        return await invokeOriginal(observer.record);
    } finally {
        observer.seal();
        report.memoryDiagnostics = observer.summary();
    }
}
