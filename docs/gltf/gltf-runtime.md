# 直接加载 glTF / GLB

浏览器可以直接加载 glTF 2.0 JSON、多文件 glTF 或 GLB，无需 Creator 或离线转换。先完成 `createAirApp()`，再加载模型；模型使用原生 Cocos 资源、渲染器和 `Animation`。

需要浏览更多官方模型或比较显示效果，使用 [官方模型目录与对照预览](gltf-catalog.md)，地址为 `http://127.0.0.1:7462/gltf-catalog/`。

## 加载并播放

以下代码用于已创建 `#GameCanvas` 的模块页面；相机、光照和 importmap 可直接参考 [完整示例](../../examples/gltf-viewer/main.js)。

```ts
import { createAirApp, Scene, GLTFLoader, Animation } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('Main');
app.run(scene);

const asset = await new GLTFLoader().loadAsync('./models/robot.glb');
const instance = asset.instantiate();
scene.addChild(instance.root);
if (instance.animations.length) {
    instance.root.getComponent(Animation)!.play(instance.animations[0].name);
}
// 场景中需要另设相机和光照。实例不再使用时：
// instance.dispose();
```

默认实例化文件默认 scene；无默认 scene 时选择第一个。没有 scenes 时使用无父节点构建场景。`instantiate(index)` 可选择其他 scene。实例默认不挂载、不播放；模型不会自动归一化尺寸、居中或改变坐标系。

动画默认按原生 `WrapMode.Normal` 单次播放，正常完成后停在末帧。需要循环时，在 `play()` 前调用 `instance.setAnimationLoop(true, clipName)`；省略名称会配置该实例的所有剪辑，`false` 恢复单次播放。该入口初始化并配置实例的原生 `AnimationState`，不修改共享 `AnimationClip`；配置在首次场景激活后仍保持有效，不自动播放。动态改变 wrap mode 会重置选定 state 的时间与重复计数，不要每帧调用。非法选项、未知名称和已释放实例抛 `AIR_E_GLTF_ANIMATION_OPTIONS`。共享资源与私有材质变体、暂停/切换的完整示例见 [glTF Animation Instances](../../examples/gltf-animation-contract/README.md) 和 [动画手册](../manual/animation-system.md)。

### 其他加载入口

```ts
import { GLTFAsset, GLTFLoader, loadAssetAsync, assetManager } from 'cocosair';

const a = await loadAssetAsync('./models/robot.glb', GLTFAsset);
const b = await loadAssetAsync<GLTFAsset>('./models/robot.gltf');
assetManager.loadRemote<GLTFAsset>('./models/robot.glb', (error, asset) => {
    if (error) { console.error(error); return; }
    console.log(asset.sceneNames);
});

// URL 没有扩展名时用显式类型或 ext；parseAsync 自动识别 JSON/GLB。
const c = await loadAssetAsync('/api/model/123', GLTFAsset);
assetManager.loadRemote('/api/model/123', { ext: '.glb' }, console.log);

const bytes = await (await fetch('./models/robot.glb')).arrayBuffer();
const d = await new GLTFLoader().parseAsync(bytes);
const jsonText = await (await fetch('./models/robot.gltf')).text();
const e = await new GLTFLoader().parseAsync(jsonText, new URL('./models/', location.href).href);
```

`parseAsync(data, baseUrl?)` 接收 JSON 字符串或 ArrayBuffer；含相对外链时必须提供基准目录 URL。支持 Data URI 和 GLB bufferView 图片。URL 的 query/hash 不参与格式识别。HTTP、图片解码、格式或设备能力错误会拒绝 Promise，并回收本次创建的资源。

SDK 导入时幂等注册 downloader/parser/factory，不需要额外调用 `registerGLTFLoader()`。独立 URL 加载器与 `loadRemote` 复用现有资源缓存；`parseAsync` 不写入 URL 缓存。现有普通 JSON、resources 和已注册资产的 helper 行为保留。

