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
 * Spark 集成（SPK-04）：Three r180 形态的 CPU 数学层。
 *
 * 定位：本文件是上游参考实现 `spark-cocosairjs/src/air-math.js` 的 TypeScript 移植，导出名与 Three 契约
 * 保持一致（Spark 冻结文件以 `import * as THREE` 使用 61 个成员 / 895 处引用，形状面不得收窄）。
 * 按方案 §1.3 与 SPK-04 硬规则，本层只做「形状 + 委托」：引擎已有的算法一律转调 `cc.*`
 * （每个导出成员上方的 @air-element 标注给出委托目标），不在 AIR 侧重建平行实现。
 * 委托映射（实施时逐条核过引擎源码）：
 * - Vector2/3/4 → cc.Vec2/cc.Vec3/cc.Vec4：set/copy/add/subtract/multiply/divide/multiplyScalar/scaleAndAdd/
 *   len/lengthSqr/dot/cross/normalize/lerp/min/max/floor/ceil/round/negate/distance/squaredDistance/
 *   transformMat3/transformMat4/transformMat4Normal/transformQuat/project/projectOnPlane/
 *   toArray/fromArray/strictEquals/random。
 * - Quaternion → cc.Quat：multiply/dot/len/lengthSqr/normalize/conjugate/slerp/angle/rotateTowards/
 *   rotationTo/fromAxisAngle/fromMat3/getAxisAngle/strictEquals。
 * - Matrix3/Matrix4 → cc.Mat3/cc.Mat4：先以 Mat4.fromArray/toArray（或 Mat3 同名）把列主序 elements
 *   双向镜像到引擎对象，再转调 multiply/invert/transpose/determinant/multiplyScalar/frustum/ortho/lookAt/
 *   rotate/rotateX/rotateY/rotateZ/getTranslation/fromSRT/toSRT/fromQuat/fromTranslation/fromScaling/
 *   identity/fromMat4/inverseTransposeMat4/fromRotation/fromArray/toArray。
 *   例外：cc.Mat4 没有 fromMat3 静态（引擎只有降阶方向 Mat3.fromMat4），故 Matrix4.setFromMatrix3 只能做
 *   列主序索引升阶；MatrixStorage 的 copy/fromArray/toArray 也是纯索引拷贝（见第 8 条），不经引擎。
 *   Matrix4.makeRotationFromQuaternion 转调 cc.Mat4.fromQuat（纯旋转阵），不绕道 compose。
 * - Color → cc.Color：十六进制走 cc.Color.fromHEX，标量走 cc.clamp / cc.lerp。
 * - Box3 → cc.geometry.AABB：fromPoints/getBoundary/transform/merge + cc.geometry.intersect（AABB-AABB）
 *   + cc.geometry.distance.pt_point_aabb。
 * - Ray → cc.geometry.Ray + cc.geometry.intersect（ray-AABB slab）+ cc.Vec3 原语。
 * - clamp / MathUtils → cc 数学工具（core/math/utils.ts：clamp/lerp/toRadian/toDegree/repeat/
 *   inverseLerp/nextPow2/random）。
 *
 * 精度：所有分量以 JS 原生 number（双精度）保存；引擎 cc.Mat4 / cc.Vec3 的字段同为 number
 * （src/cocos/core/math/math-base.ts:29 的 MATH_FLOAT_ARRAY = Float64Array），
 * 所以 elements ↔ m00..m15 的往返不会截断成 float32。
 *
 * 允许的薄封装 / 例外（SPK-04 要求逐条写明理由）：
 * 1. Matrix4.elements —— 引擎 cc.Mat4 用命名字段 m00..m15（内存序即列主序，与 Three 的 elements[0..15]
 *    一一对应，已由 Mat4.fromArray/toArray 源码核对），而 Three 契约要求可写的 `.elements` 数组；
 *    因此这里保留数组存储并以引擎的 fromArray/toArray 做镜像，另提供 compose/decompose/makePerspective/
 *    multiplyMatrices/applyMatrix4/invert/transpose 等 Three 命名入口（入口内部仍是转调引擎静态）。
 * 2. Euler —— 引擎没有 Euler 类（只有 cc.Quat 与 cc.Mat3.toEuler/cc.Mat4.toEuler 的固定 YXZ、度数约定），
 *    而 Object3D 的 rotation 契约是弧度 + 六种旋转序，故 AIR 自持薄封装（见 @air-element none:Euler）。
 * 3. Box3 —— 引擎 AABB 是 center/halfExtents 表述，Three 契约是 min/max 命名面，
 *    故本类只做命名适配（setFromPoints/expandByPoint/applyMatrix4 等），几何算法转调 AABB。
 * 4. SRGBToLinear / LinearToSRGB / ColorManagement / 三个色彩空间字符串 —— 引擎的
 *    srgbToLinear/linearToSrgb 对 x<=0、x>=1 做了端点钳制且使用除法形式（x/12.92、((x+0.055)/1.055)^2.4），
 *    与 Three 的无钳制域 + reciprocal 乘法形式在超域与极值输入上不等价；Spark 的色板契约是后者，故自持。
 * 5. Matrix2 —— 引擎只有 Mat3/Mat4，没有 2x2 类型，Spark 也不使用它，仅为导出面对等而自持。
 * 6. Color 的分量存储 —— 引擎 cc.Color 底层是 Uint8ClampedArray（0..255 字节），逐分量的浮点
 *    add/multiply/lerp/hex 语义不可委托，故 r/g/b 保持 Three 的 0..1 浮点契约，仅把十六进制解析
 *    委托给 cc.Color.fromHEX（`Math.floor(h) & 0xffffff` 预处理后与 Three 的移位取字节完全等价）。
 * 7. 语义分歧只在退化输入上补守卫，不改算法主体：
 *    - Quaternion.invert 转调 cc.Quat.conjugate（Three 的 invert 即共轭；cc.Quat.invert 会再除长度平方）。
 *    - Quaternion.normalize 在零四元数上返回单位元（引擎置零）；rotateTowards 在夹角 0 时原地返回
 *      （引擎直接写成目标值，而反平行四元数夹角恰为 0），并把 step（弧度）换算成引擎要求的角度制。
 *    - Vector2/3.angleTo 在零向量上返回 π/2（引擎返回 0）。
 *    - Quaternion.setFromUnitVectors 转调 cc.Quat.rotationTo：反平行时二者选择的旋转轴不同（都合法）。
 *    - Vector3.applyMatrix4 转调 cc.Vec3.transformMat4：w 分量为 0 时引擎不除（置 1），Three 会得到 ±Infinity。
 *    - Vector3.projectOnVector 转调 cc.Vec3.project：引擎的退化阈值是 1e-6，Three 是 === 0。
 *    - Matrix3.getNormalMatrix 转调 cc.Mat3.inverseTransposeMat4：引擎在奇异输入上返回 null 且不写目标，
 *      此处按 Three 的 `invert()`（行列式 0 → 零矩阵）写零，避免读到暂存对象的残留值。
 *    - Matrix4.decompose 转调 cc.Mat4.toSRT：缩放分量为 0 时引擎给出单位四元数，Three 原式得到 NaN；
 *      反射时二者同样把 x 缩放取负；四元数符号另按 Three 的分支约定校正——引擎取 Quat.fromMat3 的「最大分量」
 *      分支，Three setFromRotationMatrix 先判 trace>0（w 取正），二者对同一旋转可整体差一符号，故当引擎 w<0
 *      且归一化旋转迹（对角元 / 引擎缩放分量，逐字段）>0 时取反对齐 Three。
 *    - Matrix4.lookAt 转调 cc.Mat4.lookAt 取基（引擎产出 gl-matrix 视图基：3x3 为世界基的转置、平移列写
 *      -(基·eye)，而 Three 的 Matrix4.lookAt 只要世界基的 3x3 且不写平移列）：正常输入用 cc.Mat4.transpose
 *      把视图基转成世界基后置零 m03/m07/m11，退化输入（视线长度 0 或与 up 平行，引擎此时产出 NaN）按 Three
 *      原文用 cc.Vec3 原语（normalize/cross）重建世界基。
 *    - Matrix4.makePerspective 转调 cc.Mat4.frustum（同为 -1..1 深度约定）；far === Infinity 与
 *      WebGPU 0..1（coordinateSystem === 2001）两条分支引擎无对应静态，按 Three 原式做列主序字段写入；
 *      makeOrthographic 的 2001 分支直接映射到 cc.Mat4.ortho 的 minClipZ 参数。
 *    - Ray.intersectBox 转调引擎 ray-AABB slab，并补两个契约空隙：空盒（±Infinity，AABB 无法表达）与
 *      起点恰在盒面上时引擎返回出口距离（Three 要入口点）；方向分量为 0 时以 Number.EPSILON 摄动，
 *      等价于 Three slab 的 ±Infinity 分支（引擎用 1/d 会得到 ±Infinity/NaN）。
 *    - Box3.applyMatrix4 转调 cc.geometry.AABB.transform（极值点法），与 Three 的八顶点展开在仿射输入下同解。
 * 8. Vector.set(...)/Matrix.set(...) 与 makeBasis/extractBasis/setPosition/setFromMatrix3 之类是纯索引映射
 *    （Three 行主序入参 ↔ 列主序存储），不构成算法主体；MatrixStorage 的 copy/fromArray/toArray 同理。
 * 9. Vector2/Vector4.addScalar 的加法暂存取本类实例（tmpVec2/tmpVec4）而非引擎暂存对象：引擎
 *    cc.Vec2/cc.Vec4 的 add 静态签名是 (out: Out, a: Out, b: Out) 单类型参数，无法把引擎 Vec2/Vec4 与
 *    本类实例混在同一次调用里（TS2345）。tmpVec2.set(v, v) 内部仍转调 cc.Vec2.set，数值与逐分量加标量等价。
 */

import { Color as CCColor } from '../../cocos/core/math/color';
import { Mat3 as CCMat3 } from '../../cocos/core/math/mat3';
import { Mat4 as CCMat4 } from '../../cocos/core/math/mat4';
import { Quat as CCQuat } from '../../cocos/core/math/quat';
import { Vec2 as CCVec2 } from '../../cocos/core/math/vec2';
import { Vec3 as CCVec3 } from '../../cocos/core/math/vec3';
import { Vec4 as CCVec4 } from '../../cocos/core/math/vec4';
import {
    clamp as ccClamp,
    inverseLerp as ccInverseLerp,
    lerp as ccLerp,
    nextPow2 as ccNextPow2,
    random as ccRandom,
    repeat as ccRepeat,
    toDegree as ccToDegree,
    toRadian as ccToRadian,
} from '../../cocos/core/math/utils';
import { AABB } from '../../cocos/core/geometry/aabb';
import { Ray as CCRay } from '../../cocos/core/geometry/ray';
import intersect from '../../cocos/core/geometry/intersect';
import { ShapeType } from '../../cocos/core/geometry/enums';
import { pt_point_aabb } from '../../cocos/core/geometry/distance';

// 引擎把形状检测挂在按 ShapeType 位组合索引的派发表上，且 ray-AABB 返回距离而非布尔；
// 这里把该表的本层用到的两项固化成显式签名（纯类型声明，不改上游语义）。
const rayAabbTest = intersect[ShapeType.SHAPE_RAY | ShapeType.SHAPE_AABB] as unknown as (
    ray: CCRay,
    aabb: AABB,
) => number;
const aabbAabbTest = intersect[ShapeType.SHAPE_AABB] as unknown as (a: AABB, b: AABB) => boolean;

