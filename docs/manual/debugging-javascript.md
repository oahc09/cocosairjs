# 调试 JavaScript（Debugging JavaScript）

> 代码跑起来不对时，怎么把运行时状态掏出来看。
> 配套可运行示例：[`examples/manual-debugging-js/`](examples/manual-debugging-js/)（场景图内省 + 覆盖层 dump + 守卫探针 try/catch）。

**状态：FULL。** AIR 是纯代码运行时，浏览器 devtools（断点/console/network）全部可用；在此之上引擎还提供运行时内省面：
`director.getScene()` 拿回场景根，`node.children` / `node.components` / `node.walk()` 遍历层级与组件，`node.getWorldPosition()` 读世界坐标。
把这些投到 DOM 覆盖层或 `console.log`，就能在没有 devtools 的环境（手机/嵌入 webview）里肉眼对账。本篇把这套手段做成示例。

## 1. 有什么

| 成员                          | d.ts  | 说明                                                |
| ----------------------------- | ----- | --------------------------------------------------- |
| `director.getScene()`         | 21933 | 运行时拿回当前场景根节点                            |
| `node.children`               | 18321 | 子节点数组，递归遍历层级                            |
| `node.components`             | 18293 | 节点上挂的组件数组（`c.constructor.name` 取类型名） |
| `node.name`                   | 18308 | 节点名，dump 时的标签                               |
| `node.walk(pre, post?)`       | 18520 | 引擎自带的深度遍历回调                              |
| `node.getWorldPosition(out?)` | 19254 | 世界坐标，验证层级合成是否正确                      |
| `window.__airApp`             | 约定  | 示例统一把 app 挂到 window，供 devtools 控制台取用  |

## 2. 三个手段

**场景图内省**：递归 children，打印每节点的组件与世界坐标。世界坐标是验证"父子层级/位移合成对不对"的最快读数——子节点世界坐标应等于父世界 + 本地偏移的合成。

```ts
function graphLines(node: Node, depth: number, out: string[]): string[] {
    const comps = node.components.map((c) => c.constructor.name).join(',');
    node.getWorldPosition(wp);
    out.push(
        `${'  '.repeat(depth)}${node.name} [${comps || '-'}]` +
            ` @(${wp.x.toFixed(1)},${wp.y.toFixed(1)},${wp.z.toFixed(1)})`,
    );
    for (const child of node.children) graphLines(child, depth + 1, out);
    return out;
}
```

**守卫探针**：把可疑调用包进 try/catch，把异常消息打到覆盖层而不是让它未捕获崩溃。这样既能复现错误、又不会把整个渲染循环带崩（验证器的 `no-runtime-error` 门禁只盯未捕获异常）。

```js
    try {
        // 故意调用不存在的方法，演示"把崩溃变成可读消息"
        cubeNode.thisMethodDoesNotExist();
        msg = 'probe: no error (unexpected)';
    } catch (e) {
        msg = `probe caught: ${e && e.name}: ${e && e.message}`;
    }
```

**暴露给 devtools**：把场景与常用节点挂到 window，控制台里直接 `__debug.cubeNode.getWorldPosition()` 交互式排查。

```js
window.__debug = { scene, cubeNode, marker, dumpGraph, guardedProbe };
```

## 3. 实测读图与读数

示例验证器 3/3：`app-contract` / `visible-frame` / `no-runtime-error` 全 PASS（3.5s，子集 partial；非 ANIMATED 集不查 frame-diff，立方体仍自转 20°/s）。
截图 `docs/evidence/examples/manual-debugging-js.png`（橙色立方体三面受光可见）。

覆盖层实测（探针 dump，场景图）：

```
scene graph (director.getScene()):
debugging-javascript [-] @(0.0,0.0,0.0)
  Main Camera [Camera] @(3.0,3.0,6.4)
  DirLight [DirectionalLight] @(0.0,0.0,0.0)
  Cube [MeshRenderer,Spinner] @(0.0,1.0,0.0)
    Marker [-] @(0.0,1.9,0.0)
```

读数自洽：`Marker` 本地 `(0,0.9,0)` 挂在 `Cube`（世界 y=1.0）下，世界 y=1.9，证明层级合成正确、`getWorldPosition` 可信。
`Cube` 行组件列 `[MeshRenderer,Spinner]` 证明 `components` 内省能看到自定义组件。

**本仓库实测踩过的坑（调试时优先排查）**：`#GameCanvas` 必须在引擎 import 前存在；`utils.createSphere` 等几何体用位置参数易传错；共享 builtin material 直接改属性会串色（要 `new Material()`）；`Mat4` 实例是具名字段 `m00…m15` 而非 `.m` 数组（见 [矩阵变换](matrix-transformations.md) §3）。

## 4. 调试要点备忘

- AIR 调试 JS 的基线是"浏览器 devtools + console.log"；在此之上引擎自带较厚的运行时内省面
  （`components` / `walk` / `getWorldPosition`），因为节点/组件模型偏重，适合做结构化 dump。
