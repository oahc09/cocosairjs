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
    complete(status: 'PASS_LIMITED_MATERIAL_COLLIDER_CLOSE'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_MATERIAL_COLLIDER_CLOSE_FIXTURE__: Fixture;
const fixture = __BOX3D_MATERIAL_COLLIDER_CLOSE_FIXTURE__;
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
    let closeAttempted = false;
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
        const beforeSetters = fixture.observations().calls.filter((v: any) => v.name === 'setShapeMaterial').length;
        const on = candidate.on;
        candidate.on = function () {
            throw 0;
        } as typeof candidate.on;
        let result: ReturnType<typeof attempt>;
        try {
            result = attempt(() => {
                collider.material = candidate;
            });
        } finally {
            candidate.on = on;
        }
        check('business zero preserved before real close', result.threw && result.error === 0, errorView(result));
        const before = world.diagnostics();
        check('first world error is exact zero', before.failure.hasFailure && before.failure.error === 0, {
            present: before.failure.hasFailure,
            type: typeof before.failure.error,
            value: String(before.failure.error),
        });
        check(
            'real candidate native material committed once',
            fixture.observations().calls.filter((v: any) => v.name === 'setShapeMaterial').length - beforeSetters ===
                1 && binding.getShapeMaterial(token, shape).friction === Math.fround(0.8),
            binding.getShapeMaterial(token, shape),
        );
        const retry = attempt(() => system.step(1 / 60));
        check(
            'faulted System refuses before native step',
            retry.threw &&
                retry.error?.code === 'AIR_E_BOX3D_WORLD_FAULTED' &&
                binding.stepDiagnostics(token).nativeStepIndex === 0,
            { retry: errorView(retry), native: binding.stepDiagnostics(token) },
        );
        fixture.checkpoint('before-app-close-injection', { world: before, native: binding.stepDiagnostics(token) });
        const adapter = (collider as any)._shape;
        const update = adapter.updateEventListener,
            destroy = adapter.onDestroy,
            off = candidate.off;
        const actions: { action: string; originalReturned: boolean; injected: boolean; error?: string }[] = [];
        const once = new Set<string>();
        const invoke = (action: string, perform: () => void, injectedError: unknown): void => {
            const row = { action, originalReturned: false, injected: false, error: undefined as string | undefined };
            actions.push(row);
            try {
                perform();
                row.originalReturned = true;
            } catch (error) {
                row.error = String(error);
                throw error;
            }
            if (!once.has(action)) {
                once.add(action);
                row.injected = true;
                throw injectedError;
            }
        };
        adapter.updateEventListener = function () {
            invoke('updateEventListener', () => update.call(this), undefined);
        };
        candidate.off = function (this: PhysicsMaterial, ...args: any[]) {
            invoke('candidate.off', () => off.apply(this, args as any), null);
        } as typeof candidate.off;
        adapter.onDestroy = function () {
            invoke('adapter.onDestroy', () => destroy.call(this), 'adapter-cleanup-secondary');
        };
        // No direct callback, fake flags, manual component removal or swallowed native operation.
        // Original App.close owns scheduler/deferred/component destruction and its failure receipt.
        let close: any;
        try {
            closeAttempted = true;
            close = await app.close!();
        } finally {
            adapter.updateEventListener = update;
            adapter.onDestroy = destroy;
            candidate.off = off;
        }
        const report = inspectPhysicsMaterialCleanup(collider);
        const observations = fixture.observations(),
            after = world.diagnostics();
        fixture.checkpoint('original-app-close-cleanup-outcome', {
            close,
            actions,
            world: after,
            reporter: report
                ? {
                      consumed: report.consumed,
                      deliveryReturned: report.deliveryReturned,
                      errors: report.report?.errors.map((v) => ({
                          stage: v.stage,
                          type: typeof v.error,
                          value: String(v.error),
                      })),
                  }
                : null,
            owned: observations.beforeBindingDispose,
            loader: fixture.loader.diagnostics(),
        });
        check(
            'all three original cleanup operations returned before explicit injected throw',
            JSON.stringify(actions.filter((v) => v.injected).map((v) => v.action)) ===
                JSON.stringify(['updateEventListener', 'candidate.off', 'adapter.onDestroy']) &&
                actions.filter((v) => v.injected).every((v) => v.originalReturned),
            actions,
        );
        check(
            'post-unregister reporter retains first undefined and both secondary identities',
            !!report?.report &&
                report.report.hasFailure &&
                report.report.firstError === undefined &&
                report.report.errors.length === 3 &&
                report.report.errors[0].error === undefined &&
                report.report.errors[1].error === null &&
                report.report.errors[2].error === 'adapter-cleanup-secondary' &&
                report.deliveryReturned,
            {
                errors: report?.report?.errors.map((v) => ({
                    stage: v.stage,
                    type: typeof v.error,
                    value: String(v.error),
                })),
                deliveryReturned: report?.deliveryReturned,
            },
        );
        check(
            'App.close truthfully reports injected component cleanup failure rather than false release',
            close.status === 'failed' &&
                close.failures.length > 0 &&
                close.pending.includes('native-scene-destruction'),
            close,
        );
        check(
            'native preparation independently closed world and module',
            close.physicsPreparation.status === 'closed' &&
                close.physicsPreparation.acquired.every((v: any) => v.cleanup === 'released'),
            close.physicsPreparation,
        );
        check(
            'world retained original business zero after terminal native teardown',
            after.failure.hasFailure && after.failure.error === 0 && after.state === 'destroyed',
            { state: after.state, present: after.failure.hasFailure, error: String(after.failure.error) },
        );
        check(
            'exactly one actual native world destroy and no solver replay',
            observations.calls.filter((v: any) => v.name === 'destroyWorld' && v.returned).length === 1 &&
                observations.calls.filter((v: any) => v.name === 'step').length === 0,
            observations.calls.filter((v: any) => ['destroyWorld', 'step'].includes(v.name)),
        );
        check(
            'actual owned native core and bridge counters zero',
            observations.beforeBindingDispose?.coreBytes === '0' &&
                observations.beforeBindingDispose?.bridge.liveBytes === '0' &&
                observations.beforeBindingDispose?.bridge.liveAllocations === 0,
            observations.beforeBindingDispose,
        );
        check(
            'real loader disposed without observation errors',
            fixture.loader.diagnostics().status === 'DISPOSED' && observations.observationErrors.length === 0,
            fixture.loader.diagnostics(),
        );
        check(
            'public unified activation remains unavailable',
            !after.commandOwner.stagedCommandsSupported && !after.commandOwner.unifiedTransactionsSupported,
            after.commandOwner,
        );
    } catch (error) {
        failed = true;
        failure = error;
    } finally {
        if (app && !closeAttempted) {
            try {
                closeAttempted = true;
                fixture.checkpoint('fallback-close-after-earlier-failure', await app.close!());
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
    if (!failed && checks.some((v) => !v.pass)) {
        failed = true;
        failure = new Error(
            'App-close cleanup checks: ' +
                checks
                    .filter((v) => !v.pass)
                    .map((v) => v.id)
                    .join('; '),
        );
    }
    fixture.checkpoint('final-assertions', { checks, failure: failed ? String(failure) : null, failed });
    if (failed) {
        fixture.fail(failure);
        throw failure;
    }
    fixture.complete('PASS_LIMITED_MATERIAL_COLLIDER_CLOSE');
});
