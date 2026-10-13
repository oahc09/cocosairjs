# Cocos AIR Spark 高斯泼溅集成开发任务书

日期：2026-10-11。状态：**待实施**（本文仅为实施意图，不表示任何子项已落地或已验收）。

目标：把 `E:\AIProMax\github\spark-cocosairjs` 中 Spark 2.3.1 的 CocosAirJS WebGL2 原生 gfx 移植件，按其真实组成拆成三类分别合入本仓库源码：AIR 自有集成层 TS 化进 `src/air/spark/`，冻结的 Spark 上游算法本体按 `vendor/` 第三方源码惯例落位，引擎级 gfx 修复与既有 WGL 批次对账后只保留仍缺的 deviation。XR 支持按决策移除。

本任务书是 [端口缺口统一计划](port-gap-remediation.md) 的专项细化，不替代其范围、上游纪律与证据合同。SDK 缺陷部分与 [WebGL2 图形合同修复任务书](webgl2-gfx-contract-remediation.md) 及其[执行台账](../ledgers/webgl2-gfx-contract-remediation.md)直接衔接，编号不重号。与 [渲染合同台账](../ledgers/rendering-contracts.md)、[原生合同台账](../ledgers/engine-contract-hardening.md) 协调。

## 1. 范围与交付

### 1.1 归属结论（本任务书的前置裁定）

三目录候选的裁定，依据 [AGENTS.md](../../AGENTS.md) 与 [仓库组织与命名](../../docs/reference/repository-layout.md)：

| 候选 | 本仓库定义 | 裁定 |
| --- | --- | --- |
| `src/air/` | 「AIR 自有运行时代码」，按资产/渲染/引导/工具分层，经 `air` feature unit 进 bundle | **进**。`CocosRenderer`/`CocosSparkLayer`/`cocos-gfx-probe` 是 AIR 在原生引擎之上写的渲染集成层，与现有 `src/air/rendering/*`、`src/air/assets/gltf/*` 同类 |
| `src/external/` | 上游 cocos4 `external/` 的逐字节镜像（zlib.js、notepack.io，11 文件 diff 0） | **排除**。Spark 不是上游 Cocos 自有依赖；塞入会破坏该目录「逐字节对齐上游」的不变量与 `verify:file-map`/`verify:web-only` 门禁 |
| `src/cocos/` | 抽取的引擎源码，改动须登记 `upstream-file-map.json` 并给 `upstreamPath` | **仅承接引擎级修复**，不承接移植件。核对后仍缺的 gfx 差额才登记为 deviation |

### 1.2 主线

| 编号 | 优先级 | 开发任务 | 状态 |
| --- | --- | --- | --- |
| SPK-00 | P1 | 身份、工具链与环境核查并冻结本次参照 | 已完成（`docs/evidence/spark/`，台账 SPK-00） |
| SPK-01 | P1 | SDK 五处补丁与 WGL-05～09 逐条对账，判定「已等价可删 / 仍需 deviation」 | 已完成（六站点全覆盖，判定「补丁层删除」，台账 SPK-01） |
| SPK-02 | P1 | 移植件资产清单与依赖图分类，确定默认 bundle 边界 | 已完成（`asset-inventory-20261011.json` + `bundle-boundary-20261011.json`） |
| SPK-03 | P1 | 冻结 Spark 上游源码落入 `vendor/spark/`，许可与清单登记 | 已完成（`vendor-spark-tree-20261011.json`，Deviation-07） |
| SPK-04 | P2 | 数学层：**复用 `cc.math`/`cc.geometry` 元素**，只保留形状与命名适配，不重写算法 | **已完成（复用口径）**：等价复跑 `toleranceViolations 0`（容差 2e-10、project 1e-8 **未放宽**，最大绝对误差 `1.53e-11`；22 001 项检查 / 152 003 个 float32 分量）。剩余 `float32BitMismatches 2110`——真实位差 **605**（`parented lookAt matrix` 602 + `Euler from quaternion` 3）与仅 ±0 符号零 **1505**（`projection inverse` 1000 + `inverse` 505）——是「纯委托引擎（gl-matrix 血统）↔ three 运算次序」的固有末位差异，按 §1.3 复用纪律**接受**并登记为 **OPEN** deviation（`docs/UPSTREAM.md`）。验收行的「在位模式」字面判据与 §1.3 复用纪律互斥（§SPK-04 正文与 §5.1 已据实改写，取舍留 owner）。全部导出一律委托 `cc.*`：`verify:spark-adapter` 分类 `cc 11 / none 8`、成员级标注 **0**（无自持算法主体）。证据 `docs/evidence/spark/spk04-math-parity-20261012-camera-shim.json`（残差）+ 本次复用口径复跑 `output/spk04-math-parity-reuse-revert.json` |
| SPK-05a | P2 | 兼容门面：复用引擎元素 + 定性「上游 API 适配器 ≠ 并行场景抽象」，且**不进根导出面** | 已完成（`verify:spark-adapter` 150/150，`rootExportLeakage=[]`） |
| SPK-05b | P2 | 独立模式的 `Air.Scene` 公开取舍：**已决——不公开**，只发内嵌模式（详见 §5） | 已决，随 SPK-05a 落地 |
| SPK-06 | P2 | PMREM TS 化：`air-pmrem` → `src/air/spark/pmrem.ts` | 已完成 |
| SPK-07 | P2 | 渲染门面 TS 化：`CocosRenderer` → `src/air/spark/cocos-renderer.ts`（含惰性 XR 外壳） | 已完成 |
| SPK-08 | P2 | 场景接入 TS 化：`CocosSparkLayer` → `src/air/spark/cocos-spark-layer.ts` | 已完成 |
| SPK-09 | P3 | gfx 探针 TS 化并归档定位：`cocos-gfx-probe` → `tools/debug/probes/` 或 `src/air/spark/` | 已完成（定性为开发工具，落 `tools/debug/probes/`） |
| SPK-10 | P1 | **XR 移除**：删管理器与其测试/工具/导出，保留惰性 `xr` 外壳，登记边界 | 已完成（生成期断言 + 变体 0 命中，deviation 已登记） |
| SPK-11 | P1 | 冻结 Spark 本体接入：从 `vendor/spark` 生成运行时子图，WASM 资产按 decoder 模式单独发运 | 已完成，**形态偏离**：WASM 改构建期 base64 内联（`build/spark-rs/` 不存在），理由与复议条件见 Deviation-07 |
| SPK-12 | P1 | 构建接线：`spark` feature unit、`exports/spark.ts`、聚合出口与 npm exports | 已完成，**范围收窄**：只到变体构建；`package.json` 未开 `./spark` 子路径与 `files`（受 SPK-11 许可 `pending` 阻塞） |
| SPK-13 | P1 | 验证与证据：typecheck/构建/门禁/三浏览器行为与像素 | 已完成（三浏览器 × 4 场景 × 11 组画布/DPR 档位 = 132 行，全 `channelMismatch=0`，档位含 1、Windows 缩放档 1.25/1.375、分数 1.5、2、3；CPU/WASM 解码契约以 `verify:spark-data-parity` 等价复跑移植件 `tests/data-parity`，72 例 PASS / 0 FAIL、39 例与冻结金标准逐位一致；移植件 `cpu-package/*` 编码族以 `verify:spark-cpu-parity` 在本仓变体产物上浏览器复跑，三浏览器 × 17 项检查全 PASS（65536 half 模式、14 边界值、256 组 packed/extended/unpack 向量、五命名空间键集相等、导出面差集恰为登记的 27 个 XR/hands 剔除名），另有改位掩码的 tamper 证据证门禁能判红；比例不一致路径以 `verify:spark-dpr-mismatch` 收口——只读复用已验收像素探针，`deviceScaleFactor` 与页面被要求的 `dpr` 每组都不同（2↔1、1↔2、3↔1.5、1.5↔3，含 5:4 与竖屏），三浏览器 × 4 组 × 6 场景 = 72 行全 `channelMismatch=0` 且 72/72 行实测两端 `devicePixelRatio` 确实不一致、drawing buffer 跟随请求比例；像素门禁探针字节因 03:16 的分数 DPR 扩展已脱离旧证据绑定，故在现状上重采 `spk13-pixel-parity-20261012-refresh.json`（3 浏览器全 PASS）；真实触摸/事件通道仍未覆盖；不构成 release READY） |
| SPK-14 | P2 | 文档与上游登记：UPSTREAM / upstream-file-map / 第三方许可 / 计划索引 | 已完成（含本页状态列回写；三条 deviation：Deviation-07 来源/边界、§Spark XR 范围收窄、§Spark 数学层逐位残差；映射表 6 行 spark 行经 `register-spark-file-map.cjs --check` 复核 `wouldAdd=[]`；spark-rs crate 许可登记为 `pending`） |

