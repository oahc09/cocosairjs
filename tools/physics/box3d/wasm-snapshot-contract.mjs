// Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
// Real freshly built WASM only. Preserves partial/failure diagnostics, never mocks contacts.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { root, sha256 } from './verify-sources.mjs';

const dir = resolve(process.argv[2]);
const reportPath = resolve(dir, 'wasm-snapshot-contract.raw.json');
assert.ok(!existsSync(reportPath), 'Preserve previous raw snapshots');
const report = {
    schemaVersion: 1,
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    scope: 'Finite copied batch/event/raw-manifold contract, not complete T07/C21/C22/G1',
    limitations: [
        'Generic contact world/local-point reconstruction remains explicitly unsupported: cached anchor epoch is unproven.',
        'Rotating/eccentric diagnostics record pre/post poses without asserting either as a universal anchor basis.',
        'Sensor fixture is a slow thick-sensor crossing, not transient CCD acceptance.',
        'Sleeping pairs are real b3Body_GetContactData touching contacts, not synthetic stay events.',
    ],
    checks: [],
    observations: {},
    diagnostics: {},
};
const persist = () => writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
const record = (name, detail = true) => {
    report.checks.push({ name, result: 'PASS', detail });
    persist();
};
const sameId = (a, b) => a.low === b.low && a.high === b.high;
try {
    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
    report.identity = {
        coreSha: manifest.coreSha,
        schemaSha256: manifest.schemaSha256,
        patchChainSha256: manifest.patchChainSha256,
    };
    report.inputs = {
        fixture: sha256(readFileSync(fileURLToPath(import.meta.url))),
        manifest: sha256(readFileSync(resolve(dir, 'manifest.json'))),
    };
    for (const artifact of manifest.artifacts)
        assert.equal(sha256(readFileSync(resolve(dir, artifact.path))), artifact.sha256);
    const { default: createModule } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')).href);
    const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')).href);
    const module = await createModule({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    const a = createBox3DBinding(module, manifest);
    const otherModule = await createModule({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    const other = createBox3DBinding(otherModule, manifest);
    const baseline = a.liveBytes();
    const world = a.createWorld([0, 0, 0]);
    assert.throws(() => a.readStepSnapshot(world), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
    const bodies = Array.from({ length: 64 }, (_, i) =>
        a.createBody(world, { type: 1, position: [10 + i, i / 4, 0], linearVelocity: [0.1, 0, 0], enableSleep: false }),
    );
    const before = a.bodyTransforms(world, bodies);
    assert.equal(before.length, 640);
    for (let i = 0; i < bodies.length; ++i) {
        const one = a.bodySnapshot(bodies[i]);
        assert.deepEqual(Array.from(before.slice(10 * i, 10 * i + 10)), [...one.slice(0, 7), ...one.slice(13, 16)]);
    }
    a.step(world);
    const first = a.readStepSnapshot(world);
    assert.equal(first.bodyMoves.length, 64);
    assert.equal(first.bodyPosesBefore.length, 64);
    assert.equal(first.bodyPosesAfter.length, 64);
    for (const move of first.bodyMoves) {
        const after = first.bodyPosesAfter.find((row) => sameId(row.body, move.body));
        assert.ok(after);
        assert.deepEqual(move.transform, after.pose.slice(0, 7));
    }
    assert.equal(a.readStepSnapshot(world), first);
    assert.ok(Object.isFrozen(first.bodyMoves[0].transform));
    assert.throws(() => {
        first.bodyMoves[0].transform[0] = 99;
    }, TypeError);
    const serialized = JSON.stringify(first);
    const originalBatch = Array.from(before);
    for (let growth = 0; growth < 2; ++growth) {
        const oldBuffer = module.HEAPU8.buffer;
        const ptr = module._malloc(oldBuffer.byteLength + 65536);
        assert.ok(ptr);
        assert.notEqual(module.HEAPU8.buffer, oldBuffer);
        module._free(ptr);
        assert.equal(JSON.stringify(first), serialized);
        assert.deepEqual(Array.from(before), originalBatch);
        assert.equal(a.readStepSnapshot(world), first);
    }
    a.step(world);
    assert.equal(JSON.stringify(first), serialized);
    assert.equal(a.readStepSnapshot(world).stepIndex, 2);
    assert.notDeepEqual(Array.from(a.bodyTransforms(world, bodies)), originalBatch);
    record('64-body-native-batch-and-2-real-heap-grows-with-immutable-step-data');
    const foreignWorld = a.createWorld([0, 0, 0]);
    const foreignBody = a.createBody(foreignWorld);
    const moduleWorld = other.createWorld([0, 0, 0]);
    const moduleBody = other.createBody(moduleWorld);
    const stateBeforeReject = JSON.stringify(a.readStepSnapshot(world));
    const batchBeforeReject = a.bodyTransforms(world, bodies);
    for (const bad of [foreignBody, moduleBody, { ...bodies[0] }]) {
        assert.throws(() => a.bodyTransforms(world, [bodies[0], bad]), { code: 'AIR_E_BOX3D_DISPOSED' });
        assert.equal(JSON.stringify(a.readStepSnapshot(world)), stateBeforeReject);
        assert.deepEqual(a.bodyTransforms(world, bodies), batchBeforeReject);
    }
    a.destroyBody(bodies.at(-1));
    assert.throws(() => a.bodyTransforms(world, bodies), { code: 'AIR_E_BOX3D_DISPOSED' });
    assert.throws(() => a.readStepSnapshot(world), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
    assert.equal(JSON.stringify(first), serialized);
    // Native batch validation must reject the complete mixed-ID batch before any output write.
    const ptr = module._malloc(256);
    module.HEAPU32.set([bodies[0].low, bodies[0].high, foreignBody.low, foreignBody.high], ptr >>> 2);
    module.HEAPU32.fill(0x7fc12345, (ptr + 32) >>> 2, (ptr + 112) >>> 2);
    const canary = module.HEAPU32.slice((ptr + 32) >>> 2, (ptr + 112) >>> 2);
    assert.equal(module._air_b3_body_transforms(world.id, ptr, 2, ptr + 32), 1);
    assert.deepEqual(module.HEAPU32.slice((ptr + 32) >>> 2, (ptr + 112) >>> 2), canary);
    module._free(ptr);
    record('foreign-world-module-forged-stale-batch-and-native-no-partial-write');
    a.destroyWorld(world);
    a.destroyWorld(foreignWorld);
    other.destroyWorld(moduleWorld);
    assert.throws(() => a.readStepSnapshot(world), { code: 'AIR_E_BOX3D_DISPOSED' });
    assert.equal(JSON.stringify(first), serialized);

    const contactWorld = a.createWorld();
    const floor = a.createBody(contactWorld, { type: 0, position: [0, -0.5, 0] });
    const floorShape = a.createBox(floor, [10, 0.5, 10]);
    const ball = a.createBody(contactWorld, { position: [0, 2, 0] });
    const ballShape = a.createSphere(ball, 0.5);
    a.configureShapeEvents(ballShape, { contact: true, hit: true, sensor: true });
    let maxNormalImpulse = 0;
    let begins = 0;
    let hits = 0;
    let asleep = 0;
    let firstContact;
    let sleeping;
    for (let tick = 1; tick <= 600; ++tick) {
        a.step(contactWorld);
        const snapshot = a.readStepSnapshot(contactWorld);
        for (const c of snapshot.contactsOfOwnedBodies)
            for (const m of c.manifolds)
                for (const p of m.points) maxNormalImpulse = Math.max(maxNormalImpulse, p.normalImpulse);
        begins += snapshot.contactBegins.length;
        hits += snapshot.contactHits.length;
        asleep += snapshot.bodyMoves.filter((event) => event.fellAsleep).length;
        if (!firstContact && snapshot.contactsOfOwnedBodies.length) {
            firstContact = snapshot;
            const contact = snapshot.contactsOfOwnedBodies[0];
            assert.equal(a.readContactSnapshot(contact.handle), contact);
            assert.throws(() => a.contactWorldPoints(contact.handle), {
                code: 'AIR_E_BOX3D_UNSUPPORTED_SNAPSHOT_EPOCH',
            });
            assert.throws(() => a.readContactSnapshot({ ...contact.handle }), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
            assert.throws(() => other.readContactSnapshot(contact.handle), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
            assert.ok(contact.manifolds.length > 0 && contact.manifolds[0].points.length > 0);
            assert.ok(contact.manifolds[0].normalAtoB[1] * (sameId(contact.shapeA, floorShape) ? 1 : -1) > 0.9);
            assert.ok(contact.manifolds.every((m) => Math.abs(Math.hypot(...m.normalAtoB) - 1) < 1e-5));
        }
        if (snapshot.contactsOfOwnedBodies.some((c) => !c.awakeA && !c.awakeB)) sleeping = snapshot;
    }
    assert.ok(maxNormalImpulse > 0);
    assert.equal(begins, 1);
    assert.ok(hits >= 1);
    assert.ok(asleep >= 1);
    assert.ok(sleeping);
    assert.equal(sleeping.contactBegins.length, 0);
    assert.equal(sleeping.bodyMoves.length, 0);
    assert.equal(sleeping.contactsOfOwnedBodies.length, 1);
    assert.throws(() => a.readContactSnapshot(firstContact.contactsOfOwnedBodies[0].handle), {
        code: 'AIR_E_BOX3D_STALE_SNAPSHOT',
    });
    const current = a.readStepSnapshot(contactWorld);
    const contact = current.contactsOfOwnedBodies[0];
    const retained = JSON.stringify(current);
    const firstRetained = JSON.stringify(firstContact);
    // Actual native readers reject insufficient capacity without changing output.
    const small = module._malloc(64);
    module.HEAPU32.fill(0x12345678, small >>> 2, (small >>> 2) + 16);
    assert.equal(module._air_b3_world_events(contactWorld.id, small, 1), 4);
    assert.equal(module._air_b3_body_contacts(contactWorld.id, ball.low, ball.high, small, 1), 4);
    assert.ok(module.HEAPU32.slice(small >>> 2, (small >>> 2) + 16).every((x) => x === 0x12345678));
    module.HEAPU32.set(contact.contactId, small >>> 2);
    assert.equal(module._air_b3_contact_valid(contactWorld.id, small), 1);
    a.destroyBody(ball);
    assert.equal(module._air_b3_contact_valid(contactWorld.id, small), 0);
    module._free(small);
    assert.throws(() => a.readContactSnapshot(contact.handle), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
    assert.throws(() => a.destroyShape(ballShape), { code: 'AIR_E_BOX3D_DISPOSED' });
    const replacement = a.createBody(contactWorld, { position: [0, 20, 0], enableSleep: false });
    a.createSphere(replacement, 0.5);
    assert.equal(replacement.high, ball.high, 'Fixture must actually reuse the body slot');
    assert.notEqual(replacement.low, ball.low, 'Reused body slot must change generation');
    a.step(contactWorld);
    const ended = a.readStepSnapshot(contactWorld);
    assert.equal(ended.contactEnds.length, 1);
    assert.deepEqual(ended.contactEnds[0].contactId, contact.contactId);
    assert.ok((ended.contactEnds[0].validFlags & 4) === 0);
    assert.equal(JSON.stringify(current), retained);
    assert.equal(JSON.stringify(firstContact), firstRetained);
    report.diagnostics.contactBegin = firstContact;
    report.diagnostics.sleepingPair = current;
    report.diagnostics.contactDestroyed = ended;
    report.observations.contact = {
        begins,
        maxNormalImpulse,
        hits,
        fellAsleep: asleep,
        replacementReusesBodyIndex: replacement.high === ball.high,
    };
    a.destroyWorld(contactWorld);
    assert.equal(JSON.stringify(current), retained);
    record(
        'real-floor-contact-hit-sleeping-pair-capacity-stale-contact-destroy-and-reuse',
        report.observations.contact,
    );

    const sensorWorld = a.createWorld([0, 0, 0]);
    const sensorBody = a.createBody(sensorWorld, { type: 0 });
    const sensor = a.createOffsetSphere(sensorBody, [0, 0, 0], 1, 1, true);
    const visitor = a.createBody(sensorWorld, { position: [-3, 0, 0], linearVelocity: [2, 0, 0], enableSleep: false });
    const visitorShape = a.createSphere(visitor, 0.25);
    a.configureShapeEvents(visitorShape, { sensor: true });
    const sensorEvents = [];
    for (let tick = 1; tick <= 240; ++tick) {
        a.step(sensorWorld);
        const snapshot = a.readStepSnapshot(sensorWorld);
        if (snapshot.sensorBegins.length || snapshot.sensorEnds.length) sensorEvents.push(snapshot);
        assert.equal(snapshot.contactBegins.length, 0);
        assert.ok(Math.abs(a.bodySnapshot(visitor)[7] - 2) <= 1e-3);
    }
    assert.equal(
        sensorEvents.reduce((n, s) => n + s.sensorBegins.length, 0),
        1,
    );
    assert.equal(
        sensorEvents.reduce((n, s) => n + s.sensorEnds.length, 0),
        1,
    );
    assert.ok(sensorEvents[0].stepIndex < sensorEvents.at(-1).stepIndex);
    assert.ok(sameId(sensorEvents[0].sensorBegins[0].sensor, sensor));
    assert.ok(sameId(sensorEvents[0].sensorBegins[0].visitor, visitorShape));
    report.diagnostics.slowSensorCrossing = sensorEvents;
    a.destroyWorld(sensorWorld);
    record(
        'real-thick-sensor-single-enter-exit-no-response',
        sensorEvents.map((s) => s.stepIndex),
    );

    const destroyWorld = a.createWorld([0, 0, 0]);
    const sb = a.createBody(destroyWorld, { type: 0 });
    const ss = a.createOffsetSphere(sb, [0, 0, 0], 1, 1, true);
    const vb = a.createBody(destroyWorld, { position: [0.5, 0, 0], enableSleep: false });
    const vs = a.createSphere(vb, 0.25);
    a.configureShapeEvents(vs, { sensor: true });
    a.step(destroyWorld);
    const entered = a.readStepSnapshot(destroyWorld);
    assert.equal(entered.sensorBegins.length, 1);
    const enteredText = JSON.stringify(entered);
    a.destroyBody(vb);
    const reused = a.createBody(destroyWorld, { position: [20, 0, 0] });
    const reusedShape = a.createSphere(reused, 0.25);
    assert.equal(reusedShape.high, vs.high, 'Fixture must actually reuse the shape slot');
    assert.notEqual(reusedShape.low, vs.low, 'Reused shape slot must change generation');
    a.configureShapeEvents(reusedShape, { sensor: true });
    a.step(destroyWorld);
    const exit = a.readStepSnapshot(destroyWorld);
    assert.equal(exit.sensorEnds.length, 1);
    assert.equal(exit.sensorBegins.length, 0);
    assert.ok(sameId(exit.sensorEnds[0].visitor, vs));
    assert.ok(!sameId(exit.sensorEnds[0].visitor, reusedShape));
    assert.equal(exit.sensorEnds[0].validFlags & 2, 0);
    assert.equal(JSON.stringify(entered), enteredText);
    report.diagnostics.sensorDestroyedAndReused = { entered, exit, reusedShape };
    a.destroyWorld(destroyWorld);
    record('real-sensor-destruction-end-id-not-retargeted-to-reused-shape');

    const diagnosticWorld = a.createWorld();
    const df = a.createBody(diagnosticWorld, { type: 0, position: [0, -0.5, 0] });
    a.createBox(df, [10, 0.5, 10]);
    const rotating = a.createBody(diagnosticWorld, {
        position: [0, 0.52, 0],
        angularVelocity: [0, 0, 2],
        enableSleep: false,
    });
    const eccentricShape = a.createOffsetSphere(rotating, [0.3, 0, 0], 0.5, 1);
    a.configureShapeEvents(eccentricShape, { contact: true, hit: true });
    const diagnostic = [];
    for (let tick = 1; tick <= 40; ++tick) {
        a.step(diagnosticWorld);
        const snapshot = a.readStepSnapshot(diagnosticWorld);
        if (snapshot.contactsOfOwnedBodies.length && diagnostic.length < 12) diagnostic.push(snapshot);
    }
    assert.ok(diagnostic.length > 0);
    assert.ok(
        diagnostic.some((s) =>
            s.contactsOfOwnedBodies.some((c) =>
                [c.prePoseA, c.prePoseB].some((p) => p && Math.hypot(p[7] - p[0], p[8] - p[1], p[9] - p[2]) > 0.2),
            ),
        ),
    );
    assert.ok(
        diagnostic.some((s) =>
            s.bodyPosesBefore.some((row, i) =>
                row.pose.slice(3, 7).some((q, k) => Math.abs(q - s.bodyPosesAfter[i].pose[3 + k]) > 1e-5),
            ),
        ),
    );
    assert.ok(
        diagnostic.every((s) => s.contactsOfOwnedBodies.every((c) => c.anchorEpoch === 'UNRESOLVED_CACHED_NATIVE')),
    );
    report.diagnostics.rotatingEccentricRawContacts = diagnostic;
    a.destroyWorld(diagnosticWorld);
    record('real-nonzero-rotation-eccentric-com-diagnostic-without-false-epoch-claim', diagnostic.length);
    assert.equal(a.liveBytes(), baseline);
    assert.equal(other.liveBytes(), 0n);
    a.dispose();
    other.dispose();
    record('all-worlds-destroyed-core-live-bytes-return-to-baseline', String(baseline));
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = { message: error.message, stack: error.stack };
    process.exitCode = 1;
} finally {
    report.completedAt = new Date().toISOString();
    persist();
    console.log(
        JSON.stringify({
            status: report.status,
            checks: report.checks.length,
            output: reportPath,
            error: report.error?.message,
        }),
    );
}
