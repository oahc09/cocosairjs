# V0.7 — Data-driven Interaction Patterns 分析报告

> 分析输入：100 Benchmark 运行结果 + 30 Recipe 执行结果 + Recipe Runner 代码。
> 方法：扫描 benchmark 源码/参考实现/validators 中的重复代码块与验证模式。

## 1. 重复模式统计

| 模式 | 出现次数（/100 benchmark） | 现有抽象 | helper 收益 |
|---|---|---|---|
| Camera + Light + Canvas 初始化 | 53（所有 source-create） | 无（每份参考实现独立写） | 低：15 行/次，但各 benchmark camera 位置/角度不同，难以泛化 |
| spawnCube(pos, scale) | 38 | 无 | 中：约 8 行/次，但 cube 参数变化大（网格类型/材质/尺寸均不同） |
| GLTF load + instantiate + frameObject | 14（B041-B050, B064-B070） | `frameObject` 已存在 | 已覆盖 |
| visible-frame 像素检查 | 42（所有有 visible-frame validator 的） | Validator 已封装 | 已覆盖 |
| interaction before/after | 12（rc 类） | Agent Session dispatch | 已覆盖 |
| resource-released | 8（stable） | Validator 已封装 | 已覆盖 |

## 2. Helper 准入评估（§80）

| 候选 helper | 触发频率 | 收益评估 | 结论 |
|---|---|---|---|
| setupDefaultScene(camera, light) | 53 次 | 减少 ~15 行/次，但 camera 参数每 benchmark 不同 → 泛化后仍需 5-8 行调用 | **不入**：收益 < 抽象成本 |
| spawnPrimitive(type, opts) | 38 次 | 减少 ~8 行/次，但 mesh 类型仅 box/sphere/torus/cylinder/plane 5 种，直接调 primitives.* 更清晰 | **不入** |
| loadAndInstantiate(url) | 14 次 | `GLTFLoader.parseAsync + instantiate + frameObject` 3 步合 1 | **不入**：已有 `loadAssetAsync` + `frameObject` |
| autoValidate(checks) | 100 次 | Validator 已封装且由 Runner 统一调用 | 已覆盖 |

## 3. 结论

所有高频重复模式已被现有 Validator / Agent Session / frameObject 覆盖。
**V0.7 不新增 helper**。后续若出现 ≥3 Recipe 或 ≥5 Benchmark 的新的未覆盖模式，
再按 §80 准入条件评估。

## 4. V0.7 Gate

- [x] 分析了 100 Benchmark + 30 Recipe 的重复模式
- [x] Helper 准入评估完成，全部结论为"不入"
- [x] 无新增 helper → 无需重跑 Benchmark/Recipe
- [x] V0.7 Gate PASS
