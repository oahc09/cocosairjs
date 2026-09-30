# 运行时资源检查

V0.3 复用现有资源和外部 glTF/GLB 任务的公开 API，增加开发期 Inspect/Validate、生命周期回归和独立静态验证。没有新增资源格式、导入器、公共模型包装或 AssetDB。

## 资源从哪里来

| 对象 | 已有来源/生成方式 | Runtime 使用与依赖 | 所有权 |
|---|---|---|---|
| Mesh | static-model 的 JSON 经 utils.createMesh；外部 GLTFAsset.meshes | MeshRenderer.mesh；primitive 对应材质槽；程序化 Mesh 需生成 bounds 才能自动取景 | 程序化资源由业务管理；外部模型子资源由 GLTFAsset 持有 |
| Material | 原 Material.initialize/setProperty；外部 GLTFAsset.materials | effect、纹理和渲染宏决定实际外观；仅赋值成功不能证明画面生效 | 共享材质不由单个实例随意销毁 |
| Texture2D | 静态示例的程序化 ImageAsset；外部模型 PNG/JPEG | Material 的显式纹理属性；依赖图像和 sampler | 外部模型资源随父 GLTFAsset 管理 |
| Skeleton | V0.2 helper 捕获骨骼世界矩阵；外部 GLTFAsset.skeletons | joints 相对 skinningRoot 的路径与 bindposes 一一对应 | 外部模型保留其已有空间约定，不再用 helper 重建覆盖 |
| AnimationClip | 外部任务生成的原生轨道；GLTFInstance.animations 为所选 scene 的 clip | 原 Animation 的播放状态；Node 层级、组件及属性必须可绑定 | 实例拥有独立播放状态；共享 clip 不能被单个实例擅自修改 |

依据：[静态示例](../../examples/static-model/main.js)、[骨骼工具](../../src/air/utils/skeleton-tree.ts)、[GLTFAsset](../../src/air/assets/gltf/asset.ts)、[加载入口](../../src/air/assets/gltf/loader.ts)。这里分析已交付数据；没有获取 Creator 的完整 Import 源码，因此不推定其编辑器生成流程。

当前模型路径采用运行时直读，没有离线生成 manifest/model.bin。资源查找沿用原 URL/cache、GLTFAsset 只读集合和 instance.root；inspect 返回的 ID 仅用于当前报告关联，不是 UUID、缓存键或新存储格式。

源文件元数据、图像和 buffers 属模型任务输入；Mesh、Material、Skeleton、Clip 是该任务构造的原 Cocos 对象。Code First 使用不依赖 Creator `.scene`、Prefab 或 AssetDB；外部任务保留的 extras/相机/灯光描述不等同于自动创建运行时组件。支持边界以 [外部运行时指南](../gltf/gltf-runtime.md) 为准。

## Code First 组装与生命周期

复用 [gltf-viewer](../../examples/gltf-viewer/main.js)，不重复创建 character-runtime。它已覆盖模型、材质、骨骼/Morph 与动画控制；本版在同一入口增加独立验证脚本，没有修改外部 loader。

以下代码用于已初始化 app、已创建 scene 的模块页面，场景另设相机与光照：

```ts
import { GLTFLoader, Animation } from 'cocosair';

const asset = await new GLTFLoader().loadAsync('./assets/combined.glb');
asset.addRef(); // 业务持有，允许所有实例销毁后再次使用
const first = asset.instantiate();
const second = asset.instantiate();
scene.addChild(first.root);
scene.addChild(second.root);
if (second.animations.length) {
    second.root.getComponent(Animation)!.play(second.animations[0].name);
}
first.dispose(); // 不销毁 second 的共享 Mesh/Material
second.dispose();
asset.decRef(); // Cocos 延迟生命周期完成后释放
```

加载返回完整节点树时直接挂载，不拆解重建。已有 `loadAssetAsync()` 入口与外部 loader 的分工保持不变。销毁由对象所有者执行，检查工具不增加引用、不创建材质实例、不销毁对象。跨实例共享 Mesh、Material 与 clip 数据，播放状态独立；修改共享材质会影响共享它的实例，属于原有合同。

