# glTF Animation Instances

`npm run dev -- --example gltf-animation-contract` loads the already-vendored official Fox model; `?model=morph` selects AnimatedMorphCube. Local copies and their original source/license records reside under this example's `assets/`, so an isolated consumer workspace does not depend on a sibling Gallery folder.

Two native instances share geometry, clips, textures and default material resources. The left instance opts into looping with `setAnimationLoop(true)` and uses `renderer.getMaterialInstance(0)` for its blue tint. The right retains Normal and reports its completion event. Pause/resume affect only the left; selecting a clip switches both native Animation components. No parallel player or frame clock runs.

The source container is fetched once and retained as raw GLB bytes. `window.__lifecycle()` resumes the native clock if a deterministic probe paused it, disposes both instances, explicitly releases the example-owned material variant and all parsed native assets, then reparses those bytes and rebuilds. It does not preserve a supposedly destroyed parsed asset or trigger a second model request. The retained bytes are CPU input data; shader program caches remain engine-owned.

`window.__gltfAnimationProbe()` reports native states, local node pose arrays, Morph weight, resource sharing, completion count and camera default visibility. `window.__gltfAnimationStep(seconds, restart)` pauses real rAF through `createStepClock.begin()` and steps the native game once; deterministic probes must use this entry rather than combining manual time with real rAF. It is an example inspection endpoint rather than a runtime playback API.

The focused browser regression uses the existing bundle and a read-only temporary example server:

```bash
node tools/verify/competitive-animation-browser.cjs --engine=all --screenshots=output/playwright/competitive-animation
```

Run from the repository root with Playwright and its matching browser binaries available. The verifier covers both local models, native completion/looping, pause/resume, Fox clip switching, pose/Morph differences, shared resources, private material variants and rendered canvas changes. It binds the bundle SHA-256 and rejects a concurrent rebuild; it never builds or writes canonical evidence. Screenshots are optional.
