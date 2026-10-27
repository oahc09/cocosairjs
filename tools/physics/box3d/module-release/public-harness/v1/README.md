# Same-module terminal receipt public HEADLESS harness v1

A separate, fresh-only consumer of `module-release/public-contract.mjs`. Source and CPU controls are **not** a native/ST/SDK/APP result. Actual published source identity, successful matching fresh ST/ESM/DTS receipts and a separately authorized execution window are required. Absent or failed artifacts are `NOT_READY` before SDK import. No future successful hash or SDK build number is invented.

## Limited application observation

One original `createAirApp` / loader factory, one scene, four bodies/shapes, one fixed joint, two Terrain colliders sharing one asset/resource, copied nonempty debug data and two public clock frames. The fixture releases the scene once and owns its one `app.close()` in `finally`. It requires the actual detached `close.physicsPreparation.moduleRelease` receipt to be `VERIFIED`, with the unchanged original factory baseline, zero registered terminal state and no capture, binding-disposal, verification or module-release errors.

The loader itself captures that same module immediately after factory acquisition and before binding creation, then during disposal after binding cleanup and before dropping the module reference. The consumer never replaces the factory, obtains a module reference, probes native state after close, resets a baseline, constructs a second app, or reruns the old Sphere–Capsule or 100-scene fixtures. Post-close work reads only copied receipt/debug data and performs pure validation.

Core world count and tracked requested bytes, registered bridge ownership and registered mesh ownership are separate, overlapping accounting domains. They are not added into an invented grand total. This fixture is not an enumeration of all body/shape/joint/contact handles, all malloc allocations, WASM heap, JS GC, full T15, full C20, I05 or I06. Historical failures and missing old raw evidence remain unchanged. Exhaustive cleanup of pre-mount unowned objects is still `NOT_QUALIFIED`.

## Immutable identity and present-only admission

The original `terrain-contract/public-harness/host.mjs` is reused unchanged, SHA-256 `10205d33d67ca3002eb5860aef9047688873423d910964eebf5269b0ef5d367b`. It supplies JSDOM/HEADLESS and exact asset transport, not browser rendering or a replacement physics implementation.

`inputs.mjs` pins the new ABI schema, exact public fixture/helper/loader/preparation source bytes, relevant CPU sources, original host/helper closure and audited supervisor. Its `PUBLIC_FIXTURE_COMMIT` is the actual published production/fixture source `a00306f391c595e292bbcaedd0f757bc99ca4ead`; a local candidate cannot impersonate a commit. The separate provenance `fixtureCommit` names the actual published harness commit. The parent publisher supplies both real identities after publication/readback. Local declarations and hashes are not an independent Git-host proof.

The provenance schema `air-box3d-public-module-release-producers-v1` includes:

- `fixtureCommit`, `runtimeProducerCommit`, `nativeProducerCommit`, actual `runtimeBuildNumber` newer than 234;
- the pinned `schemaSha256`, real `nativeRelativeOutput`, canonical `dependenciesRoot`;
- exactly five relative `{path,bytes,sha256}` receipts: `native`, `esm`, `dts`, `dtsGates`, `dtsDriver`.

Native/runtime producers must be the same published production source. Whole native-attempt success, all commands, zero input drift, physical closure and exact inventories are checked. The new source contract declares 47 commands / 136 inputs / 87 compiled units / 63 evidence files; those are required future receipt values, not a claim that this harness executed them. `verifySTBuild` is called unchanged. The shared module-release qualification independently recomputes native/WASM results from their complete raw snapshots, full manifest, build receipt and exact WASM fixture SHA, and must match both audit and native outer qualification. All older production gates remain required by `verifySTBuild`.

ESM uses the actual bare `budget.command`, source/native paths, counter and 23 output records. DTS uses the actual seven-entry gate array, exact driver commands, fresh emitted declaration originals and two matching SDK declaration copies. All 25 SDK files and compiled source-map bytes for loader/helper/prepare/preparation must match, not merely a short runtime subset.

The ready ST's **complete** directory is copied byte-for-byte into the isolated execution source at its original relative OUT. The original producer root from the hash-bound native receipt is passed as `provenanceRoot`; the fixture execution root is not substituted. The lock covers whole ST original/copy, producer/source inputs, imported source, runner, SDK, receipts and dependency files/directories/symlink targets. Builders must have stopped writing source, SDK and dependencies before freeze.

## Six-file implementation and original bounds

- `inputs.mjs`: pure admission helpers and explicit `--freeze` / `--verify` commands; no SDK import.
- `inputs.test.mjs`: synthetic strict receipt, result, closure and file-protection controls; no native execution.
- `consumer.mjs`: unchanged host, real app, immutable journal, fixture and postcheck.
- `run.mjs`: CPU child first, then at most one consumer.
- `execute-once.py`: original SHA-pinned subreaper / all-descendant supervision and fail-closed output accounting.
- This README.

The consumer tests own properties of `close` / `closeError`, not their truthiness, before any pre-fixture fallback close. It never retries a fixture-owned close. A successful terminal snapshot cannot hide an earlier primary error. Journal, close, integrity, host and supervision failures remain separate and force failure; partial observations are retained.

After review/publication, actual producer review and one explicit runtime authorization, hold the shared build-stage lock for preparation and execution in the existing environment:

```sh
python3 -B tools/physics/box3d/module-release/public-harness/v1/execute-once.py \
  --execute-authorized-once NODE EXECUTION_SOURCE ACTUAL_SDK COPIED_READY_ST \
  EVIDENCE_ROOT PROVENANCE_RELATIVE_JSON FRESH_OUTPUT
```

The flag is not user permission. Fresh output and lock paths are mandatory. No build, install, browser launch, warmup or automatic retry occurs. Inherited AIR/BOX3D/Node override variables are cleared.

| Window                                      | Limit                                                 |
| ------------------------------------------- | ----------------------------------------------------- |
| Main outer supervisor                       | 334 seconds plus its original 4-second close budget   |
| CPU child / consumer child                  | 30 / 300 seconds inside that same main window         |
| Each read-only freeze / final verification  | 60 seconds, 2 MiB output                              |
| Sampled full-descendant RSS                 | 2 GiB; observation limit, not a kernel allocation cap |
| Main output / all preparation output        | 56 / 8 MiB                                            |
| Combined retained output, including summary | 64 MiB                                                |

Read-only postverification is not another physics attempt and cannot repair a failed result. External preflight files and captured wrapper stdout also count toward final totals. Output traversal rejects symlinks, special files and read/traversal failures rather than silently treating unknown size as zero.

The supervisor is `tools/physics/box3d/lifecycle-contract/lowlevel/supervise.py`, SHA-256 `d721d69135c4ab4fc8c09585fe835ff31555f6529525611dfcc29955fd7a021e`. Success requires subreaper ownership, `waitpid(-1)` ECHILD, no remaining descendants or process-group members, original exit zero, no budget violation and all input/dependency checks unchanged. SIGKILL timeout or empty PGID alone never proves normal close.

Each attempt retains intent, frozen lock, source/receipt copies, protected inventory, CPU/consumer stdout/stderr and process status, journal, partial/final consumer report and physical closure. `PASS_PUBLIC_MODULE_RELEASE_SUBSET` means only this finite normal-close application observation passed under those exact inputs.
