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

// @ts-check

import { beginPhysicsMaterialValuesChange, assertPhysicsMaterialDestroyable } from '../physics-material-values';
import { MaterialValues } from '../physics-material-values-transaction';
import { assertMutationAllowed } from '../../../core/data/mutation-guard';
import { ccclass, editable, range, serializable, type } from 'cc.decorator';
import { Asset } from '../../../asset/assets/asset';
import { CCFloat, math } from '../../../core';

/**
 * @en
 * Physics materials.
 * @zh
 * 物理材质。
 */
@ccclass('cc.PhysicsMaterial')
export class PhysicsMaterial extends Asset {
    /**
     * @en
     * Gets all physics material instances.
     * @zh
     * 获取所有的物理材质实例。
     */
    static allMaterials: PhysicsMaterial[] = [];

    /**
     * @en
     * The event which will be triggered when the entity of physics material update.
     * @zh
     * 物理材质实例更新时触发的事件。
     * @event PhysicsMaterial.EVENT_UPDATE
     */
    static readonly EVENT_UPDATE = 'event_update';

    /**
     * @en
     * Friction for this material.
     * @zh
     * 此材质的摩擦系数。
     */
    @editable
    @type(CCFloat)
    get friction (): number {
        return this._friction;
    }

    set friction (value) {
        assertMutationAllowed(this, 'PhysicsMaterial.friction');
        const ticket = beginPhysicsMaterialValuesChange(this);
        if (ticket) {
            try {
                ticket.prepare({
                    read: () => {
                        const before: MaterialValues = [this._friction, this._restitution, this._rollingFriction, this._spinningFriction];
                        const candidate: MaterialValues = [value, before[1], before[2], before[3]];
                        return {
                            before,
                            candidate,
                            // The primitive validates both tuples before reading this flag.
                            get changed () { return !math.equals(before[0], candidate[0]); },
                            writeOnNoChange: false,
                        };
                    },
                    write: (candidate, recorder) => {
                        this._friction = candidate[0];
                        recorder.written();
                    },
                    emit: () => this.emit(PhysicsMaterial.EVENT_UPDATE),
                    readActual: () => [this._friction, this._restitution, this._rollingFriction, this._spinningFriction],
                });
                ticket.apply();
            } finally {
                ticket.dispose();
            }
            return;
        }
        if (!math.equals(this._friction, value)) {
            this._friction = value;
            this.emit(PhysicsMaterial.EVENT_UPDATE);
        }
    }

    /**
     * @en
     * Rolling friction for this material.
     * @zh
     * 此材质的滚动摩擦系数。
     */
    @editable
    @type(CCFloat)
    get rollingFriction (): number {
        return this._rollingFriction;
    }

    set rollingFriction (value) {
        assertMutationAllowed(this, 'PhysicsMaterial.rollingFriction');
        const ticket = beginPhysicsMaterialValuesChange(this);
        if (ticket) {
            try {
                ticket.prepare({
                    read: () => {
                        const before: MaterialValues = [this._friction, this._restitution, this._rollingFriction, this._spinningFriction];
                        const candidate: MaterialValues = [before[0], before[1], value, before[3]];
                        return {
                            before,
                            candidate,
                            // The primitive validates both tuples before reading this flag.
                            get changed () { return !math.equals(before[2], candidate[2]); },
                            writeOnNoChange: false,
                        };
                    },
                    write: (candidate, recorder) => {
                        this._rollingFriction = candidate[2];
                        recorder.written();
                    },
                    emit: () => this.emit(PhysicsMaterial.EVENT_UPDATE),
                    readActual: () => [this._friction, this._restitution, this._rollingFriction, this._spinningFriction],
                });
                ticket.apply();
            } finally {
                ticket.dispose();
            }
            return;
        }
        if (!math.equals(this._rollingFriction, value)) {
            this._rollingFriction = value;
            this.emit(PhysicsMaterial.EVENT_UPDATE);
        }
    }

    /**
     * @en
     * Spinning friction for this material.
     * @zh
     * 此材质的自旋摩擦系数。
     */
    @editable
    @type(CCFloat)
    get spinningFriction (): number {
        return this._spinningFriction;
    }

