# AGENTS.md

Guidance for AI agents (and humans) working in this repository.

## What this repo is

**Cocos AIR** (Cocos Agent-first Interactive Runtime) is a standalone TypeScript runtime for interactive 3D web applications. It was extracted from the cocos4 Web engine so developers can create scenes with code and run them in a browser without Cocos Creator or its Editor asset pipeline. A typical application calls `createAirApp()`, builds a scene with the original Cocos `Scene`, `Node`, `Camera`, renderer, material, and animation APIs, then runs that scene through WebGL.

The runtime also supports direct glTF/GLB loading, including materials, skeletal animation, and supported extensions. The examples and manual teach those APIs. Separate development tools provide inspection, validation, and agent feedback; they are not part of the default runtime bundle. This repository is a Web engine and developer toolkit, not a Creator plugin, visual editor, or native-platform runtime.

Start with [README.md](README.md) for the current quick start and capability boundaries. [UPSTREAM.md](UPSTREAM.md) records the engine source baseline and intentional differences from upstream.

## Repository layout

| Path | Purpose |
|---|---|
| `src/cocos/` | Extracted Cocos engine source. Keep upstream differences small and traceable. |
| `src/pal/`, `src/exports/` | Web platform adapters and build feature/export entry points. |
| `src/air/` | Cocos AIR's thin bootstrap, Code First helpers, built-in resources, and glTF integration. |
| `build/` | Generated ESM bundles, declarations, and separately shipped decoder assets. |
| `examples/` | Runnable applications, Gallery metadata, and example assets. |
| `docs/` | Getting-started material, engine analysis, API guidance, and verification records. |
| `docs/manual/` | Developer manual and its examples. |
| `tools/` | Build, development server, analysis, and verification tooling. `tools/debug/` contains optional development tools. |
| `test/` | Smoke tests and fixtures. |
| `ai/` | Version plans and implementation briefs; these describe intended work and are not proof that a feature shipped. |

## Development workflow

Run commands from the repository root:

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
npm run build:min
npm run build:dts
npm run verify:web-only
```

`npm run dev` watches engine and AIR source, serves the examples, and reloads the browser. `npm run build` produces `build/cocosair.module.js`; `build:min` produces the minified ESM bundle; `build:dts` produces `build/cocosair.module.d.ts`. `verify:web-only` checks that platform dependencies do not pull native implementations into the Web runtime. See [package.json](package.json) for the current script list and use the checks relevant to a change.

The `#GameCanvas` element must exist before importing the engine in a browser page because the screen adapter initializes during module import. Use `examples/starter/` for the minimal page structure. For model loading and decoder deployment, see [docs/gltf-runtime.md](docs/gltf-runtime.md) and [docs/gltf-decoder-deployment.md](docs/gltf-decoder-deployment.md).

## Working agreements

- Treat the original Cocos engine API as the main public API. Add AIR-specific conveniences in `src/air/` where needed; avoid creating parallel `Scene`, `Node`, or material abstractions.
- Preserve the Web-only boundary. Keep Creator Editor, JSB, and native implementations out of the runtime dependency graph. The glTF decoders ship separately from the main bundle and are configured only when needed.
- Keep development inspection and agent tools separate from the default runtime package. A Gallery or example may opt into them explicitly.
- Before changing extracted engine files, read the relevant upstream mapping and record intentional differences in `docs/upstream-file-map.json` and [UPSTREAM.md](UPSTREAM.md). Do not silently replace the pinned upstream baseline.
- Preserve unrelated local changes. Check the target file and Git status before editing; avoid resetting or cleaning another contributor's work.
- Use focused validation for the affected behavior. For visual or rendering changes, check the actual browser result; typecheck or a successful bundle alone does not establish visual correctness. Some verification scripts write evidence files, so inspect their effects before running them in a shared worktree.
- Keep claims about completion tied to the current code and verification evidence. A version plan, a passing subset, or a generated report from an older revision does not by itself establish release readiness.
