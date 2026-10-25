/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import assert from 'node:assert/strict';
import { assertScenario } from './assertions.mjs';

import { createPublicBeforeStepRegistrar } from '../../cohort-v2/public-producer-phase.mjs';
const registerPublicObserver = (sdk, system, callback) => createPublicBeforeStepRegistrar(sdk, system)(callback);

export async function runScenario({ sdk, app, report, mode, flush }) {
    const { Node, Scene, RigidBody, BoxCollider, SphereCollider, PhysicsSystem, Vec3 } = sdk;
    const system = PhysicsSystem.instance;
    system.enable = false;
    system.autoSimulation = true;
    system.fixedTimeStep = 1 / 60;
    system.maxSubSteps = 1;
    system.gravity = new Vec3(0, 0, 0);
    const scene = new Scene('public-trigger-' + mode);
    const sensorNode = new Node('box-sensor');
    sensorNode.addComponent(RigidBody).type = RigidBody.Type.STATIC;
    const sensor = sensorNode.addComponent(BoxCollider);
    sensor.size = new Vec3(4, 4, 4);
    sensor.isTrigger = true;
    scene.addChild(sensorNode);
    const labels = new Map([[sensor, 'sensor']]);
    const makeVisitor = (name, compound = false) => {
        const node = new Node(name);
        node.setPosition(-4, 0, 0);
        const body = node.addComponent(RigidBody);
        body.type = RigidBody.Type.DYNAMIC;
        body.mass = 1;
        body.allowSleep = false;
        body.linearDamping = 0;
        body.angularDamping = 0;
        const colliders = (compound ? [-0.6, 0.6] : [0]).map((y, index) => {
            const shape = node.addComponent(SphereCollider);
            shape.radius = compound ? 0.4 : 0.5;
            shape.center = new Vec3(0, y, 0);
            shape.isTrigger = mode === 'dual-sensor';
            labels.set(shape, compound ? name + '-child-' + index : name);
            return shape;
        });
        scene.addChild(node);
        return { node, body, colliders };
    };
    const visitor = makeVisitor('visitor', mode === 'compound');
    report.configuration = {
        boxSize: [4, 4, 4],
        initialPosition: [-4, 0, 0],
        gravity: [0, 0, 0],
        visitorRadius: mode === 'compound' ? 0.4 : 0.5,
        visitorChildren: visitor.colliders.length,
        bothSensors: mode === 'dual-sensor',
        fixedTimeStep: 1 / 60,
        maxSubSteps: 1,
        solverSubSteps: 4,
    };
    report.phases = [];
    report.producerTicks = [];
    report.lifetime = [];
    report.counts = {
        onceEnter: 0,
        onceStay: 0,
        onceExit: 0,
        offInsideStay: 0,
        removedBeforeEnter: 0,
        destructionRequests: 0,
        faultCalls: 0,
    };
    app.run(scene);
    const clock = sdk.createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
    clock.begin();
    const observer = registerPublicObserver(sdk, system, (context) => {
        report.producerTicks.push(context.tickIndex);
    });
    let tick = 0;
    const references = [];
    const destroyed = new Set();
    const copy = (event) => ({
        type: event.type,
        self: labels.get(event.selfCollider),
        other: labels.get(event.otherCollider),
        impl: structuredClone(event.impl),
    });
    const record = (event, self, kind) => {
        assert.equal(event.type, kind);
        assert.equal(event.selfCollider, self);
        assert(labels.has(event.otherCollider), 'Real event must resolve to a public fixture collider');
        assert(
            !destroyed.has(self) && !destroyed.has(event.otherCollider),
            'No delivery to a collider after its destruction request',
        );
        const value = copy(event);
        report.events.push({ tick, ...value });
        if (references.length < 16) references.push({ event, serialized: JSON.stringify(value) });
        flush();
    };
    const kinds = ['onTriggerEnter', 'onTriggerStay', 'onTriggerExit'];
    const listen = (self) => {
        for (const kind of kinds) self.on(kind, (event) => record(event, self, kind));
    };
    const copiedPosition = (node) => {
        const value = node.worldPosition;
        return value === null ? null : [value.x, value.y, value.z];
    };
    const step = async () => {
        tick++;
        report.totalSteps = tick;
        const frame = await clock.step(1 / 60);
        assert.deepEqual(frame, { step: tick, dt: 1 / 60, afterDraw: true });
        report.frames.push(frame);
        report.lastPositions = {
            sensor: copiedPosition(sensorNode),
            visitor: copiedPosition(visitor.node),
            visitorValid: visitor.node.isValid,
        };
    };
    const steps = async (count) => {
        for (let i = 0; i < count; i++) await step();
    };
    const count = (self, type) => report.events.filter((event) => event.self === self && event.type === type).length;
    const until = async (predicate, bound, label) => {
        for (let i = 0; i < bound && !predicate(); i++) await step();
        assert(predicate(), 'Bounded real observation missing: ' + label);
    };
    const velocity = (body, x) => body.setLinearVelocity(new Vec3(x, 0, 0));
    const phase = async (label, action) => {
        const entry = { label, startEvent: report.events.length, startTick: tick, status: 'RUNNING' };
        report.phases.push(entry);
        report.phase = label;
        flush();
        await action();
        entry.endEvent = report.events.length;
        entry.endTick = tick;
        entry.status = 'COMPLETE';
        entry.positionAfter = copiedPosition(visitor.node);
        entry.visitorValidAfter = visitor.node.isValid;
        flush();
    };
    report.phase = 'register-public-trigger-listener';
    report.action = {
        api: mode === 'once-only' ? 'Collider.once' : 'Collider.on',
        type: 'onTriggerEnter',
        self: 'box-sensor',
        other: 'sphere-visitor',
    };
    flush();
    if (mode === 'once-only') {
        for (const self of [sensor, visitor.colliders[0]])
            self.once('onTriggerEnter', (event) => record(event, self, 'onTriggerEnter'));
    } else {
        listen(sensor);
        for (const child of visitor.colliders) listen(child);
    }
    report.listenerAdmission = true;
    if (mode === 'admission') return;
    if (mode === 'lifecycle') {
        const shape = visitor.colliders[0];
        shape.once('onTriggerEnter', () => {
            report.counts.onceEnter++;
        });
        shape.once('onTriggerStay', () => {
            report.counts.onceStay++;
        });
        shape.once('onTriggerExit', () => {
            report.counts.onceExit++;
        });
        const offInsideStay = () => {
            report.counts.offInsideStay++;
            shape.off('onTriggerStay', offInsideStay);
        };
        shape.on('onTriggerStay', offInsideStay);
        const removed = () => {
            report.counts.removedBeforeEnter++;
        };
        sensor.on('onTriggerEnter', removed);
        sensor.off('onTriggerEnter', removed);
    }
    if (mode === 'callback-destroy')
        sensor.once('onTriggerEnter', () => {
            report.counts.destructionRequests++;
            report.destroyRequestedAt = tick;
            visitor.node.destroy();
            for (const shape of visitor.colliders) destroyed.add(shape);
        });
    if (mode === 'callback-fault') {
        const marker = new Error('intentional-public-trigger-callback-fault');
        sensor.once('onTriggerEnter', () => {
            report.counts.faultCalls++;
            throw marker;
        });
        let caught;
        velocity(visitor.body, 3);
        try {
            await until(() => report.counts.faultCalls > 0, 100, 'intentional trigger callback fault');
        } catch (error) {
            caught = error;
        }
        report.fault = {
            exactErrorIdentity: caught === marker,
            message: caught?.message ?? null,
            code: caught?.code ?? null,
        };
        assert.equal(caught, marker, 'Fault must originate in the real public trigger callback');
        let reject;
        try {
            visitor.body.setLinearVelocity(new Vec3(0, 0, 0));
        } catch (error) {
            reject = error;
        }
        report.fault.nextMutationCode = reject?.code ?? null;
        assert.equal(reject?.code, 'AIR_E_BOX3D_WORLD_FAULTED');
        report.intentionalFaultObserved = true;
    } else {
        await phase('enter', async () => {
            velocity(visitor.body, 3);
            await until(
                () => count('sensor', 'onTriggerEnter') === visitor.colliders.length,
                100,
                'sensor enters every public child pair',
            );
            if (mode !== 'callback-destroy') {
                await steps(8);
                velocity(visitor.body, 0);
            }
        });
        if (mode === 'callback-destroy') {
            await phase('after-destroy', () => steps(5));
            report.destroyedValidAfterSteps = visitor.node.isValid;
            const replacement = makeVisitor('replacement');
            listen(replacement.colliders[0]);
            system.syncSceneToPhysics();
            await phase('replacement-enter', async () => {
                velocity(replacement.body, 3);
                await until(() => count('replacement', 'onTriggerEnter') === 1, 100, 'replacement generation enters');
                velocity(replacement.body, 0);
            });
            await phase('replacement-stay', () => steps(6));
        } else {
            await phase('stay', () => steps(12));
            if (mode === 'lifecycle') {
                await phase('overlapping-size-rebuild', async () => {
                    sensor.size = new Vec3(5, 4, 4);
                    await steps(8);
                });
                await phase('disabled', async () => {
                    sensor.enabled = false;
                    await steps(4);
                });
                await phase('reenabled', async () => {
                    sensor.enabled = true;
                    await steps(5);
                });
            }
            await phase('exit', async () => {
                velocity(visitor.body, 6);
                if (mode === 'once-only') await steps(65);
                else
                    await until(
                        () => count('sensor', 'onTriggerExit') === visitor.colliders.length,
                        120,
                        'natural physical separation',
                    );
                velocity(visitor.body, 0);
            });
            await phase('separated', () => steps(5));
            if (mode === 'lifecycle' || mode === 'once-only') {
                const priorEnters = count('sensor', 'onTriggerEnter');
                await phase('reenter', async () => {
                    velocity(visitor.body, -6);
                    if (mode === 'once-only') await steps(45);
                    else await until(() => count('sensor', 'onTriggerEnter') === priorEnters + 1, 120, 'real reentry');
                    velocity(visitor.body, 0);
                });
                await phase('reenter-stay', () => steps(6));
            }
            if (mode === 'lifecycle') {
                for (const kind of kinds) visitor.colliders[0].off(kind);
                await phase('visitor-off', () => steps(4));
                report.visitorNeedTriggerAfterOff = visitor.colliders[0].needTriggerEvent;
                for (const kind of kinds) sensor.off(kind);
                await phase('both-off', () => steps(4));
                report.sensorNeedTriggerAfterOff = sensor.needTriggerEvent;
            }
            if (mode === 'once-only')
                report.onceNeedFlags = [sensor.needTriggerEvent, visitor.colliders[0].needTriggerEvent];
        }
    }
    for (const reference of references)
        report.lifetime.push({ before: reference.serialized, after: JSON.stringify(copy(reference.event)) });
    report.totalSteps = tick;
    report.observerDisposedBeforeClose = false;
    if (!report.intentionalFaultObserved) {
        observer.dispose();
        report.observerDisposedBeforeClose = true;
    }
    assertScenario(report);
    report.scenarioAssertionsPassed = true;
    return () => {
        report.lifetimeAfterClose = references.map((reference) => ({
            before: reference.serialized,
            after: JSON.stringify(copy(reference.event)),
        }));
        for (const row of report.lifetimeAfterClose)
            assert.equal(row.after, row.before, 'Copied public event remains stable after app.close');
    };
}
