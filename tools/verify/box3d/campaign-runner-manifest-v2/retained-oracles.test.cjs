/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */

// Original pure oracle test bodies copied verbatim. Synthetic inputs only; no consumer/runtime dispatch.

const test = require('node:test');

const assert = require('node:assert/strict');

const fs = require('node:fs');

const os = require('node:os');

const path = require('node:path');

const runner = require('./runner.cjs');

const temp = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'box3d-campaign-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
};

const write = (file, value) => fs.writeFileSync(file, JSON.stringify(value));

const receipt = { exitCode: 0, signal: null, spawnError: null, inputError: null };

const snapshot = { caseId: 'resource-budget-contract' };

const tap = '# tests 4\n# pass 4\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n';

test('nonzero, timeout/signal, stale and missing/partial test protocol are not pass', () => {
    assert.equal(runner.classify(snapshot, { ...receipt, exitCode: 1 }, tap), 'FAIL_TEST');
    assert.equal(runner.classify(snapshot, { ...receipt, signal: 'SIGKILL' }, tap), 'FAIL_INFRA');
    assert.equal(runner.classify(snapshot, { ...receipt, spawnError: 'ETIMEDOUT' }, tap), 'FAIL_INFRA');
    assert.equal(runner.classify(snapshot, { ...receipt, inputError: 'changed' }, tap), 'STALE_INPUT');
    assert.equal(runner.classify(snapshot, receipt, 'PASS'), 'INVALID_RESULT');
    assert.equal(runner.classify(snapshot, receipt, tap.replace('# skipped 0', '# skipped 1')), 'INVALID_RESULT');
});

const raw = (mode = 'healthy') => ({
    schema: 'box3d-production-esm-public-fixed-consumer-v1',
    mode,
    completedAt: new Date().toISOString(),
    inputsUnchanged: true,
    status: mode === 'healthy' ? 'PASS_LIMITED_PUBLIC_FIXED' : 'PASS_EXPECTED_PUBLIC_FIXED_FAULT',
    healthyComplete: true,
    checks: Array.from({ length: 15 }, (_, i) => ({
        name: i === 0 ? 'Isolated deliberate fault preserves original thrown callback identity' : 'check' + i,
        pass: true,
    })),
    hostErrors: [],
    close: { physicsPreparation: { status: 'closed', cleanupErrors: [] } },
    drift: Array.from({ length: 600 }, () => ({
        pairError: { linear: 0, angular: 0 },
        anchorError: { linear: 0, angular: 0 },
        pairNative: [0, 0],
        anchorNative: [0, 0],
    })),
});

test('expected fault observation is distinct from positive pass; wrong mode/status rejected', () => {
    const fault = raw('intentional-fault');
    assert.equal(runner.classify({ caseId: 'fixed-expected-fault' }, receipt, '', fault), 'EXPECTED_FAULT_OBSERVED');
    assert.equal(runner.classify({ caseId: 'fixed-healthy' }, receipt, '', fault), 'INVALID_RESULT');
    fault.status = 'PASS_LIMITED_PUBLIC_FIXED';
    assert.equal(runner.classify({ caseId: 'fixed-expected-fault' }, receipt, '', fault), 'INVALID_RESULT');
});

test('independent numeric import rejects claimed PASS with excessive drift or missing samples', () => {
    const value = raw(),
        selected = { caseId: 'fixed-healthy' };
    assert.equal(runner.classify(selected, receipt, '', value), 'PASS_LIMITED');
    value.drift[5].pairError.linear = 0.5;
    assert.equal(runner.classify(selected, receipt, '', value), 'FAIL_PRODUCT');
    value.drift.pop();
    assert.equal(runner.classify(selected, receipt, '', value), 'INVALID_RESULT');
});

test('product assertions, host failure, and unclassified process errors stay separate', () => {
    const value = raw(),
        selected = { caseId: 'fixed-healthy' };
    assert.equal(runner.classify(selected, { ...receipt, exitCode: 1 }, '', value), 'FAIL_UNCLASSIFIED');
    value.checks[0].pass = false;
    assert.equal(runner.classify(selected, { ...receipt, exitCode: 1 }, '', value), 'FAIL_PRODUCT');
    value.hostErrors.push('host unavailable');
    assert.equal(runner.classify(selected, receipt, '', value), 'FAIL_INFRA');
});

