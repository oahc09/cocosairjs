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
/**
 * Cocos AIR — Spark three.js-API 兼容门面（SPK-05a）。
 *
 * 本文件由 `spark-cocosairjs/src/air-compat.js` 逐成员转为 TypeScript：它是「冻结上游
 * Spark 的 three API 面 → CocosAirJS 元素」的适配器，供构建期把 `three` specifier
 * 重定向到此模块（SPK-11）。它不 `import` Three.js 运行库；GPU 工作全部在 CocosRenderer
 * 侧经原生 gfx 完成，本层只承载 CPU 场景/数据契约。数学符号（Vec/Mat/Quat/Color/Ray/Box3）
 * 由并行的 SPK-04 `./spark-math`（委托 `cc.math`）提供并原样再导出；PMREMGenerator 由
 * SPK-06 `./pmrem` 提供。本层不进 `cocosair` 根导出面（SPK-05a 硬约束 1）。
 *
 * 逐成员归属见每条 `@air-element` 注释；标注为 `none` 者为引擎无对应 API 形状、本层自持的
 * three 侧协议常量或兼容簿记类（其数值算法仍委托 ./spark-math → cc.math，无重复算法实现）。
 */

import {
    Box3,
    Color,
    Euler,
    Matrix3,
    Matrix4,
    MathUtils,
    NoColorSpace,
    Quaternion,
    Ray,
    Vector2,
    Vector3,
    Vector4,
} from './spark-math';

// @air-element none:sparkMathReExport —— 数学符号（Vector2/3/4、Matrix3/4、Quaternion、Euler、Color、Ray、Box3、MathUtils、色彩空间）全部委托 SPK-04 ./spark-math → cc.math/cc.geometry，本层原样再导出，不重定义
export * from './spark-math';

// @air-element none:REVISION —— 公开 Spark 特性协商用协议字面量，非引擎构建号，须保持 three 侧字符串
export const REVISION = '180';

// @air-element none:FrontSide —— 面剔除协议枚举，上游按 three 数值协商，非 gfx 枚举值，须保持字面量
export const FrontSide = 0;
// @air-element none:BackSide —— 面剔除协议枚举，上游按 three 数值协商，非 gfx 枚举值，须保持字面量
export const BackSide = 1;
// @air-element none:DoubleSide —— 面剔除协议枚举，上游按 three 数值协商，非 gfx 枚举值，须保持字面量
export const DoubleSide = 2;

// @air-element none:NoBlending —— 混合模式协议枚举，上游按 three 数值协商，非 gfx.GFXBlendState 值，须保持字面量
export const NoBlending = 0;
// @air-element none:NormalBlending —— 混合模式协议枚举，须保持 three 数值
export const NormalBlending = 1;
// @air-element none:AdditiveBlending —— 混合模式协议枚举，须保持 three 数值
export const AdditiveBlending = 2;
// @air-element none:SubtractiveBlending —— 混合模式协议枚举，须保持 three 数值
export const SubtractiveBlending = 3;
// @air-element none:MultiplyBlending —— 混合模式协议枚举，须保持 three 数值
export const MultiplyBlending = 4;
// @air-element none:CustomBlending —— 混合模式协议枚举，须保持 three 数值
export const CustomBlending = 5;

// @air-element none:AddEquation —— 混合方程协议枚举，须保持 three 数值
export const AddEquation = 100;
// @air-element none:SubtractEquation —— 混合方程协议枚举，须保持 three 数值
export const SubtractEquation = 101;
// @air-element none:ReverseSubtractEquation —— 混合方程协议枚举，须保持 three 数值
export const ReverseSubtractEquation = 102;
// @air-element none:MinEquation —— 混合方程协议枚举，须保持 three 数值
export const MinEquation = 103;
// @air-element none:MaxEquation —— 混合方程协议枚举，须保持 three 数值
export const MaxEquation = 104;

// @air-element none:ZeroFactor —— 混合因子协议枚举，须保持 three 数值
export const ZeroFactor = 200;
// @air-element none:OneFactor —— 混合因子协议枚举，须保持 three 数值
export const OneFactor = 201;
// @air-element none:SrcColorFactor —— 混合因子协议枚举，须保持 three 数值
export const SrcColorFactor = 202;
// @air-element none:OneMinusSrcColorFactor —— 混合因子协议枚举，须保持 three 数值
export const OneMinusSrcColorFactor = 203;
// @air-element none:SrcAlphaFactor —— 混合因子协议枚举，须保持 three 数值
export const SrcAlphaFactor = 204;
// @air-element none:OneMinusSrcAlphaFactor —— 混合因子协议枚举，须保持 three 数值
export const OneMinusSrcAlphaFactor = 205;
// @air-element none:DstAlphaFactor —— 混合因子协议枚举，须保持 three 数值
export const DstAlphaFactor = 206;
// @air-element none:OneMinusDstAlphaFactor —— 混合因子协议枚举，须保持 three 数值
export const OneMinusDstAlphaFactor = 207;
// @air-element none:DstColorFactor —— 混合因子协议枚举，须保持 three 数值
export const DstColorFactor = 208;
// @air-element none:OneMinusDstColorFactor —— 混合因子协议枚举，须保持 three 数值
export const OneMinusDstColorFactor = 209;
// @air-element none:SrcAlphaSaturateFactor —— 混合因子协议枚举，须保持 three 数值
export const SrcAlphaSaturateFactor = 210;

// @air-element none:NeverDepth —— 深度比较协议枚举，须保持 three 数值
export const NeverDepth = 0;
// @air-element none:AlwaysDepth —— 深度比较协议枚举，须保持 three 数值
export const AlwaysDepth = 1;
// @air-element none:LessDepth —— 深度比较协议枚举，须保持 three 数值
export const LessDepth = 2;
// @air-element none:LessEqualDepth —— 深度比较协议枚举，须保持 three 数值
export const LessEqualDepth = 3;
// @air-element none:EqualDepth —— 深度比较协议枚举，须保持 three 数值
export const EqualDepth = 4;
// @air-element none:GreaterEqualDepth —— 深度比较协议枚举，须保持 three 数值
export const GreaterEqualDepth = 5;
// @air-element none:GreaterDepth —— 深度比较协议枚举，须保持 three 数值
export const GreaterDepth = 6;
// @air-element none:NotEqualDepth —— 深度比较协议枚举，须保持 three 数值
export const NotEqualDepth = 7;

// @air-element none:NoToneMapping —— 色调映射协议枚举，须保持 three 数值
export const NoToneMapping = 0;
// @air-element none:LinearToneMapping —— 色调映射协议枚举，须保持 three 数值
export const LinearToneMapping = 1;
// @air-element none:ReinhardToneMapping —— 色调映射协议枚举，须保持 three 数值
export const ReinhardToneMapping = 2;
// @air-element none:ACESFilmicToneMapping —— 色调映射协议枚举，须保持 three 数值
export const ACESFilmicToneMapping = 4;

// @air-element none:UVMapping —— 贴图映射协议枚举，须保持 three 数值
export const UVMapping = 300;
// @air-element none:CubeReflectionMapping —— 贴图映射协议枚举，须保持 three 数值
export const CubeReflectionMapping = 301;
// @air-element none:CubeUVReflectionMapping —— 贴图映射协议枚举，须保持 three 数值
export const CubeUVReflectionMapping = 306;

// @air-element none:RepeatWrapping —— 包裹/过滤协议枚举，须保持 three 数值
export const RepeatWrapping = 1000;
// @air-element none:ClampToEdgeWrapping —— 包裹/过滤协议枚举，须保持 three 数值
export const ClampToEdgeWrapping = 1001;
// @air-element none:MirroredRepeatWrapping —— 包裹/过滤协议枚举，须保持 three 数值
export const MirroredRepeatWrapping = 1002;
// @air-element none:NearestFilter —— 包裹/过滤协议枚举，须保持 three 数值
export const NearestFilter = 1003;
// @air-element none:NearestMipmapNearestFilter —— 包裹/过滤协议枚举，须保持 three 数值
export const NearestMipmapNearestFilter = 1004;
// @air-element none:NearestMipmapLinearFilter —— 包裹/过滤协议枚举，须保持 three 数值
export const NearestMipmapLinearFilter = 1005;
// @air-element none:LinearFilter —— 包裹/过滤协议枚举，须保持 three 数值
export const LinearFilter = 1006;
// @air-element none:LinearMipmapNearestFilter —— 包裹/过滤协议枚举，须保持 three 数值
export const LinearMipmapNearestFilter = 1007;
// @air-element none:LinearMipmapLinearFilter —— 包裹/过滤协议枚举，须保持 three 数值
export const LinearMipmapLinearFilter = 1008;
// @air-element none:LinearMipMapLinearFilter —— 包裹/过滤协议枚举别名（拼写变体），须保持 three 数值
export const LinearMipMapLinearFilter = 1008;

