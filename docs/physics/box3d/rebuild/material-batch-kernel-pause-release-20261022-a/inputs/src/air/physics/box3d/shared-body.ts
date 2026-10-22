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
import type { PhysicsMaterial } from '../../../cocos/physics/framework/assets/physics-material';
import type { Box3DOwnedBodySeed, Box3DOwnedComponentSeed } from './world-command-owner';
import type { Node } from '../../../cocos/scene-graph/node';
import type { RigidBody } from '../../../cocos/physics/framework/components/rigid-body';
import type { Box3DBodyState, Box3DId, Box3DWorld } from './binding/facade.mjs';
import type { Box3DPrimitiveGeometry } from './box-sphere-geometry';
import type { Box3DSurfaceMaterial } from './world-binding';
import type { Box3DComponentBinding } from './world-binding';
import { finiteFloat32, mutationNotApplied, worldError } from './world-binding';
import { unsupportedBox3D } from './unsupported';
import { Box3DSceneTransform } from './world-writeback';
import type { Box3DWritebackBody } from './world-writeback';

type Vec = { x: number; y: number; z: number };
export interface Box3DComponentConfiguration {
    /** Must read the actual PhysicsSystem, not a separate collision matrix. */
    readonly collisionMask: (group: number) => number;
    readonly sleepThreshold: () => number;
}
export interface Box3DBodyOwner {
    assertReady(operation: string): void;
    assertCommittedRead(operation: string): void;
    adoptBody(seed: Box3DOwnedBodySeed): object;
    attachComponent(body: object, seed: Box3DOwnedComponentSeed): void;
    completeComponent(adapter: object): void;
    componentEnabled(adapter: object, enabled: boolean): void;
    releaseComponent(adapter: object): void;
    isFaulted(): boolean;
    invalidate(): void;
    fault(error: unknown): void;
    registerShapeMaterial(shape: Box3DId, inherited: boolean): void;
    updateShapeMaterial(shape: Box3DId, value: Box3DSurfaceMaterial | null): void;
    applyCopiedMaterial(
        adapter: object,
        authority: object,
        shape: Box3DId | null,
        value: Readonly<Box3DSurfaceMaterial> | null,
    ): void;
    unregisterShapeMaterial(shape: Box3DId): void;
    released(node: Node, body: Box3DSharedBody, logical: object): void;
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
    if (
        axes.some((axis) => axis.some((v) => !Number.isFinite(v))) ||
        lengths.some((v) => v === 0 || !Number.isFinite(v))
    )
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
    readonly #logical: object;
    readonly #owner: Box3DBodyOwner;
    readonly #node: Node;
    readonly #references = new Set<object>();
    readonly #shapes = new Map<object, { token: Box3DId; geometry: Box3DPrimitiveGeometry }>();
    #closed = false;
    #rigidBody: RigidBody | null = null;
    #rigidEnabled = false;
    #type: 0 | 1 | 2 = 0;
    #group = 1;
    #mask: number;
    #pose: readonly number[];
    readonly #scale: readonly number[];
    readonly #scene: Box3DSceneTransform;

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
        this.#pose.forEach((v) => finiteFloat32(v, 'initial pose'));
        rejectInitialShear(node);
        this.#scale = bodyVector(node.worldScale, 'initial scale');
        if (this.#scale.some((v) => v <= 0)) unsupportedBox3D('nonpositive initial Node scale');
        this.#scene = new Box3DSceneTransform(node);
        // No dynamic, geometry-less body can enter simulation during component assembly.
        const threshold = finiteFloat32(configuration.sleepThreshold(), 'sleepThreshold');
        if (threshold < 0) throw worldError('AIR_E_BOX3D_CONFIG', 'sleepThreshold', 'Expected nonnegative threshold.');
        let allocated: Box3DId | undefined;
        try {
            allocated = binding.createBody(world, {
                type: 0,
                position: this.#pose.slice(0, 3),
                rotation: this.#pose.slice(3, 7),
            });
            this.#body = allocated;
            owner.invalidate();
            binding.setBodyEnabled(world, allocated, false);
            binding.setBodySleepThreshold(world, allocated, threshold);
            this.#logical = owner.adoptBody({
                node,
                ancestry: Object.freeze(this.#scene.records().map((record) => record.node)),
                preflight: () => this.preflight(),
                readCommitted: () => {
                    this.assertRead('private committed read');
                    return this.#binding.bodyState(this.#world, this.#body);
                },
                resolveNative: () => {
                    this.assertRead('private native identity resolution');
                    return this.#body;
                },
            });
        } catch (error) {
            // Creation has no reviewed phase contract. A lost token may still own a real native body.
            let failure = error;
            if (allocated) {
                try {
                    binding.destroyBody(allocated);
                } catch (cleanupError) {
                    failure = Object.assign(
                        worldError('AIR_E_BOX3D_WORLD_FAULTED', 'body cleanup', 'World owns unresolved cleanup.'),
                        { cause: error, cleanupError },
                    );
                }
            }
            owner.invalidate();
            owner.fault(failure);
            this.#closed = true;
            throw failure;
        }
        owner.invalidate();
    }
    private assert(operation: string): void {
        if (this.#closed) throw worldError('AIR_E_BOX3D_DISPOSED', operation, 'Shared body is closed.');
        this.#owner.assertReady(operation);
    }
    private assertRead(operation: string): void {
        if (this.#closed) throw worldError('AIR_E_BOX3D_DISPOSED', operation, 'Shared body is closed.');
        this.#owner.assertCommittedRead(operation);
    }
    assertConfiguration(operation: string): void {
        this.assert(operation);
    }
    completeComponent(reference: object): void {
        this.#owner.completeComponent(reference);
    }
    componentEnabled(reference: object, enabled: boolean): void {
        this.#owner.componentEnabled(reference, enabled);
    }
    private nodePose(): readonly number[] {
        const p = this.#node.worldPosition;
        const q = this.#node.worldRotation;
        return Object.freeze([p.x, p.y, p.z, q.x, q.y, q.z, q.w]);
    }
    /** Raw local/ancestor validation precedes all cache-refreshing world reads and native mutations. */
    preflight(): void {
        if (this.#closed) throw worldError('AIR_E_BOX3D_DISPOSED', 'preflight', 'Shared body is closed.');
        this.#scene.preflight();
        const state = this.#binding.bodyState(this.#world, this.#body);
        if (state.enabled && state.type === 2 && state.massPending)
            throw worldError('AIR_E_BOX3D_MASS_PENDING', 'step preflight', 'Dynamic body needs effective geometry.');
    }
    /** Full copied origin batch, without exposing native body tokens to the world or Node adapter. */
    static captureWriteback(bodies: readonly Box3DSharedBody[]): readonly Box3DWritebackBody[] {
        if (!bodies.length) return Object.freeze([]);
        const first = bodies[0];
        for (const body of bodies)
            if (body.#closed || body.#binding !== first.#binding || body.#world !== first.#world)
                throw worldError('AIR_E_BOX3D_CONFIG', 'writeback', 'Body ownership changed.');
        const states = bodies.map((body) => body.#binding.bodyState(body.#world, body.#body));
        const transforms = first.#binding.bodyTransforms(
            first.#world,
            bodies.map((body) => body.#body),
        );
        if (transforms.length !== bodies.length * 10 || !transforms.every(Number.isFinite))
            throw worldError(
                'AIR_E_BOX3D_ABI',
                'bodyTransforms',
                'Expected one finite copied origin transform per body.',
            );
        return Object.freeze(
            bodies.map((body, index) => {
                const references = Array.from(body.#references);
                const referenceState = references.map((reference) => (reference as { enabled?: unknown }).enabled);
                const rigid = body.#rigidBody,
                    enabled = body.#rigidEnabled,
                    type = body.#type;
                const active = body.#node.activeInHierarchy;
                return Object.freeze({
                    scene: body.#scene,
                    origin: Object.freeze(Array.from(transforms.slice(index * 10, index * 10 + 7))),
                    writable: states[index].enabled && states[index].type !== 0,
                    assertOwner: () => {
                        if (
                            body.#closed ||
                            body.#rigidBody !== rigid ||
                            body.#rigidEnabled !== enabled ||
                            body.#type !== type ||
                            body.#node.activeInHierarchy !== active ||
                            body.#references.size !== references.length ||
                            references.some(
                                (reference, i) =>
                                    !body.#references.has(reference) ||
                                    (reference as { enabled?: unknown }).enabled !== referenceState[i],
                            )
                        )
                            throw worldError(
                                'AIR_E_BOX3D_CONFIG',
                                'writeback',
                                'Component ownership changed during the batch.',
                            );
                    },
                });
            }),
        );
    }
    retain(reference: object, component: Box3DOwnedComponentSeed): void {
        this.assert('retain body');
        if (this.#references.has(reference)) throw worldError('AIR_E_BOX3D_CONFIG', 'retain body', 'Duplicate owner.');
        this.#owner.attachComponent(this.#logical, component);
        this.#references.add(reference);
    }
    release(reference: object): void {
        if (this.#closed) return; // World destruction already invalidated every component reference.
        if (this.#owner.isFaulted()) {
            // Cleanup-only: remove JS owners, never retry unknown native mutations or remove world ownership.
            this.#owner.releaseComponent(reference);
            this.#references.delete(reference);
            this.#shapes.delete(reference);
            return;
        }
        this.assert('release body');
        if (!this.#references.has(reference))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'release body', 'Unknown owner.');
        if (this.#references.size > 1) {
            this.#owner.releaseComponent(reference);
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
        try {
            this.#owner.releaseComponent(reference);
        } catch (error) {
            // Native body destruction already returned. Do not retry it after JS lease cleanup failure.
            this.#owner.fault(error);
            throw error;
        }
        this.#references.delete(reference);
        this.#closed = true;
        this.#owner.released(this.#node, this, this.#logical);
    }
    closeWithWorld(): void {
        this.#closed = true;
        this.#references.clear();
        this.#shapes.clear();
        this.#rigidBody = null;
    }
    /** Only empty event-listener cleanup may bypass normal operations after terminal ownership. */
    get cleanupOnly(): boolean {
        return this.#closed || this.#owner.isFaulted();
    }
    get rigidBody(): RigidBody | null {
        return this.#rigidBody;
    }
    get state(): Box3DBodyState {
        this.assertRead('bodyState');
        return this.#binding.bodyState(this.#world, this.#body);
    }
    get impl(): Readonly<{ backend: 'box3d'; kind: 'shared-body' }> {
        this.assertRead('body impl');
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
            // Error codes do not establish phase. Unknown/committed results are conservatively fatal.
            if (!mutationNotApplied(error)) {
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
        this.readFilter(); // Every current native shape is validated before the first body-control write.
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
            this.setFilter(next.group, next.mask);
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
        if (!enabled && (this.#closed || this.#owner.isFaulted())) {
            this.#rigidEnabled = false;
            return; // Terminal cleanup only; native state is retained for world destruction, not reported disabled.
        }
        const active = enabled || this.#shapes.size > 0;
        if (this.state.enabled !== active) this.control('setBodyEnabled', active);
        this.#rigidEnabled = enabled;
    }
    detachRigidBody(): void {
        if (this.#closed || this.#owner.isFaulted()) {
            this.#rigidBody = null;
            this.#rigidEnabled = false;
            return;
        }
        this.control('setBodyType', 0);
        const active = this.#shapes.size > 0;
        if (this.state.enabled !== active) this.control('setBodyEnabled', active);
        this.#rigidEnabled = false;
        this.#type = 0;
        this.#rigidBody = null;
    }
    setType(value: number): void {
        const next = nativeBodyType(value);
        this.control('setBodyType', next);
        this.#type = next;
    }
    private readFilter(): { group: number; mask: number } {
        for (const { token } of this.#shapes.values()) {
            const value = this.#binding.getShapeFilter(this.#world, token);
            if (value.group !== this.#group || value.mask !== this.#mask)
                throw worldError(
                    'AIR_E_BOX3D_ABI',
                    'shape filter',
                    'Owned shapes no longer share their committed filter.',
                );
        }
        // No active geometry means pending configuration, not a claim of a native shape effect.
        return { group: this.#group, mask: this.#mask };
    }
    private setFilter(group: number, mask: number): void {
        this.assert('setFilter');
        const next = { group: filterBits(group), mask: filterBits(mask) };
        const shapes = [...this.#shapes.values()].map((v) => v.token);
        try {
            const result = this.#binding.setShapeFilters(this.#world, shapes, next);
            if (shapes.length) this.#owner.invalidate();
            if (result.length !== shapes.length || result.some((v) => v.group !== next.group || v.mask !== next.mask))
                throw worldError('AIR_E_BOX3D_ABI', 'setShapeFilters', 'Batch native readback mismatch.');
            this.#group = next.group;
            this.#mask = next.mask;
        } catch (error) {
            if (!mutationNotApplied(error)) {
                this.#owner.invalidate();
                this.#owner.fault(error);
            }
            throw error;
        }
    }
    getGroup(): number {
        this.assertRead('getGroup');
        return this.readFilter().group | 0;
    }
    getMask(): number {
        this.assertRead('getMask');
        return this.readFilter().mask | 0;
    }
    setGroup(value: number): void {
        this.setFilter(filterBits(value), this.#mask);
    }
    setMask(value: number): void {
        this.setFilter(this.#group, filterBits(value));
    }
    get initialScale(): readonly number[] {
        this.assertRead('initial scale');
        return this.#scale;
    }
    copiedTransform(): readonly number[] {
        this.assertRead('copied transform');
        this.#scene.preflight();
        const value = this.#binding.bodyTransforms(this.#world, [this.#body]);
        if (value.length !== 10 || !value.every(Number.isFinite))
            throw worldError('AIR_E_BOX3D_ABI', 'bodyTransforms', 'Expected one finite copied transform.');
        return Object.freeze(Array.from(value));
    }
    /** Actual native geometry allocation. A later uncertain failure is not advertised as atomic rollback. */
    setShape(reference: object, geometry: Box3DPrimitiveGeometry): void {
        this.assert('setShape');
        this.#scene.preflight();
        if (!this.#references.has(reference))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'setShape', 'Unknown component owner.');
        const previous = this.#shapes.get(reference);
        let token: Box3DId | undefined;
        let registered = false;
        try {
            token =
                geometry.kind === 'box'
                    ? this.#binding.createOffsetBox(
                          this.#body,
                          geometry.center,
                          geometry.dimensions,
                          [0, 0, 0, 1],
                          1,
                          geometry.trigger,
                      )
                    : this.#binding.createOffsetSphere(
                          this.#body,
                          geometry.center,
                          geometry.dimensions[0],
                          1,
                          geometry.trigger,
                      );
            this.#owner.invalidate();
            this.#binding.configureShapeEvents(token, { sensor: false, contact: false, hit: false });
            const filter = this.#binding.setShapeFilters(this.#world, [token], {
                group: this.#group,
                mask: this.#mask,
            });
            if (filter.length !== 1 || filter[0].group !== this.#group || filter[0].mask !== this.#mask)
                throw worldError('AIR_E_BOX3D_ABI', 'shape creation', 'Filter readback mismatch.');
            if (geometry.material) this.#binding.setShapeMaterial(this.#world, token, geometry.material);
            this.#owner.registerShapeMaterial(token, geometry.material === null);
            registered = true;
            if (geometry.material) {
                const actual = this.#binding.getShapeMaterial(this.#world, token);
                if (
                    actual.friction !== geometry.material.friction ||
                    actual.restitution !== geometry.material.restitution
                )
                    throw worldError('AIR_E_BOX3D_ABI', 'shape creation', 'Material readback mismatch.');
            }
            if (previous) {
                this.#binding.destroyShape(previous.token);
                this.#owner.unregisterShapeMaterial(previous.token);
            }
            this.#shapes.set(reference, { token, geometry });
            if (!this.state.enabled) this.control('setBodyEnabled', true);
        } catch (error) {
            // Candidate cleanup does not restore native contact history. The whole world is conservatively faulted.
            let failure = error;
            try {
                if (token) {
                    this.#binding.destroyShape(token);
                    if (registered) this.#owner.unregisterShapeMaterial(token);
                }
            } catch (cleanupError) {
                failure = Object.assign(
                    worldError('AIR_E_BOX3D_WORLD_FAULTED', 'shape cleanup', 'World owns unresolved cleanup.'),
                    { cause: error, cleanupError },
                );
            }
            this.#owner.invalidate();
            this.#owner.fault(failure);
            throw failure;
        }
    }
    removeShape(reference: object): void {
        if (this.#closed || this.#owner.isFaulted()) return; // Final native cleanup belongs to the world.
        this.assert('removeShape');
        const value = this.#shapes.get(reference);
        if (!value) return;
        try {
            this.#binding.destroyShape(value.token);
            this.#owner.invalidate();
            this.#owner.unregisterShapeMaterial(value.token);
            this.#shapes.delete(reference);
            const active = this.#rigidEnabled || this.#shapes.size > 0;
            if (this.state.enabled !== active) this.control('setBodyEnabled', active);
        } catch (error) {
            this.#owner.invalidate();
            this.#owner.fault(error);
            throw error;
        }
    }
    /** Internal exact-authority route, never used by ordinary component setters. */
    applyCopiedMaterial(reference: object, authority: object, value: Readonly<Box3DSurfaceMaterial> | null): void {
        if (this.#closed || !this.#references.has(reference))
            throw worldError('AIR_E_BOX3D_DISPOSED', 'copied shape material', 'Unknown live adapter.');
        const shape = this.#shapes.get(reference);
        this.#owner.applyCopiedMaterial(reference, authority, shape?.token ?? null, value);
        if (shape)
            this.#shapes.set(reference, {
                token: shape.token,
                geometry: Object.freeze({ ...shape.geometry, material: value }),
            });
    }
    updateShapeMaterial(reference: object, value: Box3DSurfaceMaterial | null): void {
        this.assert('updateShapeMaterial');
        const shape = this.#shapes.get(reference);
        if (!shape) throw worldError('AIR_E_BOX3D_DISPOSED', 'shape material', 'Shape is inactive.');
        this.#owner.updateShapeMaterial(shape.token, value);
        this.#shapes.set(reference, {
            token: shape.token,
            geometry: Object.freeze({ ...shape.geometry, material: value }),
        });
    }
}
