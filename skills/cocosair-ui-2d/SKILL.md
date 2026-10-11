---
name: cocosair-ui-2d
description: Drives code-first 2D UI in the Cocos AIR runtime - createUICanvas (Canvas plus fullscreen Widget plus an ortho UI camera bound through canvas.cameraComponent, defaults designWidth 1280, designHeight 720, layer Layers.Enum.UI_2D), the spriteNode and labelNode helpers and their real defaults (fontSize 28, lineHeight Math.round(fontSize*1.25), the AIR_E_LABEL_WRAP guard), the widget components Canvas, Widget, Layout (exported as Layout$1 as Layout), Button, ScrollView, ProgressBar, Slider, Toggle, EditBox, PageView, SafeArea and BlockInputEvents, each also aliased as ...Component, Label system-font and BMFont binding, LabelOutline, LabelShadow, LabelAtlas, the RichText-only-as-RichTextComponent alias, and 2D draw order through SortingLayers, Sorting2D and the Intersection2D utility. Use when a UI node renders nothing, when text needs a font without any Creator font-asset pipeline, when widgets must realign on a viewport change, or when 2D sprites and labels stack in the wrong order.
---

# Cocos AIR 2D UI contracts

Assemble a Canvas and its ortho UI camera from code, add sprites, labels and interactive
widgets, and control 2D draw order - no Prefab, no Editor, no parallel UI abstraction.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, UITransform, Sprite, Label, Layers, view, ResolutionPolicy,
         ImageAsset, Texture2D, SpriteFrame, Color, createUICanvas, spriteNode, labelNode } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);
const scene = new Scene('ui');

// 1) Canvas + fullscreen Widget + ortho UI camera. createUICanvas sets node.layer,
//    camera.visibility and canvas.cameraComponent consistently to Layers.Enum.UI_2D.
const canvasNode = createUICanvas(scene, 'UICanvas', { designWidth: 1280, designHeight: 720 });

// 2) A panel with a runtime-generated frame (AIR has no image asset pipeline).
function solidFrame (cssColor) {
    const cvs = document.createElement('canvas'); cvs.width = 16; cvs.height = 16;
    const ctx = cvs.getContext('2d'); ctx.fillStyle = cssColor; ctx.fillRect(0, 0, 16, 16);
    const tex = new Texture2D(); tex.image = new ImageAsset(cvs);
    const sf = new SpriteFrame(); sf.texture = tex; return sf;
}
const panel = spriteNode(canvasNode, 'Panel', { size: [360, 120], position: [0, 40] });
const sprite = panel.getComponent(Sprite);
sprite.sizeMode = Sprite.SizeMode.CUSTOM;              // already CUSTOM from spriteNode; set before the frame
sprite.spriteFrame = solidFrame('#3478f6');

// 3) A label child of that panel; labelNode inherits the UI_2D layer and uses the system font.
labelNode(panel, 'Hello Cocos AIR', 'Title', { fontSize: 32, position: [0, 8], color: Color.WHITE });

// 4) Sorting2D on the panel pushes it behind later siblings via the UIRenderer priority it writes.
app.run(scene);                       // async render loop: frame 1 lands on a later tick
function teardown() { canvasNode.destroy(); }   // release later, never inline right after run
</script>
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - deferred `destroy()`, parenting order and `Node.layer`, which every UI node depends on.
- [cocosair-camera](../cocosair-camera/SKILL.md) - `Camera` projection, `visibility` and clear color, the half of a Canvas that makes UI pixels appear.
- [cocosair-assets](../cocosair-assets/SKILL.md) - `Texture2D`/`SpriteFrame` ownership and `loadBitmapFont` for authored faces.
- [cocosair-graphics-and-dom](../cocosair-graphics-and-dom/SKILL.md) - `Graphics`, masks and the DOM overlay path for text that must stay selectable.
- [cocosair-performance](../cocosair-performance/SKILL.md) - 2D batching and atlas behavior behind draw-order and label cache-mode choices.
- [cocosair-verification](../cocosair-verification/SKILL.md) - the browser probes and gates behind the click and layout claims quoted below.

## When to use what

