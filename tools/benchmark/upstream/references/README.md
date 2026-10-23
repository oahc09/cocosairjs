# Protected paired references

These files are **not generator inputs**. They contain predeclared, source-bound controls and independent observation validators. A passing CPU test is not a reference execution, a browser result, an Agent result, or an engine comparison score.

## Frozen contract

`../reference-manifest.json` binds each AU01–AU12 public input hash, three repetition seeds, common observation ID, original Cocos fixture/case mapping, reference implementation and collector SHA256. The exact Three package is 0.186.1, archive SHA256 `8cd068708ea44f2c73c944b1cead2ba2f0d5c15c8fc194e5700f4e4f4a033fe7`. A Cocos archive is supplied by the trusted invocation, not fixed to an obsolete candidate snapshot here.

The cohort is 12 tasks × 3 repetitions × 2 engines, 36 pairs / 72 runs per configuration. State tolerance is 1e-5; corresponding within-engine flat RGBA8 regions differ by at most 2 bytes; conservative AABB tolerance is 1e-5 × max(1, independent vertex-cloud diagonal). Lifecycle tasks perform 30 actual load/change/double-release cycles. Agent repair/time/success thresholds remain 5 repairs, 20 minutes and 80%; this collector does not execute or score an Agent.

## Source inventory versus actual execution

`inspectReferencePreparation(root, {threePackageDir})` checks current bytes against the frozen manifest and reports each engine/task's `sourceBound`, `sourceReady`, exact semantic gaps, and collector identity. `browserValidated` remains false until separately retained real receipts are validated. Editing a readiness boolean does not produce evidence.

AU01–AU12 have native/composed reference configurations and common collectors. AU12 freezes @types/three@0.186.0 plus its complete six-package dependency closure for the unchanged three@0.186.1 runtime. Exact package archives, npm lock, metadata and installed bytes are verified before execution; unrelated node_modules paths remain denied. Browser/runtime correctness of all new configurations remains unobserved. Code preparation alone does not clear this launch condition.

Three request priority/cache/logical cancellation use public Fetch + GLTFLoader composition, not a claimed native Three facade. Option-free native loader caches are observed independently, not forced to behave identically. Per-instance ownership, readiness receipt consumption and lifecycle disposal are explicit public composition. Readiness observers never render, compile or advance business state. Native skinning bounds and draw counts are checked against an engine-independent scalar oracle, not against another engine's output.

AU05/AU06 mutated controls are compared to independently constructed native glTF parses, never to a second invocation of the same setter. AU09 preserves the frozen camera, negative ancestor scale, animation sample and outside-frustum draw suppression. AU10 does not relabel a single load followed by 30 instantiations as 30 load cycles. Owned counters are never labeled total GPU memory.

AU12 preserves the original caller contract: strictNullChecks with skipLibCheck=true under versioned upstream-sdk-types/3. Both engines use TS5.9.3 node16/bundler for their common comparison; Cocos additionally retains TS4.9.5 node/node16 as an independent compatibility obligation, so its four modes remain mandatory. This corrects the previous adapter's unsupported imposition of Cocos legacy modes on Three, not a relaxation of Cocos coverage. The paired-common/1 Cocos fixture has 21 existing native negatives plus two type-only checks. The unchanged full 33-negative fixture plus three type-only checks is separately candidate-u06-extension/1, never a substitute for AU12. Engine-specific negative categories use actual public APIs. Three is not required to expose Cocos-only error-code or request-policy fields. Cocos shipped unminified/minified ESM and Vite development/production modes are distinct; Three is not assigned a nonexistent shipped minified artifact. Every compiler negative is recompiled with its directive removed, so an arbitrary positive compile cannot stand in for negative coverage.

## Explicit collection entry point

`collect-reference.cjs` requires `--execute-protected-reference` before opening a browser. Pass `--engine`, `--task`, `--seed`, a fresh `--out`, `--browser`, trusted `--engine-artifact`, matching `--runtime-file`, and the exact extracted `--three-package`. AU12 additionally requires `--sdk-config` describing an independently installed consumer outside the checkout, freshly named output directory, fixed tools and local resource/decoder deployment. Importing the collector performs no browser/model call.

Request tasks use a real loopback gateway sharing the page origin, genuine HTTP payloads and first-byte hold/abort/release acknowledgments. Both browser fetch observations and separately retained server events are kept. SDK collection retains raw compiler/build stages, source/preparation copies, module traces, per-mode compositor images and native cleanup results. Failed attempts remain on disk and never emit a success receipt.

`validateReferenceReceipt(receipt, trustedOptions)` re-reads source and retained evidence bytes, checks the actual trusted archive and its exported ESM member, verifies fixed input/seed identities, and reruns the independent common validator. It is not a cryptographic attestation of physical browser execution: collectors must be invoked by the trusted harness with generator access excluded. Synthetic receipt tests exercise rejection logic and are explicitly not admissible browser evidence.
