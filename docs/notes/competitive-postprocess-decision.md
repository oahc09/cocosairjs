# Code First 后处理实施决策备忘录

对应[竞争力任务 CB-06](../../ai/plans/competitive-benchmark-remediation.md)。状态:方案待选择,不代表后处理已可用。

当前默认启动走 legacy 管线。game.init 根据 rendering.customPipeline 决定是否保留 cclegacy.rendering;自定义管线注册出口会设置该命名空间,但 AIR 聚合入口没有自动装配。既有 [owner 决议 #6](../reference/owner-decisions.md)选择了变体构建证据,因此本轮先给出可审查方案。

## 方案 A:显式 opt-in 后处理

- 公共入口为 createAirApp({ canvas, pipeline: 'custom' }),未指定时保持现有默认行为。注册必须在 game.init 前完成,设置 customPipeline 与内置 builder 名称,失败时明确拒绝启动。
- 复用原生 custom/post-process 模块与其 builder、pass、相机组件,不另建渲染器。需验证 builtin effect 注册与布局初始化的先后关系;注册不等于渲染链路可用。
- 首批交付 tone mapping、FXAA 与 bloom 的可用配置和示例。顺序由 HDR/线性颜色、输出编码和抗锯齿的输入合同确定,不按计划原稿的顺序字符串直接拼装。
- 验收采用固定相机、灯光、曝光和场景:每个效果分别开/关的像素对照;验证亮部 bloom 外溢、曝光响应与抗锯齿边缘,不能仅以 diffPixels>0 判定正确。覆盖 Chromium/Firefox/WebKit 和 legacy 默认回归。
- 不改变默认启动,但会新增公共启动选项及原生初始化路径,需要重新构建声明并做包消费者回归。其他后处理效果不因首批通过就自动宣称支持。

## 方案 B:保持现有管线,交付 Recipe

- 将 bloom-impostor、blob shadow 与烘焙接触阴影作为明示边界的 Recipe,给出原生几何/材质示例及固定场景像素验证。
- bloom-impostor 是物体/光晕装配方案,不能替代任意画面高亮的屏幕空间 bloom;不宣称已交付 FXAA 或 tone mapping 链。
- 更新手册与能力描述,保留后处理运行链路未交付的状态。

## 决策与后续

两条路线均不阻塞 transmission、输入、uniform 和 glTF 修复。选择后在 owner-decisions 中记录本轮授权、交付边界及验证结果;未收到选择前不将历史 #6 改写为新批准。
