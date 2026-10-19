# WebGL2 audit batch A

This draft implements ENGINE-001, ENGINE-002, ENGINE-004 and ENGINE-005 only. It is stacked on PR #5, whose unrelated skills and CI fixes are a dependency, not part of this patch. Neither PR is to be merged automatically.

- Program recovery is independent of PSO identity, including IA/descriptor recovery without redundant program binds.
- Stencil clears open partial front/back write masks and restore exact values.
- Vertex offsets use the actual stream count, with explicit invalid-stream and hardware-location diagnostics.
- Scratch blits detach prior color/depth/stencil attachments, choose read/draw buffers and restore external bindings. Empty regions are a no-op.

Focused direct-import Jest cases are in `test/smoke/webgl2-state-audit.test.ts`; the pre-existing command contracts run alongside them in CI. CI checks out the exact source head, builds all runtime bundles/maps/declarations and retains a seven-day artifact with SHA-256 provenance. The resulting dev/min/maps must be reviewed and committed before this draft is considered complete.

The earlier local session reported 20 CPU fixture cases, 28 combined Jest cases and 11 real WebKit command readbacks, including baseline negative controls. That execution environment was rolled back before its evidence was durably committed. The recovered source exactly matches its recorded SHA-256 (`d6932489deaa47178804a3f369cd40ccad93b77d8fad2be70e0a44596e0bbec8`), but those lost receipts are not claimed as current acceptance. Current CI and renewed browser observations are required.

The 64-item ledger on the checkpoint branch separates engine, SDK, application and environment responsibility. Application patch submission remains paused at the user's request. Device, permission and missing-original-scene checks are not marked complete.
