# Box3D exact incremental-chain guard controls

Result: revised frozen guards passed all 47 controls (3 positive, 44 negative).
This artifact is intentionally small and contains no Git bundle or repository
copy. It is not the actual checkpoint37 Library download or restoration proof.

## Retained RED, then corrected control result

The initial guard accepted a declared legacy22 prerequisite when the caller
supplied the actual checkpoint36 source receipt, without requiring checkpoint36
source/proof identity pins. It did not compare the Git bundle header to the
declared prerequisite. `initial-red-receipt.json`, the initial exact source
snapshots, reproducer and logs preserve that finding unchanged.

The revised restore source adds `validate_bundle_header`. Under that exact
source, the same metadata downgrade is rejected when the synthetic v2 bundle
header declares the actual checkpoint36 prerequisite. The compatibility
positive control still accepts a legacy22 declaration with a matching22 header,
because an older cumulative22-to-N bundle can legitimately be applied to an
already verified intermediate store.

The revised result is in `joint-guard-receipt.json`; case-by-case inputs and
outcomes are reproducible from `joint-guard-controls.py`, with full results in
`joint-guard-cases.json` and `joint-guard.stdout.log`. Both stderr logs are empty;
both process exit codes are zero. The initial process intentionally exits zero
when it successfully reproduces the RED boundary, not when the old guard is safe.

## Exact-source method and limitations

- Frozen complete source snapshots are in `sources/` and `revised-sources/`.
- The tests compile selected AST nodes from those exact snapshots. They do not
  import or execute the top-level restore/generator programs.
- The revised test executes the exact two validator functions, exact ZIP
  preflight block, exact prerequisite-builder block, and exact prior-file read.
- The prior checkpoint36 source receipt is read and hashed, never copied. Its
  genuine Library proof is retained as `actual36-library-proof.json`.
- Candidate checkpoint37 metadata, ZIP members and bundle headers are synthetic.
  The synthetic bundle payload is not a Git pack and is never passed to Git.
- All extraction writes are in-memory counters. All 44 negative controls reject
  with zero extraction writes. No Git/subprocess operation or actual restore
  store access is performed by either test program.
- Static AST ordering corroborates the pre-extraction checks: prior-file read
  line76, prerequisite guard line79, bundle-header guard line81, extraction
  line87, Git fetch/checkout loop line100. The builder checks are before output
  creation and bundle creation.
- Python assertions must be enabled. The recorded commands use `python -B`, not
  `python -O`. These are bounded unit/preflight controls, not a general audit or
  proof of behavior under optimized Python.

The supported declared recovery dependency remains base22, then the exact
checkpoint36 source+Library identity, then checkpoint37. This does not assert
that every prior actual restore began directly at22; the retained checkpoint36
proof records the actual previous verified store used for that operation.
No standalone/full-repository restore, build closure or physical acceptance is
claimed. The lead owns actual37 Library download and full-file verification.

## Coverage

Positive controls cover exact36 and compatible legacy22 preflight, plus the
paired builder. Negative controls cover missing source/proof fields, missing
source/proof files, wrong base commit/tree, source/Library hashes, archive byte
count/hash, Library/file IDs, missing ancestors, wrong predecessor, proof
status/commit/tree/bundle, unsafe proof paths, the retained legacy downgrade,
wrong/missing/multiple bundle prerequisites or refs, wrong head/branch/version,
truncated/oversized headers, non-hex prerequisite, unsafe bundle filename,
unpaired builder arguments and source/proof/predecessor mismatches.

## Rerun without overwriting evidence

Both scripts use exclusive result-file creation. The recorded commands were:

`python -B initial-red-controls.py`

`python -B joint-guard-controls.py`

To rerun, copy only the scripts, source snapshot directories,
`actual36-library-proof.json` and `initial-source-hashes.json` into a fresh
sibling directory beside the repository, then run the joint script there.
Keep the current evidence directory unchanged. The original checkpoint36
source receipt must still be available at its recorded sibling path; its full
SHA-256 is checked before any test. No external package is needed.

`artifact-manifest.json` records artifact byte counts and SHA-256 values except
its own (to avoid a circular hash). The parent directory byte total is below
250,000 bytes.
