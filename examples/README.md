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

| 页面       | URL                                  | 说明                                                      |
| ---------- | ------------------------------------ | --------------------------------------------------------- |
| 简单导航页 | `http://127.0.0.1:7454/index.html`   | 手写链接列表（当前只收录部分示例）                        |
| Gallery    | `http://127.0.0.1:7454/gallery.html` | 搜索 / 分类 / iframe 预览 / 源码查看，数据源 `files.json` |

`--example` 的取值合法性由 `examples/files.json` 清单校验。改过任意 `example.json` 后重新生成清单：

```bash
npm run gallery:manifest     # tools/examples/generate-manifest.cjs → examples/files.json
npm run gallery:api          # API 覆盖清单（example.json 的 apiClaims 来源核对）
```

当前示例集合以 `files.json` 为准；历史故障和当期验收记录由 Git 历史追溯。

## 3. 示例目录约定

新示例遵循 [仓库组织约定](../docs/reference/repository-layout.md)。已有示例 ID 是规格、Gallery 和证据的关联键，保持稳定；JS 示例继续用于其对应的教学内容。

```
examples/<id>/
├── index.html        # 必须含 <canvas id="GameCanvas">（见下方注意事项）
├── src/main.ts       # 新示例默认入口；已有示例也可能用根 main.ts/main.js
└── example.json      # Example Specification（§24 全量）：learning/effect/api/scene/interaction/ready/validation/coverage/screenshot/license + Gallery 元数据
```

- **`.ts` 入口只有 dev server 能跑**：它用 esbuild 即时编译（target es2022，支持 top-level await）。换静态服务器需先自行编译。
- **importmap**：`index.html` 若未自带 `<script type="importmap">`，dev server 会注入 `cocosair` → `/build/cocosair.module.js`。
- **共享库 `examples/shared/` 按真实层级导入**：根级入口写 `../shared/x.js`，`src/` 下的入口写 `../../shared/x.js`。
  浏览器验证器会把示例目录展平到暂存工作区根，因此写错层级的路径在它那里"恰好能跑"，而在 dev server 与
  Gallery 部署物里是 404 —— `spec-compliance-audit` 的 `S-IMPORT-RESOLVE` 就是拦这个的。
- **取景约定：主体必须落在画面中心**。默认俯仰角固定的样板相机（`position=[0,2.4,6.5]`、
  `rotationEuler=[-20,0,0]`）只对准原点，主体一旦不在原点就会偏到画面左下——所以要么传
  `setupCamera(scene, { lookAt: [x, y, z] })`（内部改用 `node.lookAt(...)` 代替欧拉角），
  要么在入口里显式 `cameraNode.lookAt(主体中心)`；用 `frameObject(camera, target)` 时 target 要覆盖
  全部需要同框的节点（例如 `node-scale` 取 `scene` 而不是被缩放的子节点）。
  `frameObject` 在 `renderer.model` 尚未随场景激活创建时回退到 `Mesh` 静态包围盒 × `node.worldMatrix`，
  因此场景未激活也能取到真中心，不会再降级成「节点原点 + 保底距离」。
- **资源型示例的 Lifecycle Contract（§25）**：`examples/shared/asset-lifecycle.js` 的
  `installAssetLifecycle({ label, hold, release, reacquire })` 会在页内安装 `window.__lifecycle()`，
  验证器取完截图后调用它，真实执行 释放 → 帧末延迟销毁等待 → `isValid` 泄漏核对 → 重新获取挂回，
  并要求重载后画面非空、无新增运行期错误、资产报告无 `DESTROYED_RESOURCE` 残留。
  手工验证：`await window.__lifecycle()` → `{ held, leaked: [], released: true, reloaded: true }`。

## 4. 开发回路（三频道 + 错误可见性）

| 改动位置                                | 行为                                                           |
| --------------------------------------- | -------------------------------------------------------------- |
| `examples/**`                           | 只 bump reload token，浏览器自动刷新，**绝不触发构建**（<1ms） |
| `src/air/**`                            | air 频道 rebuild                                               |
| `src/cocos` / `src/pal` / `src/exports` | engine 频道 rebuild                                            |

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

