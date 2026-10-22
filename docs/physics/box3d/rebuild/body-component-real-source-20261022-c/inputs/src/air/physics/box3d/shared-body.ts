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
import type { Node } from '../../../cocos/scene-graph/node';
import type { RigidBody } from '../../../cocos/physics/framework/components/rigid-body';
import type { Box3DBodyState, Box3DId, Box3DWorld } from './binding/facade.mjs';
import type { Box3DComponentBinding } from './world-binding';
import { finiteFloat32, worldError } from './world-binding';
import { unsupportedBox3D } from './unsupported';

type Vec = { x: number; y: number; z: number };
export interface Box3DComponentConfiguration {
    /** Must read the actual PhysicsSystem, not a separate collision matrix. */
    readonly collisionMask: (group: number) => number;
    readonly sleepThreshold: () => number;
}
export interface Box3DBodyOwner {
    assertReady(operation: string): void;
    invalidate(): void;
    fault(error: unknown): void;
    released(node: Node, body: Box3DSharedBody): void;
}
type Mutation =
    | 'setBodyType'
    | 'setBodyEnabled'
    | 'setBodyMass'
    | 'setBodyDamping'
    | 'setBodyGravityScale'
    | 'setBodySleepEnabled'
    | 'setBodySleepThreshold'
    | 'setBodyAwake'
    | 'setBodyCCD'
    | 'setBodyMotionFactors'
    | 'setBodyLinearVelocity'
    | 'setBodyAngularVelocity'
    | 'applyBodyForce'
    | 'applyBodyImpulse'
    | 'applyBodyTorque'
    | 'clearBodyForces'
    | 'clearBodyVelocity'
    | 'clearBodyState';
const BODY_MUTATIONS = new Set<Mutation>([
    'setBodyType',
    'setBodyEnabled',
    'setBodyMass',
    'setBodyDamping',
    'setBodyGravityScale',
    'setBodySleepEnabled',
    'setBodySleepThreshold',
    'setBodyAwake',
    'setBodyCCD',
    'setBodyMotionFactors',
    'setBodyLinearVelocity',
    'setBodyAngularVelocity',
    'applyBodyForce',
    'applyBodyImpulse',
    'applyBodyTorque',
    'clearBodyForces',
    'clearBodyVelocity',
    'clearBodyState',
]);
type Arguments<M extends Mutation> = Box3DComponentBinding[M] extends (
    world: Box3DWorld,
    body: Box3DId,
    ...args: infer A
) => Box3DBodyState
    ? A
    : never;