批次内部顺序体现共享文件与复用依赖（SPK-01 与 SPK-02 之前不做任何源码搬迁；SPK-03/SPK-11 是 SPK-12 的前置；SPK-04～08 之间数学层与 `spark-api-adapter` 先于 `pmrem`/`renderer`）。不能把先做依赖解释为来源优先级被更改。

### 1.3 边界

- 正式目标为 WebGL2。不因本任务增加 WebGL1/WebGPU 的运行时支持承诺。
- **不搬运预构建 bundle patch**。`tools/patch-cocos.mjs` 在冻结 SDK bundle 上按指纹打补丁这一层在合并后整体作废（目标改为源码）。只做「行为等价性对账」，不做字节搬运。
- **不引入并行渲染器或采样器系统**。Spark 的 GPU 纹理/缓冲/shader/PSO/framebuffer/draw 全部经原生 gfx 创建与提交；目标运行时不依赖 Three.js 运行库。
- **复用 cocosair 元素，不重造轮子**（owner 指令）。数学、场景图、相机、几何与工具函数一律优先复用引擎既有实现：`cc.math`（`Vec2/Vec3/Vec4/Quat/Mat3/Mat4/Color` 与 `clamp/lerp/toRadian/toDegree/approx` 等）、`cc.core.geometry`（`Ray/AABB/Sphere/OBB/Plane/Frustum`）、`cc.Node`/`cc.Scene`/`cc.Layers`/`cc.Camera`。新代码只允许承载「跨引擎形状/命名/存储适配」，不得重新实现引擎已有的算法。
- **适配层逐成员可审计**（对上一约束的落地要求）：适配层（SPK-05a）暴露的**每一个成员**都必须在源文件内以注释标注其归属，且该标注为机器可提取的固定格式，供评审点与门禁逐条核对：

  ```
  // @air-element cc.Vec3            —— 委托引擎既有元素
  // @air-element none: Euler        —— 引擎确无对应；AIR 自持，理由：cc 仅有 Quat，无 Euler 类
  // @air-element gfx:TextureType    —— 委托原生 gfx 枚举（非 cc.math/geometry）
  // @air-element removed: SPK-10    —— 随 XR 移除一并排除，不实现
  ```

  四类归属预定义：`cc.*`（引擎既有元素，**必须**委托，不得自带实现）、`gfx:*`（原生 gfx 枚举/类型）、`none:<名称>`（引擎确无对应，AIR 自持并写明理由，属允许的适配）、`removed:SPK-10`（随 XR 排除）。不在四类内的归属标签视为计划失败。
- 门禁（SPK-13 落地）：新增静态检查，提取适配层全部导出成员与其 `@air-element` 标注，断言 ① 成员集合与标注集合一一对应（无未标注成员、无悬空标注）；② 标为 `cc.*` 的成员在实现体内**不得**出现该成员自身的算法主体（只允许构造、转发、字段映射）；③ 标为 `none:` 的条目必须非空理由。该检查为源码级，不依赖浏览器。
- **不把冻结 Spark 本体编进默认 bundle**。2.7 MB 运行时 + WASM 资产按可选入口/特性单元单独发运（同 `html-source`、`gltf-decoders` 先例），默认发行保持精简。
- 不更改版本号，不重置 `AIR_BUILD_NUMBER`。JS 构建会递增序号，声明构建与打包不递增。
- 不包含提交、推送、发布、部署或外部应用自动迁移。
- 保持现有普通浮点/归一化纹理、顶点色、蒙皮、普通深度采样与默认 sampler 行为不变。

