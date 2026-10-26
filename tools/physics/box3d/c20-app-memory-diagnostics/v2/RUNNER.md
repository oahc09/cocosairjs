# C20APP v2 memory diagnostic execution integration — SDK227 profile v2

Source-only execution tools for the SDK227-only read-only observer in this same
v2 directory. This version retains 12 profile-local tools; the original APP v2
ten files remain byte-identical imports, and the published memory v1 profile is
not changed. No new core fixture is created. Preparation and CPU controls do
not run native physics, import the SDK or create an app. Actual new
ST/ESM227/DTS artifacts are required; a prospective build number is not readiness.

## One complete entry point

After review/publication, successful actual producer artifacts and explicit
one-attempt authorization, invoke:

```text
python3 execute-once.py --execute-authorized-once \
  NODE22 SOURCE_ROOT SDK227 NEW_ST EVIDENCE_ROOT PROVENANCE_REL FRESH_OUTPUT
```

The flag records execution intent, not user permission. The new output must not
exist or sit inside source, SDK, ST or runner inputs. No installation, build,
warmup, trimming, reset, second module, retry or after-close getter occurs.
`execute-once.py` imports the unchanged SHA-pinned audited lowlevel supervisor's
**generic closure API**, not its native fixture or CLI. It uses a subreaper,
all descendants and `waitpid(-1)`/ECHILD; a vacant process group alone is not
closure. An actual strict failure may still have complete physical closure.

The wrapper first performs a separately bounded, non-runtime freeze (60 s,
sampled RSS 2 GiB, output 2 MiB inside the preparation reserve). Missing or failed
producer artifacts return `NOT_READY` and cannot create a lock or start the
consumer. Main capture remains CPU 30 s + consumer 300 s, outer wall 334 s,
original close 4 s, sampled descendant RSS 2 GiB; output is main 56 MiB plus
preparation 8 MiB, total 64 MiB including the final summary. These are ceilings,
not claims that 100 cycles fit them. Budget failure preserves partial evidence;
there is no automatic rerun. RSS sampling is not a kernel hard limit.

## Present-only producer declaration

`PROVENANCE_REL` is a canonical relative JSON path inside `EVIDENCE_ROOT`. Supply
actual values only once available, in this shape (the angle-bracket text below
is a documentation placeholder and is **not** a valid admission file):

```json
{
  "schema": "box3d-c20app-memory-producer-inputs-v2",
  "runtimeBuildNumber": 227,
  "runtimeProducerCommit": "<actual 40-hex ESM/DTS source commit>",
  "nativeProducerCommit": "<actual 40-hex new ST source commit>",
  "fixtureCommit": "<published 40-hex execution integration commit>",
  "receipts": {
    "esm": { "path": "<relative ESM result.json>", "bytes": 0, "sha256": "<actual SHA256>" },
    "dts": { "path": "<relative DTS result.json>", "bytes": 0, "sha256": "<actual SHA256>" },
    "dtsGates": { "path": "<relative seven-gates.json>", "bytes": 0, "sha256": "<actual SHA256>" },
    "native": { "path": "<relative ST supervision result.json>", "bytes": 0, "sha256": "<actual SHA256>" },
    "historicalV2Journal": { "path": "<retained original APP v2 observations.raw.jsonl>", "bytes": 0, "sha256": "<original SHA256>" }
  }
}
```

Do not copy these placeholders into a purported successful receipt. Freeze checks:

- New `3a1c552…` schema and exact same-product core/binding/patch/ST identity.
- Actual ESM227 and DTS227 success, same runtime producer commit, exit zero,
  no abort/input drift and producer ECHILD close. ESM native producer must match
  the separately declared new ST producer; fixture commit is not substituted for
  either compilation identity. Current source bytes have a separate snapshot role.
- Exact ESM23 + DTS2 SDK file inventory; each file hash/size matches its actual
  receipt. ESM's five ST payload/manifest records equal the new ST and packaged
  SDK copies; ST readiness hash matches the ESM producer's input.
- The actual seven DTS gates, their ordered original commands, zero exits and
  hash, with the DTS receipt bound to the actual ESM receipt hash.
- New ST supervision PASS, ECHILD, schema and exact 37 commands / 92 inputs /
  84 compilation units / 55 evidence files. Four retained completion receipts
  match the actual ST files. The product's read-only `verifySTBuild` gate is
  rerun; the new diagnostic and mesh-lifetime exports are checked by WASM
  **compilation/export inspection only**, never instantiation.
- Exact source inventory, the seven runner files, all 15 immutable imported
  fixture/observer files and the original closure-core SHA. Copies used by static
  imports must also match. The old APP v2 journal is pinned to its original
  `64ca2299…` SHA for CPU assertion replay, not relabelled as a new result.

