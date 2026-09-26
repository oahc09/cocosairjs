# Loading 3D Models 加载 3D 模型

> Cocos AIR 内置 `GLTFLoader`，入口是**异步的**、产物是**共享原生资产**：`parseAsync` / `loadAsync` 返回 `GLTFAsset`，再 `asset.instantiate()` 拿到可挂场景的节点树。
> 本篇走一条**零外部资产**的完整链路：在运行时把立方体的顶点/法线/索引打包成 glTF 二进制缓冲、用 base64 data URI 内联进 glTF JSON、交给 `GLTFLoader.parseAsync` 解析并实例化自转 —— 把"模型从字节到节点"每一步都摊开看。

> 前置阅读：[Creating a Scene 创建场景](./creating-a-scene.md)、[Installation 安装与引入](./installation.md)

## 入口速览

| 入口                                                                            | 说明                                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `new GLTFLoader()`                                                              | 加载器在 `cocosair` 命名导出里                                                  |
| `await loader.loadAsync(url)`                                                   | Promise 形态，无回调                                                            |
| `await loader.parseAsync(data, baseUrl?)`                                       | **内联/内存解析入口**，本篇用它                                                 |
| `asset.instantiate().root`（Node）                                              | 资产与实例分离：`GLTFAsset` 共享原生资源，`instantiate()` 产出独立节点/动画状态 |
| `instance.animations`                                                           | 实例级动画剪辑                                                                  |
| `asset.meshes / materials / skeletons / warnings`                               | 直接暴露解析结果集合与告警，便于自检                                            |
| `loader.setDRACODecoder(...) / setMeshoptDecoder(...) / setKTX2Transcoder(...)` | **显式注入式**，不注入则压缩模型如实报 decoder required（见 §5）                |

## 1. 两条加载入口：loadAsync 与 parseAsync

真实项目里模型是文件，用 `loadAsync(url)`；但手册示例坚持**零外部资产**（不引入二进制文件带来的 provenance / MIME / 许可证链），所以用 `parseAsync` 把整份 glTF 文档以字符串形式喂进去：

```js
const loader = new GLTFLoader();
const asset = await loader.parseAsync(JSON.stringify(gltfDocument));
const instance = asset.instantiate();
```

`parseAsync(data, baseUrl?)` 的 `data` 可以是 glTF 的 **JSON 字符串**或 `.glb` 的 **ArrayBuffer**；`baseUrl` 只在文档里有**相对路径**的外部资源（`.bin`、贴图）时才需要 —— 本篇全部内联，省略。

注意 `GLTFAsset` 与实例是两层：`asset` 持有共享的 `Mesh` / `Material` / `Texture2D` / `Skeleton` / `AnimationClip`（多次 `instantiate()` 复用同一份 GPU 资源），`instance` 才是你加进场景、可以独立 `dispose()` 的那一份。

## 2. 内联缓冲：data URI 与对齐规则

glTF 的二进制数据放在 `buffers[]` 里。零资产做法是把整段二进制 base64 编码后写成 `data:` URI，引擎的 `request()` 会把带 scheme 的 URI 原样交给 `fetch`（浏览器原生支持 `fetch('data:...')`），无需任何外部文件：

```js
    bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: POS_BYTES, target: 34962 },
        { buffer: 0, byteOffset: POS_BYTES, byteLength: NRM_BYTES, target: 34962 },
        { buffer: 0, byteOffset: POS_BYTES + NRM_BYTES, byteLength: IDX_BYTES, target: 34963 },
    ],
    buffers: [
        {
            byteLength: buffer.byteLength,
            uri: `data:application/octet-stream;base64,${base64}`,
        },
    ],
};
```

两个容易踩的约束（示例的 `packBoxBuffer` 都满足了）：

1. **对齐**：每个 `bufferView.byteOffset` 必须按其 `componentType` 对齐 —— `FLOAT`(5126) 要 4 字节、`UNSIGNED_SHORT`(5123) 要 2 字节。示例布局 288 / 288 / 576 全部对齐。
2. **byteLength 一致**：`buffers[i].byteLength` 必须等于实际解码后的字节数，否则解析报 `buffer i: length mismatch`。

