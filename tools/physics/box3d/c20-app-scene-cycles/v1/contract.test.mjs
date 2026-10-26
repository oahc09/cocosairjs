/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Synthetic CPU-only validator controls. Never import a real SDK or instantiate native WASM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
    PROFILE,
    CONFIG,
    QUALIFICATION,
    PASS,
    HOST_SHA256,
    validateResult,
    validateCycle,
    validateSnapshot,
} from './contract.mjs';
import { here, sha, validateRecords, validateIdentity, SCHEMA, FIXTURE_FILES } from './inputs.mjs';
import { snapshotWorld, runSceneCycles } from './fixture.mjs';
const baseline = () => ({
    native: { bodies: 0, shapes: 0, contacts: 0, joints: 0, liveBytes: '12345' },
    resources: [],
});
function cycleRow(cycle) {
    const startStep = (cycle - 1) * 4,
        sceneUUID = 'cpu-scene-' + cycle;
    const events = ['onTriggerEnter', 'onTriggerStay', 'onTriggerStay', 'onTriggerExit'].flatMap((type, i) =>
        ['sensor', 'visitor'].map((self) => ({
            cycle,
            sceneUUID,
            scopeGeneration: 1,
            currentToken: true,
            currentScene: true,
            step: startStep + i + 1,
            type,
            self,
            other: self === 'sensor' ? 'visitor' : 'sensor',
            impl: {
                backend: 'box3d',
                stepIndex: startStep + i + 1,
                logicalPair: cycle + ':pair',
                nativePairs: [{ sensor: cycle + ':1', visitor: cycle + ':2' }],
                snapshotSemantics: 'COPIED_NATIVE_SENSOR_MEMBERSHIP',
            },
        })),
    );
    return {
        cycle,
        status: 'COMPLETE',
        sceneUUID,
        scopeGeneration: 1,
        startStep,
        endStep: startStep + 4,
        sceneRunCalls: 1,
        releaseSceneCalls: 1,
        createdBodies: 50,
        createdShapes: 50,
        createdJoints: 1,
        createdTerrainUsers: 3,
        joint: { kind: 'fixed', state: 'connected', nativeKind: 'fixed' },
        active: {
            native: { bodies: 50, shapes: 50, contacts: 1, joints: 1, liveBytes: '45678' },
            resources: [
                {
                    cacheLeases: 1,
                    shapeBorrows: 3,
                    vertexCount: 9,
                    triangleCount: 8,
                    coreMeshBytes: 500,
                    worldId: 1,
                    users: 3,
                    bucketHash: 'cpu-only',
                },
            ],
        },
        events,
        release: { status: 'released', pending: [], failures: [], scene: sceneUUID },
        sceneInvalid: true,
        currentSceneNull: true,
        oldTokenCurrent: false,
        allPreviousTokensStale: true,
        previousCallbacksUnchanged: true,
        eventCopiesUnchanged: true,
        materialInvalid: true,
        sessionCleanupCalls: 1,
        stepsDuringRelease: 0,
        sameApp: true,
        sameWorldDiagnosticObject: true,
        sameClock: true,
        afterRelease: baseline(),
    };
}
function result() {
    return {
        status: PASS,
        profile: PROFILE,
        configuration: { ...CONFIG },
        qualification: { ...QUALIFICATION },
        hostSha256: HOST_SHA256,
        moduleFactoryReplaced: false,
        appCreateCalls: 1,
        appCloseCalls: 1,
        clockCreateCalls: 1,
        clockBeginCalls: 1,
        clockEndCalls: 0,
        inputsUnchanged: true,
        hostClosed: true,
        hostErrors: [],
        baseline: baseline(),
        cycles: Array.from({ length: 100 }, (_, i) => cycleRow(i + 1)),
        frames: Array.from({ length: 400 }, (_, i) => ({ step: i + 1, dt: 1 / 60, afterDraw: true })),
        totalSteps: 400,
        close: {
            status: 'released',
            pending: [],
            failures: [],
            physicsPreparation: {
                status: 'closed',
                cleanupErrors: [],
                acquired: [{ backend: 'box3d', cleanup: 'released', retained: [] }],
            },
        },
        finalEventCopiesUnchanged: true,
        finalTokensStale: true,
        completedCycles: 100,
        completedAt: 'CPU_ONLY',
    };
}
test('CPU-only complete synthetic 100-cycle metadata is structurally valid, not runtime evidence', () =>
    validateResult(result()));