`freeze.mjs` can be invoked independently with
`SOURCE SDK ST EVIDENCE_ROOT PROVENANCE_REL FRESH_LOCK`; it only writes a fresh
lock after every readiness check passes. It returns exit 2 / `NOT_READY` on
missing/failed inputs. It never invents producer commits, receipts or SDK files.
Lock inputs are rechecked before and after consumer use and by the outer wrapper
when it exits; added/removed SDK or source files cannot be silently ignored.
The prior SDK225 and ended attempts are read-only; no attempt directory is reused.

## Producer root and relocated ready ST layout

For an independent execution source, pass the **byte-identical full ready ST
copy inside that source at the producer's original relative OUT path**, not the
original ST directory outside the execution source. Copy all retained build
files, staged sources and audit evidence without rewriting any bytes; hash the
entire original/copy inventory. Payload equivalence alone is not enough.

The existing product gate binds compiled source paths under its own source ROOT
and has a separate, supported `provenanceRoot` option for retained original
absolute Hull/compiler paths. This runner obtains that provenance root only from
the hash-locked actual native supervision receipt's matching `cwd` / `budget.cwd`,
checks its producer commit and relative `budget.out`, then passes it to the
unchanged gate. The freeze and consumer use the same binding. The fixture source
is not the native compiler source; do not edit original audit paths, relax source
inventories or normalize away a root mismatch.

The original memory attempt 1 stopped at this root-layout admission mismatch:
`NOT_READY`, no lock, no CPU/consumer/physics startup. It remains unchanged and is
not relabelled by a later successful readiness or runtime attempt.

## Consumer semantics and independent results

`consumer.mjs` retains original APP v2 create-app/physics configuration, public
clock fixture, error capture, single normal-close attempt, host teardown and
before/after hash checks. The only scene runner call becomes the already reviewed
`runObservedSceneCycles`; original fixture/strict assertions are imported intact.
No private tick/step, repeated app creation, delayed baseline or relaxed count is
added. Pre-mount unowned-object cleanup remains NOT_QUALIFIED.

The main journal is `observations.raw.jsonl`. The synchronous observer appends to
an exclusive independent `memory-diagnostics.raw.jsonl` only at the three
already reviewed safe points, before the original strict assertion. Returned
bigints remain exact decimal strings. The report archives the imported source,
lock and actual producer receipts. Both journals are retained and hashed even
when the original strict baseline fails.

- `strictStatus`: result of the original unmodified APP v2 contract, including
  normal close/input integrity; failed first cycle stays zero qualified cycles.
- `memoryDiagnosticStatus`: complete reached initial/active/released snapshot
  sets, partial, or diagnostic failure. One complete set is not 100 cycles.
- `status`: combined attempt success only when both required results succeed.
  Diagnostic/journal errors never replace the original baseline `error`.
- Outer `allDescendantsClosed`, raw return code, budget violation and consumer
  normal-close fields remain separate. Close is not post-close memory sampling.

World capacity ledger, module core requested bytes, world/global bridge and
excluded arena backing remain separate fields. Diagnostic completeness never
changes the original strict ledger comparison. New observations cannot precisely
attribute older SDK225 differences; historical v1/v2 FAIL and zero qualified
cycles remain. Full C20, I05 and I06 remain NOT_QUALIFIED.

## CPU preparation and runtime CPU controls

The bounded runner executes the original 58 controls, observer controls
(including SDK225/226 rejection and six corrected row descriptions), and new
admission/integration controls before starting the consumer. For standalone
source preparation, set the existing observer environment variables plus
`C20_APP_SOURCE_ROOT` to the original read-only engine source; point diagnostic
schema input to the reviewed diagnostic source. Tests use synthetic receipt
objects and a minimal WASM module only for export-name inspection. These are
explicit CPU test inputs, not successful real producer receipts. Missing-input
freeze tests leave no usable lock. The existing real failed v2 row is replayed
through the unchanged contract and must still fail its byte-baseline assertion.

## Explicit new cohort, not an old-lock migration

The SDK226 v1 inputs/receipts are not admitted by this v2 profile. The new main
schema is `3a1c552650979c205898c90c4d862483810b66dc5c875f155c80e92fb15618da`,
source manifest `98a5a8faf357be69708a8f832b10124990c5e26de67d74d23c1043bd46b227a5`.
Expected SDK227 is a future artifact requirement, not a claim that a build has
completed. The real product gate must verify the new native39 / WASM10 regression
results while retaining the full 37 / 92 / 84 / 55 producer gate inventory.
Readiness still does not qualify C20, I05 or I06. No prior failed result or missing
snapshot is replaced, zero-filled, or attributed by source/CPU tests.
