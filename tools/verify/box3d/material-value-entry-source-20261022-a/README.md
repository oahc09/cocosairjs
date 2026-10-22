# S3 material value entry candidate, frozen original S1

Status: **blocked by a reproduced S1 defect, not approved for activation or merge.** Two candidate engine sources only. No World, production owner, Collider, System, native, SDK-build, Git, or remote change was made.

## Inputs and source identity

`input-manifest.json` freezes the actual asset, mutation guard, math utils, decision document, repository guidance, and original S1 bytes before candidate creation. Declared product checkpoint: `9df645b4a84e73c86ffd460b59cbd6e2ab732cbb`.

- Original S1 SHA-256: `382c459f2116383d9acd7eddec737d7a9dd213f5a2c1371475aa024020666cd4`.
- Candidate asset SHA-256: `47a2e4d244bab6933f8d0a65a2fdc6978a5764e8081df4b21d0b97aac83872da`.
- Private bridge SHA-256: `435b47e6faaa861c1d584fcc3603a64735052daa2595cf3da12e3fa602305b66`.

The bridge wraps exactly `begin`, `registerOwner`, and `assertDestroyable` on one unexported registry instance. It neither exports the registry instance nor adds a public barrel. Its logical adjacent transaction import is resolved to the frozen S1 input by these controls; this directory is an isolated candidate, not an installed engine source tree.

## Entry implementation

Each of five existing entries retains `assertMutationAllowed` first, then `begin(this)`. When unowned, all original statements remain byte-for-byte, without additional coefficient reads, comparisons, or conversions. A structural AST control confirms original setter/setValues statements and all unaffected members. Destroy checks the private roster before `super.destroy()` and any base flag/queue work.

Owned source readers copy the four actual private caches in canonical order `[friction, restitution, rolling, spinning]`; public getters are not read. A getter for the copied `changed` flag deliberately defers original scalar `math.equals` or exact setValues comparisons until S1 has strictly validated both tuples. It captures only local snapshots, not live cache getters. The original setValues comparison order and write order remain friction, rolling, spinning, restitution. Every completed field assignment immediately calls `recorder.written()`. No-change setValues still writes four fields, without native propagation or public notification. `readActual` reads actual private caches. Prepare/apply runs inside `try/finally dispose`; preservation of falsy failures is tested against S1 terminal/idempotent disposal.

## Retained results

- `evidence/run-a/results.json`: original 163/163 narrow controls passed. Its original harness and candidate input bytes remain under `evidence/run-a/inputs`.
- `evidence/run-b/results.json`: expanded 186 controls, **185 PASS and one genuine FAIL**, the known S1 no-change commit defect. Original raw output: `run-b.log`. That version's harness/candidate/S1 input snapshots remain under `evidence/run-b/inputs`.
- `evidence/s1-known-defect/probe.json`: both owner leases remain `live`, no fault callback runs after second owner commit throws null on a scalar no-op, and a subsequent change successfully enters both native mock operations. This is not an expected-pass assertion; the normative assertion is red.
- `evidence/typecheck-a/result.json` and `typecheck-a.log`: preliminary strict narrow typecheck with zero diagnostics before harness formatting. The historical unformatted harness itself was not captured; this run is not the final reproducibility receipt.
- `evidence/typecheck-b/result.json` and `typecheck-b.log`: final formatted harness strict narrow typecheck, zero diagnostics. Controlled minimal Asset/core/decorator declarations and all compiler read hashes are recorded; this is not a full SDK typecheck.
- `format.log`: bridge and test scripts conform to existing Prettier configuration. Extracted upstream asset formatting is deliberately preserved, not reformatted.

## Boundaries

Controls execute complete transpiled original/candidate asset source, the actual mutation guard source, exact extracted engine `math.equals`, and the exact S1 registry. Asset/EventTarget, trusted owner delegates, and native callbacks are explicit test doubles. No result qualifies actual World/WASM or production identity/lifetime wiring. All formal 2,128 cells remain NOT_RUN; all nine Gates remain unpassed.

The original S1 defect is owned by a separate repair stage. This directory never alters or replaces that frozen input. A later S1 version must be tested in a new revision with new provenance, retaining these red bytes and observations.

## Reproduction

With the existing read-only `../box3d-rebuild-20261022/node_modules/typescript`:

- `node controls.cjs evidence/reproduction --known-s1-red` returns exit code 1 and reproduces the known red control.
- `node typecheck.cjs evidence/typecheck-reproduction` performs the narrow strict typecheck.
- `python3 verify-closure.py` verifies the retained artifact closure without changing product files.

Run reproduction into fresh output directories only. No dependency installation, clone, SDK build, or main-tree mutation is required. The TypeScript/Node installation is a pre-existing read-only toolchain, not vendored into this small evidence artifact.