// @air-element none:UnsignedByteType —— 像素数据类型协议枚举，须保持 three 数值
export const UnsignedByteType = 1009;
// @air-element none:ByteType —— 像素数据类型协议枚举，须保持 three 数值
export const ByteType = 1010;
// @air-element none:ShortType —— 像素数据类型协议枚举，须保持 three 数值
export const ShortType = 1011;
// @air-element none:UnsignedShortType —— 像素数据类型协议枚举，须保持 three 数值
export const UnsignedShortType = 1012;
// @air-element none:IntType —— 像素数据类型协议枚举，须保持 three 数值
export const IntType = 1013;
// @air-element none:UnsignedIntType —— 像素数据类型协议枚举，须保持 three 数值
export const UnsignedIntType = 1014;
// @air-element none:FloatType —— 像素数据类型协议枚举，须保持 three 数值
export const FloatType = 1015;
// @air-element none:HalfFloatType —— 像素数据类型协议枚举，须保持 three 数值
export const HalfFloatType = 1016;

// @air-element none:AlphaFormat —— 像素格式协议枚举，须保持 three 数值（GPU 侧格式映射由 CocosRenderer 完成）
export const AlphaFormat = 1021;
// @air-element none:RGBFormat —— 像素格式协议枚举，须保持 three 数值
export const RGBFormat = 1022;
// @air-element none:RGBAFormat —— 像素格式协议枚举，须保持 three 数值
export const RGBAFormat = 1023;
// @air-element none:DepthFormat —— 像素格式协议枚举，须保持 three 数值
export const DepthFormat = 1026;
// @air-element none:DepthStencilFormat —— 像素格式协议枚举，须保持 three 数值
export const DepthStencilFormat = 1027;
// @air-element none:RedFormat —— 像素格式协议枚举，须保持 three 数值
export const RedFormat = 1028;
// @air-element none:RedIntegerFormat —— 像素格式协议枚举，须保持 three 数值
export const RedIntegerFormat = 1029;
// @air-element none:RGFormat —— 像素格式协议枚举，须保持 three 数值
export const RGFormat = 1030;
// @air-element none:RGIntegerFormat —— 像素格式协议枚举，须保持 three 数值
export const RGIntegerFormat = 1031;
// @air-element none:RGBIntegerFormat —— 像素格式协议枚举，须保持 three 数值
export const RGBIntegerFormat = 1032;
// @air-element none:RGBAIntegerFormat —— 像素格式协议枚举，须保持 three 数值
export const RGBAIntegerFormat = 1033;

// @air-element none:GLSL1 —— 着色器方言协议常量，须保持 three 字符串
export const GLSL1 = '100';
// @air-element none:GLSL3 —— 着色器方言协议常量，须保持 three 字符串
export const GLSL3 = '300 es';
// @air-element none:WebGLCoordinateSystem —— 坐标系协议枚举，须保持 three 数值
export const WebGLCoordinateSystem = 2000;
// @air-element none:WebGPUCoordinateSystem —— 坐标系协议枚举，须保持 three 数值
export const WebGPUCoordinateSystem = 2001;

// @air-element none:StaticDrawUsage —— 缓冲使用提示协议枚举，须保持 three/GL 数值
export const StaticDrawUsage = 35044;
// @air-element none:DynamicDrawUsage —— 缓冲使用提示协议枚举，须保持 three/GL 数值
export const DynamicDrawUsage = 35048;
// @air-element none:StreamDrawUsage —— 缓冲使用提示协议枚举，须保持 three/GL 数值
export const StreamDrawUsage = 35040;

// @air-element none:MOUSE —— 控制器鼠标按钮/动作协议常量对象，引擎无对应，纯 three 侧兼容字面量
export const MOUSE = {
    LEFT: 0,
    MIDDLE: 1,
    RIGHT: 2,
    ROTATE: 0,
    DOLLY: 1,
    PAN: 2,
};
// @air-element none:TOUCH —— 控制器触摸动作协议常量对象，引擎无对应，纯 three 侧兼容字面量
export const TOUCH = { ROTATE: 0, PAN: 1, DOLLY_PAN: 2, DOLLY_ROTATE: 3 };

let nextId = 0;
const unsupported = (name: string): never => {
    throw new Error(
        `CocosAirJS: ${name} is not implemented. This adapter supports Spark splat shaders, not general Three.js rendering.`,
    );
};

// @air-element none:EventDispatcher —— three 事件派发器形状，引擎事件系统 API 形状不同，本层自持监听集合簿记（无算法，仅派发）
export class EventDispatcher {
    _listeners?: Record<string, Set<any>>;
    addEventListener(type: string, listener: any) {
        this._listeners ??= {};
        (this._listeners[type] ??= new Set()).add(listener);
    }
    hasEventListener(type: string, listener: any) {
        return !!this._listeners?.[type]?.has(listener);
    }
    removeEventListener(type: string, listener: any) {
        this._listeners?.[type]?.delete(listener);
    }
    dispatchEvent(event: any) {
        const list = this._listeners?.[event.type];
        if (!list) return;
        event.target = this;
        for (const fn of [...list]) fn.call(this, event);
        event.target = null;
    }
}

// @air-element none:Layers —— three 侧逐位图层掩码实例；引擎 cc.Layers 是静态常量表而非可实例化掩码类，本层自持位运算
export class Layers {
    mask: number;
    constructor() {
        this.mask = 1;
    }
    set(c: number) {
        this.mask = (1 << c) | 0;
    }
    enable(c: number) {
        this.mask |= 1 << c;
    }
    enableAll() {
        this.mask = -1;
    }
    toggle(c: number) {
        this.mask ^= 1 << c;
    }
    disable(c: number) {
        this.mask &= ~(1 << c);
    }
    disableAll() {
        this.mask = 0;
    }
    test(l: Layers) {
        return (this.mask & l.mask) !== 0;
    }
    isEnabled(c: number) {
        return (this.mask & (1 << c)) !== 0;
    }
}

