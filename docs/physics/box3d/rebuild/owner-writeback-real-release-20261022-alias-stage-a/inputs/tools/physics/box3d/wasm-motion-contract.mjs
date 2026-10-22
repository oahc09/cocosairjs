// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Real WASM motion; independent scalar oracle is an expectation, never a replacement physics implementation.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sha256 } from './verify-sources.mjs';
const dir = resolve(process.argv[2]),
    dest = resolve(dir, 'wasm-motion-contract.raw.json');
const samplesPath = resolve(dir, 'motion-samples.raw.jsonl');
assert.ok(!existsSync(dest) && !existsSync(samplesPath));
writeFileSync(samplesPath, '');
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')));
const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')));
const wasmBinary = readFileSync(resolve(dir, 'box3d-st.wasm'));
const module = await factory({ wasmBinary }),
    second = await factory({ wasmBinary });
const api = createBox3DBinding(module, manifest),
    other = createBox3DBinding(second, manifest);
const report = {
    status: 'RUNNING',
    identity: api.identity,
    fixtureSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    checks: {},
    negatives: [],
    observations: {},
    injectedMechanisms: [],
    sampleCount: 0,
};
const json = (v, pretty = false) =>
    JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x), pretty ? 2 : undefined);
const add = (a, b) => a.map((v, i) => v + b[i]),
    sub = (a, b) => a.map((v, i) => v - b[i]),
    mul = (a, s) => a.map((v) => v * s);
const norm = (v) => Math.hypot(...v),
    distance = (a, b) => norm(sub(a, b));
