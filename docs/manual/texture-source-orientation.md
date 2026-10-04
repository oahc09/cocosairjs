# 纹理源方向合同（Texture Source Orientation）

PG-24：五类纹理源（HTMLImageElement / HTMLCanvasElement / ImageBitmap / ImageData / 原始 TypedArray）经公开 `ImageAsset`/`Texture2D`/原生渲染链的方向合同与实证结果。验证 runner：`tools/verify/air-texture-orientation-browser.cjs`（三浏览器，报告 `--out` 显式）；图样与判定单源：`test/fixtures/texture-orientation/contract.ts`；回归：`test/smoke/port-gap-texture-orientation.test.ts`。

> 证据口径：2026-10-04 Chromium/Firefox/WebKit（playwright 1.63.0）三引擎**结果零分歧**（报告 `docs/evidence/texture-orientation/pg24-texture-orientation-run1.json`，subset=true/completed=false）。本页描述 upload+UV 渲染层的实测行为；物理 GPU 内存量不可测（GPU_MEMORY: unavailable）。

## 当前候选的限定合同

Lead的[当前UV验证](../reference/texture-uv-verification.md)使用统一默认产物de4e0472e8a9cf86…，已补齐三浏览器图片/Canvas/ImageBitmap、typed-array/IMemoryImageSource在Sprite与原生plane的60次实际绘制，以及公开GLTFLoader外部PNG/嵌入图片、实际sampler、交错上传后原纹理和所有权释放。Sprite视觉顶边v=0，+90X plane视觉顶边v=1；行序应与目标UV配对。copyCanvasRows的翻行适用于该plane，没有全局上传状态泄漏。ImageData不在公开ImageSource内，真实TS4.9负例验证该边界，建议先写Canvas或使用uploadData字节。

本轮保持默认上传合同，无需新增全局flipY；应用使用独立行序副本或目标UV处理需要的翻转。未改glTF/抽取引擎上传源码，因此没有新增上游差异登记。PG-24按上述限定合同收口，颜色空间/压缩纹理/实体设备另列；不等于完整EG3或发布通过。

## 历史Sprite合同（三引擎一致）

| 源类型 | 公开入口 | 内存行序 | 实证方向 |
| --- | --- | --- | --- |
| HTMLImageElement | `ImageAsset.reset(image)` → `Texture2D.image` | 顶优先（第 0 行 = 视觉顶） | **upright**（Sprite 朝上正确、左右正确） |
| HTMLCanvasElement | 同上 | 顶优先 | **upright** |
| ImageBitmap | 同上（`sys.Feature.IMAGE_BITMAP` 仅影响类型收敛，不影响 gfx 直传） | 顶优先 | **upright** |
| ImageData | **不在 `ImageSource` 联合类型内**（NOT_APPLICABLE） | 顶优先 | 经 `ImageAsset` 原样传入会**静默得到空纹理**（引擎缺口，见下） |
| 原始 TypedArray | `reset({width,height,format})` + `uploadData(bytes)`；或 `IMemoryImageSource._data` | 顶优先直传（**方向结论须与 UV 基准配对**，见关键发现 1） | Sprite 基准：顶优先 → upright；底优先 → vertically-flipped。plane(+90X) 基准相反 |

左右方向在所有源类型中均保持（管线无水平翻转）。四角判定使用 16 色唯一标记图样的纹素中心采样 + 颜色反查（无方向假设）。

## 历史3D mesh 与 glTF路径（2026-10-04，各自夹具范围）

