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
import type { IPhysicsWorld } from '../../../cocos/physics/spec/i-physics-world';
import type { PhysicsMaterial } from '../../../cocos/physics/framework/assets/physics-material';
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
    worldError,
} from './world-binding';
import type { Box3DNativeStepDiagnostics, Box3DSurfaceMaterial, Box3DWorldBinding } from './world-binding';
import { unsupportedBox3D } from './unsupported';

type WorldState = 'ready' | 'stepping' | 'faulted' | 'destroying' | 'destroyed' | 'destroy-failed';
/** Internal adapter only. Not registered/exported by the optional feature yet. */
export class Box3DPhysicsWorld implements IPhysicsWorld {
    readonly #binding: Box3DWorldBinding;
    readonly #token: Box3DWorld;
    private readonly description: Readonly<{ backend: 'box3d'; generation: number; worldId: number }>;
    private state: WorldState = 'ready';
    private failure: unknown;
    private readonly options: AirNormalizedBox3DOptions;
    private gravity: readonly number[] = Object.freeze([0, -10, 0]);
    private sleeping = true;
    private drawFlags = 0;
    private jointScale = Math.fround(0.3);
    private debug: Box3DDebugSnapshot | null = null;
    private material: Readonly<Box3DSurfaceMaterial> | null = null;
    private readonly materialShapes = new Map<Box3DId, boolean>();
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
    private lastStepOutcome: 'not-attempted' | 'completed' | 'not-completed' | 'unknown' = 'not-attempted';

