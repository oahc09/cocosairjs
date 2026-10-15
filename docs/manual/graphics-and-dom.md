# Graphics、SVG 与 DOM 协同

这些入口复用原生 Cocos 对象。浏览器仍要求 WebGL 2。HTML 实时纹理是独立实验模块；DOM overlay 则使用普通浏览器 DOM。这里不提供 Canvas/WebGPU 渲染器回退。

## 纹理显示与锚点

```ts
import { createAirTextureSprite } from 'cocosair.js';

// parent 是原生 UI Node；texture 是调用者持有的 TextureBase。
const image = createAirTextureSprite(parent, texture, {
    name: 'Preview', size: [320, 180], anchor: [0, 1],
});
// 默认 size 是纹理尺寸，默认 anchor 是 [0.5, 0.5]。
// resize 纹理后，更新 frame 的 rect/originalSize；未显式指定 size 时同步尺寸。
image.refresh();
image.dispose(); // 销毁自有 Node/SpriteFrame，不销毁借用纹理。
```

锚点属于 Node 的 `UITransform`，不会写入共享 TextureBase。RenderTexture 或 `createAirRenderTarget().texture` 也可以借用；在释放目标之前先释放显示对象。调用者负责整个使用期的纹理所有权。

## 跟随场景的 DOM

```ts
import { createAirDOMOverlay } from 'cocosair.js';

const overlay = createAirDOMOverlay({ canvas, className: 'product-ui' });
const binding = overlay.attach(inputElement, uiNode, uiCamera, {
    width: 240, height: 40, anchor: [0.5, 0.5],
});
// 由应用自己的帧回调调用；不启动另一套时钟。
overlay.update();
binding.dispose(); // 还原元素原父节点、顺序和 inline style。
overlay.dispose(); // 幂等，释放其余绑定与自有 root。
```

`root` 可直接添加 CSS 类或样式。根节点默认 fixed 定位、允许子元素交互，默认挂在 body。若指定 host，host 不应建立新的 fixed containing block。映射包含 native Node 平移、缩放、旋转和 canvas CSS/backing size 差异，适用于正交平面 UI。透视或倾斜平面不能由二维 affine matrix 准确表示。应用自行管理遮挡、剪裁、overlay 顺序及不再使用时的解绑；无效或未激活节点隐藏对应 wrapper。

## 记录命令、回放原生 Graphics、导出 SVG

```ts
import { drawAirGraphics, airGraphicsCommandsToSvg, type AirGraphicsCommand } from 'cocosair.js';

const commands: AirGraphicsCommand[] = [
    { op: 'rect', args: [0, 0, 100, 50] },
    { op: 'fill', paint: { color: '#ff0000' } },
    { op: 'circle', args: [150, 25, 25] },
    { op: 'stroke', paint: { color: '#0000ff' }, width: 4 },
];
drawAirGraphics(graphics, commands); // graphics 是 Node.addComponent(Graphics)。
const svg = airGraphicsCommandsToSvg(commands, { x: -4, y: -4, width: 183, height: 58 });
```

支持 moveTo、lineTo、Bézier、quadratic、arc、rect、roundRect、ellipse、circle、close、fill 和 stroke。命令坐标 Y 向上；SVG 根变换只翻转一次。arc 的方向沿用原生 Cocos：最后一个参数 true 表示逆时针。stroke 可设置 butt/round/square cap 和 miter/round/bevel join。颜色仅接收 `#rrggbb`，opacity 为 `[0,1]`，非法命令在回放前拒绝。

每次 paint 保存该路径和样式，后续新形状开启新绘制批次。纯色 fill 后 stroke 可复用路径。导出保留原始曲线；函数不接收任意 Graphics 实例，也不尝试从已经细分的 `Graphics.impl` 恢复曲线。Native replay 支持纯色绘制；孔洞与富填充应使用下节的 raster 路径，不保证原生 Graphics 对多子路径的孔洞语义。

SVG 支持纯色、线性/径向渐变及本地 pattern，含透明度和 evenodd 孔洞。纹理 pattern 导出要求 `sourceURL` 为 data:image/png/jpeg/webp 的 base64 或 http(s)；需要可离线移交的 SVG 时用 data URL。导出不抓取或自动嵌入外部 URL，也不提供任意 SVG 文本解析器。全局 pattern 必须先显式转为本地变换再导出。

## 渐变、孔洞与纹理填充

```ts
import { rasterizeAirGraphics, createAirTextureSprite, type AirGraphicsCommand } from 'cocosair.js';

const commands: AirGraphicsCommand[] = [
    { op: 'rect', args: [0, 0, 200, 100] },
    { op: 'circle', args: [100, 50, 20] },
    { op: 'fill', rule: 'evenodd', paint: {
        kind: 'linear', from: [0, 0], to: [200, 0],
        stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }],
    } },
];
const paint = rasterizeAirGraphics(commands, {
    bounds: { x: 0, y: 0, width: 200, height: 100 }, resolution: 2,
});
const display = createAirTextureSprite(parent, paint.texture, { size: [200, 100] });
paint.update(commands); // 明确重绘/上传；不逐帧自动执行。
display.dispose();
paint.dispose();
```

