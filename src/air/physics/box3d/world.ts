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
import type { PhysicsSystem } from '../../../cocos/physics/framework/physics-system';
import { Box3DWorldCommandOwner } from './world-command-owner';
import type { Box3DOwnedComponentSeed } from './world-command-owner';
import type { Node } from '../../../cocos/scene-graph/node';
import { Box3DSharedBody } from './shared-body';
import type { Box3DComponentConfiguration } from './shared-body';
import type { IPhysicsWorld } from '../../../cocos/physics/spec/i-physics-world';
import type { PhysicsMaterial } from '../../../cocos/physics/framework/assets/physics-material';
import type { Collider } from '../../../cocos/physics/framework/components/colliders/collider';
import { readPhysicsMaterialPrivateValues } from '../../../cocos/physics/framework/physics-material-cache';
import type { Box3DId, Box3DWorld, Box3DStepSnapshot } from './binding/facade.mjs';
import type { Box3DSTLease } from './loader/st-loader.mjs';
import type { AirNormalizedBox3DOptions } from './config';
import type { AirPhysicsPreparation } from '../preparation';
import { copyDebugSnapshot, validateDebugFlags, validateJointScale } from './debug';
import type { Box3DDebugSnapshot } from './debug';
import {
    copyStepDiagnostics,
    copySurfaceMaterial,
    copyVector,
    finiteFloat32,
    requireWorldBinding,
    requireComponentBinding,
    worldError,
} from './world-binding';
import type { Box3DNativeStepDiagnostics, Box3DSurfaceMaterial, Box3DWorldBinding } from './world-binding';
import { unsupportedBox3D } from './unsupported';
import { copyWritebackQualification, writebackSceneBatch } from './world-writeback';
import type { Box3DWritebackQualification } from './world-writeback';

type WorldState = 'ready' | 'stepping' | 'faulted' | 'destroying' | 'destroyed' | 'destroy-failed';
/** Internal adapter only. Not registered/exported by the optional feature yet. */
export class Box3DPhysicsWorld implements IPhysicsWorld {
    readonly #binding: Box3DWorldBinding;
    readonly #commandOwner: Box3DWorldCommandOwner;
    private ownerCleanupFailure: unknown;
    private hasOwnerCleanupFailure = false;
    private hasFailure = false;
    private hasDestroyFailure = false;
    private destroyFailure: unknown;
    private nativeDestroyReturned = false;
    private hasNativeDestroyFailure = false;
    private nativeDestroyFailure: unknown;
    readonly #token: Box3DWorld;
    private readonly description: Readonly<{
        backend: 'box3d';
        generation: number;
        worldId: number;
    }>;
    private state: WorldState = 'ready';
    private failure: unknown;
    private readonly options: AirNormalizedBox3DOptions;
    private gravity: readonly number[] = Object.freeze([0, -10, 0]);
    private sleeping = true;
    private drawFlags = 0;
    private jointScale = Math.fround(0.3);
    private debug: Box3DDebugSnapshot | null = null;
    private material: Readonly<Box3DSurfaceMaterial> | null = null;
    readonly #sharedBodies = new Map<Node, Box3DSharedBody>();
    readonly #materialShapes = new Map<Box3DId, boolean>();
    private nativeStep: Readonly<Box3DNativeStepDiagnostics> = Object.freeze({
        nativeStepIndex: 0,
        nativeCompleted: false,
        snapshotAvailable: false,
    });
    private snapshot: Box3DStepSnapshot | null = null;
    private pendingSnapshot: Box3DStepSnapshot | null = null;
    private emittedStep = 0;
    private sceneSyncCalls = 0;
    private afterEventsCalls = 0;
    private attemptedSteps = 0;
    private lastDt: number | null = null;
    private nativeObservationCurrent = true;
    readonly #writebackQualification: Box3DWritebackQualification;
    #writebackEpoch = 0;
    private lastStepOutcome: 'not-attempted' | 'completed' | 'not-completed' | 'unknown' = 'not-attempted';

