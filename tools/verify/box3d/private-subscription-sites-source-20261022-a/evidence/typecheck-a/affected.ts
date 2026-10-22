
 import { beginPhysicsMaterialChange, capturePhysicsMaterialCleanup } from './physics-material-transaction';
 import type { PhysicsMaterialIdentity, PhysicsMaterialCleanupError, PhysicsMaterialCleanupStage } from './physics-material-transaction';
 import { assertMutationAllowed } from './mutation-guard';
 declare class PhysicsMaterial {
   static readonly EVENT_UPDATE: string; id: string;
   friction: number; restitution: number; rollingFriction: number; spinningFriction: number;
   on(event: string, callback: () => void, target: object): void;
   off(event: string, callback: () => void, target: object): void;
   clone(): PhysicsMaterial;
 }
 interface Shape {
   setMaterial(value: PhysicsMaterial | null): void;
   initialize(collider: Collider): void;
   onLoad?(): void;
   onDestroy?(): void;
   updateEventListener(): void;
 }
 declare const selector: { id: string; runInEditor: boolean };
 declare function createShape(type: number): Shape;
 const observedMaterialAssets = new WeakMap<Collider, Set<PhysicsMaterial>>();
function retainObservedMaterial (collider: Collider, material: PhysicsMaterial | null): void {
    let assets = observedMaterialAssets.get(collider);
    if (!assets) observedMaterialAssets.set(collider, assets = new Set());
    if (material) assets.add(material);
}
 class Collider {
   protected _material: PhysicsMaterial | null = null;
   protected _isSharedMaterial = true;
   protected _shape: Shape | null = null;
   protected _needTriggerEvent = false;
   protected _needCollisionEvent = false;
   protected _boundingSphere: { destroy(): void } | null = null;
   public sharedMaterial: PhysicsMaterial | null = null;
   readonly type = 0;
   public get material (): PhysicsMaterial | null {
        if (this._isSharedMaterial && this._material) {
            assertMutationAllowed(this, 'Collider.material.get');
            const change = beginPhysicsMaterialChange(this, 'collider-material-clone');
            if (change) {
                try {
                    if (change.privateSubscriptions) retainObservedMaterial(this, null);
                    change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));
                    change.effect('clone-allocation-entered');
                    const previous = this._material;
                    const cloned = previous.clone();
                    change.acceptClone(cloned);
                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, previous);
                        change.effect('listener-edit-entered');
                        previous.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                        observedMaterialAssets.get(this)!.delete(previous);
                    }
                    this._material = cloned;
                    change.effect('cache-written');
                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, cloned);
                        cloned.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    }
                    this._isSharedMaterial = false;
                    if (!change.privateSubscriptions) change.effect('listeners-complete');
                    change.commit(() => this._materialIdentity());
                } catch (error) { change.fail(error, () => this._materialIdentity()); }
                finally { change.dispose(); }
                return this._material;
            }
            this._material.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            this._material = this._material.clone();
            this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            this._isSharedMaterial = false;
        }
        return this._material;
    }
public set material (value) {
        assertMutationAllowed(this, 'Collider.material.set');
        const change = beginPhysicsMaterialChange(this, 'collider-material-set');
        if (change) {
            try {
                if (change.privateSubscriptions) retainObservedMaterial(this, null);
                change.prepare(() => ({ before: this._materialIdentity(), candidate: { kind: 'collider-material', material: value, shared: this._isSharedMaterial } }));
                change.apply();
                if (this._material !== value) {
                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, this._material);
                        change.effect('listener-edit-entered');
                        this._material?.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                        if (this._material) observedMaterialAssets.get(this)!.delete(this._material);
                        retainObservedMaterial(this, value);
                        value?.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    }
                    if (this._material && value) this._isSharedMaterial = false;
                    this._material = value;
                    change.effect('cache-written');
                    if (!change.privateSubscriptions) change.effect('listeners-complete');
                }
                change.commit(() => this._materialIdentity());
            } catch (error) { change.fail(error, () => this._materialIdentity()); }
            finally { change.dispose(); }
            return;
        }
        if (this._shape) {
            const nativeFirst = selector.id === 'box3d';
            if (nativeFirst) this._shape.setMaterial(value);
            if (value && this._material) {
                if (this._material.id !== value.id) {
                    this._material.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    value.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    this._isSharedMaterial = false;
                    this._material = value;
                }
            } else if (value && !this._material) {
                value.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                this._material = value;
            } else if (!value && this._material) {
                this._material.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                this._material = value;
            }
            if (!nativeFirst) this._updateMaterial();
        } else {
            this._material = value;
        }
    }
