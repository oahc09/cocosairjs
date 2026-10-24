/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT */
import '../../../../src/exports/base';
import { createAirApp } from '../../../../src/air/bootstrap';
import { readBox3DBodyMotion } from '../../../../src/air/box3d-controls';
import { registerBox3DFeature, registerBox3DWorldAdapter } from '../../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../../src/air/physics/box3d/registration';
import { PhysicsSystem } from '../../../../src/cocos/physics/framework/physics-system';
import { selector } from '../../../../src/cocos/physics/framework/physics-selector';
import { RigidBody } from '../../../../src/cocos/physics/framework/components/rigid-body';
import { MeshCollider } from '../../../../src/cocos/physics/framework/components/colliders/mesh-collider';
import { BoxCollider } from '../../../../src/cocos/physics/framework/components/colliders/box-collider';
import { SphereCollider } from '../../../../src/cocos/physics/framework/components/colliders/sphere-collider';
import { Mesh } from '../../../../src/cocos/3d/assets/mesh';
import { Attribute, AttributeName, Format, PrimitiveMode } from '../../../../src/cocos/gfx/base/define';
import { Camera } from '../../../../src/cocos/misc/camera-component';
import { Vec3 } from '../../../../src/cocos/core/math/vec3';
import { Node } from '../../../../src/cocos/scene-graph/node';
import { Scene } from '../../../../src/cocos/scene-graph/scene';
import { createStepClock } from '../../../../src/air/step-clock';
import { CCObject } from '../../../../src/cocos/core/data/object';
import { createSpringDrag } from '../../../../examples/box3d-rigidbody-playground/src/spring-drag';

declare const __DRAG76_FIXTURE__: any;
const fixture = __DRAG76_FIXTURE__;
const xyz = (v: { x: number; y: number; z: number }) => [v.x, v.y, v.z];
const near = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(3e-5 * Math.max(1, Math.abs(b)));
function hullMesh(): Mesh {
    const points = new Float32Array([-0.72, -0.72, -0.72, 0.72, 0.72, -0.72, 0.72, -0.72, 0.72, -0.72, 0.72, 0.72]);
    const mesh = new Mesh();
    mesh.reset({
        struct: {
            vertexBundles: [
                {
                    view: { offset: 0, length: points.byteLength, count: 4, stride: 12 },
                    attributes: [new Attribute(AttributeName.ATTR_POSITION, Format.RGB32F)],
                },
            ],
            primitives: [{ primitiveMode: PrimitiveMode.POINT_LIST, vertexBundelIndices: [0] }],
        },
        data: new Uint8Array(points.buffer),
    });
    return mesh;
}