## 2. 来源、发现与现状

### 2.1 上游身份

| 项 | 值 |
| --- | --- |
| 上游包 | `@sparkjsdev/spark` 2.3.1（MIT，WORLD LABS TECHNOLOGIES, INC.） |
| 冻结提交 | `c57ebb936a5d364e021a66a118204d599f6fdaa8`（`src`/`rust` 树与发行版 `699e3ad0` 逐字节一致，仅 `commit.txt` 不同） |
| WASM | `vendor/spark-rs/spark_rs_bg.wasm`，SHA-256 `974320be5859f426967a2d9cc237e5eae1aca98b55e35087022d6d884b2dcce7`；声明为「源等价发行件」，**未在本环境用 Rust 重建** |
| 上游规模 | `upstream/spark/src` 52 个 `.ts`，`upstream/spark/rust` 29 个 `.rs` |
| 移植件基线 SDK | 用户提供的 2026-10-06 `build(1).zip`，模块 SHA-256 `f6836f60…085372`；**不是**本仓当前源码 |

移植件 `dist/spark-cocosairjs.js` 2 738 871 B，`src/*.js` 共 7 文件约 189 KB。Three.js 0.180.0 **只存在于独立参考页**；目标侧对 `three` 的 21 处语句与 `three/addons/postprocessing/Pass.js` 3 处导入，由 `tools/build.mjs:46` 的 alias 重定向到适配层（工作线程内联，主线程 `external: true`）。实测目标产物 `dist/spark-cocosairjs.js` 内对 `three` 的引用为 **0**、内联 Three 运行库为 **0**，28 处 import 全部指向 `../src/air-compat.js`。**「`import * as THREE` 不是 AIR 写的」**：移植件自有的 7 个文件（含适配层 `air-compat.js`）对 `three` 的导入全为 0；写下该 specifier 的是**冻结的上游 Spark 源码**（21 文件），属不可改基线，alias 已把它导向 cocosairjs 实现。此为 SPK-05a 判定的直接证据。

### 2.2 SDK 补丁 ↔ WGL 对照（SPK-01 的输入）

`tools/patch-cocos.mjs` 六处 `replace`（含整数格式表）与本仓库已实施项一一对应：

| 补丁站点 | 目标缺陷 | 本仓对应已实施位置 | WGL |
| --- | --- | --- | --- |
| `TextureViewInfo` 增 `baseLayer` 透传（2 处） | view 层信息丢失 | `src/cocos/gfx/base/define.ts:1260` | WGL-08 |
| `framebufferTexture2D` → `framebufferTextureLayer`（array/3D/cube） | 数组/3D 附件选择错误 | `src/cocos/gfx/webgl2/webgl2-commands.ts:124` | WGL-08 |
| `vertexAttribPointer` → `vertexAttribIPointer`（整数属性，expected=2） | 整数属性走错绑定路径 | `src/cocos/gfx/webgl2/webgl2-commands.ts:94` | WGL-07 |
| 整数附件 `clearBufferuiv`/`clearBufferiv` | 整数 clear 错误 | wgl2 命令层（WGL-06 已实施） | WGL-06 |
| `CopyTextureToBuffers` 支持选定 layer（整函数替换） | 数组/MRT 读回布局 | `src/cocos/gfx/webgl2/webgl2-commands.ts:3199` | WGL-09 |
| `GFXFormatToWebGLFormat` 整数 `_INTEGER` 映射 | 整数纹理外部格式 | `src/cocos/gfx/webgl2/webgl2-commands.ts:387` | WGL-05 |

WGL 任务书 1.1 表已把 WGL-05～09 的来源明确标为 `Spark integer-format / integer-clear / integer-attribute / array-framebuffer / array-readback`，且源码「已实施」。**结论方向：六处补丁预期全部等价可删**，但必须逐条以行为等价证据确认，不得据表格推断。

### 2.3 XR 耦合（SPK-10 的输入）

AIR 自有 XR 管理器 `src/CocosXrManager.js`（13 566 B，`CocosXrManager extends EventDispatcher` + `updateStereoUnionCamera`）在移植件内的接线点：

- `CocosRenderer.js`：`:155` 构造 `this.xr = new CocosXrManager(this)`；`:156/:160` 会话起止监听；`:1612` 渲染前 `xr.enabled && xr.isPresenting` 分支与 `getCamera()`；`:1875` `setAnimationLoop` 转发；`:1898` `dispose`。
- `index.js`：`:4` 具名导出 `CocosXrManager`。
- 验收：`tests/xr-contract.mjs`（434 行，mock 契约）、`tools/run-xr-gfx-probe.cjs`、`tests/xr-gfx-probe.html`；`tools/accept.mjs` 的 `xr-cpu`/`native-xr` 两项。

**关键约束（决定「移除」的形态）**：冻结的 Spark 本体在**渲染路径**中无条件读取 `renderer.xr.*`——实测 `dist/spark-cocosairjs.js` 内 `.xr.enabled` 12 处、`.xr.isPresenting` 2 处（`onBeforeRender` 的 `preUpdate`/`useCamera` 选择）、`.xr.getSession()`（`renderSize` 回退与 hands/controllers）。上游 `SparkXr.ts:291-298/331/358`、`hands.ts` 另有 `setSession/setFoveation/setReferenceSpaceType/setFramebufferScaleFactor/getReferenceSpace` 调用。因此：

- **不能**从渲染门面里删除 `xr` 字段。要保留一个恒为空闲的外壳，使冻结代码短路到非 XR 分支。
- **可删**：AIR 自有的 `CocosXrManager` 类与 `updateStereoUnionCamera`、其测试/工具/导出与 accept 条目。
- **同时须排除**：冻结上游的 `SparkXr.ts` 与 `hands.ts` 所在子图（依赖已删的会话能力），不进运行时子图、不进公开导出面。这是相对上游 export 表的**真实收窄**，必须在 SPK-14 登记为 deviation 并写明复议条件与恢复路径。