// 模块级引擎暂存对象：所有委托都经由它们，避免逐次分配；字段为双精度 number。
// 输出与输入分别持有（qs/qInA/qInB、m3s/m3Arg、m4a/m4b/m4c）：引擎静态虽多先把分量读进局部变量，
// 但显式区分 out 与 in 可避免任何别名依赖。
const v3a = new CCVec3();
const v3b = new CCVec3();
const qs = new CCQuat();
const qInA = new CCQuat();
const qInB = new CCQuat();
const m3s = new CCMat3();
const m3Arg = new CCMat3();
const m3ArgB = new CCMat3();
const m4a = new CCMat4();
const m4b = new CCMat4();
const m4c = new CCMat4();
const aabbA = new AABB();
const aabbB = new AABB();
const engineRay = new CCRay();
const engineColor = new CCColor();

/** BufferAttribute 的最小结构契约（避免数学层反向依赖适配层）。 */
interface IBindableAttribute {
    array: ArrayLike<number>;
    itemSize: number;
}

/** 相机矩阵的最小结构契约（project/unproject 用，适配层的 Camera 满足该形状）。 */
interface ICameraMatrices {
    matrixWorld: Matrix4;
    matrixWorldInverse: Matrix4;
    projectionMatrix: Matrix4;
    projectionMatrixInverse: Matrix4;
}

/** 把 Three 形态的列主序数组镜像进引擎 Mat4（纯索引映射）。 */
function readMat4(target: CCMat4, source: Matrix4): CCMat4 {
    CCMat4.fromArray(target, source.elements);
    return target;
}

/** 把引擎 Mat4 镜像回 Three 形态的列主序数组（纯索引映射）。 */
function writeMat4<T extends Matrix4>(target: T, source: CCMat4): T {
    CCMat4.toArray(target.elements, source);
    return target;
}

/** 把 Three 形态的列主序数组镜像进引擎 Mat3（纯索引映射）。 */
function readMat3(target: CCMat3, source: Matrix3): CCMat3 {
    CCMat3.fromArray(target, source.elements);
    return target;
}

/** 把引擎 Mat3 镜像回 Three 形态的列主序数组（纯索引映射）。 */
function writeMat3<T extends Matrix3>(target: T, source: CCMat3): T {
    CCMat3.toArray(target.elements, source);
    return target;
}

/** 把 AIR 四元数镜像进引擎 Quat（纯字段映射）。 */
function readQuat(target: CCQuat, source: Quaternion): CCQuat {
    CCQuat.set(target, source.x, source.y, source.z, source.w);
    return target;
}

/** Box3（min/max）→ 引擎 AABB（center/halfExtents），仅在非空盒上调用。 */
function readAABB(target: AABB, source: Box3): AABB {
    AABB.fromPoints(target, source.min, source.max);
    return target;
}

/** 引擎 AABB → Box3 的 min/max 命名面。 */
function writeBox3<T extends Box3>(target: T, source: AABB): T {
    source.getBoundary(target.min, target.max);
    return target;
}

// @air-element cc.clamp
export const clamp = (value: number, min: number, max: number): number => ccClamp(value, min, max);

// @air-element cc.Vec2
export class Vector2 {
    public x: number;
    public y: number;
    public readonly isVector2 = true;

    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }

    get width(): number {
        return this.x;
    }

    set width(v: number) {
        this.x = v;
    }

    get height(): number {
        return this.y;
    }

    set height(v: number) {
        this.y = v;
    }

    public set(x: number, y: number): this {
        CCVec2.set(this, x, y);
        return this;
    }

    public setScalar(s: number): this {
        return this.set(s, s);
    }

    public setComponent(i: number, v: number): this {
        if (i < 0 || i >= 2) throw new RangeError('Vector component');
        if (i === 0) this.x = v;
        else this.y = v;
        return this;
    }

    public getComponent(i: number): number {
        if (i < 0 || i >= 2) throw new RangeError('Vector component');
        return i === 0 ? this.x : this.y;
    }

    public setX(v: number): this {
        this.x = v;
        return this;
    }

    public setY(v: number): this {
        this.y = v;
        return this;
    }

    public clone(): Vector2 {
        return new Vector2().copy(this);
    }

    public copy(v: Vector2): this {
        CCVec2.copy(this, v);
        return this;
    }

    public add(v: Vector2): this {
        CCVec2.add(this, this, v);
        return this;
    }

    public sub(v: Vector2): this {
        CCVec2.subtract(this, this, v);
        return this;
    }

    public multiply(v: Vector2): this {
        CCVec2.multiply(this, this, v);
        return this;
    }

    public divide(v: Vector2): this {
        CCVec2.divide(this, this, v);
        return this;
    }

    public addScalar(v: number): this {
        CCVec2.add<Vector2>(this, this, tmpVec2.set(v, v));
        return this;
    }

    public subScalar(v: number): this {
        return this.addScalar(-v);
    }

    public multiplyScalar(v: number): this {
        CCVec2.multiplyScalar(this, this, v);
        return this;
    }

    public divideScalar(v: number): this {
        return this.multiplyScalar(1 / v);
    }

    public addVectors(a: Vector2, b: Vector2): this {
        CCVec2.add(this, a, b);
        return this;
    }

    public subVectors(a: Vector2, b: Vector2): this {
        CCVec2.subtract(this, a, b);
        return this;
    }

    public multiplyVectors(a: Vector2, b: Vector2): this {
        CCVec2.multiply(this, a, b);
        return this;
    }

    public addScaledVector(v: Vector2, s: number): this {
        CCVec2.scaleAndAdd(this, this, v, s);
        return this;
    }

    public dot(v: Vector2): number {
        return CCVec2.dot(this, v);
    }

    public lengthSq(): number {
        return CCVec2.lengthSqr(this);
    }

    public length(): number {
        return CCVec2.len(this);
    }

    /** 引擎无 Manhattan 长度静态，这里是两分量的绝对值求和（标量映射，见文件头第 8 条）。 */
    public manhattanLength(): number {
        return Math.abs(this.x) + Math.abs(this.y);
    }

    public normalize(): this {
        CCVec2.normalize(this, this);
        return this;
    }

    public setLength(v: number): this {
        return this.normalize().multiplyScalar(v);
    }

    public distanceToSquared(v: Vector2): number {
        return CCVec2.squaredDistance(this, v);
    }

    public distanceTo(v: Vector2): number {
        return CCVec2.distance(this, v);
    }

    /** 同上：两分量绝对差求和（标量映射）。 */
    public manhattanDistanceTo(v: Vector2): number {
        return Math.abs(this.x - v.x) + Math.abs(this.y - v.y);
    }

    public negate(): this {
        CCVec2.negate(this, this);
        return this;
    }

    public min(v: Vector2): this {
        CCVec2.min(this, this, v);
        return this;
    }

    public max(v: Vector2): this {
        CCVec2.max(this, this, v);
        return this;
    }

    public clamp(a: Vector2, b: Vector2): this {
        return this.set(ccClamp(this.x, a.x, b.x), ccClamp(this.y, a.y, b.y));
    }

    public clampScalar(a: number, b: number): this {
        return this.set(ccClamp(this.x, a, b), ccClamp(this.y, a, b));
    }

    public clampLength(a: number, b: number): this {
        const n = this.length();
        return this.divideScalar(n || 1).multiplyScalar(ccClamp(n, a, b));
    }

    public lerp(v: Vector2, t: number): this {
        CCVec2.lerp(this, this, v, t);
        return this;
    }

    public lerpVectors(a: Vector2, b: Vector2, t: number): this {
        CCVec2.lerp(this, a, b, t);
        return this;
    }

    public floor(): this {
        CCVec2.floor(this, this);
        return this;
    }

    public ceil(): this {
        CCVec2.ceil(this, this);
        return this;
    }

    public round(): this {
        CCVec2.round(this, this);
        return this;
    }

    /** 引擎无 Vec2.trunc 静态：逐分量 Math.trunc（标量映射）。 */
    public roundToZero(): this {
        return this.set(Math.trunc(this.x), Math.trunc(this.y));
    }

    public equals(v: Vector2): boolean {
        return CCVec2.strictEquals(this, v);
    }

    public fromArray(a: ArrayLike<number>, o = 0): this {
        CCVec2.fromArray(this, a as number[], o);
        return this;
    }

    public toArray(a: number[] = [], o = 0): number[] {
        CCVec2.toArray(a, this, o);
        return a;
    }

    /** 从 BufferAttribute 取值是数据源索引（非算法），保留 Three 的 itemSize 寻址。 */
    public fromBufferAttribute(a: IBindableAttribute, i: number): this {
        this.x = a.array[i * a.itemSize];
        this.y = a.array[i * a.itemSize + 1];
        return this;
    }

    public random(): this {
        return this.set(ccRandom(), ccRandom());
    }

    public *[Symbol.iterator](): IterableIterator<number> {
        yield this.x;
        yield this.y;
    }

    /** 2D 叉积是标量；引擎 cc.Vec2.cross 产出 3D 向量，语义不同，故保留 Three 的标量式。 */
    public cross(v: Vector2): number {
        return this.x * v.y - this.y * v.x;
    }

    /** 自身辐角（[0, 2π) 约定）；引擎 cc.Vec2.angle 是「两向量夹角」，语义不同，故保留原式。 */
    public angle(): number {
        return Math.atan2(-this.y, -this.x) + Math.PI;
    }

    /** 委托 cc.Vec2.angle；零向量按 Three 契约补 π/2（引擎返回 0）。 */
    public angleTo(v: Vector2): number {
        if (CCVec2.lengthSqr(this) === 0 || CCVec2.lengthSqr(v) === 0) return Math.PI / 2;
        return CCVec2.angle(this, v);
    }

    /** 引擎无 2D 绕点旋转原语（cc.Vec2.rotate 不存在），保留 Three 的原式。 */
    public rotateAround(c: Vector2, a: number): this {
        const x = this.x - c.x;
        const y = this.y - c.y;
        const s = Math.sin(a);
        const co = Math.cos(a);
        return this.set(x * co - y * s + c.x, x * s + y * co + c.y);
    }

    public applyMatrix3(m: Matrix3): this {
        CCVec2.transformMat3(this, this, readMat3(m3s, m));
        return this;
    }
}

// Vector2/4 的引擎静态签名是 (out: Out, a: Out, b: Out)（Out 单一类型参数），
// 不能把引擎暂存混进 `this`，因此本层用自身类型的加法暂存（字段仍为双精度 number）。
const tmpVec2 = new Vector2();

