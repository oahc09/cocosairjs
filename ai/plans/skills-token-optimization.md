# Skills 体系 Token 优化计划（v1.0 · 待授权执行）

- 评估对象：`skills/`（22 个技能，191 个文件，190 个 Markdown，合计 1,443,093 字节）
- 目标：在保留信息、按迁移账本逐项核对的前提下降低两层成本 —— (A) 常驻索引成本，(B) 单次任务加载成本；并让元数据本身足以完成技能筛选
- **本版状态：仅修订计划文档，暂不执行、不提交。** 阶段一与阶段二均须后续单独授权；文中的命令、交付物和门禁是未来实施规格，勾选状态不代表本轮已执行。提交、推送、发布与版本变更不在本计划的自动授权范围内。
- 现状体量采用 2026-10-17 的采样记录，尚未重采全套基线；实施前必须重新测量。本文的收益门槛是验收目标，不是已实现结果。字符、UTF-8 字节与 token 分开统计；3.8 字符/token 仅作英文文本粗估，中文按 1.5 粗估，不承诺统一 ±10% 误差，也不把字节直接当字符。

---

## 0. 方案边界（实施待授权）

| 编号 | 决策项       | 结论                                                                                                              | 影响面                                                                                                              |
| ---- | ------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| D1   | 记账与执行档 | **Profile A**：路由器常驻，仅压到 ≤4.2 KB；不假设宿主读 `index.json`                                              | 所有收益按 A 记账；Profile B（路由器可跳过）只作上界参考，**不进交付范围**                                          |
| D2   | 交付范围     | 阶段一 **83–88 h**：S0a/S1a/S0b → S2a 五技能 → S2p 探针 → S2b 剩余元数据及全题门 → S4/S3/S7a/S8a；阶段二 **66 h** | S4 必须等候选 T1 可行性通过；工时按 C 是否保留分支记账                                                              |
| D3   | 分发         | **A 整树复制默认；C 按 S1a 预检结果有条件保留**，不采用手工内联方案 B                                             | 先读分析 rendering/math/verification 闭包；几乎全树或收益不足则不实现 --bundle，README 明确整树分发；不得自动恢复 C |
| D4   | 版本号       | 本轮**不 bump**，是否发布由维护者决定                                                                             | 不动 `package.json` 版本；发布策略见 §6                                                                             |

### 0.1 当前收益目标

| 指标        | 通过条件                                                        | 验收位置 |
| ----------- | --------------------------------------------------------------- | -------- |
| 常驻索引    | host-minimal 的 name + description 字符数较原始基线降低至少 40% | G7       |
| 子系统入口  | 21 份完整 SKILL 的平均 UTF-8 字节数降低至少 30%                 | G7       |
| B1 固定任务 | 含常驻索引和全部实际读取的文档输入字符成本 C 不增加             | G7       |
| B2 固定任务 | 同口径 C 较原始基线降低至少 40%                                 | G13      |

阶段一优先处理元数据与入口固定开销，阶段二按 M2 的真实需求证据决定是否改善大参考加载粒度。固定任务按 §7.1 冻结和计量，不能将两个任务的结果外推为全套技能的加权收益。

### 0.2 工作量（分支估算）

**阶段一 83–88 h，阶段二 66 h，总计 149–154 h**。C 不实施时回收 5 h，不转做其他功能；只保留 A 的分发形态同样可以完整交付阶段一。

下表按成本归组，不按实际执行时间排序：**S0b 在 S1a 必需工具和题集 fixture 就绪、S0r 还原校验通过后执行**；真实依赖顺序为 S0a → S1a → S0r → S0b，见附录 B。

| 步骤                             | 工时         | 产出与硬依赖                                                                                                          |
| -------------------------------- | ------------ | --------------------------------------------------------------------------------------------------------------------- |
| S0a 原始快照/还原校验 + S0b 基线 | 5 h（3 + 2） | S0a 冻结原始字节；工具就绪后完成一次实际还原复读，再由 S0b 审核题集及 B1/B2 对照；首次技能修改前全部通过              |
| S1a 工具（六文件）               | 23–28 h      | 解析 4、体量/加载 4、元数据 4、索引/投影/闭包预检 3、无损/还原支持 5、路由 T1 3；只有通过价值门才再投 C 生成/隔离 5 h |
| S2a 五技能元数据                 | 3 h          | rendering、application、gltf、materials-effects、project-setup；不改正文，须等 S0b                                    |
| S2p 早期 T1 探针                 | 2 h          | 用冻结题集子集验证 180 字符预算与真实报错召回；失败即停止后续批量                                                     |
| S2b 剩余元数据 + 全题门          | 11 h         | S2p 通过后改其余 17 技能，再跑全部 44 题；通过才进入 S4                                                               |
| S3 索引生成                      | 3 h          | 元数据完成可生成候选；S4 改引用后最终同步                                                                             |
| S4 正文试点/批量                 | 26 h         | 试点 4 + 批量约 22；S2b 全题门通过后才能开工                                                                          |
| S7a 内容守恒/召回/收益           | 6 h          | 最终复核，不是候选 T1 的首次验证点                                                                                    |
| S8a 阶段一收尾                   | 4 h          | 格式、范围、证据与快照复读；不自动提交                                                                                |
| **阶段一**                       | **83–88 h**  | A-only 为 83；保留 C 为 88                                                                                            |

| 阶段二步骤   | 工时     | 内容                                    |
| ------------ | -------- | --------------------------------------- |
| S1b 工具扩展 | 6 h      | shingle/指代 4 + T2 2                   |
| S5 参考去重  | 16 h     | 保留公共与差异契约，复核分发形态        |
| S6 切片      | 30 h     | 23 文件；仅门禁通过且获阶段二授权后进行 |
| S7b 全量校验 | 4 h      | T1/T2、B2 收益对照；保留 C 时复验隔离   |
| S7.5 人工/T3 | 6 h      | 5 个固定技能、切片与无切片分支          |
| S8b 收尾     | 4 h      | 最终范围及证据检查，不自动提交          |
| **阶段二**   | **66 h** | 总计 **149–154 h**                      |

按 40 h/人周、误差 ±25% 估算，不含评审、模型等待及 M2 的 5 工作日观察期；不是交付承诺。候选探针与实际还原校验已计入上述工时；保留 C 时总计 154 h，不实施 C 则总计 149 h。C 工时只在 S2p 成功且价值门通过后投入，避免探针前先做可选包装。

### 0.3 阶段一 → 阶段二的门禁（Go / No-Go）

阶段一结束后**不自动进入阶段二**，必须同时满足三条，任一条不满足即停在阶段一并收尾：

| 门      | 条件                                                                           | 依据                                                                   |
| ------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| M1 质量 | S7a 账本与内容断言全绿；T1 两个视角分别达到附录 D 阈值且不低于各自基线         | 证明所测词法视角不回退；不等价于未测宿主或模型保证                     |
| M2 需求 | 5 工作日内 ≥20 个完整真实任务，且平均参考篇数 ≥2 或 ≥15 KB 巨型参考命中率 ≥15% | 维护者确认保留门槛；不足记证据不足，是否延长另行决定，阶段二不自动启动 |
| M3 组织 | 阶段一的评审意见已闭环，且确认愿意承担 `_shared/` 带来的"整树复制"契约         | S5 会改变单技能分发方式，属产品决策而非技术决策                        |

**M2 产品取舍（2026-10-18 维护者明确选择）**：保留 **5 个工作日、至少 20 个完整真实任务**。低频维护可能达不到该数量，这是接受的排期风险；不足时记“证据不足”，暂停阶段二，是否延长观察及延长规则必须另行决定，不自动延长、降门槛或永久否决 S6。不得拆分同一任务、加入演练/合成任务或把 T1/B1/B2 验收任务计入真实需求样本来凑数。

**M2 的采集方式**：静态 `--diff` 只比较语料，不能观察 Agent 读取事件。实施后连续记录 5 个工作日的真实任务；优先人工填写 `ai/plans/skills-load-events.jsonl`，只有宿主提供经用户授权的结构化读取事件时才可导入，不扫描凭据或无关会话。每条记录包含 `{task_id, started_at, outcome, snapshot_hash, complete, reads:[{path, content_hash, read_chars, read_bytes, whole_file, fragments:[{start_line,end_line,hash}]}]}`，只列实际读取的仓库相对路径，不保存用户问题正文。重复读取保留事件，篇数统计按任务内文件去重；只读部分文件时须提供行范围及片段 hash 并按实际片段计成本；缺少片段证据不得把整篇成本估算伪称为实际读取。

未来工具命令 `node tools/skills/measure-tokens.cjs --loads ai/plans/skills-load-events.jsonl --snapshot <snapshot>` 仅聚合显式提供的记录，校验路径、hash 与片段口径；`--diff` 仍仅比较静态体量。分母是观察期内所有记录完整的技能相关任务（含失败和零参考任务）；参考篇数排除 SKILL、索引和共享说明，巨型命中率按“读取至少一篇快照中 ≥15 KB 参考的任务数 / 有效任务数”计算。缺失记录、快照不匹配或少于 20 个完整任务时记为 **证据不足**，不把未记录任务当作零次读取，不进入阶段二；延长观察须另行安排。

**若 M2 不满足或证据不足**：完成阶段一收尾，停止追加实施；收益只按当轮有效任务记录报告，不把设计目标当作已实现结果。满足门禁也不自动授权阶段二。

---

## 1. 现状审计（证据）

### 1.1 结构与体量

| 层          | 对象              | 数量 | 字节      | 占比  |
| ----------- | ----------------- | ---- | --------- | ----- |
| L0 元数据   | 22 份 frontmatter | 22   | 49,540    | 3.4%  |
| L1 技能入口 | `SKILL.md` 正文   | 22   | 106,002   | 7.3%  |
| L2 参考正文 | `references/*.md` | 167  | 1,287,352 | 89.2% |
| —           | `README.md`       | 1    | 441       | 0.03% |

目录形如 `skills/<skill>/SKILL.md + references/*.md`，平铺一级，无 manifest、无索引文件，唯一全局清单是 `cocosair/references/skill-index.md`。

**正面结论：模板一致性很高。** 22 份 `SKILL.md` 中，21 份共享完全相同的 7 个二级标题（`Quick Start` / `Related skills` / `When to use what` / `Contracts` / `Common Mistakes` / `References` / `Canonical docs`），路由器多 3 个（`Routing across boundaries` / `Code First discipline` / `No route matched`）。这是本次优化最有利的前提：可以复用迁移模板，但独有边界与约束仍须逐技能核对。

各章节字节分布（22 篇合计）：

| 章节             | 字节   | 占比  | 评价                                       |
| ---------------- | ------ | ----- | ------------------------------------------ |
| frontmatter      | 49,540 | 31.9% | 严重冗余（见 1.2）                         |
| When to use what | 30,076 | 19.4% | 路由价值高，但 60% 内容可压缩为单行触发词  |
| References       | 20,887 | 13.4% | 目录价值高，描述过长（平均 949 B/篇）      |
| Common Mistakes  | 10,985 | 7.1%  | 清单可留，wrong/right 代码应移到 reference |
| 引言             | 10,646 | 6.9%  | 与 description 重复                        |
| Canonical docs   | 10,101 | 6.5%  | 按包内文档/源码 checkout 分开定位          |
| Contracts        | 10,015 | 6.5%  | 保留                                       |
| Quick Start      | 5,443  | 3.5%  | 已是指针，保留                             |
| Related skills   | 5,016  | 3.2%  | 22 篇几乎同文，可压到 1 行                 |

### 1.2 元数据问题（最关键）

