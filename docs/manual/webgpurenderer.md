# WebGPURenderer（WebGPU 渲染器）

> 话题：WebGPU 后端的选择与探测、节点式材质体系。
> 状态：**N/A** —— Cocos AIR 当前构建只带 WebGL2 后端设备，WebGPU 是"有钩子、无实现"
> 的半成品枚举位，不配示例。

## 1. 实测边界：枚举在、钩子在、设备类不在

GFX 层不是完全没给 WebGPU 留门——但门后是空的：

| 环节                     | 证据（实测）                                                                                                                     | 结论                                                |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `RenderType.WEBGPU` 枚举 | d.ts 4407 `RenderType { UNKNOWN=-1, CANVAS, WEBGL=1, WEBGPU=2, OPENGL, HEADLESS }`                                               | 枚举位存在                                          |
| DeviceManager 初始化分支 | build js 20025 `if (this._renderType === RenderType.WEBGPU && cclegacy.WebGPUDevice)` → `_tryInitializeWebGPUDevice`（js 19978） | 有钩子，但**以 `cclegacy.WebGPUDevice` 存在为前提** |
| `WebGPUDevice` 类        | build js grep `class WebGPUDevice` **0 命中**（`WebGL2Device` 在 js 83149 且有 legacy 注册 83474）                               | 实现未随包发布 → 条件永假，指定 WEBGPU 也起不来     |
| AIR 入口选项             | bootstrap.ts 86 `game.init` 只透传 `rendering.renderMode`，无 renderType 参数                                                    | `createAirApp` 没有后端选择面                       |
| 实际运行设备             | [webgl-compatibility-check](webgl-compatibility-check.md) 篇探针：`active device: WebGL2Device`                                  | 当前唯一可用后端是 WebGL2（降写 WebGL1 路径见该篇） |

## 2. 相关能力边界

| AIR 现状                                                            | 去处                                                           |
| ------------------------------------------------------------------- | -------------------------------------------------------------- |
| 无对应入口；设备由 `game.init` 内部定死 WebGL2                      | 本篇 §1                                                        |
| 无运行时后端切换；判断当前后端看设备类名                            | [webgl-compatibility-check](webgl-compatibility-check.md)      |
| 无节点图/无用户 GLSL；材质=effectName + defines + properties 三件套 | [materials](materials.md)                                      |
| 无用户着色器入口（`debugging-glsl` 篇同款边界）                     | [debugging-glsl](debugging-glsl.md)、[shadertoy](shadertoy.md) |
| 无用户后处理管线，且叠加"无装配面"问题                              | [webgpu-postprocessing](webgpu-postprocessing.md)              |

## 3. 近似替代与升级条件

**现在要性能/要新特性怎么办**：AIR 的优化路径全在应用层——合并几何
（[voxel-geometry](voxel-geometry.md)）、批处理与实例化思路
（[optimize-lots-of-objects](optimize-lots-of-objects.md)）、按需渲染
（[rendering-on-demand](rendering-on-demand.md)），不依赖后端更换。

**何时把本篇升为 FULL/PARTIAL**（三条齐备）：

1. 构建产物出现 `WebGPUDevice` 类实现（grep 命中为证）；
2. `createAirApp`（或 `game.init` 透传面）暴露 renderType/后端选择；
3. 验证器可在支持 WebGPU 的浏览器上跑通同一示例双后端。
   达成后：补 `manual-webgpu-renderer` 双后端对比示例，同步索引状态列与台账。

---

上一篇：[小游戏（Start Making a Game）](game.md) ｜ 下一篇：[Post-Processing 后处理（WebGPU）](webgpu-postprocessing.md)
