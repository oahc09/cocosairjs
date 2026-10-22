// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Real Node WASM world bridge; error injection is explicitly separate from physics acceptance.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { sha256 } from './verify-sources.mjs';
const dir = resolve(process.argv[2]);
const raw = resolve(dir, 'wasm-world-contract.raw.json');
assert.ok(!existsSync(raw), 'Preserve prior world qualification');
const report = {
    schemaVersion: 1,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Finite real-native T09 world bridge, not full adapter/G1/browser acceptance',
    checks: [],
    observations: {},
};
const save = () =>
    writeFileSync(raw, JSON.stringify(report, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n');
const pass = (name) => {
    report.checks.push({ name, status: 'PASS' });
    save();
};
const near = (a, b, t = 2e-5) => assert.ok(Math.abs(a - b) <= t, `${a} != ${b}`);
const zero = { liveBytes: 0n, liveAllocations: 0, shapeHandles: 0, primitiveCapacity: 0, capturedPrimitives: 0 };
try {
    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
    report.identity = manifest;
    report.fixtureSha256 = sha256(readFileSync(fileURLToPath(import.meta.url)));
    for (const a of manifest.artifacts) assert.equal(sha256(readFileSync(resolve(dir, a.path))), a.sha256);
    const { default: createModule } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')).href);
    const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')).href);
    const m = await createModule({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    const m2 = await createModule({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    let nativeCalls = 0,
        failEvent = false,
        failDebugCopy = false,
        failRelease = false;
    const proxy = new Proxy(m, {
        get(target, key) {
            if (key === '_air_b3_world_step')
                return (...args) => {
                    ++nativeCalls;
                    return target[key](...args);
                };
            if (key === '_air_b3_world_event_size' && failEvent) return () => 5;
            if (key === '_air_b3_world_debug_copy' && failDebugCopy) return () => 4;
            if (key === '_air_b3_world_debug_release' && failRelease)
                return (...args) => {
                    assert.equal(target[key](...args), 0);
                    return 5;
                };
            return Reflect.get(target, key);
        },
    });
    const a = createBox3DBinding(proxy, manifest),
        sameModule = createBox3DBinding(m, manifest),
        other = createBox3DBinding(m2, manifest);
    assert.deepEqual(a.bridgeMemory(), zero);
    const coreBaseline = a.liveBytes();
    const w = a.createWorld([0, 0, 0]),
        body = a.createBody(w, { enableSleep: false });
    const sphere = a.createSphere(body, 0.5);
    assert.deepEqual(a.stepDiagnostics(w), { nativeStepIndex: 0, nativeCompleted: false, snapshotAvailable: false });
    a.setGravity(w, [3, -6, 1.5]);
    assert.deepEqual(a.getGravity(w), [3, -6, 1.5]);
    const gravity = a.getGravity(w);
    assert.ok(Object.isFrozen(gravity));
    for (let i = 0; i < 60; ++i) a.step(w, 1 / 60, 4);
    let state = a.bodySnapshot(body);
    [3, -6, 1.5].forEach((v, i) => near(state[7 + i], v));
    report.observations.gravity = { steps: 60, gravity, body: Array.from(state), diagnostics: a.stepDiagnostics(w) };
    a.setGravity(w, [0, 0, 0]);
    const beforeVelocity = state.slice(7, 10);
    a.step(w, 1 / 60, 4);
    assert.deepEqual(a.bodySnapshot(body).slice(7, 10), beforeVelocity);
    assert.deepEqual(a.stepDiagnostics(w), { nativeStepIndex: 61, nativeCompleted: true, snapshotAvailable: true });
    pass('real gravity setter integration and zero-gravity velocity preservation');
    a.setShapeMaterial(w, sphere, { friction: 0.7, restitution: 0.35 });
    assert.deepEqual(a.getShapeMaterial(w, sphere), { friction: Math.fround(0.7), restitution: Math.fround(0.35) });
    const foreignWorld = a.createWorld(),
        foreignBody = a.createBody(foreignWorld),
        foreignShape = a.createSphere(foreignBody, 0.5);
    const externalWorld = other.createWorld(),
        externalBody = other.createBody(externalWorld),
        externalShape = other.createSphere(externalBody, 0.5);
    const sameWorld = sameModule.createWorld(),
        sameBody = sameModule.createBody(sameWorld);
    sameModule.createSphere(sameBody, 0.5);
    const before = () => ({
        body: Array.from(a.bodySnapshot(body)),
        gravity: a.getGravity(w),
        material: a.getShapeMaterial(w, sphere),
        sleep: a.isSleepingEnabled(w),
        diagnostics: a.stepDiagnostics(w),
        counts: a.worldCounts(w),
        bridge: a.bridgeMemory(w),
    });
    const invalid = [
        ...[NaN, Infinity, 1e100, 1e-100, 0, -1].map((dt) => () => a.step(w, dt, 4)),
        () => a.setGravity(w, [NaN, 0, 0]),
        () => a.setGravity(w, [Infinity, 0, 0]),
        () => a.setGravity(w, [1e100, 0, 0]),
        () => a.setGravity(w, [0, 0]),
        () => a.setSleepingEnabled(w, 1),
        ...[-1, NaN, Infinity, 1e100].map(
            (v) => () => a.setShapeMaterial(w, sphere, { friction: v, restitution: 0.4 }),
        ),
        ...[-1, NaN, Infinity, 1e100].map(
            (v) => () => a.setShapeMaterial(w, sphere, { friction: 0.4, restitution: v }),
        ),
        () => a.setShapeMaterial(w, sphere, { friction: 0.4, restitution: 0.4, rollingFriction: 1 }),
        () => a.getShapeMaterial(w, foreignShape),
        () => a.setShapeMaterial(w, foreignShape, { friction: 0, restitution: 0 }),
        () => a.getShapeMaterial(w, externalShape),
        () => a.getShapeMaterial(w, { ...sphere }),
        () => a.getGravity({ ...w }),
        () => a.getGravity(externalWorld),
        () => a.getGravity(sameWorld),
        ...[2, 3, 6, 7, 8, -1, 1.5, 2 ** 32].map((flags) => () => a.debugSnapshot(w, flags, 1)),
        ...[-1, NaN, Infinity, 1e100].map((scale) => () => a.debugSnapshot(w, 1, scale)),
    ];
    for (const attempt of invalid) {
        const saved = before(),
            calls = nativeCalls;
        assert.throws(attempt);
        assert.deepEqual(before(), saved);
        assert.equal(nativeCalls, calls);
    }
    report.observations.invalidRejections = invalid.length;
    pass('invalid preconditions leave full body/material/world/diagnostic/counters unchanged');
    const sleepWorld = a.createWorld([0, 0, 0]),
        sleeper = a.createBody(sleepWorld);
    a.createSphere(sleeper, 0.5);
    let slept = false;
    for (let i = 0; i < 120; ++i) {
        a.step(sleepWorld, 1 / 60, 4);
        slept ||= a.readStepSnapshot(sleepWorld).bodyMoves.some((x) => x.fellAsleep);
    }
    assert.ok(slept);
    assert.equal(a.isSleepingEnabled(sleepWorld), true);
    a.setSleepingEnabled(sleepWorld, false);
    assert.equal(a.isSleepingEnabled(sleepWorld), false);
    a.setGravity(sleepWorld, [0, -10, 0]);
    a.step(sleepWorld, 1 / 60, 4);
    assert.ok(a.bodySnapshot(sleeper)[8] < -0.16);
    a.setSleepingEnabled(sleepWorld, true);
    assert.equal(a.isSleepingEnabled(sleepWorld), true);
    report.observations.sleepWake = { slept, velocity: a.bodySnapshot(sleeper)[8] };
    pass('real sleeping solver set wakes when world sleeping is disabled');
    // Independent analytic transformed corners and offset sphere, not debugDraw self-comparison.
    const dw = a.createWorld([0, 0, 0]),
        angle = 0.37,
        q = [0, 0, Math.sin(angle / 2), Math.cos(angle / 2)],
        origin = [2, -1, 0.4],
        offset = [0.3, -0.2, 0.1];
    const db = a.createBody(dw, { type: 0, position: origin, rotation: q }),
        ds = a.createOffsetSphere(db, offset, 0.75);
    const rot = (v) => [
        Math.cos(angle) * v[0] - Math.sin(angle) * v[1],
        Math.sin(angle) * v[0] + Math.cos(angle) * v[1],
        v[2],
    ];
    const xf = (v) => rot(v).map((x, i) => x + origin[i]);
    const center = xf(offset);
    const circles = a.debugSnapshot(dw, 1, 0.25);
    assert.equal(circles.primitives.length, 72);
    assert.equal(circles.supportedFlags, 5);
    for (const line of circles.primitives) {
        assert.equal(line.kind, 'line');
        for (const p of [line.from, line.to]) near(Math.hypot(...p.map((x, i) => x - center[i])), 0.75);
    }
    assert.deepEqual(a.debugSnapshot(dw, 1, 7).primitives, circles.primitives);
    assert.equal(a.debugSnapshot(dw, 1, 7).jointScale, 7);
    const bounds = a.debugSnapshot(dw, 4, 1);
    assert.equal(bounds.primitives.length, 1);
    const bb = bounds.primitives[0];
    assert.equal(bb.kind, 'bounds');
    center.forEach((v, i) => {
        assert.ok(bb.lower[i] <= v - 0.75 + 2e-5);
        assert.ok(bb.upper[i] >= v + 0.75 - 2e-5);
    });
    const disabled = a.debugSnapshot(dw, 0, 1);
    assert.deepEqual(disabled.primitives, []);
    assert.equal(a.bridgeMemory(dw).primitiveCapacity, 0);
    const boxBody = a.createBody(dw, { type: 0, position: [-2, 1, 0.2], rotation: q });
    const box = a.createBox(boxBody, [0.5, 0.8, 1.2]);
    const all = a.debugSnapshot(dw, 5, 1);
    assert.equal(all.primitives.filter((x) => x.kind === 'line').length, 84);
    assert.equal(all.primitives.filter((x) => x.kind === 'bounds').length, 2);
    const boxLines = all.primitives.filter((x) => x.kind === 'line' && x.from[0] < 0 && x.to[0] < 0);
    assert.equal(boxLines.length, 12);
    const corners = [];
    for (const x of [-0.5, 0.5])
        for (const y of [-0.8, 0.8])
            for (const z of [-1.2, 1.2]) corners.push(rot([x, y, z]).map((v, i) => v + [-2, 1, 0.2][i]));
    for (const line of boxLines)
        for (const p of [line.from, line.to])
            assert.ok(corners.some((c) => Math.hypot(...c.map((v, i) => v - p[i])) < 2e-5));
    assert.ok(Object.isFrozen(all) && Object.isFrozen(all.primitives) && Object.isFrozen(all.primitives[0]));
    const saved = JSON.stringify(all),
        oldBuffer = m.HEAPU8.buffer,
        heapBefore = oldBuffer.byteLength,
        ptr = m._malloc(oldBuffer.byteLength + 65536);
    assert.ok(ptr);
    assert.notEqual(m.HEAPU8.buffer, oldBuffer);
    m._free(ptr);
    assert.equal(JSON.stringify(all), saved);
    assert.deepEqual(a.debugSnapshot(dw, 5, 1), all);
    report.observations.debug = {
        sphere: circles,
        bounds,
        boxAndSphere: all,
        heapBefore,
        heapAfter: m.HEAPU8.buffer.byteLength,
        bridge: a.bridgeMemory(dw),
    };
    pass(
        'real callbacks match finite independent sphere/corner oracle, flag0, scale semantics, copied immutability and heap growth',
    );
    const otherBefore = other.bridgeMemory(),
        sameBefore = sameModule.bridgeMemory();
    sameModule.debugSnapshot(sameWorld, 1, 1);
    assert.deepEqual(other.bridgeMemory(), otherBefore);
    assert.equal(a.bridgeMemory(dw).shapeHandles, 2);
    assert.equal(sameModule.bridgeMemory(sameWorld).shapeHandles, 1);
    failDebugCopy = true;
    assert.throws(() => a.debugSnapshot(dw, 5, 1));
    failDebugCopy = false;
    assert.equal(a.bridgeMemory(dw).primitiveCapacity, 0);
    failRelease = true;
    assert.throws(() => a.debugSnapshot(dw, 5, 1), { code: 'AIR_E_BOX3D_CLEANUP' });
    failRelease = false;
    assert.equal(a.bridgeMemory(dw).primitiveCapacity, 0);
    assert.equal(JSON.stringify(all), saved);
    report.observations.errorInjection =
        'Proxy injects debug copy error or cleanup status AFTER actual release; all geometry still came from real native callbacks.';
    a.destroyShape(ds);
    assert.equal(a.bridgeMemory(dw).shapeHandles, 1);
    a.destroyBody(boxBody);
    assert.equal(a.bridgeMemory(dw).shapeHandles, 0);
    a.destroyWorld(dw);
    assert.equal(JSON.stringify(all), saved);
    assert.throws(() => a.bridgeMemory(dw));
    assert.throws(() => a.getShapeMaterial(dw, box));
    pass(
        'shape/body/world cleanup, same-module facade isolation, module isolation and explicit copy/cleanup error propagation',
    );
    const fw = a.createWorld([0, -10, 0]),
        fb = a.createBody(fw, { enableSleep: false });
    a.createSphere(fb, 0.5);
    const callsBefore = nativeCalls;
    failEvent = true;
    assert.throws(() => a.step(fw, 0.1, 1), { code: 'AIR_E_BOX3D_SNAPSHOT_UNAVAILABLE' });
    failEvent = false;
    assert.equal(nativeCalls, callsBefore + 1);
    assert.deepEqual(a.stepDiagnostics(fw), { nativeStepIndex: 1, nativeCompleted: true, snapshotAvailable: false });
    near(a.bodySnapshot(fb)[8], -1);
    assert.throws(() => a.readStepSnapshot(fw));
    const diagnostic = a.stepDiagnostics(fw);
    assert.throws(() => a.step(fw, NaN, 1));
    assert.deepEqual(a.stepDiagnostics(fw), diagnostic);
    assert.equal(nativeCalls, callsBefore + 1);
    a.step(fw, 0.1, 1);
    assert.equal(nativeCalls, callsBefore + 2);
    near(a.bodySnapshot(fb)[8], -2);
    assert.deepEqual(a.stepDiagnostics(fw), { nativeStepIndex: 2, nativeCompleted: true, snapshotAvailable: true });
    report.observations.stepCopyFailure = {
        first: diagnostic,
        recovery: a.stepDiagnostics(fw),
        nativeCalls: 2,
        finalVelocity: a.bodySnapshot(fb)[8],
    };
    pass('confirmed native success increments once even when copy fails; diagnostics never re-step');
    // Isolated source qualification initializer only: no product test setter/escape hatch.
    const source = readFileSync(resolve(dir, 'facade.mjs'), 'utf8');
    assert.equal((source.match(/step: 0,/g) || []).length, 1);
    const boundarySource = source.replace('step: 0,', 'step: Number.MAX_SAFE_INTEGER,');
    const boundaryPath = resolve(dir, 'qualification-step-overflow.mjs');
    writeFileSync(boundaryPath, boundarySource, { flag: 'wx' });
    const { createBox3DBinding: boundaryFactory } = await import(pathToFileURL(boundaryPath).href);
    const boundary = boundaryFactory(proxy, manifest),
        bw = boundary.createWorld();
    const prior = nativeCalls;
    const beforeBoundary = boundary.stepDiagnostics(bw);
    assert.throws(() => boundary.step(bw), { code: 'AIR_E_BOX3D_CAPACITY' });
    assert.equal(nativeCalls, prior);
    assert.deepEqual(boundary.stepDiagnostics(bw), beforeBoundary);
    report.observations.overflowQualification = {
        sourceSha256: sha256(source),
        qualifiedSourceSha256: sha256(boundarySource),
        onlyChange: 'world initialization step: 0 -> Number.MAX_SAFE_INTEGER',
        nativeInvocations: 0,
    };
    boundary.dispose();
    pass('isolated safe-integer boundary rejects before any native invocation');
    for (let i = 0; i < 32; ++i) {
        const cw = a.createWorld([0, 0, 0]),
            cb = a.createBody(cw),
            cs = a.createSphere(cb, 0.5);
        a.debugSnapshot(cw, 1, 1);
        assert.equal(a.bridgeMemory(cw).shapeHandles, 1);
        a.destroyWorld(cw);
        assert.throws(() => a.getShapeMaterial(cw, cs));
    }
    for (const world of [w, foreignWorld, sleepWorld, fw]) a.destroyWorld(world);
    sameModule.dispose();
    other.dispose();
    assert.deepEqual(a.bridgeMemory(), zero);
    assert.equal(a.liveBytes(), coreBaseline);
    a.dispose();
    report.observations.finalBridge = zero;
    report.observations.sameModuleBefore = sameBefore;
    pass('32 real debug lifetime loops finish with zero owned bridge allocations and core baseline');
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
}
report.completedAt = new Date().toISOString();
save();
console.log(JSON.stringify({ status: report.status, checks: report.checks.length, raw }));
