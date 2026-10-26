# Box3D memory diagnostic v1 — source candidate

This is a read-only diagnostic extension, **not a leak verdict, memory acceptance
policy, native qualification, or a replacement for the original C20 result**.
The original SDK225 C20APP v2 attempt remains
`FAIL_STRICT_ORIGINAL_BYTE_BASELINE`, with zero qualified cycles. No warm-up,
trim, baseline replacement, threshold, or parameter inferred from its byte delta
is introduced here.

## Live-world observation

`Box3DPhysicsWorld.getNativeMemoryDiagnostics()` is available only while the
backend is ready and the command owner permits a committed read. It works before
the first step and after scene resources have been released. It does not step,
flush commands, materialize resources, or require a geometry snapshot. The same
private binding/world capability is used; the original factory, loader and
module disposal path are unchanged. After-close module observations are
**unavailable**, not zero and not copied from a replacement module.

The immutable result separates:

- **World capacity accounting ledger**: all 87 fixed rows reproduce the pinned
  `b3GetWorldByteCount` formula, and their sum must equal
  `b3World_GetCounters().byteCount`. This includes embedded tree `sizeof` terms;
  it is not a complete allocator-owned live-byte total.
- **Module core tracked requested bytes**: the actual `b3GetByteCount` ledger.
  Allocation rounding, allocator metadata, generic malloc and WASM heap capacity
  are different quantities. This is not RSS or physical memory consumption.
- **Native world and native GLOBAL bridge records**: the latter actually calls
  `air_b3_bridge_memory(0, out)`, traversing the native linked list. It does not
  call no-argument `facade.bridgeMemory()`, whose JS-world map is not a native
  global census. Debug shape handles are not all native handles.
- **Maximum workload**: the five `b3World_GetMaxCapacity` fields are historical,
  step-sampled workload counts, not allocated capacities, limits or budgets.
- **Mesh observations**: module-wide successful cook and completed destroy call
  counters, including rollback; separately, the existing backend's live resource
  snapshots supply per-resource cache leases and shape borrows. They are not a
  module-wide lease/handle census.
- **Excluded arena observations**: backing capacity and historical peak demand
  are reported separately. Neither is added to the world ledger. Other omitted
  allocations such as `fatAABBs` and the name cache remain explicitly listed.

**Do not add these scopes into a fabricated total.** A storage row's count is a
native array length, free-ID directory length, or another explicitly named
field—not a live entity count or a claim that retained events are unconsumed.
Live body/shape/contact/joint/island counts are separate `GetCounters` fields.
Unknown current counts (for example tree rebuild scratch) are `null`, not zero;
capacity and bytes still use the exact formula. Heterogeneous manifold storage
uses capacity bytes rather than pretending all elements have one size.

## Safety and identity

The C entry checks a valid full world ID and explicit `locked` state through the
existing `air_b3_world_unlocked` helper before calling getters. It never uses
`b3GetUnlockedWorldFromId` to probe a locked world, which would assert. Active
native tasks are refused. Every category and every original signed-int
intermediate accumulation is checked before `GetCounters`. A mismatch, overflow,
unknown field/row, short output capacity, or invalid identity returns non-OK.
Caller output is copied exactly once, only after complete successful local
staging. No partial diagnostic fields are valid after failure.

The facade serializes access and copies fresh heap views into immutable owned
plain values. One facade scratch allocation increases from 512 to 4096 bytes,
using the original disposal/free path; diagnostic reads allocate no native
scratch. This generic observer scratch is **not included** in either core or
bridge ledgers, and the policy is a source design claim, not a fabricated
allocator-call counter. Native step index, facade mutation revision, and backend
binding generation are distinct labels. Step index is not an epoch of every
allocation mutation.