1. **`description` 与 `description_en` 逐字节完全相同：22/22（全部技能，逐个字符串比对相等，无例外）。** 合计 18,741 字符纯重复。任何读取整份 frontmatter 的加载器都要为此付双倍成本。
2. **`description` 平均 852 字符、最长 1,017 字符，紧贴 Agent Skills 规范的 1024 上限。** 结果是"用满额度的长句罗列 API 名"，既不可扫读，也挤掉了触发词/否定边界的空间，还稀释了关键词与向量的匹配精度。
3. **`compatibility` 22 份完全相同**（合计 4,224 字符，单份 192 字符），`license: MIT` 22 份相同，`author` 相同。内容虽重复，但宿主未必继承套件 manifest；保留宿主字段，不能仅凭重复删除。
4. `allowed-tools` 仅两种取值（`Read Edit Write Bash` ×19、`Read Bash` ×3），未按技能真实性收敛。
5. `metadata.keywords` 是 `"Cocos AIR, cocosair.js, rendering"` 这类套件名 + 子系统名，**对检索没有增量信息**（name 已含子系统名）。
6. 缺少三样对路由最有用、但成本极低的信息：**触发短语**、**否定边界（not for）**、**能力标签（owns）**。

### 1.3 正文组织问题

1. **`## When to use what` 用"问题句 -> 答案"形式写成，但答案里混入了 API 名和源码行号**（如 `src/air/rendering/engine-contracts.ts:104`）。这一类内容在"决定是否加载"阶段完全无用，只在"已加载后精确执行"阶段有用 —— 放错了层级。
2. **`## References` 的每行描述 150–200 字符**，实质是把 reference 的首段复制到目录里，目录因此膨胀到 20.9 KB。
3. **`## Canonical docs` 列的是仓库内路径**（`docs/manual/*.md`）。须按安装包实际包含的 docs 与源码 checkout 区分有效路径 —— 应下沉到 `references/context.md`。
4. **`## Related skills` 22 份几乎同文**（都指向 `references/context.md#related-skills`），单份 228 B 可压到 ~80 B。
5. **参考文件存在跨文件样板**：63 篇带同一段 210 字符的 `Derived from the ... reorganized on 2026-10-11` 前言（13,275 B），21 篇带同一段 `Environment:` 说明（7,938 B）。
6. **横切概念重复**：41 篇参考里各有 `Reachability` / `Bundle reachability` / `Capability layers` / `Evidence status` / `Browser verification status` 一类章节，合计 **64,311 B（占参考正文 5%）**，讲的是同一套三层可达性契约。
7. **大文件不可分片**：23 篇 ≥15 KB 的参考占参考总量的 41%，最大 41,393 B（≈10,900 tokens）。全部都有 5–11 个二级标题，天然可切 —— 但当前只能整篇加载。
8. **表格占比极高**：全套 33.9%（489,080 B）是 Markdown 表格，代码块仅 6.7%。说明这套内容的主体是"查表"而非"叙述"，这决定了第 4 节的按需加载策略应当按"问题 -> 表"来切，而不是按"章节"来切。

### 1.4 加载成本模型（现状）

| 场景         | 组成                      | 字节                   | tokens                 |
| ------------ | ------------------------- | ---------------------- | ---------------------- |
| 常驻索引     | 22 × (name + description) | 19,000                 | 5,000                  |
| 路由器       | `cocosair/SKILL.md`       | 10,107                 | 2,660                  |
| 单子系统入口 | 平均 / 最大               | 7,061 / 9,731          | 1,858 / 2,561          |
| 单篇参考     | P50 / 平均 / 最大         | 4,870 / 7,708 / 41,393 | 1,282 / 2,028 / 10,893 |
| 参考分布     | ≥15 KB 的 23 篇           | 530,116                | 139,500                |

现状下**每个任务的固定开销 = 路由器 2.66 K + 入口 1.86 K ≈ 4.5 K tokens**，且路由器的 10 KB 里有 3.5 KB 是三段 wrong/right 代码示例（本可由 reference 承载）。

---

## 2. 技能目录与文件结构调整建议

### 2.1 目标布局

```text
skills/
  manifest.json                 # [P1] 新增：项目工具使用的套件信息与预算，不代替宿主字段
  index.json                    # [P1] 新增（生成物）：22 行路由元数据，供 Agent 与 CI 使用
  INDEX.md                      # [P1] 新增（生成物）：人类可读一屏表格，22 行 × ~90 字符 ≈ 2 KB
  README.md                     # [P1] 改写：方案 A、索引命令及 C 预检/是否保留的分支说明
  _shared/                      # [P2] 阶段二引入；阶段一不存在，但方案 C 仍需处理已有跨技能依赖
    preface.md                  # [P2] 环境定位 + 派生说明（合并 63 段前言 + 21 段 Environment）
    capability-layers.md        # [P2] 三层可达性契约 + 跨技能网格（合并 41 个重复章节）
  cocosair/                     # [P1] 路由器（保留路径，瘦身到 ≤4.2 KB）
    SKILL.md
    references/
      skill-index.md            # [P1] 降级为 ≤20 行 stub，指向 ../../index.json（保留路径防外链断裂）
      skill-index-archive.md    # [P1] 旧索引独有内容归档，只按需读取，不作为路由真源
      common-mistakes.md        # [P1] 新增：承接路由器移出的三段 wrong/right 代码
      context.md  environment.md
  cocosair-rendering/
    SKILL.md                    # [P1] ≤4 KB
    references/
      triggers.md               # [P1] 新增：原 "When to use what" 全文迁入（不删信息）
      quick-start.md  contracts.md  common-mistakes.md  context.md
      lighting-units.md  shadow-matrix.md  render-target.md  color-contract.md
      pipeline-reachability/    # [P2] 由 41 KB 单文件切分为 7 个按主题的切片
        01-default-features.md
        02-name-to-esm-face.md
        03-postprocess-face.md
        04-custom-pipeline-gate.md
        05-legacy-entrypoints.md
        06-binding-ordinals.md
        07-reachability-grid.md
      pipeline-reachability.md  # 20 行索引 stub：每个切片一句话 + 相对链接（旧链接保持可用）
```

### 2.2 硬性规模预算（写进生成器，CI 校验）

口径说明：**"目标"是迁移完成后应达到的设计值；"上限"是 CI 硬门，超出即 FAIL；"现有超标"是迁移前基线，不是当前应满足的标准。** 三者不要混用——迁移期间文件会处于"已达标但未到目标"的中间态，此时只卡上限。

| 文件类型                | 目标（设计值）             | 上限（CI 硬门）                | 现有超标（基线）                               | 生效阶段 |
| ----------------------- | -------------------------- | ------------------------------ | ---------------------------------------------- | -------- |
| `SKILL.md`              | 子系统 3 KB；路由器 4.2 KB | 子系统 4 KB；路由器 4.2 KB     | 22/22 全部超上限（最大 9,731 B，最小 5,183 B） | **P1**   |
| frontmatter             | 1,100 字符                 | 1,400 字符                     | 历史记录平均 2,251 B；字符数待基线采集，不混算 | **P1**   |
| `references/*.md`       | 5 KB                       | 12 KB                          | 23 篇超上限（41% 的参考字节）                  | P2       |
| `index.json` 单技能对象 | 1,200 字符                 | 2,000 字符（紧凑 JSON 序列化） | —（新增；含 refs，不按排版行计量）             | **P1**   |

KB 统一按 1,000 UTF-8 字节；字符按 Unicode code point，frontmatter 包括两个 `---`、LF 与其间全部字段。分隔符含义和计量方式由样板固定；不能通过移除宿主声明去凑预算。附录 A 为阶段一样板，本轮将解析 YAML 并核对样板字符数；22 技能改写与预算门禁留待实施。

### 2.3 明确不建议做的两件事

1. **不要按域建二级目录**（如 `skills/3d/scene-graph/`）。多数宿主只扫描 `skills/*/SKILL.md` 一层，且 `name` 必须与目录名一致；套件内部已有大量 `../../<skill>/SKILL.md` 相对链接，改深度会同时打破发现与链接。域归属用 `index.json` 的 `family` 字段表达即可（建议 4 类：`runtime-core` / `scene-3d` / `ui-2d` / `interaction-media`）。
2. **不要重命名任何 `cocosair-*` 目录**。它们出现在 `README.md`、`AGENTS.md`、`tools/verify/update-capabilities.cjs`、`tools/verify/graphics-package.cjs` 与 npm 包说明中，改名收益为零、破坏面很大。

### 2.4 关于"是否需要精简索引文件"的结论

需要，但要说清 `index.json` 的真实作用：**宿主的常驻索引成本由 frontmatter 决定，不由 index.json 决定。** `index.json` 的价值有三点，与降 token 无直接关系：

- 消灭第三份路由表（`skill-index.md` 17.6 KB），使路由元数据有唯一真源；
- 提供可 diff、可 CI 校验的机器可读清单（路由回归测试的输入）；
- 支持"先读 index 再决定加载"的工作流（本项目自己的 `cocosair` 路由器、以及支持显式索引的宿主）。

真正降低常驻成本的是第 3 节的 frontmatter 规范。

---

## 3. 统一元数据规范

### 3.1 字段字典

| 字段                                                              | 必需         | 预算                | 作用                            | 说明                                                                                                 |
| ----------------------------------------------------------------- | ------------ | ------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `name`                                                            | 是           | ≤32                 | 唯一标识                        | 必须与目录名完全一致（现状已满足）                                                                   |
| `description`                                                     | 是           | **≤180 字符，短句** | 一句话说明"做什么 + 什么时候用" | 必须是 `能力域动词 + 3–5 个核心名词 + 1 个意图短语`；允许少量有区分度的 API/完整错误码，禁止堆砌列表 |
| `when_to_use`                                                     | 是           | ≤5 条，每条 ≤10 词  | 触发条件                        | 用用户会说的话，优先用户症状；必要标识符可留在 description，不能假设 owns 对 host-minimal 可见       |
| `not_for`                                                         | 是           | ≤3 条               | 否定边界                        | 格式 `症状 -> 归属技能`，解决 22 个细粒度技能间的抢答                                                |
| `owns`                                                            | 是           | 3–6 个标签          | 能力标签，供关键词精确匹配      | 原 `keywords` 的替代，必须是区分性术语                                                               |
| `layer`                                                           | 是           | 1 值                | `router` / `subsystem`          | 决定加载优先级                                                                                       |
| `family`                                                          | 否           | 1 值                | 分组导航                        | 仅在 `index.json` 中展开，不参与匹配                                                                 |
| `metadata.version` / `metadata.last-updated`                      | 是           | —                   | 追溯                            | 保持原字段位置、字符串类型及现有值                                                                   |
| `license` / `compatibility` / `allowed-tools` / `metadata.author` | 保留宿主字段 | —                   | 兼容与工具声明                  | manifest 只供项目工具使用，不假设宿主继承；保留 3 个只读技能原 `Read Bash`                           |

删除：`description_en`（与 `description` 完全重复）、`metadata.keywords`（改为 `owns`）。

### 3.2 三条改写规则

1. **名词约束**：`description` 必须包含本技能 3–5 个独占名词（如 rendering 的 `shadow`、`render target`、`MSAA`、`sRGB`、`post-process`）。这是关键词/向量检索的主要命中面。
2. **意图约束**：`when_to_use` 写"症状 + 用户措辞"，不写实现。反例：`resolveAirTextureFormat rules`；正例：`texture looks washed out after load`。
3. **否定约束**：`not_for` 只写会被误判为"应该由我处理"的相邻场景，每条 ≤80 字符，必须带目标技能名。

**预算与召回是待验证的联合约束**：≤180 字符不是已证明可行的前提。description 可保留少量必要的精确 API/错误码（例如 `AIR_E_RENDER_TARGET_SAMPLES`），不得强制全部移出；S2a 试写、S2p 观测其是否在预算内满足阈值。若达不到，先评审预算、技能边界或评测方式，不在 S4 后补救，也不静默放宽阈值。账本搬迁只证明信息仍在，不能证明 host-minimal 仍能召回。

### 3.3 改写示例（文案字符数，不代表召回已验收）

| 技能                 | 现 description 长度 | 新 description（含字符数）                                                                                                                                                         | when_to_use 示例                                                                    |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `cocosair-rendering` | 1,006               | `Rendering: lighting, shadows, render targets, MSAA, sRGB and pipeline reachability. Use for offscreen rendering, missing shadows or AIR_E_RENDER_TARGET_SAMPLES.`（160）          | `no shadows`, `render a mirror to a texture`, `texture washed out`, `can bloom run` |
| `cocosair-math`      | 1,017               | `Math value types and transforms: Vec2/3/4, Mat3/4, Quat, Rect, Color, easing, random. Use for matrix order, Euler vs quaternion, color conversion, interpolation curves.`（168）  | `matrix multiply order`, `quat from euler`, `smooth step curve`                     |
| `cocosair-gltf`      | 732                 | `glTF/GLB loading: extensions, decoder injection (draco/meshopt/ktx2), progress, error codes. Use for a model that will not load, missing textures, or decoder deployment.`（169） | `glb loads black`, `draco decoder 404`, `which extensions work`                     |

