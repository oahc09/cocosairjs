/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// CPU-safe import. The future, identity-locked consumer must supply the real SDK/app
// from the UNMODIFIED terrain-contract/public-harness/host.mjs and production loader.
// This is Node HEADLESS/JSDOM qualification, not browser/GPU/presentation evidence.
// Pre-mount construction failure may leave unowned objects: failure close is attempted,
// but this fixture does not claim exhaustive pre-mount cleanup qualification.
import assert from 'node:assert/strict';
import { sphereCapsuleOracle, near as oracleNear, TOLERANCE } from './oracle.mjs';

export const PUBLIC_CASES = Object.freeze([
    Object.freeze({ name: 'sphere-created-first', capsuleFirst: false, zeroCapsule: false, destroyPeer: false }),
    Object.freeze({ name: 'capsule-created-first', capsuleFirst: true, zeroCapsule: false, destroyPeer: false }),
    // A zero-cylinder Capsule descriptor creates a native Sphere. Do not silently omit this affected family.
    Object.freeze({
        name: 'zero-capsule-positive-capsule',
        capsuleFirst: false,
        zeroCapsule: true,
        destroyPeer: false,
    }),
    Object.freeze({ name: 'callback-destroys-peer', capsuleFirst: true, zeroCapsule: false, destroyPeer: true }),
]);
export const LIMITS = Object.freeze({ dt: 1 / 60, frameRate: 60, stepTimeoutMs: 2000, stepsPerCase: 8 });
const plain = (value) => structuredClone(value);
const vector = (contact, method) => {
    const out = { x: NaN, y: NaN, z: NaN };
    contact[method](out);
    const value = [out.x, out.y, out.z];
    assert(value.every(Number.isFinite), method);
    return value;
};
const near = (actual, expected) => {
    assert.equal(actual.length, expected.length);
    actual.forEach((v, i) => assert(Math.abs(v - expected[i]) <= 1e-6, 'Public getter must use captured native basis'));
};
export function copyContact(contact) {
    assert(Object.isFrozen(contact) && Object.isFrozen(contact.impl));
    const g = contact.impl.geometry;
    assert.equal(g.status, 'AVAILABLE');
    assert.equal(g.source, 'CACHED_MANIFOLD_GENERATION');
    const m = g.manifolds[contact.impl.manifoldIndex];
    const p = m.points[contact.impl.pointIndex];
    const getters = Object.fromEntries(
        [
            'LocalPointOnA',
            'LocalPointOnB',
            'WorldPointOnA',
            'WorldPointOnB',
            'LocalNormalOnA',
            'LocalNormalOnB',
            'WorldNormalOnA',
            'WorldNormalOnB',
        ].map((suffix) => [suffix, vector(contact, 'get' + suffix)]),
    );
    near(getters.WorldPointOnA, p.worldPointA);
    near(getters.WorldPointOnB, p.worldPointB);
    near(getters.LocalPointOnA, p.localPointA);
    near(getters.LocalPointOnB, p.localPointB);
    near(getters.WorldNormalOnA, contact.isBodyA ? m.normalBtoA : m.normalAtoB);
    near(getters.WorldNormalOnB, m.normalBtoA);
    near(
        getters.LocalNormalOnA,
        m.localNormalAtoB_A.map((v) => v * (contact.isBodyA ? -1 : 1)),
    );
    near(
        getters.LocalNormalOnB,
        m.localNormalAtoB_B.map((v) => -v),
    );
    return { isBodyA: contact.isBodyA, impl: plain(contact.impl), getters };
}
export function validateCapturedContact(copy, snapshot) {
    const g = copy.impl.geometry;
    assert.equal(g.status, 'AVAILABLE');
    assert.equal(g.source, 'CACHED_MANIFOLD_GENERATION');
    assert.equal(g.readStepIndex, snapshot.stepIndex);
    assert(Number.isSafeInteger(g.readMutationRevision) && g.readMutationRevision >= 0);
    const native = snapshot.contactsOfOwnedBodies.find(
        (c) => JSON.stringify(c.contactId) === JSON.stringify(g.contactId),
    );
    assert(native, 'Public contact must belong to this exact native contact snapshot');
    for (const name of ['shapeA', 'shapeB', 'bodyA', 'bodyB'])
        assert.deepEqual(g[name], native[name], name + ' full ID');
    assert.deepEqual(g, native.geometry, 'No substituted point/basis/epoch');
    // generatedAfterStep may be older than readStepIndex for a legitimately recycled basis.
    return true;
}
// The first Enter is independently checked against public descriptors and poses captured
// BEFORE the real step. Neither event generationPose nor live post-solve Node pose is the oracle input.
export function validateEntryOracle(copy, selfRole, poses) {
    const aRole = copy.isBodyA ? selfRole : selfRole === 'round' ? 'capsule' : 'round';
    const bRole = aRole === 'round' ? 'capsule' : 'round';
    const shapes = {
        round: { kind: 'sphere', center: [0, 0, 0], radius: 0.5 },
        capsule: { kind: 'capsule', center: [0, 0, 0], radius: 0.5, halfSegment: 1, direction: 1 },
    };
    const expected = sphereCapsuleOracle(shapes[aRole], poses[aRole], shapes[bRole], poses[bRole]);
    const g = copy.impl.geometry,
        m = g.manifolds[copy.impl.manifoldIndex],
        p = m.points[copy.impl.pointIndex];
    oracleNear(m.normalAtoB, expected.normal, TOLERANCE.normal, 'independent enter normal');
    oracleNear(
        m.normalBtoA,
        expected.normal.map((v) => -v),
        TOLERANCE.normal,
        'opposite enter normal',
    );
    oracleNear(p.worldPointA, expected.point, TOLERANCE.point, 'independent world A');
    oracleNear(p.worldPointB, expected.point, TOLERANCE.point, 'independent world B');
    oracleNear(p.localPointA, expected.localPointA, TOLERANCE.point, 'independent local A');
    oracleNear(p.localPointB, expected.localPointB, TOLERANCE.point, 'independent local B');
    return true;
}
export function validateCase(row) {
    assert.equal(row.release.status, 'released');
    assert.equal(row.release.physicsSceneRelease?.status, 'RESTORED');
    assert.deepEqual(row.release.failures, []);
    assert.deepEqual(row.release.pending, []);
    assert.equal(row.stepsDuringRelease, 0);
    assert.equal(row.sceneInvalid, true);
    assert.equal(row.tokenCurrent, false);
    assert.equal(row.currentSceneNull, true);
    assert.equal(row.retainedCopiesUnchanged, true);
    for (const key of ['bodies', 'shapes', 'contacts', 'joints']) assert.equal(row.afterRelease[key], 0);
    assert.deepEqual(row.resources, []);
    if (row.destroyPeer) {
        assert.equal(row.events.length, 1, 'Pending peer destruction skips the remaining batch receiver');
        assert.equal(row.events[0].type, 'onCollisionEnter');
        assert.equal(row.destroyRequested, true);
        assert.equal(row.destroyedPeerInvalid, true);
        assert.equal(row.afterCallback.bodies, 1);
        assert.equal(row.afterCallback.shapes, 1);
    } else {
        for (const role of ['round', 'capsule']) {
            const types = row.events.filter((e) => e.self === role).map((e) => e.type);
            assert.equal(types.filter((t) => t === 'onCollisionEnter').length, 1);
            assert(types.includes('onCollisionStay'));
            assert.equal(types.filter((t) => t === 'onCollisionExit').length, 1);
        }
    }
    return true;
}