// @air-element none:Object3D —— three 场景图节点形状（矩阵树/变换/遍历）；引擎 cc.Node 为 ECS 组件、API 形状不符，本层自持树逻辑，数值算法委托 ./spark-math（cc.math）
export class Object3D extends EventDispatcher {
    static DEFAULT_UP = new Vector3(0, 1, 0);
    static DEFAULT_MATRIX_AUTO_UPDATE = true;
    static DEFAULT_MATRIX_WORLD_AUTO_UPDATE = true;
    [key: string]: any;
    constructor() {
        super();
        this.isObject3D = true;
        this.id = nextId++;
        this.uuid = MathUtils.generateUUID();
        this.name = '';
        this.type = 'Object3D';
        this.parent = null;
        this.children = [];
        this.up = Object3D.DEFAULT_UP.clone();
        this.position = new Vector3();
        this.rotation = new Euler();
        this.quaternion = new Quaternion();
        this.scale = new Vector3(1, 1, 1);
        this.rotation._onChange(() => this.quaternion.setFromEuler(this.rotation, false));
        this.quaternion._onChange(() => this.rotation.setFromQuaternion(this.quaternion, undefined, false));
        this.matrix = new Matrix4();
        this.matrixWorld = new Matrix4();
        this.modelViewMatrix = new Matrix4();
        this.normalMatrix = new Matrix3();
        this.matrixAutoUpdate = Object3D.DEFAULT_MATRIX_AUTO_UPDATE;
        this.matrixWorldAutoUpdate = Object3D.DEFAULT_MATRIX_WORLD_AUTO_UPDATE;
        this.matrixWorldNeedsUpdate = false;
        this.layers = new Layers();
        this.visible = true;
        this.castShadow = false;
        this.receiveShadow = false;
        this.frustumCulled = true;
        this.renderOrder = 0;
        this.animations = [];
        this.userData = {};
    }
    onBeforeRender() {}
    onAfterRender() {}
    onBeforeShadow() {}
    onAfterShadow() {}
    add(...objects: any[]) {
        for (const o of objects) {
            if (!o?.isObject3D) throw new TypeError('Object3D.add requires an Object3D');
            if (o === this) throw new Error('Object3D cannot be its own child');
            for (let p = this; p; p = p.parent) if (p === o) throw new Error('Object3D hierarchy cycle');
            o.removeFromParent();
            o.parent = this;
            this.children.push(o);
            o.dispatchEvent({ type: 'added' });
            this.dispatchEvent({ type: 'childadded', child: o });
        }
        return this;
    }
    remove(...objects: any[]) {
        for (const o of objects) {
            const i = this.children.indexOf(o);
            if (i !== -1) {
                o.parent = null;
                this.children.splice(i, 1);
                o.dispatchEvent({ type: 'removed' });
                this.dispatchEvent({ type: 'childremoved', child: o });
            }
        }
        return this;
    }
    removeFromParent() {
        this.parent?.remove(this);
        return this;
    }
    clear() {
        return this.remove(...this.children);
    }
    attach(o: any) {
        this.updateWorldMatrix(true, false);
        const m = this.matrixWorld.clone().invert();
        if (o.parent) {
            o.parent.updateWorldMatrix(true, false);
            m.multiply(o.parent.matrixWorld);
        }
        o.applyMatrix4(m);
        this.add(o);
        o.updateWorldMatrix(false, true);
        return this;
    }
    traverse(fn: (o: any) => void) {
        fn(this);
        for (const c of this.children) c.traverse(fn);
    }
    traverseVisible(fn: (o: any) => void) {
        if (!this.visible) return;
        fn(this);
        for (const c of this.children) c.traverseVisible(fn);
    }
    traverseAncestors(fn: (o: any) => void) {
        for (let p = this.parent; p; p = p.parent) fn(p);
    }
    getObjectByProperty(k: string, v: any) {
        if (this[k] === v) return this;
        for (const c of this.children) {
            const result = c.getObjectByProperty(k, v);
            if (result) return result;
        }
    }
    getObjectByName(v: any) {
        return this.getObjectByProperty('name', v);
    }
    getObjectById(v: any) {
        return this.getObjectByProperty('id', v);
    }
    getObjectsByProperty(k: string, v: any, result: any[] = []) {
        this.traverse((o) => {
            if (o[k] === v) result.push(o);
        });
        return result;
    }
    updateMatrix() {
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.matrixWorldNeedsUpdate = true;
    }
    updateMatrixWorld(force = false) {
        if (this.matrixAutoUpdate) this.updateMatrix();
        if (this.matrixWorldNeedsUpdate || force) {
            if (this.matrixWorldAutoUpdate) {
                if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
                else this.matrixWorld.copy(this.matrix);
            }
            this.matrixWorldNeedsUpdate = false;
            force = true;
        }
        for (const child of this.children) child.updateMatrixWorld(force);
    }
    updateWorldMatrix(updateParents: boolean, updateChildren: boolean) {
        if (updateParents && this.parent) this.parent.updateWorldMatrix(true, false);
        if (this.matrixAutoUpdate) this.updateMatrix();
        if (this.matrixWorldAutoUpdate) {
            if (this.parent) this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
            else this.matrixWorld.copy(this.matrix);
        }
        if (updateChildren) for (const c of this.children) c.updateWorldMatrix(false, true);
    }
    applyMatrix4(m: Matrix4) {
        if (this.matrixAutoUpdate) this.updateMatrix();
        this.matrix.premultiply(m);
        this.matrix.decompose(this.position, this.quaternion, this.scale);
        return this;
    }
    applyQuaternion(q: Quaternion) {
        this.quaternion.premultiply(q);
        return this;
    }
    setRotationFromAxisAngle(axis: Vector3, a: number) {
        this.quaternion.setFromAxisAngle(axis, a);
    }
    setRotationFromEuler(e: Euler) {
        this.quaternion.setFromEuler(e);
    }
    setRotationFromMatrix(m: Matrix4) {
        this.quaternion.setFromRotationMatrix(m);
    }
    setRotationFromQuaternion(q: Quaternion) {
        this.quaternion.copy(q);
    }
    rotateOnAxis(a: Vector3, t: number) {
        this.quaternion.multiply(new Quaternion().setFromAxisAngle(a, t));
        return this;
    }
    rotateOnWorldAxis(a: Vector3, t: number) {
        this.quaternion.premultiply(new Quaternion().setFromAxisAngle(a, t));
        return this;
    }
    rotateX(t: number) {
        return this.rotateOnAxis(new Vector3(1, 0, 0), t);
    }
    rotateY(t: number) {
        return this.rotateOnAxis(new Vector3(0, 1, 0), t);
    }
    rotateZ(t: number) {
        return this.rotateOnAxis(new Vector3(0, 0, 1), t);
    }
    translateOnAxis(a: Vector3, d: number) {
        this.position.add(a.clone().applyQuaternion(this.quaternion).multiplyScalar(d));
        return this;
    }
    translateX(d: number) {
        return this.translateOnAxis(new Vector3(1, 0, 0), d);
    }
    translateY(d: number) {
        return this.translateOnAxis(new Vector3(0, 1, 0), d);
    }
    translateZ(d: number) {
        return this.translateOnAxis(new Vector3(0, 0, 1), d);
    }
    localToWorld(v: Vector3) {
        this.updateWorldMatrix(true, false);
        return v.applyMatrix4(this.matrixWorld);
    }
    worldToLocal(v: Vector3) {
        this.updateWorldMatrix(true, false);
        return v.applyMatrix4(this.matrixWorld.clone().invert());
    }
    getWorldPosition(t: Vector3) {
        this.updateWorldMatrix(true, false);
        return t.setFromMatrixPosition(this.matrixWorld);
    }
    getWorldQuaternion(t: Quaternion) {
        this.updateWorldMatrix(true, false);
        this.matrixWorld.decompose(new Vector3(), t, new Vector3());
        return t;
    }
    getWorldScale(t: Vector3) {
        this.updateWorldMatrix(true, false);
        this.matrixWorld.decompose(new Vector3(), new Quaternion(), t);
        return t;
    }
    getWorldDirection(t: Vector3) {
        this.updateWorldMatrix(true, false);
        return t.setFromMatrixColumn(this.matrixWorld, 2).normalize();
    }
    lookAt(x: any, y?: number, z?: number) {
        const target = x?.isVector3 ? x : new Vector3(x, y, z);
        this.updateWorldMatrix(true, false);
        const position = new Vector3().setFromMatrixPosition(this.matrixWorld),
            m = new Matrix4();
        if (this.isCamera || this.isLight) m.lookAt(position, target, this.up);
        else m.lookAt(target, position, this.up);
        this.quaternion.setFromRotationMatrix(m);
        if (this.parent) {
            m.extractRotation(this.parent.matrixWorld);
            this.quaternion.premultiply(new Quaternion().setFromRotationMatrix(m).invert());
        }
    }
    copy(o: any, recursive = true) {
        this.name = o.name;
        this.up.copy(o.up);
        this.position.copy(o.position);
        this.rotation.order = o.rotation.order;
        this.quaternion.copy(o.quaternion);
        this.scale.copy(o.scale);
        this.matrix.copy(o.matrix);
        this.matrixWorld.copy(o.matrixWorld);
        for (const k of [
            'matrixAutoUpdate',
            'matrixWorldAutoUpdate',
            'matrixWorldNeedsUpdate',
            'visible',
            'castShadow',
            'receiveShadow',
            'frustumCulled',
            'renderOrder',
        ])
            this[k] = o[k];
        this.layers.mask = o.layers.mask;
        this.userData = JSON.parse(JSON.stringify(o.userData));
        if (recursive) for (const c of o.children) this.add(c.clone());
        return this;
    }
    clone(recursive = true) {
        return new (this.constructor as any)().copy(this, recursive);
    }
    raycast() {}
}

// @air-element none:Group —— three 场景图容器形状（继承本层 Object3D），引擎无同名独立容器对象，兼容簿记
export class Group extends Object3D {
    constructor() {
        super();
        this.type = 'Group';
        this.isGroup = true;
    }
}

// @air-element none:Scene —— three 侧场景数据容器形状（冻结上游按 THREE.Scene 协商，须保留）；引擎 cc.Scene 为 ECS 世界、API 形状不同，本层自持字段袋
export class Scene extends Object3D {
    constructor() {
        super();
        this.type = 'Scene';
        this.isScene = true;
        this.background = null;
        this.environment = null;
        this.fog = null;
        this.overrideMaterial = null;
        this.backgroundBlurriness = 0;
        this.backgroundIntensity = 1;
        this.environmentIntensity = 1;
    }
}

// @air-element none:Camera —— three 相机形状（视/投影矩阵袋），引擎 cc.Camera 为组件、非可脱离节点使用的矩阵对象，本层自持 view/proj 逆矩阵簿记，矩阵算法委托 ./spark-math
export class Camera extends Object3D {
    constructor() {
        super();
        this.type = 'Camera';
        this.isCamera = true;
        this.matrixWorldInverse = new Matrix4();
        this.projectionMatrix = new Matrix4();
        this.projectionMatrixInverse = new Matrix4();
        this.coordinateSystem = WebGLCoordinateSystem;
    }
    updateMatrixWorld(force?: boolean) {
        super.updateMatrixWorld(force);
        this.matrixWorldInverse.copy(this.matrixWorld).invert();
    }
    updateWorldMatrix(a: boolean, b: boolean) {
        super.updateWorldMatrix(a, b);
        this.matrixWorldInverse.copy(this.matrixWorld).invert();
    }
    getWorldDirection(t: Vector3) {
        return super.getWorldDirection(t).negate();
    }
    copy(o: any, r = true) {
        super.copy(o, r);
        this.matrixWorldInverse.copy(o.matrixWorldInverse);
        this.projectionMatrix.copy(o.projectionMatrix);
        this.projectionMatrixInverse.copy(o.projectionMatrixInverse);
        this.coordinateSystem = o.coordinateSystem;
        return this;
    }
}

