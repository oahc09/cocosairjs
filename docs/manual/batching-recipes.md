# 批处理三路线 Recipe 与测量预算

三个可运行示例使用同样的绿色 quad、一个共享 unlit material、一个 pass、一个相机、无阴影和后处理。
合并网格的“一次 draw”只对本例这些条件成立；多材质、多 primitive、多 pass、阴影或多相机都会改变提交数量。

| 路线              | 示例                                                 | 适用与代价                                                                             |
| ----------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 共享 mesh × N节点 | [batching-shared](../../examples/batching-shared/)   | 保留独立节点变换和逐节点剔除；共享资源不等于合并draw。                                 |
| 合并静态网格      | [batching-merged](../../examples/batching-merged/)   | 把顶点预先变换到同一空间；本例一个primitive和material，实际1draw。合并后剔除粒度变粗。 |
| 动态网格更新      | [batching-dynamic](../../examples/batching-dynamic/) | 预分配typed arrays，`Mesh.updateSubMesh`更新顶点；本例1draw，但每帧仍有CPU计算和上传。 |

共享路线额外支持 `?instancing=1`，通过原生 `USE_INSTANCING` 比较GPU实例化，不需要内部 InstancedBuffer 直接装配。
当前同组1024实例上限会拆批；本例256实例1draw、2048实例2draw，不能推广成任意规模恒1draw。

## 运行与选择

```bash
npm run build
npm run dev -- --example batching-shared --port 7454
```

同一服务上分别打开 `/examples/batching-shared/?count=256`、
`/examples/batching-merged/?count=256` 和 `/examples/batching-dynamic/?count=256`。
shared路线限制最多4096节点，merged/dynamic限制100000quad，非法count立即报错。

决策顺序：

1. 需要逐对象业务状态或独立剔除：先共享mesh/material；shader支持时启用GPU instancing。
2. 变换固定且几何/材质兼容：按空间分区合并静态网格，避免一个覆盖整个世界的bounds。
3. 粒子或程序化顶点每帧变化：动态typed array路线；能用单顶点point表示时另见 [原生点图元](custom-shaders.md#8-原生点和线的图元合同)。

## 容量、bounds与所有权

动态入口为 `utils.MeshUtils.createDynamicMesh`，初始 geometry 必须有有效属性数据，容量由
maxSubMeshes/maxSubMeshVertices/maxSubMeshIndices明确给定。每个quad使用4顶点/6索引；
超过65536顶点时选择Uint32索引，不能把索引强塞回Uint16。
更新复用同一typed array并维护活跃数量与bounds，本例bounds覆盖波动后的所有顶点。

静态几何可提供minPos/maxPos或用calculateBounds生成。
缺少bounds不一定使主相机不可见，但会影响剔除与阴影；错误bounds会裁掉有效几何。
`primitives.quad()` 是单位XY面，尺寸使用节点scale；plane是XZ面，不能套用XY朝向。
更多细节见 [API行为合同](api-behavior-contracts.md)。

三个示例的 `__lifecycle()` 实际停止更新、销毁节点/mesh/material并重建，检查旧资源无泄漏、重建有有效像素。
共享资源由场景所有者一次释放，不在每个节点上重复destroy；合并路线不保留不再使用的源网格副本。

## 本轮固定条件测量

2026-10-03，Chromium 149.0.7827.55 / WebGL2，1280×720 backing、DPR1、120个采样帧、30帧预热，N=1。
CPU：AMD Ryzen AI 9 HX 370；渲染器：ANGLE / NVIDIA GeForce RTX 4060 Laptop GPU / D3D11。
当前候选bundle SHA前缀`006ae858d4e75dcb`、共享源码SHA前缀`181c96f75142e4a4`；完整输入SHA、PNG SHA与120份原始帧样本存于
[scoped browser证据](../evidence/recipes/competitive-batching/browser.json)。早期`86709c46`诊断记录不作为本表依据。
绘制数读取实际device.numDrawCalls；独立观察器在BEFORE_DRAW/AFTER_DRAW记录提交和帧间隔，
更新成本另读统一示例的测量值。GPU/present明确未测得，以下不是跨设备性能上限。

| 路线 / quad数              | 实际draw | CPU提交p95 ms | 动态更新p95 ms | rAF间隔p95 ms |
| -------------------------- | -------- | ------------- | -------------- | ------------- |
| shared / 256               | 256      | 1.90          | 0              | 17.40         |
| shared + instancing / 256  | 1        | 1.20          | 0              | 17.20         |
| shared + instancing / 2048 | 2        | 3.70          | 0              | 18.30         |
| merged / 256               | 1        | 0.60          | 0              | 17.00         |
| merged / 50000             | 1        | 0.60          | 0              | 17.10         |
| dynamic / 256              | 1        | 0.60          | 0.20           | 17.00         |
| dynamic / 50000            | 1        | 0.60          | 2.60           | 17.90         |
| dynamic / 100000           | 1        | 0.60          | 5.00           | 18.70         |

所有行通过真实像素与资源释放检查；dynamic另检查持续帧差。
相同256quad的shared/instancing/merged画面均为116900个绿色像素，避免只比字段而漏掉少绘制。
高密度场景有亚像素覆盖差异，本轮不把像素数简单解释成粒子数。

GPU耗时与显示present时间均未测得，报告明确为null。60Hz附近rAF只说明回调节奏，
不证明GPU余量、屏幕真正呈现或“10万quad稳定60fps”。生产预算从已测规模起步，
补目标设备GPU/present、透明overdraw、材质与阴影开销后再确定上限。

开发工具可在控制台调用 `await window.__batchProbe.measure(120)` 重采同口径；
`window.__trialProbe` 是像素/draw就绪合同，`window.__lifecycle()` 是释放/重建合同。
上述只属于本Recipe范围，不替代汇总Golden/Catalog/30条Recipe的全量门禁。
本次3条Recipe通过同名gate的显式competitive-batching范围：

```bash
node tools/benchmark/recipes/run-competitive-batching.cjs
node tools/verify/recipe-review-gate.cjs --scope=competitive-batching
```

runner只读现有bundle/示例，写本scope的browser.json与8张PNG；gate只校验完整指纹、固定条件、原始样本和实际像素/释放证据，
写 [scoped gate报告](../evidence/recipes/competitive-batching/review-gate.json)。默认不带scope仍要求legacy30历史输入，不恢复或伪造已删证据。
本scope PASS不表示Golden/Catalog/旧30Recipe全集PASS。
