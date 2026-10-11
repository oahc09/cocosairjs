Derived from the cocosair-project-setup skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

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