export function bodyVector(value: Vec, operation: string): readonly number[] {
    if (!value) throw worldError('AIR_E_BOX3D_CONFIG', operation, 'Expected a vector.');
    return Object.freeze([value.x, value.y, value.z].map((v) => finiteFloat32(v, operation)));
}
export function nativeBodyType(value: number): 0 | 1 | 2 {
    if (value === 1) return 2; // Cocos DYNAMIC -> native dynamic.
    if (value === 2) return 0; // Cocos STATIC -> native static.
    if (value === 4) return 1; // Cocos KINEMATIC -> native kinematic.
    throw worldError('AIR_E_BOX3D_CONFIG', 'setType', 'Expected Cocos body type 1, 2 or 4.');
}
export function filterBits(value: number): number {
    if (!Number.isInteger(value) || value < -0x80000000 || value > 0xffffffff)
        throw worldError('AIR_E_BOX3D_CONFIG', 'filter', 'Expected a 32-bit integer bitset.');
    return value >>> 0;
}
/** Read every serialized candidate and validate the complete set before any native mutation. */
export function validateRigidBodyInitial(value: RigidBody, configuration: Box3DComponentConfiguration) {
    const type = nativeBodyType(value.type);
    const mass = finiteFloat32(value.mass, 'initial mass');
    if (mass <= 0 || !Number.isFinite(Math.fround(1 / mass)))
        throw worldError('AIR_E_BOX3D_CONFIG', 'initial mass', 'Expected positive finite mass and reciprocal.');
    const linear = value.linearDamping;
    const angular = value.angularDamping;
    const linearDamping = finiteFloat32(linear, 'initial linearDamping');
    const angularDamping = finiteFloat32(angular, 'initial angularDamping');
    if (linear < 0 || linear > 1 || angular < 0 || angular > 1)
        throw worldError('AIR_E_BOX3D_CONFIG', 'initial damping', 'Expected damping in [0,1].');
    const gravity = value.useGravity;
    const sleep = value.allowSleep;
    if (typeof gravity !== 'boolean' || typeof sleep !== 'boolean')
        throw worldError('AIR_E_BOX3D_CONFIG', 'initial body flags', 'Expected exact booleans.');
    const factors = (v: Vec, operation: string) => {
        const copy = bodyVector(v, operation);
        if ([v.x, v.y, v.z].some((n) => n !== 0 && n !== 1))
            throw worldError('AIR_E_BOX3D_CONFIG', operation, 'Expected exact binary factors.');
        return copy;
    };
    const linearFactor = factors(value.linearFactor, 'initial linearFactor');
    const angularFactor = factors(value.angularFactor, 'initial angularFactor');
    const group = filterBits(value.group);
    const mask = filterBits(configuration.collisionMask(group | 0));
    return Object.freeze({
        type,
        mass,
        linearDamping,
        angularDamping,
        gravity,
        sleep,
        linearFactor,
        angularFactor,
        group,
        mask,
    });
}
function rejectInitialShear(node: Node): void {
    const m = node.worldMatrix;
    const axes = [
        [m.m00, m.m01, m.m02],
        [m.m04, m.m05, m.m06],
        [m.m08, m.m09, m.m10],
    ];
    const lengths = axes.map((a) => Math.hypot(...a));
    if (axes.flat().some((v) => !Number.isFinite(v)) || lengths.some((v) => v === 0 || !Number.isFinite(v)))
        throw worldError('AIR_E_BOX3D_CONFIG', 'initial transform', 'Expected finite nondegenerate transform.');
    for (let i = 0; i < 3; ++i)
        for (let j = i + 1; j < 3; ++j) {
            const cosine = axes[i].reduce((sum, n, k) => sum + n * axes[j][k], 0) / lengths[i] / lengths[j];
            if (Math.abs(cosine) > 1e-6) unsupportedBox3D('initial sheared world transform');
        }
}
/** One native body per Node per world. No native capability is exposed by this object. */
export class Box3DSharedBody {
    readonly #binding: Box3DComponentBinding;
    readonly #world: Box3DWorld;
    readonly #body: Box3DId;
    readonly #owner: Box3DBodyOwner;
    readonly #node: Node;
    readonly #references = new Set<object>();
    #closed = false;
    #rigidBody: RigidBody | null = null;
    #rigidEnabled = false;
    #type: 0 | 1 | 2 = 0;
    #group = 1;
    #mask: number;
    #pose: readonly number[];
    readonly #scale: readonly number[];
    readonly #parent: Node | null;

