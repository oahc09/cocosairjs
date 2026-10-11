# WebGL2 gfx 格式、采样、附件与读回合同

本页说明原生 gfx 的 WebGL2 后端合同。`Scene`、`Material`、`Texture`、`Sampler` 与资源所有权继续使用 Cocos API；不新增渲染器。定向 GPU 验收范围见 [执行台账](../../ai/ledgers/webgl2-gfx-contract-remediation.md)。

## 格式与采样

- R/RG/RGB/RGBA16F 的线性过滤属于 WebGL2 核心能力；32F 线性过滤依赖 `OES_texture_float_linear`。颜色附件能力独立于过滤能力，RGB16F 不作为颜色附件，R/RG/RGBA16F 需浮点颜色附件扩展。
- INT/UINT 纹理使用对应 `*_INTEGER` 外部格式，不支持线性或各向异性过滤。使用 POINT，mip 过滤为 NONE 或 POINT。RGB 整数纹理可上传，不宣告颜色附件支持。
- 默认 `cmpFunc=ALWAYS` 保持普通深度采样。LESS、LESS_EQUAL、GREATER、NEVER 等启用硬件比较，并使用匹配的 shadow shader。现有 API 无法单独表示 ALWAYS 硬件比较。
- `maxAnisotropy=0` 表示关闭，实际 GL 值为 1。有效请求必须是非负有限整数；缓存前按设备上限及既有 hash 的 16 档上限规范化。缺扩展时退回 1。
- RGB10A2UI 上传每像素一个 `Uint32` packed word，RGB 各 10 bit、alpha 2 bit。整数 clear 按实际通道位宽拒绝非整数、非有限及越界值，不经过 Float32 暂存。
- 整数 shader 属性使用匹配 signed/unsigned、非归一化数据与 `vertexAttribIPointer`；浮点及 normalized 属性维持 `vertexAttribPointer`。packed integer shader 属性明确拒绝。两条 VAO 路径保留 offset、stride、矩阵 location 与 instancing divisor。

上述格式边界依据 [WebGL2 规范](https://registry.khronos.org/webgl/specs/latest/2.0/)、[half-float 颜色附件扩展](https://registry.khronos.org/webgl/extensions/EXT_color_buffer_half_float/) 与 [float 颜色附件扩展](https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/)。

## Depth bias

`depthBiasEnabled` 控制 `POLYGON_OFFSET_FILL`；constant 对应 GL units，slope 对应 factor。静态与动态状态均使用此顺序。WebGL2 本实现不支持非零 depth bias clamp，会明确抛错。

## TextureView 与 framebuffer

默认及显式 view 保留 base mip/layer 与范围。单个 framebuffer 附件选择 `baseLevel`、`baseLayer`；多层 view 不代表 layered rendering。array/3D 使用 `framebufferTextureLayer`，cube 选择具体 face，2D 使用 `framebufferTexture2D`，颜色与深度附件共用范围校验。

显式 view 不可 reinterpret format、不支持多 plane 或 nested view，不拥有底层纹理，不能 resize 拥有者。拥有者 resize 更新 mip 元数据，已有 framebuffer 在下一次 renderpass 检测附件句柄并重建；已失效 mip/layer 在副作用前拒绝。尺寸为各附件所选 mip 尺寸的最小值。

## `copyTextureToBuffers`

每个 region 对应一个 buffer。原纹理的 mip/layer 从 0 起；TextureView 的 mip/layer 相对其 base。array/cube 使用 `baseArrayLayer`、`layerCount`，3D 使用 `texOffset.z`、`texExtent.depth`；不适用的字段保持默认值。

| 支持格式                       | 输出                                        |
| ------------------------------ | ------------------------------------------- |
| 8 bit 普通 UNORM、RGBA8        | 原通道数的 Uint8 字节                       |
| R/RG/RGBA 8/16/32 bit INT/UINT | 原通道数及原位宽的 signed/unsigned 字节布局 |
| R/RG/RGBA16F                   | 原通道数的 Uint16 half-float words          |
| R/RG/RGBA32F                   | 原通道数的 Float32                          |

整数及浮点颜色读回先使用合法 RGBA 32 bit 暂存，再收纳到原格式，不经 Float32 转存整数。RGB 整数、packed、压缩、depth/stencil、直接 MSAA 读回明确拒绝；MSAA 先通过原生 resolve/blit 得到单采样纹理。

`buffOffset` 是目标 ArrayBufferView 内的字节偏移，独立于该 view 的 `byteOffset`。`buffStride` 是像素行距，0 使用区域宽度；`buffTexHeight` 是每层布局行数，0 使用区域高度。行距与层距之间的 padding 保持原值。

纹理、格式、全部 region 范围与容量在任何目标写入前整体预检。执行期错误会抛出 region/layer 信息，可能保留已完成 region/层的部分结果；调用方不得将异常后的部分结果视为成功。成功、GL 错误或异常均恢复实际 READ/DRAW framebuffer、PACK 与 PBO 状态并释放临时 FBO。临时分配按本次最大区域复用，不提供异步性能承诺。

独立状态恢复补充夹具使用明确标记的 raw GL setup/fault injection 建立外部非默认状态；引擎上传、绘制及被测读回仍走 public gfx。它与原九项只读 raw GL 诊断夹具分别记录证据，不借外部操作修补引擎结果。屏幕呈现另以实际页面 PNG 验收；GPU 读回、Canvas 导出、页面合成各自记录，启动参数与条件范围见[工具入口](../../tools/README.md)及[执行台账](../../ai/ledgers/webgl2-gfx-contract-remediation.md)。
