# Web 运行时功能范围

Cocos AIR 使用原生 Cocos 场景、节点、组件、网格、材质、动画和 UI API，并提供 Code First 启动与 glTF 适配。它面向浏览器；Creator Editor、JSB、原生平台和小游戏平台不属于默认运行时。

## 渲染与加载

默认浏览器路径使用 WebGL 2，初始化失败时返回 `WEBGL2_REQUIRED`；可显式选择桌面 WebGPU 实验后端，不自动回退。WebGL 1 不受支持，HEADLESS 仅用于测试。见 [默认 WebGL2 策略](../webgl2-only.md) 和 [WebGPU 指南](../guides/webgpu.md)。

glTF/GLB 使用原生 Mesh、Material、Skeleton 和 AnimationClip。模型扩展的状态以运行时 registry 和模型目录能力清单为准；加载 Draco、Meshopt 或 KTX2 时需配置单独部署的解码器。见 [模型加载](../gltf/gltf-runtime.md) 和 [扩展参考](../gltf/gltf-extension-reference.md)。

## Spark 高斯泼溅

冻结上游源码在 `vendor/spark/`（`@sparkjsdev/spark` 2.3.1，MIT，105 文件 / `src` 52 个 `.ts` + 8 个 `.glsl`），适配层在 `src/air/spark/`。
**源码在仓库不等于默认可用**：`spark` 已是声明在 `src/cc.config.json` 的**可选 feature unit**（入口 `src/exports/spark.ts`，运行时子树由
`tools/build/spark-runtime-tree.cjs` 生成到 `src/air/spark/generated/`），但它**必须**由变体构建显式点名（`AIR_FEATURES=…,spark`）才会被编译，
默认 27 项构建集合不含它；`package.json` 也**没有** `./spark` 子路径导出与 `files` 条目，因此安装本包无法 `import ... from 'cocosair.js/spark'`
（阻塞项是下面的 crate 许可缺口，不是构建能力）。默认 bundle 的依赖闭包内 spark 节点数为 0，产物里也不含 `SparkRenderer` / `sparkjsdev` 指纹
（由 `npm run verify:licenses` 与 `npm run verify:spark-assets` 负向断言）。

三条硬边界：

- **不进默认发行**：2.7 MB 级运行时子树与 1.5 MB 级 WASM 只在 `spark` 变体产物内可用；折入 `air` 聚合需过体积门禁并另经 owner 决定。
- **WebXR 不支持**：`SparkXr` 与手部追踪随 SPK-10 排除，是相对上游导出表的真实收窄；渲染桥仅保留惰性的 `xr` 外壳，不承诺会话能力。
- **构建期内联的受审计资产，且未重建**：解码用的 `spark_rs_bg.wasm`（1 554 721 B，SHA-256 `974320be5859f426967a2d9cc237e5eae1aca98b55e35087022d6d884b2dcce7`）
  与 wasm-bindgen glue `spark_rs.js`（47 694 B，SHA-256 `a4b2cc7226f2e4c9bf397b56da3520e6c6f7d65b55e486783ef9bffac3b4bf72`）取自上游 dist 发行件，
  **未在本环境用 Rust 重建**（本机 `cargo` 可用，但本仓未执行重建、也无重建产物与上述 SHA 的对账证据）；逐字节落在受审计目录 `vendor/spark-rs/`
  （`MANIFEST.md` + `npm run verify:spark-assets` 对账**字节身份**；`npm run verify:spark-data-parity` 用同一份 WASM 复跑**解码行为**：
  19 个合成 fixture × packed/extended、双实例整体 vs 不规则分块推流、排序独立 oracle、LoD 与射线共 72 例 PASS，39 例与冻结金标准逐位一致），构建期**以 base64 内联进 `spark` 变体产物**、不引入运行时 fetch，
  因此 `build/spark-rs/` 独立资产目录**不存在**，应用侧既无需托管、也没有可替换的 wasm 路径（原因与复议条件见 [UPSTREAM.md](../UPSTREAM.md) Deviation-07）。
  该 WASM 的逐 crate 许可面尚未转录，处置状态 `pending`（`docs/license-decisions.json`，缺口见 [第三方许可](../THIRD_PARTY_LICENSES.md) §9）；
  据此变体产物暂不随包发运。资产来源与部署责任见 [Spark 运行资产来源](../notes/spark-asset-sourcing.md)。

公开入口形态、消费边界与核对命令见 [Spark 可选入口边界](spark-optional-entry.md)；来源身份、git 子树与 deviation 登记见 [UPSTREAM.md](../UPSTREAM.md)。
目标运行时不依赖 Three.js：冻结源码里的 `three` specifier 只在构建期别名到适配层，运行期不存在 `three` 包。

## 源码、导出与运行行为

目录中存在源码不代表默认 bundle 已包含该功能；声明中存在 API 也不代表外部运行资产已经部署。例如 Spine 和部分 WASM 后端仍受外部资产限制，具体记录见 [Spine 资产来源](../notes/spine-asset-sourcing.md) 与 [物理后端资产来源](../notes/physics-asset-sourcing.md)。

feature 声明来自 `src/cc.config.json`，默认构建集合来自 `tools/build/build.cjs`；`AIR_FEATURES` 用于显式构建变体。变体构建不会自动更新默认发布产物或运行证据。custom pipeline / post-process 的上游聚合方式与默认发布边界由专门门禁检查，不能仅因某个 feature 名称存在就判其像素效果已交付。

```bash
npm run verify:web-only
npm run verify:feature-exports
npm run verify:custom-exports
npm run verify:wasm-backends
npm run verify:spark-cpu-parity
npm run verify:spark-pixel-parity
npm run verify:spark-dpr-mismatch
```

这些检查分别验证依赖闭包、默认组成、custom pipeline 导出及 WASM 后端登记；浏览器行为需要另行验证。Spark 的 half-float /
packed-splat 编码面由 `verify:spark-cpu-parity` 在浏览器内把本仓变体产物（`cc.sparkRuntime`）与上游参考包逐位对账，与
`verify:spark-assets`（对账 WASM **字节身份**）、`verify:spark-data-parity`（复跑 WASM **解码行为**）是三件不同的事。
像素面另分两条：`verify:spark-pixel-parity` 用双回环源做零容差 RGBA 对账（`deviceScaleFactor` 与页面请求比例相等的档位矩阵），
`verify:spark-dpr-mismatch` 只读复用同一批探针、但每行让这两个比例**故意不一致**，补的是缩放错配路径。上游基线和有意差异见 [UPSTREAM.md](../UPSTREAM.md)，API 兼容约定见 [稳定性登记](api-stability.md)。
