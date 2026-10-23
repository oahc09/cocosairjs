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
// SOURCE_ONLY_NOT_RUN. Exactly three real NodeActivator / legal lifecycle timer cases.
import '../../../src/exports/base';
import { createAirApp } from '../../../src/air/bootstrap';
import type { AirApp } from '../../../src/air/app';
import { createStepClock } from '../../../src/air/step-clock';
import type { AirStepClock } from '../../../src/air/step-clock';
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
import { CCObjectFlags } from '../../../src/cocos/core/data/object';
import type { ISchedulable } from '../../../src/cocos/core/scheduler';
import { game, director } from '../../../src/cocos/game';
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
    complete(status: 'PASS_LIMITED_ACTIVATION'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_ACTIVATION_FIXTURE__: Fixture;
const fixture = __BOX3D_ACTIVATION_FIXTURE__;
const DT = 1 / 60;
const SUBSTEPS = 4;
const copy = (value: unknown): any =>
    value === undefined
        ? null
        : JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? String(item) : item)));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const norm = (a: readonly number[]) => Math.hypot(...a);
const distance = (a: readonly number[], b: readonly number[]) => norm(a.map((v, i) => v - b[i]));
const vector = (a: readonly number[] | undefined, b: readonly number[], tolerance = 1e-4) =>
    !!a && a.length === b.length && a.every(Number.isFinite) && distance(a, b) <= tolerance;
