先检查 HDR/LDR 的光照单位和实际生效的主方向光，再检查 ShadowMap 的四个独立开关；方向光组件存在并不代表它正在照明或投影。

1. 亮度与单位：`DirectionalLight.illuminance` 是照度 Lux（lx）；HDR 默认值为 `65000`。HDR 写入着色数据时，方向光 `illuminance` 与环境光 `skyIllum` 都乘以 `camera.exposure`；LDR 使用独立的 LDR 数值槽，不再乘曝光，不能把 HDR 的物理量直接当作 LDR 强度。`PointLight`、`SphereLight`、`SpotLight` 要区分 `luminousFlux`（光通量）与 `luminance`（亮度）：HDR 光通量先除以 `nt2lm(size) = 4 * PI * PI * size * size` 转成亮度，再乘 `camera.exposure * 10000`；这三个局部光都使用同一个 `standardLightMeterScale = 10000`。Point 的换算使用 size=1，Sphere/Spot 使用自身 size。参考曝光常量为 `1 / 38400`。此外，组件 `Light.color` 需要 `Color` 对象，其 RGB 通道是 0..255，不是 0..1。检查局部光 range 和受光材质是否合适。

2. 主灯身份：默认 legacy forward 对普通方向光只使用一个 `scene.renderScene.mainLight`，最后激活的方向光成为主灯，其他普通方向光不会作为独立补光叠加；只有主方向光走该主灯阴影路径。用 `inspectAirDirectionalLights(scene)` 检查 `status`、`mainLight` 与各灯的 `effective`，不要仅看节点数量；该工具只报告身份，不判断亮度。原生 render scene 尚未建立时可能返回 `unavailable`。

3. ShadowMap 开关逐一核对：
   - `scene.globals.shadows.enabled = true`，默认 false。
   - `scene.globals.shadows.type = 1`，即 ShadowMap；SceneGlobals 对外默认 Planar。默认 bundle 不直接导出 `ShadowType`，Code First 可使用文档规定的序号 0=Planar、1=ShadowMap。底层 Shadows 在禁用时会使用内部 NONE 状态，不要与对外默认值混淆。
   - 实际主方向光 `shadowEnabled = true`，默认 false。
   - 投影物体的 `renderer.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON`，默认 OFF。
   缺少任一项都可能静默没有阴影。确认投影物有有效 world bounds，且接收阴影的几何与受光材质实际位于投影范围；没有有效 bounds 的模型会被剔除。方向光再检查 `shadowFixedArea`、`shadowNear`、`shadowFar`、`shadowOrthoSize` 或 CSM 的覆盖范围，以及 `shadowDistance`、`shadowBias`、`shadowNormalBias`，避免阴影范围或偏移造成看不到的结果。CSM 要满足 `csmLevel > 1` 且设备 `csmSupported`；这些方向光设置不能拿去修复 Point/Sphere 的缺失路径。

4. 支持边界：默认 WebGL2 legacy 管线中，主 DirectionalLight 支持 ShadowMap 的 fixed-area/CSM 路径；Planar 仅沿主方向光向单一平面投影。SpotLight 有 ShadowMap 路径并需自身 `shadowEnabled`，不作为 Planar 投影源；PointLight 不支持生成阴影，SphereLight 没有默认阴影路径，RangedDirectionalLight 不属于该主灯阴影契约，Ambient 不投影。不能用 Spot 的结果证明 Point 支持阴影。

依据是本次实际读取的 [lighting-units.md](skills/cocosair-rendering/references/lighting-units.md)、[shadow-matrix.md](skills/cocosair-rendering/references/shadow-matrix.md)、[quick-start.md](skills/cocosair-rendering/references/quick-start.md) 和 [contracts.md](skills/cocosair-rendering/references/contracts.md)。其中阴影矩阵记录的主方向光 ShadowMap 像素证据只覆盖当时 `campfire-night` 固定场景与指纹；Spot 当轮没有独立运行时采样，Planar 当轮未取得可判定 ROI 像素变化。本答复是冻结文档诊断建议，没有运行当前场景；上述配置和导出可达性都不能当成当前运行时 PASS，修改配置后仍需实际浏览器像素检查。
