---
name: cocosair-project-setup
description: "Set up npm imports, package entries, importmap, TypeScript and variant builds. Use for cocosair.js installation, unresolved-import errors, page shells or build artifacts."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - install or import cocosair.js
  - imports resolve to the wrong entry
  - TypeScript editor declarations fail
  - wire a page importmap and canvas
  - which build command produces this artifact
owns: [package-entries, importmap, typescript, html-shell, feature-flags, build-artifacts]
not_for:
  - createAirApp startup failures -> cocosair-application
  - live HTML textures or overlays -> cocosair-graphics-and-dom
  - proving build artifacts -> cocosair-verification
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "安装和配置 Cocos AIR 项目，选择包入口、importmap、TypeScript 声明和变体构建。用于安装导入、页面骨架、类型解析或构建产物问题。"
---

# Cocos AIR project setup

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: Package imports, HTML shells, TypeScript declarations and identifiable build variants.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Install cocosair.js in a bundler app
- Wire a static page importmap and canvas
- Select a custom canvas or startup pixel ratio
- Find main-entry experimental HTML texture helpers
- Resolve TypeScript 4.9 or 5+ declarations
- Choose AIR_FEATURES and separate variant output
- Identify which build command owns an artifact

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Use `cocosair.js` in bundler apps; `cocosair` is the repository importmap alias. Pass any selected canvas to createAirApp; repeated main calls share startup admission. Keep variant outputs separate from default builds.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Installed apps import cocosair.js, not the cocosair alias.
- [HIGH] src/index.ts alone does not define the package surface.
- [MEDIUM] Bootstrap/html-source package subpaths were removed.
- [MEDIUM] A variant build is a distinct candidate.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Which import or types?](references/entries.md) - Exports and artifacts
- [What does a variant ship?](references/feature-flags.md) - Features and outputs
- [How should the page start?](references/html-shell.md) - Importmap and canvas
