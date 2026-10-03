# 显式纹理颜色空间

`Texture2D.PixelFormat.SRGB888` 和 `SRGBA8888` 是已有 WebGL2 GFX sRGB 格式的公共命名。它们用于显式控制颜色处理的自定义 effect；没有引入全局 `colorSpace` 开关，也没有改变现有标准材质默认行为。

**不要直接把 builtin-standard 的 albedo/emissive 图替换成硬件 sRGB 格式。** 现有 shader 对这些图执行软件 sRGB 解码；硬件已经解码后再执行同一变换会使颜色偏暗。保持该材质现有 `RGBA8888` 路径，或使用自己明确控制采样与输出编码的 effect。法线、粗糙度、金属度、遮挡等数据贴图继续使用线性格式。

## 选择格式与输出

| 输入                      | GPU 格式              | shader 采样结果          | 输出责任                             |
| ------------------------- | --------------------- | ------------------------ | ------------------------------------ |
| sRGB 编码的 RGB 颜色字节  | `SRGB888`             | 硬件解码后的线性 RGB     | 在完成线性运算后编码一次             |
| sRGB 编码的 RGBA 颜色字节 | `SRGBA8888`           | RGB 解码，alpha 保持线性 | RGB 编码一次，alpha 不作 gamma 变换  |
| 已在线性域的 RGBA 字节    | `RGBA8888`            | 线性值                   | 与上项采用相同输出编码               |
| 法线等数据贴图            | `RGBA8888` 等线性格式 | 原始数据值               | 根据数据语义使用，不当作显示颜色解码 |

```ts
const texture = new Texture2D();
texture.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.SRGBA8888 });
texture.uploadData(encodedRGBABytes);
// 用显式 effect 采样：texture() 已返回线性 RGB，不能再 SRGBToLinear。
```

UV、滤波、wrap 和显式 `uploadData()` 的约定不随颜色格式改变。颜色字节和线性字节不是相同的数值：例如 sRGB 128 对应线性约 0.21586，在 8-bit 线性纹理中约为 55。因此等价输入应比较“sRGB 128”与“线性 55”，不能要求相同 128 字节在两种格式下亮度一致。

探针中的自定义 effect 使用分段 sRGB 编码，在输出前仅执行一次；它不代表已有标准材质近似 gamma 函数的重写。不要用固定亮度补偿系数掩盖两次解码、漏编码或灯光/曝光问题。

## 验证合同

[专属 GPU 探针](../../tools/debug/probes/competitive-texture-probe/index.html)覆盖：

- RGB / RGBA sRGB 格式的实际 GPU 分配与采样，不仅检查枚举字段。
- 两组等价输入在直接输出线性值和编码显示值时一致，允许 8-bit 量化误差。
- 原始字节与 DOM canvas 上传后四角非对称色块的 UV 方向。
- alpha 保持线性。默认画布是 opaque，探针将采样 alpha 映到 RGB 后读回，避免把 framebuffer 的固定 255 当作纹理 alpha。
- normal/data 纹理字节保持线性，且无 WebGL 错误。

```powershell
# 前提：当前 bundle 已构建，NODE_PATH 指向已有 Playwright node_modules。
node tools/verify/competitive-uniform-browser.cjs --probe=texture --browser=chromium
```

运行器仅写 `output/playwright/competitive-texture-chromium.json`，记录 bundle、相关源码、浏览器版本和 44 项检查；不会自动构建、下载浏览器或刷新发布证据。Firefox/WebKit 可通过 `--browser=` 单独运行，未运行不能声称已验证。

最终复核 Chromium、Firefox、WebKit 各 44/44 PASS，使用同一候选 bundle SHA-256 `006ae858d4e75dcb4c716afccd2eedcbefe81300304cb0cfca9d1fffa918c03e`。报告位于本地 `output/competitive-benchmark/final-review/texture-{chromium,firefox,webkit}.json`；这不代表所有 GPU/驱动已经覆盖。

DOM canvas 的半透明像素可能先经过浏览器内部预乘和量化。例如本次 Firefox 将 putImageData 的红色 128、alpha 64 保存成 getImageData 的红色 131、alpha 64；GPU sRGB 采样得到的线性红色 58 与实际 131 输入一致。DOM 验收依据实际 canvas 输入值，不能把这种存储量化直接归因给引擎 gamma。原始 TypedArray 验收仍按原始字节严格比较。

## 与现有管线的关系

GFX 后端的 sRGB 格式早已存在，本次补充的是公开枚举命名及可验证的使用合同。`Color` 的整数通道、标准材质 property 的 `linear` 转换、glTF 导入器的材质处理、HDR 曝光和 tone mapping 仍各自有现有语义；本次没有统一改写这些路径。

检查颜色问题时应依次确认输入资产的含义、GPU 格式、shader 是否再次解码、工作域、曝光与输出编码。不能仅凭“纹理偏暗”判断缺少 sRGB 后端支持。
