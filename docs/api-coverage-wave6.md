# API coverage Wave 6 — UI components

Wave 6 adds executable API evidence for the Code First UI example and makes API tracing accurately distinguish configurable static data reads from method calls. The Release thresholds remain 100% Core, 90% Important, and 80% Advanced.

## Scope and implementation

`examples/ui-components/main.js` now probes 61 Label, Sprite, and UIRenderer API units on components that are already part of the rendered scene. The probe covers Label text formatting and enums, Sprite frame/type/fill options and enums, renderer color/material/priority, lifecycle callbacks, render-data methods, and the Sprite atlas miss path. It toggles existing components synchronously and forces a Label refresh before the browser takes evidence.

`tools/examples/add-ui-component-coverage.cjs` binds each unit to the live example specification. `tools/examples/spec-evidence.cjs` now resolves class constructor expressions and inherited UIRenderer properties to executable source lines, avoiding matches against unrelated identifiers.

`tools/verify/api-trace.cjs` instruments configurable static data properties with a transparent getter, preserving the separate `read` evidence channel. Non-configurable constants remain uninstrumentable. It also skips non-writable constructor metadata when an instance prototype has a same-named method, so `Quat.length` is counted on the instance prototype rather than confused with the class constructor's built-in `Function.length`.

The V1.1 verifier clears its per-example timeout after the result settles. The Gallery artifact verifier waits for asynchronous decoder examples to publish their terminal `__decoderState` before sampling network resources.

## Evidence

The focused UI trial passed all 61 probe checks, and the focused V1.1 regression set passed 4/4 (`math-quat-applied`, `math-quat-interp`, `math-vec2-length-angle`, and `ui-components`). The canonical V1.1 run completed 140/140 PASS with 7 promotions, 0 demotions, and API proof totals of 3,403 verified, 228 attested, and 0 unproven. The DevTools chain passed 5/5 with its runtime bundle boundary check.

The static Gallery artifact passed 211/211, including all 140 example boots, all 45 resource-lifecycle checks, Draco's `decoder-missing-observed` path, and Meshopt's real decode. The V1.2 matrix passed 39/39 across Chromium, Firefox, and WebKit, including the updated UI example. Tarball consumer acceptance passed with 575 exports and no failures. Jest passed 32 suites / 263 tests; typecheck and Prettier passed; 1,317 documentation references were checked with no unresolved or stale references. Specification validation passed 145/145; compliance reported 0 fail / 1 documented Draco boundary warning.

Compared with the committed Wave 5 coverage set, Wave 6 adds 63 verified units with 0 removals: Core +3, Important +59, Advanced +1. The 61 UI units are verified; the remaining two additions to the verified set are existing static data reads newly measured by the `read` channel.

## Current release status

The refreshed report has no stale evidence and no schema gaps. Coverage is Core 448/963 (46.5%), Important 165/272 (60.7%), and Advanced 138/3,130 (4.4%). There are 144 stable examples, above the 120-example gate.

The Release gate is still NOT MET. Core needs 515 more verified units. Important needs at least 80 more to reach 245/272, and its 107 remaining unverified units need explicit status. Advanced needs 2,366 more to reach 2,504/3,130; all other Advanced units must eventually have an explicit disposition, with documented-only capped at 626 and uncovered reduced to zero. Do not adjust the thresholds.

The next coverage wave should target Core APIs. Keep counting only current `apiProof.proof=verified` units and refresh the canonical browser evidence after each coherent feature batch.
