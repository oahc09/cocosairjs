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
import type { Box3DOwnedComponentSeed, Box3DTeleportOptions, Box3DKinematicTarget } from './world-command-owner';
import type { Node } from '../../../cocos/scene-graph/node';
import { Box3DSharedBody } from './shared-body';
import type { Box3DComponentConfiguration } from './shared-body';
import { PhysicsRayResult } from '../../../cocos/physics/framework/physics-ray-result';
import { copyBox3DRay, resolveBox3DRayHits } from './query';
import { Box3DStaticMeshResources } from './static-mesh-resource';
import { installBox3DBeforeStepSource } from './before-step-source';
import { installBox3DCommittedQuerySource } from './committed-query-source';
import {
    copyQueryRotation,
    primitiveQueryProxy,
    committedPrimitiveQuery,
    capsuleQueryHalfHeight,
    copyTranslationQuery,
    queryVector,
} from './convex-query';
import type { Box3DCopiedRay } from './query';
import type { Box3DQueryProxy } from './binding/facade.mjs';
import type { Box3DBeforeStepContext } from '../../box3d-controls';
import type {
    Box3DCommittedColliderQuery,
    Box3DCommittedRayQuery,
    Box3DQueryOptions,
    Box3DCommittedQueryChild,
} from '../../box3d-queries';
import type { Box3DQueryCollider } from './query';
import type { IPhysicsWorld } from '../../../cocos/physics/spec/i-physics-world';
import type { PhysicsMaterial } from '../../../cocos/physics/framework/assets/physics-material';
import type { Collider } from '../../../cocos/physics/framework/components/colliders/collider';
import { readPhysicsMaterialPrivateValues } from '../../../cocos/physics/framework/physics-material-cache';
import type { Box3DId, Box3DWorld, Box3DStepSnapshot } from './binding/facade.mjs';
import type { Box3DSTLease } from './loader/st-loader.mjs';
import type { AirNormalizedBox3DOptions } from './config';
import type { AirPhysicsPreparation, AirPhysicsSceneReleaseResult } from '../preparation';
import { copyDebugSnapshot, validateDebugFlags, validateJointScale } from './debug';
import type { Box3DDebugSnapshot } from './debug';
import {
    copyStepDiagnostics,
    copySurfaceMaterial,
    copyVector,
    finiteFloat32,
    requireWorldBinding,
    requireComponentBinding,
    mutationNotApplied,
    worldError,
} from './world-binding';
import type { Box3DNativeStepDiagnostics, Box3DSurfaceMaterial, Box3DWorldBinding } from './world-binding';
import { unsupportedBox3D } from './unsupported';
import { copyWritebackQualification, writebackSceneBatch } from './world-writeback';
import type { Box3DWritebackQualification } from './world-writeback';

