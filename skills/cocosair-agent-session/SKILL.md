---
name: cocosair-agent-session
description: "Inspect live scenes and frames with devtools; read runtime diagnostics. Use for scoped session writes, pixel probes or duplicate requestId INVALID_ARGUMENT errors."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Bash
when_to_use:
  - inspect the running scene or node
  - apply a scoped change through an agent session
  - capture a frame after drawing
  - read runtime errors and diagnostics
  - duplicate requestId is rejected
owns: [agent-session, scene-inspection, scoped-writes, frame-capture, pixel-probes, runtime-diagnostics]
not_for:
  - app startup or shutdown -> cocosair-application
  - verification gates and release evidence -> cocosair-verification
  - scene-tree implementation -> cocosair-scene-graph
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "使用开发工具观察运行时、按明确范围写入、捕获画面和读取诊断。用于实时应用检查或受控自动化，工具不属于默认运行时包。"
---

# Cocos AIR agent session and inspection

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Dev-only live inspection, scoped writes and frame probes; runtime diagnostics stay separate.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Inspect a running app or scene
- Apply explicitly scoped agent-session writes
- Capture a changed frame after drawing
- Read runtime diagnostics or session errors
- Measure pixels with the correct origin
- Reject duplicate request IDs or stale targets

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Agent sessions are devtools-only and require explicit writable scope. Inspect session-local IDs before writes. Duplicate request IDs are rejected; capture waits for AFTER_DRAW. Runtime diagnostics are a separate API.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Never blindly retry a write with the same requestId.
- [HIGH] Keep devtools session imports out of shipped app code.
- [MEDIUM] Diagnostics and the session error buffer are separate.
- [MEDIUM] Raw canvas and screenshot pixel origins differ.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Inspect or write?](references/agent-session.md) - Protocol and writable scope
- [Find live state?](references/runtime-control.md) - IDs and diagnostics
- [Prove pixels changed?](references/visual-probes.md) - Capture and origins
