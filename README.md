# Cocos AIR (cocosair.js)

**Cocos Agent-first Interactive Runtime** — 基于 cocos4 的 TypeScript Web 引擎。直接用代码创建 Scene、Node、Camera、材质和动画，无需 Cocos Creator、Editor、场景文件或编辑器资产管线。

浏览器需要 WebGL 2。启动、渲染和 HTML 纹理接口统一从主入口导入；主入口不支持无 DOM 的 Node/SSR 运行。功能与发布边界见[支持策略](docs/webgl2-only.md)和[验证与发布检查](docs/reference/verification.md)。

2D 物理默认使用现有 JavaScript 后端；可显式选择 [Box2D 3.2 WASM 后端](docs/guides/box2d3.md)，继续使用 Cocos 刚体、碰撞体和关节组件。WASM 资产独立部署、按需加载。

## 先选择使用方式

| 你的目标                                    | 使用方式                                      | 是否需要引擎源码                            |
| ------------------------------------------- | --------------------------------------------- | ------------------------------------------- |
| 在自己的 TypeScript/JavaScript 项目开发应用 | 推荐安装本地 SDK tarball，或正式发布的 npm 包 | 应用不需要 src/、tools/、引擎 node_modules/ |
| 不用打包器，直接在网页运行                  | 复制主 JS，通过 import map 加载               | 不需要                                      |
| 修改引擎或运行仓库示例                      | 在本仓库安装开发依赖、构建并启动 dev server   | 需要                                        |
| 使用 Gaussian Splatting                     | 额外构建独立 Spark 模块，复用同一主引擎       | 本地构建需要；运行应用不需要                |

## 方式一：在自己的项目中依赖 SDK（推荐）

### 1. 准备可安装的 SDK

已有本项目提供的 .tgz 文件时直接跳到下一步。尚未有发行包时，在**引擎仓库根目录**生成本地安装包；不要求先发布到 npm 注册表。

以下构建命令以 Windows PowerShell 为例：

```powershell
git clone https://github.com/oahc09/cocosairjs.git cocosair.js
cd cocosair.js
npm ci
$env:NODE_OPTIONS = '--max-old-space-size=6144'
npm run build:all
npm pack
```

当前版本会生成 cocosair.js-1.0.0.tgz，实际文件名以 npm pack 输出为准。build:all 编译开发版、压缩版和声明，并准备发布副本；npm pack 只打包，不上传、不代替编译。内存上限仅用于本次构建进程及其子进程。

### 2. 创建应用项目并安装 SDK

