# 接入原生 gfx：Shader、MSAA 与资源所有权

本页面向通过 `gfx.ShaderInfo`、descriptor 和原生附件直接接入的应用。先完成 `createAirApp()`，再通过 `director.root.device` 创建 gfx 资源。它不提供 Three shader 自动转换，也不改变原生键盘传播策略。

## Shader 与绑定

- WebGL2 后端添加 `#version 300 es`；`ShaderStage.source` 不再包含版本指令。重复指令在创建 shader 前抛出 `WEBGL2_SHADER_VERSION`，包含 shader 名和阶段说明。
- 使用 `layout(std140)` 的 uniform block，并使 `UniformBlock.members` 与 GLSL 的声明、顺序、类型及数量一致。普通非 sampler uniform 不应直接套入这条 UBO 上传链。
- std140 中 float 数组元素步长至少16字节，vec3 的基准对齐为16字节，但其后 float 的放置取决于布局；不能统一把所有 vec3 成员视为独立16字节槽。对于复杂数组/结构体，显式核对 offsets、stride 和 block 大小。受限 [Effect 生成器](custom-shaders.md)不接受这些布局，不代表底层 gfx 不支持。
- `UniformBlock` 与 `UniformSamplerTexture` 使用逻辑 `set/binding`；同一 set 中 block 与 sampler 不可共享 binding。这种跨类型冲突在初始化前抛出 `WEBGL2_SHADER_BINDING_CONFLICT`，失败不替换已有 shader 状态。同类型的宏互斥模板可保留原有共享 binding；实际同时启用的资源仍应使用唯一槽位，不把模板元数据当作全部 active 资源。
- `device.bindingMappings` 由后端用于映射 GL 的 UBO/texture unit；不要把后端偏移重复加到逻辑 binding。sampler 数组、flexible set 和 effect-import 分支还影响实际映射，不能用固定数字替代布局合同。
- 编译/链接失败已有阶段、源码及 GL infoLog 输出。新输入诊断保留 Error 类型及 stack，并带 `code/stage/shader`。初始化通过只是元数据通过，实际使用时仍需 GPU 编译及采样验证。

布局例子：同一材质 set 可把 `Constants` 设为 binding 0，两张纹理分别设为1和2；这是示例布局，不是必须从2开始。实际声明和 descriptor layout 必须一致。

## MSAA 渲染后采样

在已初始化的场景中，可以使用公开 helper：

```typescript
import { createAirRenderTarget } from 'cocosair.js';

const target = createAirRenderTarget({
    width: 512,
    height: 512,
    colorFormat: 'rgba8',
    depthFormat: 'depth24-stencil8',
    samples: 4,
    sampleFallback: 'error',
});
console.log(target.info.requested.samples, target.info.samples, target.info.glSamples);
// 把 target.renderTexture 设为采集相机目标；attachCamera 可负责相机结束后的 resolve。
// 手工提交 gfx pass 时，在 pass 结束且后续消费者采样前调用：
target.resolve();
target.dispose();
```

4×是否支持由颜色/深度格式支持的样本数交集决定。默认不静默降为1×；明确选择 `sampleFallback: 'lower'` 才允许降低，实际值可从 info 读取。DPR/quality 是应用选取策略，不是支持4×的证明。

原生 gfx 路线使用多采样 color/depth renderbuffer，结束 pass 后通过 POINT blit 将颜色 resolve 到同尺寸、兼容格式的单采样纹理。多采样 renderbuffer 不能直接作为普通 sampler2D 纹理。不要把 resolve 与缩放合并成一次操作。需要采样深度时遵守 [Render Targets](rendertargets.md) 的 depth/resolve 合同，颜色 resolve 不能证明深度也可直接采样。

## 释放拥有的资源

创建方负责其 Buffer、Texture、Framebuffer、InputAssembler 的销毁；借用方不得销毁共享 buffer。gfx 不会从应用的 geometry 对象或 typed-array 身份自动推导引用关系。

多个 geometry 共享 buffer 时，由应用登记拥有者；geometry dispose 先释放自己的 IA，再归还 buffer 引用，最后拥有者退出时才调用 Buffer.destroy。相同底层 ArrayBuffer 的不同 view/offset/stride 不必是同一个 GPU 资源。RT helper 则拥有自身附件，应用解绑消费者后调用其 dispose；不要再次手动销毁借用的附件。

通过 quality/resize 往返观察活动资源及实际拥有关系；累计创建次数增加只说明重建。计数稳定是该序列证据，不是所有设备GPU无泄漏证明。

## 输入和可选能力

canvas 键盘监听会 stopPropagation/preventDefault。原生 `input` 或受控 DOM capture 为二选一接入，见 [输入与事件](input-and-events.md)。不用移除 SDK 默认传播处理来适配应用快捷键。

Spine 的类型/导出存在不代表 wasm/asm 已部署。当前默认启动路径可能提示“未部署 spine 运行时资产”；这与无 Spine 的 gfx 场景可运行并不矛盾。使用 Spine 前按 [部署来源](../notes/spine-asset-sourcing.md)配置对应运行时；stub/null 结果不能当作 SkeletonData 创建成功。该提示不是一次性告警保证，后续 stub 调用也可能提示；真实 Spine 播放须独立验收。

## 定向验证入口

已有 `tools/verify/webgl2-gfx-regressions.cjs --browser=all --out=<新报告.json>` 覆盖原生蒙皮与 RGBA8 MSAA resolve、resize、读回及继续绘制。它使用现有 bundle，不构建；报告是定向子集。Shader 输入正负例见 `test/smoke/webgl2-shader-input.test.ts`，它们不替代 GPU 编译/采样验证。
