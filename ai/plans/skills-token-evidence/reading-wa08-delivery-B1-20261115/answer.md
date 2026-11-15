# B1 诊断答案

先核对光照单位、HDR/LDR 分支与实际 mainLight，再按全局、灯、投射物、接收物四层检查阴影开关。以下是冻结文档的诊断结论，没有运行当前场景，因此不是当前场景的浏览器 PASS。

## 亮度

依据：`skills/cocosair-rendering/references/lighting-units.md`。

- `DirectionalLight.illuminance` 使用 Lux（lx），组件 HDR 默认值为 65000。HDR 写入为 illuminance × camera.exposure；LDR 使用 illuminanceLDR，不再乘 exposure。`Ambient.skyIllum` 同样在 HDR 乘 camera.exposure，LDR 使用 skyIllumLDR。
- `PointLight`、`SphereLight`、`SpotLight` 区分 `luminousFlux`（光通量，lm）与 `luminance`（亮度，nt）。`nt2lm(size) = 4 * PI * PI * size * size`；HDR luminousFlux setter 先除以 nt2lm(size)，再按 luminance 写入。Point 的转换固定用 size=1，Sphere/Spot 用各自 size，不能混用尺寸。
- 三种局部光在 HDR 都写入 luminance × camera.exposure × standardLightMeterScale；`standardLightMeterScale = 10000`，并非仅 Spot 使用。LDR 写入 luminanceLDR；LDR luminousFlux setter 直接保存 LDR 标量。`Camera.standardExposureValue = 1 / 38400`。
- 灯光组件 `Light.color` 必须传 `Color` 实例，RGB 通道使用 0..255，内部除以 255；不要把 0..1 浮点直接当作组件通道。非 Color 会抛出 `AIR_E_LIGHT_TYPE`。
- legacy forward 普通方向光只有一个有效 `renderScene.mainLight`；第二盏普通方向光不会叠加照明，可能出现一次性 `AIR_W_DIRECTIONAL_LIGHT_LIMIT` 警告。用 `inspectAirDirectionalLights(scene)` 检查 `status`、`mainLight`、各项 `effective`，其 ordinaryDirectionalCapacity 为 1。该 inspector 只报告身份，不检验像素，也不覆盖自定义管线或 ranged directionals。

## 阴影

依据：`skills/cocosair-rendering/references/shadow-matrix.md` 及 owner `skills/cocosair-rendering/SKILL.md`。

默认 WebGL2 legacy pipeline 的支持边界：

| 光源 | Planar | ShadowMap |
| --- | --- | --- |
| 主 DirectionalLight | 沿 mainLight 方向投射到单一平面 | 支持 fixed-area / CSM 路径 |
| SpotLight | 不是平面投影源 | 有 shadowEnabled 支持路径，但该轮未独立采样验证 |
| PointLight | 不是平面投影源 | 不支持，AIR_SHADOW_POINT_UNSUPPORTED；没有仓库内 workaround，不能用 Spot 的结果替代 Point 证明 |
| SphereLight | 不是平面投影源 | 没有默认 sphere shadow 路径 |
| RangedDirectionalLight | 不是 mainLight 平面投影源 | 此矩阵没有默认主阴影契约 |
| Ambient | 无 | 无 |

方向光 ShadowMap 的必要检查：

1. 全局 shadows.enabled 为 true，shadows.type 必须为 ShadowType.ShadowMap；ShadowType.Planar=0，ShadowMap=1。默认全局 enabled=false，内部默认 type=2 是 none 状态；不要假设存在可直接用的 ShadowType.None。
2. 生效的 main DirectionalLight.shadowEnabled=true，默认是 false；额外普通方向光不能代替 mainLight 投影。全局或灯光关闭时可能静默没有阴影，不应依赖警告出现。
3. 投射物 MeshRenderer.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON；接收物 receiveShadow=true。
4. 检查模型有效 bounds，缺少有效包围盒会被方向光阴影裁剪队列跳过。
5. 检查阴影覆盖范围：shadowFixedArea 时核对 shadowNear、shadowFar、shadowOrthoSize；CSM 路径核对 csmLevel、csmSupported、shadowDistance。shadowDistance 默认 50，shadowFixedArea 默认 false，csmLevel 默认 LEVEL_4；csmLevel>1 且 csmSupported 才启用 CSM。shadowNear 默认 0.1，shadowFar 默认 10，shadowOrthoSize 默认 5。再按伪影调 shadowBias、shadowNormalBias、shadowPcf，而非以调参替代必要开关。

Spot 只暴露 shadowEnabled、shadowPcf、shadowBias、shadowNormalBias 四个阴影字段，不具备方向光的 CSM/fixed-area 等参数；方向光的 shadowDistance、shadowNear/Far/OrthoSize 和 CSM 字段不能给 Point/Sphere 创造阴影路径。赋值若发生于原生 light 创建前，只先保存组件字段，不代表当时已经产生管线效果。

Planar 路径虽存在，但文档该轮没有得到可判定 ROI 像素变化（AIR_SHADOW_PLANAR_ROI_NOT_VERIFIED）；应记录投影范围、接收平面及 bias 并验证实际像素。Spot 为 AIR_SHADOW_SPOT_RUNTIME_NOT_SAMPLED。主方向光已有的 ShadowMap 像素证据仅对应文档记录的 campfire-night 固定场景与旧指纹，不能据此宣称当前场景通过。ShadowType、PCFType、CSMLevel、Shadows 在所读 bundle 表中不是顶层 ESM 导出，不应编造顶层导入。
