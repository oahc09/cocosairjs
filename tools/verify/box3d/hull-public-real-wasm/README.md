# Limited actual Cocos convex Hull fixture

Prepared fixture code, not executed physics evidence. Release and Debug are both NOT_RUN until this exact source is frozen and the matching native artifacts actually pass admission and all cases. The old 20 injected-source controls are not results for this fixture. Full C14, all 2,128 formal cells, all nine Gates, browser rendering, production deployment, and EX01 visual acceptance remain NOT_RUN.

## Exact source and artifact admission

This reuses the Capsule fixture's real production loader, Cocos HEADLESS bootstrap, original Game/Director-owned step clock, public PhysicsSystem queries and native lifecycle. It does not substitute a backend, mock Mesh.readAttribute, fabricate IDs/poses/hits/counters, or temporarily create a disabled shape just to validate it.

Merge the public Hull adapter and these fixture files, finish formatting, then explicitly freeze the exact current product/fixture generation:

    node tools/verify/box3d/hull-public-real-wasm/freeze-source.mjs <exact-40-character-source-commit>

The command refuses an existing source lock. The supplied commit is declared provenance, not a substitute for the complete per-file byte identities. Keep old locks and attempts if source changes. The lock binds all product src, native bridge sources, staged-core patches, complete tools/build gate implementation, gate inputs, pinned vendor source, Jest configuration/stubs and this whole fixture. It is source-only, not PASS evidence.

After a matching fresh full native build, run one finite variant at a time:

    node tools/verify/box3d/hull-public-real-wasm/run.mjs <full-Release-artifacts> <new-Release-output> Release
    node tools/verify/box3d/hull-public-real-wasm/run.mjs <full-Debug-artifacts> <new-Debug-output> Debug

Each output directory must be new. A Release-only result leaves Debug explicitly NOT_RUN. Admission requires the existing full verifySTBuild gate, exact current facade/schema/patch/build input bytes, matching Release/Debug mode, native Hull/core contracts, legacy differential and artifact audit PASS. There is no narrow qualifier, historical artifact or source-only fallback. The current full gate's input inventory must be updated alongside the new native generation; a stale 57-input gate must fail rather than be bypassed.

The runner preserves a complete byte snapshot under inputs/product, inputs/fixture and inputs/native-artifact, with inputs-manifest.json. This includes actual WASM/module/facade, manifest, build receipt, all 43 audited evidence files, both actual staged-core trees and all native/legacy build command stdout/stderr. Each child keeps unmodified Jest stdout/stderr and native-and-cocos.raw.json. Source hashes are checked before, at checkpoints and after; the full artifact gate runs before and after the complete attempt. Source drift cannot become PASS.

## Finite executable cases

Four fresh processes run sequentially, each with a 180-second outer budget and the same frozen source/artifacts. A failure stops the attempt; retained files are never overwritten. Physics and injected boundary results have distinct statuses/categories.

1. physics: N1–N6 use actual Cocos Mesh.reset with real POSITION buffers and actual MeshCollider instances.
   - N1: a real nonzero-byteOffset Mesh.reset subarray containing tetrahedron B after a different valid tetrahedron A; exact native points, independent mass/inertia and rays must select B rather than the backing prefix. Asymmetric tetrahedron, sloped-face hit and empty AABB-corner miss, exact shape generation identity, independently computed full tetra mass/inertia, scaled/offset points, rotated body and real transformed ray.
   - N2: 256 duplicate/interior input points across two real submeshes, actual native input capture, non-box ray and unchanged analytic inertia. No raw-point-count truncation.
   - N3: repeated coincident/collinear/coplanar/over-128-full-edge/float32-overflow/nonfinite/too-few/empty refusals in enabled and disabled public setter paths. Exact old Mesh identity, convex cache, native state, transform, live bytes and world counts must remain unchanged. Real native validation/create attempts are distinguished from JS preflight refusal. A 64-gon pyramid is accepted; a 65-gon pyramid is rejected. The matching native build's Hull contract separately asserts the actual 128-full-edge topology. This is not standalone full vertex/face-cap qualification.
   - N4: null pending, boolean convex toggles and invalid types in enabled/disabled states, no native shape creation, pending material updates, disabled actual cook, then valid onEnable recovery. Nonconvex mesh remains explicit unsupported, not qualified static mesh support.
   - N5: one actual RigidBody with box plus asymmetric offset hull. Independent volume weighting and parallel-axis full COM inertia oracle, target total mass, trigger exclusions, sensor-only fallback, final-shape pending failure and recovery, preserved nonzero linear/angular velocity and body-origin pose.
   - N6: public center replacement, null and collider destruction retire query identities; material cleanup; original before-step guard and force route; exactly one owned native tick and paused nonadvancement; actual app close leaves core and bridge live resources zero.
