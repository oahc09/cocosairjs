/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Future identity-locked consumer supplies one real SDK/app from the unchanged public host.
// CPU-safe import; no automatic execution, replacement factory, native probe after close or second app.
import assert from 'node:assert/strict';
import { verifyModuleReleased } from '../../../../src/air/physics/box3d/binding/module-release.mjs';
export const PROFILE = 'air-box3d-public-module-release-v1';
export const LIMITS = Object.freeze({
    scenes: 1,
    bodies: 4,
    shapes: 4,
    joints: 1,
    terrainUsers: 2,
    steps: 2,
    dt: 1 / 60,
    stepTimeoutMs: 2000,
});
const copy = (value) => structuredClone(value);
function deeplyFrozen(value) {
    if (value && typeof value === 'object') {
        assert(Object.isFrozen(value));
        Object.values(value).forEach(deeplyFrozen);
    }
}
export function validatePublicModuleRelease(report) {
    assert.equal(report.frames.length, LIMITS.steps);
    assert.equal(report.sceneRunCalls, 1);
    assert.equal(report.releaseSceneCalls, 1);
    assert.equal(report.closeCalls, 1);
    assert(report.debug?.primitives.length > 0, 'Real copied debug activity, not a render claim');
    assert.equal(report.debugRetainedAfterClose, true);
    assert.equal(report.nonempty.bodies, LIMITS.bodies);
    assert.equal(report.nonempty.shapes, LIMITS.shapes);
    assert.equal(report.nonempty.joints, LIMITS.joints);
    assert.equal(report.activeResources.length, 1, 'Two terrain colliders share one real native resource');
    assert(
        report.activeResources.some((value) => value.cacheLeases === 1 && value.shapeBorrows === LIMITS.terrainUsers),
    );
    assert.equal(report.release.status, 'released');
    assert.equal(report.release.physicsSceneRelease.status, 'RESTORED');
    assert.deepEqual(report.release.failures, []);
    assert.deepEqual(report.release.pending, []);
    assert.equal(report.sceneInvalid, true);
    assert.equal(report.materialInvalid, true);
    assert.equal(report.tokenCurrent, false);
    assert.equal(report.currentSceneNull, true);
    for (const key of ['bodies', 'shapes', 'contacts', 'joints']) assert.equal(report.afterRelease[key], 0);
    assert.deepEqual(report.resourcesAfterRelease, []);
    const close = report.close;
    assert.equal(close.status, 'released');
    assert.deepEqual(close.failures, []);
    assert.deepEqual(close.pending, []);
    assert.equal(close.physicsPreparation.status, 'closed');
    assert.deepEqual(close.physicsPreparation.cleanupErrors, []);
    assert.deepEqual(
        close.physicsPreparation.acquired.map((x) => [x.backend, x.resource, x.cleanup, x.retained]),
        [
            ['box3d', 'module', 'released', []],
            ['box3d', 'world', 'released', []],
        ],
    );
    const receipt = report.moduleRelease;
    assert.equal(receipt.status, 'VERIFIED');
    assert.equal(receipt.verified, true);
    assert.deepEqual(receipt.errors, []);
    assert.deepEqual(receipt, close.physicsPreparation.moduleRelease);
    assert.equal(verifyModuleReleased(receipt.baseline, receipt.terminal), true);
    return true;
}
export async function runPublicModuleRelease({ sdk, app, report, record }) {
    const {
        Node,
        Scene,
        RigidBody,
        BoxCollider,
        TerrainCollider,
        FixedConstraint,
        PhysicsMaterial,
        PhysicsSystem,
        Vec3,
    } = sdk;
    const system = PhysicsSystem.instance,
        world = system.physicsWorld;
    Object.assign(report, {
        profile: PROFILE,
        qualification: {
            host: 'HEADLESS_JSDOM_UNCHANGED_PUBLIC_HOST',
            scope: 'ONE_REAL_SCENE_THEN_SAME_MODULE_TERMINAL_REGISTERED_CHAINS',
            afterCloseNativeProbe: 'NOT_CALLED',
            allNativeHandles: 'NOT_QUALIFIED',
            heapOrGC: 'NOT_QUALIFIED',
            fullC20: 'NOT_QUALIFIED',
            I05: 'NOT_QUALIFIED',
            I06: 'NOT_QUALIFIED',
            preMountCleanup: 'NOT_QUALIFIED',
            byteMeanings:
                'World liveBytes is a capacity ledger; terminal core requested bytes and native bridge/mesh fields are separate, not summed.',
        },
        frames: [],
        sceneRunCalls: 0,
        releaseSceneCalls: 0,
        closeCalls: 0,
    });
    let failure, retainedDebug, debugBefore;
    try {
        assert.equal(app.getScene(), null);
        assert.equal(world.diagnostics().native.nativeStepIndex, 0);
        system.enable = false;
        system.autoSimulation = true;
        system.gravity = new Vec3();
        system.fixedTimeStep = LIMITS.dt;
        system.maxSubSteps = 1;
        const scene = new Scene('module-release-one-scene'),
            material = new PhysicsMaterial();
        material.friction = 0.6;
        material.restitution = 0;
        material.rollingFriction = 0;
        material.spinningFriction = 0;
        const make = (name, position, type, Shape) => {
            const node = new Node(name);
            node.setPosition(...position);
            const body = node.addComponent(RigidBody);
            body.type = type;
            body.mass = 1;
            body.useGravity = false;
            body.allowSleep = false;
            body.linearDamping = 0;
            body.angularDamping = 0;
            const shape = node.addComponent(Shape);
            shape.sharedMaterial = material;
            scene.addChild(node);
            return { node, body, shape };
        };
        const a = make('joint-a', [0, 3, 0], RigidBody.Type.DYNAMIC, BoxCollider),
            b = make('joint-b', [2, 3, 0], RigidBody.Type.DYNAMIC, BoxCollider);
        a.shape.size = new Vec3(0.5, 0.5, 0.5);
        b.shape.size = new Vec3(0.5, 0.5, 0.5);
        const terrainAsset = {
            tileSize: 1,
            getVertexCountI: () => 3,
            getVertexCountJ: () => 3,
            getHeight: (i, j) => [0, 1, 4, 2, 5, 3, 6, 4, 8][j * 3 + i],
        };
        for (let i = 0; i < LIMITS.terrainUsers; i++) {
            const terrain = make('terrain-' + i, [100 + i * 20, 0, 0], RigidBody.Type.STATIC, TerrainCollider);
            terrain.shape.terrain = terrainAsset;
        }
        const joint = a.node.addComponent(FixedConstraint);
        joint.enabled = false;
        joint.connectedBody = b.body;
        joint.enableCollision = false;
        joint.enabled = true;
        report.sceneRunCalls++;
        app.run(scene);
        const token = app.session.token();
        app.session.own(() => {
            material.destroy();
        }, 'module-release-material');
        // Mounted adapter exists; threshold setters do not support pre-mount null adapters.
        report.beforeStepJointOwner = copy(sdk.readBox3DConstraintState(joint));
        assert.equal(report.beforeStepJointOwner.backend, 'box3d');
        assert.equal(report.beforeStepJointOwner.kind, 'fixed');
        joint.breakForce = 1e8;
        joint.breakTorque = 1e8;
        assert.equal(joint.breakForce, 1e8);
        assert.equal(joint.breakTorque, 1e8);
        const clock = sdk.createStepClock({ frameRate: 60, stepTimeoutMs: LIMITS.stepTimeoutMs });
        clock.begin();
        system.enable = true;
        for (let step = 1; step <= LIMITS.steps; step++) {
            assert.equal(app.getScene(), scene);
            assert.equal(system.physicsWorld, world);
            assert.equal(clock.stepping, true);
            const frame = await clock.step(LIMITS.dt);
            report.frames.push(frame);
            record('module-release-frame', frame);
            assert.deepEqual(frame, { step, dt: LIMITS.dt, afterDraw: true });
        }
        report.joint = copy(sdk.readBox3DConstraintState(joint));
        assert.equal(report.joint.state, 'connected');
        assert.equal(report.joint.native.breakForce, 1e8);
        assert.equal(report.joint.native.breakTorque, 1e8);
        world.debugDrawFlags = 1;
        retainedDebug = world.getDebugSnapshot();
        deeplyFrozen(retainedDebug);
        report.debug = copy(retainedDebug);
        record('module-release-debug-copy', report.debug);
        assert(report.debug?.primitives.length > 0);
        debugBefore = JSON.stringify(retainedDebug);
        const counts = world.getNativeCounts();
        report.nonempty = { ...counts, liveBytes: counts.liveBytes.toString() };
        report.activeResources = copy(world.getStaticMeshResourceDiagnostics());
        record('module-release-nonempty', {
            counts: report.nonempty,
            resources: report.activeResources,
            joint: report.joint,
        });
        assert.equal(report.nonempty.bodies, LIMITS.bodies);
        assert.equal(report.nonempty.shapes, LIMITS.shapes);
        assert.equal(report.nonempty.joints, 1);
        assert(report.activeResources.length > 0);
        report.releaseSceneCalls++;
        report.release = await app.releaseScene();
        report.sceneInvalid = !scene.isValid;
        report.materialInvalid = !material.isValid;
        report.tokenCurrent = token.isCurrent();
        report.currentSceneNull = app.getScene() === null;
        const released = world.getNativeCounts();
        report.afterRelease = { ...released, liveBytes: released.liveBytes.toString() };
        report.resourcesAfterRelease = copy(world.getStaticMeshResourceDiagnostics());
        record('module-release-scene-released', {
            release: report.release,
            counts: report.afterRelease,
            resources: report.resourcesAfterRelease,
        });
    } catch (error) {
        failure = error;
        report.error = String(error.stack ?? error);
    } finally {
        try {
            report.closeCalls++;
            report.close = await app.close();
            // The only post-close operation is reading detached receipt data, never world/module APIs.
            const receipt = report.close.physicsPreparation?.moduleRelease;
            report.moduleRelease = copy(receipt);
            record('module-release-terminal-receipt', { close: report.close, moduleRelease: report.moduleRelease });
            deeplyFrozen(receipt);
            if (retainedDebug) report.debugRetainedAfterClose = JSON.stringify(retainedDebug) === debugBefore;
            if (!failure) validatePublicModuleRelease(report);
        } catch (error) {
            report.closeError = String(error.stack ?? error);
            failure ??= error;
        }
        report.status = failure ? 'FAIL' : 'PASS_PUBLIC_MODULE_RELEASE_SUBSET';
        try {
            record('public-module-release-terminal', report);
        } catch (error) {
            report.journalError = String(error.stack ?? error);
            report.status = 'FAIL';
            failure ??= error;
        }
    }
    if (failure) throw failure;
    return report;
}
