# EX01 actual native-COM dragging fixture

Runs the actual EX01 spring-drag controller with genuine Cocos components, the owned Game clock, and full-qualified source70-e Release WASM. JSDOM supplies synthetic pointer events and canvas sizing only; the Camera ray, PhysicsSystem query, COM/velocities, force queue and solver are real. No render/compositor proof follows.

Source must be committed, then frozen with `node tools/verify/box3d/drag-public-real-wasm/freeze-source.mjs <commit>`. Run `node tools/verify/box3d/drag-public-real-wasm/run.mjs <qualified-artifact-directory> <new-output-directory> Release`. Never overwrite source-lock or an attempt. Source/raw captures and stdout/stderr are retained even on failure.

This is a finite product fixture, not 2128 cells or any formal Gate. Original source71/72 failures remain unchanged in their separate archives.
