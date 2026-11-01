/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual AIR createAirApp/game.init/PhysicsSystem source plus real native Node WASM.
 * Fixture-only registration and observed capabilities; no fake world, poses, counters or steps.
 */
import { createAirApp } from '../../../src/air/bootstrap';
import type { AirApp } from '../../../src/air/app';
import { airBootstrapRegistry } from '../../../src/air/app-config';
import { registerBox3DFeature, registerBox3DWorldAdapter } from '../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../src/air/physics/box3d/registration';
import { Box3DPhysicsWorld } from '../../../src/air/physics/box3d/world';
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { Vec3 } from '../../../src/cocos/core/math/vec3';
import { game } from '../../../src/cocos/game';
import type { Box3DSTLoader } from '../../../src/air/physics/box3d/loader/st-loader.mjs';
import type { Box3DFoundation, Box3DWorld, Box3DId } from '../../../src/air/physics/box3d/binding/facade.mjs';

interface Observation {
    moduleCreated: boolean;
    initialCoreBytes: string;
    observationErrors: string[];
    calls: { name: string; args: unknown[]; returned: boolean }[];
    beforeBindingDispose?: {
        coreBytes: string;
        bridge: {
            liveBytes: string;
            liveAllocations: number;
            shapeHandles: number;
            primitiveCapacity: number;
            capturedPrimitives: number;
        } | null;
    };
}
interface Fixture {
    loader: Box3DSTLoader;
    expected: 'unsupported' | 'qualified-subset';
    binding(): Box3DFoundation;
    token(): Box3DWorld;
    observations(): Observation;
    checkpoint(name: string, data: unknown): void;
    complete(status: 'EXPECTED_REJECTION' | 'PASS_LIMITED_NODE_WORLD'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_REAL_WASM_FIXTURE__: Fixture;
const fixture = __BOX3D_REAL_WASM_FIXTURE__;
const vector = (v: Vec3) => [v.x, v.y, v.z];
const sameId = (a: Box3DId, b: Box3DId) => a.low === b.low && a.high === b.high;

test('real WASM world through actual AIR startup and PhysicsSystem; scope reported independently', async () => {
    let app: AirApp | undefined;
    try {
        registerBox3DFeature({ createLoader: () => fixture.loader });
        registerBox3DWorldAdapter(createBox3DWorldAdapter(selector));
        const start = () =>
            createAirApp({
                canvas: '#GameCanvas',
                renderMode: 3,
                physics: 'box3d',
                physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } },
            });
        if (fixture.expected === 'unsupported') {
            await expect(start()).rejects.toMatchObject({ code: 'AIR_E_BOX3D_UNSUPPORTED' });
            expect(fixture.observations().moduleCreated).toBe(true);
            expect(fixture.observations().calls.filter((row) => row.name === 'createWorld')).toHaveLength(0);
            expect(fixture.loader.diagnostics().status).toBe('DISPOSED');
            expect(fixture.observations().observationErrors).toEqual([]);
            const receipt = airBootstrapRegistry().physicsPreparation;
            expect(receipt?.status).toBe('failed');
            expect(receipt?.acquired).toEqual([
                expect.objectContaining({ backend: 'box3d', resource: 'module', cleanup: 'released' }),
            ]);
            fixture.checkpoint('unsupported-real-module-cleanup', {
                preparation: receipt,
                loader: fixture.loader.diagnostics(),
            });
            fixture.complete('EXPECTED_REJECTION');
            return;
        }
        app = await start();
        game.pause(); // No app.run, no RAF-driven fixture clock.
        const system = PhysicsSystem.instance;
        expect(system).toBeInstanceOf(PhysicsSystem);
        expect(selector.id).toBe('box3d');
        expect(system.physicsWorld).toBeInstanceOf(Box3DPhysicsWorld);
        const world = system.physicsWorld as Box3DPhysicsWorld;
        const binding = fixture.binding();
        const token = fixture.token();
        expect(world.impl).not.toBe(token);
        expect(airBootstrapRegistry().physicsPreparation?.status).toBe('prepared');
        expect(fixture.observations().calls.filter((row) => row.name === 'createWorld')).toHaveLength(1);
        fixture.checkpoint('actual-game-init', {
            preparation: airBootstrapRegistry().physicsPreparation,
            world: world.diagnostics(),
            native: binding.stepDiagnostics(token),
        });

        system.autoSimulation = false;
        system.gravity = new Vec3(0, -6, 0);
        expect(binding.getGravity(token)).toEqual([0, -6, 0]);
        const body = binding.createBody(token, { position: [0, 20, 0], enableSleep: false });
        const shape = binding.createSphere(body, 0.5, 1);
        world.registerMaterialShape(shape, true); // Internal hook, not a Cocos collider implementation.
        const poses: number[][] = [];
        const firstIndex = binding.stepDiagnostics(token).nativeStepIndex;
        for (let tick = 0; tick < 60; ++tick) {
            system.step(1 / 60);
            const pose = Array.from(binding.bodySnapshot(body));
            expect(pose.every(Number.isFinite)).toBe(true);
            poses.push(pose);
        }
        expect(Math.abs(poses[59][1] - 17)).toBeLessThan(0.1);
        expect(Math.abs(poses[59][8] + 6)).toBeLessThan(0.02);
        expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(firstIndex + 60);
        fixture.checkpoint('custom-gravity-real-trajectory', {
            poses,
            native: binding.stepDiagnostics(token),
            counts: world.getNativeCounts(),
        });

        const secondBody = binding.createBody(token, { position: [30, 40, 0], enableSleep: false });
        const explicitShape = binding.createSphere(secondBody, 0.5, 1);
        binding.setShapeMaterial(token, explicitShape, { friction: 0.75, restitution: 0.125 });
        world.registerMaterialShape(explicitShape, false);
        const material = new PhysicsMaterial();
        material.setValues(0.25, 0, 0, 0.5);
        system.setDefaultPhysicsMaterial(material);
        expect(binding.getShapeMaterial(token, shape)).toEqual({ friction: 0.25, restitution: 0.5 });
        expect(binding.getShapeMaterial(token, explicitShape)).toEqual({ friction: 0.75, restitution: 0.125 });
        const futureShape = binding.createOffsetSphere(secondBody, [2, 0, 0], 0.5, 1);
        world.registerMaterialShape(futureShape, true);
        expect(binding.getShapeMaterial(token, futureShape)).toEqual({ friction: 0.25, restitution: 0.5 });
        const previousGravity = vector(system.gravity);
        const invalidGravity = new Vec3();
        invalidGravity.x = Infinity;
        expect(() => {
            system.gravity = invalidGravity;
        }).toThrow();
        expect(vector(system.gravity)).toEqual(previousGravity);
        const previousSleep = system.allowSleep;
        expect(() => {
            system.allowSleep = 1 as unknown as boolean;
        }).toThrow();
        expect(system.allowSleep).toBe(previousSleep);
        const invalidMaterial = new PhysicsMaterial();
        invalidMaterial.rollingFriction = 0.25;
        expect(() => system.setDefaultPhysicsMaterial(invalidMaterial)).toThrow();
        expect(system.defaultMaterial).toBe(material);
        expect(binding.getShapeMaterial(token, shape)).toEqual({ friction: 0.25, restitution: 0.5 });
        expect(world.diagnostics().state).toBe('ready');
        fixture.checkpoint('real-material-and-rejected-setters', {
            inherited: binding.getShapeMaterial(token, shape),
            explicit: binding.getShapeMaterial(token, explicitShape),
            future: binding.getShapeMaterial(token, futureShape),
            world: world.diagnostics(),
        });

        for (const flags of [1, 4]) {
            world.debugDrawFlags = flags;
            const debug = world.getDebugSnapshot()!;
            expect(debug.supportedFlags).toBe(5);
            expect(debug.primitives.length).toBeGreaterThan(0);
            expect(Object.isFrozen(debug.primitives)).toBe(true);
            for (const primitive of debug.primitives) {
                const points =
                    primitive.kind === 'line'
                        ? [...primitive.from, ...primitive.to]
                        : [...primitive.lower, ...primitive.upper];
                expect(points.every(Number.isFinite)).toBe(true);
            }
            fixture.checkpoint(`native-debug-${flags}`, { debug, bridgeMemory: binding.bridgeMemory(token) });
        }
        expect(() => {
            world.debugDrawFlags = 2;
        }).toThrow();
        expect(world.debugDrawFlags).toBe(4);
        world.debugDrawConstraintSize = 0.5;
        expect(world.getDebugSnapshot()!.jointScale).toBe(0.5); // Echo only, no constraint qualification.
        expect(world.diagnostics().debugPresented).toBe(false);
        world.debugDrawFlags = 0;
        expect(world.getDebugSnapshot()!.primitives).toHaveLength(0);

        const tickStart = binding.stepDiagnostics(token).nativeStepIndex;
        system.enable = true;
        system.autoSimulation = true;
        system.fixedTimeStep = 0.125;
        system.maxSubSteps = 2;
        system.resetAccumulator(0);
        system.postUpdate(0.0625);
        expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(tickStart);
        system.postUpdate(0.3125);
        expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(tickStart + 2);
        system.postUpdate(0);
        expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(tickStart + 3);
        system.enable = false;
        system.postUpdate(10);
        system.enable = true;
        system.postUpdate(0);
        expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(tickStart + 3);
        system.autoSimulation = false;
        system.postUpdate(10);
        system.step(0.125);
        expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(tickStart + 4);
        expect(() => system.step(0.125, 0.125, 2)).toThrow();
        expect(binding.stepDiagnostics(token).nativeStepIndex).toBe(tickStart + 4);
        fixture.checkpoint('actual-fixed-loop-no-second-clock', {
            native: binding.stepDiagnostics(token),
            world: world.diagnostics(),
        });

        system.gravity = new Vec3(0, 0, 0);
        system.allowSleep = true;
        expect(binding.isSleepingEnabled(token)).toBe(true);
        const sleepingBody = binding.createBody(token, { position: [100, 100, 0], enableSleep: true });
        binding.createSphere(sleepingBody, 0.5, 1);
        let fellAsleepAt: number | null = null;
        for (let tick = 1; tick <= 240 && fellAsleepAt === null; ++tick) {
            system.step(1 / 60);
            if (
                binding
                    .readStepSnapshot(token)
                    .bodyMoves.some((row) => sameId(row.body, sleepingBody) && row.fellAsleep)
            )
                fellAsleepAt = tick;
        }
        expect(fellAsleepAt).not.toBeNull();
        expect(Array.from(binding.bodySnapshot(sleepingBody)).slice(0, 3)).toEqual([100, 100, 0]);
        system.allowSleep = false;
        expect(binding.isSleepingEnabled(token)).toBe(false);
        system.step(1 / 60);
        expect(
            binding.readStepSnapshot(token).bodyMoves.some((row) => sameId(row.body, sleepingBody) && !row.fellAsleep),
        ).toBe(true);
        const finalNative = binding.stepDiagnostics(token);
        expect(world.getNativeCounts()).toMatchObject({ bodies: 3, shapes: 4 });
        expect(fixture.observations().calls.filter((row) => row.name === 'step' && row.returned)).toHaveLength(
            finalNative.nativeStepIndex,
        );
        fixture.checkpoint('real-sleep-transition-and-final-counts', {
            fellAsleepAt,
            native: finalNative,
            counts: world.getNativeCounts(),
            bridgeMemory: binding.bridgeMemory(token),
        });

        const close = await app.close!();
        expect(await app.close!()).toBe(close);
        expect(close.status).toBe('released');
        expect(close.physicsPreparation?.status).toBe('closed');
        expect(close.physicsPreparation?.acquired.map((row) => [row.resource, row.cleanup])).toEqual([
            ['module', 'released'],
            ['world', 'released'],
        ]);
        const observations = fixture.observations();
        expect(observations.calls.filter((row) => row.name === 'destroyWorld' && row.returned)).toHaveLength(1);
        expect(observations.beforeBindingDispose?.coreBytes).toBe(observations.initialCoreBytes);
        expect(observations.beforeBindingDispose?.bridge).toEqual({
            liveBytes: '0',
            liveAllocations: 0,
            shapeHandles: 0,
            primitiveCapacity: 0,
            capturedPrimitives: 0,
        });
        expect(observations.observationErrors).toEqual([]);
        expect(fixture.loader.diagnostics().status).toBe('DISPOSED');
        expect(() => binding.bodySnapshot(body)).toThrow();
        expect(() => world.step(1 / 60)).toThrow();
        fixture.checkpoint('owned-world-module-cleanup', { close, loader: fixture.loader.diagnostics(), observations });
        fixture.complete('PASS_LIMITED_NODE_WORLD');
    } catch (error) {
        fixture.fail(error);
        throw error;
    } finally {
        if (app) await app.close?.();
    }
});
