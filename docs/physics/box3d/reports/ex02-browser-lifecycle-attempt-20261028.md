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

## Dependency recovery follow-up — 2026-10-28 01:53 UTC

**Dependency installation and TS/HTTP conversion are now PASS. Qualified SDK and actual lifecycle remain blocked / NOT_RUN.** This appended attempt preserves the original failed boot, screenshots and command logs above. No implementation, package manifest, lockfile or build counter changed. The feature branch was still `e6738d9c36e603620ccbe71338c09565ccee097a` before follow-up edits.

### Diagnosis and recovery

The original npm log has 1,442 tarball retry warnings across 410 distinct package names, including `@jridgewell/gen-mapping` (42), `ansi-regex` (40), `@babel/traverse` and `@babel/generator` (38 each), and `jsesc` (36). Those are warnings from an interrupted installation, not a terminal integrity failure attributable to one package. Their upstream corruption cause was not established. The full package/count inventory is retained in prior-retry-packages.json.

Before reinstalling, `node_modules/@esbuild/linux-x64/bin/esbuild` measured only 17,426 bytes; `file` recognized an ELF whose section header offset was beyond the file (11,427,840). The first HTTP ETXTBSY occurred while npm was still installing. After termination, an independent invocation failed with EPIPE. These observations are consistent with running an executable while it was being written and then using its incomplete bytes; they do not establish an EX02 source defect. The old malformed binary was replaced by npm ci and is not retained. Its size/type observation was recorded during diagnosis; no original binary checksum is claimed.

The official `registry.npmjs.org` download of locked `@esbuild/linux-x64@0.28.2` succeeded, HTTP 200, 4,741,809 compressed bytes. Its SHA512 matches the unchanged package-lock.json SRI exactly. The recovered installed binary matches the tarball member byte-for-byte: 11,427,952 bytes, SHA256 `e1698a3d5c6c0798fee4fd3b5cc816651f460c63d390a7a26ea4beb0b1884100`, version 0.28.2.

A fresh-cache npm attempt exposed a second setup issue: the lockfile has 765 official registry URLs and 127 `registry.npmmirror.com` URLs. A registry option alone does not replace those explicit mirror hosts. That attempt was stopped after TERM did not terminate it, using KILL, to constrain subsequent retrieval to the requested official registry. Its raw log/debug log are retained; no mirror-specific network denial is claimed from that interrupted attempt.

Using npm's existing per-command `replace-registry-host` option preserves locked versions and integrity checks while replacing those mirror hosts with the official registry. The successful command was:

```sh
npm ci --ignore-scripts --no-audit --no-fund \
  --registry=https://registry.npmjs.org/ \
  --replace-registry-host=registry.npmmirror.com \
  --cache /workspace/box3d-ex02-acceptance/dependency-followup/npm-cache \
  --fetch-retries=0 --fetch-timeout=30000 --maxsockets=4
```

Exit 0: 848 packages installed in 5 seconds. Its debug log records 126 GETs, all to `registry.npmjs.org`, with other entries served from the task-local cache. `npm rebuild esbuild --offline` using that cache then exited 0, validating its ordinary postinstall path. `npm ls --all --json` exited 0 with a complete dependency graph. Other package lifecycle scripts were intentionally not run by npm ci; the claim is dependency graph and required esbuild readiness, not validation of every package's scripts. No npm/global/network-security configuration changed. package-lock.json SHA256 remains `69d2f4480314c9a4630a72ff608d1b83fbf7d10a9d2ed8e3b3dc8590e5ff2e47`.

### Fresh verification and retained attempts

- PASS: actual esbuild.transform on current EX02 main.ts, ESM/es2022, no warnings; output 19,889 bytes. Re-parsing the emitted JS also succeeds.
- PASS: fresh dev server at `127.0.0.1:7473` returns main.ts HTTP 200, JavaScript MIME, 75,292 bytes. The exact response matches an independent transform using the server's absolute sourcefile and inline source map options. Response and hashes are retained.
- A first follow-up checker exited 1 because it compared the HTTP inline-source-map output with a transform without a source map. This was a harness comparison error. Its original script, JSON, response and failure log are preserved in transform-attempt1. The prematurely written PASS status field in that failed JSON is invalid; its exit failure and matchesDirectTransform=false are authoritative. The corrected checker computes status from the actual assertion and exits 0; this does not require changing application or server code.
- The first attempt to restart port 7472 failed with EADDRINUSE; its log is retained. The old server's HTTP 500 response is also retained. Port 7473 is a new local server in the same environment, not a deployment or environment switch.
- PASS limited: fresh real Chromium visit/click/back and WebGL2 capability probe. Current main.ts and the three local protocol/lifecycle/cleanup modules return 200. The runtime module and identity endpoint return 503 because no qualified runtime was supplied. Start and Close stay disabled; screenshot still shows a blank scene. Actual app boot remains FAIL; all requested lifecycle operations remain NOT_RUN.
- PASS CPU only: all 29 focused tests rerun, zero failures. No strict qualified-SDK declaration check or native simulation was run.

New raw logs, scripts, dependency graph, source/response hashes, failed checker attempt, console/HTTP records and two screenshots are under [ex02-dependency-recovery-20261028](artifacts/ex02-dependency-recovery-20261028/). The new Gallery screenshot was visually inspected. The original preflight directory is unchanged. The official esbuild tarball remains only in the task directory, with its SRI and binary comparison retained in registry-probe.json; no SDK binary is supplied by these evidence records.

### Remaining network action

**Dependency repair is complete; npm registry access needs no change.** For a future qualified ST rebuild, the environment administrator/user must allow the proxy's HTTPS CONNECT/download route to **`storage.googleapis.com:443`**, specifically the official `/webassembly/emscripten-releases-builds/` prefix. The blocked URL was `/webassembly/emscripten-releases-builds/deps/node-v24.19.0-linux-x64.tar.xz`; the pinned compiler package is `/webassembly/emscripten-releases-builds/linux/004876f1984e18a9eb0736c5ca417ac86d386fb8/wasm-binaries.tar.xz`. These supply the official emsdk toolchain required to build the missing ST WASM. The former URL already failed with proxy 403 in the retained original attempts; the latter was not requested in this follow-up. No Google download was retried, no alternate host/mirror was used for that toolchain, and no proxy/security setting was changed. SDK235 is absent and cannot be reused here. Build counter is still 235, with no fresh SDK produced.
