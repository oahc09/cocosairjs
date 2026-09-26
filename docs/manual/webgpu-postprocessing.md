# Post-Processing（WebGPU 后处理）

> 话题：在 WebGPU 后端上以节点式 API 编写 pass/effect，组装成自定义后处理管线。
> 状态：**N/A**（双重不成立）—— 后端没有 WebGPU（见上篇），管线也没有用户装配面
> （见 [post-processing](post-processing.md) 篇实测），不配示例。

## 1. 两层边界，各有一篇实测证据

| 层       | AIR 现状                                                                                                                            | 证据去处                                                       |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 后端     | 构建只带 `WebGL2Device`，`RenderType.WEBGPU` 有枚举无实现                                                                           | [webgpurenderer](webgpurenderer.md) §1                         |
| 管线     | Stage 类全导出，但 `PostProcessStage.initialize(IRenderStageInfo)` 是元数据初始化，没有"把自定义 stage 插进 RenderFlow"的公开装配面 | [post-processing](post-processing.md) §1                       |
| 效果编写 | 无用户 GLSL 入口，效果集是 builtin-effects 编译期定死的                                                                             | [shadertoy](shadertoy.md)、[debugging-glsl](debugging-glsl.md) |

## 2. 现在能做的（不是这级别的需求先别急着要 WebGPU）

- **内建单项效果**：`camera.usePostProcess` + 色调映射类设置，见
  [how-to-use-post-processing](how-to-use-post-processing.md)（PARTIAL，有示例）。
- **离屏合成**：`RenderTargetTexture` 把场景渲进纹理再贴 unlit 平面/公告板——
  "渲到 RT 再消费"这一步 AIR 支持（[rendertargets](rendertargets.md)、
  [dynamic-texture 上传路线](canvas-textures.md)），但 RT 之后的**像素级自定义
  效果**仍卡在无用户着色器这一层——能做"取景/画中画"，做不了"自写 bloom"。
- **雾/透明排序**等画面观感需求：[fog](fog.md)、[transparency](transparency.md)
  已覆盖 AIR 侧对应机制。

## 3. 升级条件

与两篇前置同签：`WebGPUDevice` 实现进包 + 用户可注册的 stage/自定义 effect 入口
出现，二者齐备才谈"WebGPU 后处理"；届时本篇与 [post-processing](post-processing.md)
合并重组并补示例（`manual-webgpu-postprocessing`：RT→自定义 pass→屏幕）。

---

上一篇：[WebGPURenderer（WebGPU 渲染器）](webgpurenderer.md) ｜ 下一篇：[VR - Basics VR 基础](webxr-basics.md)
