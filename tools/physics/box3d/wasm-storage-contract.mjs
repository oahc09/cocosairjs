/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Explicit production WASM gate, never a CPU mock or C20 APP qualification.
// One factory/module, two real worlds; no warmup, replacement world, retry or after-close probe.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const dir = resolve(process.argv[2]);
const rawPath = resolve(dir, 'wasm-storage-contract.raw.json');
assert(!existsSync(rawPath), 'Preserve every previous storage-contract attempt');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (value) => JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n';
const report = {
    schema: 'air-box3d-storage-wasm-contract-v1',
    status: 'RUNNING',
    startedAt: new Date().toISOString(),
    fixtureSha256: hash(readFileSync(new URL(import.meta.url))),
    checks: {},
    observations: {},
    cleanupErrors: [],
    factoryCalls: 0,
    scope: 'Production facade/native empty-storage regression, one module and two worlds; not APP/C20/I05/I06',
    acceptancePassed: false,
    afterCloseMemory: 'UNAVAILABLE_NOT_PROBED',
    limitations: [
        'No allocator/OOM, identity-exhaustion injection, task-lock or complete native-handle census claim.',
        'Native Debug tests separately qualify internal guard branches and both end-buffer roles.',
        'World capacity ledger, module core requested bytes and bridge scopes remain separate.',
        'Stale raw-ID proof is within this same world lifetime, not after world destruction/recreation.',
    ],
};
writeFileSync(rawPath, json(report), { flag: 'wx' });
const persist = () => writeFileSync(rawPath, json(report));
const check = (name, action) => {
    action();
    report.checks[name] = true;
    persist();
};
let module,
    api,
    pointer = 0;
