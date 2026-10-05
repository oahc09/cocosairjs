# Color and radiance

运行 `npm run dev -- --example hdr-color-pipeline`。需要已构建的 SDK，其中包含 `createAirRenderTarget` 和颜色合同辅助函数；示例仅使用原生 Cocos 场景、材质、贴图、球网格与 WebGL2。

## 三组真实颜色输入

左边的 sRGB 编码字节进入 `SRGBA8888`，采样时硬件解码；中间先用分段 sRGB 函数转换成等价线性字节，再以 `RGBA8888` 采样。两者在自定义 shader 中仅执行一次 sRGB 输出编码。线性输入为8-bit，因此验收允许最多3级 RGB 量化误差，不要求同字节等亮。

右边是刻意错误的双重解码反例：硬件 sRGB 采样后再次执行 shader sRGB decode，画面实际偏暗。生产代码调用 `validateAirTextureColorContract()` 会拒绝这个组合；这里为了展示失败画面只在反例材质中显式绕过该校验。标准材质仍保留原有软件解码，不把硬件 sRGB 图塞进它的 albedo/emissive 槽。

## 保留 HDR 再 tone map

两个独立原生 capture camera 绘制同一个线性 radiance 源。左边 `RGBA16F` 离屏附件保留超过1的值；右边 `RGBA8` 在写入时先夹断。主相机读取这两个真实附件，以相同曝光、Reinhard `c/(1+c)` 和分段 sRGB 输出编码显示，因此亮斑与颜色比例不同。

Exposure 改变 tone map 前的线性值；HDR gain 改变离屏源值；Tone map off 是可观察的截断反例。状态与 `window.__hdr.sampleRadiance()` 显示真实 `readColor()` 读回数值，不能仅以 uniform 值认定有 HDR。设备无法渲染浮点附件时明确失败，不退化成 RGBA8 冒充 HDR。

## 消费离线 GGX 环境

底部四个金属球使用未修改的 `builtin-standard`，实际 roughness 为0.03、1/6、0.5、5/6。`GGX prefiltered` 开关将 reflectionMap 在离线 GGX 结果与原始方向性环境之间切换，两个状态产生真实不同反射；这不是用模糊CSS或普通 mipmap 冒充预过滤。

原始环境是独立生成的蓝色基底与三个彩色方向光瓣。`generate-assets.mjs` 离线对每个 mip 的六面方向执行512次确定性 Hammersley/GGX NDF 重要性采样，使用 V=N 的 split-sum radiance 近似、alpha=roughness²和归一化 NdotL 权重。算法依据[Filament 的 IBL 推导](https://google.github.io/filament/main/filament.html#annex/importancesamplingfortheibl)，代码与图像数据均为本项目原创。

每个 cube 仅32,760字节，六级尺寸32/16/8/4/2/1。原始数据不标记为 baked；只有经过真实卷积的 cube 使用原生 `BAKED_CONVOLUTION_MAP=2`。运行时加载 binary、建立六面 `ImageAsset`、设置原生 `TextureCube` 后调用 `validateAirPrefilteredEnvironment()` 和 `bindAirPrefilteredEnvironment()`；运行时不执行卷积。

两个 native cube 都是 `isRGBE=true`。编码必须匹配当前 Cocos shader 的 `rgb * pow(1.1, alpha*255-128)`，**不是 Radiance `.hdr` 常见的 base 2**。原生 LOD 使用 `roughness * envmap.mipmapLevel`，所以六级 roughness 为 `[0,1/6,2/6,3/6,4/6,5/6]`，末端由最大LOD夹断；envmap/reflectionMap 的 mip数与宏编码保持一致。`assets/environment.json` 保存所有偏移、样本数、实际卷积负控统计和 binary SHA-256。

标准球保留原生 PBR 的既有输出路径；自定义 HDR 展示链路明确使用分段 sRGB。示例没有宣称统一所有材质的全局 colorSpace，也不承诺这个小样本卷积达到生产环境贴图的精度。生成像素来源许可见[assets/LICENSE.md](assets/LICENSE.md)。

## 重生成与验证

```powershell
# 离线写本例的effect JSON和两组环境bytes；浏览器从不import此脚本。
node examples/hdr-color-pipeline/generate-assets.mjs
node node_modules/prettier/bin/prettier.cjs --write examples/hdr-color-pipeline
node examples/hdr-color-pipeline/typecheck.cjs

# 使用现成Playwright/pngjs工具环境；不会安装依赖或改写SDK。
$env:NODE_PATH = 'C:/Users/caosh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules'
node examples/hdr-color-pipeline/verify.cjs
```

运行器启动只读 TS 内存转译服务器，串行 Chromium/Firefox/WebKit。报告与截图只写新的 `output/hdr-color-pipeline/attempt-<timestamp>/`；任何失败退出1并保留原始报告。它检查格式绑定、颜色等价和双解码负控、实际HDR读回、tone map/曝光像素变化、GGX/原始反射差异、roughness像素、Reset及所有持有资源释放/重建。截图坐标明确为 canvas CSS 像素，不能与相机 backing 像素混用。

`window.__hdr` 提供原生 targets、材质 descriptor 快照、radiance 读回及参数控制；`__probe()` 提供状态与 fixture 来源；`__lifecycle()` 使用共用资源合同做真实拆建。自动化采用暂停后原生 `game.step()` 固定截图，生命周期检查恢复原生帧以推进延迟销毁，不伪造 isValid 或资源释放标志。
