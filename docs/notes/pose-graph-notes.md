# Pose Graph 构建与运行边界

> 本文保留原调查日期、命令和观察结果，属于专题调查记录。阶段编号与旧测量值不表示当前发行状态；现行范围见 [功能范围](../reference/web-features.md)，验收状态见 [发布复核](../reference/release-review.md)。

> 结论先行：本组按计划书 C3/R10 的**降级口径**验收 ——「闭包完整 + 单元级 pose node 求值正确」。
> **示例（浏览器）级取证在默认发行配置下不可达**，不是缺文件，而是被构建期特性开关关掉了。
> 打开该开关属于 bundle 预算决策，与 D9/D10 同类，需 owner 确认后另议，不在本轮擅动。

## 1. 默认产物不可达（实测）

命令（当期产物 `build/cocosair.module.js`，6,081,668 B / sha256_16 `35496aebda066ab5`）：

```sh
for s in PoseGraph GraphOutput SceneGraphPose PoseNodeRuntime BlendSpace1D graph-output-node AnimationGraph PROCEDURAL_ANIMATION MARIONETTE; do
  printf "%s=%s " "$s" "$(grep -o "$s" build/cocosair.module.js | wc -l)"; done
```

当期读数（2026-09-22 现读，非沿用）：

```
PoseGraph=0 GraphOutput=0 SceneGraphPose=0 PoseNodeRuntime=0 BlendSpace1D=0
graph-output-node=0 AnimationGraph=3 PROCEDURAL_ANIMATION=0 MARIONETTE=0
```

即：姿势图运行时**没有进入发布产物**，而 `AnimationGraph`（传统状态机/动作图）在产物里有 3 处。

原因是 `src/cc.config.json` 的两条虚拟模块覆盖（行号为当期文件）：

| 行 | `test` | 覆盖效果 |
| --- | --- | --- |
| 419 | `!context.buildTimeConstants.MARIONETTE` | `cocos/animation/marionette/runtime-exports.ts` ↦ `index-empty.ts` |
| 426 | `!context.buildTimeConstants.PROCEDURAL_ANIMATION` | `cocos/animation/marionette/pose-graph/runtime-exports.ts` ↦ `runtime-exports-empty.ts` |

（行号为 r43 现读，指 `overrides` 内那条路径对所在行。r43 在 `features` 里补登了两个官方 feature unit，
使 `moduleOverrides` 段整体下移 13 行 ⇒ 上表初版的 407/414、以及别处旧文引用的 `src/cc.config.json:269/410/417`
都已不再是当期行号；这些引用点已统一改为按内容锚定（`native-2d-empty.ts` / `index-empty.ts` / `runtime-exports-empty.ts` 三条路径对），
现读行号 281 / 422 / 429。）



所以「示例里 `import { PoseGraph } from 'cocosair'`」在默认发行姿态下拿不到符号，
`examples/animation-pose-graph` 无法在不改发行配置的前提下出图。这是**发行姿态**决定，不是能力缺失。

## 2. 闭包完整（实测 + 门禁）

- 抽取子树规模：`src/cocos/animation/marionette/pose-graph/` 下 `.ts` 文件 **52**，与官方
  `cocos4/cocos/animation/marionette/pose-graph/` 的 **52** 一一对应（现读 `find | wc -l` 两侧同值）。
- 逐字节一致性由 `npm run verify:file-map` 全量覆盖（护栏第 12 条），52 行登记在
  `docs/upstream-file-map.json` 且全部 `modified: false`；`test/smoke/smoke-31-pose-graph.test.ts`
  第一组用例把「磁盘文件集合 ⊆ 登记集合且无 modified 标记」钉成单测，防「文件在盘但脱离簿记」的静默漂移。
- 导出链完整（源码侧）：`src/cocos/animation/marionette/runtime-exports.ts:32` → `./pose-graph/runtime-exports`
  → `./pose-nodes/all` + `./pure-value-nodes/all`；`pose-nodes/` 目录当期 20 项（含 `choose-pose/`、`ik/` 子目录与 `all.ts`）。
- 两个空替身本身也是登记在册的逐字节拷贝：`pose-graph/runtime-exports-empty.ts`、`marionette/index-empty.ts`。

## 3. 单元级 pose node 求值正确（实测）

