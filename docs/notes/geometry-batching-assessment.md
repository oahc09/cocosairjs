# 原生实例化、点图元与动态 quad 封装评估

CB-20 的结论是：底层能力已经存在，首要缺口是装配成本和合同说明。
不建议为了与其他引擎名称一致，再新增平行的 Scene/Node/Mesh 抽象。
本报告给出下一步建议，不代表 owner 已批准新的 SDK 类型。
建议与CB-04B当前范围统一记录在 [实现方建议表](../reference/owner-decisions.md#12-竞争基准回灌的实现方建议2026-10-03)，
owner批复栏保留为未取得批复，不以本报告代替授权。

| 能力           | 当前实现与验证入口                                                                                                                                                                                                                         | 限制                                                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GPU instancing | `Material.initialize({effectName:'builtin-unlit',defines:{USE_INSTANCING:true}})` + 共享 MeshRenderer mesh/material。Pass检查设备 INSTANCED_ARRAYS；渲染队列合并 instance buffer。`batching-shared/?instancing=1` 提供实际像素与draw计数。 | shader必须包含实例矩阵属性；不同mesh、pass、lighting map、probe配置、stride会拆批。当前buffer每组最多1024实例，不能普遍承诺1 draw。CPU仍维护节点、剔除与提交。 |
| 原生 points    | `POINT_LIST` geometry + 匹配 effect pass，vertex写 `gl_PointSize`；片元可使用 WebGL2的 `gl_PointCoord` 绘制点内形状。`point-cloud-basics` 已使用真实点图元。                                                                               | 缺少便捷Points对象不等于缺少point-sprite。大小受设备范围限制，单位为backing像素；点中心裁剪、透明排序与quad不同。                                              |
| CPU动态网格    | `utils.MeshUtils.createDynamicMesh` + `Mesh.updateSubMesh`。`batching-dynamic` 显式预分配typed arrays、容量与bounds，并验证真实帧差和释放。                                                                                                | 每帧更新会上传CPU顶点，四顶点quad与单顶点point带宽不同；不能忽略属性、索引、重传频率及多pass成本。                                                             |
| 逐实例数据     | MeshRenderer有原生实例属性更新入口，shader可声明并消费实例属性；instancing并不强制所有动作都重写quad顶点。                                                                                                                                 | 自写GPU运动shader、逐实例生命周期和发射器需要独立验证，不能由本批静态实例化测试推导已提供完整GPU粒子系统。                                                     |
| GPU剔除        | 本批的原生节点路线经过CPU场景剔除和instance分组。                                                                                                                                                                                          | 未验证一个GPU逐实例剔除/间接绘制合同；WebGL2运行时不能以compute示例代替该交付。                                                                                |

源码依据：[Pass的instancing选择](../../src/cocos/render-scene/core/pass.ts)、
[InstancedBuffer分组与容量](../../src/cocos/rendering/instanced-buffer.ts)、
[实例化渲染队列](../../src/cocos/rendering/render-instanced-queue.ts)、
[mesh动态更新](../../src/cocos/3d/assets/mesh.ts)。

建议决议：

1. 保持原生 instancing 路线，补官方示例与分组说明；不直接将内部 InstancedBuffer 作为面向业务的资源所有者。
2. Points helper可作为AIR可选装配函数进一步评估，产出仍为原生 Node/Mesh/Material；必须同时设置mesh与pass、检测设备点大小、明确透明排序和释放。
3. DynamicQuadBatch可在另立计划后封装为可选组件：固定最大容量、typed array复用、活跃数、32位索引切换、bounds更新、共享材质和dispose合同。当前示例提供可复用路线，不宣称该组件已实现。
4. GPU粒子/逐实例动画/剔除作为独立能力项规划，不由“100k quad页面仍有rAF”推导性能或完整生命周期已达标。

测量方法与数字见 [批处理Recipe](../manual/batching-recipes.md)。
预算是固定场景的观察值，既不是设备通用上限，也不是新增能力的决策授权。
