# Installation 安装与引入

> Cocos AIR 提供 ESM SDK，外部运行时依赖为零。可以安装发布包并使用打包器，也可以从源码构建后通过 importmap 加载。浏览器渲染要求 WebGL 2。
> 本篇把"从零到一个能看见的立方体"这条最短链路走完，并教你怎么在页面上确认引擎版本、平台与渲染后端。

> 下一篇：[Creating a Scene 创建场景](./creating-a-scene.md)

## 引入要点

| 做法                                                     | 说明                                                                                   |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `npm install && npm run build`                           | 从源码生成开发 bundle 与 source map；声明需另跑 `build:dts` |
| `importmap: { "cocosair": "/build/cocosair.module.js" }` | 裸说明符统一叫 `cocosair`                                                              |
| `import { createAirApp, Scene, Node } from 'cocosair'`   | 使用下文 importmap 别名；SDK 提供具名导出，**没有默认导出**          |
| `await createAirApp({ canvas })`                         | 异步；渲染器由 app 托管，你拿不到 renderer 对象                                        |

## 1. 获取构建产物

发布包可用后，在使用打包器的项目中执行 `npm install cocosair.js@1.0.0`，
然后以 `import { createAirApp, Scene } from 'cocosair.js'` 引入。
在动态导入引擎前创建 `#GameCanvas`；它是模块初始化的前置条件。
该 npm 包名与下文 importmap 中的 `cocosair` 别名不同。
当前公开发布仍受许可与验收门禁约束，状态见 [验证与发布检查](../reference/verification.md)。

```bash
git clone <repo> && cd cocosair.js
npm install
npm run build          # → build/cocosair.module.js + .map
npm run build:dts      # → build/cocosair.module.d.ts
```

发布包的运行时入口指向无 source map 的副本，声明入口单独保留：

```json
{
  "name": "cocosair.js",
  "version": "1.0.0",
  "main": "build/npm/cocosair.module.js",
  "module": "build/npm/cocosair.module.js",
  "types": "./build/cocosair.module.d.ts",
  "exports": {
    ".": {
      "types": "./build/cocosair.module.d.ts",
      "import": "./build/npm/cocosair.module.js",
      "default": "./build/npm/cocosair.module.js"
    }
  }
}
```

只有 ESM 一种形态（另有 `npm run build:min` 出压缩版、`npm run build:system` 出 SystemJS 版），**没有 UMD/CJS 构建**，所以不能用 `<script src="cocosair.js">` 这种老式引入。

## 2. importmap 引入

浏览器侧统一用 importmap，把裸说明符 `cocosair` 映射到产物路径：

```html
        <script type="importmap">
            { "imports": { "cocosair": "/build/cocosair.module.js" } }
        </script>
```

之后代码里就可以写 `from 'cocosair'`。本仓库的 dev server（`npm run dev`）已经把 `/build/*` 挂在 web 根上，所以手册示例里的这个 importmap 在 `http://127.0.0.1:7454/manual/examples/...` 下能直接解析；换成任何以仓库根为 web 根的静态服务器同样成立。

如果你用打包器（Vite/Rollup/esbuild），把 `cocosair` 配成 alias 指向 `build/cocosair.module.js` 即可，importmap 就不需要了。

## 3. HTML 骨架与 GameCanvas 约束

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Installation — 安装与引入（docs/manual/installation.md）</title>
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
                background: rgba(10, 16, 26, 0.72);
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

两条硬性约束：

1. **`#GameCanvas` 必须在 `import 'cocosair'` 执行前就存在于 DOM。** 引擎的 screen-adapter 是模块顶层单例，import 那一刻就会去查画布；先 import 再插画布，你会得到一个不报错但永远不渲染的页面。把 `<canvas>` 写在 `<script type="module">` 之前是最简单的保证。
2. **DOM 结构照官方 Web 模板**（`#GameDiv` > `#Cocos3dGameContainer` > `#GameCanvas`）。`createAirApp` 内部有 `ensureCanvasDOM`：如果你的画布已经按模板挂好，它不做任何改动；如果结构不对，它会补齐，但自适应行为可能与你预期不同。

`#info` 那个 overlay 是本篇特有的，用来把"引擎到底跑在什么上面"显示出来 —— 见第 5 节。

