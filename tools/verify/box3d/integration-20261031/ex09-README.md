# EX09 independent integration fixture — 2026-10-31

This fixture copies bounded numeric checks from the original SDK223 campaign consumers into a new identity. Original campaign runners, receipts and SDK220/223 candidate locks remain unchanged. Four cases are run: public query/ray/target/support, Fixed healthy, Fixed intentional fault, Fixed idle-enabled reentry. This is **not** a rerun of the original 22-case campaign and gives no full G0–G8, MT, mobile or EX09 business acceptance credit.

## Fresh runtime prerequisite

```
node tools/verify/box3d/integration-20261031/ex09-qualify.mjs SOURCE_ROOT RUNTIME_DIR NEW_OUTPUT_DIR EXACT_BUILD
```

Requires Node with `registerHooks` (Node 24) and the source project's JSDOM dependency. Freezes source, runtime and fixture bytes before running. Each consumer checks the exact build plus native asset hashes and unchanged bytes afterwards. Failure remains failure. The independently generated qualification map has `businessStatus: NOT_RUN` even when all four bounded native cases pass.

Only after successful qualification may a new `transport-candidate-integration-20261031-lock.json` be produced with this exact build, ESM/manifest SHA256 and qualification-map SHA256. Historical locks must not be edited. The generator verifies the raw case receipts and refuses existing output files:

```
node tools/verify/box3d/integration-20261031/ex09-admit.mjs SOURCE_ROOT QUALIFICATION_ATTEMPT_DIR
```

Select explicitly:

```
?profile=inventory&transport=committed-candidate&triggers=primitive-candidate&door=hinge-candidate&session=development-order&candidate=integration-20261031
```

## Browser business run

```
BOX3D_RUNTIME=/absolute/RUNTIME_DIR node examples/box3d-gift-workshop/serve.cjs
node tools/verify/box3d/integration-20261031/ex09-browser.cjs LOOPBACK_URL NEW_OUTPUT_DIR ABSOLUTE_PLAYWRIGHT_MODULE BROWSER_EXECUTABLE chromium
# Or pass a verified local WPE/WebKit launcher and select webkit explicitly.
```

This is an automated **public-input browser scenario**, not human UI acceptance. The actual selected browser engine, version and user agent are recorded. The browser collector uses only read-only public reports, visible alignment and the ordinary UI input queue. It steers the actual magnetic head, awaits actual Fixed attachment, actual weight receipts, settled packing and three actual delivery ledger entries. It never changes a body pose/velocity, mutates a receipt, awards a score or replaces the physics loop. Screenshots and raw action/acknowledgement/report streams are retained. Failure at any stage is recorded; an opened scene or first frame is not business success. Chromium software rendering is not mobile/Safari performance evidence. Human screenshot review and interruption/lifecycle follow-up remain separate.

The current collector first records a passive native-pacer observation, then acquires the public single-step clock only after the example has run its scene. Every action and physics assertion follows awaited real `1/60` engine frames. Movement uses the visible alignment/debug DOM; full public reports are collected when needed for body, attachment, receipt and order assertions. This avoids repeatedly cloning the full trace without replacing any game state. The 960×640 DPR1 headless viewport and bounded 30-minute host budget accommodate software rendering; elapsed wall time is not a device performance benchmark. Per-movement tick/wall deadlines remain independent. After the terminal state the collector restores the pacer and waits for genuine RAF stopped-physics evidence with a deadline. Terminal reports are saved before pacer restoration so cleanup failures cannot erase the scenario evidence.

### Recorded bounded result (2026-10-31)

Fresh SDK 248 (`c2fc14b2d8007fa0d09728971ed9fbccd5e9167580b46c3a176bcb17249c260e`) passed the four Node-hosted real-WASM qualification cases (197 assertions). Separately, browser attempt 6 in local software WebKit 26.5 completed the three-order public-input scenario: 10,298 controlled real frames, three committed ledgers, all six individual weighing receipts, six consumed/retired items, six remaining items, score 308 and 509 game ticks remaining. Two genuine terminal RAF observations had auto-simulation disabled and unchanged item/head/door poses and native counters. Browser errors were empty. Browser and readonly HTTP server were closed. Post-run hashes matched all 8 runtime, 1,574 source and 11 qualification-fixture inputs; the executed browser collector SHA256 was `9042a2aba95290c1213ef31ac5404f7ed7c3b67c4acfd5415488dc0329d9f1e7`.

The successful collector uses legal analog axes within [-1, 1], a slower downward approach and a 0.06 m release gap so objects settle through actual gravity. After weighing, the head hovers using the real item's upper bounds plus positive clearance and reacquires nearby instead of repeating an unnecessary full-height journey. No body writes, time-limit changes, collision-rejection bypasses, receipt injection or weakened stable-packing tests are used. Earlier attempt 4 hit a conservative capsule initial-overlap rejection; attempt 5 genuinely timed out at two orders/200 points. Those attempts remain failures and do not establish automatic overlap recovery. The exact runtime candidate lock still describes bounded qualification (`businessStatus: NOT_RUN`); this independent browser observation does not rewrite historical admission evidence or claim complete G5, mobile performance, ordinary-pacer performance or human usability acceptance.
