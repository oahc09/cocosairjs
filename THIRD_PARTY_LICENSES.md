# Third Party Licenses / 第三方许可审计（Phase 19）

Cocos AIR V0.1 基于以下第三方代码/数据构建。本文件为 Source License Audit 的结果记录。

> 审计复核：2026-09-12（L13 修复与 Phase 18 之后）。

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

- 来源：`@cocos/engine-pal@1.0.4`（npm）预编译产物，逐字节抽取（`npm run verify:licenses` 断言）。
- 形态：按 HTML5 平台虚拟模块映射抽取（web 实现 + non-minigame + 共享类型），
  原始 `_ccprivate$` 属性名变换保持原样。
- **许可状态（2026-09-22 V1.2 审计更正）**：该包 `package.json` 标 `license: "UNLICENSED"`，
  其 `README.md:16` 写「UNLICENSED — Cocos 内部使用」，包内不含许可原文。
  本节此前所述「MIT」**不成立**，已改登记为 `pending-owner-decision`
  （见 `docs/license-decisions.json` 与 §7）；候选处置：以 cocos4 仓库 MIT（Copyright 2025 SUD）
  作为 pal 源码许可依据并登记依据链 / 取得书面澄清 / 改从上游源码路径抽取。

## 3. 构建期依赖（devDependencies，不进入运行时产物）

| 包 | 许可 | 用途 |
|---|---|---|
| @cocos/ccbuild | MIT | 引擎构建器（与上游一致） |
| @cocos/babel-preset-cc | MIT | Babel 预设（与上游一致） |
| typescript / tslib | Apache-2.0 | 编译 |
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

`npm run verify:licenses`（`tools/v12/verify-licenses.cjs`）是本节的门禁：每项必须有
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
| `@cocos/engine-pal@1.0.4` | `src/pal/**` | **UNLICENSED**（见 §2） | 无（来源包未附文本） | 默认 bundle 内嵌 |

两条需要所有者决定（`docs/license-decisions.json`，门禁以 ATTENTION 呈现）：

1. **Spine**：该协议要求「产品的每个用户须自备 Spine Editor 许可」且「任何形式的再分发必须附带本许可与版权声明」。
   现状已满足第二项（文本随包发布），第一项与仓库根 `license: MIT` 的单文件引擎发行姿态并不等价。
   风险面比字面看起来小：按 `docs/v12-spine-asset-sourcing.md` 的实测，alpha.34 的 Web 侧 spine 只有
   wasm/asm 后端，随仓库抽取的 `spine-core.js` 实际是枚举/类型桩，而 emscripten 运行资产并未取得（D2 受阻），
   故默认产物目前并不含 Esoteric 的完整运行时实现。
   ~~选项：保留默认产物 + 显式声明该条件（当前做法）/ 移入常量变体 / 移除该组（与计划书「16 组全部回归」冲突）。~~
   **〔r48 处置（2026-09-25，owner 指令「完成剩余事项」）〕批复选项 1：保留默认产物 + 本节即为显式声明——
   使用本包 spine 相关能力的集成方，其产品的每个最终用户须自备 Spine Editor 许可；许可原文随包发布。**
2. **engine-pal**：见 §2 —— 无许可原文可录。
   **〔r48 处置〕风险接受：来源为 Cocos 官方 npm 渠道、以源码形态（`src/pal/**`）随本仓库再分发，§2 如实登记
   「UNLICENSED（npm 元数据）」不声称 MIT；上游若发布明确许可则依其升级（`docs/license-decisions.json` 触发条件在案）。**

许可元数据缺口（不阻塞，但记录在案）：`@cocos/dragonbones-js@1.0.2` 的 npm 包既无 `LICENSE` 文件也无
`license` 字段，许可原文是从上游 cocos4 `licenses/` 取的；`@cocos/box2d`、`@cocos/cannon` 的
`package.json` 同样无 `license` 字段，但包内带 `LICENSE` 文件（门禁按该文件逐字节比对）。

