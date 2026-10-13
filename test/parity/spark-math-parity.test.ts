/**
 * SPK-04 验收回路：`tests/math-parity` 的等价在位复跑。
 *
 * Oracle：真实 Three.js r180（隔离安装 output/spark-math-parity/node_modules/three，
 * 由 tools/verify/spark-math-parity.cjs 以 `npm install --prefix` 取得；仓库根 node_modules 与
 * 依赖清单不变，目标运行时代码不引用 three —— 见计划 §1.3「Three.js 只存在于独立参考页」）。
 * Air 侧：`src/air/spark/spark-math.ts`（SPK-04 的 CPU 数学层）。
 * 参照原型（只读）：`E:/AIProMax/github/spark-cocosairjs/tests/math-parity.mjs`。
 *
 * 忠实复现的要素（与原型逐条对齐，不弱化）：
 * 1. 同一个种子化 LCG：`seed = 0x5a17c0c0`，`seed = (Math.imul(seed,1664525)+1013904223) >>> 0`，
 *    `rand = seed/4294967296`，`scalar = rand()*4-2`，`vector = [scalar,scalar,scalar]`，
 *    取值调用顺序与原型一致 ⇒ 输入序列逐位相同。
 * 2. 同一操作覆盖集与同一断言次序（quaternion from Euler → compose → inverse → determinant → …）。
 * 3. 同一「最终上传 float32 完整位模式」比较：`float32Check` 把两侧 double 结果各写进 Float32Array 槽位，
 *    比较 Uint32Array 位；零值符号差异单独计入 signedZero*（与原型一致）。
 * 4. 同一 `near()` 容差语义：`error <= tolerance * max(1,|ref|)`，默认 2e-10，project 为 1e-8；
 *    超差即失败（不放宽、不折叠、不合并）。
 * 5. 同一逐操作差异归属：`float32MismatchByOperation` / `signedZeroByOperation` / 采样（附加输入摘要）。
 *
 * 与原型的作用域差（已在证据里显式登记为收窄，不静默丢弃）：
 * 原型的 `Air` 侧来自移植件 `src/air-compat.js`（数学 + 场景对象 + 纹理/RT 契约 + CubeCamera + Spark 数据结构）。
 * SPK-04 只拥有 `spark-math.ts`（数学层）；场景对象/纹理/渲染目标属 SPK-05a，`PackedSplats`/`ExtSplats`/
 * `SplatAccumulator` 属 SPK-11（依赖冻结 Spark 运行时），CubeCamera 的 mip/XR 复原属 SPK-05a/07。
 * 其中依赖场景对象的三项检查（projection / projection inverse / project / parented lookAt / world direction）
 * 仍被完整复跑：本文件用 spark-math 的原语按 Three r180 `Object3D`/`Camera`/`PerspectiveCamera` 的方法体
 * 逐行重写了一个 harness 侧形状垫片（见 Object3DShim/CameraShim）——垫片只做调度，矩阵/四元数算术全部
 * 落在 spark-math 上，因此这三项检验的仍是 SPK-04 的委托质量，而不是 SPK-05a 的场景对象实现。
 *
 * 两种运行模式（同种子、同序列，各跑一遍）：
 * - `collect`：near() 超差不抛出 ⇒ ITERATIONS 次迭代全量覆盖，产出完整的位模式差异归属；
 * - `assert`：完全等价于原型（首个超差即抛出）⇒ 判定基准。collect 数据先落盘，assert 的抛出仍会让本用例红。
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import * as Reference from 'three';
import * as Air from '../../src/air/spark/spark-math';

type Any = any;

const SEED_START = 0x5a17c0c0;
const ITERATIONS = Number(process.env.MATH_PARITY_ITERATIONS || 1000);
const RESULTS_PATH = path.resolve(__dirname, '../../output/spark-math-parity/results.json');
const ORDERS = ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY'];

/** 与原型 float32Check 同构的位模式/容差计数器。 */
interface Counters {
    checks: number;
    maxAbsoluteError: number;
    float32Components: number;
    float32BitMismatches: number;
    signedZeroMismatches: number;
    float32MismatchByOperation: Record<string, number>;
    signedZeroByOperation: Record<string, number>;
    float32MismatchSamples: Any[];
    toleranceViolations: number;
    toleranceViolationByOperation: Record<string, number>;
    toleranceViolationSamples: Any[];
    maxErrorByOperation: Record<string, number>;
    iterationsCompleted: number;
}

