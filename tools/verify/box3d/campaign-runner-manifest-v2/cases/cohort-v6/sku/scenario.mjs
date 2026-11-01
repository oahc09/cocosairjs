/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createPublicBeforeStepRegistrar } from '../../cohort-v2/public-producer-phase.mjs';
const here = dirname(fileURLToPath(import.meta.url));
import { assertScenario } from './assertions.mjs';
const config = JSON.parse(readFileSync(join(here, 'frozen/config.json'), 'utf8'));
export async function runScenario({ sdk, app, report, mode, flush }) {
    const { Node, Scene, RigidBody, BoxCollider, CapsuleCollider, Vec3, PhysicsSystem } = sdk;
    const sku = config.skus[mode];
    assert(sku);
    const system = PhysicsSystem.instance;
    system.enable = false;
    system.autoSimulation = true;
    system.fixedTimeStep = 1 / 60;
    system.maxSubSteps = 1;
    system.gravity = new Vec3(0, 0, 0);
    const sensorSize = [config.machine.receiver.chuteInnerSizeXZ[0], 0.04, config.machine.receiver.chuteInnerSizeXZ[1]];
    const sensorPosition = [
        config.machine.packing.centerXZ[0],
        config.machine.receiver.planeY,
        config.machine.packing.centerXZ[1],
    ];
    const initialPosition = [sensorPosition[0], 1.1, sensorPosition[2]];
    report.configuration = {
        skuId: mode,
        sku: structuredClone(sku),
        configVersion: config.configVersion,
        sensorSize,
        sensorPosition,
        sensorThicknessSource: 'frozen/FIXTURE-SPEC.md receiver sensor slab',
        initialPosition,
        gravity: [0, 0, 0],
        initialLinearVelocity: [0, -0.3, 0],
        linearDamping: 0.03,
        angularDamping: 0.05,
        allowSleep: true,
        fixedTimeStep: 1 / 60,
        solverSubSteps: 4,
        observationScope:
            'Collider-pair trigger membership only; item union is diagnostic and cannot prove full crossing or shipment delivery.',
    };
    report.identities = [];
    report.epochs = [];
    report.motion = [];
    report.producerTicks = [];
    report.itemUnion = [];
    const scene = new Scene('EX09-trigger-SKU-' + mode);
    const sensorNode = new Node('receiver-sensor');
    sensorNode.setPosition(...sensorPosition);
    sensorNode.addComponent(RigidBody).type = RigidBody.Type.STATIC;
    const sensor = sensorNode.addComponent(BoxCollider);
    sensor.size = new Vec3(...sensorSize);
    sensor.isTrigger = true;
    scene.addChild(sensorNode);
    const labels = new Map([
        [sensor, Object.freeze({ label: 'receiver-sensor', itemId: null, itemGeneration: null, childIndex: null })],
    ]);
    const retained = [];
    let tick = 0,
        current = null,
        destroyedGeneration = 0;
    const activeChildren = new Set();
    let itemWasActive = false;
    const kinds = ['onTriggerEnter', 'onTriggerStay', 'onTriggerExit'];
    const eventCopy = (event) => ({
        type: event.type,
        self: labels.get(event.selfCollider),
        other: labels.get(event.otherCollider),
        impl: structuredClone(event.impl),
    });
    const record = (event, self, kind) => {
        assert.equal(event.type, kind);
        assert.equal(event.selfCollider, self);
        assert(labels.has(event.otherCollider));
        const copy = eventCopy(event);
        for (const identity of [copy.self, copy.other])
            if (identity.itemGeneration !== null)
                assert(identity.itemGeneration > destroyedGeneration, 'No old-generation delivery after destruction');
        report.events.push({ tick, ...copy });
        if (retained.length < 24) retained.push({ event, before: JSON.stringify(copy) });
        if (self === sensor) {
            const id = copy.other.label;
            if (kind === 'onTriggerEnter') {
                assert(!activeChildren.has(id));
                activeChildren.add(id);
            } else if (kind === 'onTriggerStay') assert(activeChildren.has(id));
            else {
                assert(activeChildren.has(id));
                activeChildren.delete(id);
            }
        }
    };
    const listen = (collider) => {
        for (const kind of kinds)
            collider.on(kind, (event) => {
                record(event, collider, kind);
            });
    };
    const createItem = (generation) => {
        const node = new Node('EX09-' + mode + '-generation-' + generation);
        node.setPosition(...initialPosition);
        const body = node.addComponent(RigidBody);
        body.type = RigidBody.Type.DYNAMIC;
        body.mass = sku.massKg;
        body.allowSleep = true;
        body.linearDamping = 0.03;
        body.angularDamping = 0.05;
        const colliders = sku.shapes.map((shape, index) => {
            const collider = node.addComponent(shape.type === 'box' ? BoxCollider : CapsuleCollider);
            if (shape.type === 'box') collider.size = new Vec3(...shape.size);
            else {
                assert.equal(shape.axis, 'Y');
                collider.radius = shape.radius;
                collider.cylinderHeight = shape.cylinderHeight;
                collider.direction = sdk.EAxisDirection.Y_AXIS;
            }
            collider.center = new Vec3(...shape.center);
            const identity = Object.freeze({
                label: `${mode}/item-1/g${generation}/collider-${index}`,
                itemId: `${mode}/item-1`,
                itemGeneration: generation,
                childIndex: index,
            });
            labels.set(collider, identity);
            report.identities.push({ ...identity, geometry: structuredClone(shape) });
            return collider;
        });
        scene.addChild(node);
        return { node, body, colliders, generation };
    };
    current = createItem(1);
    app.run(scene);
    const clock = sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
    clock.begin();
    const observer = createPublicBeforeStepRegistrar(
        sdk,
        system,
    )((context) => {
        report.producerTicks.push(context.tickIndex);
    });
    listen(sensor);
    current.colliders.forEach(listen);
    const readMotion = () => {
        const value = sdk.readBox3DBodyMotion(current.body);
        return structuredClone(value);
    };
    const step = async (flightIndex = null) => {
        tick++;
        report.totalSteps = tick;
        const frame = await clock.step(1 / 60);
        assert.deepEqual(frame, { step: tick, dt: 1 / 60, afterDraw: true });
        report.frames.push(frame);
        if (current) {
            const motion = readMotion();
            report.motion.push({ tick, generation: current.generation, flightIndex, ...motion });
            assert.equal(motion.massPending, false);
            assert.equal(motion.enabled, true);
            assert.equal(motion.type, 2);
            assert(Math.abs(motion.mass - sku.massKg) < 1e-6);
            if (flightIndex !== null) {
                const expectedY = -0.3 / Math.pow(1 + (1 / 60 / 4) * 0.03, 4 * flightIndex);
                assert(
                    Math.abs(motion.linearVelocity.y - expectedY) < 0.00002,
                    'Real no-force velocity must follow unchanged configured Box3D damping',
                );
                assert(Math.abs(motion.linearVelocity.x) < 1e-7 && Math.abs(motion.linearVelocity.z) < 1e-7);
                assert(Math.hypot(motion.angularVelocity.x, motion.angularVelocity.y, motion.angularVelocity.z) < 1e-7);
                assert(
                    Math.abs(motion.position.x - initialPosition[0]) < 1e-6 &&
                        Math.abs(motion.position.z - initialPosition[2]) < 1e-6,
                );
                assert(
                    Math.abs(motion.rotation.x) < 1e-7 &&
                        Math.abs(motion.rotation.y) < 1e-7 &&
                        Math.abs(motion.rotation.z) < 1e-7 &&
                        Math.abs(motion.rotation.w - 1) < 1e-7,
                );
            }
            const itemActive = activeChildren.size > 0;
            if (itemActive || itemWasActive)
                report.itemUnion.push({
                    tick,
                    itemId: `${mode}/item-1`,
                    itemGeneration: current.generation,
                    type: itemActive ? (itemWasActive ? 'stay' : 'enter') : 'exit',
                    activeColliderLabels: [...activeChildren].sort(),
                    diagnosticOnly: true,
                });
            itemWasActive = itemActive;
        }
    };
    const exits = (generation) =>
        report.events.filter(
            (event) =>
                event.self.label === 'receiver-sensor' &&
                event.other.itemGeneration === generation &&
                event.type === 'onTriggerExit',
        );
    for (const generation of [1, 2]) {
        if (generation === 2) {
            current = createItem(2);
            system.syncSceneToPhysics();
            current.colliders.forEach(listen);
        }
        const initial = readMotion();
        const sleepThreshold = current.body.sleepThreshold;
        assert(0.3 > sleepThreshold && 0.3 <= config.machine.magnet.verticalSpeedMax);
        report.observedSleepThreshold = sleepThreshold;
        report.epochs.push({ generation, startTick: tick, startEvent: report.events.length, initial });
        assert(Math.abs(initial.mass - sku.massKg) < 1e-6);
        assert(initial.position.y + sku.localBounds.min[1] > sensorPosition[1] + sensorSize[1] / 2);
        current.body.setLinearVelocity(new Vec3(0, -0.3, 0));
        let flightIndex = 0;
        while (exits(generation).length < sku.shapes.length && flightIndex < 700) {
            await step(++flightIndex);
        }
        assert.equal(
            exits(generation).length,
            sku.shapes.length,
            'Every actual public collider must naturally leave the slab',
        );
        assert.equal(activeChildren.size, 0);
        current.body.setLinearVelocity(new Vec3(0, 0, 0));
        const separatedAt = report.events.length;
        for (let i = 0; i < 5; i++) await step();
        assert.equal(report.events.length, separatedAt, 'No fabricated continuing trigger after separation');
        const epoch = report.epochs.at(-1);
        epoch.endTick = tick;
        epoch.endEvent = report.events.length;
        epoch.flightSteps = flightIndex;
        epoch.final = readMotion();
        epoch.diagnosticHighestY = epoch.final.position.y + sku.localBounds.max[1];
        epoch.geometryCrossingIsNotDeliveryEvidence = true;
        if (generation === 1) {
            const oldNode = current.node;
            oldNode.destroy();
            destroyedGeneration = 1;
            current = null;
            const eventCount = report.events.length;
            await step();
            await step();
            report.destroyedFirstGeneration = {
                valid: oldNode.isValid,
                eventCountBefore: eventCount,
                eventCountAfter: report.events.length,
                atTick: tick,
            };
            assert.equal(oldNode.isValid, false);
            assert.equal(report.events.length, eventCount);
        }
        flush();
    }
    report.lifetime = retained.map(({ event, before }) => ({ before, after: JSON.stringify(eventCopy(event)) }));
    observer.dispose();
    assertScenario(report);
    report.scenarioAssertionsPassed = true;
    return () => {
        report.lifetimeAfterClose = retained.map(({ event, before }) => ({
            before,
            after: JSON.stringify(eventCopy(event)),
        }));
        for (const item of report.lifetimeAfterClose) assert.equal(item.after, item.before);
    };
}
