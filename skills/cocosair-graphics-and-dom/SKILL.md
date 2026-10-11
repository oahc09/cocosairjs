---
name: cocosair-graphics-and-dom
description: Reuse native Cocos objects for 2D drawing and DOM in Cocos AIR. Covers AirGraphicsCommand drawing data replayed on a Graphics component (drawAirGraphics, solid nonzero only), SVG serialization that preserves curves (airGraphicsCommandsToSvg), Canvas2D rich fills into a native Texture2D (rasterizeAirGraphics), borrowed-texture display (createAirTextureSprite), per-Sprite channel masks (attachAirSpriteMask), opt-in UI blend inheritance including ParticleSystem2D (createAirUIBlendScope), DOM elements that follow UI nodes (createAirDOMOverlay), the AirUIMesh renderer, and the experimental HTML-in-canvas texture subpath (cocosair.js/html-source). Use when authoring or exporting vector fills, gradients, patterns, sprite masks, blend scopes, texture sprites, DOM overlays, or live HTML textures, rather than copying PixiJS or Creator editor snippets.
---

# Cocos AIR graphics and DOM

Replay drawing data on the native `Graphics`, rasterize rich fills into a native
`Texture2D`, mask a single `Sprite`, inherit UI blend across a subtree, borrow a
texture or a DOM element, and opt into the experimental HTML canvas texture. The
single contract for this skill is `docs/manual/graphics-and-dom.md` (as of 2026-10-10);
every claim below is traceable to the AIR source under `src/air/`. Browser targets
still require WebGL 2.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, Graphics, Layers, UITransform, Canvas, Color,
         view, ResolutionPolicy, drawAirGraphics, airGraphicsCommandsToSvg,
         rasterizeAirGraphics, createAirTextureSprite } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' }); // #GameCanvas must exist first
view.setDesignResolutionSize(1280, 720, ResolutionPolicy.EXACT_FIT);
const scene = new Scene('graphics');
const UI = Layers.Enum.UI_2D;                              // the layer bit is on Layers.Enum; Layers.UI_2D is undefined
const ui = new Node('UI'); ui.layer = UI;
ui.addComponent(UITransform).setContentSize(1280, 720);
const canvasComponent = ui.addComponent(Canvas);          // UI renderers draw through their Canvas camera
scene.addChild(ui);
const camNode = new Node('UICamera'); camNode.layer = UI; camNode.setPosition(0, 0, 1000);
ui.addChild(camNode);
const cam = camNode.addComponent(Camera);
cam.projection = Camera.ProjectionType.ORTHO; cam.visibility = UI;
cam.clearColor = new Color(24, 30, 44, 255);
canvasComponent.cameraComponent = cam;

// 1) Solid commands replayed on a native Graphics component (Y up, node-centred).
const g = ui.addComponent(Graphics);
drawAirGraphics(g, [
    { op: 'rect', args: [-420, -140, 200, 100] },
    { op: 'fill', paint: { color: '#ff0000' } },
]);
const svg = airGraphicsCommandsToSvg(
    [{ op: 'rect', args: [0, 0, 100, 50] }, { op: 'fill', paint: { color: '#ff0000' } }],
    { x: 0, y: 0, width: 100, height: 50 });

// 2) Rich fills (gradient/pattern/hole) rasterize into a native Texture2D, then display.
const paint = rasterizeAirGraphics(
    [{ op: 'rect', args: [0, 0, 200, 100] },
     { op: 'fill', paint: { kind: 'linear', from: [0, 0], to: [200, 0],
       stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] } }],
    { bounds: { x: 0, y: 0, width: 200, height: 100 }, resolution: 2 });
const display = createAirTextureSprite(ui, paint.texture, { size: [200, 100] });
display.node.setPosition(140, 0, 0);

app.run(scene); // first frame draws on a later tick; never tear down inline here

function teardown() {
    display.dispose();   // owned node/SpriteFrame first, borrowed texture untouched
    paint.dispose();     // destroy the raster Texture2D after its display
    g.clear();
}
</script>
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - `Node`/`Layer` and deferred destroy, which texture sprites and masks depend on.
- [cocosair-camera](../cocosair-camera/SKILL.md) - the ortho UI camera a `createAirDOMOverlay` binding projects through.
- [cocosair-ui-2d](../cocosair-ui-2d/SKILL.md) - Canvas, `Sprite`/`SpriteFrame` and UI layer wiring that every helper here attaches to.
- [cocosair-assets](../cocosair-assets/SKILL.md) - `Texture2D` ownership; masks and raster paints borrow, never own, the source texture.
- [cocosair-rendering](../cocosair-rendering/SKILL.md) - blend factors, materials and batching these helpers rewrite.
- [cocosair-performance](../cocosair-performance/SKILL.md) - explicit raster/HTML update cadence instead of per-frame re-upload.
- [cocosair-verification](../cocosair-verification/SKILL.md) - the pixel, SVG and click probes behind the claims below.