- "put UI on screen" -> `createUICanvas(scene, name, { designWidth, designHeight, layer })`; it wires Canvas + Widget + ortho camera in one call (`src/air/ui-kit.ts:37-67`).
- "a colored panel / image" -> `spriteNode(parent, name, { size, position, color, layer })`, then assign `sprite.spriteFrame`; set `SizeMode.CUSTOM` before the frame (`src/air/ui-kit.ts:81-93`, `docs/manual/2d-ui.md:62-66`).
- "on-screen text" -> `labelNode(parent, text, name, { fontSize, position, color, overflow, enableWrapText, boxSize })`; system font unless you bind a BMFont (`src/air/ui-kit.ts:111-131`).
- "align to an edge / fill the screen" -> `Widget` with `isAlignLeft/Right/Top/Bottom` and `alignMode` (`src/cocos/ui/widget.ts:123-148`).
- "auto-stack or grid children" -> `Layout` (`Layout.Type`, `Layout.ResizeMode`, `Layout.VerticalDirection`) (`src/cocos/ui/layout.ts:214`, `:619-644`).
- "buttons, sliders, scrolling" -> `Button`, `Slider`, `ProgressBar`, `ScrollView`, `Toggle`, `EditBox`, `PageView`; each also aliased `...Component` (`references/widgets.md`).
- "wrong 2D overlap" -> `Sorting2D` (needs a `UIRenderer`) writes `uiRenderer.priority` from `SortingLayers` (`references/sorting.md`).

## Contracts

- `createUICanvas(scene, name = 'UICanvas', options = {})` returns the Canvas root `Node`, not a `Canvas` component (`src/air/ui-kit.ts:37`, `:66`). Defaults: `layer = Layers.Enum.UI_2D` (`:38`), `designWidth = 1280` (`:39`), `designHeight = 720` (`:40`). It adds `UITransform` sized to the design box with anchor `(0.5, 0.5)` (`:44-46`), `Canvas` (`:47`), and a `Widget` fully aligned to all four edges with `alignMode = ON_WINDOW_RESIZE` (`:48-51`).
- The UI camera is a child node `name + '/Camera'`, ORTHO, `clearFlags = SOLID_COLOR`, `clearColor = new Color(24, 30, 44, 255)`, `visibility = layer`, `near = 1`, `far = 2000`, and the helper assigns `canvas.cameraComponent = camera` before returning (`src/air/ui-kit.ts:54-66`). `Canvas.cameraComponent` is a real setter that triggers `_onResizeCamera()` on change (`src/cocos/2d/framework/canvas.ts:96-102`); without it the batcher draws nothing.
- Layer naming has two live conventions. The AIR helpers use `Layers.Enum.UI_2D` (bit 25, `src/cocos/scene-graph/layers.ts:41`), while `examples/ui-components/main.js:49` and `examples/ui-layout/main.js:36` use `Layers.Enum.UI_3D` (bit 23, `src/cocos/scene-graph/layers.ts:39`). Either works as long as the node's layer bit is included in the UI camera's `visibility`; the invariant is node layer == camera visibility layer, not a specific constant (`docs/manual/2d-ui.md:56`).
- `spriteNode(parent, name = 'Sprite', options)` creates a `UITransform` + `Sprite` child with `sizeMode = CUSTOM` (`src/air/ui-kit.ts:81-93`). `sizeMode` must be `CUSTOM` before assigning a `spriteFrame`, or the node resizes to the texture (`docs/manual/2d-ui.md:62-66`). Runtime `SpriteFrame`s come from `document.createElement('canvas') -> ImageAsset -> Texture2D -> SpriteFrame`; `builtinResMgr.get('default-spriteframe')` GPU-uploads fail in this build, so the examples generate frames instead (`examples/ui-components/main.js:93`).
- `labelNode(parent, text, name = 'Label', options)` sets `fontSize = 28` by default and `lineHeight = Math.round(fontSize * 1.25)` (`src/air/ui-kit.ts:117`, `:124`), `color = options.color ?? Color.WHITE` (`:125`), and only writes `overflow`/`enableWrapText` when supplied (`:126-127`). `enableWrapText` must be a boolean if present, else it throws `Object.assign(new Error('[AIR_E_LABEL_WRAP] enableWrapText must be boolean'), { code: 'AIR_E_LABEL_WRAP' })` (`src/air/ui-kit.ts:112-113`).
- The `Label` font surface is system + BMFont only. `Label extends UIRenderer` (`src/cocos/2d/components/label.ts:180`), `Label.CacheMode` is `{ NONE, BITMAP, CHAR }` (`:143`, `:149`, `:157`, `:164`), and `Label.Overflow` is `{ NONE, CLAMP, SHRINK, RESIZE_HEIGHT }` (`:108`, `:114-133`). Outlining and shadow are separate components `LabelOutline` (`src/cocos/2d/components/label-outline.ts:46`) and `LabelShadow` (`src/cocos/2d/components/label-shadow.ts:43`), not Label properties.
- Every component in scope is on the single `export { ... }` block of `build/cocosair.module.js` (currently :161574). `Canvas`, `Widget`, `Button`, `ScrollView`, `ProgressBar`, `Slider`, `Toggle`, `EditBox`, `PageView`, `SafeArea` and `BlockInputEvents` are exported both bare and as `... as XComponent`. `Layout` ships only as `Layout$1 as Layout` (`src/cocos/ui/layout.ts:214`), and `RichText` ships only as `RichText as RichTextComponent` with no bare `RichText` (`src/cocos/2d/components/rich-text.ts:157`); `LabelAtlas` is exported bare (`src/cocos/2d/assets/label-atlas.ts:35`).
- 2D sorting: `Sorting2D extends Component` requires a `UIRenderer` (`@requireComponent(UIRenderer)`, `src/cocos/sorting/sorting-2d.ts:50-51`), and `sortingLayer`/`sortingOrder` write `uiRenderer.priority = SortingLayers.getSortingPriority(layerIndex, order)` (`:115-126`, `src/cocos/sorting/sorting-layers.ts:64-66`). Out of the box `SortingLayers.Enum` has only `default: 0`; more layers arrive from settings through `SortingLayers.init()` (`src/cocos/sorting/sorting-layers.ts:36-41`). `Intersection2D` is a static 2D geometry intersection utility (`src/cocos/physics-2d/builtin/intersection-2d.ts:301`), not part of the sort pipeline despite being grouped with it on the export list.