export async function runPublicSphereCapsule({ sdk, app, report, record }) {
    const { Node, Scene, RigidBody, SphereCollider, CapsuleCollider, PhysicsSystem, Vec3, createStepClock } = sdk;
    const system = PhysicsSystem.instance,
        world = system.physicsWorld;
    const originalWorld = world,
        retained = [];
    let clock,
        ticks = 0,
        failure;
    report.cases = [];
    report.frames = [];
    report.hostBoundary = 'HEADLESS/JSDOM through unchanged public host; no browser qualification';
    const verifyRetained = () =>
        retained.every(({ contact, before }) => JSON.stringify(copyContact(contact)) === before);
    try {
        assert.equal(app.getScene(), null, 'Fresh prepared app, no second app/module');
        assert.equal(typeof world.getStepSnapshot, 'function');
        assert.equal(world.diagnostics().native.nativeStepIndex, 0, 'Fresh world, no hidden pre-steps');
        system.enable = false;
        system.autoSimulation = true;
        system.gravity = new Vec3();
        system.fixedTimeStep = LIMITS.dt;
        system.maxSubSteps = 1;
        for (const config of PUBLIC_CASES) {
            const scene = new Scene('sphere-capsule-' + config.name);
            const row = { ...config, status: 'RUNNING', startStep: ticks, rawEvents: [], events: [], snapshots: [] };
            report.cases.push(row);
            const make = (role) => {
                const node = new Node(role);
                node.setPosition(role === 'round' ? 1.2 : 0, 0, 0);
                const body = node.addComponent(RigidBody);
                body.type = role === 'round' ? RigidBody.Type.DYNAMIC : RigidBody.Type.STATIC;
                body.mass = 1;
                body.allowSleep = false;
                body.useGravity = false;
                body.linearDamping = 0;
                body.angularDamping = 0;
                const shape = node.addComponent(
                    role === 'capsule' || config.zeroCapsule ? CapsuleCollider : SphereCollider,
                );
                shape.radius = 0.5;
                if (role === 'capsule' || config.zeroCapsule) {
                    shape.cylinderHeight = role === 'capsule' ? 2 : 0;
                    shape.direction = 1; // public Y axis
                }
                scene.addChild(node);
                return { role, node, body, shape };
            };
            const members = config.capsuleFirst ? [make('capsule'), make('round')] : [make('round'), make('capsule')];
            const round = members.find((x) => x.role === 'round');
            let destroyedPeer, preStepPoses;
            for (const self of members) {
                for (const type of ['onCollisionEnter', 'onCollisionStay', 'onCollisionExit']) {
                    self.shape.on(type, (event) => {
                        const other = members.find((x) => x.shape === event.otherCollider);
                        // Persist detached raw data BEFORE calling any contact getter or asserting geometry.
                        // No Collider/Node reference (and hence no scene cycle) is written to the journal.
                        const raw = {
                            step: ticks,
                            listenerType: type,
                            type: event.type,
                            self: self.role,
                            other: other?.role ?? 'FOREIGN',
                            impl: plain(event.impl),
                            contacts: event.contacts.map((contact) => ({
                                isBodyA: contact.isBodyA,
                                impl: plain(contact.impl),
                            })),
                            independentPreStepPoses: plain(preStepPoses),
                        };
                        row.rawEvents.push(raw);
                        record('public-sphere-capsule-raw-event', raw);
                        assert.equal(event.type, type);
                        assert.equal(event.selfCollider, self.shape);
                        assert(other && other !== self);
                        assert(
                            Object.isFrozen(event) && Object.isFrozen(event.contacts) && Object.isFrozen(event.impl),
                        );
                        const contacts = event.contacts.map(copyContact);
                        const observed = {
                            step: ticks,
                            type,
                            self: self.role,
                            other: other.role,
                            contacts,
                            impl: plain(event.impl),
                            ...(type === 'onCollisionEnter' ? { independentPreStepPoses: plain(preStepPoses) } : {}),
                        };
                        row.events.push(observed);
                        record('public-sphere-capsule-event', observed);
                        assert.equal(event.impl.stepIndex, ticks);
                        if (type === 'onCollisionExit') assert.equal(contacts.length, 0);
                        else assert(contacts.length > 0);
                        // Read the already captured backend snapshot before a callback mutation invalidates native views.
                        const snapshot = world.getStepSnapshot();
                        assert.equal(snapshot.worldId, world.impl.worldId);
                        assert.equal(snapshot.stepIndex, ticks);
                        for (const contact of contacts) {
                            validateCapturedContact(contact, snapshot);
                            if (type === 'onCollisionEnter') validateEntryOracle(contact, self.role, preStepPoses);
                        }
                        for (const contact of event.contacts)
                            retained.push({ contact, before: JSON.stringify(copyContact(contact)) });
                        if (config.destroyPeer && type === 'onCollisionEnter') {
                            assert.equal(row.destroyRequested, undefined);
                            row.destroyRequested = true;
                            destroyedPeer = other.node;
                            assert.equal(other.node.destroy(), true);
                        }
                    });
                }
            }
            app.run(scene);
            const token = app.session.token();
            if (!clock) {
                clock = createStepClock({ frameRate: LIMITS.frameRate, stepTimeoutMs: LIMITS.stepTimeoutMs });
                clock.begin();
            }
            system.enable = true;
            const step = async () => {
                assert.equal(app.getScene(), scene);
                assert.equal(system.physicsWorld, originalWorld);
                assert(ticks - row.startStep <= LIMITS.stepsPerCase);
                assert.equal(clock.stepping, true);
                preStepPoses = Object.fromEntries(
                    members
                        .filter((member) => member.node.isValid)
                        .map(({ role, node }) => {
                            const p = node.worldPosition,
                                q = node.worldRotation;
                            return [role, [p.x, p.y, p.z, q.x, q.y, q.z, q.w, 0, 0, 0].map(Math.fround)];
                        }),
                );
                const frame = await clock.step(LIMITS.dt);
                // ticks denotes the callback's forthcoming step, assigned immediately before step below.
                assert.deepEqual(frame, { step: ticks, dt: LIMITS.dt, afterDraw: true });
                report.frames.push(frame);
                assert(verifyRetained());
                const counts = world.getNativeCounts();
                row.snapshots.push({ step: ticks, ...counts, liveBytes: counts.liveBytes.toString() });
                record('public-fixed-frame', { frame, counts: row.snapshots.at(-1) });
            };
            const advance = async () => {
                ticks++;
                await step();
            };
            await advance(); // both real native shapes exist, initially separated
            assert.equal(row.snapshots.at(-1).bodies, 2);
            assert.equal(row.snapshots.at(-1).shapes, 2);
            assert.equal(row.events.length, 0);
            // The initial ready frame materializes both public bodies. Move only through
            // the supported native velocity API; external post-mount Node sync is forbidden.
            round.body.setLinearVelocity(new Vec3(-24, 0, 0));
            await advance();
            round.body.setLinearVelocity(new Vec3());
            await advance();
            if (config.destroyPeer) {
                row.afterCallback = {
                    ...world.getNativeCounts(),
                    liveBytes: world.getNativeCounts().liveBytes.toString(),
                };
                row.destroyedPeerInvalid = !destroyedPeer?.isValid;
                await advance(); // no synthetic Exit for the retired peer
            } else {
                for (let i = 0; i < 2; i++) {
                    round.body.setLinearVelocity(new Vec3());
                    await advance();
                }
                round.body.setLinearVelocity(new Vec3(24, 0, 0));
                await advance();
                await advance();
            }
            const beforeRelease = ticks;
            row.release = await app.releaseScene();
            row.stepsDuringRelease = ticks - beforeRelease;
            row.sceneInvalid = !scene.isValid;
            row.tokenCurrent = token.isCurrent();
            row.currentSceneNull = app.getScene() === null;
            row.retainedCopiesUnchanged = verifyRetained();
            const counts = world.getNativeCounts();
            row.afterRelease = { ...counts, liveBytes: counts.liveBytes.toString() };
            row.resources = plain(world.getStaticMeshResourceDiagnostics());
            record('public-case-before-validation', row);
            validateCase(row);
            row.status = 'PASS';
        }
    } catch (error) {
        failure = error;
        report.error = String(error.stack ?? error);
    } finally {
        try {
            report.close = await app.close();
            assert.equal(report.close.status, 'released');
            assert.deepEqual(report.close.failures, []);
            assert.deepEqual(report.close.pending, []);
            assert.equal(report.close.physicsPreparation.status, 'closed');
            assert.deepEqual(report.close.physicsPreparation.cleanupErrors, []);
            assert(report.close.physicsPreparation.acquired.length > 0);
            assert(
                report.close.physicsPreparation.acquired.every(
                    (v) => v.backend === 'box3d' && v.cleanup === 'released' && v.retained.length === 0,
                ),
            );
            assert(verifyRetained());
            report.retainedCopiesAfterClose = true;
        } catch (error) {
            report.closeError = String(error.stack ?? error);
            failure ??= error;
        }
        report.totalSteps = ticks;
        report.status = failure ? 'FAIL' : 'PASS_PUBLIC_SPHERE_CAPSULE_SUBSET';
        try {
            record('public-sphere-capsule-terminal', report);
        } catch (error) {
            report.journalError = String(error.stack ?? error);
            report.status = 'FAIL';
            failure ??= error;
        }
    }
    if (failure) throw failure;
    return report;
}
