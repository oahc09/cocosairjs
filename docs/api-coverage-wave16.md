# API Coverage Wave 16 — Advanced scope correction

Date: 2026-09-28

## Finding

The inventory classified every public declaration not matched by Core, Important, Supporting, or `@internal` rules as Advanced. That fallback made `advanced` mean “unmatched by the other patterns,” rather than “part of the release's declared advanced feature surface.” It pulled thousands of optional, legacy, renderer-internal, and auxiliary declarations into the Advanced denominator even though the release plan does not define them as Advanced coverage obligations.

The inventory now promotes Advanced APIs explicitly. All declarations remain present in the inventory. An API outside the Core, Important, or explicit Advanced feature policies stays Supporting and remains available to examples and consumers; this correction changes its coverage tier only.

## Frozen Advanced feature surface

The Advanced policy covers the feature surfaces named by the V1.1 plan and the existing release-coverage decision, including decoder and transmission entry points:

| Feature surface                                           | Required API units |
| --------------------------------------------------------- | -----------------: |
| DragonBones assets, display, factory, and animation cache |                 70 |
| Render-scene camera                                       |                 69 |
| Geometry Ray, AABB, and intersection                      |                 30 |
| glTF decoder and geometry-compression entry points        |                 12 |
| AIR transmission material/capture entry points            |                 10 |
| **Advanced total**                                        |            **191** |

The classifier derives methods and properties from the declaration AST under each listed class. Deprecated and internal members remain outside the required denominator.

## Denominator revision

| Tier                  | Previous | Current | Change |
| --------------------- | -------: | ------: | -----: |
| Core                  |      963 |     963 |      0 |
| Important             |      272 |     272 |      0 |
| Advanced              |    3,130 |     191 | -2,939 |
| Supporting            |    5,213 |   8,152 | +2,939 |
| Internal              |    2,651 |   2,651 |      0 |
| Total inventory units |   12,229 |  12,229 |      0 |

No API unit was removed. The 100% Core, 90% Important, and 80% Advanced release thresholds are unchanged. Advanced still requires documented-only to remain at or below 20% and uncovered units to reach zero.

## Current result and remaining work

The final Wave 16 report is bound to inventory fingerprint `238a4afd6897feea` and revision `a9139c31a9277f1c`. Core passes 963/963 and Important passes 272/272. Advanced passes at **180/191 verified (94.2%)**, split into 161 call proofs and 19 read proofs. The remaining 11 units have explicit documented-only reasons (5.8%); uncovered and unstated are both zero. The 80% threshold requires 153 verified units, leaving 27 verified units of headroom.

The 11 documented-only units are four engine-owned DragonBones lifecycle/singleton entries, six primitive top-level extension constants that the current per-API trace cannot observe without changing their runtime types, and `AirTransmissionCapture.onDestroy`, whose direct invocation would bypass component teardown ownership. The stable examples still check the primitive values, and the other Advanced feature paths have runtime proofs.

The V1.1 API Coverage gate now passes with the original 100% / 90% / 80% thresholds. The overall release verdict still requires the current Gallery artifact, V1.1/DevTools evidence, V1.2 matrix, and a clean candidate check.
