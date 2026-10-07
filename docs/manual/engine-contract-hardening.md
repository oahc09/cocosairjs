# 网格、变换与渲染合同检查

使用原生 Mesh、Node、Material、Animation 和 DirectionalLight。接口不会自动改为循环播放、启用顶点色、关闭剔除或叠加方向光；检查结果与实际像素分别验证。

## 动态网格创建和局部更新

等待 `createAirApp()` 完成后创建。原生 `utils.MeshUtils.createDynamicMesh` 缺省容量仍为一个子网格、1024 顶点、1024 索引。显式 options 必须包含 maxSubMeshes、maxSubMeshVertices、maxSubMeshIndices；前两者为正安全整数，索引容量可为零。预留超过 512 MiB 明确拒绝，不能靠错误键或缺字段创建空网格。

```ts
const mesh = utils.MeshUtils.createDynamicMesh(0, {
  positions: new Float32Array([-1,-1,0, 1,-1,0, -1,1,0]),
  uvs: new Float32Array([0,0, 1,0, 0,1]),
  indices16: new Uint16Array([0,1,2])
}, undefined, { maxSubMeshes: 1, maxSubMeshVertices: 3, maxSubMeshIndices: 3 });

// 更新 UV，保留 positions 和索引；按语义找 stream。
mesh.updateSubMesh(0, { uvs: new Float32Array([0.1,0.1, 0.9,0.1, 0.1,0.9]) });
// Mesh的数据与已创建的Model/输入装配器分别维护。
// 对每个借用此mesh的renderer同步绘制数量与包围盒。
renderer.onGeometryChanged();
```

静态 createMesh 使用 indices，动态创建/更新使用 indices16 或 indices32；混用字段、同时传两种宽度、越界索引明确报错。已有索引缓冲的宽度不能通过一次 update 改变。省略索引保留原有数据；显式空 typed array 把索引绘制数量设为零。创建时提供空 positions/indices typed array 仍会预留对应 layout，之后可填入。

更新接受 Partial<IDynamicGeometry>。不允许新增未预留属性、改变拓扑、超容量或留下长度不一致的可绘制 stream。改变顶点数量时须让相关属性与保留索引继续有效。自定义属性按 attr.name 匹配，当前原生 Float32Array 通道要求 32-bit 组件布局。输入、layout、容量、索引和 bounds 在写入前完成预检；校验失败时 CPU 数据、drawInfo、bounds 与 GPU 更新调用保持原状。设备意外故障不承诺 GPU 事务回滚，创建时分配失败会清理已分配 buffer，留下可重试的初始化状态。

positions 更新没有显式 bounds 时会从新位置刷新包围盒。显式 minPos/maxPos 必须成对、有限、有序；业务自定义 bounds 的覆盖范围仍由业务保证。

更新后调用每个使用者的 `MeshRenderer.onGeometryChanged()`。只写 `mesh.updateSubMesh()` 不会更新已创建的输入装配器绘制数量和Model包围盒：特别是将索引清空时，mesh侧 `indexCount=0` 与旧装配器仍保留6个索引可以同时存在。此时旧三角形继续绘制，不是WebGL清屏失效。通知后两者同步归零，下一次受控绘制恢复背景。共享mesh有多个renderer时分别通知；不因这一步重传未改变的索引。

错误携带 code 和相关 primitiveIndex/attribute/capacity：AIR_E_MESH_CAPACITY、AIR_E_MESH_INDEX_KEY、AIR_E_MESH_INDEX_TYPE、AIR_E_MESH_INDEX_RANGE、AIR_E_MESH_ATTRIBUTE_COUNT、AIR_E_MESH_NOT_READY、AIR_E_MESH_GPU_ALLOCATION 等。错误在发布构建同样有效，不依赖 DEBUG 断言。

## Fog 保留配置

底层 Fog 在 disabled 时保存请求的 type；公开 getter 与 pipeline 宏仍为 FOG_TYPE_NONE。启用后恢复已选类型，关闭再启用不会丢失。scene.globals.fog 的 FogInfo 配置语义保持一致。只有合法 FogType 或 NONE 可写入，非法类型在修改前报 AIR_E_FOG_TYPE。

## 非法 TRS 不进入矩阵

原生 Node 的本地/世界 position、rotation、scale 及 setRTS 检查有限 float32 分量。setScale(new Vec3(2,2,2)) 和 setScale(2,2,2) 合法；setScale(2)、普通数组、NaN/Infinity 等无效调用得到 AIR_E_NODE_TRANSFORM，避免后代矩阵和 shader 被污染。零缩放仍允许，检查器会报告 singular。setRotationFromEuler 保持角度单位，不根据数值猜测弧度。

## 只读检查接口

| 接口                                                                      | 输出与边界                                                                                                                                                            |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| inspectAirMeshMaterial(mesh, material, primitiveIndex?, renderer?)        | 原生属性、pass 宏、混合/深度/剔除状态；提供 renderer 时读取实际 subModel shader variant 的 active 属性；否则只读 pass 基础 shader，未编译时 unavailable。不触发编译。 |
| inspectAirGeometry(mesh, node, material?, primitiveIndex?, maxTriangles?) | 实际 world matrix、负 determinant/奇异变换、局部三角形绕序与提供的法线点积；最多 1024 个三角形，不冒充相机朝向或全网格验证。                                          |
| inspectAirAnimationControllers(root)                                      | 通过原生 TrackPath 解析到实际目标和属性，列出不同控制器的潜在重叠；未知自定义路径单列，不初始化 state 或断言同时播放。                                                |
| inspectAirDirectionalLights(scene)                                        | 注册的普通方向光、实际 mainLight、当前 legacy-forward 普通方向光容量 1；custom pipeline 与 ranged directionals 不覆盖。                                               |

builtin-unlit 的已知合同会区分“有颜色但宏关闭”“宏开启但无颜色属性”“真实 GPU reflection 不消费颜色”“贴图开启但没有 UV”。缺 UV 可能是有意的常量属性，因此是 warning；自定义程序化 shader 不被强套 builtin UV 合同。设备/程序尚未有 reflection 时明确 unavailable，不能从声明推导已实际消费。

Native Animation 在同节点多个控制器 load/play 时经现有 warning 通道提示，仍允许组件存在；原始播放与 wrap 默认值不变。glTF 使用已有 Animation 和 instance.setAnimationLoop，不能直接修改共享 clip 来改变所有实例。跨节点潜在重叠通过检查器解析，不默认禁止不同控制器写不同属性。

第二盏普通方向光经 warning 通道说明容量边界。mainLight 的原生选择/移除策略不改变；需要叠加普通方向光属于独立管线能力扩展。warnings 用 createAirApp({ diagnostics: 'warnings' }) 显式启用，默认 errors 不增加告警噪声。

## 验证

CPU 回归检查实际数据、原生矩阵与 buffer 调用，并注入分配失败。浏览器探针以原生 framebuffer 像素检查顶点色、局部更新、负缩放、cull 覆盖和雾；声明字段成功不构成画面通过。

`node tools/verify/engine-contract-browser.cjs --out=<new.json>` 需要当前 bundle、Playwright 和浏览器，不构建、不下载，只写新报告与相邻原生 PNG；--browser=chromium 是子集。Windows WebKit 页面合成截图的既知 resize 缺陷不混算成 GPU 绘制缺陷；本探针标记 CANVAS_NATIVE，pageCompositorVerified=false，不提供显示器 present/FPS 证明。

当前实施与验收状态见[ENG 台账](../../ai/ledgers/engine-contract-hardening.md)。
