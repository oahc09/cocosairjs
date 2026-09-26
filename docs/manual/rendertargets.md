# 渲染目标（Render Targets）

> 把相机输出渲进纹理，再把纹理当普通贴图用
> （镜像/小窗/后处理的基础件）。
> 配套可运行示例：[`examples/manual-render-targets/`](examples/manual-render-targets/)。
> **本篇状态：PARTIAL。** RT 的创建/绑定/恢复生命周期可跑通（验证器 4/4），但**快照保真度在本环境
> 未达成**——quad 上采样到的是均灰纹理而非场景快照，见 §3 证据。不作保真承诺。

## 1. API 面（d.ts 实测）

三件套：

```js
const rt = new RenderTexture();
rt.reset({ width: 256, height: 256 });
```

```js
camera.targetTexture = rt; // 此后相机输出进 RT，屏幕暂黑
```

```js
camera.targetTexture = null; // 恢复屏幕输出
```

拿到的 `rt` 就是普通纹理对象，可作为 `mainTexture` 喂给任意材质（配 `USE_ALBEDO_MAP` 宏，
见 [纹理一篇](textures.md)）。d.ts 28510 的官方示例还给出 `rt.readPixels()` 回读像素的用法
（配 `saveImageData` 落盘，native 侧能力，浏览器端不适用）。

## 2. 示例结构：冻结快照 vs 实时画面

示例的时间线：

1. `t < 1.2s`：正常渲染（右侧立方体自转 60°/s）。
2. `1.2s ≤ t < 1.5s`：`camera.targetTexture = rt`，相机输出改道进 256×256 RT，**屏幕暂黑**——
   这是改道期的固有行为，不是 bug。
3. `t ≥ 1.5s`：`targetTexture = null` 恢复屏幕；新建左侧 quad（`plane` 绕 X 转 90° 立起来面向相机），
   unlit 材质 + `USE_ALBEDO_MAP` + `mainTexture = rt`。

```ts
class Capture extends Component {
    private _t = 0;
    private _stage = 0;

    constructor() {
        super();
        this._t = 0;
        this._stage = 0;
    }
    update(dt: number): void {
        this._t += dt;
        if (this._stage === 0 && this._t >= 1.2) {
            this._stage = 1;
            camera.targetTexture = rt; // 此后相机输出进 RT，屏幕暂黑
            showState('capturing → RT');
        } else if (this._stage === 1 && this._t >= 1.5) {
            this._stage = 2;
            camera.targetTexture = null; // 恢复屏幕输出
            showSnapshot();
            showState('snapshot on quad vs live cube');
        }
    }
}
```

## 3. 实测记录（PARTIAL 判据）

验证器 4/4 PASS（`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff`，3.9s，子集 partial），
但目检截图 `docs/evidence/examples/manual-render-targets.png` 显示两个未达项：

- **左侧 quad 为均一浅灰**，不是 t=1.2s 的场景快照（快照应含深蓝立方体与暗背景）。
  即 RT 要么未被真正写入、要么回采样路径在当前构建 + headless swiftshader 下不保真。
- **恢复屏幕输出后右侧立方体仅环境光亮度**（对比 [相机一篇](cameras.md) 同写法立方体有明确明暗面），
  提示 `targetTexture` 往返可能扰动管线状态；归因未定，不作断言。

因此本篇只承诺"生命周期可跑、不报错、frame-diff 通过"，**不承诺快照可见保真**；
待管线修复后按 §2 时间线复测，将本篇升级为 FULL 并补保真截图。

## 4. 行为要点备忘

- 改道挂在**相机**上（`camera.targetTexture`），多相机可各自改道，没有 renderer 级全局状态要维护。
- `RenderTexture` 自身即纹理，没有独立的 `.texture` 成员要取——直接赋给 `mainTexture` 就能采样。
- 屏幕暂黑期（改道中）的语义就是：该相机不再画到画布，输出全部进 RT。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-render-targets
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-render-targets
```

示例目录：`docs/manual/examples/manual-render-targets/`。
验证器 4/4 PASS（3.9s，子集运行 partial）；本例在 `ANIMATED` 集合内（立方体自转保证双帧不同）。
截图 `docs/evidence/examples/manual-render-targets.png`（即 §3 的 PARTIAL 判据图）。

## 附：示例源码（逐字）

`examples/manual-render-targets/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Render Targets — 渲染目标（docs/manual/rendertargets.md）</title>
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

