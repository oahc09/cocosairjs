---
name: cocosair-project-setup
description: Set up a Cocos AIR project end to end - install the cocosair.js npm package or build from source, choose among the main entry, cocosair.js/bootstrap and the experimental cocosair.js/html-source, write the importmap and the #GameCanvas-before-import page skeleton, resolve TypeScript declarations on TS 4.9 and TS 5+ via the exports types conditions, map npm scripts to build artifacts, and run AIR_FEATURES/AIR_OUT_DIR variant builds without disturbing the default 26-feature candidate. Use when installing or importing cocosair.js, fixing unresolved-import or wrong-entry errors, wiring a page shell or editor types, or deciding which build command produces which file.
---

# Cocos AIR project setup

Install, import and type-consume Cocos AIR correctly: one entry per page, the canvas before the engine, the declarations the compiler can resolve, and a build candidate you can name.

## Quick Start

From source (runnable today, and the only currently executable path - the package is not on the npm registry yet; the pattern the repo itself uses):

```bash
npm install
npm run build      # -> build/cocosair.module.js + .map (package.json scripts build)
npm run dev        # serves http://127.0.0.1:7454/ with /build/* mounted
```

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
  import { createAirApp, Scene } from 'cocosair'; // alias name is the app's choice
  const app = await createAirApp({ canvas: '#GameCanvas' });
  app.run(new Scene('Main'));
</script>
```

The canvas must already be in the DOM when the main entry is evaluated - the screen adapter initializes at import time.

From npm (bundler app - Vite/Rollup/esbuild). Conditional: applies once the release package is available; `docs/manual/installation.md:19` states this precondition and public release is still gated by license/acceptance (`docs/manual/installation.md:23`, `docs/reference/verification.md:39`). Do not expect `npm install cocosair.js` to resolve today (registry returns E404 as of 2026-10-07).

```bash
npm install cocosair.js@1.0.0
```

```ts
// Named exports only - the package has no default export (docs/manual/installation.md).
import { createAirApp, Scene } from 'cocosair.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
app.run(new Scene('Main'));
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router; load it first for any AIR task and for the Code First discipline.
- [cocosair-graphics-and-dom](../cocosair-graphics-and-dom/SKILL.md) - owns the `cocosair.js/html-source` texture surface and DOM overlays once the entry is wired.
- [cocosair-verification](../cocosair-verification/SKILL.md) - which gates consume these build artifacts and how artifact drift is judged.

## When to use what

- "Install from npm in a bundler app" -> `cocosair.js` package exports table in `references/entries.md`.
- "Static page, no bundler" -> importmap and skeleton rules in `references/html-shell.md`.
- "Custom canvas id, or configuration must land before the engine evaluates" -> `cocosair.js/bootstrap` (alternative entry, never additive).
- "Paint live HTML into a `Texture2D`" -> `cocosair.js/html-source` (engine-free experimental entry) + cocosair-graphics-and-dom.
- "Editor types fail on TypeScript < 5.0" -> `types@<5.0` / `typesVersions` conditions in `references/entries.md`.
- "Trim or extend what ships" -> `AIR_FEATURES` variant semantics in `references/feature-flags.md`; a variant is a different candidate, not the default one.
- "Which command wrote this file under build/?" -> artifact ownership table in `references/entries.md`.

## Contracts

- Package name is `cocosair.js` (root `package.json` `name`), version `1.0.0`; toolchain requires Node `>=18.0.0`; browsers require WebGL 2 - failure rejects `createAirApp()` with `WEBGL2_REQUIRED`.
- Runtime is ESM only: no UMD/CJS build, no default export. The repo root `package.json` is `type: commonjs` for the toolchain; runtime files under `build/` are ESM because `build/package.json` says `type: module`.
- The three exports entries are the whole surface: `.` (full engine + AIR aggregate), `./bootstrap` (only `createAirApp` + `AirApp`/`AirAppOptions` types), `./html-source` (only the four HTML-source symbols). Never import anything else from the package.
- `.` and `./bootstrap` are either-or per page (`build/README.md`: alternative entry, not an extra dependency); `bootstrap.js` itself dynamically imports `./cocosair.module.js`.
- `#GameCanvas` (that exact id) must exist before the main entry is evaluated; `createAirApp` then backfills the official template structure `#GameDiv` > `#Cocos3dGameContainer` > `#GameCanvas` via `ensureCanvasDOM`, but only for a canvas that has no parent element yet.
- Top-level `await` requires `<script type="module">`.
- Version literals differ: `AIR_VERSION` is `"1.0.0"` (SDK), `VERSION` is `"4.0.0"` (engine baseline). Do not mix them.
- The default candidate is built from 26 feature units declared in `src/cc.config.json`. Feature-set membership is not reachability: `custom-pipeline-post-process` is in the default list yet post-process sits at decision-packet row 6 (D11/LV12-17, `docs/reference/owner-decisions.md:42`), approved as recommendation (b) in the r46 approval record (`docs/reference/owner-decisions.md:108-121`): variant-build-level evidence only. State layers separately: source export / default-bundle reachable / browser-verified.
- Never hand-edit `build/` - regenerate: `build` -> `build:min` -> `build:dts`, or `build:all`. `npm run prepack` (run by `npm pack`) copies source-map-free runtime files to `build/npm/`, which is what `exports` targets.