const zeros = (a: readonly number[] | undefined) => !!a && a.length === 3 && a.every((v) => v === 0);
const makePose = (position: readonly number[]) => ({
    position: { x: position[0], y: position[1], z: position[2] },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
});
function attempt(action: () => unknown) {
    try {
        return { threw: false, error: undefined as unknown, value: action() };
    } catch (error) {
        return { threw: true, error, value: undefined };
    }
}
async function attemptAsync(action: () => unknown) {
    try {
        return { threw: false, error: undefined as unknown, value: await action() };
    } catch (error) {
        return { threw: true, error, value: undefined };
    }
}
const failure = (result: { threw: boolean; error: unknown }) => ({
    threw: result.threw,
    error: String(result.error),
    code: (result.error as any)?.code ?? null,
});
type Target = ReturnType<Box3DPhysicsWorld['createKinematicTarget']>;
function staleProbe(handle: Target) {
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
const staleRejected = (value: ReturnType<typeof staleProbe>) =>
    value.reads === 0 && value.set.threw && value.clear.threw && !value.dispose.threw;
// Same narrow independent float32 translation arithmetic as the historical target family.
// Read the real localCenter. This N4 artifact reports zero: no nonzero-COM claim.
function translationOracle(
    initialOrigin: readonly number[],
    localCenter: readonly number[],
    requested: readonly number[],
) {
    const dt = Math.fround(DT),
        h = Math.fround(dt / SUBSTEPS);
    const initialCenter = initialOrigin.map((value, i) => Math.fround(value + localCenter[i]));
    const requestedCenter = requested.map((value, i) => Math.fround(Math.fround(value) + localCenter[i]));
    const velocity = requestedCenter.map((value, i) => Math.fround(Math.fround(value - initialCenter[i]) / dt));
    const center = initialCenter.map((value, i) => {
        for (let step = 0; step < SUBSTEPS; step++) value = Math.fround(value + Math.fround(h * velocity[i]));
        return value;
    });
    return {
        dt,
        subSteps: SUBSTEPS,
        localCenter,
        velocity,
        origin: center.map((value, i) => Math.fround(value - localCenter[i])),
    };
}
test('three-case bounded real activation and legal callback timers use original owned frames and N4', async () => {
    let app: AirApp | undefined,
        clock: AirStepClock | undefined,
        closed = false,
        activeFrame = 0;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const frames: any[] = [];
    const handles: Target[] = [];
    const events: any[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual: copy(actual) });
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
        clock = createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
        const scene = new Scene('actual-activation-' + fixture.expected);
        // No await or task yield may intervene between run and acquisition of this exact lease.
        app.run(scene);
        clock.begin();
        const system = PhysicsSystem.instance,
            world = system.physicsWorld as Box3DPhysicsWorld;
        system.fixedTimeStep = DT;
        system.maxSubSteps = 1;
        system.autoSimulation = true;
        system.gravity = new Vec3(0, 0, 0);
        const binding = fixture.binding(),
            token = fixture.token(),
            timer = director.getScheduler();
        const native = () => binding.stepDiagnostics(token).nativeStepIndex;
        const owner = () => world.diagnostics().commandOwner;
        const allCalls = () => fixture.observations().calls as any[];
        const commandCalls = () =>
            allCalls().filter((row) => ['validateCommandBatch', 'applyCommandBatch', 'step'].includes(row.name));
        const scheduled = (component: RigidBody) => component as unknown as ISchedulable;
        class ActivationBody extends RigidBody {
            starts = 0;
            updates = 0;
            oldCalls = 0;
            replacementCalls = 0;
            parkedCalls = 0;
            workCalls = 0;
            armEnableWork = false;
            timerTarget: Target | undefined;
            oldTimer = () => {
                this.oldCalls++;
                this.record('old-timer');
            };
            replacementTimer = () => {
                this.replacementCalls++;
                this.record('replacement-timer');
            };
            parkedTimer = () => {
                this.parkedCalls++;
                this.record('parked-timer');
            };
            workTimer = () => {
                this.workCalls++;
                this.record('work-timer-before-target');
                if (!this.timerTarget) throw new Error('Original timer ran without its freshly acquired target');
                this.timerTarget.setTarget(makePose([1 / 16, 10 + 1 / 32, -1 / 64]));
                this.record('work-timer-after-target');
            };
            record(event: string) {
                events.push({
                    event,
                    frame: activeFrame,
                    clockStepped: clock!.stepped,
                    directorFrame: director.getTotalFrames(),
                    native: native(),
                    enabled: this.enabled,
                    active: this.node.activeInHierarchy,
                    scheduledFlag: !!(this._objFlags & CCObjectFlags.IsOnEnableCalled),
                    timerPaused: timer.isTargetPaused(scheduled(this)),
                    oldScheduled: timer.isScheduled(this.oldTimer, scheduled(this)),
                    replacementScheduled: timer.isScheduled(this.replacementTimer, scheduled(this)),
                    parkedScheduled: timer.isScheduled(this.parkedTimer, scheduled(this)),
                    workScheduled: timer.isScheduled(this.workTimer, scheduled(this)),
                    starts: this.starts,
                    updates: this.updates,
                });
            }
            protected onLoad(): void {
                this.record('onLoad-enter');
                super.onLoad();
                this.record('onLoad-super-returned');
                if (fixture.expected === 'onload-self-disable-collider') {
                    this.enabled = false;
                    this.record('onLoad-self-disabled');
                }
                this.record('onLoad-return');
            }
            protected onEnable(): void {
                this.record('onEnable-enter');
                super.onEnable();
                this.record('onEnable-super-returned');
                if (fixture.expected === 'ondisable-replace-timer') this.schedule(this.oldTimer, 0);
                if (fixture.expected === 'onenable-schedule-work' && this.armEnableWork) {
                    this.scheduleOnce(this.workTimer, 0);
                    this.record('onEnable-new-work-before-completion');
                }
                this.record('onEnable-return');
            }
            protected onDisable(): void {
                this.record('onDisable-enter');
                super.onDisable();
                this.record('onDisable-super-returned');
                if (fixture.expected === 'ondisable-replace-timer') {
                    this.unschedule(this.oldTimer);
                    this.record('onDisable-old-unscheduled');
                    this.schedule(this.replacementTimer, 0);
                    this.record('onDisable-replacement-before-completion');
                }
                this.record('onDisable-return');
            }
            protected start(): void {
                this.starts++;
                this.record('start');
            }
            protected update(): void {
                this.updates++;
                this.record('update');
            }
        }
        check(
            'C01 exact owned lease acquired before any actual native frame',
            clock.stepping &&
                clock.stepped === 0 &&
                game.isPaused() &&
                (game as any)._pacer?._isPlaying === false &&
                owner().gameControl.manual === true &&
                owner().gameControl.aggregatePaused === false &&
                native() === 0 &&
                commandCalls().length === 0,
            {
                stepped: clock.stepped,
                paused: game.isPaused(),
                playing: (game as any)._pacer?._isPlaying,
                owner: owner(),
                native: native(),
            },
        );
        const node = new Node('actual-activation-body');
        node.setPosition(0, 10, 0);
        const body = node.addComponent(ActivationBody);
        body.type = ERigidBodyType.KINEMATIC;
        body.mass = 1;
        body.useGravity = false;
        body.linearDamping = 0;
        body.angularDamping = 0;
        const collider = node.addComponent(BoxCollider);
        collider.center = new Vec3(0.5, 0.25, -0.125);
        const nativeBodiesBefore = fixture.bodies().length;
        check(
            'C02 detached original Node has not manually activated any component',
            !node.activeInHierarchy && events.length === 0 && body.body === null,
            { active: node.activeInHierarchy, events, adapter: body.body, nativeBodiesBefore },
        );
        // This actual parent change enters NodeActivator.activateNode and queued onLoad/onEnable.
        scene.addChild(node);
        const ids = fixture.bodies();
        if (ids.length !== nativeBodiesBefore + 1) throw new Error('Expected one real shared native body');
        const id = ids[nativeBodiesBefore];
        const state = () => binding.bodyState(token, id);
        const nativePose = () => Array.from(binding.bodyTransforms(token, [id])).slice(0, 7);
        const nodePose = () => {
            const p = node.worldPosition,
                q = node.worldRotation;
            return [p.x, p.y, p.z, q.x, q.y, q.z, q.w];
        };
        const facts = () => ({
            enabled: body.enabled,
            enabledInHierarchy: body.enabledInHierarchy,
            scheduledFlag: !!(body._objFlags & CCObjectFlags.IsOnEnableCalled),
            onLoadCalled: !!body._isOnLoadCalled,
            active: node.activeInHierarchy,
            colliderEnabled: collider.enabledInHierarchy,
            timerPaused: timer.isTargetPaused(scheduled(body)),
            state: state(),
            pose: nativePose(),
            nodePose: nodePose(),
            starts: body.starts,
            updates: body.updates,
            oldCalls: body.oldCalls,
            replacementCalls: body.replacementCalls,
            parkedCalls: body.parkedCalls,
            workCalls: body.workCalls,
            native: native(),
            owner: owner(),
        });
        const acquire = () => {
            const handle = world.createKinematicTarget(body);
            handles.push(handle);
            return handle;
        };
        const eventNames = () => events.map((row) => row.event);
        const eventCount = (name: string) => events.filter((row) => row.event === name).length;
        const step = async (label: string) => {
            const before = {
                clock: clock!.stepped,
                director: director.getTotalFrames(),
                native: native(),
                calls: commandCalls().length,
            };
            activeFrame = before.clock + 1;
            const receipt = await clock!.step(DT);
            const rows = commandCalls().slice(before.calls);
            const after = { clock: clock!.stepped, director: director.getTotalFrames(), native: native() };
            const frame = { label, before, after, receipt, rows, facts: facts(), events: copy(events) };
            frames.push(frame);
            check(
                'F ' + label + ' is one original Director frame and one native step',
                receipt.afterDraw === true &&
                    receipt.step === before.clock + 1 &&
                    receipt.dt === DT &&
                    after.clock === before.clock + 1 &&
                    after.director === before.director + 1 &&
                    after.native === before.native + 1 &&
                    rows.filter((row) => row.name === 'step' && row.returned).length === 1 &&
                    rows.filter((row) => row.name === 'step').length === 1,
                frame,
            );
            activeFrame = 0;
            return frame;
        };
        const batchKinds = (frame: any) =>
            frame.rows
                .filter((row: any) => row.name === 'applyCommandBatch')
                .flatMap((row: any) => row.args[1].map((op: any) => op.kind));
        const targetMotion = (label: string, frame: any, before: any, requested: number[]) => {
            const prediction = translationOracle(before.pose.slice(0, 3), before.state.localCenter, requested);
            const actual = frame.facts,
                operations = frame.rows
                    .filter((row: any) => row.name === 'applyCommandBatch')
                    .flatMap((row: any) => row.result?.operations ?? []);
            check(
                label + ' target is consumed once with finite independent native movement and Node writeback',
                same(
                    frame.rows.map((row: any) => row.name),
                    ['validateCommandBatch', 'applyCommandBatch', 'step'],
                ) &&
                    frame.rows.every((row: any) => row.returned) &&
                    same(batchKinds(frame), ['target']) &&
                    vector(
                        actual.state.linearVelocity,
                        prediction.velocity,
                        5e-5 * Math.max(1, norm(prediction.velocity)),
                    ) &&
                    vector(
                        operations[0]?.plan.linearVelocity,
                        prediction.velocity,
                        5e-5 * Math.max(1, norm(prediction.velocity)),
                    ) &&
                    norm(actual.state.linearVelocity) > 0 &&
                    vector(actual.pose.slice(0, 3), prediction.origin) &&
                    vector(actual.pose.slice(3), [0, 0, 0, 1]) &&
                    vector(actual.nodePose, actual.pose) &&
                    zeros(actual.state.angularVelocity),
                { prediction, requested, actual, operations, rows: frame.rows },
            );
        };
        const idleZero = (label: string, frame: any, previousPose: number[]) => {
            const batch = frame.rows.find((row: any) => row.name === 'applyCommandBatch');
            check(
                label + ' following owned frame consumes only idle paired zero',
                same(
                    frame.rows.map((row: any) => row.name),
                    ['validateCommandBatch', 'applyCommandBatch', 'step'],
                ) &&
                    frame.rows.every((row: any) => row.returned) &&
                    same(batchKinds(frame), ['pairedClear']) &&
                    batch?.args[1][0].reason === 'idle' &&
                    zeros(frame.facts.state.linearVelocity) &&
                    zeros(frame.facts.state.angularVelocity) &&
                    vector(frame.facts.pose, previousPose) &&
                    vector(frame.facts.nodePose, previousPose),
                frame,
            );
        };
        check(
            'C03 real NodeActivator completed onLoad and live collider shares one native body',
            node.activeInHierarchy &&
                body._isOnLoadCalled !== 0 &&
                body.body !== null &&
                collider.enabledInHierarchy &&
                state().enabled &&
                state().type === 1 &&
                fixture.bodies().length === nativeBodiesBefore + 1 &&
                eventCount('onLoad-enter') === 1 &&
                eventCount('onLoad-super-returned') === 1 &&
                eventCount('onLoad-return') === 1,
            { facts: facts(), events, bodyIds: ids },
        );
        fixture.checkpoint('actual-node-activation', { facts: facts(), events });
        if (fixture.expected === 'onload-self-disable-collider') {
            check(
                'L01 queued NodeActivator enable is skipped after legitimate onLoad self-disable',
                same(eventNames(), [
                    'onLoad-enter',
                    'onLoad-super-returned',
                    'onLoad-self-disabled',
                    'onLoad-return',
                ]) &&
                    !body.enabled &&
                    !body.enabledInHierarchy &&
                    !(body._objFlags & CCObjectFlags.IsOnEnableCalled) &&
                    state().enabled &&
                    eventCount('onEnable-enter') === 0 &&
                    eventCount('onDisable-enter') === 0,
                { facts: facts(), events },
            );
            const refused = attempt(() => world.createKinematicTarget(body));
            const disabledPose = nativePose();
            const disabledFrames = [await step('L-disabled-1'), await step('L-disabled-2')];
            check(
                'L02 collider-only owned frames cannot activate disabled body or acquire target',
                refused.threw &&
                    body.starts === 0 &&
                    body.updates === 0 &&
                    disabledFrames.every(
                        (frame) => vector(frame.facts.pose, disabledPose) && !batchKinds(frame).includes('target'),
                    ) &&
                    owner().targets.active === 0 &&
                    owner().targets.guards === 0,
                { refused: failure(refused), frames: disabledFrames, facts: facts() },
            );
            body.enabled = true;
            const first = acquire(),
                firstBefore = facts(),
                requested = [1 / 16, 10 + 1 / 32, -1 / 64];
            first.setTarget(makePose(requested));
            const motion = await step('L-enabled-motion');
            targetMotion('L03', motion, firstBefore, requested);
            check(
                'L04 later legitimate enable runs original completion and start exactly once',
                body.enabledInHierarchy &&
                    !!(body._objFlags & CCObjectFlags.IsOnEnableCalled) &&
                    eventCount('onEnable-enter') === 1 &&
                    eventCount('onEnable-super-returned') === 1 &&
                    body.starts === 1 &&
                    body.updates === 1,
                { facts: facts(), events },
            );
            // Retire this real generation before asking for another target. No old identity may revive.
            body.enabled = false;
            const retired = staleProbe(first),
                zeroAfterDisable = facts();
            body.enabled = true;
            const fresh = acquire(),
                oldAfterReenable = staleProbe(first),
                freshBefore = facts(),
                requestedAgain = [1 / 8, 10, 0];
            fresh.setTarget(makePose(requestedAgain));
            const nextMotion = await step('L-fresh-generation-motion');
            targetMotion('L05', nextMotion, freshBefore, requestedAgain);
            check(
                'L06 subsequent enable requires fresh target while same collider-owned native body survives',
                fresh !== first &&
                    staleRejected(retired) &&
                    staleRejected(oldAfterReenable) &&
                    zeros(zeroAfterDisable.state.linearVelocity) &&
                    zeros(zeroAfterDisable.state.angularVelocity) &&
                    zeroAfterDisable.state.enabled &&
                    zeroAfterDisable.owner.targets.active === 0 &&
                    fixture.bodies().length === nativeBodiesBefore + 1 &&
                    body.starts === 1 &&
                    body.updates === 2 &&
                    eventCount('onLoad-enter') === 1 &&
                    eventCount('onEnable-enter') === 2 &&
                    eventCount('onDisable-enter') === 1,
                { retired, oldAfterReenable, zeroAfterDisable, facts: facts(), events },
            );
            idleZero('L07', await step('L-idle-zero'), nextMotion.facts.pose);
        } else if (fixture.expected === 'ondisable-replace-timer') {
            const handle = acquire(),
                before = facts(),
                requested = [1 / 16, 10 + 1 / 32, -1 / 64];
            handle.setTarget(makePose(requested));
            const motion = await step('D-old-timer-prime-motion');
            targetMotion('D01', motion, before, requested);
            check(
                'D02 newly scheduled zero-interval old timer primes without firing on first real frame',
                body.oldCalls === 0 &&
                    body.starts === 1 &&
                    body.updates === 1 &&
                    timer.isScheduled(body.oldTimer, scheduled(body)) &&
                    !timer.isTargetPaused(scheduled(body)),
                { facts: facts(), events },
            );
            // Keep real motion nonzero in frame two, when the already primed old timer fires.
            const secondBefore = facts(),
                secondRequested = [1 / 8, 10, 0];
            handle.setTarget(makePose(secondRequested));
            const second = await step('D-old-timer-fires-motion');
            targetMotion('D03', second, secondBefore, secondRequested);
            check(
                'D04 original scheduled callback really fires before lifecycle replacement',
                body.oldCalls === 1 && body.starts === 1 && body.updates === 2 && norm(state().linearVelocity) > 0,
                { facts: facts(), events },
            );
            handle.setTarget(makePose([1 / 4, 10, 0]));
            const pendingBeforeDisable = owner().pendingCommands,
                callStart = allCalls().length,
                tickBeforeDisable = native();
            body.enabled = false;
            const transition = allCalls().slice(callStart),
                replacement = events.find((row) => row.event === 'onDisable-replacement-before-completion');
            const removed = events.find((row) => row.event === 'onDisable-old-unscheduled');
            const old = staleProbe(handle),
                afterDisable = facts();
            check(
                'D05 legal callback removes old timer then schedules current replacement before original pause',
                eventCount('onDisable-enter') === 1 &&
                    eventCount('onDisable-super-returned') === 1 &&
                    removed?.oldScheduled === false &&
                    removed?.replacementScheduled === false &&
                    replacement?.oldScheduled === false &&
                    replacement?.replacementScheduled === true &&
                    replacement?.timerPaused === false &&
                    timer.isScheduled(body.replacementTimer, scheduled(body)) &&
                    !timer.isScheduled(body.oldTimer, scheduled(body)) &&
                    timer.isTargetPaused(scheduled(body)) &&
                    !body.enabledInHierarchy &&
                    !(body._objFlags & CCObjectFlags.IsOnEnableCalled),
                { removed, replacement, afterDisable, events },
            );
            const clearRows = transition.filter((row) => row.name === 'clearBodyVelocity');
            check(
                'D06 actual disable clears native velocity and retires queued target while collider stays enabled',
                pendingBeforeDisable === 1 &&
                    owner().pendingCommands === 0 &&
                    native() === tickBeforeDisable &&
                    clearRows.length === 1 &&
                    clearRows[0].returned &&
                    clearRows[0].beforeNativeTick === tickBeforeDisable &&
                    clearRows[0].afterNativeTick === tickBeforeDisable &&
                    clearRows[0].beforeNativeState?.enabled &&
                    clearRows[0].afterNativeState?.enabled &&
                    clearRows[0].afterNativeState?.type === 1 &&
                    zeros(afterDisable.state.linearVelocity) &&
                    zeros(afterDisable.state.angularVelocity) &&
                    afterDisable.state.enabled &&
                    collider.enabledInHierarchy &&
                    staleRejected(old) &&
                    owner().targets.active === 0 &&
                    owner().targets.protected === 0 &&
                    owner().targets.guards === 0,
                { pendingBeforeDisable, transition, old, afterDisable },
            );
            const disabledFrames = [await step('D-disabled-1'), await step('D-disabled-2'), await step('D-disabled-3')];
            check(
                'D07 real disabled frames execute neither replacement nor old timer and never replay retired target',
                body.oldCalls === 1 &&
                    body.replacementCalls === 0 &&
                    body.starts === 1 &&
                    body.updates === 2 &&
                    disabledFrames.every(
                        (frame) =>
                            !batchKinds(frame).includes('target') &&
                            vector(frame.facts.pose, afterDisable.pose) &&
                            zeros(frame.facts.state.linearVelocity) &&
                            zeros(frame.facts.state.angularVelocity) &&
                            frame.facts.timerPaused,
                    ) &&
                    timer.isScheduled(body.replacementTimer, scheduled(body)) &&
                    !timer.isScheduled(body.oldTimer, scheduled(body)) &&
                    fixture.bodies().length === nativeBodiesBefore + 1,
                { frames: disabledFrames, events, facts: facts() },
            );
        } else if (fixture.expected === 'onenable-schedule-work') {
            // Existing parked entry establishes true paused state before onEnable adds new work.
            // No private timer entry is installed and no pause/resume helper is called by the fixture.
            body.schedule(body.parkedTimer, 0);
            body.enabled = false;
            const disabled = facts();
            body.armEnableWork = true;
            body.enabled = true;
            const inserted = events.find((row) => row.event === 'onEnable-new-work-before-completion');
            check(
                'E01 actual enable callback schedules work into paused entry and original completion resumes it',
                disabled.timerPaused &&
                    disabled.starts === 0 &&
                    disabled.updates === 0 &&
                    inserted?.timerPaused === true &&
                    inserted?.workScheduled === true &&
                    inserted?.parkedScheduled === true &&
                    timer.isScheduled(body.workTimer, scheduled(body)) &&
                    timer.isScheduled(body.parkedTimer, scheduled(body)) &&
                    !timer.isTargetPaused(scheduled(body)) &&
                    body.enabledInHierarchy &&
                    !!(body._objFlags & CCObjectFlags.IsOnEnableCalled) &&
                    eventCount('onEnable-enter') === 2 &&
                    eventCount('onDisable-enter') === 1,
                { disabled, inserted, facts: facts(), events },
            );
            body.timerTarget = acquire();
            const initial = facts();
            const prime = await step('E-new-work-prime');
            check(
                'E02 first resumed frame runs original start and update while both new timers only prime',
                body.starts === 1 &&
                    body.updates === 1 &&
                    body.workCalls === 0 &&
                    body.parkedCalls === 0 &&
                    vector(prime.facts.pose, initial.pose) &&
                    !batchKinds(prime).includes('target'),
                { frame: prime, events },
            );
            const beforeCallback = facts(),
                work = await step('E-new-work-callback-motion');
            targetMotion('E03', work, beforeCallback, [1 / 16, 10 + 1 / 32, -1 / 64]);
            const callback = events.find((row) => row.event === 'work-timer-before-target');
            check(
                'E04 second resumed frame executes one-shot work before its same-frame native consumption',
                body.starts === 1 &&
                    body.updates === 2 &&
                    body.workCalls === 1 &&
                    body.parkedCalls === 1 &&
                    callback?.frame === work.receipt.step &&
                    callback?.native === work.before.native &&
                    !timer.isScheduled(body.workTimer, scheduled(body)) &&
                    timer.isScheduled(body.parkedTimer, scheduled(body)) &&
                    eventNames().indexOf('start') < eventNames().indexOf('update') &&
                    events.filter((row) => row.event === 'update' && row.frame === work.receipt.step).length === 1,
                { callback, work, facts: facts(), events },
            );
            const idle = await step('E-one-shot-retired-idle');
            idleZero('E05', idle, work.facts.pose);
            check(
                'E06 no repeated start or one-shot callback after another ordinary owned frame',
                body.starts === 1 &&
                    body.updates === 3 &&
                    body.workCalls === 1 &&
                    body.parkedCalls === 2 &&
                    eventCount('onLoad-enter') === 1 &&
                    eventCount('onEnable-super-returned') === 2,
                { facts: facts(), events },
            );
        } else throw new Error('Case missing from exact three-case activation roster: ' + fixture.expected);
        check(
            'C04 no temporary scope remains and no public capability is promoted',
            owner().activeTemporaryScopes === 0 &&
                owner().stagedCommandsSupported === false &&
                owner().unifiedTransactionsSupported === false,
            owner(),
        );
        fixture.checkpoint('before-actual-app-close', {
            checks,
            frames,
            events,
            facts: facts(),
            world: world.diagnostics(),
        });
        const close = await app.close!();
        closed = true;
        const observations = fixture.observations();
        // These are positive cases: released is required. A natural late failure remains failed,
        // with its original raw close receipt; historical latefault failed-close evidence is not reused.
        check(
            'C05 actual positive app.close releases native resources and ownership',
            close.status === 'released' &&
                close.failures.length === 0 &&
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
        const stale = handles.map(staleProbe);
        check(
            'C06 every retained target remains terminal after close',
            handles.length > 0 && stale.every(staleRejected),
            stale,
        );
        const terminal = () => ({
            paused: game.isPaused(),
            playing: (game as any)._pacer?._isPlaying ?? null,
            stepped: clock!.stepped,
        });
        const terminalBefore = terminal(),
            retainedStep = await attemptAsync(() => clock!.step(DT)),
            retainedEnd = attempt(() => clock!.end()),
            retainedBegin = attempt(() => clock!.begin()),
            terminalAfter = terminal();
        check(
            'C07 retained exact clock cannot step resume or reacquire after actual close',
            retainedStep.threw &&
                retainedEnd.threw &&
                retainedBegin.threw &&
                terminalAfter.paused &&
                terminalAfter.playing === false &&
                same(terminalBefore, terminalAfter),
            {
                retainedStep: failure(retainedStep),
                retainedEnd: failure(retainedEnd),
                retainedBegin: failure(retainedBegin),
                terminalBefore,
                terminalAfter,
            },
        );
        fixture.checkpoint('final-checks', {
            case: fixture.expected,
            checks,
            frames,
            events,
            formalCells: { total: 2128, status: 'NOT_RUN' },
            gates: { total: 9, status: 'NOT_RUN' },
            notCovered: [
                'browser',
                'nonzero COM',
                'persist-scene transfer',
                'multi-app',
                'arbitrary reentrant callbacks',
                'full lifetime matrix',
            ],
        });
        expect(checks.filter((row) => !row.pass)).toEqual([]);
        fixture.complete('PASS_LIMITED_ACTIVATION');
    } catch (error) {
        fixture.checkpoint('failed-checks', { checks, frames, events });
        fixture.fail(error);
        throw error;
    } finally {
        if (app && !closed) {
            try {
                fixture.checkpoint('finally-app-close', await app.close!());
            } catch (error) {
                fixture.checkpoint('finally-close-error', { error: String(error) });
            }
        }
    }
});
