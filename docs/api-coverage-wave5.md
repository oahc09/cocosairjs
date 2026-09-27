# API Coverage Wave 5 — Widget layout contracts

Baseline: Wave 3, Important 56/272 verified. The existing `ui-layout` example now reads back Widget constructor/target, alignment flags, absolute offsets, stretch state, centers, and invokes `updateAlignment`/`setDirty` against the rendered responsive layout. No new Gallery example was added.

The focused browser probe passed all assertions. The instrumented V1.1 run recorded 26/26 Widget claims as `apiProof.proof=verified`. V1.2's three-engine matrix also passed 39/39 after this source change.

The canonical V1.1 run passed 140/140 (`completed=true`, `partial=false`, 0 demotions, `unproven=0`). Together with the Animation Wave 4 contract, the refreshed report adds 50 verified Important units with 0 removed. Important is now 106/272 verified (39.0%); Core remains 445/963 and Advanced 137/3,130. The report has zero stale examples and zero schema gaps. The 100%/90%/80% Release thresholds remain unmet.
