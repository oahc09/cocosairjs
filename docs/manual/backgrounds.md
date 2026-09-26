# Add a Background or Skybox（背景与天空盒）

> 场景背景的三种形态：纯色、默认天空盒、自定义立方体图（cubemap）。
> 配套可运行示例：[`examples/manual-backgrounds/`](examples/manual-backgrounds/)（三按钮切三模式：纯色、
> 默认天空盒、页面内 6 张 canvas 现造的 cubemap 天空盒——零外部资产）。

AIR 的背景分两层：**相机清除策略**（`camera.clearFlags` + `clearColor`）与
**场景环境层**（`scene.globals.skybox`）。要点：

| AIR                                                                                                                                             | 实测                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 纯色背景：`clearFlags = SOLID_COLOR` + `clearColor`                                                                                             | ✓（本手册几乎每个示例都在用）    |
| 2D 贴图背景：无纹理槽位                                                                                                                         | **缺**——本篇 PARTIAL 主因之一    |
| cubemap 天空盒：`scene.globals.skybox.envmap = TextureCube`                                                                                     | ✓ 实测（canvas 现造 6 面可上屏） |
| 程序化大气：无内置对应物；`setSkyboxMaterial`（d.ts 6114）是自定义材质入口，但本构建无用户面 GLSL（见 [debugging-glsl](debugging-glsl.md) N/A） | 缺                               |

## 1. 背景入口（实测 API 面）

| 入口                                                                                | 锚点                  | 语义（实测）                                                                                                     |
| ----------------------------------------------------------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Camera.ClearFlag.SOLID_COLOR` / `SKYBOX` / `DEPTH_ONLY` / `DONT_CLEAR`             | module.js 43870–43873 | 位组合枚举，实测值 SOLID=7、SKYBOX=14（覆盖层读回）                                                              |
| `scene.globals`                                                                     | d.ts 19400            | `SceneGlobals`（d.ts 21104 起）：`skybox: SkyboxInfo`、`ambient: AmbientInfo` 等                                 |
| `SkyboxInfo.enabled / envmap / useIBL / useHDR / envLightingType / applyDiffuseMap` | d.ts 20662 起         | 场景级天空盒配置；`envmap` 类型为 `TextureCube`（可置 null）                                                     |
| `renderer.scene.Skybox.setSkyboxMaterial / rotation 角`                             | d.ts 6114 / 6123      | 渲染层：自定义天空盒材质与旋转                                                                                   |
| `TextureCube.mipmaps`                                                               | d.ts 23404 起         | `ITextureCubeMipmap[]`，六面 `{front, back, left, right, top, bottom}`，每面收 `ImageAsset`（canvas 可直接构造） |

**开发期踩坑（实测）**：`scene.skybox` **不存在**——首版照 cocos 编辑器文档写 `scene.skybox.enabled = true`，
页面直接 `TypeError: Cannot set properties of undefined (setting 'enabled')`、一帧不画
（验证器 `app-contract=FAIL: no rendered frame within 10s`）。正确路径是 **`scene.globals.skybox`**。

## 2. 示例拆解

cubemap 用 6 张 64×64 单色 canvas 现造，每面包一张 `ImageAsset`：

```ts
function faceAsset(css: string): ImageAsset {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = css;
    g.fillRect(0, 0, 64, 64);
    return new ImageAsset(c);
}
let cubeMap: TextureCube | null = null;
let cubeMapError = '—';
try {
    cubeMap = new TextureCube();
    cubeMap.mipmaps = [
        {
            front: faceAsset('#c04030'),
            back: faceAsset('#30a050'),
            left: faceAsset('#3060c0'),
            right: faceAsset('#c0a030'),
            top: faceAsset('#40b0c0'),
            bottom: faceAsset('#8040a0'),
        },
    ];
} catch (e) {
    cubeMap = null;
    cubeMapError = `${e.name}: ${e.message}`;
}
```

模式切换集中在一个 `applyMode`，天空盒两分支的差别只在 `envmap` 给不给：

```js
        } else if (next === 'skybox-default') {
            camera.clearFlags = Camera.ClearFlag.SKYBOX;
            scene.globals.skybox.enabled = true;
            scene.globals.skybox.envmap = null;
        } else {
            camera.clearFlags = Camera.ClearFlag.SKYBOX;
            scene.globals.skybox.enabled = true;
            scene.globals.skybox.envmap = cubeMap;
        }
