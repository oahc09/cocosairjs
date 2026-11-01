# Box3D required inventory 展开候选 v1

状态：`DETERMINISTIC_PROPOSAL_NOT_APPROVED_FREEZE`。这是 M0 技术复核材料，不是 G0 或任何物理验收的通过报告。

## 可直接复核的结果

- 完整保留 91 个主类别、84 个固定子例及独立 U01/U02，共 177 个来源引用。
- 明确写出 186 个执行定义，确定性展开为 **2,128 个候选 required cell**。这个数来自本次逐项映射，不是历史计数。
- `candidateRequiredCellCount=2128`；`expandedRequiredCellCount=null`、`inventoryFrozen=false`。作者没有把建议当成已批准决定。
- 2,128 个 cell 全部 `NOT_RUN`、证据为空。现有 Node ST 和有限 AIRWorld 结果均未导入，也不自动满足任何完整类别。
- 原资源计划快照下，2,056 个候选 cell 引用至少一个未就绪资源。执行状态与资源阻塞分开保存，没有把这些项从分母中删除。
- 仅新增本组 `inventory-expansion*` 文件；未修改共同 design、ledger、package 或 runtime source，未运行大型构建或外部 Git 操作。

## 文件与命令

- `inventory-expansion-policy.json`：可评审的显式环境、variant、build profile、阶段、fixture 和证据映射；包含 7 项待定决定、6 类 MT 正向目标建议及其理由。
- `inventory-expansion-candidate.json`：版本化完整展开结果；包括每个 cell、聚合关系、原文逐行断言、证据要求、资源快照和统计。
- `tools/verify/box3d/inventory-expansion.cjs`：不探测设备、不读旧证据、不调用浏览器或构建的确定性生成器。
- `tools/verify/box3d/inventory-expansion.test.cjs`：21 项工具完整性与防漏测试，不是 Box3D 功能验收。

在仓库根目录执行：

```sh
node tools/verify/box3d/inventory-expansion.cjs --check
node --test tools/verify/box3d/inventory-expansion.test.cjs
node --test tools/verify/box3d/contracts.test.cjs tools/verify/box3d/resource-budget-contract.test.cjs
```

`--check` 只读且逐字节比较。明确复核输入变化后，`--write` 仅写 `inventory-expansion-candidate.json`。生成结果采用生成器固定 JSON 序列化，不手动改写或用格式化工具重排生成清单。可编辑 policy、工具源码和本说明按仓库 Prettier 配置格式化。

## 技术分母冻结不等于 fixture / Gate 就绪

分母的技术冻结只需要确定 cell 的身份及维度，不要求全部设备当天可用，也不要求每个 fixture 已运行。

本候选尚缺的分母技术决定为：

1. **D01 环境范围**：原文明确六类平台和 WASM-13 HOST/DEVICE 拆分，但没有逐项指定所有 C/I/A/BIZ 用例的浏览器乘积。建议采用显式表：公共行为覆盖五类真实浏览器；低层 binding/U 使用 Node+Chrome；静态产物审计使用执行宿主；性能使用已列产品设备；真人观察单独保留。
   - 提前阶段的非宿主浏览器矩阵首次要求安排在 M5，fixture 原始引入阶段单独保留；宿主沿用原文阶段。此排程是待复核建议，不是假称原文逐项已经规定。
2. **D02 MT 正向目标**：保留六类环境各自的正向候选，验证成功 pool/world 执行；不能因缺设备、浏览器启动失败或 feature probe 阴性，把正向项改成 unsupported 负例。逐环境理由与影响见下文和 JSON。
3. **D03 Debug/Release 关键用例**：原文要求关键用例双构建但未枚举。建议明确列出的 18 个高风险用例，展开后 176 个 debug cell；release 仍保留。不能拿 GCC、本机 native 或 Release 替代 Debug WASM。
4. **D06 聚合与 cell key**：采用内部 `caseKey × environmentId × variantId × buildProfileId`；workerCount 在 variant 内明确，性能 profile 和真人 cohort 在 caseKey 内明确。

以下决定属于准备度或执行阻塞，不应令已明确的枚举永久无法冻结：

