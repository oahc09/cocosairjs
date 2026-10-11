# 原生 Emboss 浮雕（E05）

入口：[index.html](index.html)，源码：[src/main.ts](src/main.ts)，完整语义：[Emboss 说明](../../docs/effects/emboss.md)。
运行已有 SDK 后用开发服务器打开 `/examples/shader-emboss/`。滑块与暂停/继续/重置/释放均走同一原生时钟；无额外渲染 canvas 或独立 rAF。

- 原生双相机 RTT：子相机把 256×256 确定性图案（不透明/半透明/透明三区+隐藏 RGB+UV 锚点棋盘）预乘写入 `createAirRenderTarget`，`bindColor` 绑入浮雕材质；主相机渲浮雕 quad。
- Signed SDF 高度平台（tw=0.003）；中心+四向差分（eps=0.003）法线；lz=0.7 常数光向 `(NdotL−lzn)·intensity` 分解 highlight/edgeShadow；两个 50%/100% trace tap（spread=|depth|·0.06）的 cast shadow。
- depth<0 凹 / depth>0 凸 / depth=0 精确 child 直通（含 alpha，与光照参数无关）；形状外 warp=1 直通。
- 逆边 smoothstep 全部改写显式有序逆（高度与 inside 两处）。
- Child 采样预乘→alpha>0.001 安全 unpremultiply→straight 数学→straight RGBA 输出；预览一次 OETF+SRC_ALPHA 混合，透明底 rgba8 RT 直读线性值。半透明区不 double-premultiply、alpha0 无 NaN 由 oracle 数值证明。
- shape（circle/rounded-box）切换重建变体；其余参数仅同步 uniform。未知键/NaN/Infinity/越界/非法枚举整批拒绝。

验证工具：[六门采集器](../../tools/verify/shaders-emboss-browser.cjs)、[CPU oracle](../../tools/verify/shaders-emboss-oracle.cjs)、[两遍性能校验](../../tools/verify/shaders-emboss-performance.cjs)。`--out` 必须新路径，`--verify` 只读。性能窗口须 Lead 串行授权且要求 `--authorization`。

生命周期：每实例自有 mesh/material/effect×2 + childMesh/childMaterial/childEffect + child RT（共 6 份显式引用 + RT detach/dispose）；renderer/childRenderer 先解绑；100 轮同 app 分配/释放预热后固定基线；释放 Promise 幂等、终态抛 `EMBOSS_DISPOSED`。Gallery 桥接 `window.__lifecycle`/`__lifecycleHold`，浏览器证据 RESOLVED_NOT_RUN。

来源与 MIT 通知：[UPSTREAM.md](UPSTREAM.md)、[LICENSE.reference.txt](LICENSE.reference.txt)。SDF 贴图/volumetric/shape JSON 平台 NOT_SUPPORTED，明确不在本例范围。

## 2026-10-11 首轮审查修复

真实 Chromium 首采暴露两处接线缺口（AGENT_FAILURE，非 SDK 缺陷）：① child RT 退役未调用 `attachCamera` 返回的 detach 回调（`bindColor` 回调只解绑采样器），现按 采样器解绑→相机 detach→实测 `targetTexture===null`→dispose 顺序释放（`src/child-rt-release.ts` 生产 helper，Jest 实测回调语义与幂等）；② 视觉阶段 background-light 残留污染 live-resize，现资源/resize 阶段前显式冻结默认 presentation，校验器独立断言 before/after 快照与 gpuReceipt 的 background/linearDiagnostic/params。旧 attempt1 真实 FAIL 报告保留；浏览器证据待 Lead 重新冻结采集。
