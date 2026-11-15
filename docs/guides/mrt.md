# 多颜色附件与 MSAA

原生 GFX 可以在一个 Pass 中使用不同格式的颜色附件，例如 RGBA16F 颜色、RG16F 速度和 R32UI 对象 ID。各附件的 format 来自它自己的 Texture；Shader 的 fragment 输出接口决定写哪些 location。未声明输出的附件保持原值，整数附件不做 blending。

WebGL2 按链接后 program 的实际输出位置选择 draw buffers；进入下一 Pass 时会恢复全部附件，避免前一个 Shader 的窄掩码阻止清屏。WebGPU 根据最终 WGSL 入口的返回接口生成各 target 的 writeMask，不把 fragment input 的 location 当成输出。复杂输出宏无法可靠反射时，MRT 明确报 `AIR_E_FRAGMENT_OUTPUTS_UNKNOWN`。

## 使用原生 GFX

在 `createAirApp()` 成功后取得 `director.root.device`。颜色 Texture、RenderPass、Framebuffer 仍是原生 Cocos 对象，不需要另一套 Scene 或材质系统。

```ts
import { director, gfx } from 'cocosair.js';

const device = director.root!.device;
const formats = [gfx.Format.RGBA16F, gfx.Format.RG16F, gfx.Format.R32UI];
const textures = formats.map((format) =>
    device.createTexture(
        new gfx.TextureInfo(
            gfx.TextureType.TEX2D,
            gfx.TextureUsageBit.COLOR_ATTACHMENT |
                gfx.TextureUsageBit.SAMPLED |
                gfx.TextureUsageBit.TRANSFER_SRC,
            format,
            512,
            512,
        ),
    ),
);
const pass = device.createRenderPass(new gfx.RenderPassInfo(formats.map((f) => new gfx.ColorAttachment(f))));
const framebuffer = device.createFramebuffer(new gfx.FramebufferInfo(pass, textures));
```

绘制时给 `beginRenderPass()` 提供与附件一一对应的 clearColors。第二个保留内容的 Pass 使用 `LoadOp.LOAD`，不要修改共享 RenderPass 对象去模拟另一个 Pass。Framebuffer 借用 Texture；关闭时先释放使用它的 Framebuffer、Pass/命令资源，再由所有者释放 Texture。共享的 Texture 只释放一次。

fragment Shader 可以只输出 location 0。此时速度和 ID 保持，不需要为未写附件伪造零输出；声明了输出却没有在所有路径赋值，不属于“未声明的附件保持”，仍应修复 Shader。R32UI 用 uint 输出、Uint32Array 读回；不要把精确 ID 经 Float32Array 中转。

独立 blending / color write mask 由 `BlendState.isIndepend` 和每个 `targets[i]` 描述。WebGL2 需要 `OES_draw_buffers_indexed`，缺失时返回 `WEBGL2_INDEPENDENT_BLEND_UNSUPPORTED`；不会悄悄忽略 per-target 状态。整数 target 的 blend 请求会被关闭，保留精确整数写入。普通共享 blend state 使用 target 0。

## 多采样边界

RGBA16F + RG16F 的 4×MSAA 已有两后端定向回归，检查实际采样数、A→B→A 内容延续及逐纹理 resolve。MSAA 存储属于 Texture，不属于每个借用它的 Framebuffer；重建一个共享 Framebuffer 不应分配另一份空采样存储。

- WebGL2 在分配前查询各 internal format 的原生 sample counts；不支持时返回 `WEBGL2_TEXTURE_SAMPLES_UNSUPPORTED`，不把驱动静默舍入当成请求成功。
- 当前 WebGPU GFX 的 MSAA 颜色路径自动 resolve，不接受整数或每分量 32-bit float 颜色格式，返回 `WEBGPU_MULTISAMPLE_FORMAT_UNSUPPORTED`。这描述 AIR 适配层的路径，不是声称所有原生 WebGPU 多采样整数用途都不存在。
- 对象 ID 常用独立的单采样 Pass。不要把“浮点 MSAA 通过”推成 R32UI 多采样也通过。
- 读回先 resolve 到单采样颜色 Texture；整数使用 NEAREST，内部同尺寸逐纹理 resolve 也使用 NEAREST。异步读回与源销毁、设备丢失的边界见 [GPU 生命周期](gpu-lifecycle.md)。

现有 `AirRenderTarget` 是单颜色的 legacy Camera 封装；原生 MRT 能力不等于默认 Forward Camera 会自动生成多路输出。完整原生创建、Shader、状态、绘制、读回和释放用法可参考[定向场景](../../tools/verify/mrt-attachments.cjs)。

## Code First 资源组

`createAirMRTTarget()` 管理原生附件、Framebuffer、RenderPass 和逐附件 resolve；不创建相机或另一个渲染循环。当前实现已有双后端 Chromium 定向验证和生成声明消费者回归，完整范围见[执行台账](../../ai/ledgers/web-engine-technical-absorption.md)，不代表全浏览器或发布验收。

