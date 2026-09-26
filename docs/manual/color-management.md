# 颜色管理（Color Management）

> 颜色空间、伽马、色调映射这套"颜色从哪来、到哪去"的规矩。
> 配套可运行示例：[`examples/manual-color-management/`](examples/manual-color-management/)（hex 色板排 + 逐帧 lerp 渐变带 + 色调映射 A/B 开关）。

**状态：PARTIAL。** AIR 的导出面里**没有**颜色空间管理 API（全 d.ts grep `ColorSpace|colorSpace|gamma` 零命中；
顶层颜色相关导出仅 `Color` / `ColorKey` / `color` 三个，浏览器侧探针实测）。
能用的是：`Color` 工具类（hex/HSV/插值/运算）、以及场景级色调映射开关 `scene.globals.postSettings.toneMappingType`
（枚举仅 DEFAULT/LINEAR 两值，且本环境实测**无像素级效果**，见 §3）。本篇如实写"有什么、没有什么"，不伪装色彩管理管线。

## 1. 有什么：Color 工具面

`Color`（d.ts 11061）静态方法实测清单（浏览器侧 `Object.getOwnPropertyNames(Color)`）：
`clone / copy / set / toVec4 / fromVec4 / fromHEX / add / subtract / multiply / divide / scale / lerp /
toArray / fromArray / fromUint32 / toUint32 / strictEquals / equals / hex`（另有别名 `sub/mul/div/exactEquals/fromHex`）。
实例面：`r g b a`（别名 `x y z w`）、`clone / equals / lerp / toString / toCSS / fromHEX / toHEX / toRGBValue / fromHSV / toHSV / set / multiply`。

```js
    const c = new Color();
    c.fromHEX(hex);
    patch.material.setProperty('mainColor', c);
```

**实测坑两条**：

- `fromHEX` 吃 `'#rrggbb'` 带井号，但实例 `toHEX()` **返回不带井号**的 `'eb7d41'`（覆盖层 roundtrip 实测）——
  往返字符串拼接时要自己补 `#`。
- AIR 给的是 **HSV**（`fromHSV` / `toHSV`），不是 HSL；做色相环动画时注意饱和度/明度语义不同。

逐帧插值用静态 `Color.lerp(out, from, to, ratio)`（示例下排渐变带，每帧写回 `mainColor`）：

```js
            const t = Math.min(1, Math.max(0, lastPing + (i - 3.5) * 0.06));
            Color.lerp(this._tmp, RAMP_A, RAMP_B, t);
            rampPatches[i].material.setProperty('mainColor', this._tmp);
```

色调映射入口（场景级，与 `fog` / `shadows` 同在 `scene.globals`，d.ts 21149 / 21004）：

```js
const post = scene.globals.postSettings;
post.toneMappingType = 0;
```

枚举 `ToneMappingType = { DEFAULT: 0, LINEAR: 1 }`（module.js 36167）**不在顶层导出**，
运行时可达路径是 `renderer.scene.ToneMappingType`（探针实测返回 `{DEFAULT:0, LINEAR:1}`）；
用户代码写数值 0/1 即可，同 `ShadowType` / `FogType` 的套路（见 [阴影](shadows.md)、[雾](fog.md)）。

## 2. 没有什么（诚实清单）

| 能力项                          | AIR 现状                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------- |
| 颜色管理总开关                  | 无对应物（导出面不存在）                                                          |
| 线性工作空间                    | 无用户级开关；管线内部行为不暴露                                                  |
| 输出色彩空间（sRGB 编码）       | 无对应物                                                                          |
| 贴图色彩空间标注（sRGB/Linear） | `Texture2D` 上无 colorSpace 字段（grep 零命中）                                   |
| HSL 取色                        | 只有 HSV（`fromHSV` / `toHSV`）                                                   |
| 色调映射算子                    | 仅 `postSettings.toneMappingType` 的 DEFAULT/LINEAR 两值，无 ACES/Reinhard 等预设 |

