Derived from build/cocosair.module.js, src/cocos/2d/framework/canvas.ts, src/cocos/ui/widget.ts, src/cocos/ui/layout.ts, src/cocos/ui/button.ts, src/cocos/ui/toggle.ts, src/cocos/ui/slider.ts, src/cocos/ui/progress-bar.ts, src/cocos/ui/scroll-view.ts, src/cocos/ui/page-view.ts, src/cocos/ui/editbox/edit-box.ts, src/cocos/ui/safe-area.ts, src/cocos/ui/block-input-events.ts, docs/manual/ui-layout-and-interaction.md - 2026-10-10

# Widget and interaction components

Every UI component in scope is on the single `export { ... }` block of `build/cocosair.module.js`
(currently :161574). Most ship twice: a bare class and an `... as XComponent` alias, so either import
name binds. Two are aliases-only or renamed - `Layout` and `RichText` - and that difference is load
bearing for import statements.

## Export aliases

| Import (bare)    | Also exported as                              | Class definition note                                                                         |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Canvas           | Canvas as CanvasComponent                     | base UI root, links camera (`src/cocos/2d/framework/canvas.ts:92`)                            |
| Widget           | Widget as WidgetComponent                     | `class Widget extends Component` (`src/cocos/ui/widget.ts:227`)                               |
| Button           | Button as ButtonComponent                     | `class Button extends Component` (`src/cocos/ui/button.ts:177`)                               |
| Toggle           | Toggle as ToggleComponent                     | `class Toggle extends Button` (`src/cocos/ui/toggle.ts:53`)                                   |
| Slider           | Slider as SliderComponent                     | `class Slider extends Component` (`src/cocos/ui/slider.ts:80`)                                |
| ProgressBar      | ProgressBar as ProgressBarComponent           | `class ProgressBar extends Component` (`src/cocos/ui/progress-bar.ts:102`)                    |
| ScrollView       | ScrollView as ScrollViewComponent             | `class ScrollView extends ViewGroup` (`src/cocos/ui/scroll-view.ts:236`)                      |
| PageView         | PageView as PageViewComponent                 | `class PageView extends ScrollView` (`src/cocos/ui/page-view.ts:103`)                         |
| EditBox          | EditBox as EditBoxComponent                   | `class EditBox extends Component` (`src/cocos/ui/editbox/edit-box.ts:77`)                     |
| SafeArea         | SafeArea as SafeAreaComponent                 | `class SafeArea extends Component` (`src/cocos/ui/safe-area.ts:62`)                           |
| BlockInputEvents | BlockInputEvents as BlockInputEventsComponent | `class BlockInputEvents extends Component` (`src/cocos/ui/block-input-events.ts:51`)          |
| Layout           | Layout$1 as LayoutComponent                   | `class Layout extends Component` (`src/cocos/ui/layout.ts:214`); no bare `Layout` export name |

`RichText` is exported only as `RichText as RichTextComponent`, with no bare `RichText` name (class at
`src/cocos/2d/components/rich-text.ts:157`). Importing `{ RichText }` from the bundle resolves to
nothing. See [label-and-text.md](label-and-text.md).

## Base-class relationships

- `Toggle extends Button` (`src/cocos/ui/toggle.ts:53`): reuses the Button transition machinery and adds checked state.
- `PageView extends ScrollView` (`src/cocos/ui/page-view.ts:103`): page-flip behavior over the ScrollView drag model; `PageViewIndicator` and `ScrollBar` are separate exported helpers for it.
- `ScrollView extends ViewGroup` (`src/cocos/ui/scroll-view.ts:236`): inherits Layout-aware content grouping.
- `ToggleContainer` is exported bare and enforces exclusivity across member `Toggle`s; the sample wires it for mutually exclusive check marks (`docs/manual/ui-layout-and-interaction.md:38`).

## Interaction surface

Button/Toggle/Slider/ScrollView/EditBox emit component events driven by the engine input chain; a
`click` is bound with `node.on('click', handler)`, not with a DOM listener
(`docs/manual/ui-layout-and-interaction.md:11-12`, `:29-36`):

```js
buttonNode.on('click', () => {
  buttonLabel.string = `Clicked x${count}`;
});
```

`BlockInputEvents` swallows pointer events for its subtree so underlying nodes are not hit-tested;
`SafeArea` offsets its node into the device safe region (`src/cocos/ui/safe-area.ts:62`,
`src/cocos/ui/block-input-events.ts:51`). Hit testing requires a `UITransform` on every interactive
node and a UI camera whose `visibility` includes the node layer - both enforced by `createUICanvas`
(`docs/manual/2d-ui.md:56-57`, `src/air/ui-kit.ts:38-66`).

## Component versus sprite backing

`Button` with `transition = Button.Transition.COLOR` needs a target sprite whose `color` it tweens
(`docs/manual/ui-layout-and-interaction.md:21-27`). `ProgressBar` tracks a `Sprite` fill amount.
`Slider` reads a handle node position against its track. All of these read the same `Sprite`,
`UITransform` and `UIRenderer` components; there is no parallel widget-makeup system, and none of them
require a Prefab.
