# EX02 browser lifecycle attempt — 2026-10-28

**BLOCKED. Real browser boot FAIL; lifecycle acceptance NOT_RUN.** No implementation defect was established, so no lifecycle implementation was changed. EX02 remains draft. This does not qualify Box3D or replace the older limited observations.

Source and remote feature head checked before work: `b267d42e3f2d8f580bf38ae4999f37fe96a3b17a`. The saved `/workspace/cocosairjs` checkout initially had a clean `work` branch at `8f08b952`; the existing feature branch was fetched and checked out cleanly. Its remote head was unchanged on the final pre-commit check. Repository AGENTS.md and AIR verification/physics skills were read; repository and workspace `.agents` had no applicable skills. No exhibition changes, main merge, force push, manual CI, additional cloud task or environment switch occurred.

| Check                                                     | Result              | Evidence / boundary                                                                                              |
| --------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Chromium actual launch                                    | PASS                | System Chromium 154.0.8037.57, headless, 1440×1000, DPR 1; Playwright                                            |
| WebGL2 context                                            | PASS                | Chromium WebGL2, ANGLE Vulkan SwiftShader; context capability only, no Box3D presentation proof                  |
| Gallery entry and navigation back                         | PASS limited        | Real click on draft entry, iframe `/box3d-compound-bowling/`, standalone navigation then browser Back to Gallery |
| EX02 boot / native rendered scene                         | FAIL                | `src/main.ts` HTTP 500, `spawn ETXTBSY`; blank canvas, Start/Close disabled, initialization NOT_RUN              |
| Missing runtime admission                                 | PASS negative check | Actual identity HTTP 503: explicit BOX3D_RUNTIME required; no fallback was selected                              |
| CPU policies/routes/cleanup/lifecycle/typecheck guard     | PASS                | 29/29; exact command in cpu.log test names and below; no native physics                                          |
| Strict check against qualified SDK declarations           | NOT_RUN             | Qualified SDK235 not present; ordinary build declarations were not substituted                                   |
| Stop during motion; Start new generation                  | NOT_RUN             | App never initialized                                                                                            |
| 20 actual releases/rebuilds; rapid clicks                 | NOT_RUN             | App never initialized                                                                                            |
| Close during reset; stale generation read/write exclusion | NOT_RUN             | App never initialized; CPU doubles are not browser evidence                                                      |
| Two-stage release, receipt counts / baseline recovery     | NOT_RUN             | No scene mounted or released                                                                                     |
| Final app.close receipt                                   | NOT_RUN             | No app created                                                                                                   |
| Browser close                                             | PASS limited        | Playwright browser.close resolved; no independent process-tree wait/ECHILD collector was used                    |

## Precise blockers and completed setup

No qualified runtime was found in this saved environment. Existing `build/` has ordinary runtime files but no `physics/box3d/st/` transport or receipt. The committed SDK235 archives contain selected evidence, not an SDK binary package, and were not treated as one. Actual ordinary runtime/source hashes are retained in inventory.json; they are **not** SDK235 identity. Build counter remains 235. No fresh runtime build ran, so no SDK236 or rebuilt SDK235 claim is made.

The official emsdk repository cloned into `/workspace/box3d-ex02-acceptance/toolchain/emsdk` at `d7b4130688bfa348392b921ab04015aa15c4f154`. `./emsdk install 6.0.2` resolved the expected release `004876f1984e18a9eb0736c5ca417ac86d386fb8` but failed downloading `https://storage.googleapis.com/webassembly/emscripten-releases-builds/deps/node-v24.19.0-linux-x64.tar.xz`: `Tunnel connection failed: 403 Forbidden`. The permission-escalated same command also failed with that exact proxy response. Neither action was rejected by automatic approval review; the network download failed. No alternate host or proxy bypass was attempted. Emscripten installation and consequently ST/ESM/DTS rebuilding remain blocked. CMake 4.4.4 and Ninja 1.13.2 successfully installed only under the task directory via pip --target; no global installation occurred.

`npm ci --ignore-scripts --no-audit --no-fund` did not finish: repeated tarball corruption/retry messages are retained in the original log. It was terminated (TERM, then KILL when still running). Local node_modules is incomplete. The dev server could serve Gallery/HTML, but esbuild failed with ETXTBSY while that incomplete installation was active. This is environment/setup failure, not evidence of a lifecycle source bug. A subsequent independent esbuild transform also failed with EPIPE. A complete project dependency installation and qualified runtime are both required before recollecting browser evidence.

Resume by supplying the actual qualified SDK235 binary inventory or allowing the official Emscripten download route to succeed, completing dependency installation, then producing a new numbered build if rebuilding. Preserve all attempts. Run existing EX02 controls in a fresh evidence directory and retain native generations, both release receipts per cycle, resource counts, final Close and Gallery operation evidence. The present screenshots show blocked boot only.

## Retained evidence

[Raw files and screenshots](artifacts/ex02-browser-preflight-20261028/): browser.json includes timestamp, console, page errors, HTTP statuses, renderer, button states and close result; gallery-missing-runtime.png and standalone-missing-runtime.png were captured and Gallery screenshot visually inspected. identity-response.txt is the actual 503 body. main-response.txt and gallery-server.log retain transformation failure. cpu.log retains the 29 passing tests. Both emsdk download attempts, task-local Python installation, incomplete npm installation and source/runtime inventory are retained unmodified. browser-preflight.cjs is the exact attempt script, with original local output path retained. SHA256SUMS binds every retained file except itself.

CPU command (no runtime import):

```sh
node --test examples/box3d-compound-bowling/tests/*.test.mjs \
  examples/box3d-compound-bowling/tests/*.test.cjs \
  tools/verify/box3d/compound-bowling/check-types.test.cjs
```