```

覆盖层每帧打印 `clearFlags` 数值、`skybox.enabled/useHDR/envmap` 读回与错误信息——
所有承诺都做成肉眼可读、探针可取的形态。

## 3. 实测读图与读数

验证器 3/3：`app-contract` / `visible-frame` / `no-runtime-error` 全 PASS（3.1s，子集运行 partial；
本例不在 `ANIMATED` 集合）。截图 `docs/evidence/examples/manual-backgrounds.png`：
默认 cubemap 模式，画面是**蓝（left）/绿（back）两大面加交界线**，立方体三面暗调。
三模式整页证据（含覆盖层）：`docs/evidence/manual/backgrounds-{solid, skybox-default, skybox-cubemap}.png`。

探针 dump（默认模式，读取时刻）：

```
background mode: skybox-cubemap
clearFlags: 14 (SKYBOX=14, SOLID=7)
skybox.enabled: true, useHDR: true, envmap: TextureCube, err: —
cubemap build: ok (6 canvas faces)
```

```
useIBL: false, envLightingType: 0, hdrClearsEnvmap: { before: true, after: true }
```

四条实测结论：

1. **`envmap = null` 不是黑屏**：启用天空盒但不给 cubemap，引擎用**内置默认环境图**——
   灰白色"房间墙角"风格（见 `backgrounds-skybox-default.png`）。
2. **canvas cubemap 直接可上屏**，六面以近原色显示（画面蓝/绿与 canvas `#3060c0`/`#30a050` 一致），
   不参与场景光照。**但面方位映射不按直觉**：相机在 +Z 侧朝原点看，看到的却是 left/back 两面而非 front 红面——
   cubemap 面约定与直觉的 glTF 轴向不一致，本篇不承诺面朝向，按实测图校正。
3. **`useHDR` 保持默认 true，别动**：本构建把 `useHDR` 置 false 后**整屏纯白**
   （开发期实测：验证器 `visible-frame=FAIL`，截图全白，distinctColors=1）；
   且运行时翻转 `useHDR` 后自定义 `envmap` 读回 null（需重设）。
   `hdrClearsEnvmap: {before:true, after:true}` 是探针在默认态下写 `useHDR=true` 的读回——
   同值写入不清 envmap，**清 envmap 的是 false↔true 的翻转路径**。
4. **立方体"暗"与背景模式无关**：solid 模式下同场景同光同材质（对比 `backgrounds-solid.png`），
   中等偏暗色调是本仓库示例统一风格（对照 `manual-animation-system.png`），不是天空盒副作用。

**如实标注**："2D 图当背景"（含 aspect 自适应）在 AIR 没有一等公民槽位。应用层替代是给相机挂一张正对的大 quad 并配 `builtin-unlit` 材质（贴图路线见
[textures](textures.md)），或用 `DONT_CLEAR` + CSS 页面背景垫底（后者依赖透明画布，见
[tips](tips.md) 的 PARTIAL 结论）——两条都属"能做但引擎不替你管"，故本篇定 **PARTIAL**。

## 4. 实现备忘

- **属性归属**：背景拆在两维正交的入口上：`camera.clearFlags`（怎么清）×
  `scene.globals.skybox`（清成什么环境），组合出错时有警告文案兜底
  （module.js 语言表 15100："clear flag is skybox, but skybox is disabled"）。
- **背景不吃光照**：background/skybox 都以原色上屏，不参与场景光照。
- **IBL 复用**：天空盒同时可作环境光来源（`useIBL`/`envLightingType`/`applyDiffuseMap`）；
  本构建实测默认 `useIBL=false`、`envLightingType=0`，即天空盒默认只管看不管照。
- **程序化天空**：本构建无用户面 GLSL（见 [debugging-glsl](debugging-glsl.md)），
  天花板是 `setSkyboxMaterial` 换内建材质——本篇未取证。

## 5. 跑示例与验证记录

```
npm run dev -- --example manual-backgrounds        # 或浏览器开 http://127.0.0.1:7454/manual/examples/manual-backgrounds/
NODE_PATH=<含 playwright 的 node_modules> node tools/verify/manual-examples-verify.cjs --ids=manual-backgrounds
```

示例目录：`docs/manual/examples/manual-backgrounds/`。
验证器 3/3 全 PASS（3.1s，子集运行 partial）；截图 `docs/evidence/examples/manual-backgrounds.png`；
三模式整页证据 `docs/evidence/manual/backgrounds-*.png`；覆盖层与状态探针 dump 见 §3。
`manual-doc-consistency` 结果见台账行。

## 附：示例源码（逐字）

`examples/manual-backgrounds/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="utf-8" />
        <title>Add a Background or Skybox — 背景与天空盒（docs/manual/backgrounds.md）</title>
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
            <button id="btn-solid" type="button">bg: solid</button>
            <button id="btn-sky-def" type="button">bg: skybox default</button>
            <button id="btn-sky-cube" type="button">bg: skybox cubemap</button>
        </div>
        <script type="module" src="./main.ts"></script>
    </body>
</html>
```