// @air-element none:PerspectiveCamera —— three 透视相机形状与投影矩阵计算，引擎无脱离节点可用的同名矩阵相机，本层自持参数袋，makePerspective 委托 ./spark-math
export class PerspectiveCamera extends Camera {
    constructor(fov = 50, aspect = 1, near = 0.1, far = 2000) {
        super();
        this.type = 'PerspectiveCamera';
        this.isPerspectiveCamera = true;
        Object.assign(this, {
            fov,
            aspect,
            near,
            far,
            zoom: 1,
            focus: 10,
            filmGauge: 35,
            filmOffset: 0,
            view: null,
        });
        this.updateProjectionMatrix();
    }
    updateProjectionMatrix() {
        const near = this.near,
            top = (near * Math.tan((this.fov * Math.PI) / 360)) / this.zoom;
        let height = 2 * top,
            width = this.aspect * height,
            left = -0.5 * width,
            t = top;
        const v = this.view;
        if (v?.enabled) {
            left += (v.offsetX * width) / v.fullWidth;
            t -= (v.offsetY * height) / v.fullHeight;
            width *= v.width / v.fullWidth;
            height *= v.height / v.fullHeight;
        }
        if (this.filmOffset !== 0) left += (near * this.filmOffset) / this.getFilmWidth();
        this.projectionMatrix.makePerspective(left, left + width, t, t - height, near, this.far, this.coordinateSystem);
        this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
    }
    getFilmWidth() {
        return this.filmGauge * Math.min(this.aspect, 1);
    }
    getFilmHeight() {
        return this.filmGauge / Math.max(this.aspect, 1);
    }
    getFocalLength() {
        return (0.5 * this.getFilmHeight()) / Math.tan((this.fov * Math.PI) / 360);
    }
    setFocalLength(v: number) {
        this.fov = (Math.atan((0.5 * this.getFilmHeight()) / v) * 360) / Math.PI;
        this.updateProjectionMatrix();
    }
    getEffectiveFOV() {
        return (Math.atan(Math.tan((this.fov * Math.PI) / 360) / this.zoom) * 360) / Math.PI;
    }
    setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number) {
        this.aspect = fullWidth / fullHeight;
        this.view = {
            enabled: true,
            fullWidth,
            fullHeight,
            offsetX: x,
            offsetY: y,
            width,
            height,
        };
        this.updateProjectionMatrix();
    }
    clearViewOffset() {
        if (this.view) this.view.enabled = false;
        this.updateProjectionMatrix();
    }
    copy(o: any, r = true) {
        super.copy(o, r);
        for (const k of ['fov', 'aspect', 'near', 'far', 'zoom', 'focus', 'filmGauge', 'filmOffset']) this[k] = o[k];
        this.view = o.view ? { ...o.view } : null;
        return this;
    }
}

// @air-element none:OrthographicCamera —— three 正交相机形状与投影矩阵计算，引擎无同名脱离节点相机，本层自持参数袋，makeOrthographic 委托 ./spark-math
export class OrthographicCamera extends Camera {
    constructor(left = -1, right = 1, top = 1, bottom = -1, near = 0.1, far = 2000) {
        super();
        this.type = 'OrthographicCamera';
        this.isOrthographicCamera = true;
        Object.assign(this, {
            left,
            right,
            top,
            bottom,
            near,
            far,
            zoom: 1,
            view: null,
        });
        this.updateProjectionMatrix();
    }
    updateProjectionMatrix() {
        const dx = (this.right - this.left) / (2 * this.zoom),
            dy = (this.top - this.bottom) / (2 * this.zoom),
            cx = (this.right + this.left) / 2,
            cy = (this.top + this.bottom) / 2;
        let l = cx - dx,
            r = cx + dx,
            t = cy + dy,
            b = cy - dy;
        if (this.view?.enabled) {
            const v = this.view,
                sx = (this.right - this.left) / v.fullWidth / this.zoom,
                sy = (this.top - this.bottom) / v.fullHeight / this.zoom;
            l += sx * v.offsetX;
            r = l + sx * v.width;
            t -= sy * v.offsetY;
            b = t - sy * v.height;
        }
        this.projectionMatrix.makeOrthographic(l, r, t, b, this.near, this.far, this.coordinateSystem);
        this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
    }
    setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number) {
        this.view = {
            enabled: true,
            fullWidth,
            fullHeight,
            offsetX: x,
            offsetY: y,
            width,
            height,
        };
        this.updateProjectionMatrix();
    }
    clearViewOffset() {
        if (this.view) this.view.enabled = false;
        this.updateProjectionMatrix();
    }
    copy(o: any, r = true) {
        super.copy(o, r);
        for (const k of ['left', 'right', 'top', 'bottom', 'near', 'far', 'zoom']) this[k] = o[k];
        this.view = o.view ? { ...o.view } : null;
        return this;
    }
}

// @air-element none:BufferAttribute —— three 顶点属性 CPU 包装（typed array/itemSize/updateRange 簿记）；引擎 gfx.Buffer 为 GPU 资源、无此 CPU 形状，本层自持，向量读写委托 ./spark-math
export class BufferAttribute {
    [key: string]: any;
    constructor(array: any, itemSize: number, normalized = false) {
        if (!ArrayBuffer.isView(array)) throw new TypeError('BufferAttribute requires typed array');
        this.isBufferAttribute = true;
        this.name = '';
        this.array = array;
        this.itemSize = itemSize;
        this.count = (array as unknown as { length: number }).length / itemSize;
        this.normalized = normalized;
        this.usage = StaticDrawUsage;
        this.updateRanges = [];
        this.gpuType = FloatType;
        this.version = 0;
    }
    set needsUpdate(v: boolean) {
        if (v === true) this.version++;
    }
    setUsage(v: number) {
        this.usage = v;
        return this;
    }
    addUpdateRange(start: number, count: number) {
        this.updateRanges.push({ start, count });
    }
    clearUpdateRanges() {
        this.updateRanges.length = 0;
    }
    copy(a: any) {
        this.array = new a.array.constructor(a.array);
        this.itemSize = a.itemSize;
        this.count = a.count;
        this.normalized = a.normalized;
        this.usage = a.usage;
        return this;
    }
    clone() {
        return new (this.constructor as any)(this.array.slice(), this.itemSize, this.normalized);
    }
    set(a: any, offset = 0) {
        this.array.set(a, offset);
        return this;
    }
    getX(i: number) {
        return this.array[i * this.itemSize];
    }
    getY(i: number) {
        return this.array[i * this.itemSize + 1];
    }
    getZ(i: number) {
        return this.array[i * this.itemSize + 2];
    }
    getW(i: number) {
        return this.array[i * this.itemSize + 3];
    }
    setX(i: number, x: number) {
        this.array[i * this.itemSize] = x;
        return this;
    }
    setY(i: number, y: number) {
        this.array[i * this.itemSize + 1] = y;
        return this;
    }
    setZ(i: number, z: number) {
        this.array[i * this.itemSize + 2] = z;
        return this;
    }
    setW(i: number, w: number) {
        this.array[i * this.itemSize + 3] = w;
        return this;
    }
    setXY(i: number, x: number, y: number) {
        return this.setX(i, x).setY(i, y);
    }
    setXYZ(i: number, x: number, y: number, z: number) {
        return this.setXY(i, x, y).setZ(i, z);
    }
    setXYZW(i: number, x: number, y: number, z: number, w: number) {
        return this.setXYZ(i, x, y, z).setW(i, w);
    }
    applyMatrix4(m: Matrix4) {
        const v = new Vector3();
        for (let i = 0; i < this.count; i++) {
            v.fromBufferAttribute(this as unknown as { array: ArrayLike<number>; itemSize: number }, i).applyMatrix4(m);
            this.setXYZ(i, v.x, v.y, v.z);
        }
        return this;
    }
    onUpload(f: any) {
        this.onUploadCallback = f;
        return this;
    }
    onUploadCallback() {}
}

// @air-element none:Float32BufferAttribute —— BufferAttribute 的 Float32Array 特化子类（three 类型别名形状），引擎无同名类，兼容簿记
export class Float32BufferAttribute extends BufferAttribute {
    constructor(a: any, n: number, norm = false) {
        super(new Float32Array(a), n, norm);
    }
}

// @air-element none:Uint16BufferAttribute —— BufferAttribute 的 Uint16Array 特化子类（three 类型别名形状），引擎无同名类，兼容簿记
export class Uint16BufferAttribute extends BufferAttribute {
    constructor(a: any, n: number, norm = false) {
        super(new Uint16Array(a), n, norm);
    }
}

// @air-element none:Uint32BufferAttribute —— BufferAttribute 的 Uint32Array 特化子类（three 类型别名形状），引擎无同名类，兼容簿记
export class Uint32BufferAttribute extends BufferAttribute {
    constructor(a: any, n: number, norm = false) {
        super(new Uint32Array(a), n, norm);
    }
}

// @air-element none:InstancedBufferAttribute —— 实例化顶点属性 CPU 包装（meshPerAttribute 簿记），引擎 gfx 无此 CPU 形状，兼容簿记
export class InstancedBufferAttribute extends BufferAttribute {
    constructor(a: any, n: number, norm = false, meshPerAttribute = 1) {
        super(a, n, norm);
        this.isInstancedBufferAttribute = true;
        this.meshPerAttribute = meshPerAttribute;
    }
}