const negatives = [
    ['99 cycles', (r) => r.cycles.pop()],
    [
        'empty 100 scenes',
        (r) => {
            r.cycles[0].createdBodies = 0;
            r.cycles[0].active.native.bodies = 0;
        },
    ],
    ['49 real bodies', (r) => (r.cycles[10].active.native.bodies = 49)],
    ['missing native joint', (r) => (r.cycles[10].active.native.joints = 0)],
    ['unconnected joint', (r) => (r.cycles[10].joint.state = 'pending')],
    ['no callbacks', (r) => (r.cycles[1].events = [])],
    ['missing exit', (r) => (r.cycles[1].events = r.cycles[1].events.filter((e) => e.type !== 'onTriggerExit'))],
    ['no native resource proof', (r) => (r.cycles[0].active.resources = [])],
    ['JS users cannot replace native borrow proof', (r) => (r.cycles[0].active.resources[0].shapeBorrows = 0)],
    ['residual native resource', (r) => (r.cycles[20].afterRelease.resources = r.cycles[20].active.resources)],
    ['residual body', (r) => (r.cycles[20].afterRelease.native.bodies = 1)],
    ['retained bytes cannot silently warm up', (r) => (r.cycles[0].afterRelease.native.liveBytes = '12346')],
    ['later baseline drift not averaged away', (r) => (r.cycles[98].afterRelease.native.liveBytes = '12346')],
    ['recreating app', (r) => (r.appCreateCalls = 100)],
    ['repeated app close', (r) => (r.appCloseCalls = 100)],
    ['new clocks per scene', (r) => (r.clockCreateCalls = 100)],
    ['clock lease released between scenes', (r) => (r.clockEndCalls = 1)],
    ['wrong dt', (r) => (r.frames[100].dt = 1 / 30)],
    ['missing AFTER_DRAW', (r) => (r.frames[100].afterDraw = false)],
    ['step while released', (r) => (r.cycles[5].stepsDuringRelease = 1)],
    ['same scene reused', (r) => (r.cycles[1].sceneUUID = r.cycles[0].sceneUUID)],
    ['old callback generation', (r) => (r.cycles[2].events[0].cycle = 2)],
    [
        'old native pair generation',
        (r) => {
            for (const e of r.cycles[2].events) e.impl.nativePairs = r.cycles[1].events[0].impl.nativePairs;
        },
    ],
    [
        'old logical pair',
        (r) => {
            for (const e of r.cycles[2].events) e.impl.logicalPair = r.cycles[1].events[0].impl.logicalPair;
        },
    ],
    ['old native snapshot', (r) => (r.cycles[2].events[0].impl.stepIndex = 1)],
    ['stale current token', (r) => (r.cycles[2].events[0].currentToken = false)],
    ['retired token still live', (r) => (r.cycles[2].oldTokenCurrent = true)],
    ['old callback count changed', (r) => (r.cycles[2].previousCallbacksUnchanged = false)],
    ['failed scene release', (r) => (r.cycles[2].release.status = 'failed')],
    ['pending scene release', (r) => r.cycles[2].release.pending.push('native-scene')],
    ['failed app close', (r) => (r.close.status = 'failed')],
    ['dirty backend close', (r) => r.close.physicsPreparation.cleanupErrors.push({ message: 'cleanup failed' })],
    ['changed inputs', (r) => (r.inputsUnchanged = false)],
    ['instrumented host identity', (r) => (r.hostSha256 = '0'.repeat(64))],
    ['replaced factory', (r) => (r.moduleFactoryReplaced = true)],
    ['inflated full C20', (r) => (r.qualification.C20 = 'PASS')],
    ['missing global handle boundary', (r) => delete r.qualification.globalLiveHandles],
];
for (const [label, alter] of negatives)
    test('CPU rejects ' + label, () => {
        const report = result();
        alter(report);
        assert.throws(() => validateResult(report));
    });
