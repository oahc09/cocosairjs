# S3 material value entry candidate, revision B

Status: **192/192 narrow controls PASS; strict narrow typecheck PASS. Not activated, merged, or World/WASM-qualified.** This revision changes only the frozen S1 dependency, not either of the two candidate engine source files. Actual production owner/World/Collider/System wiring remains absent by design.

## Provenance

The original artifact at `../box3d-material-value-entry-candidate-20261022` remains intact, including its original S1, original 163-pass run, expanded 185-pass/one-fail run, actual no-change commit failure probe, and 50-file closure. `input-manifest.json` hash-binds that predecessor closure and freezes the new S1 input independently.

- Frozen repaired S1: `fb1be9f19ab526e8b1c0785446a387324b4d51930b90d7bfb105127fe8255b06`.
- Candidate asset, unchanged: `47a2e4d244bab6933f8d0a65a2fdc6978a5764e8081df4b21d0b97aac83872da`.
- Private bridge, unchanged: `435b47e6faaa861c1d584fcc3603a64735052daa2595cf3da12e3fa602305b66`.

The new S1 alone adds actual owner commit entry/normal-return state and marks commit entry as an effect even for scalar no-change. The S3 bridge and asset files are copied byte-for-byte from the original candidate. No original S1 bytes or original raw results were replaced.

## Candidate behavior

The private bridge exposes exactly `registerPhysicsMaterialValuesOwner`, `beginPhysicsMaterialValuesChange`, and `assertPhysicsMaterialDestroyable`; all forward to one unexported registry. No public barrel or registry escape is introduced. The adjacent logical S1 import is mapped to the frozen input during narrow compilation; this is not an installed engine tree.

All five coefficient entries keep the existing mutation guard first. With no owned roster, the original statements execute unchanged, without extra coefficient access, comparison, or conversion. Owned readers use actual private caches, canonical tuple `[friction, restitution, rolling, spinning]`, and a captured-snapshot `changed` getter that S1 reads only after strict validation. Scalars retain original `math.equals`; setValues retains exact comparison short-circuit order and assignment order friction, rolling, spinning, restitution. Each completed assignment immediately records a write. Unchanged setValues still writes four fields without emitting. A successful changed path emits the original event once, after prepared private propagation. Actual-cache readback, apply/finally disposal, and held-destroy admission follow the frozen protocol.

## Evidence

- `evidence/run-a/results.json`: 186/186 PASS on new S1; harness and source snapshots are preserved under `evidence/run-a/inputs`.
- `evidence/run-b/results.json`: final 192/192 PASS. `run-b.log` and `run-b-status.json` retain raw stdout and exit code 0. Harness, both candidate sources, S1, and manifest snapshots remain under `evidence/run-b/inputs`.
- The six additional final controls cover all five falsy failures at the actual scalar no-op owner commit, including independent cleanup failures, and caught reentry after a normal commit return. Assertions require both owners faulted, exact owner commit state/count, unchanged material caches, no native/event/write effect, independent cleanup, exact original falsy error, and refusal before coefficient reads on reuse.
- `evidence/s1-commit-regression/probe.json`: the former no-change defect now faults both leases and rejects subsequent native propagation.
- `evidence/typecheck-a/result.json`: strict narrow typecheck with zero diagnostics, controlled minimal engine declarations, and 64 compiler-read inputs. Its exact harness snapshot is included.
- `format.log`: bridge and test scripts pass existing Prettier configuration. Extracted upstream asset formatting remains unchanged deliberately.
- `closure-manifest.json` and `closure-verification.json`: retained local artifact hashes and reference validation. The predecessor closure is separately hash-verified.

Controls include complete original/candidate asset source and actual mutation guard execution; engine math.equals is extracted from frozen source. Asset/EventTarget and owner/native callbacks are explicit test doubles. These are actual-entry-source and pure-protocol controls, not actual World/WASM or full SDK verification. The repaired S1's independent review remains a separate dependency acceptance decision. All formal 2,128 cells remain NOT_RUN, and all nine Gates remain unpassed.

No package installation, clone, SDK build, main worktree edit, Git change, remote write, or third-party action occurred. Existing Node/TypeScript/Prettier tooling was used read-only; all artifacts are well below the 10 MB combined budget.

## Reproduction

Use existing read-only `../box3d-rebuild-20261022/node_modules` tooling:

- `node controls.cjs evidence/fresh-run --s1-commit-regression`
- `node typecheck.cjs evidence/fresh-typecheck`
- `python3 verify-closure.py`

Use fresh evidence output paths. Do not overwrite retained historical run directories.
