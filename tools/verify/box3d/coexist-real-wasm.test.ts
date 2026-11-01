/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual AIR and both PhysicsSystems. Transport/import seams use real native factories only.
 */
import '../../../src/exports/physics-builtin';
import '../../../src/exports/physics-cannon';
import '../../../src/exports/physics-2d-box2d';
import { createAirApp } from '../../../src/air/bootstrap';
import type { AirApp, AirAppOptions } from '../../../src/air/app';
import { airBootstrapRegistry } from '../../../src/air/app-config';
import { getBox2D3PreparationInfo, getBox2D3Stats } from '../../../src/air/physics-2d/box2d3';
import type { Box2D3Module } from '../../../src/air/physics-2d/box2d3';
import { registerBox3DFeature, registerBox3DWorldAdapter } from '../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../src/air/physics/box3d/registration';
import { Box3DPhysicsWorld } from '../../../src/air/physics/box3d/world';
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { PhysicsSystem2D } from '../../../src/cocos/physics-2d/framework/physics-system';
import { PHYSICS_2D_PTM_RATIO } from '../../../src/cocos/physics-2d/framework/physics-types';
import { selector as selector2D } from '../../../src/cocos/physics-2d/framework/physics-selector';
import { BuiltInWorld } from '../../../src/cocos/physics/cocos/builtin-world';
import { CannonWorld } from '../../../src/cocos/physics/cannon/cannon-world';
import type { CannonSharedBody } from '../../../src/cocos/physics/cannon/cannon-shared-body';
import { ERigidBodyType } from '../../../src/cocos/physics/framework/physics-enum';
import { Node } from '../../../src/cocos/scene-graph/node';
import { b2PhysicsWorld } from '../../../src/cocos/physics-2d/box2d/physics-world';
import { Vec2 } from '../../../src/cocos/core/math/vec2';
import { Vec3 } from '../../../src/cocos/core/math/vec3';
import { Game, game } from '../../../src/cocos/game';
import type { Box3DSTLoader } from '../../../src/air/physics/box3d/loader/st-loader.mjs';
import type { Box3DFoundation, Box3DWorld, Box3DId } from '../../../src/air/physics/box3d/binding/facade.mjs';