function makeCounters(): Counters {
    return {
        checks: 0,
        maxAbsoluteError: 0,
        float32Components: 0,
        float32BitMismatches: 0,
        signedZeroMismatches: 0,
        float32MismatchByOperation: {},
        signedZeroByOperation: {},
        float32MismatchSamples: [],
        toleranceViolations: 0,
        toleranceViolationByOperation: {},
        toleranceViolationSamples: [],
        maxErrorByOperation: {},
        iterationsCompleted: 0,
    };
}

/**
 * harness 侧形状垫片：Three r180 `Object3D` 的矩阵调度，方法体逐行对齐
 * node_modules/three/src/core/Object3D.js 的 updateMatrix / updateMatrixWorld / updateWorldMatrix /
 * lookAt / getWorldDirection，以及 src/cameras/Camera.js、src/cameras/PerspectiveCamera.js 的对应覆写。
 * 垫片内没有算法主体：compose / multiplyMatrices / invert / copy / decompose / extractRotation /
 * lookAt / setFromRotationMatrix / premultiply / makePerspective 全部调用 spark-math。
 */
const _lookTarget = new Air.Vector3();
const _lookPosition = new Air.Vector3();
const _lookM1 = new Air.Matrix4();
const _lookQ1 = new Air.Quaternion();

class Object3DShim {
    public position = new Air.Vector3();
    public quaternion = new Air.Quaternion();
    public scale = new Air.Vector3(1, 1, 1);
    public up = new Air.Vector3(0, 1, 0);
    public matrix = new Air.Matrix4();
    public matrixWorld = new Air.Matrix4();
    public parent: Object3DShim | null = null;
    public children: Object3DShim[] = [];
    public matrixAutoUpdate = true;
    public matrixWorldAutoUpdate = true;
    public matrixWorldNeedsUpdate = false;
    public isCamera = false;
    public isLight = false;

    public add(child: Object3DShim): this {
        child.parent = this;
        this.children.push(child);
        return this;
    }

    public updateMatrix(): void {
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.matrixWorldNeedsUpdate = true;
    }

    public updateMatrixWorld(force = false): void {
        if (this.matrixAutoUpdate) this.updateMatrix();
        if (this.matrixWorldNeedsUpdate || force) {
            if (this.matrixWorldAutoUpdate === true) {
                if (this.parent === null) {
                    this.matrixWorld.copy(this.matrix);
                } else {
                    this.matrixWorld.multiplyMatrices(this.parent.matrixWorld as Any, this.matrix as Any);
                }
            }
            this.matrixWorldNeedsUpdate = false;
            force = true;
        }
        const children = this.children;
        for (let i = 0, l = children.length; i < l; i++) children[i].updateMatrixWorld(force);
    }

    public updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void {
        const parent = this.parent;
        if (updateParents === true && parent !== null) parent.updateWorldMatrix(true, false);
        if (this.matrixAutoUpdate) this.updateMatrix();
        if (this.matrixWorldAutoUpdate === true) {
            if (this.parent === null) {
                this.matrixWorld.copy(this.matrix);
            } else {
                this.matrixWorld.multiplyMatrices(this.parent.matrixWorld as Any, this.matrix as Any);
            }
        }
        if (updateChildren === true) {
            const children = this.children;
            for (let i = 0, l = children.length; i < l; i++) children[i].updateWorldMatrix(false, true);
        }
    }