## 4. createAirApp 的选项

```ts
export interface AirAppOptions {
        /** canvas 元素，或 CSS selector 字符串（如 '#game'）。 */
        canvas: HTMLCanvasElement | string;
        /** 可选：强制渲染模式（3 = HEADLESS，供测试/无头环境使用）。 */
        renderMode?: number;
        /**
         * 可选：交付期 3D 物理后端（V1.2 owner 批复 #8(a)，additive；默认 `'builtin'`）。
         * `'cannon'` 使用 cannon.js 全量刚体模拟（纯 JS，默认 bundle 已编入）；
         * `'builtin'` 为官方内置离散碰撞检测器（不模拟）。须在 createAirApp 内 game.init 前生效。
         */
        physics?: "builtin" | "cannon";
    }
```

当前公开选项有三个：

| 选项         | 类型                          | 说明                                                                                                                  |
| ------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `canvas`     | `HTMLCanvasElement \| string` | 传字符串时按 CSS selector 查；查不到 `<canvas>` 会抛 `createAirApp: selector '...' did not match a <canvas> element.` |
| `renderMode` | `number?`                     | 只在无头/测试场景用（`3` = HEADLESS）。浏览器里正常渲染不要传                                                         |
| `physics`    | `'builtin' \| 'cannon'`       | 可选的 3D 物理后端；默认 `builtin` 仅碰撞检测，`cannon` 提供刚体动力学，须在启动时选择                                |

`createAirApp` 内部还会用固定参数初始化引擎：`debugMode: DebugMode.ERROR`、`settingsPath: ''`（无远程 settings.json）、默认 legacy 渲染管线。也就是说 **AIR 不读项目配置文件**，一切都在代码里。

返回的 `app` 只有 `run(scene)`、`getScene()` 两个方法和 `canvas` 属性 —— 没有 `pause`、`destroy`、`resize`。渲染循环、尺寸适配都由引擎托管（尺寸变化见 [Responsive Design](./responsive.md)）。

```ts
const app = await createAirApp({ canvas });
```

顶层 `await` 要求脚本是 ES module（`<script type="module">`）。

## 5. 确认引擎版本、平台与渲染后端

不要硬编码版本号，直接查：

```ts
// ---- overlay：只打印真的查得到的字段，查不到就不显示（不伪造能力） ----
const device = director.root && director.root.device;
const caps = device && device.capabilities;
const facts = {
    VERSION,
    'sys.platform': sys.platform,
    'sys.browserType': sys.browserType,
    'sys.os': sys.os,
    'sys.isMobile': sys.isMobile,
    device: device && device.constructor && device.constructor.name,
    maxTextureSize: caps && caps.maxTextureSize,
    maxColorRenderTargets: caps && caps.maxColorRenderTargets,
    canvas: `${canvas.width}x${canvas.height}`,
    devicePixelRatio: screen.devicePixelRatio,
    frameRate: game.frameRate,
};
(document.querySelector('#info') as HTMLElement).textContent = Object.entries(facts)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
```

在桌面 Chrome + 软件光栅化下，这段实测输出（`docs/evidence/examples/manual-installation.png` 里可见）：

```
VERSION: 4.0.0
sys.platform: DESKTOP_BROWSER
sys.browserType: chrome
sys.os: Windows
sys.isMobile: false
device: WebGL2Device
maxTextureSize: 16384
maxColorRenderTargets: 0
canvas: 640x480
devicePixelRatio: 1
frameRate: 60
```

几点值得注意：

- `VERSION` 是 `4.0.0`（引擎基线），而 `AIR_VERSION` 与 `package.json` 的 `version` 是 `1.0.0`（AIR SDK 版本）—— 两个版本号含义不同，别混。
- `device.constructor.name` 给出真实后端：`WebGL2Device`；显式 HEADLESS 为 `EmptyDevice`。`gfx.API` 枚举同时列出了 `WEBGL2`、`WEBGL`、`WEBGPU` 等取值，但 AIR 浏览器发行版要求 WebGL2，枚举中的 WEBGL 不表示继续支持 WebGL1（见 [WebGL Compatibility Check](./webgl-compatibility-check.md)）。
- `device.capabilities`（**不是 `device.caps`**）才是能力查询入口，字段包含 `maxTextureSize`、`maxVertexAttributes`、`maxColorRenderTargets`、`supportQuery` 等。
- 上面这次 `maxColorRenderTargets` 报 `0`，是软件光栅化环境的结果；真机 GPU 上通常 >1。写代码时不要假设它非零。
- `sys.browser` 是 `undefined`，要用 `sys.browserType` / `sys.browserVersion`。
- `game.renderType` 存在但返回 `-1`（未初始化语义），别拿它判后端，用 `device.constructor.name`。

