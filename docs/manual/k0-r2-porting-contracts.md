# K0 R2：网格、材质、动画与坐标

这17条对应用户目录N1–N14（N14拆为a/b/c/d）。历史K0现象与当前候选分开记录；本页不承诺所有模型、管线、GPU或Gallery已验收。

## 动态网格

先等待 `createAirApp()` resolve。默认容量为1子网格、1024顶点、1024索引；大网格必须显式提供完整 `maxSubMeshes/maxSubMeshVertices/maxSubMeshIndices`。容量、索引、属性及设备前置校验已实现，错误包含 `AIR_E_MESH_*`；失败不会提交非法数据。

静态 `createMesh` 用 `indices`；动态创建/更新用 `indices16` 或 `indices32`。错误键会拒绝，不推测调用者想要哪种布局。局部更新保留未改变的索引、UV与法线，不必每帧重复传全部属性。更新后对每个共享使用者调用 `renderer.onGeometryChanged()`，同步Model边界和输入装配器的绘制数量。显式空索引与省略索引含义不同。详见[原生合同](engine-contract-hardening.md)。

## 顶点色与纹理

`builtin-unlit` 正确宏是 `USE_VERTEX_COLOR`，同时提供每顶点四分量0..1的 `colors`。宏关闭时只用mainColor；宏打开但缺颜色属性应诊断，不能把声明里的define当作GPU已经消费属性。`inspectAirMeshMaterial(mesh, material, 0, renderer)` 在首帧编译后能观察实际variant的active属性；设备未编译时明确unavailable。

`USE_TEXTURE` 同时需要可用UV和mainTexture。缺UV可能退化为常量坐标，是否消失取决于该纹素的颜色/alpha：透明纹素可以让整面不见，实色纹素则显示均匀色。不要一律将这种画面判为几何丢失。检查器给出 `AIR_W_TEXTURE_UV_MISSING`。

## 原生透明与加色

当前builtin-unlit只有一个opaque technique。可在原生 `Material.initialize` 中声明混合和深度状态；无需复制引擎材质体系或选择不存在的technique。

```ts
import { Material, Color, gfx } from 'cocosair.js';
const material = new Material();
material.initialize({
  effectName: 'builtin-unlit',
  states: {
    depthStencilState: { depthTest: true, depthWrite: false },
    blendState: { targets: [{
      blend: true,
      blendEq: gfx.BlendOp.ADD,
      blendSrc: gfx.BlendFactor.SRC_ALPHA,
      blendDst: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
      blendAlphaEq: gfx.BlendOp.ADD,
      blendSrcAlpha: gfx.BlendFactor.ONE,
      blendDstAlpha: gfx.BlendFactor.ONE_MINUS_SRC_ALPHA,
    }] },
  },
});
material.setProperty('mainColor', new Color(255, 0, 0, 128));
renderer.setSharedMaterial(material, 0);
```

加色RGB将 `blendDst` 改为 `gfx.BlendFactor.ONE`，源alpha仍控制贡献。透明排序、HDR/tone mapping、预乘及纹理色彩空间各有独立语义，本次用绿背景与红前景的固定两层检查；不是所有透明场景的排序证明。自有material持一份addRef，解绑后归还；共享借用材质不强制destroy。

## glTF蒙皮与动画

当前Fox真实GLB的默认 `air-gltf-standard` 可见，不需要用builtin-standard强行覆盖它的纹理/PBR/扩展语义。历史K0黑体的具体臂依赖当时包、材质、光照和模型；当前候选通过不等于已追溯旧臂根因。

```ts
import { Animation } from 'cocosair.js';
const asset = await loader.parseAsync(bytes, modelURL);
const instance = asset.instantiate();
instance.setAnimationLoop(true, instance.animations[0].name);
scene.addChild(instance.root);
// instantiate已附加Animation。复用它，避免另加重叠控制器。
const animation = instance.root.getComponent(Animation)!;
animation.play(instance.animations[0].name);
```

默认Normal播放一次后停在终点是原生语义。`setAnimationLoop` 设置此实例的native state，并在挂载时保留；不要写共享clip.wrapMode来修改所有实例。需要一次性动作仍使用Normal。潜在多控制器覆盖由 `inspectAirAnimationControllers` 和 `AIR_W_ANIMATION_CONTROLLERS` 提示；元数据重叠不代表已证明两个控制器同时播放，更不禁止合法独立控制器。

## 绕序、雾、灯光和缩放

