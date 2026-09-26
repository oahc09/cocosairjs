# Freeing Resources（释放资源）

> 浏览器 GC 收不走 GPU 内存，用了 GPU 资源的对象必须手动释放。
> 配套可运行示例：[`examples/manual-cleanup/`](examples/manual-cleanup/)
> （A 贴"脸"立方体与 B 贴"脸"球体两套私有材质/纹理/网格定时互换，
> 换场即完整释放旧套并回读失效证据——零外部资产）。

AIR 的释放规则分两层：节点树由 `node.destroy()` 级联回收，GPU 资产（网格/材质/纹理）
不会随节点或场景释放，必须逐个显式 `destroy()`——**边界写得很死**，`Scene.destroy` 的
d.ts 注释原文就是免责声明（19420）：

> Destroy the current scene and all its nodes, **this action won't destroy related assets**

| AIR                                                                                                    | 实测                                 |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------ |
| `node.destroy()` 自动级联子节点+组件（`_onPreDestroyBase` 逐个 `_destroyImmediate`），无需手动逐个摘除 | ✓（探针：父毁，Trim 子节点同步失效） |
| `mesh.destroy()`（"释放它占有的所有 GPU 资源"，d.ts 185）                                              | ✓（`_renderingSubMeshes` 置 null）   |
| `material.destroy()`（"销毁后无法重新初始化"，d.ts 23871）                                             | ✓（`passes` 置空）                   |
| `texture.destroy()`（"清空所有 Mipmap 并释放占用的 GPU 资源"，d.ts 23371）                             | ✓（`getGFXTexture()` 变 null）       |
| 忘 destroy = 静默泄漏：不报错，只是 GPU 内存不还                                                       | ✓                                    |

## 1. 释放清单（API 锚点，源码+探针双证）

**节点侧**（一次 destroy，级联全收）：

| 入口                               | 锚点                                                | 语义（实测）                                                                                                        |
| ---------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `node.destroy()`                   | d.ts 15272（CCObject）；node.ts `_onPreDestroyBase` | 返回 true=首次销毁；**本帧渲染前**生效（d.ts 18859 "delayed until before rendering"），当帧内 `isValid` 仍为 true   |
| `node.destroyAllChildren()`        | d.ts 18864                                          | 只毁子树、留自身                                                                                                    |
| `node.isValid` / `cc.isValid(obj)` | d.ts 15231–15252                                    | 销毁后不可用；`isValid(obj, true)` 可判"本帧已调 destroy"                                                           |
| `MeshRenderer.onDestroy`           | mesh-renderer.ts 649                                | 组件销毁时 `director.root.destroyModel(_model)`——**每实例**的 model 缓冲自动回收，但 mesh/material **资产**不归它管 |

**资产侧**（三件套，必须逐个显式 destroy）：

| 资产            | destroy 锚点                                                 | 同步释放内容（源码）                                                                                  | 探针读数变化                   |
| --------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------ |
| `Mesh`          | d.ts 185 → mesh.ts 690                                       | `destroyRenderingMesh()`：逐个 subMesh.destroy 并置 `_renderingSubMeshes=null`                        | `subs: 1 → 0`                  |
| `Material`      | d.ts 23871 → material.ts 242                                 | `_doDestroy()`：全部 `pass.destroy()`、`_passes` 清空                                                 | `passes: 3 → 0`                |
| `Texture2D`     | d.ts 23371 → texture-2d.ts 262                               | `_mipmaps = []`                                                                                       | `getGFXTexture(): 句柄 → null` |
| `Asset`（基类） | refCount 22994 / addRef 23006 / decRef 23017 / destroy 23056 | `decRef()` 归零 → release-manager `tryRelease` → 下一 tick `_free` → `asset.destroy()` 并递归释放依赖 | 见 §4 生命周期衔接             |

**销毁的"两段式"时序（探针实锤）**：`destroy()` 调用点同步拆 GPU 句柄（subs/passes/gfx
当场归零），而 `isValid` 翻 false 要等本帧渲染前的延迟销毁队列冲刷——所以"当帧读
isValid=true、+2 帧读全 false"不是 bug，是文档承诺的行为。

