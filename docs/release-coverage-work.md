# Release coverage work (2026-09-26)

The 1.2.0 engine builds and passes its current runtime, package-consumer, V1.1 example, and V1.2 feature checks. This does not satisfy the V1.1 API Coverage Release Gate. Run `npm run verify:release` on a frozen candidate for the full verdict; `npm run verify:api-coverage` now enforces the formal coverage thresholds.

## Frozen baseline and remaining proof

At commit `f50a16d`, the report contained 144 stable examples and 481 verified units. Core was 315/816 and Important 55/1773. The old generator marked every Advanced unit optional, leaving its Release denominator at zero. These are historical figures from before the inventory revision below.

The release gate also requires every unverified Important unit to have an explicit status, and Advanced to meet the separate ≤20% documented-only and zero-uncovered rules. It checks that the V1.1, DevTools, Gallery, and V1.2 matrix evidence belongs to the candidate being released.

## Inventory correction before additional waves

The old `tools/examples/api-inventory.cjs` parsed declaration text with regular expressions. It marked all Advanced units optional and counted underscore members and some internal/deprecated classes. An AST trial initially found 76 Manifest claims missing from its output: 34 had a root name in the bundle export clause, while 42 did not. Those claims were reconciled against real namespace paths and the declaration AST before the production switch; the remaining five `DevToolsSession.*` claims are outside the engine runtime inventory.

The revision keeps aliases, supporting declarations, and internal declarations visible in the inventory, while excluding supporting/internal units from `coverageRequired`. Its tier policy is based on declaration shape and feature namespace rather than observed coverage. A denominator change alone is not coverage progress; the browser evidence chain must be refreshed before reporting new verified rates.

### 2026-09-26 inventory revision (canonical evidence refreshed)

The AST generator is now the canonical `gallery:api` command. Its deterministic declaration fingerprint and `apiInventoryRevision` replace the prior time-only marker. Current frozen counts are Core 963, Important 272, Advanced 3,130, Supporting 5,213, Internal 2,651; all three release tiers have a nonempty `coverageRequired` denominator. Static and instance methods sharing a name are separate units. The Advanced policy includes DragonBones user-facing assets/display classes, geometry ray/AABB/intersection APIs, and the render-scene camera; lower-level vendor namespaces remain Supporting. The generator refuses to overwrite the canonical inventory if any Manifest runtime claim is absent. Five `DevToolsSession.*` claims are intentionally external to the runtime inventory. Repeating `gallery:api` after the static/instance split produced an identical file hash.

Nineteen example specifications were reconciled to actual declaration paths and duplicate alias claims were merged. Browser trials exposed false static calls in Vec/Rect/Quat/Mat examples, pre-scene reads in the camera/light examples, and a Tween startup-frame timing race. These were corrected against declaration signatures and verified by the canonical Chromium run against the unchanged engine bundle (`8746fc59b6aa0408`): 140/140 PASS, `completed=true`, `partial=false`, `unproven=0`. The current proof inventory contains 3,338 verified and 234 attested API/example bindings. Specification validation is 145/145; compliance has 0 fail / 1 documented Draco warning. The V1.2 matrix is 39/39 across three engines and the static Gallery artifact is 211/211.

`verify:api-coverage` recomputed from that completed evidence reports Core 445/963 (46.2%), Important 106/272 (39.0%), Advanced 137/3,130 (4.4%) verified, with zero stale examples and zero evidence schema gaps. Waves 4–5 added 50 Important verified units with 0 removals; Wave 2 added 98 Core verified instance-method units with 0 removals; Wave 3 added 14 Tween verified units with 0 removals. The 100%/90%/80% release gates still fail. The remaining gaps are Core 518, Important at least 139 to reach 90%, and Advanced at least 2,367 to reach 80%; Important statuses and Advanced documented-only/uncovered rules also remain open.

The production `verify:api-coverage` command now applies the taskbook's 100%/90%/80% thresholds and rejects stale/schema-gap evidence. It also exposes `documentedOnly`, `uncovered`, and `unstated` counts for the Important and Advanced closure rules. It is expected to fail until real behavior proof and statuses close those gaps.

## Coverage waves

After the inventory revision, group missing required units by feature and class. Each wave should add example behavior checks and `api.evidence` bindings, run focused trial validation, then run the canonical V1.1 browser verification and coverage report. Count only fresh `apiProof.proof=verified` units. Prioritize unverified Core units, then Important runtime features and V1.2 feature groups designated Advanced-required. Record added, removed, and stale units after each wave. Do not weaken the 100%/90%/80% thresholds to reach a green report.
