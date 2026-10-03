# Animated Character Showcase

E10 public brief 1.0.1 live example. Run `npm run dev -- --example animated-character-showcase`.

The local `assets/character.glb` is the already-vendored Khronos Fox asset, SHA-256 `d97044e701822bac5a62696459b27d7b375aada5de8574ed4362edbba94771f7`, identical to the public E10 asset contract. The adjacent license preserves the model's CC0 attribution and the rigging/animation/conversion CC BY 4.0 credits. Survey maps to canonical `idle`, Walk maps to `walk`; both are real GLB bone animations. There is no geometry impersonating a character or synthetic playback clock.

The model loads once. Both instances share static assets and have independent native states; `setAnimationLoop(true)` configures their instance policies. The application holds one resource reference through resets. Destroy removes A from the scene graph and disposes its native instance; reset disposes both then reinstantiates from the retained asset without another request. Shared resources survive until the final application disposal.

The separate `window.__lifecycle()` acceptance path destroys both instances and every parsed asset, including clips, textures and decoded images. It then reparses the explicitly cached raw GLB container bytes and restores two instances without a new network request. This full-resource path is distinct from ordinary UI reset, which deliberately retains the valid shared parsed asset. Raw source bytes remain application-owned CPU input, not a live GPU asset disguised as released data.

`window.__appReady`, `window.__bench.getState()/reset()` and `data-ui`/`data-bench` controls implement the public E10 contract. Clip/time fields read actual native states. The `fps` field measures recent Component frame-callback intervals; it is not a GPU headroom or display-present metric. The optional `__characterProbe` reports actual skin joint counts, shared mesh identity and scene attachment for independent checks.

Focused public-brief acceptance uses the current bundle without rebuilding:

```bash
node tools/verify/competitive-character-browser.cjs --engine=chromium --channel=chrome --soak=120 --screenshots=output/playwright/competitive-character
```

Run from the repository root with Playwright resolvable and the selected browser installed. The public benchmark uses system Chrome with hardware WebGL2; a software headless-shell renderer is a different performance environment and can fail the 30fps gate. The verifier records the actual renderer, tests both directions of clip isolation, checks one successful asset request through reset, compares character regions with the HUD hidden, and reads native skin poses.

The soak keeps checking asset references and uncaught errors. Chromium additionally measures retained JS heap after forced GC at the start and every 30 seconds. The declared warm-run tolerance is the greater of 3% and 256KiB; reported heap samples are observations rather than a claim of zero allocation or proof that every possible leak is absent. The bundle fingerprint must remain unchanged throughout the run. Reports go to stdout; only optional screenshots are written.