## When to use what

- "draw a shape in code" -> build `AirGraphicsCommand[]`, replay solid fills with `drawAirGraphics` on a `Graphics` component (`src/air/graphics-commands.ts:74-88`).
- "export vector art" -> `airGraphicsCommandsToSvg(commands, bounds)`; it keeps the original curves, the `Graphics` mesh does not (`src/air/graphics-commands.ts:92-157`).
- "gradient, radial, pattern or evenodd hole" -> `rasterizeAirGraphics(commands, options)` for a Canvas2D `Texture2D`, then display it (`src/air/graphics-raster.ts:11-85`).
- "show a texture in UI" -> `createAirTextureSprite(parent, texture, options)`; the texture stays borrowed (`src/air/texture-sprite.ts:15-48`).
- "cut one Sprite by another texture" -> `attachAirSpriteMask(sprite, maskTexture, options)` (`src/air/effects/sprite-mask.ts:18-83`).
- "make a subtree add/multiply" -> `createAirUIBlendScope(root, mode)` (`src/air/ui-blend.ts:11-55`).
- "keep a DOM input glued to a UI node" -> `createAirDOMOverlay({ canvas })` then `.attach(...)` (`src/air/dom-overlay.ts:24-83`).
- "warp a textured UI quad by hand" -> add the `AirUIMesh` component and `setGeometry(...)` (`src/air/ui-mesh.ts:83-118`).
- "paint a live form as a GPU texture" -> the opt-in `cocosair.js/html-source` subpath (see `references/html-source.md`).

## Contracts

