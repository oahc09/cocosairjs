# C20-LOWLEVEL native lifecycle candidate v2

**Preparation only: no actual WASM/native execution has been performed for this candidate.**
The CPU model and CPU-negative tests are not native evidence. Execution requires root review/authorization.

## Frozen scope

Original contract: `ai/plans/box3d-v1.2-reference.md` §10.3, B3-C20 (reference input line 666):
100 low-level rounds, each creating a world + 50 bodies + assets, then destruction; world/body/shape/joint/handle/bytes return to baseline.
The existing `wasm-ownership-contract.mjs` two 128-round one-body loops remain valid separate evidence; this fixture does not replace or relabel them.

One actual ST module and one production facade remain alive for **all 100 sequential rounds**.
Each round creates exactly 50 bodies (3 static mesh carriers + 47 dynamic sphere bodies), 50 shapes,
one real native fixed joint between dynamic bodies 3/4, and one 9-vertex/8-triangle cooked mesh shared by three shapes.
An extra cache lease is retained/released/idempotently released. No physics step, events, difficult geometry or unsupported joint is added.

Before any world, declare 34 cache-first, 33 cache-last, 33 world-last rounds and every expected stage.
The original core/global-bridge baseline is measured once before facade construction, after one fixed diagnostic scratch allocation.
Facade creation must preserve it; every completed round and final facade disposal must return to exactly that original baseline.
There is no warmup, baseline replacement, growth tolerance or separate per-round module/process.

### Measured, not invented

- Live world's `api.worldCounts`: native body/shape/contact/joint counts, including actual nonempty 50/50/0/1 phase.
- `api.liveBytes` cross-checked against same module `_air_b3_live_bytes`; world-local bytes are recorded separately.
- `api.meshLifetimeCounters` cross-checked against `_air_b3_mesh_lifetime_counters`: actual completed core cook/destroy calls.
- Mesh borrowing/lease state uses same module `_air_b3_mesh_state`, including cache=0 while borrows remain.
- Global bridge **always** uses `_air_b3_bridge_memory(0, out)` directly. `api.bridgeMemory(world)` is scoped auxiliary evidence only. Zero-argument facade aggregation is forbidden.
- Current raw body/shape IDs, fixed-joint state and every known raw world ID are checked after destruction. Post-destroy world counts are **null**, not fabricated zeros.
- 104 old facade tokens are rejected both at destruction and while the next world exists/populates. Raw body/shape IDs may revalidate across world lifetimes; those observations are retained, not hidden, and never claimed as scoped ownership proof.

### Explicit gaps remain

`C20_LOWLEVEL=NOT_QUALIFIED`; `C20_APPLICATION=NOT_RUN`, even if the observed subset passes.
No complete native global-world count or complete global-handle count is exported.
`bridge.shapeHandles` is only the native bridge's defined subset, not all native/JS handles.
Known world invalidity is not a census of unknown worlds. Native core bytes + bridge memory + completed mesh destruction are not allocator malloc/free totals.
No contact/event/dynamics or application-level 100-scene-cycle qualification is claimed.

## Inputs and append-only evidence

`prepare-input-lock.mjs` is CPU-only: validate native manifest asset hashes/sizes, exact ABI schema
`ce98aca1a40c4999df838c1eaab2b08b0533c85adca9866eb48180c6190575d6`, production facade identity,
source probes, reference terrain fixture, Node executable bytes, and every candidate source/test/document file. It exclusively creates a new lock.
Any fixture/native/input change requires a freshly reviewed version/lock and a fresh attempt; never relabel or overwrite old evidence.

The runner exclusively creates its output directory and appends/fsyncs **every** complete JSONL observation before assertions.
Failed stages, partially created rounds, original errors and cleanup failures are retained. A signal/timeout leaves an incomplete journal;
no final summary is required for raw preservation and no partial attempt may pass. No automatic retries.

Scratch ownership is explicit: 120 diagnostic-owned bytes allocated once/freed once, separately from facade-owned scratch.
Core/bridge counters exclude generic scratch malloc; those counter zeros are not claimed to prove heap allocator scratch reclamation.
The successful return of facade disposal and diagnostic `_free` are closure observations, not invented native allocation counts.

## Future authorized execution (do not run during preparation)

Review candidate and lock first. Set paths to your reviewed existing source/runtime/candidate and fresh local evidence destination (all in the authorized environment):

```bash
S=/path/to/reviewed/source
C=$S/tools/physics/box3d/lifecycle-contract/lowlevel
R=/path/to/reviewed/st-runtime
NODE=/path/to/node-v22.16.0/bin/node
LOCAL=/path/to/local-evidence
LOCK=$LOCAL/input-lock-v2.json

# Already prepared via CPU-only inspection; never overwrite it.
# "$NODE" "$C/prepare-input-lock.mjs" "$R" "$S" "$LOCK"

# ONLY AFTER ROOT REVIEW AND AUTHORIZATION, using a never-before-used attempt path:
ATTEMPT=$LOCAL/native-attempt-1
python3 "$C/supervise.py" --authorized-fresh-native-c20 "$NODE" "$R" "$S" "$LOCK" "$ATTEMPT"
"$NODE" "$C/verify-report.mjs" "$R" "$S" "$LOCK" "$ATTEMPT"
```

Budget: 120 seconds execution, an original separate 4-second termination grace only on failure,
1 GiB sampled full-descendant-tree RSS, 16 MiB total retained output. The 25 ms RSS/output sampler is not a kernel hard memory cap;
CPU simulation sizes the journal with headroom. If an externally enforced hard memory/output cap is needed, that must be part of review.
The supervisor records the original return code/signal, closes stdout/stderr, waits/reaps the child,
requires a Linux child subreaper, checks waitpid(-1) ECHILD and an empty complete descendant tree (including setsid/double-fork children), and binds report/journal hashes. Nonzero exit, signal, missing ECHILD,
remaining process, exceeded budget or absent closure makes final validation fail. Abrupt supervisor loss is incomplete/fail-closed.

The strict final consumer requires current input/fixture identity, all 100 ordered rounds/all stages,
nonempty bodies/shapes/joint/mesh, exact original baselines and process/lifecycle closure.
Its sole positive result is `OBSERVED_NATIVE_SUBSET_PASS`, never full C20 PASS.

## CPU-only checks

Use existing Node 22 and installed Prettier from the restored dependency tree; no install or build needed.
`node --test contract.test.mjs` runs the deliberately fake model through the actual fixture scheduling,
plus missing-round, 49-body, absent-joint, core/bridge-growth, empty-JS-map, altered-input,
rebaselining, stale-token, mesh-lifetime, module-recreation and closure-failure negatives.
`python3 supervise.test.py` additionally checks only CPU child-process closure (including escaped setsid descendants and forced kill); it does not execute the native runner or any WASM. Original source/SDK/raw evidence is untouched.
