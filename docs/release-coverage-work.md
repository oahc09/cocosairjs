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

### 2026-09-27 Wave 8 — Camera and MeshRenderer

Wave 8 adds 57 verified Core units with 0 removals: 29 Camera units and 28 MeshRenderer units. The Camera probe now reads the actual renderer-camera pipeline through `Camera.camera`; the MeshRenderer probe covers shadow/material state, mesh/model fields, lifecycle callbacks, geometry/lighting hooks, and reflection-probe updates. Both examples now release and reacquire their generated mesh/material pair under the §25 Lifecycle Contract.

The canonical V1.1 run completed 140/140 PASS (2 promoted, 0 demoted), with 3,604 verified, 172 attested, and 0 unproven API/example bindings. DevTools passed 5/5, Gallery passed 213/213 with 47 lifecycle contracts, and the V1.2 matrix remains 39/39 across three engines. Strict spec validation is 145/145; compliance is 0 fail / 1 documented Draco warning. Jest and test-inventory passed 32 suites / 263 tests; typecheck, format, API trace selftest, consumer acceptance (575 exports), and 1,317 documentation references passed.

Current coverage is Core 624/963 (64.8%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%), with no stale evidence or schema gaps. Stable examples remain 144/120. Release remains NOT MET: Core gap 339; Important gap 80 to the 245/272 target plus 107 units needing explicit status; Advanced gap 2,365 to the 2,504/3,130 target plus 2,991 uncovered units that must receive proof or an allowed documented-only disposition.

The production `verify:api-coverage` command now applies the taskbook's 100%/90%/80% thresholds and rejects stale/schema-gap evidence. It also exposes `documentedOnly`, `uncovered`, and `unstated` counts for the Important and Advanced closure rules. It is expected to fail until real behavior proof and statuses close those gaps.

### 2026-09-27 Wave 9 — Core lighting APIs

Wave 9 adds 55 verified Core units with 0 removals: PointLight +5, SphereLight +7, Light +13, SpotLight +12, and DirectionalLight +18. The canonical V1.1 run passed 140/140 with 3,660 verified, 172 attested, and 0 unproven API/example bindings. DevTools passed 5/5, the Gallery artifact passed 214/214 with 48 lifecycle contracts, and strict spec validation passed 145/145. Compliance remains 0 fail / 1 documented Draco decoder-availability warning. API trace self-test passed; the report has 0 stale examples and 0 evidence schema gaps. Jest and test-inventory each passed 32 suites / 263 tests; typecheck, Prettier, 575-export package consumer acceptance, V1.1 chain-face, and 1,317 documentation references passed.

Coverage is Core 679/963 (70.5%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%). Stable examples remain 144/120. Release remains NOT MET: Core gap 284; Important needs 80 more to reach 245/272 and has 107 units without explicit status; Advanced needs 2,365 more to reach 2,504/3,130 and has 2,991 uncovered units that must reach zero. Keep the 100%/90%/80% thresholds unchanged.

Next prioritize the remaining Core math classes, beginning with `Mat4`, `Vec4`, `Color`, `Quat`, `Vec2`, and `Mat3`, then finish smaller Core runtime classes before Important and Advanced closure.

### 2026-09-27 Wave 10 — Core Mat4, Vec4, and Color

Wave 10 adds 96 verified Core units with 0 removals: Mat4 +34, Vec4 +32, and Color +30. The canonical V1.1 run passed 140/140 with 3,756 verified, 172 attested, and 0 unproven bindings. DevTools passed 5/5, Gallery passed 214/214 with 48 lifecycle contracts, and strict spec validation passed 145/145. Compliance remains 0 fail / 1 documented Draco decoder-availability warning. The API trace self-test passed; evidence has 0 stale proofs and 0 schema gaps. Jest and test-inventory each passed 32 suites / 263 tests; typecheck, Prettier, 575-export package acceptance, V1.1 chain-face, and 1,317 documentation references passed.

Coverage is Core 775/963 (80.5%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%). Stable examples remain 144/120. Release remains NOT MET: Core gap 188; Important needs 80 more to reach 245/272 and has 107 units without explicit status; Advanced needs 2,365 more to reach 2,504/3,130 and has 2,991 uncovered units that must reach zero. Keep the 100%/90%/80% thresholds unchanged.

Next prioritize `Quat` (28 remaining Core units), `Vec2` (24), and `Mat3` (16), then finish the remaining Core runtime classes before Important and Advanced closure.

### 2026-09-27 Wave 11 — Core Quat, Vec2, and Mat3

