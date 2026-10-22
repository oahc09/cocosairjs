/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual AIR/Cocos lifecycle + real WASM. Native capability observation and fault seams are fixture-only.
 */
import '../../../src/exports/base';
import { createAirApp } from '../../../src/air/bootstrap';
import type { AirApp } from '../../../src/air/app';
import { airBootstrapRegistry } from '../../../src/air/app-config';
import { registerBox3DFeature, registerBox3DWorldAdapter } from '../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../src/air/physics/box3d/registration';
import { Box3DPhysicsWorld } from '../../../src/air/physics/box3d/world';
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';
import { RigidBody } from '../../../src/cocos/physics/framework/components/rigid-body';
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { SphereCollider } from '../../../src/cocos/physics/framework/components/colliders/sphere-collider';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { Vec3 } from '../../../src/cocos/core/math/vec3';
import { Node } from '../../../src/cocos/scene-graph/node';
import { Scene } from '../../../src/cocos/scene-graph/scene';
import { CCObject } from '../../../src/cocos/core/data/object';
import { director, game } from '../../../src/cocos/game';
import type { Box3DSTLoader } from '../../../src/air/physics/box3d/loader/st-loader.mjs';
import type { Box3DFoundation, Box3DWorld, Box3DId } from '../../../src/air/physics/box3d/binding/facade.mjs';
interface Fixture {
    loader: Box3DSTLoader;
    expected: string;
    binding(): Box3DFoundation;
    token(): Box3DWorld;
    bodies(): Box3DId[];
    shapes(): Box3DId[];
    inject(method: string, stage: string): void;
    observations(): any;
    checkpoint(name: string, value: unknown): void;
    complete(status: 'PASS_LIMITED_NODE_COMPONENTS'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_REAL_WASM_FIXTURE__: Fixture;
const fixture = __BOX3D_REAL_WASM_FIXTURE__;
const vector = (v: Readonly<Vec3>) => [v.x, v.y, v.z];
const last = <T>(a: T[]): T => a[a.length - 1];
function remove(node: Node): void {
    node.destroy();
    CCObject._deferredDestroy();
}
function caught(action: () => void): any {
    try {
        action();
    } catch (error) {
        return error;
    }
    throw new Error('Expected rejection');
}

test('actual Cocos body/primitive components on current native WASM; independently scoped case', async () => {
    let app: AirApp | undefined;
    try {
        registerBox3DFeature({ createLoader: () => fixture.loader });
        registerBox3DWorldAdapter(
            createBox3DWorldAdapter(selector, {
                collisionMask: (group) => PhysicsSystem.instance.collisionMatrix[group],
                sleepThreshold: () => PhysicsSystem.instance.sleepThreshold,
            }),
        );
        app = await createAirApp({
            canvas: '#GameCanvas',
            renderMode: 3,
            physics: 'box3d',
            physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } },
        });
        game.pause();
        const system = PhysicsSystem.instance,
            world = system.physicsWorld as Box3DPhysicsWorld;
        expect(world).toBeInstanceOf(Box3DPhysicsWorld);
        system.autoSimulation = false;
        system.gravity = new Vec3(0, -6, 0);
        const binding = fixture.binding(),
            token = fixture.token();
        const scene = new Scene('real-box3d-components');
        director.runSceneImmediate(scene);
        game.pause(); // Scene activation is real. No app.run, RAF or second simulation clock.
        const node = (name: string, x = 0) => {
            const n = new Node(name);
            n.setWorldPosition(x, 20, 0);
            scene.addChild(n);
            return n;
        };
        const state = (id: Box3DId) => binding.bodyState(token, id);
        fixture.checkpoint('real-startup-and-scene', {
            case: fixture.expected,
            preparation: airBootstrapRegistry().physicsPreparation,
            world: world.diagnostics(),
        });

        if (fixture.expected === 'material-listener') {
            const material = new PhysicsMaterial();
            material.setValues(0.25, 0, 0, 0.125);
            const nodes = [node('material-a'), node('material-b', 10)];
            const colliders = nodes.map((n) => {
                n.active = false;
                const c = n.addComponent(BoxCollider);
                c.sharedMaterial = material;
                n.active = true;
                return c;
            });
            const shapes = fixture.shapes().slice(-2);
            expect(shapes.map((s) => binding.getShapeMaterial(token, s))).toEqual([
                { friction: 0.25, restitution: 0.125 },
                { friction: 0.25, restitution: 0.125 },
            ]);
            material.friction = 0.5;
            const actual = shapes.map((s) => binding.getShapeMaterial(token, s));
            fixture.checkpoint('initial-shared-material-event-update', {
                actual,
                expected: { friction: 0.5, restitution: 0.125 },
                calls: fixture.observations().calls,
            });
            expect(actual).toEqual([
                { friction: 0.5, restitution: 0.125 },
                { friction: 0.5, restitution: 0.125 },
            ]);
            remove(nodes[0]);
            const before = fixture.observations().calls.filter((r: any) => r.name === 'setShapeMaterial').length;
            material.restitution = 0.25;
            expect(binding.getShapeMaterial(token, shapes[1])).toEqual({ friction: 0.5, restitution: 0.25 });
            expect(fixture.observations().calls.filter((r: any) => r.name === 'setShapeMaterial')).toHaveLength(
                before + 1,
            );
            const replacement = new PhysicsMaterial();
            replacement.setValues(0.75, 0, 0, 0.5);
            colliders[1].sharedMaterial = replacement;
            material.friction = 0.125;
            expect(binding.getShapeMaterial(token, shapes[1])).toEqual({ friction: 0.75, restitution: 0.5 });
            remove(nodes[1]);
            const end = fixture.observations().calls.length;
            replacement.friction = 0.25;
            material.restitution = 0.5;
            expect(fixture.observations().calls.length).toBe(end);
            fixture.checkpoint('shared-material-listener-replacement-destroy', {
                counts: world.getNativeCounts(),
                world: world.diagnostics(),
            });
        } else if (fixture.expected !== 'lifecycle') {
            const n = node('fault-subject');
            const rb = n.addComponent(RigidBody);
            n.addComponent(BoxCollider);
            const id = last(fixture.bodies());
            if (fixture.expected === 'body-natural-rejection') rb.type = 2;
            system.step(1 / 60);
            const before = {
                world: world.diagnostics(),
                native: binding.stepDiagnostics(token),
                body: state(id),
                cache: rb.mass,
            };
            let error: any;
            if (fixture.expected === 'body-natural-rejection') {
                error = caught(() => rb.setLinearVelocity(new Vec3(1, 0, 0)));
                expect(error.code).toBe('AIR_E_BOX3D_NATIVE');
                expect(String(error)).toContain('status 8');
                expect(error.mutationOutcome).toBe('not-mutated');
                expect(world.diagnostics()).toEqual(before.world);
                expect(binding.stepDiagnostics(token)).toEqual(before.native);
                expect(state(id)).toEqual(before.body);
                system.step(1 / 60);
                expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(before.native.nativeStepIndex + 1);
            } else if (fixture.expected === 'body-pure') {
                fixture.inject('setBodyMass', 'status8');
                error = caught(() => {
                    rb.mass = 7;
                });
                expect(error.mutationOutcome).toBe('not-mutated');
                expect(world.diagnostics()).toEqual(before.world);
                expect(binding.stepDiagnostics(token)).toEqual(before.native);
                expect(state(id)).toEqual(before.body);
                expect(rb.mass).toBe(before.cache);
                system.step(1 / 60);
                expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(before.native.nativeStepIndex + 1);
            } else {
                if (fixture.expected === 'body-committed' || fixture.expected === 'body-unknown') {
                    fixture.inject('setBodyMass', fixture.expected === 'body-committed' ? 'committed' : 'unknown');
                    error = caught(() => {
                        rb.mass = 7;
                    });
                    expect(state(id).mass).toBe(7);
                    expect(state(id).requestedMass).toBe(
                        fixture.expected === 'body-unknown' ? before.body.requestedMass : 7,
                    );
                    expect(rb.mass).toBe(before.cache);
                } else if (fixture.expected === 'filter-committed') {
                    fixture.inject('setShapeFilters', 'committed');
                    error = caught(() => rb.setMask(2));
                    expect(binding.getShapeFilter(token, last(fixture.shapes())).mask).toBe(2);
                } else if (fixture.expected === 'shape-lost-token') {
                    fixture.inject('createOffsetBox', 'unknown');
                    const c = n.getComponent(BoxCollider)!;
                    error = caught(() => {
                        c.size = new Vec3(2, 2, 2);
                    });
                    expect(vector(c.size)).toEqual([1, 1, 1]);
                    expect(binding.worldCounts(token).counts[1]).toBe(2);
                } else if (fixture.expected === 'body-lost-token') {
                    fixture.inject('createBody', 'unknown');
                    const fresh = node('lost-token', 20);
                    // Cocos lifecycle errors may be caught by its invoker. Observe the actual failure and fault either way.
                    try {
                        fresh.addComponent(BoxCollider);
                    } catch (e) {
                        error = e;
                    }
                    expect(binding.worldCounts(token).counts[0]).toBe(2);
                } else throw new Error('Unknown case ' + fixture.expected);
                expect(world.diagnostics().state).toBe('faulted');
                expect(world.diagnostics().nativeObservationCurrent).toBe(false);
                expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(before.native.nativeStepIndex);
                expect(() => system.step(1 / 60)).toThrow();
            }
            fixture.checkpoint('explicit-real-module-fault-seam', {
                case: fixture.expected,
                error: error
                    ? { message: String(error), code: error.code, mutationOutcome: error.mutationOutcome }
                    : null,
                before,
                after: { world: world.diagnostics(), native: binding.stepDiagnostics(token), body: state(id) },
                counts: binding.worldCounts(token),
            });
        } else {
            const a = node('body-first');
            const rb = a.addComponent(RigidBody);
            const aId = last(fixture.bodies());
            const pending = world.diagnostics();
            expect(state(aId).massPending).toBe(true);
            expect(() => system.step(1 / 60)).toThrow();
            expect(world.diagnostics()).toEqual(pending);
            expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(0);
            const box = a.addComponent(BoxCollider);
            box.center = new Vec3(1, 0, 0);
            box.size = new Vec3(2, 2, 2);
            rb.mass = 6;
            rb.linearDamping = 0;
            rb.angularDamping = 0;
            rb.allowSleep = false;
            expect(state(aId).mass).toBeCloseTo(6, 5);
            expect(state(aId).massPending).toBe(false);
            const b = node('shape-first', 20);
            const sphere = b.addComponent(SphereCollider);
            const bId = last(fixture.bodies());
            expect(state(bId).type).toBe(0);
            expect(state(bId).enabled).toBe(true);
            const rbB = b.addComponent(RigidBody);
            rbB.useGravity = false;
            rbB.allowSleep = false;
            expect(fixture.bodies()).toHaveLength(2);
            expect(state(bId).type).toBe(2);
            const c = node('collider-only', 40);
            const staticBox = c.addComponent(BoxCollider);
            const cId = last(fixture.bodies());
            expect(state(cId).type).toBe(0);
            const multi = a.addComponent(SphereCollider);
            multi.center = new Vec3(-2, 0, 0);
            multi.radius = 0.5;
            expect(fixture.bodies()).toHaveLength(3);
            expect(state(aId).mass).toBeCloseTo(6, 5);
            rb.setGroup(-2147483648);
            rb.setMask(-1);
            const nativeShapes = fixture.shapes();
            const liveA = nativeShapes.filter((s) => {
                try {
                    return binding.getShapeFilter(token, s).group === 2147483648;
                } catch {
                    return false;
                }
            });
            expect(liveA).toHaveLength(2);
            expect(liveA.map((s) => binding.getShapeFilter(token, s).mask)).toEqual([4294967295, 4294967295]);
            fixture.checkpoint('actual-orders-static-multiple-collider', {
                counts: world.getNativeCounts(),
                bodyA: state(aId),
                bodyB: state(bId),
                staticBody: state(cId),
                filters: liveA.map((s) => binding.getShapeFilter(token, s)),
            });
            const old = rb.mass,
                nativeBefore = state(aId),
                diagnosticBefore = world.diagnostics();
            expect(() => {
                rb.mass = NaN;
            }).toThrow();
            expect(rb.mass).toBe(old);
            expect(state(aId)).toEqual(nativeBefore);
            expect(world.diagnostics()).toEqual(diagnosticBefore);
            const oldSize = vector(box.size);
            expect(() => {
                box.size = new Vec3(0.001, 1, 1);
            }).toThrow();
            expect(vector(box.size)).toEqual(oldSize);
            expect(() => {
                box.center = new Vec3(Infinity, 0, 0);
            }).toThrow();
            expect(vector(box.center)).toEqual([1, 0, 0]);
            const poses: unknown[] = [];
            for (let i = 0; i < 60; i++) {
                system.step(1 / 60);
                const pose = Array.from(binding.bodyTransforms(token, [aId]));
                expect(vector(a.worldPosition)).toEqual(pose.slice(0, 3));
                expect(pose.every(Number.isFinite)).toBe(true);
                poses.push({ node: vector(a.worldPosition), pose });
            }
            expect(a.worldPosition.y).toBeCloseTo(17, 1);
            expect(b.worldPosition.y).toBe(20);
            expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(60);
            expect(world.diagnostics().state).toBe('ready');
            fixture.checkpoint('native-origin-not-com-trajectory', {
                poses,
                body: state(aId),
                native: binding.stepDiagnostics(token),
                bounds: { center: vector(box.worldBounds.center), half: vector(box.worldBounds.halfExtents) },
            });
            rb.useGravity = false;
            rb.clearState();
            rb.linearFactor = new Vec3(0, 1, 1);
            rb.applyImpulse(new Vec3(6, 0, 0));
            const velocity = new Vec3();
            rb.getLinearVelocity(velocity);
            expect(velocity.x).toBe(0);
            rb.linearFactor = new Vec3(1, 1, 1);
            rb.applyImpulse(new Vec3(0, 6, 0));
            rb.getLinearVelocity(velocity);
            expect(velocity.y).toBeCloseTo(1, 5);
            rb.clearVelocity();
            rb.setLinearVelocity(new Vec3(0, 2, 0));
            system.step(1 / 60);
            rb.getLinearVelocity(velocity);
            expect(velocity.y).toBeCloseTo(2, 5);
            rb.clearState();
            rb.sleep();
            expect(state(aId).sleeping).toBe(true);
            rb.wakeUp();
            expect(state(aId).awake).toBe(true);
            rb.useCCD = true;
            expect(state(aId).ccd).toBe(true);
            rb.useCCD = false;
            rb.type = 4;
            expect(state(aId).type).toBe(1);
            rb.type = 2;
            expect(state(aId).type).toBe(0);
            rb.type = 1;
            expect(state(aId).type).toBe(2);
            for (const flags of [1, 4]) {
                world.debugDrawFlags = flags;
                const debug = world.getDebugSnapshot()!;
                expect(debug.primitives.length).toBeGreaterThan(0);
                expect(
                    debug.primitives.every((p) =>
                        (p.kind === 'line' ? [...p.from, ...p.to] : [...p.lower, ...p.upper]).every(Number.isFinite),
                    ),
                ).toBe(true);
                fixture.checkpoint('real-component-debug-' + flags, debug);
            }
            world.debugDrawFlags = 0;
            box.enabled = false;
            multi.enabled = false;
            const noGeometry = world.diagnostics();
            expect(() => system.step(1 / 60)).toThrow();
            expect(world.diagnostics()).toEqual(noGeometry);
            box.enabled = true;
            system.step(1 / 60);
            rb.enabled = false;
            expect(state(aId).enabled).toBe(true);
            box.enabled = false;
            expect(state(aId).enabled).toBe(false);
            rb.enabled = true;
            expect(() => system.step(1 / 60)).toThrow();
            box.enabled = true;
            system.step(1 / 60);
            rb.destroy();
            CCObject._deferredDestroy();
            expect(state(aId).type).toBe(0);
            expect(state(aId).enabled).toBe(true);
            fixture.checkpoint('disable-pending-restore-destroy-rigidbody', {
                state: state(aId),
                native: binding.stepDiagnostics(token),
                world: world.diagnostics(),
            });
            remove(a);
            remove(b);
            remove(c);
            expect(world.getNativeCounts()).toMatchObject({ bodies: 0, shapes: 0 });
            expect(world.diagnostics().sceneBindingCount).toBe(0);
            expect(fixture.observations().calls.filter((r: any) => r.name === 'step' && r.returned)).toHaveLength(
                binding.stepDiagnostics(token).nativeStepIndex,
            );
            fixture.checkpoint('component-owners-released-before-world', {
                counts: world.getNativeCounts(),
                world: world.diagnostics(),
                bridge: binding.bridgeMemory(token),
            });
        }
        const close = await app.close!();
        fixture.checkpoint('complete-close-receipt-before-assertion', { close, observations: fixture.observations() });
        expect(close.status).toBe('released');
        expect(await app.close!()).toBe(close);
        const observations = fixture.observations();
        expect(observations.beforeBindingDispose.coreBytes).toBe(observations.initialCoreBytes);
        expect(observations.beforeBindingDispose.bridge).toEqual({
            liveBytes: '0',
            liveAllocations: 0,
            shapeHandles: 0,
            primitiveCapacity: 0,
            capturedPrimitives: 0,
        });
        expect(observations.observationErrors).toEqual([]);
        expect(fixture.loader.diagnostics().status).toBe('DISPOSED');
        fixture.checkpoint('actual-owned-native-cleanup', {
            close,
            loader: fixture.loader.diagnostics(),
            observations,
        });
        fixture.complete('PASS_LIMITED_NODE_COMPONENTS');
    } catch (error) {
        fixture.fail(error);
        throw error;
    } finally {
        if (app) await app.close?.();
    }
});