    constructor(lease: Box3DSTLease, options: AirNormalizedBox3DOptions, preparation: AirPhysicsPreparation) {
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
            preparation.own('box3d', 'world', () => this.destroy(), { dependsOn: ['module'] });
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
        } catch (error) {
            this.fault(error);
            throw error;
        }
    }
    private assertReady(operation: string): void {
        if (this.state === 'stepping' || this.state === 'destroying')
            throw worldError('AIR_E_BOX3D_REENTRANT', operation, 'World operation is already in progress.');
        if (this.state !== 'ready')
            throw worldError(
                this.state === 'faulted' ? 'AIR_E_BOX3D_WORLD_FAULTED' : 'AIR_E_BOX3D_DISPOSED',
                operation,
                'World is faulted or closed; no native operation was attempted.',
            );
    }
    private fault(error: unknown): void {
        this.state = 'faulted';
        this.failure = error;
        this.pendingSnapshot = null;
    }
    private collectDebug(flags: number, scale: number): Box3DDebugSnapshot {
        return copyDebugSnapshot(this.#binding.debugSnapshot(this.#token, flags, scale), flags, scale);
    }
    private invalidatePending(): void {
        this.pendingSnapshot = null;
        this.nativeObservationCurrent = false;
    }
    get impl(): Readonly<{ backend: 'box3d'; generation: number; worldId: number }> {
        this.assertReady('impl');
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
    setDefaultMaterial(value: PhysicsMaterial): void {
        this.assertReady('setDefaultMaterial');
        const next = copySurfaceMaterial(value);
        if (value.rollingFriction !== 0 || value.spinningFriction !== 0)
            unsupportedBox3D('nonzero rollingFriction/spinningFriction');
        // Validate every inherited token and capture rollback values before the first write.
        const changes = [...this.materialShapes]
            .filter(([, inherited]) => inherited)
            .map(([shape]) => ({
                shape,
                previous: copySurfaceMaterial(this.#binding.getShapeMaterial(this.#token, shape)),
            }));
        let attempted = 0;
        try {
            for (const item of changes) {
                ++attempted;
                this.invalidatePending();
                this.#binding.setShapeMaterial(this.#token, item.shape, next);
                const actual = copySurfaceMaterial(this.#binding.getShapeMaterial(this.#token, item.shape));
                if (actual.friction !== next.friction || actual.restitution !== next.restitution)
                    throw worldError('AIR_E_BOX3D_ABI', 'setDefaultMaterial', 'Shape material readback mismatch.');
            }
        } catch (error) {
            try {
                for (const item of changes.slice(0, attempted).reverse()) {
                    this.invalidatePending();
                    this.#binding.setShapeMaterial(this.#token, item.shape, item.previous);
                    const actual = copySurfaceMaterial(this.#binding.getShapeMaterial(this.#token, item.shape));
                    if (actual.friction !== item.previous.friction || actual.restitution !== item.previous.restitution)
                        throw worldError('AIR_E_BOX3D_ABI', 'material rollback', 'Readback mismatch.');
                }
            } catch (rollbackError) {
                this.fault(rollbackError);
                throw worldError(
                    'AIR_E_BOX3D_WORLD_FAULTED',
                    'material rollback',
                    `Restoration failed: ${String(rollbackError)}`,
                );
            }
            this.invalidatePending();
            throw error;
        }
        this.material = next;
        this.invalidatePending();
    }
    /** Internal shape-owner hook for later T10. Does not create or claim ownership of native shapes. */
    registerMaterialShape(shape: Box3DId, inheritsDefault: boolean): void {
        this.assertReady('registerMaterialShape');
        if (typeof inheritsDefault !== 'boolean' || this.materialShapes.has(shape))
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
        this.materialShapes.set(shape, inheritsDefault);
        this.invalidatePending();
    }
    unregisterMaterialShape(shape: Box3DId): void {
        this.assertReady('unregisterMaterialShape');
        if (!this.materialShapes.delete(shape))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'unregisterMaterialShape', 'Unknown shape registration.');
    }
    get debugDrawFlags(): number {
        this.assertReady('debugDrawFlags');
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
        this.assertReady('debugDrawConstraintSize');
        return this.jointScale;
    }
    set debugDrawConstraintSize(value: number) {
        this.assertReady('debugDrawConstraintSize');
        const next = validateJointScale(value);
        const snapshot = this.collectDebug(this.drawFlags, next);
        this.jointScale = next;
        this.debug = snapshot;
    }
    syncSceneToPhysics(): void {
        this.assertReady('syncSceneToPhysics');
        ++this.sceneSyncCalls;
    }
    syncAfterEvents(): void {
        this.assertReady('syncAfterEvents');
        ++this.afterEventsCalls;
    }
    emitEvents(): void {
        this.assertReady('emitEvents');
        if (this.pendingSnapshot) {
            this.emittedStep = this.pendingSnapshot.stepIndex;
            this.pendingSnapshot = null;
        }
        // T09 admits no collider event listeners; raw snapshots are diagnostics, not Cocos events.
    }
    step(dt: number, timeSinceLastCalled?: number, maxSubSteps?: number): void {
        this.assertReady('step');
        if (timeSinceLastCalled !== undefined || maxSubSteps !== undefined)
            unsupportedBox3D('Cannon-style manual step accumulator arguments');
        const delta = finiteFloat32(dt, 'step.dt');
        if (delta <= 0) throw worldError('AIR_E_BOX3D_CONFIG', 'step', 'dt must be positive float32.');
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
            this.#binding.step(this.#token, delta, this.options.solverSubSteps);
            this.nativeStep = copyStepDiagnostics(this.#binding.stepDiagnostics(this.#token));
            if (
                this.nativeStep.nativeStepIndex !== before + 1 ||
                !this.nativeStep.nativeCompleted ||
                !this.nativeStep.snapshotAvailable
            )
                throw worldError('AIR_E_BOX3D_ABI', 'step', 'Expected exactly one completed native step and snapshot.');
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
    }
    getNativeCounts() {
        this.assertReady('getNativeCounts');
        const result = this.#binding.worldCounts(this.#token);
        if (!result || result.counts.length !== 4 || typeof result.liveBytes !== 'bigint' || result.liveBytes < 0)
            throw worldError('AIR_E_BOX3D_ABI', 'getNativeCounts', 'Invalid copied world counts.');
        const [bodies, shapes, contacts, joints] = Array.from(result.counts);
        if ([bodies, shapes, contacts, joints].some((v) => !Number.isInteger(v) || v < 0))
            throw worldError('AIR_E_BOX3D_ABI', 'getNativeCounts', 'Invalid object count.');
        return Object.freeze({ bodies, shapes, contacts, joints, liveBytes: result.liveBytes });
    }
    /** Copied diagnostics remain available after fault/close; no native call or pointer escapes. */
    diagnostics() {
        return Object.freeze({
            state: this.state,
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
            materialShapeCount: this.materialShapes.size,
            sceneBindingCount: 0,
            sceneSyncCalls: this.sceneSyncCalls,
            afterEventsCalls: this.afterEventsCalls,
            emittedStep: this.emittedStep,
            componentEventsSupported: false,
            debugPresented: false,
            error: this.failure === undefined ? null : String(this.failure),
        });
    }
    getStepSnapshot(): Box3DStepSnapshot | null {
        this.assertReady('getStepSnapshot');
        return this.snapshot;
    }
    getDebugSnapshot(): Box3DDebugSnapshot | null {
        this.assertReady('getDebugSnapshot');
        return this.debug;
    }
    destroy(): void {
        if (this.state === 'destroyed') return;
        if (this.state === 'destroy-failed') throw this.failure;
        if (this.state === 'stepping' || this.state === 'destroying')
            throw worldError('AIR_E_BOX3D_REENTRANT', 'destroy', 'Cannot destroy during native operation.');
        this.state = 'destroying';
        this.nativeObservationCurrent = false;
        try {
            this.#binding.destroyWorld(this.#token);
            this.materialShapes.clear();
            this.pendingSnapshot = null;
            this.snapshot = null;
            this.debug = null;
            this.state = 'destroyed';
        } catch (error) {
            this.state = 'destroy-failed';
            this.failure = error;
            throw error;
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
