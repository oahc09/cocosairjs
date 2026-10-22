// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Real independently instantiated WASM; copied observations, no fake dynamics.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sha256 } from './verify-sources.mjs';
const dir = resolve(process.argv[2]);
const dest = resolve(dir, 'wasm-body-contract.raw.json');
assert.ok(!existsSync(dest));
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')));
const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')));
const module = await factory({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
const api = createBox3DBinding(module, manifest);
const report = {
    status: 'RUNNING',
    identity: api.identity,
    fixtureSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    observations: {},
    checks: {},
    negatives: [],
};
const save = () =>
    writeFileSync(dest, JSON.stringify(report, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n');
const o = report.observations;
const near = (a, b, e = 1e-4) => assert.ok(Math.abs(a - b) <= e, `${a} != ${b} (epsilon ${e})`);
const vecNear = (a, b, e = 1e-4) => a.forEach((v, i) => near(v, b[i], e));
const state = (w, b) => api.bodyState(w, b);
const rejection = (label, w, b, action) => {
    const before = {
        body: b ? state(w, b) : null,
        counts: api.worldCounts(w),
        diagnostics: api.stepDiagnostics(w),
        bridge: api.bridgeMemory(w),
    };
    let error;
    try {
        action();
    } catch (e) {
        error = { code: e.code, message: e.message };
    }
    assert.ok(error, `Expected rejection ${label}`);
    assert.deepEqual(
        {
            body: b ? state(w, b) : null,
            counts: api.worldCounts(w),
            diagnostics: api.stepDiagnostics(w),
            bridge: api.bridgeMemory(w),
        },
        before,
        label,
    );
    report.negatives.push({ label, error, before });
};
const make = (options = {}) => {
    const w = api.createWorld([0, 0, 0]);
    const b = api.createBody(w, options);
    return [w, b];
};
const sphere = (w, b, m = 2) => {
    api.setBodyMass(w, b, m);
    return api.createSphere(b, 0.5);
};
try {
    const baseline = api.liveBytes();
    let [w, b] = make();
    for (const value of [0, 1, 'false', null])
        rejection(`createBody.enableSleep=${JSON.stringify(value)}`, w, null, () =>
            api.createBody(w, { enableSleep: value }),
        );
    let pending = api.setBodyMass(w, b, 12);
    assert.equal(pending.massPending, true);
    rejection('pending-before-collider-step', w, b, () => api.step(w));
    const box = api.createBox(b, [1, 2, 3]);
    o.boxMass = state(w, b);
    near(o.boxMass.mass, 12);
    vecNear([o.boxMass.inertia[0], o.boxMass.inertia[4], o.boxMass.inertia[8]], [52, 40, 20]);
    api.applyBodyAngularImpulse(w, b, [0, 0, 20]);
    near(state(w, b).angularVelocity[2], 1);
    const old = state(w, b),
        serialized = JSON.stringify(old);
    assert.ok(Object.isFrozen(old) && Object.isFrozen(old.inertia));
    const allocation = module._malloc(64 * 1024 * 1024);
    assert.ok(allocation);
    assert.equal(JSON.stringify(old), serialized);
    module._free(allocation);
    api.clearBodyState(w, b);
    let forced = api.applyBodyForce(w, b, [12, 0, 0], [0, 1, 0]);
    vecNear(forced.force, [12, 0, 0]);
    vecNear(forced.torque, [0, 0, -12]);
    api.clearBodyForces(w, b);
    api.step(w);
    vecNear(state(w, b).linearVelocity, [0, 0, 0]);
    api.applyBodyForce(w, b, [12, 0, 0]);
    api.step(w);
    near(state(w, b).linearVelocity[0], 1 / 60, 1e-5);
    const retained = state(w, b).linearVelocity;
    api.setBodyGravityScale(w, b, 0);
    vecNear(state(w, b).linearVelocity, retained);
    const methods = ['setBodyEnabled', 'setBodySleepEnabled', 'setBodyAwake', 'setBodyCCD'];
    for (const method of methods)
        for (const value of [0, 1, 'false', null])
            rejection(`${method}:${JSON.stringify(value)}`, w, b, () => api[method](w, b, value));
    for (const value of [NaN, Infinity, -Infinity, Number.MAX_VALUE]) {
        rejection(`mass:${String(value)}`, w, b, () => api.setBodyMass(w, b, value));
        rejection(`linear:${String(value)}`, w, b, () => api.setBodyLinearVelocity(w, b, [value, 0, 0]));
        rejection(`force:${String(value)}`, w, b, () => api.applyBodyForce(w, b, [value, 0, 0]));
        rejection(`threshold:${String(value)}`, w, b, () => api.setBodySleepThreshold(w, b, value));
    }
    for (const value of [-1, 0, 1e-100, 1e-40])
        rejection(`mass-boundary:${value}`, w, b, () => api.setBodyMass(w, b, value));
    for (const pair of [
        [-0.1, 0],
        [0, 1.1],
        [NaN, 0],
        [0, Infinity],
    ])
        rejection(`damping:${pair}`, w, b, () => api.setBodyDamping(w, b, ...pair));
    rejection('nonbinary-factor', w, b, () => api.setBodyMotionFactors(w, b, [1, 0.5, 1], [1, 1, 1]));
    rejection('type-enum', w, b, () => api.setBodyType(w, b, 4));
    rejection('invalid-space', w, b, () => api.applyBodyImpulse(w, b, [1, 0, 0], [0, 0, 0], 'bad'));
    const w2 = api.createWorld([0, 0, 0]);
    rejection('cross-world', w, b, () => api.setBodyMass(w2, b, 5));
    rejection('forged-body', w, b, () => api.bodyState(w, { ...b }));
    const another = createBox3DBinding(module, manifest);
    rejection('foreign-facade', w, b, () => another.bodyState(w, b));
    another.dispose();
    api.destroyWorld(w2);
    api.setBodyMotionFactors(w, b, [1, 1, 1], [0, 0, 0]);
    near(state(w, b).mass, 12);
    vecNear(state(w, b).inertia, Array(9).fill(0));
    api.setBodyMotionFactors(w, b, [1, 1, 1], [1, 1, 1]);
    near(state(w, b).inertia[8], 20);
    api.setBodyType(w, b, 1);
    near(state(w, b).mass, 0);
    api.setBodyLinearVelocity(w, b, [1, 0, 0]);
    api.step(w);
    near(state(w, b).linearVelocity[0], 1);
    api.setBodyType(w, b, 0);
    assert.equal(state(w, b).type, 0);
    assert.equal(state(w, b).sleepy, false);
    rejection('static-velocity-explicit-unsupported', w, b, () => api.setBodyLinearVelocity(w, b, [1, 0, 0]));
    api.setBodyType(w, b, 2);
    near(state(w, b).mass, 12);
    api.setBodyEnabled(w, b, false);
    assert.equal(state(w, b).enabled, false);
    assert.equal(state(w, b).sleepy, false);
    rejection('disabled-impulse-explicit-unsupported', w, b, () => api.applyBodyImpulse(w, b, [1, 0, 0]));
    api.setBodyEnabled(w, b, true);
    assert.equal(state(w, b).enabled, true);
    api.setBodyCCD(w, b, true);
    assert.equal(state(w, b).ccd, true);
    api.setBodyCCD(w, b, false);
    api.destroyShape(box);
    assert.equal(state(w, b).massPending, true);
    rejection('last-collider-removed-step', w, b, () => api.step(w));
    sphere(w, b, 12);
    assert.equal(state(w, b).massPending, false);
    api.step(w);
    assert.equal(JSON.stringify(old), serialized);
    api.destroyWorld(w);
    report.checks.bodyControlsValidationAndOldSnapshotImmutable = true;
    [w, b] = make();
    api.setBodyMass(w, b, 2);
    const a = api.createOffsetSphere(b, [-1, 0, 0], 0.5);
    const c = api.createOffsetSphere(b, [1, 0, 0], 0.5);
    o.offsetMass = state(w, b);
    vecNear(o.offsetMass.localCenter, [0, 0, 0]);
    vecNear([o.offsetMass.inertia[0], o.offsetMass.inertia[4], o.offsetMass.inertia[8]], [0.2, 2.2, 2.2]);
    api.applyBodyImpulse(w, b, [0, 1, 0], [1, 0, 0]);
    vecNear(state(w, b).linearVelocity, [0, 0.5, 0]);
    near(state(w, b).angularVelocity[2], 1 / 2.2);
    const velocity = state(w, b);
    api.destroyShape(c);
    vecNear(state(w, b).linearVelocity, velocity.linearVelocity);
    vecNear(state(w, b).angularVelocity, velocity.angularVelocity);
    near(state(w, b).mass, 2);
    near(api.bodySnapshot(b)[0], 0);
    api.destroyShape(a);
    const sensor = api.createOffsetSphere(b, [2, 0, 0], 0.5, 1, true);
    assert.equal(state(w, b).sensorMassFallback, true);
    const solid = api.createOffsetSphere(b, [-2, 0, 0], 0.5);
    assert.equal(state(w, b).sensorMassFallback, false);
    vecNear(state(w, b).localCenter, [-2, 0, 0]);
    api.destroyShape(solid);
    assert.equal(state(w, b).sensorMassFallback, true);
    vecNear(state(w, b).localCenter, [2, 0, 0]);
    o.sensorFallback = state(w, b);
    api.destroyWorld(w);
    [w, b] = make({ rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] });
    sphere(w, b);
    api.applyBodyImpulse(w, b, [1, 0, 0], [0, 1, 0], 'local');
    o.localImpulse = state(w, b);
    vecNear(o.localImpulse.linearVelocity, [0, 0.5, 0]);
    near(o.localImpulse.angularVelocity[2], -5, 1e-3);
    api.clearBodyState(w, b);
    api.applyBodyTorque(w, b, [1, 0, 0], 'local');
    vecNear(state(w, b).torque, [0, 1, 0]);
    api.clearBodyState(w, b);
    api.destroyWorld(w);
    o.damping = [];
    for (const c of [0, 0.1, 0.9, 1])
        for (const substeps of [1, 4, 8]) {
            [w, b] = make({ enableSleep: false });
            sphere(w, b);
            api.setBodyDamping(w, b, c, c);
            api.setBodyLinearVelocity(w, b, [1, 0, 0]);
            api.setBodyAngularVelocity(w, b, [0, 0, 1]);
            for (let t = 0; t < 60; ++t) api.step(w, 1 / 60, substeps);
            const after = state(w, b),
                expected = 1 / (1 + Math.fround(c) / (60 * substeps)) ** (60 * substeps);
            near(after.linearVelocity[0], expected, 1e-3);
            near(after.angularVelocity[2], expected, 1e-3);
            o.damping.push({ c, substeps, expected, state: after });
            api.destroyWorld(w);
        }
    [w, b] = make();
    sphere(w, b);
    api.setBodyLinearVelocity(w, b, [0, 0.25, 0]);
    api.setBodyGravityScale(w, b, 0);
    api.setGravity(w, [0, -10, 0]);
    for (let t = 0; t < 60; ++t) api.step(w);
    near(state(w, b).linearVelocity[1], 0.25, 1e-4);
    api.setBodyGravityScale(w, b, 1);
    api.step(w);
    near(state(w, b).linearVelocity[1], 0.25 - 10 / 60, 1e-4);
    api.setGravity(w, [0, 0, 0]);
    api.clearBodyState(w, b);
    api.setBodySleepThreshold(w, b, 0);
    api.step(w);
    assert.equal(state(w, b).sleepy, true);
    o.sleepZeroThreshold = [state(w, b)];
    for (let i = 0; i < 60; ++i) api.step(w);
    assert.equal(state(w, b).sleeping, true);
    o.sleepZeroThreshold.push(state(w, b));
    api.setBodyAwake(w, b, true);
    assert.equal(state(w, b).sleepTime, 0);
    api.setBodySleepEnabled(w, b, false);
    for (let i = 0; i < 80; ++i) api.step(w);
    assert.equal(state(w, b).awake, true);
    assert.equal(state(w, b).sleepy, false);
    api.setBodySleepEnabled(w, b, true);
    api.setBodySleepThreshold(w, b, 0.1);
    api.setBodyLinearVelocity(w, b, [0.2, 0, 0]);
    for (let i = 0; i < 60; ++i) api.step(w);
    assert.equal(state(w, b).awake, true);
    api.setBodySleepThreshold(w, b, 0.5);
    for (let i = 0; i < 60; ++i) api.step(w);
    assert.equal(state(w, b).sleeping, true);
    api.setBodyAwake(w, b, true);
    api.setBodyMotionFactors(w, b, [0, 1, 0], [0, 0, 1]);
    api.setBodyLinearVelocity(w, b, [1, 2, 3]);
    api.setBodyAngularVelocity(w, b, [1, 2, 3]);
    for (let i = 0; i < 10; ++i) api.step(w);
    o.locks = state(w, b);
    vecNear(o.locks.linearVelocity, [0, 2, 0]);
    vecNear(o.locks.angularVelocity, [0, 0, 3]);
    api.destroyWorld(w);
    [w, b] = make();
    api.setBodyMass(w, b, 12);
    api.createOffsetBox(b, [0.3, -0.2, 0.4], [1, 2, 3], [0, 0, Math.sin(Math.PI / 8), Math.cos(Math.PI / 8)]);
    api.setBodyMotionFactors(w, b, [0, 1, 1], [0, 1, 1]);
    const offsetImmediate = api.applyBodyImpulse(w, b, [2, 3, 4], [1, 2, 0.5]);
    assert.equal(offsetImmediate.linearVelocity[0], 0);
    assert.equal(offsetImmediate.angularVelocity[0], 0);
    api.step(w);
    const offsetAfter = state(w, b);
    assert.equal(offsetAfter.linearVelocity[0], 0);
    assert.equal(offsetAfter.angularVelocity[0], 0);
    api.clearBodyState(w, b);
    const angularImmediate = api.applyBodyAngularImpulse(w, b, [2, 3, 4]);
    assert.equal(angularImmediate.angularVelocity[0], 0);
    api.clearBodyState(w, b);
    api.applyCenterImpulse(b, [2, 3, 4]);
    assert.equal(state(w, b).linearVelocity[0], 0);
    api.setLinearVelocity(b, [2, 3, 4]);
    assert.equal(state(w, b).linearVelocity[0], 0);
    o.immediateImpulseLocks = { offsetImmediate, offsetAfter, angularImmediate };
    api.destroyWorld(w);
    report.checks.immediateImpulseLocks = true;
    o.idCycles = [];
    w = api.createWorld([0, 0, 0]);
    for (let i = 0; i < 128; ++i) {
        b = api.createBody(w);
        sphere(w, b);
        const snapshot = state(w, b);
        api.destroyBody(b);
        assert.throws(() => api.bodyState(w, b));
        const fresh = api.createBody(w);
        assert.equal(fresh.high, b.high);
        assert.notEqual(fresh.low, b.low);
        assert.equal(snapshot.mass, 2);
        api.destroyBody(fresh);
        o.idCycles.push({ old: b, fresh });
    }
    api.destroyWorld(w);
    [w, b] = make();
    api.setBodyMass(w, b, 12);
    api.createOffsetBox(b, [2, 0, 0], [1, 2, 3], [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
    o.rotatedOffsetBox = state(w, b);
    vecNear(o.rotatedOffsetBox.localCenter, [2, 0, 0]);
    vecNear(
        [o.rotatedOffsetBox.inertia[0], o.rotatedOffsetBox.inertia[4], o.rotatedOffsetBox.inertia[8]],
        [40, 52, 20],
        0.001,
    );
    api.destroyWorld(w);
    assert.equal(api.liveBytes(), baseline);
    assert.equal(api.bridgeMemory().liveBytes, 0n);
    Object.assign(report.checks, {
        totalMassAnalytic: true,
        offsetCOMImpulse: true,
        sensorFallbackAndMixedExclusion: true,
        localForceAndTorque: true,
        dampingGrid: true,
        gravityDoesNotClearVelocity: true,
        sleepAndThresholdNative: true,
        axisLocks: true,
        fullId128Cycles: true,
        bodyBeforeColliderAndRemoval: true,
        rotatedOffsetBox: true,
        coreAndBridgeRestored: true,
    });
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
} finally {
    try {
        api.dispose();
    } catch (error) {
        report.cleanupError = error.stack;
        report.status = 'FAIL';
        process.exitCode = 1;
    }
    save();
    console.log(
        JSON.stringify({ status: report.status, error: report.error?.message, negativeCount: report.negatives.length }),
    );
}
