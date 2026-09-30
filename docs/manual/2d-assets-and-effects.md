# 2D 资产与效果（DragonBones / TiledMap / 2D 粒子 / Spine）

> **状态：DragonBones / TiledMap / 2D 粒子 = FULL（能力）；Spine = 待验证。**
> 官方 [asset/dragonbones]、[asset/tiledmap]、[particle-system/2d-particle] 的 AIR 落法。
> 本组示例全部自产资产（无第三方许可面），均有 v11 链 + 三引擎矩阵背书。

## 1. DragonBones：运行期构造龙骨资产

AIR 的龙骨资产**不需要编辑器导入**——运行时直接构造三件套
（`examples/dragonbones-basic/main.js` 逐字节）：

```js
const { DragonBonesAsset, DragonBonesAtlasAsset, ArmatureDisplay, CCFactory, AnimationCacheMode } = dragonBones;
```

```js
atlasAsset = new DragonBonesAtlasAsset(NAME);
```

- `new dragonBones.DragonBonesAtlasAsset()` 填 `atlasJson` + `texture`；
- `new dragonBones.DragonBonesAsset()` 填 `dragonBonesJson`；
- 再交给 `ArmatureDisplay` 的 `dragonAsset` / `dragonAtlasAsset` / `armatureName`。

缓存模式默认即 REALTIME（`ArmatureDisplay.ts:515`）。该示例 P1~P6 覆盖构造/图集/骨架/运行层/
动画帧钉（`EVENT_AFTER_DRAW` 采样）/生命周期合同（释放重建），点击可切 flap↔idle 动画。

## 2. TiledMap：TMX/TSX 文本资产 + 手搭 TiledMapAsset

`assetManager.loadRemote` 对 `.tmx/.tsx` 走 `downloadText → createTextAsset`（拿到 `TextAsset`）；
组件侧不吃这些 asset，而是吃一个**手搭的 `TiledMapAsset`**（贴图/图层/对象手工组装），
`TiledMap.tmxAsset` setter 直接 `_applyFile()`（`examples/tiledmap-basic/main.js` 实测注释）：

```js
    TiledMap,
    TiledMapAsset,
```

P1~P8 覆盖：TMX 头部解析、TSX 外链、正交与等距两套地图、图层渲染、object layer、改图/刷新、
卸载重建、tile 动画——`window.__probe` 逐字段读回。

## 3. 2D 粒子：程序化 plist → ParticleAsset → ParticleSystem2D

plist 文本在运行时**程序化生成**，交给引擎自己的解析器（`assetManager.parser.parsePlist`），
解析出的字典包成 `ParticleAsset._nativeAsset` 交给 `ParticleSystem2D.file`——真实上游通路
（`examples/particle-2d-basic/main.js` 实测注释）：

```js
    ParticleSystem2D,
    ParticleAsset,
```

10 阶段 28 键读回（发射器模式/positionType/duration/混合等）；种子化 LCG + 手工定步使粒子数
可复现（终态两系统各 146 粒）。

## 4. Spine：导出面在、浏览器验证缺（待验证）

| 项         | 现状                                                                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 导出面     | `sp` 命名空间 + `loadWasmModuleSpine` 在默认聚合导出内（d.ts 在册）                                                                                                |
| 浏览器证据 | **无**——仓库没有任何已验证的 Spine 示例                                                                                                                            |
| 阻断点     | ① wasm 模块装载路径未在浏览器实跑（`loadWasmModuleSpine` 需要可用 wasm 二进制来源）；② 无自产最小 Spine 资产（.json/.skel + atlas）；③ Skeleton 组件装配链路无样例 |
| 结论       | **待验证**——不由 DragonBones 的可用性推断；待最小样例 + 探针后再升级状态（衔接 `ai/plans/api-scenarios-shaders.md` 的示例批次）     |

## 5. 验证与运行

| 示例                                                             | 内容                                          |
| ---------------------------------------------------------------- | --------------------------------------------- |
| [examples/dragonbones-basic/](../../examples/dragonbones-basic/) | 运行期构造/REALTIME 动画/换图/释放重建        |
| [examples/tiledmap-basic/](../../examples/tiledmap-basic/)       | TMX/TSX/正交+等距/图层/object layer/tile 动画 |
| [examples/particle-2d-basic/](../../examples/particle-2d-basic/) | 程序化 plist/定步模拟/出图                    |

运行：`npm run dev` 后访问 `http://127.0.0.1:7454/examples/<id>/`。资产均为工具生成
（`tools/` 生成 DragonBones JSON/图集与 TMX），零第三方许可面。

---

上一篇：[音频、视频与 WebView](./audio-video-webview.md) ｜ 下一篇：[后处理（Post Processing）](./post-processing.md)
