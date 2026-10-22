# Actual 2D/3D coexistence collector boundary

This is the pre-execution plan for the separate `coexist-real-wasm*` collector. The existing seven `world-real-wasm*` files and their receipts remain unchanged. Product sources, both native dependencies and public feature registration remain read-only. No runtime/native build, socket or browser is needed for the planned Node/JSDOM checks.

## Exact transport and import seam

Actual `src/air/physics-2d/box2d3.ts:143-185` executes its own configuration checks, fetch, dynamic import, real module factory call and assignment. Its `acquireBox2D3` lease, selection, `Box2D3World` and actual `PhysicsSystem2D` implementation are never replaced or copied into the fixture.

The existing Jest CommonJS transform cannot directly load a generated ESM factory through a file URL. A test-only `moduleNameMapper` will map exactly the selected, receipt-qualified `air-box2d.mjs` file URL to a small factory-export shim. The shim forwards its original receiver and arguments to the actual generated factory loaded with native Node ESM. It does not create a fake module or fabricate any native results. The original generated factory is loaded only when the real source reaches that dynamic import/factory path. A bounded JSDOM fetch adapter serves exactly the corresponding WASM bytes. Unselected backends must produce zero asset requests and zero module instantiations.

Transparent observation wrappers may record actual native create/step/destroy calls and retain their returned capabilities for fixture-only low-level body creation. They must forward receiver, arguments, return value and error unchanged. Native states/counters remain real; no successful world, step, cleanup, pose or readback is synthesized. The Box3D path continues to use its actual production loader and facade.

Failure cases inject a clearly labelled transport error, or a throwing callback on the actual `Game.EVENT_POST_SUBSYSTEM_INIT` event. The latter occurs after actual `director.init` constructs both worlds (`game.ts:855-864`). It is not a mocked `game.init`. Resource assertions refer only to resources actually acquired; absent worlds must not be labelled destroyed.

## Required source/binary qualification

The already available `vendor/box2d/runtime` uses Box2D 3.2.0 from commit `178495ba35695aefe9c321e569d2277f06db3b90`, as stated by its source manifest. Before execution and on completion the collector will verify the entire source inventory with the existing read-only `tools/build/box2d3.cjs` checker, the source-manifest hash recorded by the runtime receipt, all five bridge/build input hashes, and all three published runtime files. No rebuild or download is inferred from availability.

Read-only inspection on 2026-10-22 found all those checks matching:

- Runtime receipt: `5540911a20a2c624629de1c6f155c43a6cf8e28c91fa0cb6f4cabfb54dfcfbf4`.
- Source manifest: `a6ddaa79883b819e664e349c696845e9cdff38f9b2bf3f96ddb5f69782a4480f`.
- Generated module: `5a7d80e036a41ce9921daed74c31d7a30d1a7f41c103e207576991d1db126485`.
- WASM: `3391e2ace476adba36297ff8ce66766a0a09d9365caec8079b6843d1dd4219ec`.

These are input-availability observations, not coexistence PASS. The collector must recheck them and qualify the current Box3D candidate separately, including its build inputs and artifact identity. Named AIR/system/selector/transport/tool sources and both native input sets join per-phase hash monitoring; complete source/dependency closure is not claimed.

## Separate-process cases

Each case starts a fresh official Node process and actual engine realm, respecting `app-config.ts:344-407`: failed/closed runtimes require reload rather than manual singleton reset.

1. Both real WASM worlds: actual sequential 2D preparation then 3D preparation, both created during real game initialization; low-level bodies advance only through their original system step methods. Independent gravity, poses and completed-call counts must agree. Normal and repeated close must release both owned worlds; Box3D core/bridge counters return to baseline, while Box2D reports actual world destruction and lease/reference release. Box2D has no explicit module heap destructor, so immediate WASM heap reclamation is not claimed.
2. 2D fetch failure: real preparation rejects before 3D loader startup, with no invented release for a world/module never acquired.
3. 3D fetch failure: the actual acquired 2D lease is released; neither engine world has yet been constructed.
4. Both real worlds followed by a throwing post-subsystem event callback: actual `game.init` rejects and actual bootstrap cleanup releases both worlds and module ownership. Preserve the original error.
5. Box3D selected alone with the real legacy 2D backend: no Box2D-v3 asset request, no ignored missing-module diagnostic presented as coexistence success.
6. Box2D-v3 selected with real builtin 3D.
7. Box2D-v3 selected with real Cannon 3D.
8. Default/builtin 3D plus legacy 2D: neither optional WASM backend is loaded.
9. Cannon 3D plus legacy 2D: neither optional WASM backend is loaded.

All cases import the actual legacy backend registrations where applicable rather than pretending the backend registry is populated. Disabled/automatic simulation behavior must not accidentally advance the other system. Concurrent/equivalent app requests, conflicting options, and close/failure admission guards can be checked within an appropriate single case without resetting engine state.

## Ownership and activation gate

The collector owner may add only `tools/verify/box3d/coexist-real-wasm*` and new `docs/physics/box3d/rebuild/world-real-wasm-*` evidence. Any defect in `bootstrap.ts`, `app.ts`, `app-config.ts`, `physics-2d/box2d3.ts`, world/registration/native/facade or upstream sources is first retained as RED and reported for separate ownership/review. A fixture must not patch product behavior to make the case pass.

Public activation remains a later minimal change owned by the integrator: `feature.ts` would import the actual 3D selector and adapter factory, then call `registerBox3DWorldAdapter(createBox3DWorldAdapter(selector))` in addition to lazy loader registration. That call must only register the adapter factory, not allocate/select a world or request assets during import. It remains subject to current native qualification, these coexistence/failure cases, default/builtin/Cannon regression, zero-unused-resource import checks, and a newly fingerprinted selected runtime build. No existing runtime build or former unsupported-selection assertion can be relabelled after activation.

These cases address a narrow Node source-level portion of T09. They do not establish browser/CSP/package behavior, rendered debug, 3D components/events/queries, all C36 transactions or full T09/B3-U01 acceptance.
