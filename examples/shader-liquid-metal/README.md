# 原生 Liquid Metal 液态金属（E07）

入口：[index.html](index.html)，源码：[src/main.ts](src/main.ts)，完整语义：[Liquid Metal 说明](../../docs/effects/liquid-metal.md)。
运行已有 SDK 后用开发服务器打开 `/examples/shader-liquid-metal/`。滑块与暂停/继续/重置/释放均走同一原生时钟；单通道渲染，无第二 canvas。

- 前向场 stencil eps=0.01 + bevelSin 倒角轮廓（round/machined）→ 倾斜场梯度法线（z=−cos，sB≤0.9995）。
- 流动浮雕：flowWarp 双 sin·cos 域扭曲（ripple·2.6 域、warp·0.9 强度、t·0.12 流速）；**噪声替代**：mx perlin（lookup3）+ 中心差分 ×0.62 钳 ±4 替代上游 Fi-hash perlin12d（许可未明，同类非等价，见 [UPSTREAM.md](UPSTREAM.md)）。
- 三柔光灯程序影棚（overhead/lower-left/right，keyRad 随 sharpness、drift 随 t）+ 透视视线镜像反射 + 主光 glint（60→900 指数）+ 金属 ramp #141414→#eef0f6。
- **质量档位真实算力差**：low=1 次影棚求值（3 灯距）/high=2 次色散分离（6 灯距，R=2G−B）；dth 随掠射角。
- 轮廓=E03 已验证上游 silhouetteAlpha 精确链；两像素外 guard 精确 vec4(0)；straight linear RGBA，预览一次 OETF。
- shape（circle/rounded-box）切换重建变体；其余 uniform；quality 为 uniform 分支。未知键/NaN/Infinity/越界/非法枚举整批拒绝。
- seed 本地扩展（噪声域偏移，0=基准域）；动画时间 time×speed（speed 变更重映射相位）。

验证工具：[六门采集器](../../tools/verify/shaders-liquid-metal-browser.cjs)、[CPU oracle](../../tools/verify/shaders-liquid-metal-oracle.cjs)、[单遍性能校验](../../tools/verify/shaders-liquid-metal-performance.cjs)。`--out` 必须新路径，`--verify` 只读。性能窗口须 Lead 串行授权且要求 `--authorization`。

生命周期：每实例 mesh/material/effect 三份显式引用；renderer 先解绑；100 轮同 app 分配/释放预热后固定基线；释放 Promise 幂等、终态抛 `LIQUID_DISPOSED`。Gallery 桥接 `window.__lifecycle`/`__lifecycleHold`，浏览器证据 RESOLVED_NOT_RUN。

来源与 MIT/MaterialX 通知：[UPSTREAM.md](UPSTREAM.md)、[LICENSE.reference.txt](LICENSE.reference.txt)。算法正确性以独立数值 oracle 为准，不以截图相似判定；Liquid Metal 是视觉材质，不是流体模拟。
