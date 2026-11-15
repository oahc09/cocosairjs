# HTML 纹理与浏览器能力

HTML 纹理 API 从主入口 `cocosair.js` 导入，仅使用当前 canvas 对应的 WebGL2 Texture2D。不额外安装渲染器，不把 DOM 截图成离线图片，也不以 DOM overlay 冒充 GPU HTML 纹理。

## 动态、快照与命中分别查询

```ts
import { getAirHTMLSourceSupport, createAirHTMLSource } from 'cocosair.js';

const live = getAirHTMLSourceSupport(canvas);
const frozen = getAirHTMLSourceSupport(canvas, { snapshot: true });
if (!live.supported) throw new Error(live.reason || 'HTML upload unavailable');

let source: ReturnType<typeof createAirHTMLSource> | undefined;
source = createAirHTMLSource({ canvas, element, texture, autoUpdate: true,
    onUpdate: () => {
        if (live.capabilities.geometry)
            source?.updateGeometry({ canvasTransform: { a: 1, d: 1, e: 100, f: 50 } });
    },
});
```

动态上传需要 requestPaint 和 WebGL2 texElementSubImage2D。captureElementImage 仅是 snapshot 模式的前置条件；命中几何方法也是独立能力，缺少它们仍可上传纹理，但 updateGeometry 会返回明确的 `AIR_E_HTML_SOURCE_GEOMETRY_UNSUPPORTED`。普通不支持环境在修改 DOM/纹理前报 `AIR_E_HTML_SOURCE_UNSUPPORTED`。

支持查询表示浏览器暴露了所需接口，不证明 context 健康或已经成功绘制。每次实际上传仍检查 context、元素归属、尺寸、原生纹理与 GL 错误，失败保留在 source.error/status。update 可以重试；同步 requestPaint 抛错也进入 failed，不永久停在 waiting。

## 尺寸、位置和 UV

- element 可在 canvas 子树中嵌套，最近的 canvas 必须是所有者；不允许重复源或跨内部 canvas。移动到别的 canvas 后原源失败，先 dispose 再重新建立所有权。
- 默认优先用 getElementImageDefaultSize 的 backing-pixel 尺寸并向上取整。缺该辅助方法时沿用 CSS offsetSize × 文档 DPR；显式 resolution 则是 CSS 尺寸倍率。不要再把自然 backing size 乘一遍 DPR。
- updateGeometry 的 canvasTransform 使用 CSS 像素。应用应从实际显示几何换算，布局、相机或 viewport 改变后重新提交；纹理上传本身不推断你的投影。
- DOM/Texture2D 图像行从顶部开始；普通 primitives.quad 的 V 向上。直接用它展示 DOM 时应匹配 UV，例如在业务几何中把 V 换成 1−V。原生 UI SpriteFrame 已处理其图像 UV 约定，不要同时翻转上传和采样。
- snapshot 捕获一次，颜色及目标尺寸保持冻结；后续 update 重传已有 ElementImage，dispose 只 close 一次。

浏览器 API 的原理和坐标约定见 [Chrome WebGL 指南](https://developer.chrome.com/docs/web-platform/html-in-canvas/webgl)及[技术概念](https://developer.chrome.com/docs/web-platform/html-in-canvas/concepts)。AIR 保留旧 layoutsubtree 与新 content/drawable 属性兼容，不支持仅有被淘汰 texElementImage2D 的上传接口。

## 绑定与释放

源借用 Texture2D；首次 paint 或 resize 可能重建其底层 GFX 纹理。使用 onUpdate 刷新消费者，而不是假设原材质绑定会自动发现新 allocation：

```ts
const source = createAirHTMLSource({
    canvas, element, texture,
    onUpdate: () => display.refresh(), // display is created by createAirTextureSprite using this texture.
});
// For a MeshRenderer material, rebind with material.setProperty('mainTexture', texture).
```

提供给 createAirTextureSprite 的 texture 须已初始化为正尺寸；源开始绘制后 refresh 会更新 frame 尺寸与 native descriptor。源不拥有该显示节点、材质、DOM 或 Texture2D。关闭时先 source.dispose，再由业务释放显示资源、texture 和 DOM；共享资源仍由其所有者管理。

源管理 paint 监听、ElementImage、几何清理和自身设置的 DOM 属性；同 canvas 多源按租约计数恢复属性。重复 dispose 安全，失败的构造也回收部分状态。用户已经另行修改的属性不会被旧值覆盖。

普通查看使用原生 pacer。需要手动步进截图时，在原生 paint 边界完成当前帧绘制，再采 compositor 图像；仅 GPU 纹理读回正确不证明画布已经呈现。不要同时运行真实时钟与手动 step。

## 定向回归

```bash
node tools/verify/html-source.cjs --channel=chrome --case=live --dpr=2 --bundle=build/cocosair.module.js --out=output/html-new-live
node tools/verify/html-source.cjs --channel=chrome --case=snapshot --bundle=build/cocosair.module.js --out=output/html-new-snapshot
```

case 另有 nested 和 no-snapshot；后者在真实浏览器中有意隐藏可选 capture 方法，验证动态上传及 snapshot 的拒绝，属于受控能力测试，不代表 Chrome 原生缺少该方法。`--keyboard-control=1` 是历史键盘问题的应用绕行归因工具，正式通过必须保持 false。每次使用新目录并保留失败。

探针检查实际 texture、顶部文字的 UV 方向、resize 前后真实点击、真实键盘输入与 GPU 字形变化、首次/更新 compositor 截图、快照冻结与一次关闭、DOM 属性恢复及借用 texture 保留。DPR1/2 与普通 Chromium unsupported 分支分别采集。它不认证其他浏览器、移动端或完整 Gallery；当前准确状态见[执行台账](../../ai/ledgers/web-engine-technical-absorption.md)。