    constructor(
        lease: Box3DSTLease,
        options: AirNormalizedBox3DOptions,
        preparation: AirPhysicsPreparation,
        qualification: Box3DWritebackQualification | undefined,
        system: PhysicsSystem,
    ) {
        this.#writebackQualification = copyWritebackQualification(qualification);
        this.#commandOwner = new Box3DWorldCommandOwner(preparation.generation, system, this);
        this.#binding = requireWorldBinding(lease.binding);
        this.options = Object.freeze({ ...options });
        if (
            options.threading !== 'single' ||
            options.workerCount !== 1 ||
            lease.options.threading !== 'single' ||
            lease.options.workerCount !== 1 ||
            ![1, 2, 4, 8].includes(options.solverSubSteps) ||
            lease.options.solverSubSteps !== options.solverSubSteps
        )
            throw worldError('AIR_E_BOX3D_CONFIG', 'world construction', 'Prepared ST options do not match.');
        const receipt = preparation.diagnostics();
        if (
            !['preparing', 'prepared'].includes(receipt.status) ||
            !receipt.acquired.some(
                (v) => v.backend === 'box3d' && v.resource === 'module' && v.cleanup === 'not-attempted',
            ) ||
            receipt.acquired.some((v) => v.backend === 'box3d' && v.resource === 'world')
        )
            throw worldError('AIR_E_BOX3D_DISPOSED', 'world construction', 'Preparation cannot acquire another world.');
        this.#token = this.#binding.createWorld([0, -10, 0]);
        // Acquire ownership before readback/debug validation or any other fallible initialization.
        try {
            preparation.own('box3d', 'world', () => this.destroy(), {
                dependsOn: ['module'],
            });
        } catch (error) {
            const adopted = preparation
                .diagnostics()
                .acquired.some((v) => v.backend === 'box3d' && v.resource === 'world');
            // The preparation ledger may already have scheduled a late acquisition's self-release.
            if (!adopted) {
                try {
                    this.destroy();
                } catch (cleanupError) {
                    preparation.recordCleanupError('box3d:unregistered-world', cleanupError);
                }
            }
            throw error;
        }
        this.description = Object.freeze({
            backend: 'box3d',
            generation: preparation.generation,
            worldId: this.#token.id,
        });
        try {
            this.gravity = copyVector(this.#binding.getGravity(this.#token), 'getGravity');
            this.sleeping = this.#binding.isSleepingEnabled(this.#token);
            if (typeof this.sleeping !== 'boolean')
                throw worldError('AIR_E_BOX3D_ABI', 'getSleep', 'Expected boolean.');
            this.nativeStep = copyStepDiagnostics(this.#binding.stepDiagnostics(this.#token));
            if (
                this.nativeStep.nativeStepIndex !== 0 ||
                this.nativeStep.nativeCompleted ||
                this.nativeStep.snapshotAvailable
            )
                throw worldError(
                    'AIR_E_BOX3D_ABI',
                    'world construction',
                    'A newly acquired world has already advanced.',
                );
            this.debug = this.collectDebug(0, this.jointScale);
            this.#commandOwner.installMaterialObservation(
                (authority, material) => {
                    this.#commandOwner.consumeMaterialAuthority(authority, system, material);
                    this.assertReadyState('copied default material');
                    if (!material)
                        throw worldError('AIR_E_BOX3D_CONFIG', 'default material', 'Missing copied material.');
                    this.#applyDefaultMaterialCopied(material);
                },
                (error) => {
                    this.invalidatePending();
                    this.fault(error);
                },
                (material, includeDefault, components) => {
                    const updates = components
                        .filter((component) => component.shape !== null)
                        .map((component) => ({ shape: component.shape!, material, inheritsDefault: false }));
                    if (includeDefault)
                        for (const [shape, inherited] of this.#materialShapes)
                            if (inherited) updates.push({ shape, material, inheritsDefault: true });
                    const plan = this.#prepareMaterialBatch(updates, includeDefault ? material : undefined);
                    return Object.freeze({
                        native: plan.native,
                        commitCaches: () => {
                            plan.commitCaches();
                            for (const component of components) component.commitCaches();
                        },
                    });
                },
            );
            this.#commandOwner.installSystemControlObservation((error) => {
                this.invalidatePending();
                this.fault(error);
            });
        } catch (error) {
            this.fault(error);
            throw error;
        }
    }
    private assertReadyState(operation: string): void {
        if (this.state === 'stepping' || this.state === 'destroying')
            throw worldError('AIR_E_BOX3D_REENTRANT', operation, 'World operation is already in progress.');
        if (this.state !== 'ready')
            throw worldError(
                this.state === 'faulted' ? 'AIR_E_BOX3D_WORLD_FAULTED' : 'AIR_E_BOX3D_DISPOSED',
                operation,
                'World is faulted or closed; no native operation was attempted.',
            );
    }
    private assertReady(operation: string): void {
        this.assertReadyState(operation);
        this.#commandOwner.assertConfiguration(operation);
    }
    private assertCommittedRead(operation: string): void {
        if (this.state !== 'ready' && this.state !== 'stepping')
            throw worldError(
                this.state === 'faulted' ? 'AIR_E_BOX3D_WORLD_FAULTED' : 'AIR_E_BOX3D_DISPOSED',
                operation,
                'World cannot provide committed reads.',
            );
        this.#commandOwner.assertCommittedRead(operation);
    }
    private fault(error: unknown): void {
        if (!['destroying', 'destroyed', 'destroy-failed'].includes(this.state)) this.state = 'faulted';
        this.#commandOwner.fault();
        if (!this.hasFailure) {
            this.hasFailure = true;
            this.failure = error;
        }
        this.pendingSnapshot = null;
    }
    private recordOwnerCleanup(error: unknown): void {
        if (!this.hasOwnerCleanupFailure) {
            this.hasOwnerCleanupFailure = true;
            this.ownerCleanupFailure = error;
        }
    }
    private collectDebug(flags: number, scale: number): Box3DDebugSnapshot {
        return copyDebugSnapshot(this.#binding.debugSnapshot(this.#token, flags, scale), flags, scale);
    }
    private invalidatePending(): void {
        this.pendingSnapshot = null;
        this.nativeObservationCurrent = false;
    }
    get impl(): Readonly<{
        backend: 'box3d';
        generation: number;
        worldId: number;
    }> {
        this.assertCommittedRead('impl');
        return this.description;
    }
    setGravity(v: { x: number; y: number; z: number }): void {
        this.assertReady('setGravity');
        if (!v) throw worldError('AIR_E_BOX3D_CONFIG', 'setGravity', 'Expected a vector.');
        const next = copyVector([v.x, v.y, v.z], 'setGravity');
        try {
            this.invalidatePending();
            this.#binding.setGravity(this.#token, next);
            const actual = copyVector(this.#binding.getGravity(this.#token), 'getGravity');
            if (actual.some((n, i) => n !== next[i]))
                throw worldError('AIR_E_BOX3D_ABI', 'setGravity', 'Readback mismatch.');
            this.gravity = actual;
            this.invalidatePending();
        } catch (error) {
            this.fault(error);
            throw error;
        }
    }
    setAllowSleep(v: boolean): void {
        this.assertReady('setAllowSleep');
        if (typeof v !== 'boolean') throw worldError('AIR_E_BOX3D_CONFIG', 'setAllowSleep', 'Expected boolean.');
        try {
            this.invalidatePending();
            this.#binding.setSleepingEnabled(this.#token, v);
            if (this.#binding.isSleepingEnabled(this.#token) !== v)
                throw worldError('AIR_E_BOX3D_ABI', 'setAllowSleep', 'Readback mismatch.');
            this.sleeping = v;
            this.invalidatePending();
        } catch (error) {
            this.fault(error);
            throw error;
        }
    }
    prepareInitialShapeMaterial<T>(
        adapter: object,
        component: Collider,
        copy: (material: PhysicsMaterial | null) => T,
    ) {
        this.assertReady('prepare initial shape material');
        return this.#commandOwner.prepareInitialShapeMaterial(adapter, component, copy);
    }
    assertAcceptedShapeMaterialIdentity(adapter: object, value: PhysicsMaterial | null): void {
        this.#commandOwner.assertAcceptedMaterialIdentity(adapter, value);
    }
    setDefaultMaterial(value: PhysicsMaterial): void {
        this.assertReady('setDefaultMaterial');
        this.#commandOwner.assertAcceptedMaterialIdentity(null, value);
        const scope = this.#commandOwner.beginMaterialKernel(value);
        let failed = false,
            primary: unknown;
        try {
            // Original material EVENT_UPDATE path shares the same no-replay kernel.
            const [friction, restitution, rolling, spinning] = readPhysicsMaterialPrivateValues(value);
            const next = copySurfaceMaterial({ friction, restitution });
            if (rolling !== 0 || spinning !== 0) unsupportedBox3D('nonzero rollingFriction/spinningFriction');
            this.#applyDefaultMaterialCopied(next);
        } catch (error) {
            failed = true;
            primary = error;
            throw error;
        } finally {
            try {
                scope.dispose();
            } catch (error) {
                this.recordOwnerCleanup(error);
                this.invalidatePending();
                this.fault(failed ? primary : error);
                if (!failed) throw error;
            }
        }
    }
    /** Private prepared kernel: all native reads precede every possible setter. */
    #prepareMaterialBatch(
        updates: readonly Readonly<{
            shape: Box3DId;
            material: Readonly<Box3DSurfaceMaterial>;
            inheritsDefault: boolean;
        }>[],
        nextDefault?: Readonly<Box3DSurfaceMaterial>,
    ) {
        this.assertReadyState('prepare material batch');
        const seen = new Set<Box3DId>();
        const prepared = updates.map((update) => {
            const shape = update.shape;
            if (seen.has(shape) || !this.#materialShapes.has(shape))
                throw worldError('AIR_E_BOX3D_CONFIG', 'prepare material batch', 'Duplicate or unregistered shape.');
            seen.add(shape);
            if (typeof update.inheritsDefault !== 'boolean')
                throw worldError('AIR_E_BOX3D_CONFIG', 'prepare material batch', 'Expected boolean inheritance.');
            const previousInheritance = this.#materialShapes.get(shape)!;
            const next = copySurfaceMaterial(update.material);
            copySurfaceMaterial(this.#binding.getShapeMaterial(this.#token, shape));
            return {
                shape,
                next,
                previousInheritance,
                inheritsDefault: update.inheritsDefault,
                state: 'prepared' as 'prepared' | 'entered' | 'returned' | 'verified',
            };
        });
        const defaultValue = nextDefault === undefined ? undefined : copySurfaceMaterial(nextDefault);
        let cacheCommitted = false;
        const assertMembership = () => {
            this.assertReadyState('prepared material batch');
            for (const item of prepared)
                if (this.#materialShapes.get(item.shape) !== item.previousInheritance)
                    throw worldError(
                        'AIR_E_BOX3D_CONFIG',
                        'prepared material batch',
                        'Shape membership changed after preparation.',
                    );
        };
        const native = Object.freeze(
            prepared.map((item) =>
                Object.freeze({
                    target: item.shape,
                    invoke: () => {
                        if (cacheCommitted || item.state !== 'prepared')
                            throw worldError(
                                'AIR_E_BOX3D_REENTRANT',
                                'prepared material setter',
                                'Operation already consumed.',
                            );
                        assertMembership();
                        item.state = 'entered'; // Never retry an unknown or completed setter.
                        this.invalidatePending();
                        this.#binding.setShapeMaterial(this.#token, item.shape, item.next);
                        item.state = 'returned';
                    },
                    verify: () => {
                        if (cacheCommitted || item.state !== 'returned')
                            throw worldError(
                                'AIR_E_BOX3D_REENTRANT',
                                'prepared material readback',
                                'Setter did not return exactly once.',
                            );
                        assertMembership();
                        const actual = copySurfaceMaterial(this.#binding.getShapeMaterial(this.#token, item.shape));
                        if (actual.friction !== item.next.friction || actual.restitution !== item.next.restitution)
                            throw worldError(
                                'AIR_E_BOX3D_ABI',
                                'prepared material readback',
                                'Native readback mismatch.',
                            );
                        item.state = 'verified';
                    },
                }),
            ),
        );
        return Object.freeze({
            native,
            commitCaches: () => {
                if (cacheCommitted || prepared.some((item) => item.state !== 'verified'))
                    throw worldError(
                        'AIR_E_BOX3D_REENTRANT',
                        'prepared material caches',
                        'Unverified or consumed plan.',
                    );
                assertMembership();
                cacheCommitted = true;
                for (const item of prepared) this.#materialShapes.set(item.shape, item.inheritsDefault);
                if (defaultValue !== undefined) this.material = defaultValue;
                this.invalidatePending();
            },
        });
    }
    #executePreparedMaterialBatch(
        plan: Readonly<{ native: readonly Readonly<{ invoke(): void; verify(): void }>[]; commitCaches(): void }>,
    ): void {
        let effectEntered = false;
        try {
            for (const operation of plan.native) {
                effectEntered = true;
                operation.invoke();
                operation.verify();
            }
            effectEntered = true;
            plan.commitCaches();
        } catch (error) {
            // No reviewed not-mutated receipt exists. Keep the actual phase; never rollback/replay.
            if (effectEntered) {
                this.invalidatePending();
                this.fault(error);
            }
            throw error;
        }
    }
    #applyDefaultMaterialCopied(next: Readonly<Box3DSurfaceMaterial>): void {
        const plan = this.#prepareMaterialBatch(
            [...this.#materialShapes]
                .filter(([, inherited]) => inherited)
                .map(([shape]) => ({ shape, material: next, inheritsDefault: true })),
            next,
        );
        this.#executePreparedMaterialBatch(plan);
    }
    /** Internal shape-owner hook for later T10. Does not create or claim ownership of native shapes. */
    registerMaterialShape(shape: Box3DId, inheritsDefault: boolean): void {
        this.assertReady('registerMaterialShape');
        if (typeof inheritsDefault !== 'boolean' || this.#materialShapes.has(shape))
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'registerMaterialShape',
                'Expected one registration with boolean inheritance.',
            );
        copySurfaceMaterial(this.#binding.getShapeMaterial(this.#token, shape));
        if (inheritsDefault && this.material) {
            try {
                this.invalidatePending();
                this.#binding.setShapeMaterial(this.#token, shape, this.material);
                const actual = copySurfaceMaterial(this.#binding.getShapeMaterial(this.#token, shape));
                if (actual.friction !== this.material.friction || actual.restitution !== this.material.restitution)
                    throw worldError('AIR_E_BOX3D_ABI', 'registerMaterialShape', 'Readback mismatch.');
            } catch (error) {
                this.fault(error);
                throw error;
            }
        }
        this.#materialShapes.set(shape, inheritsDefault);
        this.invalidatePending();
    }
    unregisterMaterialShape(shape: Box3DId): void {
        this.assertReady('unregisterMaterialShape');
        if (!this.#materialShapes.delete(shape))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'unregisterMaterialShape', 'Unknown shape registration.');
    }
    /** Internal semantic shape-owner hook; the native capability is never returned. */
    updateMaterialShape(shape: Box3DId, value: Box3DSurfaceMaterial | null): void {
        this.assertReady('updateMaterialShape');
        this.#applyShapeMaterialCopied(shape, value);
    }
    #applyShapeMaterialCopied(shape: Box3DId, value: Box3DSurfaceMaterial | null): void {
        if (!this.#materialShapes.has(shape))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'shape material', 'Unknown shape.');
        const next = value === null ? this.material : copySurfaceMaterial(value);
        if (!next)
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'shape material',
                'PhysicsSystem default material is not configured.',
            );
        const plan = this.#prepareMaterialBatch([{ shape, material: next, inheritsDefault: value === null }]);
        this.#executePreparedMaterialBatch(plan);
    }
    get debugDrawFlags(): number {
        this.assertCommittedRead('debugDrawFlags');
        return this.drawFlags;
    }
    set debugDrawFlags(value: number) {
        this.assertReady('debugDrawFlags');
        const next = validateDebugFlags(value);
        const snapshot = this.collectDebug(next, this.jointScale);
        this.drawFlags = next;
        this.debug = snapshot;
    }
    get debugDrawConstraintSize(): number {
        this.assertCommittedRead('debugDrawConstraintSize');
        return this.jointScale;
    }
    set debugDrawConstraintSize(value: number) {
        this.assertReady('debugDrawConstraintSize');
        const next = validateJointScale(value);
        const snapshot = this.collectDebug(this.drawFlags, next);
        this.jointScale = next;
        this.debug = snapshot;
    }
    /** Internal adapter admission before caller-controlled component inputs. */
    assertComponentConfiguration(operation: string): void {
        this.assertReady(operation);
    }
    /** Internal component acquisition; never returns a native token or binding. */
    acquireSharedBody(
        node: Node,
        reference: object,
        configuration: Box3DComponentConfiguration,
        component: Box3DOwnedComponentSeed,
    ): Box3DSharedBody {
        this.assertReady('acquire shared body');
        const copiedComponent = this.#commandOwner.copyComponentSeed(node, reference, component);
        let body = this.#sharedBodies.get(node);
        if (!body) {
            body = new Box3DSharedBody(
                requireComponentBinding(this.#binding),
                this.#token,
                node,
                {
                    assertReady: (operation) => this.assertReady(operation),
                    assertCommittedRead: (operation) => this.assertCommittedRead(operation),
                    adoptBody: (seed) => this.#commandOwner.adoptBody(seed),
                    attachComponent: (key, seed) => this.#commandOwner.attachComponent(key, seed),
                    completeComponent: (adapter) => this.#commandOwner.completeComponent(adapter),
                    componentEnabled: (adapter, enabled) => this.#commandOwner.commitComponentEnabled(adapter, enabled),
                    releaseComponent: (adapter) => this.#commandOwner.releaseComponentAfterCleanup(adapter),
                    isFaulted: () => this.state === 'faulted' || this.state === 'destroy-failed',
                    invalidate: () => this.invalidatePending(),
                    fault: (error) => this.fault(error),
                    registerShapeMaterial: (shape, inherited) => this.registerMaterialShape(shape, inherited),
                    updateShapeMaterial: (shape, value) => this.updateMaterialShape(shape, value),
                    applyCopiedMaterial: (adapter, authority, shape, value) => {
                        this.#commandOwner.consumeMaterialAuthority(authority, adapter, value);
                        this.assertReadyState('copied collider material');
                        if (shape) this.#applyShapeMaterialCopied(shape, value);
                    },
                    consumeMaterialValuesPreparation: (adapter, authority, value) =>
                        this.#commandOwner.consumeMaterialValuesPreparation(authority, adapter, value),
                    unregisterShapeMaterial: (shape) => this.unregisterMaterialShape(shape),
                    released: (key, value, logical) => {
                        this.#commandOwner.retireBodyAfterDestroy(logical);
                        if (this.#sharedBodies.get(key) === value) this.#sharedBodies.delete(key);
                    },
                },
                configuration,
            );
            this.#sharedBodies.set(node, body);
        }
        body.retain(reference, copiedComponent);
        return body;
    }
    syncSceneToPhysics(): void {
        this.assertReady('syncSceneToPhysics');
        for (const body of this.#sharedBodies.values()) body.preflight();
        ++this.sceneSyncCalls;
    }
    syncAfterEvents(): void {
        this.assertReady('syncAfterEvents');
        ++this.afterEventsCalls;
    }
    emitEvents(): void {
        this.assertReady('emitEvents');
        const scope = this.#commandOwner.beginDispatch();
        try {
            if (this.pendingSnapshot) {
                this.emittedStep = this.pendingSnapshot.stepIndex;
                this.pendingSnapshot = null;
            }
        } finally {
            try {
                scope.dispose();
            } catch (error) {
                this.recordOwnerCleanup(error);
                this.fault(error);
                throw error;
            }
        }
        // T09 admits no collider event listeners; raw snapshots are diagnostics, not Cocos events.
    }
    step(dt: number, timeSinceLastCalled?: number, maxSubSteps?: number): void {
        this.assertReady('step');
        this.#commandOwner.assertSteppingAllowed('step');
        if (timeSinceLastCalled !== undefined || maxSubSteps !== undefined)
            unsupportedBox3D('Cannon-style manual step accumulator arguments');
        const delta = finiteFloat32(dt, 'step.dt');
        if (delta <= 0) throw worldError('AIR_E_BOX3D_CONFIG', 'step', 'dt must be positive float32.');
        if (this.#writebackEpoch >= this.#writebackQualification.epochLimit)
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'step',
                'Owned writeback epoch exhausted before native advancement.',
            );
        const nextEpoch = this.#writebackEpoch + 1;
        const bodies = Object.freeze(Array.from(this.#sharedBodies.values()));
        const scope = this.#commandOwner.beginStep();
        let failed = false,
            primary: unknown;
        try {
            // Recoverable assembly/configuration rejection precedes the fault-latched native-step region.
            for (const body of bodies) body.preflight();
            this.state = 'stepping';
            this.lastDt = delta;
            ++this.attemptedSteps;
            const before = this.nativeStep.nativeStepIndex;
            this.lastStepOutcome = 'not-attempted';
            try {
                const start = copyStepDiagnostics(this.#binding.stepDiagnostics(this.#token));
                if (start.nativeStepIndex !== before)
                    throw worldError('AIR_E_BOX3D_ABI', 'step', 'World advanced outside its owner.');
                this.lastStepOutcome = 'unknown';
                this.nativeObservationCurrent = false;
                scope.advance('solving');
                this.#binding.step(this.#token, delta, this.options.solverSubSteps);
                scope.advance('writeback');
                this.nativeStep = copyStepDiagnostics(this.#binding.stepDiagnostics(this.#token));
                if (
                    this.nativeStep.nativeStepIndex !== before + 1 ||
                    !this.nativeStep.nativeCompleted ||
                    !this.nativeStep.snapshotAvailable
                )
                    throw worldError(
                        'AIR_E_BOX3D_ABI',
                        'step',
                        'Expected exactly one completed native step and snapshot.',
                    );
                this.lastStepOutcome = 'completed';
                this.nativeObservationCurrent = true;
                const snapshot = this.#binding.readStepSnapshot(this.#token);
                if (
                    !snapshot ||
                    snapshot.worldId !== this.#token.id ||
                    snapshot.stepIndex !== this.nativeStep.nativeStepIndex ||
                    !Object.isFrozen(snapshot)
                )
                    throw worldError('AIR_E_BOX3D_ABI', 'step', 'Expected the current owned immutable snapshot.');
                this.snapshot = this.pendingSnapshot = snapshot;
                const plans = Box3DSharedBody.captureWriteback(bodies);
                writebackSceneBatch(
                    plans,
                    () => {
                        const current = Array.from(this.#sharedBodies.values());
                        if (current.length !== bodies.length || current.some((body, i) => body !== bodies[i]))
                            throw worldError(
                                'AIR_E_BOX3D_CONFIG',
                                'writeback',
                                'World body ownership changed during the batch.',
                            );
                    },
                    scope,
                );
                this.#writebackEpoch = nextEpoch;
                if (this.drawFlags) this.debug = this.collectDebug(this.drawFlags, this.jointScale);
                this.state = 'ready';
            } catch (error) {
                try {
                    this.nativeStep = copyStepDiagnostics(this.#binding.stepDiagnostics(this.#token));
                    this.nativeObservationCurrent = true;
                    if (this.lastStepOutcome !== 'not-attempted')
                        this.lastStepOutcome =
                            this.nativeStep.nativeStepIndex === before + 1
                                ? 'completed'
                                : this.nativeStep.nativeStepIndex === before
                                  ? 'not-completed'
                                  : 'unknown';
                } catch {
                    this.nativeObservationCurrent = false;
                    // Preserve an already-established completion; otherwise outcome remains unknown.
                }
                this.fault(error);
                throw error;
            }
        } catch (error) {
            failed = true;
            primary = error;
            throw error;
        } finally {
            try {
                scope.dispose();
            } catch (error) {
                this.recordOwnerCleanup(error);
                this.fault(failed ? primary : error);
                if (!failed) throw error;
            }
        }
    }
    getNativeCounts() {
        this.assertCommittedRead('getNativeCounts');
        const result = this.#binding.worldCounts(this.#token);
        if (!result || result.counts.length !== 4 || typeof result.liveBytes !== 'bigint' || result.liveBytes < 0)
            throw worldError('AIR_E_BOX3D_ABI', 'getNativeCounts', 'Invalid copied world counts.');
        const [bodies, shapes, contacts, joints] = Array.from(result.counts);
        if ([bodies, shapes, contacts, joints].some((v) => !Number.isInteger(v) || v < 0))
            throw worldError('AIR_E_BOX3D_ABI', 'getNativeCounts', 'Invalid object count.');
        return Object.freeze({
            bodies,
            shapes,
            contacts,
            joints,
            liveBytes: result.liveBytes,
        });
    }
    /** Copied diagnostics remain available after fault/close; no native call or pointer escapes. */
    diagnostics() {
        return Object.freeze({
            state: this.state,
            commandOwner: this.#commandOwner.diagnostics(),
            ownerCleanupError: this.hasOwnerCleanupFailure ? String(this.ownerCleanupFailure) : null,
            failure: Object.freeze({
                hasFailure: this.hasFailure,
                error: this.failure,
            }),
            teardown: Object.freeze({
                hasFailure: this.hasDestroyFailure,
                error: this.destroyFailure,
                nativeReturned: this.nativeDestroyReturned,
                nativeHasFailure: this.hasNativeDestroyFailure,
                nativeError: this.nativeDestroyFailure,
                cleanupHasFailure: this.hasOwnerCleanupFailure,
                cleanupError: this.ownerCleanupFailure,
            }),
            writeback: Object.freeze({
                epoch: this.#writebackEpoch,
                epochLimit: this.#writebackQualification.epochLimit,
            }),
            generation: this.description?.generation ?? null,
            native: this.nativeStep,
            nativeObservationCurrent: this.nativeObservationCurrent,
            lastStepOutcome: this.lastStepOutcome,
            attemptedSteps: this.attemptedSteps,
            lastDt: this.lastDt,
            solverSubSteps: this.options.solverSubSteps,
            gravity: this.gravity,
            allowSleep: this.sleeping,
            material: this.material,
            materialShapeCount: this.#materialShapes.size,
            sceneBindingCount: this.#sharedBodies.size,
            sceneSyncCalls: this.sceneSyncCalls,
            afterEventsCalls: this.afterEventsCalls,
            emittedStep: this.emittedStep,
            componentEventsSupported: false,
            debugPresented: false,
            error: this.hasFailure ? String(this.failure) : null,
        });
    }
    getStepSnapshot(): Box3DStepSnapshot | null {
        this.assertCommittedRead('getStepSnapshot');
        return this.snapshot;
    }
    getDebugSnapshot(): Box3DDebugSnapshot | null {
        this.assertCommittedRead('getDebugSnapshot');
        return this.debug;
    }
    destroy(): void {
        if (this.state === 'destroyed') return;
        if (this.state === 'destroy-failed') throw this.destroyFailure;
        if (this.state === 'stepping' || this.state === 'destroying')
            throw worldError('AIR_E_BOX3D_REENTRANT', 'destroy', 'Cannot destroy during native operation.');
        if (this.state !== 'faulted') this.#commandOwner.assertConfiguration('destroy');
        this.state = 'destroying';
        this.nativeObservationCurrent = false;
        try {
            try {
                this.#binding.destroyWorld(this.#token);
                this.nativeDestroyReturned = true;
            } catch (error) {
                this.hasNativeDestroyFailure = true;
                this.nativeDestroyFailure = error;
                throw error;
            }
            for (const body of this.#sharedBodies.values()) body.closeWithWorld();
            this.#sharedBodies.clear();
            this.#materialShapes.clear();
            this.pendingSnapshot = null;
            this.snapshot = null;
            this.debug = null;
            this.state = 'destroyed';
        } catch (error) {
            this.state = 'destroy-failed';
            this.hasDestroyFailure = true;
            this.destroyFailure = error;
            throw error;
        } finally {
            try {
                this.#commandOwner.closeAfterWorldTeardown(this.state === 'destroyed');
            } catch (error) {
                this.recordOwnerCleanup(error);
                if (this.state !== 'destroy-failed') {
                    this.state = 'destroy-failed';
                    this.hasDestroyFailure = true;
                    this.destroyFailure = error;
                    throw error;
                }
            }
        }
    }
    raycast(..._args: Parameters<IPhysicsWorld['raycast']>): never {
        this.assertReady('raycast');
        return unsupportedBox3D('raycast');
    }
    raycastClosest(..._args: Parameters<IPhysicsWorld['raycastClosest']>): never {
        this.assertReady('raycastClosest');
        return unsupportedBox3D('raycastClosest');
    }
    sweepBox(..._args: Parameters<IPhysicsWorld['sweepBox']>): never {
        this.assertReady('sweepBox');
        return unsupportedBox3D('sweepBox');
    }
    sweepBoxClosest(..._args: Parameters<IPhysicsWorld['sweepBoxClosest']>): never {
        this.assertReady('sweepBoxClosest');
        return unsupportedBox3D('sweepBoxClosest');
    }
    sweepSphere(..._args: Parameters<IPhysicsWorld['sweepSphere']>): never {
        this.assertReady('sweepSphere');
        return unsupportedBox3D('sweepSphere');
    }
    sweepSphereClosest(..._args: Parameters<IPhysicsWorld['sweepSphereClosest']>): never {
        this.assertReady('sweepSphereClosest');
        return unsupportedBox3D('sweepSphereClosest');
    }
    sweepCapsule(..._args: Parameters<IPhysicsWorld['sweepCapsule']>): never {
        this.assertReady('sweepCapsule');
        return unsupportedBox3D('sweepCapsule');
    }
    sweepCapsuleClosest(..._args: Parameters<IPhysicsWorld['sweepCapsuleClosest']>): never {
        this.assertReady('sweepCapsuleClosest');
        return unsupportedBox3D('sweepCapsuleClosest');
    }
}
