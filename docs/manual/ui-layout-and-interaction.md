# UI Layout and Interaction 布局与交互

> **状态：FULL（能力）。** 官方 [ui-system] 的 Layout/Widget/Button 组件参考 + 多分辨率适配方案的
> AIR 落法：**Widget 对齐 → Layout 自动排布 → Button/Toggle 组件事件 → 视口变化全链路重排**。
> 上一步（Canvas 组装、Sprite/Label 生成）见 [2D/UI 快速上手](./2d-ui.md)。
> 可运行样例：[examples/ui-layout/](../../examples/ui-layout/)（两档视口几何全重算）与
> [examples/ui-components/](../../examples/ui-components/)（真实鼠标点击断言）。

## 1. Button：组件事件 + 状态过渡

Button = Sprite 底 + Label 文本 + `Button` 组件（COLOR 过渡），点击事件用 `node.on('click', …)`
（组件事件，由引擎输入链驱动，`examples/ui-components` 的浏览器矩阵用真实鼠标点击验证）。
以下片段与 `examples/ui-components/main.js` 逐字节一致：

```js
const buttonNode = makeUINode("Button", stackNode, 150, 36);
const buttonSprite = addSprite(buttonNode, "#ffffff", 150, 36, 10);
buttonSprite.color = new Color(52, 120, 246, 255);
const buttonLabelNode = makeUINode("Label", buttonNode, 140, 28);
const buttonLabel = addLabel(buttonLabelNode, "Press me", 16);
const button = buttonNode.addComponent(Button);
button.transition = Button.Transition.COLOR;
button.normalColor = new Color(52, 120, 246, 255);
button.pressedColor = new Color(246, 96, 60, 255);
button.hoverColor = new Color(82, 150, 255, 255);
button.targetColor = buttonSprite.color.clone();
```

```js
buttonNode.on("click", () => {
  observed.buttonRealClicks += 1;
  buttonLabel.string = `Clicked x${observed.buttonRealClicks}`;
  observed.buttonLabelAfter = buttonLabel.string;
  observed.buttonColorAfter = buttonSprite.color.toString();
});
```

同例还覆盖 Toggle/ToggleContainer（互斥勾选）、Slider（滑动读值）、ProgressBar、ScrollView、
EditBox（文本回写）与 Mask——全部为组件事件或属性读回，样例的 `window.__observed` 可回读。
输入链底层（命中、冒泡、吞掉）见 [Input and Events](./input-and-events.md)。

## 2. Widget 对齐 + 视口变化全链路重排

Widget 负责对齐；视口变化后要**重设设计分辨率**才能触发 widgetManager 全量重排
（`examples/ui-layout/main.js` 逐字节）：

```js
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);

// "match window" 适配策略：视口变化时重设设计分辨率（EXACT_FIT 下 visibleRect 才会跟随视口，
// 触发 view 'design-resolution-changed' → widgetManager 重排所有 Widget）。
window.addEventListener("resize", () => {
  view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);
});
```

```js
const cw = canvasNode.addComponent(Widget);
cw.isAlignLeft = cw.isAlignRight = cw.isAlignTop = cw.isAlignBottom = true;
cw.left = cw.right = cw.top = cw.bottom = 0;
cw.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
```

## 3. Layout 自动排布

`Layout` 组件把子节点按纵向/横向/网格排布（`examples/ui-components/main.js` 逐字节）：

```js
const stack = stackNode.addComponent(Layout);
stack.type = Layout.Type.VERTICAL;
stack.resizeMode = Layout.ResizeMode.NONE;
stack.spacingY = 14;
stack.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;
```

## 4. 验证口径

- `examples/ui-layout`：480x360 与 320x240 两档视口下，`window.__geom` 每帧读回
  canvas/topBar/badge/row/cells 世界几何，浏览器矩阵驱动真实 resize 并逐字段比对。
- `examples/ui-components`：真实鼠标点击（浏览器矩阵 interaction.steps）驱动
  Button 计数/文本/颜色、Slider 值、Toggle 互斥、EditBox 回写，逐字段读回。
- 手册侧行为断言模式（`window.__manualProbe`）见 [Component Lifecycle](./component-lifecycle.md) 的验证器说明。

---

上一篇：[2D/UI 快速上手](./2d-ui.md) ｜ 下一篇：[动画系统（Animation System）](./animation-system.md)
