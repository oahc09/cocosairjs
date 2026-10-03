# 灯型、阴影与当前复现范围

默认WebGL2 legacy管线的阴影入口取决于灯型，不能从灯光可用推导该灯可生成阴影。

本页使用稳定边界ID：`AIR_SHADOW_POINT_UNSUPPORTED`表示默认点光阴影通路缺失，
`AIR_SHADOW_PLANAR_ROI_NOT_VERIFIED`表示本例Planar未取得可判定ROI变化，
`AIR_SHADOW_SPOT_RUNTIME_NOT_SAMPLED`表示本轮未对Spot单独取证。
这些是渲染合同的检索ID，不是glTF扩展；不向GLTFLoader扩展能力表塞入虚构扩展名称。

| 灯型                   | 平面投影                          | ShadowMap                      | 当前依据                                                            |
| ---------------------- | --------------------------------- | ------------------------------ | ------------------------------------------------------------------- |
| 主DirectionalLight     | 由scene.mainLight方向投影到单平面 | 主光fixed area/CSM路径         | 原生queue源码；本轮campfire fixedscene验证ShadowMap像素变化，无全黑 |
| SpotLight              | 不作为Planar投影源                | 支持启用shadow的Spot通路       | ShadowFlow收集LightType.SPOT；本轮未对Spot单独取证                  |
| PointLight             | 不作为Planar投影源                | 当前不支持                     | 渲染PointLight源码明确说明不生成阴影；不能用Spot结果代替点光        |
| SphereLight            | 不作为Planar投影源                | 未提供默认球面阴影通路         | ShadowFlow未收集该灯型                                              |
| RangedDirectionalLight | 不作为scene.mainLight投影源       | 未提供本矩阵的默认主光阴影合同 | 不把局部方向照明等同于CSM主光                                       |
| Ambient                | 无                                | 无                             | 环境照明，不是阴影投影光源                                          |

源码：[ShadowFlow](../../src/cocos/rendering/shadow/shadow-flow.ts)、
[PlanarShadowQueue](../../src/cocos/rendering/planar-shadow-queue.ts)、
[PointLight](../../src/cocos/render-scene/scene/point-light.ts)。
caster、receiver、有效bounds、shadow配置、bias与平面位置仍须匹配；
无bounds的模型在方向阴影剔除队列中会被跳过。

## ShadowMap黑化复核

历史E10报告包含ShadowMap黑化，但它不能代表当前所有材质。
本轮 [campfire-night](../../examples/campfire-night/) 固定相机、HDR曝光、方向光50000、环境12000与火光495lm：
无阴影环境分区平均RGB为(67.17,85.90,46.63)，ShadowMap为(49.98,56.38,29.35)，
仍有37674个亮像素；主光阴影使环境变暗，没有变成全黑。
因此本轮没有复现该固定程序化场景的“全黑”；不能据此宣布历史Fox glTF路径缺陷已修复。

Planar在本轮选定ROI未取得可判定像素变化，尽管设置了caster、接收平面和bias。
其原生通路存在，本例尚未证明Planar视觉正确；继续定位时应记录投影范围与接收平面，不能把字段赋值当作验收。
独立记录：`output/playwright/competitive-shadow-map-probe.json`。
这些属于Chrome/WebGL2当前场景范围，其他后端、Spot和自定义管线仍需各自证据。

## 当前安装包的Fox补证

已离线npm安装当前冻结tarball,对照工作区、安装包与min包,在Chromium/Firefox/WebKit分别检查glTF标准效果、方向ShadowMap和原生builtin-standard纹理控制,共27条件通过。记录位于 `docs/evidence/examples/competitive-benchmark/package-fox-shadow/browser.json`,包含包、SDK、查看器、模型和验证器SHA。

固定方向光和相机下,Fox无阴影平均RGB为(93.33,79.31,58.46),ShadowMap为(70.33,65.72,50.73),亮像素比例仍为0.855,没有全黑。验证器按模型尺度配置fixed area与near/far,确认实际shader的cc_shadowMap sampler存在。该结果补齐当前带贴图骨骼GLB的包消费范围,仍不证明任意阴影参数、Planar或Spot组合都正确。