test('CPU first bad baseline cannot be rescued by 99 later clean rows', () => {
    const first = cycleRow(1);
    first.afterRelease.native.liveBytes = '12346';
    assert.throws(() => validateCycle(first, baseline(), 0), /ORIGINAL/);
});
test('CPU fake snapshot adapter preserves exact native bigint and does not infer total handles', () => {
    let calls = 0;
    const world = {
        getNativeCounts() {
            calls++;
            return Object.freeze({ bodies: 2, shapes: 2, contacts: 1, joints: 0, liveBytes: 9007199254740995n });
        },
        getStaticMeshResourceDiagnostics() {
            calls++;
            return Object.freeze([]);
        },
    };
    const read = snapshotWorld(world);
    assert.equal(calls, 2);
    assert.equal(read.native.liveBytes, '9007199254740995');
    validateSnapshot(read);
    assert(!('handles' in read.native));
});
test('CPU rejects duplicate/incomplete/path-traversing lock records', () => {
    const entry = { path: 'host.mjs', bytes: 1, sha256: '0'.repeat(64) };
    assert.throws(() => validateRecords([entry, entry]));
    assert.throws(() => validateRecords([entry], FIXTURE_FILES));
    assert.throws(() => validateRecords([{ ...entry, path: '../host.mjs' }]));
});
test('CPU rejects stale native schema before any runtime import', () => {
    assert.throws(() => validateIdentity({}, {}, Buffer.from('CPU-not-schema')));
    assert.equal(SCHEMA.length, 64);
});
test('CPU source gates preserve exact uninstrumented host and production lifecycle', () => {
    const host = readFileSync(join(here, 'host.mjs'));
    assert.equal(sha(host), HOST_SHA256);
    const fixture = readFileSync(join(here, 'fixture.mjs'), 'utf8');
    const consumer = readFileSync(join(here, 'consumer.mjs'), 'utf8');
    const runner = readFileSync(join(here, 'run.mjs'), 'utf8');
    assert.equal((consumer.match(/await sdk\.createAirApp\(/g) ?? []).length, 1);
    assert.equal((consumer.match(/await app\.close\(/g) ?? []).length, 1);
    assert(fixture.includes('await app.releaseScene()'));
    assert(fixture.includes('sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 2000 })'));
    assert(fixture.includes('await clock.step(CONFIG.dt)'));
    assert(!/director\.(tick|_releaseSceneImmediate)|physicsWorld\.step\(|system\.step\(|clock\.end\(/.test(fixture));
    assert(!/WebAssembly\.instantiate|moduleFactory\s*=|registerPhysics|createStepClock\s*=/.test(host.toString()));
    assert(consumer.includes("openSync(join(out, 'observations.raw.jsonl'), 'wx')"));
    assert(consumer.includes("record('failure'"));
    assert(consumer.includes("partial.status = 'FAIL'"));
    assert(runner.includes('CONFIG.consumerTimeoutMs'));
    assert(runner.includes("killSignal: 'SIGKILL'"));
});

test('CPU actual fixture retains the first bad baseline observation before rejecting; no scenes or clocks run', async () => {
    const observations = [];
    const world = {
        getNativeCounts: () => Object.freeze({ bodies: 1, shapes: 0, contacts: 0, joints: 0, liveBytes: 12n }),
        getStaticMeshResourceDiagnostics: () => Object.freeze([]),
    };
    const report = {};
    const sdk = { PhysicsSystem: { instance: { physicsWorld: world } } };
    await assert.rejects(() =>
        runSceneCycles({ sdk, app: {}, report, record: (kind, value) => observations.push({ kind, value }) }),
    );
    assert.equal(observations.length, 1);
    assert.equal(observations[0].kind, 'original-pre-scene-baseline');
    assert.equal(observations[0].value.native.bodies, 1);
    assert.equal(report.baseline.native.liveBytes, '12');
});
