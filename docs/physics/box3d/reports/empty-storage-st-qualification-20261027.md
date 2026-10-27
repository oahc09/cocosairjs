# Empty-storage production ST qualification — 2026-10-27

## Result: VERIFIED_LIMITED_ST_STORAGE

Producer `fb825da65c8cd259ee8912adb24b7caaa0a64b6a`; ABI schema `f5df4fae8476651b11ae3a952cb418ee987767ae1cfad0f5bb3c8f8e071bae28`; five-patch chain `fce7869b3888ff9bfd417095e70ce72591893b2c3add1802e1a5bc32ca918bfe`.

A fresh ST SIMD WASM build, artifact audit and **complete existing consumer gate** passed. Exact inventories are **41 commands / 111 producer inputs / 85 compilation units / 58 evidence items**, with all41 commands exit0. Four runtime assets and the build/audit/manifest/consumer-ready receipt hashes were verified. Readiness remains `READY_FOR_LIMITED_CONSUMER_VERIFICATION`, not overall acceptance.

## Three attempts retained

1. Producer3359d45: **FAIL_OR_PARTIAL**. CMake configuration still called the old v1 source gate and rejected the new patch chain. No new WASM compilation completed. Source routing was fixed in fb825da; original raw remains unchanged.
2. Producerfb825da: **FAIL_OR_PARTIAL**. Configuration passed and compilation started, but the supervisor statted a naturally removed temporary file and triggered its failure cleanup. This was a metering TOCTOU, not a physics assertion. Original raw remains unchanged.
3. Same producerfb825da, separate source/output: **PASS_LIMITED_ST_BUILD_AND_STORAGE_QUALIFICATION**. Only active temporary-file ENOENT metering was repaired; final stable scans and all production assertions stayed strict. Four focused supervisor CPU checks passed. Both failed ST windows and this successful window have their own ECHILD and zero protected-input drift.

The separate earlier **host attempt1 UNKNOWN_TRANSPORT_INTERRUPTED** remains UNKNOWN; none of these ST closure receipts proves that old window's termination. This is not a single-attempt/no-failure claim.

## Real new storage observations

- **51 controlled native-unit assertions**, compiled to WASM with4-byte pointers, passed. They are labelled controlled fixture checks, not all production observations; final tracked core delta and bridge bytes were0.
- **12 actual production facade/WASM checks** passed in one module/two worlds. The measured world-capacity ledger was **36096 initial → 201356 active → 200204 released-before-trim → 36096 trimmed → 36096 after a second real epoch and trim**. Identity history36B and creation-capacity20B are explicit rows in the new89-row/756-word diagnostic layout, not hidden outside accounting.
- Actual native step indices advanced through real epochs and were not reset by trim. Nonempty and missing-acknowledgement refusals were mutation-free, the other world stayed unaffected, and regrown low/high slots kept prior same-world raw IDs stale. This does not repair cross-world raw-ID ABA.
- The existing **39 controlled memory-unit assertions and10 production-WASM memory checks** also ran; the new51/12 do not replace or skip them. Full original remaining qualification groups ran through the same41-command schedule.

These are independent low-level fixtures, not the original same-app/world C20. Module allocator requests, world capacity ledger and bridge ownership remain separate; no global no-leak/full-handle census or after-close APP-memory claim follows.

## Tooling and boundaries

Actual tools: official locked Emscripten6.0.2-git/revision7a2d97d, CMake4.4.4, Unix Makefiles, explicit Node24.22.1; task-local Ninja1.13.2 remained available. The compiler archive matched repository SHA256 and official HTTP MD5. A task-local Python `-B` launcher prevented new bytecode writes despite the official `-E` wrapper; no compiler or production source was altered by that launcher. This production ST profile is not the earlier Debug host fixture.

Successful window:140.916648s through closure/input audit; sampled tree RSS peak262746112B; output53053215B before terminal writing; protected inputs unchanged and own ECHILD. Limits900s total/870s safety stop,4GiB tree RSS,128MiB output plus8MiB diagnostics,180s inactivity,7GiB startup available memory and1GiB reserve. These host checks do not guarantee invisible cgroup limits.

The source integration is committed and its low-level ST path is verified, but **fresh ESM/DTS SDK and actual APP/C20 have not run**. No build counter was consumed and no SDK228 is claimed. Original APP C20 remains **FAIL,0/100 qualified** and its76940-byte delta remains unassigned. A new complete SDK plus the unchanged strict APP fixture is still required; source-level release-hook tests are not actual APP evidence.

## Evidence

Machine summary: `empty-storage-st-qualification-20261027.json`, SHA256 `c25f16823108f66b47b6483c4c27b525022402ed6077d0c045477d93b8805d98`. Successful outer terminal SHA256: `b9955e162e6154d2378c86d3e44edc4545bbbd8ad42c76396a24ebdf81e1021a`.

Relative raw paths, exact command schedule, hashes, two failed terminals and all58 required evidence items are indexed there. These refer to retained task artifacts, not promised repository files. Publishing these small reports does not upload full raw/compiler/build trees or provide a self-contained replay bundle.
