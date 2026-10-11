# 原生 Neon 霓虹管（E04）

入口：[index.html](index.html)，源码：[src/main.ts](src/main.ts)，完整语义：[Neon 说明](../../docs/effects/neon.md)。
运行已有 SDK 后用开发服务器打开 `/examples/shader-neon/`。滑块与暂停/继续/重置/释放均走同一原生时钟；无额外渲染 canvas 或独立 rAF。

- 中心+四向 SDF stencil（`0.008+cornerSmoothing*0.03` 半径），cornerSmoothing 混合原始与平滑场。
- 管体是 SDF 零交叉附近的 rim band（空心玻璃管观感）：内掩模 `1-smooth(t-soft,t+soft,-sdf)`，外掩模 `1-smooth(-soft,soft,sdf)`——上游逆边 smoothstep 的显式有序逆。
- 半圆截面法线 + Blinn-Phong（lz=0.7 常数）+ 自发光 + 热核（`smoothstep(0.55,1,depthNorm)`×flow）。
- 双层指数外晕（`exp(-12d/R)*0.7` + `exp(-4d/R)*0.35`）外侧门控；`glowR*1.5+softPx+smoothEPS` 之外硬零，远端 alpha 恒 0。
- flicker=三无理比正弦对 `mix(-2,0.8,amount)` 阈值的 smoothstep；flow=场空间 `atan2` 角向 `2θ+ωt` 扫带。两者均由单一 time 驱动，`flickerAmount=0`/`flowAmount=0` 有确定性恒等语义。
- 输出 straight linear RGBA（数学 HDR 不预clamp）；预览 OETF 后片段色先被 RGBA8 定点帧缓冲 clamp 再 SRC_ALPHA 混合；诊断 rgba8 RT 透明清屏+关混合直读 `round(clamp01(x)·255)`，HDR 饱和、远场精确 (0,0,0,0)。完整格式链见 [docs/effects/neon.md](../../docs/effects/neon.md)。
- shape（circle/rounded-box）切换重建变体；其余参数仅同步 uniform。未知键/NaN/Infinity/越界/非法枚举/非法颜色在改变状态前整批拒绝。

验证工具：[六门采集器](../../tools/verify/shaders-neon-browser.cjs)、[CPU oracle](../../tools/verify/shaders-neon-oracle.cjs)、[串行性能校验](../../tools/verify/shaders-neon-performance.cjs)。`--out` 必须新路径，`--verify` 只读。性能窗口须 Lead 串行授权。

生命周期：renderer 先解绑，再退役组件/节点，再归还 mesh/material/effect 各一份显式引用；100 轮同 app 原生实例分配/释放预热缓存后固定基线；释放 Promise 幂等、终态抛 `NEON_DISPOSED` 并禁用控件。Gallery 桥接 `window.__lifecycle`/`__lifecycleHold`（`installShaderLifecycle`），resource-released 目前为 RESOLVED_NOT_RUN——浏览器证据待 Lead 采集。

来源与 MIT 通知：[UPSTREAM.md](UPSTREAM.md)、[LICENSE.reference.txt](LICENSE.reference.txt)。本例不含上游运行时/TypeGPU/第二 canvas；算法正确性以独立数值 oracle 为准，不以截图相似判定。