// @air-element cc.Vec3
export class Vector3 {
    public x: number;
    public y: number;
    public z: number;
    public readonly isVector3 = true;

    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }

    public set(x: number, y: number, z: number): this {
        CCVec3.set(this, x, y, z);
        return this;
    }

    public setScalar(s: number): this {
        return this.set(s, s, s);
    }

    public setComponent(i: number, v: number): this {
        if (i < 0 || i >= 3) throw new RangeError('Vector component');
        if (i === 0) this.x = v;
        else if (i === 1) this.y = v;
        else this.z = v;
        return this;
    }

    public getComponent(i: number): number {
        if (i < 0 || i >= 3) throw new RangeError('Vector component');
        if (i === 0) return this.x;
        if (i === 1) return this.y;
        return this.z;
    }

    public setX(v: number): this {
        this.x = v;
        return this;
    }

    public setY(v: number): this {
        this.y = v;
        return this;
    }

    public setZ(v: number): this {
        this.z = v;
        return this;
    }

    public clone(): Vector3 {
        return new Vector3().copy(this);
    }

    public copy(v: Vector3): this {
        CCVec3.copy(this, v);
        return this;
    }

    public add(v: Vector3): this {
        CCVec3.add(this, this, v);
        return this;
    }

    public sub(v: Vector3): this {
        CCVec3.subtract(this, this, v);
        return this;
    }

    public multiply(v: Vector3): this {
        CCVec3.multiply(this, this, v);
        return this;
    }

    public divide(v: Vector3): this {
        CCVec3.divide(this, this, v);
        return this;
    }

    public addScalar(v: number): this {
        CCVec3.set(v3a, v, v, v);
        CCVec3.add(this, this, v3a);
        return this;
    }

    public subScalar(v: number): this {
        return this.addScalar(-v);
    }

    public multiplyScalar(v: number): this {
        CCVec3.multiplyScalar(this, this, v);
        return this;
    }

    public divideScalar(v: number): this {
        return this.multiplyScalar(1 / v);
    }

    public addVectors(a: Vector3, b: Vector3): this {
        CCVec3.add(this, a, b);
        return this;
    }

    public subVectors(a: Vector3, b: Vector3): this {
        CCVec3.subtract(this, a, b);
        return this;
    }

    public multiplyVectors(a: Vector3, b: Vector3): this {
        CCVec3.multiply(this, a, b);
        return this;
    }

    public addScaledVector(v: Vector3, s: number): this {
        CCVec3.scaleAndAdd(this, this, v, s);
        return this;
    }

    public dot(v: Vector3): number {
        return CCVec3.dot(this, v);
    }

    public lengthSq(): number {
        return CCVec3.lengthSqr(this);
    }

    public length(): number {
        return CCVec3.len(this);
    }

    /** 三分量绝对值求和（标量映射，见文件头第 8 条）。 */
    public manhattanLength(): number {
        return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z);
    }

    public normalize(): this {
        CCVec3.normalize(this, this);
        return this;
    }

    public setLength(v: number): this {
        return this.normalize().multiplyScalar(v);
    }

    public distanceToSquared(v: Vector3): number {
        return CCVec3.squaredDistance(this, v);
    }

    public distanceTo(v: Vector3): number {
        return CCVec3.distance(this, v);
    }

    /** 三分量绝对差求和（标量映射）。 */
    public manhattanDistanceTo(v: Vector3): number {
        return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z);
    }

    public negate(): this {
        CCVec3.negate(this, this);
        return this;
    }

    public min(v: Vector3): this {
        CCVec3.min(this, this, v);
        return this;
    }

    public max(v: Vector3): this {
        CCVec3.max(this, this, v);
        return this;
    }

    public clamp(a: Vector3, b: Vector3): this {
        return this.set(ccClamp(this.x, a.x, b.x), ccClamp(this.y, a.y, b.y), ccClamp(this.z, a.z, b.z));
    }

    public clampScalar(a: number, b: number): this {
        return this.set(ccClamp(this.x, a, b), ccClamp(this.y, a, b), ccClamp(this.z, a, b));
    }

    public clampLength(a: number, b: number): this {
        const n = this.length();
        return this.divideScalar(n || 1).multiplyScalar(ccClamp(n, a, b));
    }

    public lerp(v: Vector3, t: number): this {
        CCVec3.lerp(this, this, v, t);
        return this;
    }

    public lerpVectors(a: Vector3, b: Vector3, t: number): this {
        CCVec3.lerp(this, a, b, t);
        return this;
    }

    public floor(): this {
        CCVec3.floor(this, this);
        return this;
    }

    public ceil(): this {
        CCVec3.ceil(this, this);
        return this;
    }

    public round(): this {
        CCVec3.round(this, this);
        return this;
    }

    /** 引擎无 Vec3.trunc 静态：逐分量 Math.trunc（标量映射）。 */
    public roundToZero(): this {
        return this.set(Math.trunc(this.x), Math.trunc(this.y), Math.trunc(this.z));
    }

    public equals(v: Vector3): boolean {
        return CCVec3.strictEquals(this, v);
    }

    public fromArray(a: ArrayLike<number>, o = 0): this {
        CCVec3.fromArray(this, a as number[], o);
        return this;
    }

    public toArray(a: number[] = [], o = 0): number[] {
        CCVec3.toArray(a, this, o);
        return a;
    }

    public fromBufferAttribute(a: IBindableAttribute, i: number): this {
        this.x = a.array[i * a.itemSize];
        this.y = a.array[i * a.itemSize + 1];
        this.z = a.array[i * a.itemSize + 2];
        return this;
    }

    /** 引擎 cc.Vec3.random 产出随机单位向量，与 Three 的逐分量 [0,1) 不同，故用 cc.random。 */
    public random(): this {
        return this.set(ccRandom(), ccRandom(), ccRandom());
    }

    public *[Symbol.iterator](): IterableIterator<number> {
        yield this.x;
        yield this.y;
        yield this.z;
    }

    public cross(v: Vector3): this {
        return this.crossVectors(this, v);
    }

    public crossVectors(a: Vector3, b: Vector3): this {
        CCVec3.cross(this, a, b);
        return this;
    }

    public applyMatrix3(m: Matrix3): this {
        CCVec3.transformMat3(this, this, readMat3(m3s, m));
        return this;
    }

    public applyMatrix4(m: Matrix4): this {
        CCVec3.transformMat4(this, this, readMat4(m4a, m));
        return this;
    }

    public applyNormalMatrix(m: Matrix3): this {
        return this.applyMatrix3(m).normalize();
    }

    public applyQuaternion(q: Quaternion): this {
        CCVec3.transformQuat(this, this, readQuat(qs, q));
        return this;
    }

    public applyEuler(e: Euler): this {
        return this.applyQuaternion(new Quaternion().setFromEuler(e));
    }

    public applyAxisAngle(axis: Vector3, a: number): this {
        CCQuat.fromAxisAngle(qs, axis, a);
        CCVec3.transformQuat(this, this, qs);
        return this;
    }

    /** 方向变换：cc.Vec3.transformMat4Normal 在仿射矩阵下不除 rhw（m03/m07/m11 为 0），与 Three 一致。 */
    public transformDirection(m: Matrix4): this {
        CCVec3.transformMat4Normal(this, this, readMat4(m4a, m));
        CCVec3.normalize(this, this);
        return this;
    }

    public project(c: ICameraMatrices): this {
        return this.applyMatrix4(c.matrixWorldInverse).applyMatrix4(c.projectionMatrix);
    }

    public unproject(c: ICameraMatrices): this {
        return this.applyMatrix4(c.projectionMatrixInverse).applyMatrix4(c.matrixWorld);
    }

    public setFromMatrixPosition(m: Matrix4): this {
        CCMat4.getTranslation(this, readMat4(m4a, m));
        return this;
    }

    public setFromMatrixColumn(m: Matrix4, i: number): this {
        return this.fromArray(m.elements, i * 4);
    }

    public setFromMatrix3Column(m: Matrix3, i: number): this {
        return this.fromArray(m.elements, i * 3);
    }

    /** Three 的 setFromMatrixScale 取列向量模长（不含反射取负），故用 cc.Vec3.len 而非 cc.Mat4.getScaling。 */
    public setFromMatrixScale(m: Matrix4): this {
        const source = readMat4(m4a, m);
        CCVec3.set(v3a, source.m00, source.m01, source.m02);
        CCVec3.set(v3b, source.m04, source.m05, source.m06);
        const sx = CCVec3.len(v3a);
        const sy = CCVec3.len(v3b);
        CCVec3.set(v3a, source.m08, source.m09, source.m10);
        const sz = CCVec3.len(v3a);
        return this.set(sx, sy, sz);
    }

    /** 球坐标转直角坐标：引擎无对应静态（cc.geometry 只有形状检测），保留 Three 原式。 */
    public setFromSphericalCoords(r: number, phi: number, theta: number): this {
        const s = r * Math.sin(phi);
        return this.set(s * Math.sin(theta), Math.cos(phi) * r, s * Math.cos(theta));
    }

    public setFromCylindricalCoords(r: number, theta: number, y: number): this {
        return this.set(r * Math.sin(theta), y, r * Math.cos(theta));
    }

    /** 委托 cc.Vec3.angle；零向量按 Three 契约补 π/2（引擎返回 0）。 */
    public angleTo(v: Vector3): number {
        if (CCVec3.lengthSqr(this) === 0 || CCVec3.lengthSqr(v) === 0) return Math.PI / 2;
        return CCVec3.angle(this, v);
    }

    /** 委托 cc.Vec3.project（引擎退化阈值 1e-6，Three 为 === 0，见文件头第 7 条）。 */
    public projectOnVector(v: Vector3): this {
        CCVec3.project(this, this, v);
        return this;
    }

    public projectOnPlane(v: Vector3): this {
        CCVec3.projectOnPlane(this, this, v);
        return this;
    }

    public reflect(n: Vector3): this {
        return this.addScaledVector(n, -2 * CCVec3.dot(this, n));
    }
}

// @air-element cc.Vec4
export class Vector4 {
    public x: number;
    public y: number;
    public z: number;
    public w: number;
    public readonly isVector4 = true;

