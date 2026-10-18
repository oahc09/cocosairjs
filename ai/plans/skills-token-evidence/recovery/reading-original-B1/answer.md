# B1：场景亮度与方向光阴影排查

主责为 cocosair-rendering。以下结论针对文档中的默认 WebGL2 legacy forward 管线；文档或导出存在不等于当前场景已经过浏览器像素验证。

## 1. 先核对光照单位和曝光

- DirectionalLight.illuminance 使用 Lux（lx），不能当作一个任意的 0～1 强度系数。组件 HDR 默认值是 65000；LDR 默认值是 65000 × standardExposureValue。getter 根据 pipelineSceneData.isHDR 选择 HDR 或 LDR 槽位。
- PointLight、SphereLight、SpotLight 使用 luminousFlux / luminance，不要和方向光的 illuminance 混用。HDR 的 luminousFlux setter 先除以 nt2lm(size) 转成 luminance；nt2lm(size) = 4 × π² × size²。Point 的 luminousFlux 换算使用 size=1.0，Sphere / Spot 使用各自的 size（默认 0.15）。局部灯默认 _luminanceHDR = 1700 / nt2lm(0.15)，range 默认 1；检查距离是否超出照明范围，Spot 还要检查角度（默认 60）。
- HDR 写入 UBO 时，方向光 illuminance 和环境光 Ambient.skyIllum 都乘 camera.exposure；Point / Sphere / Spot 的 luminance 还要再乘 standardLightMeterScale=10000。LDR 使用对应 LDR 槽位，方向光和环境光不再乘曝光，局部光写入 luminanceLDR。不要重复应用 HDR 曝光和光度计倍率。
- standardExposureValue=1/38400、standardLightMeterScale=10000 是 render-scene Camera 的常量，不要误以为导出的 Camera 组件直接提供这些静态字段。局部光 LDR 默认值是 HDR luminance × standardExposureValue × standardLightMeterScale。
- 检查 Light.color 是否是 Color 实例，组件 RGB 通道按 0～255 解释，而不是 0～1；非 Color 会抛 AIR_E_LIGHT_TYPE。也检查 useColorTemperature / colorTemperature 是否符合预期。

## 2. 确认实际生效的是哪一盏方向光

legacy forward 普通方向光只使用一个 scene.renderScene.mainLight。最后激活的方向光会成为 mainLight；再加一盏方向光不会叠加补光，反而会替换前一盏的效果。不要使用不存在的 Scene.mainLight 访问器。

调用 inspectAirDirectionalLights(scene)，查看 lights[].effective 和 mainLight 标识。它只报告身份，不判断亮度是否达标；场景尚无 native render scene 时返回 status='unavailable' 和空 lights。第二盏普通方向光注册时会出现一次 AIR_W_DIRECTIONAL_LIGHT_LIMIT 警告，但主光被替换后不一定反复提醒。需要补光时应考虑受支持的局部光类型。

## 3. 核对阴影类型支持范围

- 主 DirectionalLight：支持沿 mainLight 方向投射到单一平面的 Planar，以及 fixed-area / CSM ShadowMap。
- SpotLight：有 ShadowMap 路径，要求自己的 shadowEnabled；不是 Planar 的投影光源。文档本轮没有单独采样验证 Spot 的运行效果，不能据此宣称已通过浏览器验证。
- PointLight：不支持 ShadowMap，也不是 Planar 投影源。AIR_SHADOW_POINT_UNSUPPORTED 是契约标识；不存在文档内的点光阴影替代实现，Spot 的结果不能冒充 Point 支持。
- SphereLight：默认 ShadowFlow 不收集它，没有默认 sphere 阴影路径，也不是 Planar 投影源。
- RangedDirectionalLight：不是 mainLight Planar 投影源，也不在默认主方向光 CSM 阴影契约中。Ambient 不投射阴影。
- Planar 原生路径存在，但文档记录 AIR_SHADOW_PLANAR_ROI_NOT_VERIFIED：未得到可判定的 ROI 像素变化。需要记录接收平面、投影范围和偏移，不能把字段赋值当成功证据。Spot 的相应证据限制为 AIR_SHADOW_SPOT_RUNTIME_NOT_SAMPLED。

## 4. 方向光 ShadowMap 必须同时通过四个开关

```js
scene.globals.shadows.enabled = true;
scene.globals.shadows.type = 1; // ShadowMap；0 是 Planar
light.shadowEnabled = true; // light 必须是实际 mainLight
renderer.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;
```

四项分别是全局 enabled、全局类型 ShadowMap、灯光 shadowEnabled、投影模型 shadowCastingMode。全局 enabled 默认 false，scene.globals.shadows.type 默认 Planar，灯光 shadowEnabled 默认 false，MeshRenderer 的 shadowCastingMode 默认 OFF。漏一项就可能静默没有阴影，不必然有告警。

默认 bundle 不提供顶层 ShadowType、PCFType、CSMLevel、Shadows 导出，不能照搬这些 named imports；这里用 type=1 指定 ShadowMap。还要区分 scene-globals 的 Planar 默认值与底层 render-scene Shadows：底层禁用时内部类型是 SHADOW_TYPE_NONE=2，不能把它当成公开 ShadowType.None。

## 5. 开关正确后检查范围、几何和运行时状态

- ShadowFlow 在 !enabled 或 type !== ShadowMap 时直接返回；主方向光阴影读取 mainLight。投影模型 castShadow 为 false 或缺少有效 world bounds 时会被剔除，因此必须检查真正挂到场景中的 MeshRenderer 和其边界。
- 检查投影对象、接收表面与光源是否位于有效投影范围中。方向光 shadowFixedArea 默认 false；固定区域用 shadowNear、shadowFar、shadowOrthoSize（默认 0.1、10、5），CSM 路径检查 shadowDistance（默认 50）、csmLevel（默认 4）以及设备 csmSupported；CSM 只有 csmLevel>1 且受支持时启用。
- 检查 shadowBias（默认 0.00001）、shadowNormalBias（默认 0）、shadowSaturation（默认 1）和阴影贴图尺寸（默认 1024×1024）。过大的偏移可能使接触阴影不符合预期；不要把这些方向光专用参数拿去配置 Point / Sphere。Spot 只暴露 shadowEnabled、shadowPcf、shadowBias、shadowNormalBias，没有方向光的 CSM 或固定区域字段。
- 场景激活时 SceneGlobals 才把全局阴影配置初始化到管线对象；激活后 enabled / type setters 直接推送。灯光底层对象尚未创建时，组件赋值先保存字段，不能仅凭赋值立即断言管线已更新。
- 最后在当前候选构建、当前相机和场景中比较实际像素。文档里的主光 ShadowMap 像素证据只覆盖其记录版本下 examples/campfire-night 的固定场景，不自动证明这里已正常。此答案是冻结文档排查清单，没有执行或验证用户场景。

依据：skills/cocosair-rendering/SKILL.md 与其 references/lighting-units.md、shadow-matrix.md、contracts.md、common-mistakes.md。