`not_for` 示例（rendering）：`material property type errors -> cocosair-materials-effects`；`camera framing or projection -> cocosair-camera`。

#### 3.3.1 完整前后对照（`cocosair-rendering`，新模板须实际计量）

改写前（现状，`description` 原文 1,006 字符，与 `description_en` 完全重复）：

```yaml
---
name: cocosair-rendering
description: "Drives the Cocos AIR rendering contracts in code - legacy forward lighting units with illuminance in Lux, the single mainLight rule for multiple directional lights and inspectAirDirectionalLights, the per-light-type shadow matrix with the four switches a ShadowMap cast needs, offscreen rendering through createAirRenderTarget and camera targetTexture with requested-versus-effective MSAA samples and sampleFallback, the one-per-scene AirTransmissionCapture behind transmission materials, texture format and sRGB decode preflight with resolveAirTextureFormat and validateAirTextureColorContract, and which post-process and custom-pipeline names a Code First app can really reach. Use when lighting looks flat, asking why there are no shadows, rendering a mirror or refraction into a texture, reading back a target's pixels, hitting AIR_E_RENDER_TARGET_SAMPLES or AIR_E_TEXTURE_COLOR, choosing rgba8, rgba16f or hardware-srgb, or deciding whether bloom and other post-processing run without a variant build."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, rendering"
  description_en: "Drives the Cocos AIR rendering contracts in code - ...（与上一行逐字节相同）"
  description_zh: "配置灯光、阴影、渲染目标、MSAA、颜色契约和管线可达性。用于光照、阴影、离屏渲染、读回或后处理问题。"
---
```

改写后（包含宿主声明和中文元数据；frontmatter 预算包含起止 `---` 与换行，按 Unicode code point 计数）：

```yaml
---
name: cocosair-rendering
description: "Rendering: lighting, shadows, render targets, MSAA, sRGB and pipeline reachability. Use for offscreen rendering, missing shadows or AIR_E_RENDER_TARGET_SAMPLES."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - no shadows
  - mirror or refraction to texture
  - texture washed out
owns: [lighting, shadow, render-target, msaa, srgb, post-process]
not_for:
  - material typing -> cocosair-materials-effects
  - projection -> cocosair-camera
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "配置灯光、阴影、渲染目标、MSAA、颜色契约和管线可达性。用于光照、阴影、离屏渲染、读回或后处理问题。"
---
```

信息守恒核算（逐项核对，确保没有"优化掉"内容）：

| 原字段                                                                                                            | 去向                                                                                                                                               | 是否损失                                                                           |
| ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `description` 中的 API 名（`inspectAirDirectionalLights`、`createAirRenderTarget`、`resolveAirTextureFormat` 等） | 原样保留在 `when_to_use`/`owns` 之外的 `## Triggers` 与 `references/triggers.md`（triggers 为未来迁入目标，不代表本轮已存在）                      | 否                                                                                 |
| `description` 中的错误码（`AIR_E_RENDER_TARGET_SAMPLES`、`AIR_E_TEXTURE_COLOR`）                                  | 样板 description 保留完整 `AIR_E_RENDER_TARGET_SAMPLES`；`AIR_E_TEXTURE_COLOR` 及其精确约束通过 ledger 定位到 reference/归档，不以通配符代替精确值 | 否                                                                                 |
| `description_en`                                                                                                  | 删除                                                                                                                                               | 否（原值重复；显式依赖旧字段的外部消费者兼容性仍须核对，不能声称删除后读取值不变） |
| 宿主声明与 `metadata.keywords`                                                                                    | 宿主字段原位保留；manifest 仅为工具默认值；`keywords` → `owns`，独有词项由账本定位                                                                 | 按字段与词项核对                                                                   |
| `description_zh`                                                                                                  | 原位保留 `metadata.description_zh`（中文宿主是否索引须实测）                                                                                       | 否                                                                                 |

关于 `description_zh`：现状 22 份平均 61 字符，成本可忽略，但对中文宿主的召回有实际价值，建议保留。

### 3.4 `index.json` schema（生成物，勿手改）

```json
{
  "generated_from": "skills/*/SKILL.md frontmatter + Reference map",
  "schema": 2,
  "min_compatible_schema": 2,
  "skills": [
    {
      "name": "cocosair-rendering",
      "layer": "subsystem",
      "family": "scene-3d",
      "path": "cocosair-rendering/SKILL.md",
      "description": "Rendering: lighting, shadows, render targets, MSAA, sRGB and pipeline reachability. Use for offscreen rendering, missing shadows or AIR_E_RENDER_TARGET_SAMPLES.",
      "owns": ["lighting", "shadow", "render-target", "msaa", "srgb", "post-process"],
      "when_to_use": ["no shadows", "mirror or refraction to texture", "texture washed out"],
      "not_for": ["material typing -> cocosair-materials-effects", "projection -> cocosair-camera"],
      "metadata": {
        "description_zh": "配置灯光、阴影、渲染目标、MSAA、颜色契约和管线可达性。用于光照、阴影、离屏渲染、读回或后处理问题。"
      },
      "refs": [
        { "file": "references/triggers.md", "answers": "full symptom-to-API map" },
        { "file": "references/shadow-matrix.md", "answers": "which light types cast, four switches" }
      ]
    }
  ]
}
```

`refs[].answers` 从 SKILL 的 Reference map 生成，不是额外手工真源；示例仅展示字段和部分 refs。每个 refs.file 以所属技能目录为基准解析。生成器确定性投影 description/owns/when_to_use/not_for/metadata.description_zh，不能将示例硬编码为另一套元数据。

**路由记录接口（唯一投影规则）**：由 `gen-index.cjs` 内的共享投影函数从指定快照的 frontmatter 构造路由记录；T1/T2 与索引生成复用该函数，不各自拼词表。name、description 为必需字符串；owns、when_to_use、not_for 缺失时为 `[]`，metadata.description_zh 缺失时为 `""`。新索引必须显式输出上述字段，中文值原样来自 metadata.description_zh，不改名、不从正文补齐。原始基线直接解析冻结 frontmatter，不要求旧语料先有 index.json 或新 Reference map。候选索引中的路由字段必须与其快照投影逐字段一致；refs/family/layer 不参与路由评分。

### 3.5 消费方与 schema 演进

`index.json` 只有三个消费方，边界必须写清，否则会退化成"第四个需要同步的手工清单"：

| 消费方                                            | 用途                                                       | 读取方式                                                      | 容错要求                                              |
| ------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------- |
| `tools/skills/*.cjs`（CI）                        | `--check` 比对生成结果；校验索引路由字段与快照共享投影一致 | 全量解析                                                      | 严格：新索引必需路由字段缺失或与快照投影不一致即 FAIL |
| Agent（本项目 `cocosair` 路由器、支持索引的宿主） | 先读索引后决定加载，替代 `skill-index.md`                  | 只读 `name` / `description` / `owns` / `when_to_use` / `path` | 宽松：忽略未知字段                                    |
| 外部工具（编辑器插件、文档站）                    | 生成技能列表                                               | 只读 `name` / `description` / `family` / `path`               | 宽松：忽略未知字段                                    |

演进规则（写进 `gen-index.cjs` 的校验，防止"改一个字段炸一个消费方"）：

1. **只增不改语义**：新增字段必须可选，且旧消费方忽略后行为不变；改名视为破坏性变更。
2. **版本双字段**：`schema`（生成物当前版本）与 `min_compatible_schema`（仍能正确解读的最低版本）。消费方读到 `schema > 自己支持的上限` 时降级为"只用 `name`+`description`"，不报错。
3. **升级流程**：`schema` 提升必须伴随 `tools/skills/verify-meta.cjs` 的校验同步与一次全量 `--check`，不允许"生成器先升、校验后补"。
4. **不写时间戳**：生成物必须确定性，否则 `--check` 恒 FAIL（现状 `last_updated` 来自 frontmatter，可接受；不得注入 `generated_at`）。

---

## 4. 按需加载策略

### 4.1 加载矩阵

| 层   | 内容                                    | 何时加载                                 | 目标体量                                    | 阶段                                              |
| ---- | --------------------------------------- | ---------------------------------------- | ------------------------------------------- | ------------------------------------------------- |
| L0   | 宿主索引字段（默认 name + description） | 宿主发现技能时                           | 按实际渲染字段计量；不是整个 frontmatter    | P1                                                |
| L0.5 | `INDEX.md` / `index.json`               | 仅当需要跨技能判断归属，或 L0 命中不唯一 | INDEX.md 约 2–3 KB；JSON 按实际体量记录     | P1                                                |
| L1   | `SKILL.md`                              | 已确定技能，需要执行规则                 | 子系统 ≤4 KB；路由器 ≤4.2 KB                | P1                                                |
| L2   | `references/<topic>.md`                 | 需要精确值/表/错误码                     | 5 KB 均，≤12 KB                             | P1（阶段一**不拆**，23 篇 >12 KB 仍超预算，见下） |
| L2.5 | `references/<topic>/NN-*.md`            | 大主题的单个切片                         | ≤6 KB                                       | **P2**                                            |
| L3   | `_shared/capability-layers.md`          | 只在回答"这个能力能不能用"时             | 目标约 10 KB，硬门 ≤12 KB；超出须按主题拆分 | **P2**                                            |

**阶段一的已知缺口**：阶段一不拆分或批量去重现有参考，仅允许 S4 的迁入、归档与路径修复，因此 23 篇 ≥15 KB 的文件（最大 41 KB）仍是"整篇加载"，L2 的 12 KB 预算在阶段一无法满足。这是刻意接受的范围限制——阶段一的收益来自固定开销，不来自参考粒度；若 M2 门禁判定不做阶段二，则 L2 预算应正式改为"阶段二目标"，避免门禁长期 red。

停止规则（写进 `SKILL.md` 顶部，抑制过度加载）：**"加载到能回答当前问题的最小切片即停止；不要为同一问题加载同主题的另一篇参考。"** 现状缺失该规则，22 篇 `Related skills` 反复强调"not a recursive load list"，说明作者已意识到问题，但只在散文里提示、未形成可执行约束。

### 4.2 SKILL.md 正文：留、移、压

| 章节                           | 处置                                                                                                              | 目标         |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------ |
| 引言（483 B/篇）               | **压**：删去与 description 重复的能力罗列，只留"本技能边界"一句                                                   | 120 B        |
| Quick Start（247 B/篇）        | **留**（已是指针）                                                                                                | 220 B        |
| Related skills（228 B/篇）     | **压**为 1 行：`Siblings: see references/context.md#related-skills`                                               | 80 B         |
| When to use what（1,367 B/篇） | **移**到 `references/triggers.md` 全文；SKILL.md 只留 8 条单行触发（≤12 词）                                      | 迁移 + 480 B |
| Contracts（455 B/篇）          | **留**，这是"必须遵守的硬约束"，是 SKILL.md 存在的核心理由                                                        | 400 B        |
| Common Mistakes（499 B/篇）    | **压**为 `[HIGH] 一句话` 清单（现状已是清单），wrong/right 代码全部移入 `references/common-mistakes.md`（已存在） | 250 B        |
| References（949 B/篇）         | **压**为"问题 -> 文件"一行一条（≤90 B/条）                                                                        | 500 B        |
| Canonical docs（459 B/篇）     | **移**入 `references/context.md` 的 `## Canonical docs`                                                           | 0 B          |

路由器 `cocosair/SKILL.md` 额外处理：三段 wrong/right 代码示例（约 3.5 KB）移入新建的 `references/common-mistakes.md`，SKILL.md 保留三行 `[HIGH]` 摘要。路由器从 10,107 B 降到 ~4,200 B。

