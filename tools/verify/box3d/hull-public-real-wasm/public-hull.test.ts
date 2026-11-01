/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
// Actual Cocos Mesh/MeshCollider, production adapters and receipt-bound real native WASM.
// Physics and boundary fault cases run in separate processes, never on a silently recovered faulted world.
import '../../../../src/exports/base';
import { createAirApp } from '../../../../src/air/bootstrap';
import type { AirApp } from '../../../../src/air/app';
import { registerBox3DBeforeStep } from '../../../../src/air/box3d-controls';
import { registerBox3DFeature, registerBox3DWorldAdapter } from '../../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../../src/air/physics/box3d/registration';
import type { Box3DPhysicsWorld } from '../../../../src/air/physics/box3d/world';
import { PhysicsSystem } from '../../../../src/cocos/physics/framework/physics-system';
import { PhysicsMaterial } from '../../../../src/cocos/physics/framework/assets/physics-material';
import { RigidBody } from '../../../../src/cocos/physics/framework/components/rigid-body';
import { MeshCollider } from '../../../../src/cocos/physics/framework/components/colliders/mesh-collider';
import { BoxCollider } from '../../../../src/cocos/physics/framework/components/colliders/box-collider';
import { selector } from '../../../../src/cocos/physics/framework/physics-selector';
import { Mesh } from '../../../../src/cocos/3d/assets/mesh';
import { Attribute, AttributeName, Format, PrimitiveMode } from '../../../../src/cocos/gfx/base/define';
import { Vec3 } from '../../../../src/cocos/core/math/vec3';
import { Ray } from '../../../../src/cocos/core/geometry/ray';
import { CCObject } from '../../../../src/cocos/core/data/object';
import { Node } from '../../../../src/cocos/scene-graph/node';
import { Scene } from '../../../../src/cocos/scene-graph/scene';
import { createStepClock } from '../../../../src/air/step-clock';

declare const __HULL70_FIXTURE__: any;
const fixture = __HULL70_FIXTURE__;
const tetra = [0, 0, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4];
const xyz = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z];
const near = (a: number, b: number, tolerance = 3e-5) =>
    expect(Math.abs(a - b)).toBeLessThanOrEqual(tolerance * Math.max(1, Math.abs(b)));
