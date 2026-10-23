# Fresh post-recovery validation of source40b

Source under test: local `38e18167135d9e4be1d6d8e22d7b936afc8ebc13`, tree `152ec488446d42746764ab544c90e62aee86e653`; corresponding real-parent remote commit `180ea5e2761eba1defa760549dac262cead10188` on `feat/box3d-rebuild-20261022`.

This candidate routes internal finite teleport through the actual AIR World owner and the existing N4 native command transaction. Actual disabled dynamic/kinematic resets update native origin and Node without enabling or waking; an enabled collider keeping a disabled component's native body alive is handled explicitly. Temporary writeback grant capacity is reserved before native apply. Caught cancellation during a pose getter rejects the new command without dropping earlier accepted input.

## Evidence boundaries

- Fresh queue source controls: 155/155; focused strict TypeScript passed.
- Fresh actual Node/neutral transform-grant controls: 194/194; this is not WASM physics.
- Fresh actual AIR/N4 teleport: eleven named cases, 145 checks; all use real createAirApp/Scene/RigidBody/BoxCollider/PhysicsSystem and the actually restored N4 module. No native rebuild was performed.
- Archive-only semantic closure independently verifies all nine teleport ZIPs: 2,422 members, 1,596 frozen source files, 1,601 tar members, 2,239 runtime content objects and 2,744 runtime paths. Five negative controls reject; moving exact ZIPs to neutral names still passes with no workspace fallback. Closure verifies retained evidence, not independent reproduction of physics or provenance authenticity.
- Fresh actual AIR/N4 dynamic regression: eight cases, 52 checks (14/5/6/6/5/4/4/8). All eight before/after maps cover 3,816 pre-frozen paths; observed reads cover 13,621 paths, including discovery scans rather than only executed modules. Actual downloaded raw/input/CAS package references are closed; cross-generation-adapter remains NOT_RUN. The first auxiliary Python wrapper console stdout was truncated in the tool and not separately redirected; that stream is unavailable, while actual collector/Jest stdout/stderr and complete launch JSON are retained. The JSON is not represented as the missing original stdout.

All 2,128 formal cells and all nine Gates remain NOT_RUN. This is not browser, SDK, persistent-target, event/full-lifetime or public-feature qualification. `stagedCommandsSupported` and `unifiedTransactionsSupported` remain false. No public target/teleport exports are enabled.

## Storage and recovery

Git holds source, this explicit external evidence index and a portable verifier. It does NOT duplicate every raw/input byte. The index pins exact Library file IDs, archive byte lengths and SHA-256. Every claimed external package was actually downloaded and checked, not merely uploaded. The teleport review package contains `portable-archive-layout.json`, `portable-plan.json` and unchanged verifier source; follow its README to place the nine exact ZIPs as archive-0.zip through archive-8.zip, then run:

    python3 -B verify-teleport-batch-closure.py --plan portable-plan.json

The verifier only reads explicit ZIPs; it does not use archived absolute paths to retrieve missing workspace bytes. Missing batches/index/control yield INCOMPLETE, malformed hashes or unresolved references FAIL. The native output facade declaration is explicitly closed by the identical hash from frozen source, not an invented output file.

Source recovery uses the exact downloaded 22→36→37→38→39 chain followed by source40a→40b increments. The local honest source Git snapshot is not a complete clone of main: 6,351 fixed-main paths were never present. Remote commits retain the real remote parent/tree and unchanged main content. No synthetic local ancestry was pushed.

## Permanent historical gaps

The pre-22:49 checkpoint40 raw was not externally saved before the executor transition and remains unavailable. Earlier observed eleven-case/145-check narrative is NOT reused; this document refers only to new post-recovery executions. The earlier checkpoint37 auxiliary 837-line git-status output also remains unavailable (SHA-256 `7609a897cb411baf36b50f78eeb283314b18ccc1719fecf1b74c12d131d81a7f`). No old raw was fabricated. Any new narrow auxiliary capture gaps are listed explicitly rather than reported as zero missing evidence.

Every new source increment is saved externally before long tests, and raw batches are saved independently as they finish. Persistent target ownership/lifecycle is the next distinct candidate; changes there require new validation rather than relabeling these PASS results.