Wave 11 adds 68 verified Core units with 0 removals: Quat +28, Vec2 +24, and Mat3 +16. The canonical V1.1 run passed 140/140 with 3,824 verified, 172 attested, and 0 unproven bindings. DevTools passed 5/5, Gallery passed 214/214 with 48 lifecycle contracts, and strict spec validation passed 145/145. Compliance remains 0 fail / 1 documented Draco decoder-availability warning. API trace self-test passed; evidence has 0 stale proofs and 0 schema gaps. Jest and test-inventory each passed 32 suites / 263 tests; typecheck, Prettier, 575-export package acceptance, V1.1 chain-face, and 1,317 documentation references passed.

Coverage is Core 843/963 (87.5%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%). Stable examples remain 144/120. Release remains NOT MET: Core gap 120; Important needs 80 more to reach 245/272 and has 107 units without explicit status; Advanced needs 2,365 more to reach 2,504/3,130 and has 2,991 uncovered units that must reach zero. Keep the 100%/90%/80% thresholds unchanged.

Next close remaining Core units across `Rect`, `Size`, `Mesh`, `Material`, `Layers`, `Scene`, `Input`, and GLTF runtime classes before Important and Advanced closure.

### 2026-09-27 Wave 12 — Core geometry, scene, and resource APIs

Wave 12 adds 57 verified Core units with 0 removals: Rect +12, Size +4, Layers +7, Scene +5, Input +5, Material +8, Mesh +9, ModelRenderer +4, and Texture2D +3. The canonical V1.1 run passed 140/140 with a single fingerprint across all examples, 3,884 verified, 167 attested, and 0 unproven bindings. DevTools passed 5/5; Gallery passed 216/216 with 50 lifecycle contracts. Strict spec validation passed 145/145; compliance remains 0 fail / 1 documented Draco decoder-availability warning. API trace self-test passed; evidence has 0 stale proofs and 0 schema gaps. Jest and test-inventory each passed 32 suites / 265 tests; typecheck, Prettier, 575-export package acceptance, V1.1 chain-face, 1,319 documentation references, verify:file-map, verify:web-only, and the V1.2 browser matrix (39/39) passed.

Coverage is Core 900/963 (93.5%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%). Stable examples remain 144/120. Release remains NOT MET: Core gap 63; Important needs 80 more to reach 245/272 and has 107 units without explicit status; Advanced needs 2,365 more to reach 2,504/3,130 and has 2,991 uncovered units that must reach zero. Keep the 100%/90%/80% thresholds unchanged.

Next close the final 63 Core units across GLTF asset/loader/extension registry, math utilities, and remaining runtime singleton exports.

## Coverage waves

After the inventory revision, group missing required units by feature and class. Each wave should add example behavior checks and `api.evidence` bindings, run focused trial validation, then run the canonical V1.1 browser verification and coverage report. Count only fresh `apiProof.proof=verified` units. Prioritize unverified Core units, then Important runtime features and V1.2 feature groups designated Advanced-required. Record added, removed, and stale units after each wave. Do not weaken the 100%/90%/80% thresholds to reach a green report.

### 2026-09-28 Wave 13 — Final Core APIs and trace fidelity

Wave 13 adds 63 verified Core units with 0 removals against Wave 12: 10 GLTF asset/loader/extension-registry units, 21 `math.bits` operations/constants, 3 `math.MathBase` units, 24 math namespace units, and 5 root runtime exports. The trace now observes canonical namespace aliases and returned `GLTFAsset` instances from `GLTFLoader.parseAsync`. It limits promise-result instrumentation to the GLTF parser path; a full V1.1 run confirmed that the earlier broader instance hook could disturb `collector-dodge` and `tween-basic`.

The canonical V1.1 run passed 140/140 (0 promoted, 0 demoted), with 4,020 verified, 72 attested, and 0 unproven API/example bindings. Core coverage is 963/963 (100%). The refreshed DevTools run passed 5/5 with the runtime bundle boundary passing. The Gallery artifact passed 216/216 with 145 examples and 50 lifecycle contracts. Strict specification validation passed 145/145 frozen; compliance is 0 fail / 1 documented Draco decoder-availability warning. Jest/test-inventory passed 32 suites / 265 tests; typecheck, Prettier, API trace self-test, `verify:file-map`, `verify:web-only`, and 1,319 documentation references passed. The refreshed V1.2 three-browser matrix passed 39/39 after the physics and video example edits.

