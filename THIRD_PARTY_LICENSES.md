# Third Party Licenses / 第三方许可审计（Phase 19）

Cocos AIR V0.1 基于以下第三方代码/数据构建。本文件为 Source License Audit 的结果记录。

## 1. 引擎源码（src/cocos、src/pal、src/exports、src/extensions、src/external、src/DebugInfos*）

- 来源：`cocos-creator/engine`（cocos4）`4.0.0-alpha.33` 快照（2026-09-12）。
- 许可：MIT License。所有上游文件的版权头（Xiamen Yaji Software Co., Ltd. / Chukong / Cocos）
  **原样保留**，未做任何修改或移除（审计方式：抽取为逐文件拷贝，见 docs/upstream-file-map.json）。
- 例外（Air 新增/修改，文件头含 AIR 注释）：
  - `src/air/**`（Air 自有代码，MIT，本项目）
  - `src/cocos/rendering/pipeline-ubo.ts`（Modified：shadow/CSM UBO 扩容至 2048B，见 file-map）
  - `src/cocos/gfx/webgl/webgl-swapchain.ts`（Modified：preserveDrawingBuffer 开启，调试/像素验收用）

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