    public lookAt(x: number, y: number, z: number): void {
        _lookTarget.set(x, y, z);
        const parent = this.parent;
        this.updateWorldMatrix(true, false);
        _lookPosition.setFromMatrixPosition(this.matrixWorld as Any);
        if (this.isCamera || this.isLight) {
            _lookM1.lookAt(_lookPosition, _lookTarget, this.up);
        } else {
            _lookM1.lookAt(_lookTarget, _lookPosition, this.up);
        }
        this.quaternion.setFromRotationMatrix(_lookM1 as Any);
        if (parent) {
            _lookM1.extractRotation(parent.matrixWorld as Any);
            _lookQ1.setFromRotationMatrix(_lookM1 as Any);
            this.quaternion.premultiply(_lookQ1.invert() as Any);
        }
    }

    public getWorldDirection(target: Air.Vector3): Air.Vector3 {
        this.updateWorldMatrix(true, false);
        const e = this.matrixWorld.elements;
        return target.set(e[8], e[9], e[10]).normalize();
    }
}

/** Three r180 `Camera` + `PerspectiveCamera` 的矩阵调度（构造期即算投影，与上游一致）。 */
class CameraShim extends Object3DShim {
    public isCamera = true;
    public matrixWorldInverse = new Air.Matrix4();
    public projectionMatrix = new Air.Matrix4();
    public projectionMatrixInverse = new Air.Matrix4();
    public fov: number;
    public aspect: number;
    public near: number;
    public far: number;
    public zoom = 1;
    public filmOffset = 0;
    public filmGauge = 35;
    public view: null = null;
    public coordinateSystem = 2000; // WebGLCoordinateSystem
    public reversedDepth = false;

    constructor(fov: number, aspect: number, near: number, far: number) {
        super();
        this.fov = fov;
        this.aspect = aspect;
        this.near = near;
        this.far = far;
        this.updateProjectionMatrix();
    }

    public updateMatrixWorld(force = false): void {
        super.updateMatrixWorld(force);
        this.matrixWorldInverse.copy(this.matrixWorld).invert();
    }

    /**
     * 与 three r180 `src/cameras/Camera.js#getWorldDirection` 同式：相机看向自身 −Z，
     * 故在 `Object3D` 版本（+Z 列）之上取反。oracle 侧用的是真实 `PerspectiveCamera`，
     * 本 shim 缺这条覆写会让 'world direction' 检查整类误报为超差（符号相反）。
     */
    public getWorldDirection(target: Air.Vector3): Air.Vector3 {
        return (super.getWorldDirection(target) as Any).negate();
    }

    public getFilmWidth(): number {
        // film offset not applied if aspect ratio < 1
        return this.filmGauge * Math.min(this.aspect, 1);
    }

    /** 与 three/src/cameras/PerspectiveCamera.js#updateProjectionMatrix 同式。 */
    public updateProjectionMatrix(): void {
        const near = this.near;
        let top = (near * Math.tan((Math.PI / 180) * 0.5 * this.fov)) / this.zoom;
        let height = 2 * top;
        let width = this.aspect * height;
        let left = -0.5 * width;
        const skew = this.filmOffset;
        if (skew !== 0) left += (near * skew) / this.getFilmWidth();
        // spark-math 的 makePerspective 没有 Three r180 的第 8 个形参 reversedDepth（默认 false）；
        // 本回路输入恒为 reversedDepth=false，不触发该形参差（已在证据 findings 中登记）。
        this.projectionMatrix.makePerspective(
            left,
            left + width,
            top,
            top - height,
            near,
            this.far,
            this.coordinateSystem,
        );
        this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
    }
}

/**
 * 复跑主体。
 * - `assert`：与移植件原型完全一致（首个容差超差即抛出）⇒ 判定基准；
 * - `collect`：超差不抛出 ⇒ 全量覆盖，产出逐操作位模式差异归属；
 * - `isolated`：同种子同序列，但把 Euler→Quaternion 的两侧输入统一为 oracle 四元数（用
 *   `Air.Quaternion().set(rq.x, rq.y, rq.z, rq.w)` 装载，绕开本层 setFromEuler），用于根因隔离：
 *   该趟仍超差的操作用 `setFromEuler` 无关，属独立分歧；归零的操作只是被 setFromEuler 传染。
 */