try {
    const manifest = JSON.parse(readFileSync(resolve(dir, 'manifest.json')));
    report.identity = Object.fromEntries(
        ['coreSha', 'schemaSha256', 'patchChainSha256', 'abiVersion', 'variant'].map((key) => [key, manifest[key]]),
    );
    report.manifestSha256 = hash(readFileSync(resolve(dir, 'manifest.json')));
    for (const artifact of manifest.artifacts)
        assert.equal(hash(readFileSync(resolve(dir, artifact.path))), artifact.sha256);
    const { default: factory } = await import(pathToFileURL(resolve(dir, 'box3d-st.mjs')).href);
    const { createBox3DBinding } = await import(pathToFileURL(resolve(dir, 'facade.mjs')).href);
    ++report.factoryCalls;
    module = await factory({ wasmBinary: readFileSync(resolve(dir, 'box3d-st.wasm')) });
    api = createBox3DBinding(module, manifest);
    pointer = module._malloc(128 * 4);
    assert(pointer && pointer % 4 === 0);
    const world = api.createWorld([0, 0, 0]),
        other = api.createWorld([0, 0, 0]);
    const otherBody = api.createBody(other, { type: 2, position: [1000, 0, 0], enableSleep: false });
    api.createSphere(otherBody, 0.5);
    api.step(other, 1 / 60, 1);
    const otherSnapshot = api.readStepSnapshot(other);
    const otherPose = Array.from(api.bodySnapshot(otherBody));
    const isolated = (value) => ({
        identity: value.identity,
        worldLedger: value.worldLedger,
        liveCounts: value.liveCounts,
        maxWorkload: value.maxWorkload,
        nativeWorldBridge: value.nativeWorldBridge,
    });
    const otherInitial = isolated(api.memoryDiagnostics(other));
    const initial = api.memoryDiagnostics(world);
    report.observations.initial = initial;
    const bytes = (value) => value.worldLedger.rows.map((row) => [row.name, row.bytes]);
    const row = (value, name) => {
        const found = value.worldLedger.rows.find((r) => r.name === name);
        assert(found, name);
        return found;
    };
    const exactLedger = (value) => {
        assert.equal(value.worldLedger.rows.length, 89);
        assert.equal(value.worldLedger.classifiedBytes, value.worldLedger.coreReportedBytes);
        assert.equal(
            value.worldLedger.rows.reduce((sum, r) => sum + r.bytes, 0n),
            value.worldLedger.coreReportedBytes,
        );
    };
    check('fresh89RowBaselineAndFixedMetadata', () => {
        exactLedger(initial);
        assert.equal(initial.profile, 'air-box3d-memory-diagnostics-v2');
        assert.equal(initial.identity.nativeStepIndex, 0n);
        assert.equal(row(initial, 'worldFixed.identityHistory').bytes, 36n);
        assert.equal(row(initial, 'worldFixed.creationCapacity').bytes, 20n);
        assert.equal(initial.identity.worldId, world.id);
        assert.deepEqual(initial.liveCounts, { bodies: 0, shapes: 0, contacts: 0, joints: 0, islands: 0 });
    });
    const configuration = { gravity: api.getGravity(world), sleeping: api.isSleepingEnabled(world) };
    const makeBatch = () => {
        const bodies = Array.from({ length: 24 }, (_, i) =>
            api.createBody(world, {
                type: i === 0 || i === 2 ? 0 : 2,
                enableSleep: false,
                position: i < 2 ? [i * 1.5, 0, 0] : i < 4 ? [50 + (i - 2) * 0.25, 0, 0] : [100 + i * 5, 0, 0],
            }),
        );
        const shapes = bodies.map((body, i) =>
            i === 2 ? api.createOffsetSphere(body, [0, 0, 0], 2, 1, true) : api.createSphere(body, i < 2 ? 1 : 0.5),
        );
        api.configureShapeEvents(shapes[0], { contact: true });
        api.configureShapeEvents(shapes[1], { contact: true });
        api.configureShapeEvents(shapes[2], { sensor: true });
        api.configureShapeEvents(shapes[3], { sensor: true });
        const joint = api.createFixedJoint(world, bodies[4], bodies[5], {
            collideConnected: false,
            breakForce: 1e8,
            breakTorque: 1e8,
        });
        return { bodies, shapes, joint };
    };
    const destroyBatch = (batch) => {
        api.destroyJoint(world, batch.joint);
        for (const body of batch.bodies) api.destroyBody(body);
    };
    const batch = makeBatch();
    api.step(world, 1 / 60, 1);
    const copied = api.readStepSnapshot(world),
        copiedBytes = json(copied);
    const contact = copied.contactsOfOwnedBodies[0];
    const active = api.memoryDiagnostics(world);
    report.observations.active = active;
    check('realStepHasContactSensorJointAndGrowth', () => {
        exactLedger(active);
        assert.equal(active.liveCounts.bodies, 24);
        assert.equal(active.liveCounts.shapes, 24);
        assert.equal(active.liveCounts.joints, 1);
        assert(contact, 'Real owned-body contact required');
        assert(copied.sensorBegins.length > 0, 'Real native sensor membership required');
        assert.equal(active.identity.nativeStepIndex, 1n);
        assert(active.worldLedger.coreReportedBytes > initial.worldLedger.coreReportedBytes);
        assert(row(active, 'tree.dynamic.leafIndices').capacity > 0n);
    });
    check('nonemptyRefusalPreservesNativeAndBindingSnapshot', () => {
        assert.equal(api.trimEmptyWorld(world, true), false);
        assert.deepEqual(api.memoryDiagnostics(world), active);
        assert.equal(api.readStepSnapshot(world), copied);
        assert.equal(json(copied), copiedBytes);
    });
    const old = {
        body: { ...batch.bodies[0] },
        highBody: { ...batch.bodies.at(-1) },
        shape: { ...batch.shapes[0] },
        highShape: { ...batch.shapes.at(-1) },
        joint: { ...batch.joint },
        contact: [...contact.contactId],
    };
    report.observations.retiredRawIds = old;
    const rawIdsInvalid = () => {
        for (const body of [old.body, old.highBody]) assert.equal(module._air_b3_body_valid(body.low, body.high), 0);
        for (const shape of [old.shape, old.highShape])
            assert.equal(module._air_b3_shape_valid(shape.low, shape.high), 0);
        assert.equal(module._air_b3_fixed_state(world.id, old.joint.low, old.joint.high, pointer, 30), 1);
        module.HEAPU32.set(old.contact, pointer >>> 2);
        assert.equal(module._air_b3_contact_valid(world.id, pointer), 0);
    };
    destroyBatch(batch);
    const released = api.memoryDiagnostics(world);
    report.observations.releasedBeforeTrim = released;
    check('destroyedLiveCountsZeroWithRetiredNativeEvents', () => {
        exactLedger(released);
        assert.deepEqual(released.liveCounts, { bodies: 0, shapes: 0, contacts: 0, joints: 0, islands: 0 });
        assert(row(released, 'event.bodyMoveEvents').count > 0n);
        assert(row(released, 'event.sensorEndEvents0').count + row(released, 'event.sensorEndEvents1').count > 0n);
        assert(row(released, 'event.contactEndEvents0').count + row(released, 'event.contactEndEvents1').count > 0n);
        rawIdsInvalid();
    });
    check('missingAcknowledgementIsMutationFree', () => {
        assert.throws(
            () => api.trimEmptyWorld(world, false),
            (e) => {
                assert.equal(e.code, 'AIR_E_BOX3D_TRIM_UNSAFE');
                const d = Object.getOwnPropertyDescriptor(e, 'mutationOutcome');
                assert.equal(d.value, 'not-mutated');
                assert.equal(d.writable, false);
                assert.equal(d.configurable, false);
                return true;
            },
        );
        assert.deepEqual(api.memoryDiagnostics(world), released);
    });
    const beforeTrimStep = api.stepDiagnostics(world);
    assert.equal(api.trimEmptyWorld(world, true), true);
    const trimmed = api.memoryDiagnostics(world);
    report.observations.trimmed = trimmed;
    check('sameWorldInitialLedgerRestoredWithoutRebase', () => {
        exactLedger(trimmed);
        assert.equal(trimmed.identity.worldId, initial.identity.worldId);
        assert.equal(trimmed.worldLedger.coreReportedBytes, initial.worldLedger.coreReportedBytes);
        assert.deepEqual(bytes(trimmed), bytes(initial));
        assert.deepEqual(trimmed.maxWorkload, released.maxWorkload);
        assert.deepEqual({ gravity: api.getGravity(world), sleeping: api.isSleepingEnabled(world) }, configuration);
    });
    check('successfulTrimAdvancesRevisionOnceNotNativeStep', () => {
        assert.equal(trimmed.identity.bindingMutationRevision, released.identity.bindingMutationRevision + 1);
        assert.equal(trimmed.identity.nativeStepIndex, released.identity.nativeStepIndex);
        assert.deepEqual(api.stepDiagnostics(world), { ...beforeTrimStep, snapshotAvailable: false });
        assert.throws(() => api.readStepSnapshot(world), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
        assert.throws(() => api.readContactSnapshot(contact.handle), { code: 'AIR_E_BOX3D_STALE_SNAPSHOT' });
        assert.equal(json(copied), copiedBytes);
    });
    check('allRetiredEventArraysIncludingBothEndRolesCleared', () => {
        for (const r of trimmed.worldLedger.rows.filter((v) => v.name.startsWith('event.')))
            assert.equal(r.count, 0n, r.name);
        for (const name of [
            'event.sensorEndEvents0',
            'event.sensorEndEvents1',
            'event.contactEndEvents0',
            'event.contactEndEvents1',
        ])
            assert.equal(row(trimmed, name).count, 0n);
    });
    check('secondWorldAndItsCurrentSnapshotUnaffected', () => {
        assert.deepEqual(isolated(api.memoryDiagnostics(other)), otherInitial);
        assert.deepEqual(Array.from(api.bodySnapshot(otherBody)), otherPose);
        assert.equal(api.readStepSnapshot(other), otherSnapshot);
        assert.equal(report.factoryCalls, 1);
    });
    const fresh = makeBatch();
    api.step(world, 1 / 60, 1);
    const freshContact = api.readStepSnapshot(world).contactsOfOwnedBodies[0];
    check('regrownLowAndHighSlotsKeepAllOldRawIdsStale', () => {
        rawIdsInvalid();
        assert(freshContact);
        for (const [prior, current] of [
            [old.body, fresh.bodies[0]],
            [old.highBody, fresh.bodies.at(-1)],
            [old.shape, fresh.shapes[0]],
            [old.highShape, fresh.shapes.at(-1)],
            [old.joint, fresh.joint],
        ]) {
            assert.equal(current.high, prior.high, 'Same raw slot index must be reoccupied');
            assert(
                (current.low & 0xffff) > (prior.low & 0xffff),
                'New same-world generation must exceed retired generation',
            );
        }
        assert.equal(freshContact.contactId[0], old.contact[0]);
        assert.equal(freshContact.contactId[1], old.contact[1]);
        assert(freshContact.contactId[2] > old.contact[2]);
    });
    destroyBatch(fresh);
    const secondReleased = api.memoryDiagnostics(world);
    assert.equal(api.trimEmptyWorld(world, true), true);
    const secondTrimmed = api.memoryDiagnostics(world);
    report.observations.secondTrimmed = secondTrimmed;
    check('secondRealEpochRestoresSameOriginalLedger', () => {
        exactLedger(secondTrimmed);
        assert.deepEqual(bytes(secondTrimmed), bytes(initial));
        assert.equal(secondTrimmed.identity.nativeStepIndex, 2n);
        assert.equal(
            secondTrimmed.identity.bindingMutationRevision,
            secondReleased.identity.bindingMutationRevision + 1,
        );
        rawIdsInvalid();
        assert.deepEqual(isolated(api.memoryDiagnostics(other)), otherInitial);
    });
    check('afterCloseAndFullC20NotClaimed', () => {
        assert(initial.unavailable.includes('after-app-close module observation'));
        assert.equal(report.acceptancePassed, false);
        assert.equal(report.factoryCalls, 1);
    });
    // Same-world live disable regression: retain original trim's zero/live guard.
    for (const type of [1, 2]) {
        check(`sleepDisableEnableDestroyType${type}ThreeCycles`, () => {
            for (let cycle = 0; cycle < 3; ++cycle) {
                const body = api.createBody(world, { type, enableSleep: true, position: [0, 0, 0] });
                api.createSphere(body, 0.25);
                api.setBodyAwake(world, body, false);
                const sleeping = api.memoryDiagnostics(world);
                const step = sleeping.identity.nativeStepIndex;
                assert.equal(api.bodyState(world, body).awake, false);
                api.setBodyEnabled(world, body, false);
                const disabled = api.memoryDiagnostics(world);
                assert.equal(disabled.liveCounts.bodies, 1);
                assert.equal(row(disabled, 'idFreeList.solverSet').count, 1n);
                assert.equal(api.trimEmptyWorld(world, true), false);
                api.setBodyEnabled(world, body, true);
                assert.equal(api.bodyState(world, body).enabled, true);
                api.setBodyAwake(world, body, false);
                api.setBodyEnabled(world, body, false);
                api.destroyBody(body);
                assert.equal(api.trimEmptyWorld(world, true), true);
                const trimmed = api.memoryDiagnostics(world);
                exactLedger(trimmed);
                assert.equal(trimmed.identity.worldId, initial.identity.worldId);
                assert.equal(trimmed.identity.nativeStepIndex, step);
                assert.deepEqual(bytes(trimmed), bytes(initial));
            }
        });
    }
    for (const kind of ['fixed', 'hinge', 'point-to-point']) {
        check(`sleepSharedSetDisablePreserves${kind}`, () => {
            const a = api.createBody(world, { type: 2, enableSleep: true, position: [0, 0, 0] });
            const b = api.createBody(world, { type: 2, enableSleep: true, position: [2, 0, 0] });
            api.createSphere(a, 0.25);
            api.createSphere(b, 0.25);
            const geometry = { pivotA: [0, 0, 0], pivotB: [0, 0, 0], autoPivotB: true };
            const joint =
                kind === 'fixed'
                    ? api.createFixedJoint(world, a, b, { collideConnected: false, breakForce: 1e8, breakTorque: 1e8 })
                    : kind === 'hinge'
                      ? api.createHingeJoint(
                            world,
                            a,
                            b,
                            { ...geometry, axisA: [0, 1, 0] },
                            {
                                collideConnected: false,
                                limitEnabled: false,
                                lowerAngleRadians: 0,
                                upperAngleRadians: 0,
                                motorEnabled: false,
                                motorSpeedRadians: 0,
                                maxMotorTorque: 0,
                            },
                        )
                      : api.createPointToPointJoint(world, a, b, geometry, { collideConnected: false });
            const state = () =>
                kind === 'fixed'
                    ? api.fixedJointState(world, joint)
                    : kind === 'hinge'
                      ? api.hingeJointState(world, joint)
                      : api.pointToPointJointState(world, joint);
            api.step(world, 1 / 60, 1);
            api.setBodyAwake(world, a, false);
            assert.equal(api.bodyState(world, a).awake, false);
            assert.equal(api.bodyState(world, b).awake, false);
            const step = api.memoryDiagnostics(world).identity.nativeStepIndex;
            api.setBodyEnabled(world, a, false);
            assert.equal(api.bodyState(world, b).enabled, true);
            assert.equal(state().kind, kind);
            assert.equal(api.memoryDiagnostics(world).liveCounts.joints, 1);
            assert.equal(row(api.memoryDiagnostics(world), 'idFreeList.solverSet').count, 0n);
            assert.equal(api.trimEmptyWorld(world, true), false);
            api.setBodyEnabled(world, a, true);
            assert.equal(state().kind, kind);
            api.setBodyAwake(world, a, false);
            api.setBodyEnabled(world, a, false);
            api.setBodyEnabled(world, b, false);
            assert.equal(row(api.memoryDiagnostics(world), 'idFreeList.solverSet').count, 1n);
            assert.equal(state().kind, kind);
            api.destroyJoint(world, joint);
            api.destroyBody(a);
            api.destroyBody(b);
            assert.equal(api.trimEmptyWorld(world, true), true);
            const trimmed = api.memoryDiagnostics(world);
            exactLedger(trimmed);
            assert.deepEqual(bytes(trimmed), bytes(initial));
            assert.equal(trimmed.identity.worldId, initial.identity.worldId);
            assert.equal(trimmed.identity.nativeStepIndex, step);
            assert.deepEqual(isolated(api.memoryDiagnostics(other)), otherInitial);
        });
    }
    report.status = 'PASS';
} catch (error) {
    report.status = 'FAIL';
    report.error = String(error?.stack ?? error);
} finally {
    // Cleanup only. No diagnostic/getter runs after api.dispose or module teardown.
    if (pointer) {
        try {
            module._free(pointer);
        } catch (error) {
            report.cleanupErrors.push(String(error));
        }
    }
    try {
        api?.dispose();
    } catch (error) {
        report.cleanupErrors.push(String(error));
    }
    if (report.cleanupErrors.length) report.status = 'FAIL';
    report.finishedAt = new Date().toISOString();
    persist();
}
console.log(json(report));
if (report.status !== 'PASS') process.exitCode = 1;
