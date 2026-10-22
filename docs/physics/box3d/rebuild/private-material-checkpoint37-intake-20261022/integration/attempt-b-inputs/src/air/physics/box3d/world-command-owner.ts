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
    NodeTransformWriteOperation,
} from '../../../cocos/scene-graph/node-transform-validation';
import type { Box3DBodyState, Box3DId } from './binding/facade.mjs';
import { Box3DCommandQueue } from './command-queue';
import type { PreparedCommandPause } from './command-queue';
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
import { registerPhysicsMaterialValuesOwner } from '../../../cocos/physics/framework/physics-material-values';
import type { MaterialValuesContext, MaterialValuesCopied, MaterialValuesOwnerLease,
    PreparedMaterialMembership, PreparedMaterialOwnerPlan, MaterialValuesDiagnostics } from '../../../cocos/physics/framework/physics-material-values-transaction';

export interface Box3DPreparedComponentMaterial {
    readonly shape: Box3DId | null;
    commitCaches(): void;
}
type PrepareComponentMaterial = (authority: object, material: Readonly<Box3DSurfaceMaterial>) => Box3DPreparedComponentMaterial;
type PrepareWorldMaterial = (material: Readonly<Box3DSurfaceMaterial>, includeDefault: boolean,
    components: readonly Box3DPreparedComponentMaterial[]) => PreparedMaterialOwnerPlan;

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
export interface Box3DOwnerFenceScope {
    advance(next: 'solving' | 'writeback'): void;
    write(node: Node, operation: NodeTransformWriteOperation, expected: readonly number[], perform: () => void): void;
    dispose(): void;
}
type Phase =
    'idle' | 'preflight' | 'solving' | 'writeback' | 'dispatch' | 'material' | 'control' | 'faulted' | 'closed';
type BodyRecord = Readonly<Box3DOwnedBodySeed>;
type ComponentRecord = {
    readonly body: object;
    readonly component: RigidBody | Collider;
    readonly kind: 'rigid-body' | 'collider';
    material: PhysicsMaterial | null;
    readonly prepareMaterialValues?: PrepareComponentMaterial;
    initialized: boolean;
    enabled: boolean;
};
const rejection = Object.freeze({
    code: 'AIR_E_BOX3D_REENTRANT',
    message: 'A Box3D-owned temporary step or dispatch scope forbids this mutation',
});
const activationBlockers = Object.freeze([
    'command-consumer-not-installed',
    'shared-material-propagation-and-subscription-integrity',
    'immediate-system-pause-notification',
    'complete-early-entry-qualification',
    'persistent-target-grant-budget',
]);
function object(value: unknown, operation: string): asserts value is object {
    if (!value || typeof value !== 'object')
        throw worldError('AIR_E_BOX3D_CONFIG', operation, 'Expected object identity.');
}

/** Checkpoint A: logical ownership and temporary fences only. No command submit,
 * native execution, public handles or successful unified-transaction activation.
 * Stored native resolver closures remain private and are not called in this phase.
 */