test('idle reentry faults require their own exact assertion, not the ordinary callback assertion', () => {
    const value = raw('idle-enabled-reentry');
    assert.equal(runner.classify({ caseId: 'fixed-idle-reentry-fault' }, receipt, '', value), 'INVALID_RESULT');
    value.checks[0].name = 'Caught recursive enabled request poisons the exact original idle activity operation';
    assert.equal(
        runner.classify({ caseId: 'fixed-idle-reentry-fault' }, receipt, '', value),
        'EXPECTED_FAULT_OBSERVED',
    );
});

test('dependency closure binds real transitive package files, not only package names', (t) => {
    const dir = temp(t);
    for (const [name, manifest] of [
        ['jsdom', { name: 'jsdom', dependencies: { child: '1.0.0' } }],
        ['child', { name: 'child' }],
        ['unrelated', { name: 'unrelated' }],
    ]) {
        const folder = path.join(dir, 'node_modules', name);
        fs.mkdirSync(folder, { recursive: true });
        write(path.join(folder, 'package.json'), manifest);
        fs.writeFileSync(path.join(folder, 'actual-code.js'), '// immutable bytes\n');
    }
    const files = require('./capture.cjs').dependencyFiles(dir);
    assert.equal(files.length, 4);
    assert(files.some((file) => file.endsWith('/child/actual-code.js')));
    assert(!files.some((file) => file.includes('/unrelated/')));
});

test('cohort import requires the raw result to bind the same frozen product identity', () => {
    const cohortIdentity = { runtimeBuildNumber: 217, producerCommit: 'a'.repeat(40), productSha256: 'b'.repeat(64) };
    const selected = { caseId: 'cohort-fixed-healthy', cohortIdentity };
    const value = raw();
    assert.equal(runner.classify(selected, receipt, '', value), 'INVALID_RESULT');
    value.cohortIdentity = cohortIdentity;
    assert.equal(runner.classify(selected, receipt, '', value), 'PASS_LIMITED');
    value.cohortIdentity = { ...cohortIdentity, runtimeBuildNumber: 215 };
    assert.equal(runner.classify(selected, receipt, '', value), 'INVALID_RESULT');
});

test('P2P independent numeric oracle and expected fault identity are not replaced by status labels', () => {
    const cohortIdentity = { runtimeBuildNumber: 217 };
    const value = {
        ...raw(),
        schema: 'box3d-production-esm-public-point-to-point-consumer-v1',
        cohortIdentity,
        status: 'PASS_LIMITED_PUBLIC_POINT_TO_POINT',
        drift: Array.from({ length: 1200 }, () => ({ independentSeparation: 0.001, nativeSeparation: 0.001 })),
    };
    const selected = { caseId: 'cohort-p2p-healthy', cohortIdentity };
    assert.equal(runner.classify(selected, receipt, '', value), 'PASS_LIMITED');
    value.drift[99].independentSeparation = 0.1;
    assert.equal(runner.classify(selected, receipt, '', value), 'FAIL_PRODUCT');
    value.mode = 'intentional-fault';
    value.status = 'PASS_EXPECTED_PUBLIC_POINT_TO_POINT_FAULT';
    const fault = { caseId: 'cohort-p2p-intentional-fault', cohortIdentity };
    assert.equal(runner.classify(fault, receipt, '', value), 'INVALID_RESULT');
    value.checks[0].name = 'Real collision callback preserves the deliberate exact Error identity';
    assert.equal(runner.classify(fault, receipt, '', value), 'EXPECTED_FAULT_OBSERVED');
});

