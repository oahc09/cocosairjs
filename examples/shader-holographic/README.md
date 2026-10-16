# 原生 Holographic 全息箔（E03）

入口：[index.html](index.html)，源码：[src/main.ts](src/main.ts)，完整语义：[Holographic 说明](../../docs/effects/holographic.md)。
运行已有 SDK 后用开发服务器打开 `/examples/shader-holographic/`。滑块与暂停/继续/重置/释放均走同一原生时钟；无额外渲染 canvas 或独立 rAF；单通道渲染。

- MaterialX perlin（`mx_noise_float` 2D）在 GLSL 独立重写：lookup3 u32 格点散列+quintic fade+8 梯度表+0.6616 缩放；非 Fi-hash。
- 前向场 stencil eps=0.008（sdf=s0/scale）；平面 pillow 法线（domeSlope=(1−clamp(−sdf/0.06))·0.35，z=−1）；皱褶有限差分 neps=0.02。
- 双倍频 blotch 沿固定 300° 光向漂移；hue=blotch·0.45+ramp+tilt·1.4+t·0.18+hueShift/360；**精确 1/3、2/3 相位**余弦调色板。
- 固定主光字面量 L+运行时 H；sheen/specCore 随 roughness 软化；flakes ×190 域 twinkle；grain 屏稳域 ×420。
- 动画时间合同：时钟累计绝对时间，uniform 读 time×当前 speed（与上游 Σ(dt·speed) 仅 speed 恒定时等价；speed 变更重映射相位；speed=0 冻结）；seed 为本地扩展（噪声坐标偏移，0=上游固定域）。
- 两像素外 guard 精确 vec4(0)；轮廓 alpha 与上游 silhouetteAlpha 精确一致（sharpEdge 地板 0.001→w=max(sharpEdge/32,1.5px)→smoothstep ease；来源 lead 获取原件+更正记录见 output/shaders-absorption/worker-w2-e03-silhouette-correction.md）；输出 straight linear RGBA，预览一次 OETF（定点目标先 clamp 再混合），透明底 rgba8 RT 直读。
- shape（circle/rounded-box）切换重建变体；其余参数仅同步 uniform；sphere3D/volumetric/SDF 贴图/shape JSON 平台 NOT_SUPPORTED。
- 旋转使用归一化的 `(cos(rad), sin(rad))`，防止 GPU 三角函数的径向近似误差缩放 SDF、法线 stencil 和表面图案；它不保证三角函数的角度误差消失。输入仍由参数合同限制为有限 rotation 0–360、scale 0.4–2，不以恒等旋转掩盖无效输入。修改 `src/holographic.frag` 后必须运行本例 `generate-effect.cjs`，并用原采样点及原容差重新验证本例与共享此 effect 的 Driver Pilot；CPU 单位基回归不能替代真实 GPU 证据。

验证工具：[六门采集器](../../tools/verify/shaders-holographic-browser.cjs)、[CPU oracle](../../tools/verify/shaders-holographic-oracle.cjs)、[单遍性能校验](../../tools/verify/shaders-holographic-performance.cjs)。`--out` 必须新路径，`--verify` 只读。性能窗口须 Lead 串行授权且要求 `--authorization`。

旋转专项 CPU 回归：`node --test tools/verify/shaders-holographic-rotation.test.cjs`，包括原径向误差反例、四象限/形状/scale 边界及两个独立目录中的官方生成一致性；真实 GPU 结论仍来自上述采集器。

生命周期：每实例 mesh/material/effect 三份显式引用；renderer 先解绑；100 轮同 app 分配/释放预热后固定基线；释放 Promise 幂等、终态抛 `HOLOGRAPHIC_DISPOSED`。Gallery 桥接 `window.__lifecycle`/`__lifecycleHold`，浏览器证据 RESOLVED_NOT_RUN。

来源与 MIT/MaterialX 通知：[UPSTREAM.md](UPSTREAM.md)、[LICENSE.reference.txt](LICENSE.reference.txt)。算法正确性以独立数值 oracle（分层 noise/normal/hue/light/flake/grain）为准，不以截图相似判定。
