/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Import is CPU-only. Production execution requires the separately authorized consumer.
import assert from 'node:assert/strict';
import { CONFIG, validateBaseline, validateActive, validateCycle } from './contract.mjs';

export function snapshotWorld(world) {
    // Real copied native diagnostics; neither JS object counts nor ownership maps are substituted.
    const native = world.getNativeCounts();
    assert(Object.isFrozen(native));
    assert.equal(typeof native.liveBytes, 'bigint');
    const resources = world.getStaticMeshResourceDiagnostics();
    assert(Object.isFrozen(resources));
    return { native: { ...native, liveBytes: native.liveBytes.toString() }, resources: structuredClone(resources) };
}

export async function runSceneCycles({ sdk, app, report, record }) {
    const {
        Node,
        Scene,
        RigidBody,
        BoxCollider,
        SphereCollider,
        TerrainCollider,
        FixedConstraint,
        PhysicsMaterial,
        PhysicsSystem,
        Vec3,
    } = sdk;
    const system = PhysicsSystem.instance;
    const world = system.physicsWorld;
    assert.equal(typeof world.getNativeCounts, 'function', 'Backend diagnostic unavailable: do not fabricate counters');
    assert.equal(typeof world.getStaticMeshResourceDiagnostics, 'function');
    const originalApp = app,
        tokens = [],
        history = [],
        references = [],
        scopes = new Set();
    let clock,
        originalClock,
        activeCycle = null,
        tick = 0;
    report.baseline = snapshotWorld(world);
    record('original-pre-scene-baseline', report.baseline);
    validateBaseline(report.baseline);
    const copyEvent = (event, sensor, visitor) => ({
        type: event.type,
        self: event.selfCollider === sensor ? 'sensor' : event.selfCollider === visitor ? 'visitor' : 'FOREIGN',
        other: event.otherCollider === sensor ? 'sensor' : event.otherCollider === visitor ? 'visitor' : 'FOREIGN',
        impl: structuredClone(event.impl),
    });
    const verifyCopies = () =>
        references.every(
            ({ event, sensor, visitor, before }) => JSON.stringify(copyEvent(event, sensor, visitor)) === before,
        );
    const verifyOldTokens = () => tokens.every((token) => !token.isCurrent());
    const step = async (row, scene) => {
        assert.equal(activeCycle, row.cycle, 'Never step a released or foreign scene');
        assert.equal(app.getScene(), scene);
        assert.equal(scene.isValid, true);
        assert.equal(clock, originalClock);
        assert.equal(clock.stepping, true);
        assert.equal(system.autoSimulation, true);
        assert.equal(system.fixedTimeStep, CONFIG.dt);
        assert.equal(system.maxSubSteps, 1);
        assert(tick - row.startStep < CONFIG.maxStepsPerCycle, 'Frozen per-cycle step budget exhausted');
        tick++;
        const frame = await clock.step(CONFIG.dt);
        report.frames.push(frame);
        record('fixed-frame', { cycle: row.cycle, frame });
        assert.deepEqual(frame, { step: tick, dt: CONFIG.dt, afterDraw: true });
        row.endStep = tick;
    };
    for (let cycle = 1; cycle <= CONFIG.cycles; cycle++) {
        assert(verifyOldTokens(), 'Prior scene generation must remain stale');
        const priorEventCounts = history.map((row) => row.events.length);
        const row = {
            cycle,
            status: 'RUNNING',
            phase: 'construct',
            startStep: tick,
            endStep: tick,
            sceneRunCalls: 0,
            releaseSceneCalls: 0,
            createdBodies: 0,
            createdShapes: 0,
            createdJoints: 0,
            createdTerrainUsers: 0,
            sessionCleanupCalls: 0,
            events: [],
        };
        report.cycles.push(row);
        record('cycle-start', row);
        const scene = new Scene('c20-app-scene-' + cycle);
        row.sceneUUID = scene.uuid;
        const material = new PhysicsMaterial();
        material.restitution = 0;
        material.friction = 0.6;
        material.rollingFriction = 0;
        material.spinningFriction = 0;
        // Three real TerrainColliders share one fresh 3x3 heightfield; no event listeners are attached here.
        const heightValues = [0, 1, 4, 2, 5, 3, 6, 4, 8];
        const terrainAsset = {
            tileSize: 1,
            getVertexCountI: () => 3,
            getVertexCountJ: () => 3,
            getHeight: (i, j) => heightValues[j * 3 + i],
        };
        const make = (name, position, type, Shape, configure) => {
            const node = new Node('cycle-' + cycle + '-' + name);
            node.setPosition(...position);
            const body = node.addComponent(RigidBody);
            body.type = type;
            body.mass = 1;
            body.allowSleep = false;
            body.linearDamping = 0;
            body.angularDamping = 0;
            body.useGravity = false;
            const shape = node.addComponent(Shape);
            shape.sharedMaterial = material;
            configure?.(shape);
            scene.addChild(node);
            row.createdBodies++;
            row.createdShapes++;
            return { node, body, shape };
        };
        for (let i = 0; i < CONFIG.terrainUsers; i++) {
            make('terrain-' + i, [100 + 20 * i, 0, 0], RigidBody.Type.STATIC, TerrainCollider, (shape) => {
                shape.terrain = terrainAsset;
            });
            row.createdTerrainUsers++;
        }
        const sensor = make('sensor', [0, 0, 0], RigidBody.Type.STATIC, BoxCollider, (shape) => {
            shape.size = new Vec3(4, 4, 4);
            shape.isTrigger = true;
        });
        const visitor = make('visitor', [-3, 0, 0], RigidBody.Type.DYNAMIC, SphereCollider, (shape) => {
            shape.radius = 0.5;
        });
        const box = (name, position) =>
            make(name, position, RigidBody.Type.DYNAMIC, BoxCollider, (shape) => {
                shape.size = new Vec3(0.5, 0.5, 0.5);
            });
        const jointA = box('joint-a', [-20, 3, 0]),
            jointB = box('joint-b', [-18, 3, 0]);
        // Same public FixedConstraint configure-disabled -> connectedBody -> enabled sequence as public-fixed-joint.
        const joint = jointA.node.addComponent(FixedConstraint);
        joint.enabled = false;
        joint.connectedBody = jointB.body;
        joint.enableCollision = false;
        joint.breakForce = 1e8;
        joint.breakTorque = 1e8;
        joint.enabled = true;
        row.createdJoints++;
        for (let i = 0; row.createdBodies < CONFIG.bodies; i++) box('body-' + i, [200 + i * 4, 3, 20]);
        row.phase = 'run-scene';
        row.sceneRunCalls++;
        app.run(scene);
        activeCycle = cycle;
        if (!clock) {
            report.clockCreateCalls++;
            clock = sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
            originalClock = clock;
            report.clockBeginCalls++;
            clock.begin();
        }
        // app.run after releaseScene resumes application pacing reasons but preserves the one manual lease.
        assert.equal(clock.stepping, true);
        const scope = app.session;
        assert(!scopes.has(scope), 'Each real scene run adopts a distinct session scope');
        scopes.add(scope);
        const token = scope.token();
        assert(token.isCurrent());
        // Session generation numbers can restart on a new scope; never pretend they are global scene IDs.
        row.scopeGeneration = token.generation;
        scope.own(() => {
            row.sessionCleanupCalls++;
            material.destroy();
        }, 'c20-material-' + cycle);
        system.syncSceneToPhysics();
        system.enable = true;
        for (const self of [sensor.shape, visitor.shape])
            for (const kind of ['onTriggerEnter', 'onTriggerStay', 'onTriggerExit']) {
                self.on(kind, (event) => {
                    const copied = copyEvent(event, sensor.shape, visitor.shape);
                    const observed = {
                        cycle,
                        sceneUUID: scene.uuid,
                        scopeGeneration: token.generation,
                        currentToken: token.isCurrent(),
                        currentScene: app.getScene() === scene,
                        step: tick,
                        ...copied,
                    };
                    row.events.push(observed);
                    record('public-trigger-callback', observed);
                    assert.equal(activeCycle, cycle, 'Old scene callback crossed fixture generation');
                    assert.equal(observed.currentToken, true);
                    assert.equal(observed.currentScene, true);
                    assert.equal(event.selfCollider, self);
                    assert.equal(event.type, kind);
                    assert(Object.isFrozen(event) && Object.isFrozen(event.impl));
                    assert(!copied.self.includes('FOREIGN') && !copied.other.includes('FOREIGN'));
                    if (kind !== 'onTriggerStay')
                        references.push({
                            event,
                            sensor: sensor.shape,
                            visitor: visitor.shape,
                            before: JSON.stringify(copied),
                        });
                });
            }
        row.phase = 'native-create-and-events';
        visitor.body.setLinearVelocity(new Vec3(6, 0, 0));
        const count = (type) => row.events.filter((event) => event.type === type).length;
        for (let i = 0; i < CONFIG.maxEnterSteps && count('onTriggerEnter') < 2; i++) await step(row, scene);
        assert.equal(count('onTriggerEnter'), 2, 'Two real primitive entry callbacks within frozen budget');
        visitor.body.setLinearVelocity(new Vec3(0, 0, 0));
        for (let i = 0; i < CONFIG.staySteps; i++) await step(row, scene);
        row.active = snapshotWorld(world);
        const jointState = sdk.readBox3DConstraintState(joint);
        row.joint = { kind: jointState.kind, state: jointState.state, nativeKind: jointState.native?.kind ?? null };
        record('nonempty-native-scene', { cycle, active: row.active, joint: row.joint });
        validateActive(row.active, report.baseline);
        visitor.body.setLinearVelocity(new Vec3(6, 0, 0));
        for (let i = 0; i < CONFIG.maxExitSteps && count('onTriggerExit') < 2; i++) await step(row, scene);
        assert.equal(count('onTriggerExit'), 2, 'Two real primitive exit callbacks within frozen budget');
        row.beforeRelease = snapshotWorld(world);
        record('before-scene-release', { cycle, snapshot: row.beforeRelease });
        row.phase = 'release-scene';
        const releaseStartStep = tick;
        activeCycle = null;
        row.releaseSceneCalls++;
        row.release = await app.releaseScene();
        row.stepsDuringRelease = tick - releaseStartStep;
        row.afterRelease = snapshotWorld(world);
        row.sceneInvalid = !scene.isValid;
        row.currentSceneNull = app.getScene() === null;
        row.oldTokenCurrent = token.isCurrent();
        tokens.push(token);
        row.allPreviousTokensStale = verifyOldTokens();
        row.previousCallbacksUnchanged = history.every((old, i) => old.events.length === priorEventCounts[i]);
        row.eventCopiesUnchanged = verifyCopies();
        row.materialInvalid = !material.isValid;
        row.sameApp = app === originalApp;
        row.sameClock = clock === originalClock;
        row.sameWorldDiagnosticObject = system.physicsWorld === world;
        row.status = 'COMPLETE';
        row.phase = 'strict-original-baseline-check';
        record('released-cycle-before-validation', row);
        for (const prior of history) {
            assert.notEqual(
                row.events[0]?.impl.logicalPair,
                prior.events[0]?.impl.logicalPair,
                'Old logical pair crossed scenes',
            );
            assert.notDeepEqual(
                row.events[0]?.impl.nativePairs,
                prior.events[0]?.impl.nativePairs,
                'Old native full-generation pair crossed scenes',
            );
        }
        // Fail immediately at the FIRST non-baseline cycle. A legitimate retained capacity difference is not rebased.
        validateCycle(row, report.baseline, cycle === 1 ? 0 : history.at(-1).endStep);
        row.phase = 'complete';
        history.push(row);
        report.completedCycles++;
        report.totalSteps = tick;
        record('cycle-complete', { cycle, completedCycles: report.completedCycles });
    }
    return () => {
        report.finalEventCopiesUnchanged = verifyCopies();
        report.finalTokensStale = verifyOldTokens();
        assert(report.finalEventCopiesUnchanged && report.finalTokensStale);
    };
}
