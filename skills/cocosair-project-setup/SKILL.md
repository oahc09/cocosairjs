---
name: cocosair-project-setup
description: "Set up a Cocos AIR project end to end - install the cocosair.js npm package or build from source, choose among the main entry, cocosair.js and the experimental cocosair.js, write the importmap and the startup-bound canvas page skeleton, resolve TypeScript declarations on TS 4.9 and TS 5+ via the exports types conditions, map npm scripts to build artifacts, and run AIR_FEATURES/AIR_OUT_DIR variant builds without disturbing the default 26-feature candidate. Use when installing or importing cocosair.js, fixing unresolved-import or wrong-entry errors, wiring a page shell or editor types, or deciding which build command produces which file."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, project, setup"
  description_en: "Set up a Cocos AIR project end to end - install the cocosair.js npm package or build from source, choose among the main entry, cocosair.js and the experimental cocosair.js, write the importmap and the startup-bound canvas page skeleton, resolve TypeScript declarations on TS 4.9 and TS 5+ via the exports types conditions, map npm scripts to build artifacts, and run AIR_FEATURES/AIR_OUT_DIR variant builds without disturbing the default 26-feature candidate. Use when installing or importing cocosair.js, fixing unresolved-import or wrong-entry errors, wiring a page shell or editor types, or deciding which build command produces which file."
  description_zh: "安装和配置 Cocos AIR 项目，选择包入口、importmap、TypeScript 声明和变体构建。用于安装导入、页面骨架、类型解析或构建产物问题。"
---

# Cocos AIR project setup

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Install, import and type-consume Cocos AIR correctly: one startup path per page, the canvas bound before engine evaluation, the declarations the compiler can resolve, and a build candidate you can name.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "Install from npm in a bundler app" -> `cocosair.js` package exports table in [entries.md](references/entries.md).
- "Static page, no bundler" -> importmap and skeleton rules in [html-shell.md](references/html-shell.md).
- "Custom canvas id or options-only DPR" -> the main entry accepts both at createAirApp time, including canvas creation after import. Use an application-owned dynamic main import when deferred loading is useful.
- "Paint live HTML into a `Texture2D`" -> `cocosair.js` (experimental HTML helpers in the main entry) + cocosair-graphics-and-dom.
- "Editor types fail on TypeScript < 5.0" -> `types@<5.0` / `typesVersions` conditions in [entries.md](references/entries.md).
- "Trim or extend what ships" -> `AIR_FEATURES` variant semantics in [feature-flags.md](references/feature-flags.md); a variant is a different candidate, not the default one.
- "Which command wrote this file under build/?" -> artifact ownership table in [entries.md](references/entries.md).

## Contracts

Use `cocosair.js` in bundler apps; `cocosair` is the repository importmap alias. Pass any selected canvas to createAirApp; repeated main calls share startup admission. Keep variant outputs separate from default builds.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Importing 'cocosair' from the installed package
- [HIGH] Taking the package surface from src/index.ts
- [MEDIUM] Using removed bootstrap/html-source package subpaths
- [MEDIUM] Treating a variant build as the default candidate

## References

- [entries.md](references/entries.md) - exports map, per-entry symbol surfaces, artifact ownership.
- [feature-flags.md](references/feature-flags.md) - default 26 units, the 7 unselected declared units, AIR_FEATURES/AIR_OUT_DIR semantics.
- [html-shell.md](references/html-shell.md) - page skeleton, importmap shape, startup canvas binding, dev server facts.

## Canonical docs

`docs/manual/installation.md`, `build/README.md`, `docs/reference/web-features.md`, `docs/manual/typescript-dom-compatibility.md`.