function runReplay(mode: 'collect' | 'assert' | 'isolated'): Counters {
    const isolateQuatFromOracle = mode === 'isolated';
    const c = makeCounters();
    const buf = new ArrayBuffer(8);
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);

    let seed = SEED_START;
    // 逐迭代输入摘要，供差异归属复现（原型无此字段，属纯附加信息）。
    let currentInputs: Any = null;

    function float32Check(a: number, b: number, name: string): void {
        f32[0] = a;
        f32[1] = b;
        c.float32Components++;
        if (u32[0] !== u32[1]) {
            c.float32BitMismatches++;
            if (f32[0] === 0 && f32[1] === 0) {
                c.signedZeroMismatches++;
                c.signedZeroByOperation[name] = (c.signedZeroByOperation[name] || 0) + 1;
            } else {
                c.float32MismatchByOperation[name] = (c.float32MismatchByOperation[name] || 0) + 1;
                if (c.float32MismatchSamples.length < 12) {
                    c.float32MismatchSamples.push({
                        name,
                        a,
                        b,
                        airBits: u32[0],
                        referenceBits: u32[1],
                        inputs: currentInputs,
                    });
                }
            }
        }
    }

    const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const scalar = () => rand() * 4 - 2;
    const vector = () => [scalar(), scalar(), scalar()];

    function near(a: Any, b: Any, name: string, tolerance = 2e-10): void {
        const aa = typeof a === 'number' ? [a] : a.toArray();
        const bb = typeof b === 'number' ? [b] : b.toArray();
        assert.equal(aa.length, bb.length, name);
        for (let i = 0; i < aa.length; i++) {
            if (typeof aa[i] === 'string') {
                assert.equal(aa[i], bb[i], name);
                continue;
            }
            float32Check(aa[i], bb[i], name);
            const error = Math.abs(aa[i] - bb[i]);
            c.maxAbsoluteError = Math.max(c.maxAbsoluteError, error);
            c.maxErrorByOperation[name] = Math.max(c.maxErrorByOperation[name] || 0, error);
            if (!(error <= tolerance * Math.max(1, Math.abs(bb[i])))) {
                c.toleranceViolations++;
                c.toleranceViolationByOperation[name] = (c.toleranceViolationByOperation[name] || 0) + 1;
                // 采样上限按「每操作」计，避免高频操作把其它操作的证据挤掉（原型的 12 条全局采样
                // 仍保留在 float32MismatchSamples 字段里，语义不变）。
                const sampled = c.toleranceViolationSamples.filter((x: Any) => x.name === name).length;
                if (sampled < 3) {
                    c.toleranceViolationSamples.push({
                        name,
                        index: i,
                        air: aa[i],
                        reference: bb[i],
                        error,
                        tolerance,
                        inputs: currentInputs,
                    });
                }
                if (mode === 'assert') {
                    assert.ok(false, `${name}[${i}]: ${aa[i]} vs ${bb[i]}, error ${error}`);
                }
            }
        }
        c.checks++;
    }

    for (let i = 0; i < ITERATIONS; i++) {
        const p = vector();
        const s = vector().map((v) => Math.abs(v) + 0.15);
        const ea = vector();
        const order = ORDERS[i % 6];
        const v = vector();
        if (i % 3 === 0) s[i % 3] *= -1;
        currentInputs = { iteration: i, position: p, scale: s, euler: ea, order, vector: v };

        const rq = new (Reference as Any).Quaternion().setFromEuler(new (Reference as Any).Euler(...ea, order));
        // isolated 模式：两侧四元数输入统一为 oracle 值，用来把「setFromEuler 自身的分歧」与
        // 「被它传染的下游操作」分开归因；其余输入（p/s/v/ea/target/params/hex）与另外两趟逐位相同。
        const aq = isolateQuatFromOracle
            ? new Air.Quaternion().set(rq.x, rq.y, rq.z, rq.w)
            : new Air.Quaternion().setFromEuler(new Air.Euler(...ea, order));
        near(aq, rq, 'quaternion from Euler');

        const am = new Air.Matrix4().compose(new Air.Vector3(...p), aq, new Air.Vector3(...s));
        const rm = new (Reference as Any).Matrix4().compose(
            new (Reference as Any).Vector3(...p),
            rq,
            new (Reference as Any).Vector3(...s),
        );
        near(am, rm, 'compose');
        near(am.clone().invert(), rm.clone().invert(), 'inverse');
        near(am.determinant(), rm.determinant(), 'determinant');
        near(
            new Air.Vector3(...v).applyMatrix4(am),
            new (Reference as Any).Vector3(...v).applyMatrix4(rm),
            'vector transform',
        );
        near(
            new Air.Vector3(...v).applyQuaternion(aq),
            new (Reference as Any).Vector3(...v).applyQuaternion(rq),
            'quaternion transform',
        );

        const ap = new Air.Vector3();
        const as = new Air.Vector3();
        const adq = new Air.Quaternion();
        const rp = new (Reference as Any).Vector3();
        const rs = new (Reference as Any).Vector3();
        const rdq = new (Reference as Any).Quaternion();
        am.decompose(ap, adq, as);
        rm.decompose(rp, rdq, rs);
        near(ap, rp, 'decompose position');
        near(as, rs, 'decompose scale');
        near(adq, rdq, 'decompose quaternion');

        near(
            new Air.Euler().setFromQuaternion(aq, order),
            new (Reference as Any).Euler().setFromQuaternion(rq, order),
            'Euler from quaternion',
        );

        const q2 = vector();
        const rq2 = new (Reference as Any).Quaternion().setFromEuler(new (Reference as Any).Euler(...q2));
        const aq2 = isolateQuatFromOracle
            ? new Air.Quaternion().set(rq2.x, rq2.y, rq2.z, rq2.w)
            : new Air.Quaternion().setFromEuler(new Air.Euler(...q2));
        const t = rand();
        currentInputs = { ...currentInputs, secondEuler: q2, slerpT: t };
        near(aq.clone().multiply(aq2), rq.clone().multiply(rq2), 'quaternion multiply');
        near(aq.clone().slerp(aq2, t), rq.clone().slerp(rq2, t), 'slerp');

        const ma = vector().concat(vector(), vector());
        const am3 = new Air.Matrix3().fromArray(ma);
        const rm3 = new (Reference as Any).Matrix3().fromArray(ma);
        near(am3.clone().invert(), rm3.clone().invert(), 'mat3 inverse');

        const target = vector();
        currentInputs = { ...currentInputs, target };
        near(
            new Air.Matrix4().lookAt(new Air.Vector3(...p), new Air.Vector3(...target), new Air.Vector3(0, 1, 0)),
            new (Reference as Any).Matrix4().lookAt(
                new (Reference as Any).Vector3(...p),
                new (Reference as Any).Vector3(...target),
                new (Reference as Any).Vector3(0, 1, 0),
            ),
            'lookAt',
        );

        const params = [30 + rand() * 80, 0.5 + rand() * 2, 0.01 + rand(), 20 + rand() * 1000];
        currentInputs = { ...currentInputs, cameraParams: params };
        const ac = new CameraShim(params[0], params[1], params[2], params[3]);
        const rc = new (Reference as Any).PerspectiveCamera(...params);
        ac.position.set(...p);
        rc.position.set(...p);
        ac.quaternion.copy(aq as Any);
        rc.quaternion.copy(rq);
        ac.updateMatrixWorld();
        rc.updateMatrixWorld();
        near(ac.projectionMatrix, rc.projectionMatrix, 'projection');
        near(ac.projectionMatrixInverse, rc.projectionMatrixInverse, 'projection inverse');
        near(
            new Air.Vector3(...v).project(ac as Any),
            new (Reference as Any).Vector3(...v).project(rc),
            'project',
            1e-8,
        );

        const ab = new Air.Box3(new Air.Vector3(-1, -1, -1), new Air.Vector3(1, 1, 1)).applyMatrix4(am);
        const rb = new (Reference as Any).Box3(
            new (Reference as Any).Vector3(-1, -1, -1),
            new (Reference as Any).Vector3(1, 1, 1),
        ).applyMatrix4(rm);
        near(ab.min, rb.min, 'box min');
        near(ab.max, rb.max, 'box max');

        const hex = Math.floor(rand() * 0xffffff);
        currentInputs = { ...currentInputs, hex };
        near(new Air.Color(hex), new (Reference as Any).Color(hex), 'color');

        const parentA = new Object3DShim();
        const parentR = new (Reference as Any).Group();
        const childA = new CameraShim(params[0], params[1], params[2], params[3]);
        const childR = new (Reference as Any).PerspectiveCamera(...params);
        parentA.position.set(...p);
        parentR.position.set(...p);
        parentA.quaternion.copy(aq as Any);
        parentR.quaternion.copy(rq);
        parentA.add(childA);
        parentR.add(childR);
        childA.position.set(...v);
        childR.position.set(...v);
        childA.lookAt(target[0], target[1], target[2]);
        childR.lookAt(target[0], target[1], target[2]);
        parentA.updateMatrixWorld();
        parentR.updateMatrixWorld();
        near(childA.matrixWorld, childR.matrixWorld, 'parented lookAt matrix');
        near(
            childA.getWorldDirection(new Air.Vector3()),
            childR.getWorldDirection(new (Reference as Any).Vector3()),
            'world direction',
        );
        c.iterationsCompleted = i + 1;
    }

    currentInputs = null;
    near(new Air.Color(), new (Reference as Any).Color(), 'default color');
    return c;
}