`examples/manual-render-targets/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Render Targets（渲染目标）
 * 配套文章：docs/manual/rendertargets.md
 *
 * 开场 1.2s 把相机输出重定向到 256×256 的 RenderTexture（camera.targetTexture），
 * 抓一帧"冻结快照"后恢复屏幕输出，并把这张 RT 作为 mainTexture 贴到左侧 quad 上；
 * 右侧立方体继续实时自转——同框对比"冻结的 RT"与"实时画面"。
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
    RenderTexture,
    director,
    Director,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('rendertargets');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.4, 6.0));
cameraNode.lookAt(new Vec3(0, 1.1, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 24, 32, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 30000;

// ---- 右侧：实时自转立方体 ----
const cubeNode = new Node('LiveCube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(1.6, 1.2, -0.5));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(65, 155, 235, 255));
cubeRenderer.material = cubeMaterial;

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 60, 0);
    }
}
cubeNode.addComponent(Spinner);

// ---- 渲染目标：256×256 ----
const rt = new RenderTexture();
rt.reset({ width: 256, height: 256 });

// ---- 左侧：贴 RT 的 quad（快照完成后才创建） ----
let quadNode: Node | null = null;
const snapshotProbe = { ready: false, ok: false, checks: [] as { name: string; pass: boolean; detail: string }[] };
(window as any).__manualProbe = () => snapshotProbe;

function verifySnapshot(): void {
    const corners = [-1, 1].flatMap((x) =>
        [-1, 1].map((y) => camera.worldToScreen(new Vec3(-1.7 + x * 1.1, 1.2 + y * 1.1, 1.2))),
    );
    const left = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))));
    const right = Math.min(canvas.width, Math.ceil(Math.max(...corners.map((p) => p.x))));
    const top = Math.max(0, Math.floor(canvas.height - Math.max(...corners.map((p) => p.y))));
    const bottom = Math.min(canvas.height, Math.ceil(canvas.height - Math.min(...corners.map((p) => p.y))));
    const sample = document.createElement('canvas');
    sample.width = canvas.width;
    sample.height = canvas.height;
    const ctx = sample.getContext('2d')!;
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(left, top, right - left, bottom - top).data;
    let blue = 0;
    for (let i = 0; i < data.length; i += 4) {
        if (data[i + 2] > data[i] + 30 && data[i + 2] > 60) blue++;
    }
    snapshotProbe.checks.push({ name: 'snapshot-contains-blue-cube', pass: blue > 20, detail: 'blue pixels=' + blue });
    snapshotProbe.ok = snapshotProbe.checks.every((c) => c.pass);
    snapshotProbe.ready = true;
}
function showSnapshot(): void {
    quadNode = new Node('SnapshotQuad');
    quadNode.layer = Layers.Enum.DEFAULT;
    quadNode.setPosition(new Vec3(-1.7, 1.2, 1.2));
    quadNode.setRotationFromEuler(90, 0, 0); // plane 法线 +Y → 转到 +Z 面向相机
    scene.addChild(quadNode);
    const renderer = quadNode.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.plane({ width: 2.2, length: 2.2 }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
    material.setProperty('mainTexture', rt);
    renderer.material = material;
    director.once(Director.EVENT_AFTER_DRAW, verifySnapshot);
}

const info = document.querySelector('#info') as HTMLElement;
function showState(phase: string): void {
    info.textContent = [
        'rendertargets: 256x256 RenderTexture via camera.targetTexture',
        `phase: ${phase}`,
        'left quad = frozen snapshot taken at t=1.2s',
        'right cube = live scene, spinning 60°/s',
    ].join('\n');
}

class Capture extends Component {
    private _t = 0;
    private _stage = 0;

    constructor() {
        super();
        this._t = 0;
        this._stage = 0;
    }
    update(dt: number): void {
        this._t += dt;
        if (this._stage === 0 && this._t >= 1.2) {
            this._stage = 1;
            camera.targetTexture = rt; // 此后相机输出进 RT，屏幕暂黑
            showState('capturing → RT');
        } else if (this._stage === 1 && this._t >= 1.5) {
            this._stage = 2;
            camera.targetTexture = null; // 恢复屏幕输出
            showSnapshot();
            showState('snapshot on quad vs live cube');
        }
    }
}
cameraNode.addComponent(Capture);
showState('live (pre-capture)');

window.__airApp = app;
app.run(scene);

console.log('[manual/rendertargets] running on cocosair');
```

---

上一篇：[雾（Fog）](fog.md) ｜ 下一篇：[自定义几何（Custom BufferGeometry）](custom-buffergeometry.md)
