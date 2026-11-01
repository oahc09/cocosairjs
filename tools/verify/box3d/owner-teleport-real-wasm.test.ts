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
/* Context-reconstructed test source after executor replacement. Original per-file SHA is unavailable.
 * This source is NOT historical test evidence. It must be freshly qualified in the restored repo. */
import '../../../src/exports/base';
import { createAirApp } from '../../../src/air/bootstrap';
import type { AirApp } from '../../../src/air/app';
import { registerBox3DFeature, registerBox3DWorldAdapter } from '../../../src/air/physics/box3d/prepare';
import { createBox3DWorldAdapter } from '../../../src/air/physics/box3d/registration';
import { Box3DPhysicsWorld } from '../../../src/air/physics/box3d/world';
import { PhysicsSystem } from '../../../src/cocos/physics/framework/physics-system';
import { RigidBody } from '../../../src/cocos/physics/framework/components/rigid-body';
import { BoxCollider } from '../../../src/cocos/physics/framework/components/colliders/box-collider';
import { ERigidBodyType } from '../../../src/cocos/physics/framework/physics-enum';
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
    bodies(): Box3DId[];
    observations(): any;
    checkpoint(name: string, value: unknown): void;
    complete(status: 'PASS_LIMITED_TELEPORT'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_TELEPORT_FIXTURE__: Fixture;
const fixture = __BOX3D_TELEPORT_FIXTURE__;
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-5;
const vector = (a: readonly number[] | undefined, b: readonly number[]) =>
    !!a && a.length === b.length && a.every((value, index) => near(value, b[index]));
function attempt(fn: () => void) {
    try {
        fn();
        return { threw: false, error: undefined as unknown };
    } catch (error) {
        return { threw: true, error };
    }
}
function failure(result: ReturnType<typeof attempt>) {
    return { threw: result.threw, error: String(result.error), code: (result.error as any)?.code ?? null };
}
test('finite internal teleport reaches actual N4 command apply, unique step and actual Node writeback', async () => {
    let app: AirApp | undefined,
        closed = false;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) =>
        checks.push({
            id,
            pass,
            actual: JSON.parse(
                JSON.stringify(actual, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
            ),
        });
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
        const scene = new Scene('teleport-' + fixture.expected);
        director.runSceneImmediate(scene);
        game.pause();
        const node = new Node('actual-teleport-source');
        node.setPosition(0, 10, 0);
        const body = node.addComponent(RigidBody);
        body.mass = 1;
        body.useGravity = false;
        body.linearDamping = 0;
        body.angularDamping = 0;
        if (fixture.expected.includes('kinematic-preserve')) body.type = ERigidBodyType.KINEMATIC;
        const collider = node.addComponent(BoxCollider);
        collider.center = new Vec3(1, 0.5, 0);
        scene.addChild(node);
        const binding = fixture.binding(),
            token = fixture.token(),
            id = fixture.bodies()[0];
        const native = () => binding.stepDiagnostics(token).nativeStepIndex;
        const state = () => binding.bodyState(token, id);
        const nativePose = () => Array.from(binding.bodyTransforms(token, [id])).slice(0, 7);
        const nodePose = () => {
            const p = node.worldPosition,
                q = node.worldRotation;
            return [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
        };
        const calls = () =>
            fixture
                .observations()
                .calls.filter((call: any) => ['validateCommandBatch', 'applyCommandBatch', 'step'].includes(call.name));
        const batches = () => calls().filter((call: any) => call.name === 'applyCommandBatch');
        const pending = () => world.diagnostics().commandOwner.pendingCommands;
        const events: any[] = [];
        const listener = (flags: number) =>
            events.push({
                flags,
                native: native(),
                node: nodePose(),
                commands: calls().map((call: any) => ({ name: call.name, returned: call.returned })),
            });
        node.on(Node.EventType.TRANSFORM_CHANGED, listener);
        const pose = { position: { x: 3, y: 12, z: -1 }, rotation: { x: 0, y: 0, z: 2, w: 2 } };
        const resetPose = [3, 12, -1, 0, 0, Math.SQRT1_2, Math.SQRT1_2];
        const nativeDisabled = fixture.expected.startsWith('native-disabled-');
        const disabled = nativeDisabled || fixture.expected.startsWith('disabled-');
        const invalid = fixture.expected.startsWith('invalid-');
        let expectedKinds: string[] = [],
            expectedV = [0, 0, 0],
            expectedW = [0, 0, 0];
        let expectedF = [0, 0, 0],
            expectedT = [0, 0, 0],
            expectedPreserve = false,
            expectedWake = true;
        if (fixture.expected === 'invalid-getter-cancel') {
            body.applyImpulse(new Vec3(2, 0, 0));
            const baseline = { pending: pending(), state: state(), pose: nativePose(), node: nodePose() };
            let nested: ReturnType<typeof attempt> | undefined;
            const hostilePose = {
                get position() {
                    nested = attempt(() => {
                        world.cancelPendingCommands(body);
                    });
                    return pose.position;
                },
                rotation: pose.rotation,
            };
            const outer = attempt(() => world.teleportRigidBody(body, hostilePose));
            check(
                'caught cancel getter still aborts outer teleport and retains original impulse',
                outer.threw &&
                    !!nested?.threw &&
                    outer.error === nested.error &&
                    pending() === 1 &&
                    native() === 0 &&
                    calls().length === 0 &&
                    vector(nativePose(), baseline.pose) &&
                    vector(nodePose(), baseline.node) &&
                    JSON.stringify(state()) === JSON.stringify(baseline.state),
                {
                    outer: failure(outer),
                    nested: nested ? failure(nested) : null,
                    baseline,
                    pending: pending(),
                    state: state(),
                    calls: calls(),
                },
            );
            fixture.checkpoint('caught-cancel-getter-effects', {
                checks,
                outer: failure(outer),
                nested: nested ? failure(nested) : null,
                world: world.diagnostics(),
            });
            if (outer.threw) {
                system.syncSceneToPhysics();
                check(
                    'no-tick sync after rejected cancel getter retains original queue',
                    native() === 0 && calls().length === 0 && pending() === 1,
                    { native: native(), pending: pending(), calls: calls() },
                );
                system.step(0.1);
                check(
                    'fresh actual tick consumes only the retained original impulse',
                    native() === 1 &&
                        pending() === 0 &&
                        JSON.stringify(batches()[0]?.args[1].map((command: any) => command.kind)) ===
                            JSON.stringify(['linearImpulse']) &&
                        vector(state().linearVelocity, [2, 0, 0]),
                    { native: native(), pending: pending(), state: state(), batches: batches() },
                );
                system.step(0.1);
                check(
                    'retained impulse never replays on following tick',
                    native() === 2 && batches()[1]?.args[1].length === 0 && vector(state().linearVelocity, [2, 0, 0]),
                    { native: native(), state: state(), batches: batches() },
                );
            }
            node.off(Node.EventType.TRANSFORM_CHANGED, listener);
            const close = await app.close!();
            closed = true;
            const observations = fixture.observations();
            check(
                'cancel-getter case closes actual app with zero native allocations',
                close.status === 'released' &&
                    close.physicsPreparation?.status === 'closed' &&
                    observations.beforeBindingDispose?.coreBytes === '0' &&
                    observations.beforeBindingDispose?.bridge?.liveBytes === '0' &&
                    fixture.loader.diagnostics().status === 'DISPOSED',
                { close, beforeBindingDispose: observations.beforeBindingDispose },
            );
            fixture.checkpoint('final-checks', {
                case: fixture.expected,
                checks,
                formalCells: { total: 2128, status: 'NOT_RUN' },
                gates: { total: 9, status: 'NOT_RUN' },
            });
            expect(checks.filter((item) => !item.pass)).toEqual([]);
            fixture.complete('PASS_LIMITED_TELEPORT');
            return;
        }
        if (nativeDisabled) {
            body.setLinearVelocity(new Vec3(1, 2, 3));
            body.setAngularVelocity(new Vec3(0.1, 0.2, 0.3));
            body.enabled = false;
            collider.enabled = false;
            const committed = state();
            check(
                'native-disabled precondition is observed before teleport submission',
                committed.enabled === false &&
                    committed.awake === false &&
                    body.enabled === false &&
                    collider.enabled === false,
                committed,
            );
            fixture.checkpoint('native-disabled-before-submission', {
                state: committed,
                node: nodePose(),
                nativePose: nativePose(),
            });
            expectedPreserve = fixture.expected === 'native-disabled-kinematic-preserve';
            if (expectedPreserve) {
                expectedV = [...committed.linearVelocity];
                expectedW = [...committed.angularVelocity];
            }
            world.teleportRigidBody(body, pose, expectedPreserve ? { preserveVelocity: true } : undefined);
            expectedKinds = ['reset'];
        } else if (fixture.expected === 'disabled-dynamic-clear') {
            body.setLinearVelocity(new Vec3(2, 3, 4));
            body.setAngularVelocity(new Vec3(0.1, 0.2, 0.3));
            body.sleep();
            body.enabled = false;
            world.teleportRigidBody(body, pose);
            expectedKinds = ['reset'];
        } else if (fixture.expected === 'disabled-kinematic-preserve') {
            body.setLinearVelocity(new Vec3(1, 2, 3));
            body.setAngularVelocity(new Vec3(0.1, 0.2, 0.3));
            body.sleep();
            body.enabled = false;
            const committed = state();
            expectedV = [...committed.linearVelocity];
            expectedW = [...committed.angularVelocity];
            world.teleportRigidBody(body, pose, { preserveVelocity: true });
            expectedPreserve = true;
            expectedKinds = ['reset'];
        } else if (fixture.expected === 'enabled-default-order') {
            body.sleep();
            body.applyImpulse(new Vec3(2, 0, 0));
            world.teleportRigidBody(body, pose);
            body.applyImpulse(new Vec3(0, 3, 0));
            expectedKinds = ['linearImpulse', 'reset', 'linearImpulse'];
            expectedV = [0, 3, 0];
        } else if (fixture.expected === 'enabled-preserve-forces') {
            expectedV = [1, 2, 3];
            expectedW = [0, 0, 0.5];
            expectedF = [10, 10, 0];
            expectedT = [0, 0, 2];
            body.setLinearVelocity(new Vec3(...expectedV));
            body.setAngularVelocity(new Vec3(...expectedW));
            body.applyForce(new Vec3(10, 0, 0));
            body.applyTorque(new Vec3(0, 0, 2));
            world.teleportRigidBody(body, pose, { preserveVelocity: true, wake: false });
            body.applyLocalForce(new Vec3(10, 0, 0));
            expectedPreserve = true;
            expectedWake = false;
            expectedKinds = ['force', 'torque', 'reset', 'force'];
        } else if (fixture.expected === 'enabled-wake-false') {
            body.sleep();
            world.teleportRigidBody(body, pose, { wake: false });
            expectedWake = false;
            expectedKinds = ['reset'];
        } else if (invalid) {
            body.applyImpulse(new Vec3(2, 0, 0));
            world.teleportRigidBody(body, pose);
            expectedKinds = ['linearImpulse', 'reset'];
            const baseline = { state: state(), nativePose: nativePose(), node: nodePose(), pending: pending() };
            const rejected: any[] = [];
            const tryRejected = (label: string, fn: () => void) => {
                const result = attempt(fn);
                rejected.push({ label, ...failure(result), pending: pending(), state: state(), node: nodePose() });
                check(
                    label + ' rejects without cancellation or native mutation',
                    result.threw &&
                        pending() === baseline.pending &&
                        native() === 0 &&
                        calls().length === 0 &&
                        vector(nativePose(), baseline.nativePose) &&
                        vector(nodePose(), baseline.node) &&
                        JSON.stringify(state()) === JSON.stringify(baseline.state),
                    rejected[rejected.length - 1],
                );
                return result;
            };
            if (fixture.expected === 'invalid-quaternion') {
                for (const q of [
                    { x: 0, y: 0, z: 0, w: 0 },
                    { x: NaN, y: 0, z: 0, w: 1 },
                    { x: 0, y: Infinity, z: 0, w: 1 },
                ])
                    tryRejected('invalid quaternion ' + JSON.stringify(q), () =>
                        world.teleportRigidBody(body, { position: pose.position, rotation: q }),
                    );
            } else if (fixture.expected === 'invalid-options') {
                for (const options of [null, 1, 'x', { preserveVelocity: 1 }, { wake: 'yes' }])
                    tryRejected('invalid options ' + JSON.stringify(options), () =>
                        world.teleportRigidBody(body, pose, options as any),
                    );
            } else if (fixture.expected === 'invalid-getter') {
                const original = new Error('original pose getter failure');
                const throwingPose = {
                    get position(): any {
                        throw original;
                    },
                    rotation: pose.rotation,
                };
                const poseFailure = tryRejected('throwing pose getter', () =>
                    world.teleportRigidBody(body, throwingPose),
                );
                check(
                    'original thrown pose getter identity survives',
                    poseFailure.error === original,
                    failure(poseFailure),
                );
                const options = {
                    get preserveVelocity(): any {
                        throw 0;
                    },
                };
                const optionFailure = tryRejected('falsy throwing option getter', () =>
                    world.teleportRigidBody(body, pose, options),
                );
                check(
                    'original falsy option getter throw survives',
                    optionFailure.threw && Object.is(optionFailure.error, 0),
                    failure(optionFailure),
                );
                let nested: ReturnType<typeof attempt> | undefined;
                const reentrant = {
                    get position() {
                        nested = attempt(() => body.applyImpulse(new Vec3(100, 0, 0)));
                        return pose.position;
                    },
                    rotation: pose.rotation,
                };
                tryRejected('caught nested component submission poisons the outer getter admission', () =>
                    world.teleportRigidBody(body, reentrant),
                );
                check(
                    'nested actual component submission rejects inside admission',
                    !!nested?.threw,
                    nested ? failure(nested) : null,
                );
            }
            fixture.checkpoint('pure-rejections-preserve-original-queue', { baseline, rejected, checks });
        } else throw new Error('Unknown case ' + fixture.expected);
        const before = { state: state(), nativePose: nativePose(), node: nodePose(), pending: pending() };
        check(
            'accepted reset is staged without native apply or Node mutation',
            native() === 0 &&
                calls().length === 0 &&
                before.pending === expectedKinds.length &&
                vector(before.nativePose, before.node),
            before,
        );
        system.syncSceneToPhysics();
        system.postUpdate(0.25);
        check(
            'sync and autoSimulation false frame do not consume reset or emit writeback',
            native() === 0 &&
                calls().length === 0 &&
                pending() === before.pending &&
                events.length === 0 &&
                vector(nodePose(), before.node),
            { pending: pending(), calls: calls(), events },
        );
        fixture.checkpoint('before-first-real-tick', { checks, before, world: world.diagnostics(), expectedKinds });
        system.step(0.1);
        const first = batches()[0],
            operations = first?.result.operations,
            actual = first?.result.bodies[0]?.actual;
        const reset = first?.args[1].find((command: any) => command.kind === 'reset');
        const resetOperation = operations.find((operation: any) => operation.kind === 'reset');
        const expectedEffectiveWake = disabled ? false : expectedWake;
        fixture.checkpoint('wake-request-versus-native-action', {
            callerWake: expectedWake,
            componentEnabled: body.enabled,
            nativeEnabledBefore: before.state.enabled,
            nativeAwakeBefore: before.state.awake,
            canonicalReset: reset,
            nativePlannerActionBits: resetOperation.plannerActionBits,
            nativeAwakeAfterApply: resetOperation.actual.awake,
            nativeAwakeAfterStep: state().awake,
        });
        check(
            'one real tick performs ordered validate, apply, native step exactly once',
            native() === 1 &&
                JSON.stringify(calls().map((call: any) => call.name)) ===
                    JSON.stringify(['validateCommandBatch', 'applyCommandBatch', 'step']) &&
                calls().every((call: any) => call.returned) &&
                JSON.stringify(first?.args[1].map((command: any) => command.kind)) === JSON.stringify(expectedKinds),
            calls(),
        );
        check(
            'reset defaults/options and normalized copied pose reach native batch',
            reset?.preserveVelocity === expectedPreserve &&
                reset?.wake === expectedEffectiveWake &&
                reset?.mode === 'teleport' &&
                vector(actual?.pose.position, resetPose.slice(0, 3)) &&
                vector(actual?.pose.rotation, resetPose.slice(3)),
            { reset, actual },
        );
        check(
            'native post-apply velocity, world force and torque match reset ordering',
            vector(actual?.state.linearVelocity, expectedV) &&
                vector(actual?.state.angularVelocity, expectedW) &&
                vector(actual?.state.force, expectedF) &&
                vector(actual?.state.torque, expectedT),
            { actual, expectedV, expectedW, expectedF, expectedT, operations },
        );
        check(
            'reset recomputes COM according to body type and retained geometry',
            vector(
                actual?.state.localCenter,
                nativeDisabled || fixture.expected.includes('kinematic') ? [0, 0, 0] : [1, 0.5, 0],
            ) &&
                vector(
                    actual?.worldCenter,
                    nativeDisabled || fixture.expected.includes('kinematic') ? [3, 12, -1] : [2.5, 13, -1],
                ),
            actual,
        );
        if (nativeDisabled)
            check(
                'native-disabled reset carries no native wake action despite default request',
                resetOperation.plannerActionBits === 16,
                { before: before.state, request: reset, operation: resetOperation, afterStep: state() },
            );
        if (disabled)
            check(
                'disabled component reset preserves native enable state and requests no native wake',
                actual?.state.enabled === before.state.enabled &&
                    actual?.state.awake === false &&
                    state().enabled === before.state.enabled &&
                    state().awake === false &&
                    body.enabled === false &&
                    resetOperation.plannerActionBits === 16 &&
                    vector(nativePose(), resetPose),
                { actual, after: state(), bodyEnabled: body.enabled, pose: nativePose() },
            );
        else if (fixture.expected === 'enabled-wake-false')
            check(
                'wake false preserves sleep instead of waking enabled body',
                actual?.state.awake === false && state().awake === false && vector(nativePose(), resetPose),
                { actual, after: state(), pose: nativePose() },
            );
        else
            check(
                'awake enabled body remains awake including wake false preserve case',
                actual?.state.awake === true && state().awake === true,
                { actual, after: state() },
            );
        check(
            'actual Node writeback follows completed native step and matches native pose',
            events.length === 2 &&
                events.every(
                    (event) =>
                        event.native === 1 &&
                        event.commands.length === 3 &&
                        event.commands.every((call: any) => call.returned),
                ) &&
                vector(nodePose(), nativePose()),
            { events, node: nodePose(), nativePose: nativePose() },
        );
        check(
            'successful tick retires original queue and releases all temporary owner scopes',
            pending() === 0 &&
                world.diagnostics().commandOwner.commandQueue.completedTicks === 1 &&
                world.diagnostics().commandOwner.activeTemporaryScopes === 0 &&
                world.diagnostics().state === 'ready',
            world.diagnostics(),
        );
        const firstEventCount = events.length,
            firstPose = nativePose(),
            afterFirst = state();
        fixture.checkpoint('after-first-real-tick', {
            checks,
            actual,
            afterFirst,
            node: nodePose(),
            nativePose: firstPose,
            events,
        });
        system.step(0.1);
        check(
            'later empty tick never replays reset or earlier user command',
            native() === 2 &&
                batches().length === 2 &&
                batches()[1]?.args[1].length === 0 &&
                batches()[1]?.result.executedOperationCount === 0 &&
                pending() === 0 &&
                world.diagnostics().commandOwner.commandQueue.completedTicks === 2,
            { native: native(), batches: batches(), world: world.diagnostics() },
        );
        if (nativeDisabled)
            check(
                'native-disabled reset Node is not written again on empty tick',
                events.length === firstEventCount && vector(nodePose(), firstPose) && vector(nativePose(), firstPose),
                { events, firstEventCount, node: nodePose(), nativePose: nativePose() },
            );
        check(
            'no broad staged/unified feature activation follows finite reset candidate',
            world.diagnostics().commandOwner.stagedCommandsSupported === false &&
                world.diagnostics().commandOwner.unifiedTransactionsSupported === false,
            world.diagnostics().commandOwner,
        );
        node.off(Node.EventType.TRANSFORM_CHANGED, listener);
        fixture.checkpoint('before-close', { checks, native: native(), state: state(), world: world.diagnostics() });
        const close = await app.close!();
        closed = true;
        const observations = fixture.observations();
        check(
            'actual app teardown is released with zero tracked native allocations',
            close.status === 'released' &&
                close.physicsPreparation?.status === 'closed' &&
                fixture.loader.diagnostics().status === 'DISPOSED' &&
                observations.calls.filter((call: any) => call.name === 'destroyWorld' && call.returned).length === 1 &&
                observations.beforeBindingDispose?.coreBytes === '0' &&
                observations.beforeBindingDispose?.bridge?.liveBytes === '0',
            { close, beforeBindingDispose: observations.beforeBindingDispose, loader: fixture.loader.diagnostics() },
        );
        fixture.checkpoint('final-checks', {
            case: fixture.expected,
            checks,
            formalCells: { total: 2128, status: 'NOT_RUN' },
            gates: { total: 9, status: 'NOT_RUN' },
        });
        expect(checks.filter((item) => !item.pass)).toEqual([]);
        fixture.complete('PASS_LIMITED_TELEPORT');
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
