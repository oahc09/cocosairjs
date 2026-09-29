# 调试 GLSL（Debugging GLSL）

> 当前支持范围（2026-09-30）：浏览器渲染要求 WebGL 2；WebGL 1 已正式退役。启动不可用时返回 `WEBGL2_REQUIRED`，不会回退到空渲染设备。详见 [支持策略](../webgl2-only.md)。


> shader 编译/链接出错时怎么定位。
> 配套示例：`shader-custom-gradient` / `shader-dissolve`（`examples/` 正典，r52 集成）；
> 探针：`tools/debug/probes/shader-probe/`（F 相位 = 故意编译错误的诊断实测）。

**状态：PARTIAL（2026-09-25 升级，原 N/A）。** 用户手写 GLSL 的创作面已实测走通
（见 [custom-shaders](custom-shaders.md) 与 `docs/evidence/g4-shader-probe.json`），
"写错 shader → 看编译日志"的闭环**在 console 通道可用**，实测三段式诊断（故意语法错误
`gl_FragColor = vec4(1.0, 0.0;`，WebGL2/WebGL1 双后端一致）：

1. `FragmentShader in 'probe-broken|probe-vs:vert|probe-fs:frag' compilation failed.`（errorID 16323，含 shader 名）
2. `Shader source dump:` 带行号的完整源码（errorID 16324——逐行定位的直接依据）
3. `ERROR: 0:16: ';' : syntax error`（ANGLE 原始 info log，行号 16 与源码 dump 对得上）

且**页面存活**：坏 shader 的 draw 被跳过，同场景其它材质继续渲染（探针 F2 相位断言）。
实现锚点：`src/cocos/gfx/webgl/webgl-commands.ts` 编译失败分支（COMPILE_STATUS 检查 →
errorID(16323/16324) + `gl.getShaderInfoLog`）。

仍诚实保留的边界：诊断走 **console.error 通道**，没有可编程的编译状态/日志**读回 API**
（d.ts grep `getShaderInfoLog|programInfoLog` 对公开面仍零命中）——自动化断言需挂钩 console
（探针页内挂钩 `console.error` 即此做法，见 shader-probe main.js）。

## 1. 有什么（边缘面，非创作面）

| 成员                                                 | d.ts                          | 说明                                                                                       |
| ---------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| `EffectAsset`（register/get/getAll）                 | 23514 / 23521 / 23536 / 23542 | effect 资源容器；`shaders: IShaderInfo[]` 内含 `glsl1/glsl3/glsl4` 源码字段（23700–23710） |
| `pass.recompileShaders(overrides, passIdx?)`         | 7608                          | 用宏重编译既有 pass——改宏，不改 GLSL 文本                                                  |
| `Material.initialize({ effectName \| effectAsset })` | 23740–23744                   | 选 effect 的入口；可传 `effectAsset` 引用                                                  |

理论上可以手工 `new EffectAsset()` 填 `shaders[].glsl*` 再 `register`，让 WebGL 在 console 回吐编译错误——
但 `IShaderInfo` 需要完整的 attributes/blocks/samplers 描述，属未测试的重路径；本篇**不承诺**该路可跑，只指路。

## 2. 没有什么（诚实清单）

- **没有** 用户级 GLSL 字符串创作入口（材质层不接受 GLSL 文本）；
- **没有** shader 编译/链接日志读回 API（grep 零命中）；
- **没有** `#define` 之外的逐行 shader 调试手段（无 `recompileShaders` 之外的 introspection）；
- 因此"写错 GLSL 看报错"的调试闭环在本仓库**无法演示**。

## 3. 升级条件（何时本篇升 FULL）

1. AIR 暴露用户级 effect 创作面（如 `new EffectAsset()` + 简化 IShaderInfo，或材质级 GLSL 字符串入口）；
2. 引擎或 devtools 桥暴露 shader 编译/链接日志读回（`getShaderInfoLog` 等价物）；
3. 有至少一个"故意写错 GLSL → 捕获并打印编译日志"的可运行示例过验证器。

满足前，调试 shader 行为的可行近似：用 `recompileShaders` 切宏做 A/B、或在 [自定义几何/材质](custom-buffergeometry.md) 层面用顶点色/UV 可视化中间量。

---

上一篇：[调试 JavaScript（Debugging JavaScript）](debugging-javascript.md) ｜ 下一篇：[技巧合集（Tips）](tips.md)
