# API coverage Wave 12 — Geometry, scene, and resource APIs

Wave 12 adds 57 verified Core API units across geometry, scene/input, materials, meshes, model rendering, and textures.

## Scope and implementation

The wave covers Rect +12, Size +4, Layers +7, Scene +5, Input +5, Material +8, Mesh +9, ModelRenderer +4, and Texture2D +3. The examples now read Rect bounds/derived values, Size aliases, layer masks and registration, Scene state, Input event registration, Material state, Mesh buffers/rendering fields, ModelRenderer properties, and Texture2D image/mipmap state. `Scene.addComponent` is verified as a documented rejection. Material and mesh lifecycle contracts detach and release their generated resources before recreating them.

The API trace now instruments declared instance data fields on Scene and Mesh owners and on objects returned by traced APIs such as `utils.createMesh`. This records genuine reads of own fields such as `Mesh.morphRendering` and `Scene.autoReleaseAssets`; it does not change the release thresholds or count unobserved fields as covered.

The focused spec-driven run passed 8/8. Comparing the current coverage report with committed Wave 11 gives 57 added verified units and 0 removals, all Core.

## Evidence

The canonical V1.1 run passed 140/140 with one candidate fingerprint across all records: `7f3b89f6ac076cbf`. It recorded 3,884 verified API/example bindings, 167 attested, and 0 unproven. DevTools passed 5/5 with the runtime bundle boundary check. The packaged Gallery passed 216/216; all 140 runnable examples booted, all 50 lifecycle contracts passed, and the packaged engine matched the live bundle. The V1.2 browser matrix passed 39/39 across Chromium, Firefox, and WebKit, bound to the current bundle.

Strict spec validation passed 145/145. Compliance has 0 failures and 1 documented Draco decoder-availability warning. The API trace self-test passed; coverage has 0 stale proofs and 0 evidence schema gaps. Jest and test-inventory each passed 32 suites / 265 tests. Typecheck, Prettier, 575-export package consumer acceptance, V1.1 chain-face, 1,319 documentation references, `verify:file-map`, and `verify:web-only` passed.

## Coverage and release status

Coverage is Core 900/963 (93.5%), Important 165/272 (60.7%), and Advanced 139/3,130 (4.4%). Stable examples remain 144/120. The V1.1 Release Gate remains NOT MET: Core needs 63 more verified units; Important needs 80 more to reach 245/272 and still has 107 units without explicit status; Advanced needs 2,365 more to reach 2,504/3,130 and has 2,991 uncovered units that must reach zero, with documented-only capped at 626. Keep the 100%/90%/80% thresholds unchanged.

Wave 13 should close the remaining 63 Core units across GLTFAsset/GLTFLoader/GLTFExtensionRegistry, math.MathBase and math.bits, remaining math utility functions/constants, and runtime singleton exports before Important and Advanced work.