下面使用 Vite vanilla-ts 模板。建议使用 Node.js 22.12+；模板工具的要求高于本 SDK 声明的 Node 18 下限，具体见 [Vite 安装要求](https://vite.dev/guide/)。

下面假设引擎仓库 `cocosair.js/` 与应用 `my-air-app/` 位于同一父目录。如果当前终端仍在引擎仓库，先执行 `cd ..`，然后创建应用：

```bash
npm create vite@latest my-air-app -- --template vanilla-ts
cd my-air-app
npm install
```

在新应用根目录，通过相对路径安装刚生成的包；目录布局不同时，调整相对路径：

```powershell
npm install "../cocosair.js/cocosair.js-1.0.0.tgz"
```

正式 npm 发行包可用时，也可以改用 npm install cocosair.js；本地 package.json 的 version 不代表注册表已经发布了同版本。应用只需要这个 SDK 依赖和自己的构建工具，不需要再安装 Cocos Creator、Three.js 或引擎的开发依赖。

### 3. 替换页面与业务代码

用下面内容替换应用根目录的 index.html；不要保留 Vite 模板自带的计数器页面和默认样式导入。

```html
<!doctype html>
<html lang="zh-CN">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>My Cocos AIR App</title>
        <style>
            html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
            canvas { display: block; width: 100%; height: 100%; }
        </style>
    </head>
    <body>
        <canvas id="GameCanvas"></canvas>
        <script type="module" src="/src/main.ts"></script>
    </body>
</html>
```

将下面代码放到 src/main.ts。本例生成一个蓝色立方体，使用无需光照的 builtin-unlit 材质，不需要模型、贴图或额外资源下载。

```ts
import { createAirApp, Scene, Node, Camera, Color, Vec3, MeshRenderer, Material, utils, primitives } from 'cocosair.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('Main');

const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(3, 2, 5);
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 24, 35, 255);

const cube = new Node('Cube');
scene.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
const mesh = utils.createMesh(primitives.box());
const material = new Material();
material.initialize({ effectName: 'builtin-unlit' });
material.setProperty('mainColor', new Color(60, 170, 255, 255));
renderer.mesh = mesh;
renderer.setSharedMaterial(material, 0);

app.session?.own(() => { mesh.destroy(); material.destroy(); }, 'cube-assets');
app.run(scene);
```

在**应用项目**根目录运行：

```bash
npm run dev
```

打开终端显示的地址，应看到深色背景上的蓝色立方体，控制台打印 AIR/Cocos 版本。没有 Camera 的空 Scene 不会绘制物体。应用部署使用 npm run build，发布生成的 dist/，无需复制引擎仓库。

### 4. TypeScript 类型

安装包已配置声明入口，正常从 cocosair.js 导入即可，不要手动 import .d.ts。TypeScript 5.0+ 使用主声明，4.9 使用 legacy 兼容声明；两份声明由包管理，不需要业务同时引入。项目保留 DOM 类型库，并按 SDK 当前消费合同启用 skipLibCheck: true。

仓库示例里的 cocosair 是 import map 别名；安装包的真实名称是 **cocosair.js**，不能直接照搬示例的裸别名。

## 方式二：不通过 npm 安装 SDK，直接使用 build 文件

普通网页运行只需主 JS。将构建产物复制到自己的站点，例如：

```text
my-site/
├── index.html
├── main.js
└── vendor/
    ├── cocosair.module.js
    ├── cocosair.module.d.ts        # 可选，供 TypeScript/编辑器使用
    ├── cocosair.legacy.d.ts        # 可选，TS 4.9 使用时与主声明一起保留
    └── cocosair.module.js.map      # 可选，源码调试使用
```

index.html 使用上面的完整页面，将脚本部分改为下面内容；import map 必须位于业务模块之前：

```html
<script type="importmap">
    { "imports": { "cocosair.js": "./vendor/cocosair.module.js" } }
</script>
<script type="module" src="./main.js"></script>
```

main.js 直接使用上面的立方体代码，它是有效 JavaScript，无需 TS 编译。通过 HTTP 服务打开站点，不要双击 file:// 页面。已有静态服务器可直接使用；只有 Node 工具环境时，可以在 my-site/ 目录运行下面的静态服务器命令，首次执行需要联网获取该开发工具：

```bash
npx --yes http-server . -a 127.0.0.1 -p 8080 -c-1
```

打开 http://127.0.0.1:8080/ 这里使用不改写模块导入的 [http-server](https://github.com/http-party/http-server)，让浏览器自行处理 import map；不是启动 Vite 来解析裸模块。

使用压缩版时，把文件换成 cocosair.module.min.js，并修改 import map 的值；类型路径仍指向主声明。裸别名不会自动寻找声明，若在此结构上编写 TS，可使用如下 tsconfig.json（TS 5.0+）：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "skipLibCheck": true,
    "paths": { "cocosair.js": ["./vendor/cocosair.module.d.ts"] }
  }
}
```

TS 4.9 将 moduleResolution 改为 node，paths 指向 cocosair.legacy.d.ts，并保留主声明。paths 只负责类型解析，不重写 JS 导入；浏览器仍使用 import map。也可以直接从实际 JS 相对路径导入，旁边同名的主声明会被自动找到。

## 方式三：开发引擎或运行仓库示例

以下命令在**引擎仓库根目录**执行，不能拿到安装 SDK 的应用项目里运行：

```bash
npm ci
npm run build
npm run dev
```

打开 http://127.0.0.1:7454/ 默认运行 starter。运行可见立方体示例：

```bash
npm run dev -- --example hello-cube --port 7454
```

仓库 dev server 会编译示例 TS 并提供引擎、示例资产和自动刷新。更改引擎源码后由开发服务器重建；需要完整类型和发布文件时另跑 build:all。所有脚本的前置条件、产物和写入行为见 [npm 命令说明](docs/reference/npm-scripts.md)。

## 哪些能力需要额外文件

| 使用内容                           | 需要准备什么                                                                                               |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 原生场景、程序化网格、内置材质、UI | 主引擎 JS；本页立方体没有额外资产依赖                                                                      |
| TypeScript 开发                    | SDK 声明；npm 自动解析，直接复制时按上文配置                                                               |
| 自己的图片、音频、glTF/GLB         | 模型及其外链资源，按应用 URL 部署；不等于引擎开发依赖                                                      |
| Draco / Meshopt / KTX2 压缩资产    | 对应解码/转码资源及 loader 配置；[部署指南](docs/gltf/gltf-decoder-deployment.md)说明浏览器 factory 等边界 |
| Spark 高斯泼溅                     | 独立 Spark 模块；默认主引擎没有这部分代码                                                                  |
| DevTools                           | 可选开发工具；应用正常运行不需要                                                                           |

普通应用不需要额外加载 bootstrap.js 或 html-source.js；这些独立入口已移除，相关 API 保留在主引擎。

## 可选：Spark 独立模块

在引擎仓库运行 npm run build:spark，然后将 spark.module.js 与主引擎 JS 放在同一个部署目录：

```js
import * as cc from './vendor/cocosair.module.js';
import { CocosSparkLayer, sparkRuntime, sparkMath } from './vendor/spark.module.js';
```

Spark 只借用该主引擎，不再打包第二份 Cocos。应用与 Spark 必须解析到同一个主 JS URL，不能同时加载两份引擎。TS 项目再复制 spark.module.d.ts 和完整 spark-types/；布局示例与类型路径见 [Spark 模块说明](docs/reference/spark-optional-entry.md)。

运行本地示例：npm run build:spark 后执行 npm run dev -- --example spark-splats。Spark WASM 的既有发布限制仍有效，当前模块不在 npm files/exports 中；不要写成可直接安装 cocosair.js/spark。

## 仓库结构

```
cocosair.js/
├── build/          # 产物：cocosair.module.js / cocosair.module.min.js（ESM）
├── docs/           # 分析与设计文档（含验收报告与证据截图）
├── examples/       # 可运行示例
│   ├── hello-cube/          # Camera + Light + 旋转 Cube（Code First 入门）
│   ├── static-model/        # 运行时 JSON 资产加载 + 程序化纹理 + 标准材质
│   └── skinned-animation/   # 3 骨骼蒙皮 + 骨骼动画（Code First 骨骼链路）
├── src/            # 引擎源码（engine root，与上游 cocos4 相对布局一致）
│   ├── air/                 # Cocos AIR 新增：bootstrap/app/utils/builtin
│   ├── cocos/               # 抽取的 Cocos 引擎核心；来源与有意差异见 docs/UPSTREAM.md
│   ├── exports/             # ccbuild feature unit 入口（air.ts 为 bundle 入口）
│   ├── pal/                 # 平台抽象层（Web 实现）
│   └── cc.config.json       # Air 引擎构建配置（由 tools/analyze/make-air-config 派生）
├── vendor/         # 只读冻结上游源码：pal 公开 MIT 快照、Spark 高斯泼溅运行时（不入默认 bundle）
├── test/           # smoke tests（jsdom + HEADLESS 渲染模式）
└── tools/          # build / dev / analyze / verify / baseline
```

## 命令

| 命令                            | 说明                                                                                                                                                                                                     |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run dev`                   | 三频道 Watch：engine(src/cocos\|pal\|exports)/air(src/air) 自动重建，example 只刷新不构建；example .ts 即时编译 + importmap                                                                              |
| `npm run build`                 | Development ESM 构建 → `build/cocosair.module.js`（附 source map）                                                                                                                                       |
| `npm run build:spark`           | 独立 Spark 模块、声明与 map；复用已有主引擎，不包含于默认 build:all，也不推进主引擎编译序号                                                                                                              |
| `npm run build:min`             | 压缩 ESM 本地构建 → `build/cocosair.module.min.js`（附 source map）                                                                                                                                      |
| `npm run build:dts`             | 类型声明 → `build/cocosair.module.d.ts`（编辑器补全 / Go to Definition）                                                                                                                                 |
| `npm run build:all`             | 以上全量构建，并生成 npm 专用的 `build/npm/` bundle 副本（不含 source map）；本地 `build/cocosair.module*.js.map` 保留调试用途                                                                           |
| `npm run typecheck`             | TypeScript 独立编译校验（0 依赖 Creator）                                                                                                                                                                |
| `npm run verify:web-only`       | Web-only 依赖守卫（按依赖可达性判定，禁止 native/minigame 泄入）                                                                                                                                         |
| `npm run verify:file-map`       | 簿记一致性：每行上游可解析 + 逐字节比对 + `modified` 标记互证 + `moduleOverrides` 替换件清点                                                                                                             |
| `npm run verify:licenses`       | 上游/第三方许可头清点（抽取件不得丢版权头）                                                                                                                                                              |
| `npm run verify:browser-matrix` | 三引擎（chromium/firefox/webkit）逐例截图 + probe 断言矩阵 → 产物指针见 `docs/reference/verification.md`（证据目录未随 npm 包发布）                                                                      |
| `npm run verify:wasm-backends`  | wasm 三后端护栏（只读，A1–A7）：抽取闭包落盘 / 范围计数不漂移 / 字节偏差 ⊆ 在册 / emscripten 说明符只在动态分支 / feature 声明面对账 / **A6 = 类型豁免解禁触发器** / **A7 = 物理子树缺件必须登记在差集** |
| `npm run verify:custom-exports` | 后处理与 custom 管线交付面护栏（只读，C1–C5）：接线门面与子图逐字节 + 簿记在册 + feature unit 声明与默认发行姿态不漂移                                                                                   |
| `npm run verify:doc-refs`       | 文档互引棘轮（只读）：markdown 里的仓库内路径必须存在；已知断链登记在 `tools/verify/doc-refs-baseline.json`，新增断链或基线腐烂即红                                                                      |
| `npm run verify:benchmark`      | Benchmark 工具类型检查、编译诊断、指标聚合及隔离/超时回归；不生成性能成绩                                                                                                                                |
| `npm run verify:api-coverage`   | 逐 API 执行证明与发布覆盖门槛（Core 100% / Important 90% / Advanced 80%）；`--check` 可只读核对报告是否对应当期库存、规格和证据                                                                          |
| `npm run verify:release`        | 发布候选总门禁：干净工作树、覆盖率、示例数、许可、示例/DevTools/Gallery/三浏览器证据与当前构建一致性                                                                                                     |
| `npm test`                      | smoke tests（jsdom + HEADLESS 渲染模式；当期数量以 `docs/test-inventory.json` 为准）                                                                                                                     |
| `npm run analyze`               | 更新 docs 中的抽取清单与文件映射，依赖图写入 build/reports/                                                                                                                                              |
| `npm run baseline`              | 在上游引擎目录复现 Web 基线构建；前置条件见 AGENTS.md                                                                                                                                                    |

