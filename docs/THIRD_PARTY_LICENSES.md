# Third Party Licenses / 第三方许可审计（Phase 19）

> 交叉登记：上游身份与 deviation 见 `docs/UPSTREAM.md`（§Spark 冻结上游源码、§Spark WASM 与 glue 的 provenance、§Spark 发运边界与接线状态），
> 消费面边界见 `docs/reference/spark-optional-entry.md`，逐文件指纹清单见 `docs/evidence/spark/`。本节内出现的仓库路径一律写全 `docs/` 前缀，便于 `npm run verify:doc-refs` 解析。

Cocos AIR V0.1 基于以下第三方代码/数据构建。本文件为 Source License Audit 的结果记录。

> 审计复核：2026-09-12（L13 修复与 Phase 18 之后）；§8/§9 的 Spark 登记于 2026-10-11 复核（`npm run verify:licenses` 与
> `node tools/build/vendor-spark-tree.cjs --check` 当日均为 exit 0）。

## 1. 引擎源码（src/cocos、src/pal、src/exports、src/extensions、src/external、src/DebugInfos*）

- 来源：`cocos-creator/engine`（cocos4）`4.0.0-alpha.33` 快照（2026-09-12）。
- 许可：MIT License。所有上游文件的版权头（Xiamen Yaji Software Co., Ltd. / Chukong / Cocos）
  **原样保留**，未做任何修改或移除（审计方式：抽取为逐文件拷贝，见 docs/upstream-file-map.json）。
- 版权头覆盖率（2026-09-12 扫描）：src/cocos + src/pal 共 788 个 .ts，723 个含
  `Copyright (c)` 头；其余 65 个为**上游本身未携带版权头的文件**（新近文件），
  非本项目剥离——抽取为逐文件拷贝，未做选择性删头。
- 上游修改（Modified）以 `docs/upstream-file-map.json` 为准（authoritative），当前 4 处：
  1. `src/cocos/rendering/pipeline-ubo.ts` — shadow/CSM UBO 扩容 2048B
  2. `src/cocos/gfx/webgl/webgl-swapchain.ts` — preserveDrawingBuffer 开启
  3. `src/cocos/animation/marionette/pose-graph/runtime-exports.ts` — 空实现覆盖（构建 override 同源）
  4. `src/cocos/core/platform/debug.ts` — DebugInfos import 显式 `.json` 扩展
  （均为功能性最小修改，不改许可/版权归属。）
- Air 自有代码：`src/air/**`（MIT，本项目）。

## 2. PAL 平台层（src/pal/**）

- 当前来源：公开 cocos4 提交 `9f0e30acb31f6d670f2c0bf818d61039846a2860` 的 PAL TypeScript 源码（移入私有仓库前的父提交），覆盖当前 Web 平台子集。
- 许可：该公开树的 MIT LICENSE，加上源码中的版权和许可声明；原文保存在 `vendor/pal-source/`，发布包携带 `licenses/LICENSE_pal.txt` 与 `licenses/NOTICE_pal.txt`。
- 重现：`node tools/build/pal-source.cjs --check` 校验源码 SHA-256 / Git blob、固定编译器、39 个 JS/声明产物和随包 notice。`--write` 显式重建，不下载文件。
- AIR 适配限于五个 Web 模块的画布绑定与 DPR：env.findCanvas、keyboard/mouse/touch、screen-adapter。引擎核心的 alpha.34 基线保持不变。
- 原 `@cocos/engine-pal@1.0.4` 明确为 UNLICENSED，现已停止使用其源码、类型和二进制，并移除依赖。没有把历史风险接受解释为该 npm 包的新授权。

## 3. 构建工具依赖

| 包 | 许可 | 用途 |
|---|---|---|
| @cocos/ccbuild | MIT | 引擎构建器（与上游一致） |
| @cocos/babel-preset-cc | MIT | Babel 预设（与上游一致） |
| typescript / tslib | Apache-2.0 | 编译 |

