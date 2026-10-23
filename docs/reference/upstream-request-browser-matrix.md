# Native glTF HTTP request-policy matrix

This is the executable browser companion to `test/smoke/upstream-request-policy.test.ts` for upstream U01/T01–T06. It is a prepared harness, **not browser PASS evidence**. It uses the built browser runtime from the current `build/cocosair.module.js`, native `createAirApp()`, `GLTFLoader`, Cocos assets, real Fetch, and real loopback HTTP responses. It does not use EmptyDevice, intercepted Playwright responses, a replacement Image constructor, or a mocked engine.

## Run and retain evidence

A fresh main bundle, matching Playwright/browser installation, and authorization to launch the selected browser and local HTTP servers are required. Run from the repository root:

```sh
node --test tools/verify/upstream-request-policy-browser.test.cjs
node tools/verify/upstream-request-policy-browser.cjs --browser=chromium --out=<new-chromium-attempt-directory>
node tools/verify/upstream-request-policy-browser.cjs --browser=firefox --out=<new-firefox-attempt-directory>
node tools/verify/upstream-request-policy-browser.cjs --browser=webkit --out=<new-webkit-attempt-directory>
```

The browser defaults to Chromium; each command runs only the explicitly selected dimension. The existing `browser-engines.cjs` `launchOptions()` resolves the executable and options, including its documented explicit executable override and software-GL setting. A launch failure does not switch browsers, executables, URLs, environments, or transports. Browser-specific HTTP/cache behavior is measured: a mismatch remains a failed assertion, not an inferred PASS or silent skip. All three retained current-input runs are needed to establish the frozen desktop matrix.

`--help` is side-effect free. `--record-not-run=<verified blocker>` records NOT_RUN without opening a browser or starting a server, and exits nonzero. It is a limitation record, not a failed launch attempt or execution proof. For example:

```sh
node tools/verify/upstream-request-policy-browser.cjs --browser=chromium --out=<new-not-run-directory> --record-not-run='Browser launch unavailable in the current authorized environment; no launch attempted'
```

The output directory must not already exist. Source, fixture, lockfile, SDK and collector hashes are frozen before execution and checked again afterwards. Any change invalidates the attempt. Runtime bundle and fixture response bodies are matched against those hashes. Retained output includes an initial input receipt, per-case raw outcomes, partial snapshots (including failures), browser/page/network logs, HTTP event JSONL and final receipts, separate case validation, and process-close state. A failed case is retained and later cases continue in new contexts. Neither this collector nor its unit tests modify canonical evidence, the acceptance manifest, release ledgers, runtime sources, package scripts, or remote state.

## Prepared case inventory

Every case runs in its own browser context and engine instance. This isolates global defaults, native Asset cache, HTTP cache, cookies and the engine singleton. The fixture exposes `window.__requestPolicy.run()`, `snapshot()` and `close()`; the collector explicitly calls them. Native pacing is paused before controlled observations, and `createStepClock().step(0)` supplies the actual deferred-destruction boundary. The fixture contains no business animation, input or physics progression.

| Case                                                              | Acceptance | Measured contract                                                                                                                                                                                                                                |
| ----------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `default-options`                                                 | T01, T06   | Concurrent option-free loads share the same native Asset; repeated load makes no additional HTTP request; default credentials and omitted hint/cache fields remain intact.                                                                       |
| `policy-inheritance`                                              | T02, T03   | Global priority/cache/credentials reach main file, buffer and fetched image; undefined instance values inherit; mutable headers were snapshotted.                                                                                                |
| `policy-override`                                                 | T02, T03   | Explicit `auto`, `default`, `same-origin` and empty headers override global settings rather than being treated as absent.                                                                                                                        |
| `cross-origin-headers`                                            | T02        | Main-origin synthetic header is observed by the primary server but absent from both cross-origin dependencies; `omit` sends no synthetic cookie.                                                                                                 |
| `redirect-headers`                                                | T02        | Configured headers select `redirect: error`; the source 302 is retained and the cross-origin redirect target receives zero requests.                                                                                                             |
| `http-cache`                                                      | T02, T06   | Configured loads create separate assets while real HTTP cache can reuse bytes. A fresh force-cache response, a cache hit, ETag/no-cache revalidation and two no-store bypasses are counted independently for main/buffer/image.                  |
| `pre-abort`                                                       | T04        | AbortError before fetch or progress; no mounted result.                                                                                                                                                                                          |
| `abort-main`                                                      | T04        | Cancellation after a main-response body has started closes that unfinished HTTP body; same-URL retry succeeds.                                                                                                                                   |
| `abort-buffer`, `abort-image`                                     | T05        | Explicit dependency body barrier, observed abort, parser-owned resource cleanup, no post-abort progress/mount, successful same-URL retry.                                                                                                        |
| `abort-decode-meshopt`, `abort-decode-draco`, `abort-decode-ktx2` | T03, T05   | An application-injected frozen provider continues after consumer cancellation; its late result is not used. The same provider serves retry, retains its own different HTTP policy, and is not reconfigured or disposed by loader or app cleanup. |
| `abort-handoff`                                                   | T05        | Abort in final objects progress destroys already-created mesh/material/texture/image assets at the native destruction boundary, revokes blob URLs, does not mount, and allows retry.                                                             |
| `multi-consumer`                                                  | T06        | Same URL and different policies/response identities produce separate assets. Both main bodies are pending when A aborts; B completes only after that abort, then A retries.                                                                      |
| `multi-consumer-same-policy`                                      | T06        | The same overlapping cancellation ownership test with identical policies; configured consumers remain independently owned.                                                                                                                       |
| `retry-network`, `retry-parse`                                    | T05        | A retained dependency 503 or invalid main glTF is followed by a successful same-URL load without poisoned configured-load cache state.                                                                                                           |

