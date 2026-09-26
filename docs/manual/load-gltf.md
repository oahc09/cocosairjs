# Load a .GLTF file（加载 glTF 文件）

> 把 glTF/GLB 模型读进场景。
> 配套可运行示例：[`examples/manual-load-gltf/`](examples/manual-load-gltf/)（页面内现造一份最小 glTF JSON、
> buffer 以 data URI 内嵌，走 `parseAsync` 全链路——零外部资产也能把加载管线跑通并取证）。

AIR 内置 `GLTFLoader` 类（d.ts 32918），是 **Promise 风格**，且把"资产"与"实例"分成两层：解析得 `GLTFAsset`，`instantiate()` 才产出可挂场景的节点树。
两条加载路都实测可用：真实文件走 `loadAsync(url)`，内存数据走 `parseAsync(data)`——示例用后者实现零资产取证。

## 1. 加载入口（实测 API 面）

| 入口                                                             | d.ts          | 语义                                                                         |
| ---------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------- |
| `new GLTFLoader(options?)`                                       | 32918         | 实例化加载器；options 见 32933–32939                                         |
| `loader.loadAsync(url)`                                          | 32927         | 抓取并解析文件，`Promise<GLTFAsset>`                                         |
| `loader.parseAsync(data, baseUrl?)`                              | 32928         | 解析内存中的 JSON 文本 / GLB ArrayBuffer（示例走这条）                       |
| `loader.setDRACODecoder / setMeshoptDecoder / setKTX2Transcoder` | 32919–32921   | 挂可选解码器，链式返回                                                       |
| `loader.register / unregister(factory)`                          | 32922–32923   | 挂自定义扩展处理器（`GLTFExtensionFactory`）                                 |
| `registerGLTFLoader()`                                           | 32930         | 把 glTF 加载器登记进 assetManager，之后 `loadAssetAsync` 能路由 `.gltf/.glb` |
| `loadAssetAsync(url)` / `loadAssetAsync(path, Type)`             | 32845 / 32839 | 通用资产入口（登记后覆盖 glTF）                                              |
| `configureGLTFLoaderDefaults(opts)`                              | 32932         | 进程级 fallback options，实例 options 优先                                   |

`GLTFAsset` 的读回面（d.ts 32900–32916）：`sceneNames`（场景名列表）、`warnings`（解析告警）、
`document`（原始 glTF JSON 元数据，含相机/灯光/节点名）、`instantiate(sceneIndex?)` →
`GLTFInstance { root, animations, dispose() }`。一个 asset 可多次 instantiate，`dispose()` 回收 GPU 资源。

options 里的三个解码器槽对应三个工厂：`createDracoDecoder` / `createMeshoptDecoder` /
`createKTX2Transcoder`。**如实标注**：本环境 Draco 解码 wasm 不可用（先前取证 BLOCKED，见台账），
meshopt/KTX2 通路存在但本篇未取证；无压缩的 glTF/GLB 是零依赖安全区，示例即如此。

## 2. 两条加载路

真实文件（文章示意，非示例代码——示例为零资产约束走内存路）：
`const loader = new GLTFLoader();` → `const asset = await loader.loadAsync('models/robot.glb');` →
`const inst = asset.instantiate(0); scene.addChild(inst.root);`。仓库自带示例
`examples/gltf-viewer/` 用这条路径加载样本 `.glb`（含 Draco/meshopt 样本），可作真实文件路的参照。

内存路（示例实测，逐字片段）：

```js
    const t0 = performance.now();
    const loader = new GLTFLoader();
    asset = await loader.parseAsync(buildCubeGLTFText());
    const parseMs = performance.now() - t0;
    instance = asset.instantiate(0);
    instance.root.setPosition(new Vec3(0, 0.9, 0));
    scene.addChild(instance.root);
```

`parseAsync` 第一参接受 JSON 文本或 GLB 的 ArrayBuffer；带外部 buffer/贴图的 `.gltf` 需要第二参
`baseUrl` 解析相对引用。示例的 glTF 把 buffer 直接内嵌成 data URI，baseUrl 可省：

```js
        buffers: [{ byteLength: buf.length, uri: `data:application/octet-stream;base64,${btoa(bin)}` }],
```

示例在页面里用 TypedArray 现造 24 顶点/36 索引立方体（POSITION/NORMAL 两个 float accessor +
一个 uint16 index accessor，`min/max` 按规范必填），base64 后拼进 `buffers[0].uri`——
**glTF 是数据格式不是引擎私有格式**，这条"手搓最小 glTF"的路径本身就是对加载器契约的对账：
accessor/bufferView/material 填错会在 `parseAsync` 或 `instantiate` 抛错，覆盖层 catch 后直接打印。