落点：`test/smoke/smoke-31-pose-graph.test.ts`（8 用例，2026-09-22 r32 全绿）。ts-jest 直接
`import` `src/`，绕开 esbuild 的虚拟模块覆盖，因此能在 Node 环境跑通完整求值链路：
`AnimationGraphEval` → `ProceduralPoseStateEval` → `instantiatePoseGraph` → `bind` → `settle` →
`update` → `evaluate` → `AnimationGraphPoseLayoutMaintainer.apply(finalPose)`（写回 `Node` 局部变换）。

断言是手算的期望值，不是从输出反填：

| 用例 | 断言 | 依据 |
| --- | --- | --- |
| REPLACE + 满强度 | `target` 局部位置精确 = `(1,2,3)`；`untouched` 保持 `(0,0,0)` | 组件结点为单位变换 ⇒ `COMPONENT` 空间即目标局部空间 |
| REPLACE + 半强度 | = `(3,0,0)` | `lerp(5,1,0.5)=3`（`apply-transform.ts` 的 `replacePosition`） |
| 强度 0 | 保持默认 `(5,0,0)` | `intensity < 1e-5` 早退分支 |
| rotation ADD + 满强度 | 旋转精确 = `(0,0,√2/2,√2/2)`，位置不受牵连 | `Quat.multiply(result, value, inputRotation)`，输入为单位四元数 |
| 两结点串联 | 两个骨同时被改写 | `instantiateNode` 沿 shell binding 递归 |
| 连续 5 帧 | 每帧结果一致且 `allocatedPoseCount === 0` | 姿势栈无泄漏（DEBUG 断言之外的独立证据） |

### 搭链路时踩到的三个非显然点（后续复用）

1. **连接输出结点必须走 `poseGraphOp.connectOutputNode(graph, node)`。**
   直接 `graph.outputNode.pose = node` 只写到了字段上（读回来仍能看到该结点），但不会在
   `PoseGraphNodeShell` 里留下 binding；`instantiatePoseGraph()` 因 `bindings.length === 0`
   返回一个 `_rootPoseNode === undefined` 的实例，于是 `bind/settle/update/evaluate` **全是静默 no-op**，
   结点上没有任何报错。实测对照：赋值式 `outputNode.pose=` 时 spy 记录 `bind/settle = 0/0`、
   `transformCount = 0`、骨位置停在默认 `(5,0,0)`；改用 `connectOutputNode` 后为 `1/1`、`1`、`(1,2,3)`。
   （探针脚本已删除；复现方式见上面的单测，把 `connectOutputNode` 换回直接赋值即可看到 no-op。）
2. **输入键是元组 `[propertyKey, elementIndex?]`。** `connectNode(graph, node, 'pose', producer)` 会被
   `getInputMetadata` 判为无效键并只打一条 `error("Consumer node does not have such specified input key pose")`，
   之后照常求值 ⇒ 又是一次静默退化。正确写法 `['pose']`；单测里加了 `getInputKeys()` 的键面断言兜住这点。
3. **`TransformSpace.LOCAL` 在父骨未被绑定时不是「绝对局部值」。** 单骨绑定下（`transformCount === 1`，
   `root` 自身不参与姿势）实测得到 `(1,2,3) + (5,0,0) = (6,2,3)`，即空间转换按骨架里已有的默认变换复合。
   为了让期望值可手算，单测统一用 `TransformSpace.COMPONENT` 且让组件结点保持单位变换。
4. 过渡时长默认 0.3 s 会把结果与空状态混合，第一帧看不到纯姿势值；单测把 entry 过渡 `duration = 0`。

## 4. r43 追加：「打开开关」的确切路径与代价（实测，不改发行姿态）

§1 只说明了默认产物拿不到符号，并把开关留给 owner。r43 把「怎么打开 / 打开要付多少」量化了，
过程中撞出一个比本组更通用的坑：

**4.1 Air 的 `features` 里根本没有这两个开关的生产者（r43 实测）**

上游用 feature unit 的 `intrinsicFlags` 产出 `buildTimeConstants`：`cc.config.json:236-241` = `marionette` → `MARIONETTE`，
`:242-247` = `procedural-animation` → `PROCEDURAL_ANIMATION`（两者 `modules: []`，零文件依赖）。
Air 侧 `src/cc.config.json` **这两条 unit 都没登记** ⇒ 开关根本没有可置真的入口，
`!MARIONETTE` / `!PROCEDURAL_ANIMATION` 两条覆盖在 Air 里是**永久生效**的。

**4.2 静默空转陷阱（比本组更重要，已记 F-119）**