`target: 34962` = `ARRAY_BUFFER`（顶点属性），`34963` = `ELEMENT_ARRAY_BUFFER`（索引），与 WebGL 常量同值。

## 3. 解析 → 实例化 → 挂场景

解析成功后拿到的 `instance.root` 是一个普通 `Node`，可以像任何节点一样挂到场景。示例用一个 pivot 承载它，把自转挂在 pivot 上，方便以后整体平移/缩放模型而不动模型内部层级：

```js
const pivot = new Node('model-pivot');
pivot.layer = Layers.Enum.DEFAULT;
scene.addChild(pivot);
pivot.addChild(instance.root);
```

`pivot.layer = Layers.Enum.DEFAULT` 不能省：相机 `visibility` 只认 `Layers.Enum.DEFAULT`，漏了就是"加载成功但画面里什么都没有"（同 [Creating a Scene](./creating-a-scene.md) 的坑）。

## 4. 解析结果自检

`GLTFAsset` 直接暴露解析产物，示例把它们打到覆盖层做自检。本页应看到：

```text
GLTFLoader.parseAsync(inline glTF JSON)
meshes: 1  materials: 1
skeletons: 0  animations: 0
warnings: none (parsed clean)
```

```ts
    'GLTFLoader.parseAsync(inline glTF JSON)',
    `meshes: ${asset.meshes.length}  materials: ${asset.materials.length}`,
    `skeletons: ${asset.skeletons.length}  animations: ${instance.animations.length}`,
    asset.warnings.length ? `warnings: ${asset.warnings.join(' | ')}` : 'warnings: none (parsed clean)',
].join('\n');
```

`asset.warnings` 是**非致命**问题的出口（例如"可选扩展未注册，回退到核心行为"）。加载真实模型时先读它，很多"模型能显示但材质不对"的疑问答案就在这里。

## 5. decoder 注入边界（压缩模型必读）

本篇的 glTF **未压缩、无外部依赖**，所以不需要任何解码器。但只要模型用到下列扩展，就必须**在解析前**显式注入对应解码器，否则解析会如实失败并报 decoder required：

| 扩展                                                | 注入方法                               |
| --------------------------------------------------- | -------------------------------------- |
| `KHR_draco_mesh_compression`                        | `loader.setDRACODecoder(decoder)`      |
| `EXT_meshopt_compression` / `KHR_mesh_quantization` | `loader.setMeshoptDecoder(decoder)`    |
| KTX2 纹理                                           | `loader.setKTX2Transcoder(transcoder)` |

解码器不是引擎内置的（体积与许可证原因），由调用方提供；仓库的 `examples/gltf-meshopt/` 演示了 meshopt 注入的完整回路。进程级默认值可用 `configureGLTFLoaderDefaults(options)` 设置，实例选项优先。自定义扩展走 `loader.register(factory)` / `GLTFExtensionRegistry`。

这条边界与仓库既有的 `decoder-required` 能力合同一致：**draco/ktx2 链路在本仓库默认构建下是 BLOCKED 的**（缺解码器二进制），不要假设"装了 cocosair 就能开 draco 模型"。

## 运行示例

```bash
npm run dev
# → http://127.0.0.1:7454/manual/examples/manual-loading-models/
```

示例工程：`docs/manual/examples/manual-loading-models/`（index.html + main.ts，零外部资产，缓冲在运行时生成并 base64 内联）。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-loading-models`（`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS，3.6s；自转使双帧不同，故在 ANIMATED 集），截图 `docs/evidence/examples/manual-loading-models.png` —— 应看到一个受光的青绿色立方体在自转。

## 完整 index.html

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Loading 3D Models — 加载 3D 模型（docs/manual/loading-3d-models.md）</title>
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

## 完整 main.ts

