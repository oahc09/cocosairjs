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
import * as mutationGuards from '../../../src/cocos/core/data/mutation-guard';
import * as transformGuards from '../../../src/cocos/scene-graph/node-transform-validation';
import { inspectPhysicsMaterialCleanup } from '../../../src/cocos/physics/framework/physics-material-transaction';
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
    complete(status: 'PASS_LIMITED_MATERIAL_CLEANUP'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_MATERIAL_CLEANUP_FIXTURE__: Fixture;
const fixture = __BOX3D_MATERIAL_CLEANUP_FIXTURE__;
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
        if (fixture.expected !== 'public-default-cleanup') collider.sharedMaterial = original;
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
        const cleanupCalls: string[] = [];
        const view = (error: unknown) => ({
            type: typeof error,
            value: error === undefined ? 'undefined' : error === null ? 'null' : String(error),
        });
        const beforeSetters = fixture.observations().calls.filter((v: any) => v.name === 'setShapeMaterial').length;
        let result: ReturnType<typeof attempt>;
        let manualCleanup: ReturnType<typeof attempt> | undefined;
        if (fixture.expected === 'collider-cleanup') {
            const on = candidate.on;
            candidate.on = function () {
                throw 0;
            } as typeof candidate.on;
            result = attempt(() => {
                collider.material = candidate;
            });
            candidate.on = on;
            const adapter = (collider as any)._shape;
            const update = adapter.updateEventListener,
                destroy = adapter.onDestroy,
                off = candidate.off;
            // Explicitly invoke the original protected cleanup callback on the actual live component.
            // This is a narrow callback contract, not full scheduler-driven lifecycle qualification.
            adapter.updateEventListener = function () {
                cleanupCalls.push('updateEventListener');
                update.call(this);
                throw undefined;
            };
            candidate.off = function (this: PhysicsMaterial, ...args: any[]) {
                cleanupCalls.push('candidate.off');
                off.apply(this, args as any);
                throw null;
            } as typeof candidate.off;
            adapter.onDestroy = function () {
                cleanupCalls.push('adapter.onDestroy');
                destroy.call(this);
                throw 'adapter-cleanup-secondary';
            };
            try {
                manualCleanup = attempt(() => (collider as any).onDestroy());
            } finally {
                adapter.updateEventListener = update;
                adapter.onDestroy = destroy;
                candidate.off = off;
            }
            const reported = inspectPhysicsMaterialCleanup(collider);
            check(
                'actual cleanup attempts every remaining action',
                JSON.stringify(cleanupCalls) ===
                    JSON.stringify(['updateEventListener', 'candidate.off', 'adapter.onDestroy']),
                cleanupCalls,
            );
            check(
                'original first cleanup undefined retained',
                manualCleanup.threw && manualCleanup.error === undefined,
                errorView(manualCleanup),
            );
            check(
                'post-release reporter retains all three exact cleanup errors',
                !!reported?.report &&
                    reported.report.hasFailure &&
                    reported.report.firstError === undefined &&
                    reported.report.errors.length === 3 &&
                    reported.report.errors[0].error === undefined &&
                    reported.report.errors[1].error === null &&
                    reported.report.errors[2].error === 'adapter-cleanup-secondary',
                reported
                    ? {
                          consumed: reported.consumed,
                          errors: reported.report?.errors.map((e) => ({ stage: e.stage, ...view(e.error) })),
                          deliveryReturned: reported.deliveryReturned,
                      }
                    : null,
            );
        } else {
            const mutation = mutationGuards.registerMutationGuard,
                transform = transformGuards.registerNodeTransformGuard;
            let mutationIndex = 0;
            jest.spyOn(mutationGuards, 'registerMutationGuard').mockImplementation(
                (...args: Parameters<typeof mutation>) => {
                    const lease = mutation(...args),
                        index = ++mutationIndex;
                    let thrown = false;
                    return Object.freeze({
                        dispose() {
                            cleanupCalls.push(index === 1 ? 'scope-mutation' : 'candidate-mutation');
                            lease.dispose();
                            if (!thrown) {
                                thrown = true;
                                throw index === 1 ? 'scope-mutation-secondary' : undefined;
                            }
                        },
                    });
                },
            );
            jest.spyOn(transformGuards, 'registerNodeTransformGuard').mockImplementation(
                (...args: Parameters<typeof transform>) => {
                    const lease = transform(...args);
                    let thrown = false;
                    return Object.freeze({
                        write: lease.write.bind(lease),
                        dispose() {
                            cleanupCalls.push('scope-transform');
                            lease.dispose();
                            if (!thrown) {
                                thrown = true;
                                throw null;
                            }
                        },
                    });
                },
            );
            const on = candidate.on;
            try {
                if (fixture.expected === 'public-default-cleanup') {
                    fixture.armNativeReadbackFailure();
                    result = attempt(() => world.setDefaultMaterial(candidate));
                } else {
                    candidate.on = function () {
                        throw 0;
                    } as typeof candidate.on;
                    result = attempt(() => {
                        collider.material = candidate;
                    });
                }
            } finally {
                candidate.on = on;
                jest.restoreAllMocks();
            }
            const errors = (world.diagnostics().commandOwner as any).cleanup?.cleanupFailures ?? [];
            const values = errors.map((e: any) => e.error);
            const expectedCalls =
                fixture.expected === 'public-default-cleanup'
                    ? ['scope-transform', 'scope-mutation']
                    : ['candidate-mutation', 'scope-transform', 'scope-mutation'];
            check(
                'all genuine guard disposers ran before injected throws',
                JSON.stringify(cleanupCalls) === JSON.stringify(expectedCalls),
                cleanupCalls,
            );
            check(
                'each leaf cleanup error is independently retained',
                values.length === expectedCalls.length &&
                    values.includes(null) &&
                    values.includes('scope-mutation-secondary') &&
                    (fixture.expected === 'public-default-cleanup' || values.includes(undefined)),
                errors.map((e: any) => ({ stage: e.stage, ...view(e.error) })),
            );
        }
        const diag = world.diagnostics();
        check('business zero remains original outward value', result!.threw && result!.error === 0, errorView(result!));
        check(
            'world first failure is explicitly present and exact zero',
            diag.failure.hasFailure && diag.failure.error === 0,
            { hasFailure: diag.failure.hasFailure, ...view(diag.failure.error) },
        );
        check('world remains faulted after cleanup diagnostics', diag.state === 'faulted', diag.state);
        const setCalls =
            fixture.observations().calls.filter((v: any) => v.name === 'setShapeMaterial').length - beforeSetters;
        check('only one real material mutation, no cleanup native replay', setCalls === 1, {
            setCalls,
            injection: fixture.observations().injection,
        });
        if (fixture.expected !== 'collider-cleanup')
            check(
                'real native candidate remains committed after failure',
                binding.getShapeMaterial(token, shape).friction === Math.fround(0.8),
                binding.getShapeMaterial(token, shape),
            );
        const beforeRetry = binding.stepDiagnostics(token),
            retry = attempt(() => system.step(1 / 60));
        check(
            'faulted owner never advances native step',
            retry.threw &&
                retry.error?.code === 'AIR_E_BOX3D_WORLD_FAULTED' &&
                binding.stepDiagnostics(token).nativeStepIndex === beforeRetry.nativeStepIndex,
            { retry: errorView(retry), before: beforeRetry, after: binding.stepDiagnostics(token) },
        );
        fixture.checkpoint('explicit-cleanup-failure-outcome', {
            expected: fixture.expected,
            cleanupCalls,
            error: errorView(result!),
            manualCleanup: manualCleanup ? errorView(manualCleanup) : null,
            world: diag,
            native: binding.stepDiagnostics(token),
        });
        const owner = world.diagnostics().commandOwner;
        check(
            'faulted unresolved cleanup never activates public transactions',
            !owner.stagedCommandsSupported && !owner.unifiedTransactionsSupported,
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
    fixture.complete('PASS_LIMITED_MATERIAL_CLEANUP');
});
