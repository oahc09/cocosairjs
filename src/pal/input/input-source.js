/*
 Copyright (c) 2022 Chukong Technologies Inc.
 Copyright (c) 2022-2023 Xiamen Yaji Software Co., Ltd.

 http://www.cocos.com

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
import { Vec2, Vec3 } from '../../cocos/core/math';
/**
 * @en The abstract class for input source, which is used to control the input signal of a mono input source
 * @zh InputSource 抽象类，该类用于控制单一输入源的输入信号
 */
export class InputSource {
}
/**
 * @en The class for input source of 1D Axis, which is used to control the input signal of a mono input source
 * @zh 1D 轴的 InputSource 类，该类用于控制单一输入源的输入信号
 */
export class InputSourceAxis1D extends InputSource {
    /**
     * @en Get the signal value of the input source, ranged from -1 to 1
     * @zh 获取输入源的信号值，取值范围从 -1 到 1
     */
    getValue() {
        throw new Error('Method not implemented.');
    }
}
/**
 * @en The class for input source of 2D Axis, which is used to control the input signal of a mono input source
 * @zh 2D 轴的 InputSource 类，该类用于控制单一输入源的输入信号
 */
export class InputSourceAxis2D extends InputSource {
    /**
     * @en Get the signal value of the input source, which returns a Vec2 object.
     * @zh 获取输入源的信号值，该方法返回一个 Vec2 对象
     */
    getValue() {
        throw new Error('Method not implemented.');
    }
}
/**
 * @en The class for input source of 3D Axis, which is used to control the input signal of a mono input source
 * @zh 3D 轴的 InputSource 类，该类用于控制单一输入源的输入信号
 */
export class InputSourceAxis3D extends InputSource {
    /**
     * @en Get the signal value of the input source, which returns a Vec3 object.
     * @zh 获取输入源的信号值，该方法返回一个 Vec3 对象
     */
    getValue() {
        throw new Error('Method not implemented.');
    }
}
/**
 * @en The class for input source of Quaternion, which is used to control the input signal of a mono input source
 * @zh 四元数的 InputSource 类，该类用于控制单一输入源的输入信号
 */
export class InputSourceQuat extends InputSource {
    /**
     * @en Get the signal value of the input source, which returns a Quat object.
     * @zh 获取输入源的信号值，该方法返回一个 Quat 对象
     */
    getValue() {
        throw new Error('Method not implemented.');
    }
}
/**
 * @en The class for input source of 1D Axis, which is used to control the input signal of a composite of multi input source
 * @zh 1D 轴的 InputSource 类，该类用于控制多个输入源组合的输入信号
 */
export class CompositeInputSourceAxis1D extends InputSourceAxis1D {
    constructor(options) {
        super();
        this.positive = options.positive;
        this.negative = options.negative;
    }
    /**
     * @en Get the signal value of the input source, ranged from -1 to 1.
     * @zh 获取输入源的信号值，取值范围从 -1 到 1
     */
    getValue() {
        const positiveValue = this.positive.getValue();
        const negativeValue = this.negative.getValue();
        if (Math.abs(positiveValue) > Math.abs(negativeValue)) {
            return positiveValue;
        }
        return -negativeValue;
    }
}
/**
 * @en The class for input source of 2D Axis, which is used to control the input signal of a composite of multi input source
 * @zh 2D 轴的 InputSource 类，该类用于控制多个输入源组合的输入信号
 */
export class CompositeInputSourceAxis2D extends InputSourceAxis2D {
    constructor(options) {
        super();
        this.up = options.up;
        this.down = options.down;
        this.left = options.left;
        this.right = options.right;
        this.xAxis = new CompositeInputSourceAxis1D({ positive: this.right, negative: this.left });
        this.yAxis = new CompositeInputSourceAxis1D({ positive: this.up, negative: this.down });
    }
    /**
     * @en Get the signal value of the input source, which returns a Vec2 object.
     * @zh 获取输入源的信号值，该方法返回一个 Vec2 对象
     */
    getValue() {
        return new Vec2(this.xAxis.getValue(), this.yAxis.getValue());
    }
}
/**
 * @en The class for input source of 3D Axis, which is used to control the input signal of a composite of multi input source
 * @zh 3D 轴的 InputSource 类，该类用于控制多个输入源组合的输入信号
 */
export class CompositeInputSourceAxis3D extends InputSourceAxis3D {
    constructor(options) {
        super();
        this.up = options.up;
        this.down = options.down;
        this.left = options.left;
        this.right = options.right;
        this.forward = options.forward;
        this.backward = options.backward;
        this.xAxis = new CompositeInputSourceAxis1D({ positive: this.right, negative: this.left });
        this.yAxis = new CompositeInputSourceAxis1D({ positive: this.up, negative: this.down });
        this.zAxis = new CompositeInputSourceAxis1D({ positive: this.forward, negative: this.backward });
    }
    /**
     * @en Get the signal value of the input source, which returns a Vec3 object.
     * @zh 获取输入源的信号值，该方法返回一个 Vec3 对象
     */
    getValue() {
        return new Vec3(this.xAxis.getValue(), this.yAxis.getValue(), this.zAxis.getValue());
    }
}
/**
 * @en The class for input source of mono button, whose input signal value is ranged from 0 to 1
 * @zh 单一按键输入源类, 输入信号源的取值范围是 0 到 1
 */
export class InputSourceButton extends InputSourceAxis1D {
    /**
     * @en Get the signal value of the input source, ranged from 0 to 1
     * @zh 获取输入源的信号值，取值范围从 0 到 1
     */
    getValue() {
        return super.getValue();
    }
}
/**
 * @en The class for input source of dpad, whose input signal value a Vec2 object
 * @zh 手柄方向键输入源类, 输入信号源的取值是一个 Vec2 对象
 */
export class InputSourceDpad extends CompositeInputSourceAxis2D {
}
/**
 * @en The class for input source of stick, whose input signal value a Vec2 object
 * @zh 摇杆输入源类, 输入信号源的取值是一个 Vec2 对象
 */
export class InputSourceStick extends CompositeInputSourceAxis2D {
}
/**
 * @en The class for input source of orientation, whose input signal value a Quat object
 * @zh 方向输入源类, 输入信号源的取值是一个 Quat 对象
 */
export class InputSourceOrientation extends InputSourceQuat {
    /**
     * @en Get the signal value of the input source, which returns a Quat object.
     * @zh 获取输入源的信号值，该方法返回一个 Quat 对象
     */
    getValue() {
        return super.getValue();
    }
}
/**
 * @en The class for input source of position, whose input signal value a Vec3 object
 * @zh 坐标输入源类, 输入信号源的取值是一个 Vec3 对象
 */
export class InputSourcePosition extends InputSourceAxis3D {
    /**
     * @en Get the signal value of the input source, which returns a Vec3 object.
     * @zh 获取输入源的信号值，该方法返回一个 Vec3 对象
     */
    getValue() {
        return super.getValue();
    }
}
/**
 * @en The class for input source of mono button touch, whose input signal value is ranged from 0 or 1
 * @zh 单一按键触摸输入源类, 输入信号源的取值范围是 0 或 1
 */
export class InputSourceTouch extends InputSourceAxis1D {
    /**
     * @en Get the signal value of the input source, ranged from 0 or 1
     * @zh 获取输入源的信号值，取值范围从 0 或 1
     */
    getValue() {
        return super.getValue();
    }
}
