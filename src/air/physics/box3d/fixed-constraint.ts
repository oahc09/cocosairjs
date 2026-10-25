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
import { FixedConstraint } from '../../../cocos/physics/framework/components/constraints/fixed-constraint';
import { RigidBody } from '../../../cocos/physics/framework/components/rigid-body';
import type { Constraint } from '../../../cocos/physics/framework/components/constraints/constraint';
import type { IFixedConstraint } from '../../../cocos/physics/spec/i-physics-constraint';
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
import type { Box3DFixedNativeLease } from './shared-body';
import type { Box3DFixedConfiguration, Box3DJointThresholdEvent } from './binding/facade.mjs';
import { finiteFloat32, worldError } from './world-binding';

type Candidate = Readonly<Box3DFixedConfiguration & { attached: RigidBody; connected: RigidBody | null }>;
const dead = CCObjectFlags.Destroyed | CCObjectFlags.ToDestroy | CCObjectFlags.Destroying;
/** Fixed only. Native writes occur at the world safe commit, never in a setter/callback.
 * Component caches describe the admitted requested state; diagnostics distinguish it
 * from a committed native weld. Native failures are faults, not fictional rollbacks. */
export class Box3DFixedConstraint implements IFixedConstraint {
    readonly #world: () => Box3DPhysicsWorld;
    readonly #activityIdentity = Object.freeze({});
    #component: FixedConstraint | null = null;
    #candidate!: Candidate;
    #applied: Candidate | null = null;
    #native: Box3DFixedNativeLease | null = null;
    #enabled = false;
    #broken = false;
    #orphaned = false;
    #closed = false;
    #dirty = false;
    #stateLease: { dispose(): void } | null = null;
    #activityLease: ComponentActivityLease | null = null;
    #breakStep: number | null = null;
    constructor(world: () => Box3DPhysicsWorld) {
        installComponentActivityDelegateSource(this, this.#activityIdentity);
        this.#world = world;
    }
    initialize(value: Constraint): void {
        const world = this.#world();
        world.assertComponentConfiguration('Fixed initialize');
        if (!(value instanceof FixedConstraint) || this.#component)
            throw worldError('AIR_E_BOX3D_CONFIG', 'Fixed initialize', 'Expected one real FixedConstraint.');
        const attached = value.attachedBody;
        if (!attached) throw worldError('AIR_E_BOX3D_CONFIG', 'Fixed initialize', 'Attached RigidBody is missing.');
        const candidate = this.#copy({
            attached,
            connected: value.connectedBody,
            collideConnected: value.enableCollision,
            breakForce: value.breakForce,
            breakTorque: value.breakTorque,
        });
        this.#component = value;
        this.#candidate = candidate;
        try {
            this.#stateLease = registerConstraintStateOwner(value, {
                change: (field, v, commit) => this.#change(field, v, commit),
                assertDestroy: () => {
                    if (!this.#closed && !world.jointCleanupOnly) this.#admit('Fixed destroy request');
                },
                read: () => this.impl,
            });
            this.#activityLease = registerComponentActivityObserver(value, this, {
                delegateIdentity: this,
                admit: () => this.#admit('Fixed.enabled'),
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
                                    'Fixed.enabled',
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
                                    'Fixed.enabled',
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
            world.registerFixedConstraint(this);
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
            (input.connected !== null && !(input.connected instanceof RigidBody))
        )
            throw worldError('AIR_E_BOX3D_CONFIG', 'Fixed endpoints', 'Expected RigidBody or null.');
        if (
            input.attached === input.connected ||
            input.attached._objFlags & dead ||
            (input.connected && input.connected._objFlags & dead)
        )
            throw worldError('AIR_E_BOX3D_CONFIG', 'Fixed endpoints', 'Endpoints must be distinct live components.');
        if (typeof input.collideConnected !== 'boolean')
            throw worldError('AIR_E_BOX3D_CONFIG', 'Fixed collision', 'Expected exact boolean.');
        const breakForce = finiteFloat32(input.breakForce, 'Fixed breakForce');
        const breakTorque = finiteFloat32(input.breakTorque, 'Fixed breakTorque');
        if (input.breakForce < 0 || input.breakTorque < 0)
            throw worldError(
                'AIR_E_BOX3D_CONFIG',
                'Fixed thresholds',
                'Expected nonnegative Newtons and Newton-metres.',
            );
        this.#world().validateFixedEndpoints(input.attached, input.connected);
        return Object.freeze({
            attached: input.attached,
            connected: input.connected,
            collideConnected: input.collideConnected,
            breakForce,
            breakTorque,
        });
    }
    #change(field: ConstraintField, value: unknown, commitCache: () => void): void {
        this.#admit('Fixed.' + field);
        const key = field === 'connectedBody' ? 'connected' : field === 'enableCollision' ? 'collideConnected' : field;
        const next = this.#copy({ ...this.#candidate, [key]: value } as Candidate);
        // Admission and full immutable candidate allocation precede the original cache closure.
        // No native write can have occurred on a rejected candidate.
        commitCache();
        this.#candidate = next;
        this.#dirty = true;
    }
    #publishActivity(enabled: boolean, prepared: Candidate | null): void {
        if (enabled && !this.#enabled) {
            if (!prepared) throw worldError('AIR_E_BOX3D_CONFIG', 'Fixed enable', 'Missing prepared endpoints.');
            this.#candidate = prepared;
            this.#broken = false;
            this.#orphaned = false;
            this.#breakStep = null;
        }
        this.#enabled = enabled;
        this.#dirty = true;
    }
    #activity(enabled: boolean): void {
        this.#admit('Fixed activity');
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
        this.#world().releaseFixedConstraint(this);
        // Weak-key admission tombstones stay with the closed component: reject before cache writes.
        // They hold no live native lease and cannot resurrect the destroyed weld/world.
        this.#closed = true;
    }
    setConnectedBody(value: RigidBody | null): void {
        this.#admit('Fixed adapter connectedBody');
        this.#component!.connectedBody = value;
    }
    setEnableCollision(value: boolean): void {
        this.#admit('Fixed adapter enableCollision');
        this.#component!.enableCollision = value;
    }
    setBreakForce(value: number): void {
        this.#admit('Fixed adapter breakForce');
        this.#component!.breakForce = value;
    }
    setBreakTorque(value: number): void {
        this.#admit('Fixed adapter breakTorque');
        this.#component!.breakTorque = value;
    }
    get component(): FixedConstraint {
        return this.#component!;
    }
    get impl(): Readonly<Record<string, unknown>> {
        this.#world().assertJointRead('Fixed diagnostics');
        return Object.freeze({
            backend: 'box3d',
            kind: 'fixed',
            state: this.#closed
                ? 'closed'
                : this.#broken
                  ? 'broken'
                  : this.#orphaned
                    ? 'endpoint-removed'
                    : this.#native
                      ? 'connected'
                      : this.#enabled
                        ? 'pending'
                        : 'disabled',
            requestedEnabled: this.#enabled,
            pending: this.#dirty,
            breakStep: this.#breakStep,
            native: this.#native ? this.#native.read() : null,
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
        if (
            !this.#enabled ||
            !component.node.activeInHierarchy ||
            component._objFlags & dead ||
            this.#broken ||
            this.#orphaned
        ) {
            this.detach();
            this.#dirty = false;
            return;
        }
        this.#copy(this.#candidate); // Full live endpoint preflight before any destruction/recreation.
        if (
            this.#native &&
            this.#applied &&
            (this.#applied.attached !== this.#candidate.attached ||
                this.#applied.connected !== this.#candidate.connected)
        )
            this.detach();
        if (!this.#native)
            this.#native = this.#world().createFixedLease(
                this.#candidate.attached,
                this.#candidate.connected,
                this.#candidate,
            );
        else if (this.#dirty) this.#native.configure(this.#candidate);
        this.#applied = this.#candidate;
        this.#dirty = false;
    }
    observe(events: readonly Box3DJointThresholdEvent[], step: number): void {
        if (!this.#native || this.#broken) return;
        const id = this.#native.identity;
        if (events.some((event) => event.valid && event.joint.low === id.low && event.joint.high === id.high)) {
            this.#broken = true;
            this.#breakStep = step;
            this.#dirty = true;
        }
    }
    detach(): void {
        if (this.#native) {
            this.#native.destroy();
            this.#native = null;
            this.#applied = null;
        }
    }
    afterStep(): void {
        if (this.#broken) {
            this.detach();
            this.#dirty = false;
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
        // They hold no live native lease and cannot resurrect the destroyed weld/world.
        this.#closed = true;
    }
}
