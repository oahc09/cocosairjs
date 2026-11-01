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
import { runAdditionalCommandCase } from './owner-dynamic-command-real-wasm-cases';
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
import { director, game } from '../../../src/cocos/game';
import type { CommandContext } from '../../../src/air/physics/box3d/command-queue';
import type { Box3DSTLoader } from '../../../src/air/physics/box3d/loader/st-loader.mjs';
import type { Box3DFoundation, Box3DWorld } from '../../../src/air/physics/box3d/binding/facade.mjs';

interface Fixture {
    loader: Box3DSTLoader;
    expected: string;
    binding(): Box3DFoundation;
    token(): Box3DWorld;
    observations(): any;
    checkpoint(name: string, value: unknown): void;
    complete(status: 'PASS_LIMITED_DYNAMIC_COMMAND'): void;
    fail(error: unknown): void;
    blocked(detail: unknown): void;
}
declare const __BOX3D_DYNAMIC_COMMAND_FIXTURE__: Fixture;
const fixture = __BOX3D_DYNAMIC_COMMAND_FIXTURE__;

test('actual AIR owner collects public and continuous dynamic commands into existing real N4 WASM', async () => {
    let app: AirApp | undefined,
        closed = false;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual });
    const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-5;
    const vectorNear = (actual: readonly number[], expected: readonly number[]) =>
        actual.length === expected.length && actual.every((value, index) => near(value, expected[index]));
    const commandCalls = () =>
        fixture
            .observations()
            .calls.filter((call: any) => ['validateCommandBatch', 'applyCommandBatch', 'step'].includes(call.name));
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
        const scene = new Scene('dynamic-command-real');
        director.runSceneImmediate(scene);
        game.pause();
        const node = new Node('actual-dynamic-body');
        node.setPosition(0, 10, 0);
        const body = node.addComponent(RigidBody);
        body.mass = 1;
        body.useGravity = false;
        body.linearDamping = 0;
        body.angularDamping = 0;
        node.addComponent(BoxCollider);
        scene.addChild(node);
        const native = () => fixture.binding().stepDiagnostics(fixture.token()).nativeStepIndex;
        const velocity = () => {
            const value = new Vec3();
            body.getLinearVelocity(value);
            return [value.x, value.y, value.z];
        };
        const position = () => [node.position.x, node.position.y, node.position.z];
        if (fixture.expected !== 'two-tick-dynamic') {
            closed = await runAdditionalCommandCase({ fixture, app, system, world, scene, node, body });
            return;
        }
        const contexts: CommandContext[] = [];
        const frozenContexts: boolean[] = [];
        const hook = world.registerCommandHook((context) => {
            contexts.push({ ...context });
            frozenContexts.push(Object.isFrozen(context));
            body.applyForce(new Vec3(0, 0, 20));
        });
        const continuous = world.registerContinuousCommand(body, { force: { x: 0, y: 10, z: 0 } });
        check(
            'actual components and actual producer registrations begin without native advancement',
            native() === 0 &&
                world.diagnostics().commandOwner.bodies === 1 &&
                world.diagnostics().commandOwner.components === 2 &&
                world.diagnostics().commandOwner.dynamicCommandCandidate &&
                world.diagnostics().commandOwner.systemControl.producers.enabledProducers === 2 &&
                contexts.length === 0 &&
                vectorNear(velocity(), [0, 0, 0]),
            { native: native(), owner: world.diagnostics().commandOwner, velocity: velocity(), contexts },
        );
        body.applyImpulse(new Vec3(2, 0, 0));
        check(
            'public impulse is staged without immediate velocity or native batch mutation',
            native() === 0 &&
                world.diagnostics().commandOwner.pendingCommands === 1 &&
                vectorNear(velocity(), [0, 0, 0]) &&
                commandCalls().length === 0 &&
                contexts.length === 0,
            { native: native(), velocity: velocity(), owner: world.diagnostics().commandOwner, calls: commandCalls() },
        );
        system.syncSceneToPhysics();
        system.postUpdate(0.25);
        check(
            'no-tick scene sync and autoSimulation false postUpdate invoke no producer or command batch',
            native() === 0 &&
                contexts.length === 0 &&
                commandCalls().length === 0 &&
                world.diagnostics().commandOwner.pendingCommands === 1 &&
                vectorNear(velocity(), [0, 0, 0]),
            { native: native(), velocity: velocity(), contexts, calls: commandCalls() },
        );
        fixture.checkpoint('before-first-real-step', { checks, world: world.diagnostics(), position: position() });
        const dt = 0.1;
        const firstPosition = position();
        system.step(dt);
        const firstCalls = commandCalls();
        const firstBatch = firstCalls.find((call: any) => call.name === 'applyCommandBatch');
        check(
            'first System step invokes one hook and one native validate-apply-step sequence',
            native() === 1 &&
                contexts.length === 1 &&
                JSON.stringify(firstCalls.map((call: any) => call.name)) ===
                    JSON.stringify(['validateCommandBatch', 'applyCommandBatch', 'step']) &&
                firstCalls.every((call: any) => call.returned),
            { native: native(), contexts: [...contexts], calls: firstCalls },
        );
        check(
            'first committed batch has one user impulse and two producer forces',
            JSON.stringify(firstBatch?.args[1].map((command: any) => command.kind)) ===
                JSON.stringify(['linearImpulse', 'force', 'force']) &&
                firstBatch?.result.executedOperationCount === 3 &&
                world.diagnostics().commandOwner.pendingCommands === 0 &&
                world.diagnostics().commandOwner.commandQueue.completedTicks === 1,
            {
                batch: firstBatch,
                owner: world.diagnostics().commandOwner,
                lastCommand: world.diagnostics().lastCommand,
            },
        );
        check(
            'first native command effects reach actual public velocity and Node writeback',
            vectorNear(velocity(), [2, 1, 2]) &&
                position().every((value, index) => value > firstPosition[index]) &&
                world.diagnostics().state === 'ready',
            { velocity: velocity(), beforePosition: firstPosition, position: position(), world: world.diagnostics() },
        );
        fixture.checkpoint('after-first-real-step', {
            checks,
            native: native(),
            velocity: velocity(),
            position: position(),
        });
        const secondPosition = position();
        system.step(dt);
        const allCalls = commandCalls();
        const secondCalls = allCalls.slice(firstCalls.length);
        const secondBatch = secondCalls.find((call: any) => call.name === 'applyCommandBatch');
        check(
            'second System step advances exactly once with one new hook invocation',
            native() === 2 &&
                contexts.length === 2 &&
                JSON.stringify(secondCalls.map((call: any) => call.name)) ===
                    JSON.stringify(['validateCommandBatch', 'applyCommandBatch', 'step']) &&
                secondCalls.every((call: any) => call.returned),
            { native: native(), contexts: [...contexts], calls: secondCalls },
        );
        check(
            'second batch contains only repeated forces and never replays the accepted impulse',
            JSON.stringify(secondBatch?.args[1].map((command: any) => command.kind)) ===
                JSON.stringify(['force', 'force']) &&
                secondBatch?.result.executedOperationCount === 2 &&
                vectorNear(velocity(), [2, 2, 4]) &&
                position().every((value, index) => value > secondPosition[index]) &&
                world.diagnostics().commandOwner.commandQueue.completedTicks === 2,
            { batch: secondBatch, velocity: velocity(), beforePosition: secondPosition, position: position() },
        );
        check(
            'hook contexts are immutable owner contexts for the two completed ticks',
            frozenContexts.every(Boolean) &&
                contexts[0]?.tickIndex === 1 &&
                contexts[1]?.tickIndex === 2 &&
                contexts.every((context) => near(context.fixedDt, dt) && context.solverSubSteps === 4),
            { contexts, frozenContexts },
        );
        body.applyImpulse(new Vec3(100, 0, 0));
        const cancelled = world.cancelPendingCommands(body);
        check(
            'actual component cancellation removes exactly one new staged impulse without native effects',
            cancelled === 1 &&
                world.diagnostics().commandOwner.pendingCommands === 0 &&
                native() === 2 &&
                vectorNear(velocity(), [2, 2, 4]),
            { cancelled, native: native(), velocity: velocity(), owner: world.diagnostics().commandOwner },
        );
        system.syncSceneToPhysics();
        system.postUpdate(0.25);
        check(
            'post-step no-tick sync does not invoke producers or consume another native step',
            native() === 2 && contexts.length === 2 && commandCalls().length === 6,
            { native: native(), contexts, calls: commandCalls() },
        );
        check(
            'finite integration does not promote package-wide staged or unified capability',
            world.diagnostics().commandOwner.stagedCommandsSupported === false &&
                world.diagnostics().commandOwner.unifiedTransactionsSupported === false &&
                world.diagnostics().commandOwner.activeTemporaryScopes === 0,
            world.diagnostics().commandOwner,
        );
        fixture.checkpoint('after-two-real-steps', {
            checks,
            world: world.diagnostics(),
            native: fixture.binding().stepDiagnostics(fixture.token()),
            velocity: velocity(),
            position: position(),
        });
        const close = await app.close!();
        closed = true;
        const observations = fixture.observations();
        check(
            'ordinary App.close releases the actual World and producer handles',
            close.status === 'released' &&
                close.physicsPreparation?.status === 'closed' &&
                hook.disposed &&
                continuous.disposed &&
                world.diagnostics().commandOwner.systemControl.producers.closed &&
                world.diagnostics().commandOwner.systemControl.producers.liveProducers === 0,
            { close, hookDisposed: hook.disposed, continuousDisposed: continuous.disposed, world: world.diagnostics() },
        );
        check(
            'native teardown happens exactly once with zero tracked core and bridge allocations',
            observations.calls.filter((call: any) => call.name === 'destroyWorld' && call.returned).length === 1 &&
                observations.beforeBindingDispose?.coreBytes === '0' &&
                observations.beforeBindingDispose?.bridge?.liveBytes === '0' &&
                fixture.loader.diagnostics().status === 'DISPOSED',
            { beforeBindingDispose: observations.beforeBindingDispose, loader: fixture.loader.diagnostics() },
        );
        fixture.checkpoint('final-checks', {
            checks,
            formalCells: { total: 2128, status: 'NOT_RUN' },
            scope: 'Finite actual owner/System dynamic commands through explicit test-adapter internal candidate only; not public feature installation. No new native compilation, SDK/browser, target/teleport, torque/clear matrix, full Gate or formal qualification.',
        });
        expect(checks.filter((item) => !item.pass)).toEqual([]);
        fixture.complete('PASS_LIMITED_DYNAMIC_COMMAND');
    } catch (error) {
        fixture.checkpoint('failed-checks', { checks });
        fixture.fail(error);
        throw error;
    } finally {
        if (app && !closed) {
            try {
                fixture.checkpoint('finally-app-close', await app.close!());
            } catch (error) {
                fixture.checkpoint('finally-close-error', { message: String(error) });
            }
        }
    }
});
