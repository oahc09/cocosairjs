# Queue submission admission checkpoint

Status: **108/108 PURE SOURCE CONTROLS, NOT PHYSICS**, 2026-10-22.

Only two existing files changed. No World, registration, producer, Node, facade, native, public API, formal qualification inventory, or build input was edited. No runtime/native/WASM build or Git operation was performed.

## Current frozen sources

- `src/air/physics/box3d/command-queue.ts`: `42550d8487fd7ad05d142bc4b3ab764ddf8bedec140098dc35f88ae0ba786b6b`.
- `tools/verify/box3d/command-queue-control.mjs`: `a9aff710ea1c5e686f3a6caa9f5541723fd9b40be22c703ffbedcb3e28e89f57`.

`withSubmissionAdmission(read)` enters the same private admission region as ordinary `submit`, before owner resolution or candidate accessors. The reader returns one body/command candidate. It cannot call `submit` to install a record. Returned fields and nested payloads are copied while admission remains held. Queue/sequence changes happen only after successful validation; no input object or vector is retained except the intentionally opaque logical body identity.

The first error uses separate presence and value storage, preserving `undefined`, `null`, `0`, and object identity. Caught same-queue reentry rejects the outer admission. A rejected command submission during collection latches the entire provisional candidate, including owner resolution failures and later callback exceptions. Earlier accepted prequeue entries remain; accepted provisional sequence numbers are not reused. Existing candidate tickets, known/unknown commit retirement and next-attempt behavior remain covered.

This primitive does not validate actual native body/world/generation/type/mass state, enforce component lifecycle, block unrelated JavaScript, or execute commands. Owner fence acquisition and validation must run at the reader's start using private identities, before caller-owned data is read. The owner retains those leases through the complete queue call and releases them in an outer `finally`. A caught non-command configuration refusal does not, by itself, imply a rejected command submission.

## Preserved chronology and exact executions

All paths below are under `tools/verify/box3d/`.

1. `command-queue-admission-evidence-20261022-red-a/` contains both original input files, the formatted `probe.mjs`, original raw/stdout/stderr and exit code. Command: `node tools/verify/box3d/command-queue-admission-evidence-20261022-red-a/probe.mjs`. Exit **1**, six expected assertions RED. Queue input SHA `336e3d5bec910c6f814c06bd059fb0325876e17403ae501a3e78110616915d7b`.
2. The RED uses actual frozen Queue code with an explicitly separated owner-shaped resolver, not a copied Queue implementation or an integrated World. It shows ready nested submission changing pending/sequence from 1 to 2; caught nested invalid submission permitting the outer submission; caught owner `undefined/null/0` during collection still producing a validating candidate with one provisional record; and replacement of the first nested error by a later getter error. These expose the missing admission primitive, not a claimed naturally occurring native failure.
3. `command-queue-admission-source-20261022-a/` preserves the first formatted implementation, two input copies, diff and runner output. `node tools/verify/box3d/command-queue-control.mjs tools/verify/box3d/command-queue-admission-evidence-20261022-green-a` exited **0**: 108/108, strict TypeScript and format exit 0, before/after hashes equal.
4. Source b changes only the owner-fence obligation comment relative to source a. `command-queue-admission-source-20261022-b/` contains both final input copies, `changes-from-a.diff`, hashes and original runner output. `node tools/verify/box3d/command-queue-control.mjs tools/verify/box3d/command-queue-admission-evidence-20261022-green-b` exited **0**: 108/108, strict TypeScript and format exit 0, before/after hashes equal.

Final green-b receipt SHA: `ddda1827b4f687bed538faee345251c9d16545333851281caf17d31f34f6407a`.

Final raw SHA: `6d5419dbed0432354d78517fb483d872d5a26c8db47377f76ac54c27374bf3b5`. Green a and b have equal control observations because b only clarifies a comment; each has its own actual invocation and source-bound receipt.

The 66 historical controls remain, with 42 new admission controls: single-read/copy semantics; thrown error identity; provisional discard and next attempt; nested valid/invalid submission from resolver/body/command/vector getters; mutation/lifecycle queue reentry; first-error precedence; invalid results; readable diagnostics; and explicit configuration/non-queue side-effect boundaries. Mock commit notifications are still mocks, not native evidence. No new formal T11 or release cell is PASS.

## Review and next step

`world-integration-plan.md` is a read-only implementation proposal. Its current-source references are bound by `reviewed-sources.json`. It does not authorize editing those files. The separate command-wire mapper is owned elsewhere and is not qualified here.

`owned-files.json` enumerates the exact two live source files and new evidence/handoff files with byte counts and SHA-256, excluding the inventory itself. Historical command-queue evidence a/b was not modified.
