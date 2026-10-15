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
export declare const clamp: (value: number, min: number, max: number) => number;
export declare class Vector2 {
    x: number;
    y: number;
    readonly isVector2 = true;
    constructor(x?: number, y?: number);
    get width(): number;
    set width(v: number);
    get height(): number;
    set height(v: number);
    set(x: number, y: number): this;
    setScalar(s: number): this;
    setComponent(i: number, v: number): this;
    getComponent(i: number): number;
    setX(v: number): this;
    setY(v: number): this;
    clone(): Vector2;
    copy(v: Vector2): this;
    add(v: Vector2): this;
    sub(v: Vector2): this;
    multiply(v: Vector2): this;
    divide(v: Vector2): this;
    addScalar(v: number): this;
    subScalar(v: number): this;
    multiplyScalar(v: number): this;
    divideScalar(v: number): this;
    addVectors(a: Vector2, b: Vector2): this;
    subVectors(a: Vector2, b: Vector2): this;
    multiplyVectors(a: Vector2, b: Vector2): this;
    addScaledVector(v: Vector2, s: number): this;
    dot(v: Vector2): number;
    lengthSq(): number;
    length(): number;
    /** 引擎无 Manhattan 长度静态，这里是两分量的绝对值求和（标量映射，见文件头第 8 条）。 */
    manhattanLength(): number;
    normalize(): this;
    setLength(v: number): this;
    distanceToSquared(v: Vector2): number;
    distanceTo(v: Vector2): number;
    /** 同上：两分量绝对差求和（标量映射）。 */
    manhattanDistanceTo(v: Vector2): number;
    negate(): this;
    min(v: Vector2): this;
    max(v: Vector2): this;
    clamp(a: Vector2, b: Vector2): this;
    clampScalar(a: number, b: number): this;
    clampLength(a: number, b: number): this;
    lerp(v: Vector2, t: number): this;
    lerpVectors(a: Vector2, b: Vector2, t: number): this;
    floor(): this;
    ceil(): this;
    round(): this;
    /** 引擎无 Vec2.trunc 静态：逐分量 Math.trunc（标量映射）。 */
    roundToZero(): this;
    equals(v: Vector2): boolean;
    fromArray(a: ArrayLike<number>, o?: number): this;
    toArray(a?: number[], o?: number): number[];
    /** 从 BufferAttribute 取值是数据源索引（非算法），保留 Three 的 itemSize 寻址。 */
    fromBufferAttribute(a: IBindableAttribute, i: number): this;
    random(): this;
    [Symbol.iterator](): IterableIterator<number>;
    /** 2D 叉积是标量；引擎 cc.Vec2.cross 产出 3D 向量，语义不同，故保留 Three 的标量式。 */
    cross(v: Vector2): number;
    /** 自身辐角（[0, 2π) 约定）；引擎 cc.Vec2.angle 是「两向量夹角」，语义不同，故保留原式。 */
    angle(): number;
    /** 委托 cc.Vec2.angle；零向量按 Three 契约补 π/2（引擎返回 0）。 */
    angleTo(v: Vector2): number;
    /** 引擎无 2D 绕点旋转原语（cc.Vec2.rotate 不存在），保留 Three 的原式。 */
    rotateAround(c: Vector2, a: number): this;
    applyMatrix3(m: Matrix3): this;
}
export declare class Vector3 {
    x: number;
    y: number;
    z: number;
    readonly isVector3 = true;
    constructor(x?: number, y?: number, z?: number);
    set(x: number, y: number, z: number): this;
    setScalar(s: number): this;
    setComponent(i: number, v: number): this;
    getComponent(i: number): number;
    setX(v: number): this;
    setY(v: number): this;
    setZ(v: number): this;
    clone(): Vector3;
    copy(v: Vector3): this;
    add(v: Vector3): this;
    sub(v: Vector3): this;
    multiply(v: Vector3): this;
    divide(v: Vector3): this;
    addScalar(v: number): this;
    subScalar(v: number): this;
    multiplyScalar(v: number): this;
    divideScalar(v: number): this;
    addVectors(a: Vector3, b: Vector3): this;
    subVectors(a: Vector3, b: Vector3): this;
    multiplyVectors(a: Vector3, b: Vector3): this;
    addScaledVector(v: Vector3, s: number): this;
    dot(v: Vector3): number;
    lengthSq(): number;
    length(): number;
    /** 三分量绝对值求和（标量映射，见文件头第 8 条）。 */
    manhattanLength(): number;
    normalize(): this;
    setLength(v: number): this;
    distanceToSquared(v: Vector3): number;
    distanceTo(v: Vector3): number;
    /** 三分量绝对差求和（标量映射）。 */
    manhattanDistanceTo(v: Vector3): number;
    negate(): this;
    min(v: Vector3): this;
    max(v: Vector3): this;
    clamp(a: Vector3, b: Vector3): this;
    clampScalar(a: number, b: number): this;
    clampLength(a: number, b: number): this;
    lerp(v: Vector3, t: number): this;
    lerpVectors(a: Vector3, b: Vector3, t: number): this;
    floor(): this;
    ceil(): this;
    round(): this;
    /** 引擎无 Vec3.trunc 静态：逐分量 Math.trunc（标量映射）。 */
    roundToZero(): this;
    equals(v: Vector3): boolean;
    fromArray(a: ArrayLike<number>, o?: number): this;
    toArray(a?: number[], o?: number): number[];
    fromBufferAttribute(a: IBindableAttribute, i: number): this;
    /** 引擎 cc.Vec3.random 产出随机单位向量，与 Three 的逐分量 [0,1) 不同，故用 cc.random。 */
    random(): this;
    [Symbol.iterator](): IterableIterator<number>;
    cross(v: Vector3): this;
    crossVectors(a: Vector3, b: Vector3): this;
    applyMatrix3(m: Matrix3): this;
    applyMatrix4(m: Matrix4): this;
    applyNormalMatrix(m: Matrix3): this;
    applyQuaternion(q: Quaternion): this;
    applyEuler(e: Euler): this;
    applyAxisAngle(axis: Vector3, a: number): this;
    /** 方向变换：cc.Vec3.transformMat4Normal 在仿射矩阵下不除 rhw（m03/m07/m11 为 0），与 Three 一致。 */
    transformDirection(m: Matrix4): this;
    project(c: ICameraMatrices): this;
    unproject(c: ICameraMatrices): this;
    setFromMatrixPosition(m: Matrix4): this;
    setFromMatrixColumn(m: Matrix4, i: number): this;
    setFromMatrix3Column(m: Matrix3, i: number): this;
    /** Three 的 setFromMatrixScale 取列向量模长（不含反射取负），故用 cc.Vec3.len 而非 cc.Mat4.getScaling。 */
    setFromMatrixScale(m: Matrix4): this;
    /** 球坐标转直角坐标：引擎无对应静态（cc.geometry 只有形状检测），保留 Three 原式。 */
    setFromSphericalCoords(r: number, phi: number, theta: number): this;
    setFromCylindricalCoords(r: number, theta: number, y: number): this;
    /** 委托 cc.Vec3.angle；零向量按 Three 契约补 π/2（引擎返回 0）。 */
    angleTo(v: Vector3): number;
    /** 委托 cc.Vec3.project（引擎退化阈值 1e-6，Three 为 === 0，见文件头第 7 条）。 */
    projectOnVector(v: Vector3): this;
    projectOnPlane(v: Vector3): this;
    reflect(n: Vector3): this;
}
export declare class Vector4 {
    x: number;
    y: number;
    z: number;
    w: number;
    readonly isVector4 = true;
    constructor(x?: number, y?: number, z?: number, w?: number);
    get width(): number;
    set width(v: number);
    get height(): number;
    set height(v: number);
    set(x: number, y: number, z: number, w: number): this;
    setScalar(s: number): this;
    setComponent(i: number, v: number): this;
    getComponent(i: number): number;
    setX(v: number): this;
    setY(v: number): this;
    setZ(v: number): this;
    setW(v: number): this;
    clone(): Vector4;
    /** Three 允许从三分量对象拷贝并把 w 补 1，引擎 cc.Vec4.copy 要求 w 存在，故显式映射。 */
    copy(v: {
        x: number;
        y: number;
        z: number;
        w?: number;
    }): this;
    add(v: Vector4): this;
    sub(v: Vector4): this;
    multiply(v: Vector4): this;
    divide(v: Vector4): this;
    addScalar(v: number): this;
    subScalar(v: number): this;
    multiplyScalar(v: number): this;
    divideScalar(v: number): this;
    addVectors(a: Vector4, b: Vector4): this;
    subVectors(a: Vector4, b: Vector4): this;
    multiplyVectors(a: Vector4, b: Vector4): this;
    addScaledVector(v: Vector4, s: number): this;
    dot(v: Vector4): number;
    lengthSq(): number;
    length(): number;
    /** 四分量绝对值求和（标量映射）。 */
    manhattanLength(): number;
    normalize(): this;
    setLength(v: number): this;
    distanceToSquared(v: Vector4): number;
    distanceTo(v: Vector4): number;
    /** 四分量绝对差求和（标量映射）。 */
    manhattanDistanceTo(v: Vector4): number;
    negate(): this;
    min(v: Vector4): this;
    max(v: Vector4): this;
    clamp(a: Vector4, b: Vector4): this;
    clampScalar(a: number, b: number): this;
    clampLength(a: number, b: number): this;
    lerp(v: Vector4, t: number): this;
    lerpVectors(a: Vector4, b: Vector4, t: number): this;
    floor(): this;
    ceil(): this;
    round(): this;
    /** 引擎无 Vec4.trunc 静态：逐分量 Math.trunc（标量映射）。 */
    roundToZero(): this;
    equals(v: Vector4): boolean;
    fromArray(a: ArrayLike<number>, o?: number): this;
    toArray(a?: number[], o?: number): number[];
    fromBufferAttribute(a: IBindableAttribute, i: number): this;
    random(): this;
    [Symbol.iterator](): IterableIterator<number>;
    applyMatrix4(m: Matrix4): this;
    /** 委托 cc.Quat.getAxisAngle（引擎对 s===0 回退 (1,0,0)，与 Three 的 s<1e-4 阈值等价语义）。 */
    setAxisAngleFromQuaternion(q: Quaternion): this;
}
export declare class Quaternion {
    private _x;
    private _y;
    private _z;
    private _w;
    readonly isQuaternion = true;
    private _onChangeCallback;
    constructor(x?: number, y?: number, z?: number, w?: number);
    get x(): number;
    set x(v: number);
    get y(): number;
    set y(v: number);
    get z(): number;
    set z(v: number);
    get w(): number;
    set w(v: number);
    set(x: number, y: number, z: number, w: number): this;
    identity(): this;
    copy(q: Quaternion): this;
    clone(): Quaternion;
    _onChange(f: () => void): this;
    /**
     * Closed-form products of intrinsic axis rotations. Keep each triple product
     * left-associated so conversion to the eventual GPU float32 is predictable.
     * 引擎 cc.Quat.fromEuler 是「角度制 + 固定 YXZ 序」，无法覆盖 Three 的弧度六序契约，故保留原式。
     */
    setFromEuler(e: Euler, update?: boolean): this;
    setFromAxisAngle(a: Vector3, t: number): this;
    /**
     * 委托 cc.Mat3.fromMat4（降阶取左上 3x3）+ cc.Quat.fromMat3。
     * 引擎按「四分量中最大者取正」分支、Three 先判 trace>0，两个分支同解；同一旋转矩阵下
     * 二者可能给出整体差一个符号的四元数（q 与 -q 表示同一旋转，均为合法结果）。
     */
    setFromRotationMatrix(m: Matrix4): this;
    /** 委托 cc.Quat.rotationTo；反平行时引擎换轴方式与 Three 不同（同为合法 180° 旋转）。 */
    setFromUnitVectors(a: Vector3, b: Vector3): this;
    multiply(q: Quaternion): this;
    premultiply(q: Quaternion): this;
    multiplyQuaternions(a: Quaternion, b: Quaternion): this;
    dot(q: Quaternion): number;
    lengthSq(): number;
    length(): number;
    /** 引擎在零四元数上置 (0,0,0,0)，Three 契约是回单位元，故补长度守卫。 */
    normalize(): this;
    conjugate(): this;
    /** Three 的 invert 即共轭（cc.Quat.invert 会除以长度平方，语义不同）。 */
    invert(): this;
    angleTo(q: Quaternion): number;
    /** 委托 cc.Quat.rotateTowards：入参是角度制（step 弧度换算），且夹角 0 时按 Three 原地返回。 */
    rotateTowards(q: Quaternion, step: number): this;
    slerp(q: Quaternion, t: number): this;
    slerpQuaternions(a: Quaternion, b: Quaternion, t: number): this;
    equals(q: Quaternion): boolean;
    fromArray(a: ArrayLike<number>, o?: number): this;
    toArray(a?: number[], o?: number): number[];
    [Symbol.iterator](): IterableIterator<number>;
}
export declare class Euler {
    private _x;
    private _y;
    private _z;
    private _order;
    readonly isEuler = true;
    private _onChangeCallback;
    constructor(x?: number, y?: number, z?: number, order?: string);
    get x(): number;
    set x(v: number);
    get y(): number;
    set y(v: number);
    get z(): number;
    set z(v: number);
    get order(): string;
    set order(v: string);
    set(x: number, y: number, z: number, o?: string): this;
    copy(e: Euler): this;
    clone(): Euler;
    _onChange(f: () => void): this;
    setFromRotationMatrix(m: Matrix4, o?: string, update?: boolean): this;
    setFromQuaternion(q: Quaternion, o?: string, update?: boolean): this;
    setFromVector3(v: Vector3, o?: string): this;
    reorder(o: string): this;
    equals(e: Euler): boolean;
    fromArray(a: ArrayLike<unknown>): this;
    toArray(a?: unknown[], o?: number): unknown[];
}
/**
 * 只承载「列主序 elements 数组」的读写映射，不含算法：
 * Matrix2/3/4 的 set/identity/copy/fromArray/toArray/equals 全是 Three 行主序入参与列主序存储之间的索引映射。
 */
