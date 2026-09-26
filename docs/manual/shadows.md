# 阴影（Shadows）

> **状态：BLOCKED（本篇不提供示例）。** API 面如下如实记录，但在当前构建 +
> headless swiftshader 环境下**未能产出任何可见阴影**，故不配示例、不作可视化承诺。
> 证据：`docs/evidence/manual/shadows-spike-{map,planar,off}.png`（见 §3）。

## 1. API 面（d.ts 实测）

阴影是**场景级开关 + 光源级开关 + 渲染器级投射开关**三层：

| 层   | 入口                                                 | 关键字段                                                                                       |
| ---- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 场景 | `scene.globals.shadows`（`ShadowsInfo`，d.ts 20853） | `enabled`、`type`、`shadowColor`、`planeDirection`、`planeHeight`、`planeBias`、最大接收光源数 |
| 光源 | `DirectionalLight` / `SpotLight` 组件                | `shadowEnabled`、`shadowPcf`、`shadowBias`、`shadowNormalBias`、`shadowDistance`               |
| 物体 | `MeshRenderer`（Model，d.ts 647）                    | `shadowCastingMode`（0=OFF，1=ON）                                                             |

两个必须知道的口径：

- **入口是 `scene.globals.shadows`，不是 `scene.shadows`**——后者在 AIR 的 `Scene` 上是
  `undefined`，直接赋值会抛 `TypeError`（spike 首跑即踩中）。
- **`ShadowType` 枚举没有顶层导出**（d.ts 仅嵌套在 `Shadows` 静态成员下），用户代码只能写数值：
  `0 = Planar`（平面阴影）、`1 = ShadowMap`（阴影贴图），见 `src/cocos/render-scene/scene/shadows.ts:73`。

## 2. 参考开启顺序（未经可视化验证）

```js
scene.globals.shadows.enabled = true;
scene.globals.shadows.type = 1; // ShadowMap=1 / Planar=0（枚举未顶层导出）
dir.shadowEnabled = true; // dir: DirectionalLight 组件
renderer.shadowCastingMode = 1; // MeshRenderer：ON=1 / OFF=0
```

Planar 模式还需给接收平面：`shadows.planeDirection = new Vec3(0, 1, 0)`、`shadows.planeHeight = 0`、
`shadows.shadowColor` 设阴影色。以上写法类型与字段均实测存在（赋值不报错、读回一致），
但**画面效果未验证通过**，见下。

## 3. 实测记录（BLOCKED 判据）

spike 页结构：灰色地面 plane + 橙色球（`primitives.sphere(1.0, …)` 位置参数签名）+
方向光 `illuminance = 3`（`setRotationFromEuler(-55, -25, 0)`），相机俯视。三种配置各截一帧：

| 配置                      | 截图                                            | 观察                                |
| ------------------------- | ----------------------------------------------- | ----------------------------------- |
| `type = 1`（ShadowMap）   | `docs/evidence/manual/shadows-spike-map.png`    | 地面无阴影；球仅环境光微亮          |
| `type = 0`（Planar）      | `docs/evidence/manual/shadows-spike-planar.png` | 与 ShadowMap 帧几乎逐像素同：无阴影 |
| `enabled = false`（对照） | `docs/evidence/manual/shadows-spike-off.png`    | **同样**无方向光照明、地面不亮      |

对照帧说明：该 spike 页即使关掉阴影也复现不了方向光照明（与 `manual-lights` /
`manual-cameras` 里方向光明显生效形成反差）。**归因已定（r53，GAP-L1 修复轮）**：spike 用了
`illuminance = 3` 的 LDR 量级数值，而管线 `isHDR` 默认 true（exposure=1/38400）——3/38400 ≈ 8e-5，
方向光贡献被曝光压灭，属单位语义陷阱而非渲染缺陷（HDR 量级 30000–65000 下方向光照明实测生效，
见 `docs/manual/lights.md` §4 与 `docs/evidence/g1-light-contribution-gap.json` 修复记录）。
因此**不能**断言"启用阴影导致光照消失"；能断言的只有一句：
**两种 ShadowType 在本环境均未产出可见阴影**（该结论不受光照归因影响——阴影判定基于三帧互差），
本篇按 BLOCKED 记录，不配示例。后续重跑 spike 时应改用 HDR 量级 illuminance。

## 4. 行为要点与修复预期

- 开启阴影是三件套：`scene.globals.shadows.enabled` + 光源 `light.shadowEnabled` + 物体 `shadowCastingMode`，
  且**接收方无需单独开关**（场景级生效）。
- 阴影边缘的软硬由光源上的 `shadowPcf`（PCFType 分级）控制。
- 修复预期：待管线在 swiftshader 下的 shadow pass 可用后，按 §2 顺序补示例并重跑验证器，
  将本篇从 BLOCKED 升级为 PASS；届时同步更新 `docs/evidence/manual-waves.md` 台账。

---

上一篇：[相机（Cameras）](cameras.md) ｜ 下一篇：[雾（Fog）](fog.md)
