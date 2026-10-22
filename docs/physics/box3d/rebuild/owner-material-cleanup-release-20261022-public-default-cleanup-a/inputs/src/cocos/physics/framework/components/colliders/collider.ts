/* eslint-disable @typescript-eslint/no-namespace */
/*
 Copyright (c) 2020-2023 Xiamen Yaji Software Co., Ltd.

 https://www.cocos.com/

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights to
 use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
 of the Software, and to permit persons to whom the Software is furnished to do so,
 subject to the following conditions:

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

import { beginPhysicsMaterialChange, capturePhysicsMaterialCleanup } from '../../physics-material-transaction';
import type { PhysicsMaterialIdentity, PhysicsMaterialCleanupError, PhysicsMaterialCleanupStage } from '../../physics-material-transaction';
import { assertMutationAllowed } from '../../../../core/data/mutation-guard';
import { ccclass, tooltip, displayOrder, displayName, readOnly, type, serializable } from 'cc.decorator';
import { EDITOR } from 'internal:constants';
import { Eventify, Vec3, error, geometry } from '../../../../core';
import { CharacterTriggerEventType, CollisionEventType, TriggerEventType } from '../../physics-interface';
import { RigidBody } from '../rigid-body';
import { PhysicsMaterial } from '../../assets/physics-material';
import { Component, Node } from '../../../../scene-graph';
import { IBaseShape } from '../../../spec/i-physics-shape';
import { EColliderType, EAxisDirection } from '../../physics-enum';
import { selector, createShape } from '../../physics-selector';

type Callback = (...args: any[]) => any;
// Only observed paths retain candidate listener identities for independent teardown.
const observedMaterialAssets = new WeakMap<Collider, Set<PhysicsMaterial>>();
function retainObservedMaterial (collider: Collider, material: PhysicsMaterial | null): void {
    let assets = observedMaterialAssets.get(collider);
    if (!assets) observedMaterialAssets.set(collider, assets = new Set());
    if (material) assets.add(material);
}

/**
 * @en
 * Base class for colliders.
 * @zh
 * 碰撞器的基类。
 */
@ccclass('cc.Collider')
export class Collider extends Eventify(Component) {
    /**
     * @en
     * Enumeration of collider types.
     * @zh
     * 碰撞体类型的枚举。
     */
    static readonly Type = EColliderType;

    /**
     * @en
     * Enumeration of axes.
     * @zh
     * 坐标轴方向的枚举。
     */
    static readonly Axis = EAxisDirection;

    /// PUBLIC PROPERTY GETTER\SETTER ///

    /**
     * @en
     * Get the rigid body component to which the collider is bound, possibly null.
     * @zh
     * 获取碰撞器所绑定的刚体组件，可能为空。
     */
    @type(RigidBody)
    @readOnly
    @displayName('Attached')
    @displayOrder(-2)
    @tooltip('i18n:physics3d.collider.attached')
    public get attachedRigidBody (): RigidBody | null {
        return findAttachedBody(this.node);
        // return this._attachedRigidBody;
    }

    /**
     * @en
     * Gets or sets the physical material for this collider.
     * @zh
     * 获取或设置此碰撞器的物理材质。
     */
    @type(PhysicsMaterial)
    @displayName('Material')
    @displayOrder(-1)
    @tooltip('i18n:physics3d.collider.sharedMaterial')
    public get sharedMaterial (): PhysicsMaterial | null {
        return this._material;
    }

    public set sharedMaterial (value) {
        assertMutationAllowed(this, 'Collider.sharedMaterial');
        if (EDITOR) {
            this._material = value;
        } else {
            this.material = value;
        }
    }