- **2D Sprite 路径（已验证，含交错污染检查）**：五源 + 顶优先对照 + 内存源交错后**复用原 DOM 纹理对象**（同一 Texture2D/SpriteFrame 实例，不重建、不重新上传）再采样——全部按上表判定（upright/vertically-flipped），无全局 pixelStore 状态泄漏。终态报告 run4（`docs/evidence/texture-orientation/pg24-texture-orientation-run4.json`）；历史 run3/run1/attempt1 保留。
- **历史最小MeshRenderer夹具未达像素**：该Code First场景三引擎只显示clearColor，未绘制plane；诊断保留，不能从单个夹具推断整个3D路径有引擎缺口。Lead当前独立plane已实际绘制并验证方向，见上文当前合同。
- **glTF 路径（真实 GLTFLoader + 原生 PBR，三引擎实测）**：最小自产纹理四边形（quad.gltf + quad-pattern.png + quad.bin，v=1 顶边 UV）经 `new GLTFLoader().loadAsync()` + `instantiate()` 渲染为**垂直翻转**（三引擎色调判定一致）。**措辞限定：这是本自产 quad（v=1 顶边）在该引擎 glTF 采样下的实测，不推广为通用 glTF 约定**；通用结论需更多真实模型对照（归后续）。与 Sprite 基准组合的实用结论：同一 DOM 图样在 Sprite 与该 glTF 姿态下方向相反，跨路径复用纹理时须按目标 UV 基准准备字节或 UV。PBR 光照调制颜色，判定用色调布局而非逐字节相等。
- **HTMLImageElement 复用行为**：`ImageAsset.destroy()` 会清除底层 `HTMLImage.src`，销毁后复用同一元素得 0 尺寸空纹理——这是夹具所有权问题而非全局 flip 污染。配方：每次加载使用独立新解码元素。
- 资源释放：glTF `instance.dispose()`、Mesh/Material/Texture 走 Asset destroy 合同；探针逐源记录 refCount 归零。

## 关键发现（交上游/统一集成处理，本批不改动）

1. **方向取决于 UV 基准，不存在脱离 UV 的"顶/底优先正确性"**（修正此前"uploadData 消费顶优先"的单通道推论）。Lead 的 texture-uv-basis 实证（air-texture-s6-uv-contract，三浏览器 24 观测）：原生 Sprite 的视觉顶 = v=0——DOM/raw 顶优先字节 upright、helper（copyCanvasRows）底优先字节倒置；原生 `primitives.plane` +90°X 旋转的视觉顶 = v=1——DOM/raw 倒置、helper 字节 upright。引擎内四个小游戏均使用该 plane 姿态，因此 `copyCanvasRows` 配合该姿态是正确的（helper 仅注释措辞已由 Lead 修正，行为无缺陷）。**结论：保留字节行序，与所使用的 UV 基准配对；不要以全局翻转"纠正"某一通道。**
2. **ImageData的公开边界**：现有ImageSource类型已经排除ImageData，当前真实TS负例确认拒绝。历史强转后静默空纹理的复现保留，但不能当作受支持路径；业务先写Canvas或使用uploadData字节。本轮不扩充该类型或改动抽取reset源码。
3. **flipY评估**：Sprite的v=0顶边与顶优先DOM/字节自洽，plane的v=1顶边使用对应翻行副本，当前glTF的v=0顶边无需翻转。因此保持默认合同，无需全局pixelStore/flipY开关。若未来引入逐上传翻转，必须恢复状态（计划C1原文），并区分解码、上传与几何UV。

## 用法配方

```ts
// DOM 类（Image/Canvas/ImageBitmap）：直接 ImageAsset → Texture2D，Sprite 朝上正确
const asset = new ImageAsset();
asset.reset(canvasOrImageOrBitmap);
const texture = new Texture2D();
texture.image = asset;

// 内存类（TypedArray）：reset + uploadData，字节按视觉顶优先提供
const texture2 = new Texture2D();
texture2.reset({ width, height, format: Texture2D.PixelFormat.RGBA8888 });
texture2.uploadData(topDownBytes); // 第 0 行 = 视觉顶部

// 释放：Texture2D.destroy 不保证 ImageAsset 同步 destroy——两者独占时分别显式清理：
// texture.destroy(); imageAsset.destroy();
// 消费者按 addRef/decRef 合同
```

- 3D mesh：plane生成器UV为0..1网格，其+90X姿态视觉顶边v=1，当前实际像素验证需要翻行副本；上传层共享不表示不同几何UV下方向相同。
- glTF：当前公开GLTFLoader外部/嵌入PNG的v=0顶边、实际sampler与交错原纹理已经单独验证；未修改原有UV/绕序补偿。

## 边界

- 真机设备、color space 联动（CB-16）、压缩纹理（basis/ktx）源不在本批范围。
- 每批报告`subset=true / completed=false`；限定PG-24源类型/UV/交错/glTF合同已经闭合，完整EG3、颜色空间/压缩纹理与设备验收仍独立。未增加上传开关或修改抽取源码，不制造不存在的上游差异。