## Common Mistakes

### [HIGH] Waiting on a Creator font-asset pipeline for Label

Wrong:
```js
const font = await loadFont('./assets/my.font');   // no such font-asset import in AIR
label.font = font;
```

Correct:
```js
label.string = 'Hello';                             // system font: leave label.font unset
const handle = await loadBitmapFont('/assets/font.fnt', { bank });   // authored face = BMFont only
label.font = handle.font;
```

AIR has no font-asset pipeline (`docs/manual/creating-text.md:38`); `Label` draws with the platform
system font when `font` is null, and the only supported authored-font route is BMFont via `parseFnt`,
`createBitmapFont` and `loadBitmapFont` (`docs/manual/bitmap-font-loading.md:3-26`).

### [HIGH] Leaving the UI layer unset or the camera unbound

Wrong:
```js
const node = new Node('Panel');                     // default layer is not a UI layer
node.addComponent(Sprite);
const canvas = canvasNode.addComponent(Canvas);      // no camera ever linked
```

Correct:
```js
node.layer = Layers.Enum.UI_2D;                     // same bit as camera.visibility
uiCamera.visibility = Layers.Enum.UI_2D;
canvas.cameraComponent = uiCamera;                  // nothing draws until the Canvas owns a camera
```

`createUICanvas` sets `node.layer`, `camera.visibility` and `canvas.cameraComponent` consistently
(`src/air/ui-kit.ts:38`, `:61`, `:65`); a hand-built Canvas must do all three, because the Canvas
getter returns `null` until the setter links a camera (`src/cocos/2d/framework/canvas.ts:92-102`).

### [MEDIUM] Reading the manual as "RichText and LabelAtlas are unavailable"

Wrong:
```js
import { RichText, LabelAtlas } from 'cocosair';     // RichText is not a bare export name
```

Correct:
```js
import { RichTextComponent, LabelAtlas } from 'cocosair';   // RichText ships only as the alias
```

`docs/manual/creating-text.md:38` frames `LabelAtlas`/RichText as Creator editor workflow, which is
stale for the runtime surface: `LabelAtlas` is exported bare and `RichText` is exported only as
`RichText as RichTextComponent` (`build/cocosair.module.js` export block, currently :161574). What is
absent is the font-asset authoring pipeline, not the components (`src/cocos/2d/components/rich-text.ts:157`).

## References

- `references/canvas-widget-layout.md` - the `createUICanvas` assembly contract, `Canvas.cameraComponent`, `Widget` alignment modes and viewport relayout, `Layout` type/resizeMode/direction, and design resolution.
- `references/widgets.md` - the component catalog with bare versus `...Component` aliases, `Layout$1 as Layout`, base-class relationships, and the `node.on('click', ...)` event surface.
- `references/label-and-text.md` - system font versus BMFont binding, `Overflow` and `CacheMode` semantics, `LabelOutline`/`LabelShadow`, `LabelAtlas`, `RichText` as an alias only, and the `labelNode` defaults and `AIR_E_LABEL_WRAP`.
- `references/sorting.md` - `SortingLayers.Enum`, `Sorting2D` priority writing, and why `Intersection2D` is a geometry helper rather than a sorter.

## Canonical docs

- `docs/manual/2d-ui.md` - open for Canvas and UI-camera assembly, the runtime SpriteFrame path, `sizeMode` ordering, `makeUINode`, and resolution policy.
- `docs/manual/ui-layout-and-interaction.md` - open for Button events, Widget relayout on resize, Layout auto-placement, and the two-viewport geometry verification note.
- `docs/manual/creating-text.md` - open for the three text routes, `Label` defaults, the overflow semantics matrix, and the font-capability boundary.
- `docs/manual/bitmap-font-loading.md` - open for `parseFnt`/`createBitmapFont`/`loadBitmapFont`, page-texture constraints, and the `AIR_E_FNT_*` errors.