## Common Mistakes

### [HIGH] Importing 'cocosair' from the installed package

Wrong:

```ts
import { Scene } from 'cocosair'; // fails to resolve in a bundler app
```

Correct:

```ts
import { Scene } from 'cocosair.js';
```

Every repo page and manual example uses an importmap alias named `cocosair` pointing at `/build/cocosair.module.js` (`examples/starter/index.html`), so code copied from them keeps the alias; the package name declared in root `package.json:2` is `cocosair.js` with the `.js` suffix, and no alias exists outside this repo. Resolution fails before any app code runs.

### [HIGH] Taking the package surface from src/index.ts

Wrong:

```ts
// After reading src/index.ts (8 re-exports, no ui/spine/physics lines), conclude they are unavailable
// and hand-roll a parallel UI layer or import the source file directly.
import { createAirApp } from 'cocosair/src/index';
```

Correct:

```ts
// The shipped surface is src/exports/air.ts (the `air` bundle unit): it re-exports './ui', './spine',
// './physics-framework', './physics-builtin', './physics-cannon' and more. Verify against the
// declaration file, not the source aggregate:
import { Button, RigidBody, Skeleton, createAirApp } from 'cocosair.js';
```

`src/index.ts` is a narrower source-form entry whose own header comment claims parity with the build entry - that comment is not true on disk today. Agents trust in-code doc comments, then under-report the package surface or resolve a path the package never exposed. Declaration presence is the export layer only: `Skeleton` is the core 3D skeletal asset class (`build/cocosair.module.d.ts:4247`), while Spine playback stays runtime-asset-gated (`docs/reference/web-features.md:13`, `docs/notes/spine-asset-sourcing.md`) - a symbol resolving from `cocosair.js` does not mean spine works out of the box.

### [MEDIUM] Using ./bootstrap as an addition to the main entry

Wrong:

```ts
import { Scene } from 'cocosair.js';                    // evaluates the engine now
import { createAirApp } from 'cocosair.js/bootstrap';   // too late: canvas prep already lost
```

Correct:

```ts
import { createAirApp } from 'cocosair.js/bootstrap';
const app = await createAirApp({ canvas: '#GameCanvas' });
const cc = await import('cocosair.js'); // engine loads after bootstrap prepared it
```

Bootstrap's only advantage is deferring the engine module until options are admitted and the canvas is bound (`src/air/safe-bootstrap.ts` sets `__CC_CANVAS__` before `import('../index')`); a static main import evaluates the engine at module time anyway, so the ordering trap returns while the page looks like it opted out of it.

### [MEDIUM] Treating a variant build as the default candidate

Wrong:

```bash
AIR_FEATURES=air,base,ui npm run build   # no AIR_OUT_DIR: variant bytes overwrite build/cocosair.module.js
```

Correct:

```bash
AIR_FEATURES=air,base,ui AIR_OUT_DIR=/tmp/air-variant npm run build   # default build/ untouched
```

`tools/build/build.cjs` only redirects output when `AIR_OUT_DIR` is set; an `AIR_FEATURES`-only run writes the variant into the tracked default bundle while skipping the default-only side effects (incremental cache, `build/package.json` module markers), so later gates correctly report drift against a bundle that is no longer the default candidate.

## References

- `references/entries.md` - exports map, per-entry symbol surfaces, artifact ownership.
- `references/feature-flags.md` - default 26 units, the 7 unselected declared units, AIR_FEATURES/AIR_OUT_DIR semantics.
- `references/html-shell.md` - page skeleton, importmap shape, GameCanvas ordering, dev server facts.

## Canonical docs

`docs/manual/installation.md`, `build/README.md`, `docs/reference/web-features.md`, `docs/manual/typescript-dom-compatibility.md`.
