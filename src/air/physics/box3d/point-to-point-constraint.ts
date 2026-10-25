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
import { PointToPointConstraint } from '../../../cocos/physics/framework/components/constraints/point-to-point-constraint';
import { RigidBody } from '../../../cocos/physics/framework/components/rigid-body';
import type { Constraint } from '../../../cocos/physics/framework/components/constraints/constraint';
import type { IPointToPointConstraint } from '../../../cocos/physics/spec/i-physics-constraint';
import { CCObjectFlags } from '../../../cocos/core/data/object';
import { registerConstraintStateOwner } from '../../../cocos/physics/framework/constraint-state-control';
import type { ConstraintField } from '../../../cocos/physics/framework/constraint-state-control';
import {
    registerComponentActivityObserver,
    installComponentActivityDelegateSource,
    tryDelegateComponentActivity,
} from '../../../cocos/scene-graph/component-activity-control';
import type { ComponentActivityLease } from '../../../cocos/scene-graph/component-activity-control';
import type { Box3DPhysicsWorld } from './world';
import type { Box3DPointToPointNativeLease } from './shared-body';
import type { Box3DPointToPointConfiguration, Box3DPointToPointGeometry } from './binding/facade.mjs';
import type { IVec3Like } from '../../../cocos/core';
import { Vec3 } from '../../../cocos/core';
import { finiteFloat32, worldError } from './world-binding';

type Vector = Readonly<{ x: number; y: number; z: number }>;
type Candidate = Readonly<{
    attached: RigidBody;
    connected: RigidBody | null;
    collideConnected: boolean;
    pivotA: Vector;
    pivotB: Vector;
}>;
function vector(value: unknown, name: string): Vector {
    if (!value || typeof value !== 'object') throw worldError('AIR_E_BOX3D_CONFIG', name, 'Expected a finite vector.');
    const source = value as IVec3Like;
    const x = source.x,
        y = source.y,
        z = source.z; // Read caller components once.
    finiteFloat32(x, name);
    finiteFloat32(y, name);
    finiteFloat32(z, name);
    return Object.freeze({ x, y, z });
}
const dead = CCObjectFlags.Destroyed | CCObjectFlags.ToDestroy | CCObjectFlags.Destroying;
/** Native spherical joint, three positional constraints with three free rotations.
 * Requests are admitted before cache publication and committed only at a world safe point.
 * Explicit pivot setters recapture a null-B world anchor, including same-value writes. */