## 3. 实测读图与读数

验证器 3/3：`app-contract` / `visible-frame` / `no-runtime-error` 全 PASS（3.1s，子集运行 partial；
本例不在 `ANIMATED` 集合，不查 frame-diff；示例仍加了实例自转便于肉眼确认）。
截图 `docs/evidence/examples/manual-load-gltf.png`：立方体三面三档受光色，实例确在场景中被渲染。

覆盖层与实例结构实测（探针 dump）：

```
gltf: in-memory minimal cube (24 verts / 36 idx, data-URI buffer)
parseAsync: 18.2 ms → GLTFAsset (warnings: 0)
instantiate(0): root="ManualScene", children=1, animations=0
real files: loader.loadAsync(url) — see docs/manual/load-gltf.md §2
```

```
rootChildren: InMemoryCube__0[MeshRenderer]
sceneNames:   ["ManualScene"]
```

两条命名实测结论入册：

- **`instantiate()` 的根节点名取 glTF 场景名**（`ManualScene`），不是节点名——遍历实例树时别按节点名找根。
- **实例化出的子节点名带 `__0` 后缀**（`InMemoryCube__0`）——引擎防重名约定；
  按名字 `find` 子节点时要考虑后缀，或改用 `walk` + 前缀匹配。

`warnings: 0` 证明手搓 JSON 通过规范校验；`animations: 0` 与最小资产无动画自洽
（带动画的 glTF 会在 `instance.animations` 拿到 `AnimationClip[]`，接 [animation-system](animation-system.md) 的 clip 路线播放）。

## 4. 设计与口径

- **全 Promise**：加载入口是 `loadAsync` / `parseAsync`，无回调参数形态；进度走 options.onProgress（d.ts 32938，`GLTFLoadProgress` 分
  container/dependencies/decode/textures/objects 五相，d.ts 32941–32945）。
- **资产/实例分层**：loader 返回 `GLTFAsset`（资产层，可缓存可多次实例化）+ `instantiate()`（实例层）+ `dispose()` 回收——
  与 [cleanup](cleanup.md) 的资产生命周期模型同构；复用同一模型即"解析一次、实例多次"，不必手工克隆。
- **扩展解码器**：解码器用 loader 上的同语义 setter 注入 + 进程级 `configureGLTFLoaderDefaults`，少一层解码器对象管理。
- **动画归属**：`instance.animations` 是 clip 数组，但播放走组件式 `Animation`（无 mixer 概念，见 animation-system §4）。
- **压缩是可选依赖**：Draco/meshopt/KTX2 均为可选注入而非默认，未压缩 glTF/GLB 才是零依赖安全区（§1 已注明）。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-load-gltf        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-load-gltf/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-load-gltf
```

示例目录：`docs/manual/examples/manual-load-gltf/`。
验证器 3/3 全 PASS（3.1s，子集运行 partial）；截图 `docs/evidence/examples/manual-load-gltf.png`；
覆盖层与实例结构探针 dump 见 §3。`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-load-gltf/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Load a .GLTF file — 加载 glTF 文件（docs/manual/load-gltf.md）</title>
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

