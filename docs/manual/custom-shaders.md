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

const app = await createAirApp({ canvas: "#GameCanvas" }); // ① 材质创建前先初始化设备
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
- `EffectAsset.onLoaded()` 可以在设备初始化前注册模板；源码会监听渲染器初始化事件延迟预编译。
  这不代表材质已经可用：`Material.initialize()`、实际 shader 编译及渲染仍须在设备初始化后执行。
  旧探针中 `registerBeforeBoot` 的错误记录不能覆盖当前源码合同。
- **材质实例语义**：`renderer.setSharedMaterial(mat,0)` 直接引用（多渲染器共享同一 uniform 状态）；
  `renderer.material` getter 创建 MaterialInstance 副本（各自 setProperty 互不影响——
  "每个产品独立调色"用实例，"全场统一参数"用共享）。
  实时 `SkinnedMeshRenderer` 是明确例外：`setSharedMaterial` 会为模型宏创建实例；绑定后用
  `renderer.getMaterialInstance(0).setProperty(...)` 更新实际绘制材质，继续改原共享Material不保证更新该实例。
- `material.recompileShaders` / `overridePipelineStates` 当前为 warn 存根：**defines 必须在
  initialize 时给定**，运行期改宏不可用。

## 4. 纹理绑定

`samplerTextures` 声明（§1）+ `properties` 里给默认 `{ value: 'grey', type: 28 }`（内建默认纹理名），
运行期 `mat.setProperty('mainTexture', texture2D)`。注意 **builtin-unlit 的纹理宏是 `USE_TEXTURE`**；
`USE_ALBEDO_MAP` 会被静默忽略渲染成纯色（GAP-M1，实测）。程序化纹理走
`new Texture2D(); tex.image = new ImageAsset(canvas)` 或 `tex.reset({…}) + uploadData(pixels)`
（uploadData 保留字节行序；Sprite视觉顶边v=0，而旋转+90X的原生plane顶边v=1，按实际UV选择行序，见[纹理源方向](texture-source-orientation.md)）。

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
  上游 4.0 判别语义）。注册模板与创建材质的时机区别见 §3。

## 6. 参考实现索引

| 文件                                      | 内容                                                                      |
| ----------------------------------------- | ------------------------------------------------------------------------- |
| `tools/debug/probes/shader-probe/main.js` | WebGL2 全链路探针（注册/uniform/动画/冻结/编译错误/remove/重复注册/销毁） |
| `examples/shader-custom-gradient/`        | 一级示例：渐变 + colorA/colorB/timeScale uniform + 交互切换 + lifecycle   |
| `examples/shader-dissolve/`               | 二级示例：sampler2D 棋盘 + discard 溶解 + 边缘发光 + 逐帧 uniform 动画    |
| `examples/shared/shader-blocks.js`        | UBO 块样板 + standardVert + makeUserEffectJson                            |
| `src/air/builtin/register.ts`             | 引擎内建注册路径（glsl4→3 转换 + set/binding 分配的同源参考）             |
| `docs/evidence/g4-shader-probe.json`      | 当前 WebGL2 探针证据（14/14 PASS，含 registerBeforeBoot 边界）            |

## 7. 从声明表生成 effect JSON

### 注册前布局检查与双贴图（2026-10-04）

可选开发工具[effect-layout.ts](../../tools/debug/effect-layout.ts)提供 `prepareEffectForRegistration(effectJson)`：克隆JSON后为缺省材质sampler分配不冲突槽位，检查set/binding、sampler类型/数量、顶点/片元stageFlags、UBO成员顺序/类型及GLSL4布局和反射一致性。失败抛 `AIR_E_EFFECT_LAYOUT`，`issues`给出shader、resource、stage和稳定规则码。调用它以后，仍由原生 `EffectAsset.onLoaded()` 注册；直接调用原生入口不会自动启用此工具。

```ts
// 仓库开发工具，调用方显式接入；不在npm默认运行时导出内。
import { prepareEffectForRegistration } from '../../tools/debug/effect-layout';
const { effect: checkedJson, bindings } = prepareEffectForRegistration(effectJson);
const effect = Object.assign(new EffectAsset(), checkedJson);
effect.onLoaded(); // 已await createAirApp，后续使用原生Material
const material = new Material();
material.initialize({ effectAsset: effect });
material.setProperty('mapA', firstTexture);
material.setProperty('mapB', secondTexture);
```

当前预检范围是**无条件vec4/mat4 UBO及sampler2D**，UBO必须从材质binding=0连续排列；有一个UBO时两个sampler为1/2，没有UBO时为0/1。显式与自动分配均检查同一GLSL4声明；存在条件资源、数组/其他成员格式时明确拒绝 `UNSUPPORTED`，需完整编译工具处理，不能推断为合法。它不验证所有GLSL语法、Vulkan或完整反射，也不把builtin私有toGlsl3当作通用编译器。

VERT和FRAG各自预处理，顶点源码内的`#define`不会出现在片元源码；通过Effect的defines元数据与Material.initialize传入的宏才会按原生模板合同配置两阶段。受限声明表生成器本身不接受macro/include，手写编译产物可以使用自包含宏源码。`setProperty`更新uniform或纹理，不是运行期改宏入口。

