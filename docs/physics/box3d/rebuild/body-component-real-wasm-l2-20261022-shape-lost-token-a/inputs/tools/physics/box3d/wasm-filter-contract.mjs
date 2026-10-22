// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Actual WASM dynamics and copied state. Explicit wrappers qualify failure protocol, not spontaneous native faults.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sha256 } from './verify-sources.mjs';
const dir = resolve(process.argv[2]),
    dest = resolve(dir, 'wasm-filter-contract.raw.json');
assert.ok(!existsSync(dest));
const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')));
const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')));
const wasmBinary = readFileSync(resolve(dir, 'box3d-st.wasm'));
const module = await factory({ wasmBinary }),
    secondModule = await factory({ wasmBinary });
const api = createBox3DBinding(module, manifest),
    other = createBox3DBinding(secondModule, manifest);
const report = {
    status: 'RUNNING',
    identity: api.identity,
    fixtureSha256: sha256(readFileSync(fileURLToPath(import.meta.url))),
    checks: {},
    observations: {},
    negatives: [],
    injectedMechanisms: [],
};
const o = report.observations;
const serialized = (v) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x));
const errorOf = (action, outcome) => {
    let error;
    try {
        action();
    } catch (e) {
        error = e;
    }
    assert.ok(error, 'Expected rejection');
    assert.equal(error.mutationOutcome, outcome);
    const descriptor = Object.getOwnPropertyDescriptor(error, 'mutationOutcome');
    if (outcome !== undefined) {
        assert.equal(descriptor.writable, false);
        assert.equal(descriptor.configurable, false);
        assert.throws(() => {
            error.mutationOutcome = 'forged';
        }, TypeError);
    }
    return { code: error.code, message: error.message, mutationOutcome: error.mutationOutcome, descriptor };
};
try {
    const baseline = api.liveBytes();
    const w = api.createWorld([0, 0, 0]),
        b = api.createBody(w);
    const shapes = [
        api.createSphere(b, 0.5),
        api.createBox(b, [1, 1, 1]),
        api.createOffsetSphere(b, [3, 0, 0], 0.5, 1, true),
        api.createOffsetBox(b, [6, 0, 0], [1, 1, 1]),
    ];
    const massBody = api.createBody(w);
    api.setBodyMass(w, massBody, 2);
    shapes.push(
        api.createSphere(massBody, 0.5),
        api.createOffsetBox(massBody, [2, 0, 0], [1, 1, 1], [0, 0, 0, 1], 1, true),
    );
    o.defaults = shapes.map((s) => api.getShapeFilter(w, s));
    for (const f of o.defaults) assert.deepEqual(f, { group: 1, mask: 4294967295 });
    o.bitsets = [];
    for (const bits of [0, -1, -2147483648, 2147483648, 4294967295]) {
        const actual = api.setShapeFilters(w, shapes, { group: bits, mask: bits });
        assert.ok(Object.isFrozen(actual));
        for (let i = 0; i < shapes.length; ++i) {
            assert.deepEqual(actual[i], { group: bits >>> 0, mask: bits >>> 0 });
            assert.deepEqual(api.getShapeFilter(w, shapes[i]), actual[i]);
            assert.ok(Object.isFrozen(actual[i]));
        }
        o.bitsets.push({ input: bits, actual });
    }
    report.checks.bitsetsAndDefaults = true;
    api.step(w);
    const retained = api.readStepSnapshot(w),
        retainedText = serialized(retained);
    const foreignWorld = api.createWorld([0, 0, 0]),
        foreignBody = api.createBody(foreignWorld),
        foreignShape = api.createSphere(foreignBody, 0.5);
    const moduleWorld = other.createWorld([0, 0, 0]),
        moduleBody = other.createBody(moduleWorld),
        moduleShape = other.createSphere(moduleBody, 0.5);
    const before = () => ({
        filters: shapes.map((s) => api.getShapeFilter(w, s)),
        states: [api.bodyState(w, b), api.bodyState(w, massBody)],
        diagnostics: api.stepDiagnostics(w),
        counts: api.worldCounts(w),
        core: api.liveBytes(),
        bridge: api.bridgeMemory(),
    });
    const reject = (label, action) => {
        const initial = before(),
            snapshot = api.readStepSnapshot(w);
        const error = errorOf(action, 'not-mutated');
        assert.deepEqual(before(), initial, label);
        assert.equal(api.readStepSnapshot(w), snapshot);
        report.negatives.push({ label, error, before: initial });
    };
    for (const bits of [NaN, Infinity, -Infinity, 1.5, -2147483649, 4294967296, '1', null, true])
        for (const field of ['group', 'mask'])
            reject(`${field}:${String(bits)}`, () =>
                api.setShapeFilters(w, shapes, { group: 1, mask: -1, [field]: bits }),
            );
    reject('duplicate', () => api.setShapeFilters(w, [shapes[0], shapes[0]], { group: 2, mask: 3 }));
    reject('foreign-world-last', () => api.setShapeFilters(w, [...shapes, foreignShape], { group: 2, mask: 3 }));
    reject('foreign-module-last', () => api.setShapeFilters(w, [...shapes, moduleShape], { group: 2, mask: 3 }));
    reject('forged-last', () => api.setShapeFilters(w, [...shapes, { ...shapes[0] }], { group: 2, mask: 3 }));
    reject('capacity', () => api.setShapeFilters(w, Array(4097).fill(shapes[0]), { group: 2, mask: 3 }));
    const emptyBefore = before();
    assert.deepEqual(api.setShapeFilters(w, [], { group: 0, mask: 0 }), []);
    assert.deepEqual(before(), emptyBefore);
    assert.equal(api.readStepSnapshot(w), retained);
    // Native late invalid ID and output-capacity rejection leave prior filters/output canaries untouched.
    const ptr = module._malloc(128);
    assert.ok(ptr);
    module.HEAPU32.set([shapes[0].low, shapes[0].high, foreignShape.low, foreignShape.high], ptr >>> 2);
    module.HEAPU32.fill(0xdeadbeef, (ptr + 32) >>> 2, (ptr + 48) >>> 2);
    const canary = module.HEAPU32.slice((ptr + 32) >>> 2, (ptr + 48) >>> 2),
        initial = before();
    assert.equal(module._air_b3_shape_filters_set(w.id, ptr, 2, 2, 3, ptr + 32, 4), 1);
    assert.equal(module._air_b3_shape_filters_set(w.id, ptr, 2, 2, 3, ptr + 32, 3), 4);
    assert.deepEqual(module.HEAPU32.slice((ptr + 32) >>> 2, (ptr + 48) >>> 2), canary);
    assert.deepEqual(before(), initial);
    module._free(ptr);
    report.checks.batchAdmissionAtomic = true;
    const copied = api.setShapeFilters(w, shapes, { group: -2147483648, mask: -1 }),
        copiedText = serialized(copied);
    assert.throws(() => api.readStepSnapshot(w), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
    const oldBuffer = module.HEAPU8.buffer,
        oldBytes = module.HEAPU8.length,
        growth = module._malloc(oldBytes + 65536);
    assert.ok(growth);
    assert.notEqual(module.HEAPU8.buffer, oldBuffer);
    assert.ok(module.HEAPU8.length > oldBytes);
    module._free(growth);
    o.heapGrowth = { beforeBytes: oldBytes, afterBytes: module.HEAPU8.length };
    assert.equal(serialized(copied), copiedText);
    assert.equal(serialized(retained), retainedText);
    assert.throws(() => {
        copied[0].group = 99;
    }, TypeError);
    report.checks.copiesAndGrowth = true;
    o.reuse = [];
    for (let i = 0; i < 128; ++i) {
        const old = api.createSphere(b, 0.1);
        api.setShapeFilter(w, old, { group: -1, mask: 0 });
        api.destroyShape(old);
        const next = api.createSphere(b, 0.1);
        assert.equal(next.high, old.high);
        assert.notEqual(next.low, old.low);
        assert.deepEqual(api.getShapeFilter(w, next), { group: 1, mask: 4294967295 });
        const error = errorOf(() => api.setShapeFilter(w, old, { group: 1, mask: 1 }), 'not-mutated');
        o.reuse.push({ old, next, error });
        api.destroyShape(next);
    }
    report.checks.fullIdReuse = true;
    api.destroyWorld(w);
    api.destroyWorld(foreignWorld);
    other.destroyWorld(moduleWorld);
    assert.equal(serialized(copied), copiedText);
    assert.equal(serialized(retained), retainedText);

    const cw = api.createWorld(),
        floor = api.createBody(cw, { type: 0, position: [0, -0.5, 0] }),
        floorShape = api.createBox(floor, [10, 0.5, 10]);
    const ball = api.createBody(cw, { position: [0, 2, 0] }),
        ballShape = api.createSphere(ball, 0.5);
    api.configureShapeEvents(ballShape, { contact: true });
    api.setShapeFilter(cw, floorShape, { group: -2147483648, mask: 1 });
    api.setShapeFilter(cw, ballShape, { group: 1, mask: -2147483648 });
    o.contactTrace = [];
    let begin = 0;
    for (let tick = 1; tick <= 600; ++tick) {
        api.step(cw);
        const snapshot = api.readStepSnapshot(cw),
            state = api.bodyState(cw, ball);
        begin += snapshot.contactBegins.length;
        o.contactTrace.push({
            tick,
            begins: snapshot.contactBegins.length,
            ends: snapshot.contactEnds.length,
            contacts: snapshot.contactsOfOwnedBodies.length,
            sleeping: state.sleeping,
            y: state.worldCenter[1],
        });
    }
    assert.ok(begin > 0);
    assert.equal(api.bodyState(cw, ball).sleeping, true);
    const sleeping = api.readStepSnapshot(cw),
        sleepingText = serialized(sleeping),
        priorIndex = api.stepDiagnostics(cw).nativeStepIndex;
    assert.ok(sleeping.contactsOfOwnedBodies.length > 0);
    api.setShapeFilter(cw, ballShape, { group: 1, mask: 0 });
    assert.equal(api.bodyState(cw, ball).awake, true);
    assert.equal(api.stepDiagnostics(cw).nativeStepIndex, priorIndex);
    assert.throws(() => api.readStepSnapshot(cw), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
    assert.equal(serialized(sleeping), sleepingText);
    api.step(cw);
    const suppressed = api.readStepSnapshot(cw);
    assert.equal(suppressed.contactsOfOwnedBodies.length, 0);
    api.setShapeFilter(cw, ballShape, { group: 1, mask: -2147483648 });
    let resumed;
    for (let tick = 0; tick < 20; ++tick) {
        api.step(cw);
        const s = api.readStepSnapshot(cw);
        if (s.contactBegins.length) {
            resumed = s;
            break;
        }
    }
    assert.ok(resumed && resumed.contactsOfOwnedBodies.length > 0);
    o.contactTransition = { sleeping, suppressed, resumed, finalDiagnostics: api.stepDiagnostics(cw) };
    report.checks.contactNextStep = true;
    report.checks.sleepWake = true;
    api.destroyWorld(cw);
    assert.equal(serialized(sleeping), sleepingText);

    const sw = api.createWorld([0, 0, 0]),
        sensorBody = api.createBody(sw, { type: 0 }),
        sensor = api.createOffsetSphere(sensorBody, [0, 0, 0], 2, 1, true);
    const visitorBody = api.createBody(sw, { position: [0.5, 0, 0] }),
        visitor = api.createSphere(visitorBody, 0.5);
    api.configureShapeEvents(visitor, { sensor: true });
    api.step(sw);
    const enter = api.readStepSnapshot(sw);
    assert.equal(enter.sensorBegins.length, 1);
    const enterText = serialized(enter),
        sensorIndex = api.stepDiagnostics(sw).nativeStepIndex;
    api.setShapeFilter(sw, sensor, { group: 1, mask: 0 });
    assert.equal(api.stepDiagnostics(sw).nativeStepIndex, sensorIndex);
    assert.throws(() => api.readStepSnapshot(sw), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
    api.step(sw);
    const exit = api.readStepSnapshot(sw);
    assert.equal(exit.sensorEnds.length, 1);
    api.setShapeFilter(sw, sensor, { group: 1, mask: -1 });
    api.step(sw);
    const reenter = api.readStepSnapshot(sw);
    assert.equal(reenter.sensorBegins.length, 1);
    o.sensorTransition = { enter, exit, reenter };
    assert.equal(serialized(enter), enterText);
    api.destroyWorld(sw);
    report.checks.sensorNextStep = true;

    const mw = api.createWorld([0, 0, 0]),
        mb = api.createBody(mw);
    api.setBodyMass(mw, mb, 2);
    const ms = api.createSphere(mb, 0.5);
    const staticBody = api.createBody(mw, { type: 0 });
    api.step(mw);
    const stateCapture = () => ({
        body: api.bodyState(mw, mb),
        staticBody: api.bodyState(mw, staticBody),
        diagnostics: api.stepDiagnostics(mw),
        filter: api.getShapeFilter(mw, ms),
    });
    o.outcomes = [];
    for (const [name, action] of [
        ['boolean', () => api.setBodyEnabled(mw, mb, 1)],
        ['native-static-velocity-status8', () => api.setBodyLinearVelocity(mw, staticBody, [1, 0, 0])],
        ['native-mass-tensor-overflow-status2', () => api.setBodyMass(mw, mb, 3e38)],
        ['negative-mass', () => api.setBodyMass(mw, mb, -1)],
        ['force-NaN', () => api.applyBodyForce(mw, mb, [NaN, 0, 0])],
    ]) {
        const before = stateCapture(),
            snapshot = api.readStepSnapshot(mw),
            error = errorOf(action, 'not-mutated');
        assert.deepEqual(stateCapture(), before);
        assert.equal(api.readStepSnapshot(mw), snapshot);
        o.outcomes.push({ name, error, before });
    }
    const originalState = module._air_b3_body_state,
        originalControl = module._air_b3_body_control,
        originalFilter = module._air_b3_shape_filters_set;
    const beforeCopy = api.stepDiagnostics(mw);
    let realStateCalls = 0;
    module._air_b3_body_state = (...args) => {
        const status = originalState(...args);
        assert.equal(status, 0);
        ++realStateCalls;
        return 1;
    };
    let committedBody;
    try {
        committedBody = errorOf(() => api.setBodyGravityScale(mw, mb, 3), 'committed');
    } finally {
        module._air_b3_body_state = originalState;
    }
    assert.equal(realStateCalls, 1);
    assert.equal(api.bodyState(mw, mb).gravityScale, 3);
    assert.equal(api.stepDiagnostics(mw).nativeStepIndex, beforeCopy.nativeStepIndex);
    assert.equal(api.stepDiagnostics(mw).snapshotAvailable, false);
    o.outcomes.push({
        name: 'body-post-native-readback-injected-status',
        error: committedBody,
        realStateCalls,
        after: stateCapture(),
    });
    report.injectedMechanisms.push(
        'Body state wrapper called actual native readback then returned status1 after real mutator succeeded; no spontaneous native failure claim.',
    );
    api.step(mw);
    const beforeUnknown = api.stepDiagnostics(mw);
    let realControlCalls = 0;
    module._air_b3_body_control = (...args) => {
        const status = originalControl(...args);
        assert.equal(status, 0);
        ++realControlCalls;
        throw new Error('injected after native commit before status delivery');
    };
    let unknownBody;
    try {
        unknownBody = errorOf(() => api.setBodyGravityScale(mw, mb, 4), undefined);
    } finally {
        module._air_b3_body_control = originalControl;
    }
    assert.equal(realControlCalls, 1);
    assert.equal(api.bodyState(mw, mb).gravityScale, 4);
    assert.equal(api.stepDiagnostics(mw).nativeStepIndex, beforeUnknown.nativeStepIndex);
    assert.equal(api.stepDiagnostics(mw).snapshotAvailable, false);
    o.outcomes.push({
        name: 'body-native-call-throw-unknown',
        error: unknownBody,
        realControlCalls,
        after: stateCapture(),
    });
    report.injectedMechanisms.push(
        'Body wrapper called actual native mutation then threw before status delivery; outcome intentionally unknown, snapshot conservatively invalidated.',
    );
    report.checks.bodyMutationOutcome = true;
    api.step(mw);
    const beforeFilter = api.stepDiagnostics(mw),
        originalHeap = module.HEAPU32;
    let realFilterCalls = 0;
    module._air_b3_shape_filters_set = (...args) => {
        const status = originalFilter(...args);
        assert.equal(status, 0);
        ++realFilterCalls;
        module.HEAPU32 = new Proxy(originalHeap, {
            get(target, property) {
                if (property === 'slice')
                    return () => {
                        throw new Error('injected filter copy failure');
                    };
                return Reflect.get(target, property, target);
            },
        });
        return status;
    };
    let committedFilter;
    try {
        committedFilter = errorOf(() => api.setShapeFilter(mw, ms, { group: 32, mask: 64 }), 'committed');
    } finally {
        module._air_b3_shape_filters_set = originalFilter;
        module.HEAPU32 = originalHeap;
    }
    assert.equal(realFilterCalls, 1);
    assert.deepEqual(api.getShapeFilter(mw, ms), { group: 32, mask: 64 });
    assert.equal(api.stepDiagnostics(mw).nativeStepIndex, beforeFilter.nativeStepIndex);
    assert.equal(api.stepDiagnostics(mw).snapshotAvailable, false);
    o.outcomes.push({
        name: 'filter-post-commit-js-copy-failure',
        error: committedFilter,
        realFilterCalls,
        after: stateCapture(),
    });
    report.injectedMechanisms.push(
        'Filter wrapper called actual batch native mutation, then HEAPU32.slice proxy throws during copied readback; no fabricated filter values.',
    );
    api.step(mw);
    const beforeFilterUnknown = api.stepDiagnostics(mw);
    realFilterCalls = 0;
    module._air_b3_shape_filters_set = (...args) => {
        const status = originalFilter(...args);
        assert.equal(status, 0);
        ++realFilterCalls;
        throw new Error('injected filter native status delivery failure');
    };
    let unknownFilter;
    try {
        unknownFilter = errorOf(() => api.setShapeFilter(mw, ms, { group: 64, mask: 32 }), undefined);
    } finally {
        module._air_b3_shape_filters_set = originalFilter;
    }
    assert.equal(realFilterCalls, 1);
    assert.deepEqual(api.getShapeFilter(mw, ms), { group: 64, mask: 32 });
    assert.equal(api.stepDiagnostics(mw).nativeStepIndex, beforeFilterUnknown.nativeStepIndex);
    assert.equal(api.stepDiagnostics(mw).snapshotAvailable, false);
    o.outcomes.push({
        name: 'filter-native-call-throw-unknown',
        error: unknownFilter,
        realFilterCalls,
        after: stateCapture(),
    });
    report.checks.filterMutationOutcome = true;
    api.destroyWorld(mw);
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
        } catch (e) {
            report.cleanupError = e.stack;
            report.status = 'FAIL';
            process.exitCode = 1;
        }
    writeFileSync(dest, JSON.stringify(report, (_, x) => (typeof x === 'bigint' ? x.toString() : x), 2) + '\n');
    console.log(
        JSON.stringify({
            status: report.status,
            checks: report.checks,
            negatives: report.negatives.length,
            error: report.error?.message,
        }),
    );
}
