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
import type { Collider } from '../../../cocos/physics/framework/components/colliders/collider';
import type { BoxCollider } from '../../../cocos/physics/framework/components/colliders/box-collider';
import type { SphereCollider } from '../../../cocos/physics/framework/components/colliders/sphere-collider';
import type { PhysicsMaterial } from '../../../cocos/physics/framework/assets/physics-material';
import type { IBoxShape, ISphereShape } from '../../../cocos/physics/spec/i-physics-shape';
import type { IVec3Like } from '../../../cocos/core/math/type-define';
import type { AABB } from '../../../cocos/core/geometry/aabb';
import type { Sphere } from '../../../cocos/core/geometry/sphere';
import type { Box3DPhysicsWorld } from './world';
import type { Box3DSurfaceMaterial } from './world-binding';
import type { Box3DComponentConfiguration } from './shared-body';
import type { Box3DPrimitiveGeometry } from './box-sphere-geometry';
import { Box3DSharedBody, bodyVector, filterBits } from './shared-body';
import { primitiveBounds, primitiveGeometry, primitiveMaterial } from './box-sphere-geometry';
import { worldError } from './world-binding';
import { unsupportedBox3D } from './unsupported';

class Box3DPrimitiveShape {
    readonly #world: () => Box3DPhysicsWorld;
    readonly #configuration: Box3DComponentConfiguration;
    readonly #kind: 'box' | 'sphere';
    #collider: Collider | null = null;
    #body: Box3DSharedBody | null = null;
    #center: readonly number[] = Object.freeze([0, 0, 0]);
    #dimensions: readonly number[] = Object.freeze([]);
    #material: Readonly<Box3DSurfaceMaterial> | null = null;
    #trigger = false;
    #active = false;
    #geometry: Box3DPrimitiveGeometry | null = null;
    constructor(kind: 'box' | 'sphere', world: () => Box3DPhysicsWorld, configuration: Box3DComponentConfiguration) {
        this.#kind = kind;
        this.#world = world;
        this.#configuration = configuration;
    }
    get collider(): Collider {
        if (!this.#collider) throw worldError('AIR_E_BOX3D_DISPOSED', 'collider', 'Shape component is not live.');
        return this.#collider;
    }
    private get body(): Box3DSharedBody {
        if (!this.#body) throw worldError('AIR_E_BOX3D_DISPOSED', 'shape body', 'Shape component is not live.');
        return this.#body;
    }
    get impl() {
        return Object.freeze({ backend: 'box3d', kind: this.#kind + '-shape', active: this.#active });
    }
    get attachedRigidBody() {
        return this.body.rigidBody;
    }
    initialize(value: Collider): void {
        if (this.#body) throw worldError('AIR_E_BOX3D_CONFIG', 'shape initialize', 'Already initialized.');
        if (value.needCollisionEvent || value.needTriggerEvent) unsupportedBox3D('collider event listeners (T15)');
        const center = bodyVector(value.center, 'center');
        const dimensions =
            this.#kind === 'box'
                ? bodyVector((value as BoxCollider).size, 'box size')
                : [(value as SphereCollider).radius];
        const material = primitiveMaterial(value.sharedMaterial);
        const scale = bodyVector(value.node.worldScale, 'initial shape scale');
        const geometry = primitiveGeometry(this.#kind, center, dimensions, scale, value.isTrigger, material);
        const body = this.#world().acquireSharedBody(value.node, this, this.#configuration);
        this.#collider = value;
        this.#body = body;
        this.#center = center;
        this.#dimensions = Object.freeze([...dimensions]);
        this.#material = material;
        this.#trigger = value.isTrigger;
        this.#geometry = geometry;
    }
    onLoad(): void {
        void this.body;
    } // Geometry configuration was strictly validated during initialize.
    onEnable(): void {
        if (this.#active) return;
        this.body.setShape(this, this.#geometry!);
        this.#active = true;
    }
    onDisable(): void {
        if (!this.#active) return;
        this.body.removeShape(this);
        this.#active = false;
    }
    onDestroy(): void {
        if (!this.#body) return;
        this.#body.removeShape(this);
        this.#body.release(this);
        this.#body = null;
        this.#collider = null;
        this.#geometry = null;
        this.#active = false;
    }
    private candidate(center = this.#center, dimensions = this.#dimensions, trigger = this.#trigger) {
        return primitiveGeometry(this.#kind, center, dimensions, this.body.initialScale, trigger, this.#material);
    }
    setCenter(value: IVec3Like): void {
        const center = bodyVector(value, 'center');
        const next = this.candidate(center);
        if (this.#active) this.body.setShape(this, next);
        this.#center = center;
        this.#geometry = next;
    }
    setAsTrigger(value: boolean): void {
        const next = this.candidate(this.#center, this.#dimensions, value);
        if (this.#active) this.body.setShape(this, next);
        this.#trigger = value;
        this.#geometry = next;
    }
    setMaterial(value: PhysicsMaterial | null): void {
        const material = primitiveMaterial(value);
        if (this.#active) this.body.updateShapeMaterial(this, material);
        this.#material = material;
        this.#geometry = Object.freeze({ ...this.#geometry!, material });
    }
    protected updateDimensions(value: readonly number[]): void {
        const next = this.candidate(this.#center, value);
        if (this.#active) this.body.setShape(this, next);
        this.#dimensions = Object.freeze([...value]);
        this.#geometry = next;
    }
    updateEventListener(): void {
        if (this.collider.needCollisionEvent || this.collider.needTriggerEvent)
            unsupportedBox3D('collider event listeners (T15)');
        // Every native shape is configured with real native event flags disabled at creation.
    }
    getAABB(out: AABB): void {
        const value = primitiveBounds(this.#geometry!, this.body.copiedTransform());
        [out.center.x, out.center.y, out.center.z] = value.center;
        [out.halfExtents.x, out.halfExtents.y, out.halfExtents.z] = value.halfExtents;
    }
    getBoundingSphere(out: Sphere): void {
        const value = primitiveBounds(this.#geometry!, this.body.copiedTransform());
        [out.center.x, out.center.y, out.center.z] = value.center;
        out.radius = value.radius;
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
export class Box3DBoxShape extends Box3DPrimitiveShape implements IBoxShape {
    constructor(world: () => Box3DPhysicsWorld, configuration: Box3DComponentConfiguration) {
        super('box', world, configuration);
    }
    updateSize(value: IVec3Like = (this.collider as BoxCollider).size): void {
        this.updateDimensions(bodyVector(value, 'box size'));
    }
}
export class Box3DSphereShape extends Box3DPrimitiveShape implements ISphereShape {
    constructor(world: () => Box3DPhysicsWorld, configuration: Box3DComponentConfiguration) {
        super('sphere', world, configuration);
    }
    updateRadius(value: number = (this.collider as SphereCollider).radius): void {
        this.updateDimensions([value]);
    }
}