Box2D、Cannon 和 DragonBones 为源码构建及类型检查保留在 devDependencies 中，但其运行时代码已内嵌 bundle；第三方发布许可仍按下表单独登记。
| jest / ts-jest / jest-environment-jsdom | MIT | 测试 |
| chalk / fs-extra | MIT | 构建脚本 |
| @types/* | MIT | 类型 |

运行时产物 `build/cocosair.module.js` **无任何 npm 依赖**（引擎自包含）。

## 4. 测试 fixtures（src/air/builtin/builtin-effects.ts / builtin-glsl4.ts / builtin-material.ts）

- 来源：上游 `tests/fixtures/`（同仓库、同许可 MIT），按原样拷贝并附带 glsl1/glsl3 降写生成层。

## 5. 品牌与水印

- Cocos、Cocos Creator 商标与 Logo 归 Cocos 属主所有。Air 示例不使用任何 Cocos Logo 资产
  （builtin splash/watermark 纹理未包含在构建产物中）。

## 6. 待办（公开 GitHub 前必须完成）

- [ ] 复核 `src/air/builtin/*` fixtures 与上游 LICENSE 头的归档一致性（当前 fixture 文件未携带
      上游版权头，属上游 tests/ 的派生数据；公开发布前补充声明或改用程序化生成）。
- [ ] 如启用 `licenses/` 目录中列出的第三方组件（本快照未包含对应实现），逐项补齐声明。

## glTF 解码器资产（V0.5 T7，`build/gltf-decoders/`，随 npm 包发布但**永不**内嵌进引擎 bundle）

| 组件 | 版本/来源 | 许可 | 归属说明 |
|---|---|---|---|
| `meshopt/` | meshoptimizer **1.2.0**（`npm pack meshoptimizer@1.2.0`，github.com/zeux/meshoptimizer） | MIT | `meshopt/LICENSE.md`（上游原文照录） |
| `draco/` | draco3d **1.5.7**（`npm pack draco3d@1.5.7`，github.com/google/draco） | Apache-2.0 | npm 包不含 license 文件；`draco/LICENSE.md` = 归属说明 + Apache-2.0 全文 |
| `basis/` | Basis Universal 转码器，three **r168** 构建（`npm pack three@0.168.0` → `examples/jsm/libs/basis/`） | Apache-2.0 | Binomial LLC 授权；`basis/LICENSE.md` = 归属说明 + Apache-2.0 全文 |

逐文件 bytes/SHA-256 与注入方式（provider API、浏览器 Draco 决策、MIME/静态服务策略）以
`build/gltf-decoders/MANIFEST.md` 为权威记录；可重复审计工具：`node tools/verify/decoder-audit.cjs`
（Gate G5-build：包内离线加载三类 decoder + 清单哈希漂移 + 主 bundle/地图零内嵌）。

## 7. V1.2 内嵌第三方运行时（回归补全带入的运行库，2026-09-22 审计）

`npm run verify:licenses`（`tools/verify/verify-licenses.cjs`）是本节的门禁：每项必须有
（a）`licenses/`（或 `build/gltf-decoders/`）下的许可原文，且与来源**逐字节一致**（不许手写许可）；
（b）产物指纹与发布形态相符；（c）需所有者判断的项必须在 `docs/license-decisions.json` 有处置登记。
`licenses/` 已列入 `package.json` `files[]`，许可原文随 npm 包发布。

| 组件 | 落点 | 许可 | 原文 | 产物形态 |
|---|---|---|---|---|
| Spine runtime（`spine-core.js`） | `src/cocos/spine/lib/` | **Spine Runtimes License Agreement 2019-05-01**（Esoteric Software LLC） | `licenses/LICENSE_spine.txt`（= 上游 `licenses/LICENSE_spine.txt`） | 默认 bundle 内嵌 |
| DragonBonesJS（`@cocos/dragonbones-js@1.0.2`） | `src/node_modules/@cocos/dragonbones-js/` | MIT（c) 2012-2016 DragonBones team | `licenses/LICENSE_DragonBones.txt` | 默认 bundle 内嵌 |
| Box2D（`@cocos/box2d@1.0.2`） | `src/node_modules/@cocos/box2d/` | MIT（c) 2019 Erin Catto | `licenses/LICENSE_box2d.txt` | 默认 bundle 内嵌（2D 默认后端） |
| cannon.js（`@cocos/cannon@1.2.8`） | `src/node_modules/@cocos/cannon/` | MIT（c) 2015 cannon.js Authors | `licenses/LICENSE_cannon.txt` | 默认 bundle 内嵌（r46，#8(a)：交付期 3D 后端 builtin+cannon 双编入，默认仍 builtin） |
| zlib.js（`src/external/compression/zlib.min.js`） | 上游原文 | MIT（imaya/zlib.js） | `licenses/LICENSE_zlibjs.txt` | 默认 bundle 内嵌 |
| notepack.io（`src/external/deserialize/`） | 上游原文 | MIT（c) 2014 Ion Drive Software Ltd. | `licenses/LICENSE_notepack.io.txt` | 默认 bundle 内嵌 |
| Cocos PAL（公开 MIT 快照） | `src/pal/**` | MIT（见 §2） | `licenses/LICENSE_pal.txt` + `licenses/NOTICE_pal.txt` | 默认 bundle 内嵌 |
| Spark 高斯泼溅（`@sparkjsdev/spark` **2.3.1**，冻结提交 `c57ebb936a5d364e021a66a118204d599f6fdaa8`） | `vendor/spark/**`（详见 §8） | MIT（© 2025 WORLD LABS TECHNOLOGIES, INC.） | `licenses/LICENSE_spark.txt`（= `vendor/spark/LICENSE`，逐字节） | `ships: variant`（SPK-11 已接入可选 `spark` feature unit；仅进 spark 变体产物，**不进默认产物**） |
| Spark 解码 WASM + wasm-bindgen glue（`spark_rs_bg.wasm` / `spark_rs.js`） | 上游 dist 发行件 → 受审计资产目录 `vendor/spark-rs/`（详见 §9） | MIT（同 Spark 项目；Rust 侧 crate 许可面见 §9 缺口） | `vendor/spark-rs/LICENSE`（= `licenses/LICENSE_spark.txt`，逐字节 1 088 B） | `ships: variant`：**构建期 base64 内联**进 spark 变体产物（`build/spark-rs/` 不存在，不引入运行时 fetch）；默认产物无 WASM magic |
| fflate（SPZ 解压依赖，`build/fflate/`） | `npm pack fflate@0.8.2` 的 dist 原文 → `build/fflate/**` | MIT（© 2023 Arjun Barrett） | `licenses/LICENSE_fflate.txt`（= `build/fflate/LICENSE`，逐字节 1 069 B） | `ships: variant`：由 `tools/build/spark-runtime-tree.cjs` 以构建期 alias 解析冻结树的裸 `from "fflate"`；**不进默认产物**，也不在 `package.json` `files[]`（不随 npm 包发布） |

（Three.js r180 抄写主体一行原先登记在此，已于 2026-10-13 随 SPK-04 恢复纯 `cc.*` 委托一并撤销——见 §10。）

第三方使用条件与当前发布阻塞（`docs/license-decisions.json`）：

1. **Spine**：集成须满足 Spine Editor License Agreement §2 的适用条件；否则按 Runtimes 协议的替代条款要求产品用户各自取得 Spine Editor 许可。再分发必须附带对应许可与版权声明。
   现状已满足第二项（文本随包发布），第一项与仓库根 `license: MIT` 的单文件引擎发行姿态并不等价。
   风险面比字面看起来小：按 `docs/notes/spine-asset-sourcing.md` 的实测，alpha.34 的 Web 侧 spine 只有
   wasm/asm 后端，随仓库抽取的 `spine-core.js` 实际是枚举/类型桩，而 emscripten 运行资产并未取得（D2 受阻），
   故默认产物目前并不含 Esoteric 的完整运行时实现。
   ~~选项：保留默认产物 + 显式声明该条件（当前做法）/ 移入常量变体 / 移除该组（与计划书「16 组全部回归」冲突）。~~
   **〔r48 处置（2026-09-25，owner 指令「完成剩余事项」）〕批复选项 1：保留默认产物 + 本节即为显式声明——
   使用本包 Spine 相关能力的集成方须核验适用的 Editor / Runtimes 授权条件，不能将第三方代码视为仅受 MIT 约束；许可原文随包发布。**
2. **PAL**：2026-10-01 已换用可核验的公开 MIT 源码并携带原文/notice；许可检查同时阻止旧 engine-pal 二进制残留。旧 npm 包的限制仍有效，但它已不属于本项目当前发行来源。

许可元数据缺口（不阻塞，但记录在案）：`@cocos/dragonbones-js@1.0.2` 的 npm 包既无 `LICENSE` 文件也无
`license` 字段，许可原文是从上游 cocos4 `licenses/` 取的；`@cocos/box2d`、`@cocos/cannon` 的
`package.json` 同样无 `license` 字段，但包内带 `LICENSE` 文件（门禁按该文件逐字节比对）。

## 8. Spark 高斯泼溅冻结上游源码（SPK-03，2026-10-11 落位）

- 来源：`@sparkjsdev/spark` **2.3.1**，上游仓库 https://github.com/sparkjsdev/spark，冻结提交 `c57ebb936a5d364e021a66a118204d599f6fdaa8`（dist 发行提交 `699e3ad06ef78fe7f5f4375f705ef4d17c948993`，两者 `src`/`rust` 树等价），版权属 WORLD LABS TECHNOLOGIES, INC.；本次镜像的只读来源树为本机快照 `E:\AIProMax\github\spark-cocosairjs\upstream\spark`（发布面外路径，不随包发布；可复现判据是下条的逐文件 SHA-256 与 git 子树号）。冻结身份全表见 `docs/UPSTREAM.md` §Spark 冻结上游源码（`src` 树 `e28ecaf12054536738814356db41a44afd1df999`、`rust` 树 `23e1a2a05c28c625dfae7e28eeeb9aafbdec151b`）。
- 落位：`vendor/spark/`（照 §2 `vendor/pal-source/` 的冻结第三方源码惯例）逐字节镜像上游 `src/**`、`rust/**` 与 `LICENSE`、`package.json`、`CHANGELOG.md`、`README.md`、`tsconfig.json`，共 **105** 个文件（`src` 60：52 个 `.ts` + 8 个 `.glsl`；`rust` 40：29 个 `.rs` + 11 个 Cargo/构建脚本/说明；根 5）。
- 不落位（决策记录在清单里）：`.git`、`.github`、`node_modules`、`dist`、`test`、`scripts`、`.gitattributes`、`.gitignore`、`lefthook.yml`、`biome.json`、`vite.config.ts`、`examples.html`、`index.html`、`mkdocs.yml`、`package-lock.json`——Git/CI/格式化器/站点外壳与上游依赖锁定不属运行时源码；上游 `test/` 与 `scripts/` 未搬运，本仓回归随 SPK-13 重建。
- 许可：MIT 原文逐字节保存为 `licenses/LICENSE_spark.txt`（= `vendor/spark/LICENSE` = 上游 `LICENSE`；实测两者 SHA-256 均为 `51829693e5dccd9ca1daa093991faac3aaa93238eb8fd5f5cb4130af85791d64`）；`licenses/` 已在 `package.json` `files[]` 内，随 npm 包发布。该逐字节比对同时由 `npm run verify:licenses` 的 REGISTRY 项（`sourceOfTruth: vendored → vendor/spark/LICENSE`）与 `node tools/build/vendor-spark-tree.cjs --check` 双重断言。
- 产物形态：**ships: variant**（2026-10-12 接线后复采）。`npm run verify:licenses` 用 `SparkRenderer` / `sparkjsdev` 两个**负向**指纹断言默认产物不含 Spark（默认 dev 产物 `grep -c -o spark` 亦为 0），
  变体侧的命中计数（`SparkRenderer`×5 / `SplatMesh`×7）与默认闭包 0 个 spark 可达节点的实测记录在 `docs/evidence/spark/spk12-bundle-boundary-wired-20261012.json`。
  变体产物 `cocosair.module.spark.js（旧整合产物，已退役）`（9 461 302 B）**不在** `package.json` `files[]` 内，即不随 npm 包发布；原因与放行条件见 §9。
- 重现：`node tools/build/vendor-spark-tree.cjs --check` 逐文件比对 SHA-256 并检出未登记文件（`--write` 才显式从来源树重建镜像；来源侧始终只读）。105 文件的 `{path, size, sha256}`、树指纹、逐文件 match 结论与可复算命令见 `docs/evidence/spark/vendor-spark-tree-20261011.json`。

## 9. Spark 解码 WASM 与 wasm-bindgen glue（SPK-11 资产登记，2026-10-11；2026-10-12 落位形态与门禁复采）

- 身份：`spark_rs_bg.wasm` 1 554 721 B / SHA-256 `974320be5859f426967a2d9cc237e5eae1aca98b55e35087022d6d884b2dcce7`；`spark_rs.js`（wasm-bindgen glue）47 694 B / SHA-256 `a4b2cc7226f2e4c9bf397b56da3520e6c6f7d65b55e486783ef9bffac3b4bf72`。二者取自上游 `@sparkjsdev/spark` 2.3.1 的 **dist 发行件**（对应提交 `699e3ad06ef78fe7f5f4375f705ef4d17c948993`），其 Rust 侧源码逐字节镜像在本仓 `vendor/spark/rust/`（git 子树 `23e1a2a05c28c625dfae7e28eeeb9aafbdec151b`）。
- **未重建声明**：本环境没有执行 `cargo` / `vendor/spark/rust/build_rust_wasm.sh`，因此该 WASM 是**源等价发行件**，不是本仓编译产物；任何文档、清单与提交说明都不得写成「本仓用 Rust 重建」。可复核出处即上条的两条 SHA 与冻结提交号。
- 落位与发运形态（**2026-10-12 订正本节首版预写的 `build/spark-rs/` 口径**）：资产实际逐字节落在 `vendor/spark-rs/`，目录内带 `LICENSE` 与
  `MANIFEST.md`（逐文件 bytes + sha256 + 固定来源/版本行）。它**不**按 glTF 解码器的 decoder 式托管发运：冻结
  `vendor/spark/src/wasm.ts` 以 `import WASM from "spark_rs_bg.wasm?arraybuffer&base64"` 静态取字节并在模块求值期 `WebAssembly.compile(WASM)`，
  故构建期由 `tools/build/spark-runtime-tree.cjs` 把该说明符解析到本目录并将字节 **base64 内联进 spark 变体产物**；
  `build/spark-rs/` **不存在**，应用侧无需托管、也没有可指向的资产路径，改用托管形态需修改冻结源码（复议条件见
  `docs/UPSTREAM.md` Deviation-07）。
- 许可与审计：与 Spark 项目同源（MIT，© 2025 WORLD LABS TECHNOLOGIES, INC.），资产目录自带 `vendor/spark-rs/LICENSE`（1 088 B，
  SHA-256 `51829693e5dccd…`，与 `licenses/LICENSE_spark.txt`、`vendor/spark/LICENSE` 逐字节相同，三门禁均做原文比对）。
  审计门禁为 `npm run verify:spark-assets`（`tools/verify/spark-assets.cjs`，decoder-audit 同族，2026-10-12 交付）：
  清单双向对账、许可原文一致、`build/fflate/package.json` 的 `type` 声明、默认产物隔离（无 WASM magic `00 61 73 6d`、
  无 `spark_rs_bg.wasm`/`SparkRenderer`/`sparkjsdev`/`fflate`/`SplatMesh` 字样）、以及内嵌反漂移
  （从生成运行时提取最长 base64 字面量解码后，sha256/长度/字节必须等于清单值）。实测 `passed=true artifacts=12 failures=0`，exit 0。
  另 `npm run verify:licenses` 的 REGISTRY 现有三条 variant 级登记（Spark 本体 / spark-rs WASM+glue / fflate）。
  顺带记录一处门禁事实：`tools/verify/license-audit.cjs` 的 `build/` 白名单对**文件**放行任意 `.js/.map/.d.ts/.json`，
  故 `cocosair.module.spark.js（旧整合产物，已退役）` 从不被它拦截；该门禁只扫目录名，`vendor/` 不在其扫描面。首版预写的「必须扩展 `build/` 白名单否则变红」
  在实态路径下不成立；本轮实际需要的只是把新增目录 `build/fflate/` 加入白名单（已加，`license-audit` 的 issues 从 6 回到既存 5 项，均与本任务无关）。
- **已知许可缺口（已处置登记，未闭合）**：该 WASM 由 Rust crate 依赖树编译而来，除 Spark 自身的 MIT 外还携带 crate 级许可（上游移植件里以逐 crate 清单形式记录：
  `WASM-LICENSES-ZH.md`、`licenses/wasm-crates/<name-version>/LICENSE-*`、`rust-1.98.1` 标准库许可）。本仓**未**转录这份逐 crate 清单。
  §9 首版要求的二选一已按 ② 落地：在 `docs/license-decisions.json` 以 `spark-rs WASM 与 wasm-bindgen glue` 登记处置，
  `disposition: pending`（附三条备选路径与证据指针），`npm run verify:licenses` 因此输出 1 条 ATTENTION（非 FAIL，默认产物不受影响）。
  **在 owner 闭合该处置前，spark 变体产物不得作为 release 交付物**；未处置前不得声称该资产的许可面已完整。
- 消费边界：应用自行托管资产目录并指向它；SDK 产物内既不含 WASM magic 字节，也不得硬编码该目录路径（与 `build/gltf-decoders/` 的隔离护栏同规则）。

## 10. Three.js r180 抄写主体（SPK-04 数学层）—— **已撤销（2026-10-13，复用纪律恢复）**

- 背景（事实保留）：`ai/plans/spark-integration.md` §1.3 与 §SPK-04 原本要求 AIR 侧数学一律委托 `cc.*`，适配层只做形状与命名适配。
  曾有一版按「与 three 逐位对齐」把 `src/air/spark/spark-math.ts` 的 6 个成员（`Matrix4.invert` / `lookAt` / `compose` /
  `multiplyMatrices` / `makeRotationFromQuaternion`、`Quaternion.setFromRotationMatrix`）改为逐位抄 three r180 次序，本节即那一版的派生登记。

- **撤销**：owner 指令「复用 cocosair 元素，不重造轮子」优先，该 6 个成员已**改回委托** `cc.Mat4.invert` / `cc.Mat4.lookAt`（+ 转置映射）/
  `cc.Mat4.fromSRT` / `cc.Mat4.multiply` / `cc.Mat4.fromQuat` / `cc.Quat.fromMat3`（经 `cc.Mat3.fromMat4`）。因此
  `spark-math.ts` **不再包含** three r180 的抄写主体——threed 派生的算法主体一份不剩，本节的逐成员派生表随之作废，不再需要为
  `spark-math.ts` 携带 three 的 MIT 许可原文。

- **残留物处置**：
  - `licenses/LICENSE_three.txt`（1 081 B，取自隔离安装 `output/spark-math-parity/node_modules/three/LICENSE`）**予以删除**——
    它只服务于那份已撤销的派生登记；three 从未是 `package.json` 依赖，也不被任何运行时代码 `import`。
  - `tools/verify/verify-licenses.cjs` 的对应 REGISTRY 条目（原 `Three.js r180 抄写主体`）**随之删除**；该清单要求 `licenses/` 下每份
    `*.txt` 都被登记，因此删除条目必须与删除文件同步，否则 `npm run verify:licenses` 会因孤儿许可文件判红。
  - 隔离参考安装 `output/spark-math-parity/node_modules/three`（`tools/verify/spark-math-parity.cjs` 用它当 oracle）**保留**：
    它是 `output/` 下的临时参考件，不是发运物，也不进任何 bundle。




