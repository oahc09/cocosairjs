# API coverage Wave 15 — Skeletal, UI, and texture resource surfaces

Wave 15 closes the remaining **77 required Important API units** with 0 removals against Wave 14. Important coverage now passes its 90% release threshold and is fully verified at 272/272.

## Scope and implementation

The Code First skinned-animation example now reads and exercises `Skeleton`, `SkinnedMeshRenderer`, `SkinnedMeshUnit`, and `SkeletalAnimation` APIs, including socket management and real component lifecycle hooks. The texture example uses its generated checkerboard `Texture2D` as all six cubemap faces to validate `TextureCube` constructors, mipmaps, reset/update, default initialization, validation, and teardown. The custom-gradient shader example verifies the remaining `EffectAsset` registry and data fields. A new `ui-api-lifecycle` example probes Widget editor margins/alignment and UIRenderer, Sprite, and Label lifecycle behavior on disposable off-screen nodes.

The 77 units are grouped as 38 skeletal/skinned-mesh, 17 Widget/UI renderer, 15 TextureCube, and 7 EffectAsset units. Existing V1.2 contract examples were not changed; the new UI lifecycle sample is outside that matrix.

## Evidence

The canonical V1.1 browser run passed 141/141, with 0 promotions, 0 demotions, 4,130 verified API/example bindings, 66 attested, and 0 unproven. The V1.1 chain-face check passed all 141 records on candidate `7f3b89f6ac076cbf`. DevTools passed 5/5 with the runtime bundle boundary passing. The Gallery artifact passed 219/219 with 146 examples, 141 runnable examples, and 52 lifecycle contracts.

Strict spec validation passed 146/146 frozen. Compliance remains 0 failures / 1 documented Draco decoder-availability warning. Test inventory remains 32 suites / 265 tests; typecheck, Prettier, API trace self-test, file map, web-only, and documentation-reference checks passed. The V1.2 Chromium/Firefox/WebKit matrix remains 39/39.

## Coverage and release status

Coverage is Core **963/963 (100%)**, Important **272/272 (100%)**, and Advanced **149/3,130 (4.8%)**. Important has 0 unverified units without a status. Advanced still has 2,981 uncovered units and is now the only release-gate area requiring API scope/evidence work.

The release candidate remains **NOT READY** until Advanced reaches at least 80% verified (2,504 units) and all remaining units have valid coverage disposition. Keep the 100%/90%/80% thresholds unchanged.
