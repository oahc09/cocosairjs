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
// Finite source candidate only. Real AIR/Node components and unchanged N4 native dispatch.
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
import { CCObject } from '../../../src/cocos/core/data/object';
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
    complete(status: 'PASS_LIMITED_TARGET'): void;
    fail(error: unknown): void;
}
interface Subject {
    node: Node;
    body: RigidBody;
    collider: BoxCollider;
    id: Box3DId;
}
declare const __BOX3D_TARGET_FIXTURE__: Fixture;
const fixture = __BOX3D_TARGET_FIXTURE__;
const DT = 1 / 60;
const F32_DT = Math.fround(DT);
const SUBSTEPS = 4;
const copy = (value: unknown): any =>
    value === undefined
        ? null
        : JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? String(item) : item)));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const norm = (a: readonly number[]) => Math.hypot(...a);
const difference = (a: readonly number[], b: readonly number[]) => a.map((value, index) => value - b[index]);
const distance = (a: readonly number[], b: readonly number[]) => norm(difference(a, b));
const vector = (a: readonly number[] | undefined, b: readonly number[], tolerance = 1e-4) =>
    !!a && a.length === b.length && a.every(Number.isFinite) && distance(a, b) <= tolerance;
const zeros = (a: readonly number[] | undefined) => !!a && a.length === 3 && a.every((value) => value === 0);
function attempt(action: () => unknown) {
    try {
        return { threw: false, error: undefined as unknown, value: action() };
    } catch (error) {
        return { threw: true, error, value: undefined };
    }
}
const failure = (result: ReturnType<typeof attempt>) => ({
    threw: result.threw,
    error: String(result.error),
    code: (result.error as any)?.code ?? null,
});
const nodePose = (node: Node) => {
    const p = node.worldPosition,
        q = node.worldRotation;
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
};
const localPose = (node: Node) => {
    const p = node.position,
        q = node.rotation,
        s = node.scale;
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z];
};
const makePose = (position: readonly number[], rotation: readonly number[] = [0, 0, 0, 1]) => ({
    position: { x: position[0], y: position[1], z: position[2] },
    rotation: { x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] },
});
function velocityProbe(body: RigidBody) {
    let reads = 0;
    const input = {
        get x() {
            reads++;
            return 0.125;
        },
        get y() {
            reads++;
            return 0;
        },
        get z() {
            reads++;
            return 0;
        },
    } as Vec3;
    const calls = [
        attempt(() => body.setLinearVelocity(input)),
        attempt(() => body.setAngularVelocity(input)),
        attempt(() => body.body!.setLinearVelocity(input)),
        attempt(() => body.body!.setAngularVelocity(input)),
    ];
    return { reads, allRejected: calls.every((result) => result.threw), calls: calls.map(failure) };
}
function staleProbe(handle: ReturnType<Box3DPhysicsWorld['createKinematicTarget']>) {
    let reads = 0;
    const pose = {
        get position() {
            reads++;
            return { x: 1, y: 10, z: 0 };
        },
        get rotation() {
            reads++;
            return { x: 0, y: 0, z: 0, w: 1 };
        },
    };
    const set = attempt(() => handle.setTarget(pose));
    const clear = attempt(() => handle.clear());
    const dispose = attempt(() => handle.dispose());
    return { reads, set: failure(set), clear: failure(clear), dispose: failure(dispose) };
}
// Independent target translation oracle, not the implementation's native planned velocity.
// Zero damping, fixed rotation and nonzero COM isolate translation without assuming exact arrival.
function translationOracle(
    initialOrigin: readonly number[],
    localCenter: readonly number[],
    requested: readonly number[],
) {
    const initialCenter = initialOrigin.map((value, i) => Math.fround(value + localCenter[i]));
    const requestedCenter = requested.map((value, i) => Math.fround(Math.fround(value) + localCenter[i]));
    const velocity = requestedCenter.map((value, i) => Math.fround(Math.fround(value - initialCenter[i]) / F32_DT));
    const h = Math.fround(F32_DT / SUBSTEPS);
    const center = initialCenter.map((value, i) => {
        for (let step = 0; step < SUBSTEPS; step++) value = Math.fround(value + Math.fround(h * velocity[i]));
        return value;
    });
    return {
        fixedDt: F32_DT,
        subSteps: SUBSTEPS,
        initialCenter,
        requestedCenter,
        velocity,
        angularVelocity: [0, 0, 0],
        center,
        origin: center.map((value, i) => Math.fround(value - localCenter[i])),
    };
}
test('frozen finite actual target case reaches original AIR lifecycle and unchanged N4 WASM', async () => {
    let app: AirApp | undefined,
        closed = false;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual: copy(actual) });
    const listeners: { node: Node; callback: (flags: number) => void }[] = [];
    const restores: (() => void)[] = [];
    const listen = (node: Node, callback: (flags: number) => void) => {
        listeners.push({ node, callback });
        node.on(Node.EventType.TRANSFORM_CHANGED, callback);
    };
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
            physicsOptions: { box3d: { threading: 'single', workerCount: 1, solverSubSteps: SUBSTEPS } },
        });
        // Existing headless single-clock seam only. This is NOT Game/manual-clock lifetime qualification.
        game.pause();
        const system = PhysicsSystem.instance,
            world = system.physicsWorld as Box3DPhysicsWorld;
        system.autoSimulation = false;
        system.gravity = new Vec3(0, 0, 0);
        const scene = new Scene('actual-target-' + fixture.expected);
        director.runSceneImmediate(scene);
        game.pause();
        const binding = fixture.binding(),
            token = fixture.token();
        const native = () => binding.stepDiagnostics(token).nativeStepIndex;
        const state = (subject: Subject) => binding.bodyState(token, subject.id);
        const nativePose = (subject: Subject) => Array.from(binding.bodyTransforms(token, [subject.id])).slice(0, 7);
        const owner = () => world.diagnostics().commandOwner;
        const allCalls = () => fixture.observations().calls as any[];
        const calls = () =>
            allCalls().filter((row) => ['validateCommandBatch', 'applyCommandBatch', 'step'].includes(row.name));
        const batches = () => allCalls().filter((row) => row.name === 'applyCommandBatch');
        const pending = () => owner().pendingCommands;
        function subject(
            name: string,
            position: number[],
            type = ERigidBodyType.KINEMATIC,
            parent: Node = scene,
            rotationZ = 0,
        ): Subject {
            const node = new Node(name);
            node.setPosition(position[0], position[1], position[2]);
            node.setRotationFromEuler(0, 0, rotationZ);
            const body = node.addComponent(RigidBody);
            body.type = type;
            body.mass = 1;
            body.useGravity = false;
            body.linearDamping = 0;
            body.angularDamping = 0;
            const collider = node.addComponent(BoxCollider);
            collider.center = new Vec3(0.5, 0.25, -0.125);
            const before = fixture.bodies().length;
            parent.addChild(node);
            const ids = fixture.bodies();
            if (ids.length !== before + 1) throw new Error('Expected one actual native body per new fixture Node');
            return { node, body, collider, id: ids[before] };
        }
        function observeSetters(subjects: Subject[]) {
            const rows: any[] = [];
            for (const item of subjects)
                for (const method of ['setWorldPosition', 'setWorldRotation'] as const) {
                    const original = item.node[method];
                    const descriptor = Object.getOwnPropertyDescriptor(item.node, method);
                    Object.defineProperty(item.node, method, {
                        configurable: true,
                        writable: true,
                        value: function (...args: any[]) {
                            const row: any = {
                                node: item.node.name,
                                method,
                                args: copy(args),
                                returned: false,
                                native: native(),
                            };
                            rows.push(row);
                            try {
                                const result = Reflect.apply(original, this, args);
                                row.returned = true;
                                return result;
                            } catch (error) {
                                row.error = String(error);
                                throw error;
                            }
                        },
                    });
                    restores.push(() => {
                        if (descriptor) Object.defineProperty(item.node, method, descriptor);
                        else delete (item.node as any)[method];
                    });
                }
            return rows;
        }
        function zeroTransition(rows: any[], id: Box3DId, expectedTick: number) {
            const zero = rows.filter((row) => row.name === 'clearBodyVelocity' && same(row.args[1], id));
            return (
                zero.length === 1 &&
                zero[0].returned &&
                zero[0].beforeNativeState?.enabled === true &&
                zero[0].beforeNativeState?.type === 1 &&
                zero[0].afterNativeState?.enabled === true &&
                zero[0].afterNativeState?.type === 1 &&
                zeros(zero[0].afterNativeState?.linearVelocity) &&
                zeros(zero[0].afterNativeState?.angularVelocity) &&
                same(zero[0].beforeNativeState.force, zero[0].afterNativeState.force) &&
                same(zero[0].beforeNativeState.torque, zero[0].afterNativeState.torque) &&
                zero[0].beforeNativeState.awake === zero[0].afterNativeState.awake &&
                zero[0].beforeNativeTick === expectedTick &&
                zero[0].afterNativeTick === expectedTick
            );
        }
        function onlyBatchStep(before: number, kinds: string[]) {
            const rows = calls().slice(before);
            return (
                same(
                    rows.map((row) => row.name),
                    ['validateCommandBatch', 'applyCommandBatch', 'step'],
                ) &&
                rows.every((row) => row.returned) &&
                same(
                    rows[1]?.args[1].map((op: any) => op.kind),
                    kinds,
                )
            );
        }
        const a = subject('actual-target-a', [0, 10, 0]);
        const handle = world.createKinematicTarget(a.body);
        const adapter = a.body.body as any;
        check(
            'actual public RigidBody adapter does not expose shared-body native control',
            adapter !== null && adapter.body === undefined && typeof adapter.control === 'undefined',
            {
                ownKeys: Object.keys(adapter),
                sharedBodyExposed: adapter.body !== undefined,
                controlExposed: typeof adapter.control,
            },
        );
        const shape = a.collider.shape as any;
        check(
            'actual collider adapter and both impl metadata objects expose no shared native body',
            shape !== null &&
                shape.body === undefined &&
                typeof shape.control === 'undefined' &&
                adapter.impl.body === undefined &&
                shape.impl.body === undefined,
            {
                shapeOwnKeys: Object.keys(shape),
                sharedBodyExposed: shape.body !== undefined,
                rigidImpl: adapter.impl,
                shapeImpl: shape.impl,
            },
        );
        check(
            'handle is frozen and exposes exactly void motion methods',
            Object.isFrozen(handle) && same(Object.keys(handle).sort(), ['clear', 'dispose', 'setTarget']),
            Object.keys(handle),
        );
        check(
            'target is private candidate with public support still disabled',
            owner().persistentTargetCandidate &&
                owner().targets.active === 1 &&
                owner().targets.guards === 1 &&
                owner().stagedCommandsSupported === false &&
                owner().unifiedTransactionsSupported === false,
            owner(),
        );
        const moved = [1 / 16, 10 + 1 / 32, -1 / 64];
        const baseline = {
            native: native(),
            state: state(a),
            nativePose: nativePose(a),
            node: nodePose(a.node),
            owner: owner(),
        };
        fixture.checkpoint('initial-real-owner', baseline);
        if (fixture.expected === 'motion-idle-zero') {
            const setters = observeSetters([a]);
            const result = handle.setTarget(makePose(moved));
            const copiedPending = pending();
            system.syncSceneToPhysics();
            check(
                'setTarget is void and no-tick sync preserves accepted target without native consumption',
                result === undefined &&
                    copiedPending === 1 &&
                    pending() === 1 &&
                    native() === 0 &&
                    calls().length === 0,
                { result, copiedPending, owner: owner(), calls: calls() },
            );
            const start = allCalls().length,
                commandStart = calls().length;
            const prediction = translationOracle(baseline.nativePose.slice(0, 3), baseline.state.localCenter, moved);
            system.step(DT);
            const actual = state(a),
                pose = nativePose(a),
                batch = batches()[0],
                operation = batch?.result.operations[0];
            const errors = {
                velocity: distance(actual.linearVelocity, prediction.velocity),
                origin: distance(pose.slice(0, 3), prediction.origin),
                requestedOrigin: distance(pose.slice(0, 3), moved),
                plannedVelocity: operation ? distance(operation.plan.linearVelocity, prediction.velocity) : null,
            };
            check(
                'one target validates applies and steps once',
                onlyBatchStep(commandStart, ['target']) && native() === 1,
                { calls: calls(), owner: owner() },
            );
            check(
                'independent zero-damping model agrees with planned and actual native movement',
                vector(actual.linearVelocity, prediction.velocity, 5e-5 * Math.max(1, norm(prediction.velocity))) &&
                    vector(
                        operation?.plan.linearVelocity,
                        prediction.velocity,
                        5e-5 * Math.max(1, norm(prediction.velocity)),
                    ) &&
                    vector(pose.slice(0, 3), prediction.origin) &&
                    zeros(actual.angularVelocity) &&
                    vector(pose.slice(3), [0, 0, 0, 1]),
                { prediction, operation, actual, pose, requested: moved, errors },
            );
            check(
                'target arrival has no transform/reset correction',
                allCalls()
                    .slice(start)
                    .every(
                        (row) =>
                            ![
                                'setBodyTransform',
                                'setBodyOriginTransform',
                                'setOriginTransform',
                                'applyMotionBatch',
                            ].includes(row.name),
                    ) &&
                    batch.args[1].every((op: any) => op.kind !== 'reset') &&
                    vector(operation?.actual.pose.position, baseline.nativePose.slice(0, 3)),
                {
                    calls: allCalls().slice(start),
                    beforeOrigin: baseline.nativePose,
                    appliedBeforeStep: operation?.actual.pose,
                },
            );
            check(
                'original Node receives exactly one position and rotation setter after native step',
                setters.length === 2 &&
                    setters.every((row) => row.returned && row.native === 1) &&
                    vector(nodePose(a.node), pose),
                { setters, node: nodePose(a.node), pose },
            );
            const poseAfterMotion = pose.slice();
            system.step(DT);
            const idle = batches()[1];
            check(
                'next empty tick inserts exactly one idle paired zero without replay',
                native() === 2 &&
                    onlyBatchStep(3, ['pairedClear']) &&
                    idle?.args[1][0]?.reason === 'idle' &&
                    zeros(state(a).linearVelocity) &&
                    zeros(state(a).angularVelocity) &&
                    vector(nativePose(a), poseAfterMotion) &&
                    pending() === 0 &&
                    owner().targets.active === 1,
                { idle, state: state(a), pose: nativePose(a), owner: owner() },
            );
            fixture.checkpoint('independent-motion-and-idle-readback', { prediction, errors, setters, checks });
        } else if (fixture.expected === 'clear-dispose-protected') {
            handle.setTarget(makePose(moved, [0, 0, Math.sin(0.01), Math.cos(0.01)]));
            system.step(DT);
            check(
                'clear has actual preceding nonzero paired target velocities',
                norm(state(a).linearVelocity) > 0 && norm(state(a).angularVelocity) > 0,
                state(a),
            );
            const clearValue = handle.clear();
            const clearNode = attempt(() => a.node.setPosition(1, 10, 0));
            const clearVelocity = velocityProbe(a.body);
            check(
                'clear is void and retains direct Node and public/adapter velocity protection before getters',
                clearValue === undefined &&
                    clearNode.threw &&
                    clearVelocity.allRejected &&
                    clearVelocity.reads === 0 &&
                    owner().targets.active === 1,
                { clearNode: failure(clearNode), clearVelocity, owner: owner() },
            );
            system.step(DT);
            check(
                'clear applies user paired zero without surrendering ownership',
                batches()[1]?.args[1][0]?.kind === 'pairedClear' &&
                    batches()[1]?.args[1][0]?.reason === 'user' &&
                    zeros(state(a).linearVelocity) &&
                    zeros(state(a).angularVelocity) &&
                    owner().targets.active === 1 &&
                    owner().targets.guards === 1,
                { batch: batches()[1], state: state(a), owner: owner() },
            );
            handle.setTarget(makePose([0.125, 10, 0]));
            a.body.clearForces(); // Retained ordinary user entry, unlike revoked target motion.
            const disposeValue = handle.dispose();
            const cancelled = world.cancelPendingCommands(a.body);
            const protectedVelocity = velocityProbe(a.body),
                protectedNode = attempt(() => a.node.setPosition(2, 10, 0));
            const reacquire = attempt(() => world.createKinematicTarget(a.body));
            const oldBefore = staleProbe(handle);
            check(
                'dispose is void; cancellation cannot erase protected zero or transfer control',
                disposeValue === undefined &&
                    cancelled === 1 &&
                    pending() === 0 &&
                    owner().targets.protected === 1 &&
                    owner().targets.guards === 1 &&
                    protectedVelocity.allRejected &&
                    protectedVelocity.reads === 0 &&
                    protectedNode.threw &&
                    reacquire.threw &&
                    oldBefore.reads === 0 &&
                    oldBefore.set.threw &&
                    oldBefore.clear.threw &&
                    !oldBefore.dispose.threw,
                {
                    cancelled,
                    protectedVelocity,
                    protectedNode: failure(protectedNode),
                    reacquire: failure(reacquire),
                    oldBefore,
                    owner: owner(),
                },
            );
            const duringWriteback: any[] = [];
            listen(a.node, () =>
                duringWriteback.push({ native: native(), targets: owner().targets, velocity: velocityProbe(a.body) }),
            );
            system.step(DT);
            check(
                'protected zero survives through actual native step and every writeback listener',
                batches()[2]?.args[1].length === 1 &&
                    batches()[2]?.args[1][0]?.kind === 'pairedClear' &&
                    batches()[2]?.args[1][0]?.reason === 'cleanup' &&
                    duringWriteback.length === 2 &&
                    duringWriteback.every(
                        (row) =>
                            row.native === 3 &&
                            row.targets.protected === 1 &&
                            row.targets.guards === 1 &&
                            row.velocity.allRejected &&
                            row.velocity.reads === 0,
                    ) &&
                    zeros(state(a).linearVelocity) &&
                    zeros(state(a).angularVelocity) &&
                    owner().targets.protected === 0 &&
                    owner().targets.guards === 0 &&
                    owner().commandQueue.completedTicks === 3,
                { batch: batches()[2], duringWriteback, owner: owner(), state: state(a) },
            );
            const newVelocity = attempt(() => a.body.setLinearVelocity(new Vec3(0.125, 0, 0)));
            const fresh = world.createKinematicTarget(a.body),
                oldAfter = staleProbe(handle);
            check(
                'only completed settlement admits fresh velocity and new target identity; old handle stays invalid',
                !newVelocity.threw &&
                    vector(state(a).linearVelocity, [0.125, 0, 0]) &&
                    fresh !== handle &&
                    oldAfter.reads === 0 &&
                    oldAfter.set.threw &&
                    oldAfter.clear.threw &&
                    !oldAfter.dispose.threw &&
                    owner().targets.active === 1,
                { newVelocity: failure(newVelocity), oldAfter, owner: owner(), state: state(a) },
            );
        } else if (
            ['disable-collider-survives', 'type-away-reacquire', 'component-recreate'].includes(fixture.expected)
        ) {
            handle.setTarget(makePose(moved, [0, 0, Math.sin(0.01), Math.cos(0.01)]));
            system.step(DT);
            // Unrelated accepted work must not be cancelled by exact target retirement.
            const other = subject('unrelated-dynamic-command', [8, 10, 0], ERigidBodyType.DYNAMIC);
            other.body.applyImpulse(new Vec3(0.25, 0, 0));
            const before = {
                owner: owner(),
                state: state(a),
                native: native(),
                nativeBodyCount: fixture.bodies().length,
                colliderEnabled: a.collider.enabled,
                component: a.body.uuid,
            };
            const callStart = allCalls().length;
            if (fixture.expected === 'disable-collider-survives') a.body.enabled = false;
            else if (fixture.expected === 'type-away-reacquire') a.body.type = ERigidBodyType.DYNAMIC;
            else {
                a.body.destroy();
                CCObject._deferredDestroy();
            }
            const transitionRows = allCalls().slice(callStart),
                after = state(a),
                old = staleProbe(handle);
            check(
                'pretransition captured op13 clears both velocities while actual native body is still enabled kinematic',
                norm(before.state.linearVelocity) > 0 &&
                    norm(before.state.angularVelocity) > 0 &&
                    zeroTransition(transitionRows, a.id, 1) &&
                    native() === 1,
                { before, transitionRows, after, owner: owner() },
            );
            const zeroIndex = transitionRows.findIndex((row) => row.name === 'clearBodyVelocity');
            const typeIndex = transitionRows.findIndex((row) => row.name === 'setBodyType');
            check(
                'zero is before native type transition and collider preserves actual body identity',
                (fixture.expected === 'disable-collider-survives'
                    ? typeIndex === -1 && after.type === 1 && !a.body.enabled
                    : typeIndex > zeroIndex && after.type === (fixture.expected === 'component-recreate' ? 0 : 2)) &&
                    a.collider.enabled &&
                    after.enabled &&
                    zeros(after.linearVelocity) &&
                    zeros(after.angularVelocity) &&
                    fixture.bodies().length === before.nativeBodyCount &&
                    owner().targets.active === 0 &&
                    owner().targets.protected === 0 &&
                    owner().targets.guards === 0 &&
                    pending() === 1,
                { transitionRows, after, owner: owner(), colliderEnabled: a.collider.enabled },
            );
            check(
                'retired handle cannot inspect new pose input or resurrect; repeated dispose is safe',
                old.reads === 0 && old.set.threw && old.clear.threw && !old.dispose.threw,
                old,
            );
            const oldComponent = a.body;
            if (fixture.expected === 'disable-collider-survives') a.body.enabled = true;
            else if (fixture.expected === 'type-away-reacquire') a.body.type = ERigidBodyType.KINEMATIC;
            else {
                a.body = a.node.addComponent(RigidBody);
                a.body.type = ERigidBodyType.KINEMATIC;
                a.body.useGravity = false;
                a.body.linearDamping = 0;
                a.body.angularDamping = 0;
            }
            const velocity = attempt(() => a.body.setLinearVelocity(new Vec3(0.125, 0, 0)));
            const fresh = world.createKinematicTarget(a.body);
            fresh.setTarget(makePose([0.125, 10, 0]));
            const oldReenabled = staleProbe(handle),
                commandsBefore = calls().length;
            system.step(DT);
            check(
                're-enable or exact replacement accepts only a fresh target and preserves unrelated accepted command',
                !velocity.threw &&
                    fresh !== handle &&
                    oldReenabled.reads === 0 &&
                    oldReenabled.set.threw &&
                    oldReenabled.clear.threw &&
                    onlyBatchStep(commandsBefore, ['linearImpulse', 'target']) &&
                    native() === 2 &&
                    vector(state(other).linearVelocity, [0.25, 0, 0]) &&
                    (fixture.expected !== 'component-recreate' || a.body !== oldComponent) &&
                    fixture.bodies().length === before.nativeBodyCount &&
                    owner().targets.active === 1,
                {
                    velocity: failure(velocity),
                    oldReenabled,
                    oldComponent: oldComponent.uuid,
                    newComponent: a.body.uuid,
                    batch: batches()[1],
                    other: state(other),
                    owner: owner(),
                },
            );
            fixture.checkpoint('actual-lifecycle-exact-identity', { before, transitionRows, after, checks });
        } else if (fixture.expected === 'compound-covering-writeback') {
            // Retire the common initial subject using the real pre-disable seam, then build the hierarchy.
            a.body.enabled = false;
            a.collider.enabled = false;
            const parent = subject('writable-physics-ancestor', [3, 15, 0], ERigidBodyType.DYNAMIC, scene, 30);
            parent.body.setLinearVelocity(new Vec3(0.125, 0, 0));
            const left = subject('target-child-left', [-3, 0, 0], ERigidBodyType.KINEMATIC, parent.node);
            const right = subject('target-child-right', [3, 0, 0], ERigidBodyType.KINEMATIC, parent.node);
            const leftTarget = world.createKinematicTarget(left.body),
                rightTarget = world.createKinematicTarget(right.body);
            const subjects = [parent, left, right];
            const before = subjects.map((item) => ({
                name: item.node.name,
                world: nodePose(item.node),
                local: localPose(item.node),
                native: nativePose(item),
            }));
            const setters = observeSetters(subjects),
                events: any[] = [];
            let reentering = false;
            for (const item of subjects)
                listen(item.node, (flags) => {
                    if (reentering) throw new Error('An exact write grant escaped into nested listener mutation');
                    reentering = true;
                    const old = nodePose(parent.node);
                    const denied = attempt(() => parent.node.setWorldPosition(old[0], old[1], old[2]));
                    reentering = false;
                    events.push({
                        node: item.node.name,
                        flags,
                        native: native(),
                        denied: failure(denied),
                        ancestorUnchanged: vector(nodePose(parent.node), old),
                        targets: owner().targets,
                    });
                });
            for (const [item, target] of [
                [left, leftTarget],
                [right, rightTarget],
            ] as const) {
                const pose = nativePose(item);
                target.setTarget(makePose([pose[0] + 1 / 32, pose[1] + 1 / 64, pose[2]], pose.slice(3)));
            }
            const commandsBefore = calls().length;
            system.step(DT);
            const after = subjects.map((item) => ({
                name: item.node.name,
                world: nodePose(item.node),
                local: localPose(item.node),
                native: nativePose(item),
            }));
            const c = Math.cos(Math.PI / 6),
                s = Math.sin(Math.PI / 6),
                parentWorld = nodePose(parent.node);
            const independentlyExpectedLocals = [left, right].map((item) => {
                const pose = nativePose(item),
                    dx = pose[0] - parentWorld[0],
                    dy = pose[1] - parentWorld[1];
                return [c * dx + s * dy, -s * dx + c * dy, pose[2] - parentWorld[2]];
            });
            check(
                'two distinct persistent covering leases compose with temporary lease on physics ancestor',
                onlyBatchStep(commandsBefore, ['target', 'target']) &&
                    native() === 1 &&
                    owner().targets.active === 2 &&
                    owner().targets.guards === 2 &&
                    subjects.every((item) => vector(nodePose(item.node), nativePose(item))),
                { before, after, batch: batches()[0], owner: owner() },
            );
            check(
                'each planned original setter succeeds once per operation despite multiple covering guards',
                subjects.every((item) =>
                    ['setWorldPosition', 'setWorldRotation'].every(
                        (method) =>
                            setters.filter(
                                (row) => row.node === item.node.name && row.method === method && row.returned,
                            ).length === 1,
                    ),
                ) &&
                    setters.filter((row) => row.returned).length === 6 &&
                    events.length === 6 &&
                    events.every(
                        (row) =>
                            row.native === 1 && row.denied.threw && row.ancestorUnchanged && row.targets.guards === 2,
                    ),
                { setters, events },
            );
            check(
                'ancestor basis and independently computed child locals agree with native world poses',
                vector(
                    [left.node.position.x, left.node.position.y, left.node.position.z],
                    independentlyExpectedLocals[0],
                ) &&
                    vector(
                        [right.node.position.x, right.node.position.y, right.node.position.z],
                        independentlyExpectedLocals[1],
                    ) &&
                    vector(nodePose(parent.node).slice(3), before[0].world.slice(3)) &&
                    vector(localPose(left.node).slice(3, 7), [0, 0, 0, 1]) &&
                    vector(localPose(right.node).slice(3, 7), [0, 0, 0, 1]),
                { independentlyExpectedLocals, before, after },
            );
            fixture.checkpoint('multi-covering-actual-writeback', {
                before,
                after,
                setters,
                events,
                independentlyExpectedLocals,
            });
        } else if (['caught-revoked-set', 'caught-revoked-clear'].includes(fixture.expected)) {
            handle.dispose();
            system.step(DT);
            const fresh = world.createKinematicTarget(a.body);
            fresh.setTarget(makePose(moved));
            const other = subject('current-producer-dynamic', [8, 10, 0], ERigidBodyType.DYNAMIC);
            const before = {
                native: native(),
                pending: pending(),
                state: state(a),
                other: state(other),
                pose: nativePose(a),
                owner: owner(),
                calls: calls().length,
            };
            let callbackCount = 0,
                reads = 0,
                caught: ReturnType<typeof attempt> | undefined;
            const hostile = {
                get position() {
                    reads++;
                    return { x: 0, y: 10, z: 0 };
                },
                get rotation() {
                    reads++;
                    return { x: 0, y: 0, z: 0, w: 1 };
                },
            };
            const hook = world.registerCommandHook(() => {
                callbackCount++;
                other.body.applyImpulse(new Vec3(0.25, 0, 0));
                caught = attempt(() =>
                    fixture.expected === 'caught-revoked-set' ? handle.setTarget(hostile) : handle.clear(),
                );
            });
            const outer = attempt(() => system.step(DT));
            check(
                'caught revoked handle rejection poisons the CURRENT candidate before argument reads or native calls',
                outer.threw &&
                    !!caught?.threw &&
                    outer.error === caught.error &&
                    reads === 0 &&
                    callbackCount === 1 &&
                    native() === before.native &&
                    calls().length === before.calls &&
                    pending() === before.pending &&
                    same(state(a), before.state) &&
                    same(state(other), before.other) &&
                    vector(nativePose(a), before.pose),
                {
                    outer: failure(outer),
                    caught: caught ? failure(caught) : null,
                    reads,
                    callbackCount,
                    before,
                    owner: owner(),
                    calls: calls(),
                },
            );
            hook.dispose();
            system.step(DT);
            check(
                'fresh explicit retry consumes only accepted earlier target; provisional impulse never replays',
                native() === 2 &&
                    pending() === 0 &&
                    callbackCount === 1 &&
                    onlyBatchStep(before.calls, ['target']) &&
                    zeros(state(other).linearVelocity) &&
                    norm(state(a).linearVelocity) > 0 &&
                    owner().commandQueue.completedTicks === 2,
                { owner: owner(), other: state(other), state: state(a), calls: calls(), callbackCount },
            );
        } else if (fixture.expected === 'listener-completed-step-failure') {
            handle.setTarget(makePose(moved));
            const sentinel = Object.freeze({ source: 'actual-transform-listener-failure', value: 41 });
            let listenerCalls = 0;
            const observed: any[] = [];
            listen(a.node, (flags) => {
                listenerCalls++;
                observed.push({ flags, native: native(), targets: owner().targets, state: state(a), calls: calls() });
                throw sentinel;
            });
            const start = calls().length,
                first = attempt(() => system.step(DT));
            const after = {
                world: world.diagnostics(),
                state: state(a),
                pose: nativePose(a),
                native: native(),
                calls: calls(),
            };
            check(
                'actual listener failure follows committed batch and completed native step without pretending rollback',
                first.threw &&
                    first.error === sentinel &&
                    listenerCalls === 1 &&
                    native() === 1 &&
                    onlyBatchStep(start, ['target']) &&
                    world.diagnostics().state === 'faulted' &&
                    owner().commandQueue.completedTicks === 1 &&
                    pending() === 0 &&
                    owner().targets.guards === 1,
                { first: failure(first), observed, after },
            );
            const beforeRetry = calls().length,
                retry = attempt(() => system.step(DT));
            check(
                'faulted owner never replays committed target or advances another native step',
                retry.threw && native() === 1 && calls().length === beforeRetry && listenerCalls === 1,
                { retry: failure(retry), native: native(), calls: calls(), owner: owner() },
            );
            fixture.checkpoint('completed-native-step-listener-failure', {
                observed,
                first: failure(first),
                retry: failure(retry),
                after,
            });
        } else throw new Error('Case missing from frozen target roster: ' + fixture.expected);
        check(
            'temporary fences settle without falsely promoting public capabilities',
            owner().activeTemporaryScopes === 0 &&
                owner().stagedCommandsSupported === false &&
                owner().unifiedTransactionsSupported === false,
            owner(),
        );
        fixture.checkpoint('before-actual-app-close', { checks, world: world.diagnostics(), native: native() });
        for (const { node, callback } of listeners) node.off(Node.EventType.TRANSFORM_CHANGED, callback);
        listeners.length = 0;
        for (const restore of restores.splice(0)) restore();
        const close = await app.close!();
        closed = true;
        const observations = fixture.observations();
        check(
            'app.close releases actual native resources even with outstanding persistent or faulted guards',
            close.status === 'released' &&
                close.physicsPreparation?.status === 'closed' &&
                fixture.loader.diagnostics().status === 'DISPOSED' &&
                observations.calls.filter((row: any) => row.name === 'destroyWorld' && row.returned).length === 1 &&
                observations.beforeBindingDispose?.coreBytes === '0' &&
                observations.beforeBindingDispose?.bridge?.liveBytes === '0' &&
                observations.observationErrors.length === 0 &&
                owner().targets.guards === 0 &&
                owner().targets.active === 0 &&
                owner().targets.protected === 0 &&
                owner().nativeOwnership === 'released',
            {
                close,
                beforeBindingDispose: observations.beforeBindingDispose,
                observationErrors: observations.observationErrors,
                loader: fixture.loader.diagnostics(),
                owner: owner(),
            },
        );
        const afterClose = staleProbe(handle);
        check(
            'terminal original handle cannot regain ownership',
            afterClose.reads === 0 && afterClose.set.threw && afterClose.clear.threw && !afterClose.dispose.threw,
            afterClose,
        );
        fixture.checkpoint('final-checks', {
            case: fixture.expected,
            checks,
            formalCells: { total: 2128, status: 'NOT_RUN' },
            gates: { total: 9, status: 'NOT_RUN' },
            notCovered: ['persist-scene transfer', 'Game/manual-clock distinction', 'cross-world or multi-app seam'],
        });
        expect(checks.filter((row) => !row.pass)).toEqual([]);
        fixture.complete('PASS_LIMITED_TARGET');
    } catch (error) {
        fixture.checkpoint('failed-checks', { checks });
        fixture.fail(error);
        throw error;
    } finally {
        for (const { node, callback } of listeners) node.off(Node.EventType.TRANSFORM_CHANGED, callback);
        for (const restore of restores.splice(0)) restore();
        if (app && !closed) {
            try {
                fixture.checkpoint('finally-app-close', await app.close!());
            } catch (error) {
                fixture.checkpoint('finally-close-error', { error: String(error) });
            }
        }
    }
});
