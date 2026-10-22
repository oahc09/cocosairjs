/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * Actual material ownership controls against real current WASM; no replaced physics result.
 */
import '../../../src/exports/base';
import { createAirApp } from '../../../src/air/bootstrap';
import type { AirApp } from '../../../src/air/app';
import { registerBox3DFeature, registerBox3DWorldAdapter } from '../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../src/air/physics/box3d/registration';
import { Box3DPhysicsWorld } from '../../../src/air/physics/box3d/world';
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { PhysicsMaterial } from '../../../src/cocos/physics/framework/assets/physics-material';
import { RigidBody } from '../../../src/cocos/physics/framework/components/rigid-body';
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { selector } from '../../../src/cocos/physics/framework/physics-selector';
import { Vec3 } from '../../../src/cocos/core/math/vec3';
import { Node } from '../../../src/cocos/scene-graph/node';
import { Scene } from '../../../src/cocos/scene-graph/scene';
import { director, game } from '../../../src/cocos/game';
import type { Box3DSTLoader } from '../../../src/air/physics/box3d/loader/st-loader.mjs';
import type { Box3DFoundation, Box3DWorld, Box3DId } from '../../../src/air/physics/box3d/binding/facade.mjs';
interface Fixture {
    loader: Box3DSTLoader;
    expected: string;
    binding(): Box3DFoundation;
    token(): Box3DWorld;
    shapes(): Box3DId[];
    observations(): any;
    checkpoint(name: string, value: unknown): void;
    complete(status: 'PASS_LIMITED_MATERIAL_OWNER'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_MATERIAL_OWNER_FIXTURE__: Fixture;
const fixture = __BOX3D_MATERIAL_OWNER_FIXTURE__;
const attempt = (action: () => void) => {
    try {
        action();
        return { threw: false, error: undefined as any };
    } catch (error) {
        return { threw: true, error };
    }
};
const errorView = (result: ReturnType<typeof attempt>) => ({
    threw: result.threw,
    type: typeof result.error,
    message: result.threw ? String(result.error) : null,
    code: result.error?.code ?? null,
});
test('actual material cache identity and truthful post-effect failure', async () => {
    let app: AirApp | undefined,
        failed = false,
        failure: unknown;
    const assets = new Set<PhysicsMaterial>();
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual });
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
        game.pause();
        const system = PhysicsSystem.instance,
            world = system.physicsWorld as Box3DPhysicsWorld;
        system.autoSimulation = false;
        system.gravity = new Vec3(0, 0, 0);
        const scene = new Scene('material-owner-' + fixture.expected);
        director.runSceneImmediate(scene);
        game.pause();
        const node = new Node('material-body');
        node.setPosition(0, 10, 0);
        const body = node.addComponent(RigidBody);
        body.useGravity = false;
        body.linearDamping = 0;
        body.angularDamping = 0;
        const collider = node.addComponent(BoxCollider);
        const original = new PhysicsMaterial();
        assets.add(original);
        original.friction = 0.3;
        if (fixture.expected !== 'default-listener-failure') collider.sharedMaterial = original;
        scene.addChild(node);
        body.setLinearVelocity(new Vec3(1, 0, 0));
        const binding = fixture.binding(),
            token = fixture.token(),
            shape = fixture.shapes()[0];
        expect(shape).toBeDefined();
        fixture.checkpoint('actual-initial-material', {
            colliderIsOriginal: collider.sharedMaterial === original,
            native: binding.getShapeMaterial(token, shape),
            world: world.diagnostics(),
        });
        if (fixture.expected === 'clone-callback') {
            const clone = collider.material!;
            assets.add(clone);
            check(
                'actual getter allocated distinct published clone',
                clone !== original && collider.sharedMaterial === clone,
                { distinct: clone !== original, cachedClone: collider.sharedMaterial === clone },
            );
            const events: unknown[] = [];
            let entered = false;
            node.on(Node.EventType.TRANSFORM_CHANGED, (flags: number) => {
                if (entered || !(flags & 2)) return;
                entered = true;
                const previous = clone.friction;
                const result = attempt(() => {
                    clone.friction = 0.8;
                });
                const actual = {
                    previous,
                    after: clone.friction,
                    result: errorView(result),
                    world: world.diagnostics(),
                };
                events.push(actual);
                check(
                    'cloned material refuses before coefficient cache write',
                    result.threw && result.error?.code === 'AIR_E_BOX3D_REENTRANT' && clone.friction === previous,
                    actual,
                );
            });
            const result = attempt(() => system.step(1 / 60));
            check(
                'one real step and caught listener return ready',
                !result.threw &&
                    world.diagnostics().state === 'ready' &&
                    binding.stepDiagnostics(token).nativeStepIndex === 1,
                { error: errorView(result), world: world.diagnostics() },
            );
            check('actual writeback listener ran', entered, events);
            fixture.checkpoint('clone-callback-outcome', {
                events,
                cloneFriction: clone.friction,
                originalFriction: original.friction,
                native: binding.getShapeMaterial(token, shape),
                world: world.diagnostics(),
            });
        } else {
            const candidate = new PhysicsMaterial();
            assets.add(candidate);
            candidate.friction = 0.8;
            const originalOn = candidate.on;
            const marker = new Error('EXPLICIT_FIXTURE_LISTENER_ON_FAILURE_AFTER_REAL_NATIVE_RETURN');
            let entered = 0;
            candidate.on = function () {
                ++entered;
                throw marker;
            } as typeof candidate.on;
            const oldSystem = system.defaultMaterial;
            const result = attempt(() => {
                if (fixture.expected === 'default-listener-failure') system.setDefaultPhysicsMaterial(candidate);
                else collider.material = candidate;
            });
            candidate.on = originalOn;
            const native = binding.getShapeMaterial(token, shape);
            const observed = {
                injectedListenerEntries: entered,
                exactOriginalError: result.error === marker,
                error: errorView(result),
                native,
                world: world.diagnostics(),
                colliderStillOriginal: collider.sharedMaterial === original,
                colliderIsCandidate: collider.sharedMaterial === candidate,
                systemStillOld: system.defaultMaterial === oldSystem,
                systemIsCandidate: system.defaultMaterial === candidate,
            };
            check(
                'explicit listener injection really ran after native material changed',
                entered === 1 && result.threw && result.error === marker && native.friction === Math.fround(0.8),
                observed,
            );
            check(
                'post-native listener failure faults instead of pretending no change',
                world.diagnostics().state === 'faulted',
                observed,
            );
            fixture.checkpoint('native-return-then-listener-failure', observed);
            const beforeRetry = binding.stepDiagnostics(token);
            const retry = attempt(() => system.step(1 / 60));
            check(
                'faulted owner refuses later step without native replay',
                retry.threw &&
                    retry.error?.code === 'AIR_E_BOX3D_WORLD_FAULTED' &&
                    binding.stepDiagnostics(token).nativeStepIndex === beforeRetry.nativeStepIndex,
                {
                    retry: errorView(retry),
                    before: beforeRetry,
                    after: binding.stepDiagnostics(token),
                    world: world.diagnostics(),
                },
            );
        }
        const owner = world.diagnostics().commandOwner;
        check(
            'temporary scope released without public activation',
            owner.activeTemporaryScopes === 0 && !owner.stagedCommandsSupported && !owner.unifiedTransactionsSupported,
            owner,
        );
        fixture.checkpoint('material-case-verdict-before-close', {
            checks,
            world: world.diagnostics(),
            native: binding.stepDiagnostics(token),
        });
    } catch (error) {
        failed = true;
        failure = error;
    } finally {
        if (app) {
            try {
                const close = await app.close!(),
                    observations = fixture.observations();
                fixture.checkpoint('actual-close', { close, observations });
                check('app close released', close.status === 'released', close);
                check(
                    'actual owned core and bridge bytes zero',
                    observations.beforeBindingDispose?.coreBytes === '0' &&
                        observations.beforeBindingDispose?.bridge.liveBytes === '0' &&
                        observations.beforeBindingDispose?.bridge.liveAllocations === 0,
                    observations.beforeBindingDispose,
                );
                check(
                    'real loader cleanup complete',
                    fixture.loader.diagnostics().status === 'DISPOSED' && observations.observationErrors.length === 0,
                    fixture.loader.diagnostics(),
                );
            } catch (error) {
                if (!failed) {
                    failed = true;
                    failure = error;
                }
            }
        }
        for (const asset of assets) {
            if (asset.isValid) asset.destroy();
        }
    }
    fixture.checkpoint('final-assertions', { checks, failure: failed ? String(failure) : null, failed });
    if (!failed && checks.some((row) => !row.pass)) {
        failed = true;
        failure = new Error(
            'Material ownership invariants: ' +
                checks
                    .filter((row) => !row.pass)
                    .map((row) => row.id)
                    .join('; '),
        );
    }
    if (failed) {
        fixture.fail(failure);
        throw failure;
    }
    fixture.complete('PASS_LIMITED_MATERIAL_OWNER');
});