不要手动销毁共享子资产；需要独立持有网格/纹理时持有父 GLTFAsset。`dispose()` 幂等但释放有延迟，不能只在调用后立即读取计数判定泄漏。原 app.run(scene) 可替换场景，主循环只启动一次；没有添加 stop/destroy 公共 API。

## Inspect / Validate

[runtime-assets.js](../../tools/verify/runtime-assets.js) 是开发工具，既不导入 SDK，也不解析源文件。调用方传入公开 SDK namespace 与当前 root，可选传入已有资源集合。

启动 `npm run dev`，示例运行后在浏览器控制台执行：

```js
const cc = await import('/build/cocosair.module.js');
const { inspectRuntimeAssets, validateRuntimeAssets } = await import('/__runtime-assets.js');
const report = inspectRuntimeAssets(cc.director.getScene(), cc);
console.table(report.resources);
console.table(report.references);
console.table(report.diagnostics);
console.table(report.unchecked);
validateRuntimeAssets(cc.director.getScene(), cc); // 有错误时抛出，error.report 保留报告
```

静态验证站点对应工具地址为 `../verify/runtime-assets.js`。这是工具脚本 URL，不是新的公共运行时 API。

检查包括：

- Node、Mesh、Material、Texture2D、Skeleton、AnimationClip 清单与对象引用去重。
- 缺失 mesh/material/effect、错误类型、已销毁或待销毁资源。
- Skeleton 的关节数与 bindpose 数不一致、关节路径无法找到。
- Animation track 的层级、组件、属性或元素目标无法绑定。

诊断包含 code/location/message。有些信息无法只读证明：默认/builtin sampler 绑定、custom path resolver 和 value proxy 的执行会列入 unchecked，绝不假定通过。通过检查不代表 GPU 正确或对所有模型格式兼容；真实纹理、动画及 WebGL 错误另由浏览器检查验证。

## 可重复验证

```bash
node node_modules/jest/bin/jest.js --runInBand
node tools/verify/build-cache.cjs
node tools/verify/dev-loop.cjs
npm run typecheck
npm run build
npm run build:min
node tools/verify/source-maps.cjs
npm run verify:web-only
node node_modules/typescript/bin/tsc --noEmit --strict --skipLibCheck --target ES2017 --module NodeNext --moduleResolution NodeNext test/types/v03.mts
```

`build-cache.cjs` 验证真实 Rollup 模块重用、依赖变更、构建失败恢复与配置失效；不修改引擎源码。`dev-loop.cjs` 使用独立 7471 端口和自有临时 TS 示例，检查编译、错误恢复、importmap、零引擎重建以及非侵入 WebGL 诊断，结束后清理自己的文件和进程。可用 AIR_VERIFY_PORT 指定其他端口。

独立静态站点（PowerShell）：

```powershell
node tools/verify/prepare-static.cjs
$site = (Get-Content output/playwright/v03-site.json -Raw | ConvertFrom-Json).root
node tools/verify/serve-static.cjs $site 7464
```

这会复制引擎产物、编译后的示例、其静态资源及独立检查脚本到唯一临时目录；服务器只提供静态文件，不访问 src 或 dev middleware。normal/minified 两份站点都在 `/nested/demo/` 下，源码中的根绝对 importmap 在复制阶段改为部署相对路径，不修改外部示例原文。

另一终端运行：

```bash
npx --yes --package @playwright/cli playwright-cli -s=v03 open http://127.0.0.1:7464/nested/demo/normal/starter/ --browser chrome
npx --yes --package @playwright/cli playwright-cli -s=v03 run-code --filename=tools/verify/bundle-variants-callback.js
```

脚本遇到验证错误会抛出并使 CLI 非零退出，不能只看工具调用完成。结果包含 `ok`、每个示例的资源数/前景像素、材质变化像素、动画变化和生命周期计数；截图放入 output/playwright。临时目录可用于本地演示，不自动发布远端。

复跑流程与发布要求见 [验证指南](../reference/verification.md)。
