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

Nineteen example specifications were reconciled to actual declaration paths and duplicate alias claims were merged. Browser trials exposed false static calls in Vec/Rect/Quat/Mat examples, pre-scene reads in the camera/light examples, and a Tween startup-frame timing race. These were corrected against declaration signatures and verified by the canonical Chromium run against the unchanged engine bundle (`8746fc59b6aa0408`): 140/140 PASS, `completed=true`, `partial=false`, `unproven=0`. At the end of Wave 5, the proof inventory contained 3,338 verified and 234 attested API/example bindings. Specification validation was 145/145; compliance had 0 fail / 1 documented Draco warning. The V1.2 matrix was 39/39 across three engines and the static Gallery artifact was 211/211.

At the end of Wave 5, `verify:api-coverage` reported Core 445/963 (46.2%), Important 106/272 (39.0%), Advanced 137/3,130 (4.4%) verified, with zero stale examples and zero evidence schema gaps. Waves 4–5 had added 50 Important verified units with 0 removals; Wave 2 added 98 Core verified instance-method units with 0 removals; Wave 3 added 14 Tween verified units with 0 removals. Those historical gates were still below 100%/90%/80%.

### 2026-09-27 Wave 6 — UI component API coverage

The UI Gallery example now reads and exercises 61 Label, Sprite, and UIRenderer API units, including component lifecycle, text rendering, sprite frame and fill configuration, enum values, and renderer material properties. The focused V1.1 run proved all 61 units. The Gallery artifact verifier now waits for the asynchronous GLB fetch/parse result before checking decoder requests, and the V1.1 runner clears its per-example timeout after completion.

The API trace records reads of configurable static data properties on a separate `read` channel, so the exact enum member must be read before it can count as verified. Non-configurable constants remain not instrumentable. A second guard keeps constructor metadata such as `Function.length` from shadowing a same-named instance method such as `Quat.length`; the instance method remains call-counted on its prototype.

Wave 6 added 63 verified units with 0 removals: Core +3, Important +59, Advanced +1. The full V1.1 run completed 140/140 PASS (7 promoted, 0 demoted), with 3,403 verified, 228 attested, and 0 unproven API/example bindings. The DevTools chain completed 5/5 PASS with the runtime bundle boundary passing and 0 unproven bindings. Current specification validation is 145/145 frozen, compliance is 0 fail / 1 documented Draco warning, the Gallery artifact is 211/211, and the V1.2 matrix is 39/39 across Chromium, Firefox, and WebKit. Tarball consumer acceptance passed with 575 exports and 0 failures. Jest passed 32 suites / 263 tests; typecheck and Prettier pass; documentation references have 0 unresolved and 0 stale baseline entries.

The current API report has zero stale examples and zero evidence schema gaps. Core is 448/963 (46.5%), Important 165/272 (60.7%), and Advanced 138/3,130 (4.4%). Stable examples are 144/120, so that count gate passes. The Release gate remains NOT MET: Core needs 515 more verified units; Important needs at least 80 more to reach 245/272 and has 107 unverified units without explicit status; Advanced needs 2,366 more to reach 2,504/3,130, and still has 2,992 uncovered units. Advanced must ultimately have zero uncovered units, with documented-only capped at 626 (20% of its denominator). Do not alter the 100%/90%/80% thresholds.

### 2026-09-27 Wave 7 — Core Node and math surfaces

Wave 7 adds 120 verified units with 0 removals relative to committed Wave 6: Core +119 and Advanced +1. The work covers 41 Node APIs, 43 Vec3 constants/static operations/component fields, and verified value-type fields for Mat3, Mat4, Quat, Rect, Size, Vec2, and Vec4. It also corrects the Camera example to read `renderer.scene.Camera.pipeline` through `Camera.camera`, and removes a duplicate/wrong `math.Mat4.m04` claim from the Mat3 example.

The canonical V1.1 run completed 140/140 PASS, with 1 promotion, 0 demotions, and 3,547 verified / 173 attested / 0 unproven API/example bindings. Gallery is 211/211; the V1.2 matrix remains 39/39; DevTools is 5/5. Specification validation is 145/145 frozen and compliance is 0 fail / 1 documented Draco warning. Jest passed 32 suites / 263 tests; typecheck, Prettier, API trace selftest, consumer acceptance (575 exports), test inventory (32/263), and 1,317 documentation-reference checks passed. The release coverage report has 0 stale evidence and 0 schema gaps.

Current coverage is Core 567/963 (58.9%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%). Stable examples remain 144/120. Release is NOT MET: Core gap 396; Important needs 80 more verified to reach 245/272 and has 107 unverified units without explicit status; Advanced needs 2,365 more verified to reach 2,504/3,130 and has 2,991 uncovered. Advanced ultimately allows at most 626 documented-only units and requires zero uncovered units. Do not weaken the release thresholds.

The production `verify:api-coverage` command now applies the taskbook's 100%/90%/80% thresholds and rejects stale/schema-gap evidence. It also exposes `documentedOnly`, `uncovered`, and `unstated` counts for the Important and Advanced closure rules. It is expected to fail until real behavior proof and statuses close those gaps.

## Coverage waves

After the inventory revision, group missing required units by feature and class. Each wave should add example behavior checks and `api.evidence` bindings, run focused trial validation, then run the canonical V1.1 browser verification and coverage report. Count only fresh `apiProof.proof=verified` units. Prioritize unverified Core units, then Important runtime features and V1.2 feature groups designated Advanced-required. Record added, removed, and stale units after each wave. Do not weaken the 100%/90%/80% thresholds to reach a green report.
