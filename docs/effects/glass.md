# Glass：原生双相机 RTT 与片元透镜

当前结果见[六维交付](glass-validation-delivery.md)。本例使用固定上游 Glass helper 明确存在的 Vogel 片元 fallback，**不实现 Gaussian compute 前置**。它验证 Cocos AIR 原生场景纹理、材质变体、采样、透明合成和所有权，不移植上游运行时或平台。

## 场景纹理与颜色

子相机先把不对称棋盘、渐变、半透明区和透明孔写入 256×256 RGBA8 RenderTarget；主相机再绘制 Glass 材质。只有一个渲染 canvas，两遍都由原生管线提交。子纹理采用 CLAMP/NEAREST，这与上游可变尺寸及过滤设置不同。

子目标存储预乘 RGB。采样后以 alpha>0.001 为条件安全逆预乘，再执行 straight RGBA 数学。透明隐藏 RGB 不进入颜色运算。诊断透明 RT 直接读回线性 RGBA8；预览做一次 OETF 后按固定点 framebuffer 的 clamp/alpha 混合计算。两条独立 CPU 对照链容差均为 ±2 码值，不因截图相似或 HDR 饱和放宽。

## 透镜、模糊与边缘

circle/rounded-box 解析 SDF 使用前向差分 eps=0.01。UI thickness 先乘0.5；折射强度为 `(1-clamp(-s/max(thickness*0.3,0.005)))²`，梯度长度有12上限。UV 包含 innerZoom、按 aspect 修正的折射和 RGB 色散。

blur>0 时使用九点 Vogel disk，色散开启时三个通道共27 taps；关闭时分别为1或3 taps。它是片元纹理采样，不是 Gaussian compute。零跨越 blur/aberration 或 shape 改变会真实重建变体，其余参数更新 uniform。

光照包含方向边缘、高光与 Fresnel；轮廓过渡为 cubic smoothstep，cutout 可保持全图或只保留形状。tint 的亮度保持按0.299/0.587/0.114权重重算。固定中心、白色高光和两个解析形状属于声明的子集。

## 所有权与验证

每实例持有主/子两组 Mesh、Material、Effect 共六份引用。先解绑 renderer 和采样器，再消费 `attachCamera` 返回的独立 detach 回调，最后 dispose RT、移除注册、归还引用和观察失效；`bindColor` 回调不能代替相机 detach。释放 Promise 精确幂等，终态拒绝 `GLASS_DISPOSED`。

三浏览器45组标准画面/透明读回、294个参数边界、18个非法整批拒绝、300轮资源退役、3次同页resize及9个性能窗口通过。性能冻结 blur=8/aberration=0.5，逐稳态帧至少两个原生 pass 和 draw，计时内 readPixels=0。算法样点、PNG及引用等35类真实报告篡改全部拒绝。

来源与差异见[UPSTREAM](../../examples/shader-glass/UPSTREAM.md)。独立 Gallery harness、Gaussian compute、实体设备、长时、多标签页和 Agent Gate 未测。引擎内存登记不等于物理显存；Firefox/WebKit GPU timestamp 不可用。
