# C04 Input Dissolve 任意输入溶解

Wave 4 第四个原生组合。上游 dbfd42abe（MIT + MaterialX/OSL 谱系），母效果 NoiseDissolve（reveal/coverage.noise）；本地组合设计。

## 组合语义（本地冻结）

- 三路线任意输入：image（真实 PNG 原生上传）/ procedural（程序着色器内容）/ rendered（真实场景 RT）。
- 母算法完整：Perlin 3-octave fbm coverage + reveal 掩码（progress/scale/softness/seed/invert），只缩放 alpha。
- 端点精确：progress 0=identity、1=transparent；禁用=输入直通。
- premultiplied rgba8 量化往返；逆预乘 alpha>0 即除（1/255 保留，其下隐藏 RGB 为 8bit 存储真实丢失）；一次 OETF（禁用路径同样线性经诊断分支）；texel-center/CLAMP/y-flip 三路线一致。

## 验证范围

功能冻结范围：三浏览器合计 81 个视觉案例（各 21 DPR1 + 6 DPR2）、90 参数边界、21 非法输入整批拒绝、300 轮资源循环、三路线共 9 次活 resize；90 PNG 含 81 标准案例与 9 resize，不是 90 算法案例。

图片预乘线性 RGBA8 上传字节独立复算 SHA；生产 PNG 解码器与 pngjs 全字节交叉验证。场景三个 slab Mesh 逐项纳入引用账本。透明显式诊断与实际 compositor PNG 双验证，数学容差 ±2 不变。

三引擎 × 三 profile × 三路线的 27 串行性能窗口已完成，共 8730 稳态帧，计时 readPixels=0。Chromium GPU timestamp 可用，Firefox/WebKit 如实记不可用；CPU 插桩开销与 GPU 时间分开。当前 [C04 六维 Gate](../evidence/shaders-absorption/c04-input-dissolve-current-gate.json) PASS，44 类真实报告篡改全部拒收。完整 Wave4、Agent 和独立 Gallery 仍 NOT_RUN，详见 [十三项交付](input-dissolve-validation-delivery.md)。