// @air-element none:BufferGeometry —— three 几何 CPU 形状（属性/索引/group/包围盒簿记）；引擎无同名独立几何对象（gfx.InputAssembler 为 GPU 侧），本层自持，位置变换委托 ./spark-math 与 Box3
export class BufferGeometry extends EventDispatcher {
    [key: string]: any;
    constructor() {
        super();
        this.isBufferGeometry = true;
        this.id = nextId++;
        this.uuid = MathUtils.generateUUID();
        this.type = 'BufferGeometry';
        this.name = '';
        this.index = null;
        this.attributes = {};
        this.morphAttributes = {};
        this.groups = [];
        this.boundingBox = null;
        this.boundingSphere = null;
        this.drawRange = { start: 0, count: Infinity };
        this.userData = {};
    }
    setAttribute(n: string, a: any) {
        this.attributes[n] = a;
        return this;
    }
    getAttribute(n: string) {
        return this.attributes[n];
    }
    deleteAttribute(n: string) {
        delete this.attributes[n];
        return this;
    }
    hasAttribute(n: string) {
        return n in this.attributes;
    }
    setIndex(a: any) {
        this.index = Array.isArray(a)
            ? new (a.some((v: number) => v > 65535) ? Uint32BufferAttribute : Uint16BufferAttribute)(a, 1)
            : a;
        return this;
    }
    getIndex() {
        return this.index;
    }
    setDrawRange(start: number, count: number) {
        this.drawRange = { start, count };
    }
    addGroup(start: number, count: number, materialIndex = 0) {
        this.groups.push({ start, count, materialIndex });
    }
    clearGroups() {
        this.groups = [];
    }
    applyMatrix4(m: Matrix4) {
        this.attributes.position?.applyMatrix4(m);
        if (this.attributes.position) this.attributes.position.needsUpdate = true;
        if (this.boundingBox) this.computeBoundingBox();
        return this;
    }
    translate(x: number, y: number, z: number) {
        return this.applyMatrix4(new Matrix4().makeTranslation(x, y, z));
    }
    scale(x: number, y: number, z: number) {
        return this.applyMatrix4(new Matrix4().makeScale(x, y, z));
    }
    rotateX(a: number) {
        return this.applyMatrix4(new Matrix4().makeRotationX(a));
    }
    rotateY(a: number) {
        return this.applyMatrix4(new Matrix4().makeRotationY(a));
    }
    rotateZ(a: number) {
        return this.applyMatrix4(new Matrix4().makeRotationZ(a));
    }
    computeBoundingBox() {
        this.boundingBox = new Box3();
        const p = this.attributes.position;
        if (p)
            for (let i = 0; i < p.count; i++) this.boundingBox.expandByPoint(new Vector3().fromBufferAttribute(p, i));
    }
    dispose() {
        this.dispatchEvent({ type: 'dispose' });
    }
    clone() {
        return new (this.constructor as any)().copy(this);
    }
    copy(g: any) {
        this.index = g.index?.clone() || null;
        this.attributes = {};
        for (const k in g.attributes) this.attributes[k] = g.attributes[k].clone();
        this.drawRange = { ...g.drawRange };
        this.groups = g.groups.map((g) => ({ ...g }));
        return this;
    }
}

// @air-element none:InstancedBufferGeometry —— BufferGeometry 的实例化派生形状（instanceCount 簿记），引擎无同名类，兼容簿记
export class InstancedBufferGeometry extends BufferGeometry {
    constructor() {
        super();
        this.isInstancedBufferGeometry = true;
        this.type = 'InstancedBufferGeometry';
        this.instanceCount = Infinity;
    }
    copy(g: any) {
        super.copy(g);
        this.instanceCount = g.instanceCount;
        return this;
    }
}

// @air-element none:Material —— three 材质状态袋（混合/深度/模板/颜色写等渲染态字段）；引擎材质系统 API 形状不同，本层仅持有 CPU 侧协议字段，不含 GPU 逻辑
export class Material extends EventDispatcher {
    [key: string]: any;
    constructor() {
        super();
        this.isMaterial = true;
        this.id = nextId++;
        this.uuid = MathUtils.generateUUID();
        Object.assign(this, {
            name: '',
            type: 'Material',
            side: FrontSide,
            opacity: 1,
            transparent: false,
            blending: NormalBlending,
            blendSrc: SrcAlphaFactor,
            blendDst: OneMinusSrcAlphaFactor,
            blendEquation: AddEquation,
            blendSrcAlpha: null,
            blendDstAlpha: null,
            blendEquationAlpha: null,
            depthFunc: LessEqualDepth,
            depthTest: true,
            depthWrite: true,
            colorWrite: true,
            stencilWrite: false,
            alphaTest: 0,
            premultipliedAlpha: false,
            visible: true,
            toneMapped: true,
            vertexColors: false,
            version: 0,
            userData: {},
        });
    }
    set needsUpdate(v: boolean) {
        if (v) this.version++;
    }
    setValues(p: any) {
        if (p) Object.assign(this, p);
    }
    dispose() {
        this.dispatchEvent({ type: 'dispose' });
    }
    copy(m: any) {
        for (const k of Object.keys(m)) if (!['id', 'uuid', '_listeners'].includes(k)) this[k] = m[k];
        return this;
    }
    clone() {
        return new (this.constructor as any)().copy(this);
    }
    onBeforeCompile() {}
    customProgramCacheKey() {
        return this.onBeforeCompile.toString();
    }
}

// @air-element none:ShaderMaterial —— 着色器材质形状（defines/uniforms/shader 源码袋），引擎无同名 CPU 材质，本层自持，uniform 克隆委托 UniformsUtils（内部向量委托 ./spark-math）
export class ShaderMaterial extends Material {
    constructor(parameters: any = {}) {
        super();
        this.isShaderMaterial = true;
        this.type = 'ShaderMaterial';
        this.defines = {};
        this.uniforms = {};
        this.uniformsGroups = [];
        this.vertexShader = 'void main(){gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}';
        this.fragmentShader = 'void main(){gl_FragColor=vec4(1.0);}';
        this.glslVersion = null;
        this.uniformsNeedUpdate = false;
        this.extensions = {};
        this.lights = false;
        this.clipping = false;
        this.setValues(parameters);
    }
    copy(m: any) {
        super.copy(m);
        this.defines = { ...m.defines };
        this.uniforms = UniformsUtils.clone(m.uniforms);
        return this;
    }
}

// @air-element none:RawShaderMaterial —— ShaderMaterial 的裸着色器变体形状标记，引擎无同名类，兼容簿记
export class RawShaderMaterial extends ShaderMaterial {
    constructor(p: any = {}) {
        super(p);
        this.isRawShaderMaterial = true;
        this.type = 'RawShaderMaterial';
    }
}

// @air-element none:MeshStandardMaterial —— 标准材质 CPU 字段袋形状（color/envMap），引擎材质形状不同，本层自持，color 委托 ./spark-math
export class MeshStandardMaterial extends Material {
    constructor(p: any = {}) {
        super();
        this.isMeshStandardMaterial = true;
        this.type = 'MeshStandardMaterial';
        this.color = new Color(1, 1, 1);
        this.envMap = null;
        this.setValues(p);
    }
}

// @air-element none:MeshBasicMaterial —— 基础材质 CPU 字段袋形状（color），引擎材质形状不同，本层自持，color 委托 ./spark-math
export class MeshBasicMaterial extends Material {
    constructor(p: any = {}) {
        super();
        this.isMeshBasicMaterial = true;
        this.type = 'MeshBasicMaterial';
        this.color = new Color(1, 1, 1);
        this.setValues(p);
    }
}

// @air-element none:Mesh —— three 网格对象形状（几何/材质引用），引擎渲染单元 API 形状不同，本层仅持有引用簿记，通用三角拾取显式抛错
export class Mesh extends Object3D {
    constructor(geometry = new BufferGeometry(), material = new MeshBasicMaterial()) {
        super();
        this.isMesh = true;
        this.type = 'Mesh';
        this.geometry = geometry;
        this.material = material;
        this.count = 1;
    }
    copy(m: any, r = true) {
        super.copy(m, r);
        this.geometry = m.geometry;
        this.material = Array.isArray(m.material) ? m.material.slice() : m.material;
        return this;
    }
    raycast() {
        unsupported('generic Mesh triangle raycast');
    }
}

// @air-element none:Source —— three 纹理数据源版本袋（data/version 簿记），引擎无同名类，兼容簿记
export class Source {
    [key: string]: any;
    constructor(data: any = null) {
        this.isSource = true;
        this.id = nextId++;
        this.uuid = MathUtils.generateUUID();
        this.data = data;
        this.dataReady = true;
        this.version = 0;
    }
    set needsUpdate(v: boolean) {
        if (v) this.version++;
    }
}

