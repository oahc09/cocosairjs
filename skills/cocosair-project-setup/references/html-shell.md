Derived from docs/manual/installation.md, examples/starter/index.html, examples/starter/src/main.ts, AGENTS.md, docs/reference/web-features.md (as of 2026-10-07).

## Page skeleton contract

| Rule | Detail | Source |
| --- | --- | --- |
| Canvas before engine | `#GameCanvas` must exist in the DOM before the main entry is evaluated; the screen adapter is a module-level singleton that looks up the canvas at import time. Import-first pages render nothing without throwing. | `docs/manual/installation.md:122,134`, `examples/starter/src/main.ts:9-10` |
| Canvas id | Main entry: the id is exactly `GameCanvas` (module-time screen-adapter lookup; matches the official Web template), and `createAirApp` accepts `canvas: '#GameCanvas'` or an `HTMLCanvasElement`. Custom canvas id: bind it through `cocosair.js/bootstrap` instead - it resolves `options.canvas` via `document.querySelector`, sets `__CC_CANVAS__`, and only then dynamically imports the engine, which is the entry's stated purpose for custom canvases (`build/README.md:13,26`). | `examples/starter/src/main.ts:9-10,16`, `examples/starter/index.html:27`, `src/air/safe-bootstrap.ts:11-15`, `src/air/app-config.ts:52-57`, `build/README.md:13,26` |
| Template structure | Official Web template DOM: `#GameDiv` > `#Cocos3dGameContainer` > `#GameCanvas`; `pal/screen-adapter` relies on these ids for full-screen adaptation. | `docs/manual/installation.md:119-125,135` |
| Auto-backfill | `createAirApp` calls `ensureCanvasDOM`: the `#GameDiv` > `#Cocos3dGameContainer` wrapper and its full-screen stylesheet are injected only when the canvas has no parent element at all (`src/air/bootstrap.ts:58-76`); a canvas that already has a parent is left untouched and no stylesheet is added. A mis-nested canvas is therefore not re-nested for you, and adaptive behavior may differ from your expectations. | `docs/manual/installation.md:135`, `src/air/bootstrap.ts:40,58-76,131` |
| Module script | Top-level `await` requires `<script type="module">`. | `docs/manual/installation.md:172` |
| WebGL 2 | Browsers need WebGL 2 and nothing else; a missing/failed context rejects `createAirApp()` with error code `WEBGL2_REQUIRED` - no WebGL 1 or WebGPU fallback, HEADLESS produces no pixels. | `docs/reference/web-features.md:7`, `src/cocos/gfx/device-manager.ts:184` |

## importmap shape (what the repo itself serves)

```html
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
```

- Bare specifier `cocosair` is a page-local alias, not the npm package name (`cocosair.js`); alias names in applications may differ (`docs/manual/installation.md:13,22`, `examples/starter/index.html:22-24`).
- The alias resolves to the built bundle; with a bundler, configure `cocosair` (or any alias) as a path alias to `build/cocosair.module.js` and drop the importmap (`docs/manual/installation.md:65`), or import the package name `cocosair.js` directly (`docs/manual/installation.md:19-20`).
- The engine ships named exports only - no default export (`docs/manual/installation.md:14`); importmap must be declared before the module scripts that rely on it (`examples/starter/index.html:22-28`: importmap in `<head>`, canvas + module script in `<body>`).

## Minimal page order (checked against examples/starter sources)

```html
<body>
  <canvas id="GameCanvas"></canvas>
  <!-- importmap already in <head> -->
  <script type="module">
    import { createAirApp, Scene } from 'cocosair';
    const app = await createAirApp({ canvas: '#GameCanvas' });
    app.run(new Scene('Main'));
  </script>
</body>
```

Source: `examples/starter/index.html:26-29`, `examples/starter/src/main.ts:13,15-16,21`. `createAirApp` is async and the renderer is hosted by the app (`docs/manual/installation.md:15`). A scene with no `Camera` renders nothing even after startup (`examples/starter/src/main.ts:23`).

## Repository dev facts

| Fact | Value | Source |
| --- | --- | --- |
| From-source setup | `npm install` then `npm run build` (bundle + maps; declarations need `npm run build:dts`) | `docs/manual/installation.md:12,26-29` |
| Dev server | `npm run dev` serves `http://127.0.0.1:7454/`, mounts `/build/*` at the web root, rebuilds the bundle on AIR source changes | `docs/manual/installation.md:63`, `AGENTS.md` dev section |
| Editor types | `compilerOptions.paths` alias to `./build/cocosair.module.d.ts` for autocomplete | `docs/manual/installation.md:334-341` |
| Version overlay | `VERSION` is the engine baseline `4.0.0`; `AIR_VERSION` and the package version are `1.0.0` - two different numbers | `docs/manual/installation.md:219`, `build/cocosair.module.d.ts:17578,55796` |
| Runtime facts query | Backend identity via `director.root.device.constructor.name` (`WebGL2Device`), capabilities via `device.capabilities` - not `device.caps` | `docs/manual/installation.md:220-221` |