    constructor(x = 0, y = 0, z = 0, w = 1) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.w = w;
    }

    get width(): number {
        return this.z;
    }

    set width(v: number) {
        this.z = v;
    }

    get height(): number {
        return this.w;
    }

    set height(v: number) {
        this.w = v;
    }

    public set(x: number, y: number, z: number, w: number): this {
        CCVec4.set(this, x, y, z, w);
        return this;
    }

    public setScalar(s: number): this {
        return this.set(s, s, s, s);
    }

    public setComponent(i: number, v: number): this {
        if (i < 0 || i >= 4) throw new RangeError('Vector component');
        if (i === 0) this.x = v;
        else if (i === 1) this.y = v;
        else if (i === 2) this.z = v;
        else this.w = v;
        return this;
    }

    public getComponent(i: number): number {
        if (i < 0 || i >= 4) throw new RangeError('Vector component');
        if (i === 0) return this.x;
        if (i === 1) return this.y;
        if (i === 2) return this.z;
        return this.w;
    }

    public setX(v: number): this {
        this.x = v;
        return this;
    }

    public setY(v: number): this {
        this.y = v;
        return this;
    }

    public setZ(v: number): this {
        this.z = v;
        return this;
    }

    public setW(v: number): this {
        this.w = v;
        return this;
    }

    public clone(): Vector4 {
        return new Vector4().copy(this);
    }

    /** Three 允许从三分量对象拷贝并把 w 补 1，引擎 cc.Vec4.copy 要求 w 存在，故显式映射。 */
    public copy(v: { x: number; y: number; z: number; w?: number }): this {
        CCVec4.set(this, v.x, v.y, v.z, v.w === undefined ? 1 : v.w);
        return this;
    }

    public add(v: Vector4): this {
        CCVec4.add(this, this, v);
        return this;
    }

    public sub(v: Vector4): this {
        CCVec4.subtract(this, this, v);
        return this;
    }

    public multiply(v: Vector4): this {
        CCVec4.multiply(this, this, v);
        return this;
    }

    public divide(v: Vector4): this {
        CCVec4.divide(this, this, v);
        return this;
    }

    public addScalar(v: number): this {
        CCVec4.add<Vector4>(this, this, tmpVec4.set(v, v, v, v));
        return this;
    }

    public subScalar(v: number): this {
        return this.addScalar(-v);
    }

    public multiplyScalar(v: number): this {
        CCVec4.multiplyScalar(this, this, v);
        return this;
    }

    public divideScalar(v: number): this {
        return this.multiplyScalar(1 / v);
    }

    public addVectors(a: Vector4, b: Vector4): this {
        CCVec4.add(this, a, b);
        return this;
    }

    public subVectors(a: Vector4, b: Vector4): this {
        CCVec4.subtract(this, a, b);
        return this;
    }

    public multiplyVectors(a: Vector4, b: Vector4): this {
        CCVec4.multiply(this, a, b);
        return this;
    }

    public addScaledVector(v: Vector4, s: number): this {
        CCVec4.scaleAndAdd(this, this, v, s);
        return this;
    }

    public dot(v: Vector4): number {
        return CCVec4.dot(this, v);
    }

    public lengthSq(): number {
        return CCVec4.lengthSqr(this);
    }

    public length(): number {
        return CCVec4.len(this);
    }

    /** 四分量绝对值求和（标量映射）。 */
    public manhattanLength(): number {
        return Math.abs(this.x) + Math.abs(this.y) + Math.abs(this.z) + Math.abs(this.w);
    }

    public normalize(): this {
        CCVec4.normalize(this, this);
        return this;
    }

    public setLength(v: number): this {
        return this.normalize().multiplyScalar(v);
    }

    public distanceToSquared(v: Vector4): number {
        return CCVec4.squaredDistance(this, v);
    }

    public distanceTo(v: Vector4): number {
        return CCVec4.distance(this, v);
    }

    /** 四分量绝对差求和（标量映射）。 */
    public manhattanDistanceTo(v: Vector4): number {
        return Math.abs(this.x - v.x) + Math.abs(this.y - v.y) + Math.abs(this.z - v.z) + Math.abs(this.w - v.w);
    }

    public negate(): this {
        CCVec4.negate(this, this);
        return this;
    }

    public min(v: Vector4): this {
        CCVec4.min(this, this, v);
        return this;
    }

    public max(v: Vector4): this {
        CCVec4.max(this, this, v);
        return this;
    }

    public clamp(a: Vector4, b: Vector4): this {
        return this.set(
            ccClamp(this.x, a.x, b.x),
            ccClamp(this.y, a.y, b.y),
            ccClamp(this.z, a.z, b.z),
            ccClamp(this.w, a.w, b.w),
        );
    }

    public clampScalar(a: number, b: number): this {
        return this.set(ccClamp(this.x, a, b), ccClamp(this.y, a, b), ccClamp(this.z, a, b), ccClamp(this.w, a, b));
    }

    public clampLength(a: number, b: number): this {
        const n = this.length();
        return this.divideScalar(n || 1).multiplyScalar(ccClamp(n, a, b));
    }

    public lerp(v: Vector4, t: number): this {
        CCVec4.lerp(this, this, v, t);
        return this;
    }

    public lerpVectors(a: Vector4, b: Vector4, t: number): this {
        CCVec4.lerp(this, a, b, t);
        return this;
    }

    public floor(): this {
        CCVec4.floor(this, this);
        return this;
    }

    public ceil(): this {
        CCVec4.ceil(this, this);
        return this;
    }

    public round(): this {
        CCVec4.round(this, this);
        return this;
    }

    /** 引擎无 Vec4.trunc 静态：逐分量 Math.trunc（标量映射）。 */
    public roundToZero(): this {
        return this.set(Math.trunc(this.x), Math.trunc(this.y), Math.trunc(this.z), Math.trunc(this.w));
    }

    public equals(v: Vector4): boolean {
        return CCVec4.strictEquals(this, v);
    }

    public fromArray(a: ArrayLike<number>, o = 0): this {
        CCVec4.fromArray(this, a as number[], o);
        return this;
    }

    public toArray(a: number[] = [], o = 0): number[] {
        CCVec4.toArray(a, this, o);
        return a;
    }

    public fromBufferAttribute(a: IBindableAttribute, i: number): this {
        this.x = a.array[i * a.itemSize];
        this.y = a.array[i * a.itemSize + 1];
        this.z = a.array[i * a.itemSize + 2];
        this.w = a.array[i * a.itemSize + 3];
        return this;
    }

    public random(): this {
        return this.set(ccRandom(), ccRandom(), ccRandom(), ccRandom());
    }

    public *[Symbol.iterator](): IterableIterator<number> {
        yield this.x;
        yield this.y;
        yield this.z;
        yield this.w;
    }

    public applyMatrix4(m: Matrix4): this {
        CCVec4.transformMat4(this, this, readMat4(m4a, m));
        return this;
    }

    /** 委托 cc.Quat.getAxisAngle（引擎对 s===0 回退 (1,0,0)，与 Three 的 s<1e-4 阈值等价语义）。 */
    public setAxisAngleFromQuaternion(q: Quaternion): this {
        const rad = CCQuat.getAxisAngle(v3a, readQuat(qs, q));
        return this.set(v3a.x, v3a.y, v3a.z, rad);
    }
}

// 同 Vector2：cc.Vec4 静态的 out/a/b 共用一个类型参数，加法暂存取本类实例。
const tmpVec4 = new Vector4();

// @air-element cc.Quat
export class Quaternion {
    private _x: number;
    private _y: number;
    private _z: number;
    private _w: number;
    public readonly isQuaternion = true;
    private _onChangeCallback: () => void = () => {};

    constructor(x = 0, y = 0, z = 0, w = 1) {
        this._x = x;
        this._y = y;
        this._z = z;
        this._w = w;
    }

    get x(): number {
        return this._x;
    }

    set x(v: number) {
        this._x = v;
        this._onChangeCallback();
    }

    get y(): number {
        return this._y;
    }

    set y(v: number) {
        this._y = v;
        this._onChangeCallback();
    }

    get z(): number {
        return this._z;
    }

    set z(v: number) {
        this._z = v;
        this._onChangeCallback();
    }

    get w(): number {
        return this._w;
    }

    set w(v: number) {
        this._w = v;
        this._onChangeCallback();
    }

    public set(x: number, y: number, z: number, w: number): this {
        this._x = x;
        this._y = y;
        this._z = z;
        this._w = w;
        this._onChangeCallback();
        return this;
    }

    public identity(): this {
        return this.set(0, 0, 0, 1);
    }

    public copy(q: Quaternion): this {
        return this.set(q.x, q.y, q.z, q.w);
    }

    public clone(): Quaternion {
        return new Quaternion(this.x, this.y, this.z, this.w);
    }

    public _onChange(f: () => void): this {
        this._onChangeCallback = f;
        return this;
    }

    /**
     * Closed-form products of intrinsic axis rotations. Keep each triple product
     * left-associated so conversion to the eventual GPU float32 is predictable.
     * 引擎 cc.Quat.fromEuler 是「角度制 + 固定 YXZ 序」，无法覆盖 Three 的弧度六序契约，故保留原式。
     */
    public setFromEuler(e: Euler, update = true): this {
        const sx = Math.sin(e.x / 2);
        const sy = Math.sin(e.y / 2);
        const sz = Math.sin(e.z / 2);
        const cx = Math.cos(e.x / 2);
        const cy = Math.cos(e.y / 2);
        const cz = Math.cos(e.z / 2);
        const signs: Record<string, number[]> = {
            XYZ: [1, -1, 1, -1],
            YXZ: [1, -1, -1, 1],
            ZXY: [-1, 1, 1, -1],
            ZYX: [-1, 1, -1, 1],
            YZX: [1, 1, -1, -1],
            XZY: [-1, -1, 1, 1],
        };
        const s = signs[e.order];
        if (!s) throw new Error(`Unsupported Euler order: ${e.order}`);
        this._x = sx * cy * cz + s[0] * cx * sy * sz;
        this._y = cx * sy * cz + s[1] * sx * cy * sz;
        this._z = cx * cy * sz + s[2] * sx * sy * cz;
        this._w = cx * cy * cz + s[3] * sx * sy * sz;
        if (update) this._onChangeCallback();
        return this;
    }

    public setFromAxisAngle(a: Vector3, t: number): this {
        CCQuat.fromAxisAngle(qs, a, t);
        return this.set(qs.x, qs.y, qs.z, qs.w);
    }

    /**
     * 委托 cc.Mat3.fromMat4（降阶取左上 3x3）+ cc.Quat.fromMat3。
     * 引擎按「四分量中最大者取正」分支、Three 先判 trace>0，两个分支同解；同一旋转矩阵下
     * 二者可能给出整体差一个符号的四元数（q 与 -q 表示同一旋转，均为合法结果）。
     */
    public setFromRotationMatrix(m: Matrix4): this {
        CCMat3.fromMat4(m3s, readMat4(m4a, m));
        CCQuat.fromMat3(qs, m3s);
        return this.set(qs.x, qs.y, qs.z, qs.w);
    }

    /** 委托 cc.Quat.rotationTo；反平行时引擎换轴方式与 Three 不同（同为合法 180° 旋转）。 */
    public setFromUnitVectors(a: Vector3, b: Vector3): this {
        CCQuat.rotationTo(qs, a, b);
        return this.set(qs.x, qs.y, qs.z, qs.w);
    }

    public multiply(q: Quaternion): this {
        return this.multiplyQuaternions(this, q);
    }

    public premultiply(q: Quaternion): this {
        return this.multiplyQuaternions(q, this);
    }

    public multiplyQuaternions(a: Quaternion, b: Quaternion): this {
        CCQuat.multiply(qs, readQuat(qInA, a), readQuat(qInB, b));
        return this.set(qs.x, qs.y, qs.z, qs.w);
    }

    public dot(q: Quaternion): number {
        return CCQuat.dot(readQuat(qInA, this), readQuat(qInB, q));
    }

    public lengthSq(): number {
        return CCQuat.lengthSqr(readQuat(qs, this));
    }

    public length(): number {
        return CCQuat.len(readQuat(qs, this));
    }

    /** 引擎在零四元数上置 (0,0,0,0)，Three 契约是回单位元，故补长度守卫。 */
    public normalize(): this {
        if (this.lengthSq() === 0) return this.identity();
        CCQuat.normalize(qs, readQuat(qInA, this));
        return this.set(qs.x, qs.y, qs.z, qs.w);
    }

    public conjugate(): this {
        CCQuat.conjugate(qs, readQuat(qInA, this));
        return this.set(qs.x, qs.y, qs.z, qs.w);
    }

    /** Three 的 invert 即共轭（cc.Quat.invert 会除以长度平方，语义不同）。 */
    public invert(): this {
        return this.conjugate();
    }

    public angleTo(q: Quaternion): number {
        return CCQuat.angle(readQuat(qs, this), q);
    }

    /** 委托 cc.Quat.rotateTowards：入参是角度制（step 弧度换算），且夹角 0 时按 Three 原地返回。 */
    public rotateTowards(q: Quaternion, step: number): this {
        const a = this.angleTo(q);
        if (a === 0) return this;
        CCQuat.rotateTowards(qs, readQuat(qInA, this), readQuat(qInB, q), ccToDegree(Math.min(1, step / a) * a));
        return this.set(qs.x, qs.y, qs.z, qs.w);
    }

    public slerp(q: Quaternion, t: number): this {
        if (t === 0) return this;
        if (t === 1) return this.copy(q);
        CCQuat.slerp(qs, readQuat(qInA, this), readQuat(qInB, q), t);
        return this.set(qs.x, qs.y, qs.z, qs.w);
    }