interface Observation {
    calls: { backend: string; name: string; args: unknown[]; returned: boolean }[];
    requests2D: { kind: string; url: string }[];
    requests3D: string[];
    module2D: boolean;
    module3D: boolean;
    initial3DBytes?: string;
    before3DDispose?: { coreBytes: string; bridge: Record<string, number | string> };
    observationErrors: string[];
}
interface Fixture {
    loader: Box3DSTLoader;
    scenario: string;
    twoDAssetBase: string;
    twoD(): { api: Box2D3Module; world: number };
    threeD(): { api: Box3DFoundation; world: Box3DWorld };
    observations(): Observation;
    checkpoint(name: string, data: unknown): void;
    complete(status: 'PASS_LIMITED_NODE_COEXIST' | 'EXPECTED_REJECTION'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_COEXIST_FIXTURE__: Fixture;
const fixture = __BOX3D_COEXIST_FIXTURE__;
const count = (backend: string, name: string) =>
    fixture.observations().calls.filter((row) => row.backend === backend && row.name === name && row.returned).length;
function assert3DReleased() {
    const observations = fixture.observations();
    expect(count('3d', 'destroyWorld')).toBe(1);
    expect(count('3d', 'dispose')).toBe(1);
    expect(observations.before3DDispose?.coreBytes).toBe(observations.initial3DBytes);
    expect(observations.before3DDispose?.bridge).toEqual({
        liveBytes: '0',
        liveAllocations: 0,
        shapeHandles: 0,
        primitiveCapacity: 0,
        capturedPrimitives: 0,
    });
    expect(fixture.loader.diagnostics().status).toBe('DISPOSED');
}
function assert2DReleased() {
    expect(getBox2D3PreparationInfo()).toMatchObject({
        leases: 0,
        pendingAcquisitions: 0,
        pinned: false,
        moduleReferenced: false,
        cleanupFailure: null,
    });
}

test(`actual source and real WASM coexistence: ${fixture.scenario}`, async () => {
    let app: AirApp | undefined;
    let cannonBody: CANNON.Body | undefined;
    let cannonWorld: CANNON.World | undefined;
    let cannonShared: CannonSharedBody | undefined;
    let cannonNode: Node | undefined;
    const releaseCannon = () => {
        if (cannonShared) {
            cannonShared.enabled = false;
            cannonShared.reference = false;
            cannonShared = undefined;
        }
        cannonBody = undefined;
        if (cannonNode) {
            cannonNode.destroy();
            cannonNode = undefined;
        }
    };
    const errors: string[] = [];
    const originalError = console.error;
    console.error = function (...args) {
        errors.push(args.map(String).join(' '));
        return Reflect.apply(originalError, this, args);
    };
    const failure = Object.assign(new Error('COEXIST_POST_SUBSYSTEM_FIXTURE_FAILURE'), {
        code: 'COEXIST_POST_SUBSYSTEM_FIXTURE_FAILURE',
    });
    const onPostSubsystem = () => {
        fixture.checkpoint('actual-post-subsystem-worlds', {
            selector: selector.id,
            selector2D: selector2D.id,
            preparation: airBootstrapRegistry().physicsPreparation,
            counts2D: getBox2D3Stats(),
            calls: fixture.observations().calls,
        });
        expect(count('2d', 'createWorld')).toBe(1);
        expect(count('3d', 'createWorld')).toBe(1);
        throw failure;
    };
    try {
        registerBox3DFeature({ createLoader: () => fixture.loader });
        registerBox3DWorldAdapter(createBox3DWorldAdapter(selector));
        const use3D = ['both', '2d-failure', '3d-failure', 'init-failure', '3d-only'].includes(fixture.scenario);
        const use2D = ['both', '2d-failure', '3d-failure', 'init-failure', '2d-builtin', '2d-cannon'].includes(
            fixture.scenario,
        );
        const useCannon = fixture.scenario.endsWith('cannon');
        const options: AirAppOptions = {
            canvas: '#GameCanvas',
            renderMode: 3,
            ...(fixture.scenario === 'default-builtin'
                ? {}
                : { physics: use3D ? 'box3d' : useCannon ? 'cannon' : 'builtin' }),
            ...(use2D
                ? { physics2D: 'box2d-v3-wasm', box2d3: { assetBaseUrl: fixture.twoDAssetBase, subStepCount: 4 } }
                : {}),
        };
        if (fixture.scenario === 'init-failure') game.once(Game.EVENT_POST_SUBSYSTEM_INIT, onPostSubsystem);
        const pending = createAirApp(options);
        expect(createAirApp({ ...options })).toBe(pending);
        if (fixture.scenario.endsWith('failure')) {
            if (fixture.scenario === 'init-failure') await expect(pending).rejects.toBe(failure);
            else
                await expect(pending).rejects.toThrow(
                    fixture.scenario === '2d-failure' ? /BOX2D3_LOAD: HTTP 503/ : /503/,
                );
            const observations = fixture.observations();
            const preparation = airBootstrapRegistry().physicsPreparation!;
            expect(preparation.status).toBe('failed');
            expect(preparation.cleanupErrors).toEqual([]);
            assert2DReleased();
            if (fixture.scenario === '2d-failure') {
                expect(observations.module2D).toBe(false);
                expect(observations.requests3D).toHaveLength(0);
                expect(observations.calls).toHaveLength(0);
                expect(preparation.acquired).toHaveLength(0);
            } else if (fixture.scenario === '3d-failure') {
                expect(observations.module2D).toBe(true);
                expect(observations.module3D).toBe(false);
                expect(observations.calls).toHaveLength(0);
                expect(preparation.acquired.map((row) => [row.backend, row.resource, row.cleanup])).toEqual([
                    ['box2d-v3-wasm', 'application-lease', 'released'],
                ]);
            } else {
                expect(count('2d', 'destroyWorld')).toBe(1);
                assert3DReleased();
                expect(preparation.acquired.map((row) => [row.backend, row.resource, row.cleanup])).toEqual([
                    ['box2d-v3-wasm', 'application-lease', 'released'],
                    ['box3d', 'module', 'released'],
                    ['box3d', 'world', 'released'],
                ]);
                expect(preparation.originalError?.code).toBe(failure.code);
            }
            const beforeRetry = fixture.observations();
            await expect(createAirApp(options)).rejects.toMatchObject({ code: 'AIR_E_APP_RELOAD_REQUIRED' });
            expect(fixture.observations()).toEqual(beforeRetry);
            expect(observations.observationErrors).toEqual([]);
            fixture.checkpoint('expected-failure-and-owned-cleanup', {
                preparation,
                twoD: getBox2D3PreparationInfo(),
                loader3D: fixture.loader.diagnostics(),
                errors,
            });
            fixture.complete('EXPECTED_REJECTION');
            return;
        }
        app = await pending;
        game.pause();
        expect(await createAirApp(options)).toBe(app);
        const otherCanvas = document.createElement('canvas');
        document.body.appendChild(otherCanvas);
        await expect(createAirApp({ ...options, canvas: otherCanvas })).rejects.toMatchObject({
            code: 'AIR_E_CANVAS_CONFLICT',
        });
        await expect(createAirApp({ ...options, physics: use3D ? 'builtin' : 'box3d' })).rejects.toMatchObject({
            code: 'AIR_E_APP_CONFLICT',
        });
        const system = PhysicsSystem.instance,
            system2D = PhysicsSystem2D.instance;
        system.autoSimulation = false;
        system2D.autoSimulation = false;
        expect(selector.id).toBe(use3D ? 'box3d' : useCannon ? 'cannon.js' : 'builtin');
        expect(selector2D.id).toBe(use2D ? 'box2d-v3-wasm' : 'box2d');
        expect(system.physicsWorld).toBeInstanceOf(use3D ? Box3DPhysicsWorld : useCannon ? CannonWorld : BuiltInWorld);
        if (!use2D) expect(system2D.physicsWorld).toBeInstanceOf(b2PhysicsWorld);
        expect(errors).toEqual([]);
        let twoD: ReturnType<Fixture['twoD']> | undefined;
        let threeD: ReturnType<Fixture['threeD']> | undefined;
        let body2D: number | undefined, body3D: Box3DId | undefined;
        system.gravity = new Vec3(0, -6, 0);
        system.allowSleep = false;
        system2D.gravity = new Vec2(0, -4 * PHYSICS_2D_PTM_RATIO);
        system2D.allowSleep = false;
        if (use2D) {
            twoD = fixture.twoD();
            body2D = twoD.api.createBody(twoD.world, { type: 2, y: 20, allowSleep: false });
            twoD.api.createShape(body2D, 'circle', { radius: 0.5, density: 1 });
            expect(twoD.api.stats(twoD.world)).toMatchObject({ worlds: 1, bodies: 2, shapes: 1 });
        } else expect(fixture.observations().requests2D).toHaveLength(0);
        if (use3D) {
            threeD = fixture.threeD();
            body3D = threeD.api.createBody(threeD.world, { position: [0, 20, 0], enableSleep: false });
            threeD.api.createSphere(body3D, 0.5, 1);
        } else {
            expect(fixture.observations().requests3D).toHaveLength(0);
            if (useCannon) {
                cannonWorld = (system.physicsWorld as CannonWorld).impl;
                cannonNode = new Node('coexist-real-cannon-body');
                cannonNode.setPosition(0, 20, 0);
                cannonShared = (system.physicsWorld as CannonWorld).getSharedBody(cannonNode);
                cannonShared.reference = true;
                cannonBody = cannonShared.body;
                cannonBody.type = ERigidBodyType.DYNAMIC;
                cannonBody.mass = 1;
                cannonBody.linearDamping = 0;
                cannonBody.angularDamping = 0;
                cannonBody.addShape(new CANNON.Sphere(0.5));
                cannonBody.updateMassProperties();
                cannonShared.enabled = true;
                expect((system.physicsWorld as CannonWorld).bodies).toContain(cannonShared);
                expect([cannonWorld.gravity.x, cannonWorld.gravity.y, cannonWorld.gravity.z]).toEqual([0, -6, 0]);
                expect(cannonWorld.allowSleep).toBe(false);
            }
        }
        fixture.checkpoint('actual-both-system-init', {
            selected3D: selector.id,
            selected2D: selector2D.id,
            twoD: getBox2D3PreparationInfo(),
            preparation: airBootstrapRegistry().physicsPreparation,
        });
        const poses2D: { y: number; vy: number }[] = [],
            poses3D: number[][] = [];
        for (let tick = 0; tick < 60; ++tick) {
            const before2D = twoD ? twoD.api.bodyState(body2D!) : null;
            system.step(1 / 60);
            if (twoD) expect(twoD.api.bodyState(body2D!)).toEqual(before2D);
            const before3D = threeD ? Array.from(threeD.api.bodySnapshot(body3D!)) : null;
            system2D.step(1 / 60);
            if (threeD) expect(Array.from(threeD.api.bodySnapshot(body3D!))).toEqual(before3D);
            if (twoD) {
                const pose = twoD.api.bodyState(body2D!);
                expect(Number.isFinite(pose.y) && Number.isFinite(pose.vy)).toBe(true);
                poses2D.push({ y: pose.y, vy: pose.vy });
            }
            if (threeD) {
                expect(before3D!.every(Number.isFinite)).toBe(true);
                poses3D.push(before3D!);
            }
        }
        if (twoD) {
            expect(Math.abs(poses2D[59].y - 18)).toBeLessThan(0.1);
            expect(Math.abs(poses2D[59].vy + 4)).toBeLessThan(0.02);
            expect(count('2d', 'step')).toBe(60);
        }
        if (threeD) {
            expect(Math.abs(poses3D[59][1] - 17)).toBeLessThan(0.1);
            expect(threeD.api.stepDiagnostics(threeD.world).nativeStepIndex).toBe(60);
            expect(count('3d', 'step')).toBe(60);
        }
        if (cannonBody) {
            expect(Math.abs(cannonBody.position.y - 17)).toBeLessThan(0.1);
            expect(Math.abs(cannonBody.velocity.y + 6)).toBeLessThan(0.02);
        }
        const beforeDisabled = fixture.observations().calls.length;
        system.enable = false;
        system2D.enable = false;
        system.autoSimulation = true;
        system2D.autoSimulation = true;
        system.postUpdate(10);
        system2D.postUpdate(10);
        expect(fixture.observations().calls).toHaveLength(beforeDisabled);
        system.enable = true;
        system2D.enable = true;
        system.autoSimulation = false;
        system2D.autoSimulation = false;
        system.postUpdate(10);
        system2D.postUpdate(10);
        expect(fixture.observations().calls).toHaveLength(beforeDisabled);
        fixture.checkpoint('independent-real-system-stepping', {
            poses2D,
            poses3D,
            native3D: threeD?.api.stepDiagnostics(threeD.world),
            counts2D: twoD?.api.stats(twoD.world),
            cannon: cannonBody ? { y: cannonBody.position.y, vy: cannonBody.velocity.y } : null,
            builtinScope:
                !use3D && !useCannon
                    ? 'actual collision-only world startup/setters/empty step; not collision-component qualification'
                    : null,
        });
        releaseCannon();
        const close = await app.close!();
        expect(await app.close!()).toBe(close);
        expect(close.status).toBe('released');
        expect(close.physicsPreparation?.status).toBe('closed');
        if (use2D) {
            expect(count('2d', 'destroyWorld')).toBe(1);
            assert2DReleased();
            expect(() => system2D.step(1 / 60)).toThrow('BOX2D3_WORLD_CLOSED');
        } else {
            expect(fixture.observations().requests2D).toHaveLength(0);
            expect(fixture.observations().module2D).toBe(false);
        }
        if (use3D) {
            assert3DReleased();
            expect(() => system.step(1 / 60)).toThrow();
        } else {
            expect(fixture.observations().requests3D).toHaveLength(0);
            expect(fixture.observations().module3D).toBe(false);
        }
        expect(fixture.observations().observationErrors).toEqual([]);
        expect(errors).toEqual([]);
        await expect(createAirApp(options)).rejects.toMatchObject({ code: 'AIR_E_APP_CLOSED' });
        fixture.checkpoint('actual-app-close', {
            close,
            twoD: getBox2D3PreparationInfo(),
            loader3D: fixture.loader.diagnostics(),
            errors,
        });
        fixture.complete('PASS_LIMITED_NODE_COEXIST');
    } catch (error) {
        fixture.fail(error);
        throw error;
    } finally {
        game.off(Game.EVENT_POST_SUBSYSTEM_INIT, onPostSubsystem);
        releaseCannon();
        if (app) await app.close?.();
        console.error = originalError;
    }
});