```ts
/**
 * Cocos AIR 开发手册 — Loading 3D Models（加载 3D 模型）
 * 配套文章：docs/manual/loading-3d-models.md
 *
 * 零外部资产：在运行时把一个立方体的顶点/法线/索引打包成 glTF 二进制缓冲，
 * 用 base64 data URI 内联进 glTF JSON，再交给 GLTFLoader.parseAsync 解析、
 * instantiate 挂到场景、自转展示。完整走一遍"模型从字节到节点"的链路。
 *
 * 关键 API：
 *   new GLTFLoader().parseAsync(jsonString)  → GLTFAsset（共享原生资产）
 *   asset.instantiate()                      → { root, animations, dispose }
 *   asset.meshes / materials / skeletons / warnings（解析结果自检）
 *
 * decoder 注入边界：本页的 glTF 未压缩、无外部依赖，所以不需要 DRACO / meshopt /
 * KTX2。若模型用了 KHR_draco_mesh_compression / EXT_meshopt_compression / KTX2 纹理，
 * 必须先 loader.setDRACODecoder(...) / setMeshoptDecoder(...) / setKTX2Transcoder(...)
 * 注入解码器，否则解析会如实报"decoder required"。详见文章 §5。
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
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('loading-models');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(2.6, 2.0, 3.4));
cameraNode.lookAt(new Vec3(0, 0, 0));
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
lightNode.setRotationFromEuler(-40, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ============ 1. 在运行时拼一个 glTF 文档 ============

/**
 * 生成一个轴对齐立方体的网格数据（6 面 × 4 顶点 + 2 三角形）。
 * 每面顶点按"从外侧看的逆时针"排列，符合 glTF 的正面绕序约定。
 * @returns {{ positions: number[], normals: number[], indices: number[] }}
 */
function buildBox(w: number, h: number, d: number): { positions: number[]; normals: number[]; indices: number[] } {
    const x = w / 2;
    const y = h / 2;
    const z = d / 2;
    const faces: { n: number[]; v: number[][] }[] = [
        {
            n: [0, 0, 1],
            v: [
                [-x, -y, z],
                [x, -y, z],
                [x, y, z],
                [-x, y, z],
            ],
        }, // +Z
        {
            n: [0, 0, -1],
            v: [
                [x, -y, -z],
                [-x, -y, -z],
                [-x, y, -z],
                [x, y, -z],
            ],
        }, // -Z
        {
            n: [1, 0, 0],
            v: [
                [x, -y, z],
                [x, -y, -z],
                [x, y, -z],
                [x, y, z],
            ],
        }, // +X
        {
            n: [-1, 0, 0],
            v: [
                [-x, -y, -z],
                [-x, -y, z],
                [-x, y, z],
                [-x, y, -z],
            ],
        }, // -X
        {
            n: [0, 1, 0],
            v: [
                [-x, y, z],
                [x, y, z],
                [x, y, -z],
                [-x, y, -z],
            ],
        }, // +Y
        {
            n: [0, -1, 0],
            v: [
                [-x, -y, -z],
                [x, -y, -z],
                [x, -y, z],
                [-x, -y, z],
            ],
        }, // -Y
    ];
    const positions: number[] = [];
    const normals: number[] = [];
    const indices: number[] = [];
    faces.forEach((face, i) => {
        const base = i * 4;
        for (const p of face.v) {
            positions.push(p[0], p[1], p[2]);
            normals.push(face.n[0], face.n[1], face.n[2]);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    return { positions, normals, indices };
}

/**
 * 把 positions(Float32) / normals(Float32) / indices(Uint16) 顺序打包进一个 ArrayBuffer。
 * glTF 要求每个 bufferView 的 byteOffset 按其 componentType 对齐：
 * Float32 需 4 字节对齐、Uint16 需 2 字节对齐 —— 这里 288 / 288 / 576 全部满足。
 * @returns {ArrayBuffer}
 */
function packBoxBuffer(box: { positions: number[]; normals: number[]; indices: number[] }): ArrayBuffer {
    const positions = new Float32Array(box.positions);
    const normals = new Float32Array(box.normals);
    const indices = new Uint16Array(box.indices);
    const buffer = new ArrayBuffer(positions.byteLength + normals.byteLength + indices.byteLength);
    const bytes = new Uint8Array(buffer);
    bytes.set(new Uint8Array(positions.buffer), 0);
    bytes.set(new Uint8Array(normals.buffer), positions.byteLength);
    bytes.set(new Uint8Array(indices.buffer), positions.byteLength + normals.byteLength);
    return buffer;
}

/** ArrayBuffer → base64（浏览器内联 data URI 用）。 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

const box = buildBox(1, 1, 1);
const buffer = packBoxBuffer(box);
const base64 = arrayBufferToBase64(buffer);
const POS_BYTES = (box.positions.length / 3) * 4 * 3; // 24 顶点 × vec3 × 4 字节 = 288
const NRM_BYTES = POS_BYTES;
const IDX_BYTES = box.indices.length * 2; // 36 索引 × 2 字节 = 72

// 一个最小但合法的 glTF 2.0 文档：单 mesh、单 PBR 材质、缓冲以 base64 data URI 内联。
const gltfDocument = {
    asset: { version: '2.0', generator: 'cocosair manual / loading-3d-models' },
    scene: 0,
    scenes: [{ name: 'inline-scene', nodes: [0] }],
    nodes: [{ name: 'InlineBox', mesh: 0 }],
    meshes: [
        {
            name: 'box',
            primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }],
        },
    ],
    materials: [
        {
            name: 'teal-pbr',
            pbrMetallicRoughness: {
                baseColorFactor: [0.18, 0.7, 0.64, 1.0],
                metallicFactor: 0.1,
                roughnessFactor: 0.55,
            },
        },
    ],
    accessors: [
        { bufferView: 0, componentType: 5126, count: 24, type: 'VEC3', min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] },
        { bufferView: 1, componentType: 5126, count: 24, type: 'VEC3' },
        { bufferView: 2, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
    bufferViews: [
        { buffer: 0, byteOffset: 0, byteLength: POS_BYTES, target: 34962 },
        { buffer: 0, byteOffset: POS_BYTES, byteLength: NRM_BYTES, target: 34962 },
        { buffer: 0, byteOffset: POS_BYTES + NRM_BYTES, byteLength: IDX_BYTES, target: 34963 },
    ],
    buffers: [
        {
            byteLength: buffer.byteLength,
            uri: `data:application/octet-stream;base64,${base64}`,
        },
    ],
};

// ============ 2. 解析 → 实例化 → 挂场景 ============

const loader = new GLTFLoader();
const asset = await loader.parseAsync(JSON.stringify(gltfDocument));
const instance = asset.instantiate();

// 用一个 pivot 节点承载模型，自转挂在 pivot 上，便于以后整体移动/缩放模型
const pivot = new Node('model-pivot');
pivot.layer = Layers.Enum.DEFAULT;
scene.addChild(pivot);
pivot.addChild(instance.root);

class Rotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}
pivot.addComponent(Rotator);

window.__airApp = app;
app.run(scene);

// ============ 3. 解析结果自检（覆盖层） ============

(document.querySelector('#info') as HTMLElement).textContent = [
    'GLTFLoader.parseAsync(inline glTF JSON)',
    `meshes: ${asset.meshes.length}  materials: ${asset.materials.length}`,
    `skeletons: ${asset.skeletons.length}  animations: ${instance.animations.length}`,
    asset.warnings.length ? `warnings: ${asset.warnings.join(' | ')}` : 'warnings: none (parsed clean)',
].join('\n');

console.log('[manual/loading-models] running on cocosair');
```

## API 参考

`GLTFLoader`（`loadAsync(url)` / `parseAsync(data, baseUrl?)` / `setDRACODecoder` / `setMeshoptDecoder` / `setKTX2Transcoder` / `register` / `getExtensionSupport`）、`GLTFAsset`（`meshes` / `materials` / `textures` / `skeletons` / `animations` / `sceneNames` / `document` / `warnings` / `instantiate(sceneIndex?)` / `destroy`）、`GLTFInstance`（`root` / `animations` / `dispose`）、`configureGLTFLoaderDefaults`、`registerGLTFLoader`、`GLTFExtensionRegistry`。以 `build/cocosair.module.d.ts` 为准。

## 下一步

下一篇：[Materials 材质](./materials.md) —— 把 `builtin-standard` 的各向参数（baseColor / metallic / roughness / emissive）逐个调给你看。