// @air-element none:Texture —— three 纹理 CPU 描述形状（包裹/过滤/格式/偏移等协议字段袋）；引擎 gfx.Texture 为 GPU 资源、无此 CPU 描述面，本层自持，UV 矩阵/偏移委托 ./spark-math
export class Texture extends EventDispatcher {
    [key: string]: any;
    constructor(
        image: any = null,
        mapping = UVMapping,
        wrapS = ClampToEdgeWrapping,
        wrapT = ClampToEdgeWrapping,
        magFilter = LinearFilter,
        minFilter = LinearMipmapLinearFilter,
        format = RGBAFormat,
        type = UnsignedByteType,
        anisotropy = 1,
        colorSpace = NoColorSpace,
    ) {
        super();
        this.isTexture = true;
        this.id = nextId++;
        this.uuid = MathUtils.generateUUID();
        this.name = '';
        this.source = new Source(image);
        Object.assign(this, {
            mipmaps: [],
            mapping,
            channel: 0,
            wrapS,
            wrapT,
            magFilter,
            minFilter,
            format,
            internalFormat: null,
            type,
            anisotropy,
            colorSpace,
            offset: new Vector2(),
            repeat: new Vector2(1, 1),
            center: new Vector2(),
            rotation: 0,
            matrixAutoUpdate: true,
            matrix: new Matrix3(),
            generateMipmaps: true,
            premultiplyAlpha: false,
            flipY: true,
            unpackAlignment: 4,
            version: 0,
            pmremVersion: 0,
            onUpdate: null,
            renderTarget: null,
            isRenderTargetTexture: false,
            userData: {},
            updateRanges: [],
        });
    }
    get image() {
        return this.source.data;
    }
    set image(v: any) {
        this.source.data = v;
    }
    set needsPMREMUpdate(v: boolean) {
        if (v === true) this.pmremVersion++;
    }
    set needsUpdate(v: boolean) {
        if (v) {
            this.version++;
            this.source.needsUpdate = true;
        }
    }
    addUpdateRange(start: number, count: number) {
        this.updateRanges.push({ start, count });
    }
    clearUpdateRanges() {
        this.updateRanges.length = 0;
    }
    updateMatrix() {
        this.matrix.setUvTransform(
            this.offset.x,
            this.offset.y,
            this.repeat.x,
            this.repeat.y,
            this.rotation,
            this.center.x,
            this.center.y,
        );
    }
    clone() {
        return new (this.constructor as any)().copy(this);
    }
    copy(t: any) {
        this.source = t.source;
        for (const k of [
            'name',
            'mapping',
            'channel',
            'wrapS',
            'wrapT',
            'wrapR',
            'magFilter',
            'minFilter',
            'format',
            'internalFormat',
            'type',
            'anisotropy',
            'colorSpace',
            'rotation',
            'matrixAutoUpdate',
            'generateMipmaps',
            'premultiplyAlpha',
            'flipY',
            'unpackAlignment',
            'isRenderTargetTexture',
            'renderTarget',
        ])
            if (k in t) this[k] = t[k];
        this.offset.copy(t.offset);
        this.repeat.copy(t.repeat);
        this.center.copy(t.center);
        this.matrix.copy(t.matrix);
        this.mipmaps = t.mipmaps.slice();
        this.userData = { ...t.userData };
        this.needsUpdate = true;
        return this;
    }
    dispose() {
        this.dispatchEvent({ type: 'dispose' });
    }
}

// @air-element none:DataTexture —— Texture 的 2D 数据纹理形状（width/height 描述袋）；引擎 gfx.Texture 无此 CPU 描述面，本层自持
export class DataTexture extends Texture {
    constructor(
        data: any = null,
        width = 1,
        height = 1,
        format = RGBAFormat,
        type = UnsignedByteType,
        mapping = UVMapping,
        wrapS = ClampToEdgeWrapping,
        wrapT = ClampToEdgeWrapping,
        magFilter = NearestFilter,
        minFilter = NearestFilter,
        anisotropy = 1,
        colorSpace = NoColorSpace,
    ) {
        super(
            { data, width, height },
            mapping,
            wrapS,
            wrapT,
            magFilter,
            minFilter,
            format,
            type,
            anisotropy,
            colorSpace,
        );
        this.isDataTexture = true;
        this.generateMipmaps = false;
        this.flipY = false;
        this.unpackAlignment = 1;
    }
}

// @air-element none:DataArrayTexture —— Texture 的数组纹理形状（layer 更新集合簿记，SPK-01 数组附件语义）；引擎 gfx 无同名 CPU 描述类，本层自持层号追踪
export class DataArrayTexture extends Texture {
    constructor(data: any = null, width = 1, height = 1, depth = 1) {
        super({ data, width, height, depth });
        this.isDataArrayTexture = true;
        this.magFilter = NearestFilter;
        this.minFilter = NearestFilter;
        this.wrapR = ClampToEdgeWrapping;
        this.generateMipmaps = false;
        this.flipY = false;
        this.unpackAlignment = 1;
        this.layerUpdates = new Set();
    }
    addLayerUpdate(layer: number) {
        this.layerUpdates.add(layer);
    }
    clearLayerUpdates() {
        this.layerUpdates.clear();
    }
}

// @air-element none:Data3DTexture —— DataArrayTexture 的 3D 纹理标记派生（isData3DTexture），引擎无同名 CPU 类，兼容簿记
export class Data3DTexture extends DataArrayTexture {
    constructor(...a: any[]) {
        super(...a);
        delete this.isDataArrayTexture;
        this.isData3DTexture = true;
    }
}

// @air-element none:CubeTexture —— Texture 的立方图形状（六面 images 袋），引擎 gfx 无同名 CPU 描述类，本层自持
export class CubeTexture extends Texture {
    constructor(images: any = [], ...a: any[]) {
        super(images, ...a);
        this.isCubeTexture = true;
        this.mapping = CubeReflectionMapping;
        this.flipY = false;
    }
    get images() {
        return this.image;
    }
    set images(v: any) {
        this.image = v;
    }
}

// @air-element none:RenderTarget —— three 渲染目标 CPU 形状（viewport/scissor/textures 袋）；引擎 gfx.Framebuffer 为 GPU 资源、无此 CPU 描述面，本层自持，视口向量委托 ./spark-math
export class RenderTarget extends EventDispatcher {
    [key: string]: any;
    constructor(width = 1, height = 1, options: any = {}) {
        super();
        this.isRenderTarget = true;
        this.width = width;
        this.height = height;
        this.depth = options.depth ?? 1;
        this.scissor = new Vector4(0, 0, width, height);
        this.scissorTest = false;
        this.viewport = new Vector4(0, 0, width, height);
        this.textures = [];
        this.depthBuffer = options.depthBuffer ?? true;
        this.stencilBuffer = options.stencilBuffer ?? false;
        this.resolveDepthBuffer = true;
        this.resolveStencilBuffer = true;
        this.depthTexture = options.depthTexture ?? null;
        this.samples = options.samples ?? 0;
        this._textureOptions = { ...options };
        for (let i = 0; i < (options.count ?? 1); i++) this.textures.push(this._createTexture(options));
    }
    _createTexture(options: any) {
        const t = new Texture({
            width: this.width,
            height: this.height,
            depth: this.depth,
        });
        Object.assign(t, { generateMipmaps: false, minFilter: LinearFilter, flipY: false }, options);
        t.isRenderTargetTexture = true;
        t.renderTarget = this;
        return t;
    }
    get texture() {
        return this.textures[0];
    }
    set texture(v: any) {
        this.textures[0] = v;
    }
    setSize(width: number, height: number, depth = 1) {
        if (width !== this.width || height !== this.height || depth !== this.depth) {
            Object.assign(this, { width, height, depth });
            for (const t of this.textures) {
                t.image = { ...t.image, width, height, depth };
                t.needsUpdate = true;
            }
            this.dispose();
        }
        this.viewport.set(0, 0, width, height);
        this.scissor.set(0, 0, width, height);
    }
    dispose() {
        this.dispatchEvent({ type: 'dispose' });
    }
    clone() {
        return new (this.constructor as any)().copy(this);
    }
    copy(r: any) {
        Object.assign(this, {
            width: r.width,
            height: r.height,
            depth: r.depth,
            scissorTest: r.scissorTest,
            depthBuffer: r.depthBuffer,
            stencilBuffer: r.stencilBuffer,
            samples: r.samples,
        });
        this.viewport.copy(r.viewport);
        this.scissor.copy(r.scissor);
        this.textures = r.textures.map((t: any) => {
            const c = t.clone();
            c.source = new Source({ ...t.image });
            c.renderTarget = this;
            return c;
        });
        return this;
    }
}

// @air-element none:WebGLRenderTarget —— RenderTarget 的 WebGL 后端标记形状，引擎渲染目标类名不同，本层自持兼容标记
export class WebGLRenderTarget extends RenderTarget {
    constructor(...a: any[]) {
        super(...a);
        this.isWebGLRenderTarget = true;
    }
}

