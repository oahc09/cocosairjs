---
name: cocosair-application
description: "Configure createAirApp options, canvas, lifecycle, screen sizing and context health. Use for WEBGL2_REQUIRED startup errors, scene replacement, session cleanup or lost contexts."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - createAirApp rejects options or fails startup
  - replace or release the running scene
  - app closed and will not restart
  - fit a container or set design resolution
  - lost context or scene cleanup stalls
owns: [startup-admission, app-lifecycle, screen-sizing, context-health, session-cleanup]
not_for:
  - package imports or page shell -> cocosair-project-setup
  - persistent SceneStack pages -> cocosair-input-action
  - live-session inspection -> cocosair-agent-session
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "配置 createAirApp 和应用生命周期、屏幕尺寸、会话清理及 WebGL 上下文健康。用于启动错误、场景替换、关闭和自定义 canvas。"
---

# Cocos AIR application lifecycle

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: App admission, validated options, scene release, session cleanup and context health.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Choose valid createAirApp options and defaults
- Diagnose AIR_E_ or WEBGL2_REQUIRED startup errors
- Replace or release a running scene
- Inspect lost WebGL context health
- Own assets, listeners and timers during cleanup
- Fit a container or set design resolution

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

One runtime is admitted per document; a closed or failed runtime needs a page reload. Validate options before loading the engine. HEADLESS produces no pixels; context-health observation does not rebuild GPU resources.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Pass canvas to createAirApp; main import may precede canvas creation.
- [HIGH] A closed runtime cannot restart in the same document.
- [HIGH] HEADLESS renderMode 3 produces no rendered pixels.
- [MEDIUM] Context-health observation does not restore the device.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Configure startup?](references/app-options.md) - Options and lifecycle
- [Why did startup fail?](references/startup-errors.md) - Codes and remedies
- [Was context lost?](references/context-health.md) - States and reload gate
- [Who cleans up?](references/session-scope.md) - Ownership and disposal