## 2. 示例拆解：A/B 换场即完整释放

每 3.5s 在两套之间切换：A=贴"A"脸立方体（含共用同一套资产的 Trim 子节点，演示
"共享资产只能整体释放一次"），B=贴"B"脸球体。完整释放函数的 AIR 写法（先节点后资源）：

```ts
// 递归"移除+释放"模板的 AIR 落地：先节点后资源，destroy() 返回值 = 是否首次销毁
function disposeSet(set: AssetSet): DisposeReturns {
    const returns = {
        node: set.root.destroy(),
        mesh: set.mesh.destroy(),
        mat: set.mat.destroy(),
        tex: set.tex.destroy(),
    };
    return returns;
}
```

不需要手写递归下树——`node.destroy()` 自己完成；需要手写的反而是**资产清单**
（AIR 不会替你数"这套材质还有没有人用"）。换场 +2 帧后回读旧套探针打到覆盖层：

```js
        out.subs = set.mesh._renderingSubMeshes ? set.mesh._renderingSubMeshes.length : 0;
        out.matValid = set.mat.isValid;
        out.passes = set.mat.passes ? set.mat.passes.length : 0; // destroy 后 _passes 置空（material.ts _doDestroy）
        out.texValid = set.tex.isValid;
        out.gfx = set.tex.getGFXTexture() ? 1 : 0; // _mipmaps 清空后为 0
```

**踩坑两个**：① 已销毁 Mesh 的公开 getter `renderingSubMeshes` 会先调 `initialize()`
（mesh.ts 358），对已毁资产重跑初始化直接抛 `Cannot read properties of null`——取证
销毁效果只能读私有 `_renderingSubMeshes`；② box 正面 UV 的 v 方向与 plane **相反**，
[canvas-textures](canvas-textures.md) / [billboards](billboards.md) 篇的"预翻转"作画法
用在这里反而让字母倒立（首版截图实锤），本例刻意不预翻。

## 3. 实测读数

验证器 3/3：`app-contract / visible-frame / no-runtime-error` 全 PASS（3.1s，子集运行 partial；
非 ANIMATED）。截图 `docs/evidence/examples/manual-cleanup.png`：A 立方体正面字母 upright、
下方 Trim 小板同贴同材质。

**探针 dump**（钉 `rig._t=3.6` 强制换场）：

| 读数                             | live（换场前） | sameTick（dispose 同帧）    | +2 帧           |
| -------------------------------- | -------------- | --------------------------- | --------------- |
| node/trim/mesh/mat/tex `isValid` | 全 true        | **全 true**（延迟队列未冲） | 全 false        |
| `subs` / `passes` / `texGfx`     | 1 / 3 / 1      | **0 / 0 / 0**（同步释放）   | 0 / 0 / 0       |
| `destroy()` 返回值               | —              | node/mesh/mat/tex 全 true   | —               |
| `scene.children.length`          | 3              | —                           | 3（旧根已离树） |

`mat.refCount` 全程 0：代码 `new Material()` 出来的资产渲染器不会替它 addRef
（全 src grep `mesh.addRef|material.addRef` 零命中），所以"引用计数自动回收"这条路
对自建资产根本不成立，显式 destroy 是唯一正解。

## 4. 与资产生命周期的衔接

- **加载型资产**（`assetManager.loadBundle/load` 路线）走 refCount：加载 +1，
  `decRef()` 归零后 release-manager `tryRelease` → 下一 tick `_free` → 递归释放依赖并
  `asset.destroy()`（release-manager.ts 208/229/258）。`addRef()` 用于"我要长期持有"。
- **换场景自动账**：`director.loadScene` 切场景时 `_autoRelease` 对旧场景依赖逐个
  `decRef`（release-manager.ts 165）——但只覆盖**经资产管线加载**的依赖；代码 `new`
  出来的三件套不在依赖图里，换场景不会替你收。
