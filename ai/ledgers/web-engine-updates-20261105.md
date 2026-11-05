# Web engine update implementation ledger — 2026-11-05

Baseline: `main@e640be140fad8763e18865877acd896b60e9f44a`. This is an implementation and verification record, not a release or full browser certification. The 2026-10-28 report was read in full. The 2026-11-04 conversation report was read in full, but its linked Markdown attachment was not available for independent byte comparison.

## Implemented, subject to verification below

- WebGL2: use byte-correct BufferSource subviews and bounded updates; preserve iOS partial allocations; bind and cache UBO ranges including zero-offset views, and invalidate indexed bindings on buffer destruction.
- HTML-in-Canvas: roll back acquired leases, properties, snapshots and listeners if initial setup fails. This does not claim compatibility with any specific Chrome build.
- Spark: release asynchronous readback staging resources and restore GL state on failures; retire geometry resources associated with replaced programs.
- Pipeline state cache: retain the ordered graphics and compute key components instead of combining them with XOR, which can deterministically collide and return a different tuple's pipeline. This does not prove all camera or material state isolation on a GPU.
- glTF KTX2: recognize the Khronos KTX2 identifier and read the DFD transfer function rather than alpha flags for sRGB; allow failed transcoder initialization to be retried and ensure file deletion even when close fails. Preserve ownership of shared modules and source buffers. CPU tests also exercise a small synthetic UASTC fixture through the pinned Basis WASM; this is not real-device GPU coverage.
- WebGL timer evidence: bind query samples to submission phase/frame and discard pending queries on disjoint; unavailable or unresolved results remain unavailable.
- Benchmark preparation: require the actual installed Three.js baseline version and bind each arm to a verified copy of the same local package tree. This does not authenticate the registry archive or alter historical Goldens.

## Verification boundaries

Focused CPU tests use synthetic inputs or mocked GL against actual source. A separate WebKit 26.5 WebGL2 check executed AST-selected current buffer functions with native GL calls: four candidate cases passed, while all four failed on the unmodified baseline. It covered typed-array upload/readback, UBO ranges and a draw/readPixels check; it is not a full-engine build, physical-hardware claim or cross-browser certification. A separate Chromium attempt failed before creating a WebGL context. Firefox 153 was installed through the official Playwright installer, but failed to create a usable headless context in this environment; changing only its writable cache did not resolve the SWGL framebuffer error. Neither failed attempt is a browser PASS. Run the newly registered CPU tests through normal CI when dependencies are available. The local dependency installation did not complete; full Jest, runtime build and full TypeScript checking were not established. Do not reuse old output as proof for this revision.

## Still open

- Real WebGL2/WebGPU cross-backend Buffer/UBO/VAO rendering; Chrome 156/157 HTML-in-Canvas compatibility, input, DPR and disposal.
- Spark repeated real-asset loading, shader rebuild and GPU memory observations, static/moving camera sorting comparisons, and GPU readback coverage.
- WebGPU device-loss and asynchronous initialization/shader-readiness lifecycle matrix; timestamp-query and frame-submission attribution on real devices; do not replace the documented controlled-reload contract with unverified transparent recovery.
- glTF KTX2 codec/browser coverage with real assets, cancellation and color-space checks; GPU RenderTarget A→B→A state, nonzero texture-copy offsets and material/camera isolation.
- Separate three.js r186/r187 PBR and viewport/scissor reference captures, preserving old Goldens; real paired Agent evaluation is not established by preparation checks.
- Safari WebGPU MSAA and frame-queue latency, material texture ownership, and optional research into Meshlets, NanoVDB, SPZ and Spine backends remain separately scoped. No new default format or backend is claimed.
