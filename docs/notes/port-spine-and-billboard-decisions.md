# 端口 Spine、UI mesh 与 Billboard 决策备忘录

2026-10-03提出方案，2026-10-04用户已决议，对应[统一计划](../../ai/plans/port-gap-remediation.md) PG-04/11/25。正式决议见[owner清单第13节](../reference/owner-decisions.md#13-端口缺口范围决议2026-10-04)。下文方案比较保留为决策依据。

本轮确定：**Spine 2.1不支持；PG-11实施UI-mesh薄封装；PG-25公开原生Billboard**。不实施2.1转换器、兼容解析层或外挂播放器。通用图集、字体和UI mesh不依赖Spine支持；3.8/4.2现有边界保留。原生Billboard和UI mesh仍须完成实现与运行验证。

## Spine 2.1：转换不是部署

端口报告使用2.1.27 JSON，自制播放器处理region/mesh、setup bounds、delay=0混帧。原始资产和播放器都不在本仓，无法据报告复核数值等价。当前原生Spine声明/抽取代码支持3.8/4.2版本，但默认 `air-spine-instantiate-js.ts` 是未部署后端的提示桩；`spine-core.js` 主要是枚举，实际WASM/ASM缺失。不能把生成3.8 JSON视为AIR当前可播放。

| 方案 | 交付 | 代价与验收 |
| --- | --- | --- |
| 维持端口播放器，明确边界 | 本仓给atlas/font、合法mesh及输入/资源配方；端口继续负责2.1时间线、skin、混帧与渲染 | 最快不改已有动画语义。仍是应用播放器，不能声称原生Spine2.1支持；必须取得端口材料后验收其替换/资源回收 |
| 离线2.1→3.8转换器 | `tools/` 中显式schema转换、无法转换项拒绝、来源/哈希清单；部署匹配原生3.8后端后加载转换资产 | region/mesh/skinnedmesh、skin结构、加权顶点、transform继承、曲线/混合语义都需真实正负例。需要端口资产及可部署原生后端；缺一项只可交付转换工具测试，不能给原生播放PASS |

建议当前保留端口播放器。要统一到原生链时，选择转换器并提供实际资产与后端材料，再按region+加权mesh、混帧、setup bounds和资源释放逐项验收；不做猜测式有损转换。

## UI贴图三角形：不能改debug draw

GeometryRenderer只处理debug几何，给其加UV会改变错误层。用户可选择两种具体范围：

| 方案 | 交付 | 边界 |
| --- | --- | --- |
| 原生Mesh+MeshRenderer+unlit配方 | 带UV的三角形、共享纹理、明确坐标/层/相机、独占资源清理与实际像素；依赖现有稳定公共API | 不承诺参与2D Sprite batch、Mask或UI draw排序。适合作为任意贴图mesh的明确过渡方案 |
| AIR UI-mesh薄封装 | 原生UI组件/assembler装配，接入既有batcher、mask/材质/排序/脏标记；纹理引用和dispose明确 | 必须验证2D批处理内部合同及负例，维护面更大。转换器并不自动消除应用自定义mesh需求，也不能声称等价Spine renderer |

建议首批Mesh配方。若端口必须让mesh与Sprite/Mask混排，才选择UI-mesh封装；两者按所选范围验收，保留另一方案未交付事实。

## Billboard：专用渲染组件与节点朝向不同

`src/cocos/particle/billboard.ts` 存在原生组件。其直接依赖Mesh、Material/Texture2D、Component、GFX/Core/Model，使用已注册的default-billboard-material；直接导出该文件不应通过particle/index引入整套3D粒子入口。当前默认公共入口尚未导出它，静态依赖存在不代表运行验收。

| 方案 | 交付 | 验收/兼容影响 |
| --- | --- | --- |
| 直接公开原生Billboard | 在现有AIR导出薄接线，保留原生名字、texture/width/height/rotation/technique；不新造平行Billboard类型 | 默认bundle增加该小闭包；检查无完整3D粒子闭包，d.ts/npm消费者能导入，移动相机下实际像素与销毁正确。现有builtin属性若不匹配需复现后修复 |
| 仅节点朝向配方 | 用已有Node世界姿态/相机基向量，让应用的quad或节点朝向相机 | 不增加默认组件。任意节点的旋转与专用shader billboard不同；不能声称原生Billboard已可达，也不包含它的technique/尺寸语义 |

建议公开原生Billboard并验证小闭包，另保留节点朝向配方供应用选择。两条路线不替换彼此，不能通过给节点lookAt就标专用组件PASS。

以上建议是决议前的历史评估；执行以页首范围和owner第13节为准。本页不授予部署、发布、提交或外部应用修改权限。
