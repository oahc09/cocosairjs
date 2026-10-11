# 原生 Film+Neon 彩边霓虹 Logo（C02）

入口：[index.html](index.html)，源码：[src/main.ts](src/main.ts)，完整语义：[Film+Neon 说明](../../docs/effects/film-neon.md)。

- 冻结本地次序 **Neon over ThinFilm**：各层独立 straight linear RGBA → premultiplied source-over → alpha 安全逆预乘 → OETF 一次。透明诊断目标关混合。
- 两路径保留 E02 coverage/gradient 与 E04 5 点 stencil 的**数值差异**，不合并为通用融合。
- `filmEnabled`/`neonEnabled` 真 identity：off 层 straight RGBA=(0,0,0,0)，合成恰等于另一层 alone；数值 RGB=0 但 alpha≠0 不自动 identity。
- 共享解析 SDF（circle/rounded-box），初始共同域；层参数互不污染（lightAngle 与 shape 为共享耦合参数）。
- 23 参数 update（shape 结构重建/其余 uniform）；未知键/NaN/Infinity/越界/非法枚举/非法颜色整批拒绝。

验证工具：[六门采集器](../../tools/verify/shaders-film-neon-browser.cjs)、[组合 CPU oracle](../../tools/verify/shaders-film-neon-oracle.cjs)（读 E02/E04 母 oracle 函数+独立合成）。Gallery 桥接 `__lifecycle`/`__lifecycleHold`，浏览器证据 RESOLVED_NOT_RUN。

来源与 MIT 通知：[UPSTREAM.md](UPSTREAM.md)、[LICENSE.reference.txt](LICENSE.reference.txt)。本地组合设计，不称上游 Logo 预设。