实践含义：**把 `Color` 的 0–255 分量当作显示参考值（display-referred）直接用**——
示例上排 unlit 色板的截图色相与 hex 意图目检一致（§3），没有可见的二次空间转换；
不要指望"线性空间算完再编码"的工作流，AIR 当前不给这个旋钮。

## 3. 实测读图与读数

示例验证器 4/4：`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS（3.7s，子集运行 partial；
渐变带逐帧变色保证任意 400ms 双帧不同）。截图 `docs/evidence/examples/manual-color-management.png`：
上排六块 hex 色板色相与意图一致（橙/绿/蓝/品红/黄/薄荷），下排渐变带在 t≈0.97 处整体偏 B 端黄、左起微渐变——与覆盖层读数自洽。

覆盖层实测（探针 dump）：

```
exports: Color / ColorKey / color only — no ColorManagement, no ColorSpace
hex row: #eb7d41 #5fcd78 #419beb #cd5fcd #f0c85a #78dca0 (instance fromHEX → mainColor)
hex roundtrip: #eb7d41 → eb7d41   hsv: h=0.06 s=0.72 v=0.92
lerp ramp: Color.lerp(A,B,t) ping-pong t=0.97 (per-frame)
toneMapping: postSettings.toneMappingType=0 (0=DEFAULT 1=LINEAR, toggles every 3s)
```

**色调映射 A/B spike**（`.tmp-tone-spike.cjs`，同页同相机仅 tone 值不同，固化为
`docs/evidence/manual/tone-spike-default.png` / `tone-spike-linear.png`）：两帧 **字节完全相同**
（sha256 前 16 位均 `3f5f614b8278170e`），spike 页确有内容（unlit 绿板 + standard 立方体目检在位）——
结论：本环境（forward 管线 + headless swiftshader）下 `toneMappingType` 0/1 **无像素级差异**，
赋值与读回正常但不承诺可视效果。spike 页立方体同样偏暗（方向光贡献弱），与 [lights.md §4](lights.md) 的环境记录一致。

## 4. 实现备忘

- AIR 的颜色管线**无全局单例、无每资产色彩空间标注**，颜色值从 `Color` 直达材质 uniform，
  中间没有用户可见的空间转换层。
- `Color` 分量是 **0–255 整数语义**（`new Color(235, 125, 65, 255)`），不是 0–1 浮点——
  参考 0–1 分量的素材/代码时第一件事是乘 255。
- 色调映射：入口在 `scene.globals.postSettings`，仅 DEFAULT/LINEAR 两值，且本环境无视觉效果（§3）。
- HSV vs HSL 见 §1 坑条；做"色相旋转"类效果时两者公式不通用。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-color-management        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-color-management/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-color-management
```

示例目录：`docs/manual/examples/manual-color-management/`。
验证器 4/4 全 PASS（3.7s，子集运行 partial）；截图 `docs/evidence/examples/manual-color-management.png`；
tone spike 对照 `docs/evidence/manual/tone-spike-{default,linear}.png`（字节相同）；覆盖层探针 dump 见 §3。

## 附：示例源码（逐字）

`examples/manual-color-management/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Color Management — 颜色管理（docs/manual/color-management.md）</title>
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

`examples/manual-color-management/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Color Management（颜色管理）
 * 配套文章：docs/manual/color-management.md
 *
 * 上排六块 unlit 色板：Color 实例 fromHEX('#rrggbb') → mainColor，验证 hex 工作流；
 * 下排八块 unlit 色板：Color.lerp(A, B, t)  ping-pong 逐帧插值，验证插值工作流；
 * 每 3s 在 postSettings.toneMappingType 0(DEFAULT)/1(LINEAR) 间切换做 A/B 对照。
 * 全页 unlit：颜色不经过光照，所见即 Color 值本身。
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

const scene = new Scene('color-management');

