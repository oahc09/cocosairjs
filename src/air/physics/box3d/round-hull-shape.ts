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
import type { PhysicsMaterial } from '../../../cocos/physics/framework/assets/physics-material';
import type { ICylinderShape, IConeShape } from '../../../cocos/physics/spec/i-physics-shape';
import type { CylinderCollider } from '../../../cocos/physics/framework/components/colliders/cylinder-collider';
import type { ConeCollider } from '../../../cocos/physics/framework/components/colliders/cone-collider';
import type { IVec3Like } from '../../../cocos/core/math/type-define';
import type { AABB } from '../../../cocos/core/geometry/aabb';
import type { Sphere } from '../../../cocos/core/geometry/sphere';
import type { Box3DPhysicsWorld } from './world';
import type { Box3DSurfaceMaterial } from './world-binding';
import type { Box3DComponentConfiguration } from './shared-body';
import type { Box3DHullGeometry } from './hull-geometry';
import { Box3DSharedBody, bodyVector, filterBits } from './shared-body';
import { primitiveMaterial } from './box-sphere-geometry';
import { hullBounds } from './hull-geometry';
import { roundHullGeometry, BOX3D_ROUND_HULL_ALGORITHM, BOX3D_ROUND_HULL_SEGMENTS } from './round-hull-geometry';
import type { Box3DRoundHullKind } from './round-hull-geometry';
import { worldError } from './world-binding';
import { unsupportedBox3D } from './unsupported';

