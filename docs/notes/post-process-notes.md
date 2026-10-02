# 后处理与 custom pipeline 边界调查

当前默认构建包含 custom pipeline / post-process 代码与导出。源码/类型/组件 API 可用不等于管线装配或像素效果已验证；下文的只做变体决策与不可达诊断保留为历史记录，不能作为当前默认组成的结论。

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

> owner-decisions **#6 = D11 批复 (b)**：「只做变体构建级证据（不改默认）」。
> 本文为批次 H 笔记（计划书 §3 批复落点要求的建档），r46 建立。

## 1. 代码面（此前已实测，r44/r45g 口径）

- `cocos/rendering/post-process` 34/34、`cocos/rendering/custom` 25/26（1 个 jsb 变体按 §1.3 排除）与上游**逐字节同**；
  两个 feature unit（`custom-pipeline`、`custom-pipeline-post-process`）的 `src/exports/*.ts` 与官方同名文件逐字节同。
- 门禁 `npm run verify:custom-exports`（C1–C5，r45f 建立）持续 EXIT=0，把上述事实固化为只读不变量。
- 默认 `AIR_FEATURES` 已含 `custom-pipeline-post-process` ⇒ 后处理代码在默认 bundle 内（产物面 verified）。

## 2. 运行面不可达的三闸门（D11 根因，维持原判）

1. `src/exports/custom-pipeline.ts` 已并入 bundle 但无人 import（聚合出口不触发运行时注册）；
2. `game.ts:789-805` 在无 Creator 资产管线时显式清 `cclegacy.rendering`；
3. `director.ts:831-843` 需要 `CUSTOM_PIPELINE_NAME` 设置才装配自定义管线。

三者叠加 ⇒ Code First 发行姿态下后处理组件 API 全部可往返、但管线本体不可达（`diffPixels=0`，r44 §6.3）。

## 3. r46 批复执行结果

- **(b) 档 = 变体构建级证据**：构建面已由默认 bundle 覆盖（`custom-pipeline-post-process` 在默认集内，
  `build`/`build:min` EXIT=0，r46 新基线 `cb89ea808968596d`/6,599,938 B）；代码/导出面由
  `verify:custom-exports` 与 `verify:feature-exports` 持续锁定（两者 r46 全量门禁复跑 EXIT=0）。
- **像素级 bloom/fxaa/color-grading 开关对照未交付**：其前置是 custom 管线运行时可达，
  而 (a) opt-in（`createAirApp` 增 `pipeline: 'custom'` 或暴露 `CUSTOM_PIPELINE_NAME`）属默认行为变更，
  owner 已批复不执行 (a)。此项按计划书「状态如实」纪律记 **not-delivered（显著标注）**，不阻塞 V1.2 Gate（同 D8 口径）。
- 复启条件：owner 未来批 (a) 或上游提供 Code First 管线注册入口时，沿本文 §2 三闸门逐个解除后
  补 `examples/post-process-basic` + 三引擎开关对照。

## 4. 明确不声称的

- 未产出任何后处理开/关对照截图（`docs/evidence/browser-matrix/` 无 post-process 帧）；
- 未验证 taa/hbao/dof/fsr 在任何后端的运行表现；
- 默认发行产物行为与 r45 期完全一致（legacy 管线，无后处理）。