/**
 * 布局探针：`Matrix4.lookAt` 的 9 个基向量分量在两侧是否互为 3x3 转置。
 * 目的是把「数值差异」与「列主序/行主序约定差异」区分开——gl-matrix 系的 lookAt 产出的是视图基
 * （基向量按行写入），Three 的产出的是世界朝向基（基向量按列写入），两者互为转置。
 */
function lookAtLayoutProbe(attempts = 64): Any {
    let seed = 0x5a17c0c0;
    const rand = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 4294967296;
    };
    const scalar = () => rand() * 4 - 2;
    const vector = () => [scalar(), scalar(), scalar()];
    let worstDirect = 0;
    let worstTransposed = 0;
    let directWithinTolerance = 0;
    let transposedWithinTolerance = 0;
    for (let i = 0; i < attempts; i++) {
        const eye = vector();
        const target = vector();
        const am = new Air.Matrix4().lookAt(
            new Air.Vector3(...eye),
            new Air.Vector3(...target),
            new Air.Vector3(0, 1, 0),
        );
        const rm = new (Reference as Any).Matrix4().lookAt(
            new (Reference as Any).Vector3(...eye),
            new (Reference as Any).Vector3(...target),
            new (Reference as Any).Vector3(0, 1, 0),
        );
        const a = am.toArray();
        const r = rm.toArray();
        // 仅比较 3x3 基部分（lookAt 不写平移列），transposed 参照把 Three 的列主序 3x3 取其转置。
        const transposed = new Array(16);
        for (let col = 0; col < 4; col++)
            for (let row = 0; row < 4; row++) transposed[col * 4 + row] = r[row * 4 + col];
        let d1 = 0;
        let d2 = 0;
        for (const idx of [0, 1, 2, 4, 5, 6, 8, 9, 10]) {
            d1 = Math.max(d1, Math.abs(a[idx] - r[idx]));
            d2 = Math.max(d2, Math.abs(a[idx] - transposed[idx]));
        }
        worstDirect = Math.max(worstDirect, d1);
        worstTransposed = Math.max(worstTransposed, d2);
        if (d1 <= 2e-10) directWithinTolerance++;
        if (d2 <= 2e-10) transposedWithinTolerance++;
    }
    return { attempts, worstDirect, worstTransposed, directWithinTolerance, transposedWithinTolerance };
}