**执行档：Profile A（保留 D1 的模型前提）**

- 路由器**继续按现有文档流程常驻**，只把它从 10.1 KB 压到 4.2 KB（−58%）。不依赖宿主是否支持 `index.json`，此为成本模型前提，收益仍须按完整读取清单重算；
- `index.json` / `INDEX.md` 仍要生成，用途是**消灭第三份路由表 + 提供 CI 单一真源 + 支持歧义时按需查询**，不单独预记节省；实际读取时按 §7.1 计入成本；
- Profile B（路由器降级为 fallback）已评估并**不采用**：其前提（宿主会读索引）无法从仓库内验证，忽略必需读取会高估收益，因此不按该前提预记节省。若日后实测确认宿主行为，再作为独立变更提出，不与本轮混做。

### 4.3 需要拆分的大文件（阶段二，实测 23 篇，41% 的参考字节）

按"一个问题一个切片"切，切片名用两位序号保证顺序稳定、diff 可读：

| 文件                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 现状            | 二级标题数 | 建议切片                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `rendering/references/pipeline-reachability.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 41,393          | 7          | 7 片（默认特性集 / 名字到 ESM 面 / postProcess / 自定义管线门 / legacy 入口 / 绑定序号 / 可达性网格） |
| `math/references/easing-random.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | 39,218          | 10         | 至少 7 片，按 easing 族 / 参数语义 / 随机分布 / 位运算再细分，逐片满足 6 KB                           |
| `math/references/transforms.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | 31,085          | 6          | 至少 6 片，按乘法顺序 / 局部-世界 / 法线变换再细分                                                    |
| `rendering/references/color-contract.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                            | 30,893          | 9          | 至少 6 片，按格式解析 / sRGB 集合 / 校验拒绝 / 行序与 UV 再细分                                       |
| `math/references/value-types.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | 29,962          | 7          | 至少 5 片，新增前提说明后可能需 6 片                                                                  |
| `scene-graph/node-ops.md`、`camera/camera-projection.md`、`gltf/extensions-matrix.md`、`application/startup-errors.md`、`application/app-options.md`、`gltf/diagnostics.md`、`gltf/loader-api.md`、`materials-effects/defines.md`、`assets/atlas.md`、`scene-graph/node-events.md`、`materials-effects/property-types.md`、`camera/screen-world.md`、`materials-effects/custom-glsl.md`、`assets/bmfont.md`、`gltf/decoders.md`、`rendering/render-target.md`、`primitives-mesh/mesh-attributes.md` | 15.7 K – 26.3 K | 5–11       | 至少 3–5 片，按实际标题块大小调整                                                                     |

拆分后**必须保留原文件路径为 stub**：20 行以内，每行是"切片主题 + 相对链接"。这样 `AGENTS.md`/`index`/`skill-index` 里已有的 200+ 条相对链接一条都不会断。

#### 4.3.1 切片命名与引用约定

**命名**

- 目录：`references/<原文件名去扩展名>/`（如 `references/pipeline-reachability/`），与原文件同名，便于反查。
- 切片：`NN-kebab-topic.md`，`NN` 从 `01` 起两位递增，`topic` 用小写连字符，长度 ≤24 字符。
- **序号只保证稳定排序，不承载阅读顺序语义**。新增切片追加到末尾，**不重排已有编号**——重排会让 git diff 全量变红，且使外部书签失效。阅读顺序由 stub 的列表顺序表达。
- 禁止三层以上嵌套（`references/a/b/c.md`），切片只能位于 stub 对应的直接子目录，不再嵌套。

**跨切片引用**

| 场景         | 约定                                                                                                                          | 反例（禁止）                         |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 引用另一切片 | 用完整相对链接 + 目标 H1 标题作链接文字：`[Binding ordinals](../pipeline-reachability/06-binding-ordinals.md)`                | `见上一节`、`见上文矩阵`、`如前所述` |
| 引用自身前文 | 允许，但必须指向本节内的 H2 锚点，且**跨切片一律禁止依赖位置**                                                                | `见本切片第 2 节`                    |
| 上下文承接   | 每个切片首两行必须自述前提：`Applies to: custom-pipeline effects on the default bundle. Requires: 04-custom-pipeline-gate.md` | 直接以表格开头、无前提说明           |

**相对指代判定（S7b 复用本规则）**：切片是独立加载单元。`verify-lossless.cjs` 扫描正文、标题与表格中的 `上一节|上文|如前所述|see above` 等词，仅生成候选位置，不直接判 FAIL。同文件指代须落到可解析的本文件 H2 锚点；跨文件指代须改为明确目标链接；仍无法定位目标的候选才 FAIL。fenced code、inline code，以及账本以源位置/hash 标识的原文证据引用不作为导航指令，记录排除依据后跳过，不能把普通说明改成引用来绕过检查。人工确认候选分类，报告保留位置、目标或排除理由。

**新内容归属决策树**（维护期唯一判断路径，写进 `skills/README.md`）

```text
新内容进来
├─ 是否回答的是某个已存在切片的问题？
│   ├─ 是 → 追加到该切片，并检查是否超 6 KB；超则按问题再切
│   └─ 否 → 继续
├─ 是否引入新的问题域？
│   ├─ 是 → 新建 NN+1 切片，并在 stub 中加一行（一行一个链接，顺序即阅读序）
│   └─ 否 → 继续
└─ 是否同时属于两个问题域？
    ├─ 是 → 拆成两处陈述，互相链接；不做"混合切片"
    └─ 否 → 内容不足以独立成篇，合并进最接近的切片并补一句交叉链接
```

**是否需要 `slice-index.json`**：不需要。stub 文件本身就是索引（它是唯一入口、必须存在、且被 `SKILL.md` 与 `index.json` 同时引用）。新增一个并行的 `slice-index.json` 只会多一处需要同步的状态，与 3.5 节的"单一真源"原则冲突。切片间的机器可读关系由 `index.json` 的 `refs[]` 递归展开表达，需要时由 `gen-index.cjs` 从 stub 生成。

**维护成本评估口径**：23 篇的切片数必须按实际内容和 6 KB 硬门重算；不能仅凭 H2 数量承诺每片大小。切片后，单次修改的定位成本主要取决于 stub 的一行描述质量，而非切片数量。因此 stub 描述必须是"问题 -> 一句话答案域"，不允许写成章节名。

### 4.4 跨文件去重（阶段二，信息不删，只归一）

| 重复内容                                                     | 现状                     | 目标                                                                    |
| ------------------------------------------------------------ | ------------------------ | ----------------------------------------------------------------------- |
| 派生前言（`Derived from the ... reorganized on 2026-10-11`） | 63 篇 × 210 B = 13,275 B | `_shared/preface.md` 一份（~600 B）+ 每篇一行链接（~60 B）              |
| 环境说明（`Environment: ...`）                               | 21 篇 × 378 B = 7,938 B  | 并入 `_shared/preface.md`                                               |
| 三层可达性 / 证据状态章节                                    | 41 篇，64,311 B          | `_shared/capability-layers.md`（~10 KB，含跨技能网格）+ 每技能 1 行结论 |

去重后的净体量与实际收益必须按迁移后的完整语料重新统计。参考内固定前缀变短可能降低读取量，但任务若还需读取共享说明，其成本必须计入 §7.1 的总量，不能只计算原文件缩短部分。

### 4.5 已评估但不采用：把"表"改为脚本查询

实测全套 33.9% 是 Markdown 表格、6.7% 是代码块。若把纯数据表（错误码、序数、选项矩阵、扩展支持矩阵）转为 `references/_tables/*.json`，并提供 `node skills/cocosair/scripts/lookup.cjs <table> <key>`，则"查一个错误码"从加载 3–10 KB 变为一次命令 + ~200 tokens。

- 收益：可达 −25~35% 的参考加载量
- 代价：新增运行时依赖（部分技能 `allowed-tools` 仅 `Read`）、表格可读性下降、生成链变长、审查成本上升
- **结论：本轮不采用**（不属于阶段一/阶段二）。原因：它把"文档问题"变成"工具链问题"，当前优先解决文档加载粒度，不引入运行时查询耦合。不能用尚未验证的收益认定当前边际价值；未来是否值得单点查询须另据实际成本评估。若日后确有单点痛点，只对 `startup-errors.md`（22,969 B，纯错误码表）做单点试点，不做体系化改造。

---

## 5. 迁移步骤（未来授权后的实施规格）

约束：未来实施仅做已授权的搬迁、改写与生成，内容去向由账本核对；每阶段保存独立快照。任何提交另行授权，本轮只修改本计划书。

### S0a / S0b 基线与护栏（含 S0r，共 5 h）

以下命令仅为未来实施步骤，本轮不执行。S0a 在工具开发前冻结技能文件清单、内容 hash、未提交/未跟踪文件和原始字节快照；`HEAD` 仅为辅助标识，不能代替脏工作区快照。S1a 只新增工具，不改技能；S0r 实际还原校验通过后，S0b 先核定并冻结 D.1 的主责标签，按 §3.4 共享投影采 T1 双视角基线，并按 §7.1 冻结 B1/B2 协议、完成两个原始对照；上述证据齐备后才允许 S2a，S4 还须等 S2p/S2b 的候选门通过。T2 在阶段二 S1b 就绪后分别对同一冻结原始语料与新候选执行，模型与参数固定；阶段一不依赖 T2。

```bash
git rev-parse HEAD                                     # 记录基线 commit
node skills/cocosair/scripts/check-paths.cjs           # 现状应为 PASS
node skills/cocosair/scripts/check-paths.cjs --selftest # 校验器自检（不落盘）
npx prettier --check "skills/**/*.md"                  # 现状必须 PASS