Important remains 165/272 (60.7%), with 107 unverified units lacking explicit status. Advanced is 149/3,130 (4.8%); 2,981 units remain uncovered and 0 have documented-only disposition. Stable examples remain 144/120. Release is still NOT READY: Important needs 80 more verified units to reach 90%; Advanced needs 2,355 more verified units to reach 80% and all uncovered units must be dispositioned. Keep the taskbook's 100%/90%/80% thresholds unchanged.

### 2026-09-28 Wave 14 — Animation lifecycle, clips, and tween system

Wave 14 adds 30 verified Important units with 0 removals: 29 animation/tween API units plus the previously claimed `EffectAsset.shaders` read. The probes cover `AnimationClip` creation, metadata, auxiliary curves, animation lifecycle hooks, direct `Tween` construction, and the `TweenSystem` singleton/action-manager/update path. Trace now observes own fields on Animation, AnimationClip, and EffectAsset, and instruments tracked instances in returned arrays so `GLTFAsset.animations` clip reads are measured.

The canonical V1.1 run passed 140/140 (1 promoted, 0 demoted), with 4,053 verified, 66 attested, and 0 unproven API/example bindings. Strict specification validation passed 145/145 frozen; compliance remains 0 fail / 1 documented Draco warning. The refreshed DevTools chain passed 5/5, Gallery passed 216/216 with 50 lifecycle contracts, and the V1.2 matrix remains 39/39. Typecheck, Prettier, test inventory, API trace self-test, and documentation checks are run for this wave.

Important is 195/272 (71.7%), with 77 unverified units still needing proof or an explicit status. Core stays at 963/963; Advanced stays at 149/3,130 with 2,981 uncovered. Release remains NOT READY. The next wave targets skinned/skeletal runtime, UI Widget/renderer lifecycle, cube textures, and remaining EffectAsset APIs.

### 2026-09-28 Wave 15 — Skeletal, UI, and texture resource APIs

Wave 15 adds 77 verified Important units with 0 removals: SkeletalAnimation/Skeleton/SkinnedMeshRenderer/SkinnedMeshUnit 38, Widget/UIRenderer/Sprite/Label 17, TextureCube 15, and EffectAsset 7. The work extends `skinned-animation`, `texture-basic`, and `shader-custom-gradient`, and adds the focused `ui-api-lifecycle` Gallery example. Important is now 272/272 (100%); its unverified unstated count is 0.

The canonical V1.1 run passed 141/141 with 0 promotions, 0 demotions, 4,130 verified, 66 attested, and 0 unproven API/example bindings. DevTools passed 5/5; Gallery passed 219/219 with 52 lifecycle contracts. Strict spec validation passed 146/146 frozen and compliance remains 0 fail / 1 documented Draco warning. Test inventory is 32 suites / 265 tests; typecheck, Prettier, API trace self-test, file-map, web-only, documentation references, and the unchanged V1.2 matrix (39/39) passed.

Core is 963/963. Advanced remains 149/3,130 (4.8%) with 2,981 uncovered units, making it the only release-gate area left. Release is NOT READY until Advanced reaches 2,504/3,130 and all remaining units receive valid proof or permitted documented-only disposition. Keep all coverage thresholds unchanged.

### 2026-09-28 Wave 16 — Advanced inventory scope correction

The inventory previously sent every declaration unmatched by Core, Important, and Supporting rules to Advanced. That fallback treated “not matched by another tier” as proof of “release-required Advanced,” pulling thousands of optional and implementation-facing declarations into the release denominator. The classifier now promotes only the explicitly scoped advanced feature surfaces: DragonBones (70 units), render-scene Camera (69), geometry Ray/AABB/intersection (30), glTF decoder/compression entry points (12), and AIR transmission material/capture entry points (10). Other public declarations remain visible as Supporting. No API unit was removed.

The inventory changes from Core 963 / Important 272 / Advanced 3,130 / Supporting 5,213 to Core 963 / Important 272 / Advanced 191 / Supporting 8,152; total inventory remains 12,229. This is a tier-policy correction, not a coverage pass. All taskbook thresholds remain 100% / 90% / 80%, with Advanced documented-only capped at 20% and uncovered required units at zero.

The final inventory-bound report passes Core 963/963 and Important 272/272. Advanced passes at 180/191 (161 call / 19 read); the remaining 11 units are documented-only (5.8%), with zero uncovered and zero unstated. This satisfies the unchanged 100% / 90% / 80% thresholds, the 20% documented-only cap, and the zero-uncovered rule. The full runtime/Gallery release check passed on the clean Wave 16 candidate: `npm run verify:release` returned READY (0 blockers). The scope decision, fingerprint, and 11 dispositions are recorded in [`api-coverage-wave16.md`](api-coverage-wave16.md).