`examples/manual-load-gltf/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Load a .GLTF file（加载 glTF 文件）
 * 配套文章：docs/manual/load-gltf.md
 *
 * 零外部资产演示 GLTFLoader 的解析管线：在页面里现造一份最小 glTF JSON
 * （24 顶点/36 索引立方体，buffer 以 data URI 内嵌），走 parseAsync → GLTFAsset
 * → instantiate(0) → 挂场景。真实资产用 loader.loadAsync(url)（见文章 §2）。
 * 覆盖层打印 parse 耗时、warnings、实例根节点结构，供探针取证。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    Component,
    Layers,
    Vec3,
    Color,
    GLTFLoader,
    GLTFAsset,
    GLTFInstance,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('load-gltf');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(2.6, 2.4, 4.2));
cameraNode.lookAt(new Vec3(0, 0.9, 0));
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

// ---- 现造最小 glTF：立方体 24 顶点 / 36 索引，buffer 内嵌 data URI ----
function buildCubeGLTFText(): string {
    const h = 0.6;
    const faces: { n: number[]; c: number[][] }[] = [
        {
            n: [0, 0, 1],
            c: [
                [-h, -h, h],
                [h, -h, h],
                [h, h, h],
                [-h, h, h],
            ],
        },
        {
            n: [0, 0, -1],
            c: [
                [h, -h, -h],
                [-h, -h, -h],
                [-h, h, -h],
                [h, h, -h],
            ],
        },
        {
            n: [1, 0, 0],
            c: [
                [h, -h, h],
                [h, -h, -h],
                [h, h, -h],
                [h, h, h],
            ],
        },
        {
            n: [-1, 0, 0],
            c: [
                [-h, -h, -h],
                [-h, -h, h],
                [-h, h, h],
                [-h, h, -h],
            ],
        },
        {
            n: [0, 1, 0],
            c: [
                [-h, h, h],
                [h, h, h],
                [h, h, -h],
                [-h, h, -h],
            ],
        },
        {
            n: [0, -1, 0],
            c: [
                [-h, -h, -h],
                [h, -h, -h],
                [h, -h, h],
                [-h, -h, h],
            ],
        },
    ];
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    faces.forEach((f, fi) => {
        f.c.forEach((p) => {
            positions.push(...p);
            normals.push(...f.n);
        });
        const b = fi * 4;
        indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
    });
    const posF = new Float32Array(positions);
    const norF = new Float32Array(normals);
    const idxU = new Uint16Array(indices);
    const buf = new Uint8Array(posF.byteLength + norF.byteLength + idxU.byteLength);
    buf.set(new Uint8Array(posF.buffer), 0);
    buf.set(new Uint8Array(norF.buffer), posF.byteLength);
    buf.set(new Uint8Array(idxU.buffer), posF.byteLength + norF.byteLength);
    let bin = '';
    for (let i = 0; i < buf.length; i += 0x8000) {
        bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
    }
    const json = {
        asset: { version: '2.0', generator: 'manual-load-gltf in-page builder' },
        scene: 0,
        scenes: [{ name: 'ManualScene', nodes: [0] }],
        nodes: [{ name: 'InMemoryCube', mesh: 0 }],
        meshes: [
            {
                name: 'CubeMesh',
                primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }],
            },
        ],
        materials: [
            {
                name: 'CubeMat',
                pbrMetallicRoughness: {
                    baseColorFactor: [0.85, 0.45, 0.2, 1],
                    metallicFactor: 0,
                    roughnessFactor: 0.7,
                },
            },
        ],
        buffers: [{ byteLength: buf.length, uri: `data:application/octet-stream;base64,${btoa(bin)}` }],
        bufferViews: [
            { buffer: 0, byteOffset: 0, byteLength: posF.byteLength },
            { buffer: 0, byteOffset: posF.byteLength, byteLength: norF.byteLength },
            { buffer: 0, byteOffset: posF.byteLength + norF.byteLength, byteLength: idxU.byteLength },
        ],
        accessors: [
            { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-h, -h, -h], max: [h, h, h] },
            { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
            { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
        ],
    };
    return JSON.stringify(json);
}

// ---- 解析 + 实例化 ----
const info = document.querySelector('#info') as HTMLElement;
let report = 'parsing…';
let asset: GLTFAsset | null = null;
let instance: GLTFInstance | null = null;
try {
    const t0 = performance.now();
    const loader = new GLTFLoader();
    asset = await loader.parseAsync(buildCubeGLTFText());
    const parseMs = performance.now() - t0;
    instance = asset.instantiate(0);
    instance.root.setPosition(new Vec3(0, 0.9, 0));
    scene.addChild(instance.root);
    report = [
        'gltf: in-memory minimal cube (24 verts / 36 idx, data-URI buffer)',
        `parseAsync: ${parseMs.toFixed(1)} ms → GLTFAsset (warnings: ${asset.warnings.length})`,
        `instantiate(0): root="${instance.root.name}", children=${instance.root.children.length}, animations=${instance.animations.length}`,
        'real files: loader.loadAsync(url) — see docs/manual/load-gltf.md §2',
    ].join('\n');
} catch (e) {
    report = `gltf parse failed: ${e.name}: ${e.message}`;
}
info.textContent = report;

// ---- 实例自转，便于肉眼确认加载结果在场景里 ----
class Spin extends Component {
    update(dt: number): void {
        if (instance) {
            instance.root.setRotationFromEuler(0, instance.root.eulerAngles.y + dt * 24, 0);
        }
    }
}
cameraNode.addComponent(Spin);

window.__airApp = app;
window.__inspect = {
    get asset() {
        return asset;
    },
    get instance() {
        return instance;
    },
};
app.run(scene);

console.log('[manual/load-gltf] running on cocosair');
```

---

上一篇：[加载 OBJ 文件（Load an .OBJ file）](load-obj.md) ｜ 下一篇：[背景与天空盒（Add a Background or Skybox）](backgrounds.md)
