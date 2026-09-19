# examples — 如何跑示例场景

所有示例都是 **Code First**：一个 `index.html` + 一个 `main.ts`/`main.js`，无 Creator、无 `.scene`/Prefab。

## 1. 前置：先构建引擎 bundle

```bash
npm install
npm run build          # → build/cocosair.module.js（含 source map）
```

`npm run dev` **不会在启动时构建**，只在 `src/` 变更后重建。若 `build/cocosair.module.js` 不存在，页面会 404 并返回 `not found (build?)`。

## 2. 起 dev server 跑示例

```bash
npm run dev                                  # 默认 example = starter
npm run dev -- --example gltf-viewer         # 指定默认示例
npm run dev -- --example hello-cube --port 7500
```

打开 `http://127.0.0.1:7454/`（会 302 到 `/<当前示例>/`）。

**切换示例不需要重启服务**：直接访问 `http://127.0.0.1:7454/<example-id>/`，例如 `/hello-cube/`、`/gltf-catalog/`。

两个入口页：

| 页面 | URL | 说明 |
|---|---|---|
| 简单导航页 | `http://127.0.0.1:7454/index.html` | 手写链接列表（当前只收录部分示例） |
| Gallery | `http://127.0.0.1:7454/gallery.html` | 搜索 / 分类 / iframe 预览 / 源码查看，数据源 `files.json` |

`--example` 的取值合法性由 `examples/files.json` 清单校验。改过任意 `example.json` 后重新生成清单：

```bash
npm run gallery:manifest     # tools/examples/generate-manifest.cjs → examples/files.json
npm run gallery:api          # API 覆盖清单（example.json 的 apiClaims 来源核对）
```

> 2026-09-18：`gallery.html` 的 `showSource()` 末尾有一个多余 `});`，内联脚本报 SyntaxError 导致整段不执行（左侧示例列表渲染为 0 条）。已删除该行，实测 Gallery 加载 40 examples / 10 categories，deep-link 选中、iframe 预览与源码查看均正常。

## 3. 示例目录约定

```
examples/<id>/
├── index.html        # 必须含 <canvas id="GameCanvas">（见下方注意事项）
├── main.ts | main.js # 入口；部分新示例放在 src/main.ts
└── example.json      # 元数据：id/title/category/apiClaims/capabilities/validation
```

- **`.ts` 入口只有 dev server 能跑**：它用 esbuild 即时编译（target es2022，支持 top-level await）。换静态服务器需先自行编译。
- **importmap**：`index.html` 若未自带 `<script type="importmap">`，dev server 会注入 `cocosair` → `/build/cocosair.module.js`。

## 4. 开发回路（三频道 + 错误可见性）

| 改动位置 | 行为 |
|---|---|
| `examples/**` | 只 bump reload token，浏览器自动刷新，**绝不触发构建**（<1ms） |
| `src/air/**` | air 频道 rebuild |
| `src/cocos` / `src/pal` / `src/exports` | engine 频道 rebuild |

- 构建失败：页面顶部红色错误横幅，机读状态在 `/__build_status`（不清 reloadToken，保留上一个可用 bundle）。
- 各频道耗时：`/__stats`。
- Debug 面板：右下角 `debug` 按钮或 `Alt+D`（点击才动态 `import('/__debug/panel.js')`，默认页面加载不含 debug 模块）。`devtools` 类示例（`automation`、`rc-*`）依赖它，元数据里标了 `requiresDevTools: true`。

## 5. 不用 dev server 的静态跑法

```bash
node tools/verify/prepare-static.cjs                          # 编译 .ts→.js、重写 importmap 路径，产出 build/.tmp-v03-site-<ts>/
node tools/verify/serve-static.cjs <站点目录> 7464             # 通用静态服务，无注入/无编译
```

`prepare-static.cjs` 目前只打包 6 个目录（`starter`、`hello-cube`、`static-model`、`skinned-animation`、`gltf-viewer`、`shared`），且 `serve-static.cjs` 的 MIME 表缺 `.css`/`.wasm`。要跑全量示例请用 `npm run dev`。

