# 动态 Mesh 与屏幕投影

## 2026-10-19 选定矩阵修复

显式 --browser=webkit|chromium|firefox 现在验证该引擎完整 37 个切割/resize/offset 场景，加 ribbon、mesh、lifecycle 与三种普通入口；默认 all 仍要求完整三引擎。selectedScopePassed 与 scopePassed 分开，误差预算不变，shared helper 与 auditor 纳入身份。

本地 37974d6e runtime + 工作树工具的 WebKit 37+7 行通过，30/30 实际报告篡改拒绝，见公开技术摘要 docs/evidence/sdk-backlog/geometry-webkit-local-20261019.json。下一提交的同 head Chromium 由 SDK CI 验证。下面 WebKit 26.6 的旧观察仅解释旧报告，不能作为当前失败的原因；当前原 soft/Water 素材比对仍单独待验。

IER-04（原 ENG-04）示例：[interactive-geometry](../../examples/interactive-geometry/README.md)。运行 `npm run dev -- --example interactive-geometry`，使用 `?mode=mesh|cut|ribbon` 选择入口。普通页面使用原生 pacer；只有 `?test=1` 使用已有 `createStepClock`。

## 两条网格路径

静态网格使用 `utils.createMesh({ positions, indices })`。动态网格在 `createAirApp()` 后调用 `utils.MeshUtils.createDynamicMesh`，显式指定容量，索引使用 `indices16` 或 `indices32`。本例每帧只更新 positions，保留原索引；随后调用已绑定 renderer 的 `onGeometryChanged()`。真实 struct bounds 与运动 PNG 分别记录。

```ts
const mesh = utils.MeshUtils.createDynamicMesh(0, { positions, indices16 }, undefined,
    { maxSubMeshes: 1, maxSubMeshVertices: 4, maxSubMeshIndices: 6 });
mesh.updateSubMesh(0, { positions: next });
renderer.onGeometryChanged();
```

`validateGeometryUpdate` 在调用 SDK 前检查结构、容量、有限数值、布局和索引范围；接受 typed arrays，同时出现两套索引键时拒绝。这是示例防护，不是 SDK 原子更新承诺。本示例使用 unlit、不提交 normals；法线和索引保留合同另由已有 K0 原生合同测试覆盖，不能把 positions-only 示例写成三通道更新实证。

## 从收到的事件到切面

`PointerEvent.clientX/Y` → 实际 canvas rect → canvas 内 CSS（左上原点）→ 有效 backing/viewport（相机 screen 原点在左下，仅此处翻转 y）→ `Camera.screenPointToRay` 两射线 → `planeFromRays` → 与 z=0 平板边缘求交。

透视两射线共享眼点，正交两平行线也能定义平面。共线、零向量、异面或非有限输入明确拒绝；不使用固定高度平面再垂直外推。

输入轨迹、切面和动画刀刃分别上传 Float32 顶点。采集器用实际 camera VP、viewport、backing、节点平移及原始 down/up 重新计算：轨迹端点距离、每个切面顶点到延长刀线的最大/平均距离、刀刃中心到刀线段的距离。原始事件的 client/CSS、代次、序号和提交时相必须一致，自报 error 标量不作为通过依据。

0.15 CSS px 是这个新平板场景的冻结设计目标；刀刃另用 1.5 CSS px。原 soft 13 场景和历史最大 0.145752px 未复现，`sourceStatus=recreated`、`referenceComparison=NOT_RUN`。本例不实现软体求解器或通用断裂系统。

切面几何是平板与切平面的交点链及极窄条带。用于人眼观察的宽红色 overlay 单独标 `decorative`，不拿它替代切面顶点误差。覆盖层通过 pass 顺序和深度状态分层，保持测量对象在 z=0；移动覆盖层的 z 会在斜视下引入投影偏差。

## 取消和释放

Reset、Escape、已收到的 resize 推进 session。旧 down 对应的 up 被拒；重建的 scratch mesh 初始无索引，旧刀线不再绘制。十轮 reset 对退役四 mesh 分别读取 1→0，对保留的六资产读取 1→1，owned 数量恒定；不能用新 mesh 的引用冒充旧 mesh 退役。

Release 先解绑所有借用 renderer，再 decRef 自有资产、移除节点、解绑 AFTER_DRAW 和 DOM 控件监听，最后关闭 app。重复 release 返回同一 Promise；退役后的 step 拒绝 `GEOMETRY_DISPOSED`，按钮禁用。普通模式的三入口另验原生帧前进和真实 Reset/Escape/Release，不以定步报告替代用户入口。

## 雨线与呈现边界

ribbon 的屏幕空间点经实际相机投到世界，动态顶点每帧更新。三角形绕序必须朝向相机；本批曾因 -Z 绕序被剔除，修正为 +Z 后保留背面剔除。DPR1/2 的可见 PNG 和运动质心由 collector 独立解码重算。

WebKit 26.6 的活 resize 呈现限制有独立无 SDK 对照：纯 WebGL2 连续清红，resize 后 GPU `readPixels` 仍红、无错误或 context loss，但 compositor PNG 为白色。SDK 场景的相同空白行必须保留失败；不能仅因 CPU 几何、提交回执或 GL 回读正常而标通过。该证据不构成已定位到 SDK 核心的缺陷。

## 验证入口

`node tools/verify/interactive-geometry-browser.cjs --browser=all --out=<new.json>` 写新 JSON 和相邻 PNG，关闭自有浏览器/服务器；`--verify=<report.json>` 只读重验当前身份、PNG、原始输入与范围。三引擎各 37 行：透视/正交 × DPR1/1.25/2 × 默认/低角/斜视 × baseline/live resize，加一个容器偏移。

`node tools/verify/interactive-geometry-audit.cjs --report=<actual.json> [--out=<new.json>]` 只读实际报告，在内存植入篡改；显式 out 用 wx 写新文件，不运行浏览器。仅预期受限 FAIL 的报告可以是结构合规，完整 scope 仍不通过。PNG、失败尝试和执行渠道见[证据目录](../evidence/examples/interactive-engine-improvements/README.md)。GPU 物理内存/时间不可用，`inspectAirGeometry` 抽样不等于完整拓扑认证。

本包消费者副本及安装说明见[interactive-kit](examples/interactive-kit/README.md)；上面的examples路径和dev命令适用于仓库检出，不假设npm包带开发服务器。
