# 首帧与多帧画面验证

场景字段正确、GPU 纹理读回和 compositor 截图是不同证据。局部探针应绑定实际 SDK/source map/源码、示例输入、浏览器和 renderer；先格式化再冻结，每次写新目录，保留失败与重试。它们不发布 canonical Gallery 证据，也不认证整个 npm 包或所有浏览器。

## 时钟与首帧

普通查看使用 native pacer；动作和断言使用单个 step clock。等待截图呈现时记录前后帧号，保证真实 rAF 没有继续推进场景。不要把固定某个时间变量误当成所有渲染输入都已冻结。

水体例子的定向入口：

```bash
node examples/water-multipass/verify-browser.cjs --serve --bundle=build/cocosair.module.js --first-frame --out=output/water-first-new
```

采集器仅在内存中的 app.run 锚点安装首帧钩子，第一次场景 AFTER_DRAW 就暂停 pacer。先保留第一帧，再单步到第五帧比较完整图像；不预热后把稳定帧改名为首帧。随后验证 reflection/refraction/depth/caustics、参数与指针效果、resize 和释放重建。resize 等待浏览器更新 backing size 后再 step；生命周期验证先显式恢复 native pacing。完整报告保留实际浏览器、renderer、源与共享工具指纹。

## HDR 精确重复性与参考环境

```powershell
# Explicit deterministic reference profile; no runtime fallback is installed.
$env:AIR_CI_SOFTWARE_GL='1'
node tools/verify/hdr-post-process.cjs --bundle=build/cocosair.module.js --out=output/hdr-reference-new
```

上述变量只让测试启动器明确选择 ANGLE SwiftShader。它不是默认应用后端，不证明硬件 GPU 性能，也不能代替硬件验收。本机该配置在不关闭 DITHER、不改 uniform、不改变原精确 PNG 断言的情况下通过 HDR/ACES、Reinhard、曝光、多级 Bloom、相机隔离和霓虹真实控件检查。

本机 Intel Graphics / ANGLE D3D11 在同一固定时间重画时仍出现少量 1 色阶差异，硬件原门禁保持 FAIL。现有证据已把差异定位到场景 HDR 源绘制：同一帧连续读回相同，但下一次重画有半浮点差值；相机、已记录 draw 标识/参数和上传指纹相同。显式的软件路径没有这种变化。尚未确证底层驱动、精度或其他 GL 状态的最终原因，不能据此断言所有 Intel GPU 有问题或引擎已无责任。

## 定向归因

```bash
node tools/verify/hdr-post-process.cjs --bundle=build/cocosair.module.js --raster-diagnostic=1 --out=output/hdr-trace-new
```

诊断在 AFTER_DRAW 保留 HDR Float32 读回、默认 framebuffer RGBA、相机矩阵、实际 draw 顺序与 buffer 上传指纹；原始二进制与 PNG 均保存。它检查同一帧连续读回，再比较重画，帮助区分源绘制、后处理与 compositor。

`--no-dither=1`、`--freeze-frame-uniform=1` 是明确的归因控制，后者必须与 raster-diagnostic 一起使用，只干预已识别的 native global UBO 帧号分量。它不改 director 帧计数，也不是正式通过路径。控制结果不得替代正常模式或改写历史 FAIL；没有抬高像素容差、删除画面断言或改用另一张 Golden。

## 其他场景

[HTML 纹理探针](html-texture.md)保留首次正向文字和实际输入后的 compositor 图像，并检查 resize、快照及释放。[MRT 开发页](mrt.md)则用真实控件切换三个 GPU 附件，检查首帧/第五帧、单颜色叠加、resize 和原生资源释放，分别保存 WebGL2/WebGPU 图像，不把纯读回当成完整画面验收。Intel HDR 精确重复性问题仍独立开放，不由这些通过项替代。

测量 CPU 提交、GPU 时间与设备 present 时，分别遵循 [GPU 计时](gpu-timing.md)的定义。截图同步等待不计作 GPU Pass 耗时，headless 的 FPS 不作为设备吞吐或流畅度证明。当前任务与未关闭问题见[执行台账](../../ai/ledgers/web-engine-technical-absorption.md)。