export class Box3DRoundHullShape implements ICylinderShape, IConeShape {
    readonly #kind: Box3DRoundHullKind;
    readonly #world: () => Box3DPhysicsWorld;
    readonly #configuration: Box3DComponentConfiguration;
    #collider: Collider | null = null;
    #shared: Box3DSharedBody | null = null;
    #center: readonly number[] = Object.freeze([0, 0, 0]);
    #dimensions: readonly number[] = Object.freeze([0.5, 2, 1]);
    #material: Readonly<Box3DSurfaceMaterial> | null = null;
    #trigger = false;
    #active = false;
    #geometry: Box3DHullGeometry | null = null;
    constructor(kind: Box3DRoundHullKind, world: () => Box3DPhysicsWorld, configuration: Box3DComponentConfiguration) {
        this.#kind = kind;
        this.#world = world;
        this.#configuration = configuration;
    }
    get collider(): Collider {
        if (!this.#collider) throw worldError('AIR_E_BOX3D_DISPOSED', 'collider', 'Shape component is not live.');
        return this.#collider;
    }
    get #body(): Box3DSharedBody {
        if (!this.#shared) throw worldError('AIR_E_BOX3D_DISPOSED', 'shape body', 'Shape component is not live.');
        return this.#shared;
    }
    get impl() {
        void this.#body.impl;
        return Object.freeze({
            backend: 'box3d',
            kind: this.#kind,
            representation: 'hull-approximation',
            segments: BOX3D_ROUND_HULL_SEGMENTS,
            algorithm: BOX3D_ROUND_HULL_ALGORITHM,
            active: this.#active,
        });
    }
    get attachedRigidBody() {
        return this.#body.rigidBody;
    }
    initialize(value: Collider): void {
        this.#world().assertComponentConfiguration('Collider initialize');
        if (this.#shared) throw worldError('AIR_E_BOX3D_CONFIG', 'shape initialize', 'Already initialized.');
        const prepared = this.#world().prepareInitialShapeMaterial(this, value, (asset) => {
            if (value.needCollisionEvent || value.needTriggerEvent)
                unsupportedBox3D('round hull public collision/trigger events are not qualified');
            const center = bodyVector(value.center, 'center');
            const component = value as CylinderCollider | ConeCollider;
            const dimensions = Object.freeze([component.radius, component.height, component.direction]);
            const material = primitiveMaterial(asset);
            const scale = bodyVector(value.node.worldScale, 'initial shape scale');
            const trigger = value.isTrigger;
            const geometry = roundHullGeometry(this.#kind, center, dimensions, scale, trigger, material);
            return Object.freeze({ center, dimensions, material, trigger, geometry });
        });
        const { material: asset, initialization } = prepared;
        const { center, dimensions, material, trigger, geometry } = prepared.copied;
        try {
            initialization.assertValid();
            // Preserve the component for its real onDestroy listener-clearing callback if native acquisition fails.
            this.#collider = value;
            const body = this.#world().acquireSharedBody(value.node, this, this.#configuration, {
                adapter: this,
                component: value,
                kind: 'collider',
                material: asset,
                applyMaterial: (authority, copied) => {
                    this.#body.applyCopiedMaterial(this, authority, copied);
                    this.#material = copied;
                    this.#geometry = this.#geometry ? Object.freeze({ ...this.#geometry, material: copied }) : null;
                },
                prepareMaterialValues: (authority, copied) => {
                    const body = this.#body;
                    const plan = body.prepareMaterialValues(this, authority, copied);
                    const previous = this.#geometry;
                    const next = previous ? Object.freeze({ ...previous, material: copied }) : null;
                    let committed = false;
                    return Object.freeze({
                        shape: plan.shape,
                        commitCaches: () => {
                            if (committed || this.#shared !== body || this.#geometry !== previous)
                                throw worldError(
                                    'AIR_E_BOX3D_REENTRANT',
                                    'commit material geometry',
                                    'Consumed or stale geometry.',
                                );
                            committed = true;
                            plan.commitCaches();
                            this.#material = copied;
                            this.#geometry = next;
                        },
                    });
                },
            });
            // Retain the actual acquired body before validation can throw, so onDestroy can clean it.
            this.#shared = body;
            initialization.assertValid();
            this.#center = center;
            if (geometry) body.validateHull(geometry.positions);
            this.#dimensions = dimensions;
            this.#material = material;
            this.#trigger = trigger;
            this.#geometry = geometry;
            initialization.complete();
            // Actual Collider.onLoad listener/cache commit completes this identity.
        } catch (error) {
            throw initialization.fail(error);
        } finally {
            initialization.close();
        }
    }
    onLoad(): void {
        void this.#body;
    } // Geometry configuration was strictly validated during initialize.
    onEnable(): void {
        this.assertConfiguration('onEnable');
        if (this.#active) return;
        if (this.#geometry) this.#body.setShape(this, this.#geometry);
        this.#active = true;
        this.#body.componentEnabled(this, true);
    }
    onDisable(): void {
        if (!this.#active) return;
        this.#body.removeShape(this);
        this.#active = false;
        this.#body.componentEnabled(this, false);
    }
    onDestroy(): void {
        if (!this.#shared) return;
        this.#shared.removeShape(this);
        this.#shared.release(this);
        this.#shared = null;
        this.#collider = null;
        this.#geometry = null;
        this.#active = false;
    }
    protected assertConfiguration(operation: string): void {
        this.#body.assertConfiguration(operation);
    }
    private candidate(center = this.#center, dimensions = this.#dimensions, trigger = this.#trigger) {
        return roundHullGeometry(this.#kind, center, dimensions, this.#body.initialScale, trigger, this.#material);
    }
    private applyCandidate(next: Box3DHullGeometry): void {
        if (this.#active) this.#body.setShape(this, next);
        else this.#body.validateHull(next.positions);
    }
    private setDimension(index: number, value: number): void {
        const dimensions = [...this.#dimensions];
        dimensions[index] = value;
        const next = this.candidate(this.#center, dimensions);
        this.applyCandidate(next);
        this.#dimensions = Object.freeze(dimensions);
        this.#geometry = next;
    }
    setRadius(value: number): void {
        this.assertConfiguration('setRadius');
        this.setDimension(0, value);
    }
    setHeight(value: number): void {
        this.assertConfiguration('setHeight');
        this.setDimension(1, value);
    }
    setDirection(value: number): void {
        this.assertConfiguration('setDirection');
        this.setDimension(2, value);
    }
    setCenter(value: IVec3Like): void {
        this.assertConfiguration('setCenter');
        const center = bodyVector(value, 'center');
        const next = this.candidate(center);
        this.applyCandidate(next);
        this.#center = center;
        this.#geometry = next;
    }
    setAsTrigger(value: boolean): void {
        this.assertConfiguration('setAsTrigger');
        if (typeof value !== 'boolean')
            throw worldError('AIR_E_BOX3D_CONFIG', 'setAsTrigger', 'isTrigger must be an exact boolean.');
        const next = this.candidate(this.#center, this.#dimensions, value);
        this.applyCandidate(next);
        this.#trigger = value;
        this.#geometry = next;
    }
    setMaterial(value: PhysicsMaterial | null): void {
        this.assertConfiguration('setMaterial');
        this.#world().assertAcceptedShapeMaterialIdentity(this, value);
        void this.#body;
        const material = primitiveMaterial(value);
        if (this.#active && this.#geometry) this.#body.updateShapeMaterial(this, material);
        this.#material = material;
        this.#geometry = this.#geometry ? Object.freeze({ ...this.#geometry, material }) : null;
    }
    updateEventListener(): void {
        if (this.#shared?.cleanupOnly && !this.collider.needCollisionEvent && !this.collider.needTriggerEvent) return;
        this.assertConfiguration('updateEventListener');
        if (this.collider.needCollisionEvent || this.collider.needTriggerEvent)
            unsupportedBox3D('round hull public collision/trigger events are not qualified');
        // Native collision/query geometry is real; public hull event equations remain unqualified.
    }
    private requireGeometry(): Box3DHullGeometry {
        if (!this.#geometry)
            throw worldError('AIR_E_BOX3D_GEOMETRY', 'round hull bounds', 'Shape has not completed initialization.');
        return this.#geometry;
    }
    getAABB(out: AABB): void {
        const value = hullBounds(this.requireGeometry(), this.#body.copiedTransform());
        [out.center.x, out.center.y, out.center.z] = value.center;
        [out.halfExtents.x, out.halfExtents.y, out.halfExtents.z] = value.halfExtents;
    }
    getBoundingSphere(out: Sphere): void {
        const value = hullBounds(this.requireGeometry(), this.#body.copiedTransform());
        [out.center.x, out.center.y, out.center.z] = value.center;
        out.radius = value.radius;
    }
    getGroup(): number {
        return this.#body.getGroup();
    }
    setGroup(value: number): void {
        this.assertConfiguration('setGroup');
        this.#body.setGroup(value);
    }
    addGroup(value: number): void {
        this.assertConfiguration('addGroup');
        this.setGroup(this.getGroup() | filterBits(value));
    }
    removeGroup(value: number): void {
        this.assertConfiguration('removeGroup');
        this.setGroup(this.getGroup() & ~filterBits(value));
    }
    getMask(): number {
        return this.#body.getMask();
    }
    setMask(value: number): void {
        this.assertConfiguration('setMask');
        this.#body.setMask(value);
    }
    addMask(value: number): void {
        this.assertConfiguration('addMask');
        this.setMask(this.getMask() | filterBits(value));
    }
    removeMask(value: number): void {
        this.assertConfiguration('removeMask');
        this.setMask(this.getMask() & ~filterBits(value));
    }
}
