Derived from src/air/ui-kit.ts, src/cocos/2d/framework/canvas.ts, src/cocos/ui/widget.ts, src/cocos/ui/layout.ts, src/cocos/scene-graph/layers.ts, docs/manual/2d-ui.md, docs/manual/ui-layout-and-interaction.md - 2026-10-10

# Canvas, Widget and Layout

This covers how a code-first UI root is assembled, how the Canvas links its camera, how `Widget`
keeps nodes pinned to edges across viewport changes, and how `Layout` arranges children.

## createUICanvas

`createUICanvas(scene, name = 'UICanvas', options = {})` is a pure builder that returns the Canvas
root `Node`, not a `Canvas` component instance (`src/air/ui-kit.ts:37`, `:66`). It does not touch the
3D scene beyond `scene.addChild(node)` (`:52`).

| Option       | Type   | Default             | Effect                                                                                                    |
| ------------ | ------ | ------------------- | --------------------------------------------------------------------------------------------------------- |
| designWidth  | number | 1280                | `UITransform.setContentSize` width (`src/air/ui-kit.ts:39`, `:45`)                                        |
| designHeight | number | 720                 | `UITransform.setContentSize` height (`src/air/ui-kit.ts:40`, `:45`)                                       |
| layer        | number | `Layers.Enum.UI_2D` | root `node.layer`, camera `node.layer`, camera `visibility` (`src/air/ui-kit.ts:38`, `:43`, `:55`, `:61`) |

Sequence it performs on the root node:

1. `node.layer = layer` (`:43`).
2. `UITransform` sized to the design box with anchor `(0.5, 0.5)` (`:44-46`).
3. `Canvas` component (`:47`).
4. `Widget` with `isAlignLeft/Right/Top/Bottom = true`, `left/right/top/bottom = 0`, and `alignMode = Widget.AlignMode.ON_WINDOW_RESIZE` (`:48-51`).
5. `scene.addChild(node)` (`:52`).
6. Child camera node `name + '/Camera'` with `UITransform(1, 1)`, ORTHO `Camera`, `clearFlags = SOLID_COLOR`, `clearColor = new Color(24, 30, 44, 255)`, `visibility = layer`, `near = 1`, `far = 2000` (`:54-64`).
7. `canvas.cameraComponent = camera`, then returns the root (`:65-66`).

## Canvas cameraComponent

`Canvas` holds a nullable `_cameraComponent` (`src/cocos/2d/framework/canvas.ts:120`). The getter
returns it directly (`:92-94`); the setter early-outs on identity, stores the value and calls
`_onResizeCamera()` (`:96-102`), which is what re-derives the camera viewport from the Canvas rect.
`alignCanvasWithScreen` is a second trigger for the same resize pass (`:108-117`). A UI scene with a
Canvas but no bound camera renders nothing, because the 2D batcher has no view to draw into.

## Layer invariant

`Layers.Enum` maps `UI_3D` to bit 23 and `UI_2D` to bit 25 (`src/cocos/scene-graph/layers.ts:39`,
`:41`). The AIR helpers standardize on `UI_2D`; the shipped examples standardize on `UI_3D`
(`examples/ui-components/main.js:49`, `examples/ui-layout/main.js:36`). The rule that actually
controls visibility is: the node's layer bit must be included in the UI camera's `visibility`.
`createUICanvas` guarantees this by using one `layer` value for root, camera and visibility
(`src/air/ui-kit.ts:38`, `:55`, `:61`).

## Widget alignment and relayout

`Widget.AlignMode` is `{ ONCE = 0, ALWAYS = 1, ON_WINDOW_RESIZE = 2 }` (`src/cocos/ui/widget.ts:123-148`),
defaulted to `ON_WINDOW_RESIZE` per instance (`:790`) and exposed as `Widget.AlignMode` (`:737`).

- `ONCE` aligns once in the frame `onEnable` runs, then disables itself so script or animation can take over the node (`:124-132`).
- `ALWAYS` keeps aligning every frame (`:133-138`).
- `ON_WINDOW_RESIZE` aligns like `ONCE`, then re-aligns only when the screen size changes (`:139-147`).

Aligning on resize is driven by the design-resolution change, not by the browser `resize` event
directly: you must re-issue `view.setDesignResolutionSize(...)` so `widgetManager` recomputes every
`Widget` (`docs/manual/ui-layout-and-interaction.md:48-54`).

## Layout auto-placement

`Layout extends Component` (`src/cocos/ui/layout.ts:214`) is exported only as `Layout$1 as Layout`
(`build/cocosair.module.js` export block, currently :161574). Its static enums:

| Enum accessor            | Source line | Meaning                                                                                |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------- |
| Layout.Type              | `:619`      | `HORIZONTAL`, `VERTICAL`, `GRID` placement axis (`src/cocos/ui/layout.ts:43`)          |
| Layout.ResizeMode        | `:634`      | container resize behavior, `NONE` keeps the authored box (`src/cocos/ui/layout.ts:78`) |
| Layout.VerticalDirection | `:624`      | row fill order, e.g. `TOP_TO_BOTTOM` (`src/cocos/ui/layout.ts:128`)                    |
| Layout.Constraint        | `:644`      | grid constraint mode (`src/cocos/ui/layout.ts:170`)                                    |

Reference usage from `docs/manual/ui-layout-and-interaction.md:68-74`:

```js
const stack = stackNode.addComponent(Layout);
stack.type = Layout.Type.VERTICAL;
stack.resizeMode = Layout.ResizeMode.NONE;
stack.spacingY = 14;
stack.verticalDirection = Layout.VerticalDirection.TOP_TO_BOTTOM;
```

Children must each carry a `UITransform`; `Layout` positions them inside the container box, so a
child without one is skipped or mis-measured (`docs/manual/2d-ui.md:56-57`).
