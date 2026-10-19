# Small SDK lifecycle and ownership recipes

Run `npm run build:all`, then `npm run dev`, and open these manual pages:

- `/docs/manual/examples/input-focus/`: click Start, canvas and a normal HUD button; press A; hold A while moving into text input; release; Leave and re-enter. Uses the existing ActionInput/session APIs. True browser-window blur, hidden-tab behavior and physical touch still require target-device checks.
- `/docs/manual/examples/runtime-lifecycle-page/`: close during the deliberate one-second load, reload, turn the page 0–180° and back, optionally start a short tone and close. Meshes use separate front/back vertices and opposite normals/winding. The helper starts audio and GPU teardown concurrently and waits for both. Reload is the only recovery path; `webglcontextrestored` does not reconstruct GPU resources.
- `/docs/manual/examples/texture-replacement/`: edit paper color, import images repeatedly, then edit paper again. Imported content has priority. Successful replacement binds before retiring the previous exclusive assets. Rejected, superseded and post-close loads cannot overwrite current content. Loaders must clean their own partial allocations before rejecting.
- `/docs/manual/examples/color-input-contract/`: two independently named shader programs each show vertex sRGB, hardware-sRGB texture, custom linear RGB and a deliberately double-decoded negative control. The first three should match [128,90,50]; the fourth is darker. The narrow layout preflight checks every target/program and rejects unsupported declarations with source positions.

The helpers are example code, not new scene/rendering frameworks. An owner must not pass shared or cached resources to the exclusive sprite-content helper. Manual disposal unregisters each ownership callback, so repeated replacements do not grow the session's callback list.

The lifecycle recipe uses a fresh exclusive orchestration scope. The app owns its own scene scope. Cancellation retires the orchestration token, aborts the load and disables input immediately. All registered teardown callbacks start independently; late assets are destroyed only after their borrowers have detached. A loader that ignores cancellation must eventually settle before its resources can be safely reclaimed. A failed GPU release is reported rather than pretending cleanup succeeded.

Testing commands:

```sh
node --test tools/verify/sdk-recipe-regressions.cjs tools/verify/math-entry.test.cjs
npx tsc -p tools/verify/sdk-recipes.tsconfig.json
node tools/verify/sdk-recipes-browser.cjs
```

The browser collector uses real Playwright clicks/keys/file imports, the SDK's single step clock and screenshot pixels. Each import must change the actual SpriteFrame object; runtime-created frames may have empty UUIDs, and a previous status message is not a completion signal. The context-loss row uses the real `WEBGL_lose_context` extension, trusted loss/restored events, an explicit failed state and actual full navigation before checking a newly rendered scene. This is not a physical GPU-reset test.

It retains failures, response hashes and exact upload arrays in a fresh output directory. It is a bounded recipe check, not canonical gallery promotion. Browser-close resolution is recorded separately from application assertions. Full platform certification, physical shutdown proof under the gallery's versioned protocol, original private shaders/scene references, audible-device timing and long-window performance are separate acceptance work.

## Audit batch status

The [e29 SDK CI run](https://github.com/oahc09/cocosairjs/actions/runs/39234628691) passed 42 CPU checks, a fresh same-head main/math build and hash guards, the real clean-checkout packaging fixture, offline tarball installation, TypeScript 4.9 classic Node/NodeNext checks and six Chromium recipe rows. Core quality and Skills checks passed on that head as well. The final collector enhancement adds actual context-loss/reload coverage and stricter per-import identity waits; its latest-head CI is pending at this source checkpoint. The [PR description](https://github.com/oahc09/cocosairjs/pull/7) links the final immutable run without rewriting earlier results.

The [19-item ledger](../../ai/ledgers/sdk-audit-backlog-20261019.json) separates seven implemented areas from twelve still-open original proposal scopes. Additional recovered project inputs are available for later read-only identity matching; historical missing-material notes are not a current claim that all originals are absent. True window blur, original shader per-pass readback and the original-project/device/performance scopes remain separate.
