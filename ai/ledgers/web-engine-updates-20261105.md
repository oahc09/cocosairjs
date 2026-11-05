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
- Interactive baseline evidence: verify external source-map binding receipts instead of assuming embedded `sourcesContent`; retain legacy embedded-map support and fail closed on missing or stale evidence.
- Example evidence preflight: verify external dev/min source-binding receipts, include their presence and hashes in the frozen campaign input, and retain Spark's original embedded virtual-worker checks. This does not publish or promote a campaign.

## Verification boundaries

Focused CPU tests use synthetic inputs or mocked GL against actual source. A separate WebKit 26.5 WebGL2 check executed AST-selected current buffer functions with native GL calls: four candidate cases passed, while all four failed on the unmodified baseline. It covered typed-array upload/readback, UBO ranges and a draw/readPixels check; it is not a full-engine build, physical-hardware claim or cross-browser certification. A separate Chromium attempt failed before creating a WebGL context. Firefox 153 was installed through the official Playwright installer, but failed to create a usable headless context in this environment; changing only its writable cache did not resolve the SWGL framebuffer error. Neither failed attempt is a browser PASS.

After moving the npm cache to a writable temporary directory, `npm ci --ignore-scripts` completed against the lockfile. Full project `npm run typecheck` passed, and the four targeted Jest suites passed 68 tests. A default-feature development bundle built successfully into a separate temporary output with a 4096 MiB Node heap; SHA-256 `265d3624b8e01eeabff6373e93140161ea74aa9e425a91e9fdd1ee8792662191`. The first attempt exhausted the default heap; this failure was retained and not counted as success. The newly built bundle also passed the existing WGL-01 through WGL-09 public-gfx state/pixel/readback/validation suite in WebKit only, with no page errors. That directed suite is not full engine, compositor or release acceptance. Full Jest, release-readiness gates and broader browser/GPU acceptance remain unverified. Do not reuse old output as proof for this revision.

A separate worktree at the same source snapshot completed `npm run build:all`, including development/minified bundles, declarations and published-artifact checks. In that worktree, two suites that failed against missing packaged artifacts passed 35 tests after packaging. With the baseline verifier fix applied, its dedicated suite passed 49 tests. The first full Jest attempt was interrupted after the verifier changed during execution; its mixed-snapshot results do not count as a full run. The original failures are retained in the local log. The separately attempted `npm run build:spark` was blocked by the existing Spark WASM transitive-license distribution gate. The checked-in license materials and lock hashes exist, but a build provenance record binding the shipped WASM to the selected dependencies/features and an authorization review record are missing. Old Spark bytes do not verify the changed renderer; do not infer that a new commercial license is required or bypass the gate.

## Still open

- Real WebGL2/WebGPU cross-backend Buffer/UBO/VAO rendering; Chrome 156/157 HTML-in-Canvas compatibility, input, DPR and disposal.
- Spark repeated real-asset loading, shader rebuild and GPU memory observations, static/moving camera sorting comparisons, and GPU readback coverage.
- WebGPU device-loss and asynchronous initialization/shader-readiness lifecycle matrix; timestamp-query and frame-submission attribution on real devices; do not replace the documented controlled-reload contract with unverified transparent recovery.
- glTF KTX2 codec/browser coverage with real assets, cancellation and color-space checks; GPU RenderTarget A→B→A state, nonzero texture-copy offsets and material/camera isolation.
- Separate three.js r186/r187 PBR and viewport/scissor reference captures, preserving old Goldens; real paired Agent evaluation is not established by preparation checks.
- Safari WebGPU MSAA and frame-queue latency, material texture ownership, and optional research into Meshlets, NanoVDB, SPZ and Spine backends remain separately scoped. No new default format or backend is claimed.