// @air-element none:WebGLArrayRenderTarget —— WebGLRenderTarget 的数组层形状（纹理替换为 DataArrayTexture），引擎无同名类，兼容簿记
export class WebGLArrayRenderTarget extends WebGLRenderTarget {
    constructor(width = 1, height = 1, depth = 1, options: any = {}) {
        super(width, height, { ...options, depth });
        this.isWebGLArrayRenderTarget = true;
        this.textures = this.textures.map((t: any) => {
            const a = new DataArrayTexture(null, width, height, depth);
            Object.assign(a, options);
            a.isRenderTargetTexture = true;
            a.renderTarget = this;
            return a;
        });
    }
}

// @air-element none:WebGLCubeRenderTarget —— WebGLRenderTarget 的立方图形状（六面 CubeTexture 袋），引擎无同名类，兼容簿记
export class WebGLCubeRenderTarget extends WebGLRenderTarget {
    constructor(size = 1, options: any = {}) {
        super(size, size, options);
        this.isWebGLCubeRenderTarget = true;
        this.texture = new CubeTexture(
            Array.from({ length: 6 }, () => ({
                width: size,
                height: size,
                depth: 1,
            })),
        );
        Object.assign(this.texture, { generateMipmaps: false, minFilter: LinearFilter }, options);
        this.texture.isRenderTargetTexture = true;
        this.texture.renderTarget = this;
    }
}

// @air-element none:CubeCamera —— 六面立方相机对象形状与面朝向推导（lookAt/update 循环）；引擎无同名脱离节点立方相机，本层自持，朝向矩阵委托 ./spark-math
export class CubeCamera extends Object3D {
    constructor(near: number, far: number, renderTarget: any) {
        super();
        this.type = 'CubeCamera';
        this.renderTarget = renderTarget;
        this.coordinateSystem = null;
        this.activeMipmapLevel = 0;
        for (let face = 0; face < 6; face++) {
            const camera = new PerspectiveCamera(-90, 1, near, far);
            camera.layers = this.layers;
            this.add(camera);
        }
    }
    updateCoordinateSystem() {
        const webgl = this.coordinateSystem === WebGLCoordinateSystem;
        if (!webgl && this.coordinateSystem !== WebGPUCoordinateSystem)
            throw new Error(`Unsupported cubemap coordinate system: ${this.coordinateSystem}`);
        const y = webgl ? 1 : -1;
        const directions = [
            [y, 0, 0],
            [-y, 0, 0],
            [0, 1, 0],
            [0, -1, 0],
            [0, 0, 1],
            [0, 0, -1],
        ];
        const ups = [
            [0, y, 0],
            [0, y, 0],
            [0, 0, -y],
            [0, 0, y],
            [0, y, 0],
            [0, y, 0],
        ];
        const cameras = this.children.slice();
        this.remove(...cameras);
        for (let face = 0; face < 6; face++) {
            cameras[face].up.set(...ups[face]);
            cameras[face].lookAt(...directions[face]);
        }
        this.add(...cameras);
        for (const camera of cameras) camera.updateMatrixWorld();
    }
    update(renderer: any, scene: any) {
        if (this.parent === null) this.updateMatrixWorld();
        const coordinates = renderer.coordinateSystem ?? WebGLCoordinateSystem;
        if (coordinates !== this.coordinateSystem) {
            this.coordinateSystem = coordinates;
            this.updateCoordinateSystem();
        }
        const oldTarget = renderer.getRenderTarget(),
            oldFace = renderer.getActiveCubeFace(),
            oldMip = renderer.getActiveMipmapLevel(),
            xr = renderer.xr.enabled;
        const texture = this.renderTarget.texture,
            wantsMips = texture.generateMipmaps;
        renderer.xr.enabled = false;
        try {
            for (let face = 0; face < 6; face++) {
                texture.generateMipmaps = face === 5 ? wantsMips : false;
                renderer.setRenderTarget(this.renderTarget, face, this.activeMipmapLevel);
                renderer.render(scene, this.children[face]);
            }
            texture.needsPMREMUpdate = true;
        } finally {
            texture.generateMipmaps = wantsMips;
            renderer.setRenderTarget(oldTarget, oldFace, oldMip);
            renderer.xr.enabled = xr;
        }
    }
}

// @air-element none:PMREMGenerator —— 引擎无对应类，由 SPK-06 ./pmrem 自持（GPU 工作经原生 gfx）；本层仅转发该符号
export { PMREMGenerator } from './pmrem';

// @air-element none:WebGLRenderer —— 显式抛错占位，适配器定性自证：不实现通用 three 渲染器，应构造 CocosRenderer
export class WebGLRenderer {
    constructor() {
        unsupported('WebGLRenderer. Construct CocosRenderer instead');
    }
}

// @air-element none:Raycaster —— 引擎无不叫此名的射线投射器；射线/求交数学委托 ./spark-math（Ray/cc.geometry），本层自持相机反投影与相交集合簿记
export class Raycaster {
    [key: string]: any;
    constructor(origin: any, direction: any, near = 0, far = Infinity) {
        this.ray = new Ray(origin, direction);
        this.near = near;
        this.far = far;
        this.camera = null;
        this.layers = new Layers();
        this.params = {
            Mesh: {},
            Line: { threshold: 1 },
            LOD: {},
            Points: { threshold: 1 },
            Sprite: {},
        };
    }
    set(o: any, d: any) {
        this.ray.set(o, d);
    }
    setFromCamera(p: any, c: any) {
        if (c.isPerspectiveCamera) {
            this.ray.origin.setFromMatrixPosition(c.matrixWorld);
            this.ray.direction.set(p.x, p.y, 0.5).unproject(c).sub(this.ray.origin).normalize();
        } else if (c.isOrthographicCamera) {
            this.ray.origin.set(p.x, p.y, (c.near + c.far) / (c.near - c.far)).unproject(c);
            this.ray.direction.set(0, 0, -1).transformDirection(c.matrixWorld);
        } else unsupported('Raycaster camera type');
        this.camera = c;
    }
    intersectObject(o: any, recursive = true, result: any[] = []) {
        if (o.layers.test(this.layers)) o.raycast(this, result);
        if (recursive) for (const c of o.children) this.intersectObject(c, true, result);
        return result.sort((a, b) => a.distance - b.distance);
    }
    intersectObjects(objects: any[], recursive = true, result: any[] = []) {
        for (const o of objects) this.intersectObject(o, recursive, result);
        return result.sort((a, b) => a.distance - b.distance);
    }
}

// @air-element none:LoadingManager —— three 侧加载进度/回调编排袋；引擎 asset-manager 生命周期 API 形状不同，本层自持计数与 handler 表簿记
export class LoadingManager {
    [key: string]: any;
    constructor(onLoad?: any, onProgress?: any, onError?: any) {
        this.onLoad = onLoad;
        this.onProgress = onProgress;
        this.onError = onError;
        this.onStart = undefined;
        this.itemsLoaded = 0;
        this.itemsTotal = 0;
        this.isLoading = false;
        this.urlModifier = null;
        this.handlers = [];
    }
    itemStart(url: string) {
        this.itemsTotal++;
        if (!this.isLoading) this.onStart?.(url, this.itemsLoaded, this.itemsTotal);
        this.isLoading = true;
    }
    itemEnd(url: string) {
        this.itemsLoaded++;
        this.onProgress?.(url, this.itemsLoaded, this.itemsTotal);
        if (this.itemsLoaded === this.itemsTotal) {
            this.isLoading = false;
            this.onLoad?.();
        }
    }
    itemError(url: string) {
        this.onError?.(url);
    }
    resolveURL(url: string) {
        return this.urlModifier ? this.urlModifier(url) : url;
    }
    setURLModifier(fn: any) {
        this.urlModifier = fn;
        return this;
    }
    addHandler(regex: any, loader: any) {
        this.handlers.push([regex, loader]);
        return this;
    }
    removeHandler(regex: any) {
        this.handlers = this.handlers.filter(([r]: any) => r !== regex);
        return this;
    }
    getHandler(file: string) {
        for (const [r, l] of this.handlers) {
            r.lastIndex = 0;
            if (r.test(file)) return l;
        }
        return null;
    }
}

// @air-element none:DefaultLoadingManager —— 全局默认 LoadingManager 单例（兼容簿记实例），随 none:LoadingManager 自持
export const DefaultLoadingManager = new LoadingManager();

// @air-element none:Loader —— three 加载器基类（path/crossOrigin/manager 袋与 loadAsync 包装）；引擎 loader API 形状不同，本层自持抽象基类
export class Loader {
    [key: string]: any;
    constructor(manager: any = DefaultLoadingManager) {
        this.manager = manager;
        this.crossOrigin = 'anonymous';
        this.withCredentials = false;
        this.path = '';
        this.resourcePath = '';
        this.requestHeader = {};
    }
    setCrossOrigin(v: any) {
        this.crossOrigin = v;
        return this;
    }
    setWithCredentials(v: any) {
        this.withCredentials = v;
        return this;
    }
    setPath(v: any) {
        this.path = v;
        return this;
    }
    setResourcePath(v: any) {
        this.resourcePath = v;
        return this;
    }
    setRequestHeader(v: any) {
        this.requestHeader = v;
        return this;
    }
    load(url?: any, onLoad?: any, onProgress?: any, onError?: any): any;
    load(): any {
        unsupported('abstract Loader.load');
    }
    loadAsync(url: any, onProgress?: any): Promise<any> {
        return new Promise((resolve, reject) => this.load(url, resolve, onProgress, reject));
    }
}

