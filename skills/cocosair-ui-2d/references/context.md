# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - deferred `destroy()`, parenting order and `Node.layer`, which every UI node depends on.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - `Camera` projection, `visibility` and clear color, the half of a Canvas that makes UI pixels appear.
- [cocosair-assets](../../cocosair-assets/SKILL.md) - `Texture2D`/`SpriteFrame` ownership and `loadBitmapFont` for authored faces.
- [cocosair-graphics-and-dom](../../cocosair-graphics-and-dom/SKILL.md) - `Graphics`, masks and the DOM overlay path for text that must stay selectable.
- [cocosair-performance](../../cocosair-performance/SKILL.md) - 2D batching and atlas behavior behind draw-order and label cache-mode choices.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - the browser probes and gates behind the click and layout claims quoted below.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Assemble a Canvas and its ortho UI camera from code, add sprites, labels and interactive
widgets, and control 2D draw order - no Prefab, no Editor, no parallel UI abstraction.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Waiting on a Creator font-asset pipeline for Label
- [HIGH] Leaving the UI layer unset or the camera unbound
- [MEDIUM] Reading the manual as "RichText and LabelAtlas are unavailable"

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Drives code-first 2D UI in the Cocos AIR runtime - createUICanvas (Canvas plus fullscreen Widget plus an ortho UI camera bound through canvas.cameraComponent, defaults designWidth 1280, designHeight 720, layer Layers.Enum.UI_2D), the spriteNode and labelNode helpers and their real defaults (fontSize 28, lineHeight Math.round(fontSize*1.25), the AIR_E_LABEL_WRAP guard), the widget components Canvas, Widget, Layout (exported as Layout$1 as Layout), Button, ScrollView, ProgressBar, Slider, Toggle, EditBox, PageView, SafeArea and BlockInputEvents, each also aliased as ...Component, Label system-font and BMFont binding, LabelOutline, LabelShadow, LabelAtlas, the RichText-only-as-RichTextComponent alias, and 2D draw order through SortingLayers, Sorting2D and the Intersection2D utility. Use when a UI node renders nothing, when text needs a font without any Creator font-asset pipeline, when widgets must realign on a viewport change, or when 2D sprites and labels stack in the wrong order.

### Keywords

Cocos AIR, cocosair.js, ui, 2d

## References

- [canvas-widget-layout.md](canvas-widget-layout.md) - the `createUICanvas` assembly contract, `Canvas.cameraComponent`, `Widget` alignment modes and viewport relayout, `Layout` type/resizeMode/direction, and design resolution.
- [widgets.md](widgets.md) - the component catalog with bare versus `...Component` aliases, `Layout$1 as Layout`, base-class relationships, and the `node.on('click', ...)` event surface.
- [label-and-text.md](label-and-text.md) - system font versus BMFont binding, `Overflow` and `CacheMode` semantics, `LabelOutline`/`LabelShadow`, `LabelAtlas`, `RichText` as an alias only, and the `labelNode` defaults and `AIR_E_LABEL_WRAP`.
- [sorting.md](sorting.md) - `SortingLayers.Enum`, `Sorting2D` priority writing, and why `Intersection2D` is a geometry helper rather than a sorter.

## Canonical docs

- `docs/manual/2d-ui.md` - open for Canvas and UI-camera assembly, the runtime SpriteFrame path, `sizeMode` ordering, `makeUINode`, and resolution policy.
- `docs/manual/ui-layout-and-interaction.md` - open for Button events, Widget relayout on resize, Layout auto-placement, and the two-viewport geometry verification note.
- `docs/manual/creating-text.md` - open for the three text routes, `Label` defaults, the overflow semantics matrix, and the font-capability boundary.
- `docs/manual/bitmap-font-loading.md` - open for `parseFnt`/`createBitmapFont`/`loadBitmapFont`, page-texture constraints, and the `AIR_E_FNT_*` errors.