## 文档

- [文档导航](docs/README.md) — 目录与主题入口
- [开发手册](docs/manual/index.md) — API 教程与可运行示例
- [渲染目标与 MSAA](docs/manual/rendering-contracts.md) · [纹理颜色、离线 GGX 与材质诊断](docs/reference/rendering-color-diagnostics.md)
- [Code First 入门](docs/guides/code-first.md) — 启动与画布约定
- [资源加载](docs/guides/asset-loading.md) · [骨骼工具](docs/guides/skinned-model.md) · [开发循环](docs/guides/engine-development.md)
- [运行时资源检查](docs/guides/runtime-inspection.md) · [Agent 调试会话](docs/guides/agent-development.md)
- [glTF / GLB 加载](docs/gltf/gltf-runtime.md) · [扩展参考](docs/gltf/gltf-extension-reference.md) · [解码器部署](docs/gltf/gltf-decoder-deployment.md)
- [官方模型目录与对照预览](docs/gltf/gltf-catalog.md)
- [功能范围](docs/reference/web-features.md) · [验证与发布检查](docs/reference/verification.md) · [Spark 可选入口边界](docs/reference/spark-optional-entry.md)
- [上游差异](docs/UPSTREAM.md) · [第三方许可](docs/THIRD_PARTY_LICENSES.md)

