# Wave 1 能力发现与问题分类

2026-10-09，执行渠道：Lead 审查三个原生子 Agent 的实现和当前源码。这里记录已定位的使用与验证问题；它不是完整 Engine Gate 或 Agent Gate。

| 分类 | 确认的事实 | 处理及边界 |
| --- | --- | --- |
| AGENT_FAILURE | 初版把基类 `Material.overridePipelineStates` 当作运行时状态修改，或使用错误的 BlendFactor 数字 | 三例改为明确的 `Material.initialize({states})`；Sparkle 使用具名枚举。这些是本地调用错误，不证明引擎状态覆盖失效 |
| DOC_GAP | 材质手册的“warn 存根、运行期改宏不可用”没有明确区分 Material 与 MaterialInstance | [Material 基类](../../src/cocos/asset/assets/material.ts)的方法只 warn；[MaterialInstance](../../src/cocos/render-scene/core/material-instance.ts)有实际重编译和状态覆盖实现。当前例子采用明确初始化路线；后续资料整理需要补全对象类型限定，不能泛称所有材质对象都不支持 |
| AGENT_FAILURE | 原生 Director 更新事件不传 dt；初版从事件参数推进时间 | 改为 `Component.update(dt)`，普通模式使用原生 pacer，测试模式使用唯一 step clock；不是另建 RAF 主循环 |
| API_DX | WebGL2 的 GL draw 在 CommandBuffer 方法中立即发生；Queue.submit 主要统计记账 | 采集分别保留更新、原生命令 CPU 包络、GL draw CPU 派发和队列记账；[测量口径](measurement-methods.md)禁止把记账时间称为 GPU 提交时间 |
| API_GAP | 当前公开 gfx 没有本计划所需的完整 GPU timestamp 和活对象观测接口 | 只在工具中对同一 Cocos 上下文使用扩展查询及原调用包装，记录 TOOL_DIAGNOSTIC；扩展缺失就 unavailable，不新增未经多案例论证的公共 API |
| AGENT_FAILURE | 初版漏掉 resize PNG 裁定，或让叶子报告把实际 exit 1 的总命令写为 exit 0 | 独立解码 PNG、冻结精确范围并测试篡改拒绝；子项只读复核命令与原采集命令分开，保存各自真实退出码和文件身份 |
| INFRA_FAILURE | WebKit 26.6 同页 resize 后 GL/Canvas 导出正确，页面截图露出 body 底色 | [Lead 原生 builtin 控制](wave1-resize-observation.md)独立复现。保持 Runtime BLOCKED；没有找到 SDK 核心错误行，不用 fresh page 或导出补偿 |
| INFRA_FAILURE | 短 CPU GL 调用的耗时低于浏览器时钟精度，部分稳定窗口全部量化为 0 | 保存原调用、原样数组及已测精度；该阶段保持 LIMITED，不能解释为零成本。提高精度的 COOP/COEP 仅是明确记录的工具配置 |
| INFRA_FAILURE | Thin Film Firefox mobile 请求 DPR2，实际窗口 DPR1/backing390×844 | 原始协议请求与实际窗口读回同时保留；完整 Performance 范围 LIMITED，不改变期望范围，不主张 SDK 错误 |
| EXAMPLE_GAP | 三个新例提供独立效果探针，但尚未安装通用 Gallery 的 window.__lifecycle | Gallery 保持 draft，validation.lifecycle 不声明不可执行的 resource-released；每效果独立三浏览器300实例 Resource 通过仍单独有效，通用适配需要实现后重新验证 |

本轮没有确证新的 `ENGINE_BUG` 或实际成本超预算的 `PERFORMANCE_GAP`。`REFERENCE_ERROR` 和独立 `AGENT_FAILURE` 的历史尝试须按各效果文档的具体证据判断，不能为了填满分类而创造问题。

Fi-hash 原作者许可未充分证明，直接派生路线排除；Sparkle 使用独立 hash 并说明位置与 seed 量化差异。Thin Film 是视觉化 cosine 虹彩模型，不声称物理光谱干涉。来源与算法边界见[固定索引](upstream-index.md)及三个例子的 `UPSTREAM.md`。

当前保持 example-local 的 UBO 打包、参数验证、显示颜色适配与诊断路径。跨效果公共能力、Driver、组合优化和仅用公开资料的 Agent Gate 均等待当前 Wave 通过；不因为已经出现重复代码就提前建立第二套材质或渲染框架。
