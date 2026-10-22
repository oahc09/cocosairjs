"use strict";
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
var PhysicsMaterial_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PhysicsMaterial = void 0;
// @ts-check
const physics_material_values_1 = require("../physics-material-values");
const mutation_guard_1 = require("../../../core/data/mutation-guard");
const cc_decorator_1 = require("cc.decorator");
const asset_1 = require("../../../asset/assets/asset");
const core_1 = require("../../../core");
/**
 * @en
 * Physics materials.
 * @zh
 * 物理材质。
 */
let PhysicsMaterial = PhysicsMaterial_1 = class PhysicsMaterial extends asset_1.Asset {
    /**
     * @en
     * Gets all physics material instances.
     * @zh
     * 获取所有的物理材质实例。
     */
    static allMaterials = [];
    /**
     * @en
     * The event which will be triggered when the entity of physics material update.
     * @zh
     * 物理材质实例更新时触发的事件。
     * @event PhysicsMaterial.EVENT_UPDATE
     */
    static EVENT_UPDATE = 'event_update';
    /**
     * @en
     * Friction for this material.
     * @zh
     * 此材质的摩擦系数。
     */
    get friction() {
        return this._friction;
    }
    set friction(value) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'PhysicsMaterial.friction');
        const ticket = (0, physics_material_values_1.beginPhysicsMaterialValuesChange)(this);
        if (ticket) {
            try {
                ticket.prepare({
                    read: () => {
                        const before = [this._friction, this._restitution, this._rollingFriction, this._spinningFriction];
                        const candidate = [value, before[1], before[2], before[3]];
                        return {
                            before,
                            candidate,
                            // The primitive validates both tuples before reading this flag.
                            get changed() { return !core_1.math.equals(before[0], candidate[0]); },
                            writeOnNoChange: false,
                        };
                    },
                    write: (candidate, recorder) => {
                        this._friction = candidate[0];
                        recorder.written();
                    },
                    emit: () => this.emit(PhysicsMaterial_1.EVENT_UPDATE),
                    readActual: () => [this._friction, this._restitution, this._rollingFriction, this._spinningFriction],
                });
                ticket.apply();
            }
            finally {
                ticket.dispose();
            }
            return;
        }
        if (!core_1.math.equals(this._friction, value)) {
            this._friction = value;
            this.emit(PhysicsMaterial_1.EVENT_UPDATE);
        }
    }
    /**
     * @en
     * Rolling friction for this material.
     * @zh
     * 此材质的滚动摩擦系数。
     */
    get rollingFriction() {
        return this._rollingFriction;
    }
    set rollingFriction(value) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'PhysicsMaterial.rollingFriction');
        const ticket = (0, physics_material_values_1.beginPhysicsMaterialValuesChange)(this);
        if (ticket) {
            try {
                ticket.prepare({
                    read: () => {
                        const before = [this._friction, this._restitution, this._rollingFriction, this._spinningFriction];
                        const candidate = [before[0], before[1], value, before[3]];
                        return {
                            before,
                            candidate,
                            // The primitive validates both tuples before reading this flag.
                            get changed() { return !core_1.math.equals(before[2], candidate[2]); },
                            writeOnNoChange: false,
                        };
                    },
                    write: (candidate, recorder) => {
                        this._rollingFriction = candidate[2];
                        recorder.written();
                    },
                    emit: () => this.emit(PhysicsMaterial_1.EVENT_UPDATE),
                    readActual: () => [this._friction, this._restitution, this._rollingFriction, this._spinningFriction],
                });
                ticket.apply();
            }
            finally {
                ticket.dispose();
            }
            return;
        }
        if (!core_1.math.equals(this._rollingFriction, value)) {
            this._rollingFriction = value;
            this.emit(PhysicsMaterial_1.EVENT_UPDATE);
        }
    }
    /**
     * @en
     * Spinning friction for this material.
     * @zh
     * 此材质的自旋摩擦系数。
     */
    get spinningFriction() {
        return this._spinningFriction;
    }
    set spinningFriction(value) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'PhysicsMaterial.spinningFriction');
        const ticket = (0, physics_material_values_1.beginPhysicsMaterialValuesChange)(this);
        if (ticket) {
            try {
                ticket.prepare({
                    read: () => {
                        const before = [this._friction, this._restitution, this._rollingFriction, this._spinningFriction];
                        const candidate = [before[0], before[1], before[2], value];
                        return {
                            before,
                            candidate,
                            // The primitive validates both tuples before reading this flag.
                            get changed() { return !core_1.math.equals(before[3], candidate[3]); },
                            writeOnNoChange: false,
                        };
                    },
                    write: (candidate, recorder) => {
                        this._spinningFriction = candidate[3];
                        recorder.written();
                    },
                    emit: () => this.emit(PhysicsMaterial_1.EVENT_UPDATE),
                    readActual: () => [this._friction, this._restitution, this._rollingFriction, this._spinningFriction],
                });
                ticket.apply();
            }
            finally {
                ticket.dispose();
            }
            return;
        }
        if (!core_1.math.equals(this._spinningFriction, value)) {
            this._spinningFriction = value;
            this.emit(PhysicsMaterial_1.EVENT_UPDATE);
        }
    }
    /**
     * @en
     * Restitution for this material.
     * @zh
     * 此材质的回弹系数。
     */
    get restitution() {
        return this._restitution;
    }
    set restitution(value) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'PhysicsMaterial.restitution');
        const ticket = (0, physics_material_values_1.beginPhysicsMaterialValuesChange)(this);
        if (ticket) {
            try {
                ticket.prepare({
                    read: () => {
                        const before = [this._friction, this._restitution, this._rollingFriction, this._spinningFriction];
                        const candidate = [before[0], value, before[2], before[3]];
                        return {
                            before,
                            candidate,
                            // The primitive validates both tuples before reading this flag.
                            get changed() { return !core_1.math.equals(before[1], candidate[1]); },
                            writeOnNoChange: false,
                        };
                    },
                    write: (candidate, recorder) => {
                        this._restitution = candidate[1];
                        recorder.written();
                    },
                    emit: () => this.emit(PhysicsMaterial_1.EVENT_UPDATE),
                    readActual: () => [this._friction, this._restitution, this._rollingFriction, this._spinningFriction],
                });
                ticket.apply();
            }
            finally {
                ticket.dispose();
            }
            return;
        }
        if (!core_1.math.equals(this._restitution, value)) {
            this._restitution = value;
            this.emit(PhysicsMaterial_1.EVENT_UPDATE);
        }
    }
    id;
    static _idCounter = 0;
    _friction = 0.6;
    _rollingFriction = 0.0;
    _spinningFriction = 0.0;
    _restitution = 0.0;
    constructor() {
        super();
        PhysicsMaterial_1.allMaterials.push(this);
        this.id = PhysicsMaterial_1._idCounter++;
        if (!this._uuid)
            this._uuid = `pm_${this.id}`;
    }
    /**
     * @en
     * clone.
     * @zh
     * 克隆。
     */
    clone() {
        const c = new PhysicsMaterial_1();
        c._friction = this._friction;
        c._restitution = this._restitution;
        c._rollingFriction = this._rollingFriction;
        c._spinningFriction = this._spinningFriction;
        return c;
    }
    /**
     * @en
     * destroy.
     * @zh
     * 销毁。
     * @return 是否成功
     */
    destroy() {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'PhysicsMaterial.destroy');
        (0, physics_material_values_1.assertPhysicsMaterialDestroyable)(this);
        if (super.destroy()) {
            const idx = PhysicsMaterial_1.allMaterials.indexOf(this);
            if (idx >= 0) {
                PhysicsMaterial_1.allMaterials.splice(idx, 1);
            }
            return true;
        }
        return false;
    }
    /**
     * @en
     * Sets the coefficients values.
     * @zh
     * 设置材质相关的系数。
     * @param friction
     * @param rollingFriction
     * @param spinningFriction
     * @param restitution
     */
    setValues(friction, rollingFriction, spinningFriction, restitution) {
        (0, mutation_guard_1.assertMutationAllowed)(this, 'PhysicsMaterial.setValues');
        const ticket = (0, physics_material_values_1.beginPhysicsMaterialValuesChange)(this);
        if (ticket) {
            try {
                ticket.prepare({
                    read: () => {
                        const before = [this._friction, this._restitution, this._rollingFriction, this._spinningFriction];
                        // Public argument order is friction, rolling, spinning, restitution.
                        const candidate = [friction, restitution, rollingFriction, spinningFriction];
                        return {
                            before,
                            candidate,
                            // Keep the original exact comparisons and short-circuit order.
                            get changed() {
                                return before[0] !== candidate[0] || before[2] !== candidate[2]
                                    || before[3] !== candidate[3] || before[1] !== candidate[1];
                            },
                            writeOnNoChange: true,
                        };
                    },
                    write: (candidate, recorder) => {
                        this._friction = candidate[0];
                        recorder.written();
                        this._rollingFriction = candidate[2];
                        recorder.written();
                        this._spinningFriction = candidate[3];
                        recorder.written();
                        this._restitution = candidate[1];
                        recorder.written();
                    },
                    emit: () => this.emit(PhysicsMaterial_1.EVENT_UPDATE),
                    readActual: () => [this._friction, this._restitution, this._rollingFriction, this._spinningFriction],
                });
                ticket.apply();
            }
            finally {
                ticket.dispose();
            }
            return;
        }
        const emitUpdate = this._friction !== friction || this._rollingFriction !== rollingFriction
            || this._spinningFriction !== spinningFriction || this._restitution !== restitution;
        this._friction = friction;
        this._rollingFriction = rollingFriction;
        this._spinningFriction = spinningFriction;
        this._restitution = restitution;
        if (emitUpdate)
            this.emit(PhysicsMaterial_1.EVENT_UPDATE);
    }
};
__decorate([
    cc_decorator_1.editable,
    (0, cc_decorator_1.type)(core_1.CCFloat)
], PhysicsMaterial.prototype, "friction", null);
__decorate([
    cc_decorator_1.editable,
    (0, cc_decorator_1.type)(core_1.CCFloat)
], PhysicsMaterial.prototype, "rollingFriction", null);
__decorate([
    cc_decorator_1.editable,
    (0, cc_decorator_1.type)(core_1.CCFloat)
], PhysicsMaterial.prototype, "spinningFriction", null);
__decorate([
    cc_decorator_1.editable,
    (0, cc_decorator_1.type)(core_1.CCFloat),
    (0, cc_decorator_1.range)([0, 1, 0.01])
], PhysicsMaterial.prototype, "restitution", null);
__decorate([
    cc_decorator_1.serializable
], PhysicsMaterial.prototype, "_friction", void 0);
__decorate([
    cc_decorator_1.serializable
], PhysicsMaterial.prototype, "_rollingFriction", void 0);
__decorate([
    cc_decorator_1.serializable
], PhysicsMaterial.prototype, "_spinningFriction", void 0);
__decorate([
    cc_decorator_1.serializable
], PhysicsMaterial.prototype, "_restitution", void 0);
PhysicsMaterial = PhysicsMaterial_1 = __decorate([
    (0, cc_decorator_1.ccclass)('cc.PhysicsMaterial')
], PhysicsMaterial);
exports.PhysicsMaterial = PhysicsMaterial;