test('contact importer independently checks rest height, complete numeric getters and normal orientation', () => {
    const cohortIdentity = { runtimeBuildNumber: 217 };
    const contact = { isBodyA: true };
    for (const key of ['getLocalPointOnA', 'getLocalPointOnB', 'getWorldPointOnA', 'getWorldPointOnB'])
        contact[key] = [0, 0, 0];
    for (const key of ['getLocalNormalOnA', 'getLocalNormalOnB', 'getWorldNormalOnA', 'getWorldNormalOnB'])
        contact[key] = [0, 1, 0];
    const value = {
        ...raw(),
        schema: 'box3d-production-esm-public-collision-consumer-v1',
        status: 'PASS_LIMITED_PRODUCTION_ESM_COLLISION',
        cohortIdentity,
        contactFamily: 'capsule-box',
        checks: Array.from({ length: 22 }, (_, i) => ({
            name: i === 0 ? 'Actual family item rests on peer' : 'check' + i,
            pass: true,
            detail: [0, 0.8, 0],
        })),
        close: { status: 'released', physicsPreparation: { status: 'closed' } },
        events: ['static-support', 'falling-item'].flatMap((self) =>
            ['onCollisionEnter', 'onCollisionStay', 'onCollisionExit', 'onCollisionEnter'].map((type) => ({
                self,
                type,
                contacts: [contact],
            })),
        ),
    };
    const selected = { caseId: 'cohort-contact-capsule-box', cohortIdentity };
    assert.equal(runner.classify(selected, receipt, '', value), 'PASS_LIMITED');
    value.checks[0].detail[1] = 1.2;
    assert.equal(runner.classify(selected, receipt, '', value), 'FAIL_PRODUCT');
    value.checks[0].detail[1] = 0.8;
    contact.getWorldNormalOnB = [0, -1, 0];
    assert.equal(runner.classify(selected, receipt, '', value), 'FAIL_PRODUCT');
    contact.getWorldNormalOnB = [0, 1, 0];
    delete contact.getLocalPointOnA;
    assert.equal(runner.classify(selected, receipt, '', value), 'INVALID_RESULT');
});

test('production query oracle independently rejects wrong analytic rays, target motion and support proof', () => {
    const { classifyQuery } = require('./query-oracle.cjs');
    const dt = Math.fround(0.1),
        h = dt / 4,
        damping = Math.fround(0.1),
        factor = 1 / (1 + h * damping);
    const predicted = 30 + (h * ((Math.fround(30.1) - 30) / dt) * factor * (1 - factor ** 4)) / (1 - factor);
    const stopped = { linearVelocity: { x: 0, y: 0, z: 0 }, angularVelocity: { x: 0, y: 0, z: 0 } };
    const sample = (nativeStepIndex) => ({
        sweep: {
            complete: true,
            children: [{}, { origin: { x: 1.5 }, dimensions: [0.5] }],
            hits: [
                { collider: 'wall', distance: 2.5 },
                { collider: 'wall', distance: 4.3 },
            ],
            nearestDistance: 2.5,
            nativeStepIndex,
        },
        ray: {
            complete: true,
            hits: ['head', 'held-offset', 'wall'].map((collider, i) => ({ collider, distance: [0, 1, 4.5][i] })),
        },
        zero: { hits: [], nearestDistance: null },
    });
    const value = {
        schema: 'box3d-production-esm-public-query-target-support-v1',
        status: 'PASS_LIMITED_PRODUCTION_QUERY_TARGET_SUPPORT',
        completedAt: '2026-10-24T00:00:00Z',
        healthyComplete: true,
        inputsUnchanged: true,
        hostErrors: [],
        checks: Array.from({ length: 30 }, (_, i) => ({ name: 'check' + i, pass: true })),
        close: { status: 'released', physicsPreparation: { status: 'closed', cleanupErrors: [] } },
        querySamples: [sample(0), sample(1)],
        largeOffset: {
            children: [{ dimensions: [0.0625] }, { dimensions: [0.1, 0.0625] }],
            hits: [
                { queryCollider: 'large-offset-box', collider: 'wall', distance: 4.4375 },
                { queryCollider: 'large-offset-capsule', collider: 'wall', distance: 4.3375 },
            ],
        },
        overlap: {
            initialOverlap: true,
            hits: [],
            overlaps: [{ queryCollider: 'head', collider: 'external-overlap' }],
        },
        target: {
            before: { position: { x: 30 } },
            after: { position: { x: predicted } },
            afterClear: stopped,
            admittedDt: dt,
            substeps: 4,
            damping,
            admittedTargetX: Math.fround(30.1),
        },
        support: {
            proof: {
                proven: true,
                collider: 'support-table',
                queryCollider: 'supported-sphere',
                startGap: -0.000074,
                endGap: 0.099926,
                planeNormal: { y: 1 },
                planeOffset: 0,
                nativeMutationRevision: 1,
            },
            up: { nativeMutationRevision: 1, hits: [{ collider: 'support-ceiling', distance: 0.080074 }] },
            downProof: { proven: false },
            diagonal: { hits: [{ collider: 'support-side-wall' }] },
            departed: { position: { y: 0.549926 } },
            afterClear: stopped,
        },
    };
    assert.equal(classifyQuery(receipt, value), 'PASS_LIMITED');
    value.querySamples[0].ray.hits[2].distance = 7;
    assert.equal(classifyQuery(receipt, value), 'FAIL_PRODUCT');
    value.querySamples[0].ray.hits[2].distance = 4.5;
    value.target.after.position.x = 30.1;
    assert.equal(classifyQuery(receipt, value), 'FAIL_PRODUCT');
    value.target.after.position.x = predicted;
    value.support.proof.endGap = 0;
    assert.equal(classifyQuery(receipt, value), 'FAIL_PRODUCT');
    value.support.proof.endGap = 0.099926;
    value.querySamples.pop();
    assert.equal(classifyQuery(receipt, value), 'INVALID_RESULT');
});