    public slerpQuaternions(a: Quaternion, b: Quaternion, t: number): this {
        return this.copy(a).slerp(b, t);
    }

    public equals(q: Quaternion): boolean {
        return CCQuat.strictEquals(readQuat(qs, this), q);
    }

    public fromArray(a: ArrayLike<number>, o = 0): this {
        return this.set(a[o], a[o + 1], a[o + 2], a[o + 3]);
    }

    public toArray(a: number[] = [], o = 0): number[] {
        a[o] = this.x;
        a[o + 1] = this.y;
        a[o + 2] = this.z;
        a[o + 3] = this.w;
        return a;
    }

    public *[Symbol.iterator](): IterableIterator<number> {
        yield this.x;
        yield this.y;
        yield this.z;
        yield this.w;
    }
}

// @air-element none:Euler — 引擎无 Euler 类，只有 cc.Quat 与 cc.Mat3/cc.Mat4.toEuler 的固定 YXZ 角度制约定；
// Three 契约是弧度 + 六种旋转序 + onChange 联动 Object3D.rotation，故 AIR 自持薄封装。
export class Euler {
    private _x: number;
    private _y: number;
    private _z: number;
    private _order: string;
    public readonly isEuler = true;
    private _onChangeCallback: () => void = () => {};

    constructor(x = 0, y = 0, z = 0, order = 'XYZ') {
        this._x = x;
        this._y = y;
        this._z = z;
        this._order = order;
    }

    get x(): number {
        return this._x;
    }

    set x(v: number) {
        this._x = v;
        this._onChangeCallback();
    }

    get y(): number {
        return this._y;
    }

    set y(v: number) {
        this._y = v;
        this._onChangeCallback();
    }

    get z(): number {
        return this._z;
    }

    set z(v: number) {
        this._z = v;
        this._onChangeCallback();
    }

    get order(): string {
        return this._order;
    }

    set order(v: string) {
        this._order = v;
        this._onChangeCallback();
    }

    public set(x: number, y: number, z: number, o: string = this.order): this {
        this._x = x;
        this._y = y;
        this._z = z;
        this._order = o;
        this._onChangeCallback();
        return this;
    }

    public copy(e: Euler): this {
        return this.set(e.x, e.y, e.z, e.order);
    }

    public clone(): Euler {
        return new Euler().copy(this);
    }

    public _onChange(f: () => void): this {
        this._onChangeCallback = f;
        return this;
    }

    public setFromRotationMatrix(m: Matrix4, o: string = this.order, update = true): this {
        const e = m.elements;
        const a = e[0];
        const b = e[4];
        const c = e[8];
        const d = e[1];
        const f = e[5];
        const g = e[9];
        const h = e[2];
        const i = e[6];
        const j = e[10];
        const asin = (v: number) => Math.asin(ccClamp(v, -1, 1));
        let x = 0;
        let y = 0;
        let z = 0;
        const lim = 0.9999999;
        switch (o) {
            case 'XYZ':
                y = asin(c);
                if (Math.abs(c) < lim) {
                    x = Math.atan2(-g, j);
                    z = Math.atan2(-b, a);
                } else {
                    x = Math.atan2(i, f);
                }
                break;
            case 'YXZ':
                x = asin(-g);
                if (Math.abs(g) < lim) {
                    y = Math.atan2(c, j);
                    z = Math.atan2(d, f);
                } else {
                    y = Math.atan2(-h, a);
                }
                break;
            case 'ZXY':
                x = asin(i);
                if (Math.abs(i) < lim) {
                    y = Math.atan2(-h, j);
                    z = Math.atan2(-b, f);
                } else {
                    z = Math.atan2(d, a);
                }
                break;
            case 'ZYX':
                y = asin(-h);
                if (Math.abs(h) < lim) {
                    x = Math.atan2(i, j);
                    z = Math.atan2(d, a);
                } else {
                    z = Math.atan2(-b, f);
                }
                break;
            case 'YZX':
                z = asin(d);
                if (Math.abs(d) < lim) {
                    x = Math.atan2(-g, f);
                    y = Math.atan2(-h, a);
                } else {
                    y = Math.atan2(c, j);
                }
                break;
            case 'XZY':
                z = asin(-b);
                if (Math.abs(b) < lim) {
                    x = Math.atan2(i, f);
                    y = Math.atan2(c, a);
                } else {
                    x = Math.atan2(-g, j);
                }
                break;
            default:
                throw new Error(`Unsupported Euler order: ${o}`);
        }
        this._x = x;
        this._y = y;
        this._z = z;
        this._order = o;
        if (update) this._onChangeCallback();
        return this;
    }

    public setFromQuaternion(q: Quaternion, o: string = this.order, update = true): this {
        return this.setFromRotationMatrix(new Matrix4().makeRotationFromQuaternion(q), o, update);
    }

    public setFromVector3(v: Vector3, o: string = this.order): this {
        return this.set(v.x, v.y, v.z, o);
    }

    public reorder(o: string): this {
        return this.setFromQuaternion(new Quaternion().setFromEuler(this), o);
    }

    public equals(e: Euler): boolean {
        return this.x === e.x && this.y === e.y && this.z === e.z && this.order === e.order;
    }

    public fromArray(a: ArrayLike<unknown>): this {
        return this.set(a[0] as number, a[1] as number, a[2] as number, (a[3] as string) || this.order);
    }

    public toArray(a: unknown[] = [], o = 0): unknown[] {
        a[o] = this.x;
        a[o + 1] = this.y;
        a[o + 2] = this.z;
        a[o + 3] = this.order;
        return a;
    }
}

/**
 * 只承载「列主序 elements 数组」的读写映射，不含算法：
 * Matrix2/3/4 的 set/identity/copy/fromArray/toArray/equals 全是 Three 行主序入参与列主序存储之间的索引映射。
 */
class MatrixStorage {
    protected readonly _n: number;
    public elements: number[];

    constructor(n: number) {
        this._n = n;
        this.elements = new Array<number>(n * n);
        this.identity();
    }

    public set(...v: number[]): this {
        const n = this._n;
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) this.elements[c * n + r] = v[r * n + c];
        }
        return this;
    }

    public identity(): this {
        const n = this._n;
        this.elements.fill(0);
        for (let i = 0; i < n; i++) this.elements[i * n + i] = 1;
        return this;
    }

    public copy(m: MatrixStorage): this {
        for (let i = 0; i < this.elements.length; i++) this.elements[i] = m.elements[i];
        return this;
    }

    public fromArray(a: ArrayLike<number>, o = 0): this {
        for (let i = 0; i < this.elements.length; i++) this.elements[i] = a[o + i];
        return this;
    }

    public toArray(a: number[] = [], o = 0): number[] {
        for (let i = 0; i < this.elements.length; i++) a[o + i] = this.elements[i];
        return a;
    }

    public equals(m: MatrixStorage): boolean {
        return this.elements.every((v, i) => v === m.elements[i]);
    }
}

// @air-element none:Matrix2 — 引擎只有 cc.Mat3/cc.Mat4，无 2x2 矩阵类型；Spark 不使用该类型，
// 为与上游导出面对等而自持（通用余子式行列式/求逆路径只服务 2x2，不参与 3x3/4x4 的委托）。
export class Matrix2 extends MatrixStorage {
    public readonly isMatrix2 = true;

    constructor(...v: number[]) {
        super(2);
        if (v.length) this.set(...v);
    }

    public clone(): Matrix2 {
        return new Matrix2().copy(this) as Matrix2;
    }

    public multiply(m: Matrix2): this {
        return this.multiplyMatrices(this, m);
    }

    public premultiply(m: Matrix2): this {
        return this.multiplyMatrices(m, this);
    }

    public multiplyMatrices(a: Matrix2, b: Matrix2): this {
        const x = a.elements.slice();
        const y = b.elements.slice();
        for (let r = 0; r < 2; r++) {
            for (let c = 0; c < 2; c++) {
                let s = 0;
                for (let k = 0; k < 2; k++) s += x[k * 2 + r] * y[c * 2 + k];
                this.elements[c * 2 + r] = s;
            }
        }
        return this;
    }

    public multiplyScalar(s: number): this {
        for (let i = 0; i < this.elements.length; i++) this.elements[i] *= s;
        return this;
    }

    public determinant(): number {
        return this.elements[0] * this.elements[3] - this.elements[1] * this.elements[2];
    }

    /** 2x2 伴随矩阵求逆（列主序存储：e0=m00,e1=m10,e2=m01,e3=m11）；奇异时与 Three 同样写零矩阵。 */
    public invert(): this {
        const d = this.determinant();
        const old = this.elements.slice();
        if (d === 0) {
            this.elements.fill(0);
            return this;
        }
        const inv = 1 / d;
        this.elements[0] = old[3] * inv;
        this.elements[1] = -old[1] * inv;
        this.elements[2] = -old[2] * inv;
        this.elements[3] = old[0] * inv;
        return this;
    }

    public transpose(): this {
        const t = this.elements[1];
        this.elements[1] = this.elements[2];
        this.elements[2] = t;
        return this;
    }
}

// @air-element cc.Mat3
export class Matrix3 extends MatrixStorage {
    public readonly isMatrix3 = true;

    constructor(...v: number[]) {
        super(3);
        if (v.length) this.set(...v);
    }

    public clone(): Matrix3 {
        const out = new Matrix3();
        out.copy(this);
        return out;
    }

    public setFromMatrix4(m: Matrix4): this {
        CCMat3.fromMat4(m3s, readMat4(m4a, m));
        CCMat3.toArray(this.elements, m3s);
        return this;
    }

    /** 委托 cc.Mat3.inverseTransposeMat4；引擎在奇异输入上返回 null（Three 无此返回），此时按零矩阵处理。 */
    public getNormalMatrix(m: Matrix4): this {
        if (CCMat3.inverseTransposeMat4(m3s, readMat4(m4a, m)) === null) this.elements.fill(0);
        else CCMat3.toArray(this.elements, m3s);
        return this;
    }

    public multiply(m: Matrix3): this {
        return this.multiplyMatrices(this, m);
    }

    public premultiply(m: Matrix3): this {
        return this.multiplyMatrices(m, this);
    }

    public multiplyMatrices(a: Matrix3, b: Matrix3): this {
        CCMat3.multiply(m3s, readMat3(m3Arg, a), readMat3(m3ArgB, b));
        CCMat3.toArray(this.elements, m3s);
        return this;
    }
    public multiplyScalar(s: number): this {
        CCMat3.multiplyScalar(m3s, readMat3(m3Arg, this), s);
        CCMat3.toArray(this.elements, m3s);
        return this;
    }

    public determinant(): number {
        return CCMat3.determinant(readMat3(m3s, this));
    }

    /** 引擎 cc.Mat3.invert 与 Three 一致：奇异矩阵写零矩阵（mat3.ts:158 的 Mat3.set(out, 0...)）。 */
    public invert(): this {
        CCMat3.invert(m3s, readMat3(m3Arg, this));
        CCMat3.toArray(this.elements, m3s);
        return this;
    }

    public transpose(): this {
        CCMat3.transpose(m3s, readMat3(m3Arg, this));
        CCMat3.toArray(this.elements, m3s);
        return this;
    }

    public extractBasis(x: Vector3, y: Vector3, z: Vector3): this {
        x.setFromMatrix3Column(this, 0);
        y.setFromMatrix3Column(this, 1);
        z.setFromMatrix3Column(this, 2);
        return this;
    }