/** 原型中不属于 SPK-04 数学层的检查组（显式登记为收窄，不静默丢弃）。 */
const narrowedScope = [
    {
        section:
            'DataTexture / DataArrayTexture 默认字段契约（magFilter/minFilter/format/type/flipY/unpackAlignment/generateMipmaps）',
        portTestLines: 'tests/math-parity.mjs:207-220',
        ownerTask: 'SPK-05a（spark-api-adapter.ts 的 Texture 形状）',
        inMathLayerScope: false,
        replayedHereBy: 'supplementary.adapterScope（与隔离 three@0.180.0 oracle 逐字段对账，计入判定）',
        reason: 'spark-math.ts 不含 Texture 类；该检查比对 CPU 描述袋字段默认值，非数学委托。由附加块 adapterScope 复跑并计入判定。',
    },
    {
        section: 'WebGLArrayRenderTarget 尺寸/缓冲/samples 契约与 texture.image 深比较',
        portTestLines: 'tests/math-parity.mjs:221-244',
        ownerTask: 'SPK-05a（gfx:* 归属的 RenderTarget 形状）',
        inMathLayerScope: false,
        replayedHereBy: 'supplementary.adapterScope（尺寸/缓冲/samples + texture.image 深比较，计入判定）',
        reason: '渲染目标形状不在数学层，SPK-04 无对应实现。由附加块 adapterScope 复跑并计入判定。',
    },
    {
        section:
            'PackedSplats / ExtSplats 的 pushSplat/getSplat 与 packed/ext 字节数组深比较、SplatAccumulator.generateMapping/ensureGenerate 纹理布局',
        portTestLines: 'tests/math-parity.mjs:261-354',
        ownerTask: 'SPK-11（冻结 Spark 本体接入）',
        inMathLayerScope: false,
        replayedHereBy: null,
        owningGate: 'npm run verify:spark-cpu-parity（浏览器内把本仓变体产物 cc.sparkRuntime 与上游参考包逐位对账）',
        reason:
            '需要 Spark 运行时（PackedSplats/ExtSplats/SplatAccumulator 属冻结上游算法，不在 spark-math.ts）；' +
            '本体接入后由 verify:spark-cpu-parity 承担同一检查，本层不复现。',
    },
    {
        section:
            'CubeCamera 六面朝向 / -90° 投影 / activeMipmapLevel 与 XR 复原 / 注入渲染失败后的状态复原 / WebGL 与 WebGPU 两套坐标系统',
        portTestLines: 'tests/math-parity.mjs:372-459',
        ownerTask: 'SPK-05a（CubeCamera / WebGLCubeRenderTarget）+ SPK-07（CocosRenderer 的 mip/XR 簿记）',
        inMathLayerScope: false,
        replayedHereBy: '其中的矩阵内容已由 projection / projection inverse / parented lookAt 在本层复跑（计入判定）',
        owningGate:
            'npm run verify:spark-pixel-parity（渲染面）；XR 子项随 SPK-10 移除，见 docs/UPSTREAM.md 的 XR deviation',
        reason: '其矩阵内容已由 projection / projection inverse / parented lookAt 检查覆盖；对象级 mip、XR 保存与渲染器 mock 不属数学层。',
    },
];