在登记之前，直接用 `AIR_FEATURES` 传这两个名字做变体构建：

```sh
AIR_FEATURES="$(默认 26 项),marionette,procedural-animation" \
  AIR_OUT_DIR=E:/AIProMax/cocosair-scratch/pg-probe/out node tools/build/build.cjs --format esm
```

结果 `EXIT=0`，但日志仍打出 `Redirect module .../marionette/runtime-exports.ts -> .../index-empty.ts`，
且产物与默认**逐字节相同**（6,081,668 B / sha256₁₆ `35496aebda066ab5`，见 `pg-probe/variant-vs-default-r1.json`）
⇒ **ccbuild 对未声明的 feature 名是静默忽略的**，任何「变体已取证」的结论若不检查 Redirect 行或产物哈希，都可能建立在空气上。
（本仓库既有 D10/D12 类变体取证走的是 `tools/analyze/import-upstream-group.cjs`，它会先写 config，故不受影响；但手工 `AIR_FEATURES` 会。）

已落护栏：`tools/build/build.cjs` 在构建前把请求的 feature 集与 `src/cc.config.json` 的 `features` 键集比对，
未声明即 `EXIT=1` 并列出未声明项（r43e 控制组：`AIR_FEATURES=base,not-a-real-feature` → `NEG_EXIT=1` 且输出目录未被创建；
`AIR_FEATURES=<默认 26 项>` → `EXIT=0` 且产物仍 `6,081,668 B / 35496aebda066ab5`，与发布件逐字节相同 ⇒ 护栏不误伤）。

**4.3 登记后的真实代价**

按官方原文把两条 unit 补进 `src/cc.config.json`（逐字段同上游，见 5.1 的行号）后再跑同一条变体命令：

| 项 | 默认发布件 | `marionette + procedural-animation` 变体 |
| --- | --- | --- |
| 字节 | 6,081,668 | **6,420,969**（+339,301，+5.58%） |
| sha256₁₆ | `35496aebda066ab5` | `84db38d62ca3e74f` |
| `Redirect …runtime-exports.ts -> …-empty.ts` | 有 | **无** |
| 产物内 `PoseNode` 出现次数 | 0 | 128（`PoseNodeApplyTransform` 2） |

**默认发布件不受"登记"本身影响**：只登记 unit、不把它们加进 `AIR_FEATURES` 时，
`build/cocosair.module.js` / `.min.js` / `.d.ts` 三件重跑后 **PRE/POST 逐字节相同**
（`35496aebda066ab5` / `8795c8685ace28a1` / `6d01c030d85bf86c`，r43c，日志 `db-probe/r43c-keystore.log`），
`verify:file-map` 与 `npm test`（31 suites / 252 tests）全绿 ⇒ 已铺的 V1.2/V1.1 证据继续绑定交付产物。

**4.4 因此 owner 要拍的只剩一个问题**：是否把 `marionette` / `procedural-animation` 加进默认 `AIR_FEATURES`
（代价 = +5.58% 未压缩产物，触发 36 条矩阵记录与 V1.1 证据链全量重采），
还是维持「单元级口径 + 变体可构建」的现状（本文件 §2/§3）。r43 **没有**擅自切换，只把路径与数字摆出来。


## 5. 本组明确不声称的

- 未打开 `MARIONETTE` / `PROCEDURAL_ANIMATION` 出过任何浏览器截图，`examples/animation-pose-graph` **未交付**，
  `docs/evidence/browser-matrix/` 里没有它的帧。
- 未声称 `pose-nodes/` 下各结点逐个求值正确：本轮只覆盖 `PoseNodeApplyTransform`
  与链接/求值/应用骨架本身；`play-motion`/`sample-motion`/`blend-*`/`ik`/`motion-sync`/`stash`
  等仍未有单元级证据。
- 未在浏览器矩阵契约（`tools/verify/browser-matrix-contract.json`）里登记该示例，因此护栏第 9 条的
  PASS 数不包含它。

## 6. 批复注记（r46，2026-09-24）

Owner 批复 #5 = 建议 **(b)**：`marionette` / `procedural-animation` **不进**默认 `AIR_FEATURES`，发布姿态维持现状。
本文 §4.3 的 +339,301 B（+5.58%）成本因此不发生；LV12-12 按既定降级口径（闭包完整 + 单元级求值）结案，
pose-graph 变体构建路径（§4.4）保留为非默认验证通道。
