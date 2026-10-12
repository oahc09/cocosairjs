# Emboss / Glass UV 融合 Pilot

两个独立研究案例，共用原生 AIR 页面与采集工具。`?effect=emboss|glass&mode=reference|fused` 选择案例与管线；`test=1` 使用原生 StepClock，普通观看使用原生 pacer。

- reference：程序图案 → 256²、预乘 RGBA8、NEAREST/CLAMP RT → 完整母效果，共两遍。
- fused：在母效果采样位置计算同一图案，先定位 texel 中心并量化预乘 RGBA8，再执行完整母效果，共一遍。
- Emboss 保留 signed height、中央差分法线、双 tap 阴影和 UV warp；Glass 保留固定九点 Vogel 模糊、色散、折射、色调、Fresnel、高光与 alpha 链。
- 仅融合这个确定性的程序输入。真实场景、图片、历史反馈、依赖邻域缓存或任意输入不能据此自动融合。

运行 `node examples/shader-uv-fusion-pilot/generate-effect.cjs` 同源生成两个母效果的 reference/fused/pattern 变体和原生性能插桩；生成器使用仓库 Prettier。原十三例及 SDK 不改动。

验证入口：`node tools/verify/shaders-uv-fusion-browser.cjs --phase=functional --out=<new.json>`；性能必须显式 `--phase=performance --authorization=<Lead quiet-window token>`，36 窗口串行。`--verify=<report.json>` 只读重算源身份、母 CPU oracle、PNG、原始帧/命令/GL draw、资源与环境回执。运行时状态以正式 Gate 为准；文件和 Node 测试不证明浏览器通过。Agent 与独立 Gallery 验收另行进行。

性能是同一 Cocos 上下文的插桩测量：CPU update、原生 gfx 方法墙钟包络、实际 GL draw、AFTER_DRAW 间隔；GPU 时间仅在 native timer query 可用且非 disjoint 时记录。不能把减少一遍直接解释为更快。

查看 [上游与适配说明](UPSTREAM.md) 和 [许可通知](LICENSE.reference.txt)。
