# 光照单位与固定夜景标定

先固定 `pipeline.pipelineSceneData.isHDR`、相机曝光和材质，再比较光强。
不存在一个适用于所有材质、光源和场景的“8–14”补偿系数。
HDR/LDR在本页描述光照参数如何写入UBO，不代表默认管线已开启浮点后处理或tone mapping。

| 输入                         | HDR写入的强度                                         | LDR写入的强度                                           |
| ---------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| DirectionalLight.illuminance | illuminance × camera.exposure                         | illuminanceLDR，不再乘曝光                              |
| Ambient.skyIllum             | skyIllum × camera.exposure                            | skyIllumLDR，不再乘曝光                                 |
| Point/Sphere/Spot的luminance | luminance × camera.exposure × standardLightMeterScale | luminanceLDR                                            |
| HDR局部光luminousFlux        | setter先除nt2lm(size)，再按上一行写入                 | LDR setter直接保存LDR亮度标量，不能按同名属性推导物理lm |

源码中的 `nt2lm(size)=4π²size²`；PointLight使用size=1，Sphere/Spot使用组件size。
标准曝光为1/38400，局部光meter scale为10000；该10000同时用于Point/Sphere/Spot，
不是Spot专属放大器。对应位置：[相机常数](../../src/cocos/render-scene/scene/camera.ts)、
[主光与环境UBO](../../src/cocos/rendering/pipeline-ubo.ts)、
[局部光UBO](../../src/cocos/rendering/render-additive-light-queue.ts)。

相同UBO标量的换算只在固定曝光下成立：
Directional/ambient的LDR值取HDR值×曝光，局部光取HDR luminance×曝光×meter scale。
切换HDR/LDR使用不同存储槽，必须按当前模式重新设置对应参数；不能仅翻一个开关保留同一数值。
颜色使用组件Color setter，方向与位置遵守各光源原生接口；光照距离衰减、材质粗糙度、遮挡仍会改变画面。

## 篝火夜景标定例

[campfire-night](../../examples/campfire-night/) 按公开E06 Scene Spec原创实现，只有程序化网格。
14棵树、20只萤火虫、32片火苗和48个火星围绕真实PointLight，日夜以3秒连续渐变，环绕可暂停。
不读取基准私有Reference，也不把该案例称为已通过外部全部验收。

| 参数                         | 深夜                      | 日间  |
| ---------------------------- | ------------------------- | ----- |
| isHDR / camera exposure      | true / 约0.00002604165625 | 同左  |
| Directional illuminance      | 2500                      | 50000 |
| Ambient skyIllum             | 1800                      | 12000 |
| Fire PointLight luminousFlux | 900 × fireLightIntensity  | 同左  |
| Fire范围 /颜色               | 7 / Color(255,115,35)     | 同左  |

冻结相机和粒子、只改变火光强度0.15→0.95时，环境分区平均RGB从
(11.53,12.48,8.58)变为(27.44,20.62,10.64)，暖色像素2182→18677。
该分区位于屏幕x30%–70%、y58%–85%，用于检查火光影响地面与周围物体，不能以火苗自身变亮代替。
日间同分区变为(73.63,89.60,47.54)。本轮Chrome/WebGL2固定1280×720、DPR1；
独立读数记录于 `output/playwright/competitive-campfire-calibration.json`，GPU/present性能未测。

示例的 `__nightProbe.units()` 返回当前真实模式、曝光及输入数值；`capture()`在AFTER_DRAW读取分区。
freeze/setDay/setFire仅供明确调用的标定，日常UI与 `__bench.getState()` 则读取实际动画状态。
资源释放检查覆盖mesh/material销毁与重建，光源和相机由场景持有。
