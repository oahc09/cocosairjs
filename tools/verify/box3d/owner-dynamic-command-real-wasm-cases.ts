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
import { createAirApp } from '../../../src/air/bootstrap';
import type { AirApp } from '../../../src/air/app';
import type { Box3DPhysicsWorld } from '../../../src/air/physics/box3d/world';
import type { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { RigidBody } from '../../../src/cocos/physics/framework/components/rigid-body';
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { ERigidBodyType } from '../../../src/cocos/physics/framework/physics-enum';
import { Vec3 } from '../../../src/cocos/core/math/vec3';
import { Node } from '../../../src/cocos/scene-graph/node';
import type { Scene } from '../../../src/cocos/scene-graph/scene';
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
    blocked(detail: unknown): void;
}
interface CaseEnvironment {
    fixture: Fixture;
    app: AirApp;
    system: PhysicsSystem;
    world: Box3DPhysicsWorld;
    scene: Scene;
    node: Node;
    body: RigidBody;
}
function attempt(action: () => void): { threw: boolean; error: unknown } {
    try {
        action();
        return { threw: false, error: undefined };
    } catch (error) {
        return { threw: true, error };
    }
}
function errorView(result: ReturnType<typeof attempt>) {
    return { threw: result.threw, error: String(result.error), code: (result.error as any)?.code ?? null };
}

