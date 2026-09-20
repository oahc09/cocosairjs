# Using Shadertoy Shaders（使用 Shadertoy 着色器）

> 对应 three.js manual 的 *Using Shadertoy shaders* 一篇：把 Shadertoy 的 fragment 着色器搬进
> `ShaderMaterial` + 全屏 quad，并喂 `iTime`/`iResolution`/`iMouse` 等 uniform。
> 状态：**N/A** —— AIR 没有用户写着色器的入口，本篇给实测证据与边界，不配示例。
> 姊妹篇：[debugging-glsl](debugging-glsl.md)（同为 N/A，从"调试 GLSL"角度给过同一结论与边缘面）。

## 1. 实测结论：无用户着色器入口

- **没有 `ShaderMaterial` 对应物**：顶层导出表 grep `ShaderMaterial|CustomMaterial|RawShaderMaterial` 零命中
  （module.js export 实测）。材质创作面止步于 `material.initialize({ effectName, defines, states })`——
  **选用**已注册 effect + 调宏 + 覆盖管线状态，不能提供新的着色器源码。
- **着色器源码字段存在但非入口**：`IShaderInfo` 的 `glsl1/glsl3/glsl4`（d.ts 23700–23710，全 d.ts 仅 3 处命中）
  是 effect 资源（`.effect.json`）里的源串槽位；`EffectAsset.register/get/getAll`（d.ts 23514–23542）
  理论上允许运行时注册手写 effect JSON，但**本构建未取证**该路径能否走完编译-绑定-上屏
  （仓库内所有可运行示例都只消费预编译内建 effect；`air-gltf-physical` 这类版本化 effect 也是以资源形式随包加载，
  见 [gltf-extension-reference](../gltf-extension-reference.md) 第 22 行语境）。
- **`pass.recompileShaders`（d.ts 7608）只改宏**，不改 GLSL 文本——不是"注入代码"的后门。
- Shadertoy 那套 `iTime/iResolution` uniform 语义无从谈起：属性通道（`setProperty`）只对已注册 effect
  声明过的属性生效。

## 2. 三条不伪装的近似

1. **想要"全屏 shader 效果"**：内建路线是相机后处理槽位（[how-to-use-post-processing](how-to-use-post-processing.md)
   PARTIAL，色调映射单项）；自建路线见 [post-processing](post-processing.md)（N/A）。
2. **想要"程序化动画画面"**：不吃 shader 的话，用动态纹理——页面 canvas 逐帧画 2D 再喂 `Texture2D`
   （[canvas-textures](canvas-textures.md)），或 render target + 多相机把场景当"程序化图案发生器"
   （[render-targets](render-targets.md)）。表现力上限远低于 Shadertoy，但都是实测可跑的路。
3. **想要"改内建材质外观"**：`defines` 宏开关 + `states` 管线覆盖 + `setProperty` 调参，
   这是 AIR 材质创作的全部自由度（各内建 effect 的宏面未在本手册逐一点名）。

## 3. 升级条件（何时能把本篇改 PARTIAL）

1. 取证 `EffectAsset.register(手写 JSON 含 glsl3 源)` 在本构建可编译上屏（最小示例：单色/渐变 fragment）；
2. 出现官方用户材质入口（ShaderMaterial 类 API 或编辑器 effect 工作流的运行时等价物）；
3. 有示例通过本仓库验证器（Shadertoy 风格动画 quad + 无运行时错误 + frame-diff）。

三条任一满足前，本篇保持 N/A。

---

上一篇：[后处理（Post Processing）](post-processing.md) ｜ 下一篇：[HTML 元素对齐 3D（Aligning HTML Elements to 3D）](align-html-elements-to-3d.md)