## HTTP and ownership oracles

`test/fixtures/upstream-request-policy/server.cjs` supplies deterministic local triangle geometry, a generated one-pixel PNG, glTF documents, and bounded injected-provider inputs. The primary origin proxies static fixture/runtime bytes from the existing read-only `competitive-example-server.cjs`. A second loopback origin exists only for cross-origin checks. No deployment or external endpoint is involved.

The server sends controlled Cache-Control and SHA-256 ETags. The cache row requires four server requests per resource with statuses `200,304,200,200` for five loader requests. Native Asset identity is checked separately, so HTTP `no-store` is never described as disabling every engine cache. The collector independently checks raw Fetch options, exact server resource counts, headers, conditional revalidation, completion/abort events, and assertion completeness.

Cancellation uses an explicit partial-body barrier, not an arbitrary network sleep: the server sends a byte and retains the rest until the fixture aborts or explicitly releases it. Concurrent consumers have separate body barriers. Monotonic server event sequence numbers must show B's request began before A's abort and B finished afterwards. Body cancellation does not claim a third-party decoder was physically stopped. Decoder promises are settled after AbortError and before a controlled native frame boundary; late geometry/texture/progress counters must remain unchanged.

Only synthetic test headers and a boolean presence check for `air_policy_fixture=synthetic` are retained. Arbitrary cookies, Authorization headers and unrelated headers are not logged. The fixture's transparent Fetch observer delegates to the original browser Fetch; it does not provide response bytes. Priority is checked as an input hint only. An absent `Request.prototype.priority` is recorded explicitly; no completion order, acceleration or scheduling guarantee is claimed.

## Current status and honest limits

- The 18-case fixture, three-browser selector, real HTTP collector, and fail-closed unit/mutation checks are implemented. Syntax and unit tests do not establish runtime acceptance.
- Chromium, Firefox and WebKit browser results are **NOT_RUN** in this work. Previously verified environment blockers include Chromium socket EPERM, denied elevated sandbox creation, cloud-CDP inability to reach shell loopback, and an explicitly denied file-URL route. No blocked route was retried and no external deployment was attempted. Earlier failed attempts remain retained under the [upstream verification ledger](../../ai/ledgers/upstream-update.md).
- The three injected providers implement the public caller-owned decoder contracts with deterministic local outputs. This tests loader waiting, late-result isolation, options and ownership, **not actual vendor Draco/meshopt/BasisU codec correctness or vendor worker/WASM deployment**. There is no internally constructed decoder in these loader paths, so the matrix does not invent an internal-decoder policy result.
- `abort-image` cancels the real image HTTP dependency. It does not deterministically stop inside the browser's native PNG decoder; the separate CPU suite covers the queued native-image completion race without representing it as a browser result.
- This is HTTP/lifecycle evidence, not a rendered-pixel or compositor oracle. It makes no image-equivalence, mobile-device, benchmark, memory-pressure or canonical Gallery claim. Existing frozen CPU `1e-5` and RGBA8 component-error `≤2` tolerances are neither changed nor applied to unrelated request counts.
- Simple browser-process close observation is retained separately from application outcomes. It is not the complete campaign's proof-bound physical shutdown/ECHILD certificate, so `physicalCampaignShutdownProof` remains false.
