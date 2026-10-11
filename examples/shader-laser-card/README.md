# 原生 Laser Card 镭射卡片（C01）

入口：[index.html](index.html)，源码：[src/main.ts](src/main.ts)，完整语义：[Laser Card 说明](../../docs/effects/laser-card.md)。

- 三段原生顺序：**Holographic → Emboss → Sparkle**，三相机同 Scene 分 priority，两个中间 rgba8 RT。
- 中间 RT 存储 **premultiplied** rgba8；各阶段读入时安全 un-premultiply；最终 **一次 OETF** + screen blend。
- Sparkle 读 Emboss RT 的**实际内容**（颜色+亮度门控星芒），非固定纹理。
- 层开关真 identity：holo=off → 中性输入；emboss=off → 直接采样 RT1，关闭 Emboss 相机（默认三 pass → 两 pass）；sparkle=off → display copy（仍一个 pass）。
- 参数命名空间隔离（holo*/emboss*/sparkle*），shape 共享。

验证工具：[六门采集器](../../tools/verify/shaders-laser-card-browser.cjs)、[组合 CPU oracle](../../tools/verify/shaders-laser-card-oracle.cjs)。Gallery RESOLVED_NOT_RUN。

来源与 MIT 通知：[UPSTREAM.md](UPSTREAM.md)、[LICENSE.reference.txt](LICENSE.reference.txt)。

### 采集前合同修复（2026-10-10）

Lead 在 Orca Worker 使用限额中止后接管。CPU 与三段 GLSL 均保留完整母效果算法；Emboss warp 采样实际最近邻 Holo 纹素，两次中间 RGBA8 预乘量化逐段纳入 oracle。Sparkle 的网格使用 CSS 坐标，DPR 仅决定 backing；seed 进入真实 uniform。三段之间没有 OETF/EOTF，最终屏幕输出一次 OETF。

关闭 Emboss 后跳过该相机和 RT2 写入，RT2 仍由实例持有并在 release 归还，不宣称关闭层立即减少纹理内存。关闭 Holo 保留可见的中性卡片；关闭 Sparkle 保留最终显示 pass。native 线性诊断使用同一 Cocos 场景/相机及公开 render-target API，没有额外 canvas。

完整三浏览器功能/性能正例与篡改测试是 NODE_CONTRACT 合成合同，不能替代浏览器证据。当前真实浏览器六维、独立 Gallery 与 Agent Gate 仍为 NOT_RUN。
