# 相机（Cameras）

> 透视与正交两种投影、取景参数、位置与朝向。
> 配套可运行示例：[`examples/manual-cameras/`](examples/manual-cameras/)（同一台相机每 3s 切换投影，五个等尺寸立方体当"投影差异放大镜"）。

AIR 里相机是一个普通组件 `Camera`，挂在 `Node` 上。**取景四件套**是：
`projection`（投影类型）、`fov` 或 `orthoHeight`（视场/取景高）、`near`、`far`（裁剪面）。
再加节点自身的 `position` 与朝向，就完整决定了一帧画面。

## 1. 透视 vs 正交

|          | `PERSPECTIVE`           | `ORTHO`（正交）                     |
| -------- | ----------------------- | ----------------------------------- |
| 生效参数 | `fov`（垂直视场角，度） | `orthoHeight`（取景半高，世界单位） |
| 近大远小 | 有                      | 无                                  |
| 典型用途 | 第三人称/场景漫游       | UI 叠层、2D、工程图、影子贴图       |

注意枚举值是 `Camera.ProjectionType.ORTHO`（不是 `ORTHOGRAPHIC`）。切换投影不需要重建相机，
直接改 `projection` 即可，示例每 3s 切一次：

```js
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45; // 仅透视生效：垂直视场角（度）
camera.orthoHeight = 2.6; // 仅正交生效：取景半高（世界单位）
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;
```

```js
        const persp = Math.floor(this._t / 3) % 2 === 0;
        if (persp !== this._persp) {
            this._persp = persp;
            camera.projection = persp ? Camera.ProjectionType.PERSPECTIVE : Camera.ProjectionType.ORTHO;
            showProjection();
        }
```

`near`/`far` 两种投影都生效：它们决定深度缓冲的精度分布，`near` 贴得太近或 `far` 拉得太远
都会让中远距离出现深度抖动（z-fighting）。默认 `0.1 / 100` 对桌面演示足够。

正交相机默认 `orthoWidth = 0`，半宽由半高乘窗口宽高比决定；设置有限正数可独立指定取景半宽，恢复 `0` 即回到自动模式。负数或非有限值抛 `AIR_E_ORTHO_WIDTH`，保留原值。透视投影不使用这个参数。屏幕对齐的原生 `Canvas` 自动维护 UI 相机的两个半轴；设计分辨率在横竖屏、DPR 与输入坐标中的用法见[设计视口与控制方向](design-viewport-and-controls.md)。

## 2. 位置与朝向：lookAt 每帧都要重算

相机看向目标用 `node.lookAt(target)`。一旦相机移动，朝向不会自动跟随，必须再调一次——
示例的公转组件把"改位置 + 重算朝向"绑在一起：

```ts
class Orbit extends Component {
    update(dt: number): void {
        const node = this.node;
        const a = node.eulerAngles.y + dt * 12;
        node.setPosition(new Vec3(Math.sin((a * Math.PI) / 180) * 7, 2.4, Math.cos((a * Math.PI) / 180) * 7));
        node.lookAt(new Vec3(0, 0.8, 0));
    }
}
cameraNode.addComponent(Orbit);
```

## 3. 多相机与可见性

`camera.visibility` 是层掩码：只渲染命中该层的节点（手册惯例 `Layers.Enum.DEFAULT`，
见 [创建场景](creating-a-scene.md)）。`camera.priority` 决定多相机的渲染顺序，
配合 `clearFlags` 可以做到"主相机清屏 + 副相机只叠深度/不清色"的分屏或画中画。
双相机实例见仓库自带示例 `examples/camera-multi`；本篇示例聚焦单相机投影差异，不重复造轮子。

## 4. 实测读图：投影差异一眼可辨

示例把五个**等尺寸**立方体沿 X 排成一列，相机绕队列公转。分相截图（取证临时脚本）：

- **PERSPECTIVE 相**：队列靠近相机的一端明显更大、远端更小，且远端立方体被近端部分遮挡。
- **ORTHO 相**：五个立方体屏幕尺寸完全一致，只剩位置错开——正交无近大远小的直接证据。

覆盖层实测（探针 dump，ORTHO 相）：

```
cameras: same camera, projection toggles every 3s
now: ORTHO orthoHeight=2.6  near=0.1 far=100
camera pos: (4.1, 2.4, 5.7) orbit 12°/s, lookAt (0,0.8,0)
orthographic: 完全等大（无近大远小）
```

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-cameras        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-cameras/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-cameras
```

示例目录：`docs/manual/examples/manual-cameras/`。
验证结果见 `docs/evidence/manual-examples-verified.json`（manual-cameras 行）与截图
`docs/evidence/examples/manual-cameras.png`；本例在验证器 `ANIMATED` 集合内，额外跑 `frame-diff`
（公转 12°/s 保证任意 400ms 间隔双帧不同）。

## 附：示例源码（逐字）

`examples/manual-cameras/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Cameras — 相机（docs/manual/cameras.md）</title>
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