export class Box3DPointToPointConstraint implements IPointToPointConstraint {
    readonly #world: () => Box3DPhysicsWorld;
    readonly #activityIdentity = Object.freeze({});
    #component: PointToPointConstraint | null = null;
    #candidate!: Candidate;
    #applied: Candidate | null = null;
    #native: Box3DPointToPointNativeLease | null = null;
    #enabled = false;
    #orphaned = false;
    #closed = false;
    #dirty = false;
    #stateLease: { dispose(): void } | null = null;
    #activityLease: ComponentActivityLease | null = null;
    #geometryKey: string | null = null;
    #captureVersion = 0;
    #appliedCaptureVersion = -1;
    constructor(world: () => Box3DPhysicsWorld) {
        installComponentActivityDelegateSource(this, this.#activityIdentity);
        this.#world = world;
    }
    initialize(value: Constraint): void {
        const world = this.#world();
        world.assertComponentConfiguration('PointToPoint initialize');
        if (!(value instanceof PointToPointConstraint) || this.#component)
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'PointToPoint initialize',
                'Expected one real PointToPointConstraint.',
            );
        const attached = value.attachedBody;
        if (!attached)
            throw worldError('AIR_E_BOX3D_CONFIG', 'PointToPoint initialize', 'Attached RigidBody is missing.');
        const candidate = this.#copy({
            attached,
            connected: value.connectedBody,
            collideConnected: value.enableCollision,
            pivotA: vector(value.pivotA, 'PointToPoint pivotA'),
            pivotB: vector(value.pivotB, 'PointToPoint pivotB'),
        });
        this.#component = value;
        this.#candidate = candidate;
        try {
            this.#stateLease = registerConstraintStateOwner(value, {
                change: (field, v, commit) => this.#change(field, v, commit),
                assertDestroy: () => {
                    if (!this.#closed && !world.jointCleanupOnly) this.#admit('PointToPoint destroy request');
                },
                read: () => this.impl,
            });
            this.#activityLease = registerComponentActivityObserver(value, this, {
                delegateIdentity: this,
                admit: () => this.#admit('PointToPoint.enabled'),
                open: () => {
                    const scope = world.beginJointActivity();
                    let next = false,
                        effective = false,
                        delegated = false;
                    let prepared: Candidate | null = null;
                    let before: { enabled: boolean; active: boolean; scheduled: boolean } | null = null;
                    return {
                        prepare: (actual, enabled) => {
                            scope.assertCurrent();
                            before = actual;
                            next = enabled;
                            effective = actual.active && actual.enabled !== next && actual.scheduled !== next;
                            if (effective && enabled)
                                prepared = this.#copy({ ...this.#candidate, attached: this.#component!.attachedBody! });
                        },
                        apply: () => {
                            scope.assertCurrent();
                        }, // Native writes remain deferred.
                        delegate: () => {
                            scope.assertCurrent();
                            if (!effective || delegated)
                                throw worldError(
                                    'AIR_E_BOX3D_REENTRANT',
                                    'PointToPoint.enabled',
                                    'Unexpected lifecycle delegate.',
                                );
                            delegated = true;
                        },
                        complete: (actual) => {
                            scope.assertCurrent();
                            if (
                                !before ||
                                actual.enabled !== next ||
                                actual.active !== before.active ||
                                actual.scheduled !== (effective ? next : before.scheduled) ||
                                (effective && !delegated)
                            )
                                throw worldError(
                                    'AIR_E_BOX3D_CONFIG',
                                    'PointToPoint.enabled',
                                    'Original lifecycle/scheduler did not complete.',
                                );
                            if (effective) this.#publishActivity(next, prepared);
                        },
                        fail: (report) => {
                            // A proven validation rejection before cache/callback publication is not a world fault.
                            if (
                                report.cacheWriteEntered ||
                                report.callbackEntered ||
                                report.schedulerEntered ||
                                delegated ||
                                report.schedulerUnchanged === false ||
                                report.actualReadStatus === 'threw' ||
                                report.actualReadStatus === 'invalid' ||
                                (before &&
                                    report.actual &&
                                    (before.enabled !== report.actual.enabled ||
                                        before.active !== report.actual.active ||
                                        before.scheduled !== report.actual.scheduled))
                            )
                                world.failJointOperation(report.error);
                        },
                        dispose: () => scope.dispose(),
                    };
                },
            });
            world.registerPointToPointConstraint(this);
        } catch (error) {
            this.#activityLease?.dispose();
            this.#stateLease?.dispose();
            this.#component = null;
            throw error;
        }
    }
    #admit(operation: string): void {
        if (this.#closed) throw worldError('AIR_E_BOX3D_DISPOSED', operation, 'Constraint has closed.');
        this.#world().assertJointRequest(operation);
    }
    #copy(input: Candidate): Candidate {
        if (
            !(input.attached instanceof RigidBody) ||
            (input.connected !== null && !(input.connected instanceof RigidBody)) ||
            input.attached === input.connected ||
            input.attached._objFlags & dead ||
            (input.connected && input.connected._objFlags & dead)
        )
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'PointToPoint endpoints',
                'Expected distinct live RigidBody endpoints.',
            );
        if (typeof input.collideConnected !== 'boolean')
            throw worldError('AIR_E_BOX3D_CONFIG', 'PointToPoint collision', 'Expected exact boolean.');
        this.#world().validateFixedEndpoints(input.attached, input.connected);
        this.#geometry(input); // Scaled float32 admission also precedes public cache writes.
        return Object.freeze({ ...input });
    }
    #change(field: ConstraintField, value: unknown, commitCache: (admitted?: unknown) => void): void {
        this.#admit('PointToPoint.' + field);
        const scope = this.#world().beginJointActivity();
        try {
            const key =
                field === 'connectedBody' ? 'connected' : field === 'enableCollision' ? 'collideConnected' : field;
            if (!['connected', 'collideConnected', 'pivotA', 'pivotB'].includes(key))
                throw worldError('AIR_E_BOX3D_CONFIG', 'PointToPoint field', 'Unknown PointToPoint field.');
            const isVector = key === 'pivotA' || key === 'pivotB';
            const admitted = isVector ? vector(value, 'PointToPoint ' + key) : value;
            const next = this.#copy({ ...this.#candidate, [key]: admitted } as Candidate);
            scope.assertCurrent();
            commitCache(admitted);
            this.#candidate = next;
            if (key === 'connected') this.#orphaned = false; // An explicit valid endpoint request recovers an orphan.
            if (isVector && next.connected === null) this.#captureVersion++;
            this.#dirty = true;
        } finally {
            scope.dispose();
        }
    }
    #configuration(): Box3DPointToPointConfiguration {
        return Object.freeze({ collideConnected: this.#candidate.collideConnected });
    }
    #geometry(c: Candidate = this.#candidate): Box3DPointToPointGeometry {
        const scaled = (v: Vector, body: RigidBody) => {
            const xyz = this.#world().initialJointScale(body);
            if (xyz.some((n) => !Number.isFinite(n) || n <= 0))
                throw worldError('AIR_E_BOX3D_CONFIG', 'PointToPoint scale', 'Expected admitted positive world scale.');
            return Object.freeze([
                finiteFloat32(v.x * xyz[0], 'PointToPoint pivot'),
                finiteFloat32(v.y * xyz[1], 'PointToPoint pivot'),
                finiteFloat32(v.z * xyz[2], 'PointToPoint pivot'),
            ]);
        };
        return Object.freeze({
            pivotA: scaled(c.pivotA, c.attached),
            pivotB: c.connected ? scaled(c.pivotB, c.connected) : Object.freeze([0, 0, 0]),
            autoPivotB: !c.connected,
        });
    }
    /** Pure preflight, outside the world's mutating commit/fault boundary. */
    preflight(): void {
        if (
            this.#closed ||
            !this.#enabled ||
            this.#orphaned ||
            !this.#component!.node.activeInHierarchy ||
            this.#component!._objFlags & dead
        )
            return;
        if (
            this.#candidate.attached._objFlags & dead ||
            (this.#candidate.connected && this.#candidate.connected._objFlags & dead)
        )
            return;
        this.#copy(this.#candidate);
        this.#geometry();
    }
    #publishActivity(enabled: boolean, prepared: Candidate | null): void {
        if (enabled && !this.#enabled) {
            if (!prepared) throw worldError('AIR_E_BOX3D_CONFIG', 'PointToPoint enable', 'Missing prepared endpoints.');
            this.#candidate = prepared;
            this.#orphaned = false;
        }
        this.#enabled = enabled;
        this.#dirty = true;
    }
    #activity(enabled: boolean): void {
        this.#admit('PointToPoint activity');
        const prepared =
            enabled && !this.#enabled
                ? this.#copy({ ...this.#candidate, attached: this.#component!.attachedBody! })
                : null;
        this.#publishActivity(enabled, prepared);
    }
    onEnable(): void {
        if (this.#component && tryDelegateComponentActivity(this.#component, this, this.#activityIdentity, true))
            return;
        this.#activity(true);
    }
    onDisable(): void {
        if (this.#component && tryDelegateComponentActivity(this.#component, this, this.#activityIdentity, false))
            return;
        if (this.#closed) return;
        if (this.#world().jointCleanupOnly) {
            this.#enabled = false;
            return;
        }
        this.#activity(false);
    }
    onDestroy(): void {
        if (this.#closed) return;
        this.#world().releasePointToPointConstraint(this);
        // Weak-key admission tombstones stay with the closed component: reject before cache writes.
        // They hold no live native lease and cannot resurrect the destroyed joint/world.
        this.#closed = true;
    }
    setConnectedBody(value: RigidBody | null): void {
        this.#admit('PointToPoint adapter connectedBody');
        this.#component!.connectedBody = value;
    }
    setEnableCollision(value: boolean): void {
        this.#admit('PointToPoint adapter enableCollision');
        this.#component!.enableCollision = value;
    }
    setPivotA(value: IVec3Like): void {
        this.#component!.pivotA = value as Vec3;
    }
    setPivotB(value: IVec3Like): void {
        this.#component!.pivotB = value as Vec3;
    }
    get component(): PointToPointConstraint {
        return this.#component!;
    }
    get impl(): Readonly<Record<string, unknown>> {
        this.#world().assertJointRead('PointToPoint diagnostics');
        const native = this.#native ? this.#native.read() : null;
        return Object.freeze({
            backend: 'box3d',
            kind: 'point-to-point',
            state: this.#closed
                ? 'closed'
                : this.#orphaned
                  ? 'endpoint-removed'
                  : this.#native
                    ? 'connected'
                    : this.#enabled
                      ? 'pending'
                      : 'disabled',
            requestedEnabled: this.#enabled,
            pending: this.#dirty,
            requested: Object.freeze({
                pivotA: this.#candidate.pivotA,
                pivotB: this.#candidate.pivotB,
            }),
            captureVersion: this.#captureVersion,
            appliedCaptureVersion: this.#appliedCaptureVersion,
            native,
        });
    }
    /** Called only by the owning world while idle, before the next native step. */
    commit(): void {
        if (this.#closed) return;
        const component = this.#component!;
        // Component.destroy marks ToDestroy before its eventual onDestroy. Retire at
        // this safe boundary, before another same-frame physics substep can use it.
        for (const body of new Set([
            this.#candidate.attached,
            this.#candidate.connected,
            this.#applied?.attached,
            this.#applied?.connected,
        ]))
            if (body && body._objFlags & dead) this.endpointRemoving(body);
        if (!this.#enabled || !component.node.activeInHierarchy || component._objFlags & dead || this.#orphaned) {
            this.detach();
            this.#dirty = false;
            return;
        }
        this.#copy(this.#candidate);
        const geometry = this.#geometry(),
            geometryKey = JSON.stringify(geometry);
        if (
            this.#native &&
            this.#applied &&
            (this.#applied.attached !== this.#candidate.attached ||
                this.#applied.connected !== this.#candidate.connected ||
                this.#geometryKey !== geometryKey ||
                this.#appliedCaptureVersion !== this.#captureVersion)
        )
            this.detach();
        if (!this.#native)
            this.#native = this.#world().createPointToPointLease(
                this.#candidate.attached,
                this.#candidate.connected,
                geometry,
                this.#configuration(),
            );
        else if (this.#dirty) this.#native.configure(this.#configuration());
        this.#geometryKey = geometryKey;
        this.#appliedCaptureVersion = this.#captureVersion;
        this.#applied = this.#candidate;
        this.#dirty = false;
    }
    detach(): void {
        if (this.#native) {
            this.#native.destroy();
            this.#native = null;
            this.#applied = null;
            this.#geometryKey = null;
        }
    }
    endpointRemoving(body: RigidBody): void {
        const requested = this.#candidate.attached === body || this.#candidate.connected === body;
        const committed = this.#applied?.attached === body || this.#applied?.connected === body;
        if (!requested && !committed) return;
        this.detach(); // The old committed endpoint must retire before its body changes type/dies.
        this.#orphaned = requested;
        this.#dirty = !requested; // A distinct, still-live pending reconnection remains admitted.
    }
    closeWithWorld(): void {
        this.#native?.closeWithWorld();
        this.#native = null;
        this.#applied = null;
        // Weak-key admission tombstones stay with the closed component: reject before cache writes.
        // They hold no live native lease and cannot resurrect the destroyed joint/world.
        this.#closed = true;
    }
}