    /**
     * @en
     * Gets or sets the physics material for this collider, which in Shared state will generate a new instance.
     * @zh
     * 获取或设置此碰撞器的物理材质，共享状态下获取将会生成新的实例。
     */
    public get material (): PhysicsMaterial | null {
        if (this._isSharedMaterial && this._material) {
            assertMutationAllowed(this, 'Collider.material.get');
            const change = beginPhysicsMaterialChange(this, 'collider-material-clone');
            if (change) {
                try {
                    change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));
                    change.effect('clone-allocation-entered');
                    const previous = this._material;
                    const cloned = previous.clone();
                    change.acceptClone(cloned);
                    retainObservedMaterial(this, previous);
                    change.effect('listener-edit-entered');
                    previous.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    observedMaterialAssets.get(this)!.delete(previous);
                    this._material = cloned;
                    change.effect('cache-written');
                    retainObservedMaterial(this, cloned);
                    cloned.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    this._isSharedMaterial = false;
                    change.effect('listeners-complete');
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
                change.prepare(() => ({ before: this._materialIdentity(), candidate: { kind: 'collider-material', material: value, shared: this._isSharedMaterial } }));
                change.apply();
                if (this._material !== value) {
                    retainObservedMaterial(this, this._material);
                    change.effect('listener-edit-entered');
                    this._material?.off(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    if (this._material) observedMaterialAssets.get(this)!.delete(this._material);
                    retainObservedMaterial(this, value);
                    value?.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    if (this._material && value) this._isSharedMaterial = false;
                    this._material = value;
                    change.effect('cache-written');
                    change.effect('listeners-complete');
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

    /**
     * @en
     * Gets or sets the collider is trigger, this will be always trigger if using builtin.
     * @zh
     * 获取或设置碰撞器是否为触发器。(builtin 中无论真假都为触发器)
     */
    @displayOrder(0)
    @tooltip('i18n:physics3d.collider.isTrigger')
    public get isTrigger (): boolean {
        return this._isTrigger;
    }

    public set isTrigger (value) {
        assertMutationAllowed(this, 'Collider.isTrigger');
        if (selector.id === 'box3d' && this._shape) {
            this._shape.setAsTrigger(value);
            this._isTrigger = value;
            return;
        }
        this._isTrigger = value;
        if (this._shape) {
            this._shape.setAsTrigger(this._isTrigger);
        }
    }

    /**
     * @en
     * Gets or sets the center of the collider, in local space.
     * @zh
     * 在本地空间中，获取或设置碰撞器的中心点。
     */
    @type(Vec3)
    @displayOrder(1)
    @tooltip('i18n:physics3d.collider.center')
    public get center (): Vec3 {
        return this._center;
    }

    public set center (value: Vec3) {
        assertMutationAllowed(this, 'Collider.center');
        if (selector.id === 'box3d' && this._shape) {
            this._shape.setCenter(value);
            Vec3.copy(this._center, value);
            return;
        }
        Vec3.copy(this._center, value);
        if (this._shape) {
            this._shape.setCenter(this._center);
        }
    }

    /**
     * @en
     * Gets the wrapper object, through which the lowLevel instance can be accessed.
     * @zh
     * 获取封装对象，通过此对象可以访问到底层实例。
     */
    public get shape (): IBaseShape | null {
        return this._shape;
    }

    public get worldBounds (): Readonly<geometry.AABB> {
        assertMutationAllowed(this, 'Collider.worldBounds.get');
        if (this._aabb == null) this._aabb = new geometry.AABB();
        if (this._shape) this._shape.getAABB(this._aabb);
        return this._aabb;
    }

    public get boundingSphere (): Readonly<geometry.Sphere> {
        assertMutationAllowed(this, 'Collider.boundingSphere.get');
        if (this._boundingSphere == null) this._boundingSphere = new geometry.Sphere();
        if (this._shape) this._shape.getBoundingSphere(this._boundingSphere);
        return this._boundingSphere;
    }

    public get needTriggerEvent (): boolean {
        return this._needTriggerEvent;
    }

    public get needCollisionEvent (): boolean {
        return this._needCollisionEvent;
    }

    readonly type: EColliderType;

    /// PROTECTED PROPERTY ///

    protected _shape: IBaseShape | null = null;
    protected _aabb: geometry.AABB | null = null;
    protected _boundingSphere: geometry.Sphere | null = null;
    protected _isSharedMaterial = true;
    protected _needTriggerEvent = false;
    protected _needCollisionEvent = false;
    // protected _attachedRigidBody: RigidBody | null = null;

    @type(PhysicsMaterial)
    protected _material: PhysicsMaterial | null = null;

    @serializable
    protected _isTrigger = false;

    @serializable
    protected readonly _center: Vec3 = new Vec3();

    protected get _isInitialized (): boolean {
        const r = this._shape === null;
        if (r) { error('[Physics]: This component has not been call onLoad yet, please make sure the node has been added to the scene.'); }
        return !r;
    }

    constructor (type: EColliderType) {
        super();
        this.type = type;
    }

    /// EVENT INTERFACE ///

    /**
     * @en
     * Registers callbacks associated with triggered or collision events.
     * @zh
     * 注册触发或碰撞事件相关的回调。
     * @param type - The event type, onTriggerEnter|onTriggerStay|onTriggerExit|onCollisionEnter|onCollisionStay|onCollisionExit;
     * @param callback - The event callback, signature:`(event?:ICollisionEvent|ITriggerEvent)=>void`.
     * @param target - The event callback target.
     */
    public on<TFunction extends Callback> (
        type: TriggerEventType | CollisionEventType | CharacterTriggerEventType,
        callback: TFunction,
        target?,
        once?: boolean,
    ): any {
        const ret = super.on(type, callback, target, once);
        this._updateNeedEvent(type);
        return ret;
    }

    /**
     * @en
     * Unregisters callbacks associated with trigger or collision events that have been registered.
     * @zh
     * 取消已经注册的触发或碰撞事件相关的回调。
     * @param type - The event type, onTriggerEnter|onTriggerStay|onTriggerExit|onCollisionEnter|onCollisionStay|onCollisionExit;
     * @param callback - The event callback, signature:`(event?:ICollisionEvent|ITriggerEvent)=>void`.
     * @param target - The event callback target.
     */
    public off (type: TriggerEventType | CollisionEventType | CharacterTriggerEventType, callback?: Callback, target?): void {
        super.off(type, callback, target);
        this._updateNeedEvent();
    }

    /**
     * @en
     * Registers a callback associated with a trigger or collision event, which is automatically unregistered once executed.
     * @zh
     * 注册触发或碰撞事件相关的回调，执行一次后会自动取消注册。
     * @param type - The event type, onTriggerEnter|onTriggerStay|onTriggerExit|onCollisionEnter|onCollisionStay|onCollisionExit;
     * @param callback - The event callback, signature:`(event?:ICollisionEvent|ITriggerEvent)=>void`.
     * @param target - The event callback target.
     */
    public once<TFunction extends Callback> (
        type: TriggerEventType | CollisionEventType | CharacterTriggerEventType,
        callback: TFunction,
        target?,
    ): any {
        // TODO: callback invoker now is a entity, after `once` will not calling the upper `off`.
        const ret = super.once(type, callback, target);
        this._updateNeedEvent(type);
        return ret;
    }

    /**
     * @en
     * Removes all registered events of the specified target or type.
     * @zh
     * 移除所有指定目标或类型的注册事件。
     * @param typeOrTarget - The event type or target.
     */
    public removeAll (typeOrTarget: TriggerEventType | CollisionEventType | Record<string, unknown>): void {
        super.removeAll(typeOrTarget);
        this._updateNeedEvent();
    }

    /// GROUP MASK ///

    /**
     * @en
     * Gets the group value.
     * @zh
     * 获取分组值。
     * @returns @zh 分组值，为 32 位整数，范围为 [2^0, 2^31] @en Group value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    public getGroup (): number {
        if (this._isInitialized) {
            return this._shape!.getGroup();
        }
        return 0;
    }

    /**
     * @en
     * Sets the group value.
     * @zh
     * 设置分组值。
     * @param v @zh 分组值，为 32 位整数，范围为 [2^0, 2^31] @en Group value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    public setGroup (v: number): void {
        assertMutationAllowed(this, 'Collider.setGroup');
        if (this._isInitialized) {
            this._shape!.setGroup(v);
        }
    }

    /**
     * @en
     * Add a grouping value to fill in the group you want to join.
     * @zh
     * 添加分组值，可填要加入的 group。
     * @param v @zh 分组值，为 32 位整数，范围为 [2^0, 2^31] @en Group value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    public addGroup (v: number): void {
        assertMutationAllowed(this, 'Collider.addGroup');
        if (this._isInitialized) {
            this._shape!.addGroup(v);
        }
    }

    /**
     * @en
     * Subtract the grouping value to fill in the group to be removed.
     * @zh
     * 减去分组值，可填要移除的 group。
     * @param v @zh 分组值，为 32 位整数，范围为 [2^0, 2^31] @en Group value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    public removeGroup (v: number): void {
        assertMutationAllowed(this, 'Collider.removeGroup');
        if (this._isInitialized) {
            this._shape!.removeGroup(v);
        }
    }

    /**
     * @en
     * Gets the mask value.
     * @zh
     * 获取掩码值。
     * @returns @zh 掩码值，为 32 位整数，范围为 [2^0, 2^31] @en Mask value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    public getMask (): number {
        if (this._isInitialized) {
            return this._shape!.getMask();
        }
        return 0;
    }

    /**
     * @en
     * Sets the mask value.
     * @zh
     * 设置掩码值。
     * @param v @zh 掩码值，为 32 位整数，范围为 [2^0, 2^31] @en Mask value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    public setMask (v: number): void {
        assertMutationAllowed(this, 'Collider.setMask');
        if (this._isInitialized) {
            this._shape!.setMask(v);
        }
    }

    /**
     * @en
     * Add mask values to fill in groups that need to be checked.
     * @zh
     * 添加掩码值，可填入需要检查的 group。
     * @param v @zh 掩码值，为 32 位整数，范围为 [2^0, 2^31] @en Mask value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    public addMask (v: number): void {
        assertMutationAllowed(this, 'Collider.addMask');
        if (this._isInitialized) {
            this._shape!.addMask(v);
        }
    }

    /**
     * @en
     * Subtract the mask value to fill in the group that does not need to be checked.
     * @zh
     * 减去掩码值，可填入不需要检查的 group。
     * @param v @zh 掩码值，为 32 位整数，范围为 [2^0, 2^31] @en Mask value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    public removeMask (v: number): void {
        assertMutationAllowed(this, 'Collider.removeMask');
        if (this._isInitialized) {
            this._shape!.removeMask(v);
        }
    }

    /// COMPONENT LIFECYCLE ///

    protected onLoad (): void {
        if (!selector.runInEditor) return;

        const nativeFirst = selector.id === 'box3d';
        if (!nativeFirst) this.sharedMaterial = this._material;
        this._shape = createShape(this.type);
        this._shape.initialize(this);
        const change = beginPhysicsMaterialChange(this, 'collider-material-initialize');
        if (change) {
            try {
                change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));
                this._shape.onLoad!();
                retainObservedMaterial(this, this._material);
                change.effect('listener-edit-entered');
                this._material?.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                change.effect('listeners-complete');
                change.commit(() => this._materialIdentity());
            } catch (error) { change.fail(error, () => this._materialIdentity()); }
            finally { change.dispose(); }
            return;
        }
        this._shape.onLoad!();
        if (nativeFirst && this._material) this._material.on(PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
    }

    protected onEnable (): void {
        if (this._shape) {
            this._shape.onEnable!();
        }
    }

    protected onDisable (): void {
        if (this._shape) {
            this._shape.onDisable!();
        }
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

    private _updateNeedEvent (type?: string): void {
        if (this.isValid) {
            if (type !== undefined) {
                if (type === 'onCollisionEnter' || type === 'onCollisionStay' || type === 'onCollisionExit') {
                    this._needCollisionEvent = true;
                }
                if (type === 'onTriggerEnter' || type === 'onTriggerStay' || type === 'onTriggerExit'
                    || type === 'onControllerTriggerEnter' || type === 'onControllerTriggerStay' || type === 'onControllerTriggerExit') {
                    this._needTriggerEvent = true;
                }
            } else {
                if (!(this.hasEventListener('onTriggerEnter')
                    || this.hasEventListener('onTriggerStay')
                    || this.hasEventListener('onTriggerExit')
                    || this.hasEventListener('onControllerTriggerEnter')
                    || this.hasEventListener('onControllerTriggerStay')
                    || this.hasEventListener('onControllerTriggerExit')
                )) {
                    this._needTriggerEvent = false;
                }
                if (!(this.hasEventListener('onCollisionEnter')
                    || this.hasEventListener('onCollisionStay')
                    || this.hasEventListener('onCollisionExit'))) {
                    this._needCollisionEvent = false;
                }
            }
            if (this._shape) this._shape.updateEventListener();
        }
    }
}

export namespace Collider {
    export type Type = EnumAlias<typeof EColliderType>;
    export type Axis = EnumAlias<typeof EAxisDirection>;
}

function findAttachedBody (node: Node): RigidBody | null {
    const rb = node.getComponent(RigidBody);
    if (rb && rb.isValid) {
        return rb;
    }
    return null;
    // if (node.parent == null || node.parent == node.scene) return null;
    // return findAttachedBody(node.parent);
}