- **共享资产红线**：与"永不改共享内建材质"同源——`builtin-standard` 等默认资源的
  实例/内建资产**不要 destroy**，`Asset.destroy` 是无差别刀（d.ts 23056），毁了就全场景
  遭殃；Material.destroy 注释也明示销毁后不可重新初始化。
- **何时值得做**：一次性页面/小场景不做释放没有任何问题，浏览器关页全回收；
  换关/换模式/长会话 UGC 才是本清单的主场。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-cleanup        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-cleanup/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-cleanup
```

示例目录：`docs/manual/examples/manual-cleanup/`。
验证器 3/3 全 PASS（3.1s，子集运行 partial）；截图 `docs/evidence/examples/manual-cleanup.png`；
探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-cleanup/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Freeing Resources — 释放资源（docs/manual/cleanup.md）</title>
        <style>
            html,
            body {
                margin: 0;
                padding: 0;
                width: 100%;
                height: 100%;
                overflow: hidden;
                background: #fff;
            }
            #GameDiv {
                width: 100%;
                height: 100%;
            }
            #Cocos3dGameContainer {
                width: 100%;
                height: 100%;
            }
            #GameCanvas {
                width: 100%;
                display: block;
                height: 100%;
            }
            #info {
                position: absolute;
                left: 8px;
                top: 8px;
                z-index: 10;
                font:
                    12px/1.6 ui-monospace,
                    Consolas,
                    monospace;
                color: #e8eef7;
                background: rgba(10, 16, 26, 0.78);
                padding: 6px 10px;
                border-radius: 4px;
                white-space: pre;
            }
        </style>
        <script type="importmap">
            { "imports": { "cocosair": "/build/cocosair.module.js" } }
        </script>
    </head>
    <body>
        <!-- 官方模板 DOM 结构：pal/screen-adapter 依赖这些 id 做全屏适配 -->
        <div id="GameDiv">
            <div id="Cocos3dGameContainer">
                <!-- #GameCanvas 必须在引擎 import 前存在（pal/screen-adapter 为模块顶层单例） -->
                <canvas id="GameCanvas"></canvas>
            </div>
        </div>
        <div id="info">loading…</div>
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

`examples/manual-cleanup/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Freeing Resources（释放资源）
 * 配套文章：docs/manual/cleanup.md
 *
 * JS 的 GC 收不走 GPU 内存，texture/geometry/material 三类资源必须手动释放。
 * AIR 的对应关系（源码取证）：
 *   - node.destroy() 级联销毁子节点+组件（node.ts _onPreDestroyBase），本帧渲染前生效；
 *   - 但资源（Asset 派生：Mesh/Material/Texture2D）不会随节点/场景释放——
 *     Scene.destroy 注释原文 "this action won't destroy related assets"（d.ts 19420）；
 *   - 释放清单三件套：mesh.destroy()（释放 renderingSubMeshes 的 GPU 缓冲，d.ts 185）、
 *     material.destroy()（销毁全部 pass 且不可复活，d.ts 23871）、
 *     texture.destroy()（清空 mipmaps，getGFXTexture 变 null，d.ts 23371）。
 * 本例：A（贴"脸"立方体）与 B（贴"脸"球体）两套私有材质/纹理/网格每 3.5s 互换一次，
 * 换场时对旧套执行"节点+三件套"完整释放，并在 +2 帧后回读失效证据（isValid/GPU 句柄）
 * 打到覆盖层——释放是否真的落锤，看数不看感觉。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Component,
    Layers,
    Vec3,
    Color,
    Texture2D,
    Mesh,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('cleanup');

// ---- 方向光 + 相机 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-20, 10, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 12;

