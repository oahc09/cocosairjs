# Bounded multi-view review verification

Date: 2026-11-10. Base main: `32d289cf3221cf88fe491ce8109c5702b015e4f3`.
Continues PR #19 from `9c16d46e9cb4eb34a8cae4b7c5beb1dea4d66ed3`.

## Actual browser result

Real MCP SDK stdio client → owned Chromium 141.0.7390.37 → local hello-cube → development AgentSession. Read-only `air_review` was refused. Writable review captured front `[0,0,6] / [0,0,0]` and side `[6,0,0] / [0,90,0]` camera poses, using two zero-delta frames.

- The returned PNG was 1280×502, with two numbered 640×480 image tiles.
- Both tiles contained >500 foreground pixels and their encoded pixels differed.
- Each shot included camera metadata sampled in the PNG callback. Original camera local position and Euler rotation were restored and independently re-inspected.
- The original observe/modify/capture flow still passed: move Cube offscreen, foreground reduced by >90%, duplicate request refused, native Node created, Cube restored, zero collected runtime errors, owned session closed.
- PNG contact sheet visually inspected: both views visibly show the same cube, with distinct face shading. Source image: [review-grid.png](review-grid.png).

Runtime JS is the unchanged committed main artifact, SHA-256 `10f9b9c19dd2afbbc862cf080c77c461e7cb5255b9cb1bc4979877792691e551`. Only development tools/tests/docs changed, not runtime source. The previous fresh runtime build was killed by the environment; no new full-runtime build or release claim is made.

## Targeted checks

- Node MCP protocol/browser-policy/PNG grid tests: **13/13**.
- Bridge lifecycle, AgentSession, debug isolation: **3 suites / 37 tests**.
- Root source + bridge TypeScript: passed.
- Web-only guard: passed, 1,212 reachable files.
- SDK pack dry-run without scripts: 647 files, no tools or node_modules leakage.
- Focused formatting and git diff whitespace check: passed.
- Inventory updated to declare seven additional Jest tests, not to claim a full-suite run.

Regression coverage includes restoration on success/capture failure, fail-closed restoration failure, clock-lease ownership, PNG duplicate IHDR/interlace/chunk rejection, dimension and output budgets, changed/disabled/extra camera rejection, offscreen targetTexture refusal, canvas-size refusal before encoding, draw-bound camera metadata, and ordinary capture compatibility.

## Limits

Zero delta still invokes application callbacks. Only camera local position/rotation is restored. This is not whole-scene rollback, a transaction system, or deterministic replay. BEFORE_DRAW/AFTER_DRAW consistency cannot prove hostile/reentrant code never changed state between observations. The page is trusted local application code.

Full Jest/Gallery/cross-browser/performance/release gates were not run. Existing unrelated formatting failures and two documentation links to absent build outputs remain as recorded in [first-stage evidence](../agent-mcp/verification.md). PR remains draft and unmerged.
