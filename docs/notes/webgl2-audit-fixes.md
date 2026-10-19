# WebGL2 audit batch A

This change implements ENGINE-001, ENGINE-002, ENGINE-004 and ENGINE-005. PR #5 was merged as `bac30c0`; PR #6 targets main and its diff contains only this audit batch.

- Program recovery is independent of PSO identity, including IA/descriptor recovery without redundant program binds.
- Stencil clears open partial front/back write masks and restore exact values.
- Vertex offsets use the actual stream count, with explicit invalid-stream and hardware-location diagnostics.
- Scratch blits detach prior color/depth/stencil attachments, choose read/draw buffers and restore external bindings. Empty regions are a no-op.

## Reproducible evidence

Fresh GitHub CI on source `005ebacc` passed formatting, typecheck and the complete runtime build. All 16 new focused tests and 12 pre-existing GFX command tests passed. The first overall suite was 143/144: the only failure was the newly added receipt shell lacking the existing fail-fast contract; `bd496fc` fixes that workflow without weakening tests. Final-head CI remains required.

The renewed real WebKit 26.5 command readback passed 11/11; baseline passed 4/11, exposing seven negatives across the four repairs. JSON originals are in `ai/ledgers/webgl2-audit-evidence`; run `node tools/verify/webgl2-state-readback.cjs` with Playwright/TypeScript available. Optional `WEBGL2_BROWSER`, `WEBGL2_EXECUTABLE`, `WEBGL2_COMMAND_SOURCE`, and `WEBGL2_STATE_OUT` select browser/source/output. This executes exact extracted source commands with a device/dependency fixture and real WebGL2 pixels, not full application/device acceptance.

Runtime artifact 12169807579, run 39216171943, was built from exact source head `005ebaccf7c56acf2d3f7c99731b2d60020c9f30`. Its ZIP SHA-256 is `328af4cb808cdffcfa1ac6dfeff0bb7149160a0a2dbd0add0ce462b6d457fd2e`. All seven output sizes/hashes were independently verified after download. Both source maps contain the fixed command source SHA-256 `d6932489deaa47178804a3f369cd40ccad93b77d8fad2be70e0a44596e0bbec8`. Declarations are byte-identical to main and are reused unchanged. Provenance records the source commit rather than falsely claiming the later artifact-only commit was the build input.

An earlier local environment was rolled back before its receipts were saved. Only the renewed, remotely retained evidence and current CI are counted here.

The 64-item ledger separates engine, SDK, application and environment responsibility. Application patch submission remains paused. Device, permission and missing-original-scene checks are not marked complete.

## Remaining artifact blocker

Dev/min JS are committed, but the two raw source maps are pending repository import. The official connector rejected the 20,316,652-byte min map request with HTTP 400: MCP request body exceeds 16 MiB; the 24,158,815-byte dev map request failed transport. No compressed substitute or credential/permission expansion was used. Verified original bytes remain in the exact-head CI artifact above. This draft is not complete until the original maps are committed through a supported route.