test('public producer initialization flushes then enables before registering; pause is never bypassed', async () => {
    const { createPublicBeforeStepRegistrar } = await import('./cases/cohort-v2/public-producer-phase.mjs');
    const calls = [];
    let enabled = false;
    const system = {
        autoSimulation: true,
        syncSceneToPhysics() {
            calls.push('syncSceneToPhysics');
        },
        get enable() {
            return enabled;
        },
        set enable(value) {
            calls.push('enable:' + value);
            enabled = value;
        },
    };
    const callback = () => {};
    const token = {};
    const sdk = {
        registerBox3DBeforeStep(value) {
            assert.equal(value, callback);
            assert.equal(enabled, true);
            calls.push('registerBox3DBeforeStep');
            return token;
        },
    };
    const register = createPublicBeforeStepRegistrar(sdk, system);
    assert.deepEqual(calls, ['syncSceneToPhysics', 'enable:true']);
    assert.equal(register(callback), token);
    assert.deepEqual(calls, ['syncSceneToPhysics', 'enable:true', 'registerBox3DBeforeStep']);
    system.enable = false;
    assert.throws(() => register(callback), /paused/);
    assert.equal(calls.filter((name) => name === 'registerBox3DBeforeStep').length, 1);
    const consumer = fs.readFileSync(path.join(__dirname, 'cases/cohort-v2/query/consumer.mjs'), 'utf8');
    assert(
        consumer.indexOf('createPublicBeforeStepRegistrar(sdk, system)') < consumer.indexOf('const hook = beforeStep('),
    );
    assert(
        !consumer.includes('sdk.registerBox3DBeforeStep('),
        'New fixture registrations must share the validated public ordering helper',
    );
});

