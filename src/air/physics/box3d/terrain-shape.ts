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
import type { ITerrainShape } from '../../../cocos/physics/spec/i-physics-shape';
import type { TerrainCollider } from '../../../cocos/physics/framework/components/colliders/terrain-collider';
import type { ITerrainAsset } from '../../../cocos/physics/spec/i-external';
import type { IVec3Like } from '../../../cocos/core/math/type-define';
import type { AABB } from '../../../cocos/core/geometry/aabb';
import type { Sphere } from '../../../cocos/core/geometry/sphere';
import type { Box3DPhysicsWorld } from './world';
import type { Box3DSurfaceMaterial } from './world-binding';
import type { Box3DComponentConfiguration } from './shared-body';
import { RigidBody } from '../../../cocos/physics/framework/components/rigid-body';
import { copyTerrainSource, copyTerrainVector, terrainGeometry } from './terrain-intake';
import type { TerrainSource } from './terrain-intake';
import type { Box3DStaticMeshGeometry } from './static-mesh-resource';
import { Box3DSharedBody, filterBits } from './shared-body';
import { primitiveMaterial } from './box-sphere-geometry';
import { hullBounds } from './hull-geometry';
import { worldError } from './world-binding';
import { unsupportedBox3D } from './unsupported';

export class Box3DTerrainShape implements ITerrainShape {
    readonly #world: () => Box3DPhysicsWorld;
    readonly #configuration: Box3DComponentConfiguration;
    #collider: Collider | null = null;
    #shared: Box3DSharedBody | null = null;
    #center: readonly number[] = Object.freeze([0, 0, 0]);
    #source: TerrainSource | null = null;
    #scale: readonly number[] = Object.freeze([1, 1, 1]);
    #material: Readonly<Box3DSurfaceMaterial> | null = null;
    #trigger = false;
    #active = false;
    #geometry: Box3DStaticMeshGeometry | null = null;
    constructor(world: () => Box3DPhysicsWorld, configuration: Box3DComponentConfiguration) {
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
            kind: 'terrain-shape',
            nativeKind: 'mesh',
            provenance: 'heightfield-cooked-static-triangle-mesh',
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
            if (value.needCollisionEvent || value.needTriggerEvent) unsupportedBox3D('collider event listeners (T15)');
            const center = copyTerrainVector(value.center);
            const component = value as TerrainCollider;
            const source = copyTerrainSource(component.terrain);
            const material = primitiveMaterial(asset);
            const scale = copyTerrainVector(value.node.worldScale);
            const trigger = value.isTrigger;
            const rigid = value.node.getComponent(RigidBody);
            if (rigid && rigid.type !== 2) unsupportedBox3D('TerrainCollider requires a static RigidBody');
            const geometry = terrainGeometry(
                source,
                center,
                scale,
                trigger,
                material,
                this.#world().staticMeshIdentity,
            );
            return Object.freeze({ center, scale, source, material, trigger, geometry });
        });
        const { material: asset, initialization } = prepared;
        const { center, scale, source, material, trigger, geometry } = prepared.copied;
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
            this.#scale = scale;
            body.assertStaticMesh();
            if (geometry) body.validateStaticMesh(geometry);
            this.#source = source;
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
        this.#body.assertStaticMesh();
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
        this.#source = null;
        this.#active = false;
    }
    protected assertConfiguration(operation: string): void {
        this.#body.assertConfiguration(operation);
    }
    private candidate(center = this.#center, trigger = this.#trigger, source = this.#source) {
        this.#body.assertStaticMesh();
        return terrainGeometry(source, center, this.#scale, trigger, this.#material, this.#world().staticMeshIdentity);
    }
    private applyCandidate(next: Box3DStaticMeshGeometry | null): void {
        if (this.#active) {
            if (next) this.#body.setShape(this, next);
            else if (this.#geometry) this.#body.removeShape(this);
        } else if (next) {
            // Disabled setters must still reject failed cooking before either adapter or component cache changes.
            this.#body.validateStaticMesh(next);
        }
    }
    setTerrain(value: ITerrainAsset | null): void {
        this.assertConfiguration('setTerrain');
        this.#body.assertStaticMesh();
        const source = copyTerrainSource(value);
        const next = this.candidate(this.#center, this.#trigger, source);
        this.applyCandidate(next);
        this.#source = source;
        this.#geometry = next;
    }
    setCenter(value: IVec3Like): void {
        this.assertConfiguration('setCenter');
        const center = copyTerrainVector(value);
        const next = this.candidate(center);
        this.applyCandidate(next);
        this.#center = center;
        this.#geometry = next;
    }
    setAsTrigger(value: boolean): void {
        this.assertConfiguration('setAsTrigger');
        if (typeof value !== 'boolean')
            throw worldError('AIR_E_BOX3D_CONFIG', 'setAsTrigger', 'isTrigger must be an exact boolean.');
        const next = this.candidate(this.#center, value);
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
            unsupportedBox3D('collider event listeners (T15)');
        // Every native shape is configured with real native event flags disabled at creation.
    }
    private requireGeometry(): Box3DStaticMeshGeometry {
        if (!this.#geometry)
            throw worldError('AIR_E_BOX3D_GEOMETRY', 'terrain bounds', 'TerrainCollider is pending without geometry.');
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