// @air-element none:FileLoader —— three 侧 fetch 流式文件加载器（进度/响应类型分支）；引擎资源加载走 asset-manager、API 形状不同，本层自持浏览器 fetch 实现
export class FileLoader extends Loader {
    constructor(m?: any) {
        super(m);
        this.responseType = '';
        this.mimeType = '';
    }
    setResponseType(v: any) {
        this.responseType = v;
        return this;
    }
    setMimeType(v: any) {
        this.mimeType = v;
        return this;
    }
    load(url: any, onLoad?: any, onProgress?: any, onError?: any) {
        url = this.manager.resolveURL(this.path + url);
        this.manager.itemStart(url);
        fetch(url, {
            headers: this.requestHeader,
            credentials: this.withCredentials ? 'include' : 'same-origin',
        })
            .then(async (r) => {
                if (!r.ok && r.status !== 0) throw new Error(`HTTP ${r.status} loading ${url}`);
                let bytes;
                if (onProgress && r.body) {
                    const reader = r.body.getReader(),
                        parts: Uint8Array[] = [];
                    let loaded = 0,
                        total = Number(r.headers.get('content-length')) || 0;
                    for (;;) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        parts.push(value);
                        loaded += value.length;
                        onProgress({
                            type: 'progress',
                            lengthComputable: total > 0,
                            loaded,
                            total,
                        });
                    }
                    bytes = new Uint8Array(loaded);
                    let o = 0;
                    for (const p of parts) {
                        bytes.set(p, o);
                        o += p.length;
                    }
                } else bytes = new Uint8Array(await r.arrayBuffer());
                switch (this.responseType) {
                    case 'arraybuffer':
                        return bytes.buffer;
                    case 'blob':
                        return new Blob([bytes], {
                            type: this.mimeType || r.headers.get('content-type') || '',
                        });
                    case 'json':
                        return JSON.parse(new TextDecoder().decode(bytes));
                    case 'document':
                        return new DOMParser().parseFromString(
                            new TextDecoder().decode(bytes),
                            this.mimeType || 'text/html',
                        );
                    default:
                        return new TextDecoder().decode(bytes);
                }
            })
            .then((data) => onLoad?.(data))
            .catch((error) => {
                this.manager.itemError(url);
                if (onError) onError(error);
                else console.error(error);
            })
            .then((result) => {
                this.manager.itemEnd(url);
                return result;
            });
    }
}

// @air-element none:Timer —— three 帧计时器（timescale/可见性复位）；引擎无同名计时器类（CCF 时间模型不同），本层自持 performance.now 簿记
export class Timer {
    [key: string]: any;
    constructor() {
        this._startTime = performance.now();
        this._currentTime = 0;
        this._previousTime = 0;
        this._delta = 0;
        this._elapsed = 0;
        this._timescale = 1;
        this._document = null;
        this._pageVisibilityHandler = null;
    }
    connect(d: any) {
        this.disconnect();
        this._document = d;
        if (d.hidden !== undefined) {
            this._pageVisibilityHandler = () => {
                if (!d.hidden) this.reset();
            };
            d.addEventListener('visibilitychange', this._pageVisibilityHandler);
        }
        return this;
    }
    disconnect() {
        if (this._pageVisibilityHandler)
            this._document.removeEventListener('visibilitychange', this._pageVisibilityHandler);
        this._document = null;
        this._pageVisibilityHandler = null;
    }
    getDelta() {
        return this._delta / 1000;
    }
    getElapsed() {
        return this._elapsed / 1000;
    }
    getTimescale() {
        return this._timescale;
    }
    setTimescale(v: number) {
        this._timescale = v;
        return this;
    }
    reset() {
        this._currentTime = performance.now() - this._startTime;
        return this;
    }
    dispose() {
        this.disconnect();
    }
    update(t = performance.now()) {
        if (this._pageVisibilityHandler && this._document.hidden) this._delta = 0;
        else {
            this._previousTime = this._currentTime;
            this._currentTime = t - this._startTime;
            this._delta = (this._currentTime - this._previousTime) * this._timescale;
            this._elapsed += this._delta;
        }
        return this;
    }
}

// @air-element none:Clock —— three 简易计时器（autoStart/delta/elapsed）；引擎无同名类，本层自持 performance.now 簿记
export class Clock {
    autoStart: boolean;
    running: boolean;
    oldTime: number;
    elapsedTime: number;
    constructor(autoStart = true) {
        this.autoStart = autoStart;
        this.running = false;
        this.oldTime = 0;
        this.elapsedTime = 0;
    }
    start() {
        this.oldTime = performance.now();
        this.elapsedTime = 0;
        this.running = true;
    }
    stop() {
        this.getElapsedTime();
        this.running = false;
        this.autoStart = false;
    }
    getDelta() {
        if (this.autoStart && !this.running) {
            this.start();
            return 0;
        }
        if (!this.running) return 0;
        const t = performance.now(),
            d = (t - this.oldTime) / 1000;
        this.oldTime = t;
        this.elapsedTime += d;
        return d;
    }
    getElapsedTime() {
        this.getDelta();
        return this.elapsedTime;
    }
}

// @air-element none:UniformsUtils —— 着色器 uniform 集合的 clone/merge 工具；引擎无同名工具，本层自持（克隆时对可 clone 的向量/颜色调用 ./spark-math 的 clone）
export const UniformsUtils = {
    clone(uniforms: any) {
        const result: any = {};
        for (const [name, u] of Object.entries(uniforms)) {
            result[name] = {};
            for (const [k, v] of Object.entries(u as any))
                result[name][k] = (v as any)?.clone ? (v as any).clone() : Array.isArray(v) ? v.slice() : v;
        }
        return result;
    },
    merge(list: any[]) {
        return Object.assign({}, ...list.map((x) => this.clone(x)));
    },
};

// @air-element none:Uniform —— 单个 uniform 值包装（含浅 clone）；引擎无同名类，兼容簿记，值克隆委托对象自身（./spark-math 类型）
export class Uniform {
    value: any;
    constructor(value: any) {
        this.value = value;
    }
    clone() {
        return new Uniform(this.value?.clone ? this.value.clone() : this.value);
    }
}

// @air-element none:ShaderChunk —— 引擎无 three 着色器块表；4 段 log-depth 逐字取自 Three.js r180 (MIT) src/renderers/shaders/ShaderChunk/logdepthbuf*.glsl.js，须原样保留
export const ShaderChunk = {
    logdepthbuf_pars_vertex:
        '\n#ifdef USE_LOGARITHMIC_DEPTH_BUFFER\n\n\tvarying float vFragDepth;\n\tvarying float vIsPerspective;\n\n#endif\n',
    logdepthbuf_vertex:
        '\n#ifdef USE_LOGARITHMIC_DEPTH_BUFFER\n\n\tvFragDepth = 1.0 + gl_Position.w;\n\tvIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );\n\n#endif\n',
    logdepthbuf_pars_fragment:
        '\n#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )\n\n\tuniform float logDepthBufFC;\n\tvarying float vFragDepth;\n\tvarying float vIsPerspective;\n\n#endif\n',
    logdepthbuf_fragment:
        '\n#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )\n\n\t// Doing a strict comparison with == 1.0 can cause noise artifacts\n\t// on some platforms. See issue #17623.\n\tgl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;\n\n#endif\n',
};

// @air-element none:FullScreenQuad —— three/addons Pass.js 全屏四边形形状（内联三角形几何+正交相机）；引擎无同名类，本层自持，几何委托本层 BufferAttribute/Camera
export class FullScreenQuad {
    _mesh: Mesh;
    _camera: OrthographicCamera;
    constructor(material: any) {
        const geometry = new BufferGeometry();
        geometry.setAttribute('position', new Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
        geometry.setAttribute('uv', new Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
        this._mesh = new Mesh(geometry, material);
        this._camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    get material() {
        return this._mesh.material;
    }
    set material(v: any) {
        this._mesh.material = v;
    }
    dispose() {
        this._mesh.geometry.dispose();
    }
    render(renderer: any) {
        renderer.render(this._mesh, this._camera);
    }
}

// @air-element none:COCOS_AIR_COMPAT —— 适配器定性自证标记（engine/contractRevision/implementation/unsupported），引擎无对应，兼容簿记常量
export const COCOS_AIR_COMPAT = {
    engine: 'CocosAirJS',
    contractRevision: 180,
    implementation: 'independent CPU subset',
    unsupported: ['generic materials rendering', 'XRProjectionLayer and XR depth sensing', 'general Three.js addons'],
};