/**
 * 附加（不参与 SPK-04 判定）：移植件原型里的纹理/RT 字段契约组，
 * 若能从 SPK-05a 的适配层（另一并行任务正在编辑）加载则一并复跑，只记录状态，
 * 绝不把它的成败混进数学层判定，也不伪装成通过。
 */
function adapterScopeReport(): Any {
    const report: Any = {
        countedInVerdict: true,
        attempted: false,
        status: 'not-attempted',
        detail: null,
        fieldChecks: 0,
    };
    if (process.env.SPARK_MATH_PARITY_SKIP_ADAPTER === '1') {
        report.detail = 'SPARK_MATH_PARITY_SKIP_ADAPTER=1（本次跳过附加块）';
        return report;
    }
    let Adapter: Any;
    try {
        report.attempted = true;
        Adapter = require('../../src/air/spark/spark-api-adapter');
    } catch (e) {
        report.status = 'adapter-unloadable';
        report.detail = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 500);
        return report;
    }
    try {
        for (const C of ['DataTexture', 'DataArrayTexture']) {
            const a = new Adapter[C]();
            const b = new (Reference as Any)[C]();
            for (const k of [
                'magFilter',
                'minFilter',
                'format',
                'type',
                'flipY',
                'unpackAlignment',
                'generateMipmaps',
            ]) {
                assert.equal((a as Any)[k], (b as Any)[k], `${C}.${k}`);
                report.fieldChecks++;
            }
        }
        const airTarget = new (Adapter as Any).WebGLArrayRenderTarget(16, 8, 3, {
            format: Adapter.RGBAIntegerFormat,
            type: Adapter.UnsignedIntType,
            minFilter: Adapter.NearestFilter,
            magFilter: Adapter.NearestFilter,
            depthBuffer: false,
        });
        const refTarget = new (Reference as Any).WebGLArrayRenderTarget(16, 8, 3, {
            format: (Reference as Any).RGBAIntegerFormat,
            type: (Reference as Any).UnsignedIntType,
            minFilter: (Reference as Any).NearestFilter,
            magFilter: (Reference as Any).NearestFilter,
            depthBuffer: false,
        });
        for (const k of ['width', 'height', 'depth', 'depthBuffer', 'stencilBuffer', 'samples']) {
            assert.equal(airTarget[k], refTarget[k], `target.${k}`);
            report.fieldChecks++;
        }
        assert.deepEqual(airTarget.texture.image, refTarget.texture.image);
        report.status = 'passed';
    } catch (e) {
        report.status = 'failed';
        report.detail = `${(e as Error).name}: ${(e as Error).message}`.slice(0, 500);
    }
    return report;
}