import type { Box3DCommandTick, Box3DDispatchScope } from './world-command-owner';
import type { Box3DCommand, Box3DCommandBatchResult } from './binding/facade.mjs';
import type { CommandPose, CommandProducer } from './command-queue';
import type { ContinuousDescriptor } from './command-producers';
import type { PhysicsBodyCommandInput } from '../../../cocos/physics/framework/physics-command-submission';
import { Box3DCollisionEvents } from './collision-events';
import { Box3DTriggerEvents } from './trigger-events';
import type { Box3DFixedConstraint } from './fixed-constraint';
import type { Box3DHingeConstraint } from './hinge-constraint';
import type { Box3DPointToPointConstraint } from './point-to-point-constraint';
import { RigidBody } from '../../../cocos/physics/framework/components/rigid-body';
import type {
    Box3DFixedConfiguration,
    Box3DHingeConfiguration,
    Box3DHingeGeometry,
    Box3DPointToPointConfiguration,
    Box3DPointToPointGeometry,
} from './binding/facade.mjs';

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
    #meshResources: Box3DStaticMeshResources | undefined;
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
    readonly #fixedConstraints = new Set<Box3DFixedConstraint>();
    readonly #hingeConstraints = new Set<Box3DHingeConstraint>();
    readonly #pointToPointConstraints = new Set<Box3DPointToPointConstraint>();
    readonly #queryLogicalIds = new WeakMap<Collider, number>();
    #queryLogicalSequence = 0;
    #beforeStepSource: { dispose(): void } | undefined;
    #querySource: { dispose(): void } | undefined;
    #sceneReleaseSource: (() => void) | undefined;
    readonly #materialShapes = new Map<Box3DId, boolean>();
    private nativeStep: Readonly<Box3DNativeStepDiagnostics> = Object.freeze({
        nativeStepIndex: 0,
        nativeCompleted: false,
        snapshotAvailable: false,
    });
    private snapshot: Box3DStepSnapshot | null = null;
    private pendingSnapshot: Box3DStepSnapshot | null = null;
    private emittedStep = 0;
    readonly #collisionEvents = new Box3DCollisionEvents();
    readonly #triggerEvents = new Box3DTriggerEvents();
    private sceneSyncCalls = 0;
    private afterEventsCalls = 0;
    private attemptedSteps = 0;
    private lastDt: number | null = null;
    private nativeObservationCurrent = true;
    readonly #writebackQualification: Box3DWritebackQualification;
    #writebackEpoch = 0;
    #lastCommand: Readonly<Record<string, unknown>> | null = null;
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
            this.#commandOwner.installGameControlObservation((error) => {
                this.invalidatePending();
                this.fault(error);
            });
            this.#commandOwner.installCommandRouting();
            this.#beforeStepSource = installBox3DBeforeStepSource(this, (callback, options) =>
                this.registerCommandHook(callback, options),
            );
            this.#querySource = installBox3DCommittedQuerySource(this, {
                colliders: (context, colliders, translation, options) =>
                    this.queryCommittedColliders(context, colliders, translation, options),
                ray: (context, origin, translation, options) =>
                    this.queryCommittedRay(context, origin, translation, options),
                target: (body) => this.createKinematicTarget(body),
            });
            this.#sceneReleaseSource = preparation.installSceneReleaseHook(() => this.#releaseSceneStorage());
        } catch (error) {
            this.#sceneReleaseSource?.();
            this.#sceneReleaseSource = undefined;
            this.#querySource?.dispose();
            this.#querySource = undefined;
            this.#beforeStepSource?.dispose();
            this.#beforeStepSource = undefined;
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
    /** Internal finite candidate entry points. No package-level unified capability promotion. */
    registerCommandHook(callback: CommandProducer, options?: { enabled?: boolean }) {
        return this.#commandOwner.registerCommandHook(callback, options);
    }
    registerContinuousCommand(source: object, descriptor: ContinuousDescriptor, options?: { enabled?: boolean }) {
        return this.#commandOwner.registerContinuousCommand(source, descriptor, options);
    }
    submitAdapterCommand(adapter: object, read: () => PhysicsBodyCommandInput): number {
        return this.#commandOwner.submitAdapterCommand(adapter, read);
    }
    /** Internal persistent-target candidate. No package helper is exported or activated. */
    createKinematicTarget(source: object): Box3DKinematicTarget {
        return this.#commandOwner.createKinematicTarget(source);
    }
    /** Internal finite reset candidate only; no public adapter activation. */
    teleportRigidBody(source: object, pose: CommandPose, options?: Box3DTeleportOptions): number {
        return this.#commandOwner.teleportRigidBody(source, pose, options);
    }
    cancelPendingCommands(source: object): number {
        return this.#commandOwner.cancelPendingCommands(source);
    }
    retireNonDynamicAfterCommit(adapter: object): void {
        try {
            this.#commandOwner.retireNonDynamicAfterCommit(adapter);
        } catch (error) {
            this.fault(error);
            throw error;
        }
    }
    private copyCommandReceipt(result: Box3DCommandBatchResult, commands: readonly Box3DCommand[]) {
        if (
            !result ||
            !Object.isFrozen(result) ||
            result.executedOperationCount !== commands.length ||
            result.operations.length !== commands.length
        )
            throw worldError('AIR_E_BOX3D_ABI', 'command receipt', 'Expected a complete immutable command result.');
        const bodies = new Map<object, number>();
        for (const command of commands) if (!bodies.has(command.body)) bodies.set(command.body, bodies.size);
        const copy = (value: unknown): unknown => {
            if (typeof value === 'number') {
                if (!Number.isFinite(value))
                    throw worldError('AIR_E_BOX3D_ABI', 'command receipt', 'Nonfinite observation.');
                return value;
            }
            if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
            if (Array.isArray(value)) return Object.freeze(value.map(copy));
            if (!value || typeof value !== 'object' || !Object.isFrozen(value))
                throw worldError('AIR_E_BOX3D_ABI', 'command receipt', 'Expected immutable copied observation.');
            const copied: Record<string, unknown> = Object.create(null);
            for (const key of Object.keys(value)) copied[key] = copy((value as Record<string, unknown>)[key]);
            return Object.freeze(copied);
        };
        const operations = result.operations.map((operation, index) => {
            const expected = commands[index];
            if (
                operation.body !== expected.body ||
                operation.kind !== expected.kind ||
                operation.sequence !== expected.sequence
            )
                throw worldError('AIR_E_BOX3D_ABI', 'command receipt', 'Native operation identity/order differs.');
            return Object.freeze({
                bodyOrdinal: bodies.get(operation.body),
                kind: operation.kind,
                sequence: operation.sequence,
                plan: copy(operation.plan),
                actual: copy(operation.actual),
            });
        });
        return Object.freeze({
            executedOperationCount: result.executedOperationCount,
            operations: Object.freeze(operations),
        });
    }
    /** Internal adapter admission before caller-controlled component inputs. */
    assertComponentConfiguration(operation: string): void {
        this.assertReady(operation);
    }
    get jointCleanupOnly(): boolean {
        return ['faulted', 'destroying', 'destroyed', 'destroy-failed'].includes(this.state);
    }
    assertJointRequest(operation: string): void {
        this.assertReadyState(operation);
        this.#commandOwner.assertListenerUpdate(operation);
    }
    beginJointActivity() {
        this.assertReadyState('Joint activity');
        return this.#commandOwner.beginJointActivity();
    }
    assertJointRead(operation: string): void {
        this.assertCommittedRead(operation);
    }
    failJointOperation(error: unknown): never {
        this.fault(error);
        throw error;
    }
    validateFixedEndpoints(attached: RigidBody, connected: RigidBody | null): void {
        this.assertCommittedRead('Fixed endpoint admission');
        for (const component of connected ? [attached, connected] : [attached]) {
            const body = this.#sharedBodies.get(component.node);
            if (!body || body.rigidBody !== component)
                throw worldError(
                    'AIR_E_BOX3D_CONFIG',
                    'Fixed endpoints',
                    'RigidBody is not owned by this exact world.',
                );
        }
    }
    /** Same frozen admission scale used by the owned shapes. Rotation cache decomposition
     * must not count as user geometry mutation or reset a joint's captured zero. The
     * existing body preflight still rejects external local scale/parent changes. */
    initialJointScale(component: RigidBody): readonly number[] {
        this.assertCommittedRead('joint admitted scale');
        const body = this.#sharedBodies.get(component.node);
        if (!body || body.rigidBody !== component)
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'joint admitted scale',
                'RigidBody is not owned by this exact world.',
            );
        return body.initialScale;
    }
    registerFixedConstraint(value: Box3DFixedConstraint): void {
        this.assertReady('register Fixed');
        if (this.#fixedConstraints.has(value))
            throw worldError('AIR_E_BOX3D_CONFIG', 'register Fixed', 'Duplicate owner.');
        this.#fixedConstraints.add(value);
    }
    releaseFixedConstraint(value: Box3DFixedConstraint): void {
        if (this.jointCleanupOnly) return; // Native ownership remains with terminal world teardown.
        this.assertReady('release Fixed');
        if (!this.#fixedConstraints.has(value))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'release Fixed', 'Unknown owner.');
        try {
            value.detach();
            this.#fixedConstraints.delete(value);
        } catch (error) {
            this.failJointOperation(error);
        }
    }
    createFixedLease(attached: RigidBody, connected: RigidBody | null, configuration: Box3DFixedConfiguration) {
        this.assertReady('Fixed safe commit');
        this.validateFixedEndpoints(attached, connected);
        try {
            return Box3DSharedBody.createFixedLease(
                this.#sharedBodies.get(attached.node)!,
                connected ? this.#sharedBodies.get(connected.node)! : null,
                configuration,
            );
        } catch (error) {
            this.failJointOperation(error);
        }
    }
    registerHingeConstraint(value: Box3DHingeConstraint): void {
        this.assertReady('register Hinge');
        if (this.#hingeConstraints.has(value))
            throw worldError('AIR_E_BOX3D_CONFIG', 'register Hinge', 'Duplicate owner.');
        this.#hingeConstraints.add(value);
    }
    releaseHingeConstraint(value: Box3DHingeConstraint): void {
        if (this.jointCleanupOnly) return; // Native ownership remains with terminal world teardown.
        this.assertReady('release Hinge');
        if (!this.#hingeConstraints.has(value))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'release Hinge', 'Unknown owner.');
        try {
            value.detach();
            this.#hingeConstraints.delete(value);
        } catch (error) {
            this.failJointOperation(error);
        }
    }
    createHingeLease(
        attached: RigidBody,
        connected: RigidBody | null,
        geometry: Box3DHingeGeometry,
        configuration: Box3DHingeConfiguration,
    ) {
        this.assertReady('Hinge safe commit');
        this.validateFixedEndpoints(attached, connected);
        try {
            return Box3DSharedBody.createHingeLease(
                this.#sharedBodies.get(attached.node)!,
                connected ? this.#sharedBodies.get(connected.node)! : null,
                geometry,
                configuration,
            );
        } catch (error) {
            this.failJointOperation(error);
        }
    }
    registerPointToPointConstraint(value: Box3DPointToPointConstraint): void {
        this.assertReady('register PointToPoint');
        if (this.#pointToPointConstraints.has(value))
            throw worldError('AIR_E_BOX3D_CONFIG', 'register PointToPoint', 'Duplicate owner.');
        this.#pointToPointConstraints.add(value);
    }
    releasePointToPointConstraint(value: Box3DPointToPointConstraint): void {
        if (this.jointCleanupOnly) return; // Native ownership remains with terminal world teardown.
        this.assertReady('release PointToPoint');
        if (!this.#pointToPointConstraints.has(value))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'release PointToPoint', 'Unknown owner.');
        try {
            value.detach();
            this.#pointToPointConstraints.delete(value);
        } catch (error) {
            this.failJointOperation(error);
        }
    }
    createPointToPointLease(
        attached: RigidBody,
        connected: RigidBody | null,
        geometry: Box3DPointToPointGeometry,
        configuration: Box3DPointToPointConfiguration,
    ) {
        this.assertReady('PointToPoint safe commit');
        this.validateFixedEndpoints(attached, connected);
        try {
            return Box3DSharedBody.createPointToPointLease(
                this.#sharedBodies.get(attached.node)!,
                connected ? this.#sharedBodies.get(connected.node)! : null,
                geometry,
                configuration,
            );
        } catch (error) {
            this.failJointOperation(error);
        }
    }
    #detachBodyJoints(body: RigidBody): void {
        try {
            for (const joint of this.#fixedConstraints) joint.endpointRemoving(body);
            for (const joint of this.#hingeConstraints) joint.endpointRemoving(body);
            for (const joint of this.#pointToPointConstraints) joint.endpointRemoving(body);
        } catch (error) {
            this.failJointOperation(error);
        }
    }
    #commitFixedConstraints(): void {
        try {
            for (const joint of this.#fixedConstraints) joint.commit();
            for (const joint of this.#hingeConstraints) joint.commit();
            for (const joint of this.#pointToPointConstraints) joint.commit();
        } catch (error) {
            this.failJointOperation(error);
        }
    }
    get staticMeshIdentity() {
        return this.#binding.identity;
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
                    acquireStaticMesh: (intake) => {
                        this.assertReady('static Mesh cache');
                        this.#meshResources ??= new Box3DStaticMeshResources(this.#binding, this.#token);
                        return this.#meshResources.acquire(intake);
                    },
                    assertReady: (operation) => this.assertReady(operation),
                    rigidBodyDetaching: (body) => this.#detachBodyJoints(body),
                    assertListenerUpdate: (operation) => {
                        this.assertReadyState(operation);
                        this.#commandOwner.assertListenerUpdate(operation);
                    },
                    assertCommittedRead: (operation) => this.assertCommittedRead(operation),
                    adoptBody: (seed) => this.#commandOwner.adoptBody(seed),
                    attachComponent: (key, seed) => this.#commandOwner.attachComponent(key, seed),
                    completeComponent: (adapter) => this.#commandOwner.completeComponent(adapter),
                    componentEnabled: (adapter, enabled) => this.#commandOwner.commitComponentEnabled(adapter, enabled),
                    releaseComponent: (adapter) => this.#commandOwner.releaseComponentAfterCleanup(adapter),
                    prepareTargetTransition: (logical) => this.#commandOwner.prepareTargetTransition(logical),
                    consumeActivityAuthority: (adapter, authority, stage) =>
                        this.#commandOwner.consumeActivityAuthority(adapter, authority, stage),
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
        for (const joint of this.#hingeConstraints) joint.preflight();
        for (const joint of this.#pointToPointConstraints) joint.preflight();
        this.#commitFixedConstraints();
        ++this.sceneSyncCalls;
    }
    syncAfterEvents(): void {
        this.assertReady('syncAfterEvents');
        ++this.afterEventsCalls;
    }
    emitEvents(): void {
        this.assertReady('emitEvents');
        if (!this.pendingSnapshot) return;
        const snapshot = this.pendingSnapshot;
        const roster = Box3DSharedBody.collisionColliderRecords(Array.from(this.#sharedBodies.values()));
        let deliveries;
        try {
            deliveries = [
                ...this.#collisionEvents.prepare(snapshot, roster),
                ...this.#triggerEvents.prepare(snapshot, roster),
            ];
        } catch (error) {
            this.fault(error);
            throw error;
        }
        let scope: Box3DDispatchScope;
        try {
            scope = this.#commandOwner.beginDispatch(
                Object.freeze([
                    ...Array.from(this.#fixedConstraints, (joint) => joint.component),
                    ...Array.from(this.#hingeConstraints, (joint) => joint.component),
                    ...Array.from(this.#pointToPointConstraints, (joint) => joint.component),
                ]),
            );
        } catch (error) {
            this.fault(error);
            throw error;
        }
        let failed = false,
            primary: unknown;
        try {
            // Consume this batch before callbacks: failures cannot replay the native step.
            this.emittedStep = snapshot.stepIndex;
            this.pendingSnapshot = null;
            for (const { event } of deliveries) {
                if (scope.pendingDestruction(event.selfCollider) || scope.pendingDestruction(event.otherCollider))
                    continue;
                event.selfCollider.emit(event.type, event);
            }
        } catch (error) {
            failed = true;
            primary = error;
        } finally {
            try {
                scope.dispose();
                scope.drainDestruction();
            } catch (error) {
                this.recordOwnerCleanup(error);
                if (!failed) {
                    failed = true;
                    primary = error;
                }
            }
        }
        if (failed) {
            this.fault(primary);
            throw primary;
        }
    }
    step(dt: number, timeSinceLastCalled?: number, maxSubSteps?: number): void {
        this.assertReady('step');
        this.#commandOwner.assertSteppingAllowed('step');
        this.#commandOwner.assertNativeClockFrame();
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
        const nextEpoch = this.#writebackEpoch + 1,
            bodies = Object.freeze(Array.from(this.#sharedBodies.values()));
        const scope = this.#commandOwner.beginStep(),
            before = this.nativeStep.nativeStepIndex;
        let tick: Box3DCommandTick | null = null;
        const commandState: { outcome: 'not-attempted' | 'not-mutated' | 'committed' | 'unknown' } = {
            outcome: 'not-attempted',
        };
        let solverAttempted = false,
            solverCompleted = false,
            failed = false,
            primary: unknown;
        try {
            for (const body of bodies) body.preflight();
            tick = this.#commandOwner.prepareCommandTick(scope, delta, this.options.solverSubSteps);
            // Recheck every body after caller callbacks, not only packet participants.
            for (const body of bodies) body.preflight();
            scope.prepareWriteback(Box3DSharedBody.plannedWritebackNodes(bodies, tick.teleportNodes));
            this.#binding.validateCommandBatch(this.#token, tick.commands, delta, this.options.solverSubSteps);
            const start = copyStepDiagnostics(this.#binding.stepDiagnostics(this.#token));
            if (start.nativeStepIndex !== before) {
                const error = worldError('AIR_E_BOX3D_ABI', 'step', 'World advanced outside its owner.');
                this.fault(error);
                throw error;
            }
            this.state = 'stepping';
            this.lastStepOutcome = 'not-attempted';
            this.#lastCommand = Object.freeze({
                context: tick.context,
                acceptedCount: tick.acceptedCount,
                operationCount: tick.commands.length,
                outcome: 'not-attempted',
                receipt: null,
            });
            tick.beginCommit();
            let result: Box3DCommandBatchResult;
            try {
                commandState.outcome = 'unknown';
                result = this.#binding.applyCommandBatch(
                    this.#token,
                    tick.commands,
                    delta,
                    this.options.solverSubSteps,
                );
                commandState.outcome = 'committed';
            } catch (error) {
                let outcome: 'not-mutated' | 'committed' | 'unknown' = 'unknown';
                try {
                    const descriptor =
                        error && (typeof error === 'object' || typeof error === 'function')
                            ? Object.getOwnPropertyDescriptor(error, 'mutationOutcome')
                            : undefined;
                    if (
                        descriptor &&
                        descriptor.writable === false &&
                        descriptor.configurable === false &&
                        (descriptor.value === 'not-mutated' || descriptor.value === 'committed')
                    )
                        outcome = descriptor.value;
                } catch (classificationError) {
                    // Hostile/failed delivery metadata cannot replace the original apply failure.
                    this.recordOwnerCleanup(classificationError);
                }
                commandState.outcome = outcome;
                this.#lastCommand = Object.freeze({ ...this.#lastCommand, outcome });
                try {
                    tick.finishCommit(outcome);
                } catch (settlementError) {
                    this.recordOwnerCleanup(settlementError);
                    this.fault(error);
                }
                if (outcome === 'not-mutated' && this.state === 'stepping') this.state = 'ready';
                else if (outcome !== 'not-mutated') {
                    this.invalidatePending();
                    this.fault(error);
                }
                throw error;
            }
            this.#lastCommand = Object.freeze({ ...this.#lastCommand, outcome: 'committed' });
            tick.finishCommit('committed');
            if (tick.commands.length) this.invalidatePending();
            // Any receipt copy/readback failure is AFTER known mutation and never replays accepted commands.
            this.#lastCommand = Object.freeze({
                context: tick.context,
                acceptedCount: tick.acceptedCount,
                operationCount: tick.commands.length,
                outcome: 'committed',
                receipt: this.copyCommandReceipt(result, tick.commands),
            });
            this.lastDt = delta;
            ++this.attemptedSteps;
            this.lastStepOutcome = 'unknown';
            this.nativeObservationCurrent = false;
            scope.advance('solving');
            solverAttempted = true;
            this.#binding.step(this.#token, delta, this.options.solverSubSteps);
            scope.advance('writeback');
            this.nativeStep = copyStepDiagnostics(this.#binding.stepDiagnostics(this.#token));
            if (
                this.nativeStep.nativeStepIndex !== before + 1 ||
                !this.nativeStep.nativeCompleted ||
                !this.nativeStep.snapshotAvailable
            )
                throw worldError('AIR_E_BOX3D_ABI', 'step', 'Expected exactly one completed native step and snapshot.');
            solverCompleted = true;
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
            for (const joint of this.#fixedConstraints)
                joint.observe(snapshot.jointThresholdEvents, snapshot.stepIndex);
            const plans = Box3DSharedBody.captureWriteback(bodies, tick.teleportNodes);
            writebackSceneBatch(
                plans,
                () => {
                    const current = Array.from(this.#sharedBodies.values());
                    if (current.length !== bodies.length || current.some((body, index) => body !== bodies[index]))
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
            tick.complete();
            this.state = 'ready';
        } catch (error) {
            failed = true;
            primary = error;
            if (solverAttempted) {
                try {
                    this.nativeStep = copyStepDiagnostics(this.#binding.stepDiagnostics(this.#token));
                    this.nativeObservationCurrent = true;
                    solverCompleted = this.nativeStep.nativeStepIndex === before + 1;
                    this.lastStepOutcome = solverCompleted
                        ? 'completed'
                        : this.nativeStep.nativeStepIndex === before
                          ? 'not-completed'
                          : 'unknown';
                } catch {
                    this.nativeObservationCurrent = false;
                }
            }
            if (commandState.outcome === 'committed' || commandState.outcome === 'unknown' || solverAttempted)
                this.fault(error);
            else if (this.state === 'stepping') this.state = 'ready';
            try {
                tick?.fail(solverCompleted);
            } catch (cleanup) {
                this.recordOwnerCleanup(cleanup);
                this.fault(error);
            }
            throw error;
        } finally {
            let cleanupFailed = false,
                cleanupError: unknown;
            try {
                tick?.dispose();
            } catch (error) {
                cleanupFailed = true;
                cleanupError = error;
                this.recordOwnerCleanup(error);
            }
            try {
                scope.dispose();
            } catch (error) {
                if (!cleanupFailed) cleanupError = error;
                cleanupFailed = true;
                this.recordOwnerCleanup(error);
            }
            if (cleanupFailed) {
                this.fault(failed ? primary : cleanupError);
                if (!failed) throw cleanupError;
            }
        }
        // Threshold events were copied before any user callback. Once idle again,
        // destroy only latched broken joints. Preserve this step's copied contact batch.
        try {
            for (const joint of this.#fixedConstraints) joint.afterStep();
        } catch (error) {
            this.failJointOperation(error);
        }
    }
    /** Called only through the acquired world's app post-destruction hook. Never step to drain events. */
    #releaseSceneStorage(): AirPhysicsSceneReleaseResult {
        this.assertReady('scene release storage');
        this.#commandOwner.assertSceneReleaseBoundary(false);
        const counts = this.getNativeCounts();
        if (counts.bodies || counts.shapes || counts.contacts || counts.joints)
            return Object.freeze({ backend: 'box3d', status: 'SKIPPED_NONEMPTY' });
        this.#commandOwner.assertSceneReleaseBoundary(true);
        if (
            this.hasOwnerCleanupFailure ||
            this.#sharedBodies.size ||
            this.#materialShapes.size ||
            this.#fixedConstraints.size ||
            this.#hingeConstraints.size ||
            this.#pointToPointConstraints.size ||
            this.pendingSnapshot ||
            this.getStaticMeshResourceDiagnostics().length
        )
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'scene release storage',
                'Empty world still has adapter resources, pending events or unresolved ownership.',
            );
        const before = copyStepDiagnostics(this.#binding.stepDiagnostics(this.#token));
        let committed = false;
        try {
            const restored = this.#binding.trimEmptyWorld(this.#token, true);
            if (restored === false) return Object.freeze({ backend: 'box3d', status: 'SKIPPED_NONEMPTY' });
            if (restored !== true) throw worldError('AIR_E_BOX3D_ABI', 'scene release storage', 'Invalid trim result.');
            committed = true;
            this.invalidatePending();
            this.snapshot = null;
            this.debug = null;
            this.#collisionEvents.clear();
            this.#triggerEvents.clear();
            const after = copyStepDiagnostics(this.#binding.stepDiagnostics(this.#token));
            if (
                after.nativeStepIndex !== before.nativeStepIndex ||
                after.nativeCompleted !== before.nativeCompleted ||
                after.snapshotAvailable
            )
                throw worldError(
                    'AIR_E_BOX3D_ABI',
                    'scene release storage',
                    'Trim advanced the clock or retained native views.',
                );
            this.nativeStep = after;
            this.nativeObservationCurrent = true;
            return Object.freeze({ backend: 'box3d', status: 'RESTORED' });
        } catch (error) {
            let notMutated = false;
            try {
                notMutated = mutationNotApplied(error);
            } catch (classificationError) {
                this.recordOwnerCleanup(classificationError);
            }
            if (committed || !notMutated) {
                this.invalidatePending();
                this.fault(error);
            }
            throw error;
        }
    }
    /** Internal copied resource diagnostics for qualification; no token is returned. */
    getStaticMeshResourceDiagnostics() {
        this.assertCommittedRead('Mesh resource diagnostics');
        return this.#meshResources?.readDiagnostics() ?? Object.freeze([]);
    }
    /** Live-world safe-point diagnostics only. This neither advances nor flushes physics. */
    getNativeMemoryDiagnostics() {
        if (this.state !== 'ready')
            throw worldError('AIR_E_BOX3D_REENTRANT', 'getNativeMemoryDiagnostics', 'Requires an idle ready world.');
        this.assertCommittedRead('getNativeMemoryDiagnostics');
        if (typeof this.#binding.memoryDiagnostics !== 'function')
            throw worldError('AIR_E_BOX3D_ABI', 'getNativeMemoryDiagnostics', 'Diagnostic v2 binding unavailable.');
        const value = this.#binding.memoryDiagnostics(this.#token);
        if (
            value?.profile !== 'air-box3d-memory-diagnostics-v2' ||
            value.schemaVersion !== 2 ||
            value.identity.worldId !== this.#token.id
        )
            throw worldError('AIR_E_BOX3D_ABI', 'getNativeMemoryDiagnostics', 'Foreign diagnostic world identity.');
        return Object.freeze({
            ...value,
            identity: Object.freeze({ ...value.identity, bindingGeneration: this.description.generation }),
            mesh: Object.freeze({ ...value.mesh, liveResourceSnapshots: this.getStaticMeshResourceDiagnostics() }),
        });
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
            lastCommand: this.#lastCommand,
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
            collisionEventSubset: 'SOLID_PRIMITIVE_CONTACT_CANDIDATE',
            collisionEventFamilies: Object.freeze([
                'sphere-sphere',
                'sphere-box',
                'sphere-capsule',
                'box-box',
                'capsule-box',
                'capsule-capsule',
            ]),
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
                this.#meshResources?.closeAfterWorld();
                this.#meshResources = undefined;
            } catch (error) {
                this.hasNativeDestroyFailure = true;
                this.nativeDestroyFailure = error;
                throw error;
            }
            for (const joint of this.#fixedConstraints) joint.closeWithWorld();
            this.#fixedConstraints.clear();
            for (const joint of this.#hingeConstraints) joint.closeWithWorld();
            for (const joint of this.#pointToPointConstraints) joint.closeWithWorld();
            this.#hingeConstraints.clear();
            this.#pointToPointConstraints.clear();
            for (const body of this.#sharedBodies.values()) body.closeWithWorld();
            this.#sharedBodies.clear();
            this.#materialShapes.clear();
            this.pendingSnapshot = null;
            this.#collisionEvents.clear();
            this.#triggerEvents.clear();
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
            } finally {
                // Source lookup must not survive terminal owner/native teardown, even when cleanup fails.
                this.#sceneReleaseSource?.();
                this.#sceneReleaseSource = undefined;
                this.#querySource?.dispose();
                this.#querySource = undefined;
                this.#beforeStepSource?.dispose();
                this.#beforeStepSource = undefined;
            }
        }
    }
    #queryRoster(): Map<string, Box3DQueryCollider> {
        const roster = new Map<string, Box3DQueryCollider>();
        for (const record of Box3DSharedBody.queryColliderRecords([...this.#sharedBodies.values()])) {
            let logicalId = this.#queryLogicalIds.get(record.collider);
            if (logicalId === undefined) {
                if (this.#queryLogicalSequence >= Number.MAX_SAFE_INTEGER)
                    throw worldError(
                        'AIR_E_BOX3D_CONFIG',
                        'ray collider identity',
                        'Logical collider identity exhausted.',
                    );
                logicalId = ++this.#queryLogicalSequence;
                this.#queryLogicalIds.set(record.collider, logicalId);
            }
            const key = `${record.low}:${record.high}`;
            if (roster.has(key))
                throw worldError('AIR_E_BOX3D_ABI', 'ray collider identity', 'Duplicate full native shape identity.');
            roster.set(key, Object.freeze({ collider: record.collider, logicalId, sourceFace: record.sourceFace }));
        }
        return roster;
    }
    #queryStamp(context: Box3DBeforeStepContext) {
        const epoch = this.#binding.readQueryEpoch(this.#token);
        if (
            !Number.isSafeInteger(epoch.stepIndex) ||
            epoch.stepIndex < 0 ||
            !Number.isSafeInteger(epoch.mutationRevision) ||
            epoch.mutationRevision < 0
        )
            throw worldError('AIR_E_BOX3D_ABI', 'query epoch', 'Invalid committed epoch.');
        return Object.freeze({
            worldGeneration: this.description.generation,
            tickIndex: context.tickIndex,
            attemptId: context.attemptId,
            nativeStepIndex: epoch.stepIndex,
            nativeMutationRevision: epoch.mutationRevision,
            complete: true as const,
        });
    }
    #assertQueryEpoch(stamp: { nativeStepIndex: number; nativeMutationRevision: number }): void {
        this.assertCommittedRead('copied committed query result');
        const after = this.#binding.readQueryEpoch(this.#token);
        if (after.stepIndex !== stamp.nativeStepIndex || after.mutationRevision !== stamp.nativeMutationRevision)
            throw worldError('AIR_E_BOX3D_ABI', 'query epoch', 'Native world changed during synchronous read.');
    }
    queryCommittedRay(
        context: Box3DBeforeStepContext,
        origin: { x: number; y: number; z: number },
        translation: { x: number; y: number; z: number },
        options: Box3DQueryOptions,
    ): Box3DCommittedRayQuery {
        return this.#commandOwner.withCommittedQuery(context, () => {
            const copied = copyTranslationQuery(origin, translation, options),
                stamp = this.#queryStamp(context);
            const roster = this.#queryRoster();
            const raw = copied.empty
                ? Object.freeze([])
                : this.#binding.rayAllRaw(this.#token, copied.origin, copied.translation, copied.options);
            const hits = resolveBox3DRayHits(raw, copied, (low, high) => roster.get(`${low}:${high}`));
            this.#assertQueryEpoch(stamp);
            return Object.freeze({
                ...stamp,
                origin: queryVector(copied.origin),
                translation: queryVector(copied.translation),
                hits,
            });
        });
    }
    queryCommittedColliders(
        context: Box3DBeforeStepContext,
        colliders: readonly Collider[],
        translation: { x: number; y: number; z: number },
        options: Box3DQueryOptions,
    ): Box3DCommittedColliderQuery {
        return this.#commandOwner.withCommittedQuery(context, () => {
            if (!Array.isArray(colliders) || !colliders.length)
                throw worldError('AIR_E_BOX3D_CONFIG', 'query group', 'Expected nonempty Collider array.');
            const requested = Array.from(colliders),
                group = new Set(requested);
            if (group.size !== requested.length)
                throw worldError('AIR_E_BOX3D_CONFIG', 'query group', 'Duplicate collider.');
            // Copy caller scalar inputs before any native query. Group ownership and every proxy
            // are admitted completely before the first overlap/cast; no partial query on bad tail.
            const copied = copyTranslationQuery({ x: 0, y: 0, z: 0 }, translation, options),
                stamp = this.#queryStamp(context);
            const geometry = Box3DSharedBody.committedQueryGeometries([...this.#sharedBodies.values()]);
            const requestedBodies = new Set(geometry.filter((row) => group.has(row.collider)).map((row) => row.body));
            if (geometry.some((row) => requestedBodies.has(row.body) && !group.has(row.collider)))
                throw worldError(
                    'AIR_E_BOX3D_CONFIG',
                    'query group',
                    'Include every active Collider of each requested body.',
                );
            const roster = this.#queryRoster();
            const records = requested.map((collider) => {
                const matches = geometry.filter((v) => v.collider === collider);
                if (matches.length !== 1)
                    throw worldError('AIR_E_BOX3D_DISPOSED', 'query group', 'Expected current enabled owned collider.');
                const { geometry: g, pose } = matches[0];
                if (g.kind === 'hull' || g.kind === 'mesh') return unsupportedBox3D('committed Hull query proxy');
                const actual = committedPrimitiveQuery(g.kind, g.center, g.dimensions, pose);
                const { rotation, proxy } = actual;
                const ray = copyTranslationQuery(
                    queryVector(actual.origin),
                    queryVector(copied.translation),
                    copied.options,
                );
                // Validate every translated inflated bound before even the first child query.
                for (const p of proxy.points)
                    for (let a = 0; a < 3; ++a)
                        for (const sign of [-1, 1]) {
                            finiteFloat32(actual.origin[a] + p[a] + sign * proxy.radius, 'query child start bound');
                            finiteFloat32(
                                Math.fround(actual.origin[a] + ray.translation[a]) + p[a] + sign * proxy.radius,
                                'query child end bound',
                            );
                        }
                const child: Box3DCommittedQueryChild = Object.freeze({
                    collider,
                    kind: g.kind,
                    origin: queryVector(actual.center),
                    rotation: Object.freeze({ x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] }),
                    dimensions: actual.dimensions,
                    support: Object.freeze({
                        origin: queryVector(actual.origin),
                        points: Object.freeze(proxy.points.map(queryVector)),
                        radius: proxy.radius,
                    }),
                });
                return { child, ray, proxy };
            });
            const copiedBlockers = new Map<Collider, Box3DCommittedQueryChild | null>();
            const copyBlocker = (collider: Collider): Box3DCommittedQueryChild | null => {
                if (copiedBlockers.has(collider)) return copiedBlockers.get(collider)!;
                const block = geometry.find((g) => g.collider === collider);
                let result: Box3DCommittedQueryChild | null = null;
                if (block && block.geometry.kind !== 'hull' && block.geometry.kind !== 'mesh') {
                    const b = committedPrimitiveQuery(
                        block.geometry.kind,
                        block.geometry.center,
                        block.geometry.dimensions,
                        block.pose,
                    );
                    result = Object.freeze({
                        collider,
                        kind: block.geometry.kind,
                        origin: queryVector(b.center),
                        rotation: Object.freeze({
                            x: b.rotation[0],
                            y: b.rotation[1],
                            z: b.rotation[2],
                            w: b.rotation[3],
                        }),
                        dimensions: b.dimensions,
                        support: Object.freeze({
                            origin: queryVector(b.origin),
                            points: Object.freeze(b.proxy.points.map(queryVector)),
                            radius: b.proxy.radius,
                        }),
                    });
                }
                copiedBlockers.set(collider, result);
                return result;
            };
            const overlaps: {
                    queryCollider: Collider;
                    collider: Collider;
                    blockingGeometry: Box3DCommittedQueryChild | null;
                }[] = [],
                hits: (ReturnType<typeof resolveBox3DRayHits>[number] & {
                    queryCollider: Collider;
                    blockingGeometry: Box3DCommittedQueryChild | null;
                })[] = [];
            for (const { child, ray, proxy } of records) {
                const raw = this.#binding.overlapAllRaw(this.#token, ray.origin, proxy, ray.options);
                const seen = new Set<Collider>();
                for (const value of raw) {
                    const id = value?.shape;
                    if (!id || ![id.low, id.high].every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff))
                        throw worldError('AIR_E_BOX3D_ABI', 'overlap', 'Invalid full shape identity.');
                    const hit = roster.get(`${id.low}:${id.high}`);
                    if (!hit) throw worldError('AIR_E_BOX3D_ABI', 'overlap', 'Unknown current collider.');
                    if (!group.has(hit.collider) && !seen.has(hit.collider)) {
                        seen.add(hit.collider);
                        const blockingGeometry = copyBlocker(hit.collider);
                        overlaps.push(
                            Object.freeze({ queryCollider: child.collider, collider: hit.collider, blockingGeometry }),
                        );
                    }
                }
                if (!ray.empty) {
                    const rawHits = this.#binding.shapeAllRaw(
                        this.#token,
                        ray.origin,
                        ray.translation,
                        proxy,
                        ray.options,
                    );
                    for (const hit of resolveBox3DRayHits(rawHits, ray, (lo, hi) => roster.get(`${lo}:${hi}`)))
                        if (!group.has(hit.collider))
                            hits.push(
                                Object.freeze({
                                    ...hit,
                                    queryCollider: child.collider,
                                    blockingGeometry: copyBlocker(hit.collider),
                                }),
                            );
                }
            }
            hits.sort(
                (a, b) =>
                    a.distance - b.distance ||
                    a.logicalId - b.logicalId ||
                    requested.indexOf(a.queryCollider) - requested.indexOf(b.queryCollider),
            );
            overlaps.sort(
                (a, b) =>
                    requested.indexOf(a.queryCollider) - requested.indexOf(b.queryCollider) ||
                    this.#queryLogicalIds.get(a.collider)! - this.#queryLogicalIds.get(b.collider)!,
            );
            this.#assertQueryEpoch(stamp);
            return Object.freeze({
                ...stamp,
                translation: queryVector(copied.translation),
                children: Object.freeze(records.map((r) => r.child)),
                overlaps: Object.freeze(overlaps),
                hits: Object.freeze(hits),
                initialOverlap: overlaps.length !== 0,
                nearestDistance: hits[0]?.distance ?? null,
            });
        });
    }
    #sweepHits(copied: Box3DCopiedRay, proxy: Box3DQueryProxy) {
        this.assertCommittedRead('shape query copied admission');
        if (copied.empty) return Object.freeze([]);
        const roster = this.#queryRoster();
        const raw = this.#binding.shapeAllRaw(this.#token, copied.origin, copied.translation, proxy, copied.options);
        this.assertCommittedRead('shape query result');
        return resolveBox3DRayHits(raw, copied, (low, high) => roster.get(`${low}:${high}`));
    }
    #assignQuery(
        hits: ReturnType<typeof resolveBox3DRayHits>,
        pool: Parameters<IPhysicsWorld['raycast']>[2],
        results: PhysicsRayResult[],
    ): boolean {
        for (const hit of hits) {
            const out = pool.add();
            PhysicsRayResult.prototype._assign.call(out, hit.point, hit.distance, hit.collider, hit.normal);
            results.push(out);
        }
        return results.length !== 0;
    }
    #assignClosest(hits: ReturnType<typeof resolveBox3DRayHits>, out: PhysicsRayResult): boolean {
        const hit = hits[0];
        if (!hit) return false;
        PhysicsRayResult.prototype._assign.call(out, hit.point, hit.distance, hit.collider, hit.normal);
        return true;
    }
    /** One complete generic callback query feeds both public routes. */
    #raycastHits(
        worldRay: Parameters<IPhysicsWorld['raycastClosest']>[0],
        options: Parameters<IPhysicsWorld['raycastClosest']>[1],
    ) {
        this.assertCommittedRead('ray query');
        const copied = copyBox3DRay(worldRay, options);
        this.assertCommittedRead('ray query copied admission');
        if (copied.empty) return Object.freeze([]);
        const query = this.#binding.rayAllRaw;
        if (typeof query !== 'function') return unsupportedBox3D('generic callback ray query ABI');
        const roster = this.#queryRoster();
        const raw = query.call(this.#binding, this.#token, copied.origin, copied.translation, copied.options);
        this.assertCommittedRead('ray query result');
        return resolveBox3DRayHits(raw, copied, (low, high) => roster.get(`${low}:${high}`));
    }
    raycast(
        worldRay: Parameters<IPhysicsWorld['raycast']>[0],
        options: Parameters<IPhysicsWorld['raycast']>[1],
        pool: Parameters<IPhysicsWorld['raycast']>[2],
        results: Parameters<IPhysicsWorld['raycast']>[3],
    ): boolean {
        results.length = 0;
        const hits = this.#raycastHits(worldRay, options);
        for (const hit of hits) {
            const out = pool.add();
            PhysicsRayResult.prototype._assign.call(out, hit.point, hit.distance, hit.collider, hit.normal);
            results.push(out);
        }
        return results.length !== 0;
    }
    raycastClosest(
        worldRay: Parameters<IPhysicsWorld['raycastClosest']>[0],
        options: Parameters<IPhysicsWorld['raycastClosest']>[1],
        out: PhysicsRayResult,
    ): boolean {
        const hit = this.#raycastHits(worldRay, options)[0];
        if (!hit) return false; // Existing Cocos contract: callers must inspect this boolean, not stale out fields.
        PhysicsRayResult.prototype._assign.call(out, hit.point, hit.distance, hit.collider, hit.normal);
        return true;
    }
    sweepBox(...args: Parameters<IPhysicsWorld['sweepBox']>): boolean {
        const [ray, half, q, options, pool, results] = args;
        results.length = 0;
        this.assertCommittedRead('sweepBox');
        const copied = copyBox3DRay(ray, options),
            proxy = primitiveQueryProxy('box', [half.x, half.y, half.z], copyQueryRotation(q));
        return this.#assignQuery(this.#sweepHits(copied, proxy), pool, results);
    }
    sweepBoxClosest(...args: Parameters<IPhysicsWorld['sweepBoxClosest']>): boolean {
        const [ray, half, q, options, out] = args;
        this.assertCommittedRead('sweepBoxClosest');
        const copied = copyBox3DRay(ray, options),
            proxy = primitiveQueryProxy('box', [half.x, half.y, half.z], copyQueryRotation(q));
        return this.#assignClosest(this.#sweepHits(copied, proxy), out);
    }
    sweepSphere(...args: Parameters<IPhysicsWorld['sweepSphere']>): boolean {
        const [ray, radius, options, pool, results] = args;
        results.length = 0;
        this.assertCommittedRead('sweepSphere');
        const copied = copyBox3DRay(ray, options),
            proxy = primitiveQueryProxy('sphere', [radius], [0, 0, 0, 1]);
        return this.#assignQuery(this.#sweepHits(copied, proxy), pool, results);
    }
    sweepSphereClosest(...args: Parameters<IPhysicsWorld['sweepSphereClosest']>): boolean {
        const [ray, radius, options, out] = args;
        this.assertCommittedRead('sweepSphereClosest');
        const copied = copyBox3DRay(ray, options),
            proxy = primitiveQueryProxy('sphere', [radius], [0, 0, 0, 1]);
        return this.#assignClosest(this.#sweepHits(copied, proxy), out);
    }
    sweepCapsule(...args: Parameters<IPhysicsWorld['sweepCapsule']>): boolean {
        const [ray, radius, height, q, options, pool, results] = args;
        results.length = 0;
        this.assertCommittedRead('sweepCapsule');
        const copied = copyBox3DRay(ray, options),
            proxy = primitiveQueryProxy('capsule', [radius, capsuleQueryHalfHeight(height), 1], copyQueryRotation(q));
        return this.#assignQuery(this.#sweepHits(copied, proxy), pool, results);
    }
    sweepCapsuleClosest(...args: Parameters<IPhysicsWorld['sweepCapsuleClosest']>): boolean {
        const [ray, radius, height, q, options, out] = args;
        this.assertCommittedRead('sweepCapsuleClosest');
        const copied = copyBox3DRay(ray, options),
            proxy = primitiveQueryProxy('capsule', [radius, capsuleQueryHalfHeight(height), 1], copyQueryRotation(q));
        return this.#assignClosest(this.#sweepHits(copied, proxy), out);
    }
}