## 资源与多实例

`GLTFAsset` 继承 `Asset`，提供只读集合 `meshes`、`materials`、`textures`、`skeletons`、`animations`、`sceneNames`。材质集合包含实际使用的材质变体，不保证与文件内 material 索引一一对应。`document` 保留源节点名、extras、相机和灯光描述；`warnings` 记录可选扩展回退等信息。

每次 `instantiate()` 创建独立节点、播放状态和 Morph 权重，共享静态网格与材质。节点内部名称带索引后缀，用于消除同名、无名及路径分隔符导致的绑定歧义。

```ts
asset.addRef(); // 业务持有资源，允许销毁全部实例后再次实例化
const first = asset.instantiate();
const second = asset.instantiate();
first.dispose(); // 幂等；不会销毁 second 的共享资产
second.dispose();
asset.decRef(); // 业务不再持有
```

实例自动持有父资产引用；销毁 root 或调用 `dispose()` 都会释放引用。销毁遵循 Cocos 延迟生命周期，在子节点与组件销毁后释放 GPU 资产。显式 `asset.destroy()` 会禁止创建新实例、移除其标准缓存条目，并等待已有实例结束后释放资源。要保留单独使用的网格、材质或纹理，请持有父 `GLTFAsset`，不要单独销毁共享子资产。

## 支持边界

| 类别     | 支持                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 容器     | glTF 2.0、GLB 2.0、外部 BIN、Data URI、内嵌 BIN/PNG/JPEG                                                                        |
| Accessor | 合法 offset/stride、normalized 整数、sparse、矩阵列对齐；单 accessor 最多 16M 个解码分量                                        |
| 几何     | 多 primitive、索引/非索引、点/线/三角形及 strip/fan/loop；POSITION、NORMAL、TANGENT、COLOR_0、UV0/UV1                           |
| 缺省数据 | 无法线三角网格生成平面法线并展开相关顶点数据；法线贴图缺少切线时生成正交化切线                                                  |
| 材质     | metallic-roughness PBR、baseColor/MR/normal/occlusion/emissive 贴图及因子、独立 UV0/UV1、采样器、OPAQUE/MASK/BLEND、doubleSided |
| 场景     | TRS、可无损分解的 matrix、多场景、负缩放与运行时祖先镜像                                                                        |
| 蒙皮     | 多 skin、共享 skin、非关节祖先、任意 joint 顺序、有/无 inverseBindMatrices、JOINTS_0/WEIGHTS_0 四权重、原生实时蒙皮             |
| 动画     | 多 clip、TRS 和 Morph weights、STEP/LINEAR/CUBICSPLINE、原生播放/暂停/切换；四元数 Hermite 求值后归一化                         |
| Morph    | POSITION/NORMAL/TANGENT 位移、mesh/node 初始权重、独立实例权重                                                                  |

> 机器可读支持矩阵：`examples/gltf-catalog/capabilities.json`（`npm run capabilities` 重新生成）。

Draco 的 adapter 支持应用注入 decoder；随包提供的 Draco 入口是 Node/CommonJS 形态。
浏览器正向解码需要应用另外提供兼容的浏览器 factory。当前验证等级为 smoke，
不能视为随包浏览器解码已验收，详见 [decoder 部署边界](gltf-decoder-deployment.md)。

> 每个扩展携带 registry 实时 status、decoder/设备要求、自动化证据（smoke / 真机浏览器脚本）、
> 计划对照的官方模型与 catalog revision；稳定错误码清单在 `errorCodes`。V0.5.1 直接消费本文件。

| 扩展 | KHR_materials_unlit、KHR_materials_emissive_strength、KHR_materials_ior、KHR_materials_specular、KHR_materials_clearcoat、KHR_materials_anisotropy、KHR_materials_iridescence、EXT_materials_bump、KHR_materials_transmission、KHR_materials_volume、KHR_materials_dispersion、KHR_texture_transform、KHR_mesh_quantization、KHR/EXT_meshopt_compression、KHR_draco_mesh_compression、KHR_lights_punctual、EXT_mesh_gpu_instancing、EXT_texture_webp、EXT_texture_avif、KHR_texture_basisu |

