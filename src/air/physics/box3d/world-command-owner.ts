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
import { PhysicsSystem } from '../../../cocos/physics/framework/physics-system';
import { RigidBody } from '../../../cocos/physics/framework/components/rigid-body';
import { Collider } from '../../../cocos/physics/framework/components/colliders/collider';
import { PhysicsMaterial } from '../../../cocos/physics/framework/assets/physics-material';
import { registerMutationGuard } from '../../../cocos/core/data/mutation-guard';
import type { MutationGuardLease } from '../../../cocos/core/data/mutation-guard';
import { registerNodeTransformGuard } from '../../../cocos/scene-graph/node-transform-validation';
import type {
    NodeTransformGuardLease,
    NodeTransformWriteReservation,
    NodeTransformWriteOperation,
} from '../../../cocos/scene-graph/node-transform-validation';
import type { Box3DBodyState, Box3DId } from './binding/facade.mjs';
import { Box3DCommandQueue } from './command-queue';
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
export interface Box3DOwnedBodySeed {
    readonly node: Node;
    readonly ancestry: readonly Node[];
    readonly preflight: () => void;
    readonly readCommitted: () => Readonly<Box3DBodyState>;
    readonly resolveNative: () => Box3DId;
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
const rejection = Object.freeze({
    code: 'AIR_E_BOX3D_REENTRANT',
    message: 'A Box3D-owned temporary step or dispatch scope forbids this mutation',
});
const activationBlockers = Object.freeze([
    'dynamic-command-owner-candidate-not-qualified',
    'shared-material-propagation-and-subscription-integrity',
    'full-producer-pause-lifecycle-not-qualified',
    'complete-early-entry-qualification',
    'persistent-target-grant-budget',
]);
function object(value: unknown, operation: string): asserts value is object {
    if (!value || typeof value !== 'object')
        throw worldError('AIR_E_BOX3D_CONFIG', operation, 'Expected object identity.');
}

/** Owns logical identity, temporary fences and the internal finite dynamic-command
 * candidate. Native resolver capabilities remain private. Package-level unified
 * activation still requires the complete target/lifecycle and acceptance contracts.
 */
export class Box3DWorldCommandOwner {
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
    #initialProducerControl = false;
    #commandPhase: 'idle' | 'collecting' | 'validating' | 'committing' | 'awaiting-step' = 'idle';
    readonly #cleanupFailures: Readonly<{ stage: string; error: unknown }>[] = [];
    #omittedCleanupFailures = 0;
    readonly #bodies = new Map<object, BodyRecord>();
    readonly #components = new Map<object, ComponentRecord>();
    #defaultMaterial: PhysicsMaterial | null = null;
    #phase: Phase = 'idle';
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
            assertConfiguration: (operation) => {
                this.assertConfiguration(operation);
                this.assertSystemBinding();
            },
        });
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
                if (this.#systemPaused)
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
                        'Only finite dynamic commands and the internal teleport entry are installed; targets remain unavailable.',
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
        return this.#producers.registerBeforeStep(callback, options);
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
                acceptedCount = candidate.original.length;
            return Object.freeze({
                commands,
                teleportNodes: Object.freeze(Array.from(teleportNodes)),
                context,
                acceptedCount,
                beginCommit: () => {
                    this.#queue.beginCommit(requirePhase('validating'));
                    phase = this.#commandPhase = 'committing';
                },
                finishCommit: (outcome: 'not-mutated' | 'committed' | 'unknown') => {
                    this.#queue.finishCommit(requirePhase('committing'), outcome);
                    phase = outcome === 'committed' ? 'awaiting-step' : 'settled';
                    this.#commandPhase = outcome === 'committed' ? 'awaiting-step' : 'idle';
                },
                complete: () => {
                    this.#queue.completeTick(requirePhase('awaiting-step'));
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
            resolveNative = seed.resolveNative;
        if ([preflight, readCommitted, resolveNative].some((fn) => typeof fn !== 'function'))
            throw worldError('AIR_E_BOX3D_CONFIG', 'adopt body', 'Expected private body accessors.');
        const record = Object.freeze({
            node,
            ancestry,
            preflight,
            readCommitted,
            resolveNative,
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
        this.#component(adapter).initialized = true;
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
                        transition = this.#queue.preparePauseTransition(!candidate.enabled);
                        producerTransition = this.#producers.preparePauseTransitionWithinControl(!candidate.enabled);
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
    systemControlDisposition(): 'ready' | 'paused' {
        this.assertConfiguration('System execution admission');
        this.assertSystemBinding();
        return this.#systemPaused ? 'paused' : 'ready';
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
        if (component?.kind === 'rigid-body') this.#retireContinuous(component, true);
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
        const scope: Box3DOwnerFenceScope = Object.freeze({
            prepareWriteback(plannedNodes: readonly Node[]): void {
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
                transform?.assertWriteCapacity(count);
                reservation = transform?.reserveWrites(count);
                for (const node of planned) expectedWrites.set(node, new Set(['setWorldPosition', 'setWorldRotation']));
                writebackPrepared = true;
            },
            advance(next: 'solving' | 'writeback'): void {
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
                reservation.write(node, operation, expected, perform);
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
    beginStep(): Box3DOwnerFenceScope {
        this.assertSteppingAllowed('begin step');
        return this.#begin('preflight');
    }
    beginDispatch(): Box3DOwnerFenceScope {
        return this.#begin('dispatch');
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
        attempt(() => this.#commandRouting?.dispose());
        this.#commandRouting = null;
        for (const cleanup of [...this.#controlCleanups]) attempt(cleanup);
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
                if (nativeTeardownConfirmed) {
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
        return Object.freeze({
            phase: this.#phase,
            bodies: this.#bodies.size,
            nativeOwnership: this.#nativeTeardown,
            unresolvedNativeBodies: this.#nativeTeardown === 'unresolved' ? this.#bodies.size : 0,
            components: this.#components.size,
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
            dynamicCommandCandidate: this.#commandRouting !== null,
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