# 确认 skills/ 是否在 prettier 门内（本步不可省）
grep -n "skills" .prettierignore || echo "NOT_IGNORED: skills/ 在格式化门内"  # 期望输出 NOT_IGNORED
grep -n '"\\*\\.md"' .prettierrc.json                  # 期望命中 overrides（proseWrap: preserve）
```

**历史结论（2026-10-17，本轮未复跑全套）**：`.prettierignore` **未排除** `skills/`，且 `npx prettier --check "skills/**/*.md"` 对 190 个文件输出 `All matched files use Prettier code style!`。因此：

- `skills/` **在格式化门内**，迁移产出的每个 md 都必须过 `--check`；
- markdown 的 overrides 是 `tabWidth: 2`、`proseWrap: "preserve"`、`embeddedLanguageFormatting: "off"` —— 散文不会被重排，但**表格列对齐会被规范化**，所以"搬一段表格"也会产生 diff，评审时应按内容而非按行判断；
- 迁移期间**不要**对 `skills/` 跑全量 `--write`（会与内容搬移动叠加，diff 不可评审），只对被改动的文件逐个 `--write` 后 `--check`。

未来基线文件存于 `ai/plans/`；冻结原始字节快照放实施时明确指定的独立目录，以完整文件清单/hash 绑定，不提交整套副本，也不覆盖已有文件。产出两份静态/路由基线与 §7.1 的 B1/B2 原始任务记录（缺一不可）：

| 文件                                  | 内容                                                                                                    | 用途                            |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------- |
| `ai/plans/skills-token-baseline.json` | 22 技能的 frontmatter/正文/参考字节数与 token 估算；L0/L1/L2 汇总                                       | S7 收益对比的分子分母           |
| `ai/plans/skills-route-baseline.json` | 44 条已核定主责的 prompt × T1 两视角排名/分数；记录来源证据、语料/共享字段投影/题集 hash；T2 阶段二另存 | S7 路由回归的对照基线，见附录 D |

### S0r 原始快照实际还原校验（计入 S0a，不新增独立阶段）

S0a 先冻结快照及清单；S1a 的 verify-lossless 还原支持就绪后、任何技能改写前执行一次真实还原。未来命令为 `node tools/skills/verify-lossless.cjs --restore-check <snapshot> --out <new-empty-dir>`：输出必须是明确指定的新建空隔离目录，不得指向工作区或覆盖已有数据。按冻结清单还原全部文件（包括原未提交/未跟踪技能文件）；不执行还原出的代码，不跟随越界符号链接，异常文件类型先阻塞并说明。

还原完成后，重新从输出盘上枚举相对路径并逐文件读取，比较路径集合、文件数、原始字节数及 SHA-256；要求与冻结清单逐字节等价，缺失、多余、改写均 FAIL。不能仅信复制返回值或内存中已缓存的数据。保存原清单/hash、还原盘上清单/hash、差异列表、退出码及记录路径；写出报告后复读确认。G8 使用这份实证及收尾时源快照清单/hash 的复读结果，快照不变时不无故重复完整还原。还原产物为临时证据，不进 npm，不提交；清理只能限定该次新建目录，不能清理源工作区。

### S1a 建工具（阶段一，六文件，23–28 h）

新增 `tools/skills/`，先只读后写入：

| 文件                   | 作用                                                           | 模式                                                | 阶段            |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------- | --------------- |
| `lib/md-parse.cjs`     | frontmatter/标题树/链接/fence 解析，供其余脚本复用             | 库                                                  | P1              |
| `measure-tokens.cjs`   | 按层统计字节与 token，输出 JSON + 与基线差值                   | 只读                                                | P1              |
| `verify-meta.cjs`      | 校验字段、预算、`name` 与目录名一致、`description_en` 不得复现 | 只读                                                | P1              |
| `gen-index.cjs`        | 必需生成索引及只读闭包分析；C 保留后才实现 bundle              | --check / --write / --analyze-bundle；可选 --bundle | P1              |
| `verify-lossless.cjs`  | P1 迁移账本、块/表格/正文与元数据守恒；P2 扩展 shingle 与指代  | P1 内容校验只读；--restore-check 显式写隔离输出     | **P1，P2 扩展** |
| `route-regression.cjs` | P1 双视角 T1；P2 扩展 T2 适配、结构化排名校验                  | 只读                                                | **P1，P2 扩展** |

要点：

- `gen-index.cjs` 必须确定性输出（字段顺序固定、无时间戳）；`--check` 比对工作区与生成结果，索引仅由 `--write` 写入，bundle 仅写显式产物目录；
- **先做闭包价值预检，再决定 C**：S1a 的只读模式 `--analyze-bundle <skill> --root <skills>` 按 S5 的同一链接规则分析 rendering、math、verification 三个固定代表入口；不复制、不改链接。记录入口、全树/闭包技能数、导航目标、文件数与字节比例，原始结果保留，不用主观“看起来更小”决定。
- 产品门槛预先固定：任一代表入口闭包字节 ≤全树的 80%，且闭包完整、能说明独立分发的实际用途，才保留 C；三者均含 ≥21/22 技能且字节 ≥全树的 95% 时，视为近似整树，**裁撤 C**。介于两者或尚无独立用途证据时也默认只交付 A；以后确需 C 再单独立项，不占本轮 5 h 可选工时。不因 C 被裁撤删除必要链接。
- C 保留分支：S2p 通过后再投入额外 5 h，实现 `--bundle` 与仓库外隔离验收；不阻塞 S2a 的 T1 探针。不保留分支：不实现/不宣传 `--bundle`；README 声明仅整树复制，G3/DoD 按 A 分支验收，保留闭包分析报告和裁撤理由。分支选择写入实施账本，不将两种模式混报。
- 六文件与 G4/G5 工具均在 P1 交付，默认工时 23 h、保留 C 后 28 h。S0r/S0b 完成后才允许改技能；两种分支的原始快照还原支持相同。

### S2a / S2p / S2b 元数据迁移与早期可行性（合计 16 h）

**S2a（3 h）**只试写五技能的元数据：cocosair-rendering、cocosair-application、cocosair-gltf、cocosair-materials-effects、cocosair-project-setup；正文保持原样。五技能固定含报错密集的 rendering/application，不因观测成绩调整名单。

0. 新建 `skills/manifest.json`，只作为项目生成器的套件信息，不作为宿主继承协议。记录规范版本与预算，不用默认写权限覆盖各技能原工具声明。
1. 记录 `metadata.description_en` 与旧 description 的相等证据后删除；原文信息按 ledger 保留。字段消费者兼容性单独核对，不把内容重复等同于字段删除无影响。
2. `description` 改写为 ≤180 字符（按 3.2 三条规则逐技能人工改写 + `verify-meta.cjs` 卡上限）。
3. 新增 `when_to_use`（≤5 条）、`not_for`（≤3 条）、`owns`（3–6 个）；删除 `metadata.keywords`。
4. 原位保留 `license` / `compatibility` / `allowed-tools` / `metadata.author` / `metadata.version` / `metadata.last-updated`；不假设宿主读取 manifest。
5. 保留 `metadata.description_zh` 一行（中文宿主召回用，平均 61 字符，成本可忽略）。

**S2p（2 h）**在五份候选元数据后、剩余 17 技能与任何 S4 正文批量之前跑 T1 探针。用 S0b 冻结的同一 44 题，选择 gold 属于上述五技能的全部题作为探针集（包含 5 条 gold 题、所有归属这五技能的 boundary/real-error）；S0b 冻结探针 ID/hash，至少含 rendering 与 application 各一条真实错误题。若原题集不具备这些来源，须先在评分前按 D.1 审核补足原 10 条错误题的覆盖，不增加题量或事后换题。

排名仍在 **全部 22 技能**上计算：五份候选替换对应基线元数据，其余 17 份保持冻结原样，不能只在五分类中评测。host-minimal 与 suite-extended 分别要求探针 N 条 top-1 ≥ceil(0.85×N)、top-3 全命中、boundary 的 gold 在 reject 前，且各指标不低于相同探针的原始基线。分组报告真实错误题的排名和有效命中词；无词法命中仅靠并列排序碰巧进入前三须标为无有效召回并阻塞探针，不能当作解决了精确错误串问题。本次改写的五份 description/完整 frontmatter 同时满足预算；另 17 份只作原始竞争候选，不提前要求其达到新元数据预算。

**混合语料的假阴性风险**：此时五份短 description 与另外 17 份原始长 description（历史均值约 852 字符）竞争；BM25 的词项覆盖和长度归一化均可能改变相对排名，探针失败不等于最终全短候选必然失败。先查看误判竞争者是否来自这 17 份、其命中词、文档长度及评分变化，区分精确错误词缺失、主责混淆与疑似混合态影响，再决定修正文案还是评审预算/验证路径。仅凭长描述排名靠前不能断定伪影；删掉 17 个竞争者后的五分类通过也不能充当证据。无法判别时记“混合态可行性未定”，保留原失败，不自动放行；若评审决定以全短候选进一步诊断，应另行明确受限元数据试写范围，禁止提前做 S4 或可选 C，最终仍须完整 22 技能/44 题门通过。

任一门失败即停止常规 S2b/S4/可选 C；先完成上述混合态原因诊断，再按 D.4 修正至多两轮并保留失败。仍不可行或证据不足则返回方案评审，准确区分“180 字符 × 当前阈值存在实际冲突”与“混合态尚不能代表最终态”，不能直接把探针 FAIL 判为整个方案不可行。不直接增字、降阈值或挪题取得 PASS。五技能探针只能早期排雷，不能代替全量结论。

**S2b（11 h）**在探针通过后改其余 17 份元数据，随后用完整 22 技能候选跑全部 44 题。必须同时通过 G1/G2 的元数据部分与 G5/D.2 的全量双视角阈值，才允许 S4 开工。S7a 保留最终复跑，负责检查正文/索引完成后未引入回退，不再作为首次候选验证点。全过程不执行运行时功能迁移。

### S3 生成索引并降级旧清单（阶段一，3 h）

1. `node tools/skills/gen-index.cjs --write` → `skills/index.json`、`skills/INDEX.md`。
2. `skills/cocosair/references/skill-index.md` 正文替换为 ≤20 行 stub（指向 `../../index.json`），**保留文件路径**，避免 `cocosair/SKILL.md` 与外部链接 404。
   - **锚点范围**：历史检查记录为 0 个标题；这只能说明未发现标准标题锚点，不能证明所有外部书签不存在。实施时保留路径并检查仓库内实际锚点引用，外部引用支持范围写入兼容说明。
   - 即便如此，stub 仍保留表格前 3 行（`cocosair`、`cocosair-project-setup`、`cocosair-application`）作为人读兜底，其余指向 `index.json`，使"打开旧路径的人"看到的是索引而非空白。
3. 更新 `skills/README.md`：索引由 frontmatter/Reference map 生成；默认整树复制；只有 C 保留分支才提供依赖闭包 bundle，不能只手工附带 `_shared/`。

校验：`gen-index.cjs --check` PASS；`check-paths.cjs` PASS。

### S4 SKILL.md 瘦身（阶段一，26 h，按 4.2 表）

按 21 篇统一模板逐篇执行，顺序建议：先 1 篇试点（`cocosair-rendering`，体量最大、问题最典型）→ 复核 → 批量。

每篇的固定动作：

```text
1) 原 "## When to use what" 全文 -> references/triggers.md（新建）；按新目录重算相对链接，SKILL.md 留最多 8 条单行触发
2) 原 "## Canonical docs" 全文 -> references/context.md 末尾同名小节；同步重算路径
3) "## Related skills" -> 一行指针
4) "## References" -> "问题 -> 文件" 一行一条（≤90 字符/条）
5) "## Common Mistakes" 的 wrong/right 代码 -> references/common-mistakes.md；摘要及原限定词通过账本与正文归档保留
6) 引言只删已在新语料中有明确去向的重复陈述；独有信息原样迁入 context，不凭“看起来重复”删除
```

校验：子系统 `SKILL.md` ≤4 KB、路由器 ≤4.2 KB；每篇的所有相对链接在 `check-paths.cjs` 下 PASS；`references/triggers.md` 内容按迁移账本核对；相对链接先解析成同一逻辑目标再比对（见 S7a）。

### S5 参考文件去重（阶段二，分发沿用已选择的 A 或 A+C）

1. 新建 `skills/_shared/preface.md`，写入合并后的环境定位与派生说明。
2. 删除 63 篇参考的 210 字符前言、21 篇的 `Environment:` 段落，替换为一行 `[Environment](../../_shared/preface.md)`。
3. 新建 `skills/_shared/capability-layers.md`，汇总 41 个可达性/证据章节的公共契约，并保留一张"技能 × 层"矩阵承载各技能差异；各篇只留 1 行结论 + 链接。

**分发方案：A 默认整树；C 仅在 S1a 价值预检通过时保留，不采用 B 手工内联。**

A 保留完整 `skills/` 目录结构。C 的“单技能”表示指定一个入口，不承诺包内只有一个技能；现有 `context.md` 已有环境说明与兄弟技能链接，闭包可能覆盖全套；若预检近似全树，按 S1a 裁撤 C，不为没有增量价值的复制器付费。若已保留 C，但阶段二新增链接使其退化，也须披露当前体量，不能继续宣传体积优势；恢复或重做 C 不能自动扩展本轮工时。

以下仅是 **C 保留分支** 的生成规格；A-only 不实现该模式。`gen-index.cjs --bundle <skill> --out <dir>` 必须遵循：

1. 布局为 `<out>/skills/<name>/...`，套件清单/索引放 `<out>/skills/`，P2 共享文件放 `<out>/skills/_shared/`。入口与源树层级相同，优先保持相对链接；不使用全局字符串替换链接前缀。
2. 从入口目录全部 Markdown 的本地导航链接（含引用式链接）计算传递闭包。若目标属于兄弟技能，纳入该技能目录并继续遍历；若目标为套件索引/共享文件，纳入并继续遍历。循环按规范化路径去重。动态占位符、外部 URL、源码溯源字符串按现有校验器分类，不因“可选”而忽略真实导航链接。
3. 本地链接目标必须存在且留在产物根内；不跟随符号链接逃逸，不依赖源工作区的兄弟目录。遇到无法包含的必需本地资源应失败并列出目标，不删除链接或降低校验。路径解析用于闭包收集，最终链接有效性仍复用 `check-paths.cjs.inspect()`，不另造一套链接有效性判定。
4. bundle 清单记录入口、所含技能、文件源相对路径、源/产物 hash、必要链接改写映射与总字节数。复制正文不改事实或内联公共段落；确需重写的链接按解析后的目标计算并登记。
5. 自校验同时要求 `inspect(<out>/skills)` PASS，以及闭包清单目标全部解析到产物根内。将产物复制到仓库外的临时目录进行同样检查；校验器从源仓库调用但只能读取隔离产物根。仅在原树中执行 `--root=<单技能目录>` 会借用树外文件，不能证明自包含。
6. 源清单、产物 hash 和隔离检查都通过后才认可产物；失败保留诊断，不留下可误用为成功的最终目录。产物不提交、不进 npm 包，默认输出 `dist/skills/`；未来实施才按实际需要更新 `.gitignore`。

README 按分支说明：A-only 仅支持保留整树结构，不提供单技能 bundle；C 保留时才说明指定入口用 bundle、可能含兄弟技能及实际体量。两种分支都不允许手工拼接 `_shared/`。工具工时按闭包实现估算，不再使用“+60 LOC”或“阶段一纯复制”的承诺。

### S6 大文件切片（阶段二，23 篇，按 4.3 表）

每篇的动作：按二级标题切成 `references/<topic>/NN-*.md`；原路径改为 stub（≤20 行）；更新 `SKILL.md` 的参考映射与 `index.json` 的 `refs[]`。

校验：按账本核对原内容在切片/共享归档中的去向；分别报告切片、stub、新增前提说明的字节，不用“原文 − stub”公式判定守恒；原文件的每个二级标题在切片中恰好出现一次（`verify-lossless.cjs` 校验）。

### S7a 阶段一：迁移账本 + 双视角 T1（6 h）

必须交付 `verify-lossless.cjs` 的 P1 模式，不能用约 40 行临时脚本代替正式门禁。原始基线取 S0a 冻结快照，涵盖原工作区的未提交/未跟踪技能文件；不能只读 `git show HEAD`。

账本 `ai/plans/skills-migration-ledger.json` 按源文件/块标识记录 `{source, source_hash, kind, destinations, operation, link_map, review}`。正文、表格、代码、元数据和索引表都要有去向；允许 move、deduplicate、summarize，但摘要不能充当唯一原信息副本。压缩入口与旧索引时，将独有原文/行数据归档到对应 reference 或 `skills/cocosair/references/skill-index-archive.md`；归档只按需加载，不作为常驻路由真源，也不重新引入第二份手工路由表。

| 断言           | 通过条件                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| 账本完整性     | 所有被删除/修改的原块和字段都有目标；合并去重须指出语义等价的保留块，禁止空目标或未审核例外                                |
| 标题与结构     | 按源块映射检查；标题允许在 ledger 中登记改名，不要求新旧文件逐文件标题集合完全一致                                         |
| 代码与表格内容 | 代码正文 hash 不变；表格比较规范化单元格内容和行的多重集合，不只数行；允许跨文件搬移，重复次数变化须有去重映射             |
| 散文与限定词   | 原散文逐块在目标可还原；仅忽略排版空白、表格对齐和已登记的链接改写；独有陈述原样归档，`only/must/never/not` 等不得静默丢失 |
| 元数据与索引   | 既有权限/环境/版本字段保持契约；描述中的独有 API、错误码与限制定位到保留正文；`verify-meta` 和 `gen-index --check` PASS    |

搬迁路径先解析到原逻辑目标，再按目标文件位置重写；如 SKILL 中 `references/lighting-units.md` 搬到 `references/triggers.md` 后应为 `lighting-units.md`。只对账本内链接作目标等价规范化，不能 blanket 删除所有链接再计算 hash。

另跑 T1 `host-minimal` 与 `suite-extended`，阈值及基线比较见附录 D。抽检 rendering 与路由器：导航内容正确、常见问题覆盖、压缩摘要未改变限定词。报告称“已完成账本覆盖和内容检查”，不将少量自动断言宣称为数学上的语义零损失证明。

### S7b 阶段二：全量无损 + T2（4 h）

扩展 P1 已有脚本；重新比较 S0a 原始语料与最终候选，保留 P1 账本并追加 S5/S6 的映射。共享契约按每技能可达的 `_shared/` 内容参与核对，不能因移出技能目录而误报，也不能用其他技能相似文字掩盖本技能差异。

| 断言         | 通过条件                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| P1 内容守恒  | S7a 所有断言继续通过；共享去重和拆片按账本跨文件聚合，旧表格每个单元格与技能差异有明确去向                                               |
| 散文辅助指纹 | 对账本允许的链接/排版规范化后，8-word shingle 召回 ≥0.97；输出缺失项逐条审核。它是辅助检查，不能证明 3% 丢失无害，也不能替代 P1 内容守恒 |
| 相对指代     | 统一按 §4.3.1：词项命中只生成候选；检查真实导航目标及排除依据，未解决的跨片/无目标指代才 FAIL                                            |
| 路由回归     | 重跑双视角 T1；T2 对冻结原始语料与候选采用相同模型、参数、提示和字段投影，保存三次有序 top-3 原始输出；遵循附录 D                        |

### S7.5 人工验收（阶段二，抽检 5/22，23%）

自动断言只覆盖已定义的内容/映射检查，语义与可用性仍需人工核对。抽检按"体量 + 风险"选样，固定 5 个技能：

| 抽样 | 技能                     | 选取理由                                                        |
| ---- | ------------------------ | --------------------------------------------------------------- |
| 1    | `cocosair-rendering`     | 体量最大、切片最多、路由器外最复杂                              |
| 2    | `cocosair-math`          | 表格密度最高（easing/transforms 共 70 KB）                      |
| 3    | `cocosair`（路由器）     | 唯一 `layer: router`，降级路径的核心                            |
| 4    | `cocosair-verification`  | frontmatter 最小（1,312 B），压缩空间小，检验"过度瘦身"风险     |
| 5    | `cocosair-2d-subsystems` | 引用最多域（Spine/DragonBones/TiledMap/Particle），检验跨域边界 |

每个抽样技能执行 6 项人工检查（不接受"看起来没问题"这种结论）：

1. **可发现性**：用该技能的 2 条 `when_to_use` 原句作为检索词，能否只凭 frontmatter 命中（不看正文）。
2. **链接可点击**：`SKILL.md` 与 stub 中每个相对链接在编辑器/预览中可打开（不是 200 响应，而是内容正确）。
3. **触发词覆盖**：`## Triggers` 的 最多 8 条是否覆盖该技能最常见的 5 类问题；缺一项即记为缺陷。
4. **加载边界**：按"加载到能回答即停"规则走一遍典型问题，记录实际加载的文件数与字节数，填入实际加载记录；收益门禁仅以 §7.1 冻结的 B1/B2 任务判定，其他抽检结果不混入分母。
5. **阅读单元定位**：有 ≥2 个切片时，按 S0b 固定的抽样种子选 2 个，检查首两行能否说明问题域与前提；仅 1 个切片时检查该片及对应 stub。没有切片的技能（本方案中的路由器、verification、2d-subsystems）不补造切片：记录 `slice_check: N/A`，改查该技能的环境 reference 与一篇任务相关 reference，能否据标题/引言确定适用环境、任务归属与所需前提。记录实际文件及替代检查结论；N/A 只针对切片子项，不免除阅读单元定位检查。
6. **无误导精简**：对比迁移账本，确认被压缩的段落没有丢掉限定词（`only`、`must`、`never`、`not` 这类词丢失会改变语义）。