`KHR_texture_transform` 支持每个 textureInfo 独立的 `offset`、`rotation`（弧度）、`scale` 和 `texCoord` 覆盖，作用于 baseColor、metallicRoughness、normal、occlusion、emissive。变换围绕 UV 原点应用，支持负缩放；UV 通道仍限于 UV0/UV1。共享纹理可以在不同材质槽使用不同变换，网格 UV 不会被改写。缺少切线时，法线贴图使用有效 UV 通道及其变换生成切线。

Draco、Meshopt 需要注入 decoder（未配置时可选扩展回退核心数据、必需扩展报 `GLTF_DECODER_MISSING`）；额外权重集、UV2 及以上、高级材质扩展不在当前范围。未支持的必需扩展报错；可选扩展仅使用有效核心回退并告警，不把缺失数据冒充加载成功。

`KHR_lights_punctual` 实例化原生灯光组件，光度映射：directional `intensity` → `illuminance`（lux），directional 光沿节点局部 -Z 传播（与 glTF 一致）；point/spot `intensity`（cd）→ 引擎 luminousFlux（lm，point = 4π·I，spot = 2π(1−cos outerConeAngle)·I 均匀锥近似），`range` 原样、缺省用大有限值近似无限范围；`color` 线性值按 0–255 通道承载。引擎无 inner 锥平台输入，`innerConeAngle` 保留为 metadata 并告警。`EXT_mesh_gpu_instancing` 当前为正确性路径：校验 TRANSLATION/ROTATION/SCALE 的 VEC3/VEC4 float、count 一致与四元数有效后，展开为共享同一 Mesh/Material 的子节点；负缩放实例的卷绕由 GLTFWinding 自动修正，原生 instanced-draw 快路径为后续显式步骤。相机仍只保留描述并告警，不自动创建组件。

`KHR_materials_emissive_strength` / `KHR_materials_ior` / `KHR_materials_specular` 走派生 effect
`air-gltf-physical`（仅在任一非恒等标量/color/specular 纹理激活时选用，identity 材质保持
`air-gltf-standard`）。统一 uniform `airPhysicalParams = (emissiveStrength, iorF0/0.04, specularFactor, 1)`：
emissive 分量乘以 .x；ior 换算 `iorF0 = ((ior-1)/(ior+1))²` 并除以引擎介质基值 0.04（ior=1.5 恒等），
经 specularIntensity 进入 F0；specular factor（.z，[0,2]）调制 F0，specular 颜色因子（rgb，[0,1]）
经 `airSpecularColorFactor`。`specularTexture.G` 在片元阶段以 `2.0×G` 调制（Khronos Sample Renderer 约定），
`specularColorTexture.RGB` 逐通道调制；两者支持各自 texCoord 与 KHR_texture_transform（绑定 15/16 采样器、
独立 UV 变换 uniform）。unlit 材质忽略全部 BRDF 修饰并告警。非法值（strength<1、ior<1、factor 越界）
以 `GLTF_EXTENSION_INVALID` 失败。

`KHR_materials_clearcoat` 在同一 `air-gltf-physical` effect 上叠加独立 GGX 第二层（层 F0 固定 0.04 +
Schlick Fresnel）：`airClearcoat = (factor, roughness, normalScale, 1)`（UBO 追加成员，偏移不扰动
T5.1 字段）；`clearcoatTexture.R`、`clearcoatRoughnessTexture.G`、`clearcoatNormalTexture.RGB` 按规范
通道调制（绑定 17/18/19，支持 texCoord/KHR_texture_transform）。基底方向光为单主光近似（与
CCStandardShadingBase 相同），环境层贡献仅在启用 IBL 时叠加。切线来源：有 normal 贴图或顶点切线时用
TBN；否则以法线构造正交规范基近似（官方画面对照归 T8）。factor=0 材质回退标准 effect（层关闭）。

