Derived from docs/manual/installation.md, examples/starter/index.html, examples/starter/src/main.ts, AGENTS.md, docs/reference/web-features.md (as of 2026-10-07).

## Page skeleton contract

Main is browser-only, but import may happen before canvas creation. Call createAirApp with the selected canvas and optional pixelRatioCap; globals do not need to be assigned manually. Bootstrap preserves deferred loading, and html-source preserves the engine-free HTML capability surface.

At startup, native GameDiv/Cocos3dGameContainer wrappers are completed around the selected canvas. Existing wrappers must belong to that canvas. Use explicit screenMode/container for embedded layouts. A detached canvas keeps the full-window template behavior. Module scripts require type="module"; rendering requires WebGL 2. See docs/manual/safe-startup-and-release.md.

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

| Fact                | Value                                                                                                                                     | Source                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| From-source setup   | `npm install` then `npm run build` (bundle + maps; declarations need `npm run build:dts`)                                                 | `docs/manual/installation.md:12,26-29`                                      |
| Dev server          | `npm run dev` serves `http://127.0.0.1:7454/`, mounts `/build/*` at the web root, rebuilds the bundle on AIR source changes               | `docs/manual/installation.md:63`, `AGENTS.md` dev section                   |
| Editor types        | `compilerOptions.paths` alias to `./build/cocosair.module.d.ts` for autocomplete                                                          | `docs/manual/installation.md:334-341`                                       |
| Version overlay     | `VERSION` is the engine baseline `4.0.0`; `AIR_VERSION` and the package version are `1.0.0` - two different numbers                       | `docs/manual/installation.md:219`, `build/cocosair.module.d.ts:17578,55796` |
| Runtime facts query | Backend identity via `director.root.device.constructor.name` (`WebGL2Device`), capabilities via `device.capabilities` - not `device.caps` | `docs/manual/installation.md:220-221`                                       |
