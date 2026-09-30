# 自定义 Shader 开发（Custom Shaders）

> 当前支持范围（2026-09-30）：浏览器渲染要求 WebGL 2；WebGL 1 已正式退役。启动不可用时返回 `WEBGL2_REQUIRED`，不会回退到空渲染设备。详见 [支持策略](../webgl2-only.md)。

> 状态：**FULL（2026-09-26）**。用户手写 GLSL 的完整链路在 WebGL2 上实测
> （`docs/evidence/g4-shader-probe.json`，当前 WebGL2 probe 的结果以报告为准；旧的双后端结果为历史证据）；
> 两级示例 `shader-custom-gradient`（渐变 + uniform）与 `shader-dissolve`（贴图 + 溶解 + 交互）
> 已进入 Gallery，具备正典 API、像素变化及资源释放证据。
> 相关篇目：[shadertoy](shadertoy.md)（Shadertoy 移植语义）、[debugging-glsl](debugging-glsl.md)（编译错误诊断）。

## 0. 一分钟结论

AIR 没有 `ShaderMaterial` 类；用户 Shader 的入口是 **手写编译后形态的 effect JSON + 三套 GLSL 变体 →
`EffectAsset.onLoaded()` 注册 → `material.initialize({ effectAsset })` 绑定**。引擎内建 effect 走同一条路径
（`src/air/builtin/register.ts`），用户侧与内建同源、同权限。运行期没有 `.effect` YAML 编译器——
你写的就是"编译产物"。

## 1. effect JSON 结构（编译后形态）

与 `src/air/builtin/builtin-effects.ts` fixtures 同构；`examples/shared/shader-blocks.js` 的
`makeUserEffectJson()` 生成骨架：

```js
{
  name: 'air-example-gradient',
  techniques: [{ passes: [{
    program: 'air-example-gradient|grad-vs:vert|grad-fs:frag', // 与 shaders[0].name 逐字一致
    rasterizerState: { cullMode: 0 },
    depthStencilState: { depthTest: true, depthWrite: true },
    blendState: { targets: [{ blend: false }] },
    properties: {                          // 默认值（Material 未 setProperty 时用）
      colorA: { value: [0.85, 0.25, 0.25, 1], type: 16 },   // gfx.Type: FLOAT4=16
      timeScale: { value: [1.5], type: 13 },                 // FLOAT=13
    },
  }] }],
  shaders: [{
    name: '<同 program>',
    hash: 926101,                          // 模板缓存键，全局唯一即可
    builtins: {
      statistics: { CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 47, CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 6 },
      globals: { blocks: [
        { name: 'CCGlobal',  defines: [], set: 0, binding: 0 },   // cc_time / cc_screenSize …
        { name: 'CCCamera',  defines: [], set: 0, binding: 1 },   // cc_matViewProj / cc_cameraPos …
      ], samplerTextures: [], buffers: [], images: [] },
      locals: { blocks: [{ name: 'CCLocal', defines: [], set: 2, binding: 0 }], // cc_matWorld …
                samplerTextures: [], buffers: [], images: [] },
    },
    defines: [],
    attributes: [                          // 与 primitives/gltf 网格属性约定一致
      { name: 'a_position', defines: [], format: 32, location: 0 },  // gfx.Format RGB32F=32
      { name: 'a_texCoord', defines: [], format: 21, location: 2 },  // RG32F=21
    ],
    blocks: [{                             // 用户 uniform 块（材质 set）
      name: 'Constants', defines: [], binding: 0, stageFlags: 16,    // FRAGMENT=16 / VERTEX=1
      members: [
        { name: 'colorA', type: 16, count: 1 },
        { name: 'timeScale', type: 13, count: 1 },
      ],
    }],
    samplerTextures: [                     // 采样器：set=1（材质），binding 在 Constants 块之后顺延
      { name: 'mainTexture', type: 28, count: 1, defines: [], stageFlags: 16, set: 1, binding: 1 },
    ],
    buffers: [], images: [], textures: [], samplers: [], subpassInputs: [],
  }],
  combinations: [],
  hideInEditor: false,
}
```

**set/binding 约定**（`src/cocos/rendering/define.ts`）：GLOBAL=0（CCGlobal:0、CCCamera:1）；
MATERIAL=1（用户 Constants 块 binding 0 起，采样器顺延）；LOCAL=2（CCLocal:0）。

## 2. GLSL 变体与当前支持范围

运行期 `program-lib` 按设备选源码（`getDeviceShaderVersion`）：**WebGL2 → glsl3**。
无 chunk include——每个变体必须自包含。浏览器必须成功初始化 WebGL2Device，
否则启动失败；不会调用 `getContext('webgl')` 降级。下表的 `glsl1` 是保留的上游
数据格式，当前运行时不消费它，也不要求自定义 shader 提供该变体。

| 变体  | 形态                                                                                                 | 生成方式                                                               |
| ----- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| glsl4 | `layout(set,binding)` Vulkan 风格 + `in/out` + `layout(location=0) out vec4 cc_FragColor`            | 手写主源                                                               |
| glsl3 | glsl4 去 `layout(set,binding)` 限定符（UBO 块保留）                                                  | `src.replace(/layout\s*\([^)]*\)\s*/g,'')`（register.ts toGlsl3 同款） |
| glsl1 | UBO 展开为独立 uniform、`in/out`→`attribute/varying`、输出→`gl_FragColor`、`texture()`→`texture2D()` | 手写（`shader-blocks.js standardVert()` 提供顶点样板）                 |