顺带一个对性能篇很有用的事实：`device.numDrawCalls` / `numTris` / `numInstances` 是可读的 —— 本页静止立方体的实测值是 `numDrawCalls: 1`、`numTris: 12`（一个 box 正好 12 个三角形）。见 [Optimizing Lots of Objects](./optimize-lots-of-objects.md)。

## 6. 完整 main.ts

```ts
/**
 * Cocos AIR 开发手册 — Installation（安装与引入）
 * 配套文章：docs/manual/installation.md
 *
 * 目的：证明"importmap 引入 → createAirApp → 一个静止的 cube"这条最短链路能跑通，
 *      并把可查询到的引擎版本/平台/后端信息打在左上角 overlay 上（不硬编码版本号）。
 */

import {
    VERSION,
    sys,
    screen,
    game,
    director,
    Layers,
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    builtinResMgr,
    utils,
    primitives,
    Vec3,
    Color,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('installation');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 5));
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(24, 32, 48, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 一个静止的 cube（本篇不转动：证明"装好了"就够） ----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
scene.addChild(cubeNode);
const meshRenderer = cubeNode.addComponent(MeshRenderer);
meshRenderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
meshRenderer.material = builtinResMgr.get('builtin-standard-material');

window.__airApp = app;
app.run(scene);

// ---- overlay：只打印真的查得到的字段，查不到就不显示（不伪造能力） ----
const device = director.root && director.root.device;
const caps = device && device.capabilities;
const facts = {
    VERSION,
    'sys.platform': sys.platform,
    'sys.browserType': sys.browserType,
    'sys.os': sys.os,
    'sys.isMobile': sys.isMobile,
    device: device && device.constructor && device.constructor.name,
    maxTextureSize: caps && caps.maxTextureSize,
    maxColorRenderTargets: caps && caps.maxColorRenderTargets,
    canvas: `${canvas.width}x${canvas.height}`,
    devicePixelRatio: screen.devicePixelRatio,
    frameRate: game.frameRate,
};
(document.querySelector('#info') as HTMLElement).textContent = Object.entries(facts)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

console.log('[manual/installation] running on cocosair', VERSION);
```

## 运行示例

```bash
npm run dev
# → http://127.0.0.1:7454/manual/examples/manual-installation/
```

示例工程：`docs/manual/examples/manual-installation/`（index.html + main.ts，零外部资产）。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-installation`（`app-contract` / `visible-frame` / `no-runtime-error` PASS；本页静止，不参与 `frame-diff`），截图 `docs/evidence/examples/manual-installation.png`。

## 类型提示

`build/cocosair.module.d.ts` 是完整类型声明，编辑器里配好 alias 就能拿到全部补全：

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "cocosair": ["./build/cocosair.module.d.ts"] }
  }
}
```

`npm run typecheck` 就是用这套配置对 `src/` 做全量检查的。手册示例是纯 JS（docs/ 下没有 TS 编译链），所以类型错误不会被示例本身拦住 —— 写 TS 项目时以 d.ts 为准，别照抄示例的 JS 类型假设。

## API 参考

本篇涉及：`VERSION`、`sys`（`platform` / `browserType` / `browserVersion` / `os` / `isMobile` / `isBrowser`）、`screen`（`resolution` / `windowSize` / `devicePixelRatio`）、`game`（`frameRate` / `renderType`）、`director.root.device`（`constructor.name` / `capabilities` / `numDrawCalls` / `numTris`）、`gfx.API`、`createAirApp` / `AirAppOptions`。全部以 `build/cocosair.module.d.ts` 为准。

## 下一步

下一篇：[Creating a Scene 创建场景](./creating-a-scene.md) —— 把这个静止立方体变成有相机、有光、会转的最小场景，并解释每一行在干什么。
