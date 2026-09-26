# API Coverage Wave 2 — math instance methods

Baseline: commit `82909ba`, Core 347/963 verified, with a complete 140/140 V1.1 browser run and zero stale evidence. The inventory revision `190aa74d8e4fcbc8` distinguishes static and instance methods that share a name; this wave targets the 98 required instance units under `math.Vec2`, `Vec3`, `Vec4`, `Quat`, `Mat3`, `Mat4`, `Size`, `Rect`, and `Color`.

Each contract lives beside the corresponding math example source. Each checks concrete numeric behavior, including vector arithmetic and transforms, quaternion interpolation, matrix inverse/composition, rectangle and size interpolation, and color conversion. A failed assertion leaves `window.__trialProbe.ok=false`, which blocks V1.1 browser verification. The matching `example.json` entries bind each method to its exact source line and an executed validator. This wave does not add or promote Gallery examples.

Focused plain-browser trials passed every behavior assertion. Focused instrumented V1.1 runs passed for all nine example groups and recorded 98/98 targeted units as `apiProof.proof=verified`. The canonical Chromium batch then passed 140/140 with `completed=true`, `partial=false`, zero demotions, and 0 unproven example-level proofs. Specification validation passed 145/145; compliance had 0 fail and the pre-existing Draco decoder-required warning.

The regenerated coverage report has zero stale examples and zero evidence schema gaps. Total verified units rose from 590 to 688: **98 added, 0 removed**. Core rose from **347/963 (36.0%)** to **445/963 (46.2%)**. Important remains 42/272 and Advanced 137/3,130. The V1.1 Release thresholds remain unmet; this wave is a verified increment, not a release acceptance claim.