## 能力与支持边界

浏览器渲染要求 **WebGL 2**。WebGL 1 不受支持；WebGL 2 初始化失败时，`createAirApp()` 拒绝并携带 `WEBGL2_REQUIRED` 错误码。显式 HEADLESS 用于测试，不产生浏览器画面。详见 [浏览器支持策略](docs/webgl2-only.md)。

### 默认运行时

`createAirRenderTarget()` 将原生离屏相机、颜色／深度附件、MSAA resolve 和 resize 重绑组合成薄入口；请求与有效格式、采样数分别记录，不把不支持的浮点格式静默替换为 RGBA8。完整仓库示例见 `examples/water-multipass/` 和 `examples/hdr-color-pipeline/`。它们的定向验收不代表旧 Gallery 全集或完整发布门禁已重新通过。

| 能力             | 当前范围                                                                                                                                                                      |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 场景与渲染       | Core/Math、Scene Graph、Component、Game/Director、Camera/Light、Mesh/Material/Texture、WebGL 2、渲染管线与程序化 builtin 材质/效果。                                          |
| 动画与模型       | Animation、Skeleton/Skinning、primitive、tween、glTF/GLB 加载及已登记扩展。压缩与纹理转码需应用配置 decoder，详见 [模型加载](docs/gltf/gltf-runtime.md)。                     |
| 2D 与 UI         | 2D/UI、Mask、Graphics、Sorting2D、TiledMap、2D Particle。                                                                                                                     |
| 浏览器交互与媒体 | Web Input、Web PAL、AudioSource、VideoPlayer、WebView。                                                                                                                       |
| 物理             | 2D 默认为纯 JS Box2D；3D 同时包含 builtin 与 Cannon。builtin 提供离散碰撞检测，Cannon 提供刚体模拟；初始化前用 `createAirApp({ physics: 'cannon' })` 选择，默认仍为 builtin。 |
| 其他模块         | DragonBones、Profiler、GeometryRenderer、intersection-2d、custom pipeline / post-process 导出。具体渲染效果以相应示例与浏览器验证为准。                                       |

