# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `Node`/`Layer` and deferred destroy, which texture sprites and masks depend on.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - the ortho UI camera a `createAirDOMOverlay` binding projects through.
- [cocosair-ui-2d](../../cocosair-ui-2d/SKILL.md) - Canvas, `Sprite`/`SpriteFrame` and UI layer wiring that every helper here attaches to.
- [cocosair-assets](../../cocosair-assets/SKILL.md) - `Texture2D` ownership; masks and raster paints borrow, never own, the source texture.
- [cocosair-rendering](../../cocosair-rendering/SKILL.md) - blend factors, materials and batching these helpers rewrite.
- [cocosair-performance](../../cocosair-performance/SKILL.md) - explicit raster/HTML update cadence instead of per-frame re-upload.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - the pixel, SVG and click probes behind the claims below.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Replay drawing data on the native `Graphics`, rasterize rich fills into a native
`Texture2D`, mask a single `Sprite`, inherit UI blend across a subtree, borrow a
texture or a DOM element, and opt into the experimental HTML canvas texture. The
single contract for this skill is `docs/manual/graphics-and-dom.md` (as of 2026-10-10);
every claim below is traceable to the AIR source under `src/air/`. Browser targets
still require WebGL 2.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Passing a gradient, pattern, or evenodd hole to drawAirGraphics
- [HIGH] Treating masks, blend scopes, and DOM overlays as fire-and-forget
- [MEDIUM] Forgetting SVG export constraints for patterns

## Original contract wording

The archived subpath claim below is historical: current HTML helpers are exported by the main cocosair.js entry. See [HTML source](html-source.md) for the current contract.

Use native Graphics for solid nonzero fills and rasterization for rich fills. Texture/element bindings borrow their sources and need explicit updates and disposal. Live HTML textures require the experimental subpath.

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Reuse native Cocos objects for 2D drawing and DOM in Cocos AIR. Covers AirGraphicsCommand drawing data replayed on a Graphics component (drawAirGraphics, solid nonzero only), SVG serialization that preserves curves (airGraphicsCommandsToSvg), Canvas2D rich fills into a native Texture2D (rasterizeAirGraphics), borrowed-texture display (createAirTextureSprite), per-Sprite channel masks (attachAirSpriteMask), opt-in UI blend inheritance including ParticleSystem2D (createAirUIBlendScope), DOM elements that follow UI nodes (createAirDOMOverlay), the AirUIMesh renderer, and the experimental HTML-in-canvas texture subpath (cocosair.js). Use when authoring or exporting vector fills, gradients, patterns, sprite masks, blend scopes, texture sprites, DOM overlays, or live HTML textures, rather than copying PixiJS or Creator editor snippets.

### Keywords

Cocos AIR, cocosair.js, graphics, and, dom

## References

- [commands.md](commands.md) - `AirGraphicsCommand` set, `#rrggbb`+opacity validation, native solid replay, and the SVG serialization contract.
- [raster.md](raster.md) - `rasterizeAirGraphics` options, the 8192 edge cap, `worldTransform` for global patterns, and top-first upload rows.
- [sprite-mask.md](sprite-mask.md) - `attachAirSpriteMask` channel/mode/threshold/inverted, single-Sprite scope, and material ownership.
- [ui-blend.md](ui-blend.md) - `createAirUIBlendScope` normal/add/multiply, the private factor rewrite and instance override, opt-in subtree inheritance.
- [texture-sprite.md](texture-sprite.md) - `createAirTextureSprite` borrowed texture, default size/anchor, `refresh()` and `dispose()` ownership.
- [ui-mesh.md](ui-mesh.md) - the `AirUIMesh` renderer and its 3..1024 vertex / 1..1365 triangle geometry bounds.
- [dom-overlay.md](dom-overlay.md) - `createAirDOMOverlay` element borrowing, restore-on-dispose, and planar-ortho affine mapping.
- [html-source.md](html-source.md) - the experimental HTML helpers in the main entry, direct-child lease, and RGBA8 single-mip texture requirement.

## Canonical docs

- `docs/manual/graphics-and-dom.md` - the single authoritative contract for texture display, DOM overlays, command replay, SVG export, raster fills, sprite masks, blend inheritance, and HTML textures; read it end to end before changing these APIs.
- `examples/graphics-svg-paints/src/main.ts` - runnable native `Graphics`, gradient holes, non-square patterns, SVG preview/download and pixel round-trip.
- `examples/sprite-mask-blend/src/main.ts` - red/alpha, soft/threshold/inverted, and normal/add against native particles.
- `examples/dom-overlay-texture/src/main.ts` - real input/click, move/rotate, anchor, texture resize GPU display, unbind and release.
- `examples/html-texture-experimental/src/main.ts` - live form texture, DOM repaint, immutable snapshot, and the ordinary-browser unsupported branch.
