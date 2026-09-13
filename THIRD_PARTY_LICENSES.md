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

- 来源：`@cocos/engine-pal@1.x`（npm）预编译产物，MIT。
- 形态：按 HTML5 平台虚拟模块映射抽取（web 实现 + non-minigame + 共享类型），
  原始 `_ccprivate$` 属性名变换保持原样。

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