这是 Canvas2D 富填充生成原生 Texture2D 的路径，输出为栅格；并非 GPU 矢量填充器。resolution 控制每逻辑单位像素，尺寸最多 8192。内容/尺寸改变后调用 update；纹理尺寸改变时同时 `display.refresh()`。上传顶行在前，直接匹配 Sprite UV，不额外翻转。

Pattern paint 使用 `{ kind: 'pattern', image, width, height, textureSpace, transform }`。width/height 是逻辑 tile 大小；需要一张 tile 拟合形状时显式取形状尺寸。默认 `textureSpace: 'local'`；`global` 要求 options.worldTransform 提供显示节点的 local→world 矩阵 `[a,b,c,d,tx,ty]`，从而让相邻形状共享纹理相位。transform 是直接的 pattern→选定坐标空间矩阵，不预取逆矩阵、不预乘纹理尺寸。图片顶行保持朝上。节点变换后必须 update；跨域图像需要 CORS，否则浏览器会拒绝像素读回。

Radial paint 使用 `{ kind: 'radial', center: [x,y], radius, stops }`，radius 以本地坐标计量。所有渐变 stops 需按 offset 升序，至少两项。

## Sprite 的通道遮罩

```ts
import { attachAirSpriteMask } from 'cocosair.js';

const mask = attachAirSpriteMask(sprite, maskTexture, {
    channel: 'alpha', mode: 'soft', inverted: false,
});
// 替换 spriteFrame 后主动调用；同一 frame 的 UV_UPDATED 自动跟随。
mask.update();
mask.dispose(); // 还原由该绑定持有的 customMaterial，保留借用 maskTexture。
```

channel 支持 alpha/red；默认 alpha。soft 连续衰减输出 Alpha，threshold 按 threshold 丢弃片元，默认阈值 0.1。maskTexture 完整 `[0,1]` 区域拟合 Sprite frame 的显示 UV；frame 的 atlas/旋转 UV 通过逆 affine 映射处理。RGB 采样采用纹理本身颜色空间；数值 red 遮罩通常应使用线性 RGBA8 数据。

此入口只遮罩一个 Sprite，不替代原生 Mask 的任意子节点模板裁剪。已有 customMaterial 的 Sprite 拒绝绑定，避免丢失应用着色器；此版本不组合多个软遮罩。调用者先 dispose 绑定，再释放 Sprite/纹理。创建的 Material/Effect 独立持有，销毁绑定时释放，不改 builtin-sprite 模板。

## 显式混合继承

```ts
import { createAirUIBlendScope } from 'cocosair.js';

const blend = createAirUIBlendScope(effectRoot, 'add');
blend.set(childNode, 'normal'); // 子树显式覆盖。
blend.set(childNode, null); // 恢复继承。
blend.update(); // 层级、组件、粒子初始化/材质发生变化后调用。
blend.dispose();
```

支持 normal/add/multiply，覆盖原生 UIRenderer，包括 ParticleSystem2D。这个入口是 opt-in controller；不增加 `Node.blendMode`，不改变默认场景继承。dispose 和移出子树会恢复仍由 controller 持有的混合因子。与其他业务同时修改同一 renderer 的混合状态时应先解绑本 controller。GPU 混合状态使用 MaterialInstance override 更新，已有材质的其他状态保留。

## 实验性 HTML 纹理

```ts
import { getAirHTMLSourceSupport, createAirHTMLSource } from 'cocosair.js';

const support = getAirHTMLSourceSupport(canvas);
if (support.supported) {
    canvas.appendChild(formElement); // 必须是直接子节点。
    const source = createAirHTMLSource({ canvas, element: formElement, texture,
        autoUpdate: true, onError: console.error });
    source.update(); // 请求 paint；通过 source.status 或 onUpdate 检查完成。
    source.updateGeometry({ canvasTransform: { a: 1, d: 1, e: 100, f: 50 } });
    source.dispose(); // 移除监听、清理 geometry/快照；不释放 texture/DOM。
}
```

texture 必须是当前 canvas 对应 WebGL2 设备创建的单 mip RGBA8 原生 Texture2D。调用者持有它；尺寸由源的布局与 resolution 更新。默认 autoUpdate=true；snapshot=true 捕获一次不可变 ElementImage，后续 update 复用快照。

HTML 纹理接口由完整主引擎导出，不再提供独立子路径。未提供浏览器实验 API 时 `AIR_E_HTML_SOURCE_UNSUPPORTED` 在 DOM/纹理修改前抛出。异步上传错误保存在 error，status 为 failed；调用 update 可重试。context lost、元素移出 canvas、零尺寸或非法 GPU 纹理明确失败。

