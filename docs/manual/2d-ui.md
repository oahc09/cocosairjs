# 2D/UI 快速上手（从空场景到一块能点的 UI）

> **状态：FULL（能力）。** 官方 [2d-object/2d-render] 与 [ui-system] 组讲 Canvas、Sprite、Label 等
> 组件参考；本篇把它们串成 AIR 的 Code First 最小路径：**组装 Canvas → 挂 UI 相机 → 生成 Sprite/Label
> → 分辨率适配**，全部零外部资产（贴图运行时生成）。点击交互与布局组件展开见
> [UI Layout and Interaction](./ui-layout-and-interaction.md)；文字专题见 [Creating Text](./creating-text.md)。
> 完整可运行样例：[examples/ui-components/](../../examples/ui-components/)（浏览器矩阵含真实鼠标点击行）。

## 1. 组装 Canvas 与 UI 相机

UI 层级需要一个 `Canvas` 组件节点（全屏 Widget 对齐）和一台 `visibility` 含
`Layers.Enum.UI_3D` 的正交相机（挂在 Canvas 下，交回 `canvas.cameraComponent`）。
以下片段与 `examples/ui-components/main.js` 逐字节一致：

```js
const canvasNode = makeUINode("Canvas", null, 480, 360, 240, 180);
const canvas = canvasNode.addComponent(Canvas);
const canvasWidget = canvasNode.addComponent(Widget);
canvasWidget.isAlignLeft = canvasWidget.isAlignRight = true;
canvasWidget.isAlignTop = canvasWidget.isAlignBottom = true;
canvasWidget.left = canvasWidget.right = canvasWidget.top = canvasWidget.bottom = 0;
canvasWidget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
scene.addChild(canvasNode);
```

```js
const cameraNode = makeUINode("UICamera", canvasNode, 1, 1, 0, 0);
const uiCamera = cameraNode.addComponent(Camera);
uiCamera.projection = Camera.ProjectionType.ORTHO;
uiCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
uiCamera.clearColor = new Color(24, 30, 44, 255);
uiCamera.visibility = UI_LAYER;
uiCamera.near = 1;
uiCamera.far = 2000;
canvas.cameraComponent = uiCamera;
```

其中 `makeUINode` 是"建节点 + UI 层 + UITransform"的常规封装（同文件逐字节）：

```js
function makeUINode(name, parent, width, height, x = 0, y = 0, anchorX = 0.5, anchorY = 0.5) {
  const node = new Node(name);
  node.layer = UI_LAYER;
  let transform = node.getComponent(UITransform);
  if (!transform) transform = node.addComponent(UITransform);
  transform.width = width;
  transform.height = height;
  transform.anchorX = anchorX;
  transform.anchorY = anchorY;
  node.setPosition(new Vec3(x, y, 0));
  if (parent) parent.addChild(node);
  return node;
}
```

要点：**所有 UI 节点必须设 `node.layer = Layers.Enum.UI_3D`**（默认 3D 层不被 UI 相机收录）；
**任何要参与命中测试/布局的节点都要有 `UITransform`**。

## 2. Sprite 与 Label（零外部资产）

Sprite 的贴图可以运行时生成（2D canvas → `ImageAsset` → `Texture2D` → `SpriteFrame`），
不必依赖任何外部图片；`Sprite.SizeMode.CUSTOM` 必须在赋 `spriteFrame` **之前**设置，
否则节点被裁到纹理尺寸：

```js
sprite.sizeMode = Sprite.SizeMode.CUSTOM; // 必须在赋 spriteFrame 之前，否则节点被裁到纹理尺寸
```

文本用 `Label`（专题见 [Creating Text](./creating-text.md)）：

```js
function addLabel(node, text, fontSize, color) {
  const label = node.addComponent(Label);
  label.string = text;
  label.fontSize = fontSize;
  label.lineHeight = Math.round(fontSize * 1.25);
  label.color = color || Color.WHITE;
  label.overflow = Label.Overflow.NONE;
  return label;
}
```

## 3. 分辨率与坐标

设计分辨率 + 适配策略决定"1 UI point = 多少像素"。AIR 实测最直接的一档是
**EXACT_FIT + 设计分辨率 = 窗口尺寸**（1:1 映射，点击坐标换算为恒等）：

```js
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);
```

可用工具：`view`（设计分辨率/可见区）、`visibleRect`（当前可见矩形）、`ResolutionPolicy`
（EXACT_FIT/NO_BORDER/FIXED_*）。输入坐标换算（`event.getUILocation()`、页面坐标
`(world.x, innerHeight - world.y)` 换算）见 [Input and Events](./input-and-events.md)。

## 4. 下一步

- 点击/布局/自适应：[UI Layout and Interaction](./ui-layout-and-interaction.md)
- 可运行样例：[examples/ui-components/](../../examples/ui-components/)
  （`npm run dev` 后 `http://127.0.0.1:7454/examples/ui-components/`）
- 组件速查（Button/Toggle/Slider/ScrollView/EditBox/Mask/Graphics/RichText/UIOpacity…）
  均在默认导出面内，用法与官方 4.0 组件参考同名对应；差异点（无编辑器资产管线、
  SpriteFrame 运行时生成）以本篇与 [覆盖矩阵](./cocos4-coverage-matrix.md) 为准。