/** Finite actual-source cases only. No owner, System, queue, native-method or lifecycle replacement. */
export async function runAdditionalCommandCase(environment: CaseEnvironment): Promise<boolean> {
    const { fixture, app, system, world, scene, node, body } = environment;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual });
    const near = (actual: number, expected: number) => Math.abs(actual - expected) < 1e-5;
    const velocity = () => {
        const value = new Vec3();
        body.getLinearVelocity(value);
        return [value.x, value.y, value.z];
    };
    const vectorNear = (expected: readonly number[]) =>
        velocity().every((value, index) => near(value, expected[index]));
    const native = () => fixture.binding().stepDiagnostics(fixture.token()).nativeStepIndex;
    const commandCalls = () =>
        fixture
            .observations()
            .calls.filter((call: any) => ['validateCommandBatch', 'applyCommandBatch', 'step'].includes(call.name));
    const batches = () => commandCalls().filter((call: any) => call.name === 'applyCommandBatch');
    const readyWithoutNative = () =>
        native() === 0 &&
        commandCalls().length === 0 &&
        world.diagnostics().state === 'ready' &&
        world.diagnostics().commandOwner.commandQueue.phase === 'ready' &&
        world.diagnostics().commandOwner.activeTemporaryScopes === 0;
    const recoveryStep = () => {
        system.step(0.1);
        check(
            'a fresh real recovery tick consumes retained original impulse exactly once',
            native() === 1 &&
                vectorNear([2, 0, 0]) &&
                world.diagnostics().commandOwner.pendingCommands === 0 &&
                world.diagnostics().commandOwner.commandQueue.completedTicks === 1 &&
                JSON.stringify(batches()[0]?.args[1].map((command: any) => command.kind)) ===
                    JSON.stringify(['linearImpulse']),
            { native: native(), velocity: velocity(), owner: world.diagnostics().commandOwner, batches: batches() },
        );
    };
    let alreadyClosed = false;
    try {
        if (fixture.expected === 'adapter-mixed-order') {
            const adapter = body.body!;
            body.applyImpulse(new Vec3(1, 0, 0));
            adapter.applyImpulse(new Vec3(2, 0, 0));
            adapter.applyLocalForce(new Vec3(0, 10, 0));
            body.applyForce(new Vec3(0, 0, 20));
            let hookCalls = 0;
            const hook = world.registerCommandHook(() => {
                ++hookCalls;
                adapter.applyForce(new Vec3(0, 0, 10));
            });
            check(
                'actual public component and exposed adapter commands are staged together',
                readyWithoutNative() && vectorNear([0, 0, 0]) && world.diagnostics().commandOwner.pendingCommands === 4,
                { owner: world.diagnostics().commandOwner, velocity: velocity(), calls: commandCalls() },
            );
            system.step(0.1);
            const packet = batches()[0]?.args[1];
            check(
                'mixed component, adapter and adapter-in-hook retain exact order in one real batch',
                native() === 1 &&
                    hookCalls === 1 &&
                    vectorNear([3, 1, 3]) &&
                    JSON.stringify(packet.map((command: any) => [command.kind, command.value, command.space])) ===
                        JSON.stringify([
                            ['linearImpulse', [1, 0, 0], 'world'],
                            ['linearImpulse', [2, 0, 0], 'world'],
                            ['force', [0, 10, 0], 'local'],
                            ['force', [0, 0, 20], 'world'],
                            ['force', [0, 0, 10], 'world'],
                        ]),
                {
                    native: native(),
                    hookCalls,
                    velocity: velocity(),
                    packet,
                    position: [node.position.x, node.position.y, node.position.z],
                },
            );
            hook.dispose();
            system.step(0.1);
            check(
                'mixed one-shot adapter and component commands do not replay on the next tick',
                native() === 2 && hookCalls === 1 && vectorNear([3, 1, 3]) && batches()[1]?.args[1].length === 0,
                { native: native(), hookCalls, velocity: velocity(), batches: batches() },
            );
        } else if (['disable-retains-pending', 'type-retains-pending'].includes(fixture.expected)) {
            const continuous = world.registerContinuousCommand(body, { force: { x: 0, y: 10, z: 0 } });
            body.applyImpulse(new Vec3(2, 0, 0));
            if (fixture.expected === 'disable-retains-pending') body.enabled = false;
            else body.type = ERigidBodyType.STATIC;
            check(
                'committed disable or type change retires continuous handle but preserves staged user command',
                continuous.disposed &&
                    world.diagnostics().commandOwner.pendingCommands === 1 &&
                    native() === 0 &&
                    commandCalls().length === 0,
                {
                    continuousDisposed: continuous.disposed,
                    enabled: body.enabled,
                    type: body.type,
                    owner: world.diagnostics().commandOwner,
                },
            );
            const rejected = attempt(() => system.step(0.1));
            check(
                'retained command against disabled or static actual source rejects before native mutation',
                rejected.threw && readyWithoutNative() && world.diagnostics().commandOwner.pendingCommands === 1,
                { rejected: errorView(rejected), owner: world.diagnostics().commandOwner, calls: commandCalls() },
            );
            const cancelled = world.cancelPendingCommands(body);
            check(
                'explicit cancellation remains available for the actual disabled or static source',
                cancelled === 1 && world.diagnostics().commandOwner.pendingCommands === 0 && readyWithoutNative(),
                { cancelled, owner: world.diagnostics().commandOwner },
            );
            if (fixture.expected === 'disable-retains-pending') body.enabled = true;
            else body.type = ERigidBodyType.DYNAMIC;
            system.step(0.1);
            check(
                'restoring actual dynamic body does not revive cancelled command or retired continuous producer',
                native() === 1 && vectorNear([0, 0, 0]) && batches()[0]?.args[1].length === 0 && continuous.disposed,
                { native: native(), velocity: velocity(), batches: batches(), owner: world.diagnostics().commandOwner },
            );
        } else if (fixture.expected === 'pause-explicit-resume') {
            let hookCalls = 0;
            const hook = world.registerCommandHook(() => {
                ++hookCalls;
                body.applyForce(new Vec3(0, 0, 10));
            });
            const continuous = world.registerContinuousCommand(body, { force: { x: 0, y: 10, z: 0 } });
            body.applyImpulse(new Vec3(2, 0, 0));
            system.enable = false;
            const rejected = attempt(() => system.step(0.1));
            system.syncSceneToPhysics();
            system.postUpdate(0.25);
            check(
                'pause clears user pending, disables continuous, preserves hook, and blocks native ticks',
                rejected.threw &&
                    native() === 0 &&
                    commandCalls().length === 0 &&
                    hookCalls === 0 &&
                    world.diagnostics().commandOwner.pendingCommands === 0 &&
                    !continuous.enabled &&
                    !continuous.disposed &&
                    hook.enabled &&
                    !hook.disposed,
                {
                    rejected: errorView(rejected),
                    hookCalls,
                    continuousEnabled: continuous.enabled,
                    owner: world.diagnostics().commandOwner,
                },
            );
            system.enable = true;
            system.step(0.1);
            check(
                'resume restores hook execution but never silently re-enables continuous or replays pending',
                native() === 1 &&
                    hookCalls === 1 &&
                    !continuous.enabled &&
                    vectorNear([0, 0, 1]) &&
                    batches()[0]?.args[1].length === 1,
                {
                    native: native(),
                    hookCalls,
                    continuousEnabled: continuous.enabled,
                    velocity: velocity(),
                    batches: batches(),
                },
            );
            continuous.enable();
            system.step(0.1);
            check(
                'explicit handle enable permits exactly one continuous contribution on the next tick',
                native() === 2 &&
                    hookCalls === 2 &&
                    continuous.enabled &&
                    vectorNear([0, 1, 2]) &&
                    batches()[1]?.args[1].length === 2,
                { native: native(), hookCalls, velocity: velocity(), batches: batches() },
            );
        } else if (fixture.expected === 'caught-rejection-abort') {
            const disabledNode = new Node('actual-disabled-command-source');
            disabledNode.setPosition(100, 10, 0);
            const disabledBody = disabledNode.addComponent(RigidBody);
            disabledBody.useGravity = false;
            disabledNode.addComponent(BoxCollider);
            scene.addChild(disabledNode);
            disabledBody.enabled = false;
            body.applyImpulse(new Vec3(2, 0, 0));
            let caught: unknown,
                didCatch = false,
                hookCalls = 0;
            const hook = world.registerCommandHook(() => {
                ++hookCalls;
                body.applyForce(new Vec3(0, 0, 100));
                try {
                    disabledBody.applyImpulse(new Vec3(100, 0, 0));
                } catch (error) {
                    caught = error;
                    didCatch = true;
                }
            });
            const rejected = attempt(() => system.step(0.1));
            check(
                'caught rejected actual-source submission still aborts the entire producer collection',
                rejected.threw &&
                    didCatch &&
                    rejected.error === caught &&
                    hookCalls === 1 &&
                    readyWithoutNative() &&
                    vectorNear([0, 0, 0]) &&
                    world.diagnostics().commandOwner.pendingCommands === 1,
                {
                    rejected: errorView(rejected),
                    caught: String(caught),
                    hookCalls,
                    owner: world.diagnostics().commandOwner,
                },
            );
            hook.dispose();
            recoveryStep();
        } else if (fixture.expected === 'thenable-abort') {
            body.applyImpulse(new Vec3(2, 0, 0));
            let hookCalls = 0,
                thenCalls = 0;
            const thenable = {
                then() {
                    ++thenCalls;
                },
            };
            const hook = world.registerCommandHook(() => {
                ++hookCalls;
                body.applyForce(new Vec3(0, 0, 100));
                return thenable;
            });
            const rejected = attempt(() => system.step(0.1));
            check(
                'thenable-return producer aborts synchronously without invoking then or committing provisional commands',
                rejected.threw &&
                    hookCalls === 1 &&
                    thenCalls === 0 &&
                    readyWithoutNative() &&
                    vectorNear([0, 0, 0]) &&
                    world.diagnostics().commandOwner.pendingCommands === 1,
                { rejected: errorView(rejected), hookCalls, thenCalls, owner: world.diagnostics().commandOwner },
            );
            hook.dispose();
            recoveryStep();
        } else if (fixture.expected === 'falsy-throw-abort') {
            body.applyImpulse(new Vec3(2, 0, 0));
            for (const thrown of [0, false, '', null, undefined]) {
                let hookCalls = 0;
                const hook = world.registerCommandHook(() => {
                    ++hookCalls;
                    body.applyForce(new Vec3(0, 0, 100));
                    throw thrown;
                });
                const rejected = attempt(() => system.step(0.1));
                check(
                    'falsy throw ' +
                        String(thrown) +
                        ' remains the original failure and leaves no provisional/native effects',
                    rejected.threw &&
                        Object.is(rejected.error, thrown) &&
                        hookCalls === 1 &&
                        readyWithoutNative() &&
                        vectorNear([0, 0, 0]) &&
                        world.diagnostics().commandOwner.pendingCommands === 1,
                    {
                        rejected: errorView(rejected),
                        thrown: String(thrown),
                        hookCalls,
                        owner: world.diagnostics().commandOwner,
                    },
                );
                hook.dispose();
            }
            recoveryStep();
        } else if (fixture.expected === 'cross-generation-adapter') {
            const retainedAdapter = body.body;
            check(
                'first actual generation owns a retained real adapter before close',
                !!retainedAdapter && native() === 0,
                {
                    hasRetainedAdapter: !!retainedAdapter,
                    native: native(),
                },
            );
            const close = await app.close!();
            alreadyClosed = true;
            check(
                'first actual generation closes successfully',
                close.status === 'released' && close.physicsPreparation?.status === 'closed',
                close,
            );
            let second: AirApp | undefined, secondError: unknown;
            try {
                second = await createAirApp({
                    canvas: '#GameCanvas',
                    renderMode: 3,
                    physics: 'box3d',
                    physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 } },
                });
            } catch (error) {
                secondError = error;
            }
            if (second) {
                await second.close!();
                throw new Error(
                    'Unexpected second AIR runtime admission requires a separately reviewed multi-world fixture; no cross-generation claim made.',
                );
            }
            check(
                'genuine second app attempt is refused by the current AIR lifecycle before a second owner exists',
                (secondError as any)?.code === 'AIR_E_APP_CLOSED' &&
                    fixture.observations().calls.filter((call: any) => call.name === 'createWorld' && call.returned)
                        .length === 1,
                {
                    error: String(secondError),
                    code: (secondError as any)?.code,
                    actualWorlds: fixture
                        .observations()
                        .calls.filter((call: any) => call.name === 'createWorld' && call.returned).length,
                },
            );
            fixture.checkpoint('cross-generation-blocked', { checks });
            expect(checks.filter((item) => !item.pass)).toEqual([]);
            fixture.blocked({
                action: 'Create a second genuine AIR app/World in the same realm after closing the first, then submit through the retained old adapter inside the new owner hook.',
                target: 'Actual createAirApp lifecycle and cross-generation adapter collection latch',
                reason: String(secondError),
                code: (secondError as any)?.code,
                completed:
                    'First genuine app, native world, RigidBody and adapter created; first app closed; real second createAirApp attempted and refused before a second native world.',
                outcome: 'BLOCKED; cross-generation latch behavior NOT_RUN, no reset or mock applied',
                formalCells: { total: 2128, status: 'NOT_RUN' },
            });
            return true;
        } else {
            throw new Error('Unknown finite fixture case ' + fixture.expected);
        }
        fixture.checkpoint('case-effects', {
            case: fixture.expected,
            checks,
            world: world.diagnostics(),
            native: native(),
            velocity: velocity(),
        });
        const close = await app.close!();
        alreadyClosed = true;
        const observations = fixture.observations();
        check(
            'actual app, producer registry and command owner close without remaining temporary scopes',
            close.status === 'released' &&
                close.physicsPreparation?.status === 'closed' &&
                world.diagnostics().commandOwner.systemControl.producers.closed &&
                world.diagnostics().commandOwner.activeTemporaryScopes === 0 &&
                fixture.loader.diagnostics().status === 'DISPOSED',
            { close, world: world.diagnostics(), loader: fixture.loader.diagnostics() },
        );
        check(
            'one native world teardown leaves zero tracked core and bridge bytes',
            observations.calls.filter((call: any) => call.name === 'destroyWorld' && call.returned).length === 1 &&
                observations.beforeBindingDispose?.coreBytes === '0' &&
                observations.beforeBindingDispose?.bridge?.liveBytes === '0',
            observations.beforeBindingDispose,
        );
        fixture.checkpoint('final-checks', {
            case: fixture.expected,
            checks,
            formalCells: { total: 2128, status: 'NOT_RUN' },
            scope: 'Finite actual owner internal candidate case; no browser, SDK/rebuild, target/teleport, full matrix or formal qualification.',
        });
        expect(checks.filter((item) => !item.pass)).toEqual([]);
        fixture.complete('PASS_LIMITED_DYNAMIC_COMMAND');
        return alreadyClosed;
    } catch (error) {
        fixture.checkpoint('additional-case-failed-checks', {
            case: fixture.expected,
            checks,
            alreadyClosed,
            error: String(error),
        });
        throw error;
    }
}
