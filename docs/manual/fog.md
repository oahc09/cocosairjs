# 雾（Fog）

> 用距离混色把远处物体溶进雾色，制造纵深感和"世界边界"。
> 配套可运行示例：[`examples/manual-fog/`](examples/manual-fog/)（六个纵深立方体 + 品红线性雾，每 3s 开关做 A/B 对照）。

AIR 的雾是**场景级**配置，入口 `scene.globals.fog`（`FogInfo`，d.ts 20764），不需要逐材质开关——
材质的雾实现取决于shader与accurate设置，不能普遍说成逐片元雾。
`builtin-unlit` 默认使用顶点雾；当前accurate=true的单参调用存在断点。
大三角复现、Air专用片元雾变体与参数bypass见 [运行时雾合同](fog-runtime-contract.md)。

## 1. 三种雾型与参数

| `fog.type` 数值 | 类型                   | 关键参数                                            |
| --------------- | ---------------------- | --------------------------------------------------- |
| `0`             | LINEAR 线性雾          | `fogStart` / `fogEnd`：起雾与全雾距离，之间线性插值 |
| `1`             | EXP 指数雾             | `fogDensity`：浓度越大溶得越快                      |
| `2`             | EXP_SQUARED 指数平方雾 | `fogDensity`：比 EXP 更陡的近清远溶曲线             |

通用字段：`enabled`（总开关）、`fogColor`（雾色，**建议与相机 clearColor 同色**，否则地平线处会露馅）、
`accurate`（精确模式）。`FogType` 枚举与 `ShadowType` 一样**没有顶层导出**，用户代码写数值
（`src/cocos/render-scene/scene/fog.ts:40`：LINEAR=0）。

## 2. 基本用法

```js
// ---- 雾：场景级开关，入口是 scene.globals.fog ----
const fog = scene.globals.fog;
fog.enabled = true;
fog.type = 0; // FogType.LINEAR（枚举未顶层导出：0=LINEAR 1=EXP 2=EXP_SQUARED）
fog.fogColor = new Color(255, 0, 255, 255);
fog.fogStart = 4;
fog.fogEnd = 12;
```

示例故意用品红雾色把混色过程放大到不可能看错；实际项目里把 `fogColor` 设成与
`camera.clearColor` 一致（示例里是 `(20, 24, 32)` 系），远处物体就会"溶进背景"。

## 3. 实测读图

spike 对照（`docs/evidence/manual/fog-spike-off.png` vs `fog-spike-on.png`，同页同相机）：

- **off**：六个立方体各自原色（橙/绿/蓝/紫/黄/青），只有透视缩尺。
- **on**：最近一颗被稀释成淡粉，第二颗偏品红，第三颗起**完全等于雾色**——
  距离分级混色的直接证据，且 `builtin-unlit` 材质同样生效。

示例覆盖层实测（探针 dump）：

```
fog: LINEAR, fogColor=magenta, start=4 end=12
now: fog.enabled=true (toggles every 3s)
cube distances: 4, 7, 9, 12, 14, 17 (camera→cube, 世界单位)
on: 越远越接近雾色（品红）
```

距离 ≥ `fogEnd`（12）的后三颗在 on 相应当纯品红，与截图一致。

## 4. AIR 雾的注意点

- 雾配置走 `scene.globals.fog` 的**字段**（改字段而非换对象）：**不要**给 `scene.fog` 赋值
  （AIR 的 `Scene` 上没有这个成员，同 `shadows` 的坑，见 [阴影](shadows.md)）。
- 没有材质级豁免开关（做不到"这一颗物体不吃雾"），要让某些物体不吃雾只能靠分层/多相机。
- 指数雾用 `fogDensity` 控浓度；AIR 另提供 `accurate` 与高度雾字段（`fogTop` / `fogAtten`），
  可做顶端衰减的高度雾。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-fog        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-fog/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-fog
