# Standalone canonical math

Import CPU-only math from `cocosair.js/math` (or `cocosair/math` when the npm package is installed under that alias):

```ts
import { Vec3, Quat, Mat4 } from 'cocosair.js/math';
const transform = Mat4.fromRTS(new Mat4(), new Quat(), new Vec3(1, 2, 3), new Vec3(1, 1, 1));
```

The entry exports complete canonical Vec2/3/4, Mat3/4, Quat, Color, Size and Rect classes and math utilities. It does not initialize a renderer, select a canvas, read window/document or install a global Cocos namespace. The normal engine remains browser-only. After importing math, choose the canvas and DPR with the normal `createAirApp` entry.

This is a separate module instance, with separate constructors, private legacy metadata and random-generator state. Do not rely on `instanceof` across the two entries or assume `setRandGenerator` affects the other entry. Pass structural numbers/vectors or construct the engine's own value types at an engine API boundary.

`tools/build/math-module.cjs` builds from the repository's canonical source files. It preserves their algorithms, registrations and copyright notices, and isolates only the legacy namespace's `_global` and `ccwindow` bindings. The adaptation fails closed if those source declarations change. TypeScript lowers static fields before bundling to preserve initialization order. `build/math-build.json` records every original input hash, flags, exports and output hashes. No math source snapshot is maintained separately.

`npm run build:all` and `npm pack` prepare the math entry through the existing package preparer. Packaging writes JS and type files but does not increment the main runtime build counter. Types reuse the matching main declarations, with legacy routing for TypeScript 4.9 and classic Node resolution. Generated math JS has no source map; main runtime maps are unchanged.

Focused checks:

- `node --test tools/verify/math-entry.test.cjs`: Node, real Node Worker, DOM-hostile VM, independent-source reproducibility and subpath runtime resolution.
- `node tools/verify/math-tarball.cjs --out=output/math-tarball-NEW`: fresh real tarball, offline installed consumer, TypeScript classic Node/NodeNext resolution and main-map canonical source identity. Requires a full current build first.
- `node tools/verify/sdk-recipes-browser.cjs`: real browser math-first bootstrap and numeric comparison with the freshly built main entry, plus the small recipes.

A source-only test, a cross-candidate diagnostic or an old main bundle is not same-commit acceptance. The dedicated SDK recipes CI retains the exact head, artifacts and raw test results. These focused tests do not certify physical devices or the full example gallery.