### 构建开关与聚合导出

能力名称、feature unit 和公开导出不是同一张清单。当前 `src/cc.config.json` 声明 **33** 个 feature，默认构建选择 **26** 个；以该配置和 `tools/build/build.cjs` 为准。

- `audio` 虽未列入默认 feature 选择，但由 `src/exports/air.ts` 静态聚合，音频能力已在默认 bundle 中。
- `mask`、`graphics`、`sorting`、`intersection-2d`、`geometry-renderer`、`spine`、`physics-framework` 等能力由聚合入口导出，不能仅按同名 feature 开关判断是否包含。
- 已声明但未选择的 feature 为 `audio`、`physics-2d-builtin`、`physics-ammo`、`physics-physx`、`physics-2d-box2d-wasm`、`marionette`、`procedural-animation`。构建变体使用 `AIR_FEATURES`，仍需验证完整依赖和运行资产。

可用 `npm run verify:feature-exports` 核对声明、聚合入口和默认产物组成；详细范围见 [功能范围](docs/reference/web-features.md)。源码或类型存在，只能证明相应代码已抽取，不能代替实际运行验证。

### 不包含或需要额外资产

- **WebGPU**：桌面 Web 实验后端已接入，使用 `createAirApp({ canvas, renderer: 'webgpu' })` 显式选择；默认仍 WebGL2，不自动回退。部署和当前验收边界见 [WebGPU 指南](docs/guides/webgpu.md)。
- **WASM 物理后端**：bullet/physx、Box2D WASM 的外部 JS/WASM 资产未随包提供，不属于当前可直接使用的后端。见 [资产来源记录](docs/notes/physics-asset-sourcing.md)。
- **Spine**：组件、类型及适配代码存在，但基线的完整运行时依赖尚未部署的外部资产；不能据此宣称 Spine 动画运行已验收。见 [Spine 资产来源](docs/notes/spine-asset-sourcing.md)。
- **Draco 浏览器解码**：adapter 支持注入 provider；随包入口为 Node/CommonJS 形态，浏览器 factory 由应用另行提供。见 [decoder 部署边界](docs/gltf/gltf-decoder-deployment.md)。
- **地形、3D 粒子、XR、Light Probe 等范围项**：不属于当前默认支持面，具体排除与待扩展范围见 [范围记录](docs/reference/scope-decisions.md)。
- **MiniGame、Native/JSB、Creator Editor**：不属于 Web 运行时依赖闭包。
- **Spark 高斯泼溅**：使用 `npm run build:spark` 生成独立 `build/spark.module.js`，借用主引擎，不重复打包 Cocos。可运行示例为 `examples/spark-splats/`。默认 bundle 不包含 Spark；WASM 仍以内联的上游发行字节提供，XR/hand 家族排除范围不变。Spark-rs 的 crate 级许可处置仍为 pending，因此当前仅提供仓库内可选构建，不纳入默认 npm 包。边界、声明与部署方式见 [Spark 独立模块](docs/reference/spark-optional-entry.md)。