// ---- 相机：正对色板墙 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.5, 8.5));
cameraNode.lookAt(new Vec3(0, 1.5, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 24, 32, 255);
camera.visibility = Layers.Enum.DEFAULT;

const quadMesh = utils.createMesh(primitives.quad());

type Patch = { node: Node; material: Material };

function makePatch(name: string, x: number, y: number, w: number, h: number): Patch {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, y, 0));
    node.setScale(new Vec3(w, h, 1));
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = quadMesh;
    const material = new Material();
    material.initialize({ effectName: 'builtin-unlit' });
    renderer.material = material;
    return { node, material };
}

// ---- 上排：hex 色板（fromHEX → mainColor） ----
const HEXES: string[] = ['#eb7d41', '#5fcd78', '#419beb', '#cd5fcd', '#f0c85a', '#78dca0'];
HEXES.forEach((hex, i) => {
    const patch = makePatch(`Hex-${i}`, (i - 2.5) * 1.35, 2.3, 1.15, 1.15);
    const c = new Color();
    c.fromHEX(hex);
    patch.material.setProperty('mainColor', c);
});

// ---- 下排：lerp 渐变带（逐帧 Color.lerp） ----
const RAMP_A = new Color(30, 60, 160, 255);
const RAMP_B = new Color(250, 220, 90, 255);
let lastPing = 0;
const rampPatches: Patch[] = [];
for (let i = 0; i < 8; i++) {
    rampPatches.push(makePatch(`Lerp-${i}`, (i - 3.5) * 1.05, 0.7, 0.95, 0.95));
}

class Ramp extends Component {
    private _t = 0;
    private _tmp: Color;

    constructor() {
        super();
        this._t = 0;
        this._tmp = new Color();
    }
    update(dt: number): void {
        this._t += dt;
        lastPing = (Math.sin(this._t * 0.8) + 1) * 0.5;
        for (let i = 0; i < rampPatches.length; i++) {
            const t = Math.min(1, Math.max(0, lastPing + (i - 3.5) * 0.06));
            Color.lerp(this._tmp, RAMP_A, RAMP_B, t);
            rampPatches[i].material.setProperty('mainColor', this._tmp);
        }
    }
}

// ---- 色调映射 A/B：postSettings.toneMappingType 0=DEFAULT 1=LINEAR ----
const post = scene.globals.postSettings;
post.toneMappingType = 0;

// ---- 覆盖层 ----
const info = document.querySelector('#info') as HTMLElement;
const probe = new Color();
probe.fromHEX('#eb7d41');
const hexRoundTrip = probe.toHEX();
const hsv = probe.toHSV({ h: 0, s: 0, v: 0 });
function showColor(ping: number, tone: number): void {
    info.textContent = [
        'exports: Color / ColorKey / color only — no ColorManagement, no ColorSpace',
        `hex row: ${HEXES.join(' ')} (instance fromHEX → mainColor)`,
        `hex roundtrip: #eb7d41 → ${hexRoundTrip}   hsv: h=${hsv.h.toFixed(2)} s=${hsv.s.toFixed(2)} v=${hsv.v.toFixed(2)}`,
        `lerp ramp: Color.lerp(A,B,t) ping-pong t=${ping.toFixed(2)} (per-frame)`,
        `toneMapping: postSettings.toneMappingType=${tone} (0=DEFAULT 1=LINEAR, toggles every 3s)`,
    ].join('\n');
}

class Cycler extends Component {
    private _t = 0;
    private _tone = 0;

    constructor() {
        super();
        this._t = 0;
        this._tone = 0;
    }
    update(dt: number): void {
        this._t += dt;
        const tone = Math.floor(this._t / 3) % 2;
        if (tone !== this._tone) {
            this._tone = tone;
            post.toneMappingType = tone;
        }
        showColor(lastPing, this._tone);
    }
}
cameraNode.addComponent(Ramp);
cameraNode.addComponent(Cycler);
showColor(0, 0);

window.__airApp = app;
app.run(scene);

console.log('[manual/color-management] running on cocosair');
```

---

上一篇：[动画系统（Animation System）](animation-system.md) ｜ 下一篇：[创建 VR 内容（How to create VR content）](how-to-create-vr-content.md)
