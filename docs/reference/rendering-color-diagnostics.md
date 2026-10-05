# 颜色、环境贴图与材质诊断

这些辅助函数使用原生 `Texture2D`、`TextureCube`、`Material` 和 Pass；不会改变标准材质的默认颜色处理、生成环境卷积、开启灯光或创建播放器。格式校验是分配前检查，设备是否支持对应格式仍由实际分配和 framebuffer 检查决定。

## 在分配前声明贴图语义

```ts
import { Texture2D, validateAirTextureColorContract } from 'cocosair.js';

// 自定义 effect 已负责输出编码，采样时由硬件解码一次。
const format = Texture2D.PixelFormat.SRGBA8888;
validateAirTextureColorContract({
    format,
    usage: 'color',
    decode: 'hardware-srgb',
});
const texture = new Texture2D();
texture.reset({ width: 2, height: 2, format });
```

`resolveAirTextureFormat({})` 保留原生默认 `RGBA8`，也可传第二个参数指定调用点原有默认值。`{format: undefined}` 会抛出 `AIR_E_TEXTURE_FORMAT`，不会静默选择默认值。

| 内容                                | `usage`       | 格式与 decode                            |
| ----------------------------------- | ------------- | ---------------------------------------- |
| 标准材质 albedo/emissive            | `color`       | 线性 GPU 格式存 sRGB 字节，`shader-srgb` |
| 自定义 effect 硬件颜色解码          | `color`       | sRGB GPU 格式，`hardware-srgb`           |
| 已线性化的颜色                      | `color`       | 线性 GPU 格式，`none`                    |
| normal/metallic/roughness/occlusion | `linear-data` | 线性 GPU 格式，`none`                    |
| 可采样深度附件                      | `depth`       | DEPTH/DEPTH_STENCIL，`none`              |

sRGB 格式搭配 `shader-srgb` 会重复解码，校验直接拒绝。该函数不会从纹理字节猜测编码，也不会自动更改材质宏。alpha 始终按线性值处理；详见[显式纹理颜色空间](texture-color-space.md)。

## 消费已预过滤的原生环境贴图

`validateAirPrefilteredEnvironment(cube, metadata)` 要求原生 `TextureCube` 已标记为 baked convolution、提供至少两个显式六面 mip level，且每级格式和尺寸正确。普通/AUTO mipmaps、仅一张打包图的资产不满足这个辅助函数的合同；它们仍可由原有原生接口使用。

metadata 的 `distribution: 'ggx'`、`source` 是生产者声明，不证明像素真的经过 GGX 卷积。这里没有新增 PMREM/GGX 生成器，不能把普通缩小滤波称为预过滤。

当前原生标准 shader 的实际 LOD 是 `roughness * envmap.mipmapLevel`，不是 `roughness * (levels - 1)`。因此三个 mip 的合同是 `[0, 1/3, 2/3]`，roughness=1 的采样由纹理最大 mip 夹到末级。其他预过滤粗糙度分布需要自定义 shader，不能只换一组 metadata。

```ts
import { bindAirPrefilteredEnvironment } from 'cocosair.js';

// scene、envmap 和 filteredCube 已创建并上传；后者有三个显式 mip。
scene.globals.skybox.envmap = envmap;
bindAirPrefilteredEnvironment(scene, filteredCube, {
    distribution: 'ggx',
    roughnessLevels: [0, 1 / 3, 2 / 3],
    encoding: 'rgbe',
    source: 'project GGX convolution recipe and asset revision',
});
```

原生环境 shader 对非 RGBE 输入执行软件 sRGB 解码；`encoding:'linear'` 和硬件 sRGB 环境纹理会被这个辅助函数拒绝。`cube.isRGBE` 必须匹配声明编码。decode 宏和 LOD 级数来自 `envmap`，所以绑定前还验证 envmap/reflectionMap 的 RGBE 标记及 mip 级数一致。失败时保持原 reflectionMap。函数只绑定 reflectionMap，不自动开启 IBL、改变曝光或转移资源所有权。

## 看实际 Pass 与纹理绑定

```ts
import { inspectAirMaterial } from 'cocosair.js';

console.table(inspectAirMaterial(renderer.getMaterialInstance(0)!));
```

快照读取实际 Pass 的 depth test/write/function、cull、每个 blend target、priority、phase、stage，以及 descriptor 中绑定的纹理格式、尺寸、mip 级数和 sampler comparison 元数据。它不读取 `_props` 推测 GPU 格式；直接重绑 descriptor 后也能看到新资源。返回数据被冻结，不含可变的原生纹理对象。

这是一份 CPU descriptor 状态快照，不是 GPU reflection 或实际 draw 捕获。priority/phase 是提交参数，最终队列还受到 camera、深度排序和 renderer 的影响。全局/模型 descriptor 的纹理也不属于材质集合。`comparison` 仅报告 sampler 元数据，不能证明 WebGL2 配置了硬件深度比较。

## 生成并定位深度 sampler

effect 预检是独立开发工具，从工作区显式导入；它不进入默认 runtime：

```ts
import { createAirDepthSamplerTemplate, locateAirEffectBinding } from '../../tools/debug/effect-layout';

const depth = createAirDepthSamplerTemplate({
    name: 'sceneDepth', binding: 1, stage: 'frag', mode: 'manual-compare',
});
// 将 depth.resource 加入 shader.samplerTextures，depth.glsl4/glsl3 加入对应源码。
// effectJson 是组装后的完整 effect JSON：
console.log(locateAirEffectBinding(effectJson, 'water', 'sceneDepth'));
```

模板声明 `uniform highp sampler2D` 并用 `texture(sceneDepth, uv).r` 读原始深度；比较函数 `sceneDepthVisibility(uv, referenceDepth, bias)` 用 `step(referenceDepth - bias, storedDepth)` 返回可见度。referenceDepth 必须是投影后的 WebGL [0,1] 深度，而非视空间 Z 或 clip [-1,1] 深度；UV 必须对齐深度附件。模板不替业务计算投影、不提供 PCF。

当前 WebGL2 后端未配置 texture comparison mode，所以 `hardware-compare`/`sampler2DShadow` 以 `DEPTH_COMPARISON_UNAVAILABLE` 明确拒绝。`locateAirEffectBinding()` 先执行 effect 预检，再返回 shader/name/set/binding 和 glsl4 stage/行号；碰撞、反射不匹配和未知资源会报告具体资源身份，不猜一个能编译的 binding。

## 定向验证

```powershell
node node_modules/jest/bin/jest.js --runInBand test/smoke/render-dx-color-contract.test.ts test/smoke/render-dx-material-diagnostics.test.ts test/smoke/render-dx-depth-layout.test.ts test/smoke/port-gap-effect-layout.test.ts
```

这些测试覆盖原生 cube 数据与绑定失败原子性、颜色参数正负控、descriptor 重绑和深度模板布局。它们不是画面验收；多 pass、采样、颜色与深度 GPU 行为由本轮统一构建后的浏览器探针另行验证，不能沿用旧 bundle 的截图作本轮证据。
