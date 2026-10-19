# 2D UI contracts triggers

For original references to the contracts below, see [Contracts](contracts.md). Source annotations refer to the AIR checkout.

## When to use what

- "put UI on screen" -> `createUICanvas(scene, name, { designWidth, designHeight, layer })`; it wires Canvas + Widget + ortho camera in one call (`src/air/ui-kit.ts:37-67`).
- "a colored panel / image" -> `spriteNode(parent, name, { size, position, color, layer })`, then assign `sprite.spriteFrame`; set `SizeMode.CUSTOM` before the frame (`src/air/ui-kit.ts:81-93`, `docs/manual/2d-ui.md:62-66`).
- "on-screen text" -> `labelNode(parent, text, name, { fontSize, position, color, overflow, enableWrapText, boxSize })`; system font unless you bind a BMFont (`src/air/ui-kit.ts:111-131`).
- "align to an edge / fill the screen" -> `Widget` with `isAlignLeft/Right/Top/Bottom` and `alignMode` (`src/cocos/ui/widget.ts:123-148`).
- "auto-stack or grid children" -> `Layout` (`Layout.Type`, `Layout.ResizeMode`, `Layout.VerticalDirection`) (`src/cocos/ui/layout.ts:214`, `:619-644`).
- "buttons, sliders, scrolling" -> `Button`, `Slider`, `ProgressBar`, `ScrollView`, `Toggle`, `EditBox`, `PageView`; each also aliased `...Component` ([widgets.md](widgets.md)).
- "wrong 2D overlap" -> `Sorting2D` (needs a `UIRenderer`) writes `uiRenderer.priority` from `SortingLayers` ([sorting.md](sorting.md)).
