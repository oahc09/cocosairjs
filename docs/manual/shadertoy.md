# Using Shadertoy Shaders（使用 Shadertoy 着色器）

> 当前支持范围（2026-09-30）：浏览器渲染要求 WebGL 2；WebGL 1 已正式退役。启动不可用时返回 `WEBGL2_REQUIRED`，不会回退到空渲染设备。详见 [支持策略](../webgl2-only.md)。


> 话题：把 Shadertoy 的 fragment 着色器搬进引擎——用用户可写的着色器材质 + 全屏 quad，喂 `iTime`/`iResolution`/`iMouse` 等 uniform。
> 状态：**PARTIAL（2026-09-25 升级，原 N/A）** —— 用户手写 GLSL → `EffectAsset` 注册 → `Material` 绑定 → uniform 更新 → 上屏
> 的全链路已实测走通（当前仅验证 WebGL2，结果见 `docs/evidence/g4-shader-probe.json`）；
> 两级 Gallery 示例（`shader-custom-gradient` / `shader-dissolve`）已过 staging 试验，正典集成后升 FULL。
> 姊妹篇：[debugging-glsl](debugging-glsl.md)（编译错误诊断已实测）、[custom-shaders](custom-shaders.md)（完整开发工作流）。

## 0. 升级依据（新证据，2026-09-25）

- **入口存在且可用**：`Object.assign(new EffectAsset(), effectJson)` → 补 `shaders[0].glsl4/glsl3/glsl1` →
  `effect.onLoaded()`（programLib.register + EffectAsset.register）→ `material.initialize({ effectAsset })` →
  用户片元源码真实改变像素（中心像素断言橙→绿→蓝）。引擎内建 effect 走同一注册路径
  （`src/air/builtin/register.ts`），用户侧与内建同源。
- **Shadertoy uniform 对应**：`iTime` → `cc_time.x`（CCGlobal，实测驱动动画帧差 maxDiff=42/43）；
  `iResolution` → `cc_screenSize`；`iMouse` → 无内建对应，用 `input` 事件 + `material.setProperty` 自接
  （shader-dissolve 的 threshold/edgeColor 交互即此模式）。
- **仍未有**：`.effect` YAML 源码级编译工具链（运行期只吃编译后 JSON 形态，三 GLSL 变体需手工携带——
  `examples/shared/shader-blocks.js` 提供 UBO 块样板）；`material.recompileShaders`/`overridePipelineStates`
  仍为 warn 存根（宏/管线态热改不可用，defines 必须在 `initialize` 时给定）。
- **时机纪律**：注册必须在 `createAirApp` 之后（引导前 `onLoaded` 抛空 device TypeError，探针
  `registerBeforeBoot` 相位如实记录）。

## 1. 历史结论存档（2026-09 上旬勘察期，已被 §0 实测推翻的部分标注）

- **没有用户着色器入口**（~~已推翻~~：§0 实测 `EffectAsset.onLoaded` 路径可用）：顶层导出表 grep `ShaderMaterial|CustomMaterial|RawShaderMaterial` 零命中
  （module.js export 实测）——**专用 ShaderMaterial 类确实不存在**，入口是 EffectAsset + Material.initialize({effectAsset})。
- **着色器源码字段存在但非入口**（~~未取证部分已取证~~）：`IShaderInfo` 的 `glsl1/glsl3/glsl4`（d.ts 23700–23710）
  是 effect 资源里的源串槽位；`EffectAsset.register/get/getAll`（d.ts 23514–23542）
  **已实测**走完编译-绑定-上屏（g4-shader-probe B1/C1/D1/E1 相位，双后端）。
- **`pass.recompileShaders`（d.ts 7608）只改宏**，不改 GLSL 文本——不是"注入代码"的后门。（仍然成立；且当前为 warn 存根）
- Shadertoy 那套 `iTime/iResolution` uniform 语义：`cc_time`/`cc_screenSize` 直接对应（§0）；`iMouse` 需自接。

## 2. 三条不伪装的近似

1. **想要"全屏 shader 效果"**：内建路线是相机后处理槽位（[how-to-use-post-processing](how-to-use-post-processing.md)
   PARTIAL，色调映射单项）；自建路线见 [post-processing](post-processing.md)（N/A）。
2. **想要"程序化动画画面"**：不吃 shader 的话，用动态纹理——页面 canvas 逐帧画 2D 再喂 `Texture2D`
   （[canvas-textures](canvas-textures.md)），或 render target + 多相机把场景当"程序化图案发生器"
   （[render-targets](rendertargets.md)）。表现力上限远低于 Shadertoy，但都是实测可跑的路。
3. **想要"改内建材质外观"**：`defines` 宏开关 + `states` 管线覆盖 + `setProperty` 调参，
   这是 AIR 材质创作的全部自由度（各内建 effect 的宏面未在本手册逐一点名）。

## 3. 升级条件（何时能把本篇改 PARTIAL）

1. 取证 `EffectAsset.register(手写 JSON 含 glsl3 源)` 在本构建可编译上屏（最小示例：单色/渐变 fragment）；
2. 出现官方用户材质入口（ShaderMaterial 类 API 或编辑器 effect 工作流的运行时等价物）；
3. 有示例通过本仓库验证器（Shadertoy 风格动画 quad + 无运行时错误 + frame-diff）。

三条任一满足前，本篇保持 N/A。

---

上一篇：[后处理（Post Processing）](post-processing.md) ｜ 下一篇：[HTML 元素对齐 3D（Aligning HTML Elements to 3D）](align-html-elements-to-3d.md)