protected onLoad (): void {
        if (!selector.runInEditor) return;

        const nativeFirst = selector.id === 'box3d';
        if (!nativeFirst) this.sharedMaterial = this._material;
        this._shape = createShape(this.type);
        this._shape.initialize(this);
        const change = beginPhysicsMaterialChange(this, 'collider-material-initialize');
        if (change) {
            try {
                if (change.privateSubscriptions) retainObservedMaterial(this, null);
                change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));
                this._shape.onLoad!();
                if (!change.privateSubscriptions) {
                    retainObservedMaterial(this, this._material);
                    change.effect('listener-edit-entered');
                    this._material?.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    change.effect('listeners-complete');
                }
                change.commit(() => this._materialIdentity());
            } catch (error) { change.fail(error, () => this._materialIdentity()); }
            finally { change.dispose(); }
            return;
        }
        this._shape.onLoad!();
        if (nativeFirst && this._material) this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
    }
protected onDestroy (): void {
        const assets = observedMaterialAssets.get(this);
        if (assets) {
            // Capture before adapter unregister; the one-shot report remains readable after release.
            const reporter = capturePhysicsMaterialCleanup(this);
            const failures: PhysicsMaterialCleanupError[] = [];
            const attempt = (stage: PhysicsMaterialCleanupStage, perform: () => void): void => {
                try { perform(); } catch (error) { failures.push({ stage, error }); }
            };
            let reportFailed = false;
            let reportError: unknown;
            try {
                this._needTriggerEvent = false;
                this._needCollisionEvent = false;
                if (this._shape) attempt('event-listener-clear', () => this._shape!.updateEventListener());
                for (const material of assets) attempt('material-off', () => {
                    material.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    assets.delete(material);
                });
                if (this._shape) attempt('adapter-destroy', () => this._shape!.onDestroy!());
                if (this._boundingSphere) attempt('bounds-destroy', () => this._boundingSphere!.destroy());
                if (!assets.size) observedMaterialAssets.delete(this);
            } finally {
                try { reporter?.complete(failures); }
                catch (error) { reportFailed = true; reportError = error; }
            }
            if (failures.length) throw failures[0].error;
            if (reportFailed) throw reportError;
            return;
        }
        if (this._shape) {
            this._needTriggerEvent = false;
            this._needCollisionEvent = false;
            this._shape.updateEventListener();
            if (this._material) this._material.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            this._shape.onDestroy!();
        }
        if (this._boundingSphere) this._boundingSphere.destroy();
    }
private _materialIdentity (): PhysicsMaterialIdentity {
        return { kind: 'collider-material', material: this._material, shared: this._isSharedMaterial };
    }
private _updateMaterial (): void {
        if (this._shape) this._shape.setMaterial(this._material);
    }
 }
 class PhysicsSystem {
   private _material!: PhysicsMaterial;
   physicsWorld!: { setDefaultMaterial(material: PhysicsMaterial): void };
   private _updateMaterial(): void {}
   public setDefaultPhysicsMaterial (material: PhysicsMaterial): void {
        assertMutationAllowed(this, 'PhysicsSystem.setDefaultPhysicsMaterial');
        const change = beginPhysicsMaterialChange(this, 'system-default-material-set');
        if (change) {
            try {
                change.prepare(() => ({
                    before: { kind: 'system-default-material', material: this._material ?? null },
                    candidate: { kind: 'system-default-material', material },
                }));
                change.apply();
                if (!change.privateSubscriptions) {
                    change.effect('listener-edit-entered');
                    if (this._material !== material) this._material?.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                }
                this._material = material;
                change.effect('cache-written');
                if (!change.privateSubscriptions) {
                    this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    change.effect('listeners-complete');
                }
                change.commit(() => ({ kind: 'system-default-material', material: this._material }));
            } catch (error) { change.fail(error, () => ({ kind: 'system-default-material', material: this._material ?? null })); }
            finally { change.dispose(); }
            return;
        }
        if (selector.id === 'box3d') {
            this.physicsWorld.setDefaultMaterial(material);
            if (this._material !== material) {
                this._material?.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            }
            this._material = material;
            this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            return;
        }
        this._material = material;
        this.physicsWorld.setDefaultMaterial(this._material);
        this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
    }
 }
 