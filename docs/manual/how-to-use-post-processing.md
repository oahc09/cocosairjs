# 后处理（How to use Post Processing）

> bloom/辉光/SSAO 这类全屏后期效果怎么挂。
> 配套可运行示例：[`examples/manual-post-processing/`](examples/manual-post-processing/)（相机后处理开关 A/B + 槽位读回；实测开关无像素级效果，见 §3）。

**状态：PARTIAL。** AIR 导出面里后处理的**开关与管线类在、效果创作面不在**：
`camera.usePostProcess` / `camera.postProcess` 两个成员存在（d.ts 21372–21375），
但 `PostProcess` 类型本身是 `__private`（不在顶层导出），用户代码**拿不到效果实例往槽里放**；
管线级的 `PostProcessStage` / `BloomStage` 类在导出表里（d.ts 34907；module.js 导出表含 `BloomStage`），
属于渲染管线内部件，没有用户级装配入口。本篇如实记录"开关可拨、效果不可挂"的现状。

## 1. 有什么

| 成员 | d.ts | 实测 |
| --- | --- | --- |
| `camera.usePostProcess`（bool） | 21372–21373 | 赋值与读回正常（spike 读回 false/true） |
| `camera.postProcess`（实例槽） | 21374–21375 | 读回 `null`；类型 `__private...PostProcess`，顶层导出无此类 |
| `PostProcessStage` / `BloomStage`（管线 stage 类） | 34907 / 导出表 | 类在导出面，无用户级 effect 列表或装配 API |
| `scene.globals.postSettings.toneMappingType` | 21149 / 21004 | 见 [颜色管理](color-management.md) §1：两值枚举且本环境无像素效果 |

```js
const ppInitial = camera.postProcess;
const ppType = ppInitial === null ? 'null' : typeof ppInitial;
```

开关拨动（示例每 3s 一次 A/B）：

```js
            camera.usePostProcess = on;
```

## 2. 没有什么（诚实清单）

- **没有** `PostProcess` 组件/类的顶层导出 → 无法 `new` 一个后处理配置挂到相机槽；
- **没有** 用户级效果列表（bloom / tone-mapping effect / FXAA 等的创作入口）；
- **没有** 用户态后期 stage 组合面（无法把全屏效果逐 pass 串成链）；
- 因此 `usePostProcess = true` 在槽为 `null` 时是**空转开关**（§3 字节级证实）。

**当前可行的近似路**：手工 RT 合成——相机渲进 `RenderTexture`、全屏 quad 采样做后期，
即 [渲染目标](rendertargets.md) 的路线；该路线本环境保真度 PARTIAL（灰 quad 问题在案），
所以本篇不承诺"手工 bloom 可跑"，只指路。

## 3. 实测读图与读数

示例验证器 4/4：`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS（3.9s，子集运行 partial；
立方体自转 40°/s）。截图 `docs/evidence/examples/manual-post-processing.png`（品红立方体三面可见）。

覆盖层实测（探针 dump，t≈4s，开关 on 相）：

```
post-process: camera.usePostProcess toggles every 3s
now: usePostProcess=true
camera.postProcess slot: null (PostProcess type not top-level exported)
effects list: not exposed — see article §2
```

**A/B spike**（`.tmp-pp-spike.cjs`，静态场景仅 `usePostProcess` 不同，固化为
`docs/evidence/manual/pp-spike-off.png` / `pp-spike-on.png`）：两帧**字节完全相同**
（sha256 前 16 位均 `3ac8c80d2104d078`），而读回值确为 false/true——
**开关被接受但无像素级效果**，与槽位 `null` 自洽。结论：拨开关不等于有后期，效果创作面缺失是本环境的硬边界。

## 4. 设计与口径

- AIR 的后处理设计是**引擎内建 PostProcess 组件**（Cocos 3.8 路线），但 AIR V0.1 导出面截断了创作层，只留开关与管线类。
- 未来若放开创作面，预期是往 `camera.postProcess` 槽放组件化配置——
  升级信号：`PostProcess` 进入顶层导出（届时本篇升 FULL 并补 bloom 示例）。
- 色调映射放在 `scene.globals.postSettings`（[颜色管理](color-management.md) §1），
  与后处理开关**互不联动**（两者本环境均无像素效果，证据分别在两篇 §3）。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-post-processing        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-post-processing/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-post-processing
```

示例目录：`docs/manual/examples/manual-post-processing/`。
验证器 4/4 全 PASS（3.9s，子集运行 partial）；截图 `docs/evidence/examples/manual-post-processing.png`；
spike 对照 `docs/evidence/manual/pp-spike-{off,on}.png`（字节相同）；覆盖层探针 dump 见 §3。

## 附：示例源码（逐字）

`examples/manual-post-processing/index.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <title>Post Processing — 后处理开关（docs/manual/how-to-use-post-processing.md）</title>
    <style>
        html, body { margin: 0; padding: 0; width: 100%; height: 100%; overflow: hidden; background: #fff; }
        #GameDiv { width: 100%; height: 100%; }
        #Cocos3dGameContainer { width: 100%; height: 100%; }
        #GameCanvas { width: 100%; display: block; height: 100%; }
        #info {
            position: absolute; left: 8px; top: 8px; z-index: 10;
            font: 12px/1.6 ui-monospace, Consolas, monospace; color: #e8eef7;
            background: rgba(10, 16, 26, .78); padding: 6px 10px; border-radius: 4px;
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

`examples/manual-post-processing/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — How to use Post Processing（后处理）
 * 配套文章：docs/manual/how-to-use-post-processing.md
 *
 * 实测相机上的后处理开关：camera.usePostProcess（bool）与 camera.postProcess（实例槽位）。
 * PostProcess 类型不在顶层导出（__private），本篇只演示开关与读回，不承诺效果实例可挂；
 * 每 3s 切换 usePostProcess 做 A/B，覆盖层打印读回值；立方体自转保证 frame-diff。
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
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('post-processing');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.0, 3.0, 6.4));
cameraNode.lookAt(new Vec3(0, 1.1, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 立方体 ----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 1.0, 0));
scene.addChild(cubeNode);
const renderer = cubeNode.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
material.setProperty('mainColor', new Color(205, 95, 205, 255));
renderer.material = material;

class Spinner extends Component {
    update (dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}
cubeNode.addComponent(Spinner);

// ---- 后处理开关读回 ----
const ppInitial = camera.postProcess;
const ppType = ppInitial === null ? 'null' : typeof ppInitial;

class Cycler extends Component {
    private _t = 0;
    private _on = false;

    constructor () {
        super();
        this._t = 0;
        this._on = false;
    }
    update (dt: number): void {
        this._t += dt;
        const on = Math.floor(this._t / 3) % 2 === 1;
        if (on !== this._on) {
            this._on = on;
            camera.usePostProcess = on;
        }
        info.textContent = [
            'post-process: camera.usePostProcess toggles every 3s',
            `now: usePostProcess=${camera.usePostProcess}`,
            `camera.postProcess slot: ${ppType} (PostProcess type not top-level exported)`,
            'effects list: not exposed — see article §2',
        ].join('\n');
    }
}
const info = document.querySelector('#info') as HTMLElement;
cameraNode.addComponent(Cycler);

window.__airApp = app;
app.run(scene);

console.log('[manual/post-processing] running on cocosair');
```

---

上一篇：[每帧更新（How to update Things）](how-to-update-things.md) ｜ 下一篇：[矩阵变换（Matrix Transformations）](matrix-transformations.md)