本轮[执行台账](../../ai/ledgers/port-gap-remediation.md)记录三浏览器真实双贴图切换、两阶段UBO变化、自动/显式布局、MR/SMR的effectName/effectAsset，以及现有builtin Material对照。负Shader必须进入实际绘制才触发本轮设备路径的编译/链接；原生错误16323/16326保留program名，开发session分别捕获shader/link类别，正常场景仍可绘制。SMR此探针用不蒙皮的自定义shader隔离材质注册，骨骼变形另验；GPU内存量不可测，不能以资源isValid=false代替零泄漏证明。

开发工具 [effect-json.mjs](../../tools/build/effect-json.mjs) 可以生成 WebGL2 可注册的 JSON，
不需要手抄 `blocks`、attributes、枚举和三份 shader 源码。它是受限模板生成器，运行时包不依赖该工具。

```bash
node tools/build/effect-json.mjs examples/point-cloud-basics/point.effect-spec.json examples/point-cloud-basics/point.effect.json
```

输入为声明表和两个含 `main()` 的 GLSL body；body 可直接写在 JSON 中，或用
`"vertex": { "file": "vertex.glsl" }` / `"fragment": { "file": "fragment.glsl" }` 指定相对于声明文件的路径。
输出路径必须显式提供；生成前先校验，不会在校验失败时覆盖旧输出。
输出内含 `glsl4` 和从同源声明生成的 `glsl3`；WebGL2 消费后者，不生成退役的 WebGL1 变体。

| 声明项     | 支持范围                                                  | 约束                                            |
| ---------- | --------------------------------------------------------- | ----------------------------------------------- |
| attributes | `vec2` / `vec3` / `vec4`                                  | 明确唯一 location，0–15；网格属性名和格式须匹配 |
| varyings   | `float` / `vec2` / `vec3` / `vec4`                        | 两阶段使用同一声明，默认 highp                  |
| uniforms   | `vec4` / `mat4`，count=1                                  | 提供4/16个有限默认值；标量参数放入 vec4 分量    |
| samplers   | `sampler2D`                                               | 必须提供内建默认纹理名；运行时可绑定 Texture2D  |
| primitive  | POINT_LIST、LINE_LIST/STRIP/LOOP、TRIANGLE_LIST/STRIP/FAN | 写入 effect pass；省略时保持引擎默认三角形      |

`Constants` 只接收16字节对齐的 vec4 和 mat4，使引擎紧密排列的 handle 偏移与 std140 一致；
不接受 float/vec2/vec3、数组、结构体、整数属性和用户定义 UBO，避免静默错误的 padding 推断。
CCCamera、CCLocal、CCGlobal 声明复用 [shader-blocks.js](../../examples/shared/shader-blocks.js) 的现有样板。
预处理、include、YAML `.effect`、动态宏、MRT、compute 和通用 GLSL 转译不在支持范围；
片段不重复写 `uniform/in/out/layout` 声明。合法 JSON 仍须经过真实 GPU 编译及像素检查。

program 名和32位模板 hash 由源码与声明内容生成；相同输入可重复生成，内容变化会改变模板身份。
hash 用于引擎缓存，不是安全指纹；正式证据仍应记录完整文件 SHA。

生成物的注册顺序：先完成 `createAirApp()`，然后 `Object.assign(new EffectAsset(), json)`、
`effect.onLoaded()`、`Material.initialize({ effectAsset: effect })`。如果只提前注册模板，遵守 §3 的设备时机区别。

## 8. 原生点和线的图元合同

[point-cloud-basics](../../examples/point-cloud-basics/) 使用真实 POINT_LIST 和 LINE_LIST，
包含上半区青色点阵、下半区橙色线段及 pointSize 的像素覆盖面积断言。
POINT_LIST 的枚举值为0，静态和动态 createMesh 均保留它；省略图元时仍默认 TRIANGLE_LIST。

**当前 PSO 以 pass.primitive 为准，mesh 单参数入口尚未实现。**
必须同时指定 `geometry.primitiveMode` 与 effect pass 的 `primitive`，不能仅在 mesh 中赋值后假定上屏。
生成器的 `primitive` 字段可减少手改 JSON；默认 pass 三角形不会自动适配点网格。
点 shader 还需写 `gl_PointSize`，该值以 framebuffer 像素计，支持大小范围取决于设备。
线宽不是 gl_PointSize，跨设备优先使用默认1像素线宽。

本批保留显式 pass 语义，不更改 PSO 缓存或全局图元来源。
同一材质可被多个 primitive 引用，必须为各图元使用匹配 pass；多 pass 材质的每个绘制 pass 都要匹配。
PSO key 已包含 pass hash，而 pass hash 含 primitive，因此 POINT 与 LINE 使用独立缓存对象。
instancing、附加光照、阴影、反射和自定义管线可能创建或复用不同 IA，不能仅在普通 render queue 临时改图元。
如后续实现 mesh 自动协调，需要统一传递 IA 图元、纳入 PSO key、明确显式 pass 覆盖优先级，
并覆盖实例化 IA、子网格替换及全部绘制队列。点/线的 shadow shader 仍须由业务提供兼容版本。
