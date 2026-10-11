# 原生 Sparkle 星芒（E06）

入口：[index.html](index.html)，源码：[src/main.ts](src/main.ts)，完整语义：[Sparkle 说明](../../docs/effects/sparkle.md)。
运行已有 SDK 后用开发服务器打开 `/examples/shader-sparkle/`。八个滑块及暂停/继续/重置/释放均走同一原生时钟；无额外渲染 canvas 或独立 rAF。

- 两层 CSS px jittered grid（size 与 size×2/3），各只枚举相邻四格。
- 输入为 straight sRGB RGBA8、nearest/clamp；decode 后使用 alpha×linear Rec709 luma，再 sqrt，以 threshold 到 threshold+0.12 门控。
- Gaussian core + 两条指数射线 + 半 cell Chebyshev 有界窗；flash=max(sin(t×rate+offset),0)^8。
- expand>0 是固定四个 ring taps，不是 box blur；跨 0 重建 native instance。同侧变化只同步 uniform。
- 核心输出 linear associated RGB + glow，alpha=min(inputAlpha+max(glow),1)。intensity=0 四通道恒等；alpha0 高 RGB 不触发。
- 预览单独 unassociate→OETF→associate，以具名 `ONE/ONE_MINUS_SRC_ALPHA` 做 native blend；不以黑背景截图替代 alpha 验证。原生 rgba16f Camera→AirRenderTarget 诊断逐点读回核心四通道。
- 本地独立 uint hash/seed 量化与上游位置不同；不声明 Fi hash 或全量 upstream byte-equivalence。来源与 MIT 通知：[UPSTREAM.md](UPSTREAM.md)。

验证工具：[功能/六门校验器](../../tools/verify/shaders-sparkle-browser.cjs)、[CPU oracle](../../tools/verify/shaders-sparkle-oracle.cjs)、[串行性能采集](../../tools/verify/shaders-sparkle-performance.cjs)。`--out` 必须新路径，`--verify` 只读。性能脚本须在 Lead 分配的 quiet window 使用；报告区分 native gfx envelope、GL draw dispatch、queue bookkeeping、frame callback 与真实 extension timestamp。

生命周期：renderer 先解绑，再退役组件/节点，再归还 mesh/material/texture 各一份显式引用。100 轮同 app 原生实例分配/释放，缓存先预热后固定基线；两份自有 EffectAsset 在同 app 的 100 实例间共享，app.release 核验 registry identity 后 remove、各自 refs 1→0/destroy；program/PSO/builtin/runtime 缓存仅借用保留。诊断临时 RT/material 用 finally 归还。释放 Promise 幂等、终态禁止更新并禁用控件。

历史冻结状态：[13.7KB 最终证据摘要](../../docs/evidence/shaders-absorption/e06-final-summary.json)。CH/FF六维PASS；WK Runtime同页resize BLOCKED，Performance mobile计时低于1ms精度LIMITED。Agent Gate NOT_RUN、Gallery draft；不能用fresh-page替代同页resize或把量化0当作零成本。历史失败保留，完整原始数值/PNG/refs/query由摘要SHA绑定。

Gallery 规格说明：`example.json` 的 ready/validation/API evidence 是声明和源码定位，不等同 Gallery runtime 验证。**已实现 `window.__lifecycle` / `__lifecycleHold`**：`installShaderLifecycle` 桥接实例级 create/retire 到共享合同，`validation.lifecycle` 声明 `resource-released`。Lead 已在三浏览器的 step/native 两种模式实际采集生命周期；当前证据由下述新 Gate 绑定，旧报告保留其原指纹。历史独立 E06 300 实例资源与 EffectAsset 退役证据保留为历史。

## 2026-10-10 复验

Windows WebKit 采集器使用 `shaders-browser-launch.cjs` 移除 Playwright 默认的 `--disable-accelerated-compositing`；同页 live resize 已通过原 compositor PNG oracle。未修改 SDK、重载页面或增加渲染 canvas。Gallery 桥接已实测 retire/reacquire、并发 Promise、引用归零和终态；原生 pacer 与 step clock 分别采证。

当前完整验收以 [Wave 1 当前 Gate](../../docs/evidence/shaders-absorption/wave1-r21-current-gate.json) 的输入指纹和结果为准。上文历史冻结报告不升级为当前 PASS。示例保持 Gallery draft；Agent Gate 独立且尚未运行。