The unchanged core commit and patch chain, all relevant private headers and
helper sources, the complete main ABI schema, and the candidate source inputs
are hash-bound. ABI number remains 1 with an additive v1 entry, but the **main
schema hash changes**. Old ST2/SDK225 modules and new facade bytes must not mix.
Future execution needs newly built native assets, a newly built SDK, and fresh
standard gates. No native runtime or physics was executed to prepare this source
candidate.

The existing `air_b3_bridge_memory` accounting scope is unchanged. Its arithmetic now
checks overflow and stages output. The deliberately changed exceptional behavior
is: sums that previously wrapped now return `AIR_B3_CAPACITY` without touching
caller output. Normal in-range observations and all resource allocation,
registration, destruction and physics behavior are unchanged by this getter.

## Source and CPU validation

Read-only source admission, against an already staged core:

```sh
node tools/physics/box3d/memory-diagnostics/v1/source-gate.mjs --core <staged-core>
node --test tools/physics/box3d/memory-diagnostics/v1/contract.test.mjs
```

The CPU suite exercises the actual facade and extracted new backend method with
fake native data. It verifies copied scope separation, zero-step readiness,
immutable/grown-heap copies, reentrancy/closed-world refusals, identity/schema/
row/overflow/mismatch negatives, and absence of query malloc. It **does not prove
C execution, native no-write failures, native allocation behavior, or C20
acceptance**. Those require fresh, explicitly authorized native gates.

A later diagnostic run can append a separate journal at C20APP v2's existing
initial, nonempty, and released-before-validation record boundaries. The original
fixture and strict baseline assertion must remain intact; collecting better
observations does not turn that original assertion into PASS.

## Future native gates (prepared, not executed in this candidate)

`native/memory_contract.c` is an independent native-unit target. It includes the
exact diagnostic and bridge implementation sources and temporarily injects
locked state, oversized capacity, counter mismatch, and bridge overflow **only
inside that fixture**. These are explicitly labeled controlled unit tests, not
observed production memory values. No mutation/test-control API is exported by
the production module. The fixture also checks real zero-step/nonempty/released
world observations, repeated identical reads, global bridge scope, short/invalid
no-write behavior, and its own final cleanup.

`wasm-memory-contract.mjs` independently exercises the production WASM exports
with the actual factory once, not a substitute, in a low-level qualification
fixture. It verifies scope separation, complete row sums, immutable repeated
reads and normal invalid/short-buffer refusals. It is not the public app host and
does not establish app-after-close or C20 acceptance. Branches requiring the
controlled unit fixture remain labeled as such.

Future build/audit/asset consumption requires both new native reports and their
exact source identities via `qualification.mjs`; CPU fake results cannot satisfy
those gates. The exact schedule grows from 33 to 37 commands, source inputs from
79 to 92, compile units from 82 to 84, and evidence files from 52 to 55. The
complete old sets and old command order remain present. Source/CPU tests verify
those preservation invariants and reject missing/extra/stale or mislabeled new
reports. No future native gate has been run by preparing these files.

## Owned-files inventory scope — partial update only

The accompanying `owned-files.json` is **PARTIAL: current-change entries only**,
not a whole-tree inventory refresh or an all-inventory PASS. Starting with its
1171 existing records, this candidate refreshes ten existing records and adds ten
new diagnostic files: exactly the 20 published candidate files inside its existing
`scopeRoots`, excluding the manifest itself. There are no deletions. The other
1161 records, their order, and `schemaVersion`, `scopeRoots` and `excludes` are
preserved unchanged. `world.ts` and the three `tools/build` files are outside
those roots and remain covered by the separate candidate publish manifest.

The update uses the explicit candidate publish list and each selected file's
actual byte length and SHA-256; it does not discover files by walking the source
tree. Existing historical hash drift and missing later C20 inventory entries are
not repaired or certified by this update. Historical source files absent from the
authorized remote repository, including the 20 extras identified in the parent
source audit, are not newly admitted. Old raw/output evidence is not added. The
56-file diagnostic source gate and original vendor-source verification have their
own narrower scopes; neither establishes complete `owned-files.json` coverage.
