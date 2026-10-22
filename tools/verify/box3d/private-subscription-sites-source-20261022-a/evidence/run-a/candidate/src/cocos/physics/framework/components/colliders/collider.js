"use strict";
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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Collider = void 0;
const physics_material_transaction_1 = require("../../physics-material-transaction");
const mutation_guard_1 = require("../../../../core/data/mutation-guard");
const cc_decorator_1 = require("cc.decorator");
const internal_constants_1 = require("internal:constants");
const core_1 = require("../../../../core");
const rigid_body_1 = require("../rigid-body");
const physics_material_1 = require("../../assets/physics-material");
const scene_graph_1 = require("../../../../scene-graph");
const physics_enum_1 = require("../../physics-enum");
const physics_selector_1 = require("../../physics-selector");
// Observed paths retain legacy listeners; an empty set also selects independent private teardown.
const observedMaterialAssets = new WeakMap();
function retainObservedMaterial(collider, material) {
    let assets = observedMaterialAssets.get(collider);
    if (!assets)
        observedMaterialAssets.set(collider, assets = new Set());
    if (material)
        assets.add(material);
}
/**
 * @en
 * Base class for colliders.
 * @zh
 * 碰撞器的基类。
 */
let Collider = class Collider extends (0, core_1.Eventify)(scene_graph_1.Component) {
    /**
     * @en
     * Enumeration of collider types.
     * @zh
     * 碰撞体类型的枚举。
     */
    static { this.Type = physics_enum_1.EColliderType; }
    /**
     * @en
     * Enumeration of axes.
     * @zh
     * 坐标轴方向的枚举。
     */
    static { this.Axis = physics_enum_1.EAxisDirection; }
    /// PUBLIC PROPERTY GETTER\SETTER ///
    /**
     * @en
     * Get the rigid body component to which the collider is bound, possibly null.
     * @zh
     * 获取碰撞器所绑定的刚体组件，可能为空。
     */
    get attachedRigidBody() {
        return findAttachedBody(this.node);
        // return this._attachedRigidBody;
    }
    /**
     * @en
     * Gets or sets the physical material for this collider.
     * @zh
     * 获取或设置此碰撞器的物理材质。
     */
    get sharedMaterial() {
        return this._material;
    }
    set sharedMaterial(value) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.sharedMaterial');
        if (internal_constants_1.EDITOR) {
            this._material = value;
        }
        else {
            this.material = value;
        }
    }
    /**
     * @en
     * Gets or sets the physics material for this collider, which in Shared state will generate a new instance.
     * @zh
     * 获取或设置此碰撞器的物理材质，共享状态下获取将会生成新的实例。
     */
    get material() {
        if (this._isSharedMaterial && this._material) {
            (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.material.get');
            const change = (0, physics_material_transaction_1.beginPhysicsMaterialChange)(this, 'collider-material-clone');
            if (change) {
                try {
                    if (change.privateSubscriptions)
                        retainObservedMaterial(this, null);
                    change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));
                    change.effect('clone-allocation-entered');
                    const previous = this._material;
                    const cloned = previous.clone();
                    change.acceptClone(cloned);
                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, previous);
                        change.effect('listener-edit-entered');
                        previous.off(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                        observedMaterialAssets.get(this).delete(previous);
                    }
                    this._material = cloned;
                    change.effect('cache-written');
                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, cloned);
                        cloned.on(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    }
                    this._isSharedMaterial = false;
                    if (!change.privateSubscriptions)
                        change.effect('listeners-complete');
                    change.commit(() => this._materialIdentity());
                }
                catch (error) {
                    change.fail(error, () => this._materialIdentity());
                }
                finally {
                    change.dispose();
                }
                return this._material;
            }
            this._material.off(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            this._material = this._material.clone();
            this._material.on(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            this._isSharedMaterial = false;
        }
        return this._material;
    }
    set material(value) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.material.set');
        const change = (0, physics_material_transaction_1.beginPhysicsMaterialChange)(this, 'collider-material-set');
        if (change) {
            try {
                if (change.privateSubscriptions)
                    retainObservedMaterial(this, null);
                change.prepare(() => ({ before: this._materialIdentity(), candidate: { kind: 'collider-material', material: value, shared: this._isSharedMaterial } }));
                change.apply();
                if (this._material !== value) {
                    if (!change.privateSubscriptions) {
                        retainObservedMaterial(this, this._material);
                        change.effect('listener-edit-entered');
                        this._material?.off(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                        if (this._material)
                            observedMaterialAssets.get(this).delete(this._material);
                        retainObservedMaterial(this, value);
                        value?.on(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    }
                    if (this._material && value)
                        this._isSharedMaterial = false;
                    this._material = value;
                    change.effect('cache-written');
                    if (!change.privateSubscriptions)
                        change.effect('listeners-complete');
                }
                change.commit(() => this._materialIdentity());
            }
            catch (error) {
                change.fail(error, () => this._materialIdentity());
            }
            finally {
                change.dispose();
            }
            return;
        }
        if (this._shape) {
            const nativeFirst = physics_selector_1.selector.id === 'box3d';
            if (nativeFirst)
                this._shape.setMaterial(value);
            if (value && this._material) {
                if (this._material.id !== value.id) {
                    this._material.off(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    value.on(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    this._isSharedMaterial = false;
                    this._material = value;
                }
            }
            else if (value && !this._material) {
                value.on(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                this._material = value;
            }
            else if (!value && this._material) {
                this._material.off(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                this._material = value;
            }
            if (!nativeFirst)
                this._updateMaterial();
        }
        else {
            this._material = value;
        }
    }
    /**
     * @en
     * Gets or sets the collider is trigger, this will be always trigger if using builtin.
     * @zh
     * 获取或设置碰撞器是否为触发器。(builtin 中无论真假都为触发器)
     */
    get isTrigger() {
        return this._isTrigger;
    }
    set isTrigger(value) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.isTrigger');
        if (physics_selector_1.selector.id === 'box3d' && this._shape) {
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
    get center() {
        return this._center;
    }
    set center(value) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.center');
        if (physics_selector_1.selector.id === 'box3d' && this._shape) {
            this._shape.setCenter(value);
            core_1.Vec3.copy(this._center, value);
            return;
        }
        core_1.Vec3.copy(this._center, value);
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
    get shape() {
        return this._shape;
    }
    get worldBounds() {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.worldBounds.get');
        if (this._aabb == null)
            this._aabb = new core_1.geometry.AABB();
        if (this._shape)
            this._shape.getAABB(this._aabb);
        return this._aabb;
    }
    get boundingSphere() {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.boundingSphere.get');
        if (this._boundingSphere == null)
            this._boundingSphere = new core_1.geometry.Sphere();
        if (this._shape)
            this._shape.getBoundingSphere(this._boundingSphere);
        return this._boundingSphere;
    }
    get needTriggerEvent() {
        return this._needTriggerEvent;
    }
    get needCollisionEvent() {
        return this._needCollisionEvent;
    }
    get _isInitialized() {
        const r = this._shape === null;
        if (r) {
            (0, core_1.error)('[Physics]: This component has not been call onLoad yet, please make sure the node has been added to the scene.');
        }
        return !r;
    }
    constructor(type) {
        super();
        /// PROTECTED PROPERTY ///
        this._shape = null;
        this._aabb = null;
        this._boundingSphere = null;
        this._isSharedMaterial = true;
        this._needTriggerEvent = false;
        this._needCollisionEvent = false;
        // protected _attachedRigidBody: RigidBody | null = null;
        this._material = null;
        this._isTrigger = false;
        this._center = new core_1.Vec3();
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
    on(type, callback, target, once) {
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
    off(type, callback, target) {
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
    once(type, callback, target) {
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
    removeAll(typeOrTarget) {
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
    getGroup() {
        if (this._isInitialized) {
            return this._shape.getGroup();
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
    setGroup(v) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.setGroup');
        if (this._isInitialized) {
            this._shape.setGroup(v);
        }
    }
    /**
     * @en
     * Add a grouping value to fill in the group you want to join.
     * @zh
     * 添加分组值，可填要加入的 group。
     * @param v @zh 分组值，为 32 位整数，范围为 [2^0, 2^31] @en Group value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    addGroup(v) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.addGroup');
        if (this._isInitialized) {
            this._shape.addGroup(v);
        }
    }
    /**
     * @en
     * Subtract the grouping value to fill in the group to be removed.
     * @zh
     * 减去分组值，可填要移除的 group。
     * @param v @zh 分组值，为 32 位整数，范围为 [2^0, 2^31] @en Group value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    removeGroup(v) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.removeGroup');
        if (this._isInitialized) {
            this._shape.removeGroup(v);
        }
    }
    /**
     * @en
     * Gets the mask value.
     * @zh
     * 获取掩码值。
     * @returns @zh 掩码值，为 32 位整数，范围为 [2^0, 2^31] @en Mask value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    getMask() {
        if (this._isInitialized) {
            return this._shape.getMask();
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
    setMask(v) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.setMask');
        if (this._isInitialized) {
            this._shape.setMask(v);
        }
    }
    /**
     * @en
     * Add mask values to fill in groups that need to be checked.
     * @zh
     * 添加掩码值，可填入需要检查的 group。
     * @param v @zh 掩码值，为 32 位整数，范围为 [2^0, 2^31] @en Mask value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    addMask(v) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.addMask');
        if (this._isInitialized) {
            this._shape.addMask(v);
        }
    }
    /**
     * @en
     * Subtract the mask value to fill in the group that does not need to be checked.
     * @zh
     * 减去掩码值，可填入不需要检查的 group。
     * @param v @zh 掩码值，为 32 位整数，范围为 [2^0, 2^31] @en Mask value which is a 32-bits integer, the range is [2^0, 2^31]
     */
    removeMask(v) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'Collider.removeMask');
        if (this._isInitialized) {
            this._shape.removeMask(v);
        }
    }
    /// COMPONENT LIFECYCLE ///
    onLoad() {
        if (!physics_selector_1.selector.runInEditor)
            return;
        const nativeFirst = physics_selector_1.selector.id === 'box3d';
        if (!nativeFirst)
            this.sharedMaterial = this._material;
        this._shape = (0, physics_selector_1.createShape)(this.type);
        this._shape.initialize(this);
        const change = (0, physics_material_transaction_1.beginPhysicsMaterialChange)(this, 'collider-material-initialize');
        if (change) {
            try {
                if (change.privateSubscriptions)
                    retainObservedMaterial(this, null);
                change.prepare(() => ({ before: this._materialIdentity(), candidate: this._materialIdentity() }));
                this._shape.onLoad();
                if (!change.privateSubscriptions) {
                    retainObservedMaterial(this, this._material);
                    change.effect('listener-edit-entered');
                    this._material?.on(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                    change.effect('listeners-complete');
                }
                change.commit(() => this._materialIdentity());
            }
            catch (error) {
                change.fail(error, () => this._materialIdentity());
            }
            finally {
                change.dispose();
            }
            return;
        }
        this._shape.onLoad();
        if (nativeFirst && this._material)
            this._material.on(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
    }
    onEnable() {
        if (this._shape) {
            this._shape.onEnable();
        }
    }
    onDisable() {
        if (this._shape) {
            this._shape.onDisable();
        }
    }
    onDestroy() {
        const assets = observedMaterialAssets.get(this);
        if (assets) {
            // Capture before adapter unregister; the one-shot report remains readable after release.
            const reporter = (0, physics_material_transaction_1.capturePhysicsMaterialCleanup)(this);
            const failures = [];
            const attempt = (stage, perform) => {
                try {
                    perform();
                }
                catch (error) {
                    failures.push({ stage, error });
                }
            };
            let reportFailed = false;
            let reportError;
            try {
                this._needTriggerEvent = false;
                this._needCollisionEvent = false;
                if (this._shape)
                    attempt('event-listener-clear', () => this._shape.updateEventListener());
                for (const material of assets)
                    attempt('material-off', () => {
                        material.off(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
                        assets.delete(material);
                    });
                if (this._shape)
                    attempt('adapter-destroy', () => this._shape.onDestroy());
                if (this._boundingSphere)
                    attempt('bounds-destroy', () => this._boundingSphere.destroy());
                if (!assets.size)
                    observedMaterialAssets.delete(this);
            }
            finally {
                try {
                    reporter?.complete(failures);
                }
                catch (error) {
                    reportFailed = true;
                    reportError = error;
                }
            }
            if (failures.length)
                throw failures[0].error;
            if (reportFailed)
                throw reportError;
            return;
        }
        if (this._shape) {
            this._needTriggerEvent = false;
            this._needCollisionEvent = false;
            this._shape.updateEventListener();
            if (this._material)
                this._material.off(physics_material_1.PhysicsMaterial.EVENT_UPDATE, this._updateMaterial, this);
            this._shape.onDestroy();
        }
        if (this._boundingSphere)
            this._boundingSphere.destroy();
    }
    _materialIdentity() {
        return { kind: 'collider-material', material: this._material, shared: this._isSharedMaterial };
    }
    _updateMaterial() {
        if (this._shape)
            this._shape.setMaterial(this._material);
    }
    _updateNeedEvent(type) {
        if (this.isValid) {
            if (type !== undefined) {
                if (type === 'onCollisionEnter' || type === 'onCollisionStay' || type === 'onCollisionExit') {
                    this._needCollisionEvent = true;
                }
                if (type === 'onTriggerEnter' || type === 'onTriggerStay' || type === 'onTriggerExit'
                    || type === 'onControllerTriggerEnter' || type === 'onControllerTriggerStay' || type === 'onControllerTriggerExit') {
                    this._needTriggerEvent = true;
                }
            }
            else {
                if (!(this.hasEventListener('onTriggerEnter')
                    || this.hasEventListener('onTriggerStay')
                    || this.hasEventListener('onTriggerExit')
                    || this.hasEventListener('onControllerTriggerEnter')
                    || this.hasEventListener('onControllerTriggerStay')
                    || this.hasEventListener('onControllerTriggerExit'))) {
                    this._needTriggerEvent = false;
                }
                if (!(this.hasEventListener('onCollisionEnter')
                    || this.hasEventListener('onCollisionStay')
                    || this.hasEventListener('onCollisionExit'))) {
                    this._needCollisionEvent = false;
                }
            }
            if (this._shape)
                this._shape.updateEventListener();
        }
    }
};
__decorate([
    (0, cc_decorator_1.type)(rigid_body_1.RigidBody),
    cc_decorator_1.readOnly,
    (0, cc_decorator_1.displayName)('Attached'),
    (0, cc_decorator_1.displayOrder)(-2),
    (0, cc_decorator_1.tooltip)('i18n:physics3d.collider.attached')
], Collider.prototype, "attachedRigidBody", null);
__decorate([
    (0, cc_decorator_1.type)(physics_material_1.PhysicsMaterial),
    (0, cc_decorator_1.displayName)('Material'),
    (0, cc_decorator_1.displayOrder)(-1),
    (0, cc_decorator_1.tooltip)('i18n:physics3d.collider.sharedMaterial')
], Collider.prototype, "sharedMaterial", null);
__decorate([
    (0, cc_decorator_1.displayOrder)(0),
    (0, cc_decorator_1.tooltip)('i18n:physics3d.collider.isTrigger')
], Collider.prototype, "isTrigger", null);
__decorate([
    (0, cc_decorator_1.type)(core_1.Vec3),
    (0, cc_decorator_1.displayOrder)(1),
    (0, cc_decorator_1.tooltip)('i18n:physics3d.collider.center')
], Collider.prototype, "center", null);
__decorate([
    (0, cc_decorator_1.type)(physics_material_1.PhysicsMaterial)
], Collider.prototype, "_material", void 0);
__decorate([
    cc_decorator_1.serializable
], Collider.prototype, "_isTrigger", void 0);
__decorate([
    cc_decorator_1.serializable
], Collider.prototype, "_center", void 0);
Collider = __decorate([
    (0, cc_decorator_1.ccclass)('cc.Collider')
], Collider);
exports.Collider = Collider;
function findAttachedBody(node) {
    const rb = node.getComponent(rigid_body_1.RigidBody);
    if (rb && rb.isValid) {
        return rb;
    }
    return null;
    // if (node.parent == null || node.parent == node.scene) return null;
    // return findAttachedBody(node.parent);
}
