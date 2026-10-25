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
import { Node } from '../../../cocos/scene-graph/node';
import { Component } from '../../../cocos/scene-graph/component';
import { registerDeferredDestroyScope } from '../../../cocos/scene-graph/deferred-destroy-control';
import type { DeferredDestroyScope, DeferredDestroyTarget } from '../../../cocos/scene-graph/deferred-destroy-control';
import { game } from '../../../cocos/game/game';
import { registerGameClockObserver, gameClockSemanticPause } from '../../../cocos/game/game-clock-control';
import type { GameClockState, GameClockObservation, GameClockDiagnostics, GameClockPlan, GameClockFailure } from '../../../cocos/game/game-clock-control';
import { PhysicsSystem } from '../../../cocos/physics/framework/physics-system';
import { RigidBody } from '../../../cocos/physics/framework/components/rigid-body';
import { FixedConstraint } from '../../../cocos/physics/framework/components/constraints/fixed-constraint';
import { HingeConstraint } from '../../../cocos/physics/framework/components/constraints/hinge-constraint';
import { PointToPointConstraint } from '../../../cocos/physics/framework/components/constraints/point-to-point-constraint';
import { Collider } from '../../../cocos/physics/framework/components/colliders/collider';
import { PhysicsMaterial } from '../../../cocos/physics/framework/assets/physics-material';
import { registerMutationGuard } from '../../../cocos/core/data/mutation-guard';
import { registerComponentActivityObserver } from '../../../cocos/scene-graph/component-activity-control';
import type { ActivityState, ActivityPlan, ActivityFailureReport, ComponentActivityLease } from '../../../cocos/scene-graph/component-activity-control';
import type { MutationGuardLease } from '../../../cocos/core/data/mutation-guard';
import { registerNodeTransformGuard } from '../../../cocos/scene-graph/node-transform-validation';
import type {
    NodeTransformGuardLease,
    NodeTransformWriteReservation,
    NodeTransformWriteOperation,
} from '../../../cocos/scene-graph/node-transform-validation';
import type { Box3DBodyState, Box3DId } from './binding/facade.mjs';
import { Box3DCommandQueue } from './command-queue';
import {
    registerBox3DCurrentMotionOwner,
    submitBox3DCurrentTarget,
    revokeBox3DCurrentTarget,
} from './current-motion-route';
import type { Box3DCurrentMotionLease } from './current-motion-route';
import type {
    PreparedCommandPause,
    CommandInput,
    CommandPose,
    CommandRecord,
    CommandCandidate,
    CommandContext,
    CommandProducer,
} from './command-queue';
import { Box3DCommandProducers } from './command-producers';
import type {
    ProducerOperationLease,
    ProducerHandle,
    ContinuousHandle,
    ContinuousDescriptor,
} from './command-producers';
import { mapCommandCandidate } from './command-wire';
import { registerPhysicsCommandOwner } from '../../../cocos/physics/framework/physics-command-submission';
import type {
    PhysicsBodyCommandInput,
    PhysicsCommandOwnerLease,
} from '../../../cocos/physics/framework/physics-command-submission';
import type { Box3DCommand } from './binding/facade.mjs';
import { registerPhysicsSystemControl } from '../../../cocos/physics/framework/physics-system-control';
import type {
    PhysicsSystemControlLease,
    PhysicsSystemControlState,
} from '../../../cocos/physics/framework/physics-system-control';
import { copySurfaceMaterial, worldError } from './world-binding';
import type { Box3DSurfaceMaterial } from './world-binding';
import { unsupportedBox3D } from './unsupported';
import {
    registerPhysicsMaterialDelegate,
    nextPhysicsMaterialCleanupGeneration,
} from '../../../cocos/physics/framework/physics-material-transaction';
import type {
    PhysicsMaterialCandidate,
    PhysicsMaterialDelegateLease,
} from '../../../cocos/physics/framework/physics-material-transaction';
import type {
    PhysicsStateChangeContext,
    PhysicsStateFailure,
} from '../../../cocos/physics/framework/physics-state-observer';

import { CCObjectFlags } from '../../../cocos/core/data/object';
import { beginPhysicsMaterialSourceInitialization } from '../../../cocos/physics/framework/physics-material-binding-source';
import { readPhysicsMaterialPrivateValues } from '../../../cocos/physics/framework/physics-material-cache';
import { registerPhysicsMaterialValuesOwner } from '../../../cocos/physics/framework/physics-material-values';
import {
    registerMaterialBindingOwner,
    getMaterialSource,
    closeMaterialSource,
} from '../../../cocos/physics/framework/physics-material-bindings';
import type {
    MaterialBindingOwnerLease,
    MaterialSourceLease,
} from '../../../cocos/physics/framework/physics-material-bindings';
import type {
    MaterialValuesContext,
    MaterialValuesCopied,
    MaterialValuesOwnerLease,
    PreparedMaterialMembership,
    PreparedMaterialOwnerPlan,
    MaterialValuesDiagnostics,
} from '../../../cocos/physics/framework/physics-material-values-transaction';

export interface Box3DPreparedComponentMaterial {
    readonly shape: Box3DId | null;
    commitCaches(): void;
}
type PrepareComponentMaterial = (
    authority: object,
    material: Readonly<Box3DSurfaceMaterial>,
) => Box3DPreparedComponentMaterial;
type PrepareWorldMaterial = (
    material: Readonly<Box3DSurfaceMaterial>,
    includeDefault: boolean,
    components: readonly Box3DPreparedComponentMaterial[],
) => PreparedMaterialOwnerPlan;

type CopiedMaterialApplication = (authority: object, material: Readonly<Box3DSurfaceMaterial> | null) => void;

/** Internal environment only. Not an AIR app option, singleton lookup or public capability. */
export interface Box3DWorldOwnerEnvironment {
    readonly physicsSystem: () => PhysicsSystem;
}
export interface Box3DPreparedRigidActivity {
    apply(authority: object): void;
    delegate(authority: object): void;
    verify(authority: object, requireZero: boolean, effective: boolean): void;
    dispose(): void;
}
export interface Box3DOwnedBodySeed {
    readonly node: Node;
    readonly ancestry: readonly Node[];
    readonly preflight: () => void;
    readonly readCommitted: () => Readonly<Box3DBodyState>;
    readonly resolveNative: () => Box3DId;
    /** Captured paired-zero kernel only. Never exposed on an adapter or component. */
    readonly clearTargetVelocity: () => void;
    readonly prepareRigidActivity: (adapter: object, authority: object, enabled: boolean, previousEnabled: boolean) => Box3DPreparedRigidActivity;
}
export interface Box3DOwnedComponentSeed {
    readonly adapter: object;
    readonly component: RigidBody | Collider;
    readonly kind: 'rigid-body' | 'collider';
    readonly material: PhysicsMaterial | null;
    /** Captured adapter helper only; never returned on impl or a component. */
    readonly applyMaterial?: CopiedMaterialApplication;
    readonly prepareMaterialValues?: PrepareComponentMaterial;
}
/** Internal candidate only; no public helper export or native capability. */
export interface Box3DKinematicTarget {
    setTarget(pose: CommandPose): void;
    clear(): void;
    dispose(): void;
}
/** Internal finite reset options; this is not a public adapter capability. */
export interface Box3DTeleportOptions {
    readonly preserveVelocity?: boolean;
    readonly wake?: boolean;
}
export interface Box3DCommandTick {
    readonly teleportNodes: readonly Node[];
    readonly commands: readonly Box3DCommand[];
    readonly context: Readonly<CommandContext>;
    readonly acceptedCount: number;
    beginCommit(): void;
    finishCommit(outcome: 'not-mutated' | 'committed' | 'unknown'): void;
    complete(): void;
    fail(nativeCompleted: boolean): void;
    dispose(): void;
}
export interface Box3DOwnerFenceScope {
    prepareWriteback(nodes: readonly Node[]): void;
    advance(next: 'solving' | 'writeback'): void;
    write(node: Node, operation: NodeTransformWriteOperation, expected: readonly number[], perform: () => void): void;
    dispose(): void;
}
export interface Box3DDispatchScope extends Box3DOwnerFenceScope {
    pendingDestruction(component: Collider): boolean;
    /** Only after dispose: route queued identities through the original guarded entry. */
    drainDestruction(): void;
}
const originalNodeDestroy = Node.prototype.destroy;
const originalComponentDestroy = Component.prototype.destroy;
type Phase =
    | 'idle'
    | 'admission'
    | 'producer'
    | 'preflight'
    | 'solving'
    | 'writeback'
    | 'dispatch'
    | 'material'
    | 'control'
    | 'faulted'
    | 'closed';
type BodyRecord = Readonly<Box3DOwnedBodySeed>;
type ComponentRecord = {
    readonly body: object;
    readonly component: RigidBody | Collider;
    readonly kind: 'rigid-body' | 'collider';
    material: PhysicsMaterial | null;
    readonly materialSource: MaterialSourceLease | null;
    readonly prepareMaterialValues?: PrepareComponentMaterial;
    initialized: boolean;
    enabled: boolean;
};
type TargetRecord = {
    readonly generation: number;
    readonly identity: object;
    readonly body: object;
    readonly adapter: object;
    readonly component: ComponentRecord;
    readonly ancestry: readonly Node[];
    readonly token: object;
    guard: NodeTransformGuardLease | null;
    state: 'active' | 'protected' | 'settled' | 'unresolved';
};
const targetRejection = Object.freeze({
    code: 'AIR_E_BOX3D_CONFIG',
    message: 'Box3D target ownership protects this Node or an affected descendant; use the motion API',
});
const rejection = Object.freeze({
    code: 'AIR_E_BOX3D_REENTRANT',
    message: 'A Box3D-owned temporary step or dispatch scope forbids this mutation',
});
const activationBlockers = Object.freeze([
    'dynamic-command-owner-candidate-not-qualified',
    'shared-material-propagation-and-subscription-integrity',
    'full-producer-pause-lifecycle-not-qualified',
    'complete-early-entry-qualification',
    'persistent-target-owner-not-qualified',
    'persist-scene-transfer-not-integrated',
    'game-pause-manual-clock-reason-not-integrated',
]);
function object(value: unknown, operation: string): asserts value is object {
    if (!value || typeof value !== 'object')
        throw worldError('AIR_E_BOX3D_CONFIG', operation, 'Expected object identity.');
}

/** Owns exact logical/component identity, temporary fences, persistent target leases
 * and the internal command candidate. Native resolver capabilities remain private.
 * Public activation still requires complete lifetime and acceptance contracts.
 */