2. committed-readback: N7 creates valid real geometry, then real native success is followed by one explicitly injected ID-readback exception. The public field retains its old value, phase is immutable committed, owner becomes terminal, both actually allocated shapes remain visible to the fixture's direct validity read until world cleanup, and no retry reaches native.
3. unknown-after-native: N7 performs an actual native creation then throws at its call boundary. It must remain UNKNOWN, fault ownership and prohibit replay; missing returned shape ID is not a no-write proof. Actual app close still reclaims all native resources.

4. destroy-committed-readback: N7 sets mesh=null, actually removes its native shape, then injects one body-state readback exception. Native validity must now be false, the public Mesh field is unchanged, phase is immutable committed, the owner is terminal and a repeat null setter cannot replay destruction. Actual app close still owns cleanup.

The last three cases are labeled REAL_NATIVE_PLUS_BOUNDARY_FAULT, not physics PASS. They do not imitate a genuine native failure with fabricated state. The ordinary geometry refusals in the physics case use real native cooking statuses. No Cocos-browser lifecycle or renderer acceptance follows from Node/JSDOM execution.

## Close receipt diagnostics and deliberate-fault contract

The first source71 Release attempt with a terminal result remains FAIL: ordinary physics passed, then committed-readback failed the unconditional `close.status === released` assertion. Its full close receipt was not saved before that assertion, so the original exact failure label is unknown. Native world/module teardown and zero live bytes were observed separately; neither changes that retained RED. The two later fault cases did not run.

This new fixture generation records the complete actual close receipt before every close assertion, then records copied owner/loader/native cleanup diagnostics. Ordinary physics still requires `released` with no failures. Each of the three explicitly injected terminal-fault cases must instead report `failed` with exactly one `game-clock-terminal` failure whose serialized error has the stable code prefix `Error: [AIR_E_BOX3D_WORLD_FAULTED]`, rather than matching incidental wording from one rejection path. Any other or additional failure is RED. Closed physics preparation, one actual world destruction, zero native core and bridge live bytes/allocations, DISPOSED loader with no cleanup errors or fallback, and released owner/target guards are mandatory in every case. This changes no product close behavior and does not promote the original failed attempt. A new exact source lock and fresh run ID are required.

Source72 Release attempt `hull72-public-release-20261023-c` also remains FAIL: physics passed, and committed-readback captured the complete close receipt with exactly one `game-clock-terminal` failure. Its message was `[AIR_E_BOX3D_WORLD_FAULTED] Game/System clock control: Owner configuration is unavailable during faulted.`; the source72 assertion incorrectly expected the historical command-queue phrase `operation forbidden during faulted`. Current `world-command-owner.ts` invokes `assertConfiguration('Game/System clock control')` and emits the former exact code/context/message, while the latter phrase belongs to `command-queue.ts` phase admission. Source73 requires the exact stable `AIR_E_BOX3D_WORLD_FAULTED` code prefix, not either incidental full sentence or an arbitrary `faulted` substring. The failure count must remain exactly one and its label exactly `game-clock-terminal`. Native/loader cleanup constraints remain unchanged; copied owner diagnostics additionally require phase `closed`, zero bodies/components/activity observers/material observers/pending scopes and commands, zero active/protected/unresolved targets and guards, no owner cleanup failure, and native ownership `released`. The source72 RED is preserved; the later two source72 cases did not run. No product behavior or past result is changed.
