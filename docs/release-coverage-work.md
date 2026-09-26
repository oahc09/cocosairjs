# Release coverage work (2026-09-26)

The 1.2.0 engine builds and passes its current runtime, package-consumer, V1.1 example, and V1.2 feature checks. This does not satisfy the V1.1 API Coverage Release Gate. Run `npm run verify:release` on a frozen candidate to see the formal verdict; `npm run verify:api-coverage` is a lower-bound regression check.

## Frozen baseline and remaining proof

At commit `f50a16d`, the report contains 144 stable examples and 481 verified units. Core is 315/816 and requires 501 additional verified units. Important is 55/1773 and requires at least 1,541 additional verified units to reach 90%. The Advanced required denominator is zero because the current inventory generator marks every Advanced unit optional. This is an inventory defect to resolve before an Advanced percentage can be accepted; 111/5471 is only a disclosure count, not the §23 Release denominator.

The release gate also requires every unverified Important unit to have an explicit status, and Advanced to meet the separate ≤20% documented-only and zero-uncovered rules. It checks that the V1.1, DevTools, Gallery, and V1.2 matrix evidence belongs to the candidate being released.

## Inventory correction before additional waves

`tools/examples/api-inventory.cjs` parses declaration text with regular expressions. It currently classifies all Advanced units as `coverageRequired=false`, treats underscore members as public coverage units, and can include classes documented as internal or deprecated. The trial AST audit in `tools/examples/api-inventory-v2.cjs` writes only to an explicit `--out` path. It is not yet a replacement: against the committed Manifest, 76 existing claims do not match its trial output after resolving direct `export import` aliases. Of those 76, 34 have a root name present in the shipped bundle's export clause; 42 do not. The remaining differences include inherited members, legacy flattened nested namespaces, and symbols not declared as direct public exports. Switching the production inventory before reconciling those names would break existing claims and evidence.

The next inventory revision must resolve aliases, distinguish public user-facing APIs from supporting/internal declarations using a reviewed policy, record a stable source fingerprint, and produce a before/after mapping for every removed or re-tiered unit. Review the policy independently of current coverage results. Then regenerate the inventory and coverage report, fix spec claims that referred to false units, and rerun the full browser evidence chain. A denominator change alone is not coverage progress.

## Coverage waves

After the inventory revision, group missing required units by feature and class. Each wave should add example behavior checks and `api.evidence` bindings, run focused trial validation, then run the canonical V1.1 browser verification and coverage report. Count only fresh `apiProof.proof=verified` units. Prioritize unverified Core units, then Important runtime features and V1.2 feature groups designated Advanced-required. Record added, removed, and stale units after each wave. Do not weaken the 100%/90%/80% thresholds to reach a green report.
