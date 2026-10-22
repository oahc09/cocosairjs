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
    observations(): any;
    checkpoint(name: string, value: unknown): void;
    complete(status: 'PASS_LIMITED_SYSTEM_PAUSE'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_SYSTEM_PAUSE_FIXTURE__: Fixture;
const fixture = __BOX3D_SYSTEM_PAUSE_FIXTURE__;
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
test('actual AIR/System pause preserves scheduling truth on current real WASM', async () => {
    let app: AirApp | undefined,
        closed = false,
        failed = false,
        failure: unknown;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual });
    const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;
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
        const scene = new Scene('system-pause-real');
        director.runSceneImmediate(scene);
        game.pause();
        const node = new Node('moving-body');
        node.setPosition(0, 10, 0);
        const body = node.addComponent(RigidBody);
        body.useGravity = false;
        body.linearDamping = 0;
        body.angularDamping = 0;
        node.addComponent(BoxCollider);
        scene.addChild(node);
        body.setLinearVelocity(new Vec3(1, 0, 0));
        const native = () => fixture.binding().stepDiagnostics(fixture.token()).nativeStepIndex;
        const accumulator = () => (system as any)._accumulator as number;
        check(
            'current real world begins observed and unadvanced',
            native() === 0 && world.diagnostics().commandOwner.systemControl.observed,
            { native: native(), owner: world.diagnostics().commandOwner },
        );
        const invalid: any[] = [0, 1, null, undefined, {}, 'false'];
        for (const property of ['enable', 'autoSimulation'] as const) {
            const original = system[property];
            const results = invalid.map((value) =>
                view(
                    attempt(() => {
                        (system as any)[property] = value;
                    }),
                ),
            );
            check(
                property + ' strict booleans reject without cache/native/owner fault',
                results.every((v) => v.threw) &&
                    system[property] === original &&
                    native() === 0 &&
                    world.diagnostics().state === 'ready',
                { results, actual: system[property], native: native(), world: world.diagnostics().state },
            );
        }
        system.enable = false;
        const manual = attempt(() => system.step(1 / 60)),
            direct = attempt(() => world.step(1 / 60));
        check(
            'pause immediately rejects both actual manual entrances',
            manual.threw &&
                direct.threw &&
                native() === 0 &&
                world.diagnostics().commandOwner.systemControl.queuePhase === 'paused',
            { manual: view(manual), direct: view(direct), owner: world.diagnostics().commandOwner, native: native() },
        );
        const sync = attempt(() => system.postUpdate(0.25));
        check(
            'paused postUpdate permits scene preflight and preserves untouched backlog',
            !sync.threw && native() === 0 && accumulator() === 0,
            { sync: view(sync), native: native(), accumulator: accumulator() },
        );
        const second = new Node('paused-assembly');
        second.setPosition(0, 30, 0);
        const secondBody = second.addComponent(RigidBody);
        secondBody.useGravity = false;
        second.addComponent(BoxCollider);
        const assembly = attempt(() => scene.addChild(second));
        check(
            'paused actual component assembly adopts non-target body without late queue rejection',
            !assembly.threw && world.diagnostics().commandOwner.bodies === 2 && native() === 0,
            { assembly: view(assembly), owner: world.diagnostics().commandOwner, native: native() },
        );
        system.enable = true;
        const beforeX = node.position.x;
        system.step(1 / 60);
        check(
            'resume with autoSimulation false permits one real manual advancement and Node writeback',
            native() === 1 &&
                node.position.x > beforeX &&
                world.diagnostics().commandOwner.systemControl.queuePhase === 'ready',
            { native: native(), x: node.position.x, beforeX, owner: world.diagnostics().commandOwner },
        );
        system.fixedTimeStep = 0.1;
        system.maxSubSteps = 4;
        system.autoSimulation = true;
        let beforeEvents = 0,
            afterEvents = 0;
        const beforeEvent = () => ++beforeEvents,
            afterEvent = () => ++afterEvents;
        director.on(DirectorEvent.BEFORE_PHYSICS, beforeEvent);
        director.on(DirectorEvent.AFTER_PHYSICS, afterEvent);
        try {
            const pauseBefore = () => {
                system.enable = false;
            };
            director.once(DirectorEvent.BEFORE_PHYSICS, pauseBefore);
            system.postUpdate(0.25);
            check(
                'BEFORE pause stops real stepping after event and retains all added backlog',
                native() === 1 && near(accumulator(), 0.25) && beforeEvents === 1 && afterEvents === 1,
                { native: native(), accumulator: accumulator(), beforeEvents, afterEvents },
            );
            system.enable = true;
            system.postUpdate(0);
            check(
                'resume drains existing original backlog once without second accumulator',
                native() === 3 && near(accumulator(), 0.05),
                { native: native(), accumulator: accumulator() },
            );
            const oldStep = world.step;
            let between = 0;
            world.step = function (...args: Parameters<Box3DPhysicsWorld['step']>) {
                oldStep.apply(this, args);
                if (++between === 1) system.enable = false;
            };
            try {
                system.postUpdate(0.25);
            } finally {
                world.step = oldStep;
            }
            check(
                'explicit after-original-step callback pause prevents later ticks and keeps remaining backlog',
                between === 1 && native() === 4 && near(accumulator(), 0.2),
                { between, native: native(), accumulator: accumulator(), owner: world.diagnostics().commandOwner },
            );
            system.enable = true;
            system.autoSimulation = false;
            const backlog = accumulator();
            system.step(0.1);
            check(
                'autoSimulation false neither pauses owner nor consumes backlog during manual real step',
                native() === 5 &&
                    near(accumulator(), backlog) &&
                    world.diagnostics().commandOwner.systemControl.queuePhase === 'ready',
                { native: native(), accumulator: accumulator(), backlog, owner: world.diagnostics().commandOwner },
            );
            system.autoSimulation = true;
            director.once(DirectorEvent.BEFORE_PHYSICS, () => {
                system.autoSimulation = false;
            });
            system.postUpdate(0.1);
            check(
                'BEFORE autoSimulation false stops scheduled ticks without pausing or resetting backlog',
                native() === 5 &&
                    near(accumulator(), backlog + 0.1) &&
                    world.diagnostics().commandOwner.systemControl.queuePhase === 'ready',
                { native: native(), accumulator: accumulator(), owner: world.diagnostics().commandOwner },
            );
            system.autoSimulation = true;
            let betweenAuto = 0;
            world.step = function (...args: Parameters<Box3DPhysicsWorld['step']>) {
                oldStep.apply(this, args);
                if (++betweenAuto === 1) system.autoSimulation = false;
            };
            try {
                system.postUpdate(0);
            } finally {
                world.step = oldStep;
            }
            check(
                'between-tick autoSimulation false stops remaining automatic ticks but keeps owner ready',
                betweenAuto === 1 &&
                    native() === 6 &&
                    near(accumulator(), backlog) &&
                    world.diagnostics().commandOwner.systemControl.queuePhase === 'ready',
                { betweenAuto, native: native(), accumulator: accumulator(), owner: world.diagnostics().commandOwner },
            );
        } finally {
            director.off(DirectorEvent.BEFORE_PHYSICS, beforeEvent);
            director.off(DirectorEvent.AFTER_PHYSICS, afterEvent);
        }
        fixture.checkpoint('actual-pause-and-scheduling', {
            checks,
            world: world.diagnostics(),
            native: fixture.binding().stepDiagnostics(fixture.token()),
            position: [node.position.x, node.position.y, node.position.z],
        });
        system.enable = false;
        const close = await app.close!();
        closed = true;
        const obs = fixture.observations();
        check(
            'ordinary App.close succeeds even with paused queue and real components',
            close.status === 'closed' && close.physicsPreparation.status === 'closed',
            { close, world: world.diagnostics() },
        );
        check(
            'native teardown exactly once and both tracked allocators zero',
            obs.calls.filter((v: any) => v.name === 'destroyWorld' && v.returned).length === 1 &&
                obs.beforeBindingDispose?.coreBytes === '0' &&
                obs.beforeBindingDispose?.bridge?.liveBytes === '0',
            {
                beforeBindingDispose: obs.beforeBindingDispose,
                destroyCalls: obs.calls.filter((v: any) => v.name === 'destroyWorld'),
            },
        );
        check(
            'closing unregisters System control and leaves no temporary ownership',
            !world.diagnostics().commandOwner.systemControl.observed &&
                world.diagnostics().commandOwner.systemControl.unresolvedScopes === 0 &&
                world.diagnostics().commandOwner.activeTemporaryScopes === 0 &&
                fixture.loader.diagnostics().status === 'DISPOSED',
            { owner: world.diagnostics().commandOwner, loader: fixture.loader.diagnostics() },
        );
        check(
            'capabilities remain explicitly unqualified',
            world.diagnostics().commandOwner.stagedCommandsSupported === false &&
                world.diagnostics().commandOwner.unifiedTransactionsSupported === false &&
                world.diagnostics().commandOwner.systemControl.producers === 'NOT_INTEGRATED',
            world.diagnostics().commandOwner,
        );
        fixture.checkpoint('final-checks', {
            checks,
            scope: 'Finite real-WASM pause cases only. Producer-owner, target grants, browser, T12 and all 2128 formal cells remain unqualified.',
        });
        expect(checks.filter((v) => !v.pass)).toEqual([]);
        fixture.complete('PASS_LIMITED_SYSTEM_PAUSE');
    } catch (error) {
        failed = true;
        failure = error;
        fixture.checkpoint('failed-checks', { checks });
        fixture.fail(error);
        throw error;
    } finally {
        if (app && !closed) {
            try {
                const close = await app.close!();
                fixture.checkpoint('finally-app-close', close);
            } catch (error) {
                fixture.checkpoint('finally-close-error', {
                    message: String(error),
                    originalFailure: failed ? String(failure) : null,
                });
            }
        }
    }
});