    /** 转置写入外部数组：复用引擎 cc.Mat3.transpose 的镜像结果再按列主序导出，不另写 3x3 展开循环。 */
    public transposeIntoArray(a: number[]): this {
        CCMat3.transpose(m3s, readMat3(m3s, this));
        CCMat3.toArray(a, m3s);
        return this;
    }

    /**
     * UV 变换：引擎 cc.Mat3 有 fromScaling/fromRotation/fromTranslation 三个基元，
     * 但没有 Three 的七参数合成入口，故保留 Three 的列主序写入（纯字段映射，无算法主体）。
     */
    public setUvTransform(tx: number, ty: number, sx: number, sy: number, r: number, cx: number, cy: number): this {
        const c = Math.cos(r);
        const s = Math.sin(r);
        return this.set(
            sx * c,
            sx * s,
            -sx * (c * cx + s * cy) + cx + tx,
            -sy * s,
            sy * c,
            -sy * (-s * cx + c * cy) + cy + ty,
            0,
            0,
            1,
        );
    }
}

// @air-element cc.Mat4
export class Matrix4 extends MatrixStorage {
    public readonly isMatrix4 = true;

    constructor(...v: number[]) {
        super(4);
        if (v.length) this.set(...v);
    }

    public clone(): Matrix4 {
        const out = new Matrix4();
        out.copy(this);
        return out;
    }

    public copyPosition(m: Matrix4): this {
        const source = readMat4(m4a, m);
        this.elements[12] = source.m12;
        this.elements[13] = source.m13;
        this.elements[14] = source.m14;
        return this;
    }

    /**
     * 引擎 cc.Mat4 没有 fromMat3 静态（cc.Mat3 与 cc.Mat4 之间只有 Mat3.fromMat4 降阶方向），
     * 因此这里按 Three 契约做纯索引升阶（3x3 列主序 → 4x4 列主序 + 单位齐次行/列），无算法主体。
     */
    public setFromMatrix3(m: Matrix3): this {
        const e = m.elements;
        return this.set(e[0], e[3], e[6], 0, e[1], e[4], e[7], 0, e[2], e[5], e[8], 0, 0, 0, 0, 1);
    }

    public setPosition(x: number | Vector3, y?: number, z?: number): this {
        if (typeof x === 'object') {
            z = x.z;
            y = x.y;
            x = x.x;
        }
        this.elements[12] = x as number;
        this.elements[13] = y as number;
        this.elements[14] = z as number;
        return this;
    }

    public makeTranslation(x: number | Vector3, y?: number, z?: number): this {
        if (typeof x === 'object') {
            z = x.z;
            y = x.y;
            x = x.x;
        }
        CCVec3.set(v3a, x as number, y as number, z as number);
        CCMat4.fromTranslation(m4c, v3a);
        return writeMat4(this, m4c);
    }

    public makeScale(x: number, y: number, z: number): this {
        CCVec3.set(v3a, x, y, z);
        CCMat4.fromScaling(m4c, v3a);
        return writeMat4(this, m4c);
    }

    public makeRotationX(t: number): this {
        CCMat4.fromXRotation(m4c, t);
        return writeMat4(this, m4c);
    }

    public makeRotationY(t: number): this {
        CCMat4.fromYRotation(m4c, t);
        return writeMat4(this, m4c);
    }

    public makeRotationZ(t: number): this {
        CCMat4.fromZRotation(m4c, t);
        return writeMat4(this, m4c);
    }

    /** 委托 cc.Mat4.identity + cc.Mat4.rotate（绕任意轴）；退化轴（长度 0）引擎返回 null，此处保持单位阵。 */
    public makeRotationAxis(axis: Vector3, t: number): this {
        CCMat4.identity(m4c);
        if (CCMat4.rotate(m4c, m4c, t, axis) === null) CCMat4.identity(m4c);
        return writeMat4(this, m4c);
    }

    /** 委托 cc.Mat4.fromQuat（平移列写 0、齐次位写 1，与 Three 的纯旋转阵逐一对应）。 */
    public makeRotationFromQuaternion(q: Quaternion): this {
        CCMat4.fromQuat(m4c, readQuat(qInA, q));
        return writeMat4(this, m4c);
    }

    public makeRotationFromEuler(e: Euler): this {
        return this.makeRotationFromQuaternion(new Quaternion().setFromEuler(e));
    }

    public makeBasis(x: Vector3, y: Vector3, z: Vector3): this {
        return this.set(x.x, y.x, z.x, 0, x.y, y.y, z.y, 0, x.z, y.z, z.z, 0, 0, 0, 0, 1);
    }

    public extractBasis(x: Vector3, y: Vector3, z: Vector3): this {
        x.setFromMatrixColumn(this, 0);
        y.setFromMatrixColumn(this, 1);
        z.setFromMatrixColumn(this, 2);
        return this;
    }

    /** 逐列取 cc.Vec3.normalize 后重建基（与 Three 原文一致，标准化本身委托引擎）。 */
    public extractRotation(m: Matrix4): this {
        return this.makeBasis(
            new Vector3().setFromMatrixColumn(m, 0).normalize(),
            new Vector3().setFromMatrixColumn(m, 1).normalize(),
            new Vector3().setFromMatrixColumn(m, 2).normalize(),
        );
    }

    /** 委托 cc.Mat4.fromSRT（`(out, q, v, s)` 即 Three 的 S→R→T 次序，16 个字段逐一同解）。 */
    public compose(p: Vector3, q: Quaternion, s: Vector3): this {
        CCMat4.fromSRT(m4c, readQuat(qInA, q), p, s);
        return writeMat4(this, m4c);
    }

    /** 委托 cc.Mat4.toSRT；缩放分量为 0 时引擎给单位四元数（Three 原式给 NaN），见文件头第 7 条。 */
    public decompose(p: Vector3, q: Quaternion, s: Vector3): this {
        const source = readMat4(m4a, this);
        CCMat4.toSRT(source, qs, v3a, v3b);
        p.set(v3a.x, v3a.y, v3a.z);
        s.set(v3b.x, v3b.y, v3b.z);
        // cc.Mat4.toSRT 的四元数分支取自 Quat.fromMat3 的「最大分量分支」（把最大分量取正）；
        // Three 的 Matrix4.decompose → setFromRotationMatrix 先按 trace>0 分支（把 w 取正），
        // 二者对同一旋转矩阵可能整体相差一个符号（同一旋转的两个等价四元数）。用归一化后的旋转迹
        // ——对角元 / 引擎返回的对应缩放分量，逐字段映射、无算法主体——复现 Three 的分支选择：
        // 引擎四元数 w<0 而归一化迹>0 时 Three 落在 w>0 一支，取反对齐其符号约定（否则原样返回）。
        const normTrace = this.elements[0] / v3b.x + this.elements[5] / v3b.y + this.elements[10] / v3b.z;
        if (qs.w < 0 && normTrace > 0) q.set(-qs.x, -qs.y, -qs.z, -qs.w);
        else q.set(qs.x, qs.y, qs.z, qs.w);
        return this;
    }

    public scale(s: Vector3): this {
        CCMat4.scale(m4c, readMat4(m4a, this), s);
        return writeMat4(this, m4c);
    }

    /** 逐列模长取最大（用 cc.Vec3.len，不用 cc.Mat4.getScaling：后者在反射时把 x 取负）。 */
    public getMaxScaleOnAxis(): number {
        const source = readMat4(m4a, this);
        CCVec3.set(v3a, source.m00, source.m01, source.m02);
        CCVec3.set(v3b, source.m04, source.m05, source.m06);
        const x = CCVec3.len(v3a);
        const y = CCVec3.len(v3b);
        CCVec3.set(v3a, source.m08, source.m09, source.m10);
        return Math.max(x, y, CCVec3.len(v3a));
    }

    public multiply(m: Matrix4): this {
        return this.multiplyMatrices(this, m);
    }

    public premultiply(m: Matrix4): this {
        return this.multiplyMatrices(m, this);
    }

    /** 委托 cc.Mat4.multiply（同为列主序 4x4 相乘，16 个字段逐一同解）。 */
    public multiplyMatrices(a: Matrix4, b: Matrix4): this {
        CCMat4.multiply(m4c, readMat4(m4a, a), readMat4(m4b, b));
        return writeMat4(this, m4c);
    }

    public multiplyScalar(s: number): this {
        CCMat4.multiplyScalar(m4c, readMat4(m4a, this), s);
        return writeMat4(this, m4c);
    }

    public determinant(): number {
        return CCMat4.determinant(readMat4(m4a, this));
    }

    /** 委托 cc.Mat4.invert（奇异时引擎与本层契约同样写零矩阵）。 */
    public invert(): this {
        CCMat4.invert(m4c, readMat4(m4a, this));
        return writeMat4(this, m4c);
    }

    public transpose(): this {
        CCMat4.transpose(m4c, readMat4(m4a, this));
        return writeMat4(this, m4c);
    }

    /**
     * 委托 cc.Mat4.lookAt 取基，再按 Three 的 Matrix4.lookAt 契约做列主序映射：
     * cc.Mat4.lookAt（gl-matrix 血统）产出「视图基」——3x3 是 Three 世界基的转置，并把 -(基·eye) 写进平移列；
     * Three 的 Matrix4.lookAt 只写世界基的 3x3，不改动平移/齐次列（保持构造时的单位阵）。
     * 正常输入用 CCMat4.transpose 把视图基转成世界基（3x3 转置把 cc 的平移搬进 m03/m07/m11，置零即还原
     * Three 的单位齐次列，纯引擎静态 + 逐字段映射，无自建算法主体）；
     * 退化输入（视线长度 0 或与 up 平行，引擎产出 NaN）按 Three 原文用 cc.Vec3 原语重建世界基。见文件头第 7 条。
     */
    public lookAt(eye: Vector3, target: Vector3, up: Vector3): this {
        CCMat4.lookAt(m4c, eye, target, up);
        const ok =
            Number.isFinite(m4c.m00) &&
            Number.isFinite(m4c.m01) &&
            Number.isFinite(m4c.m02) &&
            Number.isFinite(m4c.m04) &&
            Number.isFinite(m4c.m05) &&
            Number.isFinite(m4c.m06) &&
            Number.isFinite(m4c.m08) &&
            Number.isFinite(m4c.m09) &&
            Number.isFinite(m4c.m10);
        if (ok) {
            CCMat4.transpose(m4c, m4c);
            writeMat4(this, m4c);
            this.elements[3] = 0;
            this.elements[7] = 0;
            this.elements[11] = 0;
            return this;
        }
        // 退化输入：引擎在视线长度 0 或与 up 平行时产出 NaN，按 Three 原文重建世界基。
        const zx = eye.x - target.x;
        const zy = eye.y - target.y;
        const zz = eye.z - target.z;
        if (zx * zx + zy * zy + zz * zz === 0) CCVec3.set(v3a, 0, 0, 1);
        else CCVec3.set(v3a, zx, zy, zz);
        CCVec3.normalize(v3a, v3a);
        CCVec3.set(v3b, up.y * v3a.z - up.z * v3a.y, up.z * v3a.x - up.x * v3a.z, up.x * v3a.y - up.y * v3a.x);
        if (CCVec3.len(v3b) === 0) {
            if (Math.abs(up.z) === 1) CCVec3.set(v3a, v3a.x + 0.0001, v3a.y, v3a.z);
            else CCVec3.set(v3a, v3a.x, v3a.y, v3a.z + 0.0001);
            CCVec3.normalize(v3a, v3a);
            CCVec3.set(v3b, up.y * v3a.z - up.z * v3a.y, up.z * v3a.x - up.x * v3a.z, up.x * v3a.y - up.y * v3a.x);
        }
        CCVec3.normalize(v3b, v3b);
        const yx = v3a.y * v3b.z - v3a.z * v3b.y;
        const yy = v3a.z * v3b.x - v3a.x * v3b.z;
        const yz = v3a.x * v3b.y - v3a.y * v3b.x;
        this.elements[0] = v3b.x;
        this.elements[1] = v3b.y;
        this.elements[2] = v3b.z;
        this.elements[4] = yx;
        this.elements[5] = yy;
        this.elements[6] = yz;
        this.elements[8] = v3a.x;
        this.elements[9] = v3a.y;
        this.elements[10] = v3a.z;
        return this;
    }