```

示例目录：`docs/manual/examples/manual-fog/`。
验证器 4/4：`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS（3.6s，子集运行 partial）；
本例在 `ANIMATED` 集合内，相机横移（`sin(t*0.6)*2.0`）保证任意 400ms 双帧不同。
截图 `docs/evidence/examples/manual-fog.png`；能力 spike 对照 `docs/evidence/manual/fog-spike-{on,off}.png`。

## 附：示例源码（逐字）

`examples/manual-fog/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Fog — 雾（docs/manual/fog.md）</title>
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

`examples/manual-fog/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Fog（雾）
 * 配套文章：docs/manual/fog.md
 *
 * 六个 unlit 彩色立方体沿纵深斜列排开（距离 4→14），线性雾 fogStart=4 / fogEnd=12、
 * 雾色品红：越远的立方体越接近雾色。每 3s 开关一次雾做 A/B 对照，
 * 相机沿 X 缓慢横移保证任意 400ms 双帧不同（frame-diff）。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
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

const scene = new Scene('fog');

// ---- 相机：横移运动让 frame-diff 有得比 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 3.0));
cameraNode.lookAt(new Vec3(0, 1.0, -8.0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 50;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 24, 32, 255);
camera.visibility = Layers.Enum.DEFAULT;

class Strafe extends Component {
    private _t: number;

    constructor() {
        super();
        this._t = 0;
    }
    update(dt: number): void {
        this._t += dt;
        this.node.setPosition(new Vec3(Math.sin(this._t * 0.6) * 2.0, 1.6, 3.0));
        this.node.lookAt(new Vec3(0, 1.0, -8.0));
    }
}
cameraNode.addComponent(Strafe);

// ---- 纵深斜列的六个立方体：距离递增 = 雾浓度递增 ----
const COLORS: Color[] = [
    new Color(235, 125, 65, 255),
    new Color(95, 205, 120, 255),
    new Color(65, 155, 235, 255),
    new Color(205, 95, 205, 255),
    new Color(240, 200, 90, 255),
    new Color(120, 220, 160, 255),
];
const DISTANCES: number[] = [];
for (let i = 0; i < 6; i++) {
    const z = -1 - i * 2.6;
    const cube = new Node(`Cube-${i}`);
    cube.layer = Layers.Enum.DEFAULT;
    cube.setPosition(new Vec3((i - 2.5) * 1.7, 1.2, z));
    scene.addChild(cube);
    const renderer = cube.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit' });
    material.setProperty('mainColor', COLORS[i]);
    renderer.material = material;
    DISTANCES.push(Math.round(3 - z));
}

// ---- 雾：场景级开关，入口是 scene.globals.fog ----
const fog = scene.globals.fog;
fog.enabled = true;
fog.type = 0; // FogType.LINEAR（枚举未顶层导出：0=LINEAR 1=EXP 2=EXP_SQUARED）
fog.fogColor = new Color(255, 0, 255, 255);
fog.fogStart = 4;
fog.fogEnd = 12;

const info = document.querySelector('#info') as HTMLElement;
function showFog(): void {
    info.textContent = [
        'fog: LINEAR, fogColor=magenta, start=4 end=12',
        `now: fog.enabled=${fog.enabled} (toggles every 3s)`,
        `cube distances: ${DISTANCES.join(', ')} (camera→cube, 世界单位)`,
        fog.enabled ? 'on: 越远越接近雾色（品红）' : 'off: 原色，无距离混色',
    ].join('\n');
}

class Cycler extends Component {
    private _t: number;
    private _on: boolean;

    constructor() {
        super();
        this._t = 0;
        this._on = true;
    }
    update(dt: number): void {
        this._t += dt;
        const on = Math.floor(this._t / 3) % 2 === 0;
        if (on !== this._on) {
            this._on = on;
            fog.enabled = on;
            showFog();
        }
    }
}
cameraNode.addComponent(Cycler);
showFog();

window.__airApp = app;
app.run(scene);

console.log('[manual/fog] running on cocosair');
```

---

上一篇：[阴影（Shadows）](shadows.md) ｜ 下一篇：[渲染目标（Render Targets）](rendertargets.md)
