# 直接加载 glTF / GLB

浏览器可以直接加载 glTF 2.0 JSON、多文件 glTF 或 GLB，无需 Creator 或离线转换。先完成 `createAirApp()`，再加载模型；模型使用原生 Cocos 资源、渲染器和 `Animation`。

需要浏览更多官方模型或比较显示效果，使用 [官方模型目录与对照预览](gltf-catalog.md)，地址为 `http://127.0.0.1:7462/gltf-catalog/`。

## 加载并播放

以下代码用于已创建 `#GameCanvas` 的模块页面；相机、光照和 importmap 可直接参考 [完整示例](../examples/gltf-viewer/main.js)。

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

| 类别 | 支持 |
|---|---|
| 容器 | glTF 2.0、GLB 2.0、外部 BIN、Data URI、内嵌 BIN/PNG/JPEG |
| Accessor | 合法 offset/stride、normalized 整数、sparse、矩阵列对齐；单 accessor 最多 16M 个解码分量 |
| 几何 | 多 primitive、索引/非索引、点/线/三角形及 strip/fan/loop；POSITION、NORMAL、TANGENT、COLOR_0、UV0/UV1 |
| 缺省数据 | 无法线三角网格生成平面法线并展开相关顶点数据；法线贴图缺少切线时生成正交化切线 |
| 材质 | metallic-roughness PBR、baseColor/MR/normal/occlusion/emissive 贴图及因子、独立 UV0/UV1、采样器、OPAQUE/MASK/BLEND、doubleSided |
| 场景 | TRS、可无损分解的 matrix、多场景、负缩放与运行时祖先镜像 |
| 蒙皮 | 多 skin、共享 skin、非关节祖先、任意 joint 顺序、有/无 inverseBindMatrices、JOINTS_0/WEIGHTS_0 四权重、原生实时蒙皮 |
| 动画 | 多 clip、TRS 和 Morph weights、STEP/LINEAR/CUBICSPLINE、原生播放/暂停/切换；四元数 Hermite 求值后归一化 |
| Morph | POSITION/NORMAL/TANGENT 位移、mesh/node 初始权重、独立实例权重 |
| 扩展 | KHR_materials_unlit、KHR_texture_transform |

`KHR_texture_transform` 支持每个 textureInfo 独立的 `offset`、`rotation`（弧度）、`scale` 和 `texCoord` 覆盖，作用于 baseColor、metallicRoughness、normal、occlusion、emissive。变换围绕 UV 原点应用，支持负缩放；UV 通道仍限于 UV0/UV1。共享纹理可以在不同材质槽使用不同变换，网格 UV 不会被改写。缺少切线时，法线贴图使用有效 UV 通道及其变换生成切线。

Draco、Meshopt、KTX2/BasisU、额外权重集、UV2 及以上、高级材质扩展不在首版范围。未支持的必需扩展报错；可选扩展仅使用有效核心回退并告警，不把缺失数据冒充加载成功。相机和灯光只保留描述并告警，不自动创建组件。

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

打开 `http://127.0.0.1:7462/gltf-viewer/`。模型和许可说明随仓库提供，见 [来源清单](../examples/gltf-viewer/assets/SOURCES.md)。示例支持模型/动画选择、播放、暂停和确定时间采样。

可重复的浏览器检查使用 Playwright CLI：

```bash
npx --yes --package @playwright/cli playwright-cli -s=gltf open http://127.0.0.1:7462/gltf-viewer/ --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=gltf run-code --filename=tools/verify/gltf-browser.js
```

先创建 `output/playwright/` 截图目录。脚本检查实际 canvas 像素、动画前后变化、UV 方向、透明混合、镜像绕序以及浏览器错误。HEADLESS 单测不替代这些画面检查。

WebGL1 验证：先用同一 CLI 会话打开 `http://127.0.0.1:7462/gltf-viewer/?webgl=1`，再运行同一脚本；脚本在导航前禁用 WebGL2 context 以强制回退。当前验证结果、已有工具告警和截图见 [验证记录](gltf-validation.md)。

## 实现依据

- 容器与数据语义：[Khronos glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)。
- load/parse 分离、依赖解析和资源生命周期参考 [Three.js](https://threejs.org/docs/pages/GLTFLoader.html)、[LayaAir](https://github.com/layabox/LayaAir/blob/master/src/layaAir/laya/gltf/glTFLoader.ts)、[Galacean](https://github.com/galacean/engine/blob/main/packages/loader/src/GLTFLoader.ts)；没有新增这些引擎的运行时依赖。
- 原生骨骼、动画、Morph 与材质均由 Air 适配层构造。独立 effect 修正 glTF 颜色/AO/UV 语义及 WebGL 着色器兼容问题，原有 builtin-standard 保持原样。
- 原 `extname` 将 `#fragment` 算作文件扩展名，导致 `loadRemote` 选错工厂；修复仅剥离 fragment，证据与回归见 [glTF 测试](../test/smoke/smoke-07-gltf.test.ts)，来源标注见 [上游映射](upstream-file-map.json)。
- 此实现采用运行时直读，替代旧 V0.3 计划对此功能的离线导入要求；不包含离线资产包工具。
