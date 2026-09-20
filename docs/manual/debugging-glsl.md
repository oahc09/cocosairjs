# 调试 GLSL（Debugging GLSL）

> 对应 three.js manual 的 *Debugging GLSL* 一篇：shader 编译/链接出错时怎么定位。
> 本篇**无配套示例**：AIR V0.1 没有受支持的用户级 GLSL 创作面，无法演示"写错 shader → 看编译日志"的闭环。

**状态：N/A。** three.js 的调试 GLSL 建立在"用户直接写 GLSL 字符串、浏览器 console 回吐编译/链接日志"之上；
AIR 的 effect 是**预编译内建资源**（`builtin-standard` 等），用户代码通过 `material.initialize({ effectName })` 选用，不写 GLSL 源码。
全 d.ts grep `getShaderInfoLog|programInfoLog|compileShader` **零命中**——引擎没有向用户暴露 shader 编译状态/日志的读回面，
因此"调试 GLSL"在本仓库没有可操作的对象。

## 1. 有什么（边缘面，非创作面）

| 成员 | d.ts | 说明 |
| --- | --- | --- |
| `EffectAsset`（register/get/getAll） | 23514 / 23521 / 23536 / 23542 | effect 资源容器；`shaders: IShaderInfo[]` 内含 `glsl1/glsl3/glsl4` 源码字段（23700–23710） |
| `pass.recompileShaders(overrides, passIdx?)` | 7608 | 用宏重编译既有 pass——改宏，不改 GLSL 文本 |
| `Material.initialize({ effectName \| effectAsset })` | 23740–23744 | 选 effect 的入口；可传 `effectAsset` 引用 |

理论上可以手工 `new EffectAsset()` 填 `shaders[].glsl*` 再 `register`，让 WebGL 在 console 回吐编译错误——
但 `IShaderInfo` 需要完整的 attributes/blocks/samplers 描述，属未测试的重路径；本篇**不承诺**该路可跑，只指路。

## 2. 没有什么（诚实清单）

- **没有** 用户级 GLSL 字符串创作入口（three.js 的 `ShaderMaterial.glsl` 对应物不存在）；
- **没有** shader 编译/链接日志读回 API（grep 零命中）；
- **没有** `#define` 之外的逐行 shader 调试手段（无 `recompileShaders` 之外的 introspection）；
- 因此"写错 GLSL 看报错"的调试闭环在本仓库**无法演示**。

## 3. 升级条件（何时本篇升 FULL）

1. AIR 暴露用户级 effect 创作面（如 `new EffectAsset()` + 简化 IShaderInfo，或 ShaderMaterial 式 GLSL 字符串入口）；
2. 引擎或 devtools 桥暴露 shader 编译/链接日志读回（`getShaderInfoLog` 等价物）；
3. 有至少一个"故意写错 GLSL → 捕获并打印编译日志"的可运行示例过验证器。

满足前，调试 shader 行为的可行近似：用 `recompileShaders` 切宏做 A/B、或在 [自定义几何/材质](custom-buffergeometry.md) 层面用顶点色/UV 可视化中间量。

---

上一篇：[调试 JavaScript（Debugging JavaScript）](debugging-javascript.md) ｜ 下一篇：[技巧合集（Tips）](tips.md)
