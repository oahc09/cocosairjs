# SDK234 module-terminal build and declaration failure

Producer: `eddf4ac58ea536348aac960a527cc27961b9011f`. Date: 2026-10-27.

**PARTIAL: ST and ESM passed their limited gates; DTS failed. There is no complete25-file SDK or public module-close qualification.**

Fresh ST executed47 commands /136 producer inputs /87 compiled units /63 evidence entries, retaining the original43-command ordered set and Sphere–Capsule18 oracle. New module-release native120 assertions and production WASM8 checks passed and were independently reread through the pure qualification consumer. They observe registered native ownership within the same original module, not every malloc/handle or GC. The core patch chain and old89-row/756-word world diagnostic ABI remain unchanged; the new module snapshot is38words/17fields under the new main schema.

One bare Node24.22.1 full28-feature ESM build, no preload, successfully advanced233→234. Its23 files total40,457,499B;996 source-map entries, ten critical runtime source bodies and five ST transports were checked. The counter234 therefore records a real ESM success and is retained despite the subsequent declaration failure.

## Declaration failure — preserved, not retried

- Gate1 emitted declarations and exited0; gates2–4 (three fixture suites) also exited0.
- Gate1 stderr nevertheless reported `preparation.ts(160,42)`: `Object.fromEntries` unavailable under the configured target library. Exit0 does not turn this source diagnostic into a pass.
- Gate5, the first fresh strict consumer, exited2: generated declaration lines73173 and73211 cannot find `Box3DModuleReleaseReceipt` (TS2304).
- Gates6/7 were **NOT_RUN** after this failure. No declaration was promoted into the SDK, and no old declaration was substituted. The incomplete emitted declarations remain only in the isolated failed DTS workspace.
- DTS ended **FAIL_OR_PARTIAL**, exit2, own ECHILD and no input drift. All original stdout/stderr, gate array and terminal result are preserved. Source/type fixes require a separately committed producer and fresh cohort; this report does not claim a repair or successful retry.

ST/ESM also closed with own ECHILD and no protected-input drift. Original limits remained ST900/870s,4GiB RSS,128+8MiB; ESM600/570s,6GiB,100+8MiB; DTS300/270s,3GiB,100+8MiB. ESM/DTS Node heaps4096/2048MiB. Warnings and diagnostics are retained rather than described as clean logs.

These build observations do not establish public app.close, full C20, all-handle/native-allocation census or zero leakage. Previous SDKs, public attempts and failure evidence remain unchanged. Selected original receipts/logs can be retained separately; neither this summary nor that selection is a self-contained rebuild/replay package, and no complete SDK/source/dependency tree is uploaded here.

Machine summary: [JSON](sdk234-module-terminal-build-and-dts-failure-20261027.json), SHA256 `f9267d0178d31f22db3346dd6ec676effc310628adebeae40035d15263638126`.