    constructor(
        binding: Box3DComponentBinding,
        world: Box3DWorld,
        node: Node,
        owner: Box3DBodyOwner,
        configuration: Box3DComponentConfiguration,
    ) {
        this.#binding = binding;
        this.#world = world;
        this.#node = node;
        this.#owner = owner;
        this.#mask = filterBits(configuration.collisionMask(1));
        this.#pose = this.nodePose();
        rejectInitialShear(node);
        this.#scale = bodyVector(node.worldScale, 'initial scale');
        if (this.#scale.some((v) => v <= 0)) unsupportedBox3D('nonpositive initial Node scale');
        this.#parent = node.parent;
        // No dynamic, geometry-less body can enter simulation during component assembly.
        const threshold = finiteFloat32(configuration.sleepThreshold(), 'sleepThreshold');
        if (threshold < 0) throw worldError('AIR_E_BOX3D_CONFIG', 'sleepThreshold', 'Expected nonnegative threshold.');
        this.#body = binding.createBody(world, {
            type: 0,
            position: this.#pose.slice(0, 3),
            rotation: this.#pose.slice(3, 7),
        });
        owner.invalidate();
        try {
            binding.setBodyEnabled(world, this.#body, false);
            binding.setBodySleepThreshold(world, this.#body, threshold);
        } catch (error) {
            try {
                binding.destroyBody(this.#body);
            } catch (cleanup) {
                owner.fault(cleanup);
            }
            this.#closed = true;
            throw error;
        }
        owner.invalidate();
    }
    private assert(operation: string): void {
        if (this.#closed) throw worldError('AIR_E_BOX3D_DISPOSED', operation, 'Shared body is closed.');
        this.#owner.assertReady(operation);
    }
    private nodePose(): readonly number[] {
        const p = this.#node.worldPosition;
        const q = this.#node.worldRotation;
        return Object.freeze([p.x, p.y, p.z, q.x, q.y, q.z, q.w]);
    }
    /** Pure scene/readback preflight. No flags, diagnostics or native state are mutated. */
    preflight(): void {
        if (this.#closed) throw worldError('AIR_E_BOX3D_DISPOSED', 'preflight', 'Shared body is closed.');
        const scale = this.#node.worldScale;
        if (
            this.#node.parent !== this.#parent ||
            [scale.x, scale.y, scale.z].some((v, i) => Math.fround(v) !== this.#scale[i])
        )
            unsupportedBox3D('runtime Node parent/scale synchronization (T11)');
        if (this.nodePose().some((v, i) => v !== this.#pose[i]))
            unsupportedBox3D('external Node pose/teleport/kinematic target (T11)');
        const state = this.#binding.bodyState(this.#world, this.#body);
        if (state.enabled && state.type === 2 && state.massPending)
            throw worldError('AIR_E_BOX3D_MASS_PENDING', 'step preflight', 'Dynamic body needs effective geometry.');
    }
    /** Called only after this world's single native step; transform[0..2] is body ORIGIN, not COM. */
    syncPhysicsToScene(): void {
        const state = this.#binding.bodyState(this.#world, this.#body);
        if (!state.enabled || state.type === 0) return;
        const pose = this.#binding.bodyTransforms(this.#world, [this.#body]);
        if (pose.length !== 10 || !pose.every(Number.isFinite))
            throw worldError('AIR_E_BOX3D_ABI', 'bodyTransforms', 'Expected one finite copied body transform.');
        this.#node.setWorldPosition(pose[0], pose[1], pose[2]);
        this.#node.setWorldRotation(pose[3], pose[4], pose[5], pose[6]);
        // Never clear hasChangedFlags or unrelated Node dirtiness.
        this.#pose = this.nodePose();
    }
    retain(reference: object): void {
        this.assert('retain body');
        if (this.#references.has(reference)) throw worldError('AIR_E_BOX3D_CONFIG', 'retain body', 'Duplicate owner.');
        this.#references.add(reference);
    }
    release(reference: object): void {
        if (this.#closed) return; // World destruction already invalidated every component reference.
        this.assert('release body');
        if (!this.#references.has(reference))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'release body', 'Unknown owner.');
        if (this.#references.size > 1) {
            this.#references.delete(reference);
            return;
        }
        try {
            this.#binding.destroyBody(this.#body);
        } catch (error) {
            this.#owner.invalidate();
            this.#owner.fault(error);
            throw error;
        }
        this.#owner.invalidate();
        this.#references.delete(reference);
        this.#closed = true;
        this.#owner.released(this.#node, this);
    }
    closeWithWorld(): void {
        this.#closed = true;
        this.#references.clear();
        this.#rigidBody = null;
    }
    get rigidBody(): RigidBody | null {
        return this.#rigidBody;
    }
    get state(): Box3DBodyState {
        this.assert('bodyState');
        return this.#binding.bodyState(this.#world, this.#body);
    }
    get impl(): Readonly<{ backend: 'box3d'; kind: 'shared-body' }> {
        this.assert('body impl');
        return Object.freeze({ backend: 'box3d', kind: 'shared-body' });
    }
    control<M extends Mutation>(method: M, ...args: Arguments<M>): Box3DBodyState {
        this.assert(method);
        if (!BODY_MUTATIONS.has(method))
            throw worldError('AIR_E_BOX3D_UNSUPPORTED', 'body control', 'Unknown body mutation.');
        try {
            // The fixed method union has no token-returning API; this/args/result are forwarded intact.
            const fn = this.#binding[method] as unknown as (
                world: Box3DWorld,
                body: Box3DId,
                ...v: Arguments<M>
            ) => Box3DBodyState;
            const result = fn.call(this.#binding, this.#world, this.#body, ...args);
            this.#owner.invalidate();
            if (!result || !Object.isFrozen(result))
                throw worldError('AIR_E_BOX3D_ABI', method, 'Expected copied immutable native state.');
            return result;
        } catch (error) {
            // Only phase-unambiguous pre-mutation failures preserve the last completed observation.
            // AIR_E_BOX3D_NATIVE is deliberately NOT classified by code: a post-write readback may use it too.
            const code = (error as { code?: string })?.code;
            if (!['AIR_E_BOX3D_ARGUMENT', 'AIR_E_BOX3D_LOCKED', 'AIR_E_BOX3D_MASS_PENDING'].includes(code ?? '')) {
                this.#owner.invalidate();
                this.#owner.fault(error);
            }
            throw error;
        }
    }
    attachRigidBody(value: RigidBody, configuration: Box3DComponentConfiguration): void {
        this.assert('attach RigidBody');
        if (this.#rigidBody)
            throw worldError('AIR_E_BOX3D_CONFIG', 'attach RigidBody', 'Node already has a body owner.');
        const next = validateRigidBodyInitial(value, configuration);
        let committed = 0;
        try {
            this.control('setBodyMass', next.mass);
            ++committed;
            this.control('setBodyDamping', next.linearDamping, next.angularDamping);
            ++committed;
            this.control('setBodyGravityScale', next.gravity ? 1 : 0);
            ++committed;
            this.control('setBodySleepEnabled', next.sleep);
            ++committed;
            this.control('setBodyMotionFactors', next.linearFactor, next.angularFactor);
            ++committed;
            this.control('setBodyType', next.type);
            ++committed;
        } catch (error) {
            // This is not a native batch transaction. A failure after an earlier write is explicitly fatal.
            if (committed) {
                this.#owner.invalidate();
                this.#owner.fault(error);
            }
            throw error;
        }
        this.#type = next.type;
        this.#group = next.group;
        this.#mask = next.mask;
        this.#rigidBody = value;
    }
    enableRigidBody(enabled: boolean): void {
        this.control('setBodyEnabled', enabled);
        this.#rigidEnabled = enabled;
    }
    detachRigidBody(): void {
        if (this.#closed) return;
        this.control('setBodyEnabled', false);
        this.control('setBodyType', 0);
        this.#rigidEnabled = false;
        this.#type = 0;
        this.#rigidBody = null;
    }
    setType(value: number): void {
        const next = nativeBodyType(value);
        this.control('setBodyType', next);
        this.#type = next;
    }
    getGroup(): number {
        this.assert('getGroup');
        return this.#group | 0;
    }
    getMask(): number {
        this.assert('getMask');
        return this.#mask | 0;
    }
    setGroup(value: number): void {
        filterBits(value);
        unsupportedBox3D('shape filter ownership transaction pending next source checkpoint');
    }
    setMask(value: number): void {
        filterBits(value);
        unsupportedBox3D('shape filter ownership transaction pending next source checkpoint');
    }
}
