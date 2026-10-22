# Historical asset retention: source finding, not native qualification

Frozen before Collider retains previous/candidate in observedMaterialAssets at clone lines 131–132 and setter 161–162. Successful previous.off has no matching Set.delete; destruction is the only retirement path. Thus each live Collider strongly retains all successful historical assets.

Minimal change: keep previous until off returns; then remove it. Add candidate immediately before its on attempt. A failing off remains uncertain and tracked. A failing on remains tracked even when the actual public cache still contains previous. Do not infer subscription integrity from arbitrary custom overrides: B3 remains open.

Required actual-engine controls: repeated replacements retire every old successful subscription; null replacement tracks no asset; throwing off retains previous; throwing candidate/clone on retains candidate. Successful off is not repeated at final destruction. These use explicitly injected JS failures and mock binding, not natural native physics.
