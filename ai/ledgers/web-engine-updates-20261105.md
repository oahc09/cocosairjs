# Web engine update implementation ledger — 2026-11-05

Baseline: `main@e640be140fad8763e18865877acd896b60e9f44a`. This is an implementation and verification record, not a release or full browser certification. The 2026-10-28 report was read in full. The 2026-11-04 conversation report was read in full, but its linked Markdown attachment was not available for independent byte comparison.

## Implemented, subject to verification below

- WebGL2: use byte-correct BufferSource subviews and bounded updates; preserve iOS partial allocations; bind and cache UBO ranges including zero-offset views, and invalidate indexed bindings on buffer destruction.
- HTML-in-Canvas: roll back acquired leases, properties, snapshots and listeners if initial setup fails. This does not claim compatibility with any specific Chrome build.
- Spark: release asynchronous readback staging resources and restore GL state on failures; retire geometry resources associated with replaced programs.
- glTF KTX2: recognize the Khronos KTX2 identifier and read the DFD transfer function rather than alpha flags for sRGB; allow failed transcoder initialization to be retried and ensure file deletion even when close fails. Preserve ownership of shared modules and source buffers. CPU tests also exercise a small synthetic UASTC fixture through the pinned Basis WASM; this is not real-device GPU coverage.
- WebGL timer evidence: bind query samples to submission phase/frame and discard pending queries on disjoint; unavailable or unresolved results remain unavailable.
- Benchmark preparation: require the actual installed Three.js baseline version and bind each arm to a verified copy of the same local package tree. This does not authenticate the registry archive or alter historical Goldens.

## Verification boundaries

Focused tests use synthetic inputs or mocked GL against actual source; they are not real-GPU evidence. Run the newly registered CPU tests through the normal CI when its dependencies are available. The local dependency installation did not complete; full Jest, runtime build, full TypeScript checking, and current-source browser/GPU acceptance were not established. Browser attempts failed before creation of a WebGL context. Do not reuse old output as proof for this revision.

## Still open

- Real WebGL2/WebGPU cross-backend Buffer/UBO/VAO rendering; Chrome 156/157 HTML-in-Canvas compatibility, input, DPR and disposal.
- Spark repeated real-asset loading, shader rebuild and GPU memory observations, static/moving camera sorting comparisons, and GPU readback coverage.
- WebGPU device-loss and asynchronous initialization/shader-readiness lifecycle matrix; timestamp-query and frame-submission attribution on real devices; do not replace the documented controlled-reload contract with unverified transparent recovery.
- glTF KTX2 codec/browser coverage with real assets, cancellation and color-space checks; RenderTarget A→B→A state, nonzero texture-copy offsets and material/camera isolation.
- Separate three.js r186/r187 PBR and viewport/scissor reference captures, preserving old Goldens; real paired Agent evaluation is not established by preparation checks.
- Safari WebGPU MSAA and frame-queue latency, material texture ownership, and optional research into Meshlets, NanoVDB, SPZ and Spine backends remain separately scoped. No new default format or backend is claimed.
