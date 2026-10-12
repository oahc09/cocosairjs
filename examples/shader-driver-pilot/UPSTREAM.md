# Effect Driver Pilot reference record

- upstream_repo: https://github.com/shader-effects-inc/shaders
- upstream_commit: dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a
- upstream_file: shaders/Holographic/index.ts; shaders/Neon/index.ts; their pinned helper references recorded by the two mother examples
- license: MIT and the applicable MaterialX/OSL notices in `LICENSE.reference.txt`
- algorithm_ideas_adopted: declarative pointer, accumulated time, periodic animation and range mapping drive existing Cocos AIR consumers
- implementation_differences: this is a local Driver design. It does not claim algorithm equivalence with upstream PropDriver. The complete frozen E03/E04 fragment shaders and defaults are reused; both GLSL vertex variants use native `cc_matViewProj * cc_matWorld` so a node position actually moves the effect. No upstream runtime, TypeGPU or extra rendering canvas is used.
- cocosairjs_apis_used: createAirApp, createStepClock, Scene, Node, Camera, Component, MeshRenderer, EffectAsset, Material.initialize, Material.setProperty/getProperty, utils.createMesh, createAirRenderTarget

The collector fingerprints both maternal `effect.generated.ts`, `parameters.json`, `UPSTREAM.md` and CPU oracles, plus all local Driver source and the SDK bytes. Maternal fragments are not simplified. CSS pointer coordinates are normalized using the recorded canvas rect with v-up coordinates; the local position consumer maps UV to a world offset of ±0.05. Scalar consumers explicitly saturate to their maternal parameter ranges; the raw Driver output remains available for independent replay.

Linear probes use the same AIR canvas and a temporary native material/RT. Their receipts are assembled after cleanup. Performance uses native Component updates and discloses all method and GL wrappers; CPU wall envelopes are not called GPU time. Agent and independent Gallery acceptance remain NOT_RUN.
