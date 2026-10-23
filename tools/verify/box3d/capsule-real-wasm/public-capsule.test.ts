/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual Cocos public components + owned clock + receipt-bound fresh native Capsule WASM.
// Narrow Node/JSDOM HEADLESS integration, not browser/rendering or whole-release acceptance.
import '../../../../src/exports/base';
import { createAirApp } from '../../../../src/air/bootstrap';
import type { AirApp } from '../../../../src/air/app';
import { registerBox3DBeforeStep } from '../../../../src/air/box3d-controls';
import { registerBox3DFeature, registerBox3DWorldAdapter } from '../../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../../src/air/physics/box3d/registration';
import { PhysicsSystem } from '../../../../src/cocos/physics/framework/physics-system';
import { RigidBody } from '../../../../src/cocos/physics/framework/components/rigid-body';
import { CapsuleCollider } from '../../../../src/cocos/physics/framework/components/colliders/capsule-collider';
import { selector } from '../../../../src/cocos/physics/framework/physics-selector';
import { Vec3 } from '../../../../src/cocos/core/math/vec3';
import { Ray } from '../../../../src/cocos/core/geometry/ray';
import { Node } from '../../../../src/cocos/scene-graph/node';
import { Scene } from '../../../../src/cocos/scene-graph/scene';
import { createStepClock } from '../../../../src/air/step-clock';

declare const __CAPSULE56_FIXTURE__: any;
const fixture = __CAPSULE56_FIXTURE__;
const xyz = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z];
const nearVector = (actual: number[], expected: number[]) => {
    expect(actual).toHaveLength(expected.length);
    actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index], 5));
};

