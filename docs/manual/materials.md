# Materials 材质

> Cocos AIR 的材质是 **effect 实例 + uniform 取值**：`new Material()` 后 `initialize({ effectName })` 选"配方"，`setProperty` 填参数。没有材质类继承树，配方名字就是字符串。
> 本篇给 builtin 清单、获取途径、三种配方对比，以及"绝不原地改共享材质"的纪律。

> 前置阅读：[Fundamentals 基本概念](./fundamentals.md)、[Uniform Types 统一类型](./uniform-types.md)

## 1. builtin 清单

用户场景里用得上的就两个（`src/air/builtin/builtin-effects.ts`）：

| effectName         | 定位                  | 关键属性                                                                                                                          |
| ------------------ | --------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `builtin-standard` | PBR 金属-粗糙度工作流 | `mainColor` / `mainTexture` / `metallic` / `roughness` / `emissive` / `normalMap` …（全表见 [Uniform Types](./uniform-types.md)） |
| `builtin-unlit`    | 不受光平涂            | `mainColor` / `mainTexture`                                                                                                       |

其余 builtin（`builtin-sprite` / `builtin-particle` / `builtin-graphics` / `builtin-billboard` …）服务 2D/粒子/调试渲染器，不属于 3D 场景材质选型。另有两个**诊断材质**：缺 effect 时挂黄色 `missing-effect-material`、缺材质时挂品红 `missing-material` —— 屏幕上看到纯黄/纯品红物体，就是资源没接上。

## 2. 获取途径

只有一条用户路径：**新建实例**。

```ts
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, 0.7, 0));
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1.1, height: 1.1, length: 1.1 }));
    const material = new Material(); // 独立实例：改属性不污染任何其他使用者
    configure(material);
    renderer.material = material;
    return material;
}
```

- `builtinResMgr.get(uuid)` 存在，但注册进去的都是引擎内部 uuid（`default-spriteframe`、`default-particle-material` …），**没有**给用户 3D 场景的"default-material"；别指望从里面领一个标准材质。
- 想基于现有材质派生变体：`material.copy(other, overrides?)`（注意是 `copy`，**没有 `clone`** —— 调 `clone()` 会直接 TypeError，见 [FAQ](./faq.md)）。
- 单个渲染器级别的临时改写（比如改绘制拓扑）用 `renderer.getMaterialInstance(0)`，不碰源材质（见 [Primitives 内置图元](./primitives.md) §3）。

## 3. 三种配方对比（示例实测）

同一盏方向光下并排三个 cube：

```js
// A：unlit —— 没有光照项，主色平涂（UI/纯色标记常用）
const matA = addCube('A-unlit', -2.2, (m) => {
    m.initialize({ effectName: 'builtin-unlit' });
    m.setProperty('mainColor', new Color(230, 120, 60, 255));
});
```

```js
// C：standard + 自发光 —— emissive 不依赖光源
const matC = addCube('C-emissive', 2.2, (m) => {
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', new Color(60, 60, 80, 255));
    m.setProperty('emissive', new Color(240, 90, 160, 255));
    m.setProperty('emissiveScale', new Vec3(1.5, 1.5, 1.5));
});
```

中间的 B 是 `builtin-standard` 介电体（`metallic=0`、`roughness=0.35`）。截图 `docs/evidence/examples/manual-materials.png` 的读法：

- **A（橙）**：六个面同亮度 —— unlit 不算光照，朝向无所谓；
- **B（青）**：顶面亮、侧面暗，有高光明暗过渡 —— standard 的漫反射+粗糙度高光；
- **C（粉）**：整体发亮且几乎无明暗过渡 —— emissive 叠加在受光项之上，`emissiveScale` 放大强度。

覆盖层实测（`material.effectName` 读回）：

```text
materials: same light, three recipes
A builtin-unlit            effect=builtin-unlit
B builtin-standard         effect=builtin-standard
C builtin-standard+emissive effect=builtin-standard
shared builtins never mutated: new Material() per cube
```

## 4. 与 MeshRenderer 的绑定

`renderer.material = material` 是**赋值引用**：同一材质实例可以给多个 renderer 共用（改一处全变）；要各自独立就各自 `new`。材质与网格正交：换 `renderer.mesh` 不动材质，换材质不动网格。

## 5. 跑示例与验证记录

示例工程：`docs/manual/examples/manual-materials/`（index.html + main.ts，零外部资产）；dev server 地址 `http://127.0.0.1:7454/manual/examples/manual-materials/`。
验证记录：`docs/evidence/manual-examples-verified.json` 中 `manual-materials`（`app-contract` / `visible-frame` / `no-runtime-error` 全 PASS，3.2s；本页静止，不在 ANIMATED 集，不参与 `frame-diff`），截图 `docs/evidence/examples/manual-materials.png`。

## 完整 index.html

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Materials — 材质（docs/manual/materials.md）</title>
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
 * Cocos AIR 开发手册 — Materials（材质）
 * 配套文章：docs/manual/materials.md
 *
 * 三 cube 并排对比三种"材质配方"（同一光源下）：
 *   A builtin-unlit                    —— 不受光，纯主色平涂
 *   B builtin-standard                 —— PBR 受光（介电体）
 *   C builtin-standard + emissive      —— 自发光叠加
 * 关键纪律：共享 builtin 材质绝不原地改 —— 每个 cube 都 new Material() 独立实例。
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

const scene = new Scene('materials');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 6.5));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
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

function addCube(name: string, x: number, configure: (material: Material) => void): Material {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, 0.7, 0));
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1.1, height: 1.1, length: 1.1 }));
    const material = new Material(); // 独立实例：改属性不污染任何其他使用者
    configure(material);
    renderer.material = material;
    return material;
}

// A：unlit —— 没有光照项，主色平涂（UI/纯色标记常用）
const matA = addCube('A-unlit', -2.2, (m) => {
    m.initialize({ effectName: 'builtin-unlit' });
    m.setProperty('mainColor', new Color(230, 120, 60, 255));
});

// B：standard 介电体 —— 漫反射 + 粗糙度高光
const matB = addCube('B-standard', 0, (m) => {
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', new Color(90, 200, 220, 255));
    m.setProperty('metallic', 0.0);
    m.setProperty('roughness', 0.35);
});

// C：standard + 自发光 —— emissive 不依赖光源
const matC = addCube('C-emissive', 2.2, (m) => {
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', new Color(60, 60, 80, 255));
    m.setProperty('emissive', new Color(240, 90, 160, 255));
    m.setProperty('emissiveScale', new Vec3(1.5, 1.5, 1.5));
});

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：材质配方 ============
(document.querySelector('#info') as HTMLElement).textContent = [
    'materials: same light, three recipes',
    `A builtin-unlit            effect=${matA.effectName}`,
    `B builtin-standard         effect=${matB.effectName}`,
    `C builtin-standard+emissive effect=${matC.effectName}`,
    'shared builtins never mutated: new Material() per cube',
].join('\n');

console.log('[manual/materials] running on cocosair');
```

## API 参考

`Material.initialize({ effectName, defines? })`、`Material.setProperty|getProperty`、`Material.effectName`、`Material.copy(mat, overrides?)`、`MeshRenderer.material`、`MeshRenderer.getMaterialInstance(i)`、`builtinResMgr.get(uuid)`。以 `build/cocosair.module.d.ts` 为准。

## 下一步

下一篇：[Textures 纹理](./textures.md) —— `ImageAsset → Texture2D` 两步与平铺参数。