const nearVector = (a: number[], b: number[]) => {
    expect(a).toHaveLength(b.length);
    a.forEach((n, i) => near(n, b[i]));
};
function failure(action: () => void): any {
    try {
        action();
    } catch (error) {
        return error;
    }
    throw new Error('Expected explicit rejection');
}
function phase(error: any, expected: string | undefined) {
    expect(error.mutationOutcome).toBe(expected);
    if (expected) {
        const descriptor = Object.getOwnPropertyDescriptor(error, 'mutationOutcome')!;
        expect(descriptor.writable).toBe(false);
        expect(descriptor.configurable).toBe(false);
    }
}
function mesh(parts: number[][], prefix: number[] = []): Mesh {
    // Real Cocos Mesh.reset + real interleaved-buffer access. No Mesh method, returned POSITION, or bounds is mocked.
    const backing = new Uint8Array(prefix.length * 4 + parts.reduce((sum, part) => sum + part.length * 4, 0));
    const prefixView = new DataView(backing.buffer);
    prefix.forEach((value, i) => prefixView.setFloat32(i * 4, value, true));
    const data = backing.subarray(prefix.length * 4);
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let offset = 0;
    const vertexBundles = parts.map((part) => {
        const start = offset;
        part.forEach((value) => {
            view.setFloat32(offset, value, true);
            offset += 4;
        });
        return {
            view: { offset: start, length: part.length * 4, count: part.length / 3, stride: 12 },
            attributes: [new Attribute(AttributeName.ATTR_POSITION, Format.RGB32F)],
        };
    });
    const value = new Mesh();
    value.reset({
        struct: {
            vertexBundles,
            primitives: parts.map((_, i) => ({ primitiveMode: PrimitiveMode.POINT_LIST, vertexBundelIndices: [i] })),
        },
        data,
    });
    return value;
}
function pyramid(sides: number): number[] {
    const points: number[] = [];
    for (let i = 0; i < sides; ++i)
        points.push(Math.cos((i * 2 * Math.PI) / sides), 0, Math.sin((i * 2 * Math.PI) / sides));
    points.push(0, 2, 0);
    return points;
}
function tetraPart(mass: number, axes: number[], center: number[]) {
    const [a, b, c] = axes;
    return {
        volume: (a * b * c) / 6,
        center: axes.map((n, i) => n / 4 + center[i]),
        inertia: [
            (3 * mass * (b * b + c * c)) / 80,
            (mass * a * b) / 80,
            (mass * a * c) / 80,
            (mass * a * b) / 80,
            (3 * mass * (a * a + c * c)) / 80,
            (mass * b * c) / 80,
            (mass * a * c) / 80,
            (mass * b * c) / 80,
            (3 * mass * (a * a + b * b)) / 80,
        ],
    };
}
function compoundOracle(target: number) {
    // Independent known dimensions: unit box V=1 at x=-2; 2x3x4 tetra V=4 at x=+2.
    const boxMass = target / 5,
        hullMass = (4 * target) / 5;
    const hull = tetraPart(hullMass, [2, 3, 4], [2, 0, 0]);
    const parts = [
        { mass: boxMass, center: [-2, 0, 0], inertia: [boxMass / 6, 0, 0, 0, boxMass / 6, 0, 0, 0, boxMass / 6] },
        { mass: hullMass, ...hull },
    ];
    const center = [0, 1, 2].map((axis) => parts.reduce((sum, p) => sum + p.mass * p.center[axis], 0) / target);
    const inertia = Array(9).fill(0);
    for (const part of parts) {
        const d = part.center.map((n, i) => n - center[i]),
            squared = d.reduce((sum, n) => sum + n * n, 0);
        for (let r = 0; r < 3; ++r)
            for (let c = 0; c < 3; ++c)
                inertia[3 * r + c] += part.inertia[3 * r + c] + part.mass * ((r === c ? squared : 0) - d[r] * d[c]);
    }
    return { center, inertia };
}

