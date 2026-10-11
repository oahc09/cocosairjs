Derived from the cocosair-project-setup skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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
