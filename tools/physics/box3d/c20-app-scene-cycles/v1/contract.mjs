/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import assert from 'node:assert/strict';
export const PROFILE = 'c20-app-same-app-scene-cycles-v1';
export const PASS = 'PASS_LIMITED_C20APP_OBSERVABLE_SUBSET';
export const HOST_SHA256 = '10205d33d67ca3002eb5860aef9047688873423d910964eebf5269b0ef5d367b';
export const CONFIG = Object.freeze({
    cycles: 100,
    bodies: 50,
    shapes: 50,
    joints: 1,
    terrainUsers: 3,
    dt: 1 / 60,
    maxEnterSteps: 12,
    staySteps: 2,
    maxExitSteps: 60,
    maxStepsPerCycle: 74,
    consumerTimeoutMs: 300000,
    stepTimeoutMs: 2000,
});
export const QUALIFICATION = Object.freeze({
    C20: 'NOT_QUALIFIED',
    C20LOWLEVEL: 'NOT_RUN',
    I05: 'NOT_QUALIFIED',
    I06: 'NOT_QUALIFIED',
    globalLiveWorlds: 'NOT_QUALIFIED_NO_EXPOSED_APP_NATIVE_COUNTER',
    globalLiveHandles: 'NOT_QUALIFIED_NO_EXPOSED_APP_NATIVE_COUNTER',
    postCloseNativeBytes: 'NOT_QUALIFIED_NO_EXPOSED_APP_NATIVE_COUNTER',
    resourceLeakFreedom: 'NOT_QUALIFIED_UNTRACKED_NATIVE_RESOURCES_NOT_ENUMERABLE',
    nativeCounts: 'BACKEND_DIAGNOSTIC_NOT_STABLE_IPHYSICSWORLD_API',
    host: 'NODE_HEADLESS_JSDOM_TRANSPORT_ONLY_UNMODIFIED_MODULE_FACTORY',
    fullGates: 'NOT_RUN',
    browser: 'NOT_RUN',
});
export function validateSnapshot(value) {
    assert(value && typeof value === 'object');
    assert.deepEqual(Object.keys(value.native).sort(), ['bodies', 'shapes', 'contacts', 'joints', 'liveBytes'].sort());
    for (const key of ['bodies', 'shapes', 'contacts', 'joints'])
        assert(Number.isSafeInteger(value.native[key]) && value.native[key] >= 0, 'Native integer ' + key);
    assert(/^(0|[1-9][0-9]*)$/.test(value.native.liveBytes), 'Decimal native bigint, never rounded Number');
    assert(Array.isArray(value.resources));
    for (const row of value.resources) {
        for (const key of [
            'cacheLeases',
            'shapeBorrows',
            'vertexCount',
            'triangleCount',
            'coreMeshBytes',
            'worldId',
            'users',
        ])
            assert(Number.isSafeInteger(row[key]) && row[key] >= 0, 'Resource diagnostic ' + key);
        assert.equal(typeof row.bucketHash, 'string');
    }
}
export function validateBaseline(value) {
    validateSnapshot(value);
    for (const key of ['bodies', 'shapes', 'contacts', 'joints']) assert.equal(value.native[key], 0);
    assert.deepEqual(value.resources, []);
}
export function validateRelease(receipt) {
    assert.equal(receipt.status, 'released');
    assert.deepEqual(receipt.pending, []);
    assert.deepEqual(receipt.failures, []);
}
export function validateActive(value, baseline) {
    validateSnapshot(value);
    for (const key of ['bodies', 'shapes', 'joints'])
        assert.equal(value.native[key], CONFIG[key], 'Exact created ' + key);
    assert(BigInt(value.native.liveBytes) >= BigInt(baseline.native.liveBytes));
    assert.equal(value.resources.length, 1, 'One actual shared cooked heightfield resource per scene');
    const resource = value.resources[0];
    assert.equal(resource.cacheLeases, 1);
    assert.equal(resource.shapeBorrows, CONFIG.terrainUsers);
    assert.equal(resource.users, CONFIG.terrainUsers, 'JS ownership is auxiliary, not the native proof');
    assert.equal(resource.vertexCount, 9);
    assert.equal(resource.triangleCount, 8);
    assert(resource.coreMeshBytes > 0);
}
export function validateEvents(events, cycle, sceneUUID, startStep, endStep) {
    assert(
        Array.isArray(events) && events.length >= 8,
        'Real enter/stay/exit callbacks on both primitive participants',
    );
    for (const event of events) {
        assert.equal(event.cycle, cycle);
        assert.equal(event.sceneUUID, sceneUUID);
        assert.equal(event.currentToken, true);
        assert.equal(event.currentScene, true);
        assert(Number.isSafeInteger(event.scopeGeneration) && event.scopeGeneration > 0);
        assert(Number.isSafeInteger(event.step) && event.step > startStep && event.step <= endStep);
        assert(['sensor', 'visitor'].includes(event.self));
        assert.equal(event.other, event.self === 'sensor' ? 'visitor' : 'sensor');
        assert(['onTriggerEnter', 'onTriggerStay', 'onTriggerExit'].includes(event.type));
        assert.equal(event.impl.backend, 'box3d');
        assert.equal(event.impl.snapshotSemantics, 'COPIED_NATIVE_SENSOR_MEMBERSHIP');
        assert(Number.isSafeInteger(event.impl.stepIndex) && event.impl.stepIndex > 0);
        assert(typeof event.impl.logicalPair === 'string');
        assert(Array.isArray(event.impl.nativePairs) && event.impl.nativePairs.length === 1);
        for (const pair of event.impl.nativePairs) {
            assert(/^[0-9]+:[0-9]+$/.test(pair.sensor));
            assert(/^[0-9]+:[0-9]+$/.test(pair.visitor));
        }
        assert.equal(event.impl.logicalPair, events[0].impl.logicalPair);
        assert.deepEqual(event.impl.nativePairs, events[0].impl.nativePairs);
    }
    for (const self of ['sensor', 'visitor']) {
        const rows = events.filter((event) => event.self === self);
        assert.equal(rows.filter((event) => event.type === 'onTriggerEnter').length, 1);
        assert.equal(rows.filter((event) => event.type === 'onTriggerExit').length, 1);
        assert(rows.filter((event) => event.type === 'onTriggerStay').length >= CONFIG.staySteps);
        assert.equal(rows[0].type, 'onTriggerEnter');
        assert.equal(rows.at(-1).type, 'onTriggerExit');
    }
}
export function validateCycle(row, baseline, previousEndStep) {
    assert.equal(row.status, 'COMPLETE');
    assert.equal(row.startStep, previousEndStep);
    assert(row.endStep > row.startStep && row.endStep - row.startStep <= CONFIG.maxStepsPerCycle);
    assert.equal(row.sceneRunCalls, 1);
    assert.equal(row.releaseSceneCalls, 1);
    assert.equal(row.createdBodies, CONFIG.bodies);
    assert.equal(row.createdShapes, CONFIG.shapes);
    assert.equal(row.createdJoints, CONFIG.joints);
    assert.equal(row.createdTerrainUsers, CONFIG.terrainUsers);
    assert.equal(row.joint.kind, 'fixed');
    assert.equal(row.joint.state, 'connected');
    assert.equal(row.joint.nativeKind, 'fixed');
    validateActive(row.active, baseline);
    validateEvents(row.events, row.cycle, row.sceneUUID, row.startStep, row.endStep);
    assert(row.events.every((event) => event.scopeGeneration === row.scopeGeneration));
    validateRelease(row.release);
    assert.equal(row.release.scene, row.sceneUUID);
    assert.equal(row.sceneInvalid, true);
    assert.equal(row.currentSceneNull, true);
    assert.equal(row.oldTokenCurrent, false);
    assert.equal(row.allPreviousTokensStale, true);
    assert.equal(row.previousCallbacksUnchanged, true);
    assert.equal(row.eventCopiesUnchanged, true);
    assert.equal(row.materialInvalid, true);
    assert.equal(row.sessionCleanupCalls, 1);
    assert.equal(row.stepsDuringRelease, 0);
    assert.equal(row.sameApp, true);
    assert.equal(row.sameWorldDiagnosticObject, true);
    assert.equal(row.sameClock, true);
    validateSnapshot(row.afterRelease);
    assert.deepEqual(
        row.afterRelease,
        baseline,
        'Every cycle must return to ORIGINAL pre-scene baseline; no warmup/reset/averaging',
    );
}
export function validateResult(report) {
    assert.equal(report.status, PASS);
    assert.equal(report.profile, PROFILE);
    assert.deepEqual(report.configuration, CONFIG);
    assert.deepEqual(report.qualification, QUALIFICATION);
    assert.equal(report.hostSha256, HOST_SHA256);
    assert.equal(report.moduleFactoryReplaced, false);
    assert.equal(report.appCreateCalls, 1);
    assert.equal(report.appCloseCalls, 1);
    assert.equal(report.clockCreateCalls, 1);
    assert.equal(report.clockBeginCalls, 1);
    assert.equal(report.clockEndCalls, 0);
    assert.equal(report.inputsUnchanged, true);
    assert.equal(report.hostClosed, true);
    assert.deepEqual(report.hostErrors, []);
    validateBaseline(report.baseline);
    assert.equal(report.cycles.length, CONFIG.cycles, 'Exact 100 real scene lifecycles');
    const uuids = new Set(),
        nativePairs = new Set(),
        logicalPairs = new Set();
    let previousEndStep = 0,
        lastNativeStep = 0;
    for (const [i, row] of report.cycles.entries()) {
        assert.equal(row.cycle, i + 1);
        assert(typeof row.sceneUUID === 'string' && row.sceneUUID && !uuids.has(row.sceneUUID));
        uuids.add(row.sceneUUID);
        validateCycle(row, report.baseline, previousEndStep);
        const nativePair = JSON.stringify(row.events[0].impl.nativePairs);
        assert(
            !nativePairs.has(nativePair),
            'A released native full-generation pair cannot become the next scene pair',
        );
        nativePairs.add(nativePair);
        assert(!logicalPairs.has(row.events[0].impl.logicalPair), 'Old logical event pair reused across scenes');
        logicalPairs.add(row.events[0].impl.logicalPair);
        assert(row.events[0].impl.stepIndex > lastNativeStep, 'Stale native event generation/step');
        for (const event of row.events) {
            assert(event.impl.stepIndex >= lastNativeStep, 'Native callback steps may not go backwards');
            lastNativeStep = event.impl.stepIndex;
        }
        previousEndStep = row.endStep;
    }
    assert.equal(report.frames.length, previousEndStep);
    report.frames.forEach((frame, i) => assert.deepEqual(frame, { step: i + 1, dt: CONFIG.dt, afterDraw: true }));
    assert.equal(report.totalSteps, previousEndStep);
    validateRelease(report.close);
    assert.equal(report.close.physicsPreparation.status, 'closed');
    assert.deepEqual(report.close.physicsPreparation.cleanupErrors, []);
    assert(report.close.physicsPreparation.acquired.length > 0);
    assert(
        report.close.physicsPreparation.acquired.every(
            (entry) => entry.backend === 'box3d' && entry.cleanup === 'released' && entry.retained.length === 0,
        ),
    );
    assert.equal(report.finalEventCopiesUnchanged, true);
    assert.equal(report.finalTokensStale, true);
    assert.equal(report.completedCycles, CONFIG.cycles);
    assert(report.completedAt);
}