```ts
import { createAirMRTTarget, director, gfx } from 'cocosair.js';

// Await createAirApp() first. Dimensions are backing pixels, before scale.
const target = createAirMRTTarget({
    width: 512,
    height: 512,
    samples: 1,
    colorAttachments: [
        { format: gfx.Format.RGBA16F, clearValue: [0, 0, 0, 1] },
        { format: gfx.Format.RG16F },
        { format: gfx.Format.R32UI, clearValue: [16777217, 0, 0, 0] },
    ],
    depthFormat: gfx.Format.DEPTH_STENCIL,
});
const device = director.root!.device;
const command = device.createCommandBuffer(new gfx.CommandBufferInfo(device.queue));
command.begin();
target.beginPass(command);
try {
    // Bind a compatible native pipeline, descriptors and geometry; issue draw().
} finally {
    target.endPass(command);
}
command.end();
device.queue.submit([command]);

// Later, after all open passes are ended:
command.destroy();
target.dispose();
```

- `beginPass(command, { clear: false })` 使用 LOAD 保留颜色及深度；默认使用每附件配置的 load/store。仅接受 primary CommandBuffer；调用方管理命令的 begin/end/submit，不把未提交 secondary 命令交给资源组。
- `textures[i]` 是可供采样/读回的单采样 GFX Texture；`renderTextures[i]` 是实际绘制附件。MSAA 时 `endPass()` 对 STORE 颜色附件执行 resolve。深度不会自动解析为单采样深度；DISCARD 附件内容不可依赖。
- `bindTexture(material, 'mainTexture', 0)` 将第 0 个浮点/归一化颜色视图绑定到声明了 scalar sampler2D 的材质 Pass；不声明该属性的阴影 Pass 会跳过。返回幂等 unbind，释放时恢复之前的材质值。整数附件使用原生整数采样/读回路径，不传给普通 sampler2D。
- 成功 `resize(width, height)` 后 `info.generation` 增长，视图尺寸和已登记的材质绑定自动刷新。直接保存原生 Texture/Framebuffer 或手动绑定的调用方须重新获取、重新绑定。分配失败保留原资源与 generation，并清理部分新资源。
- `info` 提供实际尺寸、后端、请求/实际采样数及格式。默认 `sampleFallback: 'error'`；显式设为 `'lower'` 才允许选择更低的合法采样数。它不允许降级附件格式或掩盖一般分配失败。
- 开放 Pass 期间 resize/dispose 会拒绝，先在 finally 中配对 `endPass()`。资源组拥有附件和视图，借用 device、材质与缓存 sampler；重复 dispose 安全。

## 定向复跑

源码仓库提供可操作的独立开发页。先构建主 SDK，启动 `npm run dev` 后打开 `/__probes/mrt-attachments/`；显式实验 WebGPU 使用 `?renderer=webgpu`。它不进入默认 runtime/npm 工具图，也不增加或提升 Gallery 状态。

页面直接显示三个 GPU 附件，提供颜色/速度/整数 ID 切换、仅颜色透明叠加、64/128 resize、释放和重建。ID 为 16777217 起的 R32UI，经整数 texelFetch 显色，没有先转 Float32。写入与显示分别使用自己的 descriptor layout，避免把 render attachment 同时绑定为写 Pass 的 sampled resource；resize 后重新获取原生附件并刷新兼容 PSO/描述符。全局 set 的 sampler binding 从 `device.bindingMappingInfo.maxBlockCounts[0]` 后开始，不占保留的 UBO 槽。

```bash
node tools/verify/mrt-view.cjs --renderer=webgl2 --bundle=build/cocosair.module.js --out=output/mrt-view-new-gl
node tools/verify/mrt-view.cjs --renderer=webgpu --bundle=build/cocosair.module.js --out=output/mrt-view-new-gpu
```

探针在第一个显示帧就暂停 pacer，保留首帧/第五帧与每个实际控件的 compositor 图像；数据读回同时验证只改颜色而保持速度和精确 ID。释放检查 WebGL native texture 已删除，WebGPU 的三个 native GPUTexture.destroy 各调用一次，并验证共享 sampler 保留和重新进入。它证明释放调用及对象所有权，不把 JS 登记归零当作 GPU 内存驻留量证明。原生 UINT sampler 的翻译需包含本次保留 usampler/isampler 标量类型的修正；旧 SDK 可能编译失败。

先用当前源码构建 SDK，或把 bundle 指向源码绑定已核对的隔离候选；旧 build 文件存在不代表包含本轮能力。

```bash
node tools/verify/mrt-attachments.cjs --renderer=webgl2 --bundle=build/cocosair.module.js --out=output/mrt-new-gl
node tools/verify/mrt-attachments.cjs --renderer=webgpu --samples=4 --bundle=build/cocosair.module.js --out=output/mrt-new-gpu-msaa
node tools/verify/mrt-attachments.cjs --helper=1 --renderer=webgl2 --bundle=build/cocosair.module.js --out=output/mrt-helper-new-gl
```

每次使用新目录，保留失败结果。`--without-indexed=1` 是 WebGL2 特性缺失负控；`--samples=4 --integer-msaa=1` 检查当前后端拒绝不支持的整数采样组合。脚本核对 bundle/map/源码绑定，结果包含真实像素/整数读回与 native errors，属于定向 GPU 证据；不替代完整视觉、跨浏览器或发布验收。
