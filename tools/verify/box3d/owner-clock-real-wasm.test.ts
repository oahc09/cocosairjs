/* Copyright (c) 2026-2027 oahc09@gmail.com. SPDX-License-Identifier: MIT
 * DRAFT / NOT_RUN. Original Game/Director/AIR clock and unchanged real N4.
 * HEADLESS runtime and delivered systemInfo events are not browser visibility/GPU qualification.
 */
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
import { Component } from '../../../src/cocos/scene-graph/component';
import { Node } from '../../../src/cocos/scene-graph/node';
import { Scene } from '../../../src/cocos/scene-graph/scene';
import { director, game, Director } from '../../../src/cocos/game';
import { systemInfo } from 'pal/system-info';
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
    complete(status: 'PASS_LIMITED_GAME_CLOCK'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_CLOCK_FIXTURE__: Fixture;
const fixture = __BOX3D_CLOCK_FIXTURE__;
const DT = 1 / 60;
const copy = (v: unknown): any =>
    v === undefined ? null : JSON.parse(JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? String(x) : x)));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const zeros = (v: readonly number[]) => v.length === 3 && v.every((n) => n === 0);
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
const failure = (r: { threw: boolean; error: unknown }) => ({
    threw: r.threw,
    error: String(r.error),
    code: (r.error as any)?.code ?? null,
});
const pose = (x: number) => ({
    position: { x, y: 10, z: 0 },
    rotation: { x: 0, y: 0, z: 0, w: 1 },
});
test('finite actual Game reason and owned clock case', async () => {
    let app: AirApp | undefined,
        clock: AirStepClock | undefined,
        closed = false,
        expectedFaultedClose = false;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
    const check = (id: string, pass: boolean, actual: unknown) => checks.push({ id, pass, actual: copy(actual) });
    const cleanup: Array<() => void> = [];
    const onDirector = (event: string, fn: (...args: any[]) => void) => {
        director.on(event, fn);
        cleanup.push(() => director.off(event, fn));
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
            physicsOptions: {
                box3d: { threading: 'single', workerCount: 1, solverSubSteps: 4 },
            },
        });
        // Startup pause is an application reason, not a free manual-clock bypass.
        clock = createStepClock({ frameRate: 60, stepTimeoutMs: 2000 });
        const startupBefore = {
            paused: game.isPaused(),
            playing: (game as any)._pacer?._isPlaying ?? null,
            native: fixture.binding().stepDiagnostics(fixture.token()).nativeStepIndex,
        };
        const startupAcquire = attempt(() => clock!.begin());
        const startupAfter = {
            paused: game.isPaused(),
            playing: (game as any)._pacer?._isPlaying ?? null,
            native: fixture.binding().stepDiagnostics(fixture.token()).nativeStepIndex,
        };
        check(
            'startup application pause rejects acquire without changing source or native state',
            startupAcquire.threw && startupBefore.paused && same(startupBefore, startupAfter) && !clock.stepping,
            {
                result: failure(startupAcquire),
                before: startupBefore,
                after: startupAfter,
            },
        );
        const scene = new Scene('actual-clock-' + fixture.expected);
        let businessFrames = 0,
            businessTime = 0;
        class BusinessCounter extends Component {
            update(dt: number): void {
                businessFrames++;
                businessTime += dt;
            }
        }
        const business = new Node('actual-business-counter');
        business.addComponent(BusinessCounter);
        scene.addChild(business);
        // Original app.run clears startup intent through game.run/resume. Acquire
        // synchronously before the first scheduled pacer callback; no await gap.
        app.run(scene);
        clock.begin();
        const system = PhysicsSystem.instance,
            world = system.physicsWorld as Box3DPhysicsWorld;
        system.gravity = new Vec3(0, 0, 0);
        system.fixedTimeStep = DT;
        system.maxSubSteps = 1;
        system.autoSimulation = true;
        const makeBody = (name: string, x: number, type = ERigidBodyType.KINEMATIC) => {
            const node = new Node(name);
            node.setPosition(x, 10, 0);
            const body = node.addComponent(RigidBody);
            body.type = type;
            body.mass = 1;
            body.useGravity = false;
            body.linearDamping = 0;
            body.angularDamping = 0;
            node.addComponent(BoxCollider);
            const i = fixture.bodies().length;
            scene.addChild(node);
            if (fixture.bodies().length !== i + 1) throw new Error('Expected exactly one actual native body');
            return { node, body, id: fixture.bodies()[i] };
        };
        const a = makeBody('target', 0),
            dynamic = makeBody('dynamic', 8, ERigidBodyType.DYNAMIC);
        const handle = world.createKinematicTarget(a.body),
            binding = fixture.binding(),
            token = fixture.token();
        const native = () => binding.stepDiagnostics(token).nativeStepIndex;
        const state = (subject = a) => binding.bodyState(token, subject.id);
        const nativePose = () => Array.from(binding.bodyTransforms(token, [a.id])).slice(0, 7);
        const owner = () => world.diagnostics().commandOwner;
        const calls = () => fixture.observations().calls as any[];
        const mutations = () =>
            calls().filter((r) =>
                ['validateCommandBatch', 'applyCommandBatch', 'step', 'clearBodyVelocity'].includes(r.name),
            );
        // Read actual PAL field only; no replacement of start/stop, source callbacks or ownership.
        const pacing = () => ({
            paused: game.isPaused(),
            playing: (game as any)._pacer?._isPlaying ?? null,
        });
        const snapshot = () => ({
            native: native(),
            accumulator: (system as any)._accumulator,
            businessFrames,
            businessTime,
            state: state(),
            dynamic: state(dynamic),
            pose: nativePose(),
            pacing: pacing(),
            owner: owner(),
        });
        const pending = () => owner().pendingCommands;
        const rejectedTarget = () => {
            let reads = 0;
            const target = {
                get position() {
                    reads++;
                    return { x: 2, y: 10, z: 0 };
                },
                get rotation() {
                    reads++;
                    return { x: 0, y: 0, z: 0, w: 1 };
                },
            };
            const result = attempt(() => handle.setTarget(target));
            return { reads, ...failure(result) };
        };
        check(
            'original owned begin stops real pacer without semantic owner pause',
            clock.stepping && pacing().paused && pacing().playing === false && pending() === 0 && native() === 0,
            snapshot(),
        );
        fixture.checkpoint('initial-actual-clock', snapshot());
        if (fixture.expected === 'application-pause-fresh-input') {
            handle.setTarget(pose(1 / 16));
            await clock.step(DT);
            handle.setTarget(pose(1 / 8));
            dynamic.body.applyImpulse(new Vec3(0.25, 0, 0));
            const before = snapshot(),
                callsBefore = mutations().length;
            game.pause();
            const paused = snapshot(),
                probe = rejectedTarget();
            const rejected = [
                attempt(() => game.step()),
                attempt(() => director.tick(DT)),
                attempt(() => system.step(DT)),
            ];
            const clockRejected = await attemptAsync(() => clock!.step(DT));
            check(
                'ordinary pause clears accepted movement but retains exact target protection without native work',
                before.owner.pendingCommands === 2 &&
                    pending() === 0 &&
                    owner().targets.active === 1 &&
                    owner().targets.guards === 1 &&
                    mutations().length === callsBefore &&
                    same(state(), before.state),
                { before, paused },
            );
            check(
                'all paused entries reject before caller reads, business time or native advancement',
                probe.threw &&
                    probe.reads === 0 &&
                    rejected.every((r) => r.threw) &&
                    clockRejected.threw &&
                    native() === before.native &&
                    businessFrames === before.businessFrames &&
                    businessTime === before.businessTime,
                {
                    probe,
                    rejected: rejected.map(failure),
                    clockRejected: failure(clockRejected),
                    after: snapshot(),
                },
            );
            game.resume();
            check(
                'ordinary resume leaves the sole owned pacer stopped and does not restore old pending input',
                pacing().paused && pacing().playing === false && clock.stepping && pending() === 0,
                snapshot(),
            );
            const first = await clock.step(DT);
            check(
                'first resumed original frame consumes idle zero, not old target or impulse',
                first.afterDraw &&
                    native() === before.native + 1 &&
                    businessFrames === before.businessFrames + 1 &&
                    same(nativePose(), before.pose) &&
                    zeros(state().linearVelocity) &&
                    zeros(state().angularVelocity) &&
                    zeros(state(dynamic).linearVelocity),
                snapshot(),
            );
            handle.setTarget(pose(3 / 16));
            await clock.step(DT);
            check(
                'fresh post-resume target advances one native tick and really moves',
                native() === before.native + 2 && state().linearVelocity[0] > 0 && nativePose()[0] > before.pose[0],
                snapshot(),
            );
        } else if (fixture.expected === 'owned-clock-entry-and-late-error') {
            const foreign = createStepClock(),
                foreignBegin = attempt(() => foreign.begin());
            const foreignStep = await attemptAsync(() => foreign.step(DT));
            const direct = [
                attempt(() => game.step()),
                attempt(() => director.tick(DT)),
                attempt(() => system.step(DT)),
            ];
            check(
                'foreign and unarmed direct entries cannot enter business/native work',
                foreignBegin.threw &&
                    foreignStep.threw &&
                    direct.every((r) => r.threw) &&
                    businessFrames === 0 &&
                    native() === 0,
                {
                    foreignBegin: failure(foreignBegin),
                    foreignStep: failure(foreignStep),
                    direct: direct.map(failure),
                    after: snapshot(),
                },
            );
            handle.setTarget(pose(1 / 16));
            const firstPromise = clock.step(DT),
                parallel = await attemptAsync(() => clock!.step(DT));
            const first = await firstPromise;
            check(
                'one owned frame succeeds while parallel call is rejected, without second tick',
                first.afterDraw && parallel.threw && native() === 1 && businessFrames === 1 && clock.stepped === 1,
                {
                    first,
                    parallel: failure(parallel),
                    after: snapshot(),
                    stepped: clock.stepped,
                },
            );
            let nested: ReturnType<typeof attempt> | undefined;
            const nestedCallback = () => {
                nested = attempt(() => director.tick(DT));
            };
            onDirector(Director.EVENT_BEFORE_UPDATE, nestedCallback);
            const beforeNested = snapshot(),
                outer = await attemptAsync(() => clock!.step(DT));
            director.off(Director.EVENT_BEFORE_UPDATE, nestedCallback);
            check(
                'nested tick is refused before a second business/native frame',
                !!nested?.threw &&
                    businessFrames <= beforeNested.businessFrames + 1 &&
                    native() <= beforeNested.native + 1,
                {
                    nested: nested ? failure(nested) : null,
                    outer: failure(outer),
                    before: beforeNested,
                    after: snapshot(),
                },
            );
            const late = Object.freeze({
                kind: 'actual-END_FRAME-failure',
                stage: 43,
            });
            const throwLate = () => {
                throw late;
            };
            onDirector(Director.EVENT_END_FRAME, throwLate);
            const beforeLate = snapshot(),
                steppedBefore = clock.stepped;
            const afterDrawThenError = await attemptAsync(() => clock!.step(DT));
            director.off(Director.EVENT_END_FRAME, throwLate);
            check(
                'AFTER_DRAW cannot publish step success before a later original END_FRAME error',
                afterDrawThenError.threw &&
                    afterDrawThenError.error === late &&
                    clock.stepped === steppedBefore &&
                    native() === beforeLate.native + 1 &&
                    businessFrames === beforeLate.businessFrames + 1,
                {
                    result: failure(afterDrawThenError),
                    sameError: afterDrawThenError.error === late,
                    steppedBefore,
                    steppedAfter: clock.stepped,
                    before: beforeLate,
                    after: snapshot(),
                },
            );
            const recovered = await clock.step(DT);
            check(
                'later fresh frame has no leaked listener/pending promise or replayed target',
                recovered.afterDraw &&
                    clock.stepped === steppedBefore + 1 &&
                    native() === beforeLate.native + 2 &&
                    zeros(state().linearVelocity),
                snapshot(),
            );
            clock.end();
            const afterEnd = await attemptAsync(() => clock!.step(DT));
            check(
                'ended handle does not step and exact end releases the native pacer stop',
                afterEnd.threw && !clock.stepping && !game.isPaused() && pacing().playing === true,
                { afterEnd: failure(afterEnd), pacing: pacing() },
            );
            clock.begin();
        } else if (fixture.expected === 'background-overlap') {
            handle.setTarget(pose(1 / 16));
            const before = snapshot(),
                beforeCalls = mutations().length;
            (systemInfo as typeof systemInfo & { emit(event: 'hide' | 'show'): void }).emit('hide');
            const hidden = snapshot(),
                probe = rejectedTarget(),
                hiddenStep = await attemptAsync(() => clock!.step(DT));
            check(
                'delivered engine hide is a distinct reason while the real pacer is already manually paused',
                hidden.pacing.paused &&
                    hidden.pacing.playing === false &&
                    clock.stepping &&
                    pending() === 0 &&
                    probe.threw &&
                    probe.reads === 0 &&
                    hiddenStep.threw &&
                    native() === before.native &&
                    mutations().length === beforeCalls,
                { before, hidden, probe, hiddenStep: failure(hiddenStep) },
            );
            game.pause();
            (systemInfo as typeof systemInfo & { emit(event: 'hide' | 'show'): void }).emit('show');
            const overlap = await attemptAsync(() => clock!.step(DT));
            check(
                'show does not consume an independent ordinary application pause',
                overlap.threw && native() === before.native && pacing().playing === false,
                { overlap: failure(overlap), after: snapshot() },
            );
            game.resume();
            await clock.step(DT);
            check(
                'clearing only the final application reason restores exact owned stepping, not pacer',
                native() === before.native + 1 && clock.stepping && pacing().playing === false,
                snapshot(),
            );
            (systemInfo as typeof systemInfo & { emit(event: 'hide' | 'show'): void }).emit('hide');
            clock.end();
            check(
                'manual end while hidden cannot resume the pacer or accept target intent',
                !clock.stepping && game.isPaused() && pacing().playing === false && rejectedTarget().threw,
                snapshot(),
            );
            (systemInfo as typeof systemInfo & { emit(event: 'hide' | 'show'): void }).emit('show');
            clock.begin();
            check(
                'fresh exact manual acquisition after show retains one owner',
                clock.stepping && pacing().playing === false,
                snapshot(),
            );
        } else if (fixture.expected === 'before-physics-and-caught-reentry') {
            handle.setTarget(pose(1 / 16));
            const before = snapshot(),
                accumulator = (system as any)._accumulator;
            // 2D and 3D emit the same Director event. Identify the actual 3D
            // post-accumulation point by read-only accumulator observation, not
            // event ordinal or a replacement of either PhysicsSystem method.
            const beforePhysicsPoints: Array<{
                accumulator: number;
                native: number;
                pausedHere: boolean;
            }> = [];
            const actualSystemOrder = (director as any)._systems.map((entry: any) => ({
                id: entry.id,
                priority: entry.priority,
            }));
            let pausedAt3DPoint = 0;
            const pauseBefore = () => {
                const actualAccumulator = (system as any)._accumulator;
                const pausedHere = pausedAt3DPoint === 0 && actualAccumulator === accumulator + DT;
                beforePhysicsPoints.push({
                    accumulator: actualAccumulator,
                    native: native(),
                    pausedHere,
                });
                if (pausedHere) {
                    pausedAt3DPoint++;
                    game.pause();
                }
            };
            onDirector(Director.EVENT_BEFORE_PHYSICS, pauseBefore);
            await clock.step(DT);
            director.off(Director.EVENT_BEFORE_PHYSICS, pauseBefore);
            check(
                'actual 3D post-accumulation BEFORE_PHYSICS pause prevents imminent solver and retains sole backlog',
                pausedAt3DPoint === 1 &&
                    beforePhysicsPoints.filter((point) => point.pausedHere).length === 1 &&
                    native() === before.native &&
                    pending() === 0 &&
                    (system as any)._accumulator === accumulator + DT &&
                    businessFrames === before.businessFrames + 1,
                {
                    before,
                    after: snapshot(),
                    accumulatorBefore: accumulator,
                    accumulatorAfter: (system as any)._accumulator,
                    pausedAt3DPoint,
                    beforePhysicsPoints,
                    actualSystemOrder,
                },
            );
            game.resume();
            await clock.step(DT);
            check(
                'resume consumes at most maxSubSteps and does not replay cancelled movement',
                native() === before.native + 1 &&
                    zeros(state().linearVelocity) &&
                    same(nativePose(), before.pose) &&
                    (system as any)._accumulator >= DT - 1e-12,
                snapshot(),
            );
            handle.setTarget(pose(1 / 8));
            let caught: ReturnType<typeof attempt> | undefined,
                invocations = 0;
            const hook = world.registerCommandHook(() => {
                invocations++;
                dynamic.body.applyImpulse(new Vec3(0.25, 0, 0));
                caught = attempt(() => game.pause());
            });
            const disposeHook = () => hook.dispose();
            cleanup.push(disposeHook);
            const beforeCaught = snapshot(),
                beforeCalls = mutations().length;
            const outer = await attemptAsync(() => clock!.step(DT));
            check(
                'caught producer pause poisons current candidate before Game cache, native work or provisional impulse',
                outer.threw &&
                    !!caught?.threw &&
                    outer.error === caught.error &&
                    invocations === 1 &&
                    native() === beforeCaught.native &&
                    mutations().length === beforeCalls &&
                    same(pacing(), beforeCaught.pacing) &&
                    same(state(), beforeCaught.state) &&
                    same(state(dynamic), beforeCaught.dynamic) &&
                    pending() === beforeCaught.owner.pendingCommands,
                {
                    outer: failure(outer),
                    caught: caught ? failure(caught) : null,
                    sameError: outer.error === caught?.error,
                    before: beforeCaught,
                    after: snapshot(),
                },
            );
            hook.disable();
            await clock.step(DT);
            check(
                'fresh retry consumes retained original target once but never failed provisional impulse',
                native() === beforeCaught.native + 1 && pending() === 0 && zeros(state(dynamic).linearVelocity),
                snapshot(),
            );
            // Dispose the unused hook while the owner is still ready, before the
            // intentionally faulting post-native writeback. Do not hide a late cleanup refusal.
            hook.dispose();
            cleanup.splice(cleanup.indexOf(disposeHook), 1);
            let writebackPause: ReturnType<typeof attempt> | undefined;
            const listener = () => {
                writebackPause = attempt(() => game.pause());
            };
            a.node.on(Node.EventType.TRANSFORM_CHANGED, listener);
            cleanup.push(() => a.node.off(Node.EventType.TRANSFORM_CHANGED, listener));
            handle.setTarget(pose(3 / 16));
            const beforeWriteback = snapshot(),
                steppedBeforeWriteback = clock.stepped;
            const writebackFrame = await attemptAsync(() => clock!.step(DT));
            a.node.off(Node.EventType.TRANSFORM_CHANGED, listener);
            check(
                'caught writeback pause faults with the first error after native work, without receipt or Game publication',
                writebackFrame.threw &&
                    !!writebackPause?.threw &&
                    writebackFrame.error === writebackPause.error &&
                    world.diagnostics().failure.error === writebackPause.error &&
                    owner().phase === 'faulted' &&
                    clock.stepped === steppedBeforeWriteback &&
                    same(pacing(), beforeWriteback.pacing) &&
                    native() === beforeWriteback.native + 1 &&
                    owner().activeTemporaryScopes === 0,
                {
                    writebackPause: writebackPause ? failure(writebackPause) : null,
                    outer: failure(writebackFrame),
                    sameError: writebackFrame.error === writebackPause?.error,
                    storedFirstError: world.diagnostics().failure.error === writebackPause?.error,
                    steppedBeforeWriteback,
                    steppedAfterWriteback: clock.stepped,
                    before: beforeWriteback,
                    after: snapshot(),
                },
            );
            expectedFaultedClose = true;
        } else if (fixture.expected === 'system-overlap-and-producers') {
            let hookCount = 0;
            const hook = world.registerCommandHook(() => {
                hookCount++;
            });
            const continuous = world.registerContinuousCommand(dynamic.body, {
                force: { x: 0.25, y: 0, z: 0 },
            });
            cleanup.push(
                () => hook.dispose(),
                () => continuous.dispose(),
            );
            handle.setTarget(pose(1 / 16));
            const pendingBefore = pending();
            system.autoSimulation = false;
            check(
                'autoSimulation false changes scheduling only, retaining target and continuous intent',
                pending() === pendingBefore && hook.enabled && continuous.enabled,
                snapshot(),
            );
            await clock.step(DT);
            check(
                'owned business frame with automatic scheduling off does not invent a native step',
                native() === 0 && businessFrames === 1 && pending() === pendingBefore && hookCount === 0,
                snapshot(),
            );
            system.autoSimulation = true;
            system.enable = false;
            game.pause();
            system.enable = true;
            const stillAppPaused = await attemptAsync(() => clock!.step(DT));
            check(
                'System re-enable cannot remove independent application pause',
                stillAppPaused.threw && pending() === 0 && !continuous.enabled && hook.enabled && native() === 0,
                {
                    result: failure(stillAppPaused),
                    after: snapshot(),
                    hookCount,
                    continuous: continuous.enabled,
                },
            );
            system.enable = false;
            game.resume();
            await clock.step(DT);
            check(
                'Game resume permits business frame but cannot undo System-disabled native pause',
                native() === 0 && businessFrames === 2 && hookCount === 0 && !continuous.enabled && hook.enabled,
                snapshot(),
            );
            system.enable = true;
            await clock.step(DT);
            check(
                'aggregate resume preserves hook configuration but not continuous enablement or old pending motion',
                native() === 1 &&
                    hookCount === 1 &&
                    !continuous.enabled &&
                    zeros(state(dynamic).linearVelocity) &&
                    zeros(state().linearVelocity),
                snapshot(),
            );
            continuous.enable();
            await clock.step(DT);
            check(
                'continuous force only returns after explicit fresh enable',
                native() === 2 && hookCount === 2 && continuous.enabled && state(dynamic).linearVelocity[0] > 0,
                snapshot(),
            );
        } else if (fixture.expected === 'terminal-close-owned-clock') {
            handle.setTarget(pose(1 / 16));
            await clock.step(DT);
            handle.setTarget(pose(1 / 8));
            game.pause();
            check(
                'terminal case starts with live manual ownership and independent application pause',
                clock.stepping &&
                    pacing().paused &&
                    pacing().playing === false &&
                    pending() === 0 &&
                    owner().targets.guards === 1,
                snapshot(),
            );
        } else throw new Error('Unknown frozen Game clock case: ' + fixture.expected);
        check(
            'temporary owner scopes settle and capability flags remain false',
            owner().activeTemporaryScopes === 0 &&
                !owner().stagedCommandsSupported &&
                !owner().unifiedTransactionsSupported,
            owner(),
        );
        fixture.checkpoint('before-actual-close', {
            checks,
            state: snapshot(),
            stepped: clock.stepped,
        });
        while (cleanup.length) cleanup.pop()!();
        const closeOne = app.close!(),
            closeTwo = app.close!();
        const close = await closeOne;
        closed = true;
        const observed = fixture.observations();
        const expectedCloseStatus = expectedFaultedClose
            ? close.status === 'failed' &&
              close.failures.length === 1 &&
              close.failures[0].label === 'game-clock-terminal' &&
              close.failures[0].message.includes('operation forbidden during faulted')
            : close.status === 'released' && close.failures.length === 0;
        check(
            'original repeated app close shares one receipt and really releases native resources',
            closeOne === closeTwo &&
                expectedCloseStatus &&
                close.physicsPreparation?.status === 'closed' &&
                fixture.loader.diagnostics().status === 'DISPOSED' &&
                observed.calls.filter((r: any) => r.name === 'destroyWorld' && r.returned).length === 1 &&
                observed.beforeBindingDispose?.coreBytes === '0' &&
                observed.beforeBindingDispose?.bridge?.liveBytes === '0' &&
                observed.observationErrors.length === 0 &&
                owner().targets.guards === 0 &&
                owner().nativeOwnership === 'released',
            {
                samePromise: closeOne === closeTwo,
                expectedFaultedClose,
                expectedCloseStatus,
                close,
                beforeBindingDispose: observed.beforeBindingDispose,
                loader: fixture.loader.diagnostics(),
                owner: owner(),
            },
        );
        const beforeClosedCalls = fixture.observations().calls.length,
            retainedStep = await attemptAsync(() => clock!.step(DT)),
            retainedEnd = attempt(() => clock!.end()),
            retainedBegin = attempt(() => clock!.begin());
        const targetAfterClose = rejectedTarget();
        check(
            'terminal retained clocks cannot step or end-resume/reacquire after observer disposal',
            retainedStep.threw &&
                retainedBegin.threw &&
                game.isPaused() &&
                pacing().playing === false &&
                targetAfterClose.threw &&
                targetAfterClose.reads === 0 &&
                fixture.observations().calls.length === beforeClosedCalls,
            {
                retainedStep: failure(retainedStep),
                retainedEnd: failure(retainedEnd),
                retainedBegin: failure(retainedBegin),
                targetAfterClose,
                pacing: pacing(),
            },
        );
        fixture.checkpoint('final-checks', {
            case: fixture.expected,
            checks,
            formalCells: { total: 2128, status: 'NOT_RUN' },
            gates: { total: 9, status: 'NOT_RUN' },
            notCovered: ['browser visibility', 'WebGL', 'persist migration', 'full lifecycle'],
        });
        expect(checks.filter((row) => !row.pass)).toEqual([]);
        fixture.complete('PASS_LIMITED_GAME_CLOCK');
    } catch (error) {
        fixture.checkpoint('failed-checks', { checks });
        fixture.fail(error);
        throw error;
    } finally {
        while (cleanup.length) {
            try {
                cleanup.pop()!();
            } catch (error) {
                fixture.checkpoint('fixture-cleanup-error', { error: String(error) });
            }
        }
        if (app && !closed) {
            try {
                fixture.checkpoint('finally-app-close', await app.close!());
            } catch (error) {
                fixture.checkpoint('finally-close-error', { error: String(error) });
            }
        }
    }
});
