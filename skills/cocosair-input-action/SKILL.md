---
name: cocosair-input-action
description: "Wire keyboard, mouse, touch and action state; navigate SceneStack pages. Use for focus, held-key resets, session gates, DOM canvas errors or persistent push/pop."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - map keys, touch or mouse to named actions
  - keys stop firing while an input has focus
  - DOM input fails without an explicit canvas
  - clear held actions after blur or page hiding
  - preserve page state across push/pop transitions
owns: [native-input, action-state, dom-input, focus-reset, session-gate, scene-stack]
not_for:
  - full scene replacement -> cocosair-application
  - DOM overlay geometry -> cocosair-graphics-and-dom
  - node lifecycle and custom events -> cocosair-scene-graph
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "处理原生和 DOM 输入、动作状态、焦点、会话门禁及 SceneStack。用于按键触摸、动作映射、输入阻断或清理问题。"
---

# Cocos AIR native input and the action layer

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Native/DOM input, held/pressed/released actions, session gates and persistent pages.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Handle touch, keyboard or mouse events
- Map keys and pointers into named actions
- Gate paused or backgrounded input
- Keys stop firing while editing text
- Reset actions or detach event listeners
- Push or pop persistent pages with transitions

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Keep native and DOM action-source contracts distinct; DOM input needs an explicit canvas. Pair each listener with its own callback-specific off. Respect session generations, focus and SceneStack input blocking.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] DOM input needs an explicit canvas.
- [HIGH] reset() does not remove event listeners.
- [MEDIUM] Editable focus intentionally suppresses key handling.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Read raw events?](references/native-input.md) - Enums and event payloads
- [Track held actions?](references/action-state.md) - Sources, edges and resets
- [Wire an input backend?](references/action-input.md) - Canvas, focus and cleanup
- [Preserve page state?](references/scene-stack.md) - Transitions and eviction