    /**
     * 委托 cc.Mat4.frustum（同为 -1..1 深度约定，逐字段等价）；
     * far === Infinity 与 coordinateSystem === 2001（WebGPU 0..1）两分支引擎无对应静态，
     * 按 Three 原式做列主序字段写入（纯映射）。
     */
    public makePerspective(
        l: number,
        r: number,
        t: number,
        b: number,
        n: number,
        f: number,
        coordinateSystem = 2000,
    ): this {
        if (coordinateSystem === 2000 && Number.isFinite(f)) {
            CCMat4.frustum(m4c, l, r, b, t, n, f);
            return writeMat4(this, m4c);
        }
        const x = (2 * n) / (r - l);
        const y = (2 * n) / (t - b);
        const a = (r + l) / (r - l);
        const bb = (t + b) / (t - b);
        let c: number;
        let d: number;
        if (coordinateSystem === 2000) {
            c = f === Infinity ? -1 : -(f + n) / (f - n);
            d = f === Infinity ? -2 * n : (-2 * f * n) / (f - n);
        } else if (coordinateSystem === 2001) {
            c = f === Infinity ? -1 : -f / (f - n);
            d = f === Infinity ? -n : (-f * n) / (f - n);
        } else {
            throw new Error('Unsupported coordinate system');
        }
        return this.set(x, 0, a, 0, 0, y, bb, 0, 0, 0, c, d, 0, 0, -1, 0);
    }

    /** 委托 cc.Mat4.ortho，Three 的 coordinateSystem 直接映射到引擎的 minClipZ 参数。 */
    public makeOrthographic(
        l: number,
        r: number,
        t: number,
        b: number,
        n: number,
        f: number,
        coordinateSystem = 2000,
    ): this {
        if (coordinateSystem !== 2000 && coordinateSystem !== 2001) throw new Error('Unsupported coordinate system');
        CCMat4.ortho(m4c, l, r, b, t, n, f, coordinateSystem === 2000 ? -1 : 0);
        return writeMat4(this, m4c);
    }
}

// @air-element none:SRGBColorSpace — 引擎没有色彩空间枚举/常量（全仓无 srgb-linear 字符串），
// 该值是 Spark 依赖的协议字面量，原样保留。
export const SRGBColorSpace = 'srgb';

// @air-element none:LinearSRGBColorSpace — 同上：引擎无线性 srgb 色彩空间常量，协议字面量原样保留。
export const LinearSRGBColorSpace = 'srgb-linear';

// @air-element none:NoColorSpace — 同上：引擎无「无色空间」空串约定，协议字面量原样保留。
export const NoColorSpace = '';

// @air-element none:SRGBToLinear — 引擎 srgbToLinear 对 x<=0/x>=1 做端点钳制且使用 ((x+0.055)/1.055)^2.4 除法形式，
// 与 Three 的无钳制 reciprocal 乘法形式在超域/极值输入不等价，Spark 契约是后者，故自持。
export const SRGBToLinear = (c: number): number =>
    c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);

// @air-element none:LinearToSRGB — 同上：引擎 linearToSrgb 有 x<=0/x>=1 钳制，与 Three 的 0.41666 幂近似式不等价。
export const LinearToSRGB = (c: number): number => (c < 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 0.41666) - 0.055);

// @air-element none:ColorManagement — 引擎没有 Three 的 toWorkingColorSpace/fromWorkingColorSpace 转换管线
// （cc.Color 是 8bit 存储 + gfx 层色彩空间处理），此处保留 Spark 依赖的工作色空间开关协议。
export const ColorManagement = {
    enabled: true,
    workingColorSpace: LinearSRGBColorSpace,
    convert(c: Color, from: string, to: string): Color {
        if (!this.enabled || from === to || !from || !to) return c;
        if (from === SRGBColorSpace && to === LinearSRGBColorSpace) return c.convertSRGBToLinear();
        if (from === LinearSRGBColorSpace && to === SRGBColorSpace) return c.convertLinearToSRGB();
        throw new Error(`Unsupported color transform ${from} -> ${to}`);
    },
    toWorkingColorSpace(c: Color, from: string): Color {
        return this.convert(c, from, this.workingColorSpace);
    },
    fromWorkingColorSpace(c: Color, to: string): Color {
        return this.convert(c, this.workingColorSpace, to);
    },
};

const colorNames: Record<string, number> = {
    white: 0xffffff,
    black: 0x000000,
    red: 0xff0000,
    green: 0x008000,
    lime: 0x00ff00,
    blue: 0x0000ff,
    yellow: 0xffff00,
    cyan: 0x00ffff,
    aqua: 0x00ffff,
    magenta: 0xff00ff,
    fuchsia: 0xff00ff,
    gray: 0x808080,
    grey: 0x808080,
    orange: 0xffa500,
    purple: 0x800080,
    pink: 0xffc0cb,
    rebeccapurple: 0x663399,
};

// @air-element cc.Color
export class Color {
    public r = 1;
    public g = 1;
    public b = 1;
    public readonly isColor = true;

    constructor(r?: number, g?: number, b?: number) {
        if (r === undefined) return;
        if (g === undefined && b === undefined) this.set(r);
        else this.setRGB(r, g as number, b as number);
    }

    public set(v: number | string | Color, g?: number, b?: number): this {
        if (g !== undefined && b !== undefined) return this.setRGB(v as number, g, b);
        if ((v as Color)?.isColor) return this.copy(v as Color);
        if (typeof v === 'number') return this.setHex(v);
        if (typeof v === 'string') return this.setStyle(v);
        return this;
    }

    public setRGB(r: number, g: number, b: number, cs = LinearSRGBColorSpace): this {
        this.r = r;
        this.g = g;
        this.b = b;
        // 工作色空间转换就地修改同一实例（ColorManagement 返回的就是 this），保持 Three 的链式契约。
        ColorManagement.toWorkingColorSpace(this, cs);
        return this;
    }

    public setScalar(v: number): this {
        return this.setRGB(v, v, v);
    }

    /** 十六进制取字节委托 cc.Color.fromHEX（先 & 0xffffff，与 Three 的移位取字节完全等价）。 */
    public setHex(h: number, cs = SRGBColorSpace): this {
        CCColor.fromHEX(engineColor, Math.floor(h) & 0xffffff);
        return this.setRGB(engineColor.r / 255, engineColor.g / 255, engineColor.b / 255, cs);
    }

    /** CSS 颜色解析（引擎无 CSS 解析入口，命名色板是数据表；取到 hex 后仍委托 setHex/cc.Color）。 */
    public setStyle(s: string, cs = SRGBColorSpace): this {
        const style = s.toLowerCase().trim();
        const named = colorNames[style];
        if (named !== undefined) return this.setHex(named, cs);
        let normalized = style;
        if (/^#[\da-f]{3}$/i.test(normalized)) {
            normalized = `#${normalized
                .slice(1)
                .split('')
                .map((c) => c + c)
                .join('')}`;
        }
        if (/^#[\da-f]{6}$/i.test(normalized)) return this.setHex(parseInt(normalized.slice(1), 16), cs);
        const m = normalized.match(/^rgba?\(\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)\s*[, ]\s*([\d.]+)(%?)/);
        if (m) {
            return this.setRGB(
                Number(m[1]) / (m[2] ? 100 : 255),
                Number(m[3]) / (m[4] ? 100 : 255),
                Number(m[5]) / (m[6] ? 100 : 255),
                cs,
            );
        }
        throw new Error(`Unsupported CSS color: ${normalized}`);
    }

    /** HSL 合成：引擎只有 HSV（cc.Color.fromHSV），无 HSL 等价，故保留 Three 原式。 */
    public setHSL(h: number, s: number, l: number, cs = LinearSRGBColorSpace): this {
        h = ccRepeat(h, 1);
        s = ccClamp(s, 0, 1);
        l = ccClamp(l, 0, 1);
        const hue = (p: number, q: number, t: number) => {
            t = ccRepeat(t, 1);
            if (t < 1 / 6) return p + (q - p) * 6 * t;
            if (t < 1 / 2) return q;
            if (t < 2 / 3) return p + (q - p) * 6 * (2 / 3 - t);
            return p;
        };
        if (s === 0) return this.setRGB(l, l, l, cs);
        const q = l <= 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        return this.setRGB(hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3), cs);
    }

    public copy(c: Color): this {
        this.r = c.r;
        this.g = c.g;
        this.b = c.b;
        return this;
    }

    public clone(): Color {
        return new Color(this.r, this.g, this.b);
    }

    public add(c: Color): this {
        this.r += c.r;
        this.g += c.g;
        this.b += c.b;
        return this;
    }

    public addScalar(s: number): this {
        this.r += s;
        this.g += s;
        this.b += s;
        return this;
    }

    public multiply(c: Color): this {
        this.r *= c.r;
        this.g *= c.g;
        this.b *= c.b;
        return this;
    }

    public multiplyScalar(s: number): this {
        this.r *= s;
        this.g *= s;
        this.b *= s;
        return this;
    }

    /** 逐分量插值委托 cc.lerp（引擎 cc.Color.lerp 是 8bit 存储，不等价）。 */
    public lerp(c: Color, t: number): this {
        this.r = ccLerp(this.r, c.r, t);
        this.g = ccLerp(this.g, c.g, t);
        this.b = ccLerp(this.b, c.b, t);
        return this;
    }

    public lerpColors(a: Color, b: Color, t: number): this {
        return this.copy(a).lerp(b, t);
    }

    public equals(c: Color): boolean {
        return this.r === c.r && this.g === c.g && this.b === c.b;
    }

    public fromArray(a: ArrayLike<number>, o = 0): this {
        this.r = a[o];
        this.g = a[o + 1];
        this.b = a[o + 2];
        return this;
    }

    public toArray(a: number[] = [], o = 0): number[] {
        a[o] = this.r;
        a[o + 1] = this.g;
        a[o + 2] = this.b;
        return a;
    }

    public copySRGBToLinear(c: Color): this {
        this.r = SRGBToLinear(c.r);
        this.g = SRGBToLinear(c.g);
        this.b = SRGBToLinear(c.b);
        return this;
    }

    public convertSRGBToLinear(): this {
        return this.copySRGBToLinear(this);
    }

    public copyLinearToSRGB(c: Color): this {
        this.r = LinearToSRGB(c.r);
        this.g = LinearToSRGB(c.g);
        this.b = LinearToSRGB(c.b);
        return this;
    }

    public convertLinearToSRGB(): this {
        return this.copyLinearToSRGB(this);
    }