test('positive-gap Box oracle uses actual support geometry, not a zero-hit marker or proof label', () => {
    const { classifyPositiveGap } = require('./query-oracle.cjs');
    const geometry = (collider, y) => ({
        collider,
        kind: 'box',
        support: {
            origin: { y },
            radius: 0,
            points: [-0.5, 0.5].flatMap((x) => [-0.5, 0.5].flatMap((y) => [-0.5, 0.5].map((z) => ({ x, y, z })))),
        },
    });
    const blocker = geometry('positive-gap-table', -0.5),
        child = geometry('positive-gap-box', 0.50152);
    const pair = {
        collider: 'positive-gap-table',
        fraction: 0,
        distance: 0,
        normal: { x: 0, y: 0, z: 0 },
        blockingGeometry: blocker,
    };
    const value = {
        queryFixtureVersion: 3,
        positiveGap: {
            up: {
                complete: true,
                overlaps: [],
                children: [child],
                translation: { y: 0.1 },
                nativeMutationRevision: 1,
                hits: [pair, { collider: 'positive-gap-ceiling', fraction: 0.7848, distance: 0.07848 }],
            },
            down: { complete: true, overlaps: [], hits: [{ ...pair }] },
            proof: {
                proven: true,
                startGap: 0.00152,
                endGap: 0.10152,
                queryCollider: 'positive-gap-box',
                collider: 'positive-gap-table',
                nativeMutationRevision: 1,
                planeNormal: { x: 0, y: 1, z: 0 },
            },
            downProof: { proven: false },
            forgedProof: { proven: false },
            copyStableAfterTick: true,
            copyStableAfterClose: true,
        },
    };
    assert.equal(classifyPositiveGap(value), 'PASS_LIMITED');
    child.support.origin.y = 0.6;
    assert.equal(classifyPositiveGap(value), 'FAIL_PRODUCT');
    child.support.origin.y = 0.50152;
    value.positiveGap.up.hits.pop();
    assert.equal(classifyPositiveGap(value), 'FAIL_PRODUCT');
    pair.blockingGeometry = undefined;
    assert.equal(classifyPositiveGap(value), 'INVALID_RESULT');
    assert.equal(classifyPositiveGap({}), 'INVALID_RESULT');
});

test('query serialization caches only opaque labels, still detects changed numeric fields after close', async () => {
    const { createPublicQueryCopier } = await import('./cases/cohort-v3/copy-public-query.mjs');
    const copy = createPublicQueryCopier();
    const collider = { node: { name: 'stable-label' } };
    const snapshot = {
        hits: [{ collider, point: { x: 1, y: 2, z: 3 }, blockingGeometry: { collider, dimensions: [1, 2, 3] } }],
    };
    const before = copy(snapshot);
    collider.node.name = '';
    assert.deepEqual(copy(snapshot), before);
    snapshot.hits[0].point.y = 9;
    assert.notDeepEqual(copy(snapshot), before, 'Identity labeling must never hide numeric snapshot mutation');
});

test('trigger import recomputes event oracle and keeps intentional callback fault separate from health', () => {
    const { classifyTrigger } = require('./trigger-oracle.cjs');
    const raw = {
        schema: 'box3d-production-esm-public-trigger-consumer-v1',
        completedAt: 'observed',
        mode: 'once-only',
        status: 'PASS_LIMITED_PRODUCTION_ESM_TRIGGER',
        inputsUnchanged: true,
        scenarioAssertionsPassed: true,
        checks: [{ pass: true }],
        totalSteps: 20,
        transport: [{}, {}, {}],
        moduleResolution: [{}],
        listenerAdmission: true,
        events: ['sensor', 'visitor'].map((self, i) => ({
            self,
            other: i ? 'sensor' : 'visitor',
            tick: 1,
            type: 'onTriggerEnter',
            impl: { backend: 'box3d', stepIndex: 1 },
        })),
        lifetime: [{ before: 'copy', after: 'copy' }],
        lifetimeAfterClose: [{ before: 'copy', after: 'copy' }],
        onceNeedFlags: [false, false],
        phases: [
            { label: 'exit', status: 'COMPLETE', startEvent: 2, endEvent: 2, positionAfter: [3, 0, 0] },
            { label: 'reenter', status: 'COMPLETE', startEvent: 2, endEvent: 2, positionAfter: [0, 0, 0] },
        ],
        close: {
            status: 'released',
            failures: [],
            physicsPreparation: {
                status: 'closed',
                cleanupErrors: [],
                acquired: [{ backend: 'box3d', cleanup: 'released', retained: [] }],
            },
        },
    };
    const receipt = { exitCode: 0 };
    assert.equal(classifyTrigger(receipt, raw, 'once-only'), 'PASS_LIMITED');
    for (const corrupt of [
        (r) => r.events.push(r.events[0]),
        (r) => (r.phases[0].positionAfter[0] = 0),
        (r) => (r.lifetimeAfterClose[0].after = 'changed'),
        (r) => (r.close.status = 'failed'),
        (r) => r.close.physicsPreparation.acquired[0].retained.push('owner'),
    ]) {
        const changed = structuredClone(raw);
        corrupt(changed);
        assert.equal(classifyTrigger(receipt, changed, 'once-only'), 'INVALID_RESULT');
    }
    const fault = structuredClone(raw);
    Object.assign(fault, {
        mode: 'callback-fault',
        counts: { faultCalls: 1 },
        intentionalFaultObserved: true,
        fault: { exactErrorIdentity: true, nextMutationCode: 'AIR_E_BOX3D_WORLD_FAULTED' },
    });
    fault.close.status = 'failed';
    fault.close.failures = [{ label: 'game-clock-terminal', message: 'AIR_E_BOX3D_WORLD_FAULTED' }];
    assert.equal(classifyTrigger(receipt, fault, 'callback-fault'), 'EXPECTED_FAULT_OBSERVED');
    assert.equal(classifyTrigger(receipt, fault, 'once-only'), 'INVALID_RESULT');
    fault.fault.exactErrorIdentity = false;
    assert.equal(classifyTrigger(receipt, fault, 'callback-fault'), 'INVALID_RESULT');
});

