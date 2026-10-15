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

### [MEDIUM] Expecting deferred loading while statically importing main

A static import evaluates the browser runtime immediately. When deferred loading is useful, use only an application-owned dynamic import:

```ts
const cc = await import('cocosair.js');
const app = await cc.createAirApp({ canvas: '#GameCanvas' });
```

The package exposes only its main entry. Importing main before canvas creation is supported; importing the full engine without browser DOM is not.