test('actual CapsuleCollider three-axis geometry, atomic replacement, public ray identity, force and close', async () => {
    let app: AirApp | undefined;
    let closed = false;
    try {
        registerBox3DFeature({ createLoader: () => fixture.loader });
        registerBox3DWorldAdapter(
            createBox3DWorldAdapter(
                selector,
                {
                    collisionMask: (group) => PhysicsSystem.instance.collisionMatrix[group],
                    sleepThreshold: () => PhysicsSystem.instance.sleepThreshold,
                },
                undefined,
                { physicsSystem: () => PhysicsSystem.instance },
            ),
        );
        app = await createAirApp({
            canvas: '#GameCanvas',
            renderMode: 3,
            physics: 'box3d',
            physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } },
        });
        const clock = createStepClock({ frameRate: 10, stepTimeoutMs: 2000 });
        const system = PhysicsSystem.instance;
        system.autoSimulation = false;
        system.gravity = new Vec3(0, 0, 0);
        const scene = new Scene('capsule56-real-cocos');
        app.run(scene);
        clock.begin();
        const binding = fixture.binding();
        const token = fixture.token();
        const creates = () => fixture.observations().nativeShapeCreates;
        const latestCreate = () => creates().at(-1);
        const latestRaw = () =>
            fixture
                .observations()
                .calls.filter((row: any) => row.name === 'rayAllRaw')
                .at(-1).result;
        const rayTo = (center: number[], direction: number, distance = 20) => {
            const start = [...center],
                axis = [0, 0, 0];
            start[direction] -= distance;
            axis[direction] = 1;
            return new Ray(start[0], start[1], start[2], axis[0], axis[1], axis[2]);
        };
        const expectRayIdentity = (
            collider: CapsuleCollider,
            creation: any,
            center: number[],
            direction: number,
            extent: number,
            distance = 20,
        ) => {
            const ray = rayTo(center, direction, distance);
            expect(system.raycast(ray, 0xffffffff, distance * 2, false)).toBe(true);
            expect(system.raycastResults.map((result) => result.collider)).toEqual([collider]);
            expect(system.raycastResults[0].distance).toBeCloseTo(distance - extent, 4);
            expect(latestRaw()).toHaveLength(1);
            expect(latestRaw()[0].shape).toEqual(creation.shape);
            expect(fixture.nativeShapeValid(creation.shape)).toBe(1);
            expect(system.raycastClosest(ray, 0xffffffff, distance * 2, false)).toBe(true);
            expect(system.raycastClosestResult.collider).toBe(collider);
            expect(system.raycastClosestResult.distance).toBeCloseTo(distance - extent, 4);
            expect(latestRaw()[0].shape).toEqual(creation.shape);
        };
        const make = (name: string, position: number[], direction: number, height: number, center: number[]) => {
            const node = new Node(name);
            node.setPosition(position[0], position[1], position[2]);
            node.setScale(2, 3, 4);
            const body = node.addComponent(RigidBody);
            body.mass = 2;
            body.useGravity = false;
            body.linearDamping = 0;
            body.angularDamping = 0;
            const collider = node.addComponent(CapsuleCollider);
            collider.radius = 0.5;
            collider.cylinderHeight = height;
            collider.direction = direction;
            collider.center = new Vec3(center[0], center[1], center[2]);
            const before = creates().length;
            scene.addChild(node);
            system.syncSceneToPhysics();
            expect(creates()).toHaveLength(before + 1);
            const creation = latestCreate();
            expect(creation.kind).toBe(2);
            expect(creation.status).toBe(0);
            expect(creation.sensor).toBe(0);
            expect(creation.target).toBe(2);
            return { node, body, collider, creation };
        };
        const axes: ReturnType<typeof make>[] = [];
        for (const direction of [0, 1, 2]) {
            const origin = [direction * 40, direction * 40, direction * 40];
            const value = make(`capsule-axis-${direction}`, origin, direction, 4, [0.25, -0.5, 0.75]);
            axes.push(value);
            const center = origin.map((n, i) => n + [0.5, -1.5, 3][i]);
            const radius = direction === 2 ? 1.5 : 2;
            const halfSegment = [4, 6, 8][direction];
            expect(value.creation.input).toEqual([0.5, -1.5, 3, radius, halfSegment, direction, 1]);
            nearVector(xyz(value.collider.worldBounds.center), center);
            nearVector(
                xyz(value.collider.worldBounds.halfExtents),
                [0, 1, 2].map((axis) => radius + (axis === direction ? halfSegment : 0)),
            );
            expect(value.collider.boundingSphere.radius).toBeCloseTo(radius + halfSegment, 5);
            expect(value.collider.worldHeight).toBeCloseTo(2 * (radius + halfSegment), 5);
            const state = fixture.bodyStateForNativeId(value.creation.body);
            expect(state.mass).toBe(2);
            nearVector(state.localCenter, [0.5, -1.5, 3]);
            expect(state.inertia.every(Number.isFinite)).toBe(true);
            expectRayIdentity(value.collider, value.creation, center, direction, radius + halfSegment);
            fixture.checkpoint(`axis-${direction}-scaled-center-public-ray-native-identity`, {
                creation: value.creation,
                center,
                radius,
                halfSegment,
                state,
            });
        }
        const first = axes[0];
        const oldId = first.creation.shape;
        const beforeState = fixture.bodyStateForNativeId(first.creation.body);
        const beforeCounts = Array.from(binding.worldCounts(token).counts);
        const beforeCreates = creates().length;
        const fields = [first.collider.radius, first.collider.cylinderHeight, first.collider.direction];
        expect(() => {
            first.collider.cylinderHeight = 0.001;
        }).toThrow('AIR_E_BOX3D_UNSUPPORTED');
        expect([first.collider.radius, first.collider.cylinderHeight, first.collider.direction]).toEqual(fields);
        expect(creates()).toHaveLength(beforeCreates);
        expect(fixture.bodyStateForNativeId(first.creation.body)).toEqual(beforeState);
        expect(Array.from(binding.worldCounts(token).counts)).toEqual(beforeCounts);
        expectRayIdentity(first.collider, first.creation, [0.5, -1.5, 3], 0, 6);
        fixture.checkpoint('short-positive-segment-reject-before-native-and-public-field-commit', {
            fields,
            beforeState,
            beforeCounts,
            oldId,
        });

        // Finite geometry reaches the real native aggregate mass/inertia preflight and is rejected there.
        expect(() => {
            first.collider.radius = 1e10;
        }).toThrow();
        expect(latestCreate().status).toBe(2);
        expect(creates()).toHaveLength(beforeCreates + 1);
        expect([first.collider.radius, first.collider.cylinderHeight, first.collider.direction]).toEqual(fields);
        expect(fixture.bodyStateForNativeId(first.creation.body)).toEqual(beforeState);
        expect(Array.from(binding.worldCounts(token).counts)).toEqual(beforeCounts);
        expect(fixture.nativeShapeValid(oldId)).toBe(1);
        const rejection = fixture
            .observations()
            .calls.filter((row: any) => row.name === 'createOffsetCapsule')
            .at(-1);
        expect(rejection.returned).toBe(false);
        expect(rejection.mutationOutcome).toBe('not-mutated');
        expectRayIdentity(first.collider, first.creation, [0.5, -1.5, 3], 0, 6);
        fixture.checkpoint('real-native-preflight-reject-preserves-shape-mass-world-and-public-fields', {
            rejectedCreate: latestCreate(),
            rejection,
            fields,
            beforeState,
            oldId,
        });

        // Exercise all three real adapter setters after initialization, not only serialized initialization.
        first.collider.radius = 0.75;
        let replacement = latestCreate();
        expect(fixture.nativeShapeValid(oldId)).toBe(0);
        expect(replacement.input).toEqual([0.5, -1.5, 3, 3, 4, 0, 1]);
        const radiusId = replacement.shape;
        first.collider.cylinderHeight = 2;
        replacement = latestCreate();
        expect(fixture.nativeShapeValid(radiusId)).toBe(0);
        expect(replacement.input).toEqual([0.5, -1.5, 3, 3, 2, 0, 1]);
        const heightId = replacement.shape;
        first.collider.direction = 2;
        replacement = latestCreate();
        expect(fixture.nativeShapeValid(heightId)).toBe(0);
        expect(replacement.input).toEqual([0.5, -1.5, 3, 2.25, 4, 2, 1]);
        expect(fixture.bodyStateForNativeId(first.creation.body).mass).toBe(2);
        expectRayIdentity(first.collider, replacement, [0.5, -1.5, 3], 2, 6.25);
        fixture.checkpoint('three-public-setters-native-generation-replacement', {
            oldId,
            radiusId,
            heightId,
            replacement,
        });

        const zero = make('zero-cylinder-native-sphere-boundary', [200, 0, 0], 2, 0, [0, 0, 0]);
        expect(zero.creation.input).toEqual([0, 0, 0, 1.5, 0, 2, 1]);
        const zeroState = fixture.bodyStateForNativeId(zero.creation.body);
        expect(zeroState.mass).toBe(2);
        nearVector(zeroState.localCenter, [0, 0, 0]);
        nearVector(zeroState.inertia, [1.8, 0, 0, 0, 1.8, 0, 0, 0, 1.8]);
        nearVector(xyz(zero.collider.worldBounds.halfExtents), [1.5, 1.5, 1.5]);
        for (const axis of [0, 1, 2]) expectRayIdentity(zero.collider, zero.creation, [200, 0, 0], axis, 1.5, 10);
        fixture.checkpoint('zero-height-sphere-mass-inertia-and-three-axis-native-ray-geometry', {
            creation: zero.creation,
            zeroState,
            identityBoundary:
                'Actual native shape type is asserted by the separate C capsule contract; this public fixture proves kind-2 zero input, sphere mass/inertia and ray geometry, not a synthetic type label.',
        });

        const contexts: unknown[] = [];
        const shapeCallsBeforeStep = creates().length;
        const hook = registerBox3DBeforeStep((context) => {
            expect(Object.isFrozen(context)).toBe(true);
            contexts.push({ ...context });
            expect(() => {
                first.collider.radius = 0.875;
            }).toThrow();
            expect(first.collider.radius).toBe(0.75);
            zero.body.applyForce(new Vec3(0, 20, 0));
        });
        expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(0);
        system.fixedTimeStep = 0.1;
        system.maxSubSteps = 1;
        system.autoSimulation = true;
        await clock.step(0.1);
        const velocity = new Vec3();
        zero.body.getLinearVelocity(velocity);
        expect(contexts).toHaveLength(1);
        expect(velocity.y).toBeCloseTo(1, 5);
        expect(creates()).toHaveLength(shapeCallsBeforeStep);
        expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(1);
        system.enable = false;
        await clock.step(0.5);
        expect(contexts).toHaveLength(1);
        expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(1);
        fixture.checkpoint('actual-owned-clock-rejects-capsule-config-allows-force-and-pause', {
            contexts,
            velocity: xyz(velocity),
            shapeCallsBeforeStep,
        });
        const close = await app.close();
        closed = true;
        expect(close.status).toBe('released');
        expect(close.physicsPreparation?.status).toBe('closed');
        expect(hook.disposed).toBe(true);
        expect(() => registerBox3DBeforeStep(() => {})).toThrow();
        const observed = fixture.observations();
        expect(observed.calls.filter((row: any) => row.name === 'destroyWorld' && row.returned)).toHaveLength(1);
        expect(observed.beforeDispose.coreBytes).toBe('0');
        expect(observed.beforeDispose.bridge.liveBytes).toBe('0');
        fixture.checkpoint('actual-app-close-native-resource-release', {
            close,
            hookDisposed: hook.disposed,
            beforeDispose: observed.beforeDispose,
            loader: fixture.loader.diagnostics(),
        });
        fixture.complete();
    } catch (error) {
        fixture.fail(error);
        throw error;
    } finally {
        if (app && !closed) {
            try {
                await app.close();
            } catch (error) {
                fixture.checkpoint('cleanup-error', String(error));
            }
        }
    }
});
