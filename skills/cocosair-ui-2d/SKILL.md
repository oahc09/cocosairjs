---
name: cocosair-ui-2d
description: "Build Canvas UI with sprites, Label text, layout and widgets. Use for missing UI, viewport alignment, 2D draw order, BMFont binding or AIR_E_LABEL_WRAP."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - put sprites, labels or controls on screen
  - UI renders nothing despite visible nodes
  - widgets must realign after a viewport change
  - bind an existing bitmap font to Label
  - 2D sprites and labels overlap in the wrong order
owns: [ui-canvas, sprite-label, widget-layout, ui-controls, font-binding, sorting-2d]
not_for:
  - load or parse a bitmap font -> cocosair-assets
  - sprite masks and DOM overlays -> cocosair-graphics-and-dom
  - native input and action mapping -> cocosair-input-action
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "使用 Canvas、布局、控件、Label、位图字体和二维排序。用于 UI 构建、文本显示或交互布局问题。"
---

# Cocos AIR 2D UI contracts

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Code-first Canvas hosts, UI cameras, layouts, widgets, fonts and 2D ordering.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Make UI visible with Canvas and its camera
- Create image panels with spriteNode
- Create labels with system or bitmap fonts
- Align widgets after a viewport resize
- Stack or grid children with Layout
- Wire buttons, sliders and scrolling
- Correct sprite or label overlap order

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

UI renderers need a Canvas, its orthographic camera and matching UI layer/visibility. Use `createUICanvas` to assemble this host. Label uses system fonts unless a supported single-page bitmap font is explicitly bound.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Label needs no Creator font-asset pipeline.
- [HIGH] Match UI layers and bind the Canvas camera.
- [MEDIUM] RichTextComponent and LabelAtlas are available.
- [MEDIUM] Set Sprite SizeMode.CUSTOM before assigning its frame.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Why is UI missing?](references/canvas-widget-layout.md) - Canvas and layout
- [Which interactive widget?](references/widgets.md) - Components and aliases
- [How does text render?](references/label-and-text.md) - Fonts and wrapping
- [Why is overlap wrong?](references/sorting.md) - Layers and priority