UBO 成员布局必须与引擎同源（`src/air/builtin/builtin-glsl4.ts`）；**CCGlobal 需剔除引擎 4.0 已移除的
`cc_debug_view_composite_pack_1/2/3`**，否则 WebGL2 下 "uniform buffer too small"（register.ts 注记）。

## 3. 注册与绑定（时机纪律）

```ts
import { createAirApp, EffectAsset, Material } from "cocosair";

const app = await createAirApp({ canvas: "#GameCanvas" }); // ① 必须先引导（GAP-B1：
//    引导前 onLoaded 抛空 device TypeError）
const effect = Object.assign(new EffectAsset(), effectJson); // ② 编译后 JSON 灌入
effect.shaders[0].glsl4 = { vert: VERT4, frag: FRAG4 }; // ③ 三变体源码
effect.shaders[0].glsl3 = { vert: VERT3, frag: FRAG3 };
effect.shaders[0].glsl1 = { vert: VERT1, frag: FRAG1 };
effect.onLoaded(); // ④ programLib.register + EffectAsset.register

const mat = new Material();
mat.initialize({ effectAsset: effect }); // ⑤ 直绑资源引用（或 effectName 走静态表）
mat.setProperty("colorA", new Color(40, 220, 90, 255)); // ⑥ uniform 运行期更新
mat.setProperty("timeScale", 0); //    float 直接给数
renderer.setSharedMaterial(mat, 0); // ⑦ 上屏
```

- `EffectAsset.get(name)` / `getAll()` 可查静态表；`EffectAsset.remove(effectOrName)` 注销；
  重复注册同名 = 覆盖不抛（探针 G2 相位）。`effect.destroy()` 连带注销（get → null）。
- **材质实例语义**：`renderer.setSharedMaterial(mat,0)` 直接引用（多渲染器共享同一 uniform 状态）；
  `renderer.material` getter 创建 MaterialInstance 副本（各自 setProperty 互不影响——
  "每个产品独立调色"用实例，"全场统一参数"用共享）。
- `material.recompileShaders` / `overridePipelineStates` 当前为 warn 存根：**defines 必须在
  initialize 时给定**，运行期改宏不可用。

## 4. 纹理绑定

`samplerTextures` 声明（§1）+ `properties` 里给默认 `{ value: 'grey', type: 28 }`（内建默认纹理名），
运行期 `mat.setProperty('mainTexture', texture2D)`。注意 **builtin-unlit 的纹理宏是 `USE_TEXTURE`**；
`USE_ALBEDO_MAP` 会被静默忽略渲染成纯色（GAP-M1，实测）。程序化纹理走
`new Texture2D(); tex.image = new ImageAsset(canvas)` 或 `tex.reset({…}) + uploadData(pixels)`
（uploadData 不做 Y 翻转——绘制时自行倒序，[canvas-textures](canvas-textures.md) 同注记）。

## 5. 调试与诊断

- **编译错误**：console.error 三段式（shader 名 + 带行号源码 dump + ANGLE info log），页面存活，
  详见 [debugging-glsl](debugging-glsl.md)。自动化断言挂钩 console.error（shader-probe 页内挂钩即样板）。
- **像素验证**：引擎 `preserveDrawingBuffer:true`；采样在 `director.on(Director.EVENT_AFTER_DRAW)`
  内 `drawImage → getImageData`（与 manual-examples-verify 同口径）。
- **黑屏排查序**：① `EffectAsset.get(name)` 命中？② `program` 与 `shaders[0].name` 逐字一致？
  ③ attributes 的 format/location 与网格属性匹配（a_position=32/0，a_texCoord=21/2）？
  ④ UBO 成员序与引擎同源？⑤ 当前设备取的哪个变体（`director.root.device.gfxAPI`：WEBGL2(7)→glsl3、WEBGL(6)→glsl1）？
- **已知缺口对照**：`docs/reference/api-scenario-gap-matrix.md` §7。GAP-L1 已于 r53 修复：用户 Shader 可正常消费
  `cc_mainLitDir/cc_mainLitColor`（**必须用 HDR 量级**：主光 illuminance ≈65000，isHDR 默认 true、
  exposure=1/38400，LDR 量级数值视觉归零）；点光/球光经 CCForwardLight 附加 pass 生效（fixture 已对齐
  上游 4.0 判别语义）。GAP-B1 时机边界仍适用。

## 6. 参考实现索引

| 文件                                      | 内容                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `tools/debug/probes/shader-probe/main.js` | WebGL2 全链路探针（注册/uniform/动画/冻结/编译错误/remove/重复注册/销毁） |
| `examples/shader-custom-gradient/`        | 一级示例：渐变 + colorA/colorB/timeScale uniform + 交互切换 + lifecycle   |
| `examples/shader-dissolve/`               | 二级示例：sampler2D 棋盘 + discard 溶解 + 边缘发光 + 逐帧 uniform 动画    |
| `examples/shared/shader-blocks.js`        | UBO 块样板 + standardVert + makeUserEffectJson                            |
| `src/air/builtin/register.ts`             | 引擎内建注册路径（glsl4→3 转换 + set/binding 分配的同源参考）             |
| `docs/evidence/g4-shader-probe.json`      | 当前 WebGL2 探针证据（14/14 PASS，含 registerBeforeBoot 边界）            |
