# Box2D 3.2 接入验收

状态：**PASS**。分支：`feat/box2d-3.2-wasm`。项目版本保持 `1.0.0`，未提交、推送或发布。

## 本轮范围

可选 `box2d-v3-wasm` 后端，固定 Box2D `v3.2.0` / `178495ba35695aefe9c321e569d2277f06db3b90`，Emscripten 4.0.21，单线程、单精度、scalar WASM。原 JavaScript 默认后端保持不变。

| 浏览器引擎 | 版本 | 官方默认案例 | AIR 组件断言 | 浏览器退出 |
| --- | --- | --- | --- | --- |
| Chromium | 151.0.7922.34 | 147/147 | 47/47 | 342 ms，exit/close 均为 0，PID 已退出 |
| Firefox | 153.0 | 147/147 | 47/47 | 242 ms，exit/close 均为 0，PID 已退出 |
| WebKit | 26.5 | 147/147 | 47/47 | 52 ms，exit/close 均为 0，PID 已退出 |

官方案例直接编译原始构造和 `Sample::Step`。每例推进 120 帧，两个 Determinism 案例推进 1000 帧；每例核验原生分配回到关闭前边界，保留观察和合成截图。Replay Viewer 使用上游录制 API 生成的带地面碰撞录制。桌面 GUI 所有参数组合不属于本轮穷举声明。

AIR 验收覆盖三类碰撞体、刚体状态/运动/冲量、查询、碰撞过滤、父节点与 Animated 同步、接触事件/流形/禁用/材质、回调期间的安全修改、七类常规关节及真实 MouseJoint 拖拽。拖拽在平移后的 Canvas 中通过真实浏览器事件执行；手动控制全程使用单一步进时钟。调试绘制验证开启后的实际绿色像素及关闭后的清除，场景释放后销毁原生 world。默认后端没有请求可选 WASM 资产。

三个浏览器的 Falling Hinges 与 Rollback 均得到 `sleep step = 299, hash = 0x465F3DF4`。

## 其他门禁

- TypeScript、全局/目标格式、上游文件映射、Web-only 和文档引用检查全部通过。
- 启动/配置/场景释放回归：3 个 suite、16 个测试通过。
- 开发版、压缩版与声明已生成；解包 tarball 的两种运行时均在真实浏览器完成落体碰撞、自动资产定位和 world 释放验证，TypeScript 消费者检查通过。
- 原生 JS/WASM 在两个不同源码目录中重建后逐字节一致。最终运行时为 56,145 字节 JS 和 376,818 字节 WASM。
- Box2D 原始 MIT 许可已随资产部署和打包。许可门禁无失败；仓库既有 Spark 许可 attention 保持原状，与本次 Box2D 验收无关。

## 证据

- [验收汇总与输入指纹](acceptance.json)
- [1359 个原件的路径、大小和 SHA-256](artifacts.json)
- 原始报告、截图及压缩观察：`output/box2d/acceptance/2026-10-19T17-28-20-666Z-<engine>-all/`
- [本地 SDK tarball](../../../output/box2d/cocosair.js-1.0.0.tgz)
- [接入与部署指南](../../guides/box2d3.md)

此前失败、探索和因代码变化而失效的尝试全部保留在 `output/box2d/acceptance/`，没有重标通过或拼接历史 PASS。本轮没有刷新 canonical example campaign，也不构成其他功能的发布就绪声明。

## 历史原件的仓库归档

以上记录对应整合主干前的候选。1359 份原件现已逐字节归档到 [initial 归档](archives/initial/archive.json)，
原来的 `artifacts.json`、输入指纹和 PASS 记录均保持不变。归档包括原始报告、截图、观察、日志及 tarball；
不依赖本机已有的 `output/`。使用以下命令解包到临时目录并逐项核验全部大小与 SHA-256：

```bash
node tools/verify/box2d3-archive.cjs --check=docs/evidence/box2d3-acceptance/archives/initial
```

需要查看原件时，在一个新目录中依次执行 `tar -xzf <archive-path>`，恢复归档清单中的原始逻辑路径。
整合最新主干后的验收会另立记录，不覆盖或重标本记录。
