# Agent MCP first-stage verification

Date: 2026-11-09. Base: `32d289cf3221cf88fe491ce8109c5702b015e4f3`.

## Actual browser result

A real MCP SDK stdio client launched `tools/mcp/cli.mjs`, which owned an isolated Chromium 141.0.7390.37 headless browser. It loaded the current checkout's hello-cube through its local dev server. Both read-only and writable sessions completed. The successful run used an existing compatible Chromium executable via AIR_CHROMIUM; downloading Playwright's newer browser failed with an invalid ZIP, and launching the system browser inside the restricted process environment failed before this successful local-browser run.

- Inspected the existing native Cube node, validated invalid-scale rejection and read-only write denial.
- Changed Cube local position to `[1000, 0, 0]`, confirmed the reported native transform and controlled AFTER_DRAW completion.
- Received fresh 640×480 PNGs with increasing frameIndex. Before had 14,113 foreground pixels; the after assertion required fewer than 10% of that count. Both images were also visually inspected.
- Reusing the same requestId was rejected without undoing the first write.
- Created a native Node, restored Cube, read zero collected runtime errors, and closed the owned browser. Further capture returned SESSION_CLOSED.

[Before](before.png) · [After](after.png)

The runtime JS was the unchanged committed main artifact (SHA-256 `10f9b9c19dd2afbbc862cf080c77c461e7cb5255b9cb1bc4979877792691e551`), not a newly rebuilt runtime. A fresh main build was attempted and killed by the execution environment before publication. Runtime source was not modified by this change. This evidence proves the new development adapter against that artifact, not a fresh runtime release.

## Other checks

- Root TypeScript source plus new MCP bridge: passed with `node tools/mcp/check-bridge-types.cjs`.
- AgentSession, debug isolation and new bridge lifecycle suites: 3 suites / 30 tests passed. The 3 new test titles are added to the inventory; its full-run passed/failed totals remain unknown, not promoted to PASS.
- Web-only dependency guard: passed (1,212 reachable files).
- Focused formatting and `git diff --check`: passed.
- SDK pack dry-run with scripts disabled: 647 files; no tools/ or node_modules entries. This checks package boundaries, not full release artifact readiness.
- Protocol and browser-policy tests: 8/8 passed; run with `npm test --prefix tools/mcp`; these cover SDK negotiation/schema limits, queue admission and the network/cleanup regressions independently of rendering.

## Unpassed or unrun gates

- Full runtime build: killed, as above.
- Full repository formatting: failed in 5 unmodified example files: box3d-compound-bowling/style.css, box3d-rigidbody-playground/source-identity.json, and box3d-trigger-lifecycle/{index.html,src/main.ts,style.css}. No unrelated reformatting or ignore changes were applied.
- Documentation reference gate: failed on existing references to absent build/npm/cocosair.module.js and build/runtime-interop-android.cjs. New guide links resolve; the missing artifacts were not fabricated.
- Full Jest inventory run, complete Gallery campaign, WebGPU, other browsers, performance, release readiness, remote CI and adversarial-JavaScript sandbox guarantees were not established by these checks.

This is a targeted development-tool increment. Batch transactions, checkpoints/undo, asset catalogs, multi-view review, GPU memory planning and video export remain outside this PR.