验收记录写入 `ai/plans/skills-acceptance-record.md`（问题 → 证据 → 结论），缺陷按"阻塞/非阻塞"分类；阻塞项未清零不得进入 S8。

### S8a / S8b 收尾（每阶段 4 h）

1. `npx prettier --check` 只针对新增/改动的 `tools/skills/**`、`skills/**/*.md`（注意 `ai/**/*.md` 已在 `.prettierignore`，不受影响）。
2. 同步 `AGENTS.md`、`README.md`、`skills/README.md` 中对 skills 结构的描述；核对 `tools/verify/update-capabilities.cjs`、`tools/verify/graphics-package.cjs` 是否依赖 skills 路径。
3. 记录目标文件清单、diff、快照 hash 和待决项；阶段结束不自动 `add`/`commit`，提交须后续明确授权。不得将并发改动纳入本任务。

---

## 6. 决策依据、兼容性与残余风险

### 6.1 方案依据与待验证前提（D1–D3）

| 决策                        | 依据                                                                                          | 若不这么做                                                       |
| --------------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **D1 Profile A**            | 路由器降级的前提（宿主读 `index.json`）**无法在仓库内验证**；把不可验证的前提计入收益属于虚报 | 少计必需路由器或索引读取会高估收益，必须按完整输入成本验收       |
| **D2 先做 MVP-2**           | 83–88 h 按 C 分支投入；S2p/S2b 在 S4 前验证候选召回，追加 66 h 仍须 M2 与单独授权             | 避免完成正文迁移后才发现元数据预算与召回阈值不可兼得             |
| **D3 默认 A，C 经预检再定** | A 零成本保真；先测三个闭包；近似整树则只做 A，有明确体量收益才做 C；B 会造成双份真源          | 采用 B 后 63 篇参考出现"共享版 + 内联版"两套文本，半年内必然漂移 |

### 6.2 兼容性

| 项         | 结论                                                                                                              |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| npm 消费者 | 路径保留不等于字段兼容；删除 `description_en` 与新增字段须核对实际宿主，保留原工具/环境字段。发布级别不在本轮判定 |
| 单技能分发 | 默认 A 整树；C 仅预检有价值才实现，两阶段遵循同一已选分支；都须仓库外隔离校验                                     |
| 版本号     | 本轮不变；是否发布及版本级别须在实际兼容审查后由维护者另行决定                                                    |
| 废弃周期   | `skill-index.md` stub 至少保留 2 个发布周期；23 个切片 stub **长期保留**（它们是历史链接的锚点）                  |
| 包体       | `files: ['skills/']` 自动包含新增文件；`.gitignore` 加 `dist/skills/`，bundle 产物不入库                          |
| 宿主发现   | `skills/<name>/SKILL.md` 保持一层平铺，`name` == 目录名（22/22 已满足）                                           |

### 6.3 残余风险

| 风险                                                                       | 影响              | 缓解                                                                                                                            |
| -------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 召回下降（只读 `name`+`description` 的宿主看不到 `when_to_use`/`not_for`） | 长尾查询漏命中    | `description` 保留独占名词与任务意图；分别验收 host-minimal 与 suite-extended；允许预算内调整 description；未知宿主行为记未验证 |
| 目录嵌套导致宿主发现失败                                                   | 技能整体不可见    | 明确只做平铺一级（2.3 第 1 条）                                                                                                 |
| `check-paths.cjs` 拒绝索引里的裸路径                                       | CI 失败           | 索引内路径写显式相对链接；`_shared/` 不能作为独立 scope（其规则要求 scope 内至少一个 `SKILL.md`）                               |
| 切片后链接膨胀（23 × 3–7 条）                                              | 维护成本上升      | 原路径一律保留 stub；`refs[]` 由 `gen-index.cjs` 从 stub 汇总并 `--check`                                                       |
| 路由器的 `Code First discipline` 削弱                                      | 核心纪律被稀释    | 6 条纪律保留在路由器正文，只移走代码示例                                                                                        |
| 阶段二 M2 门禁不成立                                                       | S6 的 30 h 不回本 | 完成阶段一收尾并停止追加实施；仅报告当轮实测证据，不预先承诺固定降幅                                                            |

---

## 7. 收益任务与计量协议

收益按同一快照、字段投影和读取协议记录。静态体量与任务读取量分别报告，索引、环境说明、归档和共享文件的实际读取均计入成本。

### 7.1 B1/B2 收益任务与统一计量协议（S0b 冻结）

B1/B2 是两个固定收益场景。实施步骤仍使用 S 前缀，收益场景统一使用 B 前缀。只做这两个固定任务，不新增全量应用测试。文件清单用于审计实际读取，不把“读取同样文件”当作任务完成标准；迁移后允许按需读取新的最小单元，但不能改变问题或遗漏回答内容来降低成本。

