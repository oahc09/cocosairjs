# 原生 Input Dissolve 任意输入溶解（C04）

- **三路线输入**：`image`（真实 PNG→Texture2D 原生上传）/ `procedural`（着色器程序内容→RT）/ `rendered`（真实 Scene/Camera/MeshRenderer→RT）。
- **NoiseDissolve 母算法**：MaterialX/OSL Perlin 3-octave fbm coverage + reveal 掩码；**只缩放 alpha**，RGB 不变。
- 端点精确：progress 0 = 完全 identity；progress 1 = 完全透明；禁用 = 真实输入直通（单 pass）。
- 存储：premultiplied rgba8（量化到字节网格）；逆预乘仅在 alpha>0 时除法（正 alpha 含 1/255 保留，隐藏在 1/255 下的 RGB 字节在 8bit 预乘存储中真实丢失——诚实合同）；显示**一次 OETF**。
- 路线 pass 合同：image 1 pass；procedural/rendered 2 pass（内容+dissolve）。

验证：[采集器](../../tools/verify/shaders-input-dissolve-browser.cjs)、[oracle](../../tools/verify/shaders-input-dissolve-oracle.cjs)、[当前六维 Gate](../../docs/evidence/shaders-absorption/c04-input-dissolve-current-gate.json)。三浏览器 81 视觉、9 活 resize、300 资源轮、27 串行性能窗口已通过；90 PNG 包含 9 resize，8730 稳态帧计时读回为零。最新范围、原始报告、44 类实际篡改拒收及 GPU 可用性见 [十三项交付](../../docs/effects/input-dissolve-validation-delivery.md)。C04 六维子集 PASS，完整 Wave4/Gallery/Agent 仍 NOT_RUN。

图片生产解码器与 pngjs 全字节交叉验证；预乘上传 SHA 从真实资产独立复算。活 resize 覆盖三路线，两种 RT 的 backing/代次与场景布局同步。自有资产账本为 image/procedural/rendered 各 5/5/10 份，包含三份场景 slab Mesh。