- The UI host is a contract, not boilerplate. `Graphics`, `AirUIMesh` and `createAirTextureSprite` output are 2D renderers, so they draw only under a `Canvas` whose `cameraComponent` is an ortho camera whose `visibility` contains the node's `Layers.Enum.UI_2D` bit (`src/air/ui-kit.ts:38`, `:44-51`, `:61`, `:65`); `createUICanvas(scene, name, options)` builds that whole host and `cocosair-ui-2d` owns it. A bare `new Node()` + `addComponent(Camera)` yields a perfectly uniform canvas with no error, and `Layers.UI_2D` is `undefined` - the bit is `Layers.Enum.UI_2D`.
- `AirGraphicsCommand[]` is plain drawing data with Y-up local coordinates; a command is `moveTo`/`lineTo`/`bezierCurveTo`/`quadraticCurveTo`/`arc`/`rect`/`roundRect`/`ellipse`/`circle`/`close`/`fill`/`stroke` (`src/air/graphics-commands.ts:5-15`). Colors must match `#rrggbb` and opacity stays in `[0,1]`, else validation throws `AIR_E_GRAPHICS_COMMAND` before any replay (`:26-31`, `:32-70`).
- `drawAirGraphics(graphics, commands, clear = true)` replays only solid nonzero fills on the native `Graphics`; it throws on any gradient, pattern or `evenodd` fill, pointing you at `rasterizeAirGraphics` (`src/air/graphics-commands.ts:74-88`, `:76`). `arc`'s last boolean keeps native direction (true = counter-clockwise); stroke accepts `butt|round|square` caps and `miter|round|bevel` joins (`docs/manual/graphics-and-dom.md:54`).
- `airGraphicsCommandsToSvg(commands, bounds)` serializes the same data into `<svg>`, flipping Y exactly once via the `scale(1 -1)` group and viewBox (`src/air/graphics-commands.ts:156`). It preserves original curves and does not reconstruct them from a subdivided `Graphics.impl` (`docs/manual/graphics-and-dom.md:56`); SVG supports solid/linear/radial fills plus local patterns with opacity and `evenodd` holes (`:58`).
- Pattern paint is `{ kind: 'pattern', image, width, height, textureSpace, transform }`; `transform` is a direct affine `pattern -> chosen space`, never pre-inverted or premultiplied by texture size (`src/air/graphics-commands.ts:22`). `textureSpace: 'global'` makes `airGraphicsCommandsToSvg` throw and requires `rasterizeAirGraphics` to receive `options.worldTransform` (the local-to-world matrix `[a,b,c,d,tx,ty]`) (`src/air/graphics-commands.ts:106`, `src/air/graphics-raster.ts:28-30`). SVG pattern export needs local coordinates plus an explicit `sourceURL` that is a `data:image` or `http(s)` value (`src/air/graphics-commands.ts:107`).
- `rasterizeAirGraphics(commands, { bounds, resolution = 1, worldTransform? })` uses Canvas2D and a native `Texture2D`; it is a raster result, not a GPU vector filler. `resolution` sets pixels per logical unit and each edge is capped at 8192, else `AIR_E_GRAPHICS_RESOLUTION` (`src/air/graphics-raster.ts:26-27`). The `-resolution` device transform plus top-first `getImageData` rows match native Sprite UV, so there is no extra upload flip (`:32`, `:77-80`). Call `update(commands?, options?)` explicitly on any command/resolution/bounds/global-pattern-transform change; it is not an automatic per-frame loop (`:23`, `docs/manual/graphics-and-dom.md:82`).
- `createAirTextureSprite(parent, texture, { name?, size?, anchor? })` borrows the `TextureBase` and owns the created `Node`/`SpriteFrame`; default size is the texture size and default anchor `[0.5, 0.5]`, set on `UITransform` not the shared texture (`src/air/texture-sprite.ts:14-25`). `refresh()` rebuilds the frame `rect`/`originalSize` after the texture resizes; `dispose()` destroys the owned node/frame but not the borrowed texture (`:28-47`).
- `attachAirSpriteMask(sprite, maskTexture, options)` samples a second texture in normalized sprite UVs and handles trimmed/rotated atlas frames via an inverse affine (`src/air/effects/sprite-mask.ts:68-74`). `channel` is `alpha|red` (default alpha), `mode` is `soft|threshold` (default soft; `soft` attenuates output alpha, `threshold` discards fragments at `threshold`, default `0.1`), plus `inverted` (`:10-15`, `:21-23`). It masks ONE `Sprite`, never an arbitrary subtree, and refuses a `Sprite` that already has a `customMaterial` (`docs/manual/graphics-and-dom.md:103`, `src/air/effects/sprite-mask.ts:24`). Detach the binding before disposing the mask texture (`:78-82`).
- `createAirUIBlendScope(root, mode = 'normal')` is an opt-in controller: it rewrites the private `_srcBlendFactor`/`_dstBlendFactor` and pushes `normal|add|multiply` through a `MaterialInstance` `overridePipelineStates`, covering native `UIRenderer` including `ParticleSystem2D` (`src/air/ui-blend.ts:5-28`). It adds no implicit `Node.blendMode`. Call `update()` after hierarchy/component/particle/material changes; `set(node, null)` restores inheritance and explicit child overrides win (`:36-53`). `dispose()` and moving a node out of the subtree restore only the factors the controller still owns (`:29-35`, `:54`).
- `createAirDOMOverlay({ canvas, host?, className? })` owns one independent fixed root and never mutates `game.container`; `.attach(element, node, camera, { width?, height?, anchor? })` borrows the element and `.dispose()` restores its original parent, order and inline style (`src/air/dom-overlay.ts:24-44`, `:68-77`). `update()` (from the app's own frame callback, not a second clock) projects the node's world matrix plus the canvas CSS-vs-backing size into one CSS `matrix()`; this affine mapping is intended for planar orthographic UI, and perspective or tilted planes cannot be represented accurately (`:50-67`, `docs/manual/graphics-and-dom.md:37`).
- `AirUIMesh` is a native `UIRenderer` component (`@requireComponent(UITransform)`) that shares Sprite materials, stencil masks and batch buffers. `setGeometry({ positions, uvs, indices })` requires 3..1024 XY vertices, one `[0,1]` UV pair per vertex, and 1..1365 triangles (`indices.length` in `3..4095`, multiple of 3) or it throws `AIR_E_UI_MESH_GEOMETRY` (`src/air/ui-mesh.ts:21-31`, `:106`). `dispose()` clears the renderer and releases its frame/texture leases without destroying the node or shared assets (`:111-115`).
- HTML live textures are a separate, engine-free experimental subpath imported as `cocosair.js/html-source` (bundle `build/html-source.js`): `getAirHTMLSourceSupport(canvas)` probes the API, and `createAirHTMLSource({ canvas, element, texture, ... })` throws `AIR_E_HTML_SOURCE_UNSUPPORTED` before any DOM/texture mutation when the browser lacks it. The element must be a direct child of the canvas and hold an exclusive lease, and the texture must be a single-mip RGBA8 native `Texture2D` for that WebGL2 device (`src/air/html-source.ts:39-51`, `:69-72`).

## Common Mistakes

### [HIGH] Passing a gradient, pattern, or evenodd hole to drawAirGraphics

Wrong:
```js
drawAirGraphics(g, [
    { op: 'rect', args: [0, 0, 200, 100] },
    { op: 'circle', args: [100, 50, 20] },
    { op: 'fill', rule: 'evenodd',
      paint: { kind: 'linear', from: [0, 0], to: [200, 0],
               stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] } },
]);
```

Correct:
```js
const paint = rasterizeAirGraphics(commands, {
    bounds: { x: 0, y: 0, width: 200, height: 100 }, resolution: 2 });
const display = createAirTextureSprite(parent, paint.texture, { size: [200, 100] });
```

`drawAirGraphics` throws `AIR_E_GRAPHICS_COMMAND` on a non-solid or `evenodd` fill and
routes gradients/patterns/holes to the raster path; native replay never silently degrades
(`src/air/graphics-commands.ts:76`, `docs/manual/graphics-and-dom.md:56`, `:60-86`).

### [HIGH] Treating masks, blend scopes, and DOM overlays as fire-and-forget

Wrong:
```js
attachAirSpriteMask(sprite, tex);      // then swap sprite.spriteFrame or move nodes
const blend = createAirUIBlendScope(root, 'add');   // never re-applied after changes
const overlay = createAirDOMOverlay({ canvas });    // attach, then never call update()
```

Correct:
```js
mask.update();               // after replacing spriteFrame on the same binding
blend.update();              // after hierarchy / component / particle / material edits
binding.update();            // from the app frame callback after camera or layout moves
```

`mask` follows the current frame's `UV_UPDATED` but needs an explicit `update()` on a frame
swap; blend and overlay are controllers whose GPU/DOM state only re-syncs when you call
`update()` (`src/air/effects/sprite-mask.ts:64-67`, `src/air/ui-blend.ts:36-53`,
`src/air/dom-overlay.ts:50-67`). Each owns resources you must `dispose()` before releasing
the borrowed texture, node, or element (`docs/manual/graphics-and-dom.md:98`, `:34`).

### [MEDIUM] Forgetting SVG export constraints for patterns

Wrong:
```js
airGraphicsCommandsToSvg(commands, bounds);   // pattern uses textureSpace: 'global'
// or a pattern with no sourceURL at all
```

Correct:
```js
// Convert global patterns to a local transform first, and give every pattern a
// data:image or http(s) sourceURL before exporting.
const svg = airGraphicsCommandsToSvg(localCommands, bounds);
```

`airGraphicsCommandsToSvg` throws on `textureSpace: 'global'` and on a missing or non
`data:image`/`http(s)` `sourceURL`; it never fetches or embeds external URLs and offers no
arbitrary SVG text parser (`src/air/graphics-commands.ts:106-107`,
`docs/manual/graphics-and-dom.md:58`).

## References

- `references/commands.md` - `AirGraphicsCommand` set, `#rrggbb`+opacity validation, native solid replay, and the SVG serialization contract.
- `references/raster.md` - `rasterizeAirGraphics` options, the 8192 edge cap, `worldTransform` for global patterns, and top-first upload rows.
- `references/sprite-mask.md` - `attachAirSpriteMask` channel/mode/threshold/inverted, single-Sprite scope, and material ownership.
- `references/ui-blend.md` - `createAirUIBlendScope` normal/add/multiply, the private factor rewrite and instance override, opt-in subtree inheritance.
- `references/texture-sprite.md` - `createAirTextureSprite` borrowed texture, default size/anchor, `refresh()` and `dispose()` ownership.
- `references/ui-mesh.md` - the `AirUIMesh` renderer and its 3..1024 vertex / 1..1365 triangle geometry bounds.
- `references/dom-overlay.md` - `createAirDOMOverlay` element borrowing, restore-on-dispose, and planar-ortho affine mapping.
- `references/html-source.md` - the experimental `cocosair.js/html-source` subpath, direct-child lease, and RGBA8 single-mip texture requirement.

## Canonical docs

- `docs/manual/graphics-and-dom.md` - the single authoritative contract for texture display, DOM overlays, command replay, SVG export, raster fills, sprite masks, blend inheritance, and HTML textures; read it end to end before changing these APIs.
- `examples/graphics-svg-paints/src/main.ts` - runnable native `Graphics`, gradient holes, non-square patterns, SVG preview/download and pixel round-trip.
- `examples/sprite-mask-blend/src/main.ts` - red/alpha, soft/threshold/inverted, and normal/add against native particles.
- `examples/dom-overlay-texture/src/main.ts` - real input/click, move/rotate, anchor, texture resize GPU display, unbind and release.
- `examples/html-texture-experimental/src/main.ts` - live form texture, DOM repaint, immutable snapshot, and the ordinary-browser unsupported branch.