| 场景        | 固定问题                                                                                              | 完成标准与基线参考                                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 中等参考 | 场景亮度不符合预期，而且方向光没有阴影。应检查哪些光照单位、阴影支持条件和开关？                      | 必须区分光照单位/设置与阴影支持/开关，保留所需前提，给出对应文档依据。原始基线候选为 cocosair 路由器、rendering 入口、lighting-units.md 与 shadow-matrix.md；实际所需环境/context 等额外读取全部记录，不强制只读这四份 |
| B2 巨型参考 | 默认 bundle 出现 postProcess 名称，是否说明后处理可以直接运行？需要区分哪些导出、管线配置和验证条件？ | 必须区分名称导出、默认包可达、所需配置及已验证范围，不把历史/variant 证据当当前默认包保证。原始基线候选为 cocosair 路由器、rendering 入口及 pipeline-reachability.md，并记录额外读取；该参考在冻结快照须 ≥15 KB        |

上表参考文件名以 `skills/cocosair-rendering/references/` 为基准；路由器与 rendering 入口分别是 `skills/cocosair/SKILL.md`、`skills/cocosair-rendering/SKILL.md`。S0b 从原始快照人工核实这两个问题的主责与标准答案要点、证据位置，然后冻结 `tools/skills/fixtures/load-scenarios.json`。每场景记录 `{id, question, completion_checks, expected_owner, source_snapshot_hash, source_refs, read_protocol, metric_version}`；completion_checks 含事实/前提及来源块标识，不仅记录“已读文件”。如果原始材料不足以支持问题或基线不符合场景体量，须在迁移前返回评审修订，不事后更换成更容易获得收益的问题。

**原始对照与执行方式**：S0b 在技能首次改动前，按同一人工文档阅读流程完成两个基线任务，保留实际文件/片段读取和答案检查记录；S7a 对阶段一候选完成 B1，S7b 对阶段二候选完成 B2。每次均用干净阅读上下文，禁止借用已加载的其他任务内容或旧答案；Profile A 的路由器实际读取一次并计费。固定操作者/阅读方式、停止条件、字段渲染、工具返回文本计量范围，记录在 read_protocol；如更换执行方式须对原始快照重做同口径对照并保留旧报告，不能只重跑候选。这里不要求阶段一新增模型调用。

**计量规则**：任务主指标为“文档输入字符成本” `C = L0 + Σ read_chars`，字符统一按 Unicode code point。L0 是 22 技能 `name + description` 按冻结渲染模板序列化的字符数，每任务计一次；不以 suite-extended 字段替代。read_chars 对每次实际提供给阅读流程的文件文本/片段计数，包括路由器完整入口、子技能、索引、环境说明、归档、共享说明及失败尝试的已读内容；同一内容重复读取重复计数。只计文档文本载荷，工具固定封装、任务问题与答案输出不计入 C；它不是模型账单 token 数。UTF-8 字节数与粗估 token 仅并列报告，不与字符相加，也不替代主指标。

未来聚合收益场景使用 `node tools/skills/measure-tokens.cjs --loads <jsonl> --snapshot <snapshot> --scenarios tools/skills/fixtures/load-scenarios.json`；`--scenarios` 显式提供冻结问题、完成标准及计量协议，不能从候选读取记录反推场景。M2 聚合不带该参数，按真实任务分布统计。读取记录复用 §0.3 的事件格式，补充 scenario_id、read_protocol_hash 与答案检查结论；静态 L0 文本/hash、完整文件 hash、实际片段范围/hash 随报告保存。只比较同一 question/协议的原始和候选记录：两边均完成 completion_checks 且基线 C > 0 时才计算降幅 `(C_base - C_candidate) / C_base`；基线取 S0b 原始快照，阶段二也不能改用阶段一作为 G13 分母。未完成、漏记、协议不匹配或证据缺失时记 FAIL/未验证，不报节省；重试保留所有记录，不挑最低读取量替换失败结果。

G7 的静态门槛分别使用 host-minimal 的 L0 字符数和 21 个子系统完整 SKILL 的平均 UTF-8 字节数，均对 S0b 原始基线比较；任务门槛为 B1 的 C 不增加。G13 要求 B2 的 C 至少降低 40%。这两个任务只证明所选问题的成本变化，不外推为全套技能的加权收益；M2 的真实任务分布另按 §0.3 采集。

---

## 8. 验收标准（未来实施门禁，本轮未运行）

**阶段一 G1–G8 必须全绿，证据缺失记未验证。**

| ID  | 门            | 通过条件                                                                                                                                                                                                     | 工具/记录                                           |
| --- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| G1  | 元数据与 YAML | 22 份可由实际 YAML parser 解析；description ≤180 字符；when_to_use ≤5；not_for ≤3；原宿主权限/环境/版本契约保留                                                                                              | verify-meta + 原始快照                              |
| G2  | 预算          | 子系统 SKILL ≤4 KB、路由器 ≤4.2 KB；完整 frontmatter ≤1,400 code points（含分隔符和换行）；JSON 每技能对象紧凑序列化 ≤2,000 字符                                                                             | verify-meta + measure-tokens                        |
| G3  | 链接与分发    | 全树 inspect PASS，三入口闭包分析及分支选择有证据；A-only 的完整目录副本在仓库外检查导航与文件 hash；保留 C 才要求 22 入口 bundle 闭包/隔离 PASS，并披露体量                                                 | gen-index 分析报告 + inspect + 分支证据             |
| G4  | 迁移内容      | S7a 账本、代码、表格单元格、散文限定词及元数据去向全通过；归档可达，无静默删除                                                                                                                               | verify-lossless P1 + 人工审核                       |
| G5  | 召回与时序    | S2p 五技能探针、S2b 全量双视角门均在 S4 前通过并保留候选/hash/原始排名；S7a 最终复跑达到 D.2 全量阈值与不回退要求，不能倒填早期记录                                                                          | route-regression + 分阶段记录                       |
| G6  | 索引一致      | gen-index --check PASS；单一真源和确定性输出成立                                                                                                                                                             | gen-index                                           |
| G7  | 收益          | 按 §7.1：host-minimal 静态常驻字符数至少降低 40%，子系统完整入口平均 UTF-8 字节数至少降低 30%；B1 文档输入字符成本 C 不高于原始基线。列出字节/字符/估算 token，未达到则如实记 FAIL，不调整阈值或隐去新增读取 | measure-tokens + 冻结 B1/B2 协议及原始/候选读取记录 |
| G8  | 范围与快照    | 22 入口及旧索引路径保留，package 版本不变，无并发改动混入；S0r 实际还原的盘上文件清单/字节/hash 全等证据与收尾复读均通过；完成 S8a                                                                           | 状态/diff、原/还原盘上清单、退出码和复读记录        |

G7/G13 是设计门槛，不是已验证收益。S0b 必须先冻结 §7.1 的 B1/B2 问题、完成条件、主指标、原始对照与读取协议，并检查静态预算可行性；若无法满足或缺失原始证据，先返回评审，不能边迁移边降阈值。任务成本均含 L0 常驻字段及所有实际额外读取，文件清单与答案检查不可互相替代。

**阶段二追加**

| ID  | 门         | 通过条件                                                                                                            |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| G9  | 全量内容   | S7b 全通过；shingle 缺失项逐条闭环，不能仅凭 ≥0.97 自动认定无损                                                     |
| G10 | 模型召回   | T2 两字段视角分别满足 D.2/D.3；有序 top-3 输出合法且保留三次原始结果                                                |
| G11 | 切片       | 每片 ≤6 KB；stub ≤20 行；原标题/正文按 ledger 完整映射，导航锚点有去向                                              |
| G12 | 人工验收   | 固定 5 技能按 S7.5 的切片/无切片分支完成 6 项检查；N/A 必须有替代检查证据；T3 按 Profile A 记录实际读取，阻塞缺陷 0 |
| G13 | 收益与分发 | B2 的 C 对 S0b 原始基线降低至少 40%；按既定 A 或 A+C 分支重新隔离验证新增共享/切片后的分发副本；完成 S8b            |

## 9. 阶段一交付物清单（未来 Definition of Done）

- [ ] 六个文件：`tools/skills/lib/md-parse.cjs`、`measure-tokens.cjs`、`verify-meta.cjs`、`gen-index.cjs`、`verify-lossless.cjs`（P1）、`route-regression.cjs`（双视角 T1）
- [ ] 原始技能快照、清单/hash、工具版本及 S0r 实际还原后盘上枚举/复读/hash 全等记录；不能只用 HEAD 或“复制成功”代替
- [ ] `skills/manifest.json`（只供套件工具使用）和 22 份有效 YAML、预算内 SKILL
- [ ] 22 份 triggers、context/common-mistakes 迁入内容、必要旧索引归档及完整迁移账本
- [ ] `skills/index.json`、`INDEX.md`、旧索引 stub 及生成一致性记录
- [ ] `skills/README.md`：整树复制、C 保留/裁撤的分支说明、隔离验证与实际体量披露
- [ ] 三代表入口的闭包比例与 C 取舍记录；A-only 完整树副本的隔离/hash 记录，或 C 分支 22 个 bundle 的自包含隔离记录；不交付虚构的单技能能力
- [ ] token/route 基线、44 条固定题及五技能探针 ID/hash；S2p 双视角探针、S2b 正文改写前全题门与失败记录；B1/B2 协议和原始/候选记录；S7a 最终报告
- [ ] 任务加载事件格式/填写示例与聚合命令；M2 数据只能在真实任务观察后形成
- [ ] G1–G8 记录、S8a 范围检查与实际还原实证；提交另行授权

**阶段一不做**：不切片、不建 `_shared/`、不做 S5 批量去重；参考文件仅允许 S4 迁入、相对路径修复和无损归档，不能声称“参考正文完全不动”。不改 `src/`、`build/`、`docs/manual/`、版本号，不自动提交、推送或发布。

---

## 附录 A：`SKILL.md` 目标模板

以下 rendering 样板在 ≤180 字符内保留完整错误码 `AIR_E_RENDER_TARGET_SAMPLES`，与 §3.3、§3.3.1 和索引示例使用同一文案；另一错误码 `AIR_E_TEXTURE_COLOR` 的去向仍由账本定位。它仅证明“保留精确错误码”可以满足此样例的语法/预算，不证明全部报错都能装入 180 字符，也不替代 T1 召回验收。

```markdown
---
name: cocosair-rendering
description: "Rendering: lighting, shadows, render targets, MSAA, sRGB and pipeline reachability. Use for offscreen rendering, missing shadows or AIR_E_RENDER_TARGET_SAMPLES."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - no shadows
  - mirror or refraction to texture
  - texture washed out
owns: [lighting, shadow, render-target, msaa, srgb, post-process]
not_for:
  - material typing -> cocosair-materials-effects
  - projection -> cocosair-camera
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "配置灯光、阴影、渲染目标、MSAA、颜色契约和管线可达性。用于光照、阴影、离屏渲染、读回或后处理问题。"
---

# Cocos AIR rendering contracts

Scope: what the legacy forward pipeline actually draws. Locate the environment through [context](references/context.md).

## Start here

Read [quick-start](references/quick-start.md) for the minimal setup and teardown.

## Triggers

- no shadows -> references/shadow-matrix.md
- mirror / refraction -> references/render-target.md
- washed-out texture -> references/color-contract.md
- can bloom run -> references/pipeline-reachability.md

## Rules that change the code

- one effective main directional light per scene
- a shadow needs all four switches, not one
- report requested vs effective MSAA, then verify pixels

## Do not

- [HIGH] turning on one shadow switch
- [HIGH] importing custom pipeline and expecting post-process

## Reference map

- references/triggers.md - full symptom-to-API map
- references/shadow-matrix.md - which light types cast, the four switches
- references/render-target.md - options, MSAA negotiation, AIR_E_RENDER_TARGET_*

Stop rule: load the smallest slice that answers the question; do not load a sibling reference for the same question.
```

**阶段一 vs 阶段二的模板差异（执行时注意，避免照抄出 404）**

| 位置                   | 阶段一写法                                        | 阶段二写法                                                                       |
| ---------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| 环境定位               | `Read references/context.md`（不引用 `_shared/`） | 从 SKILL 用 `../_shared/preface.md`；从 references 用 `../../_shared/preface.md` |
| Reference map 的切片项 | `references/pipeline-reachability.md`（整篇）     | `references/pipeline-reachability/03-postprocess-face.md`（切片）                |
| 共享可达性结论         | 保留原 1 行文字                                   | 改为链接 `_shared/capability-layers.md` + 1 行结论                               |