test('SKU import checks exact configuration, per-child two-generation events and release independently', () => {
    const { classifySku } = require('./sku-oracle.cjs');
    const config = require('./cases/cohort-v5/sku/frozen/config.json');
    const raw = {
        schema: 'box3d-production-esm-public-trigger-consumer-v1',
        completedAt: 'observed',
        mode: 'A',
        status: 'PASS_LIMITED_EX09_SKU_TRIGGER',
        inputsUnchanged: true,
        scenarioAssertionsPassed: true,
        checks: [{ pass: true }],
        totalSteps: 20,
        transport: [{}, {}, {}],
        moduleResolution: [{}],
        configuration: {
            sku: structuredClone(config.skus.A),
            sensorSize: [1, 0.04, 0.85],
            gravity: [0, 0, 0],
            initialLinearVelocity: [0, -0.3, 0],
            linearDamping: 0.03,
            angularDamping: 0.05,
        },
        observedSleepThreshold: 0.1,
        identities: [],
        events: [],
        itemUnion: [],
        lifetime: [{ before: 'copy', after: 'copy' }],
        lifetimeAfterClose: [{ before: 'copy', after: 'copy' }],
        motion: [{ massPending: false, type: 2 }],
        destroyedFirstGeneration: { valid: false, eventCountBefore: 16, eventCountAfter: 16 },
        close: {
            status: 'released',
            failures: [],
            physicsPreparation: {
                status: 'closed',
                cleanupErrors: [],
                acquired: [{ cleanup: 'released', retained: [] }],
            },
        },
    };
    for (const generation of [1, 2]) {
        for (const type of ['enter', 'exit'])
            raw.itemUnion.push({ itemGeneration: generation, type, diagnosticOnly: true });
        for (let child = 0; child < 2; child++) {
            const label = `A/item-1/g${generation}/collider-${child}`;
            raw.identities.push({ label });
            for (let i = 0; i < 4; i++) {
                const event = {
                    tick: generation * 5 + i,
                    type: i === 0 ? 'onTriggerEnter' : i === 3 ? 'onTriggerExit' : 'onTriggerStay',
                    self: { label },
                    other: { label: 'sensor' },
                    impl: { backend: 'box3d', stepIndex: generation * 5 + i, logicalPair: label },
                };
                raw.events.push(event, { ...event, self: event.other, other: event.self });
            }
        }
    }
    assert.equal(classifySku({ exitCode: 0 }, raw, 'A'), 'PASS_LIMITED');
    for (const corrupt of [
        (r) => (r.configuration.sku.mass = 99),
        (r) => r.events.splice(2, 1),
        (r) => r.events.push(r.events[0]),
        (r) => r.destroyedFirstGeneration.eventCountAfter++,
        (r) => (r.lifetimeAfterClose[0].after = 'changed'),
        (r) => (r.close.status = 'failed'),
    ]) {
        const changed = structuredClone(raw);
        corrupt(changed);
        assert.equal(classifySku({ exitCode: 0 }, changed, 'A'), 'INVALID_RESULT');
    }
});
