Derived from `AGENTS.md`, `docs/reference/verification.md`, `tools/verify/verify-web-only.cjs`, `tools/verify/verify-doc-refs.cjs`, `tools/verify/verify-feature-exports.cjs`, `tools/verify/verify-custom-exports.cjs`, `tools/verify/verify-example-chain.cjs`, `tools/verify/release-readiness.cjs`, `tools/verify/browser-matrix.cjs`, `tools/verify/perf-lifecycle.cjs`, `tools/verify/tarball-browser-consumer.cjs`, `tools/verify/dev-samples.cjs` (as of 2026-10-10).

Classify every `verify:*` command by its documented write behavior before running it. The `verify` prefix does not mean read-only: several gates rewrite canonical repository evidence. The AGENTS.md command table is authoritative; reconfirm each command's output path against it.

These are engine-repository commands. Run them from a Cocos AIR source checkout containing `tools/`, its dependencies and required builds. An npm consumer does not receive these tools; validate its own application through its configured compiler, bundler and browser. See [environment.md](../../cocosair/references/environment.md).

## Read-only gates (terminal result plus exit code, no canonical writes)

| command                                       | checks                                                        | writes                                      |
| --------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------- |
| `npm run typecheck`                           | TypeScript in `src/` via root tsconfig                        | nothing (noEmit)                            |
| `npm run verify:web-only`                     | Web-only dependency closure, no native or minigame code       | temp analysis JSON, cleaned up              |
| `npm run verify:file-map`                     | extracted files, upstream originals, modification registry    | nothing; needs upstream sources             |
| `npm run verify:licenses`                     | third-party license texts and bundle fingerprints             | nothing by default                          |
| `npm run verify:doc-refs`                     | local path references, rejects new broken links               | only with an explicit output option         |
| `npm run verify:wasm-backends`                | WASM physics backend closures and boundaries                  | nothing; no runtime proof                   |
| `npm run verify:custom-exports`               | custom pipeline and post-process export boundaries            | nothing; no pixel proof                     |
| `npm run verify:feature-exports`              | capability names, feature units, aggregate exports vs bundle  | nothing; some checks skip if bundle missing |
| `npm run verify:example-chain`                | existing evidence structure, per-item validators, consistency | nothing; discloses drift, not fresh         |
| `npm run verify:port-evidence` (`--selftest`) | validator regressions for the evidence contract               | nothing                                     |
| `npm run verify:release`                      | aggregates current candidate and evidence                     | nothing; needs a clean worktree             |

`verify:release` recomputes the candidate fingerprint, runs the coverage `--check` chain, calls the license gate, and rejects a worktree with uncommitted or untracked changes (`tools/verify/release-readiness.cjs:58`). It prints `READY` or `NOT READY` and an exit code; it does not rebuild or recapture evidence.

## Write gates (rewrite repository content)

| command                         | canonical output it rewrites                                                              |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `npm run analyze`               | the extraction manifest and upstream file map under `docs/`                               |
| `npm run capabilities`          | the glTF capabilities JSON under `examples/gltf-catalog/`                                 |
| `npm run gallery:manifest`      | `files.json` under `examples/`                                                            |
| `npm run gallery:api`           | the API inventory under `docs/`                                                           |
| `npm run verify:api-coverage`   | `api-coverage-report.json` under `docs/`                                                  |
| `npm run verify:v06-gate`       | `v06-review-gate.json` under `docs/evidence/`, `v06-final-gate.md` under `build/reports/` |
| `npm run verify:test-inventory` | the test inventory under `docs/` only with `-- --update`                                  |

A name containing `verify` does not mean the operation is read-only: `verify:api-coverage` rewrites its report even when the gate fails, and `verify:v06-gate` rewrites both its JSON and its Markdown report.

## Browser evidence collectors (write reports and screenshots)

These need Playwright tooling and matching browser binaries, plus a current bundle for most of them.

| command                           | writes                                                                            | scope caveat                                                                     |
| --------------------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `npm run verify:browser-matrix`   | the matrix JSON plus per-engine screenshots under `docs/evidence/browser-matrix/` | contract scope only; a subset run is not full verification                       |
| `npm run verify:perf-lifecycle`   | `perf-lifecycle.json` under `docs/evidence/`                                      | uses the generated static Gallery; unavailable memory is recorded as unavailable |
| `npm run verify:tarball-consumer` | the tarball consumer JSON under `docs/evidence/`                                  | packs and installs offline; cleans temp consumer after                           |
| `npm run verify:g3-dev`           | `g3-dev-samples.json` under `docs/evidence/` plus screenshots                     | three examples only                                                              |

## Subset semantics

`COCOSAIR_GALLERY_EXAMPLES` restricts a Gallery build to named ids and marks the artifact as a subset; unknown ids are rejected. A subset report may be complete for its subset but never aggregates to release readiness. The release gate requires the browser matrix `subset` flag to be false and `runPass` to equal `runTotal` (`tools/verify/release-readiness.cjs:149`). Do not relabel a subset PASS as full acceptance.

## Evidence freshness contract

A report file's presence is not current-run success. To trust a report, all of these must hold for the run you are citing:

- the command exited 0 in the current run
- the report timestamp corresponds to that run
- the completion and subset markers indicate a full run where required
- the recorded source, bundle, contract and spec fingerprints match the current candidate

For API coverage, also require per-API `apiProof`; a fresh example-level PASS does not verify every declared API. See [report-layers.md](report-layers.md) for the current spec/source/candidate bindings and call/read distinction. Recollect after source changes instead of editing report fingerprints.

`graphics-package.cjs --out=<new.json>` requires a new output path. It runs `npm pack`, whose `prepack` refreshes `build/npm/`, and installs into a temporary consumer before cleaning it up. Redirecting the report does not remove these writes. It needs development/minified bundles, source maps and declarations, not only the development bundle.

Historical plans, older-revision reports, and stale screenshots are context, not proof. `verify:port-evidence` accepts a valid NOT_RUN or BLOCKED report as honest disclosure but never treats it as a gate PASS.

## Running a write gate safely

Check `git status` and the target files before running any write gate; preserve unrelated changes and never reset another contributor's work. Format source before collecting fingerprinted evidence, since formatting changes source bytes even when behavior is unchanged. Do not run an evidence-writing gate merely to discover what a command does; read this table and AGENTS.md first.
