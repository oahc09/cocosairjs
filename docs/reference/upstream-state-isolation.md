# Rendering state isolation

This U04 audit preserves native Cocos caching and the one-capture transmission limit. It does not introduce a second material/cache abstraction or claim browser acceptance from CPU mocks.

## Cache categories

- Shader-code macros are resolved by ProgramLib. `Pass.getPassHash()` includes the resulting program key, primitive, dynamic-state selection and serialized blend/depth/rasterizer state.
- `PipelineStateManager` combines the **pass** hash, compatible render-pass hash, input-assembler layout hash and shader typed ID. Render-target object identity is not a PSO key: compatible targets may share a PSO while binding different framebuffers.
- Uniform and texture values are uploaded/bound separately. Native material-instance `setProperty()` must not manufacture a new shader variant. `recompileShaders()` and `overridePipelineStates()` are instance operations, not mutable template operations.
- `Material.hash` is an XOR aggregate across passes, not a unique variant identifier. The unlit effect has repeated shader passes; aggregate cancellation is not evidence that its actual per-pass PSO key failed to change. The regression checks the actual key consumed by PipelineStateManager.
- Framebuffers, clear colors/depth, viewport/scissor and descriptors are per-render-operation state. Equal target dimensions/formats must not suppress a framebuffer identity change. Resize creates new native storage, rebinds attached cameras/materials and advances the target generation. Unchanged sizes do not need allocation. Callers supply actual pixel sizes after DPR changes.

## Executable checks

`test/smoke/upstream-state-isolation.test.ts` exercises real native material instances and PSO selection using EmptyDevice/recorded WebGL calls. It covers uniform/texture versus macro/state categories, both first-construction orders, equal-size A→B→A, distinct clear/depth values, write-mask restoration and 30 cycles of the single-capture ownership guard. `render-dx-target-options.test.ts` additionally covers two independent targets/cameras/material bindings, resize, same-size recreation and idempotent teardown. These are CPU contracts, not GPU output.

`node tools/verify/upstream-state-isolation.cjs --browser=chromium --out=<new directory>` is an explicit Chromium/Firefox/WebKit collector for the native fixture under `test/fixtures/upstream-state-isolation/`. It records fresh bundle/collector/fixture hashes, actual renderer/browser, DPR 1 and 2, source-over with explicit drawing priorities, non-overlapping separate/combined draws in both construction orders, equal-size native A→B→A, resize and target recreation, compositor PNGs and release/close. Ordinary alpha blending is order dependent; only the frozen source-over formula and each specified draw order are compared. Flat RGBA8 tolerance is 2 channel units, unchanged from M0. No invocation installs software or overwrites canonical evidence.

The current cloud execution path is `INFRA_BLOCKED` before a browser can load this fixture. The new collector is syntax-checked but its pixels are **NOT_RUN**, not PASS. It does not cover transmission output/binding restoration, real mobile GPUs or WebGPU. The transmission CPU guard is not a substitute for those remaining rendering checks. No runtime cache/state change was justified by the CPU results.
