# Sphere–Capsule public HEADLESS harness v1

This is a fresh-only consumer of the committed four-case public fixture. Source/CPU preparation is **not** SDK, native, WASM, APP, browser, full T15, C20, I05 or I06 acceptance. No SDK build number, future successful receipt hash or future producer is invented here. Missing or failed artifacts produce `NOT_READY`, before SDK import.

## Fixed scope

The velocity-only fixture `../../public-contract.mjs` is published at `fe69c0e366f663ba4aeae7be390eb3065b7805c5`. Its exact bytes and the independent oracle are pinned in `inputs.mjs`. It runs one app/world/clock, four real scenes, at most eight public fixed frames per scene:

1. Sphere created before Capsule: both receivers Enter/Stay/natural Exit.
2. Capsule created before Sphere: both receivers Enter/Stay/natural Exit.
3. A zero-cylinder Capsule descriptor (native Sphere) against a positive Capsule.
4. Callback destroys its peer; the remaining pending receiver is skipped, destruction is drained, no artificial Exit is manufactured.

Node placement happens only before mounting. After the initial ready frame, motion uses the supported public `RigidBody.setLinearVelocity` API; no external post-mount Node synchronization is enabled. The unchanged per-case limit remains eight frames. The original SDK231 public attempt remains failed and retained; its ST receipt pins the old fixture inputs, so it cannot qualify these new fixture bytes. Fresh matching ST/ESM/DTS receipts are still required, not anticipated here.

First Enter geometry uses independently saved **pre-step public Node poses**, not the event's generation poses as an oracle. Copied contact equations remain unchanged through release and close. Detached raw event data is journaled before any getter/assertion; copied getter data is journaled before identity/oracle validation. Failures retain the first offending observations.

The fixture owns its one `app.close()` in `finally`. The consumer tests **own properties**, not truthiness, of `report.close` / `report.closeError`. It attempts fallback close only if an app exists and no fixture close attempt was observed. It never retries a failed fixture close. Exhaustive cleanup of pre-mount unowned objects remains **NOT_QUALIFIED**.

## Unchanged host and identity separation

The consumer imports `terrain-contract/public-harness/host.mjs` unchanged, SHA-256 `10205d33d67ca3002eb5860aef9047688873423d910964eebf5269b0ef5d367b`. Its helper/import closure is also pinned, including the three actual TS preflight/writeback/velocity source files read by the CPU controls. This adapts only JSDOM/HEADLESS and exact asset transport; the product loader, module factory, engine methods, physics and step clock are not replaced. There is no browser/GPU/CSP/presentation claim.

The input declaration uses schema `air-box3d-public-sphere-capsule-producers-v1` and must supply:

- `schemaSha256`: the reviewed Sphere–Capsule schema in `inputs.mjs`.
- `fixtureCommit`: the **actual published harness** commit, not the original fixture or current arbitrary HEAD.
- `runtimeProducerCommit`, `nativeProducerCommit`: actual successful producer commits; this profile requires the same source for these two layers, but records them separately.
- `runtimeBuildNumber`: the actual newly built SDK number, strictly newer than 230.
- `nativeRelativeOutput`: the real ST output relative to its producer root, under `tools/physics/box3d/output/`.
- `dependenciesRoot`: the canonical real shared dependency directory, after the builder has stopped writing it.
- `receipts`: exactly `native`, `esm`, `dts`, `dtsGates`, `dtsDriver`, each a canonical relative `{path, bytes, sha256}` record within the evidence root.

The parent publisher supplies the provenance only after real publication/readback and actual producer records exist. These fields are declarations checked against local bytes and receipts, not an independent Git hosting proof. A local candidate hash must not masquerade as a published commit.

The native outer receipt must itself be successful, with closed descendants, no drift, and the complete 43-command / 120-input / 85-compiled-unit / 60-evidence gate. A passing native subprocess inside a failed overall attempt does not qualify. Production `verifySTBuild` is called unchanged, and the shared Sphere–Capsule qualification independently verifies all 18 samples and the complete manifest. Its result must equal the native outer result's qualification.

