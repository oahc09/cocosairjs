Derived from the cocosair-application skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
  import { createAirApp, Scene, ResolutionPolicy } from 'cocosair'; // page alias, not the package name
  const app = await createAirApp({
    canvas: '#GameCanvas', // HTMLCanvasElement | CSS selector string
    pixelRatioCap: 2, // effective DPR = min(devicePixelRatio, cap)
    designResolution: { width: 978, height: 846, policy: ResolutionPolicy.EXACT_FIT }, // 0..4
  });
  app.run(new Scene('Main'));
  app.getScene(); // Scene | null
  app.contextHealth.snapshot().state; // healthy | lost | restoring | failed
  const receipt = app.close ? await app.close() : null; // optional interface member; guard it in JS (no `!` in a module script)
  // once the registry-owning app closes, every createAirApp in this document rejects with AIR_E_APP_CLOSED
</script>
```

`createAirApp(options)` returns `Promise<AirApp>`; `run(scene)` returns void; the line-level declaration inventory lives in [app-options.md](app-options.md) (Public surface and evidence status). `releaseScene?()` and `close?()` are declared optional for older custom handles, so call them as `app.close!()` in strict TypeScript or guard them. For a custom canvas id, or options that must land before the engine module evaluates, use the `cocosair.js` entry: it writes `globalThis.__CC_CANVAS__` and `__CCDPR_CAP__` and only then dynamically imports the engine (`src/air/safe-bootstrap.ts:11-18`). Page shell, entry choice and importmap alias ownership - the `cocosair` alias above versus the `cocosair.js` package name used in code samples - belong to [cocosair-project-setup](../../cocosair-project-setup/SKILL.md).
