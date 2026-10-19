# WebGL2 audit batch A

## Correction after Spark integration

The first candidate's attribute-limit check incorrectly rejected reflected location -1 (`gl_InstanceID` in Chromium). Same-runner Spark A/B on run 39222443642 passed the frozen main engine and failed that candidate with repeated `WEBGL2_VERTEX_ATTRIBUTE_LIMIT` page errors. The corrected implementation treats -1 as no generic attribute slot in both validation and VAO/non-VAO binding, regardless of attribute name. Matrix/array limits and invalid stream checks remain enforced. Tests include built-in/inactive names and the final valid matrix location group. Focused source-command checks passed 14 cases with six negative controls against the old candidate; renewed WebKit command readbacks passed 11/11.

The runtime from source 005ebacc (including its retained provenance) is SUPERSEDED and must not be used for acceptance or map import. Corrected source SHA-256 is `db6175d1559676295c039f7ca0894132271a171043cebbfeb587c9b27e1b0f6b`. A new exact-head build and same-runner Spark A/B are required before replacing every generated runtime/map. Existing historical receipts remain intact.

This draft implements ENGINE-001, ENGINE-002, ENGINE-004 and ENGINE-005 only. It is stacked on PR #5, whose unrelated skills and CI fixes are a dependency, not part of this patch. Neither PR is to be merged automatically.

- Program recovery is independent of PSO identity, including IA/descriptor recovery without redundant program binds.
- Stencil clears open partial front/back write masks and restore exact values.
- Vertex offsets use the actual stream count, with explicit invalid-stream and hardware-location diagnostics.
- Scratch blits detach prior color/depth/stencil attachments, choose read/draw buffers and restore external bindings. Empty regions are a no-op.

Focused direct-import Jest cases are in `test/smoke/webgl2-state-audit.test.ts`; the pre-existing command contracts run alongside them in CI. CI checks out the exact source head, builds all runtime bundles/maps/declarations and retains a seven-day artifact with SHA-256 provenance. The resulting dev/min/maps must be reviewed and committed before this draft is considered complete.

The earlier local session reported 20 CPU fixture cases, 28 combined Jest cases and 11 real WebKit command readbacks, including baseline negative controls. That execution environment was rolled back before its evidence was durably committed. The recovered source exactly matches its recorded SHA-256 (`d6932489deaa47178804a3f369cd40ccad93b77d8fad2be70e0a44596e0bbec8`), but those lost receipts are not claimed as current acceptance. Current CI and renewed browser observations are required.

The 64-item ledger on the checkpoint branch separates engine, SDK, application and environment responsibility. Application patch submission remains paused at the user's request. Device, permission and missing-original-scene checks are not marked complete.
