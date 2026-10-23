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
// Four isolated delivery controls, not native numerical faults or inherited target41 checks.
import '../../../src/exports/base';
import { HTML5, BUILD, NODEJS, EDITOR, TEST } from 'internal:constants';
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
    armFailure(method: string, phase: string, outcome: string, world: Box3DWorld, body: Box3DId): Error;
    checkpoint(name: string, value: unknown): void;
    complete(status: 'PASS_LIMITED_LIFECYCLE_FAILURE'): void;
    fail(error: unknown): void;
}
declare const __BOX3D_LIFECYCLE_FAILURE_FIXTURE__: Fixture;
const fixture = __BOX3D_LIFECYCLE_FAILURE_FIXTURE__;
const DT = 1 / 60,
    SUBSTEPS = 4;
const copy = (value: unknown): any =>
    value === undefined
        ? null
        : JSON.parse(JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? String(item) : item)));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const nonzero = (a: readonly number[]) => a.length === 3 && a.every(Number.isFinite) && Math.hypot(...a) > 0;
const zero = (a: readonly number[]) => a.length === 3 && a.every((value) => value === 0);
function attempt(action: () => unknown) {
    try {
        return { threw: false, error: undefined as unknown, value: action() };
    } catch (error) {
        return { threw: true, error, value: undefined };
    }
}
const errorFacts = (error: any) => ({
    message: String(error),
    stack: String(error?.stack ?? error),
    code: error?.code ?? null,
    mutationOutcomeDescriptor: error ? Object.getOwnPropertyDescriptor(error, 'mutationOutcome') : null,
    frozen: error ? Object.isFrozen(error) : false,
});
const outcomeFacts = (result: ReturnType<typeof attempt>) => ({ threw: result.threw, error: errorFacts(result.error) });
const pose = (x: number, zAngle = 0.01) => ({
    position: { x, y: 10 + 1 / 32, z: -1 / 64 },
    rotation: { x: 0, y: 0, z: Math.sin(zAngle), w: Math.cos(zAngle) },
});
test('actual lifecycle preserves pre-mutation component state or faults conservatively after labelled delivery loss', async () => {
    let app: AirApp | undefined,
        closed = false;
    const checks: { id: string; pass: boolean; actual: unknown }[] = [];
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
        // Existing headless scheduling setup only. NOT Game.pause or owned-clock qualification.
        game.pause();
        const system = PhysicsSystem.instance,
            world = system.physicsWorld as Box3DPhysicsWorld;
        system.autoSimulation = false;
        system.gravity = new Vec3(0, 0, 0);
        const scene = new Scene('actual-lifecycle-failure-' + fixture.expected);
        director.runSceneImmediate(scene);
        game.pause();
        const node = new Node('one-actual-rigid-and-surviving-collider');
        node.setPosition(0, 10, 0);
        const body = node.addComponent(RigidBody);
        body.type = ERigidBodyType.KINEMATIC;
        body.mass = 1;
        body.useGravity = false;
        body.linearDamping = 0;
        body.angularDamping = 0;
        const collider = node.addComponent(BoxCollider);
        collider.center = new Vec3(0.5, 0.25, -0.125);
        scene.addChild(node);
        const binding = fixture.binding(),
            token = fixture.token(),
            ids = fixture.bodies();
        if (ids.length !== 1) throw new Error('Fixture requires exactly one actual native body');
        const id = ids[0],
            handle = world.createKinematicTarget(body);
        const owner = () => world.diagnostics().commandOwner;
        const allCalls = () => fixture.observations().calls as any[];
        const state = () => binding.bodyState(token, id);
        const tick = () => binding.stepDiagnostics(token).nativeStepIndex;
        let scheduledCallbacks = 0;
        body.schedule(() => {
            scheduledCallbacks++;
        }, 0);
        function componentFacts() {
            const scheduler = director.getScheduler() as any,
                diagnostic = owner();
            return {
                enabled: body.enabled,
                enabledInHierarchy: body.enabledInHierarchy,
                nodeActiveInHierarchy: node.activeInHierarchy,
                publicType: body.type,
                objFlags: body._objFlags,
                schedulerOnEnableFlag: (body._objFlags & CCObject.Flags.IsOnEnableCalled) !== 0,
                schedulerTargetPaused: scheduler.isTargetPaused(body),
                schedulerTimerEntryPresent: !!scheduler._hashForTimers[body.uuid],
                scheduledCallbacks,
                colliderEnabled: collider.enabled,
                colliderEnabledInHierarchy: collider.enabledInHierarchy,
                ownerComponentCount: diagnostic.components,
                ownerDisabledComponentCount: diagnostic.disabledComponents,
                ownerRigidEnabled: diagnostic.components === 2 && diagnostic.disabledComponents === 0 ? true : null,
                ownerRigidEnabledEvidence:
                    'Aggregate private diagnostics: exactly one rigid plus one collider; 2 components and 0 disabled proves both enabled. Other counts are not guessed.',
                sharedBodyRigidEnabled: 'not exposed; not read or inferred from public cache/native body',
            };
        }
        function snapshot() {
            return copy({
                component: componentFacts(),
                nativeState: state(),
                nativeTick: tick(),
                nativePose: Array.from(binding.bodyTransforms(token, [id])),
                nodePosition: [node.worldPosition.x, node.worldPosition.y, node.worldPosition.z],
                worldState: world.diagnostics().state,
                owner: owner(),
            });
        }
        const constants = { HTML5, BUILD, NODEJS, EDITOR, TEST };
        check(
            'actual compile flags select original Web scheduler callback propagation',
            HTML5 && BUILD && !NODEJS && !EDITOR && !TEST,
            constants,
        );
        handle.setTarget(pose(1 / 16));
        system.step(DT);
        handle.setTarget(pose(1 / 8, 0.02));
        const before = snapshot();
        check(
            'baseline has enabled rigid/collider, actual scheduled target, nonzero native v/w and pending movement',
            before.component.enabled &&
                before.component.enabledInHierarchy &&
                before.component.schedulerOnEnableFlag &&
                !before.component.schedulerTargetPaused &&
                before.component.schedulerTimerEntryPresent &&
                before.component.ownerRigidEnabled === true &&
                before.component.colliderEnabled &&
                before.nativeState.enabled &&
                before.nativeState.type === 1 &&
                nonzero(before.nativeState.linearVelocity) &&
                nonzero(before.nativeState.angularVelocity) &&
                before.nativeTick === 1 &&
                before.owner.pendingCommands === 1 &&
                before.owner.targets.active === 1 &&
                before.owner.targets.guards === 1,
            before,
        );
        const typeCase = fixture.expected === 'type-after-cleanup-not-mutated';
        const notMutated = fixture.expected === 'disable-before-native' || typeCase;
        const method = typeCase ? 'setBodyType' : 'clearBodyVelocity';
        const phase = notMutated ? 'before-delegate' : 'after-delegate';
        const outcome = notMutated
            ? 'not-mutated'
            : fixture.expected === 'after-native-unknown'
              ? 'unknown'
              : 'committed';
        if (
            ![
                'disable-before-native',
                'disable-after-native',
                'type-after-cleanup-not-mutated',
                'after-native-unknown',
            ].includes(fixture.expected)
        )
            throw new Error('Missing frozen lifecycle case: ' + fixture.expected);
        const injected = fixture.armFailure(method, phase, outcome, token, id);
        fixture.checkpoint('before-one-original-public-lifecycle-call', {
            case: fixture.expected,
            constants,
            before,
            injection: { method, phase, outcome, error: errorFacts(injected) },
        });
        const start = allCalls().length;
        let publicSetterCalls = 0;
        const first = attempt(() => {
            publicSetterCalls++;
            if (typeCase) body.type = ERigidBodyType.DYNAMIC;
            else body.enabled = false;
        });
        const rows = allCalls().slice(start),
            after = snapshot(),
            faults = fixture.observations().deliveryFaults;
        check(
            'single exact labelled delivery error reaches original public setter unchanged',
            publicSetterCalls === 1 &&
                first.threw &&
                first.error === injected &&
                faults.length === 1 &&
                faults[0].fired &&
                faults[0].thrownOriginalIdentity &&
                Object.isFrozen(injected) &&
                Object.getOwnPropertyDescriptor(injected, 'mutationOutcome')?.writable === false &&
                Object.getOwnPropertyDescriptor(injected, 'mutationOutcome')?.configurable === false,
            { publicSetterCalls, first: outcomeFacts(first), injected: errorFacts(injected), faults },
        );
        check(
            'lifecycle never advances native tick or replays target commands',
            after.nativeTick === before.nativeTick &&
                rows.every((row) => !['validateCommandBatch', 'applyCommandBatch', 'step'].includes(row.name)) &&
                after.owner.pendingCommands === 0,
            { rows, before, after },
        );
        fixture.checkpoint('first-lifecycle-error-and-real-post-state', {
            first: outcomeFacts(first),
            sameOriginalError: first.error === injected,
            publicSetterCalls,
            rows,
            before,
            after,
            faults,
        });
        if (fixture.expected === 'disable-before-native') {
            const zeroRows = rows.filter((row) => row.name === 'clearBodyVelocity');
            check(
                'known before-delegate refusal has no native cleanup effect and retains protected target ownership',
                zeroRows.length === 1 &&
                    !zeroRows[0].delegateCalled &&
                    !zeroRows[0].delegateReturned &&
                    same(after.nativeState, before.nativeState) &&
                    same(after.nativePose, before.nativePose) &&
                    after.worldState === 'ready' &&
                    after.owner.targets.protected === 1 &&
                    after.owner.targets.guards === 1,
                { zeroRows, before, after },
            );
            // Intentionally RED on uncorrected Component.enabled publication. Never invert to make the bug PASS.
            check(
                'recoverable pre-native refusal preserves original effective component state',
                same(after.component, before.component),
                { before: before.component, after: after.component },
            );
            const protectedStart = allCalls().length,
                protectedTick = attempt(() => system.step(DT));
            const afterProtectedTick = snapshot(),
                protectedRows = allCalls().slice(protectedStart);
            check(
                'separate protected-zero tick settles guard but does not masquerade as component recovery',
                !protectedTick.threw &&
                    afterProtectedTick.nativeTick === before.nativeTick + 1 &&
                    zero(afterProtectedTick.nativeState.linearVelocity) &&
                    zero(afterProtectedTick.nativeState.angularVelocity) &&
                    afterProtectedTick.owner.targets.protected === 0 &&
                    afterProtectedTick.owner.targets.guards === 0 &&
                    same(afterProtectedTick.component, after.component) &&
                    publicSetterCalls === 1 &&
                    protectedRows.filter((row) => row.name === 'applyCommandBatch').length === 1 &&
                    protectedRows
                        .find((row) => row.name === 'applyCommandBatch')
                        ?.args[1].every((op: any) => op.kind === 'pairedClear' && op.reason === 'cleanup'),
                {
                    protectedTick: outcomeFacts(protectedTick),
                    protectedRows,
                    afterProtectedTick,
                    publicSetterCalls,
                    note: 'No enabled setter retry or reacquisition; physical zero is not component-cache consistency.',
                },
            );
            fixture.checkpoint('protected-tick-is-not-component-recovery', {
                protectedTick: outcomeFacts(protectedTick),
                protectedRows,
                afterProtectedTick,
            });
        } else {
            const mutations = rows.filter((row) =>
                ['clearBodyVelocity', 'setBodyType', 'setBodyEnabled'].includes(row.name),
            );
            const zeroRows = mutations.filter((row) => row.name === 'clearBodyVelocity');
            check(
                'actual clear runs once, returns actual paired zero, preserves force/wake/type/enabled and does not tick',
                zeroRows.length === 1 &&
                    zeroRows[0].delegateCalled &&
                    zeroRows[0].delegateReturned &&
                    zero(after.nativeState.linearVelocity) &&
                    zero(after.nativeState.angularVelocity) &&
                    after.nativeState.enabled === before.nativeState.enabled &&
                    after.nativeState.type === before.nativeState.type &&
                    after.nativeState.awake === before.nativeState.awake &&
                    same(after.nativeState.force, before.nativeState.force) &&
                    same(after.nativeState.torque, before.nativeState.torque) &&
                    after.nativeTick === before.nativeTick,
                { zeroRows, before, after },
            );
            check(
                'committed or unknown lifecycle fault retains exact first error and never presents recovered ready',
                after.worldState === 'faulted' &&
                    after.owner.phase === 'faulted' &&
                    world.diagnostics().failure.hasFailure &&
                    world.diagnostics().failure.error === injected,
                {
                    after,
                    firstFailure: errorFacts(world.diagnostics().failure.error),
                    originalIdentity: world.diagnostics().failure.error === injected,
                },
            );
            if (typeCase) {
                check(
                    'successful cleanup precedes rejected type delegate; old public/native type remains without rollback claim',
                    same(
                        mutations.map((row) => row.name),
                        ['clearBodyVelocity', 'setBodyType'],
                    ) &&
                        zeroRows[0].returned &&
                        !mutations[1].delegateCalled &&
                        !mutations[1].returned &&
                        same(after.component, before.component) &&
                        after.nativeState.type === before.nativeState.type &&
                        after.owner.targets.active === 0 &&
                        after.owner.targets.protected === 0 &&
                        after.owner.targets.guards === 0,
                    {
                        mutations,
                        before,
                        after,
                        note: 'Final not-mutated type rejection cannot undo prior successful native zero.',
                    },
                );
            } else {
                check(
                    'lost clear result retains protected unresolved cleanup ownership until terminal close',
                    mutations.length === 1 &&
                        !zeroRows[0].returned &&
                        after.owner.targets.active === 0 &&
                        after.owner.targets.protected + after.owner.targets.unresolved === 1 &&
                        after.owner.targets.guards === 1 &&
                        after.component.colliderEnabled &&
                        after.component.ownerRigidEnabled === true &&
                        after.component.schedulerOnEnableFlag === before.component.schedulerOnEnableFlag &&
                        after.component.schedulerTargetPaused === before.component.schedulerTargetPaused,
                    {
                        mutations,
                        after,
                        note: 'Public enabled cache is actual, not restored or assumed equal to private state.',
                    },
                );
                if (fixture.expected === 'after-native-unknown')
                    check(
                        'unknown is immutable delivery classification, not fabricated native outcome',
                        faults[0].outcome === 'unknown' &&
                            faults[0].delegateCalled &&
                            faults[0].delegateReturned &&
                            zeroRows[0].mutationOutcomeDescriptor.value === 'unknown' &&
                            after.worldState === 'faulted',
                        {
                            faults,
                            actualNativeState: after.nativeState,
                            note: 'Delegate ran; independent actual readback proves zero here. Unknown alone proves no mutation.',
                        },
                    );
            }
            fixture.checkpoint('faulted-no-replay-boundary', {
                after,
                mutations,
                publicSetterCalls,
                note: 'No second lifecycle setter, subsequent system/world step or native retry before terminal close.',
            });
        }
        const beforeClose = snapshot();
        check(
            'lifecycle scopes settle without public capability activation',
            owner().activeTemporaryScopes === 0 &&
                !owner().stagedCommandsSupported &&
                !owner().unifiedTransactionsSupported,
            owner(),
        );
        fixture.checkpoint('before-actual-app-close', { checks, beforeClose, publicSetterCalls });
        const close = await app.close!();
        closed = true;
        const observations = fixture.observations();
        check(
            'actual app.close frees core/bridge resources and persistent guards even after failure',
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
                owner().targets.unresolved === 0 &&
                owner().nativeOwnership === 'released',
            {
                close,
                loader: fixture.loader.diagnostics(),
                beforeBindingDispose: observations.beforeBindingDispose,
                observationErrors: observations.observationErrors,
                owner: owner(),
            },
        );
        let staleReads = 0;
        const stale = attempt(() =>
            handle.setTarget({
                get position() {
                    staleReads++;
                    return pose(1).position;
                },
                get rotation() {
                    staleReads++;
                    return pose(1).rotation;
                },
            }),
        );
        check('terminal handle stays stale before reading caller pose', stale.threw && staleReads === 0, {
            stale: outcomeFacts(stale),
            staleReads,
        });
        fixture.checkpoint('final-checks', {
            case: fixture.expected,
            checks,
            publicSetterCalls,
            formalCells: { total: 2128, status: 'NOT_RUN' },
            gates: { total: 9, status: 'NOT_RUN' },
            knownBaselineDefectAssertion: 'recoverable pre-native refusal preserves original effective component state',
            notCovered: [
                'Game/manual-clock distinction',
                'persist-scene transfer',
                'native numerical failures',
                'browser suspension',
                'formal matrices',
            ],
        });
        expect(checks.filter((row) => !row.pass)).toEqual([]);
        fixture.complete('PASS_LIMITED_LIFECYCLE_FAILURE');
    } catch (error) {
        fixture.checkpoint('failed-checks', { checks });
        fixture.fail(error);
        throw error;
    } finally {
        if (app && !closed) {
            try {
                fixture.checkpoint('finally-app-close', await app.close!());
            } catch (error) {
                fixture.checkpoint('finally-close-error', { error: errorFacts(error) });
            }
        }
    }
});
