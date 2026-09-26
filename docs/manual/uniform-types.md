# Uniform Types Uniform 类型

> Cocos AIR 不让你手写 uniform 块：**材质属性就是 uniform**。`builtin-standard` 等内置 effect 声明好了一组带类型的属性，你用 `material.setProperty(name, value)` 传**对应 JS 类型**的值即可。
> 本篇给一张"声明类型 → JS 类型 → 代表属性"的对照表，并用四个并排立方体把每种类型的可见效果摆在一起。

> 前置阅读：[Creating a Scene 创建场景](./creating-a-scene.md)、[Materials 材质](./materials.md)（可后读）

## 概念要点

| Cocos AIR                                     | 说明                                                             |
| --------------------------------------------- | ---------------------------------------------------------------- |
| `material.setProperty('metallic', 1.0)`       | float uniform → JS `number`                                      |
| `setProperty('emissiveScale', new Vec3(...))` | Vec3 uniform → `Vec3`                                            |
| `setProperty('mainColor', new Color(...))`    | Vec4/Color uniform → `Color`（或 `Vec4`）                        |
| `setProperty('mainTexture', texture2D)`       | sampler2D → `Texture2D`                                          |
| 类型由 **effect 声明**决定，无需手写 GLSL     | 传错类型会在 `setProperty` 时告警/无效，命名与类型以 effect 为准 |

## 1. 类型对照表（以 builtin-standard 实际声明为准）

| 声明类型     | JS 传入类型       | builtin-standard 代表属性                                                                     |
| ------------ | ----------------- | --------------------------------------------------------------------------------------------- |
| float        | `number`          | `metallic`、`roughness`、`occlusion`、`alphaThreshold`、`normalStrength`、`specularIntensity` |
| Vec3         | `Vec3`            | `albedoScale`、`emissiveScale`                                                                |
| Vec4 / Color | `Color` 或 `Vec4` | `mainColor`、`emissive`、`tilingOffset`(x/y=平铺, z/w=偏移)                                   |
| sampler2D    | `Texture2D`       | `mainTexture`、`normalMap`、`pbrMap`、`metallicRoughnessMap`、`occlusionMap`、`emissiveMap`   |

属性名与类型**不要猜**：以 `build/cocosair.module.d.ts` 与内置 effect 声明为准。传一个不存在的属性名，`setProperty` 不会报错而是静默无效 —— 调试时先核对名字。

## 2. 四个 cube，四种类型

示例用 `addCube(name, x, initOptions, configure)` 统一建节点，`configure` 里只做 `setProperty`，四个 cube 各改一类 uniform：

```js
// 1) number（float uniform）：metallic / roughness
//    注意：metallic=1 且场景无环境光/IBL 时金属接近全黑（无漫反射、镜面无物可反），
//    那是 PBR 的正确行为而非 bug；这里用 metallic=0 让 float 的效果肉眼可见。
addCube('float: metallic+roughness', -3.6, { effectName: 'builtin-standard' }, (m) => {
    m.setProperty('metallic', 0.0);
    m.setProperty('roughness', 0.35);
});

// 2) Color（Vec4 uniform）：mainColor
addCube('Color: mainColor', -1.2, { effectName: 'builtin-standard' }, (m) => {
    m.setProperty('mainColor', new Color(225, 70, 60, 255));
});

// 3) Texture2D + Vec4：mainTexture + tilingOffset（需打开 USE_ALBEDO_MAP）
addCube('Vec4+Tex: tilingOffset', 1.2, { effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } }, (m) => {
    m.setProperty('mainTexture', checkerTexture);
    m.setProperty('tilingOffset', new Vec4(2, 2, 0, 0));
});

// 4) Color + Vec3：emissive + emissiveScale
addCube('Color+Vec3: emissive', 3.6, { effectName: 'builtin-standard' }, (m) => {
    m.setProperty('emissive', new Color(40, 220, 210, 255));
    m.setProperty('emissiveScale', new Vec3(2, 2, 2));
});
```

截图里从左到右应看到：① 浅蓝灰哑光介电体（float）② 暗红纯色（Color）③ 2×2 平铺棋盘（Texture2D + Vec4）④ 高亮青绿自发光（Color + Vec3）。

两个必须知道的坑：

1. **sampler2D 要开对应宏**：`mainTexture` 只有在 `defines: { USE_ALBEDO_MAP: true }` 时才参与着色；只 `setProperty('mainTexture', ...)` 而不开宏，贴图不生效。
2. **共享 builtin 材质不可原地改**：`builtinResMgr.get('builtin-standard-material')` 是全局共享的，改它会污染所有用它的对象。一律 `new Material()` + `initialize({ effectName })` 再 `setProperty`（见 [Creating a Scene](./creating-a-scene.md)）。

## 3. 关于 metallic=1 变黑（诚实记录）

第一次跑本例时 1 号 cube 设的是 `metallic=1.0, roughness=0.2`，截图里它**接近全黑**。这不是 bug：金属没有漫反射分量，镜面反射又需要环境（IBL/天空盒）可反；本例只有一盏平行光、没有环境光，所以金属几乎不返光。这是 PBR 的正确物理行为。为了让 float uniform 的效果肉眼可见，示例改用 `metallic=0`；若你要真金属观感，先给场景配环境光/天空盒（见 [Backgrounds 背景](./backgrounds.md)）。

## 运行示例

```bash
npm run dev
# → http://127.0.0.1:7454/manual/examples/manual-uniform-types/
```