### 2.4 Evidence → Finding → Path

| 证据 | 当前发现 | 开发路径 |
| --- | --- | --- |
| `spark-cocosairjs/src/*.js`（7 文件 189 KB）与 `dist/spark-cocosairjs.js`（2.7 MB） | 集成层 + 冻结本体 + 兼容垫片混装在一个私有包里 | 按 §1.1 三分归属拆分；SPK-02 出清单 |
| `tools/patch-cocos.mjs`（121 行，6 站点，指纹门禁 `f6836f60`→`eaad04f7`） | 规避的是预构建 bundle 的缺陷 | SPK-01 对账；等价则删补丁层，只留回归证据 |
| `artifacts/native-gfx-patch-controls.json` + `tests/.generated-gfx-variants/{patched,unpatched,without-array-framebuffer,without-array-readback,without-integer-attribute,without-integer-clear,without-integer-format}.js` | 全修复通过、原版与五个逐项撤销失败（外部历史身份，非本仓） | 作为 WGL-05～09 的独立因果参照重建本仓夹具，**不**复用其单一标记为通过条件 |
| `spark-cocosairjs/src/air-compat.js:1412/1430`、`src/air-pmrem.js:150/157/420/446` 读写 `renderer.xr.enabled` | 适配层自持的 PMREM/cube 路径以「临时关闭 XR」为状态保存项 | 惰性外壳下这些读写退化为恒等操作；保留字段以维持契约。落地文件名为 `src/air/spark/spark-api-adapter.ts` |
| 冻结 Spark 21 文件对 `three` 的导入形态：19 文件 `import * as THREE`、2 文件具名（`SplatLoader` 取 `FileLoader/Loader/LoadingManager`；`hands` 取 `Color/Matrix4/Object3D/Quaternion/Vector3/WebXRManager`）、3 文件取 `three/addons/postprocessing/Pass.js` 的 `FullScreenQuad`。命名空间形式累计触及 **61 个不同成员、895 处引用**（`Vector3`×254、`Quaternion`×94、`DataArrayTexture`×78、`Color`×58、`Matrix4`×40…） | 命名空间导入使适配目标必须呈现上游可触及的**整个形状**，故适配层无法按「只留用到的方法」收窄 | SPK-05a 以 `tools/build.mjs` alias 图 + 该成员闭包为「适配器」的裁定证据；`hands` 随 SPK-10 排除后具名导入仅剩 `SplatLoader` |
| `tools/build.mjs:46` alias `three` → `src/air-compat.js`；移植件自有 7 文件对 `three` 的导入均为 0 | 该 specifier 由**冻结上游**写下，非 AIR 手写；alias 把它导向 cocosairjs 实现，目标产物内 three 引用为 0 | SPK-05a 以该 alias 图 + 成员闭包为「适配器而非并行抽象」的证据 |

## 3. 实施任务

### SPK-00 身份、工具链与环境核查

- 记录并冻结：`git rev-parse HEAD`、`src/cocos/gfx/webgl2/{webgl2-device,webgl2-commands,webgl2-gpu-objects}.ts` 与 `src/cocos/gfx/base/define.ts` 的 SHA-256、`build/cocosair.module.{js,min.js,d.ts}` 指纹、`tools/build/build-number.json` 当前计数。
- 记录移植件身份：`dist/spark-cocosairjs.js` 与 `src/*.js` 的 SHA-256、上表 WASM 与 `upstream/spark` 树指纹。
- 核查 Node/npm/Playwright 与浏览器可用性：`npm run verify:port-env`。
- 验收：产出只读身份块，写入 §2 或 `docs/evidence/` 下的新采集文件；**不**覆盖历史报告指纹。

### SPK-01 SDK 补丁与 WGL-05～09 逐条对账

- 对 §2.2 六行逐条：在**当前源码**上确认对应实现（读源码为证），并对照补丁期望的 GL 行为（`framebufferTextureLayer` 的 layer 选择、`vertexAttribIPointer` 的 9 种整数类型集合、`clearBufferuiv/iv` 的 UINT/INT 分支、读回选定 layer、`_INTEGER` 外部格式表）判定行为等价。
- 等价项 → 判定「补丁层删除」，只保留为本仓回归证据；非等价项 → 登记为新的 upstream deviation（SPK-14）。
- 独立重建本仓最小夹具覆盖整数格式/整数 clear/整数属性/array framebuffer/array readback，**不复用** Spark 的单一标记作为通过条件；验证独立期望值与 `gl.getError()` 状态。
- 验收：产出对照表（等价/差额/证据路径），写入 `ai/ledgers/spark-integration.md`；如产生 deviation，写入 `docs/upstream-file-map.json` 与 `docs/UPSTREAM.md`。

### SPK-02 资产清单与依赖图分类

- 对 `src/*.js`、`dist/*`、`vendor/spark-rs/*`、`upstream/spark/**` 逐文件分类：`AIR 集成层` / `冻结上游` / `兼容垫片` / `XR 家族` / `测试工具`，产出清单（建议 `docs/evidence/spark/` 新文件，或并入 SPK-14 的登记）。
- 用依赖图确认默认 bundle 边界：`node tools/analyze/dep-graph.cjs`（`AIR_FEATURES` 变体）验证 `spark` 子图默认不进闭包。
- 判定 2.7 MB 运行时与 WASM 的发运形态：WASM 走 `build/gltf-decoders/` 同类（独立 package + `type` 声明），运行时走可选入口。
- 验收：清单可复算（含每文件 SHA-256 与归类理由）；边界结论有依赖图证据。

### SPK-03 冻结 Spark 上游源码落位

- 落位 `vendor/spark/`（照 `vendor/pal-source/` 先例）：上游 `src/**`、`rust/**`、`LICENSE`、以及 `upstream/spark` 当前树指纹清单。
- 许可：新增 `licenses/LICENSE_spark.txt`（MIT 原文，逐字节取自 `upstream/spark/LICENSE`），在 `docs/THIRD_PARTY_LICENSES.md` 新增一节登记「Spark 2.3.1，冻结提交，MIT，ships: variant/source」。
- 门禁：`node tools/verify/verify-licenses.cjs` 需能识别该组件（可能需在 `tools/verify/verify-licenses.cjs` 的组件表新增条目）。
- 验收：`verify:licenses` 通过；`vendor/spark` 与原树逐字节一致（提供比对命令）。

