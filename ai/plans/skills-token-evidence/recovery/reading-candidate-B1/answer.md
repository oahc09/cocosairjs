# 亮度和方向光阴影检查清单

以下针对默认 WebGL2 legacy forward 管线。主技能为 `cocosair-rendering`。

## 1. 先核对光照单位与 HDR/LDR

- `DirectionalLight.illuminance` 是照度，单位 Lux（lx）；HDR 默认值为 65000。不要把方向光的数值当作局部灯的流明或亮度。
- Point/Sphere/Spot 使用 `luminousFlux`（光通量，lm）或 `luminance`（亮度）。换算因子为 `nt2lm(size) = 4 × π² × size²`。HDR 的 `luminousFlux` setter 先除以这个因子；Point 固定使用 size=1，Sphere/Spot 使用自身 size（默认 0.15）。三种局部灯的内部 HDR luminance 默认均为 `1700 / nt2lm(0.15)`，所以不要把默认内部值和 Point 的 flux 换算半径混为一谈。
- 检查当前是否 HDR，以及相机曝光。HDR 写入 UBO 时：方向光 illuminance 与环境光 skyIllum 都乘 camera.exposure；Point/Sphere/Spot 的 luminance 还要再乘 `standardLightMeterScale = 10000`。这个 10000 系数适用于三种局部灯，不仅 Spot。
- LDR 使用独立的 LDR 槽，写入时不再乘上述曝光：方向光用 illuminanceLDR、环境光用 skyIllumLDR，局部灯用 luminanceLDR；局部灯的 LDR luminousFlux setter 直接保存 LDR 标量。不要把 HDR 和 LDR 中相同数字当作相同结果。参考常量为 `standardExposureValue = 1 / 38400`。
- `Light.color` 要传 `Color` 实例，组件 RGB 通道范围为 0..255，内部再除以 255；用 0..1 当作组件颜色可能造成很暗的光。也检查是否开启色温以及灯的作用范围、朝向。

## 2. 确认真正生效的方向光

legacy forward 只有一个普通方向主光：`scene.renderScene.mainLight`。最后激活的方向光成为主光，额外方向光不会叠加照明，也不会独立投射主方向阴影。可用 `inspectAirDirectionalLights(scene)` 查看 `mainLight` 和 `lights[].effective`。该检查报告身份，不是亮度阈值检测；原生 render scene 尚未建立时会返回 unavailable。

增加第二盏方向光可能替换原先主光。需要补光时可考虑受支持的局部灯。不要使用并不存在的 `Scene.mainLight` 访问器，告警中的 `scene.mainLight` 只是宽泛措辞。

## 3. 先确认阴影支持范围

- 主 DirectionalLight：支持 ShadowMap 的 fixed-area/CSM 路径；Planar 则沿主光方向投影到单一平面。
- SpotLight：ShadowMap 路径要求 shadowEnabled；不是 Planar 的投影光源。该路径存在，但所读记录没有单独完成本轮运行时像素采样。
- PointLight：不支持阴影生成；不能用 Spot 的结果声称 Point 已受支持。
- SphereLight：默认管线没有球灯阴影路径。
- RangedDirectionalLight：不属于此主方向光/CSM 阴影契约；Ambient 不投影。
- Planar 原生路径存在，但记录中的接收区域 ROI 像素变化尚未得到可判定验证。要记录投影范围、接收平面和 bias 并实际观察像素，不能把字段设置成功当作阴影已验证。

## 4. ShadowMap 的四个独立开关都要开

```js
scene.globals.shadows.enabled = true; // 默认 false
scene.globals.shadows.type = 1;       // ShadowMap；场景配置默认 Planar（0）
light.shadowEnabled = true;          // 应是有效主方向光，默认 false
renderer.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON; // 投射物默认 OFF
```

默认包没有顶层导出 `ShadowType`，因此这里使用文档给出的序数 1。场景配置 `ShadowsInfo` 的默认 Planar 与内部未激活/关闭时的 NONE 状态不要混淆。全局 enabled 为假或 type 不是 ShadowMap，ShadowFlow 会直接返回；缺少开关可能没有告警。

还应检查：
- 投射模型有有效 world bounds；缺少包围盒或 castShadow 为 false 会被剔除。
- 场景和灯已经激活，配置已传入原生渲染对象；激活前写属性不会立即产生管线效果。
- 接收物/接收平面及其材质能接收阴影，投射物和接收物处在实际覆盖范围内。所读文档明确列出上述四个开关，未给出一个可据此断言的独立接收开关 API，因此不应凭空添加属性名。
- fixed-area 时检查 shadowNear、shadowFar、shadowOrthoSize；非固定区域检查 shadowDistance、CSM 配置及 csmSupported。CSM 需要 csmLevel > 1 且运行时支持。过小的覆盖范围会漏掉目标。
- 检查 shadowBias、shadowNormalBias、shadowSaturation 与 shadow map 尺寸、PCF；这些不能代替基础开关。方向光专属的距离、固定区域、CSM 等字段不适用于 Point/Sphere，Spot 只暴露 shadowEnabled、shadowPcf、shadowBias、shadowNormalBias 四个阴影字段。

最后在当前构建的浏览器帧上验证阴影和亮度变化。导出、声明、字段写入成功不等于渲染验证；既有主光 ShadowMap 像素证据只覆盖记录版本中的 campfire-night 固定场景。

来源：`skills/cocosair-rendering/references/lighting-units.md`、`shadow-matrix.md`、`common-mistakes.md`、`contracts.md`、`quick-start.md`，以及 router 与 rendering 技能入口。