`KHR_materials_anisotropy` 将基底 GGX 高光替换为各向异性项（Kulla-Conty：alphaT=α(1+s)、
alphaB=α/(1+s)，Smith 可见项），`airAnisotropy = (strength, cos(rotation), sin(rotation), 1)`；
切线框架为世界空间：有顶点切线/normal 贴图用 TBN，否则规范正交基近似；`anisotropyTexture.RGB`
（[-1,1] 切线空间方向）重投影切线轴，strength 缺省在有贴图时为 1。rotation 以 cos/sin 编码避免
运行时三角函数。各向异性 lobe 仅替换主光高光项（漫反射与环境项不变）。

`KHR_materials_iridescence` 在非金属 F0 上叠加薄膜干涉（逐 RGB 波长 680/550/450nm 的非相干
Airy 公式）：`airIridescence = (factor, filmIor, thicknessMin_nm, thicknessMax_nm)`，基底 IOR 由
`airPhysicalParams.y`（iorF0/0.04）反推；`iridescenceTexture.R`、`iridescenceIorTexture.G`
（映射 [1.3, 2.3333]）、`iridescenceThicknessTexture.G`（映射 [min,max]）按规范通道调制；无体积
扩展时厚度取最大值（规范回退）。factor=0 回退标准 effect。

`EXT_materials_bump`（three.js 提案扩展）用屏幕空间导数把高度图扰动为法线：片元内
`dFdx(height)/dFdx(uv)/dFdx(position)` 解 UV 平面梯度后 `normalize(N - grad)`，`bumpFactor`（>=0，
默认 1）缩放量纲；`bumpTexture` 为必填（R 通道），支持 texCoord/KHR_texture_transform。与
`normalTexture` 共存时按提案可选项跳过扰动并告警。WebGL1 依赖 OES_standard_derivatives。

> **传输管线（T6）**：`KHR_materials_transmission/volume/dispersion` 折射的是不透明背景，
> 需要 scene-color 离屏渲染。运行时通过 `AirTransmissionCapture` 组件（两相机方案，
> **零改动共享 forward 渲染循环**）实现：一架低优先级相机把 transmission 层之外的所有不透明
> 物体渲进一张 RenderTexture；主相机（高优先级）再绘制玻璃网格，其着色器按世界法线与 IOR
> 对 scene-color 做屏幕空间 UV 偏移采样（折射），`KHR_materials_volume` 沿路径长度施加
> Beer-Lambert 吸收（attenuationColor/distance），`KHR_materials_dispersion` 以绿通道为基准
> 对 R/B 用不同 IOR 三次采样合成色散。能力仅在一架已启用的 capture 运行于 WebGL2 时点亮
> （`setTransmissionPipelineAvailable`）；未点亮时三扩展报告 `device-dependent`——required
> 文件干净失败、optional 告警并回退为不透明，**绝不退化成普通 alpha 混合还声称支持**。
> 玻璃网格由 capture 每帧扫描自动打上 `TRANSMISSION_LAYER`（1<<26）并从离屏相机剔除，避免
> framebuffer↔texture 反馈环。已知限制：透射排序按透明队列 BACK_TO_FRONT，相交玻璃体的相对
> 顺序不保证（glTF 通用近似）；折射使用当前帧 scene color（无逐物体递归）。