### SPK-04 数学层：复用引擎元素，只做形状适配

- 输入 `src/air-math.js`（40 KB）。**算法不重写**：把它对 `Vector2/3/4`、`Matrix3/4`、`Quaternion`、`Euler`、`Color`、`Ray`、`Box3`、`MathUtils` 的实现改为委托引擎既有元素。
  15 个导出成员全部委托 `cc.*`（`cc.math` 的 `Vec2/Vec3/Vec4/Quat/Mat3/Mat4/Color`、`cc.core.geometry` 的 `Ray/AABB` 与形状检测、`cc.core.math.utils`），
  8 个标 `none:` 的理由是「引擎确无该形状」（Euler / Matrix2 / 色彩空间常量与本层色彩转换 / ColorManagement），不是「引擎有但不用」。
- 可复用映射（已核实存在）：
  - `Vec2/Vec3/Vec4/Quat/Mat3/Mat4/Color` ← `cc.math`（`src/cocos/core/math/index.ts:35-43`），字段名 `x/y/z/w`、`r/g/b/a` 与 Three 一致；
  - `Ray/AABB/Sphere/Plane/Frustum` ← `cc.core.geometry`（`src/cocos/core/geometry/`）；
  - `MathUtils.{clamp,lerp,toRadian,toDegree,approx,...}` ← `cc.core.math.utils`（`src/cocos/core/math/utils.ts:40-280`）。
- **必须保留的适配**（引擎无对应形状，属允许的适配层，非重造算法）：
  - `Mat4`：引擎用 `m00..m15` 具名字段，Three 用 `.elements`（列主序）；须提供 `.elements` 访问器与 `fromArray/toArray`、`compose/decompose/makePerspective`、`multiplyMatrices/applyMatrix4/invert/transpose` 等命名适配；
  - `Euler`：引擎无 `Euler` 类，需按 Three 命名保留一个薄封装（内部可委托 `Quat`/`Mat4`）；
  - `Box3`：引擎只有 `AABB`，按 Three 的 `setFromPoints/expandByPoint/applyMatrix4` 命名适配。
- 精度：Web 下 `MATH_FLOAT_ARRAY = Float64Array`（`math-base.ts:29`），与 `air-math.js` 声明的双精度一致；WebGL2 实际端口为 Web，不存在 JSB 分支。
- 验收：`tests/math-parity` 的等价复跑在位模式上通过（见 SPK-13）；每个保留的适配点写入文件头注释（适配对象 + 不复用引擎的原因）。

#### 落地后的实测与取舍（2026-10-13，恢复纯委托口径）

- **「位模式」判据与 §1.3 复用纪律互斥，取舍按复用纪律**：本层全体导出（含 `Matrix4.invert`/`lookAt`/`compose`/`multiplyMatrices`/
  `makeRotationFromQuaternion`、`Quaternion.setFromRotationMatrix`）一律委托 `cc.*`。等价复跑实测 `toleranceViolations 0`
  （容差按移植件原值 2e-10、project 1e-8 **未放宽**，最大绝对误差 `1.53e-11`），但 `float32BitMismatches 2110 / 152003` 不成立——
  即验收行「在位模式上通过」的字面判据**达不到**。
- **残差的两类根因**（`docs/evidence/spark/spk04-math-parity-20261012-camera-shim.json`；本次复用口径复跑
  `output/spk04-math-parity-reuse-revert.json` 逐项重现同一分布）：
  - **真实位差 605** —— `parented lookAt matrix` 602 + `Euler from quaternion` 3。把四元数输入统一成 oracle 值的 isolated 趟**不归零**
    （`maxError` 分别 `1.33e-15` / `1.26e-13`），故是独立根因：`cc.Mat4` 的组合/取逆走 gl-matrix 血统的按列累乘与视图基约定，
    与 three 世界基/行主序展开在 3×3 交叉项上的加法次序不同；`Euler.setFromQuaternion` 的分支选择亦不同。
  - **仅 ±0 符号零 1505** —— `projection inverse` 1000 + `inverse` 505。数值相等，只有 `-0` 与 `+0` 的位模式差。
- **为什么不消掉它**：§1.3 与 §SPK-04 要求数学一律优先复用引擎既有实现、适配层只允许形状与命名适配。要让上面两类逐位一致，
  必须放弃 `cc.*` 委托、在本层重写矩阵组合/取逆与欧拉转换的算法主体，与复用纪律直接冲突（owner 指令亦重申「不重造轮子」）。
  因此按 deviation 登记（`docs/UPSTREAM.md` §Spark 数学层逐位残差 deviation，**OPEN**），而不是靠放宽容差或静默通过。
- **归属面实测**：`npm run verify:spark-adapter` 中 `spark-math.ts` 分类 `cc 11 / none 8`、**成员级标注 0**，
  `findings: []`；8 个 `none:` 全部是「引擎确无对应形状」并写明理由（Euler / Matrix2 / 色彩空间常量与本层色彩转换 / ColorManagement），
  无「引擎有而不用」。全层（5 文件）分类 `cc 11 / gfx 1 / none 138`。
- **影响面（有像素证据）**：残差量级 ≤ `1.5e-11` 且落在容差内，未改变任何一次输出——96 行像素证据（`spk13-pixel-parity-20261012.json`
  6 场景 + 两批画布矩阵 60 + 72 行，含分数 DPR 1.5 与 DPR 3）全部 `channelMismatch=0`。
- **无派生代码**：恢复纯委托后 `spark-math.ts` 不再含 three r180 的抄写主体，原 §10 派生登记与 `licenses/LICENSE_three.txt`
  随之撤销（见 `docs/THIRD_PARTY_LICENSES.md` §10）。

### SPK-05a 兼容门面：复用元素 + 定性为适配器 + 隔离