    public getRGB(target: Color, cs = LinearSRGBColorSpace): Color {
        const c = ColorManagement.fromWorkingColorSpace(this.clone(), cs);
        target.r = c.r;
        target.g = c.g;
        target.b = c.b;
        return target;
    }

    public getHex(cs = SRGBColorSpace): number {
        const c = ColorManagement.fromWorkingColorSpace(this.clone(), cs);
        return (
            (Math.round(ccClamp(c.r, 0, 1) * 255) << 16) ^
            (Math.round(ccClamp(c.g, 0, 1) * 255) << 8) ^
            Math.round(ccClamp(c.b, 0, 1) * 255)
        );
    }

    public getHexString(cs = SRGBColorSpace): string {
        return this.getHex(cs).toString(16).padStart(6, '0');
    }

    public *[Symbol.iterator](): IterableIterator<number> {
        yield this.r;
        yield this.g;
        yield this.b;
    }
}

// @air-element cc.AABB
export class Box3 {
    public min: Vector3;
    public max: Vector3;
    public readonly isBox3 = true;

    constructor(min = new Vector3(Infinity, Infinity, Infinity), max = new Vector3(-Infinity, -Infinity, -Infinity)) {
        this.min = min;
        this.max = max;
    }

    public set(min: Vector3, max: Vector3): this {
        this.min.copy(min);
        this.max.copy(max);
        return this;
    }

    public copy(b: Box3): this {
        return this.set(b.min, b.max);
    }

    public clone(): Box3 {
        return new Box3().copy(this);
    }

    public makeEmpty(): this {
        this.min.setScalar(Infinity);
        this.max.setScalar(-Infinity);
        return this;
    }

    /** min/max 命名面上的空盒判定（引擎 AABB 无「空盒」概念，故属于命名适配而非算法）。 */
    public isEmpty(): boolean {
        return this.max.x < this.min.x || this.max.y < this.min.y || this.max.z < this.min.z;
    }

    public expandByPoint(p: Vector3): this {
        CCVec3.min(this.min, this.min, p);
        CCVec3.max(this.max, this.max, p);
        return this;
    }

    public expandByVector(v: Vector3): this {
        CCVec3.subtract(this.min, this.min, v);
        CCVec3.add(this.max, this.max, v);
        return this;
    }

    public expandByScalar(s: number): this {
        CCVec3.set(v3a, s, s, s);
        CCVec3.subtract(this.min, this.min, v3a);
        CCVec3.set(v3a, s, s, s);
        CCVec3.add(this.max, this.max, v3a);
        return this;
    }

    public setFromPoints(p: Iterable<Vector3>): this {
        // 几何比较本身委托 cc.Vec3.min/max（见 expandByPoint），此处只保留点列表的遍历。
        this.makeEmpty();
        Array.from(p).forEach((v) => this.expandByPoint(v));
        return this;
    }

    public setFromCenterAndSize(c: Vector3, s: Vector3): this {
        const h = new Vector3().copy(s).multiplyScalar(0.5);
        return this.set(new Vector3().copy(c).sub(h), new Vector3().copy(c).add(h));
    }

    public getCenter(t: Vector3): Vector3 {
        if (this.isEmpty()) return t.set(0, 0, 0);
        CCVec3.add(t, this.min, this.max);
        return t.multiplyScalar(0.5);
    }

    public getSize(t: Vector3): Vector3 {
        if (this.isEmpty()) return t.set(0, 0, 0);
        CCVec3.subtract(t, this.max, this.min);
        return t;
    }

    /** 点包含：引擎 cc.geometry 无「点在 AABB 内」公共 API（只有形状间相交检测），属命名面比较。 */
    public containsPoint(p: Vector3): boolean {
        return (
            p.x >= this.min.x &&
            p.x <= this.max.x &&
            p.y >= this.min.y &&
            p.y <= this.max.y &&
            p.z >= this.min.z &&
            p.z <= this.max.z
        );
    }

    /** 盒-盒相交委托 cc.geometry.intersect 的 AABB-AABB 检测；空盒先短路（AABB 无法表达 ±Infinity）。 */
    public intersectsBox(b: Box3): boolean {
        if (this.isEmpty() || b.isEmpty()) return false;
        return aabbAabbTest(readAABB(aabbA, this), readAABB(aabbB, b));
    }

    /** 钳制点委托 cc.geometry.distance.pt_point_aabb；空盒时按 Three 语义得到 min 角点。 */
    public clampPoint(p: Vector3, t: Vector3): Vector3 {
        if (this.isEmpty()) return t.copy(this.min);
        // pt_point_aabb 的两个向量参数是引擎具体 Vec3 类型，故先镜像进引擎暂存再回写。
        CCVec3.set(v3a, p.x, p.y, p.z);
        pt_point_aabb(v3a, v3a, readAABB(aabbA, this));
        return t.set(v3a.x, v3a.y, v3a.z);
    }

    public distanceToPoint(p: Vector3): number {
        if (this.isEmpty()) return Infinity;
        return CCVec3.distance(this.clampPoint(p, new Vector3()), p);
    }

    public union(b: Box3): this {
        CCVec3.min(this.min, this.min, b.min);
        CCVec3.max(this.max, this.max, b.max);
        return this;
    }

    public intersect(b: Box3): this {
        CCVec3.max(this.min, this.min, b.min);
        CCVec3.min(this.max, this.max, b.max);
        return this.isEmpty() ? this.makeEmpty() : this;
    }

    public translate(v: Vector3): this {
        CCVec3.add(this.min, this.min, v);
        CCVec3.add(this.max, this.max, v);
        return this;
    }

    public equals(b: Box3): boolean {
        return CCVec3.strictEquals(this.min, b.min) && CCVec3.strictEquals(this.max, b.max);
    }

    /** 委托 cc.geometry.AABB.transform（极值点法，仿射矩阵下与 Three 的八顶点展开同解）。 */
    public applyMatrix4(m: Matrix4): this {
        if (this.isEmpty()) return this;
        AABB.transform(aabbA, readAABB(aabbB, this), readMat4(m4a, m));
        return writeBox3(this, aabbA);
    }
}

// @air-element cc.Ray
export class Ray {
    public origin: Vector3;
    public direction: Vector3;

    constructor(origin = new Vector3(), direction = new Vector3(0, 0, -1)) {
        this.origin = origin;
        this.direction = direction;
    }

    public set(o: Vector3, d: Vector3): this {
        this.origin.copy(o);
        this.direction.copy(d);
        return this;
    }

    public copy(r: Ray): this {
        return this.set(r.origin, r.direction);
    }

    public clone(): Ray {
        return new Ray().copy(this);
    }

    /** 委托 cc.Vec3.scaleAndAdd（Three 的 at 假设 direction 已归一，与引擎 Ray.computeHit 的归一化不同，故用原语）。 */
    public at(t: number, target: Vector3): Vector3 {
        CCVec3.scaleAndAdd(target, this.origin, this.direction, t);
        return target;
    }

    public lookAt(v: Vector3): this {
        CCVec3.subtract(this.direction, v, this.origin);
        CCVec3.normalize(this.direction, this.direction);
        return this;
    }

    public recast(t: number): this {
        CCVec3.scaleAndAdd(this.origin, this.origin, this.direction, t);
        return this;
    }

    public closestPointToPoint(p: Vector3, t: Vector3): Vector3 {
        CCVec3.subtract(v3a, p, this.origin);
        return this.at(Math.max(0, CCVec3.dot(v3a, this.direction)), t);
    }

    public distanceSqToPoint(p: Vector3): number {
        return CCVec3.squaredDistance(this.closestPointToPoint(p, new Vector3()), p);
    }

    public distanceToPoint(p: Vector3): number {
        return CCVec3.distance(this.closestPointToPoint(p, new Vector3()), p);
    }

    /** 起点是否恰落在盒子某个面上（用于补引擎 ray-AABB 在 entry===0 时的返回语义）。 */
    private _originOnBoxFace(b: Box3): boolean {
        const o = this.origin;
        return (
            o.x === b.min.x ||
            o.x === b.max.x ||
            o.y === b.min.y ||
            o.y === b.max.y ||
            o.z === b.min.z ||
            o.z === b.max.z
        );
    }

    /**
     * 委托 cc.geometry.intersect 的 ray-AABB slab（引擎返回距离而非布尔）。
     * 补两处契约空隙：空盒无法表达为 AABB；方向分量为 0 时引擎以 1/d 计算会得 ±Infinity/NaN，
     * 用 Number.EPSILON 摄动等价于 Three 的 ±Infinity 分支。
     */
    public intersectBox(b: Box3, t: Vector3): Vector3 | null {
        if (b.isEmpty()) return null;
        CCVec3.copy(engineRay.o, this.origin);
        CCVec3.copy(engineRay.d, this.direction);
        if (engineRay.d.x === 0) engineRay.d.x = Number.EPSILON;
        if (engineRay.d.y === 0) engineRay.d.y = Number.EPSILON;
        if (engineRay.d.z === 0) engineRay.d.z = Number.EPSILON;
        const hit = rayAabbTest(engineRay, readAABB(aabbA, b));
        if (!hit) return null;
        if (this.containsOriginInside(b) && this._originOnBoxFace(b)) return t.copy(this.origin);
        return this.at(hit, t);
    }

    /** 引擎命中距离为 0 才判空；起点在盒内时 Three 仍认为相交。 */
    public containsOriginInside(b: Box3): boolean {
        return b.containsPoint(this.origin);
    }

    public intersectsBox(b: Box3): boolean {
        return this.intersectBox(b, new Vector3()) !== null;
    }

    public applyMatrix4(m: Matrix4): this {
        this.origin.applyMatrix4(m);
        this.direction.transformDirection(m);
        return this;
    }

    public equals(r: Ray): boolean {
        return CCVec3.strictEquals(this.origin, r.origin) && CCVec3.strictEquals(this.direction, r.direction);
    }
}

// @air-element cc.math
export const MathUtils = {
    clamp: ccClamp,
    degToRad: ccToRadian,
    radToDeg: ccToDegree,
    lerp: ccLerp,
    euclideanModulo: ccRepeat,
    /** mapLinear 由 cc.inverseLerp 组合：c + inverseLerp(a, b, x) * (d - c)。 */
    mapLinear: (x: number, a: number, b: number, c: number, d: number): number => c + ccInverseLerp(a, b, x) * (d - c),
    /** 引擎无 smoothstep 静态（core/math/utils 未提供），保留 Three 的 3t²-2t³ 标量式。 */
    smoothstep: (x: number, a: number, b: number): number => {
        const t = ccClamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    },
    isPowerOfTwo: (v: number): boolean => v !== 0 && ccNextPow2(v) === v,
    ceilPowerOfTwo: (v: number): number => ccNextPow2(v),
    /** floorPowerOfTwo 由 cc.nextPow2 组合：已是 2 的幂则原值，否则降一档。 */
    floorPowerOfTwo: (v: number): number => {
        const n = ccNextPow2(v);
        return n === v ? n : n / 2;
    },
    /** 引擎无 UUID 生成器；浏览器有 crypto.randomUUID 时用之，否则退回时间戳 + cc.random。 */
    generateUUID: (): string => {
        const c =
            typeof crypto === 'undefined' ? undefined : (crypto as Crypto & { randomUUID?: () => string }).randomUUID;
        if (typeof c === 'function') return c.call(crypto);
        return `air-${Date.now().toString(16)}-${ccRandom().toString(16).slice(2)}`;
    },
};