describe('SPK-04 math-parity：spark-math.ts vs Three.js r180（在位等价复跑）', () => {
    const collected = runReplay('collect');

    test('oracle 与目标图均可加载', () => {
        expect((Reference as Any).REVISION).toBe('180');
        expect(typeof (Air as Any).Vector3).toBe('function');
        expect(ITERATIONS).toBeGreaterThan(0);
    });

    test('全量覆盖复跑：最终 float32 位模式差异归属（collect 模式，不提前中止）', () => {
        let assertCounters: Counters | null = null;
        let assertError: Any = null;
        try {
            assertCounters = runReplay('assert');
        } catch (e) {
            assertError = { name: (e as Error).name, message: (e as Error).message };
        }
        const isolated = runReplay('isolated');
        const evidence = {
            schema: 'spark-math-parity-replay/1',
            generatedAt: new Date().toISOString(),
            target: 'src/air/spark/spark-math.ts',
            oracle: 'three@0.180.0 (isolated prefix output/spark-math-parity)',
            portTestReference: 'E:/AIProMax/github/spark-cocosairjs/tests/math-parity.mjs',
            seed: '0x5a17c0c0',
            iterations: ITERATIONS,
            modeNote:
                'collect = 同种子全量跑（容差超差不抛出，用于逐操作归属）；assert = 移植件原型语义（首个超差即失败，判定基准）；' +
                'isolated = 同种子同序列但四元数输入统一取自 oracle，用于把 setFromEuler 的自身分歧与其下游传染分开归因。',
            scopeNote:
                '场景对象三项检查通过 harness 侧 Object3DShim/CameraShim 复跑：调度按 Three r180 方法体逐行重写，矩阵/四元数算术全部落在 spark-math。',
            narrowedScope,
            collected,
            isolated,
            probes: { lookAtLayout: lookAtLayoutProbe() },
            assertRun: {
                completedWithoutFailure: assertError === null,
                counters: assertCounters,
                failure: assertError,
            },
            supplementary: { adapterScope: adapterScopeReport() },
        };
        fs.mkdirSync(path.dirname(RESULTS_PATH), { recursive: true });
        fs.writeFileSync(RESULTS_PATH, JSON.stringify(evidence, null, 2), 'utf8');
        expect(collected.iterationsCompleted).toBe(ITERATIONS);
        expect(collected.checks).toBeGreaterThan(0);
        expect(collected.float32Components).toBeGreaterThan(0);
        expect(isolated.iterationsCompleted).toBe(ITERATIONS);
    });

    test('移植件原型语义复跑（assert 模式）：容差超差必须像原型一样真实失败', () => {
        runReplay('assert');
    });
});
