# Box2D 3.2.0

`source/` is an unmodified subset of https://github.com/erincatto/box2d at commit
`178495ba35695aefe9c321e569d2277f06db3b90` (`v3.2.0`). Headers, implementation,
official samples, shared helpers, API descriptions and unit-test sources retain original bytes.
`manifest.json` records each retained file and every official sample registration.

`imgui/` (`v1.92.7`) and `implot/` (`v0.17`) are unmodified upstream source subsets needed
only to compile the official samples. Each directory includes its original MIT license.
They are not linked into the runtime backend or included in the npm runtime assets.

`runtime/` contains the optional single-thread, float, scalar WASM backend built with
Emscripten 4.0.21. Its receipt binds bridge inputs, source manifest and distributed bytes.
The original Box2D MIT license accompanies all deployment copies.

Build: `node tools/build/box2d3.cjs --build` (requires CMake, Ninja and the pinned emsdk).
Set `BOX2D_EMSDK`, `NINJA` and optionally `BOX2D_BUILD_DIR` to override local tool locations.
The default local tool directory is ignored `output/box2d/toolchain/`.
`--check` is read-only; `--record` explicitly changes the frozen source inventory and requires
review plus a fresh build and acceptance. Main JS builds copy existing backend assets;
they do not install compilers or rebuild C/C++.

The browser sample host compiles every official sample unchanged, including `Sample::Step`.
Canvas replaces desktop OpenGL drawing; keyboard/pointer input is forwarded to the original
sample methods. The desktop file picker is unavailable; Replay Viewer receives a real recording
created through the upstream recording API. Default configurations and retained actions are the
acceptance scope; passing them does not certify every combination of desktop UI settings.
