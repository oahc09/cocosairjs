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

/** Actual Cocos IRigidBody adapter. Native ownership remains solely in the world's shared body. */
export class Box3DRigidBody implements IRigidBody {
    readonly #world: () => Box3DPhysicsWorld;
    readonly #configuration: Box3DComponentConfiguration;
    #component: RigidBody | null = null;
    #shared: Box3DSharedBody | null = null;
    constructor(world: () => Box3DPhysicsWorld, configuration: Box3DComponentConfiguration) {
        this.#world = world;
        this.#configuration = configuration;
    }
    private get body(): Box3DSharedBody {
        if (!this.#shared)
            throw worldError('AIR_E_BOX3D_DISPOSED', 'RigidBody', 'Component is not initialized or was destroyed.');
        return this.#shared;
    }
    get rigidBody(): RigidBody {
        if (!this.#component) throw worldError('AIR_E_BOX3D_DISPOSED', 'rigidBody', 'No component.');
        return this.#component;
    }
    get impl() {
        return this.body.impl;
    }
    get isAwake(): boolean {
        return this.body.state.awake;
    }
    get isSleepy(): boolean {
        return this.body.state.sleepy;
    }
    get isSleeping(): boolean {
        return this.body.state.sleeping;
    }
    initialize(value: RigidBody): void {
        if (this.#shared) throw worldError('AIR_E_BOX3D_CONFIG', 'initialize', 'Already initialized.');
        validateRigidBodyInitial(value, this.#configuration);
        const body = this.#world().acquireSharedBody(value.node, this, this.#configuration);
        try {
            body.attachRigidBody(value, this.#configuration);
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
        this.body.enableRigidBody(true);
    }
    onDisable(): void {
        this.body.enableRigidBody(false);
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
        this.body.setType(value);
    }
    setMass(value: number): void {
        this.body.control('setBodyMass', value);
    }
    setLinearDamping(value: number): void {
        this.body.control('setBodyDamping', value, this.body.state.angularDamping);
    }
    setAngularDamping(value: number): void {
        this.body.control('setBodyDamping', this.body.state.linearDamping, value);
    }
    useGravity(value: boolean): void {
        if (typeof value !== 'boolean') throw worldError('AIR_E_BOX3D_CONFIG', 'useGravity', 'Expected boolean.');
        this.body.control('setBodyGravityScale', value ? 1 : 0);
    }
    setLinearFactor(value: IVec3Like): void {
        this.body.control('setBodyMotionFactors', bodyVector(value, 'linearFactor'), this.body.state.angularFactor);
    }
    setAngularFactor(value: IVec3Like): void {
        this.body.control('setBodyMotionFactors', this.body.state.linearFactor, bodyVector(value, 'angularFactor'));
    }
    setAllowSleep(value: boolean): void {
        this.body.control('setBodySleepEnabled', value);
    }
    wakeUp(): void {
        this.body.control('setBodyAwake', true);
    }
    sleep(): void {
        this.body.control('setBodyAwake', false);
    }
    clearState(): void {
        this.body.control('clearBodyState');
    }
    clearForces(): void {
        this.body.control('clearBodyForces');
    }
    clearVelocity(): void {
        this.body.control('clearBodyVelocity');
    }
    setSleepThreshold(value: number): void {
        this.body.control('setBodySleepThreshold', value);
    }
    getSleepThreshold(): number {
        return this.body.state.sleepThreshold;
    }
    useCCD(value: boolean): void {
        this.body.control('setBodyCCD', value);
    }
    isUsingCCD(): boolean {
        return this.body.state.ccd;
    }
    getLinearVelocity(out: IVec3Like): void {
        const v = this.body.state.linearVelocity;
        out.x = v[0];
        out.y = v[1];
        out.z = v[2];
    }
    setLinearVelocity(value: IVec3Like): void {
        this.body.control('setBodyLinearVelocity', bodyVector(value, 'linearVelocity'));
    }
    getAngularVelocity(out: IVec3Like): void {
        const v = this.body.state.angularVelocity;
        out.x = v[0];
        out.y = v[1];
        out.z = v[2];
    }
    setAngularVelocity(value: IVec3Like): void {
        this.body.control('setBodyAngularVelocity', bodyVector(value, 'angularVelocity'));
    }
    applyForce(value: IVec3Like, offset?: IVec3Like): void {
        this.body.control(
            'applyBodyForce',
            bodyVector(value, 'force'),
            offset && bodyVector(offset, 'offset'),
            'world',
        );
    }
    applyLocalForce(value: IVec3Like, offset?: IVec3Like): void {
        this.body.control(
            'applyBodyForce',
            bodyVector(value, 'force'),
            offset && bodyVector(offset, 'offset'),
            'local',
        );
    }
    applyImpulse(value: IVec3Like, offset?: IVec3Like): void {
        this.body.control(
            'applyBodyImpulse',
            bodyVector(value, 'impulse'),
            offset && bodyVector(offset, 'offset'),
            'world',
        );
    }
    applyLocalImpulse(value: IVec3Like, offset?: IVec3Like): void {
        this.body.control(
            'applyBodyImpulse',
            bodyVector(value, 'impulse'),
            offset && bodyVector(offset, 'offset'),
            'local',
        );
    }
    applyTorque(value: IVec3Like): void {
        this.body.control('applyBodyTorque', bodyVector(value, 'torque'), 'world');
    }
    applyLocalTorque(value: IVec3Like): void {
        this.body.control('applyBodyTorque', bodyVector(value, 'torque'), 'local');
    }
    getGroup(): number {
        return this.body.getGroup();
    }
    setGroup(value: number): void {
        this.body.setGroup(value);
    }
    addGroup(value: number): void {
        this.setGroup(this.getGroup() | filterBits(value));
    }
    removeGroup(value: number): void {
        this.setGroup(this.getGroup() & ~filterBits(value));
    }
    getMask(): number {
        return this.body.getMask();
    }
    setMask(value: number): void {
        this.body.setMask(value);
    }
    addMask(value: number): void {
        this.setMask(this.getMask() | filterBits(value));
    }
    removeMask(value: number): void {
        this.setMask(this.getMask() & ~filterBits(value));
    }
}
