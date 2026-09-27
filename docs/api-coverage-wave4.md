# API Coverage Wave 4 — code-first Animation runtime

Baseline: commit `c20953d`, Important 56/272 verified. The existing `anim-position` Gallery page now creates an `AnimationClip` and `VectorTrack` in code, attaches an `Animation` component to a scene node, and verifies movement, state management, playback control, events, track management, and clip teardown through a browser behavior probe.

Focused plain-browser and instrumented Chromium trials passed. The canonical Chromium batch then passed 140/140 with `completed=true`, `partial=false`, 0 demotions, and 0 unproven example-level proofs. Specification validation passed 145/145; compliance had 0 fail and the pre-existing Draco decoder-required warning. The Animation contract declares a resource lifecycle: it releases both the clip and node, then reconstructs and reattaches them.

The contract sets `VectorTrack.componentsCount=3` and supplies a finite fourth channel curve. `AnimationClip.range()` currently inspects all four channel curves even when evaluation uses three; leaving the fourth empty produced `NaN` bounds in a focused trial. This is an observed API boundary, not a reason to fabricate a range proof. The completed contract checks a 0–1.2 range and exercises real playback.

Of 32 API claims, 30 are `verified`; `Animation.playOnLoad` and `AnimationClip.wrapMode` remain attested data properties and do not count as verified. Across this wave and the Widget contract wave, 50 verified Important units were added with zero removals; the current tier-wide coverage readout is in `docs/api-coverage-report.json`.