const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.0, 8.2));
cameraNode.lookAt(new Vec3(0, 1.2, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(16, 20, 28, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一套 = 一个节点树 + 三个独占 GPU 资源（材质/纹理/网格） ----
const TEX_SIZE = 64;

function makeFaceTexture(letter: string, bg: string, ink: string): Texture2D {
    const paint = document.createElement('canvas');
    paint.width = paint.height = TEX_SIZE;
    const g2d = paint.getContext('2d') as CanvasRenderingContext2D;
    // 实测：box 正面 UV 的 v 方向与 plane 相反——动态纹理/公告板篇的"预翻转"路线
    // 用在这里会让立方体正面的文字倒立，所以这里刻意"不预翻转"
    g2d.fillStyle = bg;
    g2d.fillRect(0, 0, TEX_SIZE, TEX_SIZE);
    g2d.fillStyle = ink;
    g2d.font = 'bold 44px sans-serif';
    g2d.fillText(letter, 14, 48);
    const tex = new Texture2D();
    tex.reset({ width: TEX_SIZE, height: TEX_SIZE, format: Texture2D.PixelFormat.RGBA8888 });
    tex.uploadData(paint); // 都在 run 之后的 update 里构建，一次性上传即采样生效（公告板篇实测）
    return tex;
}

let uid = 0;

type AssetSet = {
    name: string;
    id: number;
    swaps: number;
    root: Node;
    trim: Node;
    effect: string;
    mesh: Mesh & { _renderingSubMeshes?: unknown[] };
    tex: Texture2D;
    mat: Material;
};

// 存活探针读回的字段（try 分支可能只填一部分）
type SetProbe = {
    nodeValid?: boolean;
    trimValid?: boolean;
    meshValid?: boolean;
    subs?: number;
    matValid?: boolean;
    passes?: number;
    texValid?: boolean;
    gfx?: number;
    refCount?: number;
    error?: string;
};

type DisposeReturns = { node: boolean; mesh: boolean; mat: boolean; tex: boolean };

function buildSet(name: string): AssetSet {
    const set = { name, id: ++uid, swaps: 0 } as AssetSet;
    set.root = new Node(`Set${name}`);
    set.root.layer = Layers.Enum.DEFAULT;
    set.root.setPosition(new Vec3(0, 1.3, 0));
    scene.addChild(set.root);
    if (name === 'A') {
        set.mesh = utils.createMesh(primitives.box({ width: 1.9, height: 1.9, length: 1.9 }));
        set.tex = makeFaceTexture('A', '#3b82f6', '#ffe08a');
        set.effect = 'builtin-standard';
    } else {
        set.mesh = utils.createMesh(primitives.sphere(1.15, 20, 14));
        set.tex = makeFaceTexture('B', '#14b8a6', '#ffd75e');
        set.effect = 'builtin-standard';
    }
    set.mat = new Material();
    set.mat.initialize({ effectName: set.effect, defines: { USE_ALBEDO_MAP: true } });
    set.mat.setProperty('mainTexture', set.tex);
    const body = new Node('Body');
    body.layer = Layers.Enum.DEFAULT;
    set.root.addChild(body);
    const r = body.addComponent(MeshRenderer);
    r.mesh = set.mesh;
    r.material = set.mat;
    // 小装饰子节点：与 Body 共用同一套 mesh/material，演示"共享资产只能整体释放一次"
    const trim = new Node('Trim');
    trim.layer = Layers.Enum.DEFAULT;
    trim.setPosition(new Vec3(0, -1.25, 0));
    trim.setScale(new Vec3(0.45, 0.2, 0.45));
    set.root.addChild(trim);
    set.trim = trim;
    const tr = trim.addComponent(MeshRenderer);
    tr.mesh = set.mesh;
    tr.material = set.mat;
    return set;
}

// 读一组"存活探针"：节点/资源各自 isValid + 底层 GPU 句柄状态
function probeSet(set: AssetSet): SetProbe {
    const out: SetProbe = {};
    try {
        out.nodeValid = set.root.isValid;
        out.trimValid = set.trim.isValid;
        out.meshValid = set.mesh.isValid;
        // 读私有 _renderingSubMeshes：公开 getter 会对已销毁网格重跑 initialize() 并抛错（实测），
        // 私有字段读法专用于取证销毁效果（destroyRenderingMesh 置 null）
        out.subs = set.mesh._renderingSubMeshes ? set.mesh._renderingSubMeshes.length : 0;
        out.matValid = set.mat.isValid;
        out.passes = set.mat.passes ? set.mat.passes.length : 0; // destroy 后 _passes 置空（material.ts _doDestroy）
        out.texValid = set.tex.isValid;
        out.gfx = set.tex.getGFXTexture() ? 1 : 0; // _mipmaps 清空后为 0
        out.refCount = set.mat.refCount; // 代码 new 出来的资产恒 0：渲染器不会替资源 addRef
    } catch (e) {
        out.error = String(e && e.message);
    }
    return out;
}

// 递归"移除+释放"模板的 AIR 落地：先节点后资源，destroy() 返回值 = 是否首次销毁
function disposeSet(set: AssetSet): DisposeReturns {
    const returns = {
        node: set.root.destroy(),
        mesh: set.mesh.destroy(),
        mat: set.mat.destroy(),
        tex: set.tex.destroy(),
    };
    return returns;
}

const info = document.querySelector('#info') as HTMLElement;
const HALF = 3.5; // 每套展示 3.5s 后换场

class CleanupRig extends Component {
    private _t = 0;
    private _frameCount = 0;
    live: AssetSet | null = null;
    oldProbe: AssetSet | null = null;
    report: SetProbe | null = null;
    returns: DisposeReturns | null = null;
    swaps = 0;

    update(dt: number): void {
        this._t = (this._t || 0) + dt;
        const phase = this._t % (HALF * 2);
        const want = phase < HALF ? 'A' : 'B';
        if (!this.live || this.live.name !== want) {
            const old = this.live;
            if (old) {
                // 释放清单：节点树 + 三件套（材质/纹理/网格），顺序=先离场景再拆资产
                this.returns = disposeSet(old);
                this.oldProbe = old; // 暂存引用，+2 帧后回读失效证据
                this.swaps = (this.swaps || 0) + 1;
            }
            this.live = buildSet(want);
            this._frameCount = 0;
        }
        this._frameCount++;
        if (this.oldProbe && this._frameCount >= 2) {
            this.report = probeSet(this.oldProbe); // 预期：全 false / subs=0 / passes=0 / gfx=0
            this.oldProbe = null;
        }
        const now = probeSet(this.live);
        const rep = this.report;
        const ret = this.returns;
        info.textContent = [
            'cleanup: node.destroy() cascades nodes+components; assets need explicit destroy()',
            `live set=${this.live.name} (swap at t=${HALF}s)  swaps=${this.swaps || 0}  scene children=${scene.children.length}`,
            `live: node=${now.nodeValid} subs=${now.subs} passes=${now.passes} texGfx=${now.gfx} mat.refCount=${now.refCount}`,
            ret
                ? `dispose returns(first-call): node=${ret.node} mesh=${ret.mesh} mat=${ret.mat} tex=${ret.tex}`
                : 'dispose returns: (first swap pending)',
            rep
                ? `old set +2 frames: node=${rep.nodeValid} trim=${rep.trimValid} mesh=${rep.meshValid} subs=${rep.subs} passes=${rep.passes} gfx=${rep.gfx}`
                : 'old set: (no dispose yet)',
        ].join('\n');
    }
}
const rig = cameraNode.addComponent(CleanupRig);

window.__airApp = app;
window.__inspect = {
    scene,
    rig,
    probeLive: () => (rig.live ? probeSet(rig.live) : null),
    getReport: () => rig.report || null,
    getReturns: () => rig.returns || null,
    buildSet,
    disposeSet,
    probeSet,
};
app.run(scene);

console.log('[manual/cleanup] running on cocosair');
```

---

上一篇：[公告板与立面（Billboards and Facades）](billboards.md) ｜ 下一篇：[体素几何（Making Voxel Geometry / Minecraft）](voxel-geometry.md)
