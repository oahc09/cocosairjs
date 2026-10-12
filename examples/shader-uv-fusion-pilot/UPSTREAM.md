# 固定参考与融合边界

上游仓库 `shader-effects-inc/shaders` 固定 commit `dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。本例复用当前 SDK 已验收 E05 Emboss 与 E09 Glass 的完整原生母算法；没有执行上游 runtime、TypeGPU，也没有增加渲染 canvas。MIT/第三方通知见 LICENSE.reference.txt。

生成器从 `../shader-emboss/src/emboss.frag`、`../shader-glass/src/glass.frag` 和各自 `pattern.frag` 读取，源文件 SHA/bytes 与母参数、母 CPU oracle、SDK 一并冻结到每份采集报告。reference 主片段源码保持原样；fused 仅移除 `childTexture` 声明，将每个 `texture(childTexture, uv)` 替换为 `storedPattern(uv)`。回归测试撤销这个替换后，得到完整相同的母片段源码。

程序输入在 256² texel 中心求值，执行 CLAMP_TO_EDGE + NEAREST 的坐标映射、预乘与 `floor(value*255+0.5)/255` 存储往返。母效果的逆预乘阈值、光照、blur taps、alpha、一次 OETF 与屏幕混合均保留。真实 RT 写入与显式舍入可能出现一个码值的 GPU 精度差，实际差值必须由采集报告和逐像素对照证明，不能先放宽母 oracle 的 ±2 容差。

该变换只适用于本例的无副作用、可重算程序纹素。Emboss 的普通参数为 uniform；shape 是变体。Glass 的 shape、blur 从零跨到正值、aberration 从零跨到正值需要变体重建，其余为 uniform。每次变体更换配对退役自有资产；单遍不保留 child RT。关闭某个视觉参数不会自动跳过整个管线；`sourceKind=blank` 仍按相同母效果语义运行，不把 alpha=0 的输入偷偷当作所有效果的通用 identity。

不提议新的 core API。本 Pilot 的边界与性能结果用于判断将来 CompositionIR、identityWhen、UV remap 应保留为工具/Recipe 或进入公共能力。
