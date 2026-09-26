# Post Processing（后处理）

> 自建后处理管线：用 render target + 自定义着色器拼 Bloom/灰度等效果。
> 状态：**N/A** —— AIR 没有用户可装配的后处理管线入口，本篇给实测证据与边界，不配示例。
> 内建后处理槽位（`camera.usePostProcess` / 色调映射单项）已在专篇讨论：见
> [how-to-use-post-processing](how-to-use-post-processing.md)（PARTIAL）。

## 1. 实测结论：装配入口缺失

- **Stage 类导出了，但没有装配面**。`PostProcessStage / BloomStage / ShadowStage / RenderStage / RenderFlow`
  等管线类都在顶层导出表里（module.js export 实测），但 d.ts 中 `PostProcessStage`（34907 起）只有
  `initialize(IRenderStageInfo) / activate / render` 生命周期方法——`IRenderStageInfo` 是名字/输入布局类元数据，
  **没有任何"塞自定义效果"的参数**。
- **源码侧装配是硬编码**。全量 grep `new PostProcessStage(`：唯一构造点在
  `src/cocos/rendering/deferred/main-flow.ts:69`（延迟管线内部流程）；用户没有注册 stage/flow 的入口
  （grep `registerStage|addStage` 零命中）。
- **~~`PostProcess` 本体未导出~~（V1.2 已过期）**：`postProcess` 命名空间（`PostProcess` 组件 +
  `BlitScreen/Bloom/ColorGrading/FSR/TAA` 设置类）V1.2 起在默认聚合导出内；G4 探针（2026-09-25）
  装配 `addSetting` + 挂 `camera.postProcess` 零报错。**但效果应用的像素级 A/B 不可归因**
  （开/关对照无差异、两次开态非确定差异），状态保持"可装配、效果未证实"——
  见 [How to use Post Processing](how-to-use-post-processing.md) §2/§3。
- **兜底路线也缺最后一块**：用 render target 手工合成（[render-targets](rendertargets.md) PARTIAL 走过的路）
  需要"对纹理做像素运算的自定义着色器"，而 AIR 无用户面 GLSL 入口（[debugging-glsl](debugging-glsl.md) N/A 篇的同一结论）。

## 2. 与 how-to-use 篇的分工

后处理在本手册分两篇讲：_How to use Post Processing_（用现成内建槽位）与 _Post Processing_
（本篇，自己搭管线）。前者见 [how-to-use-post-processing](how-to-use-post-processing.md)
（内建槽位 PARTIAL：色调映射单项可用、composer 类效果缺）；本篇自建管线，**N/A**（上节四条证据）。

## 3. 应用层近似（不伪装）

能做的只有"无着色器的合成"：多相机 + 多 render target（`camera.targetTexture`，d.ts 21370–21371）把场景渲到
几张 RT，再各自作为纹理贴到 unlit quad 上按透明度叠加——做出"两层画面混合"这类效果，但**逐像素运算**
（阈值提取、卷积、色差）做不了，因为没有自定义 fragment 着色器的入口。性能与正确性均未在本仓库取证，
只述路线不承诺。

## 4. 升级条件（何时能把本篇改 PARTIAL/FULL）

1. `PostProcess`/`PPRenderStage` 类效果装配面对用户开放（或出现 `addPostProcessStage` 类入口）；
2. 或用户 GLSL 通道打开（EffectAsset 运行时注册可编译自写 effect——见 [shadertoy](shadertoy.md) 的同一升级条件），
   配合 render target 即可自建；
3. 有示例通过本仓库验证器（效果前后像素对比 + 无运行时错误）。

三条任一满足前，本篇保持 N/A。

---

上一篇：[鼠标拾取（Picking Objects with the Mouse）](picking.md) ｜ 下一篇：[使用 Shadertoy 着色器（Using Shadertoy Shaders）](shadertoy.md)