- 输入 `src/air-compat.js`（48 KB）→ `src/air/spark/spark-api-adapter.ts`。**按角色命名，不按遗留 specifier 命名**：该文件不 `import` Three（实测其 three 相关文本仅 4 处注释），它是「冻结 Spark API 面 → cocosairjs 元素」的适配层。旧名 `air-compat` 易被误读成「AIR 级并行抽象」，新名按角色限定作用域。
- 复用地基：常量与枚举（混合/深度/包裹模式、`REVISION`）保留为字面量协议（上游按数值协商，不是引擎概念）；`Scene`/`Camera`/`PerspectiveCamera`/`Group`/`Mesh`/`Material`/`Texture` 等**场景对象形状**必须保留（冻结上游 19 个 `import * as THREE` 文件会触及任意属性，无法收窄），但其**内部实现**改为在可能处委托引擎元素（矩阵/向量/颜色/射线），不得存在与引擎重复的算法实现。
- 保留 `WebGLRenderer` 的**显式抛错占位**（`unsupported("WebGLRenderer. Construct CocosRenderer instead")`）与 `COCOS_AIR_COMPAT` 标记（`engine/contractRevision/implementation/unsupported`）——它们是本层定性为「适配器」的自证。
- 保留原文中 4 段 r180 log-depth 着色片段的 MIT 来源标注（现标注在 `air-compat.js`，迁移时原样保留）。
- **硬约束 1（构建正确性，非风格）**：不得从 `src/air/index.ts` 或任何进入 `cocosair` 根导出面的 barrel 重新导出本层。`cocosair` 根已有引擎 `Scene`（`src/exports/base.ts:40` → `export * from '../cocos/scene-graph'`），`src/exports/air.ts:36` 又 `export * from '../air'` 把 air barrel 并入同一模块；若本层进该 barrel，同一模块将出现第二个 `Scene` 导出，构建期即冲突。
- **硬约束 2**：定性结论与证据写入台账与 `docs/upstream-file-map.json`（`upstreamPath: null` + reason「冻结 Spark API 面的适配器，非 AIR 并行场景抽象」）。证据链 = `tools/build.mjs:46` 的 alias 重定向 + 上述符号闭包 + `WebGLRenderer` 抛错占位 + `CocosSparkLayer` 强制真实 `cc.Camera`（`src/CocosSparkLayer.js:28`）。
- **硬约束 3（逐成员可审计，§1.3）**：本层每个导出成员须带 `@air-element` 标注（`cc.*` / `gfx:*` / `none:<名称>` / `removed:SPK-10` 四类）。已核实的归属基线（编写计划时点，实施时以当次核查为准）：

  | 成员类别 | 归属 | cc 元素（已核实） |
  | --- | --- | --- |
  | `Vector2/3/4`、`Quaternion`、`Matrix3/4`、`Color` | `cc.*` | `cc.math` 的 `Vec2/Vec3/Vec4/Quat/Mat3/Mat4/Color`（`src/cocos/core/math/index.ts:35-43`） |
  | `Ray`、`Box3`、`Frustum`、`Sphere`、`Plane` | `cc.*` | `cc.core.geometry` 的 `Ray`/`AABB`/`Frustum`/`Sphere`/`Plane`（`Box3`→`AABB`，命名适配） |
  | `MathUtils`（`clamp/lerp/toRadian/toDegree/approx…`） | `cc.*` | `cc.core.math.utils`（`math/utils.ts:40-280`） |
  | `DataArrayTexture`、`DataTexture`、`CubeTexture`、`WebGLRenderTarget`、`WebGLArrayRenderTarget`、`WebGLCubeRenderTarget`、`RenderTarget` | `gfx:*` | 原生 gfx `TextureType`/`Format` 枚举（`src/cocos/gfx/base/define.ts:380-396`）+ 适配层持有的 `WebGLRenderTarget` 形状 |
  | `Scene`、`Camera`、`PerspectiveCamera`、`OrthographicCamera`、`CubeCamera`、`Group`、`Mesh`、`Object3D`、`Layers` | `cc.*`（形状适配） | `cc.Scene`/`cc.Camera`/`cc.Layers`/`cc.Node`（`src/cocos/scene-graph/index.ts:30-33`、`src/cocos/misc/camera-component.ts:106`） |
  | `Euler` | `none:Euler` | **引擎确无 Euler 类**（`cc.math` 仅 `Quat`）；AIR 自持薄封装，理由随注释放文件内 |
  | `Raycaster` | `none:Raycaster` | **引擎确无不叫此名的射线投射器**；但内部射线/求交须委托 `cc.core.geometry`（`intersect.ts`/`distance.ts`），不得另写几何算法 |
  | `PMREMGenerator` | `none:PMREMGenerator` | 引擎无；AIR 自持（SPK-06 的 `pmrem.ts`），GPU 工作经原生 gfx |
  | `WebGLRenderer` | `none:WebGLRenderer` | 显式抛错占位（`removed` 语义的子集：不实现渲染器） |
  | `WebXRManager`、`hands` 相关 | `removed:SPK-10` | 随 XR 移除排除，不实现 |

- 验收：`npm run typecheck` 0 红；grep 证明 `src/air/index.ts` 与根导出面出现 0 次该层导出；`@air-element` 静态检查（SPK-13）通过；Prettier 合规。

### SPK-05b 独立模式的 `Air.Scene` 公开取舍 —— 已决：不公开

- **决策（owner，2026-10-11）：只发内嵌模式，不公开独立模式的 `Air.Scene`/`Air.PerspectiveCamera` 命名空间导出。**
- 理由：`cocosair` 的既定主 API 是引擎 `Scene`/`Node`/`Camera`（`createAirApp().run(scene)` 以 `scene instanceof Scene` 校验真实引擎 Scene，见 `src/air/app.ts:139`）。再公开一套 Spark 味的同名场景类，即使命名空间隔离，也在公开面上放了两个都叫 `Scene` 的东西，其解释成本高于便利收益；且用户明确要求复用 cocosair 元素而非另造。
- 落地：compat 层退化为纯内部管线（`CocosSparkLayer` 内部私有 `new Scene()`/`new Camera()` 不外露），无争议地成为适配器，本项随之结案。
- 复议条件：若后续出现「起一个独立 Spark 场景」的真实用户需求，需提交 owner 重新评估；届时若公开，必须始终命名空间隔离（`import * as Air`），绝不并入 `cocosair` 根导出。当前**不**为该场景预留任何公开入口或半成品导出。

