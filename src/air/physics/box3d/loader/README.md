# Internal ST preparation

This is an implemented standalone loader, not yet an application feature export,
physics selector registration, complete binding, or completed T06/WASM-08 gate.
The existing builtin/Cannon defaults and app bootstrap have not been changed.

`createBox3DSTLoader` requires a trusted build descriptor, separate from caller
options and downloaded content. The descriptor pins the manifest bytes, bundled
facade hash, base core and binding revisions, wire schema, ABI, ST variant, and
reviewed patch-chain identity. An eventual build integration must generate that
descriptor from the same frozen artifacts; the public application must not accept
arbitrary downloaded manifest content as its own trusted descriptor.

Preparation verifies manifest SHA-256, identity and artifact structure, then
fetches/verifies the real WASM and generated JavaScript loader. It instantiates
with those exact WASM bytes and the static facade. Loader prefetch hashing is
distribution consistency evidence, NOT a browser dynamic-import SRI guarantee.
No eval, new Function, Blob URL or data URL import workaround is used.

- Evaluation, construction, invalid options and unsupported modes make no asset
  requests. URL options are copied, normalized against the admitted document base
  and frozen. Defaults are one thread and four solver substeps.
- This increment is ST only. `auto` and `multi` fail before resource requests;
  neither silently downgrades. T24 will provide the separately reviewed selection
  and pool implementation. A direct request for a different engine is not a loader fallback.
- Concurrent matching configurations return one exact promise. Conflicts leave
  the first attempt untouched. Deduplication is per manager instance; shared app
  runtime/duplicate-copy admission belongs to the pending application integration.
- Close invalidates the current generation, aborts fetches, waits for any late
  factory result, and releases only resources actually acquired. A stale lease
  cannot close a newer generation. Repeated close does not repeat resource release.
- Cleanup attempts binding disposal and module-reference release independently.
  The original failure and cleanup failures are retained separately. If cleanup
  itself fails, this manager is closed to retries instead of silently starting over.
- Binding disposal destroys owned worlds and scratch. ST Emscripten has no worker
  pool or explicit WebAssembly.Memory destruction operation. Dropping references
  permits normal JavaScript GC; this is not proof of GC completion or total heap
  leak freedom. The latest attempt receipt is retained, not an unbounded history.

## Narrow verification

`node --test tools/verify/box3d/loader-lifecycle.test.mjs` exercises transport,
generation and failure cleanup with explicit fake modules. It is never physics
evidence. `loader-types.fixture.mts` is a strict declaration consumer only.

`node tools/verify/box3d/loader-real-wasm.mjs <built-directory> <new-output-directory>`
uses current source and an independently checked fresh build receipt/artifact set.
It runs the real WASM through an explicit Node filesystem transport with the real
production facade. The `.invalid` fixture URL is never requested on the network.
Twenty load/60-step physics/close cycles check the real core, deduplication,
generation, numeric samples, disposal and native live-byte baseline. Existing
output directories are rejected, and source drift during collection fails.

Neither runner proves actual HTTP import, browser CSP, non-isolated browser
execution, app 2D/3D transactions, MT, feature packaging, or complete WASM-08/G1.
Those items remain unexecuted or infrastructure-blocked as separately recorded.
