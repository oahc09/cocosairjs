# Narrow shape filter transaction and body mutation outcome (l)

Status: PASS_LIMITED_NATIVE_FILTER_BRIDGE in fresh l2 host/Node WASM qualification.
This increment does not reuse k3 acceptance; old source checkpoints and failures
remain retained. Full T10/C36/G1 and browser qualification remain incomplete.
ABI 1 and all old layouts remain unchanged. The additive schema changes; the
strict staged core patch chain and original vendor bytes remain unchanged.

## Source and semantics

Fixed `erincatto/box3d@efca0c184d40fd6a82016983f1601c4d23965867`:

- `include/box3d/types.h:377–409`: `categoryBits` and `maskBits` are uint64;
  `groupIndex` is a signed override, not the Cocos group bitset.
- `include/box3d/box3d.h:958–963`: `SetFilter(..., true)` schedules contact
  recomputation for the next step.
- `src/shape.c:1403–1439`: changed filters reset/wake contacts and rebuild proxies;
  sensor overlap changes are evaluated on the next step. The assigned-filter
  category comparison makes proxy rebuilding unconditional on this path. That
  cost is retained; this increment does not patch the original core.

## Public copied contract

- `getShapeFilter(world, shape): Readonly<Box3DShapeFilter>`
- `setShapeFilter(world, shape, filter): Readonly<Box3DShapeFilter>`
- `setShapeFilters(world, shapes: readonly Box3DId[], filter): readonly Readonly<Box3DShapeFilter>[]`
- `Box3DShapeFilter = { readonly group: number; readonly mask: number }`

Input integers are exactly in `[-2147483648, 4294967295]`, interpreted as a
32-bit bitset and zero-extended to native uint64. Thus `-1` maps to `4294967295`
and `-2147483648` maps to `2147483648`. Readback always uses unsigned numbers.
No floats, strings, NaN, infinity or out-of-range wrapping is accepted.
`groupIndex` is always zero. Every managed shape creation path uses native
category 1 / mask `0xffffffff` / groupIndex 0. Existing native high 32-bit values
or nonzero groupIndex explicitly reject rather than silently truncating.

One native call handles the entire batch. Maximum batch is 4096 shapes. Empty
batches are valid no-ops after world/filter validation, with no snapshot change.
Duplicate, foreign, stale or forged tokens reject. Native admission checks the
complete generation/world IDs, unlocked world, representable existing filters,
count, output capacity and nonoverlapping ID/output ranges before any writes.
The bounded duplicate check allocates nothing. Only then are real native setters
called, followed by actual native filter readback. No status-error return exists
after mutation starts; a native trap is an unknown outcome, not rollback.

A successful nonempty mutation invalidates current snapshot availability, but
never edits retained copied snapshots. New contact/sensor observations require a
real next step. Neither the setter nor getter consumes or fabricates events.
No persistent bridge allocation or raw pointer escapes this interface.

## Mutation outcome

Only audited body-control/force/mass/legacy-velocity/legacy-center-impulse and new
filter mutation methods annotate errors with optional readonly, nonconfigurable
`mutationOutcome: 'not-mutated' | 'committed'`.

- `not-mutated`: known JS admission failure or reviewed native nonzero status
  which precedes all mutation. Old snapshot and diagnostics remain intact.
- `committed`: native mutation returned status zero; subsequent state/readback
  or JS copying failed. This says the call completed, not that numerical values
  necessarily changed. Current snapshot was invalidated; no automatic retry.
- Missing property: native call threw/trapped, or another unreviewed failure
  phase. A reviewed native-call exception conservatively invalidates current
  snapshot availability without changing the completed-step counter or retained
  copies. The outcome is unknown; no inference from the error code is permitted.

The outer exclusive guard checks disposal/reentrancy before the annotation
context exists. Those rejections therefore have no mutationOutcome and must be
treated conservatively; this contract does not claim every admission error is
annotated. Pure getters and unrelated world/material/shape-creation paths are not
broadly annotated. Fixture wrappers may deliberately fail after an actual successful
native mutation to test the protocol. Those injected mechanisms are explicitly
identified and are not evidence of a spontaneous native failure.

## Required finite qualification

Fresh native and Node WASM Debug/Release must cover sign bit, zero, -1, all managed
creation paths, batch atomic admission, full ID/world/locked/capacity/duplicate
rejection, raw unsupported native filter values and output canaries. Real contact
and sensor next-step suppression/recreation, sleeping contact wakeup, copied
snapshot immutability, heap growth and ID reuse are tested. Body outcome fixtures
must read actual post-failure native values and step diagnostics and prove no
step replay. All previous finite body/world/geometry/ownership fixtures rerun.
These are not full T10/C36/G1, complex collider, query or browser qualification.
