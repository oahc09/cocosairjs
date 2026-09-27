# API Coverage Wave 3 — Tween control

Baseline: commit `2d0cf75`, Important 42/272 verified under API inventory revision `190aa74d8e4fcbc8`. This wave extends the existing `tween-basic` behavior probe. It exercises 14 required units: sequencing and callbacks, target rebinding, running/duration readback, custom updates, target-wide pause/resume/stop, tag stop, running count, and hide/show against a real MeshRenderer.

The probe checks observable results instead of accepting a method name in source as proof: target state reaches expected values, pause and stop freeze them, resume advances them, custom callbacks finish, and hide/show toggle Renderer.enabled. The API evidence rows bind each unit to the probe source and an executed validator. A failed check blocks browser verification.

Focused plain-browser and instrumented Chromium trials passed. The instrumented trial recorded all 14 targeted units as `apiProof.proof=verified`. The canonical Chromium batch then passed 140/140 with `completed=true`, `partial=false`, 0 demotions, and 0 unproven example-level proofs. Specification validation passed 145/145; compliance had 0 fail and the pre-existing Draco decoder-required warning.

The refreshed coverage report has zero stale examples and zero evidence schema gaps. Total verified units rose **688→702**: **14 added, 0 removed**. Important rose **42/272 (15.4%) → 56/272 (20.6%)**; Core remains 445/963 and Advanced 137/3,130. The V1.1 Release thresholds remain unmet, so this wave is a verified increment rather than release acceptance.