declare class MatrixStorage {
    protected readonly _n: number;
    elements: number[];
    constructor(n: number);
    set(...v: number[]): this;
    identity(): this;
    copy(m: MatrixStorage): this;
    fromArray(a: ArrayLike<number>, o?: number): this;
    toArray(a?: number[], o?: number): number[];
    equals(m: MatrixStorage): boolean;
}
export declare class Matrix2 extends MatrixStorage {
    readonly isMatrix2 = true;
    constructor(...v: number[]);
    clone(): Matrix2;
    multiply(m: Matrix2): this;
    premultiply(m: Matrix2): this;
    multiplyMatrices(a: Matrix2, b: Matrix2): this;
    multiplyScalar(s: number): this;
    determinant(): number;
    /** 2x2 伴随矩阵求逆（列主序存储：e0=m00,e1=m10,e2=m01,e3=m11）；奇异时与 Three 同样写零矩阵。 */
    invert(): this;
    transpose(): this;
}
export declare class Matrix3 extends MatrixStorage {
    readonly isMatrix3 = true;
    constructor(...v: number[]);
    clone(): Matrix3;
    setFromMatrix4(m: Matrix4): this;
    /** 委托 cc.Mat3.inverseTransposeMat4；引擎在奇异输入上返回 null（Three 无此返回），此时按零矩阵处理。 */
    getNormalMatrix(m: Matrix4): this;
    multiply(m: Matrix3): this;
    premultiply(m: Matrix3): this;
    multiplyMatrices(a: Matrix3, b: Matrix3): this;
    multiplyScalar(s: number): this;
    determinant(): number;
    /** 引擎 cc.Mat3.invert 与 Three 一致：奇异矩阵写零矩阵（mat3.ts:158 的 Mat3.set(out, 0...)）。 */
    invert(): this;
    transpose(): this;
    extractBasis(x: Vector3, y: Vector3, z: Vector3): this;
    /** 转置写入外部数组：复用引擎 cc.Mat3.transpose 的镜像结果再按列主序导出，不另写 3x3 展开循环。 */
    transposeIntoArray(a: number[]): this;
    /**
     * UV 变换：引擎 cc.Mat3 有 fromScaling/fromRotation/fromTranslation 三个基元，
     * 但没有 Three 的七参数合成入口，故保留 Three 的列主序写入（纯字段映射，无算法主体）。
     */
    setUvTransform(tx: number, ty: number, sx: number, sy: number, r: number, cx: number, cy: number): this;
}
export declare class Matrix4 extends MatrixStorage {
    readonly isMatrix4 = true;
    constructor(...v: number[]);
    clone(): Matrix4;
    copyPosition(m: Matrix4): this;
    /**
     * 引擎 cc.Mat4 没有 fromMat3 静态（cc.Mat3 与 cc.Mat4 之间只有 Mat3.fromMat4 降阶方向），
     * 因此这里按 Three 契约做纯索引升阶（3x3 列主序 → 4x4 列主序 + 单位齐次行/列），无算法主体。
     */
    setFromMatrix3(m: Matrix3): this;
    setPosition(x: number | Vector3, y?: number, z?: number): this;
    makeTranslation(x: number | Vector3, y?: number, z?: number): this;
    makeScale(x: number, y: number, z: number): this;
    makeRotationX(t: number): this;
    makeRotationY(t: number): this;
    makeRotationZ(t: number): this;
    /** 委托 cc.Mat4.identity + cc.Mat4.rotate（绕任意轴）；退化轴（长度 0）引擎返回 null，此处保持单位阵。 */
    makeRotationAxis(axis: Vector3, t: number): this;
    /** 委托 cc.Mat4.fromQuat（平移列写 0、齐次位写 1，与 Three 的纯旋转阵逐一对应）。 */
    makeRotationFromQuaternion(q: Quaternion): this;
    makeRotationFromEuler(e: Euler): this;
    makeBasis(x: Vector3, y: Vector3, z: Vector3): this;
    extractBasis(x: Vector3, y: Vector3, z: Vector3): this;
    /** 逐列取 cc.Vec3.normalize 后重建基（与 Three 原文一致，标准化本身委托引擎）。 */
    extractRotation(m: Matrix4): this;
    /** 委托 cc.Mat4.fromSRT（`(out, q, v, s)` 即 Three 的 S→R→T 次序，16 个字段逐一同解）。 */
    compose(p: Vector3, q: Quaternion, s: Vector3): this;
    /** 委托 cc.Mat4.toSRT；缩放分量为 0 时引擎给单位四元数（Three 原式给 NaN），见文件头第 7 条。 */
    decompose(p: Vector3, q: Quaternion, s: Vector3): this;
    scale(s: Vector3): this;
    /** 逐列模长取最大（用 cc.Vec3.len，不用 cc.Mat4.getScaling：后者在反射时把 x 取负）。 */
    getMaxScaleOnAxis(): number;
    multiply(m: Matrix4): this;
    premultiply(m: Matrix4): this;
    /** 委托 cc.Mat4.multiply（同为列主序 4x4 相乘，16 个字段逐一同解）。 */
    multiplyMatrices(a: Matrix4, b: Matrix4): this;
    multiplyScalar(s: number): this;
    determinant(): number;
    /** 委托 cc.Mat4.invert（奇异时引擎与本层契约同样写零矩阵）。 */
    invert(): this;
    transpose(): this;
    /**
     * 委托 cc.Mat4.lookAt 取基，再按 Three 的 Matrix4.lookAt 契约做列主序映射：
     * cc.Mat4.lookAt（gl-matrix 血统）产出「视图基」——3x3 是 Three 世界基的转置，并把 -(基·eye) 写进平移列；
     * Three 的 Matrix4.lookAt 只写世界基的 3x3，不改动平移/齐次列（保持构造时的单位阵）。
     * 正常输入用 CCMat4.transpose 把视图基转成世界基（3x3 转置把 cc 的平移搬进 m03/m07/m11，置零即还原
     * Three 的单位齐次列，纯引擎静态 + 逐字段映射，无自建算法主体）；
     * 退化输入（视线长度 0 或与 up 平行，引擎产出 NaN）按 Three 原文用 cc.Vec3 原语重建世界基。见文件头第 7 条。
     */
    lookAt(eye: Vector3, target: Vector3, up: Vector3): this;
    /**
     * 委托 cc.Mat4.frustum（同为 -1..1 深度约定，逐字段等价）；
     * far === Infinity 与 coordinateSystem === 2001（WebGPU 0..1）两分支引擎无对应静态，
     * 按 Three 原式做列主序字段写入（纯映射）。
     */
    makePerspective(l: number, r: number, t: number, b: number, n: number, f: number, coordinateSystem?: number): this;
    /** 委托 cc.Mat4.ortho，Three 的 coordinateSystem 直接映射到引擎的 minClipZ 参数。 */
    makeOrthographic(l: number, r: number, t: number, b: number, n: number, f: number, coordinateSystem?: number): this;
}
export declare const SRGBColorSpace = "srgb";
export declare const LinearSRGBColorSpace = "srgb-linear";
export declare const NoColorSpace = "";
export declare const SRGBToLinear: (c: number) => number;
export declare const LinearToSRGB: (c: number) => number;
export declare const ColorManagement: {
    enabled: boolean;
    workingColorSpace: string;
    convert(c: Color, from: string, to: string): Color;
    toWorkingColorSpace(c: Color, from: string): Color;
    fromWorkingColorSpace(c: Color, to: string): Color;
};
export declare class Color {
    r: number;
    g: number;
    b: number;
    readonly isColor = true;
    constructor(r?: number, g?: number, b?: number);
    set(v: number | string | Color, g?: number, b?: number): this;
    setRGB(r: number, g: number, b: number, cs?: string): this;
    setScalar(v: number): this;
    /** 十六进制取字节委托 cc.Color.fromHEX（先 & 0xffffff，与 Three 的移位取字节完全等价）。 */
    setHex(h: number, cs?: string): this;
    /** CSS 颜色解析（引擎无 CSS 解析入口，命名色板是数据表；取到 hex 后仍委托 setHex/cc.Color）。 */
    setStyle(s: string, cs?: string): this;
    /** HSL 合成：引擎只有 HSV（cc.Color.fromHSV），无 HSL 等价，故保留 Three 原式。 */
    setHSL(h: number, s: number, l: number, cs?: string): this;
    copy(c: Color): this;
    clone(): Color;
    add(c: Color): this;
    addScalar(s: number): this;
    multiply(c: Color): this;
    multiplyScalar(s: number): this;
    /** 逐分量插值委托 cc.lerp（引擎 cc.Color.lerp 是 8bit 存储，不等价）。 */
    lerp(c: Color, t: number): this;
    lerpColors(a: Color, b: Color, t: number): this;
    equals(c: Color): boolean;
    fromArray(a: ArrayLike<number>, o?: number): this;
    toArray(a?: number[], o?: number): number[];
    copySRGBToLinear(c: Color): this;
    convertSRGBToLinear(): this;
    copyLinearToSRGB(c: Color): this;
    convertLinearToSRGB(): this;
    getRGB(target: Color, cs?: string): Color;
    getHex(cs?: string): number;
    getHexString(cs?: string): string;
    [Symbol.iterator](): IterableIterator<number>;
}
export declare class Box3 {
    min: Vector3;
    max: Vector3;
    readonly isBox3 = true;
    constructor(min?: Vector3, max?: Vector3);
    set(min: Vector3, max: Vector3): this;
    copy(b: Box3): this;
    clone(): Box3;
    makeEmpty(): this;
    /** min/max 命名面上的空盒判定（引擎 AABB 无「空盒」概念，故属于命名适配而非算法）。 */
    isEmpty(): boolean;
    expandByPoint(p: Vector3): this;
    expandByVector(v: Vector3): this;
    expandByScalar(s: number): this;
    setFromPoints(p: Iterable<Vector3>): this;
    setFromCenterAndSize(c: Vector3, s: Vector3): this;
    getCenter(t: Vector3): Vector3;
    getSize(t: Vector3): Vector3;
    /** 点包含：引擎 cc.geometry 无「点在 AABB 内」公共 API（只有形状间相交检测），属命名面比较。 */
    containsPoint(p: Vector3): boolean;
    /** 盒-盒相交委托 cc.geometry.intersect 的 AABB-AABB 检测；空盒先短路（AABB 无法表达 ±Infinity）。 */
    intersectsBox(b: Box3): boolean;
    /** 钳制点委托 cc.geometry.distance.pt_point_aabb；空盒时按 Three 语义得到 min 角点。 */
    clampPoint(p: Vector3, t: Vector3): Vector3;
    distanceToPoint(p: Vector3): number;
    union(b: Box3): this;
    intersect(b: Box3): this;
    translate(v: Vector3): this;
    equals(b: Box3): boolean;
    /** 委托 cc.geometry.AABB.transform（极值点法，仿射矩阵下与 Three 的八顶点展开同解）。 */
    applyMatrix4(m: Matrix4): this;
}
export declare class Ray {
    origin: Vector3;
    direction: Vector3;
    constructor(origin?: Vector3, direction?: Vector3);
    set(o: Vector3, d: Vector3): this;
    copy(r: Ray): this;
    clone(): Ray;
    /** 委托 cc.Vec3.scaleAndAdd（Three 的 at 假设 direction 已归一，与引擎 Ray.computeHit 的归一化不同，故用原语）。 */
    at(t: number, target: Vector3): Vector3;
    lookAt(v: Vector3): this;
    recast(t: number): this;
    closestPointToPoint(p: Vector3, t: Vector3): Vector3;
    distanceSqToPoint(p: Vector3): number;
    distanceToPoint(p: Vector3): number;
    /** 起点是否恰落在盒子某个面上（用于补引擎 ray-AABB 在 entry===0 时的返回语义）。 */
    private _originOnBoxFace;
    /**
     * 委托 cc.geometry.intersect 的 ray-AABB slab（引擎返回距离而非布尔）。
     * 补两处契约空隙：空盒无法表达为 AABB；方向分量为 0 时引擎以 1/d 计算会得 ±Infinity/NaN，
     * 用 Number.EPSILON 摄动等价于 Three 的 ±Infinity 分支。
     */
    intersectBox(b: Box3, t: Vector3): Vector3 | null;
    /** 引擎命中距离为 0 才判空；起点在盒内时 Three 仍认为相交。 */
    containsOriginInside(b: Box3): boolean;
    intersectsBox(b: Box3): boolean;
    applyMatrix4(m: Matrix4): this;
    equals(r: Ray): boolean;
}
export declare const MathUtils: {
    clamp: typeof import("../..").clamp;
    degToRad: typeof import("../..").toRadian;
    radToDeg: typeof import("../..").toDegree;
    lerp: typeof import("../..").lerp;
    euclideanModulo: typeof import("../..").repeat;
    /** mapLinear 由 cc.inverseLerp 组合：c + inverseLerp(a, b, x) * (d - c)。 */
    mapLinear: (x: number, a: number, b: number, c: number, d: number) => number;
    /** 引擎无 smoothstep 静态（core/math/utils 未提供），保留 Three 的 3t²-2t³ 标量式。 */
    smoothstep: (x: number, a: number, b: number) => number;
    isPowerOfTwo: (v: number) => boolean;
    ceilPowerOfTwo: (v: number) => number;
    /** floorPowerOfTwo 由 cc.nextPow2 组合：已是 2 的幂则原值，否则降一档。 */
    floorPowerOfTwo: (v: number) => number;
    /** 引擎无 UUID 生成器；浏览器有 crypto.randomUUID 时用之，否则退回时间戳 + cc.random。 */
    generateUUID: () => string;
};
export {};
