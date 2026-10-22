/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
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
    armNativeReadbackFailure(): void;
    loader: Box3DSTLoader;
    expected: string;
    binding(): Box3DFoundation;
    token(): Box3DWorld;
    shapes(): Box3DId[];
    observations(): any;
    checkpoint(name: string, value: unknown): void;
    complete(status: 'PASS_LIMITED_MATERIAL_NATIVE_FAILURE'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_MATERIAL_NATIVE_FIXTURE__: Fixture;
const fixture = __BOX3D_MATERIAL_NATIVE_FIXTURE__;
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
        // Keep this actual Collider inheriting the System default.
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
        const candidate = new PhysicsMaterial();
        assets.add(candidate);
        candidate.friction = 0.8;
        const oldSystem = system.defaultMaterial;
        fixture.armNativeReadbackFailure();
        const result = attempt(() => system.setDefaultPhysicsMaterial(candidate));
        const observed = {
            error: errorView(result),
            native: binding.getShapeMaterial(token, shape),
            injection: fixture.observations().injection,
            world: world.diagnostics(),
            systemStillOld: system.defaultMaterial === oldSystem,
            systemIsCandidate: system.defaultMaterial === candidate,
        };
        check(
            'explicit readback injection followed one real native material setter',
            observed.injection.injected === 1 &&
                observed.injection.readReturnedAfterWrite === true &&
                result.threw &&
                result.error?.code === 'EXPLICIT_MATERIAL_READBACK_FAILURE',
            observed,
        );
        check(
            'unknown outcome never replays a native material mutation',
            observed.injection.nativeSetCalls === 1 && observed.native.friction === Math.fround(0.8),
            observed,
        );
        check(
            'post-native failure faults with truthful untouched System cache',
            observed.world.state === 'faulted' && observed.systemStillOld && !observed.systemIsCandidate,
            observed,
        );
        fixture.checkpoint('native-readback-failure-outcome', observed);
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
    fixture.complete('PASS_LIMITED_MATERIAL_NATIVE_FAILURE');
});