export class Box3DWorldCommandOwner {
    #destroyAdmission: DeferredDestroyScope | null = null;
    readonly #generation: number;
    #valuesLease: MaterialValuesOwnerLease | null = null;
    #bindingOwner: MaterialBindingOwnerLease | null = null;
    #valuesContext: MaterialValuesContext | null = null;
    #valuesScope: Box3DOwnerFenceScope | null = null;
    readonly #valuesAuthorities = new WeakMap<
        object,
        Readonly<{ key: object; material: Readonly<Box3DSurfaceMaterial>; context: MaterialValuesContext }>
    >();
    #lastValues: Readonly<{
        sequence: number;
        actual: readonly number[] | null;
        failed: boolean;
        failure?: MaterialValuesDiagnostics;
    }> | null = null;
    readonly #system: PhysicsSystem;
    readonly #world: object;
    readonly #queue: Box3DCommandQueue;
    readonly #producers: Box3DCommandProducers;
    #commandRouting: PhysicsCommandOwnerLease | null = null;
    #motionRouting: Box3DCurrentMotionLease | null = null;
    readonly #targets = new Map<object, TargetRecord>();
    #initialProducerControl = false;
    #commandPhase: 'idle' | 'collecting' | 'validating' | 'committing' | 'awaiting-step' = 'idle';
    readonly #cleanupFailures: Readonly<{ stage: string; error: unknown }>[] = [];
    #omittedCleanupFailures = 0;
    readonly #bodies = new Map<object, BodyRecord>();
    readonly #components = new Map<object, ComponentRecord>();
    readonly #activityLeases = new Map<object, ComponentActivityLease>();
    readonly #activityCleanups = new Set<() => void>();
    readonly #activityAuthorities = new WeakMap<object, { adapter: object; context: object; scope: Box3DOwnerFenceScope; stage: 'prepare' | 'apply' | 'delegate' | 'verify' }>();
    #lastActivity: Readonly<{ cacheWriteEntered: boolean; callbackReturned: boolean; schedulerReturned: boolean; cleanupCommitted: boolean; nativeApplied: boolean; delegated: boolean; actual: ActivityState | null; actualReadStatus: string; schedulerUnchanged: boolean | null }> | null = null;
    #defaultMaterial: PhysicsMaterial | null = null;
    #phase: Phase = 'idle';
    #publicQueryContext: CommandContext | undefined;
    #publicQueryReading = false;
    #jointActivity: object | null = null;
    #nativeTeardown: 'owned' | 'released' | 'unresolved' = 'owned';
    #scope: Box3DOwnerFenceScope | null = null;
    readonly #materialLeases = new Map<object, PhysicsMaterialDelegateLease>();
    readonly #materialCleanups = new Set<() => void>();
    readonly #materialAuthorities = new WeakMap<
        object,
        {
            key: object;
            material: Readonly<Box3DSurfaceMaterial> | null;
            context: Readonly<PhysicsStateChangeContext>;
        }
    >();
    #systemControlLease: PhysicsSystemControlLease | null = null;
    #systemPaused = false;
    #gamePaused = false;
    #gameControlLease: GameClockObservation | null = null;
    #gameState: GameClockState | null = null;
    #gameClockSnapshot: GameClockDiagnostics | null = null;
    #clockReentry: { error: unknown } | null = null;
    #lastGameControl: Readonly<{
        before: GameClockState;
        actual: GameClockState;
        queueCommitEntered: boolean;
        queueCommitReturned: boolean;
        producerCommitEntered: boolean;
        producerCommitReturned: boolean;
        failure: GameClockFailure | null;
    }> | null = null;
    readonly #controlCleanups = new Set<() => void>();
    #lastControl: Readonly<{
        operation: string;
        cacheEnabled: boolean | null;
        cacheAutoSimulation: boolean | null;
        queueCommitEntered: boolean;
        queueCommitReturned: boolean;
        producerCommitEntered: boolean;
        producerCommitReturned: boolean;
        failed: boolean;
        actualRead: string;
    }> | null = null;
    #materialContext: Readonly<PhysicsStateChangeContext> | null = null;
    #materialFault: ((error: unknown) => void) | null = null;
    #lastMaterial: Readonly<{
        operation: string;
        actualRead: string;
        actualMatchesBefore: boolean | null;
        actualMatchesCandidate: boolean | null;
        effects: readonly string[];
        failed: boolean;
    }> | null = null;

    constructor(generation: number, system: PhysicsSystem, world: object) {
        if (!(system instanceof PhysicsSystem))
            throw worldError('AIR_E_BOX3D_CONFIG', 'world owner', 'Expected the actual Cocos PhysicsSystem instance.');
        this.#generation = generation;
        this.#system = system;
        this.#world = world;
        this.#queue = new Box3DCommandQueue({ generation });
        this.#producers = new Box3DCommandProducers({
            beginProducerOperation: (operation, allowPaused) => this.#producerAdmission(operation, allowPaused),
            beginProducerSnapshot: () => this.#borrowProducerAdmission('preflight'),
            beginProducerControl: () => this.#borrowProducerAdmission('control'),
            validateContinuousBody: (body) => {
                this.#resolveCommandSource(body, true);
            },
            submit: (body, command) => this.submitDynamicCommand(body, () => command as PhysicsBodyCommandInput),
        });
    }
    /** Internal candidate activation. Public package capability remains unqualified. */
    installCommandRouting(): void {
        if (this.#commandRouting) throw worldError('AIR_E_BOX3D_CONFIG', 'command route', 'Already installed.');
        this.#commandRouting = registerPhysicsCommandOwner(this.#world, {
            submit: (source, read) => this.submitDynamicCommand(source, read),
            assertConfiguration: (operation, source) => this.assertVelocityConfiguration(source, operation),
        });
        try {
            this.#motionRouting = registerBox3DCurrentMotionOwner(this.#world, {
                submit: (owner, handle, read) => this.#submitTarget(owner, handle, read),
                revoke: (owner, handle) => this.#revokeTarget(owner, handle),
            });
        } catch (error) {
            this.#commandRouting.dispose();
            this.#commandRouting = null;
            throw error;
        }
    }
    assertVelocityConfiguration(source: object, operation: string): void {
        this.assertConfiguration(operation);
        this.assertSystemBinding();
        // Preserve legacy unowned/uninitialized ready behavior; inspect no input vector.
        const component = [...this.#components.values()].find(
            (record) => record.kind === 'rigid-body' && record.component === source,
        );
        if (component && this.#targets.has(component.body))
            throw worldError('AIR_E_BOX3D_CONFIG', operation, 'Target ownership still controls paired velocity.');
    }
    #producerAdmission(operation: string, allowPaused: boolean): ProducerOperationLease {
        this.assertConfiguration(operation);
        if (!allowPaused) this.assertSteppingAllowed(operation);
        const scope = this.#begin('producer');
        return Object.freeze({
            assertCurrent: () => {
                if (this.#scope !== scope || this.#phase !== 'producer')
                    throw worldError('AIR_E_BOX3D_REENTRANT', operation, 'Producer admission is no longer current.');
                this.assertSystemBinding();
            },
            dispose: () => {
                try {
                    scope.dispose();
                } catch (error) {
                    this.#materialFault?.(error);
                    throw error;
                }
            },
        });
    }
    #borrowProducerAdmission(phase: 'preflight' | 'control'): ProducerOperationLease {
        const scope = this.#scope,
            initial = phase === 'control' && this.#initialProducerControl;
        if (!initial && (!scope || this.#phase !== phase))
            throw worldError('AIR_E_BOX3D_REENTRANT', 'private producer admission', 'No matching owned scope.');
        let disposed = false;
        return Object.freeze({
            assertCurrent: () => {
                if (
                    disposed ||
                    (initial ? !this.#initialProducerControl : this.#scope !== scope || this.#phase !== phase)
                )
                    throw worldError('AIR_E_BOX3D_REENTRANT', 'private producer admission', 'Expired private scope.');
                if (!initial) this.assertSystemBinding();
            },
            dispose: () => {
                disposed = true;
            },
        });
    }
    #resolveCommandSource(
        source: object,
        dynamic: boolean,
    ): { key: object; body: BodyRecord; component: ComponentRecord } {
        const component = [...this.#components.values()].find(
            (row) => row.component === source && row.kind === 'rigid-body',
        );
        const body = component && this.#bodies.get(component.body);
        if (
            !component ||
            !component.initialized ||
            !body ||
            component.component._objFlags &
                (CCObjectFlags.Destroyed | CCObjectFlags.ToDestroy | CCObjectFlags.Destroying) ||
            body.node._objFlags & (CCObjectFlags.Destroyed | CCObjectFlags.ToDestroy | CCObjectFlags.Destroying)
        )
            throw worldError(
                'AIR_E_BOX3D_DISPOSED',
                'command source',
                'Expected the actual live initialized RigidBody of this owner.',
            );
        if (dynamic) {
            const state = body.readCommitted();
            if (!component.enabled || !state.enabled || state.type !== 2)
                throw worldError(
                    'AIR_E_BOX3D_CONFIG',
                    'dynamic command',
                    'An enabled actual dynamic RigidBody is required.',
                );
        }
        return { key: component.body, body, component };
    }
    #targetFromHandle(owner: object, identity: object, active: boolean): TargetRecord {
        const target = [...this.#targets.values()].find((record) => record.identity === identity);
        if (
            owner !== this.#world ||
            !target ||
            target.generation !== this.#generation ||
            this.#components.get(target.adapter) !== target.component ||
            !this.#bodies.has(target.body) ||
            (active && target.state !== 'active')
        )
            throw worldError('AIR_E_BOX3D_DISPOSED', 'target handle', 'Stale or foreign target ownership.');
        return target;
    }
    #assertTargetBody(target: TargetRecord): BodyRecord {
        const resolved = this.#resolveCommandSource(target.component.component, false);
        if (resolved.key !== target.body || resolved.component !== target.component)
            throw worldError('AIR_E_BOX3D_DISPOSED', 'target body', 'Actual component identity changed.');
        const state = resolved.body.readCommitted();
        if (!resolved.component.enabled || !state.enabled || state.type !== 1)
            throw worldError('AIR_E_BOX3D_CONFIG', 'target body', 'An enabled actual kinematic body is required.');
        return resolved.body;
    }
    #withTargetAdmission<T>(perform: (admission: { scope: Box3DOwnerFenceScope | null }) => T): T {
        const admission: { scope: Box3DOwnerFenceScope | null } = { scope: null };
        let failed = false,
            first: unknown;
        try {
            return perform(admission);
        } catch (error) {
            failed = true;
            first = error;
            throw error;
        } finally {
            try {
                admission.scope?.dispose();
            } catch (error) {
                this.#materialFault?.(failed ? first : error);
                if (!failed) throw error;
            }
        }
    }
    createKinematicTarget(source: object): Box3DKinematicTarget {
        const provisional: {
            guard: NodeTransformGuardLease | null;
            acquired: { body: object; token: object } | null;
            published: TargetRecord | null;
        } = { guard: null, acquired: null, published: null };
        try {
            return this.#withTargetAdmission((admission) => {
                const staged: {
                    prepared?: {
                        body: object;
                        adapter: object;
                        component: ComponentRecord;
                        ancestry: readonly Node[];
                        identity: object;
                    };
                } = {};
                const token = this.#queue.withTargetAcquisitionAdmission(() => {
                    this.assertConfiguration('create kinematic target');
                    this.assertSteppingAllowed('create kinematic target');
                    admission.scope = this.#begin('admission', [source]);
                    const resolved = this.#resolveCommandSource(source, false),
                        state = resolved.body.readCommitted();
                    if (!resolved.component.enabled || !state.enabled || state.type !== 1)
                        throw worldError(
                            'AIR_E_BOX3D_CONFIG',
                            'create target',
                            'An enabled kinematic body is required.',
                        );
                    if (this.#targets.has(resolved.key))
                        throw worldError('AIR_E_BOX3D_CONFIG', 'create target', 'Target ownership is still held.');
                    resolved.body.preflight();
                    const ancestry = Object.freeze([...resolved.body.ancestry]),
                        adapter = [...this.#components].find(([, record]) => record === resolved.component)![0];
                    provisional.guard = registerNodeTransformGuard(ancestry, targetRejection);
                    staged.prepared = {
                        body: resolved.key,
                        adapter,
                        component: resolved.component,
                        ancestry,
                        identity: Object.freeze({}),
                    };
                    return resolved.key;
                });
                const ready = staged.prepared!;
                provisional.acquired = { body: ready.body, token };
                const record: TargetRecord = {
                    ...ready,
                    generation: this.#generation,
                    token,
                    guard: provisional.guard,
                    state: 'active',
                };
                const handle = Object.freeze({
                    setTarget: (pose: CommandPose): void => {
                        submitBox3DCurrentTarget(this.#world, record.identity, () => ({ kind: 'target', pose }));
                    },
                    clear: (): void => {
                        submitBox3DCurrentTarget(this.#world, record.identity, () => ({ kind: 'target-clear' }));
                    },
                    dispose: (): void => {
                        // Only an actually revoked/terminal handle is an idempotent no-op.
                        if (record.state !== 'active') return;
                        revokeBox3DCurrentTarget(this.#world, record.identity);
                    },
                });
                this.#targets.set(record.body, record);
                provisional.published = record;
                return handle;
            });
        } catch (error) {
            // Even a fence-disposal failure precedes delivery of this handle. No native
            // motion occurred, so unwind this unpublished acquisition without inventing zero.
            let abandoned = false;
            try {
                const acquired = provisional.acquired;
                if (acquired) this.#queue.releaseUnpublishedTarget(acquired.body, acquired.token);
                abandoned = true;
            } catch (cleanup) {
                this.#recordCleanup('unpublished-target-queue-dispose', cleanup);
                this.#materialFault?.(error);
            }
            try {
                provisional.guard?.dispose();
                if (provisional.published) {
                    provisional.published.state = abandoned ? 'settled' : 'unresolved';
                    provisional.published.guard = null;
                    if (abandoned) this.#targets.delete(provisional.published.body);
                }
            } catch (cleanup) {
                this.#recordCleanup('unpublished-target-guard-dispose', cleanup);
                this.#materialFault?.(error);
            }
            throw error;
        }
    }
    #submitTarget(owner: object, identity: object, read: () => CommandInput): void {
        this.#withTargetAdmission((admission) => {
            this.#queue.withSubmissionAdmission(() => {
                this.assertSystemBinding();
                if (this.#aggregatePaused())
                    throw worldError('AIR_E_BOX3D_CONFIG', 'target submission', 'The actual owner is paused.');
                if (this.#phase === 'idle') admission.scope = this.#begin('admission');
                else if (!(this.#phase === 'preflight' && this.#commandPhase === 'collecting' && this.#scope))
                    throw worldError('AIR_E_BOX3D_REENTRANT', 'target submission', 'Not in ready or collection.');
                const target = this.#targetFromHandle(owner, identity, true);
                this.#assertTargetBody(target);
                const command = read();
                if (!command || (command.kind !== 'target' && command.kind !== 'target-clear'))
                    throw worldError('AIR_E_BOX3D_CONFIG', 'target submission', 'Expected target motion.');
                return { body: target.body, command };
            });
        });
    }
    #revokeTarget(owner: object, identity: object): void {
        this.#withTargetAdmission((admission) => {
            const selected: { target?: TargetRecord } = {};
            this.#queue.withTargetRevocationAdmission(() => {
                this.assertConfiguration('dispose target');
                this.assertSystemBinding();
                admission.scope = this.#begin('admission');
                const target = this.#targetFromHandle(owner, identity, true);
                selected.target = target;
                return { body: target.body, owner: target.token };
            });
            selected.target!.state = 'protected';
        });
    }
    #releaseTargetGuard(target: TargetRecord): void {
        target.guard?.dispose();
        target.guard = null;
    }
    #settleTarget(target: TargetRecord, outcome: 'paired-zero' | 'teardown'): void {
        if (this.#targets.get(target.body) !== target)
            throw worldError('AIR_E_BOX3D_DISPOSED', 'settle target', 'Target ownership changed.');
        this.#queue.settleTargetAfterCleanup(target.body, target.token, outcome);
        this.#releaseTargetGuard(target);
        target.state = 'settled';
        this.#targets.delete(target.body);
    }
    /** Private pre-transition hook. No component disabled/type cache is native zero proof. */
    prepareTargetTransition(body: object): boolean {
        const target = this.#targets.get(body);
        if (!target) return false;
        if (this.#phase === 'faulted' || this.#phase === 'closed') {
            // Terminal JS cleanup releases ancestry guards, but never claims native settlement.
            this.#releaseTargetGuard(target);
            target.state = 'unresolved';
            return false;
        }
        this.assertConfiguration('target lifecycle cleanup');
        this.assertSystemBinding();
        if (target.state === 'active') {
            this.#queue.withTargetRevocationAdmission(() => ({ body, owner: target.token }));
            target.state = 'protected';
        }
        const owned = this.#bodies.get(body);
        if (!owned || target.state !== 'protected')
            throw worldError('AIR_E_BOX3D_DISPOSED', 'target lifecycle cleanup', 'Missing protected owned body.');
        const scope = this.#begin('control');
        let committed = false,
            failed = false,
            first: unknown;
        try {
            // This captured callback calls only native op13; no mass/geometry preflight or solver.
            owned.clearTargetVelocity();
            committed = true;
            this.#settleTarget(target, 'paired-zero');
            return true;
        } catch (error) {
            failed = true;
            first = error;
            if (committed) this.#materialFault?.(error);
            throw error;
        } finally {
            try {
                scope.dispose();
            } catch (error) {
                this.#materialFault?.(failed ? first : error);
                if (!failed) throw error;
            }
        }
    }
    submitDynamicCommand(source: object, read: () => PhysicsBodyCommandInput): number {
        return this.#submitCommand(source, read, false);
    }
    submitAdapterCommand(adapter: object, read: () => PhysicsBodyCommandInput): number {
        return this.#submitCommand(adapter, read, true);
    }
    teleportRigidBody(source: object, pose: CommandPose, options?: Box3DTeleportOptions): number {
        return this.#submitCommand(
            source,
            () => {
                if (options !== undefined && (options === null || typeof options !== 'object'))
                    throw worldError('AIR_E_BOX3D_CONFIG', 'teleport options', 'Expected an options object.');
                // Original getters run exactly once under both the queue latch and owner fence.
                const preserveVelocity = options?.preserveVelocity,
                    wake = options?.wake;
                if (
                    (preserveVelocity !== undefined && typeof preserveVelocity !== 'boolean') ||
                    (wake !== undefined && typeof wake !== 'boolean')
                )
                    throw worldError('AIR_E_BOX3D_CONFIG', 'teleport options', 'Expected boolean options.');
                return { kind: 'teleport', pose, preserveVelocity, wake };
            },
            false,
            true,
        );
    }
    #submitCommand(
        source: object,
        read: () => PhysicsBodyCommandInput | CommandInput,
        adapter: boolean,
        teleport = false,
    ): number {
        const admission: { scope: Box3DOwnerFenceScope | null } = { scope: null };
        let failed = false,
            first: unknown;
        try {
            return this.#queue.withSubmissionAdmission(() => {
                // Owner/source admission is inside the queue latch, including wrong/disabled sources.
                this.assertSystemBinding();
                if (this.#aggregatePaused())
                    throw worldError('AIR_E_BOX3D_CONFIG', 'command submission', 'The actual owner is paused.');
                if (this.#phase === 'idle') admission.scope = this.#begin('admission', [source]);
                else if (!(this.#phase === 'preflight' && this.#commandPhase === 'collecting' && this.#scope))
                    throw worldError(
                        'AIR_E_BOX3D_REENTRANT',
                        'command submission',
                        'Not in ready or this owner collection.',
                    );
                const componentSource = adapter ? this.#component(source).component : source;
                const resolved = this.#resolveCommandSource(componentSource, false);
                if (teleport) {
                    const state = resolved.body.readCommitted();
                    if (state.type !== 1 && state.type !== 2)
                        throw worldError(
                            'AIR_E_BOX3D_CONFIG',
                            'teleport source',
                            'An actual initialized dynamic or kinematic RigidBody is required.',
                        );
                }
                if (typeof read !== 'function')
                    throw worldError('AIR_E_BOX3D_CONFIG', 'command submission', 'Missing copied input reader.');
                const input = read();
                if (!input || typeof input !== 'object')
                    throw worldError('AIR_E_BOX3D_CONFIG', 'command submission', 'Expected command input.');
                // Read each original field once; queue performs the coordinate copy under this same fence.
                const kind = input.kind;
                if (kind === 'force' || kind === 'impulse' || kind === 'torque' || kind === 'angular-impulse')
                    this.#resolveCommandSource(componentSource, true);
                let command: CommandInput;
                if (kind === 'force' || kind === 'impulse')
                    command = { kind, vector: input.vector, relativePoint: input.relativePoint, space: input.space };
                else if (kind === 'torque' || kind === 'angular-impulse')
                    command = { kind, vector: input.vector, space: input.space };
                else if (kind === 'clear-forces' || kind === 'clear-velocity' || kind === 'clear-state')
                    command = { kind };
                else if (teleport && kind === 'teleport')
                    command = { kind, pose: input.pose, preserveVelocity: input.preserveVelocity, wake: input.wake };
                else
                    throw worldError(
                        'AIR_E_BOX3D_UNSUPPORTED',
                        'command submission',
                        'This route accepts finite dynamic commands and teleport; targets require their private handle.',
                    );
                return { body: resolved.key, command };
            });
        } catch (error) {
            failed = true;
            first = error;
            throw error;
        } finally {
            try {
                admission.scope?.dispose();
            } catch (error) {
                this.#materialFault?.(failed ? first : error);
                if (!failed) throw error;
            }
        }
    }
    cancelPendingCommands(source: object): number {
        const admission: { scope: Box3DOwnerFenceScope | null } = { scope: null };
        let failed = false,
            first: unknown;
        try {
            return this.#queue.withCancellationAdmission(() => {
                // Reentrant refusal must enter the queue latch before any owner check can throw.
                this.assertConfiguration('cancel pending commands');
                this.assertSteppingAllowed('cancel pending commands');
                admission.scope = this.#begin('admission', [source]);
                return this.#resolveCommandSource(source, false).key;
            });
        } catch (error) {
            failed = true;
            first = error;
            throw error;
        } finally {
            try {
                admission.scope?.dispose();
            } catch (error) {
                this.#materialFault?.(failed ? first : error);
                if (!failed) throw error;
            }
        }
    }
    registerCommandHook(callback: CommandProducer, options?: { enabled?: boolean }): ProducerHandle {
        if (typeof callback !== 'function')
            throw worldError('AIR_E_BOX3D_CONFIG', 'before-step callback', 'Expected function.');
        return this.#producers.registerBeforeStep((context) => {
            const own = Object.freeze({ ...context });
            this.#publicQueryContext = own;
            try {
                return callback(own);
            } finally {
                this.#publicQueryContext = undefined;
            }
        }, options);
    }
    withCommittedQuery<T>(context: CommandContext, read: () => T): T {
        this.assertCommittedRead('public committed query');
        if (
            context !== this.#publicQueryContext ||
            !context ||
            this.#phase !== 'preflight' ||
            this.#commandPhase !== 'collecting' ||
            !this.#scope ||
            this.#publicQueryReading
        )
            throw worldError(
                'AIR_E_BOX3D_QUERY_PHASE',
                'public committed query',
                'Expected exact current callback context and nonnested read.',
            );
        this.#publicQueryReading = true;
        try {
            return read();
        } finally {
            this.#publicQueryReading = false;
        }
    }
    registerContinuousCommand(
        source: object,
        descriptor: ContinuousDescriptor,
        options?: { enabled?: boolean },
    ): ContinuousHandle {
        return this.#producers.registerContinuous(source, descriptor, options);
    }
    #retireContinuous(record: ComponentRecord, discardUserCommands = false): void {
        if (record.kind !== 'rigid-body') return;
        this.#producers.retireBody(record.component);
        // Type/disable changes revoke continuous ownership, not already accepted user records.
        // Those must be revalidated at the next tick or explicitly cancelled. Component
        // teardown alone discards records that can no longer resolve to that component.
        if (discardUserCommands && this.#queue.diagnostics().phase === 'ready') this.#queue.cancelPending(record.body);
    }
    retireNonDynamicAfterCommit(adapter: object): void {
        this.assertConfiguration('retire non-dynamic producer');
        const record = this.#component(adapter),
            body = this.#bodies.get(record.body);
        if (!body) throw worldError('AIR_E_BOX3D_DISPOSED', 'retire producer', 'Missing actual owned body.');
        if (body.readCommitted().type !== 2) this.#retireContinuous(record);
    }
    /** Private candidate ticket; never returned by public World diagnostics or handles. */
    prepareCommandTick(scope: Box3DOwnerFenceScope, dt: number, substeps: 1 | 2 | 4 | 8): Box3DCommandTick {
        if (this.#scope !== scope || this.#phase !== 'preflight' || this.#commandPhase !== 'idle')
            throw worldError('AIR_E_BOX3D_REENTRANT', 'command tick', 'Expected the exact live preflight scope.');
        const roster = this.#producers.snapshotWithinStep();
        let candidate: CommandCandidate | null = null,
            phase: 'collecting' | 'validating' | 'committing' | 'awaiting-step' | 'settled' = 'collecting';
        let disposed = false;
        const requirePhase = (expected: typeof phase): CommandCandidate => {
            if (disposed || phase !== expected || !candidate || this.#scope !== scope)
                throw worldError('AIR_E_BOX3D_REENTRANT', 'command ticket', 'Expired or wrong-phase candidate.');
            return candidate;
        };
        try {
            this.#commandPhase = 'collecting';
            candidate = this.#queue.collect(dt, substeps, roster.callbacks);
            phase = this.#commandPhase = 'validating';
            const tokens = new Map<object, Box3DId>(),
                resolvedBodies = new Map<object, { key: object; body: BodyRecord; component: ComponentRecord }>();
            // Validate the complete accepted candidate, including rows omitted by reduction.
            for (const record of new Set([...candidate.original, ...candidate.operations])) {
                const component = [...this.#components.values()].find(
                    (row) => row.body === record.body && row.kind === 'rigid-body',
                );
                if (!component)
                    throw worldError(
                        'AIR_E_BOX3D_DISPOSED',
                        'command final validation',
                        'Command lost its actual component.',
                    );
                const kind = record.command.kind;
                const resolved = this.#resolveCommandSource(
                    component.component,
                    kind === 'force' || kind === 'impulse' || kind === 'torque' || kind === 'angular-impulse',
                );
                if (resolved.key !== record.body)
                    throw worldError('AIR_E_BOX3D_DISPOSED', 'command final validation', 'Body identity changed.');
                if (kind === 'target' || kind === 'target-clear') {
                    const target = this.#targets.get(record.body);
                    if (
                        !target ||
                        (record.source === 'protected' ? target.state !== 'protected' : target.state !== 'active')
                    )
                        throw worldError(
                            'AIR_E_BOX3D_DISPOSED',
                            'target final validation',
                            'Target ownership changed.',
                        );
                    this.#assertTargetBody(target);
                }
                if (kind === 'teleport') {
                    const state = resolved.body.readCommitted();
                    if (state.type !== 1 && state.type !== 2)
                        throw worldError(
                            'AIR_E_BOX3D_CONFIG',
                            'teleport final validation',
                            'An actual dynamic or kinematic RigidBody is required.',
                        );
                }
                tokens.set(record.body, resolved.body.resolveNative());
                resolvedBodies.set(record.body, resolved);
            }
            const teleportNodes = new Set<Node>();
            const effectiveOperations: readonly CommandRecord[] = Object.freeze(
                candidate.operations.map((record) => {
                    if (record.command.kind !== 'teleport') return record;
                    const resolved = resolvedBodies.get(record.body)!;
                    teleportNodes.add(resolved.body.node);
                    // A disabled component must not request wake even if an enabled collider keeps
                    // its native shared body enabled. Never mutate the accepted queue defaults.
                    if (resolved.component.enabled) return record;
                    return Object.freeze({
                        ...record,
                        command: Object.freeze({ ...record.command, wake: false }),
                    });
                }),
            );
            const commands = mapCommandCandidate(
                Object.freeze({ ...candidate, operations: effectiveOperations }),
                tokens,
            );
            const context = candidate.context,
                acceptedCount = candidate.original.length,
                protectedTargets = candidate.operations
                    .filter((record) => record.source === 'protected')
                    .map((record) => this.#targets.get(record.body)!);
            return Object.freeze({
                commands,
                teleportNodes: Object.freeze(Array.from(teleportNodes)),
                context,
                acceptedCount,
                beginCommit: () => {
                    this.#assertNoClockReentry();
                    this.#queue.beginCommit(requirePhase('validating'));
                    phase = this.#commandPhase = 'committing';
                },
                finishCommit: (outcome: 'not-mutated' | 'committed' | 'unknown') => {
                    this.#queue.finishCommit(requirePhase('committing'), outcome);
                    phase = outcome === 'committed' ? 'awaiting-step' : 'settled';
                    this.#commandPhase = outcome === 'committed' ? 'awaiting-step' : 'idle';
                },
                complete: () => {
                    this.#assertNoClockReentry();
                    const current = requirePhase('awaiting-step');
                    // Protected idle is paired zero, not a fresh target trajectory. Kinematic
                    // bodies do not acquire contact/force velocity. Verify actual settled zero
                    // after receipt, solver and Node writeback before releasing control.
                    for (const target of protectedTargets) {
                        const state = this.#assertTargetBody(target).readCommitted();
                        if (
                            !Object.isFrozen(state) ||
                            state.linearVelocity.length !== 3 ||
                            state.angularVelocity.length !== 3 ||
                            state.linearVelocity.some((value) => value !== 0) ||
                            state.angularVelocity.some((value) => value !== 0)
                        )
                            throw worldError(
                                'AIR_E_BOX3D_ABI',
                                'target settlement',
                                'Protected paired zero was not observed after the completed tick.',
                            );
                    }
                    this.#queue.completeTick(current);
                    for (const target of protectedTargets) this.#settleTarget(target, 'paired-zero');
                    phase = 'settled';
                    this.#commandPhase = 'idle';
                },
                fail: (nativeCompleted: boolean) => {
                    if (phase === 'validating') this.#queue.rejectCandidate(requirePhase('validating'));
                    else if (phase === 'committing') this.#queue.finishCommit(requirePhase('committing'), 'unknown');
                    else if (phase === 'awaiting-step')
                        this.#queue.faultAfterCommit(requirePhase('awaiting-step'), nativeCompleted);
                    phase = 'settled';
                    this.#commandPhase = 'idle';
                },
                dispose: () => {
                    if (disposed) return;
                    let failed = false,
                        first: unknown;
                    try {
                        if (phase === 'validating') this.#queue.rejectCandidate(requirePhase('validating'));
                        else if (phase === 'committing')
                            this.#queue.finishCommit(requirePhase('committing'), 'unknown');
                        else if (phase === 'awaiting-step')
                            this.#queue.faultAfterCommit(requirePhase('awaiting-step'), false);
                    } catch (error) {
                        failed = true;
                        first = error;
                    }
                    try {
                        roster.dispose();
                    } catch (error) {
                        if (!failed) first = error;
                        failed = true;
                    }
                    phase = 'settled';
                    this.#commandPhase = 'idle';
                    disposed = true;
                    if (failed) throw first;
                },
            });
        } catch (error) {
            let cleanupFailed = false;
            try {
                if (candidate && phase === 'validating') this.#queue.rejectCandidate(candidate);
            } catch (cleanup) {
                cleanupFailed = true;
                this.#recordCleanup('candidate-reject', cleanup);
            }
            try {
                roster.dispose();
            } catch (cleanup) {
                cleanupFailed = true;
                this.#recordCleanup('candidate-roster-dispose', cleanup);
            }
            this.#commandPhase = 'idle';
            if (cleanupFailed) this.#materialFault?.(error);
            throw error;
        }
    }
    /** Construction precedes selector assignment; enforce the original live owner before use. */
    assertSystemBinding(): void {
        if (this.#system !== PhysicsSystem.instance || this.#system.physicsWorld !== this.#world)
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'world owner binding',
                'The injected System is not the current owner of this world.',
            );
    }
    /** Pure copied admission must run before native body allocation. No getter-based material discovery. */
    copyComponentSeed(node: Node, reference: object, seed: Box3DOwnedComponentSeed): Readonly<Box3DOwnedComponentSeed> {
        this.assertConfiguration('component identity admission');
        this.assertSystemBinding();
        if (!seed)
            throw worldError('AIR_E_BOX3D_CONFIG', 'component identity admission', 'Missing component identity.');
        const adapter = seed.adapter,
            component = seed.component,
            kind = seed.kind,
            material = seed.material,
            applyMaterial = seed.applyMaterial,
            prepareMaterialValues = seed.prepareMaterialValues;
        object(adapter, 'component adapter');
        if (
            adapter !== reference ||
            !(node instanceof Node) ||
            !(kind === 'rigid-body'
                ? component instanceof RigidBody
                : kind === 'collider' && component instanceof Collider) ||
            component.node !== node ||
            this.#components.has(adapter) ||
            [...this.#components.values()].some((record) => record.component === component)
        )
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'component identity admission',
                'Expected one actual, correctly typed component on its owned Node.',
            );
        if (material !== null && !(material instanceof PhysicsMaterial))
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'component identity admission',
                'Expected actual material identity.',
            );
        if (kind === 'collider' && typeof applyMaterial !== 'function')
            throw worldError('AIR_E_BOX3D_CONFIG', 'component identity admission', 'Missing copied material delegate.');
        if (material) this.#assertMaterialLive(material);
        if (kind === 'collider' && this.#valuesLease && typeof prepareMaterialValues !== 'function')
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'component identity admission',
                'Missing private material-value preparation.',
            );
        return Object.freeze({ adapter, component, kind, material, applyMaterial, prepareMaterialValues });
    }
    assertConfiguration(operation: string): void {
        if (this.#phase !== 'idle')
            throw worldError(
                this.#phase === 'faulted'
                    ? 'AIR_E_BOX3D_WORLD_FAULTED'
                    : this.#phase === 'closed'
                      ? 'AIR_E_BOX3D_DISPOSED'
                      : 'AIR_E_BOX3D_REENTRANT',
                operation,
                `Owner configuration is unavailable during ${this.#phase}.`,
            );
    }
    /** Callback-list updates are JS-only: native contact capture is fixed at
     * solid shape creation. Do not reuse the broader committed-read admission. */
    assertListenerUpdate(operation: string): void {
        if (this.#jointActivity) throw worldError('AIR_E_BOX3D_REENTRANT', operation, 'Fixed activity transaction is active.');
        if (this.#phase === 'dispatch') return;
        this.assertConfiguration(operation);
    }
    /** Exact provisional source; public Collider getters are never ownership authority. */
    prepareInitialShapeMaterial<T>(
        adapter: object,
        component: Collider,
        copy: (material: PhysicsMaterial | null) => T,
    ) {
        this.assertConfiguration('prepare initial shape material');
        this.assertSystemBinding();
        const initialization = beginPhysicsMaterialSourceInitialization(component, adapter, this.#world);
        let scope: Box3DOwnerFenceScope | null = null;
        try {
            const identity = initialization.readActualIdentity();
            if (identity !== null) this.#assertMaterialLive(identity);
            const material = identity as PhysicsMaterial | null;
            scope = this.#begin(
                'material',
                material ? [material, component, component.node] : [component, component.node],
            );
            const copied = copy(material);
            initialization.assertValid();
            scope.dispose();
            scope = null;
            return Object.freeze({ material, copied, initialization });
        } catch (error) {
            const first = initialization.fail(error);
            try {
                scope?.dispose();
            } catch (cleanupError) {
                this.#recordCleanup('initial-material-scope-dispose', cleanupError);
                this.#materialFault?.(first);
            }
            initialization.close();
            throw first;
        }
    }
    assertAcceptedMaterialIdentity(adapter: object | null, material: PhysicsMaterial | null): void {
        this.assertConfiguration('public material identity');
        const accepted = adapter === null ? this.#defaultMaterial : this.#component(adapter).material;
        if (material !== accepted)
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'public material identity',
                'Material identity changes require the actual Collider or PhysicsSystem setter.',
            );
    }
    assertCommittedRead(operation: string): void {
        if (
            this.#commandPhase === 'committing' ||
            this.#phase === 'solving' ||
            this.#phase === 'faulted' ||
            this.#phase === 'closed'
        )
            throw worldError(
                this.#phase === 'faulted'
                    ? 'AIR_E_BOX3D_WORLD_FAULTED'
                    : this.#phase === 'closed'
                      ? 'AIR_E_BOX3D_DISPOSED'
                      : 'AIR_E_BOX3D_REENTRANT',
                operation,
                `Committed native reads are unavailable during ${this.#phase}.`,
            );
    }
    adoptBody(seed: Box3DOwnedBodySeed): object {
        this.assertConfiguration('adopt body');
        const node = seed.node;
        if (!(node instanceof Node) || !Array.isArray(seed.ancestry) || !seed.ancestry.includes(node))
            throw worldError('AIR_E_BOX3D_CONFIG', 'adopt body', 'Expected original Node ancestry.');
        const ancestry = Object.freeze(Array.from(new Set(seed.ancestry)));
        if (ancestry.some((value) => !(value instanceof Node)))
            throw worldError('AIR_E_BOX3D_CONFIG', 'adopt body', 'Invalid ancestor identity.');
        const preflight = seed.preflight,
            readCommitted = seed.readCommitted,
            resolveNative = seed.resolveNative,
            clearTargetVelocity = seed.clearTargetVelocity,
            prepareRigidActivity = seed.prepareRigidActivity;
        if ([preflight, readCommitted, resolveNative, clearTargetVelocity, prepareRigidActivity].some((fn) => typeof fn !== 'function'))
            throw worldError('AIR_E_BOX3D_CONFIG', 'adopt body', 'Expected private body accessors.');
        const record = Object.freeze({
            node,
            ancestry,
            preflight,
            readCommitted,
            resolveNative,
            clearTargetVelocity,
            prepareRigidActivity,
        });
        const key = Object.freeze({});
        this.#queue.registerBody(key);
        this.#bodies.set(key, record);
        return key;
    }
    attachComponent(body: object, seed: Box3DOwnedComponentSeed): void {
        this.assertConfiguration('attach component identity');
        const owned = this.#bodies.get(body);
        if (!owned) throw worldError('AIR_E_BOX3D_CONFIG', 'attach component identity', 'Unknown body.');
        const { adapter, component, kind, material, applyMaterial, prepareMaterialValues } = this.copyComponentSeed(
            owned.node,
            seed.adapter,
            seed,
        );
        this.#components.set(adapter, {
            body,
            component,
            kind,
            material,
            materialSource: kind === 'collider' ? (getMaterialSource(component) ?? null) : null,
            prepareMaterialValues,
            initialized: false,
            enabled: false,
        });
        if (kind === 'collider') {
            try {
                this.#bindingOwner?.declareBinding(component, adapter, adapter, 'explicit');
                const source = this.#component(adapter).materialSource;
                if (source) this.#bindingOwner?.claim(source, adapter, adapter, 'explicit');
                if (this.#valuesLease && material)
                    this.#valuesLease
                        .prepareMembership({
                            binding: adapter,
                            before: null,
                            after: material,
                            role: 'explicit',
                            initialized: false,
                        })
                        .publish(material);
                this.#registerMaterial(adapter, component as Collider, applyMaterial!);
            } catch (error) {
                try {
                    if (this.#valuesLease && material)
                        this.#valuesLease
                            .prepareMembership({
                                binding: adapter,
                                before: material,
                                after: null,
                                role: 'explicit',
                                initialized: false,
                            })
                            .publish(null);
                } catch (cleanupError) {
                    this.#recordCleanup('provisional-material-membership', cleanupError);
                    this.#materialFault?.(error);
                }
                this.#components.delete(adapter);
                throw error;
            }
        }
    }
    #component(adapter: object): ComponentRecord {
        const value = this.#components.get(adapter);
        if (!value) throw worldError('AIR_E_BOX3D_DISPOSED', 'component identity', 'Unknown component adapter.');
        return value;
    }
    completeComponent(adapter: object): void {
        this.assertConfiguration('complete component identity');
        const record = this.#component(adapter);
        if (record.kind === 'rigid-body') this.#installComponentActivity(adapter, record);
        record.initialized = true;
    }
    /** Exact component source owns cache/scheduler publication; this observer retains
     * one control scope through original callback and actual scheduler completion.
     */
    #installComponentActivity(adapter: object, record: ComponentRecord): void {
        const owned = this.#bodies.get(record.body)!;
        const lease = registerComponentActivityObserver(record.component, this.#world, {
            delegateIdentity: adapter,
            admit: () => this.#queue.withConfigurationAdmission(() => {
                this.assertConfiguration('Component.enabled admission');
                this.assertSystemBinding();
                if (this.#components.get(adapter) !== record || !record.initialized ||
                    record.component.node !== owned.node)
                    throw worldError('AIR_E_BOX3D_DISPOSED', 'Component.enabled', 'Actual component generation changed.');
            }),
            open: (context: object): ActivityPlan => {
                const scope = this.#begin('control');
                let prepared: Box3DPreparedRigidActivity | null = null,
                    before: ActivityState | null = null,
                    expected = false, effective = false,
                    cleanupCommitted = false, nativeApplied = false, delegated = false,
                    cleanedTarget: TargetRecord | null = null,
                    failed = false, first: unknown, disposed = false;
                const tokens = new Set<object>();
                const authority = (stage: 'prepare' | 'apply' | 'delegate' | 'verify'): object => {
                    const token = Object.freeze({});
                    this.#activityAuthorities.set(token, { adapter, context, scope, stage });
                    tokens.add(token);
                    return token;
                };
                const current = (): void => {
                    if (disposed || this.#scope !== scope || this.#phase !== 'control' ||
                        this.#components.get(adapter) !== record || this.#bodies.get(record.body) !== owned ||
                        record.component.node !== owned.node)
                        throw worldError('AIR_E_BOX3D_REENTRANT', 'component activity', 'Expired exact activity scope.');
                };
                const cleanup = (): void => {
                    if (disposed) return;
                    disposed = true;
                    let cleanupFailed = false, cleanupError: unknown;
                    try { prepared?.dispose(); } catch (error) { cleanupFailed = true; cleanupError = error; }
                    for (const token of tokens) this.#activityAuthorities.delete(token);
                    try { scope.dispose(); } catch (error) {
                        if (!cleanupFailed) cleanupError = error;
                        cleanupFailed = true;
                    }
                    this.#activityCleanups.delete(cleanup);
                    if (cleanupFailed) {
                        this.#recordCleanup('component-activity-dispose', cleanupError);
                        this.#materialFault?.(failed ? first : cleanupError);
                        throw cleanupError;
                    }
                };
                this.#activityCleanups.add(cleanup);
                return Object.freeze({
                    prepare: (actual: ActivityState, next: boolean): void => {
                        current();
                        before = actual;
                        expected = next;
                        if (record.enabled !== actual.scheduled ||
                            (actual.scheduled && (!actual.active || !actual.enabled)))
                        {
                            const error = worldError('AIR_E_BOX3D_CONFIG', 'component activity', 'Owner component/scheduler state disagrees.');
                            this.#materialFault?.(error);
                            throw error;
                        }
                        effective = actual.active && actual.enabled !== next && actual.scheduled !== next;
                        prepared = owned.prepareRigidActivity(adapter, authority('prepare'),
                            effective ? next : actual.scheduled, actual.scheduled);
                    },
                    apply: (): void => {
                        current();
                        if (!before) throw worldError('AIR_E_BOX3D_CONFIG', 'component activity', 'Not prepared.');
                        if (!effective) return;
                        if (!expected) {
                            const target = this.#targets.get(record.body);
                            if (target) {
                                if (target.state === 'active') {
                                    this.#queue.withTargetRevocationAdmission(() => ({ body: record.body, owner: target.token }));
                                    target.state = 'protected';
                                }
                                if (target.state !== 'protected')
                                    throw worldError('AIR_E_BOX3D_DISPOSED', 'component activity', 'Unsettled target identity.');
                                // Known not-mutated refusal leaves this revocation/protection intact.
                                owned.clearTargetVelocity();
                                cleanupCommitted = true;
                                cleanedTarget = target;
                            }
                        }
                        prepared!.apply(authority('apply'));
                        nativeApplied = true;
                    },
                    delegate: (): void => {
                        current();
                        if (!effective || !nativeApplied || delegated)
                            throw worldError('AIR_E_BOX3D_REENTRANT', 'component activity', 'Unexpected adapter delegation.');
                        prepared!.delegate(authority('delegate'));
                        delegated = true;
                    },
                    complete: (actual: ActivityState): void => {
                        current();
                        if (!before || actual.enabled !== expected || actual.active !== before.active ||
                            actual.scheduled !== (effective ? expected : before.scheduled) || (effective && !delegated))
                            throw worldError('AIR_E_BOX3D_CONFIG', 'component activity', 'Original callback/scheduler did not complete.');
                        prepared!.verify(authority('verify'), cleanedTarget !== null, effective);
                        if (effective) {
                            if (cleanedTarget) this.#settleTarget(cleanedTarget, 'paired-zero');
                            record.enabled = expected;
                            if (!expected) this.#retireContinuous(record);
                        }
                    },
                    fail: (report: ActivityFailureReport): void => {
                        if (!failed) { failed = true; first = report.error; }
                        this.#lastActivity = Object.freeze({
                            cacheWriteEntered: report.cacheWriteEntered,
                            callbackReturned: report.callbackReturned,
                            schedulerReturned: report.schedulerReturned,
                            cleanupCommitted, nativeApplied, delegated,
                            actual: report.actual, actualReadStatus: report.actualReadStatus,
                            schedulerUnchanged: report.schedulerUnchanged,
                        });
                        // A pre-cache not-mutated cleanup can remain ready, but its old handle
                        // has already been revoked. Any later partial fact is not rollback.
                        if (!before || cleanupCommitted || nativeApplied || delegated || report.cacheWriteEntered ||
                            report.appliedCount > 0 || report.schedulerUnchanged === false || (before && report.actual &&
                                (before.enabled !== report.actual.enabled || before.active !== report.actual.active ||
                                    before.scheduled !== report.actual.scheduled)) || report.actualReadStatus === 'threw' ||
                            report.actualReadStatus === 'invalid') this.#materialFault?.(first);
                    },
                    dispose: cleanup,
                });
            },
        });
        this.#activityLeases.set(adapter, lease);
    }
    consumeActivityAuthority(
        adapter: object, authority: object, stage: 'prepare' | 'apply' | 'delegate' | 'verify',
    ): void {
        const expected = this.#activityAuthorities.get(authority);
        if (!expected || expected.adapter !== adapter || expected.stage !== stage ||
            this.#scope !== expected.scope || this.#phase !== 'control')
            throw worldError('AIR_E_BOX3D_REENTRANT', 'component activity authority', 'Foreign, expired or consumed token.');
        this.#activityAuthorities.delete(authority);
    }


    commitComponentEnabled(adapter: object, enabled: boolean): void {
        if (!enabled && (this.#phase === 'faulted' || this.#phase === 'closed')) return;
        this.assertConfiguration('component activity');
        if (typeof enabled !== 'boolean')
            throw worldError('AIR_E_BOX3D_CONFIG', 'component activity', 'Expected boolean.');
        const record = this.#component(adapter);
        if (!record.initialized)
            throw worldError('AIR_E_BOX3D_CONFIG', 'component activity', 'Initialization is incomplete.');
        record.enabled = enabled;
        if (!enabled) this.#retireContinuous(record);
    }
    /** Installed only after world construction owns and validates its native resource. */
    installMaterialObservation(
        applyDefault: CopiedMaterialApplication,
        fault: (error: unknown) => void,
        prepareValues?: PrepareWorldMaterial,
    ): void {
        if (this.#materialFault) throw worldError('AIR_E_BOX3D_CONFIG', 'material observation', 'Already installed.');
        this.#materialFault = fault;
        if (prepareValues) {
            this.#bindingOwner = registerMaterialBindingOwner(this.#world, this.#generation, this.#world);
            this.#bindingOwner.declareBinding(this.#system, this.#world, this.#system, 'default');
            this.#installMaterialValues(prepareValues);
        }
        this.#registerMaterial(this.#system, this.#system, applyDefault);
    }
    #assertMaterialLive(asset: object): asserts asset is PhysicsMaterial {
        if (
            !(asset instanceof PhysicsMaterial) ||
            typeof asset._objFlags !== 'number' ||
            asset._objFlags & (CCObjectFlags.Destroyed | CCObjectFlags.ToDestroy | CCObjectFlags.Destroying)
        )
            throw worldError(
                'AIR_E_BOX3D_DISPOSED',
                'material ownership',
                'Expected a live, non-destroying PhysicsMaterial.',
            );
    }
    #requireValues(context: MaterialValuesContext): void {
        if (this.#valuesContext !== context || this.#phase !== 'material' || !this.#valuesScope)
            throw worldError('AIR_E_BOX3D_REENTRANT', 'private material values', 'No current private value scope.');
    }
    consumeMaterialValuesPreparation(
        authority: object,
        key: object,
        material: Readonly<Box3DSurfaceMaterial>,
    ): () => void {
        const entry = this.#valuesAuthorities.get(authority);
        if (!entry || entry.key !== key || entry.material !== material)
            throw worldError(
                'AIR_E_BOX3D_REENTRANT',
                'material value preparation',
                'No exact private preparation authority.',
            );
        this.#requireValues(entry.context);
        this.#valuesAuthorities.delete(authority);
        return () => {
            this.#requireValues(entry.context);
            this.assertSystemBinding();
        };
    }
    #installMaterialValues(prepareWorld: PrepareWorldMaterial): void {
        this.#valuesLease = registerPhysicsMaterialValuesOwner(this.#world, this.#generation, {
            admitAsset: (asset) => this.#assertMaterialLive(asset),
            open: (context) => {
                this.#valuesContext = context;
                this.#valuesScope = this.#begin('material', [context.asset as PhysicsMaterial]);
            },
            prepare: (context, copied: MaterialValuesCopied) => {
                this.#requireValues(context);
                const material = copySurfaceMaterial({ friction: copied.native[0], restitution: copied.native[1] });
                let includeDefault = false;
                const components: Box3DPreparedComponentMaterial[] = [];
                for (const binding of context.bindings) {
                    if (binding.binding === this.#system) {
                        if (binding.role !== 'default' || this.#defaultMaterial !== context.asset)
                            throw worldError('AIR_E_BOX3D_CONFIG', 'default value roster', 'Stale default ownership.');
                        includeDefault = true;
                    } else {
                        const record = this.#component(binding.binding);
                        if (
                            binding.role !== 'explicit' ||
                            record.kind !== 'collider' ||
                            !record.initialized ||
                            record.material !== context.asset ||
                            !record.prepareMaterialValues
                        )
                            throw worldError(
                                'AIR_E_BOX3D_CONFIG',
                                'component value roster',
                                'Stale or provisional explicit ownership.',
                            );
                        const authority = Object.freeze({});
                        this.#valuesAuthorities.set(authority, { key: binding.binding, material, context });
                        try {
                            components.push(record.prepareMaterialValues(authority, material));
                        } finally {
                            this.#valuesAuthorities.delete(authority);
                        }
                    }
                }
                const plan = prepareWorld(material, includeDefault, Object.freeze(components));
                // Full membership/native preflight still applies to a no-change call; it performs no setters/cache commit.
                return copied.changed ? plan : Object.freeze({ native: Object.freeze([]), commitCaches() {} });
            },
            commit: (context, actual) => {
                this.#requireValues(context);
                this.#lastValues = Object.freeze({ sequence: context.sequence, actual, failed: false });
            },
            fault: (context, failure) => {
                this.#lastValues = Object.freeze({
                    sequence: context.sequence,
                    actual: failure.actual,
                    failed: true,
                    failure,
                });
                this.#materialFault!(failure.error);
            },
            dispose: (context) => {
                if (this.#valuesContext !== context)
                    throw worldError('AIR_E_BOX3D_REENTRANT', 'value cleanup', 'Foreign cleanup context.');
                try {
                    this.#valuesScope?.dispose();
                } catch (error) {
                    this.#recordCleanup('material-value-scope-dispose', error);
                    this.#materialFault!(error);
                    throw error;
                }
                this.#valuesScope = null;
                this.#valuesContext = null;
            },
        });
    }
    /** Register against the original System source while construction still precedes selector assignment.
     * Only later execution/transition admission requires the live System/world binding.
     * The queue and producer registry are actual prepared participants. Full qualification is not
     * represented by an empty, allegedly-qualified roster.
     */
    installSystemControlObservation(fault: (error: unknown) => void): void {
        if (this.#systemControlLease)
            throw worldError('AIR_E_BOX3D_CONFIG', 'System observation', 'Already installed.');
        let context: Readonly<PhysicsStateChangeContext> | null = null;
        let scope: Box3DOwnerFenceScope | null = null;
        let transition: PreparedCommandPause | null = null;
        let producerTransition: PreparedCommandPause | null = null;
        let producerEntered = false,
            producerReturned = false;
        let expected: PhysicsSystemControlState | null = null;
        let entered = false,
            returned = false,
            failed = false,
            failure: unknown;
        const requireContext = (value: Readonly<PhysicsStateChangeContext>): void => {
            if (value !== context || !scope || this.#phase !== 'control')
                throw worldError('AIR_E_BOX3D_REENTRANT', 'System observation', 'Inactive private control context.');
        };
        const remember = (actual: PhysicsSystemControlState | null, actualRead: string): void => {
            this.#lastControl = Object.freeze({
                operation: context?.operation ?? 'system-initial-state',
                cacheEnabled: actual?.enabled ?? null,
                cacheAutoSimulation: actual?.autoSimulation ?? null,
                queueCommitEntered: entered,
                queueCommitReturned: returned,
                producerCommitEntered: producerEntered,
                producerCommitReturned: producerReturned,
                failed,
                actualRead,
            });
        };
        const cleanup = (): void => {
            let cleanupFailed = false,
                first: unknown;
            try {
                transition?.dispose();
                transition = null;
            } catch (error) {
                this.#recordCleanup('system-control-queue-dispose', error);
                cleanupFailed = true;
                first = error;
            }
            try {
                producerTransition?.dispose();
                producerTransition = null;
            } catch (error) {
                this.#recordCleanup('system-control-producer-dispose', error);
                if (!cleanupFailed) first = error;
                cleanupFailed = true;
            }
            try {
                scope?.dispose();
                scope = null;
            } catch (error) {
                // Scope records each actual leaf error itself.
                if (!cleanupFailed) first = error;
                cleanupFailed = true;
            }
            if (cleanupFailed) {
                fault(failed ? failure : first);
                throw first;
            }
            context = null;
            expected = null;
            this.#controlCleanups.delete(cleanup);
        };
        const lease = registerPhysicsSystemControl(
            this.#system,
            {
                open: (value) => {
                    context = value;
                    entered = returned = producerEntered = producerReturned = failed = false;
                    failure = undefined;
                    this.#controlCleanups.add(cleanup);
                    this.#admitClockControl(false);
                    scope = this.#begin('control');
                },
                preflight: (value, before, candidate) => {
                    requireContext(value);
                    if (
                        before.kind !== 'system-control' ||
                        candidate.kind !== 'system-control' ||
                        before.enabled === this.#systemPaused ||
                        (value.operation === 'system-enable' && before.autoSimulation !== candidate.autoSimulation) ||
                        (value.operation === 'system-auto-simulation' && before.enabled !== candidate.enabled)
                    )
                        throw worldError(
                            'AIR_E_BOX3D_CONFIG',
                            'System control preflight',
                            'Inconsistent copied control state.',
                        );
                    expected = candidate;
                    // Allocate and reserve every installed participant before System writes its cache.
                    if (value.operation === 'system-enable') {
                        transition = this.#queue.preparePauseTransition(!candidate.enabled || this.#gamePaused);
                        producerTransition = this.#producers.preparePauseTransitionWithinControl(!candidate.enabled || this.#gamePaused);
                    }
                },
                commit: (value, actual) => {
                    requireContext(value);
                    if (
                        actual.kind !== 'system-control' ||
                        !expected ||
                        actual.enabled !== expected.enabled ||
                        actual.autoSimulation !== expected.autoSimulation
                    )
                        throw worldError(
                            'AIR_E_BOX3D_CONFIG',
                            'System control commit',
                            'Actual private cache does not match candidate.',
                        );
                    if (transition) {
                        entered = true;
                        transition.commit();
                        returned = true;
                        producerEntered = true;
                        producerTransition!.commit();
                        producerReturned = true;
                        this.#systemPaused = !actual.enabled;
                    }
                    remember(actual, 'copied');
                },
                fail: (_value, report) => {
                    if (!failed) {
                        failed = true;
                        failure = report.error;
                    }
                    remember(report.actual?.kind === 'system-control' ? report.actual : null, report.actualRead);
                    // A rejected input before cache/effect entry is recoverable. Any changed/unknown
                    // cache or entered participant commit faults; never pretend metadata was rolled back.
                    const actual = report.actual?.kind === 'system-control' ? report.actual : null;
                    const before = report.before?.kind === 'system-control' ? report.before : null;
                    const actualChanged =
                        report.actualRead === 'copied' &&
                        (!actual ||
                            !before ||
                            actual.enabled !== before.enabled ||
                            actual.autoSimulation !== before.autoSimulation);
                    if (
                        report.effects.length ||
                        entered ||
                        producerEntered ||
                        actualChanged ||
                        report.actualRead === 'failed'
                    )
                        fault(failure);
                },
                dispose: () => cleanup(),
            },
            () => this.systemControlDisposition(),
        );
        this.#systemControlLease = lease;
        const initial = lease.initialState;
        if (!initial.enabled) {
            // Bootstrap is an actual participant transition too: retain its lease for
            // terminal cleanup and preserve the first error even if disposal also throws.
            this.#controlCleanups.add(cleanup);
            let initialFailed = false,
                initialError: unknown;
            this.#initialProducerControl = true;
            try {
                transition = this.#queue.preparePauseTransition(true);
                producerTransition = this.#producers.preparePauseTransitionWithinControl(true);
                entered = true;
                transition.commit();
                returned = true;
                producerEntered = true;
                producerTransition.commit();
                producerReturned = true;
                this.#systemPaused = true;
                remember(initial, 'copied');
            } catch (error) {
                initialFailed = failed = true;
                initialError = failure = error;
                remember(initial, 'copied');
            }
            try {
                cleanup();
            } catch (error) {
                if (!initialFailed) initialError = error;
                initialFailed = true;
            }
            this.#initialProducerControl = false;
            if (initialFailed) throw initialError;
        }
    }
    /** Queue admission comes first so a caught producer request poisons its collecting candidate. */
    #admitClockControl(initial: boolean): void {
        try {
            this.#queue.withConfigurationAdmission(() => undefined);
            if (!initial) {
                this.assertConfiguration('Game/System clock control');
                this.assertSystemBinding();
            }
        } catch (error) {
            // A writeback callback may catch the refusal. Keep that refusal on the exact outer scope.
            if (this.#scope && ['preflight', 'solving', 'writeback', 'dispatch'].includes(this.#phase) &&
                !this.#clockReentry) this.#clockReentry = { error };
            throw error;
        }
    }
    #assertNoClockReentry(): void {
        if (this.#clockReentry) throw this.#clockReentry.error;
    }
    /** Register before selector binding, with the original Game's copied startup reasons. */
    installGameControlObservation(fault: (error: unknown) => void): void {
        if (this.#gameControlLease)
            throw worldError('AIR_E_BOX3D_CONFIG', 'Game observation', 'Already installed.');
        this.#gameControlLease = registerGameClockObserver(game, {
            admit: (initial) => this.#admitClockControl(initial),
            assertLive: () => {
                this.assertConfiguration('Game frame admission');
                this.assertSystemBinding();
            },
            prepare: (before, candidate, initial): GameClockPlan => {
                let scope: Box3DOwnerFenceScope | null = null;
                let queue: PreparedCommandPause | null = null, producers: PreparedCommandPause | null = null;
                let entered = false, returned = false, producerEntered = false, producerReturned = false;
                let failed = false, first: unknown, disposed = false;
                let failure: GameClockFailure | null = null;
                const remember = (actual: GameClockState): void => {
                    this.#lastGameControl = Object.freeze({ before, actual, queueCommitEntered: entered,
                        queueCommitReturned: returned, producerCommitEntered: producerEntered,
                        producerCommitReturned: producerReturned, failure });
                };
                const cleanup = (): void => {
                    if (disposed) return;
                    let cleanupFailed = false, cleanupError: unknown;
                    const attempt = (label: string, action: () => void): void => {
                        try { action(); } catch (error) {
                            this.#recordCleanup(label, error);
                            if (!cleanupFailed) cleanupError = error;
                            cleanupFailed = true;
                        }
                    };
                    attempt('game-control-queue-dispose', () => { queue?.dispose(); queue = null; });
                    attempt('game-control-producer-dispose', () => { producers?.dispose(); producers = null; });
                    attempt('game-control-scope-dispose', () => { scope?.dispose(); scope = null; });
                    if (initial) this.#initialProducerControl = false;
                    if (cleanupFailed) { fault(failed ? first : cleanupError); throw cleanupError; }
                    disposed = true;
                    this.#controlCleanups.delete(cleanup);
                };
                this.#controlCleanups.add(cleanup);
                try {
                    if (initial) this.#initialProducerControl = true;
                    else {
                        scope = this.#begin('control');
                        if (!this.#gameState || this.#gameState.applicationPaused !== before.applicationPaused ||
                            this.#gameState.backgroundPaused !== before.backgroundPaused ||
                            this.#gameState.terminal !== before.terminal || this.#gameState.manual !== before.manual)
                            throw worldError('AIR_E_BOX3D_CONFIG', 'Game control', 'Owner/source reasons disagree.');
                    }
                    const paused = this.#systemPaused || gameClockSemanticPause(candidate);
                    queue = this.#queue.preparePauseTransition(paused);
                    producers = this.#producers.preparePauseTransitionWithinControl(paused);
                } catch (error) {
                    failed = true; first = error;
                    try { cleanup(); } catch { /* Keep the original preparation error. */ }
                    throw error;
                }
                const plan: GameClockPlan = Object.freeze({
                    commit: (): void => {
                        if (disposed || !queue || !producers)
                            throw worldError('AIR_E_BOX3D_REENTRANT', 'Game control commit', 'Expired prepared plan.');
                        this.#gameState = candidate;
                        this.#gamePaused = gameClockSemanticPause(candidate);
                        entered = true; queue.commit(); returned = true;
                        producerEntered = true; producers.commit(); producerReturned = true;
                        remember(candidate);
                    },
                    fail: (report): void => {
                        if (!failed) { failed = true; first = report.error; }
                        failure = report;
                        remember(report.actual);
                        if (report.reasonCommitted || report.effectEntered || entered || producerEntered) fault(first);
                    },
                    dispose: cleanup,
                });
                return plan;
            },
        });
    }
    assertNativeClockFrame(): void {
        if (!this.#gameControlLease)
            throw worldError('AIR_E_BOX3D_DISPOSED', 'native Game frame', 'No observed original Game owner.');
        this.#gameControlLease.assertNativeAdvance();
    }
    #aggregatePaused(): boolean {
        // Terminal source truth survives a refused/faulted owner preparation.
        return this.#systemPaused || this.#gamePaused || !!this.#gameControlLease?.diagnostics().terminal;
    }
    systemControlDisposition(): 'ready' | 'paused' {
        this.assertConfiguration('System execution admission');
        this.assertSystemBinding();
        return this.#aggregatePaused() ? 'paused' : 'ready';
    }
    assertSteppingAllowed(operation: string): void {
        if (this.systemControlDisposition() === 'paused')
            throw worldError('AIR_E_BOX3D_CONFIG', operation, 'The observed PhysicsSystem owner is paused.');
    }
    validateDefaultMaterial(material: PhysicsMaterial): void {
        this.assertConfiguration('default material identity');
        if (!(material instanceof PhysicsMaterial))
            throw worldError('AIR_E_BOX3D_CONFIG', 'default material identity', 'Expected PhysicsMaterial.');
    }
    /** Old IPhysicsWorld entry still uses the same copied kernel, never a cache identity notification. */
    beginMaterialKernel(material: PhysicsMaterial): Box3DOwnerFenceScope {
        this.validateDefaultMaterial(material);
        return this.#begin('material', [material]);
    }
    consumeMaterialAuthority(authority: object, key: object, material: Readonly<Box3DSurfaceMaterial> | null): void {
        const value = this.#materialAuthorities.get(authority);
        if (
            !value ||
            value.key !== key ||
            value.material !== material ||
            value.context !== this.#materialContext ||
            this.#phase !== 'material'
        )
            throw worldError(
                'AIR_E_BOX3D_REENTRANT',
                'copied material application',
                'No exact private material authority.',
            );
        this.#materialAuthorities.delete(authority); // consume before any native or adapter write
    }
    #recordCleanup(stage: string, error: unknown): void {
        // Bounded fault/teardown diagnostics, not an unbounded historical target registry.
        if (this.#cleanupFailures.length < 4096) this.#cleanupFailures.push(Object.freeze({ stage, error }));
        else ++this.#omittedCleanupFailures;
    }
    #registerMaterial(key: object, target: Collider | PhysicsSystem, apply: CopiedMaterialApplication): void {
        let context: Readonly<PhysicsStateChangeContext> | null = null;
        let scope: Box3DOwnerFenceScope | null = null;
        let copied: Readonly<Box3DSurfaceMaterial> | null = null;
        const guards = new Map<object, MutationGuardLease>();
        let membership: PreparedMaterialMembership | null = null;
        let preparedAsset: object | null | undefined;
        let preserveMembership = false;
        const previousAsset = () => (key === this.#system ? this.#defaultMaterial : this.#component(key).material);
        const prepareMembership = (asset: object | null, initialize: boolean): void => {
            if (!this.#valuesLease) return;
            if (membership && preparedAsset === asset) return;
            membership?.cancel();
            membership = null;
            preparedAsset = undefined;
            membership = this.#valuesLease.prepareMembership({
                binding: key,
                before: previousAsset(),
                after: asset,
                role: key === this.#system ? 'default' : 'explicit',
                initialized: key === this.#system || initialize || this.#component(key).initialized,
            });
            preparedAsset = asset;
        };
        let hasBusinessFailure = false,
            businessFailure: unknown;
        const cleanup = (): void => {
            let failed = false,
                primary: unknown;
            if (membership && !preserveMembership) {
                try {
                    membership.cancel();
                    membership = null;
                    preparedAsset = undefined;
                } catch (error) {
                    this.#recordCleanup('material-membership-cancel', error);
                    primary = error;
                    failed = true;
                }
            }
            for (const [asset, guard] of guards) {
                try {
                    guard.dispose();
                    guards.delete(asset);
                } catch (error) {
                    this.#recordCleanup('material-candidate-guard-dispose', error);
                    if (!failed) primary = error;
                    failed = true;
                }
            }
            try {
                scope?.dispose();
                scope = null;
            } catch (error) {
                if (!failed) primary = error;
                failed = true;
            }
            if (failed) {
                this.#materialFault!(hasBusinessFailure ? businessFailure : primary);
                throw primary;
            }
            if (this.#materialContext === context) this.#materialContext = null;
            context = null;
            this.#materialCleanups.delete(cleanup);
        };
        const requireContext = (value: Readonly<PhysicsStateChangeContext>): void => {
            if (context !== value || this.#materialContext !== value || !scope)
                throw worldError('AIR_E_BOX3D_REENTRANT', 'material observer', 'Inactive private material context.');
        };
        const lease = registerPhysicsMaterialDelegate(
            target,
            {
                open: (value) => {
                    // No asset/component getters precede the complete owner barrier.
                    context = value;
                    hasBusinessFailure = false;
                    businessFailure = undefined;
                    preserveMembership = false;
                    this.#materialCleanups.add(cleanup);
                    scope = this.#begin('material');
                    this.#materialContext = value;
                },
                protectCandidate: (value, asset) => {
                    requireContext(value);
                    if (!(asset instanceof PhysicsMaterial))
                        throw worldError(
                            'AIR_E_BOX3D_CONFIG',
                            'material candidate',
                            'Expected actual PhysicsMaterial.',
                        );
                    this.#assertMaterialLive(asset);
                    if (!guards.has(asset)) guards.set(asset, registerMutationGuard([asset], rejection));
                    if (value.operation === 'collider-material-clone' && asset !== previousAsset())
                        prepareMembership(asset, false);
                },
                preflightCopied: (value, candidate: Readonly<PhysicsMaterialCandidate>) => {
                    requireContext(value);
                    if (key === this.#system && candidate.asset === null)
                        throw worldError('AIR_E_BOX3D_CONFIG', 'default material', 'Default material cannot be null.');
                    const coefficients = candidate.coefficients;
                    if (coefficients && (coefficients[2] !== 0 || coefficients[3] !== 0))
                        unsupportedBox3D('nonzero rollingFriction/spinningFriction');
                    copied = coefficients
                        ? copySurfaceMaterial({
                              friction: coefficients[0],
                              restitution: coefficients[1],
                          })
                        : null;
                    prepareMembership(candidate.asset, value.operation === 'collider-material-initialize');
                },
                applyCopied: (value) => {
                    requireContext(value);
                    const authority = Object.freeze({});
                    this.#materialAuthorities.set(authority, {
                        key,
                        material: copied,
                        context: value,
                    });
                    try {
                        apply(authority, copied);
                    } finally {
                        this.#materialAuthorities.delete(authority);
                    }
                },
                commitActual: (value, actual) => {
                    requireContext(value);
                    if (actual.material !== null && !(actual.material instanceof PhysicsMaterial))
                        throw worldError('AIR_E_BOX3D_CONFIG', 'material commit', 'Actual cache identity is invalid.');
                    if (membership) {
                        if (actual.material !== preparedAsset)
                            throw worldError(
                                'AIR_E_BOX3D_CONFIG',
                                'material membership',
                                'Actual identity differs from prepared identity.',
                            );
                        membership.publish(actual.material);
                        membership = null;
                        preparedAsset = undefined;
                    }
                    if (key === this.#system) this.#defaultMaterial = actual.material as PhysicsMaterial;
                    else {
                        const record = this.#component(key);
                        record.material = actual.material as PhysicsMaterial | null;
                        if (value.operation === 'collider-material-initialize') record.initialized = true;
                    }
                    const source =
                        key === this.#system ? getMaterialSource(target) : this.#component(key).materialSource;
                    if (source)
                        this.#bindingOwner?.claim(
                            source,
                            key === this.#system ? this.#world : key,
                            key,
                            key === this.#system ? 'default' : 'explicit',
                        );
                    this.#lastMaterial = Object.freeze({
                        operation: value.operation,
                        actualRead: 'copied',
                        actualMatchesBefore: null,
                        actualMatchesCandidate: value.operation === 'collider-material-clone' ? null : true,
                        effects: Object.freeze([]),
                        failed: false,
                    });
                },
                fail: (value, failure: Readonly<PhysicsStateFailure>) => {
                    if (!hasBusinessFailure) {
                        hasBusinessFailure = true;
                        businessFailure = failure.error;
                    }
                    preserveMembership =
                        failure.effects.length > 0 || value.operation === 'collider-material-initialize';
                    const actual = failure.actual;
                    const actualMaterial =
                        actual && (actual.kind === 'collider-material' || actual.kind === 'system-default-material')
                            ? actual.material
                            : undefined;
                    const identity = (snapshot: PhysicsStateFailure['actual']) =>
                        snapshot &&
                        (snapshot.kind === 'collider-material' || snapshot.kind === 'system-default-material')
                            ? snapshot.material
                            : undefined;
                    // A copied actual cache is authoritative even when later listener/owner work failed.
                    if (
                        failure.actualRead === 'copied' &&
                        (actualMaterial === null || actualMaterial instanceof PhysicsMaterial)
                    ) {
                        if (key === this.#system) this.#defaultMaterial = actualMaterial as PhysicsMaterial | null;
                        else this.#component(key).material = actualMaterial as PhysicsMaterial | null;
                    }
                    this.#lastMaterial = Object.freeze({
                        operation: value.operation,
                        actualRead: failure.actualRead,
                        actualMatchesBefore:
                            failure.actualRead === 'copied' ? actualMaterial === identity(failure.before) : null,
                        actualMatchesCandidate:
                            failure.actualRead === 'copied' ? actualMaterial === identity(failure.candidate) : null,
                        effects: Object.freeze([...failure.effects]),
                        failed: true,
                    });
                    if (failure.effects.length || value.operation === 'collider-material-initialize')
                        this.#materialFault!(failure.error);
                },
                dispose: () => cleanup(),
            },
            {
                generation: nextPhysicsMaterialCleanupGeneration(target),
                report: (report) => {
                    for (const failure of report.errors)
                        this.#recordCleanup(`collider-${failure.stage}`, failure.error);
                    if (report.hasFailure) this.#materialFault!(report.firstError);
                },
            },
            this.#valuesLease ? 'private' : 'legacy',
            readPhysicsMaterialPrivateValues,
        );
        this.#materialLeases.set(key, lease);
    }
    releaseComponentAfterCleanup(adapter: object): void {
        if (this.#phase !== 'faulted' && this.#phase !== 'closed')
            this.assertConfiguration('release component identity');
        const component = this.#components.get(adapter);
        if (this.#valuesLease && this.#phase === 'idle' && component?.material)
            this.#valuesLease
                .prepareMembership({
                    binding: adapter,
                    before: component.material,
                    after: null,
                    role: 'explicit',
                    initialized: component.initialized,
                })
                .publish(null);
        if (this.#bindingOwner && this.#phase === 'idle' && component) {
            const source = component.materialSource;
            if (source) closeMaterialSource(source, this.#bindingOwner.confirmBindingReleased(source));
        }
        if (component?.kind === 'rigid-body') {
            const target = this.#targets.get(component.body);
            if (target) {
                if (this.#phase !== 'faulted' && this.#phase !== 'closed')
                    throw worldError('AIR_E_BOX3D_CONFIG', 'release component', 'Target native cleanup is unsettled.');
                this.#releaseTargetGuard(target);
                target.state = 'unresolved';
            }
            this.#retireContinuous(component, true);
        }
        this.#activityLeases.get(adapter)?.dispose();
        this.#activityLeases.delete(adapter);
        // Faulted native cleanup is not a release proof. Keep its roster until confirmed world teardown.
        this.#materialLeases.get(adapter)?.dispose();
        this.#materialLeases.delete(adapter);
        if (this.#phase === 'closed') {
            // JS component teardown is not evidence that an unresolved native body was released.
            if (this.#nativeTeardown === 'unresolved') this.#components.delete(adapter);
            return;
        }
        this.#components.delete(adapter);
    }
    retireBodyAfterDestroy(body: object): void {
        this.assertConfiguration('retire body identity');
        if (!this.#bodies.has(body) || [...this.#components.values()].some((value) => value.body === body))
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'retire body identity',
                'Body is foreign or still has component ownership.',
            );
        this.#queue.releaseBodyAfterTeardown(body);
        this.#bodies.delete(body);
    }
    #materials(): Set<PhysicsMaterial> {
        const result = new Set<PhysicsMaterial>();
        if (this.#defaultMaterial) result.add(this.#defaultMaterial);
        for (const component of this.#components.values()) if (component.material) result.add(component.material);
        return result;
    }
    #begin(
        phase: 'admission' | 'producer' | 'preflight' | 'dispatch' | 'material' | 'control',
        extraMaterials: readonly object[] = [],
    ): Box3DOwnerFenceScope {
        this.assertConfiguration('begin temporary scope');
        this.assertSystemBinding();
        // Private records only: no component/material getter or caller iterator executes here.
        const nodes = new Set<Node>();
        for (const body of this.#bodies.values()) for (const node of body.ancestry) nodes.add(node);
        const targets = Object.freeze([
            this.#system,
            Node.prototype,
            ...nodes,
            ...Array.from(this.#components.values(), (value) => value.component),
            ...this.#materials(),
            ...extraMaterials,
        ]);
        let mutation: MutationGuardLease | undefined;
        let transform: NodeTransformGuardLease | undefined;
        this.#phase = phase;
        this.#clockReentry = null;
        try {
            mutation = registerMutationGuard(targets, rejection);
            if (nodes.size) transform = registerNodeTransformGuard(Object.freeze(Array.from(nodes)), rejection);
        } catch (error) {
            let cleanupFailed = false;
            try {
                mutation?.dispose();
            } catch (cleanupError) {
                cleanupFailed = true;
                this.#recordCleanup('scope-admission-mutation-dispose', cleanupError);
                this.#materialFault?.(error);
            } finally {
                if (!cleanupFailed) this.#phase = 'idle';
            }
            throw error;
        }
        const owned = this,
            bodyNodes = new Set(Array.from(this.#bodies.values(), (body) => body.node)),
            expectedWrites = new Map<Node, Set<NodeTransformWriteOperation>>();
        let disposed = false,
            writebackPrepared = false;
        let reservation: NodeTransformWriteReservation | undefined;
        const persistentReservations = new Map<TargetRecord, NodeTransformWriteReservation>();
        const scope: Box3DOwnerFenceScope = Object.freeze({
            prepareWriteback(plannedNodes: readonly Node[]): void {
                owned.#assertNoClockReentry();
                if (disposed || owned.#scope !== scope || owned.#phase !== 'preflight' || writebackPrepared)
                    throw worldError('AIR_E_BOX3D_REENTRANT', 'prepare writeback', 'No unused preflight scope.');
                if (!Array.isArray(plannedNodes))
                    throw worldError('AIR_E_BOX3D_CONFIG', 'prepare writeback', 'Expected copied Node inventory.');
                const planned = new Set<Node>();
                for (const node of plannedNodes) {
                    if (!nodes.has(node) || !bodyNodes.has(node) || planned.has(node))
                        throw worldError('AIR_E_BOX3D_CONFIG', 'prepare writeback', 'Node is foreign or duplicated.');
                    planned.add(node);
                }
                const count = planned.size * 2;
                if (!Number.isSafeInteger(count) || count < 0 || (count > 0 && !transform))
                    throw worldError('AIR_E_BOX3D_CONFIG', 'prepare writeback', 'Unsafe exact-write inventory.');
                // Reserve both setters for every participant before native validation or application.
                const covering = [...owned.#targets.values()]
                    .filter((target) => target.guard !== null)
                    .map((target) => ({
                        target,
                        count: [...planned].filter((node) => target.ancestry.includes(node)).length * 2,
                    }))
                    .filter((row) => row.count > 0);
                // Check EVERY capacity first; no earlier owner may burn a reservation on later refusal.
                transform?.assertWriteCapacity(count);
                for (const row of covering) row.target.guard!.assertWriteCapacity(row.count);
                reservation = transform?.reserveWrites(count);
                for (const row of covering)
                    persistentReservations.set(row.target, row.target.guard!.reserveWrites(row.count));
                for (const node of planned) expectedWrites.set(node, new Set(['setWorldPosition', 'setWorldRotation']));
                writebackPrepared = true;
            },
            advance(next: 'solving' | 'writeback'): void {
                owned.#assertNoClockReentry();
                if (
                    disposed ||
                    owned.#scope !== scope ||
                    !(
                        (owned.#phase === 'preflight' && next === 'solving') ||
                        (owned.#phase === 'solving' && next === 'writeback')
                    )
                )
                    throw worldError('AIR_E_BOX3D_REENTRANT', 'scope phase', 'Invalid private phase transition.');
                owned.#phase = next;
            },
            write(
                node: Node,
                operation: NodeTransformWriteOperation,
                expected: readonly number[],
                perform: () => void,
            ): void {
                if (
                    disposed ||
                    owned.#scope !== scope ||
                    owned.#phase !== 'writeback' ||
                    !writebackPrepared ||
                    !reservation ||
                    !expectedWrites.get(node)?.has(operation)
                )
                    throw worldError(
                        'AIR_E_BOX3D_REENTRANT',
                        'owned write',
                        'No active exact-write scope for this Node.',
                    );
                // Consume the exact operation before any expected-value getter or callback can run.
                expectedWrites.get(node)!.delete(operation);
                const grants = [...persistentReservations]
                    .filter(([target]) => target.ancestry.includes(node))
                    .map(([, grant]) => grant);
                const write = (index: number): void => {
                    if (index === grants.length) perform();
                    else grants[index].write(node, operation, expected, () => write(index + 1));
                };
                owned.#assertNoClockReentry();
                reservation.write(node, operation, expected, () => write(0));
                owned.#assertNoClockReentry();
            },
            dispose(): void {
                if (disposed) return;
                let failed = false,
                    failure: unknown;
                try {
                    reservation?.dispose();
                } catch (error) {
                    owned.#recordCleanup('scope-write-reservation-dispose', error);
                    failed = true;
                    failure = error;
                }
                for (const grant of persistentReservations.values()) {
                    try {
                        grant.dispose();
                    } catch (error) {
                        owned.#recordCleanup('persistent-write-reservation-dispose', error);
                        if (!failed) failure = error;
                        failed = true;
                    }
                }
                persistentReservations.clear();
                try {
                    transform?.dispose();
                } catch (error) {
                    owned.#recordCleanup('scope-transform-dispose', error);
                    if (!failed) failure = error;
                    failed = true;
                }
                try {
                    mutation?.dispose();
                } catch (error) {
                    owned.#recordCleanup('scope-mutation-dispose', error);
                    if (!failed) failure = error;
                    failed = true;
                }
                if (failed) {
                    owned.#phase = 'faulted';
                    throw failure;
                }
                disposed = true;
                if (owned.#scope === scope) owned.#scope = null;
                if (owned.#phase !== 'faulted' && owned.#phase !== 'closed') owned.#phase = 'idle';
            },
        });
        this.#scope = scope;
        return scope;
    }
    /** A Fixed enabled request performs no native writes. Reuse an existing dispatch
     * fence, or own a full control fence until original lifecycle/scheduler completes. */
    beginJointActivity(): { assertCurrent(): void; dispose(): void } {
        this.assertListenerUpdate('Fixed activity scope');
        const borrowed = this.#phase === 'dispatch';
        const scope = borrowed ? this.#scope : this.#begin('control');
        const token = Object.freeze({});
        this.#jointActivity = token;
        let disposed = false;
        return Object.freeze({
            assertCurrent: () => {
                if (disposed || this.#jointActivity !== token || this.#scope !== scope ||
                    this.#phase !== (borrowed ? 'dispatch' : 'control'))
                    throw worldError('AIR_E_BOX3D_REENTRANT', 'Fixed activity', 'Expired request scope.');
            },
            dispose: () => {
                if (disposed) return;
                disposed = true;
                try { if (!borrowed) scope?.dispose(); }
                finally { if (this.#jointActivity === token) this.#jointActivity = null; }
            },
        });
    }
    beginStep(): Box3DOwnerFenceScope {
        this.assertSteppingAllowed('begin step');
        this.assertNativeClockFrame();
        return this.#begin('preflight');
    }
    beginDispatch(
        constraints: readonly (FixedConstraint | HingeConstraint | PointToPointConstraint)[] = [],
    ): Box3DDispatchScope {
        this.assertConfiguration('joint dispatch admission');
        const additional = constraints.map((component) => {
            if (
                !(component instanceof FixedConstraint) &&
                !(component instanceof HingeConstraint) &&
                !(component instanceof PointToPointConstraint)
            )
                throw worldError(
                    'AIR_E_BOX3D_CONFIG',
                    'joint dispatch',
                    'Expected actual FixedConstraint, HingeConstraint or PointToPointConstraint.',
                );
            // A destroyed RigidBody may leave a deliberately orphaned Constraint.
            // Its JS lifecycle identity remains owned, independently of native body lifetime.
            const ancestry: Node[] = [];
            for (let node: Node | null = component.node; node; node = node.parent) {
                if (ancestry.includes(node)) throw worldError('AIR_E_BOX3D_CONFIG', 'joint dispatch', 'Cyclic Node ancestry.');
                ancestry.push(node);
            }
            return Object.freeze({ component, ancestry: Object.freeze(ancestry) });
        });
        const scope = this.#begin('dispatch');
        let admission: DeferredDestroyScope;
        const ancestry = new Map<object, readonly Node[]>();
        try {
            const targets: DeferredDestroyTarget[] = [];
            const nodes = new Set<Node>();
            for (const body of this.#bodies.values()) for (const node of body.ancestry) nodes.add(node);
            for (const row of additional) for (const node of row.ancestry) nodes.add(node);
            for (const node of nodes) targets.push({ target: node, operation: 'Node.destroy' });
            for (const component of this.#components.values()) {
                const body = this.#bodies.get(component.body);
                if (!body) throw worldError('AIR_E_BOX3D_ABI', 'dispatch destruction', 'Missing owned body.');
                ancestry.set(component.component, body.ancestry);
                targets.push({ target: component.component, operation: 'Component.destroy' });
            }
            for (const row of additional) {
                ancestry.set(row.component, row.ancestry);
                targets.push({ target: row.component, operation: 'Component.destroy' });
            }
            admission = registerDeferredDestroyScope(Object.freeze(targets));
            this.#destroyAdmission = admission;
        } catch (error) {
            scope.dispose();
            throw error;
        }
        let disposed = false;
        let drained = false;
        const owner = this;
        return Object.freeze({
            ...scope,
            pendingDestruction(component: Collider): boolean {
                return (
                    admission.pending(component) ||
                    (ancestry.get(component)?.some((node) => admission.pending(node)) ?? false)
                );
            },
            dispose(): void {
                if (disposed) return;
                // Release queue admission even if releasing another fence fails.
                admission.dispose();
                if (owner.#destroyAdmission === admission) owner.#destroyAdmission = null;
                scope.dispose();
                disposed = true;
            },
            drainDestruction(): void {
                if (!disposed || drained)
                    throw worldError(
                        'AIR_E_BOX3D_REENTRANT',
                        'dispatch destruction',
                        'No unconsumed completed dispatch.',
                    );
                drained = true;
                owner.assertConfiguration('dispatch destruction safe point');
                const errors: unknown[] = [];
                for (const request of admission.requests()) {
                    try {
                        if (request.operation === 'Node.destroy') originalNodeDestroy.call(request.target as Node);
                        else originalComponentDestroy.call(request.target as Component);
                    } catch (error) {
                        errors.push(error);
                    }
                }
                if (errors.length)
                    throw Object.assign(
                        worldError('AIR_E_BOX3D_WORLD_FAULTED', 'dispatch destruction', 'Deferred destruction failed.'),
                        { cause: errors[0], errors: Object.freeze(errors) },
                    );
            },
        });
    }
    fault(): void {
        if (this.#phase !== 'closed') this.#phase = 'faulted';
    }
    /** The world supplies this proof only after destroyWorld returned successfully.
     * Unknown native teardown closes the terminal JS queue/fences but retains body identities.
     */
    closeAfterWorldTeardown(nativeTeardownConfirmed: boolean): void {
        let cleanupFailed = false,
            cleanupError: unknown;
        const attempt = (perform: () => void): void => {
            try {
                perform();
            } catch (error) {
                if (!cleanupFailed) cleanupError = error;
                cleanupFailed = true;
            }
        };
        attempt(() => this.#destroyAdmission?.dispose());
        this.#destroyAdmission = null;
        attempt(() => this.#motionRouting?.dispose());
        this.#motionRouting = null;
        attempt(() => this.#commandRouting?.dispose());
        this.#commandRouting = null;
        for (const cleanup of [...this.#controlCleanups]) attempt(cleanup);
        for (const cleanup of [...this.#activityCleanups]) attempt(cleanup);
        for (const [adapter, lease] of this.#activityLeases) attempt(() => {
            lease.dispose();
            this.#activityLeases.delete(adapter);
        });
        attempt(() => this.#producers.close());
        attempt(() => {
            try {
                this.#systemControlLease?.dispose();
            } catch (error) {
                this.#recordCleanup('system-control-unregister', error);
                throw error;
            }
            this.#systemControlLease = null;
        });
        attempt(() => {
            this.#gameClockSnapshot = this.#gameControlLease?.diagnostics() ?? this.#gameClockSnapshot;
            this.#gameControlLease?.dispose();
            this.#gameControlLease = null;
        });
        for (const cleanup of [...this.#materialCleanups]) attempt(cleanup);
        attempt(() => {
            this.#valuesScope?.dispose();
            this.#valuesScope = null;
            this.#valuesContext = null;
        });
        attempt(() => this.#valuesLease?.close(nativeTeardownConfirmed ? 'released' : 'unknown'));
        attempt(() =>
            this.#bindingOwner?.close(nativeTeardownConfirmed ? this.#bindingOwner.confirmWorldReleased() : undefined),
        );
        for (const [key, lease] of this.#materialLeases)
            attempt(() => {
                try {
                    lease.dispose();
                } catch (error) {
                    this.#recordCleanup('material-delegate-unregister', error);
                    throw error;
                }
                this.#materialLeases.delete(key);
            });
        try {
            attempt(() => this.#scope?.dispose());
        } finally {
            try {
                attempt(() => {
                    try {
                        this.#queue.close();
                    } catch (error) {
                        this.#recordCleanup('command-queue-close', error);
                        throw error;
                    }
                });
            } finally {
                this.#nativeTeardown = nativeTeardownConfirmed ? 'released' : 'unresolved';
                for (const target of this.#targets.values()) {
                    attempt(() => this.#releaseTargetGuard(target));
                    target.state = nativeTeardownConfirmed ? 'settled' : 'unresolved';
                }
                if (nativeTeardownConfirmed) {
                    this.#targets.clear();
                    this.#components.clear();
                    this.#bodies.clear();
                }
                this.#defaultMaterial = null;
                this.#phase = 'closed';
            }
        }
        if (cleanupFailed) throw cleanupError;
    }
    diagnostics() {
        const gameControl = this.#gameControlLease?.diagnostics() ?? this.#gameClockSnapshot;
        return Object.freeze({
            phase: this.#phase,
            bodies: this.#bodies.size,
            nativeOwnership: this.#nativeTeardown,
            unresolvedNativeBodies: this.#nativeTeardown === 'unresolved' ? this.#bodies.size : 0,
            components: this.#components.size,
            componentActivityObservers: this.#activityLeases.size,
            lastComponentActivityFailure: this.#lastActivity,
            disabledComponents: [...this.#components.values()].filter((value) => !value.enabled).length,
            materials: this.#materials().size,
            activeTemporaryScopes: this.#scope ? 1 : 0,
            pendingCommands: this.#queue.diagnostics().pending.length,
            privateMaterialValues: Object.freeze({
                observed: !!this.#valuesLease,
                roster: this.#valuesLease?.diagnostics() ?? null,
                last: this.#lastValues,
            }),
            systemControl: Object.freeze({
                observed: !!this.#systemControlLease,
                paused: this.#systemPaused,
                queuePhase: this.#queue.diagnostics().phase,
                preparedQueueControl: this.#queue.diagnostics().preparedControl,
                unresolvedScopes: this.#controlCleanups.size,
                lastChange: this.#lastControl,
                producers: this.#producers.diagnostics(),
            }),
            gameControl: Object.freeze({
                ...gameControl,
                observed: this.#gameControlLease !== null,
                aggregatePaused: this.#systemPaused || this.#gamePaused || !!gameControl?.terminal,
                unresolvedScopes: this.#controlCleanups.size,
                lastTransition: this.#lastGameControl,
            }),
            dynamicCommandCandidate: this.#commandRouting !== null,
            persistentTargetCandidate: this.#motionRouting !== null,
            targets: Object.freeze({
                active: [...this.#targets.values()].filter((target) => target.state === 'active').length,
                protected: [...this.#targets.values()].filter((target) => target.state === 'protected').length,
                unresolved: [...this.#targets.values()].filter((target) => target.state === 'unresolved').length,
                guards: [...this.#targets.values()].filter((target) => target.guard !== null).length,
            }),
            commandPhase: this.#commandPhase,
            commandQueue: Object.freeze({
                phase: this.#queue.diagnostics().phase,
                sequence: this.#queue.diagnostics().sequence,
                completedTicks: this.#queue.diagnostics().completedTicks,
                attemptId: this.#queue.diagnostics().attemptId,
            }),
            stagedCommandsSupported: false,
            unifiedTransactionsSupported: false,
            materialIdentityTracking: 'actual-cache-commit',
            materialObserverLeases: this.#materialLeases.size,
            unresolvedMaterialScopes: this.#materialCleanups.size,
            lastMaterialChange: this.#lastMaterial,
            cleanup: Object.freeze({
                hasFailure: this.#cleanupFailures.length > 0,
                firstError: this.#cleanupFailures[0]?.error,
                cleanupFailures: Object.freeze([...this.#cleanupFailures]),
                omittedFailures: this.#omittedCleanupFailures,
            }),
            activationBlockers,
        });
    }
}