const conjugate = (q) => [-q[0], -q[1], -q[2], q[3]];
const qm = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qn = (q) => {
    const m = Math.max(...q.map(Math.abs)),
        s = q.map((v) => v / m);
    return mul(s, 1 / norm(s));
};
const rotate = (q, v) => qm(qm(q, [...v, 0]), conjugate(q)).slice(0, 3);
const angleError = (a, b) => {
    const d = qn(qm(qn(a), conjugate(qn(b))));
    return 2 * Math.atan2(norm(d.slice(0, 3)), Math.abs(d[3]));
};
const pose = (position = [0, 0, 0], rotation = [0, 0, 0, 1]) => ({ position, rotation });
const fromRow = (r) => ({ position: Array.from(r.slice(0, 3)), rotation: Array.from(r.slice(3, 7)) });
const reset = (body, p, options = {}) => ({ body, reset: { pose: p, ...options } });
const target = (body, p) => ({ body, intent: { kind: 'target', pose: p } });
const apply = (world, records, n = 4) => api.applyMotionBatch(world, records, 1 / 60, n);
const errorOf = (action, outcome) => {
    let error;
    try {
        action();
    } catch (e) {
        error = e;
    }
    assert.ok(error, 'Expected rejection');
    assert.equal(error.mutationOutcome, outcome);
    if (outcome !== undefined) {
        const d = Object.getOwnPropertyDescriptor(error, 'mutationOutcome');
        assert.equal(d.writable, false);
        assert.equal(d.configurable, false);
    }
    return { code: error.code, message: error.message, mutationOutcome: error.mutationOutcome };
};
const sample = (row) => {
    appendFileSync(samplesPath, json(row) + '\n');
    ++report.sampleCount;
};
function expectedPlan(before, localCenter, request, dt) {
    const q0 = qn(before.rotation),
        q1 = qn(request.rotation).map(Math.fround);
    const sameHemisphere = q0.reduce((s, v, i) => s + v * q1[i], 0) >= 0 ? q1 : q1.map((v) => -v);
    const center = add(request.position.map(Math.fround), rotate(q1, localCenter));
    return {
        linear: mul(sub(center, before.worldCenter), 1 / dt),
        angular: mul(qm(sub(sameHemisphere, q0), conjugate(q0)).slice(0, 3), 2 / dt),
    };
}
function predict(application, localCenter, n) {
    const dt = application.plan.fixedDt,
        h = dt / n,
        rL = 1 / (1 + h * application.plan.linearDamping),
        rA = 1 / (1 + h * application.plan.angularDamping);
    let c = [...application.worldCenter],
        q = qn(application.pose.rotation),
        v = [...application.applied.linearVelocity],
        w = [...application.applied.angularVelocity];
    for (let i = 0; i < n; ++i) {
        v = mul(v, rL);
        w = mul(w, rA);
        c = add(c, mul(v, h));
        q = qn(qm(qn([...mul(w, h / 2), 1]), q));
    }
    return {
        worldCenter: c,
        rotation: q,
        position: sub(c, rotate(q, localCenter)),
        linearVelocity: v,
        angularVelocity: w,
    };
}
try {
    const baseline = api.liveBytes();
    const w = api.createWorld([0, 0, 0]),
        d = api.createBody(w, { position: [0, 4, 0] }),
        k = api.createBody(w, { type: 1, position: [10, 0, 0] });
    api.createOffsetSphere(d, [0.5, 0.25, 0], 0.5);
    api.setBodyMass(w, d, 2);
    api.createSphere(k, 0.5);
    api.step(w);
    const snapshot = api.readStepSnapshot(w),
        snapshotText = json(snapshot);
    const foreignWorld = api.createWorld([0, 0, 0]),
        foreign = api.createBody(foreignWorld, { type: 1 });
    const otherWorld = other.createWorld([0, 0, 0]),
        otherBody = other.createBody(otherWorld, { type: 1 });
    const state = () => ({
        poses: Array.from(api.bodyTransforms(w, [d, k])),
        states: [api.bodyState(w, d), api.bodyState(w, k)],
        diagnostics: api.stepDiagnostics(w),
        counts: api.worldCounts(w),
        core: api.liveBytes(),
        bridge: api.bridgeMemory(w),
    });
    const reject = (name, action) => {
        const before = state(),
            old = api.readStepSnapshot(w);
        const error = errorOf(action, 'not-mutated');
        assert.deepEqual(state(), before, name);
        assert.equal(api.readStepSnapshot(w), old);
        report.negatives.push({ name, error, before });
    };
    const valid = [reset(d, pose([1, 2, 3])), target(k, pose([10.01, 0, 0]))];
    const initial = state();
    api.validateMotionBatch(w, valid, 1 / 60, 4);
    assert.deepEqual(state(), initial);
    assert.equal(api.readStepSnapshot(w), snapshot);
    assert.deepEqual(apply(w, []), []);
    assert.deepEqual(state(), initial);
    assert.equal(api.readStepSnapshot(w), snapshot);
    reject('foreign-world-last', () => apply(w, [valid[0], target(foreign, pose())]));
    reject('foreign-module-last', () => apply(w, [valid[0], target(otherBody, pose())]));
    reject('forged-token', () => apply(w, [target({ ...k }, pose())]));
    reject('duplicate-body', () => apply(w, [valid[1], valid[1]]));
    reject('record-capacity', () => apply(w, Array(4097).fill(valid[1])));
    reject('no-operation', () => apply(w, [{ body: k }]));
    reject('target-dynamic', () => apply(w, [target(d, pose())]));
    reject('scene-dynamic', () => apply(w, [reset(d, pose(), { mode: 'scene' })]));
    for (const value of [0, 1, 'false', null])
        for (const name of ['wake', 'preserveVelocity'])
            reject(`boolean:${name}:${String(value)}`, () => apply(w, [reset(d, pose(), { [name]: value })]));
    for (const q of [
        [0, 0, 0, 0],
        [NaN, 0, 0, 1],
        [0, Infinity, 0, 1],
    ])
        reject(`quaternion:${q.map(String)}`, () => apply(w, [valid[0], target(k, pose([10, 0, 0], q))]));
    for (const value of [NaN, Infinity, 1e40])
        reject(`position:${String(value)}`, () => apply(w, [reset(d, pose([value, 0, 0]))]));
    for (const value of [0, -1, 1e-50, 1e-45, Infinity])
        reject(`dt:${value}`, () => api.applyMotionBatch(w, valid, value, 4));
    for (const n of [0, 3, 5, 16, 1.5, Infinity, '4'])
        reject(`substeps:${n}`, () => api.applyMotionBatch(w, valid, 1 / 60, n));
    reject('linear-speed-cap', () => apply(w, [valid[0], target(k, pose([30, 0, 0]))]));
    reject('angular-speed-cap', () => apply(w, [valid[0], target(k, pose([10, 0, 0], [0, 0, 1, 0]))]));
    report.checks.admissionAndEmptyValidate = true;
    // Verify normalization on copied public inputs without silently changing caller data.
    for (const q of [
        [0, 0, 0, 1e300],
        [0, 0, 0, 1e-300],
        [0, 0, 0, -2],
    ]) {
        const supplied = pose([10, 0, 0], q),
            before = json(supplied),
            result = apply(w, [reset(k, supplied)]);
        assert.equal(json(supplied), before);
        assert.ok(angleError(result[0].pose.rotation, [0, 0, 0, 1]) < 1e-4);
    }
    api.setBodyMotionFactors(w, k, [0, 1, 1], [1, 1, 1]);
    api.step(w);
    const lockedSnapshot = api.readStepSnapshot(w);
    const lockBefore = state();
    const lockError = errorOf(
        () => apply(w, [reset(d, pose([2, 3, 4])), target(k, pose([10.01, 0, 0]))]),
        'not-mutated',
    );
    assert.deepEqual(state(), lockBefore);
    assert.equal(api.readStepSnapshot(w), lockedSnapshot);
    report.negatives.push({ name: 'lock-late-record', error: lockError, before: lockBefore });
    api.setBodyMotionFactors(w, k, [1, 1, 1], [1, 1, 1]);
    report.checks.lockAndCapRejection = true;
    // Default teleport clears velocities, preserves real accumulated forces, and does not step.
    api.setBodyLinearVelocity(w, d, [1, 2, 3]);
    api.setBodyAngularVelocity(w, d, [0.1, 0.2, 0.3]);
    api.applyBodyForce(w, d, [4, 5, 6]);
    api.applyBodyTorque(w, d, [7, 8, 9]);
    const beforeReset = api.bodyState(w, d),
        diagBefore = api.stepDiagnostics(w);
    const rotated = pose([2, 3, 4], [0, 0, Math.sin(0.3), Math.cos(0.3)]),
        resetResult = apply(w, [reset(d, rotated)])[0];
    assert.deepEqual(resetResult.applied.linearVelocity, [0, 0, 0]);
    assert.deepEqual(resetResult.applied.angularVelocity, [0, 0, 0]);
    assert.deepEqual(resetResult.state.force, beforeReset.force);
    assert.deepEqual(resetResult.state.torque, beforeReset.torque);
    assert.equal(api.stepDiagnostics(w).nativeStepIndex, diagBefore.nativeStepIndex);
    assert.equal(api.stepDiagnostics(w).snapshotAvailable, false);
    const independentCOM = add(rotated.position, rotate(qn(rotated.rotation), beforeReset.localCenter));
    assert.ok(distance(resetResult.worldCenter, independentCOM) <= 1e-4);
    assert.ok(Object.isFrozen(resetResult.requested.reset.pose.position));
    report.observations.offsetTeleport = { input: rotated, before: beforeReset, result: resetResult, independentCOM };
    api.setBodyLinearVelocity(w, d, [0.3, 0.4, 0.5]);
    api.setBodyAngularVelocity(w, d, [0.2, 0.1, 0.3]);
    const preserveBefore = api.bodyState(w, d),
        preserved = apply(w, [reset(d, pose([3, 4, 5]), { preserveVelocity: true, wake: false })])[0];
    assert.deepEqual(preserved.applied.linearVelocity, preserveBefore.linearVelocity);
    assert.deepEqual(preserved.applied.angularVelocity, preserveBefore.angularVelocity);
    api.setBodyEnabled(w, d, false);
    const disabled = apply(w, [reset(d, pose([4, 5, 6]))])[0];
    assert.equal(disabled.state.enabled, false);
    assert.equal(disabled.state.awake, false);
    api.setBodyEnabled(w, d, true);
    api.clearBodyForces(w, d);
    report.observations.preserveReset = { before: preserveBefore, result: preserved };
    report.observations.disabledReset = disabled;
    report.checks.teleportOptionsCOMAndForces = true;
    // A reset plus target is one validated record, planned from the post-reset origin.
    const merged = apply(w, [
        { body: k, reset: { pose: pose([1, 0, 0]) }, intent: { kind: 'target', pose: pose([1.01, 0, 0]) } },
    ])[0];
    assert.ok(Math.abs(merged.applied.linearVelocity[0] - 0.6) < 1e-4);
    assert.equal(merged.pose.position[0], 1);
    apply(w, [{ body: k, intent: { kind: 'clear' } }]);
    assert.deepEqual(api.bodyState(w, k).linearVelocity, [0, 0, 0]);
    api.setBodyAwake(w, k, false);
    assert.equal(api.bodyState(w, k).awake, false);
    const tiny = apply(w, [target(k, pose([1.000000238418579, 0, 0]))])[0];
    assert.equal(tiny.state.awake, true);
    assert.ok(tiny.applied.linearVelocity[0] > 0 && tiny.applied.linearVelocity[0] < 0.05);
    report.observations.merged = merged;
    report.observations.tiny = tiny;
    report.checks.mergedResetTargetAndClear = true;
    const retained = json(merged),
        oldHeap = module.HEAPU8.buffer,
        growth = module._malloc(module.HEAPU8.length + 65536);
    assert.ok(growth);
    assert.notEqual(module.HEAPU8.buffer, oldHeap);
    module._free(growth);
    assert.equal(json(merged), retained);
    assert.equal(json(snapshot), snapshotText);
    report.checks.immutableCopiesAndHeapGrowth = true;
    report.observations.idCycles = [];
    for (let i = 0; i < 128; ++i) {
        const old = api.createBody(w, { type: 1 });
        api.destroyBody(old);
        const replacement = api.createBody(w, { type: 1 });
        assert.equal(old.high, replacement.high);
        assert.notEqual(old.low, replacement.low);
        const before = api.bodyTransforms(w, [replacement]);
        const e = errorOf(() => apply(w, [target(old, pose())]), 'not-mutated');
        assert.deepEqual(api.bodyTransforms(w, [replacement]), before);
        report.observations.idCycles.push({ old, replacement, error: e });
        api.destroyBody(replacement);
    }
    report.checks.fullId128Cycles = true;
    api.destroyWorld(w);
    api.destroyWorld(foreignWorld);
    other.destroyWorld(otherWorld);
    // Per-tick oracle uses actual pre-state and independent scalar quaternion arithmetic, not core debug geometry.
    report.observations.grid = [];
    for (const n of [1, 2, 4, 8])
        for (const damping of [0, 0.25, 1]) {
            const world = api.createWorld([0, 0, 0]),
                body = api.createBody(world, { type: 1, linearDamping: damping, angularDamping: damping });
            api.createOffsetSphere(body, [0.3, 0.2, 0], 0.5);
            const max = {
                origin: 0,
                center: 0,
                angle: 0,
                plannedLinear: 0,
                plannedAngular: 0,
                requestedOrigin: 0,
                requestedAngle: 0,
            };
            for (let tick = 0; tick < 600; ++tick) {
                const prior = Array.from(api.bodyTransforms(world, [body])),
                    stateBefore = api.bodyState(world, body);
                const theta = 0.2 * Math.sin((tick + 1) / 70),
                    requested = pose(
                        [0.1 * Math.sin((tick + 1) / 100), 0.1 * Math.cos((tick + 1) / 100), 0],
                        [0, 0, Math.sin(theta / 2), Math.cos(theta / 2)],
                    );
                const before = { ...fromRow(prior), worldCenter: prior.slice(7, 10) },
                    planned = expectedPlan(before, stateBefore.localCenter, requested, Math.fround(1 / 60));
                const result = apply(world, [target(body, requested)], n)[0],
                    predicted = predict(result, stateBefore.localCenter, n);
                const linearError = distance(result.applied.linearVelocity, planned.linear),
                    angularError = distance(result.applied.angularVelocity, planned.angular);
                api.step(world, 1 / 60, n);
                const actual = Array.from(api.bodyTransforms(world, [body]));
                const errors = {
                    origin: distance(actual.slice(0, 3), predicted.position),
                    center: distance(actual.slice(7, 10), predicted.worldCenter),
                    angle: angleError(actual.slice(3, 7), predicted.rotation),
                    plannedLinear: linearError,
                    plannedAngular: angularError,
                    requestedOrigin: distance(actual.slice(0, 3), requested.position),
                    requestedAngle: angleError(actual.slice(3, 7), requested.rotation),
                };
                sample({
                    kind: 'free-kinematic',
                    n,
                    damping,
                    tick,
                    geometry: { sphereCenter: [0.3, 0.2, 0], sphereRadius: 0.5 },
                    requested,
                    before,
                    stateBefore,
                    application: result,
                    predicted,
                    actual,
                    errors,
                });
                assert.ok(linearError <= 5e-5 * Math.max(1, norm(planned.linear)));
                assert.ok(angularError <= 5e-5 * Math.max(1, norm(planned.angular)));
                assert.ok(errors.origin <= 1e-4 && errors.center <= 1e-4 && errors.angle <= 1e-4);
                for (const name of Object.keys(max)) max[name] = Math.max(max[name], errors[name]);
            }
            apply(world, [{ body, intent: { kind: 'clear' } }], n);
            const stopped = api.bodyTransforms(world, [body]);
            api.step(world, 1 / 60, n);
            assert.ok(distance(api.bodyTransforms(world, [body]).slice(0, 3), stopped.slice(0, 3)) <= 1e-4);
            report.observations.grid.push({ n, damping, ticks: 600, max });
            api.destroyWorld(world);
        }
    report.checks.independentDampedTargetGrid = true;
    // Large-but-admitted angular intent retains modeled shortfall instead of teleport correction.
    const lw = api.createWorld([0, 0, 0]),
        lb = api.createBody(lw, { type: 1 });
    api.createSphere(lb, 0.5);
    const request = pose([0, 0, 0], [0, 0, Math.sin(0.3), Math.cos(0.3)]),
        large = apply(lw, [target(lb, request)], 1)[0],
        prediction = predict(large, [0, 0, 0], 1);
    api.step(lw, 1 / 60, 1);
    const largeActual = Array.from(api.bodyTransforms(lw, [lb]));
    const expectedAngle = 2 * Math.atan(Math.sin(0.3)),
        observedShortfall = angleError(largeActual.slice(3, 7), request.rotation);
    sample({
        kind: 'large-admitted-angle',
        requested: request,
        application: large,
        prediction,
        actual: largeActual,
        expectedAngle,
        observedShortfall,
    });
    assert.ok(Math.abs(observedShortfall - (0.6 - expectedAngle)) <= 1e-4);
    assert.ok(observedShortfall > 1e-3);
    report.observations.largeAngle = {
        requested: request,
        application: large,
        actual: largeActual,
        expectedAngle,
        observedShortfall,
    };
    api.destroyWorld(lw);
    report.checks.modeledShortfallNotTeleport = true;
    // Real contact/sensor state changes only on an actual later step; old copies stay unchanged.
    const cw = api.createWorld([0, -10, 0]),
        floor = api.createBody(cw, { type: 0, position: [0, -0.5, 0] }),
        ball = api.createBody(cw, { position: [0, 1, 0] });
    api.createBox(floor, [8, 0.5, 8]);
    const ballShape = api.createSphere(ball, 0.5);
    api.configureShapeEvents(ballShape, { contact: true });
    for (let i = 0; i < 600; ++i) api.step(cw);
    const contactOld = api.readStepSnapshot(cw),
        contactText = json(contactOld);
    assert.ok(contactOld.contactsOfOwnedBodies.length > 0);
    const moved = apply(cw, [reset(ball, pose([0, 4, 0]))])[0];
    assert.throws(() => api.readStepSnapshot(cw), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
    assert.equal(json(contactOld), contactText);
    api.step(cw);
    const contactAfter = api.readStepSnapshot(cw);
    assert.equal(contactAfter.contactsOfOwnedBodies.length, 0);
    report.observations.teleportContact = { before: contactOld, operation: moved, after: contactAfter };
    api.destroyWorld(cw);
    const sw = api.createWorld([0, 0, 0]),
        sensorBody = api.createBody(sw, { type: 0 }),
        visitor = api.createBody(sw, { position: [4, 0, 0] });
    api.createOffsetSphere(sensorBody, [0, 0, 0], 1, 1, true);
    const visitorShape = api.createSphere(visitor, 0.5);
    api.configureShapeEvents(visitorShape, { sensor: true });
    api.step(sw);
    const sensor0 = api.readStepSnapshot(sw);
    apply(sw, [reset(visitor, pose([0, 0, 0]))]);
    api.step(sw);
    const sensor1 = api.readStepSnapshot(sw);
    apply(sw, [reset(visitor, pose([4, 0, 0]))]);
    api.step(sw);
    const sensor2 = api.readStepSnapshot(sw);
    assert.equal(sensor0.sensorBegins.length, 0);
    assert.ok(sensor1.sensorBegins.length > 0);
    assert.ok(sensor2.sensorEnds.length > 0);
    report.observations.sensorTiming = [sensor0, sensor1, sensor2];
    api.destroyWorld(sw);
    report.checks.realContactAndSensorTiming = true;
    // Explicit injected delivery/copy mechanisms, after real native mutation; never counted as spontaneous core failures.
    const fw = api.createWorld([0, 0, 0]),
        fb = api.createBody(fw, { type: 1 });
    api.createSphere(fb, 0.5);
    api.step(fw);
    const original = module._air_b3_motion_batch,
        originalState = module._air_b3_body_state;
    const validatedSnapshot = api.readStepSnapshot(fw),
        validatedState = api.bodyState(fw, fb),
        validatedDiagnostics = api.stepDiagnostics(fw);
    module._air_b3_motion_batch = (...args) => {
        const status = original(...args);
        if (args.at(-1) === 0 && status === 0) throw new Error('injected pure validation status delivery failure');
        return status;
    };
    let validateError;
    try {
        validateError = errorOf(() => api.validateMotionBatch(fw, [reset(fb, pose([1, 0, 0]))], 1 / 60, 4), undefined);
    } finally {
        module._air_b3_motion_batch = original;
    }
    assert.deepEqual(api.bodyState(fw, fb), validatedState);
    assert.deepEqual(api.stepDiagnostics(fw), validatedDiagnostics);
    assert.equal(api.readStepSnapshot(fw), validatedSnapshot);
    report.injectedMechanisms.push({
        kind: 'real pure validation then injected unknown delivery throw',
        error: validateError,
        state: validatedState,
        diagnostics: validatedDiagnostics,
    });
    let calls = 0,
        committed = false;
    module._air_b3_motion_batch = (...args) => {
        const status = original(...args);
        if (args.at(-1) === 1 && status === 0) {
            ++calls;
            committed = true;
        }
        return status;
    };
    module._air_b3_body_state = (...args) => (committed ? 2 : originalState(...args));
    const stepBefore = api.stepDiagnostics(fw).nativeStepIndex;
    let e;
    try {
        e = errorOf(() => apply(fw, [reset(fb, pose([2, 0, 0]))]), 'committed');
    } finally {
        module._air_b3_motion_batch = original;
        module._air_b3_body_state = originalState;
    }
    assert.equal(calls, 1);
    assert.equal(api.bodyTransforms(fw, [fb])[0], 2);
    assert.equal(api.stepDiagnostics(fw).nativeStepIndex, stepBefore);
    assert.equal(api.stepDiagnostics(fw).snapshotAvailable, false);
    report.injectedMechanisms.push({
        kind: 'real mutation then injected body-state status failure',
        error: e,
        calls,
        pose: Array.from(api.bodyTransforms(fw, [fb])),
        diagnostics: api.stepDiagnostics(fw),
    });
    api.step(fw);
    calls = 0;
    module._air_b3_motion_batch = (...args) => {
        const status = original(...args);
        if (args.at(-1) === 1 && status === 0) {
            ++calls;
            throw new Error('injected native status delivery failure');
        }
        return status;
    };
    const unknownBefore = api.stepDiagnostics(fw).nativeStepIndex;
    try {
        e = errorOf(() => apply(fw, [reset(fb, pose([3, 0, 0]))]), undefined);
    } finally {
        module._air_b3_motion_batch = original;
    }
    assert.equal(calls, 1);
    assert.equal(api.bodyTransforms(fw, [fb])[0], 3);
    assert.equal(api.stepDiagnostics(fw).nativeStepIndex, unknownBefore);
    assert.equal(api.stepDiagnostics(fw).snapshotAvailable, false);
    report.injectedMechanisms.push({
        kind: 'real mutation then injected unknown export throw',
        error: e,
        calls,
        pose: Array.from(api.bodyTransforms(fw, [fb])),
        diagnostics: api.stepDiagnostics(fw),
    });
    api.destroyWorld(fw);
    report.checks.mutationPhasesNoReplay = true;
    assert.equal(api.liveBytes(), baseline);
    assert.equal(api.bridgeMemory().liveBytes, 0n);
    assert.equal(other.bridgeMemory().liveBytes, 0n);
    report.checks.cleanup = true;
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
} finally {
    for (const binding of [api, other])
        try {
            binding.dispose();
        } catch (error) {
            report.cleanupError = error.stack;
            report.status = 'FAIL';
            process.exitCode = 1;
        }
    const data = readFileSync(samplesPath);
    report.samplesArtifact = {
        path: 'motion-samples.raw.jsonl',
        bytes: data.length,
        sha256: sha256(data),
        records: report.sampleCount,
    };
    writeFileSync(dest, json(report, true) + '\n');
    console.log(
        JSON.stringify({
            status: report.status,
            checks: report.checks,
            samples: report.sampleCount,
            error: report.error?.message,
        }),
    );
}
