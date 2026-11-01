# Same-module registered-native release receipt v1

This is a source/CPU candidate, not runtime or full C20 qualification. A fresh native/ST/SDK and a separate limited one-app normal-close observation are required. Existing 100-scene and Sphere–Capsule runs are not repeated or retroactively credited.

## Fixed observation boundary

The original factory is executed once. The loader captures a baseline immediately after acquiring that actual module and before creating its binding. During disposal it attempts binding disposal, captures a terminal snapshot before the module-release hook, then attempts that hook and drops references. Collection, verification, binding cleanup or module cleanup failure yields FAILED, never a release-verified receipt. Original errors retain precedence; independent cleanup still runs. Repeated disposal cannot repeat releases. Immutable copied receipts remain readable after close without retaining module, pointer or native heap view.

The native `air_b3_module_release_snapshot_v1(out, capacityWords)` is an exclusive ST read: no allocation, mutation, step, trim, factory substitution or JS registry fallback. It copies 38 uint32 words only after all checks pass: version/word-count/field-count/reserved header, then 17 u64 low/high values. Null, short, overflow, locked or inconsistent reads do not partially overwrite output. All tasks and callbacks must already be joined; this is not an MT seqlock.

## Separate, overlapping scopes

- Core: actual `b3GetWorldCount()` (including worlds not registered by the bridge) and `b3GetByteCount()` tracked requested bytes. Neither is world capacity ledger or WASM memory capacity.
- Bridge: registered worlds, owned allocation count/bytes, cached debug shape handles, temporary nodes/bytes including the temporary header, debug wire buffers/capacity/length, captured-world state. Debug shape handles are not physics shape counts; wire units are primitive records.
- Mesh: actual registered resources, lease sum, reference sum, actual borrow-node count, and resource/source-face-map storage bytes. Borrow count is checked against references. Resource bytes exclude temporary headers and cooked mesh data. Cooked mesh data participates in core tracking.

Temporary bytes are a subset of bridge bytes; mesh resource storage is a subset of temporary bytes. Never sum these into an invented grand total. This is not an enumeration of every active body, shape, contact or joint handle, complete malloc accounting, allocator overhead, JS heap, RSS, WebAssembly heap capacity or GC proof.

Verification requires zero core worlds and every registered bridge/mesh field zero at both factory baseline and terminal, and unchanged core tracked requested bytes. The actual factory baseline is retained, not rebased or assumed zero. Generic JS observer scratch uses malloc/free and is outside core/bridge tracking; failures of scratch cleanup fail the read. The existing world memory diagnostic ABI (89 rows / 756 words) is unchanged; its live-world unavailable notes remain scoped to that method. The main schema hash changes and old SDKs cannot be paired with the new loader/facade.

## Qualification boundaries

`native/module_release_contract.c` uses the production API and real core world creation outside the bridge, shared cooked mesh lease/borrow lifetimes, temporary allocation and debug ownership. It has no production leak toggle and performs no simulation step. It must clean every deliberately retained object before its final original-baseline check. Native overflow/malformed private list branches are source-reviewed, not falsely marked exercised by the real lifetime fixture.

`wasm-module-release-contract.mjs` uses one actual factory/module and the actual copied decoder. It records snapshots before assertions, validates nonzero real registered ownership and then the unchanged terminal baseline after binding disposal. It is not application close qualification. `module-release/public-contract.mjs` is a separate limited normal app-close fixture for a fresh SDK, using the original public host and the application receipt, not a retained module probe. CPU loader/decoder tests use explicit doubles and cannot substitute for these executions.

Native source, loader state transitions, public receipt propagation, new exports, ABI/schema, all exact gate/input/evidence inventories and synthetic negative controls must be published consistently. No original failure raw, baseline, old fixture or locked vendor bytes are rewritten.

## Ownership manifest update boundary

`owned-files.json` is a **PARTIAL incremental update**: only this batch's exact paths inside its existing scope roots are refreshed or appended. Existing unrelated records, order and metadata remain unchanged, including known historical inventory gaps/drift. This is not a full-repository inventory PASS, and no output/raw or unrelated uncommitted extras are discovered or imported by recursive scanning. The final candidate manifest records exact changed/new counts and before/after hashes.