ESM identity uses the actual `budget.command` (the observed command list may be empty), exact source/native/output paths, counter and 23 output files. Fresh DTS uses the actual seven-element gate array, exact driver commands, all exit codes zero, emitted declaration originals, and both declaration copies in the same SDK. The complete 25-file SDK inventory is checked; no shortened four-file SDK is accepted.

The ready ST's whole directory must be copied byte-for-byte into the execution source at the **same relative output path**. `verifySTBuild` receives the **original native producer root from the hash-bound receipt** as `provenanceRoot`, never the new fixture execution root. The lock protects the complete ST copy and original tree, producer inputs, source inputs, imported fixture, harness, supervisor, SDK, five receipts, and dependency files/directories/symlink targets. Shared dependencies are read-only for this window; no installation, package import during inventory, rebuild or source mutation occurs.

## Six files and bounded execution

- `inputs.mjs`: pure parser/helpers; explicit `--freeze` / `--verify` commands.
- `inputs.test.mjs`: synthetic receipt/identity/close/file-protection controls only.
- `consumer.mjs`: real host/loader/app, immutable observations, fixture and input postcheck.
- `run.mjs`: CPU child first, then at most one consumer child.
- `execute-once.py`: unchanged SHA-pinned all-descendant supervision core, fresh output and final integrity checks.
- This README.

No C20 observer, 100-cycle configuration or C20 pass label is imported into this profile. Historical failures and unavailable raw evidence are unchanged.

After source review/publication, complete actual producers, producer review, and a separate one-attempt runtime authorization, run in the existing environment under the shared build-stage lock:

```sh
python3 -B tools/physics/box3d/sphere-capsule/public-harness/v1/execute-once.py \
  --execute-authorized-once NODE EXECUTION_SOURCE ACTUAL_SDK COPIED_READY_ST \
  EVIDENCE_ROOT PROVENANCE_RELATIVE_JSON FRESH_OUTPUT
```

The flag is not authorization. No attempt directory or lock can be reused or overwritten. The wrapper clears inherited AIR/BOX3D/Node override variables. It performs no build, install, browser launch, warmup, retry, second module or after-close native probe.

Predeclared limits:

| Window                                     | Limit                                                                 |
| ------------------------------------------ | --------------------------------------------------------------------- |
| Main outer supervisor                      | 334 seconds plus its one original 4-second close budget               |
| CPU child / consumer child                 | 30 / 300 seconds inside that same main window                         |
| Each read-only freeze / final verification | 60 seconds, 2 MiB output, independent of physics execution            |
| Sampled full-descendant RSS                | 2 GiB; an observation limit, not a kernel-enforced allocation ceiling |
| Main output / all preparation output       | 56 / 8 MiB                                                            |
| Combined retained output including summary | 64 MiB                                                                |

The read-only final verification is not a second consumer and cannot change a failed physics outcome. It still executes after a failed main window if a lock exists. External preflight files or captured wrapper stdout must also be included in final overall accounting if retained outside `FRESH_OUTPUT`; they do not create an extra uncounted allowance.

The supervisor core is `tools/physics/box3d/lifecycle-contract/lowlevel/supervise.py`, SHA-256 `d721d69135c4ab4fc8c09585fe835ff31555f6529525611dfcc29955fd7a021e`. Success requires subreaper ownership, `waitpid(-1)` returning ECHILD, no remaining descendants or process-group members, original exit zero, no budget violation, and all input/dependency checks unchanged. A timeout's SIGKILL or an empty PGID alone is never normal close or a pass.

Each attempt retains its intent, frozen lock, protected input records, CPU/consumer stdout/stderr and original process statuses, raw event JSONL, partial/final consumer JSON, independent physical closure and final verification. Main failure, fixture primary error, close error, journal failure, input drift and closure are separate fields. `PASS_PUBLIC_SPHERE_CAPSULE_SUBSET` only means these four declared public cases passed under the exact retained inputs.