## Code First 注意事项

- 主入口仍要求浏览器全局对象，但 canvas、包装容器和输入监听延迟到 createAirApp 启动时绑定；无需在 import 前创建 canvas 或设置 DPR。
  参考 `examples/hello-cube/index.html` 的模板结构。
- 原生Camera默认可见层已包含 `Layers.Enum.DEFAULT`；只在需要隔离层时显式配置visibility。
- builtin 材质/效果由 `src/air/builtin/register.ts` 程序化注册（无 Creator internal db）。
- `Skeleton.joints` 必须是**相对 skinningRoot 的完整路径**（`getChildByPath` 解析），
  层级骨骼写 `bone0/bone1` 而非 `bone1`；使用中的路径缺失报 `AIR_E_SKINNING_JOINT_PATH`。根空间、首帧与重绑定合同见[蒙皮配方](docs/manual/skinning-code-first.md)。
- 三关节蒙皮与骨骼动画用法见 `examples/skinned-animation/`，工具说明见 [骨骼工具](docs/guides/skinned-model.md)。

## 基线与上游

源码基线与有意差异见 [UPSTREAM.md](docs/UPSTREAM.md)。文件对应关系由 `docs/upstream-file-map.json` 和 `docs/extraction-manifest.json` 登记；当前对比可以运行 `node tools/compare/baseline-compare.cjs` 重新生成 build/reports/baseline-compare.json。

## 许可

本项目自有代码使用 MIT（见 LICENSE），内嵌第三方代码分别遵循其许可。
默认 bundle 包含 Spine 相关代码，使用与再分发须满足随包的 Spine Runtimes License Agreement 及其引用的 Spine Editor 授权条件；不能将整个 bundle 视为仅受 MIT 约束。
PAL 已改由公开、带 MIT 许可的 cocos4 固定源码生成，旧 `@cocos/engine-pal` 包不再使用。许可及版权 notice 随包提供，完整来源登记见 [第三方许可](docs/THIRD_PARTY_LICENSES.md)。

## AIR skills 路由与维护

[技能说明](skills/README.md) 介绍 Profile A 的按需读取、完整目录分发与预算；[生成索引](skills/INDEX.md) 来自各技能 frontmatter 和 Reference map，不另维护路由表。修改这些字段后执行 `node tools/skills/gen-index.cjs --write`，再用 `--check` 检查一致性。技能目录随 npm 包分发，不自动安装到宿主；阶段一保留完整参考内容，未实施大文件切片或单技能 bundle。
