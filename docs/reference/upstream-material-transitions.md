# Native material mutation and transmission restoration pairs

This is prepared, **not-run browser verification** for U02/T09 and U04/T16. It supplements, rather than replaces, the CPU contracts, ordinary render-target fixture, full three-browser matrix and real-device requirements.

Run each supported browser explicitly with a fresh output directory:

```bash
node tools/verify/upstream-material-transitions.cjs --browser=chromium --out=output/new-material-transition-attempt
```

The fixture uses native material instances, the real glTF material builder, a fixed RGBA8 96 × 96 single-sample target, the original local checker and crystal assets, fixed light/camera parameters and controlled zero-time native frames. It does not modify the default tone mapper or runtime. There is no animation or physics in this fixture; zero-time stepping is not a general guarantee that application callbacks are side-effect free.

Ten paired cases cross constant versus R/G-textured iridescence with IOR 1, 1.2, 1.3, 2.33334 and 2.5. One path mutates native material properties, including independent affine UV rows; the other loads a newly authored final glTF material. Every full-target channel must agree within the frozen 2-byte RGBA8 tolerance, state must agree within 1e-5, and the mutation must visibly change the original image. No post-failure edge mask or threshold adjustment is permitted. Three additional semantic pairs compare a constant 1-pixel R/G data texture against independently calculated scalar values, verify missing thickness textures use the maximum regardless of minimum, and vary the separate volume-thickness uniform without changing the film. The fixed PNG has no gamma metadata; its linear channel values are 64/255 and 192/255, not sRGB-decoded values.

Transmission begins with explicitly installed checker/size bindings while capture is disabled. A striped backdrop makes a missing capture observable. Enabling, disabling, re-enabling, destroying and recreating the single capture must restore either the original disabled image or the original active image, respectively, plus exact texture/layer/visibility bindings. The second-capture negative directly invokes the native onEnable rejection boundary on an inactive component; it does not claim a second capture renders successfully.

The collector retains raw pixel arrays, every pair's display PNG, a separate compositor screenshot, HTTP response hashes, SDK/fixture/tool hashes, page errors and actual browser process close. PNGs derived from readPixels are labelled framebuffer observations, not compositor proof. Every output is a new attempt; it never writes canonical evidence or promotes examples. Missing browsers are INFRA_BLOCKED, while rendering, equivalence, resource or cleanup failures remain FAIL. No real browser result is currently available for this candidate.