- **D05 fixture**：精确几何/输入/seed/创建顺序/独立 oracle 尚未冻结时，相关 cell 保留 required、NOT_RUN 或 BLOCKED，G0 的 fixture 准备门槛仍未满足。不能把仅有断言文本称为 runnable fixture。
- **D04 性能协议**：具体设备、baseline、画质和场景指纹、活动窗口等缺失时，G7 不能通过。它们不抹掉已枚举的 profile；MT applicability 另由 D02 决定。
- **D07 人员与独立 Agent**：BIZ07 参与者、时间和设备分配未落实；五个独立 Agent 任务上下文也未指派。只阻塞相关执行与最终 Gate，不阻止其余工程工作。

Integrator 可按已授权实施范围记录技术决定，不需要把每个工程默认选择变成用户审批。若改变产品承诺、范围、成本或权限，仍需对应授权。未来正式冻结应生成可追溯的新契约版本，保留本候选；不要直接把候选文件改标签冒充已审阅。

## 分母、防漏与阶段规则

所有 91 个 parent 在 `sourceReferences` 中只作聚合，不额外计入执行 cell。固定中间聚合 `WASM-13-AIR-ST` 和 `B3-C28-SENSOR-CCD` 同样不重复计数。`WASM-15` 聚合 P01–P07。

新增子例不总能覆盖父表已有的所有操作。因此以下 11 个 parent 额外保留 `::parent-table-remainder` 内部 fixture 单元：

- C04、C06、C11、C14、C21、C22、C28、C29、C36、I03、I04。

这些不是新增主验收 ID，而是避免“只跑新子例、吞掉父表其余断言”。例如 C04 的 GRAVITY/SLEEP 不能替代三种 body、两种组件添加顺序和 pending geometry 验收；C29-ATTACH-POSE 不能替代三类关节及断裂测试。

每条 cell 记录 fixture 引入阶段、首次要求阶段/Gate 及最终 G8。MT 首次不早于 M6。任何较早技术检查点仅证明该子集，不能提前把包含其他浏览器/MT/复杂生命周期的 parent 标成 PASS。

- `BIZ-AUTO` 候选：宿主 ST 自动业务 7 cells，明确不含 BIZ07。
- `ST-HOST` 候选：17 cells，含原文列出的宿主 CSP、Node/Chrome、重复性、旧后端/共存、关闭、工程、核心示例和 BIZ-AUTO。
- 两者不是新 Gate，不删除 DEVICE、BIZ07、MT 或高级示例，不能替代 T21/T34/G5/G6/G8。
- I08 明确分成 M5 核心 EX01–EX06/EX09 与 M6 高级 EX07/EX08；不产生“G5 要等 M6”的循环。
- EX09 的 BIZ、P07、AG05 均 ST；完整包消费者即使验证 MT，EX09 仍按 source 要求运行 ST。

## 候选维度计数

| 环境                 | 全部候选 cell | MT 相关候选 cell |
| -------------------- | ------------: | ---------------: |
| Node 真实 WASM       |            72 |               46 |
| 宿主 Chrome          |           456 |              281 |
| 桌面 Firefox         |           384 |              250 |
| 真实 macOS Safari    |           384 |              250 |
| 真实 Android WebView |           417 |              262 |
| 真实 iOS Safari      |           414 |              260 |
| 待分配真人 cohort    |             1 |                0 |
| 合计                 |         2,128 |            1,349 |

variant：ST 779、MT2 659、MT3 35、MT4 655。构建：Release 1,952、Debug 176。

MT 相关 cell 不全是运行证明：其中 **1,331 个要求正向真实 MT 执行**，其余 18 个是产物/协议审计或原文要求的 AG03 缺隔离故障诊断。后者不能取得正向平台兼容性 credit。每个 cell 的 `positiveMtExecutionRequired` 与 `variantExecutionRequirement` 明确区分；正向 cell 中的 fallback 检查只能附加，不能替代正向运行。

MT3 用于覆盖允许的总线程数 2…4 中的完整准入、平台、生命周期及重复性范围。A06/P03 则保留原文明说的 ST/MT2/MT4 对照，不把编译出来同一个 MT 二进制误当作所有 workerCount 都已经运行。

## D02：六类 MT 正向目标的建议与影响

