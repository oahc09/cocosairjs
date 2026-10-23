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
import type { RigidBody } from '../../../cocos/physics/framework/components/rigid-body';
import type { IRigidBody } from '../../../cocos/physics/spec/i-rigid-body';
import type { IVec3Like } from '../../../cocos/core/math/type-define';
import type { ERigidBodyType } from '../../../cocos/physics/framework/physics-enum';
import type { Box3DPhysicsWorld } from './world';
import type { Box3DComponentConfiguration } from './shared-body';
import { Box3DSharedBody, bodyVector, filterBits, validateRigidBodyInitial } from './shared-body';
import { worldError } from './world-binding';
import {
    assertPhysicsBodyVelocityConfiguration,
    trySubmitPhysicsBodyCommand,
} from '../../../cocos/physics/framework/physics-command-submission';
import type { PhysicsBodyCommandInput } from '../../../cocos/physics/framework/physics-command-submission';
import { installComponentActivityDelegateSource, tryDelegateComponentActivity } from '../../../cocos/scene-graph/component-activity-control';

/** Actual Cocos IRigidBody adapter. Native ownership remains solely in the world's shared body. */
export class Box3DRigidBody implements IRigidBody {
    readonly #world: () => Box3DPhysicsWorld;
    readonly #configuration: Box3DComponentConfiguration;
    readonly #activityDelegateIdentity = Object.freeze({});
    #component: RigidBody | null = null;
    #shared: Box3DSharedBody | null = null;
    constructor(world: () => Box3DPhysicsWorld, configuration: Box3DComponentConfiguration) {
        installComponentActivityDelegateSource(this, this.#activityDelegateIdentity);
        this.#world = world;
        this.#configuration = configuration;
    }
    get #body(): Box3DSharedBody {
        if (!this.#shared)
            throw worldError('AIR_E_BOX3D_DISPOSED', 'RigidBody', 'Component is not initialized or was destroyed.');
        return this.#shared;
    }
    get rigidBody(): RigidBody {
        if (!this.#component) throw worldError('AIR_E_BOX3D_DISPOSED', 'rigidBody', 'No component.');
        return this.#component;
    }
    get impl() {
        return this.#body.impl;
    }
    get isAwake(): boolean {
        return this.#body.state.awake;
    }
    get isSleepy(): boolean {
        return this.#body.state.sleepy;
    }
    get isSleeping(): boolean {
        return this.#body.state.sleeping;
    }
    initialize(value: RigidBody): void {
        this.#world().assertComponentConfiguration('RigidBody initialize');
        if (this.#shared) throw worldError('AIR_E_BOX3D_CONFIG', 'initialize', 'Already initialized.');
        validateRigidBodyInitial(value, this.#configuration);
        const body = this.#world().acquireSharedBody(value.node, this, this.#configuration, {
            adapter: this,
            component: value,
            kind: 'rigid-body',
            material: null,
        });
        try {
            body.attachRigidBody(value, this.#configuration);
            body.completeComponent(this);
        } catch (error) {
            try {
                body.release(this);
            } catch (cleanupError) {
                throw Object.assign(
                    worldError(
                        'AIR_E_BOX3D_WORLD_FAULTED',
                        'RigidBody initialization',
                        'Initialization failed and native cleanup remains owned by the faulted world.',
                    ),
                    { cause: error, cleanupError },
                );
            }
            throw error;
        }
        this.#component = value;
        this.#shared = body;
    }
    onEnable(): void {
        if (this.#component && tryDelegateComponentActivity(this.#component, this, this.#activityDelegateIdentity, true)) return;
        this.#body.enableRigidBody(true);
        this.#body.componentEnabled(this, true);
    }
    onDisable(): void {
        if (this.#component && tryDelegateComponentActivity(this.#component, this, this.#activityDelegateIdentity, false)) return;
        this.#body.enableRigidBody(false);
        this.#body.componentEnabled(this, false);
    }
    onDestroy(): void {
        if (!this.#shared) return;
        const body = this.#shared;
        body.detachRigidBody();
        body.release(this);
        this.#shared = null;
        this.#component = null;
    }
    setType(value: ERigidBodyType): void {
        this.#body.assertConfiguration('setType');
        this.#body.setType(value);
        this.#world().retireNonDynamicAfterCommit(this);
    }
    setMass(value: number): void {
        this.#body.assertConfiguration('setMass');
        this.#body.control('setBodyMass', value);
    }
    setLinearDamping(value: number): void {
        this.#body.assertConfiguration('setLinearDamping');
        this.#body.control('setBodyDamping', value, this.#body.state.angularDamping);
    }
    setAngularDamping(value: number): void {
        this.#body.assertConfiguration('setAngularDamping');
        this.#body.control('setBodyDamping', this.#body.state.linearDamping, value);
    }
    useGravity(value: boolean): void {
        this.#body.assertConfiguration('useGravity');
        if (typeof value !== 'boolean') throw worldError('AIR_E_BOX3D_CONFIG', 'useGravity', 'Expected boolean.');
        this.#body.control('setBodyGravityScale', value ? 1 : 0);
    }
    setLinearFactor(value: IVec3Like): void {
        this.#body.assertConfiguration('setLinearFactor');
        this.#body.control('setBodyMotionFactors', bodyVector(value, 'linearFactor'), this.#body.state.angularFactor);
    }
    setAngularFactor(value: IVec3Like): void {
        this.#body.assertConfiguration('setAngularFactor');
        this.#body.control('setBodyMotionFactors', this.#body.state.linearFactor, bodyVector(value, 'angularFactor'));
    }
    setAllowSleep(value: boolean): void {
        this.#body.assertConfiguration('setAllowSleep');
        this.#body.control('setBodySleepEnabled', value);
    }
    wakeUp(): void {
        this.#body.assertConfiguration('wakeUp');
        this.#body.control('setBodyAwake', true);
    }
    sleep(): void {
        this.#body.assertConfiguration('sleep');
        this.#body.control('setBodyAwake', false);
    }
    #submitCommand(read: () => PhysicsBodyCommandInput): void {
        // Public RigidBody.body exposes this adapter. Route through the CURRENT realm owner
        // first so a retained old-generation adapter rejection latches that collecting queue.
        // Private component identity is never reconstructed from caller-owned properties.
        if (trySubmitPhysicsBodyCommand(this.#component ?? this, read)) return;
        this.#world().submitAdapterCommand(this, read);
    }
    clearState(): void {
        this.#submitCommand(() => ({ kind: 'clear-state' }));
    }
    clearForces(): void {
        this.#submitCommand(() => ({ kind: 'clear-forces' }));
    }
    clearVelocity(): void {
        this.#submitCommand(() => ({ kind: 'clear-velocity' }));
    }
    setSleepThreshold(value: number): void {
        this.#body.assertConfiguration('setSleepThreshold');
        this.#body.control('setBodySleepThreshold', value);
    }
    getSleepThreshold(): number {
        return this.#body.state.sleepThreshold;
    }
    useCCD(value: boolean): void {
        this.#body.assertConfiguration('useCCD');
        this.#body.control('setBodyCCD', value);
    }
    isUsingCCD(): boolean {
        return this.#body.state.ccd;
    }
    getLinearVelocity(out: IVec3Like): void {
        const v = this.#body.state.linearVelocity;
        out.x = v[0];
        out.y = v[1];
        out.z = v[2];
    }
    setLinearVelocity(value: IVec3Like): void {
        assertPhysicsBodyVelocityConfiguration('setLinearVelocity', this.#component ?? this);
        this.#body.assertConfiguration('setLinearVelocity');
        this.#body.control('setBodyLinearVelocity', bodyVector(value, 'linearVelocity'));
    }
    getAngularVelocity(out: IVec3Like): void {
        const v = this.#body.state.angularVelocity;
        out.x = v[0];
        out.y = v[1];
        out.z = v[2];
    }
    setAngularVelocity(value: IVec3Like): void {
        assertPhysicsBodyVelocityConfiguration('setAngularVelocity', this.#component ?? this);
        this.#body.assertConfiguration('setAngularVelocity');
        this.#body.control('setBodyAngularVelocity', bodyVector(value, 'angularVelocity'));
    }
    applyForce(value: IVec3Like, offset?: IVec3Like): void {
        this.#submitCommand(() => ({
            kind: 'force',
            vector: value,
            relativePoint: offset,
            space: 'world',
        }));
    }
    applyLocalForce(value: IVec3Like, offset?: IVec3Like): void {
        this.#submitCommand(() => ({
            kind: 'force',
            vector: value,
            relativePoint: offset,
            space: 'local',
        }));
    }
    applyImpulse(value: IVec3Like, offset?: IVec3Like): void {
        this.#submitCommand(() => ({
            kind: 'impulse',
            vector: value,
            relativePoint: offset,
            space: 'world',
        }));
    }
    applyLocalImpulse(value: IVec3Like, offset?: IVec3Like): void {
        this.#submitCommand(() => ({
            kind: 'impulse',
            vector: value,
            relativePoint: offset,
            space: 'local',
        }));
    }
    applyTorque(value: IVec3Like): void {
        this.#submitCommand(() => ({ kind: 'torque', vector: value, space: 'world' }));
    }
    applyLocalTorque(value: IVec3Like): void {
        this.#submitCommand(() => ({ kind: 'torque', vector: value, space: 'local' }));
    }
    getGroup(): number {
        return this.#body.getGroup();
    }
    setGroup(value: number): void {
        this.#body.assertConfiguration('setGroup');
        this.#body.setGroup(value);
    }
    addGroup(value: number): void {
        this.#body.assertConfiguration('addGroup');
        this.setGroup(this.getGroup() | filterBits(value));
    }
    removeGroup(value: number): void {
        this.#body.assertConfiguration('removeGroup');
        this.setGroup(this.getGroup() & ~filterBits(value));
    }
    getMask(): number {
        return this.#body.getMask();
    }
    setMask(value: number): void {
        this.#body.assertConfiguration('setMask');
        this.#body.setMask(value);
    }
    addMask(value: number): void {
        this.#body.assertConfiguration('addMask');
        this.setMask(this.getMask() | filterBits(value));
    }
    removeMask(value: number): void {
        this.#body.assertConfiguration('removeMask');
        this.setMask(this.getMask() & ~filterBits(value));
    }
}