`examples/manual-cameras/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Cameras（相机）
 * 配套文章：docs/manual/cameras.md
 *
 * 同一台相机每 3s 在 PERSPECTIVE(fov=45) 与 ORTHO(orthoHeight=2.6) 之间切换，
 * 五个等尺寸立方体沿 X 排成一列：透视下近大远小、正交下完全等大，差异一眼可辨。
 * 相机绕原点缓慢公转（12°/s）并始终 lookAt 队列中心，覆盖层实时打印投影参数。
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

const scene = new Scene('cameras');

// ---- 相机：projection / fov / orthoHeight / near / far 是取景四件套 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.4, 7.0));
cameraNode.lookAt(new Vec3(0, 0.8, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45; // 仅透视生效：垂直视场角（度）
camera.orthoHeight = 2.6; // 仅正交生效：取景半高（世界单位）
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光让立方体有明暗面 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 五个等尺寸立方体沿 X 排队：深度差异 = 投影差异的放大镜 ----
const COLORS: Color[] = [
    new Color(235, 125, 65, 255),
    new Color(95, 205, 120, 255),
    new Color(65, 155, 235, 255),
    new Color(205, 95, 205, 255),
    new Color(240, 200, 90, 255),
];
for (let i = 0; i < 5; i++) {
    const cube = new Node(`Cube-${i}`);
    cube.layer = Layers.Enum.DEFAULT;
    cube.setPosition(new Vec3(-3.2 + i * 1.6, 0.8, 0));
    scene.addChild(cube);
    const renderer = cube.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 0.9, height: 0.9, length: 0.9 }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', COLORS[i]);
    renderer.material = material;
}

// ---- 相机公转 + 投影循环 ----
const info = document.querySelector('#info') as HTMLElement;

class Orbit extends Component {
    update(dt: number): void {
        const node = this.node;
        const a = node.eulerAngles.y + dt * 12;
        node.setPosition(new Vec3(Math.sin((a * Math.PI) / 180) * 7, 2.4, Math.cos((a * Math.PI) / 180) * 7));
        node.lookAt(new Vec3(0, 0.8, 0));
    }
}
cameraNode.addComponent(Orbit);

function showProjection(): void {
    const isPersp = camera.projection === Camera.ProjectionType.PERSPECTIVE;
    const p = cameraNode.position;
    info.textContent = [
        'cameras: same camera, projection toggles every 3s',
        `now: ${isPersp ? 'PERSPECTIVE fov=45' : 'ORTHO orthoHeight=2.6'}  near=${camera.near} far=${camera.far}`,
        `camera pos: (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) orbit 12°/s, lookAt (0,0.8,0)`,
        isPersp ? 'perspective: 近大远小（队列两端尺寸不同）' : 'orthographic: 完全等大（无近大远小）',
    ].join('\n');
}

class Cycler extends Component {
    private _t = 0;
    private _persp = true;

    constructor() {
        super();
        this._t = 0;
        this._persp = true;
    }
    update(dt: number): void {
        this._t += dt;
        const persp = Math.floor(this._t / 3) % 2 === 0;
        if (persp !== this._persp) {
            this._persp = persp;
            camera.projection = persp ? Camera.ProjectionType.PERSPECTIVE : Camera.ProjectionType.ORTHO;
            showProjection();
        }
    }
}
cameraNode.addComponent(Cycler);
showProjection();

window.__airApp = app;
app.run(scene);

console.log('[manual/cameras] running on cocosair');
```

---

上一篇：[光源（Lights）](lights.md) ｜ 下一篇：[阴影（Shadows）](shadows.md)

## Code First 相机接口补充（2026-09-26）

公开组件使用 `camera.worldToScreen(worldPos, out?)` 与 `camera.screenToWorld(screenPos, out?)`；渲染相机 `camera.camera` 上的对应方法把 out 放在首参，不能混用。屏幕原点在左下，Canvas2D 采样需转换 y。透视相机的两种转换使用不同深度口径：投影 z 是非线性深度，反投影 z 是 near→far 的线性比例。`examples/render-composite/src/main.ts` 提供深度换算和往返误差断言。

需要渲染窗口尺寸时读取公开的 `camera.camera.width/height/aspect`。普通响应式页面优先让引擎管理窗口；渲染目标大小用 `RenderTexture.reset`，不要给组件添加不存在的 resize 属性。
