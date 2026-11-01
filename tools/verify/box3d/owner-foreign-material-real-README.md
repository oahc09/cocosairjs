# Real foreign-material finite controls, 2026-10-22

## Result and scope

The frozen collection has two `PASS_LIMITED_FOREIGN_MATERIAL` results:

- `foreign-only-d`: 15/15 checks, collector and Jest exit 0.
- `sequential-negative-a`: 24/24 checks, collector and Jest exit 0.

The two green attempts have identical 156 named direct source/config/native-build input hashes and unchanged before/after snapshots. They execute actual AIR/Cocos `PhysicsSystem` and `BoxCollider`, actual vendored Cannon, and the existing N4 Release Box3D WASM in Node/Jest/JSDOM HEADLESS. There is no manual neutral-ledger registration, native-result fabrication, injected native fault, compilation, SDK change, Git operation, or remote write.

These results apply only to the frozen bytes. Further product edits require fresh collection. All 2,128 formal cells remain `NOT_RUN`, all nine Gates remain unpassed, and `stagedCommandsSupported` / `unifiedTransactionsSupported` remain false.

## Actual sequential construction

1. Start AIR with its official Cannon feature export. The original factory creates an actual `CannonWorld`, and actual Cocos lifecycle creates a real `CannonShape` / `CANNON.Box`.
2. Assign M through the original live `Collider.sharedMaterial` setter after onLoad. Verify actual CANNON material identity and coefficients, and observe a native update before a subsequently registered public listener.
3. Call the actual public `CannonShape.setMaterial(R)` on a separate raw-only asset R, verify native identity changes while the Collider cache remains M, then restore M through the same original raw method.
4. Pause the game, turn off automatic simulation, disable and detach the foreign node. Confirm old adapter/native body lists are empty before actual `CannonWorld.destroy()`. Confirm the old native pointer and broadphase are null before Box3D module acquisition. Retain the actual foreign Collider/source and uncleaned adapter reference.
5. Only then clear `selector.physicsWorld` in an explicitly labelled test-only fixture reset. Run production `prepareBox3D`, production adapter selection and actual `createPhysicsWorld` against the same real System. No neutral registry or System identity is reset, and two active native worlds never coexist.
6. Bind M and R to actual Box3D colliders, and M to its current actual System default. Keep one unrelated clean asset C on another Box3D collider.

This reset is a fixture mechanism, not a supported product backend-switching API or a claim that multiple active singleton worlds are supported.

## Observed finite guarantees

M's changed and unchanged scalar / `setValues` entries refuse before all four asset private caches change, before any actual Box3D `setShapeMaterial`, before public emit entry, and before any native step. Native readback remains unchanged. Public `off`, `removeAll` and `targetOff` cannot make a retry succeed. Actual subsequent foreign Collider teardown leaves the same unreleased source lease and retries still refuse.

The raw-only R also refuses. Original receiver-independent `BuiltinShape.setMaterial` and `BuiltInWorld.setDefaultMaterial` are called directly without constructing another world. A proxy verifies zero property reads, and native/cache observations verify zero effects. Calls with the actual clean asset C do not poison it: C's later value update reaches exactly one real Box3D shape. This establishes an asset-scoped opaque blocker rather than a global poison for these actual raw calls.

The foreign-only case verifies the original live setter, notification ordering, permissive negative/NaN and nonzero rolling/spinning values, getter clone behavior without immediate native replay, clone update, different/null material identity, default assignment, permissive asset destroy, and actual Collider/world teardown. It is not a pre-change binary comparison or a complete foreign-backend regression suite.

Actual AIR close and explicit Box3D preparation disposal return successfully. N4 native world release is confirmed; core live bytes, bridge live bytes and bridge live allocations are all zero before module disposal.

## Important limits

