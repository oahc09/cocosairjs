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
    complete(status: 'PASS_LIMITED_MATERIAL_BATCH_PREFLIGHT'): void;
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
test('all real native material preflight reads precede any setter', async () => {
    let app: AirApp | undefined, failed = false, failure: unknown;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual });
    try {
        registerBox3DFeature({ createLoader: () => fixture.loader });
        registerBox3DWorldAdapter(createBox3DWorldAdapter(selector, {
            collisionMask: (group) => PhysicsSystem.instance.collisionMatrix[group],
            sleepThreshold: () => PhysicsSystem.instance.sleepThreshold,
        }, undefined, { physicsSystem: () => PhysicsSystem.instance }));
        app = await createAirApp({ canvas: '#GameCanvas', renderMode: 3, physics: 'box3d', physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } } });
        game.pause(); const system = PhysicsSystem.instance, world = system.physicsWorld as Box3DPhysicsWorld;
        system.autoSimulation = false;
        const scene = new Scene('native-material-batch'); director.runSceneImmediate(scene); game.pause();
        for (let i = 0; i < 2; i++) { const n = new Node('inherited-' + i); n.setPosition(i * 4, 10, 0); n.addComponent(RigidBody); n.addComponent(BoxCollider); scene.addChild(n); }
        const binding = fixture.binding(), token = fixture.token(), shapes = fixture.shapes();
        const native = () => shapes.map((shape) => binding.getShapeMaterial(token, shape));
        const before = { native: native(), worldMaterial: world.diagnostics().material };
        const candidate = new PhysicsMaterial(); candidate.friction = 0.8;
        fixture.armNativeReadbackFailure();
        const refused = attempt(() => world.setDefaultMaterial(candidate));
        const observation = fixture.observations();
        check('second actual native preflight returned before explicit throw and no setter', shapes.length === 2 && refused.threw && refused.error?.code === 'EXPLICIT_SECOND_PREFLIGHT_FAILURE' && observation.injection.nativePreflightReads === 2 && observation.injection.nativeSetCalls === 0, { refused: errorView(refused), injection: observation.injection });
        check('preflight failure preserves both native values and world coefficient cache', JSON.stringify(native()) === JSON.stringify(before.native) && JSON.stringify(world.diagnostics().material) === JSON.stringify(before.worldMaterial), { before, after: { native: native(), worldMaterial: world.diagnostics().material } });
        check('no-effect refusal returns owner ready with all temporary scopes released', world.diagnostics().state === 'ready' && world.diagnostics().commandOwner.activeTemporaryScopes === 0, world.diagnostics());
        const success = attempt(() => world.setDefaultMaterial(candidate));
        check('next legitimate operation writes both real shapes exactly once', !success.threw && fixture.observations().injection.nativeSetCalls === 2 && native().every((v) => v.friction === Math.fround(0.8)), { success: errorView(success), native: native(), injection: fixture.observations().injection });
        check('no hidden step or unified activation', binding.stepDiagnostics(token).nativeStepIndex === 0 && !world.diagnostics().commandOwner.unifiedTransactionsSupported, world.diagnostics());
        fixture.checkpoint('native-batch-finite-verdict', { checks });
    } catch (error) { failed = true; failure = error; }
    finally {
        if (app) try { const close = await app.close!(), observations = fixture.observations(); check('actual App releases native preparation', close.status === 'released', close); check('core and bridge allocations zero', observations.beforeBindingDispose?.coreBytes === '0' && observations.beforeBindingDispose?.bridge.liveBytes === '0' && observations.beforeBindingDispose?.bridge.liveAllocations === 0, observations.beforeBindingDispose); fixture.checkpoint('native-batch-final-verdict', { checks, close }); } catch (error) { if (!failed) { failed = true; failure = error; } }
    }
    if (failed) { fixture.fail(failure); throw failure; }
    try { expect(checks.filter((c) => !c.pass)).toEqual([]); fixture.complete('PASS_LIMITED_MATERIAL_BATCH_PREFLIGHT'); } catch (error) { fixture.fail(error); throw error; }
});