阶段一**不要**提前写入 `_shared/` 链接：该目录要等 S5 才创建，提前写会造成 22 个技能同时 404。

## 附录 B：落地顺序与依赖

```text
阶段一（A-only 83 h；保留 C 88 h）
S0a 快照冻结 → S1a 必需工具/闭包预检(23h) → S0r 实际还原(计入 S0a 3h)
  → S0b 基线/题集/探针冻结/B1/B2 原始对照(2h)
  → S2a 五技能元数据(3h) → S2p 双视角探针(2h)
      失败：停止并返回方案评审
      通过：S2b 其余元数据及全题门(11h)
            + 只有价值预检通过时才补 C 生成/隔离(5h)
  → S2b 全题门通过 → S4 正文试点/批量(26h)
  → S3 最终索引(3h) → S7a 最终校验(6h) → S8a 收尾(4h)

M1–M3 + 阶段二单独授权
  → S1b(6h) → S5(16h) → S6(30h)
  → S7b(4h) → S7.5(6h) → S8b(4h) = 66h
```

S3 可在 S2b 后先生成候选，S4 改引用后须重新生成。S0r/S0b 之前不改技能，S2p 之前不改其他 17 技能或正文，S2b 全题门之前不做 S4。S7a 是候选最终回归，不能用它替代早期可行性门。保留 C 时须待其最终隔离完成才可交付 G3；A-only 则不等未实施模式。各阶段证据绑定格式化后的候选，不自动提交。

## 附录 C：工具脚本规格

全部在 `tools/skills/`，CommonJS、Node ≥18；优先复用现有依赖，不新增 npm 依赖。YAML 必须用实际 parser 验证，不能用 `split(':')` 伪解析；S1a 先核实项目现有 parser 是否能稳定调用，无法满足时返回工具依赖评审，禁止偷偷引入依赖。这里的接口是未来规格，本轮不创建或运行这些脚本。

| 脚本                 | P1 工时               | P2 扩展 | 输入/输出与边界                                                                                                                                                                                                                         |
| -------------------- | --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| lib/md-parse.cjs     | 4 h                   | —       | frontmatter、fence、标题、块与链接目标；保留源位置供 ledger 使用；复用现有 check-paths 可用逻辑，不扩大其发布导出面                                                                                                                     |
| measure-tokens.cjs   | 4 h                   | —       | `--root` / `--json` / `--diff <baseline>` 统计静态字符/字节；`--loads <jsonl> --snapshot <snapshot>` 只聚合显式任务记录；收益场景额外传 `--scenarios <fixture>`，按 §7.1 校验 scenario/协议/hash、答案检查与 C，真实分布按 M2，不能混算 |
| verify-meta.cjs      | 4 h                   | —       | YAML 语法、字段位置/类型、code point 预算、原工具声明不扩大、name/目录一致；suite manifest 不能替代宿主字段                                                                                                                             |
| gen-index.cjs        | 3 h 必需 + 5 h 条件 C | —       | 必需：--check/--write、共享字段投影与三入口只读 --analyze-bundle；C 保留且 S2p 成功后才实现 --bundle/隔离，不保留则不存在该模式；A-only 仍校验整树分发                                                                                  |
| verify-lossless.cjs  | 5 h                   | 4 h     | --snapshot/--ledger/--phase 内容守恒；P1 显式 --restore-check <snapshot> --out <new-empty-dir> 支持原始字节还原及独立盘上复读；P2 加 shingle/指代                                                                                       |
| route-regression.cjs | 3 h                   | 2 h     | --snapshot/--prompts/--baseline/--tier/--view；P1 的 --probe <ids-json> 保留 22 候选，跑冻结五技能子集并报告真实命中词；S2b 全44题、S7a 复跑；P2 T2                                                                                     |
| **合计**             | **23–28 h**           | **6 h** | P1 六文件必需；只裁撤 C 的 5 h，不裁撤真实链接、T1 或还原门；阶段总工时见 §0.2                                                                                                                                                          |

实现约束：默认只读；持久写入仅显式 `--write`、已保留 C 的 `--bundle` 或 `--restore-check ... --out <new-empty-dir>`，报告由调用方明确重定向保存。还原和 C 的隔离自校验只在声明的新建临时产物位置写入，不改源树，清理范围须限定本次临时目录。生成物确定性、无时间戳或宿主绝对路径；观察记录/人工模型报告可含真实采集时间，不混入确定性索引。链接有效性复用 `inspect()`；额外检查只负责其未覆盖的产物根边界与包含性。JSON/Markdown 新产物均须在自身格式检查范围内。

---

## 附录 D：召回回归测试协议

### D.1 Prompt 集（44 条，先核定主责再冻结）

路由评测问的是“负责当前请求的主技能”，不是“首先经过的入口”。Profile A 总是读取路由器，不代表每题 gold 都是 cocosair；只有明确请求选择技能、分派边界或解释统一 Code First 规则且不要求某子系统实施时，主责才是路由器。

| 类别       | 条数 | 来源                                                        | 构造与主责规则                                                                                                                                                       |
| ---------- | ---- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gold       | 22   | 每个目标技能的 When to use what、Contracts 或直接 reference | 先为 22 个技能各确定一个由其实际负责的请求，再找现有正文支持；每个技能恰好为一条 gold 的 gold 值。可改写措辞，不增加原文没有的事实。不得按“第一条症状句”机械分配主责 |
| boundary   | 12   | context 的相邻关系与路由器分派规则                          | 覆盖 12 对易混淆技能，提供足以区分的上下文，人工确认 gold 应排在 reject 前                                                                                           |
| real-error | 10   | references 的错误码/异常串                                  | 保留原始错误串并加一句上下文；按任务实际主责设置 gold，出现该错误串的文档所属技能不自动成为 gold                                                                     |

表格型入口的固定取材规则：选择一行已有子系统及其具体任务/陷阱，并用 Contracts 或对应 reference 补足用户问题，不强求入口有症状句。例如 cocosair-2d-subsystems 从 DragonBones 行的“asset setters want raw text”构造“DragonBones 资产 setter 应接收对象还是 JSON 字符串”的任务，归属该技能；本轮只规定取材方式，不创建实际题集。

归属示例：`WEBGL2_REQUIRED` 的启动错误诊断归 application，即使素材来自路由器；为 cocosair 保留“跨多个 AIR 子系统的需求应如何选择主技能与直接依赖”的路由任务，不能拿启动错误代替路由任务。来源技能与 gold 允许不同；22 个 gold 覆盖约束针对核定后的主责，不能为了每技能一题而把错误标签分给路由器。

存储 `tools/skills/fixtures/route-prompts.json`，字段 `{id, kind, prompt, gold, reject?: string[], sources:[{path, block_id, hash}], source_skill, ownership_reason}`。S0b 在评分前人工核对所有标签与来源，确认 gold 类恰好覆盖 22 个有效技能、12 条边界的 gold/reject 不冲突、错误码上下文充分后冻结题集/hash，再采基线。存在无唯一主责或材料不足的题先修正文案并复核，不能带着歧义冻结，也不能评分后按结果换题。冻结后的修改遵循 D.4。

### D.2 两个字段视角与三层执行

每个视角独立产生基线、分数、排名与通过结论，不得用扩展视角补偿最小宿主视角。输入统一采用 §3.4 的共享路由记录投影；`host-minimal` 只取 name + description，`suite-extended` 再取 owns + when_to_use + not_for + metadata.description_zh。字段/序列化顺序固定，不按结果选配；原始语料缺少字段时采用 §3.4 的空数组/空字符串，不从正文补词。原始快照直接构造路由记录，候选的记录还须与生成索引逐字段一致；T1/T2 不直接把未经核对的 index.json 当另一份词表。

| 层          | 阶段                                  | 执行与输出                                                                                                           | 门槛                                                                                                                                                                        |
| ----------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1 词法     | P1 S2p 子集/S2b 全题/G5 最终；P2 复跑 | 两视角分别运行 BM25，k1=1.2、b=0.75；固定分词/大小写/错误码切分和 name 排序打破并列；保留全部排名                    | 每视角全部 44 条的目标 gold ∈ top-3 100%、top-1 ≥38/44（≥85%，37/44 仅为 84.1%），22 条 gold 子集 top-1 ≥19/22；boundary 的 gold 排在所有 reject 前；各指标不低于该视角基线 |
| T2 模型选择 | P2 G10                                | 两视角分别对原始/候选各跑 44 prompt ×3，最多 528 次调用；同模型版本、参数和提示；输出 `{ranked:[name1,name2,name3]}` | 每视角 22 条 gold 的 top-1 多数票 ≥20/22；每 prompt 至少 2/3 次 gold 在 top-3；boundary 至少 2/3 次 gold 排在 reject 前；满足 D.3 基线比较                                  |
| T3 实际流程 | P2，计入 S7.5                         | 固定 5 条抽检任务，记录实际读取和结果并判断可用性；不将其替代 §7.1 的 B1/B2 收益对照                                 | 按 D1 Profile A 加载路由器；主技能正确且仅加载直接需要依赖；文件数/成本如实记录，不强迫 ≤2 篇、不为符合 T1 而改真实行为                                                     |

T2 数组必须恰好包含 3 个不同的有效技能名；解析失败、重复、未知技能名均记该次失败并保留原始输出，不静默重试替换。未出现在数组内的 reject 排名视为无穷；gold 缺失不能因此通过。top-1 取 `ranked[0]`，同一 prompt 三次 top-1 无多数时算该条未通过，不另加第四次取巧。

阶段一 T1 只证明被测字段投影下的词法路由；实际宿主对扩展字段的支持、模型行为仍标为未验证。若最低视角未达标，应修正文案或返回评审，不可仅靠 suite-extended 通过就声称召回无损。

### D.3 基线与回归判定

- S0a 冻结原始工作区技能和 prompt 来源；S1a 建工具并构造固定 prompt 后，S0b 先按 D.1 审核主责并冻结 prompt 集/hash，再对未修改技能采 T1 双视角基线；同时完成 §7.1 两个收益任务的协议冻结与原始对照。所有基线记录 parser/分词器/投影版本、源清单 hash，缺失或不可还原时阻塞迁移。
- P2 的 S1b 就绪后，对原始冻结语料与最终候选在同一批次采 T2；无需在 P1 前运行尚未实现的模型工具。模型不可用则 G10 记 BLOCKED，不从历史结果补 PASS。
- T1 = 各视角绝对阈值通过且各指标不低于自身基线。T2 = 各视角绝对阈值通过，22 条 gold 的多数票成功数最多比自身基线少 1，且 boundary 的 reject 约束不退步；逐项披露差异，不只报综合分。
- CI 只跑确定性 T1；T2 留作阶段二人工评审门，保存模型标识/参数/时间和全部原始排名。仅依赖宿主最小字段的结果不得与扩展视角混报。

### D.4 失败处置

1. S2p 失败先按 §5 的混合语料风险说明诊断，未排除混合态伪影前不急于改预算或反复改文案；保留 FAIL/可行性未定，不自动通过或继续常规批量。再在 S2p 探针、S2b 全题门处理已定位的召回问题；`host-minimal` 失败时允许在 ≤180 字符预算内调整 description 的独占名词、症状或完整错误码；保持语法有效，不靠超预算补召回。`suite-extended` 失败时再调整 owns/when_to_use/not_for；两个视角均复跑。
2. 两轮修正仍失败，停止后续技能/正文迁移，报告实际冲突样本或未排除的混合态影响及无有效命中样本，不能仅据混合态失败断言最终态不可行；如需放宽预算、改变召回方法或门槛，先评审修订协议，不自动降低质量要求。技能合并/拆分属于新增范围，须另行评审，不能直接在本任务实施。
3. 不为过门修改 prompt、删除难例、放宽阈值或替换失败原始输出。确需改变协议时先提出有证据的文档修订并获认可，再冻结新基线；单独记录差异，提交依然需要明确授权。
