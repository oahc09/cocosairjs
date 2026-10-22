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
import { director, game, DirectorEvent } from '../../../src/cocos/game';
import type { Box3DSTLoader } from '../../../src/air/physics/box3d/loader/st-loader.mjs';
import type { Box3DFoundation, Box3DWorld } from '../../../src/air/physics/box3d/binding/facade.mjs';
interface Fixture {
    loader: Box3DSTLoader;
    expected: string;
    binding(): Box3DFoundation;
    token(): Box3DWorld;
    shapes(): import('../../../src/air/physics/box3d/binding/facade.mjs').Box3DId[];
    observations(): any;
    checkpoint(name: string, value: unknown): void;
    complete(status: 'PASS_LIMITED_SHARED_MATERIAL'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_SHARED_MATERIAL_FIXTURE__: Fixture;
const fixture = __BOX3D_SHARED_MATERIAL_FIXTURE__;
const attempt = (action: () => void) => {
    try {
        action();
        return { threw: false, error: undefined as any };
    } catch (error) {
        return { threw: true, error };
    }
};
const view = (v: ReturnType<typeof attempt>) => ({
    threw: v.threw,
    message: String(v.error),
    code: v.error?.code ?? null,
});
test('actual shared PhysicsMaterial contract before private-lane implementation', async () => {
    let app: AirApp | undefined, asset: PhysicsMaterial | undefined, failed = false, failure: unknown;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual });
    try {
        registerBox3DFeature({ createLoader: () => fixture.loader });
        registerBox3DWorldAdapter(createBox3DWorldAdapter(selector, {
            collisionMask: (group) => PhysicsSystem.instance.collisionMatrix[group],
            sleepThreshold: () => PhysicsSystem.instance.sleepThreshold,
        }, undefined, { physicsSystem: () => PhysicsSystem.instance }));
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3, physics: 'box3d',
            physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } } });
        game.pause();
        const system = PhysicsSystem.instance, world = system.physicsWorld as Box3DPhysicsWorld;
        system.autoSimulation = false;
        const scene = new Scene('shared-material-' + fixture.expected);
        director.runSceneImmediate(scene); game.pause();
        asset = new PhysicsMaterial(); asset.friction = 0.3;
        const binding = fixture.binding(), token = fixture.token();
        const notifications: unknown[] = [];
        if (fixture.expected === 'notification-order') asset.on(PhysicsMaterial.EVENT_UPDATE, () => {
            notifications.push(fixture.shapes().map((shape) => binding.getShapeMaterial(token, shape)));
        });
        const colliders: BoxCollider[] = [];
        for (let i = 0; i < 2; i++) {
            const node = new Node('shared-consumer-' + i); node.setPosition(i * 4, 10, 0);
            node.addComponent(RigidBody); const collider = node.addComponent(BoxCollider);
            collider.sharedMaterial = asset; scene.addChild(node); colliders.push(collider);
        }
        const shapes = fixture.shapes(), materials = () => shapes.map((shape) => binding.getShapeMaterial(token, shape));
        check('two actual active native shapes share exact asset identity', shapes.length === 2 && colliders.every((c) => c.sharedMaterial === asset), { shapes: shapes.length, materials: materials() });
        const before = { friction: asset.friction, materials: materials(), flags: (asset as any)._objFlags };
        let result: ReturnType<typeof attempt>;
        if (fixture.expected === 'invalid-negative') {
            result = attempt(() => { asset!.friction = -1; });
            check('invalid owned coefficient refused before actual asset cache changes', result.threw && asset.friction === before.friction, { result: view(result), before, actual: asset.friction, native: materials(), owner: world.diagnostics() });
        } else if (fixture.expected === 'detach-public') {
            asset.removeAll(PhysicsMaterial.EVENT_UPDATE);
            result = attempt(() => { asset!.friction = 0.8; });
            const native = materials();
            check('public notification removal cannot detach physical propagation', !result.threw && native.every((m) => m.friction === Math.fround(0.8)), { result: view(result), native, actual: asset.friction, owner: world.diagnostics() });
        } else if (fixture.expected === 'owned-destroy') {
            let returned: boolean | undefined;
            result = attempt(() => { returned = asset!.destroy(); });
            check('still-owned asset destroy refuses before deferred flags and registry mutation', result.threw && (asset as any)._objFlags === before.flags && PhysicsMaterial.allMaterials.includes(asset), { result: view(result), returned, beforeFlags: before.flags, actualFlags: (asset as any)._objFlags, remainsRegistered: PhysicsMaterial.allMaterials.includes(asset), native: materials(), owner: world.diagnostics() });
        } else {
            result = attempt(() => { asset!.friction = 0.8; });
            const observed = notifications as {friction: number; restitution: number}[][];
            check('public listener registered first sees all physical propagation already completed', !result.threw && observed.length === 1 && observed[0].every((m) => m.friction === Math.fround(0.8)), { result: view(result), notifications, actual: asset.friction, finalNative: materials(), owner: world.diagnostics() });
        }
        check('no hidden physics step or unified activation', binding.stepDiagnostics(token).nativeStepIndex === 0 && !world.diagnostics().commandOwner.unifiedTransactionsSupported, world.diagnostics());
        fixture.checkpoint('source-contract-verdict-before-close', { expected: fixture.expected, checks });
    } catch (error) { failed = true; failure = error; }
    finally {
        if (app) {
            try {
                const close = await app.close!(), observations = fixture.observations();
                check('actual App close releases native preparation', close.status === 'released', close);
                check('actual core and bridge allocations reach zero', observations.beforeBindingDispose?.coreBytes === '0' && observations.beforeBindingDispose?.bridge.liveBytes === '0' && observations.beforeBindingDispose?.bridge.liveAllocations === 0, observations.beforeBindingDispose);
                fixture.checkpoint('source-contract-final-verdict', { expected: fixture.expected, checks, close });
            } catch (error) { if (!failed) { failed = true; failure = error; } }
        }
        try { asset?.destroy(); } catch (error) { fixture.checkpoint('post-close-asset-cleanup-error', { error: String(error) }); }
    }
    if (failed) { fixture.fail(failure); throw failure; }
    try { expect(checks.filter((x) => !x.pass)).toEqual([]); fixture.complete('PASS_LIMITED_SHARED_MATERIAL'); }
    catch (error) { fixture.fail(error); throw error; }
});