背面剔除按投影后的三角形绕序工作。提供normal不会替你改变索引；负世界缩放能翻转绕序。先修正几何方向，对确实双面内容显式设 `rasterizerState.cullMode = gfx.CullMode.NONE`。不要全局关闭剔除来掩盖破洞。

Fog关闭时保留请求type，当前有效type/宏为NONE，重新启用恢复配置；启用前后设置合法type的结果相同。需要unlit精确雾时用现有 `createAirUnlitFogEffect()`；字段启用不等于材质shader包含雾。普通legacy-forward允许多个DirectionalLight组件注册，但只选1盏mainLight照明；禁用/移除触发原生接替，并非只能创建1个组件。

`setRotationFromEuler` 单位为角度；90°Z将+X转为+Y。普通mesh、instanced mesh、当前glTF realtime蒙皮均使用世界缩放。Billboard有独立展开尺寸，使用width/height，见[Billboard](billboard.md)。不采用全局烘几何的规避方法。

## 投影坐标转DOM

原生Camera组件 `worldToScreen(worldPoint)` 输出framebuffer坐标，原点左下。DOM client坐标左上；按canvas当前DOM矩形与实际物理宽高换算，而不是再乘一次DPR。

```ts
const screen = camera.worldToScreen(worldPoint);
const rect = canvas.getBoundingClientRect();
const clientX = rect.left + screen.x * rect.width / canvas.width;
const clientY = rect.top + (canvas.height - screen.y) * rect.height / canvas.height;
```

子viewport已包含在worldToScreen输出中，不重复加viewport偏移。page坐标再加scrollX/scrollY。本配方适用于无旋转/倾斜CSS transform、无border/padding的canvas；有这些样式需使用内容框及相应逆变换，getBoundingClientRect单独不足以反演旋转。另注意render-scene底层Camera的参数顺序与Camera组件不同。

## 当前验收

`node tools/verify/k0-r2-rendering.cjs --browser=all --out=<新.json>` 采当前工作区；加 `--installed` 会本地pack、离线安装、仅加载安装包的esbuild产物，并用其声明做TS4.9消费检查。两种运行都不编译引擎、不下载浏览器、不发布包，输出只写指定新JSON与相邻原生PNG。需要当前bundle与配置好的Playwright/pngjs。

runner从PNG字节重新计算颜色与面积，检查真实输入装配器、native动画状态、Fog恢复、实际主光、引用归还和错误。CANVAS_NATIVE证明渲染结果，不提供浏览器页面合成或显示器present/FPS证明。来源、历史失败及完整命令见[本次台账](../../ai/ledgers/k0-r2-engine-traps.md)；CPU合同由Orca Worker执行，最终采集器与安装消费由Lead执行。

安装消费只从实际安装包加载SDK；Fox模型是仓库中的独立HTTP测试资产，报告另记它的SHA，不宣称模型随npm包发布。新增测试已进入 canonical 库存（106 套、846 项；842 通过、4 项旧规格/矩阵门禁失败）。相关 6 套36项通过；全量库存的失败状态不能由限定采集替代。

## 可运行示例

启动 `npm run dev -- --example k0-r2-porting-contracts`，打开 [正式示例](../../examples/k0-r2-porting-contracts/index.html)。四个按钮比较顶点色、alpha/add 混合、动态局部更新与 Billboard；暂停、重置和释放沿用真实资源所有权路径。操作说明与边界见[示例 README](../../examples/k0-r2-porting-contracts/README.md)。

已有 [动态批处理](../../examples/batching-dynamic/index.html) 现在仅更新 positions/bounds 并通知渲染器；[蒙皮示例](../../examples/gltf-skin/index.html) 在挂载前调用实例级循环 API，复用自动 Animation，直接使用默认 glTF 材质；[线条示例](examples/manual-drawing-lines/index.html) 的宏已同步为 USE_VERTEX_COLOR。

`node node_modules/typescript/bin/tsc -p tools/verify/k0-r2-examples.tsconfig.json` 单独检查这四份示例及当前 SDK 声明；root typecheck 不代替此检查。`NODE_PATH=output/playwright/tooling/node_modules node tools/verify/k0-r2-examples.cjs --browser=all --out=<新.json>` 启动只读服务器和三浏览器，核对实际按钮、PNG 颜色/帧变化、暂停、实例动画、资源释放及移动视口，写新报告及相邻截图，不构建 SDK、不发布。实际记录见 [examples-verified.json](../evidence/examples/k0-r2/examples-verified.json)；这是四个示例的限定验收。
