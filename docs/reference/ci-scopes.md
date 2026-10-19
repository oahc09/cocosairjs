# CI scopes and same-head artifacts

`Code quality / quality` is the only ordinary pull-request workflow. It also runs
on main pushes and release tags. All jobs use read-only contents access; no branch
protection or repository permissions are changed. At implementation review, main
had no enforced required contexts. The former `recipes` and `skills-p1` workflows
are manual wrappers around the same implementation, not duplicate PR checks.

## Work selection

`tools/verify/ci-scope.cjs` compares two independently checked-out immutable Git
trees with NUL-delimited `ls-tree` records. Added, removed, renamed and mode-changed
paths are included. It does not assume that the two checkouts share Git objects.
Missing/unreadable base trees, empty diffs, unknown paths and non-PR automatic runs
select full retained coverage. A base-checkout read failure is the sole tolerated
auxiliary failure; it triggers the conservative plan, never a successful missing
acceptance step.

- Only `.md`/`.txt` under known docs/ai directories and root README are prose-only;
  executable manual examples remain code.
- `skills/` and `tools/skills/` retain all Skills P1 tests, safety checks and the
  lossless archive comparison against immutable revision `66d11fd0`.
- Known interactive module paths select their complete related CPU/browser suite,
  alongside mandatory core checks, SDK recipes, math/package checks and the five
  core Chromium examples. Shared source, PAL, lockfiles, build/config/workflow
  changes and unknown paths select every retained suite.
- Manual `full` and release tags run the retained full CI set. Manual `skills`
  runs Skills checks without runtime builds. A full multi-browser/canonical example
  campaign remains a separately authorized `example-evidence.yml` operation;
  this focused CI set has never certified all examples or physical devices.

## Order and retained coverage

The locked project dependencies are installed once. Formatting, generated-source
consistency, types and CPU contracts run before `build:all`. Preparation of frozen
PAL/Spark/math inputs is explicit; it is not a fresh runtime build. The single
main build produces development/minified JS, maps and declarations, followed by
one Spark build. Real tarball installation, exports/legacy TypeScript checks,
source-map identity verification and browser collectors reuse these bytes.

Mandatory code coverage retains lifecycle/ownership and GFX/audio regressions,
SDK recipes, actual package boundaries, and `shader-driver-pilot`,
`glass-refraction`, `gltf-viewer`, `input`, `spark-splats` Chromium controls. Related
suites retain timeline, geometry, multipass, mixed input, color/Water/HDR, identity,
performance contracts and installed kit entries. No pixel thresholds, original
NOT_RUN rows or physical shutdown budgets are relaxed. The previous selected
clean-checkout rerun is removed because the mandatory complete integration test
file already includes that test.

Node is pinned to 22.23.3 and browser tooling to Playwright 1.62.1. `setup-node`
caches npm downloads only; every run installs from the lockfile. No build artifact
from another commit is used. New pushes cancel obsolete runs for that PR.

## Results and provenance

The always-run final gate reads the explicit plan and every required step outcome.
Failure, cancellation, absent outcomes and required skips fail. An unrelated skip
is accepted only when the plan explicitly records that scope as false. Real mixed
input diagnostics retain incomplete NOT_RUN status: their integrity check is not
an acceptance promotion.

One artifact keeps originals, failures and timings. Fresh build bytes are copied
into `output/ci/build/` only after the successful build commands and matching-head
check, with hashes in `output/ci/build-identity.json`. A docs-only or pre-build
failure artifact therefore cannot mislabel committed old bundles as freshly built.
`output/ci/scope.json`, `gate.json` and `timings.json` record changed paths, skips,
head, Node/runner image, actual dependency-cache hit (or unknown), per-phase elapsed
time and exit status. Failed raw evidence is preserved. Compare actual runs with
runner configuration, cache state and selected scopes; a full retained run and a
prose-only run are not equivalent performance samples.

`node --test tools/verify/ci-scope.test.cjs` exercises real independent Git trees,
rename/delete/mode changes, scope classification, a failing piped CPU command,
required failure/cancel/skip propagation, source identity and workflow structure.
This is a small policy regression suite, not a replacement for engine acceptance.