- **Node**：保留低层正向 MT。它有独立 worker 启动和退出路径，可检验真实发行 WASM；不宣称 Node 能跑浏览器主入口、CSP、渲染或交付性能。需实际 Node/V8/平台指纹与合法 workerCount 的运行证据。影响 46 个 MT 相关候选。
- **Chrome**：作为原文宿主和桌面预算资源，优先建立真实隔离页面的 MT 正向闭环。验证 COOP/COEP、SAB、Worker、pool-ready 时序、严格 CSP 与关闭，不能仅测缺隔离报错。影响 281 个。
- **Firefox**：保留独立正向目标，因为 Chrome 不能证明其线程、CSP、事件传输及关闭行为。原文保留 Firefox 平台且没有明确排除 MT；实际能力必须在固定 Firefox/OS 上验证。影响 250 个。
- **macOS Safari**：保留真实 Safari 正向候选，不借 Playwright WebKit 或其他浏览器代替。需真实版本、隔离 origin、共享内存/worker 和生命周期验证；本材料不声称当前 Safari 已兼容。影响 250 个。
- **Android WebView**：保留真机/实际嵌入上下文的正向候选及适用移动预算。版本、宿主 app/origin、后台恢复和热稳态都须实际验证；缺设备不能推导 unsupported。影响 262 个。
- **iOS Safari**：保留待明确能力/产品决定的正向候选，避免从模拟器、缺设备或假定限制推导删除。IOS-COMPAT 不额外制造通用 60fps 承诺，EX09 始终 ST 可独立推进。影响 260 个。

以上计数是复核影响范围，不是支持声明。每个目标的更具体依据、检查项与未决处理保存在 `mtTargetRecommendations` / `mtTargetReview`。若实际能力证据要求改变已承诺目标，应保留原失败和契约版本，明确审阅范围影响，不能自动把失败转换成“负例通过”。

## fixture 来源与目前不能假称已经冻结的内容

每个 fixture specification 保存原文准确行号和文本；包含对应父表断言及上下文，原文摘要不会被误当作运行代码。重建新增 C14 recovery、C16 sampled/duration 子例明确标记来源，不伪称 v1.2 已逐字列出这些完整 ID。

特别保留：

- C14 两个 recovery 子例只有已有 inventory ID，没有完整独立原文断言。候选恢复/回滚断言必须技术复核。
- C16 原始几何、重力、速度尚须恢复或显式重建；沿用新 C16-DURATION-1，不冒充历史定义。600 个 tick、0.05m sampled peak、7 个连续样本跨 0.1s 的持续穿透规则及有限三角形独立 oracle 均保留。
- C21 的旋转/偏心/复用/CCD 接触采样基准必须先由真实低层证明，不拿步后 Node 姿态或互逆公式自证。
- C26 完整 10 类边界、实际 linearSlop 与 sweep 容差；C28 完整 5 个 sensor 子项及 native 事件完整复制，不因容量边界观察取消正向命中。
- 睡眠时间/阈值、最小尺寸、hull 限制、角色 slope/push 容差和扩展 joint 极值需要精确 fixture 契约。
- EX09 引用现有版本化设计资产，但不导入静态检查 receipt 作为真实搬运/出货证明。五组正常布局、异常恢复、20 轮业务和 I05 的 100 轮要求都保留。
- BIZ07 将 Chrome/Android/iOS 完整局 QA 与“三名真人总计至少两名 90 秒内首单”的 cohort 分开；不擅自变成每台设备再招三人，也不把真人都假定分配给某台设备。
- P01–P07 明确引用 9 个预算 profile 的既有值；真实浏览器性能不被 Node tight-loop 替代，baseline 全部仍未建立。

## 验证范围

21 项 focused 测试覆盖来源 ID 完整性、每个 Cartesian cell、聚合闭包、原父表残余、六平台及 HOST/DEVICE、确切资源快照、分母/准备度分离、MT 正向与合法线程数、Debug/Release、阶段/检查点、真人、ST 业务、性能 profile、逐行断言来源、禁止 PASS 导入、源字节指纹、换目录一致性及删除/伪造突变拒绝。

通过这些测试只证明本组清单工具与候选文件一致，不证明 Box3D 功能、某个完整类别、G0 或后续 Gate 通过。