上传发生在浏览器 paint 事件，临时纹理绑定恢复原值，不改 engine 状态缓存。应用负责将原生场景投影转换为 HTML canvasTransform，并调用 updateElementGeometry 同步命中、焦点和无障碍几何；单纯贴图上传不会自动产生正确交互。实验浏览器限制以实际能力探测为准；普通浏览器可改用 DOM overlay，但这不等同 GPU HTML 纹理。

## 可运行测试场景

| 示例                                                                              | 内容                                                                    |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [graphics-svg-paints](../../examples/graphics-svg-paints/src/main.ts)             | 原生 Graphics、渐变孔洞、非正方形 pattern、SVG 预览/实际下载与像素回环  |
| [sprite-mask-blend](../../examples/sprite-mask-blend/src/main.ts)                 | red/alpha、soft/threshold/inverted、原生粒子的 normal/add 对照          |
| [dom-overlay-texture](../../examples/dom-overlay-texture/src/main.ts)             | 真实输入/点击、移动/旋转、锚点、纹理 resize 后 GPU 显示、解绑与资源释放 |
| [html-texture-experimental](../../examples/html-texture-experimental/src/main.ts) | 实时表单纹理、DOM repaint、不可变 snapshot、普通浏览器 unsupported 分支 |

每页有“运行断言”和“释放资源”。释放后控件禁用；重新测试请重新加载页面。修改展示模式后状态回到 READY，避免把上一次 PASS 当作新模式的结果。

```powershell
node tools/dev/dev-server.cjs --example graphics-svg-paints
# 也可将 --example 替换为其他三个示例 ID。
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/graphics-examples.cjs --browser=all --out=output/graphics-examples/attempt-01.json
node tools/verify/graphics-examples.cjs --browser=all --mobile --out=output/graphics-examples/mobile-01.json
node tools/verify/graphics-examples.cjs --browser=chromium --channel=chrome --experimental-html --static --out=output/graphics-examples/static-01.json
node node_modules/typescript/bin/tsc -p tools/verify/graphics-examples.tsconfig.json
```

定向 runner 检查真实按钮、GPU 像素、SVG 下载内容、桌面/移动布局和释放的幂等性。`--static` 通过实际 Gallery builder 在临时目录构建这四个示例，并使用静态 JS/相对 entry 加载；不会重写默认 `build/examples/` 或正典证据。子集通过不代表整个 Gallery 构建通过。示例仍保留 draft 状态，未自动执行正式 stable 晋级。

普通展示使用原生主循环，运行断言/更新动作时暂停并用单一步进时钟。DOM 纹理场景同时检查原始 GPU 像素和实际 PNG 截图中的像素；runner 需要 Playwright 与 pngjs 工具环境。只凭 readPixels 不能证明合成显示正确，截图不匹配会使该场景失败。

本轮桌面到移动 viewport 切换在 WebKit DOM 场景出现间歇性黑图，PNG 门禁已捕获为 FAIL。独立移动启动通过不替代这一失败项；状态与复现记录见 [实施记录](../../ai/plans/pixi-capability-implementation.md)。

## 底层合同探针

```powershell
# 使用本机现有 Playwright 工具环境；不要为了运行检查改项目 dependencies。
$env:NODE_PATH='output/playwright/tooling/node_modules'
node tools/verify/graphics-and-dom.cjs --browser=all --out=output/graphics-dom/attempt-01.json
# Chromium 可额外开启实验特性；失败不能改记成正常功能通过。
node tools/verify/graphics-and-dom.cjs --browser=chromium --experimental-html --out=output/graphics-dom/experimental-01.json
# 使用较新的系统 Chrome 验证实验实现，不代表普通 Chromium 也具备它。
node tools/verify/graphics-and-dom.cjs --browser=chromium --channel=chrome --experimental-html --out=output/graphics-dom/chrome-01.json
```

输出路径必须是新文件；JSON 与同名 `-artifacts/` 截图保存本轮指纹。工具只读服务已有 bundle，不构建、不安装浏览器；测试执行范围不是整个 Gallery 或 release readiness。

HTML 实验 API 正在迁移。模块同时兼容旧 `layoutsubtree` 与新 `content="drawable"` 属性，并使用具备预分配能力的 `texElementSubImage2D`。不支持仅有旧 `texElementImage2D` 的浏览器。变更来源见 [Chrome API 迁移说明](https://developer.chrome.com/blog/html-in-canvas-ot-changes)。本轮系统 Chrome 的实际结果以执行计划链接的 JSON 为准；默认浏览器中的 UNSUPPORTED 不会转换成实验功能通过。

WebGPU transient MSAA 仍未实现：当前 WebGPU 子图缺少公开后端接线及外部编译资产，见 [上游记录](../UPSTREAM.md)。建立新后端、对应 shader 管线和跨浏览器合同后才能评估 transient attachments；WebGL2 resolve 不提供同一机制。