test(`actual Cocos Hull ${fixture.case}: real geometry and explicit fault-boundary category`, async () => {
    let app: AirApp | undefined,
        closed = false;
    const assets: Mesh[] = [];
    const makeMesh = (parts: number[][], prefix: number[] = []) => {
        const value = mesh(parts, prefix);
        assets.push(value);
        return value;
    };
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
        const world = system.physicsWorld as Box3DPhysicsWorld;
        system.autoSimulation = false;
        system.gravity = new Vec3(0, 0, 0);
        const scene = new Scene('hull70-real-cocos');
        app.run(scene);
        clock.begin();
        const binding = fixture.binding(),
            token = fixture.token();
        const observations = () => fixture.observations();
        const creates = () => observations().nativeHullCreates;
        const latest = () => creates().at(-1);
        const queries = () =>
            observations()
                .calls.filter((row: any) => row.name === 'rayAllRaw')
                .at(-1)?.result;
        const snapshot = (creation: any) => ({
            counts: Array.from(binding.worldCounts(token).counts),
            state: fixture.bodyStateForNativeId(creation.body),
            transform: fixture.bodyTransformForNativeId(creation.body),
            bridge: binding.bridgeMemory(token),
            coreBytes: String(binding.liveBytes()),
        });
        const make = (
            name: string,
            position: number[],
            points: Mesh | null,
            enabled = true,
            scale = [1, 1, 1],
            center = [0, 0, 0],
            rotation = false,
        ) => {
            const node = new Node(name);
            node.setPosition(...(position as [number, number, number]));
            node.setScale(...(scale as [number, number, number]));
            if (rotation) node.setRotationFromEuler(0, 90, 0);
            const body = node.addComponent(RigidBody);
            body.mass = 12;
            body.useGravity = false;
            body.linearDamping = 0;
            body.angularDamping = 0;
            const collider = node.addComponent(MeshCollider);
            collider.convex = true;
            collider.mesh = points;
            collider.center = new Vec3(...(center as [number, number, number]));
            collider.enabled = enabled;
            scene.addChild(node);
            return { node, body, collider, creation: points && enabled ? latest() : null };
        };
        const ray = (
            collider: MeshCollider,
            creation: any,
            origin: number[],
            direction: number[],
            expectedDistance: number,
        ) => {
            const input = new Ray(...([...origin, ...direction] as [number, number, number, number, number, number]));
            expect(system.raycast(input, 0xffffffff, 20, false)).toBe(true);
            expect(system.raycastResults.map((result) => result.collider)).toEqual([collider]);
            near(system.raycastResults[0].distance, expectedDistance);
            expect(queries()).toHaveLength(1);
            expect(queries()[0].shape).toEqual(creation.shape);
            expect(system.raycastClosest(input, 0xffffffff, 20, false)).toBe(true);
            expect(system.raycastClosestResult.collider).toBe(collider);
            near(system.raycastClosestResult.distance, expectedDistance);
        };
        // A and B are both valid asymmetric tetrahedra. Mesh.data is a nonzero-offset view over B;
        // a reader that ignores byteOffset silently cooks A, so inertia and both rays must discriminate.
        const prefixTetra = tetra.map((n) => 2 * n);
        const actualMesh = makeMesh([tetra], prefixTetra);
        expect(actualMesh.data.byteOffset).toBe(prefixTetra.length * 4);
        const primary = make('asymmetric-tetra-real-mesh-offset-view-B-not-prefix-A', [0, 0, 0], actualMesh);
        system.syncSceneToPhysics();
        expect(primary.creation.status).toBe(0);
        expect(primary.creation.input).toEqual(tetra);
        expect(primary.creation.pointCount).toBe(4);
        expect(primary.creation.target).toBe(12);
        ray(primary.collider, primary.creation, [0.2, 0.3, 5], [0, 0, -1], 1.8);
        expect(system.raycast(new Ray(1.8, 2.8, 5, 0, 0, -1), 0xffffffff, 10, false)).toBe(false);
        expect(system.raycastResults).toEqual([]);
        const native = fixture.bodyStateForNativeId(primary.creation.body),
            oracle = tetraPart(12, [2, 3, 4], [0, 0, 0]);
        near(native.mass, 12);
        nearVector(native.localCenter, oracle.center);
        nearVector(native.inertia, oracle.inertia);
        fixture.checkpoint('N1-real-subarray-B-not-valid-prefix-A-nonbox-rays-and-independent-full-inertia', {
            dataByteOffset: actualMesh.data.byteOffset,
            prefixTetra,
            creation: primary.creation,
            native,
            oracle,
        });

        if (fixture.case === 'destroy-committed-readback') {
            const oldMesh = primary.collider.mesh,
                old = primary.creation;
            const count = creates().length;
            fixture.armFault();
            const error = failure(() => {
                primary.collider.mesh = null;
            });
            phase(error, 'committed');
            expect(primary.collider.mesh).toBe(oldMesh);
            expect(fixture.nativeShapeValid(old.shape)).toBe(0);
            const destroy = observations().nativeShapeDestroys.at(-1);
            expect(destroy.shape).toEqual(old.shape);
            expect(destroy.status).toBe(0);
            expect(destroy.injection).toBe(fixture.case);
            expect(fixture.bodyStateForNativeId(old.body).massPending).toBe(true);
            const destroyCount = observations().nativeShapeDestroys.length;
            expect(
                failure(() => {
                    primary.collider.mesh = null;
                }).code,
            ).toBe('AIR_E_BOX3D_WORLD_FAULTED');
            expect(creates()).toHaveLength(count);
            expect(observations().nativeShapeDestroys).toHaveLength(destroyCount);
            expect(() => system.raycast(new Ray(0.2, 0.3, 5, 0, 0, -1), -1, 10, false)).toThrow();
            fixture.checkpoint('N7-real-native-destroy-null-plus-readback-fault-committed-terminal-no-replay', {
                category: 'REAL_NATIVE_PLUS_BOUNDARY_FAULT',
                mode: fixture.case,
                error: { code: error.code, outcome: error.mutationOutcome, message: error.message },
                old,
                destroy,
                count,
                destroyCount,
            });
        } else if (fixture.case !== 'physics') {
            // Establish a valid old public shape first. Actual native succeeds before the labeled injected failure.
            const oldMesh = primary.collider.mesh,
                old = primary.creation;
            fixture.armFault();
            const error = failure(() => {
                primary.collider.mesh = makeMesh([tetra.map((n) => 2 * n)]);
            });
            phase(error, fixture.case === 'committed-readback' ? 'committed' : undefined);
            expect(primary.collider.mesh).toBe(oldMesh);
            const candidate = latest();
            expect(candidate.status).toBe(0);
            expect(candidate.injection).toBe(fixture.case);
            expect(fixture.nativeShapeValid(candidate.shape)).toBe(1);
            expect(fixture.nativeShapeValid(old.shape)).toBe(1);
            const count = creates().length;
            const closedError = failure(() => {
                primary.collider.mesh = makeMesh([tetra]);
            });
            expect(closedError.code).toBe('AIR_E_BOX3D_WORLD_FAULTED');
            expect(creates()).toHaveLength(count);
            expect(() => system.raycast(new Ray(0.2, 0.3, 5, 0, 0, -1), -1, 10, false)).toThrow();
            fixture.checkpoint('N7-real-native-success-plus-labeled-boundary-fault-owner-terminal-no-replay', {
                category: 'REAL_NATIVE_PLUS_BOUNDARY_FAULT',
                mode: fixture.case,
                error: { code: error.code, outcome: error.mutationOutcome ?? 'UNKNOWN', message: error.message },
                old,
                candidate,
                count,
            });
        } else {
            const transformed = make(
                'scaled-rotated-offset-hull',
                [100, 20, 30],
                makeMesh([tetra]),
                true,
                [2, 3, 4],
                [0.25, -0.5, 0.75],
                true,
            );
            expect(transformed.creation.input).toEqual(
                tetra.map((n, i) => Math.fround((n + [0.25, -0.5, 0.75][i % 3]) * [2, 3, 4][i % 3])),
            );
            const transformedState = fixture.bodyStateForNativeId(transformed.creation.body),
                scaledOracle = tetraPart(12, [4, 9, 16], [0.5, -1.5, 3]);
            nearVector(transformedState.localCenter, scaledOracle.center);
            nearVector(transformedState.inertia, scaledOracle.inertia);
            nearVector(transformedState.worldCenter, [107, 20.75, 28.5]);
            // 90-degree Y rotation maps local -Z to world -X. Local tetra upper z at x=.9,y=-.6 is 15.8.
            ray(transformed.collider, transformed.creation, [120, 19.4, 29.1], [-1, 0, 0], 4.2);
            fixture.checkpoint('N1-actual-scaled-centered-rotated-body-local-points', {
                creation: transformed.creation,
                transformedState,
                scaledOracle,
            });

            const redundant = Array.from({ length: 256 }, (_, i) =>
                i % 5 === 4 ? [0.1, 0.1, 0.1] : tetra.slice((i % 4) * 3, (i % 4) * 3 + 3),
            ).flat();
            primary.collider.mesh = makeMesh([redundant.slice(0, 384), redundant.slice(384)]);
            const copied = latest();
            expect(copied.pointCount).toBe(256);
            expect(copied.input).toEqual(redundant.map(Math.fround));
            expect(fixture.nativeShapeValid(primary.creation.shape)).toBe(0);
            ray(primary.collider, copied, [0.2, 0.3, 5], [0, 0, -1], 1.8);
            nearVector(fixture.bodyStateForNativeId(copied.body).inertia, oracle.inertia);
            fixture.checkpoint('N2-real-256-points-all-submesh-buffers-and-native-hull', { creation: copied });

            const negatives = [
                { name: 'coincident', points: Array(12).fill(0), native: true },
                { name: 'collinear', points: [0, 0, 0, 1, 0, 0, 2, 0, 0, 3, 0, 0], native: true },
                { name: 'coplanar', points: [0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0], native: true },
                { name: 'over-128-full-edges', points: pyramid(65), native: true },
                { name: 'float32-overflow', points: [...tetra.slice(0, 11), Number.MAX_VALUE], native: false },
                { name: 'nonfinite', points: [...tetra.slice(0, 11), NaN], native: false },
                { name: 'too-few', points: [0, 0, 0, 1, 0, 0, 0, 1, 0], native: false },
                { name: 'empty-submesh', points: [], native: false },
            ];
            for (const enabled of [true, false]) {
                primary.collider.enabled = enabled;
                const before = snapshot(copied),
                    oldMesh = primary.collider.mesh;
                for (const spec of negatives) {
                    const nativeCalls = creates().length + observations().nativeHullValidations.length;
                    for (let retry = 0; retry < 2; ++retry) {
                        const bad = makeMesh([spec.points]);
                        const error = failure(() => {
                            primary.collider.mesh = bad;
                        });
                        expect(primary.collider.mesh).toBe(oldMesh);
                        expect(primary.collider.convex).toBe(true);
                        expect(snapshot(copied)).toEqual(before);
                        if (spec.native) phase(error, 'not-mutated');
                    }
                    const afterCalls = creates().length + observations().nativeHullValidations.length;
                    expect(afterCalls - nativeCalls).toBe(spec.native ? 2 : 0);
                    fixture.checkpoint(
                        `N3-${enabled ? 'enabled' : 'disabled'}-${spec.name}-no-native-write-no-cache-poison`,
                        { before, nativeCalls, afterCalls },
                    );
                }
                const n = creates().length + observations().nativeHullValidations.length;
                expect(
                    failure(() => {
                        primary.collider.convex = false;
                    }).code,
                ).toBe('AIR_E_BOX3D_UNSUPPORTED');
                expect(primary.collider.convex).toBe(true);
                expect(primary.collider.mesh).toBe(oldMesh);
                expect(snapshot(copied)).toEqual(before);
                expect(creates().length + observations().nativeHullValidations.length).toBe(n);
            }
            primary.collider.enabled = true;
            ray(primary.collider, latest(), [0.2, 0.3, 5], [0, 0, -1], 1.8);
            const boundary = make('exact-128-full-edge-hull', [200, 0, 0], makeMesh([pyramid(64)]));
            expect(boundary.creation.status).toBe(0);
            expect(boundary.creation.pointCount).toBe(65);
            fixture.checkpoint('N3-exact-native-128-full-edge-boundary-public-construction', {
                creation: boundary.creation,
                nativeTopologyProof:
                    'Matching build hullContract asserts exact 65 vertices/65 faces/128 full edges, independently of this public construction.',
            });

            const pending = make('owned-null-pending', [300, 0, 0], null);
            for (const enabled of [true, false]) {
                pending.collider.enabled = enabled;
                const before = creates().length + observations().nativeHullValidations.length;
                for (const value of [true, false, true, false]) pending.collider.convex = value;
                for (const value of ['true', 1, null, undefined, NaN]) {
                    expect(
                        failure(() => {
                            pending.collider.convex = value as any;
                        }).code,
                    ).toBe('AIR_E_BOX3D_CONFIG');
                    expect(pending.collider.convex).toBe(false);
                }
                expect(pending.collider.mesh).toBe(null);
                expect(creates().length + observations().nativeHullValidations.length).toBe(before);
            }
            pending.collider.convex = true;
            const material = new PhysicsMaterial();
            material.friction = 0.45;
            material.restitution = 0.2;
            pending.collider.sharedMaterial = material;
            material.friction = 0.65;
            pending.collider.mesh = makeMesh([tetra]);
            expect(pending.collider.enabled).toBe(false);
            const beforeEnable = creates().length;
            pending.collider.enabled = true;
            expect(creates()).toHaveLength(beforeEnable + 1);
            const pendingCreation = latest();
            ray(pending.collider, pendingCreation, [300.2, 0.3, 5], [0, 0, -1], 1.8);
            fixture.checkpoint('N4-null-convex-toggles-disabled-cook-pending-material-recovery', { pendingCreation });

            const compoundNode = new Node('same-rigidbody-box-and-hull');
            compoundNode.setPosition(400, 0, 0);
            const compoundBody = compoundNode.addComponent(RigidBody);
            compoundBody.mass = 10;
            compoundBody.useGravity = false;
            compoundBody.linearDamping = 0;
            compoundBody.angularDamping = 0;
            const box = compoundNode.addComponent(BoxCollider);
            box.size = new Vec3(1, 1, 1);
            box.center = new Vec3(-2, 0, 0);
            const hull = compoundNode.addComponent(MeshCollider);
            hull.convex = true;
            hull.mesh = makeMesh([tetra]);
            hull.center = new Vec3(2, 0, 0);
            scene.addChild(compoundNode);
            const compoundCreate = latest();
            const compound = compoundOracle(10),
                state = fixture.bodyStateForNativeId(compoundCreate.body);
            near(state.mass, 10);
            nearVector(state.localCenter, compound.center);
            nearVector(state.inertia, compound.inertia);
            compoundBody.setLinearVelocity(new Vec3(1, 2, 3));
            compoundBody.setAngularVelocity(new Vec3(0.25, 0.5, 0.75));
            const verifyMotion = () => {
                const value = fixture.bodyStateForNativeId(compoundCreate.body);
                nearVector(value.linearVelocity, [1, 2, 3]);
                nearVector(value.angularVelocity, [0.25, 0.5, 0.75]);
            };
            verifyMotion();
            const poseBefore = fixture.bodyTransformForNativeId(compoundCreate.body).slice(0, 7);
            hull.isTrigger = true;
            let stateNow = fixture.bodyStateForNativeId(compoundCreate.body);
            nearVector(stateNow.localCenter, [-2, 0, 0]);
            nearVector(stateNow.inertia, [10 / 6, 0, 0, 0, 10 / 6, 0, 0, 0, 10 / 6]);
            expect(stateNow.sensorMassFallback).toBe(false);
            verifyMotion();
            box.enabled = false;
            stateNow = fixture.bodyStateForNativeId(compoundCreate.body);
            expect(stateNow.sensorMassFallback).toBe(true);
            verifyMotion();
            nearVector(stateNow.localCenter, [2.5, 0.75, 1]);
            nearVector(stateNow.inertia, tetraPart(10, [2, 3, 4], [2, 0, 0]).inertia);
            hull.mesh = null;
            stateNow = fixture.bodyStateForNativeId(compoundCreate.body);
            expect(stateNow.massPending).toBe(true);
            expect(() => system.syncSceneToPhysics()).toThrow('AIR_E_BOX3D_MASS_PENDING');
            hull.mesh = makeMesh([tetra]);
            hull.isTrigger = false;
            box.enabled = true;
            stateNow = fixture.bodyStateForNativeId(compoundCreate.body);
            expect(stateNow.massPending).toBe(false);
            nearVector(stateNow.localCenter, compound.center);
            nearVector(stateNow.inertia, compound.inertia);
            nearVector(fixture.bodyTransformForNativeId(compoundCreate.body).slice(0, 7), poseBefore);
            verifyMotion();
            compoundBody.setLinearVelocity(new Vec3(0, 0, 0));
            compoundBody.setAngularVelocity(new Vec3(0, 0, 0));
            system.syncSceneToPhysics();
            fixture.checkpoint('N5-real-compound-mass-COM-full-inertia-sensor-fallback-pending-recovery', {
                compoundCreate,
                state,
                oracle: compound,
                recovered: stateNow,
                poseBefore,
            });

            const lastPendingId = pendingCreation.shape;
            pending.collider.center = new Vec3(1, 0, 0);
            const centered = latest();
            expect(fixture.nativeShapeValid(lastPendingId)).toBe(0);
            ray(pending.collider, centered, [301.2, 0.3, 5], [0, 0, -1], 1.8);
            pending.collider.mesh = null;
            expect(fixture.nativeShapeValid(centered.shape)).toBe(0);
            expect(system.raycast(new Ray(301.2, 0.3, 5, 0, 0, -1), -1, 10, false)).toBe(false);
            pending.collider.mesh = makeMesh([tetra]);
            const finalPending = latest();
            pending.collider.destroy();
            CCObject._deferredDestroy();
            expect(fixture.nativeShapeValid(finalPending.shape)).toBe(0);
            pending.node.destroy();
            CCObject._deferredDestroy();
            expect(material.destroy()).toBe(true);
            CCObject._deferredDestroy();
            fixture.checkpoint('N6-actual-public-center-null-and-destroy-retire-query-identity', {
                centered,
                finalPending,
            });

            const contexts: unknown[] = [];
            const hook = registerBox3DBeforeStep((context) => {
                contexts.push({ ...context });
                expect(() => {
                    primary.collider.mesh = makeMesh([tetra]);
                }).toThrow();
                compoundBody.applyForce(new Vec3(0, 100, 0));
            });
            system.fixedTimeStep = 0.1;
            system.maxSubSteps = 1;
            system.autoSimulation = true;
            await clock.step(0.1);
            const velocity = new Vec3();
            compoundBody.getLinearVelocity(velocity);
            near(velocity.y, 1);
            expect(contexts).toHaveLength(1);
            expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(1);
            system.enable = false;
            await clock.step(0.5);
            expect(contexts).toHaveLength(1);
            expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(1);
            fixture.checkpoint('N6-owned-Game-clock-configuration-refusal-force-and-pause', {
                contexts,
                velocity: xyz(velocity),
            });
            hook.dispose();
        }
        const close = await app.close!();
        closed = true;
        // Retain the complete actual receipt BEFORE any close-status or cleanup assertion can fail.
        fixture.checkpoint('N6/N7-raw-app-close-before-assertions', { case: fixture.case, close });
        const observed = observations();
        const owner = world.diagnostics().commandOwner;
        const loader = fixture.loader.diagnostics();
        fixture.checkpoint('N6/N7-raw-post-close-ownership-before-assertions', {
            owner,
            loader,
            beforeDispose: observed.beforeDispose,
        });
        if (fixture.case === 'physics') {
            expect(close.status).toBe('released');
            expect(close.failures).toHaveLength(0);
        } else {
            expect(['committed-readback', 'unknown-after-native', 'destroy-committed-readback']).toContain(
                fixture.case,
            );
            // Same deliberate-fault Game contract as the retained owner-target/clock fixtures.
            // A truthful terminal pacing failure is required, not relabeled as a clean release.
            expect(close.status).toBe('failed');
            expect(close.failures).toHaveLength(1);
            expect(close.failures[0].label).toBe('game-clock-terminal');
            expect(close.failures[0].message).toMatch(/^Error: \[AIR_E_BOX3D_WORLD_FAULTED\]/);
        }
        expect(close.physicsPreparation?.status).toBe('closed');
        expect(observed.calls.filter((row: any) => row.name === 'destroyWorld' && row.returned)).toHaveLength(1);
        expect(observed.beforeDispose.coreBytes).toBe('0');
        expect(observed.beforeDispose.bridge.liveBytes).toBe('0');
        expect(observed.beforeDispose.bridge.liveAllocations).toBe(0);
        expect(loader.status).toBe('DISPOSED');
        expect(loader.cleanupErrors).toHaveLength(0);
        expect(observed.fallbackCleanup).toBeUndefined();
        expect(owner.phase).toBe('closed');
        expect(owner.bodies).toBe(0);
        expect(owner.unresolvedNativeBodies).toBe(0);
        expect(owner.components).toBe(0);
        expect(owner.componentActivityObservers).toBe(0);
        expect(owner.materials).toBe(0);
        expect(owner.materialObserverLeases).toBe(0);
        expect(owner.unresolvedMaterialScopes).toBe(0);
        expect(owner.activeTemporaryScopes).toBe(0);
        expect(owner.pendingCommands).toBe(0);
        expect(owner.targets.guards).toBe(0);
        expect(owner.targets.active).toBe(0);
        expect(owner.targets.protected).toBe(0);
        expect(owner.targets.unresolved).toBe(0);
        expect(owner.cleanup.hasFailure).toBe(false);
        expect(owner.nativeOwnership).toBe('released');
        fixture.checkpoint('N6/N7-actual-app-close-zero-native-core-and-bridge-resources', {
            close,
            owner,
            loader,
            beforeDispose: observed.beforeDispose,
        });
        fixture.complete();
    } catch (error) {
        fixture.fail(error);
        throw error;
    } finally {
        if (app && !closed) {
            try {
                await app.close!();
            } catch (error) {
                fixture.checkpoint('cleanup-error', String(error));
            }
        }
        for (const asset of assets) asset.destroy();
        CCObject._deferredDestroy();
    }
});
