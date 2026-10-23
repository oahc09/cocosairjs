# Recover the frozen local candidate

Use the final evidence-inclusive bundle and its companion recovery receipt, not an earlier WIP bundle. The receipt supplies the exact ref, commit, tree, bundle hash and materialized-file list. The original published parent is `96845622f5ea6ede7d4690fc670c8a5c5149c0cb`.

Required project artifacts:

- `CocosAirJS-Upstream-M4-Final-Blocked.bundle` and its recovery JSON.
- `CocosAirJS-Upstream-Recovery-Base-Frozen-Inputs.pack`, SHA256 `a71d0aa83bd8cfafa16fb9b6cd165adc4b830017ee87a9d1167120a991cae02f`.
- `CocosAirJS-Upstream-Candidate-206-207-8ddc-Artifacts.tar.gz`, SHA256 `6dc5b770f581e7a5c5005a657950b6dfa8ce2e28cec1d81958663ed9cca7941c`.
- For public input/reference CPU checks: `CocosAirJS-Upstream-Frozen-External-Test-Inputs.tar.gz` and its hash inventory. This contains no model access or credentials.
- The fixed root `package-lock.json`; restore its dependencies separately from the official registry. The retained 13,045-entry installed-file inventory identifies the tested dependency bytes/modes/links. It is not a bundled node_modules installation.

## Partial Git restoration

Create a new empty Git directory. Import the base pack using `git index-pack --stdin`, mark `b573be0741db9e2a13d38ce7e65870b97a1f5fbc` as the shallow boundary in `.git/shallow`, and point a local base ref at the published parent. Verify the final bundle before unbundling it; set a local restoration ref to the exact commit in its receipt.

Read that commit into the index and materialize only the receipt's `materializedFiles` paths with `git checkout-index --stdin`. All paths are repository-relative. Do not perform an unrestricted checkout and then suppress missing-object failures: 2,814 other historical objects are deliberately not in this partial source cache. This is not a full historical clone. The new base pack includes the original prerequisite objects required for the measured source inputs; the bundle supplies changed/new files.

Extract the built-artifact archive into the restored root and compare every source/artifact SHA256 against `candidate-snapshot.json` in `m4-final-attempts.tar.gz`. The companion recovery receipt also binds supplementary project files, including root test/build configuration. Restore external test inputs into a sibling named `<restored-directory>-inputs`; point `THREE_REFERENCE_PACKAGE_DIR` at its `agent-input-preparation/three-0.186.1/package` directory. Pin the modern compiler to the recorded 5.9.3 tooling path rather than installing an arbitrary latest version.

## Verification scope

The independently restored code candidate reproduced all frozen source/artifact identities, the 136 assertions across the three formerly omitted suites, 276 Node contract tests without skips, both source/fixture typechecks, and a real npm pack/install consumer. The consumer archive exactly matched `8ddc2e5e2d95dbf5739e7f6e361ac382c162bf98724361e617344295bcf8eb6b`.

The final evidence-only checkpoint is separately unbundled and checked against the same frozen executable-source snapshot. Its final post-restoration receipt is delivered alongside the bundle to avoid a circular claim that a commit contains evidence of testing itself. Earlier sparse-index omissions, the first missing-base-object restoration, scoped skips and the missing-external-knowledge-input failure remain retained.

A new build creates new build counters/time identities. Never stamp a fresh build with this candidate's browser/model results: this candidate has no successful browser/model campaign at all. The complete CPU campaign remains 3,694 PASS / 8 FAIL, and Engine/Agent admission remains BLOCKED. See [FINAL.md](FINAL.md).