test('actual EX01 controller: offset Hull and compound use native COM, fixed ticks and real momentum', async () => {
    let app: Awaited<ReturnType<typeof createAirApp>> | undefined;
    let controller: ReturnType<typeof createSpringDrag> | undefined;
    let closed = false;
    const mesh = hullMesh();
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
        const canvas = app.canvas;
        // Synthetic DOM layout only. The actual Camera computes the ray; no query, physics, pose or velocity mock.
        canvas.width = 800;
        canvas.height = 600;
        canvas.getBoundingClientRect = () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: 800,
            bottom: 600,
            width: 800,
            height: 600,
            toJSON() {
                return this;
            },
        });
        const captures = new Set<number>();
        canvas.setPointerCapture = (id) => {
            captures.add(id);
        };
        canvas.hasPointerCapture = (id) => captures.has(id);
        canvas.releasePointerCapture = (id) => {
            captures.delete(id);
        };
        const system = PhysicsSystem.instance;
        system.enable = false;
        system.autoSimulation = true;
        system.fixedTimeStep = 1 / 60;
        system.maxSubSteps = 1;
        system.gravity = new Vec3();
        const scene = new Scene('EX01 native-COM drag');
        const cameraNode = new Node('real camera');
        cameraNode.setPosition(0, 0, 12);
        cameraNode.lookAt(Vec3.ZERO);
        const camera = cameraNode.addComponent(Camera);
        camera.near = 0.1;
        camera.far = 100;
        camera.fov = 50;
        scene.addChild(cameraNode);
        const makeBody = (name: string, x: number) => {
            const node = new Node(name);
            node.setPosition(x, 0, 0);
            const body = node.addComponent(RigidBody);
            body.mass = 12;
            body.useGravity = false;
            body.linearDamping = 0;
            body.angularDamping = 0;
            body.allowSleep = false;
            return { node, body };
        };
        const hull = makeBody('offset-scaled-hull', -3);
        hull.node.setScale(1.5, 1, 0.75);
        const hc = hull.node.addComponent(MeshCollider);
        hc.convex = true;
        hc.mesh = mesh;
        hc.center = new Vec3(0.8, 0, 0);
        scene.addChild(hull.node);
        const compound = makeBody('offset-compound', 3);
        const box = compound.node.addComponent(BoxCollider);
        box.size = new Vec3(0.6, 0.8, 0.6);
        box.center = new Vec3(-0.7, 0, 0);
        const sphere = compound.node.addComponent(SphereCollider);
        sphere.radius = 0.62;
        sphere.center = new Vec3(0.5, 0, 0);
        scene.addChild(compound.node);
        app.run(scene);
        const clock = createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
        clock.begin();
        await clock.step(1 / 60);
        const binding = fixture.binding(),
            token = fixture.token();
        const step = () => binding.stepDiagnostics(token).nativeStepIndex;
        const issues: string[] = [];
        controller = createSpringDrag(canvas, camera, undefined, { onError: (e) => issues.push(String(e)) });
        const pointer = (kind: string, id: number, screen: Vec3) => {
            const event = new MouseEvent(kind, {
                clientX: screen.x,
                clientY: 600 - screen.y,
                button: 0,
                bubbles: true,
                cancelable: true,
            });
            Object.defineProperty(event, 'pointerId', { value: id });
            canvas.dispatchEvent(event);
        };
        const screen = (point: { x: number; y: number; z: number }) =>
            camera.worldToScreen(new Vec3(point.x, point.y, point.z), new Vec3());
        const initialHull = readBox3DBodyMotion(hull.body);
        near(initialHull.localCenter.x, 1.2);
        near(initialHull.worldCOM.x, -1.8);
        expect(Object.isFrozen(initialHull)).toBe(true);
        expect(Object.isFrozen(initialHull.worldCOM)).toBe(true);
        expect(() => readBox3DBodyMotion({} as RigidBody)).toThrow();
        expect(() => readBox3DBodyMotion(Object.create(hull.body))).toThrow();
        const initialCompound = readBox3DBodyMotion(compound.body);
        const boxVolume = 0.6 * 0.8 * 0.6,
            sphereVolume = (4 * Math.PI * 0.62 ** 3) / 3;
        near(initialCompound.localCenter.x, (-0.7 * boxVolume + 0.5 * sphereVolume) / (boxVolume + sphereVolume));
        fixture.checkpoint('D1-genuine-native-scaled-hull-and-compound-mass-snapshots', {
            initialHull,
            initialCompound,
        });
        system.enable = true;
        for (const [i, entry] of [hull, compound].entries()) {
            const before = readBox3DBodyMotion(entry.body);
            const cursor = screen(before.worldCOM);
            const priorSubmissions = controller.snapshot().submissions;
            pointer('pointerdown', i + 1, cursor);
            expect(issues).toEqual([]);
            expect(controller.snapshot().active).toBe(true);
            expect(controller.snapshot().selected).toBe(entry.node.name);
            const picked = controller.snapshot();
            pointer('pointermove', i + 1, new Vec3(cursor.x + 60, cursor.y + 30, 0));
            expect(controller.snapshot().submissions).toBe(priorSubmissions);
            const nativeBefore = step();
            for (let j = 0; j < 6; j++) await clock.step(1 / 60);
            const after = readBox3DBodyMotion(entry.body);
            expect(step() - nativeBefore).toBe(6);
            expect(controller.snapshot().submissions - priorSubmissions).toBe(6);
            expect(Math.hypot(...xyz(after.linearVelocity))).toBeGreaterThan(0.05);
            expect(Math.hypot(...xyz(after.angularVelocity))).toBeGreaterThan(0.01);
            expect(after.worldCOM.x).toBeGreaterThan(before.worldCOM.x);
            // Pointer release only retires input; committed velocities cannot change synchronously.
            pointer('pointerup', i + 1, cursor);
            const released = readBox3DBodyMotion(entry.body);
            expect(released.linearVelocity).toEqual(after.linearVelocity);
            expect(released.angularVelocity).toEqual(after.angularVelocity);
            expect(controller.snapshot().active).toBe(false);
            expect(captures.size).toBe(0);
            const releasedSubmissions = controller.snapshot().submissions;
            await clock.step(1 / 60);
            expect(controller.snapshot().submissions).toBe(releasedSubmissions);
            const coasting = readBox3DBodyMotion(entry.body);
            xyz(coasting.linearVelocity).forEach((v, k) => near(v, xyz(released.linearVelocity)[k]));
            fixture.checkpoint('D2-real-query-six-fixed-ticks-and-momentum-release-' + i, {
                before,
                picked,
                after,
                released,
                coasting,
                submissions: releasedSubmissions,
                nativeBefore,
                nativeAfter: step(),
            });
        }
        const cursor = screen(readBox3DBodyMotion(compound.body).worldCOM);
        pointer('pointerdown', 9, cursor);
        expect(controller.snapshot().active).toBe(true);
        controller.cancel();
        system.enable = false;
        const paused = readBox3DBodyMotion(compound.body),
            pausedStep = step(),
            pausedSubmissions = controller.snapshot().submissions;
        await clock.step(0.2);
        expect(step()).toBe(pausedStep);
        expect(controller.snapshot().submissions).toBe(pausedSubmissions);
        expect(readBox3DBodyMotion(compound.body)).toEqual(paused);
        expect(captures.size).toBe(0);
        fixture.checkpoint('D3-pause-cancels-input-without-native-step-or-momentum-write', {
            paused,
            pausedStep,
            pausedSubmissions,
        });
        system.enable = true;
        pointer('pointerdown', 10, screen(paused.worldCOM));
        expect(controller.snapshot().active).toBe(true);
        expect(controller.snapshot().selectedCollider).toBe('SphereCollider');
        sphere.enabled = false;
        await clock.step(1 / 60);
        expect(controller.snapshot().submissions).toBe(pausedSubmissions);
        controller.cancel();
        controller.dispose();
        expect(controller.snapshot().disposed).toBe(true);
        fixture.checkpoint('D4-disabled-selected-collider-does-not-submit-stale-force', {
            snapshot: controller.snapshot(),
        });
        const close = await app.close!();
        closed = true;
        const observations = fixture.observations();
        fixture.checkpoint('D5-original-close-receipt-before-assertions', {
            close,
            loader: fixture.loader.diagnostics(),
            beforeDispose: observations.beforeDispose,
        });
        expect(close.status).toBe('released');
        expect(close.failures).toHaveLength(0);
        expect(observations.beforeDispose.coreBytes).toBe('0');
        expect(observations.beforeDispose.bridge.liveBytes).toBe('0');
        expect(observations.beforeDispose.bridge.liveAllocations).toBe(0);
        expect(fixture.loader.diagnostics().status).toBe('DISPOSED');
        expect(fixture.loader.diagnostics().cleanupErrors).toEqual([]);
        expect(() => readBox3DBodyMotion(hull.body)).toThrow();
        expect(observations.nativeQueryCalls.length).toBeGreaterThanOrEqual(4);
        expect(issues).toEqual([]);
        fixture.checkpoint('D6-qualified-limited-assertion-count', {
            assertions: expect.getState().assertionCalls,
            formal2128And9Gates: 'NOT_RUN',
            browser: 'NOT_RUN',
        });
        fixture.complete();
    } catch (error) {
        fixture.fail(error);
        throw error;
    } finally {
        controller?.dispose();
        if (app && !closed) await app.close!();
        mesh.destroy();
        CCObject._deferredDestroy();
    }
});
