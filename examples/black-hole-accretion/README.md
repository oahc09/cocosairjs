# Black Hole Accretion

E05 public brief 1.0.0 live example, implemented with native `Mesh`, `Material`, `EffectAsset` and one `Component.update(dt)` clock. Run `npm run dev -- --example black-hole-accretion`.

All imagery is procedural: a black sphere provides the event-horizon depth mask, analytic polar GLSL shades the tilted disk, 256 real `POINT_LIST` vertices follow spiral trajectories, and 2200 real point vertices form the static background. Native wheel input controls an exponentially smoothed camera distance in [5,28]. The same elapsed seconds determine the visible shader stripes, particle phase and reported rotation; reset returns distance to 14 and resets that shared clock.

The glow is **bloom-impostor**: a second native quad adds analytic Gaussian bands around the disk through additive blending. It does not sample a framebuffer, blur rendered highlights, implement FXAA, or introduce a post-processing pipeline. It approximates the visual falloff of this particular procedural disk; unrelated bright objects do not acquire automatic bloom. A future owner-approved pipeline may provide screen-space bloom without changing this example's current claim.

Shader declarations and GLSL source remain under this example. Generate the runtime code module through the shared effect JSON generator:

```bash
node tools/build/black-hole-effects.mjs
node tools/build/black-hole-effects.mjs --check
```

The generator uses temporary JSON outputs and emits only `src/effects.generated.ts` as a formatted runtime module. The normal example build includes it as code, avoiding image/video or shader-JSON requests. GLSL/geometry/math are original MIT repository content; no external visual assets are used.

The focused GPU acceptance requires the current SDK bundle, Playwright, pngjs and a matching browser:

```bash
node tools/verify/competitive-black-hole-browser.cjs --engine=chromium --channel=chrome --screenshots=output/playwright/competitive-black-hole
```

It checks public P1–P6 through state plus independent PNG observations: center/corner density with DOM hidden, dark core, continuous pixel motion, ray/plane ring color samples, smooth physical zoom and reset. It also checks default-view native frame-callback rate >=30 and full release/rebuild of nodes, meshes, materials and effect assets via `window.__lifecycle()`. Frame callbacks, GPU rendering and display-present timing are distinct measurements; the tool does not claim a GPU headroom result. Reports bind the SDK bundle SHA-256 and fail if a concurrent build replaces it.