`KHR_texture_basisu`（KTX2）通过注入的 BasisU 转码器工作：`new GLTFLoader({ ktx2Transcoder })`
或 `setKTX2Transcoder(createKTX2Transcoder(() => BASIS({ locateFile })))`。转码器（`build/gltf-decoders/basis/`，
Apache-2.0，不进主 bundle）内部处理 zstd 超压缩与 ETC1S/UASTC 容器；loader 依据设备
`getFormatFeatures` 能力给出目标优先级（桌面 BC7 系、移动 ASTC_4x4/ETC2，含 sRGB 变体，最终回退 RGBA8）。
转码结果为内存图像源（压缩块数据或 RGBA8）按 `mipmapLevelDataSize` 逐 mip 上传，不经浏览器
图片解码。未配置转码器时可选回退核心 `source`（告警），列入 `extensionsRequired` 或无核心源时
报 `GLTF_DECODER_MISSING`；zstd 解码依赖转码器构建（vendored three r168 build 支持）。
cubemap/array KTX2 与 RGBA4444 等非常见目标当前显式拒绝（`GLTF_DECODE_FAILED`，不猜测降级）。

`EXT_texture_webp` / `EXT_texture_avif` 使用浏览器原生解码：能力探测（1x1 data URI，单页缓存）通过时优先取扩展 image，失败或无扩展时回退核心 `source`；探测未就绪时 `getExtensionSupport()` 乐观报告 `supported`，解析期做权威判定（可选扩展回退并告警；列入 `extensionsRequired` 时抛 `GLTF_DEVICE_UNSUPPORTED`）。扩展 image 的魔数与 `mimeType` 声明按规范强校验（不匹配为 `GLTF_EXTENSION_INVALID`）。

矩阵包含 shear 或无法可靠分解时失败。关节数量受原生 uniform/纹理 palette 容量约束；32 位索引需要设备支持。WebGL1 的 NPOT 纹理按设备限制降级为 clamp/no-mipmap 并告警。PBR 的最终亮度由场景光照、环境和色调映射决定；完全金属材质需要合适的照明。

## 本地验证

从仓库根目录运行：

```bash
npm run typecheck
node node_modules/jest/bin/jest.js --runInBand
npm run build
npm run build:dts
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2017 --moduleResolution node test/types/gltf.ts
npm run verify:web-only
node tools/verify/serve-gltf.cjs
```

打开 `http://127.0.0.1:7462/gltf-viewer/`。模型和许可说明随仓库提供，见 [来源清单](../../examples/gltf-viewer/assets/SOURCES.md)。示例支持模型/动画选择、播放、暂停和确定时间采样。

可重复的浏览器检查使用 Playwright CLI：

```bash
npx --yes --package @playwright/cli playwright-cli -s=gltf open http://127.0.0.1:7462/gltf-viewer/ --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=gltf run-code --filename=tools/verify/gltf-browser.js
```

先创建 `output/playwright/` 截图目录。脚本检查实际 canvas 像素、动画前后变化、UV 方向、透明混合、镜像绕序以及浏览器错误。HEADLESS 单测不替代这些画面检查。

当前运行时要求 WebGL 2，不提供 WebGL 1 回退。测试环境和采集要求见 [支持策略](../webgl2-only.md) 与 [验证指南](../reference/verification.md)。

## 实现依据

- 容器与数据语义：[Khronos glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)。
- load/parse 分离、依赖解析和资源生命周期参考 [Three.js](https://threejs.org/docs/pages/GLTFLoader.html)、[LayaAir](https://github.com/layabox/LayaAir/blob/master/src/layaAir/laya/gltf/glTFLoader.ts)、[Galacean](https://github.com/galacean/engine/blob/main/packages/loader/src/GLTFLoader.ts)；没有新增这些引擎的运行时依赖。
- 原生骨骼、动画、Morph 与材质均由 Air 适配层构造。独立 effect 修正 glTF 颜色/AO/UV 语义及 WebGL 着色器兼容问题，原有 builtin-standard 保持原样。
- 原 `extname` 将 `#fragment` 算作文件扩展名，导致 `loadRemote` 选错工厂；修复仅剥离 fragment，证据与回归见 [glTF 测试](../../test/smoke/smoke-07-gltf.test.ts)，来源标注见 [上游映射](../upstream-file-map.json)。
- 此实现采用运行时直读，替代旧 V0.3 计划对此功能的离线导入要求；不包含离线资产包工具。
