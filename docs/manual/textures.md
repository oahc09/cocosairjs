# Textures 纹理

> Cocos AIR 的纹理是**两步**：像素载体 `ImageAsset`（CPU 侧）→ 采样对象 `Texture2D`（GPU 侧）；来源可以是 `assetManager.loadRemote(url)` 的文件图，也可以是程序化像素。
> 本篇示例零外部资产：代码现画一张 32×32 棋盘格走完全流程。

> 前置阅读：[Materials 材质](./materials.md)、[Uniform Types 统一类型](./uniform-types.md)

## 1. 纹理从哪来

| 来源          | 路径                                                                         | 本篇                                       |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------ |
| 文件/远程图   | `assetManager.loadRemote('xxx.png', cb)`（按扩展名判定加载器，见 d.ts 注释） | 不用（手册示例零外部资产）                 |
| 程序化像素    | `new ImageAsset({ width, height, _data, _compressed:false, format })`        | ✅                                         |
| canvas 动态图 | 先画 canvas 再取像素走程序化路径                                             | 见 [Canvas Textures](./canvas-textures.md) |

## 2. 两步上传：ImageAsset → Texture2D

```js
const imageAsset = new ImageAsset({
    width: 32,
    height: 32,
    _data: checkerboardPixels(),
    _compressed: false,
    format: Texture2D.PixelFormat.RGBA8888,
});
const texture = new Texture2D();
texture.image = imageAsset;
texture.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT); // 平铺前提：wrap=REPEAT
```

- `ImageAsset` 只是**像素描述**（宽高 + RGBA 字节 + 是否压缩），不碰 GPU；
- `texture.image = …` 才真正建 GPU 纹理；换图 = 再赋一次 `image`；
- `setWrapMode` 决定 uv 越界行为：要平铺必须 REPEAT（默认 CLAMP 会把边缘像素拉成条）。采样滤波另有 `setFilters(min, mag)` / `setMipFilter`。

像素生成本身就是普通循环：

```ts
    const size = 32;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const even = ((x >> 2) + (y >> 2)) % 2 === 0;
            const i = (y * size + x) * 4;
            data[i] = even ? 235 : 40;
            data[i + 1] = even ? 235 : 40;
            data[i + 2] = even ? 235 : 40;
            data[i + 3] = 255;
        }
    }
    return data;
}
```

## 3. 挂到材质：宏 + tilingOffset

```js
const cubeMaterial = new Material();
cubeMaterial.initialize({
    effectName: 'builtin-standard',
    defines: { USE_ALBEDO_MAP: true }, // 不打开这个宏，mainTexture 不参与着色
});
cubeMaterial.setProperty('mainTexture', texture);
cubeMaterial.setProperty('tilingOffset', new Vec4(2, 2, 0, 0)); // xy=tiling zw=offset
cubeMaterial.setProperty('roughness', 0.5);
```

两个必记点（都在 [Uniform Types](./uniform-types.md) 展开）：

1. **`USE_ALBEDO_MAP` 宏**：`builtin-standard` 的贴图通道靠 defines 编译开关，不打开时 `mainTexture` 赋了也不着色；
2. **`tilingOffset` 是 Vec4**：`xy` 平铺倍数、`zw` 偏移。示例 `(2,2,0,0)` 让 8×8 棋盘在每面铺 2×2，截图上即每面 16 格。

## 4. 实测读图

截图 `docs/evidence/examples/manual-textures.png`：自转 cube 的三个可见面都采样同一张棋盘（box 图元每面独立 uv 0..1），格纹在棱边连续对齐 —— 说明 wrap=REPEAT 与 tiling 生效。覆盖层实测：

```text
textures: procedural 32x32 checker → Texture2D
image: 32x32 RGBA8888, wrap=REPEAT
tilingOffset (2,2,0,0): 每面 2x2 平铺
cube spins: six faces sample the same texture
```

## 5. 跑示例与验证记录

示例工程：`docs/manual/examples/manual-textures/`（index.html + main.ts，零外部资产）；dev server 地址 `http://127.0.0.1:7454/manual/examples/manual-textures/`。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-textures`（`app-contract` / `visible-frame` / `no-runtime-error` / `frame-diff` 全 PASS，4.0s；cube 自转使双帧不同），截图 `docs/evidence/examples/manual-textures.png`。

## 完整 index.html

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Textures — 纹理（docs/manual/textures.md）</title>
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
 * Cocos AIR 开发手册 — Textures（纹理）
 * 配套文章：docs/manual/textures.md
 *
 * 零外部资产的纹理全流程：程序化生成 32×32 棋盘格像素 → ImageAsset → Texture2D
 * → builtin-standard 的 mainTexture（需 defines.USE_ALBEDO_MAP）→ tilingOffset 平铺。
 * cube 自转展示六个面采样同一张图。
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
    Vec4,
    Color,
    ImageAsset,
    Texture2D,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('textures');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 5.5));
cameraNode.lookAt(new Vec3(0, 0.7, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 24, 34, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 程序化像素：32×32 棋盘格（8×8 个 4px 色块） ----
function checkerboardPixels(): Uint8Array {
    const size = 32;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const even = ((x >> 2) + (y >> 2)) % 2 === 0;
            const i = (y * size + x) * 4;
            data[i] = even ? 235 : 40;
            data[i + 1] = even ? 235 : 40;
            data[i + 2] = even ? 235 : 40;
            data[i + 3] = 255;
        }
    }
    return data;
}

// ---- 两步上传：ImageAsset（CPU 像素）→ Texture2D（GPU 纹理） ----
const imageAsset = new ImageAsset({
    width: 32,
    height: 32,
    _data: checkerboardPixels(),
    _compressed: false,
    format: Texture2D.PixelFormat.RGBA8888,
});
const texture = new Texture2D();
texture.image = imageAsset;
texture.setWrapMode(Texture2D.WrapMode.REPEAT, Texture2D.WrapMode.REPEAT); // 平铺前提：wrap=REPEAT

// ---- 地面 ----
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

// ---- 贴棋盘格的自转 cube ----
const cubeNode = new Node('Textured Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.8, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1.3, height: 1.3, length: 1.3 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({
    effectName: 'builtin-standard',
    defines: { USE_ALBEDO_MAP: true }, // 不打开这个宏，mainTexture 不参与着色
});
cubeMaterial.setProperty('mainTexture', texture);
cubeMaterial.setProperty('tilingOffset', new Vec4(2, 2, 0, 0)); // xy=tiling zw=offset
cubeMaterial.setProperty('roughness', 0.5);
cubeRenderer.material = cubeMaterial;

class Rotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}
cubeNode.addComponent(Rotator);

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：纹理参数 ============
(document.querySelector('#info') as HTMLElement).textContent = [
    'textures: procedural 32x32 checker → Texture2D',
    `image: ${texture.width}x${texture.height} RGBA8888, wrap=REPEAT`,
    'tilingOffset (2,2,0,0): 每面 2x2 平铺',
    'cube spins: six faces sample the same texture',
].join('\n');

console.log('[manual/textures] running on cocosair');
```

## API 参考

`ImageAsset({ width, height, _data, _compressed, format })`、`Texture2D.image|width|height`、`Texture2D.setWrapMode|setFilters|setMipFilter`、`Texture2D.PixelFormat|WrapMode`、`assetManager.loadRemote(url, cb)`、`Material.setProperty('mainTexture'|'tilingOffset')`。以 `build/cocosair.module.d.ts` 为准。

## 下一步

下一篇：[Lights 光源](./lights.md) —— 四种光源组件与强度语义。