export class Box3DWorldCommandOwner {
    readonly #generation: number;
    #valuesLease: MaterialValuesOwnerLease | null = null;
    #valuesContext: MaterialValuesContext | null = null;
    #valuesScope: Box3DOwnerFenceScope | null = null;
    readonly #valuesAuthorities = new WeakMap<object, Readonly<{ key: object; material: Readonly<Box3DSurfaceMaterial>; context: MaterialValuesContext }>>();
    #lastValues: Readonly<{ sequence: number; actual: readonly number[] | null; failed: boolean; failure?: MaterialValuesDiagnostics }> | null = null;
    readonly #system: PhysicsSystem;
    readonly #world: object;
    readonly #queue: Box3DCommandQueue;
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
            throw worldError('AIR_E_BOX3D_CONFIG', 'component identity admission', 'Missing private material-value preparation.');
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
    assertCommittedRead(operation: string): void {
        if (this.#phase === 'solving' || this.#phase === 'faulted' || this.#phase === 'closed')
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
            prepareMaterialValues,
            initialized: false,
            enabled: false,
        });
        if (kind === 'collider') {
            try {
                if (this.#valuesLease && material)
                    this.#valuesLease.prepareMembership({ binding: adapter, before: null, after: material, role: 'explicit', initialized: false }).publish(material);
                this.#registerMaterial(adapter, component as Collider, applyMaterial!);
            } catch (error) {
                try {
                    if (this.#valuesLease && material)
                        this.#valuesLease.prepareMembership({ binding: adapter, before: material, after: null, role: 'explicit', initialized: false }).publish(null);
                } catch (cleanupError) { this.#recordCleanup('provisional-material-membership', cleanupError); this.#materialFault?.(error); }
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
    }
    /** Installed only after world construction owns and validates its native resource. */
    installMaterialObservation(applyDefault: CopiedMaterialApplication, fault: (error: unknown) => void, prepareValues?: PrepareWorldMaterial): void {
        if (this.#materialFault) throw worldError('AIR_E_BOX3D_CONFIG', 'material observation', 'Already installed.');
        this.#materialFault = fault;
        if (prepareValues) this.#installMaterialValues(prepareValues);
        this.#registerMaterial(this.#system, this.#system, applyDefault);
    }
    #assertMaterialLive(asset: object): asserts asset is PhysicsMaterial {
        if (!(asset instanceof PhysicsMaterial) || typeof asset._objFlags !== 'number' ||
            (asset._objFlags & (CCObjectFlags.Destroyed | CCObjectFlags.ToDestroy | CCObjectFlags.Destroying)))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'material ownership', 'Expected a live, non-destroying PhysicsMaterial.');
    }
    #requireValues(context: MaterialValuesContext): void {
        if (this.#valuesContext !== context || this.#phase !== 'material' || !this.#valuesScope)
            throw worldError('AIR_E_BOX3D_REENTRANT', 'private material values', 'No current private value scope.');
    }
    consumeMaterialValuesPreparation(authority: object, key: object, material: Readonly<Box3DSurfaceMaterial>): () => void {
        const entry = this.#valuesAuthorities.get(authority);
        if (!entry || entry.key !== key || entry.material !== material)
            throw worldError('AIR_E_BOX3D_REENTRANT', 'material value preparation', 'No exact private preparation authority.');
        this.#requireValues(entry.context);
        this.#valuesAuthorities.delete(authority);
        return () => { this.#requireValues(entry.context); this.assertSystemBinding(); };
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
                        if (binding.role !== 'explicit' || record.kind !== 'collider' || !record.initialized ||
                            record.material !== context.asset || !record.prepareMaterialValues)
                            throw worldError('AIR_E_BOX3D_CONFIG', 'component value roster', 'Stale or provisional explicit ownership.');
                        const authority = Object.freeze({});
                        this.#valuesAuthorities.set(authority, { key: binding.binding, material, context });
                        try { components.push(record.prepareMaterialValues(authority, material)); }
                        finally { this.#valuesAuthorities.delete(authority); }
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
                this.#lastValues = Object.freeze({ sequence: context.sequence, actual: failure.actual, failed: true, failure });
                this.#materialFault!(failure.error);
            },
            dispose: (context) => {
                if (this.#valuesContext !== context) throw worldError('AIR_E_BOX3D_REENTRANT', 'value cleanup', 'Foreign cleanup context.');
                try { this.#valuesScope?.dispose(); }
                catch (error) { this.#recordCleanup('material-value-scope-dispose', error); this.#materialFault!(error); throw error; }
                this.#valuesScope = null;
                this.#valuesContext = null;
            },
        });
    }
    /** Register against the original System source while construction still precedes selector assignment.
     * Only later execution/transition admission requires the live System/world binding.
     * The queue is an actual owner participant. Producers are not yet installed and are not
     * represented by an empty, allegedly-qualified roster.
     */
    installSystemControlObservation(fault: (error: unknown) => void): void {
        if (this.#systemControlLease)
            throw worldError('AIR_E_BOX3D_CONFIG', 'System observation', 'Already installed.');
        let context: Readonly<PhysicsStateChangeContext> | null = null;
        let scope: Box3DOwnerFenceScope | null = null;
        let transition: PreparedCommandPause | null = null;
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
                    entered = returned = failed = false;
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
                    if (value.operation === 'system-enable')
                        transition = this.#queue.preparePauseTransition(!candidate.enabled);
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
                    if (report.effects.length || entered || actualChanged || report.actualRead === 'failed')
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
            try {
                transition = this.#queue.preparePauseTransition(true);
                entered = true;
                transition.commit();
                returned = true;
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
        const previousAsset = () => key === this.#system ? this.#defaultMaterial : this.#component(key).material;
        const prepareMembership = (asset: object | null, initialize: boolean): void => {
            if (!this.#valuesLease) return;
            if (membership && preparedAsset === asset) return;
            membership?.cancel();
            membership = null;
            preparedAsset = undefined;
            membership = this.#valuesLease.prepareMembership({ binding: key, before: previousAsset(), after: asset,
                role: key === this.#system ? 'default' : 'explicit', initialized: key === this.#system || initialize || this.#component(key).initialized });
            preparedAsset = asset;
        };
        let hasBusinessFailure = false,
            businessFailure: unknown;
        const cleanup = (): void => {
            let failed = false,
                primary: unknown;
            if (membership && !preserveMembership) {
                try { membership.cancel(); membership = null; preparedAsset = undefined; }
                catch (error) { this.#recordCleanup('material-membership-cancel', error); primary = error; failed = true; }
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
                        if (actual.material !== preparedAsset) throw worldError('AIR_E_BOX3D_CONFIG', 'material membership', 'Actual identity differs from prepared identity.');
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
                    preserveMembership = failure.effects.length > 0 || value.operation === 'collider-material-initialize';
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
        );
        this.#materialLeases.set(key, lease);
    }
    releaseComponentAfterCleanup(adapter: object): void {
        if (this.#phase !== 'faulted' && this.#phase !== 'closed')
            this.assertConfiguration('release component identity');
        const component = this.#components.get(adapter);
        if (this.#valuesLease && this.#phase === 'idle' && component?.material)
            this.#valuesLease.prepareMembership({ binding: adapter, before: component.material, after: null,
                role: 'explicit', initialized: component.initialized }).publish(null);
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
        phase: 'preflight' | 'dispatch' | 'material' | 'control',
        extraMaterials: readonly PhysicsMaterial[] = [],
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
        const owned = this;
        let disposed = false;
        const scope: Box3DOwnerFenceScope = Object.freeze({
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
                    !transform ||
                    !nodes.has(node)
                )
                    throw worldError(
                        'AIR_E_BOX3D_REENTRANT',
                        'owned write',
                        'No active exact-write scope for this Node.',
                    );
                transform.write(node, operation, expected, perform);
            },
            dispose(): void {
                if (disposed) return;
                let failed = false,
                    failure: unknown;
                try {
                    transform?.dispose();
                } catch (error) {
                    owned.#recordCleanup('scope-transform-dispose', error);
                    failed = true;
                    failure = error;
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
        for (const cleanup of [...this.#controlCleanups]) attempt(cleanup);
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
            privateMaterialValues: Object.freeze({ observed: !!this.#valuesLease, roster: this.#valuesLease?.diagnostics() ?? null, last: this.#lastValues }),
            systemControl: Object.freeze({
                observed: !!this.#systemControlLease,
                paused: this.#systemPaused,
                queuePhase: this.#queue.diagnostics().phase,
                preparedQueueControl: this.#queue.diagnostics().preparedControl,
                unresolvedScopes: this.#controlCleanups.size,
                lastChange: this.#lastControl,
                producers: 'NOT_INTEGRATED',
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