`examples/manual-backgrounds/main.ts`：

```ts
/**
 * Cocos AIR 开发手册 — Add a Background or Skybox（背景与天空盒）
 * 配套文章：docs/manual/backgrounds.md
 *
 * 三个按钮切三种背景：纯色（ClearFlag.SOLID_COLOR + clearColor）、
 * 默认天空盒（ClearFlag.SKYBOX + scene.globals.skybox.enabled、envmap=null）、
 * 立方体贴图天空盒（页面内 6 张 canvas 现造 TextureCube 塞进 skybox.envmap）。
 * 覆盖层打印当前模式与 skybox 读回状态，供探针取证。
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
    TextureCube,
    ImageAsset,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('backgrounds');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(2.8, 2.2, 5.2));
cameraNode.lookAt(new Vec3(0, 0.8, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 200;
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 主角立方体（斜视三面受光） ----
const cubeNode = new Node('Hero');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.8, 0));
scene.addChild(cubeNode);
const renderer = cubeNode.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
material.setProperty('mainColor', new Color(235, 125, 65, 255));
renderer.material = material;

// ---- 页面内现造 cubemap：6 张单色 canvas ----
function faceAsset(css: string): ImageAsset {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d') as CanvasRenderingContext2D;
    g.fillStyle = css;
    g.fillRect(0, 0, 64, 64);
    return new ImageAsset(c);
}
let cubeMap: TextureCube | null = null;
let cubeMapError = '—';
try {
    cubeMap = new TextureCube();
    cubeMap.mipmaps = [
        {
            front: faceAsset('#c04030'),
            back: faceAsset('#30a050'),
            left: faceAsset('#3060c0'),
            right: faceAsset('#c0a030'),
            top: faceAsset('#40b0c0'),
            bottom: faceAsset('#8040a0'),
        },
    ];
} catch (e) {
    cubeMap = null;
    cubeMapError = `${e.name}: ${e.message}`;
}

// ---- 三种背景模式 ----
const info = document.querySelector('#info') as HTMLElement;
let mode = 'skybox-cubemap';
let modeError = '—';
function applyMode(next: string): void {
    mode = next;
    try {
        if (next === 'solid') {
            camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
            camera.clearColor = new Color(24, 60, 70, 255);
            scene.globals.skybox.enabled = false;
        } else if (next === 'skybox-default') {
            camera.clearFlags = Camera.ClearFlag.SKYBOX;
            scene.globals.skybox.enabled = true;
            scene.globals.skybox.envmap = null;
        } else {
            camera.clearFlags = Camera.ClearFlag.SKYBOX;
            scene.globals.skybox.enabled = true;
            scene.globals.skybox.envmap = cubeMap;
        }
        modeError = '—';
    } catch (e) {
        modeError = `${e.name}: ${e.message}`;
        camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
        scene.globals.skybox.enabled = false;
        mode = `${next} (failed, fell back to solid)`;
    }
}
(document.querySelector('#btn-solid') as HTMLElement).addEventListener('click', () => applyMode('solid'));
(document.querySelector('#btn-sky-def') as HTMLElement).addEventListener('click', () => applyMode('skybox-default'));
(document.querySelector('#btn-sky-cube') as HTMLElement).addEventListener('click', () => applyMode('skybox-cubemap'));
applyMode('skybox-cubemap');

// ---- 覆盖层 ----
class Overlay extends Component {
    update(): void {
        info.textContent = [
            `background mode: ${mode}`,
            `clearFlags: ${camera.clearFlags} (SKYBOX=${Camera.ClearFlag.SKYBOX}, SOLID=${Camera.ClearFlag.SOLID_COLOR})`,
            `skybox.enabled: ${scene.globals.skybox.enabled}, useHDR: ${scene.globals.skybox.useHDR}, envmap: ${scene.globals.skybox.envmap ? 'TextureCube' : 'null'}, err: ${modeError}`,
            `cubemap build: ${cubeMap ? 'ok (6 canvas faces)' : cubeMapError}`,
        ].join('\n');
    }
}
cameraNode.addComponent(Overlay);

window.__airApp = app;
window.__inspect = {
    get mode() {
        return mode;
    },
    scene,
    camera,
    applyMode,
};
app.run(scene);

console.log('[manual/backgrounds] running on cocosair');
```

---

上一篇：[加载 glTF 文件（Load a .GLTF file）](load-gltf.md) ｜ 下一篇：[绘制透明对象（How to Draw Transparent Objects）](transparency.md)