    set spinningFriction (value) {
        assertMutationAllowed(this, 'PhysicsMaterial.spinningFriction');
        const ticket = beginPhysicsMaterialValuesChange(this);
        if (ticket) {
            try {
                ticket.prepare({
                    read: () => {
                        const before: MaterialValues = [this._friction, this._restitution, this._rollingFriction, this._spinningFriction];
                        const candidate: MaterialValues = [before[0], before[1], before[2], value];
                        return {
                            before,
                            candidate,
                            // The primitive validates both tuples before reading this flag.
                            get changed () { return !math.equals(before[3], candidate[3]); },
                            writeOnNoChange: false,
                        };
                    },
                    write: (candidate, recorder) => {
                        this._spinningFriction = candidate[3];
                        recorder.written();
                    },
                    emit: () => this.emit(PhysicsMaterial.EVENT_UPDATE),
                    readActual: () => [this._friction, this._restitution, this._rollingFriction, this._spinningFriction],
                });
                ticket.apply();
            } finally {
                ticket.dispose();
            }
            return;
        }
        if (!math.equals(this._spinningFriction, value)) {
            this._spinningFriction = value;
            this.emit(PhysicsMaterial.EVENT_UPDATE);
        }
    }

    /**
     * @en
     * Restitution for this material.
     * @zh
     * 此材质的回弹系数。
     */
    @editable
    @type(CCFloat)
    @range([0, 1, 0.01])
    get restitution (): number {
        return this._restitution;
    }

    set restitution (value) {
        assertMutationAllowed(this, 'PhysicsMaterial.restitution');
        const ticket = beginPhysicsMaterialValuesChange(this);
        if (ticket) {
            try {
                ticket.prepare({
                    read: () => {
                        const before: MaterialValues = [this._friction, this._restitution, this._rollingFriction, this._spinningFriction];
                        const candidate: MaterialValues = [before[0], value, before[2], before[3]];
                        return {
                            before,
                            candidate,
                            // The primitive validates both tuples before reading this flag.
                            get changed () { return !math.equals(before[1], candidate[1]); },
                            writeOnNoChange: false,
                        };
                    },
                    write: (candidate, recorder) => {
                        this._restitution = candidate[1];
                        recorder.written();
                    },
                    emit: () => this.emit(PhysicsMaterial.EVENT_UPDATE),
                    readActual: () => [this._friction, this._restitution, this._rollingFriction, this._spinningFriction],
                });
                ticket.apply();
            } finally {
                ticket.dispose();
            }
            return;
        }
        if (!math.equals(this._restitution, value)) {
            this._restitution = value;
            this.emit(PhysicsMaterial.EVENT_UPDATE);
        }
    }

    readonly id: number;
    private static _idCounter = 0;

    @serializable
    private _friction = 0.6;

    @serializable
    private _rollingFriction = 0.0;

    @serializable
    private _spinningFriction = 0.0;

    @serializable
    private _restitution = 0.0;

    constructor () {
        super();
        PhysicsMaterial.allMaterials.push(this);
        this.id = PhysicsMaterial._idCounter++;
        if (!this._uuid) this._uuid = `pm_${this.id}`;
    }

    /**
     * @en
     * clone.
     * @zh
     * 克隆。
     */
    public clone (): PhysicsMaterial {
        const c = new PhysicsMaterial();
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
    public destroy (): boolean {
        assertMutationAllowed(this, 'PhysicsMaterial.destroy');
        assertPhysicsMaterialDestroyable(this);
        if (super.destroy()) {
            const idx = PhysicsMaterial.allMaterials.indexOf(this);
            if (idx >= 0) {
                PhysicsMaterial.allMaterials.splice(idx, 1);
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
    public setValues (friction: number, rollingFriction: number, spinningFriction: number, restitution: number): void {
        assertMutationAllowed(this, 'PhysicsMaterial.setValues');
        const ticket = beginPhysicsMaterialValuesChange(this);
        if (ticket) {
            try {
                ticket.prepare({
                    read: () => {
                        const before: MaterialValues = [this._friction, this._restitution, this._rollingFriction, this._spinningFriction];
                        // Public argument order is friction, rolling, spinning, restitution.
                        const candidate: MaterialValues = [friction, restitution, rollingFriction, spinningFriction];
                        return {
                            before,
                            candidate,
                            // Keep the original exact comparisons and short-circuit order.
                            get changed () {
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
                    emit: () => this.emit(PhysicsMaterial.EVENT_UPDATE),
                    readActual: () => [this._friction, this._restitution, this._rollingFriction, this._spinningFriction],
                });
                ticket.apply();
            } finally {
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
        if (emitUpdate) this.emit(PhysicsMaterial.EVENT_UPDATE);
    }
}