### SPK-06 / SPK-07 / SPK-08 渲染集成层 TS 化

- SPK-06：`air-pmrem.js` → `src/air/spark/pmrem.ts`（17 KB）。
- SPK-07：`CocosRenderer.js` → `src/air/spark/cocos-renderer.ts`（62 KB）。要点：
  - 设备逃逸面收窄（独立 uniform 上传、异步 PBO 读回、上游显式子图上传）保持；
  - `isArrayCamera` 眼循环：XR 移除后 `isArrayCamera` 恒非真，`cameras` 恒为 `[camera]`。**保留**该通用路径（低风险），作为可选简化项登记，不强制删除；
  - 新增惰性 XR 外壳（SPK-10 落地）：

    ```ts
    // 冻结 Spark 本体在 onBeforeRender 中无条件读取 renderer.xr.*（enabled / isPresenting /
    // getSession）。AIR 不提供 XR 会话，故保留恒空闲外壳使冻结代码短路到非 XR 分支；
    // 不实现 setSession/setFoveation 等会话能力。
    const inertXr = {
        enabled: false,
        isPresenting: false,
        getSession: () => null,
        getCamera: () => null,
        setAnimationLoop: () => {},
    };
    ```

- SPK-08：`CocosSparkLayer.js` → `src/air/spark/cocos-spark-layer.ts`（11 KB）。保留对未验证后处理组合的显式抛错、`renderHook: after-render | camera-end` 校验、`ownsApp=false` 的所有权边界。
- 命名与分层按 `src/air/` 现有 kebab-case（如 `graphics-commands.ts`、`ui-kit.ts`）；不做 `PascalCase` 组件文件名。
- 验收：每文件 `npm run typecheck` 0 红；Prettier 合规（`npx prettier --check <paths>`）。

### SPK-09 gfx 探针定位

- `cocos-gfx-probe.js`（8 KB，独立原生 gfx 探针）按仓库约定「常驻探针放 `tools/debug/probes/`，名称表达诊断对象」定位；若判定为运行时公开能力则留 `src/air/spark/`。
- 验收：定位后其导入路径与 dev-tooling 解析一致（`npm run verify:g3-tooling`）。

### SPK-10 XR 移除

- 删除：`src/air/spark/` 下的 XR 管理器（原 `CocosXrManager.js`）与 `updateStereoUnionCamera`；移植件 test/tool 侧的 `tests/xr-contract.mjs`、`tests/xr-gfx-probe.html`、`tools/run-xr-gfx-probe.cjs` 对应的**新仓**用例（若不复刻则不新建）；`index`/聚合出口中的 `CocosXrManager` 具名导出；`tools/accept.mjs` 中 `xr-cpu`/`native-xr` 条目对应的新仓验收项。
- 保留：SPK-07 的惰性 `xr` 外壳；`CocosRenderer` 的 `isArrayCamera` 眼循环。
- 排除：冻结上游 `SparkXr.ts` 与 `hands.ts` 子图（不进运行时子图与公开导出）。
- 边界登记：在 `docs/UPSTREAM.md` 与 `ai/ledgers/spark-integration.md` 记录相对上游 export 表的收窄、理由（AIR 无 XR 会话层）、复议条件（若后续引入原生 WebXR 会话管理器，恢复路径为重建 AIR XR 管理器 + 解除 `SparkXr`/`hands` 排除）。
- 验收：`npm run typecheck`、`npm run build` 通过；全仓无 `CocosXrManager`/`updateStereoUnionCamera` 残留引用（提供 grep 命令与空结果）；惰性外壳使冻结渲染路径在无 XR 下正常出帧。

### SPK-11 冻结 Spark 本体接入

- 从 `vendor/spark` 生成目标运行时子图（保留解码、WASM 排序、SH、GPU 生成器、累积器、光栅着色器算法），构建时以 alias 将 specifier `three` 指向 `src/air/spark/spark-api-adapter.ts`；**排除** `SparkXr`/`hands` 子图。
- WASM：`spark_rs_bg.wasm` 按 `build/gltf-decoders/` 模式独立发运（package `type` 声明 + 校验），其 SHA 与来源写入手册与清单；不得声称用 Rust 重建。
- 验收：产物可独立加载；`node tools/verify/decoder-audit.cjs` 类检查覆盖新资产（或新增等价检查）；源指纹与 SPK-03 清单一致。

### SPK-12 构建接线

- `src/cc.config.json`：新增 `spark` feature（`modules: ["spark"]`），默认可不进 `air` 聚合；如进聚合须过 bundle 体积门禁。
- 新增 `src/exports/spark.ts` 并按需要并入 `src/exports/air.ts` 聚合（参照 `exports/air.ts` 现有 `export * from './spine'` 等写法）。
- `src/air/index.ts` 增 `export * from './spark'`（仅当 SPK-02 判定进 `air` 单元时）。
- `package.json`：若走独立入口，新增 `exports["./spark"]` 与 `files` 条目（参照 `./html-source`）。
- 验收：`npm run build`、`npm run build:dts` 通过；`npm run verify:feature-exports` 通过（capability 名、feature unit、聚合出口与默认 bundle 组成一致）；`npm run verify:web-only` 通过（新 import 不引入 native/minigame 闭包）。

### SPK-13 验证与证据