- 组件 `update` 里抛出的未捕获异常会中断当帧逻辑，守卫探针（§2）是低成本防线。
- 建议把 app/scene 挂到 window 供控制台取用；AIR 示例统一用 `window.__airApp`（验证器 app-contract 也依赖它）。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-debugging-js        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-debugging-js/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-debugging-js
```

示例目录：`docs/manual/examples/manual-debugging-js/`。
验证器 3/3 全 PASS（3.5s，子集 partial）；截图 `docs/evidence/examples/manual-debugging-js.png`；覆盖层探针 dump 见 §3。

## 附：示例源码（逐字）

`examples/manual-debugging-js/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Debugging JavaScript — 调试 JS（docs/manual/debugging-javascript.md）</title>
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
            #ui {
                position: absolute;
                left: 8px;
                bottom: 8px;
                z-index: 10;
                font:
                    12px/1.4 ui-monospace,
                    Consolas,
                    monospace;
            }
            #ui button {
                margin-right: 6px;
                padding: 4px 10px;
                cursor: pointer;
                font: inherit;
                color: #0b1018;
                background: #d7e3f2;
                border: 1px solid #8fa4bd;
                border-radius: 4px;
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
        <div id="ui">
            <button id="btn-probe" type="button">Guarded probe (try/catch)</button>
            <button id="btn-dump" type="button">Dump scene graph</button>
        </div>
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

`examples/manual-debugging-js/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Debugging JavaScript（调试 JavaScript）
 * 配套文章：docs/manual/debugging-javascript.md
 *
 * 演示代码优先运行时的 JS 调试手段：
 *   - 运行时内省：director.getScene() + node.walk/children/components 打印场景图；
 *   - 覆盖层 dump：把场景图/世界坐标投到 DOM，便于无 devtools 时肉眼对账；
 *   - 守卫探针：把可疑调用包进 try/catch，把异常消息打到覆盖层而非让它未捕获崩溃；
 *   - window.__airApp / window.__debug 暴露给 devtools 控制台。
 * 立方体缓慢自转保证 frame-diff。
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
    director,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('debugging-javascript');

// ---- 相机（斜视，保证三面受光 distinctColors>=3）----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.0, 3.0, 6.4));
cameraNode.lookAt(new Vec3(0, 1.0, 0));
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

// ---- 立方体 + 子标记节点（演示层级内省）----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 1.0, 0));
scene.addChild(cubeNode);
const renderer = cubeNode.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
material.setProperty('mainColor', new Color(225, 165, 75, 255));
renderer.material = material;

const marker = new Node('Marker');
marker.layer = Layers.Enum.DEFAULT;
marker.setPosition(new Vec3(0, 0.9, 0));
cubeNode.addChild(marker);

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 20, 0);
    }
}
cubeNode.addComponent(Spinner);

// ---- 场景图内省 ----
const wp = new Vec3();
function graphLines(node: Node, depth: number, out: string[]): string[] {
    const comps = node.components.map((c) => c.constructor.name).join(',');
    node.getWorldPosition(wp);
    out.push(
        `${'  '.repeat(depth)}${node.name} [${comps || '-'}]` +
            ` @(${wp.x.toFixed(1)},${wp.y.toFixed(1)},${wp.z.toFixed(1)})`,
    );
    for (const child of node.children) graphLines(child, depth + 1, out);
    return out;
}
function dumpGraph(): void {
    const root = director.getScene() || scene;
    const lines = graphLines(root, 0, []);
    info.textContent = ['scene graph (director.getScene()):', ...lines].join('\n');
    console.log('[manual/debugging-js] scene graph:\n' + lines.join('\n'));
}

const info = document.querySelector('#info') as HTMLElement;

// ---- 守卫探针：可疑调用包 try/catch，异常打覆盖层不崩溃 ----
function guardedProbe(): void {
    let msg: string;
    try {
        // 故意调用不存在的方法，演示"把崩溃变成可读消息"
        cubeNode.thisMethodDoesNotExist();
        msg = 'probe: no error (unexpected)';
    } catch (e) {
        msg = `probe caught: ${e && e.name}: ${e && e.message}`;
    }
    info.textContent = msg + '\n(click "Dump scene graph" to restore)';
    console.log('[manual/debugging-js] ' + msg);
}

document.querySelector('#btn-probe')!.addEventListener('click', guardedProbe);
document.querySelector('#btn-dump')!.addEventListener('click', dumpGraph);

// 暴露给 devtools 控制台
window.__airApp = app;
window.__debug = { scene, cubeNode, marker, dumpGraph, guardedProbe };

app.run(scene);
dumpGraph();

console.log('[manual/debugging-javascript] running on cocosair');
```

---

上一篇：[按需渲染（Rendering On Demand）](rendering-on-demand.md) ｜ 下一篇：[调试 GLSL（Debugging GLSL）](debugging-glsl.md)