判定：0 console/着色器错误 + 画面存在与背景不同的像素。当前脚本只覆盖 `hello-cube`、`static-model`、`skinned-animation` 三例；V1.1 的 Gallery/清单类验证见 `tools/verify/runtime-inspection-browser.cjs`。

2026-09-18 实测（headless Chromium）：`static-model` / `skinned-animation` PASS，`hello-cube` **FAIL** —— `standard` 效果顶点着色器在无头驱动上编译失败；同一 bundle 在有 GPU 的浏览器里编译通过且正常渲染。属环境差异，未定性为引擎回归。无头跑 glTF/着色器类示例需要软件光栅化启动参数（`--use-gl=angle --enable-unsafe-swiftshader`，见 `tools/verify/example-spec-browser.cjs`），`examples-smoke.cjs` 目前未传。

## 7. glTF 类示例的额外前提

引擎**永不内嵌** WASM 解码器（体积与许可考虑）。Draco / meshopt / KTX2-BasisU 示例需要应用侧注入 decoder 资产：仓库已备好的在 `build/gltf-decoders/`，dev server 经 `/build/` 路由提供（`.wasm` MIME 正确）。注入 API、MIME/CORS/worker 与离线验收见 [`docs/gltf/gltf-decoder-deployment.md`](../docs/gltf/gltf-decoder-deployment.md)；逐扩展支持状态见 `examples/gltf-catalog/capabilities.json`。

## 8. 注意事项（Code First 踩坑点）

- `#GameCanvas` 必须在引擎 import **之前**存在于 DOM（`pal/screen-adapter` 是模块顶层单例，按 id 查找画布）。
- Camera 组件需显式 `visibility = Layers.Enum.DEFAULT`（4.0-alpha 默认值为 `undefined`，否则什么都不画）。
- `Skeleton.joints` 必须是相对 skinningRoot 的**完整路径**（`bone0/bone1`，不是 `bone1`）。
- 官方模型清单与 Khronos Viewer 对照：[`docs/gltf/gltf-catalog.md`](../docs/gltf/gltf-catalog.md)。

## 9. 当前示例实现状态（诚实清单）

45 个示例已全部补真实现并 `status = stable`（2026-09-19）。此前的 27 个占位壳（含
`anim-*`、`camera-*`、`light-*`、`mesh-*`、`material-*`、`node-*`、`rc-*`、`texture-basic`、
`gltf-draco/meshopt/morph/skin`）已补为真实场景内容。

状态不再在本文件手维护（易腐），改由机器证据给出：

| 事实                        | 来源                                                                                                                                                                                                                                            |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 规格冻结 / 校验问题         | `node tools/examples/spec-validate.cjs` → `docs/evidence/spec-validation.json`（当前 45 frozen / 0 draft / 0 blocked）                                                                                                                        |
| 浏览器验证                  | `node tools/verify/example-spec-browser.cjs` → `docs/evidence/examples-verified.json`（当前 40/40 PASS）                                                                                                                                     |
| DevTools 会话验证           | `node tools/verify/devtools-examples.cjs` → `docs/evidence/devtools-examples.json`（当前 5/5 PASS：`automation` + `rc-*`×4）                                                                                                            |
| 缩略图 / 逐步 validator     | `docs/evidence/examples/<id>.png`（45 张）                                                                                                                                                                                                      |
| API 覆盖（verified 口径）   | `node tools/examples/coverage-report.cjs` → `docs/api-coverage-report.json`（core 49/717 · important 6/793 · advanced 8/3219，claimed=verified 零冒充，但三道门禁仍 FAIL，需按 Wave 扩量）                                                      |
| 规范符合性（§1-§26 证据链） | `node tools/examples/spec-compliance-audit.cjs` → `docs/evidence/spec-compliance.json`（当前 0 fail / 1 warn；唯一 warn 是 gltf-draco 缺 Lifecycle Contract 的机器可读豁免——解码器不在随包工件内，无已解码资产可释放，如实 BLOCKED 不伪造） |

新增示例后：写 `example.json`（§24 全量规格）→ `npm run gallery:manifest` → `node tools/examples/spec-validate.cjs`
→ 起 dev server 访问 `/<id>/` 目视确认 → 跑上表对应验证器晋级 stable。