- 静态：`npm run typecheck`、`npm run format:check`（新文件范围内 `npx prettier --check <paths>`）、`npm run verify:web-only`、`npm run verify:file-map`、`npm run verify:licenses`、`npm run verify:feature-exports`、`npm run verify:decoders`。
- **适配层归属静态检查（新增，落实 §1.3）**：新增工具（建议 `tools/verify/spark-adapter-elements.cjs`），从 `src/air/spark/spark-api-adapter.ts` 提取全部导出成员与其 `@air-element` 标注，断言：① 成员集合与标注集合一一对应（无未标注成员、无悬空标注）；② 标为 `cc.*` 的成员实现体内不含自身算法主体（仅构造/转发/字段映射）；③ 标为 `none:` 的条目理由非空；④ 归属标签落在四类之内。输出终端 JSON 与退出码，不写固定产物。该检查为源码级，不依赖浏览器，纳入 SPK-12 的 `verify:feature-exports` 同级门禁。
- 回归：移植件既有 CPU/WASM 与数学套件在**新仓等价复跑**（如保留：`tests/math-parity`、`tests/data-parity` 的等价物），比较最终上传 float32 完整位模式。
- 浏览器行为与像素：以本仓 `tools/verify` 家族采集真实 Chromium/Firefox/WebKit 证据（`npm run verify:browser-matrix` 或新增 spark 专项 collector），**不做**「同机通过泛化到所有 GPU/设备」的声明。严格通过条件沿用「每 RGBA8 通道字节差为 0 + 画面非空 + 两端自身重复稳定 + JS/GL 无错误 + 运行前后源/资产不变」。
- 消费者：`npm run verify:consumer`（含 TS 4.9 node16 与捆绑器解析实际消费）。
- 验收：所有门禁退出码与日志如实记录；失败原样保留、不重标 PASS；不构成 release READY。

### SPK-14 文档与上游登记

- `docs/UPSTREAM.md`：新增 Spark 集成与 XR 收窄的 deviation 条目（含理由与复议条件）。
- `docs/upstream-file-map.json`：兼容层/集成层文件以 `upstreamPath: null` + `baseline` + `reason` 登记（参照现有 `src/air/dom-overlay.ts` 词条写法）。
- `docs/THIRD_PARTY_LICENSES.md` + `licenses/LICENSE_spark.txt`：第三方登记。
- `ai/README.md`：新增「Spark 高斯泼溅集成 | [计划](plans/spark-integration.md) | [台账](ledgers/spark-integration.md)」索引行。
- `README.md` / `docs/`:用户可见边界说明（Spark 为可选入口、XR 不支持、WASM 未重建）。
- 验收：`npm run verify:doc-refs` 无新增断链。

## 4. 验收要求

1. 归属与拆分与本任务书 §1.1 一致，且 `src/external/` 未被改动。
2. SPK-01 对照表覆盖全部六处补丁站点，每行有源码或夹具证据；无「据表格推断」的等价结论。
3. XR 移除后全仓无残留引用，冻结渲染路径在无 XR 下正常出帧；惰性外壳有明确注释与台账登记。
4. 冻结 Spark 本体不进默认 bundle；WASM 按 decoder 模式单独发运并有清单。
5. 适配层每个导出成员有合规 `@air-element` 归属标注；`cc.*` 成员经静态检查确认不含自身算法主体；`none:` 条目理由非空（SPK-13 的静态门禁通过）。
6. 全部门禁如实记录退出码；浏览器证据绑定当前 dev/min 与源码指纹；不声称 release READY。

## 5. 待决与复议条件

- **SPK-05b 独立模式导出**：**已决（owner，2026-10-11）——不公开**，只发内嵌模式；复议条件为「出现独立 Spark 场景的真实需求」，届时须重新提交 owner 且始终命名空间隔离。
- **SPK-12 聚合范围**：`spark` 是否并入 `air` 聚合出口，取决于 bundle 体积门禁结果与 owner 取舍；默认独立入口。
- **SPK-10 XR 收窄**：`SparkXr`/`hands` 的排除是相对上游公开面的收窄；复议条件为「引入原生 WebXR 会话管理器」。
- **SPK-09 探针定位**：运行时能力 vs 开发工具的定性。

### 5.1 落地后新增的待决项（2026-10-12，交由 owner）

- **spark-rs 的 crate 级许可链**：`docs/license-decisions.json` 登记为 `pending`。三条闭合路径（转录逐 crate 清单 / 用本仓 Rust 重建并对账 SHA / 永久只作非发运变体）
  未选。**阻塞后果**：`package.json` 因此未开 `exports["./spark"]` 与 `files` 条目，spark 变体产物不随包发布，§SPK-12 的 npm 侧接线保持关闭。
- **SPK-04 的 ULP 级残差 —— OPEN deviation，取舍已按 §1.3 复用纪律落地（2026-10-13）**：本层全体导出委托 `cc.*`，
  实测 `toleranceViolations 0`（容差 2e-10/1e-8 未放宽，最大绝对误差 1.53e-11），但 `float32BitMismatches 2110 / 152003` 拆为两类：
  **真实位差 605**（`parented lookAt matrix` 602 + `Euler from quaternion` 3，isolated 趟不归零 ⇒ 独立根因，对应 gl-matrix 血统的
  Mat4 组合/取逆与 three 世界基在 3×3 交叉项上的加法次序差、四元数→欧拉分支差）与**仅 ±0 符号零 1505**（`projection inverse` 1000 +
  `inverse` 505）。两类全部来自「保持 `cc.*` 委托」这一约束本身，二者只能取其一：
  - **(A) 接受逐位不等价（当前）**：登记 deviation（`docs/UPSTREAM.md`，OPEN），数学层零算法主体、全量委托 `cc.*`。
  - **(B) 收紧判据到 `float32BitMismatches == 0`**：把上面 6 个成员改自持、逐位抄 three r180 次序（曾于 2026-10-12 按此实施并在
    2026-10-13 按 owner「复用元素、不重造轮子」指令回退）。代价是与 §1.3 冲突并引入 three 派生代码，需重新登记许可。
  当前取 **(A)**；若 owner 日后取 (B)，须重跑两批矩阵与像素证据。执行事实见台账 §SPK-04。
- **`spark` 是否并入 `air` 聚合出口**（§5 原有条目的现状）：变体实测 `AIR_FEATURES=…,spark` 产物（默认 min 3 713 427 B，
  sha256 `779c288e647c17f6…` 与既有基线逐字节相同 ⇒ 默认发行面未受影响），体积门禁未过，默认集维持 26 项不变。
  `AIR_BUILD_NUMBER` 每次 JS 构建递增（dev 产物 sha 逐次变化，min 产物不含该变量）。
