---
name: cocosair-ui-2d
description: "Drives code-first 2D UI in the Cocos AIR runtime - createUICanvas (Canvas plus fullscreen Widget plus an ortho UI camera bound through canvas.cameraComponent, defaults designWidth 1280, designHeight 720, layer Layers.Enum.UI_2D), the spriteNode and labelNode helpers and their real defaults (fontSize 28, lineHeight Math.round(fontSize*1.25), the AIR_E_LABEL_WRAP guard), the widget components Canvas, Widget, Layout (exported as Layout$1 as Layout), Button, ScrollView, ProgressBar, Slider, Toggle, EditBox, PageView, SafeArea and BlockInputEvents, each also aliased as ...Component, Label system-font and BMFont binding, LabelOutline, LabelShadow, LabelAtlas, the RichText-only-as-RichTextComponent alias, and 2D draw order through SortingLayers, Sorting2D and the Intersection2D utility. Use when a UI node renders nothing, when text needs a font without any Creator font-asset pipeline, when widgets must realign on a viewport change, or when 2D sprites and labels stack in the wrong order."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, ui, 2d"
  description_en: "Drives code-first 2D UI in the Cocos AIR runtime - createUICanvas (Canvas plus fullscreen Widget plus an ortho UI camera bound through canvas.cameraComponent, defaults designWidth 1280, designHeight 720, layer Layers.Enum.UI_2D), the spriteNode and labelNode helpers and their real defaults (fontSize 28, lineHeight Math.round(fontSize*1.25), the AIR_E_LABEL_WRAP guard), the widget components Canvas, Widget, Layout (exported as Layout$1 as Layout), Button, ScrollView, ProgressBar, Slider, Toggle, EditBox, PageView, SafeArea and BlockInputEvents, each also aliased as ...Component, Label system-font and BMFont binding, LabelOutline, LabelShadow, LabelAtlas, the RichText-only-as-RichTextComponent alias, and 2D draw order through SortingLayers, Sorting2D and the Intersection2D utility. Use when a UI node renders nothing, when text needs a font without any Creator font-asset pipeline, when widgets must realign on a viewport change, or when 2D sprites and labels stack in the wrong order."
  description_zh: "使用 Canvas、布局、控件、Label、位图字体和二维排序。用于 UI 构建、文本显示或交互布局问题。"
---

# Cocos AIR 2D UI contracts

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Assemble a Canvas and its ortho UI camera from code, add sprites, labels and interactive
widgets, and control 2D draw order - no Prefab, no Editor, no parallel UI abstraction.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "put UI on screen" -> `createUICanvas(scene, name, { designWidth, designHeight, layer })`; it wires Canvas + Widget + ortho camera in one call (`src/air/ui-kit.ts:37-67`).
- "a colored panel / image" -> `spriteNode(parent, name, { size, position, color, layer })`, then assign `sprite.spriteFrame`; set `SizeMode.CUSTOM` before the frame (`src/air/ui-kit.ts:81-93`, `docs/manual/2d-ui.md:62-66`).
- "on-screen text" -> `labelNode(parent, text, name, { fontSize, position, color, overflow, enableWrapText, boxSize })`; system font unless you bind a BMFont (`src/air/ui-kit.ts:111-131`).
- "align to an edge / fill the screen" -> `Widget` with `isAlignLeft/Right/Top/Bottom` and `alignMode` (`src/cocos/ui/widget.ts:123-148`).
- "auto-stack or grid children" -> `Layout` (`Layout.Type`, `Layout.ResizeMode`, `Layout.VerticalDirection`) (`src/cocos/ui/layout.ts:214`, `:619-644`).
- "buttons, sliders, scrolling" -> `Button`, `Slider`, `ProgressBar`, `ScrollView`, `Toggle`, `EditBox`, `PageView`; each also aliased `...Component` ([widgets.md](references/widgets.md)).
- "wrong 2D overlap" -> `Sorting2D` (needs a `UIRenderer`) writes `uiRenderer.priority` from `SortingLayers` ([sorting.md](references/sorting.md)).

## Contracts

UI renderers need a Canvas, its orthographic camera and matching UI layer/visibility. Use `createUICanvas` to assemble this host. Label uses system fonts unless a supported single-page bitmap font is explicitly bound.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Waiting on a Creator font-asset pipeline for Label
- [HIGH] Leaving the UI layer unset or the camera unbound
- [MEDIUM] Reading the manual as "RichText and LabelAtlas are unavailable"

## References

- [canvas-widget-layout.md](references/canvas-widget-layout.md) - the `createUICanvas` assembly contract, `Canvas.cameraComponent`, `Widget` alignment modes and viewport relayout, `Layout` type/resizeMode/direction, and design resolution.
- [widgets.md](references/widgets.md) - the component catalog with bare versus `...Component` aliases, `Layout$1 as Layout`, base-class relationships, and the `node.on('click', ...)` event surface.
- [label-and-text.md](references/label-and-text.md) - system font versus BMFont binding, `Overflow` and `CacheMode` semantics, `LabelOutline`/`LabelShadow`, `LabelAtlas`, `RichText` as an alias only, and the `labelNode` defaults and `AIR_E_LABEL_WRAP`.
- [sorting.md](references/sorting.md) - `SortingLayers.Enum`, `Sorting2D` priority writing, and why `Intersection2D` is a geometry helper rather than a sorter.

## Canonical docs

- `docs/manual/2d-ui.md` - open for Canvas and UI-camera assembly, the runtime SpriteFrame path, `sizeMode` ordering, `makeUINode`, and resolution policy.
- `docs/manual/ui-layout-and-interaction.md` - open for Button events, Widget relayout on resize, Layout auto-placement, and the two-viewport geometry verification note.
- `docs/manual/creating-text.md` - open for the three text routes, `Label` defaults, the overflow semantics matrix, and the font-capability boundary.
- `docs/manual/bitmap-font-loading.md` - open for `parseFnt`/`createBitmapFont`/`loadBitmapFont`, page-texture constraints, and the `AIR_E_FNT_*` errors.
