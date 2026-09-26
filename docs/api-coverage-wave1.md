# API 覆盖推进：节点变换与 Tween 控制

基线：`8867d14`；覆盖报告原为 verified 439（Core 295/816、Important 33/1773）。本波次增强现有示例，Gallery 数量保持 145，API 分母和门槛不变。

## 交付

| 示例 | 新增覆盖 | 可核对的行为 |
| --- | --- | --- |
| `node-hierarchy` | 20 个 Core API | 父节点旋转 90° 并放大 2 倍；局部点 (1,0,0) 映射为世界点 (10,2,0)；世界空间设置回写局部值；旋转/缩放/平移矩阵拆分；逆变换；层级路径与销毁 |
| `tween-basic` | 22 个 Important API | 暂停冻结、恢复到终点、停止冻结；顺序/并行动作；克隆目标隔离；联合与重复；按 ID 反转；标签选择性停止；循环停止；节点移除与销毁 |

源码分别位于 `examples/node-hierarchy/src/transform-contract.ts` 和 `examples/tween-basic/src/tween-contract.ts`。两例通过 `__trialProbe` 提供 18 + 14 项断言，未完成或失败会阻断正典验证。数值断言使用明确的预期值，没有通过吞掉异常宣称接口可用。`tween-basic` 另有资源合同：先停止目标上的补间，释放自有节点与网格，再创建同构目标并恢复动画；共享内建材质不由示例销毁。三浏览器均验证 held=2、leaked=0、reloaded=true。

新方法的 `api.claims` 与源码位置精确绑定，浏览器插桩确认方法被执行，结合行为探针和规格验证形成 verified 证据。

## 验证状态

三个浏览器的定向验证均为 2/2 PASS：[Chromium](evidence/coverage-wave1-chromium.json)、[Firefox](evidence/coverage-wave1-firefox.json)、[WebKit](evidence/coverage-wave1-webkit.json)。42 个新增单元在 Chromium 的逐 API 证明中均为 verified。

最终验收通过。verified **439 → 481（+42，旧单元零减少）**；Core **315/816（38.6%）**，Important **55/1773（3.1%）**，stale=0、schema gap=0。正典 Chromium 140/140，Jest 32 套/263 用例，Gallery 210/210（44 个释放合同）全部通过；格式、类型、3512 条 API 引用和证据链检查通过。定向三浏览器结果仍限定为本批两例。机器汇总见 [覆盖增量记录](evidence/coverage-wave1-summary.json)。

## 发现的边界

`reverseTime(embedTween)` 包装相对位移序列时出现了异常终点：起点 x=3，嵌入 `by(0.2, {x:2})` 后反转，预期回到 3，实测停在 5。复现和原始失败探针见 [诊断记录](evidence/coverage-wave1-reverse-time-diagnostic.json)。

当前示例使用已验证正确的直接形式：先追加 `by`，再调用不带嵌入参数的 `reverseTime()`。该方法的覆盖只证明此使用路径；嵌入序列分支仍是待处理缺口，没有以“执行过”替代其正确性结论。

非常短的动作片段还会受到浏览器帧调度影响。本例采用 0.2 秒片段与有上限的完成条件等待，仍严格核对终点和重复次数，不放宽数值断言。

## 后续优先项

继续推进原生 Animation 的状态创建/移除、交叉淡入淡出，以及 UI 交互和资源取消组合；`reverseTime(embedTween)` 单列实现差异与回归用例后处理。Core 100% / Important 90% 是后续批次目标，本波次不宣称全量达标。
