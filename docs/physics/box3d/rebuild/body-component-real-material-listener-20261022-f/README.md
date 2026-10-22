# Initial material listener fix and final limited component checkpoint

The initial shared-material test failed naturally on actual Cocos components and real l2 WASM: changing one shared asset's friction from 0.25 to 0.5 left both native shapes at 0.25. The old `Collider.onLoad` called the material setter before `_shape` existed, so no EVENT_UPDATE listener was attached. That original result remains `../body-component-real-wasm-l2-20261022-material-listener-a/`.

The minimal Box3D-only fix attaches the initial listener after successful shape initialize/onLoad. Other backends retain their original setter-before-creation path. Existing onDestroy listener removal is unchanged. `source-change.json` and its before/after source copies bind the exact upstream delta; the extracted file was not whole-file formatted. The parent owns upstream mapping metadata updates.

Thirty actual-source controls passed: five new initial-listener/order/teardown controls and twenty-five retained Collider cache-order controls, with an explicitly injected shape delegate. They are not native physics tests. `static-receipt.json` records their original output, typing and formatting. Ordinary EventTarget registration is assumed nonthrowing. Shared asset EVENT_UPDATE observes already-mutated asset data, so this is not a claim of atomic multi-collider material rollback.

The final frozen AIR e + Collider f source passed five separate current l2 real-WASM cases, all with strict current input checks, real Scene/component callbacks, app close released without failures, and native core/bridge resources zero:

- `invalid-initialization-g`: an existing collider rejects a RigidBody with a valid mass but invalid later damping before every native write, then admits a valid replacement.
- `lifecycle-g`: both add orders, static/multiple colliders, controls, native filter batch, sixty-step trajectory, origin writeback, other Node dirty flags, pending geometry recovery and ownership cleanup.
- `material-listener-g`: initial shared updates reach both shapes, destruction removes only the destroyed listener, and replacement prevents old-material interference.
- `body-natural-rejection-g`: real static-body velocity status 8 preserves observation and permits the next step.
- `body-committed-g`: explicitly injected failure after real mass commit faults normally yet permits cleanup-only component teardown and complete app close.

`handoff-source.json` binds twenty final owned source/tool hashes and final static checks. `handoff-completed.json` binds each exact raw/receipt hash. Earlier d/e successful runs remain historical, including e unknown/lost-token/filter-copy cases; no older fingerprint is relabelled as final f. The source collector, failure seams and remaining unsupported APIs are described in `../body-component-real-wasm-harness.md`.

This is limited Node/JSDOM HEADLESS source integration, not browser/GPU, full T10/T11/C36/B3U01, or public feature activation. Runtime pose/parent/scale synchronization, collision/trigger events and unsupported shape/query/constraint slots still reject. Native wireframe/AABB debug is real but not presented, and joint debug remains unsupported. All original RED attempts, the missing base renderer-import failure, and the unknown requestedMass fixture mistake remain retained.
