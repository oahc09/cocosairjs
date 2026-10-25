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
import { HingeConstraint } from '../../../cocos/physics/framework/components/constraints/hinge-constraint';
import { RigidBody } from '../../../cocos/physics/framework/components/rigid-body';
import type { Constraint } from '../../../cocos/physics/framework/components/constraints/constraint';
import type { IHingeConstraint } from '../../../cocos/physics/spec/i-physics-constraint';
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
import type { Box3DHingeNativeLease } from './shared-body';
import type { Box3DHingeConfiguration, Box3DHingeGeometry } from './binding/facade.mjs';
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
    axis: Vector;
    limitEnabled: boolean;
    lowerLimit: number;
    upperLimit: number;
    motorEnabled: boolean;
    motorVelocity: number;
    motorForceLimit: number;
}>;
const DEG = Math.PI / 180;
const LIMIT = 178.2;
const NATIVE_LIMIT = Math.fround(Math.fround(0.99) * Math.fround(Math.PI));
const nonzero = (v: Vector) => Math.hypot(v.x, v.y, v.z) > 0;
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
function finite(value: number, name: string): number {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw worldError('AIR_E_BOX3D_CONFIG', name, 'Expected finite number.');
    return value;
}
const dead = CCObjectFlags.Destroyed | CCObjectFlags.ToDestroy | CCObjectFlags.Destroying;
/** Hinge only; limits and motor use the explicitly documented A-relative-B coordinate. Native writes occur at the world safe commit, never in a setter/callback.
 * Component caches describe the admitted requested state; diagnostics distinguish it
 * from a committed native revolute joint. Native failures are faults, not fictional rollbacks. */