示例工程：`docs/manual/examples/manual-uniform-types/`（index.html + main.ts，棋盘纹理运行时程序化生成，零外部资产）。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-uniform-types`（`app-contract` / `visible-frame` / `no-runtime-error` PASS，3.1s；本页静止，不参与 `frame-diff`），截图 `docs/evidence/examples/manual-uniform-types.png`。

## 完整 index.html

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Uniform Types — Uniform 类型（docs/manual/uniform-types.md）</title>
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
 * Cocos AIR 开发手册 — Uniform Types（Uniform 类型）
 * 配套文章：docs/manual/uniform-types.md
 *
 * 材质属性就是 uniform。builtin-standard 的每个可 setProperty 的属性都有一个
 * 声明类型（float / Vec3 / Vec4 / sampler2D），setProperty 要传**对应的 JS 类型**：
 *   float      → number            （metallic / roughness / alphaThreshold …）
 *   Vec3       → Vec3              （albedoScale / emissiveScale …）
 *   Vec4/Color → Color 或 Vec4     （mainColor / emissive / tilingOffset …）
 *   sampler2D  → Texture2D         （mainTexture / normalMap / emissiveMap …）
 *
 * 四个并排立方体，每个只改一类 uniform，肉眼对照效果：
 *   1 number    metallic=1.0 + roughness=0.2  → 镜面金属
 *   2 Color     mainColor=红                  → 哑光纯色
 *   3 Vec4+Tex  mainTexture=棋盘 + tilingOffset=(2,2,0,0) → 2×2 平铺
 *   4 Color+Vec3 emissive=青 + emissiveScale=(2,2,2)      → 自发光
 *
 * 注意：共享的 builtin 材质不可原地改，一律 new Material() + initialize 再 setProperty。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    ImageAsset,
    Texture2D,
    Layers,
    Vec3,
    Vec4,
    Color,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('uniform-types');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 9.2));
cameraNode.lookAt(new Vec3(0, 0.4, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(22, 28, 40, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-40, -25, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 程序化棋盘纹理（给 3 号 cube 演示 sampler2D + tilingOffset） ----
const SIZE = 32;
function checkerboardPixels(): Uint8Array {
    const pixels = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = (SIZE * y + x) * 4;
            const check = ((x >> 3) + (y >> 3)) % 2 === 0;
            const v = check ? 235 : 45;
            pixels[i] = v;
            pixels[i + 1] = v;
            pixels[i + 2] = v;
            pixels[i + 3] = 255;
        }
    }
    return pixels;
}
const imageAsset = new ImageAsset({
    width: SIZE,
    height: SIZE,
    _data: checkerboardPixels(),
    _compressed: false,
    format: Texture2D.PixelFormat.RGBA8888,
});
const checkerTexture = new Texture2D();
checkerTexture.image = imageAsset;

// ---- 四个 cube，每个一个独立材质（不碰共享 builtin 材质） ----
function addCube(
    name: string,
    x: number,
    initOptions: { effectName: string; defines?: Record<string, boolean> },
    configure: (m: Material) => void,
): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, 0.5, 0));
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
    const material = new Material();
    material.initialize(initOptions);
    configure(material);
    renderer.material = material;
    return node;
}

// 1) number（float uniform）：metallic / roughness
//    注意：metallic=1 且场景无环境光/IBL 时金属接近全黑（无漫反射、镜面无物可反），
//    那是 PBR 的正确行为而非 bug；这里用 metallic=0 让 float 的效果肉眼可见。
addCube('float: metallic+roughness', -3.6, { effectName: 'builtin-standard' }, (m) => {
    m.setProperty('metallic', 0.0);
    m.setProperty('roughness', 0.35);
});

// 2) Color（Vec4 uniform）：mainColor
addCube('Color: mainColor', -1.2, { effectName: 'builtin-standard' }, (m) => {
    m.setProperty('mainColor', new Color(225, 70, 60, 255));
});

// 3) Texture2D + Vec4：mainTexture + tilingOffset（需打开 USE_ALBEDO_MAP）
addCube('Vec4+Tex: tilingOffset', 1.2, { effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } }, (m) => {
    m.setProperty('mainTexture', checkerTexture);
    m.setProperty('tilingOffset', new Vec4(2, 2, 0, 0));
});

// 4) Color + Vec3：emissive + emissiveScale
addCube('Color+Vec3: emissive', 3.6, { effectName: 'builtin-standard' }, (m) => {
    m.setProperty('emissive', new Color(40, 220, 210, 255));
    m.setProperty('emissiveScale', new Vec3(2, 2, 2));
});

window.__airApp = app;
app.run(scene);

(document.querySelector('#info') as HTMLElement).textContent = [
    'uniform types → JS types (builtin-standard)',
    '1 metallic/roughness : number (float)',
    '2 mainColor          : Color (Vec4)',
    '3 mainTexture+tiling : Texture2D + Vec4',
    '4 emissive+scale     : Color + Vec3',
].join('\n');

console.log('[manual/uniform-types] running on cocosair');
```

## API 参考

`Material.initialize({ effectName, defines })`、`Material.setProperty(name, value)`、`Material.getProperty(name)`、`builtin-standard` 属性集（见 §1 表）、`Texture2D` + `ImageAsset`（程序化纹理）、`Vec3` / `Vec4` / `Color`。以 `build/cocosair.module.d.ts` 为准。

## 下一步

下一篇：[Textures 贴图](./textures.md) —— 把 sampler2D 这条线展开：UV、平铺/偏移、多种贴图通道（albedo/normal/emissive）各自怎么接。