## 6. 浏览器自动化回归

```bash
# 终端 A：npm run dev（需监听 7454）
# 终端 B：
NODE_PATH=<含 playwright 的 node_modules 路径> node tools/verify/examples-smoke.cjs
```

判定：0 console/着色器错误 + 画面存在与背景不同的像素。当前脚本只覆盖 `hello-cube`、`static-model`、`skinned-animation` 三例；V1.1 的 Gallery/清单类验证见 `tools/verify/v051-examples-browser.cjs`。

2026-09-18 实测（headless Chromium）：`static-model` / `skinned-animation` PASS，`hello-cube` **FAIL** —— `standard` 效果顶点着色器在无头驱动上编译失败；同一 bundle 在有 GPU 的浏览器里编译通过且正常渲染。属环境差异，未定性为引擎回归。无头跑 glTF/着色器类示例需要软件光栅化启动参数（`--use-gl=angle --enable-unsafe-swiftshader`，见 `tools/verify/v11-examples-verify.cjs`），`examples-smoke.cjs` 目前未传。

## 7. glTF 类示例的额外前提

引擎**永不内嵌** WASM 解码器（体积与许可考虑）。Draco / meshopt / KTX2-BasisU 示例需要应用侧注入 decoder 资产：仓库已备好的在 `build/gltf-decoders/`，dev server 经 `/build/` 路由提供（`.wasm` MIME 正确）。注入 API、MIME/CORS/worker 与离线验收见 [`docs/gltf-decoder-deployment.md`](../docs/gltf-decoder-deployment.md)；逐扩展支持状态见 `examples/gltf-catalog/capabilities.json`。

## 8. 注意事项（Code First 踩坑点）

- `#GameCanvas` 必须在引擎 import **之前**存在于 DOM（`pal/screen-adapter` 是模块顶层单例，按 id 查找画布）。
- Camera 组件需显式 `visibility = Layers.Enum.DEFAULT`（4.0-alpha 默认值为 `undefined`，否则什么都不画）。
- `Skeleton.joints` 必须是相对 skinningRoot 的**完整路径**（`bone0/bone1`，不是 `bone1`）。
- 官方模型清单与 Khronos Viewer 对照：[`docs/gltf-catalog.md`](../docs/gltf-catalog.md)。

## 9. 当前示例实现状态（诚实清单）

40 个示例中，**13 个有实际场景内容**，**27 个仍是占位壳**（仅 `createAirApp` + 空 `Scene`，为 V1.1 API 覆盖矩阵与 Gallery 骨架而建，`example.json` 里 `status: draft`）。全部条目 `status` 均为 `draft`，尚无 stable 晋级证据。

已实现（可直接看渲染效果）：

| 分类 | 示例 |
|---|---|
| basics | `starter`、`hello-cube`、`transform` |
| camera | `camera` |
| interaction | `input` |
| material | `material-basic` |
| animation | `tween-basic`、`skinned-animation` |
| mesh / texture | `static-model` |
| gltf | `gltf-viewer`、`gltf-catalog` |
| devtools | `automation` |

占位待补（27）：`anim-position`、`anim-rotation`、`camera-lookat`、`camera-multi`、`camera-ortho`、`gltf-draco`、`gltf-meshopt`、`gltf-morph`、`gltf-skin`、`light-point`、`light-sphere`、`light-spot`、`light-two-directional`、`material-color`、`material-transparent`、`material-unlit`、`mesh-cylinder`、`mesh-plane`、`mesh-sphere`、`mesh-torus`、`node-active`、`node-hierarchy`、`node-scale`、`rc-capture-frame`、`rc-create-node`、`rc-error-report`、`rc-inspect-scene`、`texture-basic`。

新增示例后：写 `example.json` → `npm run gallery:manifest` → 起 dev server 访问 `/<id>/` 目视确认零 console 错误。
