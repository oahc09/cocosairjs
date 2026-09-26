# Setup 环境搭建

> Cocos AIR 是仓库内开发的运行时，本篇讲**怎么把开发环境跑起来**：**dev server 的启动方式、三条 watch 频道的分工、构建状态通道**，以及静态部署时的诚实边界。
> 配套示例是一个最小 hello-cube starter —— 它的意义是"跑通载体"，重点在文章。

> 前置阅读：[Installation 安装与引入](./installation.md)

## 1. 启动 dev server

```bash
npm run build   # 先产出 build/cocosair.module.js（dev server 启动时也会构建一次）
npm run dev     # 默认 http://127.0.0.1:7454
```

可带参数：

```bash
npm run dev -- --example starter --port 7454
```

启动后：

- 仓库根就是 web root，`/build/cocosair.module.js` 直接可访问；
- 开发手册挂在 `/manual/`（→ `docs/manual/`，含手册专属示例，页面自带 importmap）；
- 本篇示例地址：`http://127.0.0.1:7454/manual/examples/manual-setup/index.html`。

## 2. 三条 watch 频道

dev server（`tools/dev/dev-server.cjs`）用 `fs.watch` 监听三组目录，**分工不同**：

| 频道                          | 监听范围                                                                    | 触发动作                                                                          |
| ----------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| engine                        | `src/cocos/**`、`src/pal/**`、`src/exports/**`（及其余 `src/` 非 air 部分） | 跑 `tools/build/build.cjs --format esm` 全量重建 → bump reload token → 浏览器刷新 |
| air                           | `src/air/**`                                                                | 同上（重建 + 刷新），耗时单独记入 `/__stats` 的 `airRebuilds`                     |
| example / debug-tool / manual | `examples/**`、`tools/debug/**`、`docs/manual/**`                           | **只 bump reload token（reload only），绝不触发 engine build**                    |

也就是说：改手册示例、改文章、改 examples，浏览器秒刷；改引擎源码才会重建 bundle。含 `.tmp` 的路径与非代码后缀（非 `.ts/.js/.json/.html/.css`）会被忽略。

## 3. 构建状态通道与错误横幅

dev server 暴露三个诊断端点：

| 端点              | 内容                                                      |
| ----------------- | --------------------------------------------------------- |
| `/__reload_token` | `{ token }`，浏览器轮询比对，变了就 `location.reload()`   |
| `/__build_status` | 最近一次构建 `lastBuild = { channel, ok, ms, error, at }` |
| `/__stats`        | 冷/热构建耗时、engine/air 重建记录、示例 reload 计数      |

关键设计（Task 13"构建错误可见性"）：

- **构建失败不清 reloadToken** —— 浏览器保留上一个可用 bundle，不会白屏；
- 失败状态经 `/__build_status`（`ok === false`）暴露，dev server 注入的 `/__reload.js` 轮询到失败后在页面顶部插入 `pre#__air-build-error` 错误横幅；
- 因此**示例代码自己不要去 fetch `/__build_status`** —— 纯静态部署下没有这个端点，只会得到 404 控制台噪声。这条通道属于 dev server，不属于示例。

## 4. 示例自检（实测覆盖层）

示例跑起来后覆盖层输出：

```text
setup: minimal starter running
scene: setup  nodes: 4
canvas: 640x480
```

`nodes: 4` 即相机、灯光、地面、hello cube 四个节点（见 [Fundamentals](./fundamentals.md) 的结构树读法）。

## 5. 静态部署的诚实边界

- `package.json` **没有** `prepare-static` 之类的打包脚本；产物就是 `npm run build` 生成的 `build/cocosair.module.js`（及 `build:dts` 的类型）。
- 静态部署 = 任意静态服务器 + **仓库根为 web root**（页面 importmap 指向 `/build/cocosair.module.js`）。
- `#GameCanvas` 必须在引擎 import 之前存在于 DOM（pal/screen-adapter 是模块顶层单例），这一点与部署方式无关，见 [Installation](./installation.md)。

## 完整 index.html

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Setup — 环境搭建（docs/manual/setup.md）</title>
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

## 完整 main.ts

```ts
/**
 * Cocos AIR 开发手册 — Setup（环境搭建）
 * 配套文章：docs/manual/setup.md
 *
 * 本篇的示例只是"跑通载体"：一个最小 hello-cube，重点在文章讲 dev server。
 * 示例自身不 fetch /__build_status —— 该通道由 dev server 注入的 reload 脚本
 * 轮询（见文章 §3），纯静态部署下示例去 fetch 它只会得到 404 控制台噪声。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Layers,
    Vec3,
    Color,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('setup');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 5.0));
cameraNode.lookAt(new Vec3(0, 0.5, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 26, 38, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 地面 + hello cube ----
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

const cubeNode = new Node('Hello Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.6, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(90, 200, 220, 255));
cubeRenderer.material = cubeMaterial;

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：starter 自检 ============
// 注：/​__build_status 通道由 dev server 注入的 reload 脚本轮询（见文章 §3），
// 示例自身不去 fetch 它 —— 纯静态部署下该路径 404 会产生控制台噪声。
(document.querySelector('#info') as HTMLElement).textContent = [
    'setup: minimal starter running',
    `scene: ${scene.name}  nodes: ${scene.children.length}`,
    `canvas: ${canvas.width}x${canvas.height}`,
].join('\n');

console.log('[manual/setup] running on cocosair');
```

## API 参考

`createAirApp({ canvas })`、`Scene`、`Node`、`Camera` / `DirectionalLight` / `MeshRenderer`（Component）、`Material.initialize({ effectName })`、`utils.createMesh` + `primitives.plane|box`、`app.run(scene)`。dev server 端点见 `tools/dev/dev-server.cjs`。以 `build/cocosair.module.d.ts` 为准。

## 下一步

Basics 部分到此收束。下一站进入 Fundamentals 章节：[Primitives 内置图元](./primitives.md)。