- M has both an actual semantic foreign source and an asset-scoped raw opaque hazard. Its refusal does not independently isolate the semantic-only predicate. R isolates actual raw use without a Collider/System identity assigned to R.
- The retained source lease is directly observed. Its conservative unknown lifecycle after `onDestroy` follows the reviewed production `closePhysicsMaterialSourceUnknown` wiring; the fixture never writes lifecycle metadata.
- Green cases use the live setter after onLoad. Preconfigured foreign onLoad subscription behavior is not covered. Failed attempt c preserves the initial, incorrect assumption that preconfigured onLoad already subscribed the Collider.
- Builtin no-op methods are checked as their original receiver-independent methods, not as an active builtin backend lifecycle. Bullet/PhysX runtime behavior is not executed.
- There is no claim of mixed-backend propagation, arbitrary native-handle mutation coverage, all-entry completeness, browser qualification, producer integration, or full Gate completion.

## Preserved attempts and resolution diagnosis

All attempts are retained under `/tmp/box3d-foreign-material-real-20261022`:

- `foreign-only-a`: failed the initial compound native-class assertion.
- `foreign-only-b`: diagnosis established a real Cannon adapter but a native constructor from a different module instance in the test assertion.
- `foreign-only-c`: fixed native identity, then failed the incorrect preconfigured-onLoad notification assumption.
- `foreign-only-d`: current green foreign-only case.
- `sequential-negative-a`: current green sequential negative.

The engine resolves `src/node_modules/@cocos/cannon/build/cannon.js`; a direct tools import resolves `node_modules/@cocos/cannon/build/cannon.js`. Both files have SHA-256 `a85bf7989236b66ec216e1c8bc8daac9bb5587d6d13ffb56729b27887f994bf9`, but they are distinct module/constructor identities. The final fixture uses the actual native object published by the official `src/exports/physics-cannon.ts` export and keeps strict `instanceof` checks. Both runtime paths and their package metadata are frozen in green inputs. No dependency bytes were changed.

`summary.json` contains exact attempt/raw/receipt/log/exit references, source hashes, N4 identity and limitations. Each attempt contains `receipt.json`, the exact executable/argv/cwd/environment record, original Jest stdout/stderr, `native-and-app.raw.json`, and its named frozen inputs. Separate collector stdout/stderr/exit files preserve the outer command result. `native-artifact/` freezes the exact inspected build receipt, manifest, WASM, module and facade bytes. `artifact-index.json` gives file hashes outside the reconstructible Jest transform cache. The cache and all failed attempts are retained; the complete directory is below 100 MB.

## Frozen key identities

- S1 values transaction: `74d9b5d231330b7dcca9effd99ece77f4993672f4c6361aa14bc2e5a304c0df7`.
- Neutral ledger: `4d212c244d4cf0e0003d189d2c905b835c9f0860697e14aaef7f7a41e877910b`.
- Actual source glue: `3eb9100c5c2e99a02cfa0b671a0dd550cd2709c221c661956e08c2100db02b5e`.
- N4 build receipt: `3680689b48ec0f05c092bfc55e02f354e78f8abe35b7b52dc7cb0d3832a94349`.
- N4 manifest: `9ab78492b56e9d64d91782cf4e151ee693ac746d087307b3114254210296f05f`.
- `foreign-only-d/receipt.json`: `bfce08eab40c93a15d6eac2a1e855b470e0bb49cec39b473b14e3750212be4d9`.
- `sequential-negative-a/receipt.json`: `adb50db46141b7ab2ee28ad1885470e0b2b16083628343b83c566ab8075ec315`.

## Repeat command

Run serially with a stable source window. The output directory must not already exist:

```sh
node tools/verify/box3d/owner-foreign-material-real-wasm.mjs \
  tools/physics/box3d/output/command-wasm-release-20261022-n4 \
  /tmp/box3d-foreign-material-real-20261022/NEW-ATTEMPT \
  foreign-only
```

Use `sequential-negative` for the second case. The collector verifies exact native build inputs/artifacts before and after the run, freezes its named inputs, and uses a shared bounded transform cache under the output parent. Do not rewrite earlier receipts or relabel them as current after source changes.
