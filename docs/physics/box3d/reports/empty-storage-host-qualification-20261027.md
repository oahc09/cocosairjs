# Same-world empty-storage host qualification — 2026-10-27

## Result: VERIFIED_LIMITED_HOST_NATIVE

Producer `f55843f6add3b21fec2858080814d78a8d0168be`, fixed source base `cc7b4b3fb992120e37a9f6b243a0b73c5719f2f1`, candidate manifest `c28aba6cdaa4dcc9840efc41a358dc600e8192ab3073b729bd37df91e8530311`.

**Two attempts are distinct.** Attempt 1 lost execution transport after dual staging and candidate configuration succeeded; compilation output stopped at 13/56. No normal native, control or OOM result was observed. Its status remains **UNKNOWN_TRANSPORT_INTERRUPTED**, with no terminal/ECHILD proof; possible residual execution cannot be ruled out. Its original files and once marker are unchanged. Attempt 2 used separately copied, hash-bound source and fresh output under a new bounded window. Its success does not establish attempt 1 closure. This is not a claim of only one attempt or no infrastructure failure.

## Actual attempt 2 observations

- Candidate **3661** assertions; identity-only control **2**. Groups: default mixed112, nondefault mixed112, cycles3206, refusals71, isolation6, caller-owned mesh56, sleeping/disabled34, private event acknowledgement60, main4.
- **100 same-world core cycles** passed. Initial ledger **37476 → 37496 bytes**, a measured **20-byte creation-capacity policy** increment; existing36-byte identity history remains, fixed metadata totals56. Neither historical36040 nor76940 determines the new baseline.
- Isolated candidate tracked module bytes were **0 after close**. World ledger, module requests, external mesh ownership and worker storage are separate scopes, never combined or equated. This is not global no-leak or full census qualification.
- Normal candidate/control exit0, stderr empty. The separate fatal-OOM subprocess actually exited by **SIGABRT** (Python return code−6), with empty stdout and `STORAGE_OOM_ARMED` / `STORAGE_OOM_RETURN_NULL request=1 size=2048 alignment=32`. Its own children were reaped to **ECHILD**. This intentional fatal result is not a recoverable OOM transaction, normal production close or WASM abort proof.
- All12 retained commands met their declared results:11 exit0 plus the one expected fatal abort. Post-build exact stage verification passed. Actual candidate54/control53 translation-unit commands use **Debug**, forced qualification guard and no NDEBUG or `-UNDEBUG` workaround. Both binaries compiled with active macro guards.
- Attempt 2 input hashes did not drift; its process tree reached **ECHILD**. Recorded30.313741s through closure/input audit, peak sampled tree RSS76230656B, output38505658B before terminal writing. Budget600s/570s safe stop,1GiB RSS,128MiB output, one compile job,5GiB startup available memory and1GiB reserve; core dumps disabled. Hidden cgroup limits were not observable and are not guaranteed by host memory checks.

Actual tools: GCC/G++14.2.0, Node24.22.1, task-local official CMake4.4.4 and Ninja1.13.2. Downloaded tool archives matched official release API digests; CMake additionally matched official SHA-256.txt. Formatter3.9.9 matched the restored repository lock integrity. No Emscripten, production SDK or build counter was used.

## Limits and next work

Only the isolated core fixture enables this operation. Private event-array injections are not physics-generated events and do not establish JS dispatch/borrowed-view quiescence. The complete production bridge/backend, event-copy revision, resource/lease admission, scene/deferred-destroy release hook, accounting row/schema and exact production inventories remain **NOT_INTEGRATED**. WASM/SDK qualification remains outstanding. Preserved historical peaks may cause stack growth again after a later Step.

The original same-app/world C20 remains **FAIL,0/100 qualified**; its76940-byte delta remains unassigned. These100 core cycles do not supersede it. No APP baseline, acceptance threshold, old failed attempt or production schema was changed; no SDK228 was generated.

## Evidence

Machine summary: `empty-storage-host-qualification-20261027.json`, SHA256 `7bd7a587e7daf12813625b07a61567b49f61980b60e21e022331afcf2ad4f753`. The original attempt2 terminal SHA256 is `dfcafb1757aff0023848974da3329d51dcd69a7ee58536ed31f612bdb0fb5da7`.

The summary binds relative raw paths, bytes/hashes, actual commands (`$EVIDENCE_ROOT`/`$NODE` placeholders), tool identities, both attempts and OOM receipt. These identifiers locate retained task artifacts, not promised repository files. Publishing these small reports does not upload the compiler/build trees or full raw archive and does not provide a self-contained replay bundle.
