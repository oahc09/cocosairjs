Derived from the cocosair-ui-2d skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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
