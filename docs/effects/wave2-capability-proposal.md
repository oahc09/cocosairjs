# Wave 2：SDF / Noise / Color 公共能力初稿

2026-10-10。依据三个独立原生实现提出复用边界，**本稿不新增公共运行时 API**。
当前验收依据见 [Wave 2 分工与验收](wave2-kickoff.md)，来源固定为
`shader-effects-inc/shaders@dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a`。

## 真实消费者与差异

| 候选能力          | 真实消费者                                                          | 可共享部分                                                                    | 必须保留的差异                                                                                                                                        | 初步位置                                              |
| ----------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 解析 SDF 与域变换 | [Neon](neon.md)、[Emboss](emboss.md)、[Holographic](holographic.md) | circle / rounded-box、缩放、角度旋转、有符号距离约定                          | Neon 五点 stencil / 管体，Emboss 中央差分 / signed height，Holographic 前向差分 / pillow；不能把不同 eps、法线或 silhouette 合并                      | example-local GLSL/JS；Wave 5 再评估纯数学片段        |
| 噪声身份          | [Noise Dissolve](noise-dissolve.md)、[Holographic](holographic.md)  | 明确名称、域、seed、数值金标和许可                                            | gradient noise 与 MaterialX lookup3 Perlin 是不同算法；不能以统一 noise() 名称悄悄互换。后者含精确 u32 wrap、八梯度和 0.6616 缩放                     | 有身份的 GLSL 片段与独立测试，不建立通用噪声 runtime  |
| 色谱和颜色链      | [Thin Film](thin-film.md)、Neon、Emboss、Holographic                | straight linear 与显示 OETF 的边界说明；RGBA8 量化、clamp、混合顺序的测试合同 | Thin Film 使用截断相位，Holographic 使用精确三等分；Neon 的 HDR 数学与 Holographic 的算法 clamp 不同；Emboss 输入为预乘纹理，必须先安全 unpremultiply | 文档/Pattern + 格式语义测试，暂不新增默认 tone mapper |
| 参数合同          | 三个 Wave 2 例                                                      | 原子拒绝 unknown/type/range/NaN/Infinity/enum；只有结构变化才重建             | shape 改变双向均重建；其余参数的资源和 uniform 策略由真实消费者定义                                                                                   | 现有工具合同，避免另一套 Material 抽象                |
| 原生资源退役      | Neon、Emboss、Holographic                                           | renderer 先解绑、归还自有引用、移除自有节点、幂等终态、保留借用资源           | Emboss 还需独立消费 bindColor 与 attachCamera 两回调，再 dispose；不能把 sampler 解绑误当 camera detach                                               | Recipe 与明确所有权文档；现有 Gallery bridge 保持薄层 |

## 已暴露的实现与验证问题

- **AGENT_FAILURE**：生成器沿用别的例子的 UBO members，导致所有 uniform 未绑定且全透明；应把实际 shader 声明、属性和生成元数据的对应关系作为生成器测试。
- **AGENT_FAILURE**：时间测试只改变 uniform 却不绘制新帧；应绑定实际 submitted frame、原始像素与冻结时间。`equal=true` 不能替代重算。
- **AGENT_FAILURE**：只检验两张像素相等，会接受两张相同的伪造白图；冻结点集、有限 RGBA 字节和独立 oracle 必须同时满足。
- **AGENT_FAILURE**：从双通道例子复制单通道性能门禁，错误要求两个 pass；draw/pass 下限来自每例冻结管线，不来自共享样板的默认值。
- **AGENT_FAILURE**：未取得实现体便根据文档猜轮廓公式，漏掉 `/32` 和 smoothstep。来源下载失败只说明那次尝试失败，不能概括为环境离线。
- **DOC_GAP / API_DX 候选**：材质生成元数据、RT 两种解绑回调、AFTER_DRAW 与 totalFrames 的先后，以及提交帧与 compositor 呈现的区别，值得补入可执行 Recipe。当前不据此判定 ENGINE_BUG。

问题实例及修复证据以各例的固定十三项交付与失败 attempt 为准；没有因为截图相似而接受算法，也没有将工具错误归给 SDK。

## 提案的下一步约束

1. 先完成 Wave 2 冻结六维验收，再进入 Wave 3 动态资源与多 Pass；当前文稿不充当 Gate。
2. Wave 5 若提取数学片段，至少保留两个实际消费者、原有数值金标、像素容差和生命周期回归；先量化删掉的重复代码与新增成本。
3. 独立 CPU oracle 不从生产 GLSL 或共享实现自动生成，避免同错同绿。
4. 不合并不同噪声族、色谱相位、stencil、alpha 或颜色空间。选择必须通过命名和参数显式表达。
5. 只有公开资料隔离的 Agent Benchmark 暴露稳定 DX 收益后，才考虑正式入口；本轮 Agent Gate 仍 NOT_RUN。

结论：目前证据支持先完善 Pattern、生成器检查和格式/所有权文档。尚无新增 core API 或效果平台的充分证据，SDK 与抽取源码保持不变。