export class Box3DHingeConstraint implements IHingeConstraint {
    readonly #world: () => Box3DPhysicsWorld;
    readonly #activityIdentity = Object.freeze({});
    #component: HingeConstraint | null = null;
    #candidate!: Candidate;
    #applied: Candidate | null = null;
    #native: Box3DHingeNativeLease | null = null;
    #enabled = false;
    #orphaned = false;
    #closed = false;
    #dirty = false;
    #stateLease: { dispose(): void } | null = null;
    #activityLease: ComponentActivityLease | null = null;
    #geometryKey: string | null = null;
    constructor(world: () => Box3DPhysicsWorld) {
        installComponentActivityDelegateSource(this, this.#activityIdentity);
        this.#world = world;
    }
    initialize(value: Constraint): void {
        const world = this.#world();
        world.assertComponentConfiguration('Hinge initialize');
        if (!(value instanceof HingeConstraint) || this.#component)
            throw worldError('AIR_E_BOX3D_CONFIG', 'Hinge initialize', 'Expected one real HingeConstraint.');
        const attached = value.attachedBody;
        if (!attached) throw worldError('AIR_E_BOX3D_CONFIG', 'Hinge initialize', 'Attached RigidBody is missing.');
        const candidate = this.#copy({
            attached,
            connected: value.connectedBody,
            collideConnected: value.enableCollision,
            pivotA: vector(value.pivotA, 'Hinge pivotA'),
            pivotB: vector(value.pivotB, 'Hinge pivotB'),
            axis: vector(value.axis, 'Hinge axis'),
            limitEnabled: value.limitEnabled,
            lowerLimit: value.lowerLimit,
            upperLimit: value.upperLimit,
            motorEnabled: value.motorEnabled,
            motorVelocity: value.motorVelocity,
            motorForceLimit: value.motorForceLimit,
        });
        this.#component = value;
        this.#candidate = candidate;
        try {
            this.#stateLease = registerConstraintStateOwner(value, {
                change: (field, v, commit) => this.#change(field, v, commit),
                assertDestroy: () => {
                    if (!this.#closed && !world.jointCleanupOnly) this.#admit('Hinge destroy request');
                },
                read: () => this.impl,
            });
            this.#activityLease = registerComponentActivityObserver(value, this, {
                delegateIdentity: this,
                admit: () => this.#admit('Hinge.enabled'),
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
                                prepared = this.#copy(
                                    { ...this.#candidate, attached: this.#component!.attachedBody! },
                                    true,
                                );
                        },
                        apply: () => {
                            scope.assertCurrent();
                        }, // Native writes remain deferred.
                        delegate: () => {
                            scope.assertCurrent();
                            if (!effective || delegated)
                                throw worldError(
                                    'AIR_E_BOX3D_REENTRANT',
                                    'Hinge.enabled',
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
                                    'Hinge.enabled',
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
            world.registerHingeConstraint(this);
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
    #copy(input: Candidate, requireAxis = false): Candidate {
        if (
            !(input.attached instanceof RigidBody) ||
            (input.connected !== null && !(input.connected instanceof RigidBody)) ||
            input.attached === input.connected ||
            input.attached._objFlags & dead ||
            (input.connected && input.connected._objFlags & dead)
        )
            throw worldError('AIR_E_BOX3D_CONFIG', 'Hinge endpoints', 'Expected distinct live RigidBody endpoints.');
        for (const key of ['collideConnected', 'limitEnabled', 'motorEnabled'] as const)
            if (typeof input[key] !== 'boolean')
                throw worldError('AIR_E_BOX3D_CONFIG', 'Hinge ' + key, 'Expected exact boolean.');
        for (const key of ['lowerLimit', 'upperLimit', 'motorVelocity', 'motorForceLimit'] as const)
            finite(input[key], 'Hinge ' + key);
        finiteFloat32(-input.motorVelocity * DEG, 'Hinge radians/second');
        finiteFloat32(input.motorForceLimit, 'Hinge torque');
        if (input.motorForceLimit < 0)
            throw worldError('AIR_E_BOX3D_CONFIG', 'Hinge torque', 'Expected nonnegative N.m.');
        if (
            input.limitEnabled &&
            (input.lowerLimit > input.upperLimit ||
                input.lowerLimit < -LIMIT ||
                input.upperLimit > LIMIT ||
                Math.abs(Math.fround(input.lowerLimit * DEG)) > NATIVE_LIMIT ||
                Math.abs(Math.fround(input.upperLimit * DEG)) > NATIVE_LIMIT)
        )
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'Hinge limits',
                'Enabled limits must be ordered within [-178.2,178.2] degrees.',
            );
        if (requireAxis && !nonzero(input.axis))
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'Hinge axis',
                'Configure a nonzero axis before enabling or the first safe commit.',
            );
        this.#world().validateFixedEndpoints(input.attached, input.connected);
        return Object.freeze({ ...input });
    }
    #change(field: ConstraintField, value: unknown, commitCache: (admitted?: unknown) => void): void {
        this.#admit('Hinge.' + field);
        const scope = this.#world().beginJointActivity();
        try {
            const key =
                field === 'connectedBody' ? 'connected' : field === 'enableCollision' ? 'collideConnected' : field;
            if (
                ![
                    'connected',
                    'collideConnected',
                    'pivotA',
                    'pivotB',
                    'axis',
                    'limitEnabled',
                    'lowerLimit',
                    'upperLimit',
                    'motorEnabled',
                    'motorVelocity',
                    'motorForceLimit',
                ].includes(key)
            )
                throw worldError('AIR_E_BOX3D_CONFIG', 'Hinge field', 'Unknown Hinge field.');
            const isVector = key === 'pivotA' || key === 'pivotB' || key === 'axis';
            const admitted = isVector ? vector(value, 'Hinge ' + key) : value;
            if (key === 'axis' && !nonzero(admitted as Vector))
                throw worldError('AIR_E_BOX3D_CONFIG', 'Hinge axis', 'Explicit zero axis is rejected, not repaired.');
            const next = this.#copy({ ...this.#candidate, [key]: admitted } as Candidate);
            scope.assertCurrent();
            commitCache(admitted);
            this.#candidate = next;
            this.#dirty = true;
        } finally {
            scope.dispose();
        }
    }
    #configuration(): Box3DHingeConfiguration {
        const c = this.#candidate;
        return Object.freeze({
            collideConnected: c.collideConnected,
            limitEnabled: c.limitEnabled,
            lowerAngleRadians: c.limitEnabled ? Math.fround(-c.upperLimit * DEG) : 0,
            upperAngleRadians: c.limitEnabled ? Math.fround(-c.lowerLimit * DEG) : 0,
            motorEnabled: c.motorEnabled,
            motorSpeedRadians: Math.fround(-c.motorVelocity * DEG),
            maxMotorTorque: Math.fround(c.motorForceLimit),
        });
    }
    #geometry(): Box3DHingeGeometry {
        const c = this.#candidate;
        const scaled = (v: Vector, body: RigidBody) => {
            const xyz = this.#world().initialJointScale(body);
            if (xyz.some((n) => !Number.isFinite(n) || n <= 0))
                throw worldError('AIR_E_BOX3D_CONFIG', 'Hinge scale', 'Expected admitted positive world scale.');
            return Object.freeze([
                finiteFloat32(v.x * xyz[0], 'Hinge pivot'),
                finiteFloat32(v.y * xyz[1], 'Hinge pivot'),
                finiteFloat32(v.z * xyz[2], 'Hinge pivot'),
            ]);
        };
        const n = Math.hypot(c.axis.x, c.axis.y, c.axis.z);
        if (!(n > 0))
            throw worldError('AIR_E_BOX3D_CONFIG', 'Hinge axis', 'Pending zero axis has not been configured.');
        return Object.freeze({
            pivotA: scaled(c.pivotA, c.attached),
            pivotB: c.connected ? scaled(c.pivotB, c.connected) : Object.freeze([0, 0, 0]),
            axisA: Object.freeze([Math.fround(c.axis.x / n), Math.fround(c.axis.y / n), Math.fround(c.axis.z / n)]),
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
        this.#copy(this.#candidate, true);
        this.#geometry();
    }
    #publishActivity(enabled: boolean, prepared: Candidate | null): void {
        if (enabled && !this.#enabled) {
            if (!prepared) throw worldError('AIR_E_BOX3D_CONFIG', 'Hinge enable', 'Missing prepared endpoints.');
            this.#candidate = prepared;
            this.#orphaned = false;
        }
        this.#enabled = enabled;
        this.#dirty = true;
    }
    #activity(enabled: boolean): void {
        this.#admit('Hinge activity');
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
        this.#world().releaseHingeConstraint(this);
        // Weak-key admission tombstones stay with the closed component: reject before cache writes.
        // They hold no live native lease and cannot resurrect the destroyed joint/world.
        this.#closed = true;
    }
    setConnectedBody(value: RigidBody | null): void {
        this.#admit('Hinge adapter connectedBody');
        this.#component!.connectedBody = value;
    }
    setEnableCollision(value: boolean): void {
        this.#admit('Hinge adapter enableCollision');
        this.#component!.enableCollision = value;
    }
    setPivotA(value: IVec3Like): void {
        this.#component!.pivotA = value as Vec3;
    }
    setPivotB(value: IVec3Like): void {
        this.#component!.pivotB = value as Vec3;
    }
    setAxis(value: IVec3Like): void {
        this.#component!.axis = value as Vec3;
    }
    setLimitEnabled(value: boolean): void {
        this.#component!.limitEnabled = value;
    }
    setLowerLimit(value: number): void {
        this.#component!.lowerLimit = value;
    }
    setUpperLimit(value: number): void {
        this.#component!.upperLimit = value;
    }
    setMotorEnabled(value: boolean): void {
        this.#component!.motorEnabled = value;
    }
    setMotorVelocity(value: number): void {
        this.#component!.motorVelocity = value;
    }
    setMotorForceLimit(value: number): void {
        this.#component!.motorForceLimit = value;
    }
    get component(): HingeConstraint {
        return this.#component!;
    }
    get impl(): Readonly<Record<string, unknown>> {
        this.#world().assertJointRead('Hinge diagnostics');
        const native = this.#native ? this.#native.read() : null;
        return Object.freeze({
            backend: 'box3d',
            kind: 'hinge',
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
            axisConfigured: nonzero(this.#candidate.axis),
            requested: Object.freeze({
                axis: this.#candidate.axis,
                pivotA: this.#candidate.pivotA,
                pivotB: this.#candidate.pivotB,
                lowerLimit: this.#candidate.lowerLimit,
                upperLimit: this.#candidate.upperLimit,
                motorVelocity: this.#candidate.motorVelocity,
                motorForceLimit: this.#candidate.motorForceLimit,
            }),
            angleDegrees: native ? -native.angleRadians / DEG : null,
            motorTorque: native ? -native.motorTorque : null,
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
        this.#copy(this.#candidate, true);
        const geometry = this.#geometry(),
            geometryKey = JSON.stringify(geometry);
        if (
            this.#native &&
            this.#applied &&
            (this.#applied.attached !== this.#candidate.attached ||
                this.#applied.connected !== this.#candidate.connected ||
                this.#geometryKey !== geometryKey)
        )
            this.detach();
        if (!this.#native)
            this.#native = this.#world().createHingeLease(
                this.#candidate.attached,
                this.#candidate.connected,
                geometry,
                this.#configuration(),
            );
        else if (this.#dirty) this.#native.configure(this.#configuration());
        this.#geometryKey = geometryKey;
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
