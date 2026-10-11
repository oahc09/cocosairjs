Derived from `AGENTS.md`, `docs/reference/verification.md`, `tools/verify/graphics-and-dom.cjs`, `tools/verify/browser-matrix.cjs`, `tools/verify/tarball-browser-consumer.cjs`, `tools/verify/example-spec-browser.cjs`, `tools/verify/devtools-examples.cjs` (as of 2026-10-10).

Browser gates are the only evidence for Layer 3 behavior, and they have prerequisites that a normal install does not satisfy. Read this before running any collector.

## Playwright is not a project dependency

The repository does not vendor Playwright as a dependency, so browser gates resolve it through a configured tooling environment. Point the tooling at it with `NODE_PATH`, and select a Playwright CLI wrapper with `PWCLI` when the collector shells out (the `capabilities` npm script consumes `PWCLI`). A successful `npm install` does not establish that Playwright resolves or that the browser binaries are present. Confirm resolution before expecting a browser gate to run.

## Browser binaries must be available and start

`npm run verify:port-env` inspects Node, npm, the compiler, the test runner, Playwright resolution and the Playwright browser cache, but it is read-only discovery: a cached binary being listed does not prove it launches. Browser matrix, tarball-consumer and perf-lifecycle additionally need a current built bundle and the example assets. `verify:browser-matrix` reads its scope from the browser matrix contract under `tools/verify/`, not from every Gallery example.

## Server prerequisite for capabilities

`npm run capabilities` merges verification levels with the model catalog and rewrites the capabilities JSON under `examples/gltf-catalog/`. It requires a running development server, for example `npm run dev -- --port 7462` in another terminal, and working Bash plus Playwright CLI tooling. It writes repository content; it is not a read-only probe.

## Presentation evidence is stronger than readback

A matching GPU `readPixels` result is not proof that the frame reached the screen. The DOM-texture scene checks both the raw GPU readback and the actual PNG screenshot pixels after viewport changes, and the runner requires `pngjs` in the same tooling environment as Playwright. Treat a readback-only match as necessary, not sufficient, for compositor presentation (`AGENTS.md`, the browser-evidence table).

## HEADLESS gives no pixel evidence

`npm test` runs Jest under jsdom with HEADLESS. That validates logic, ownership and structure; it cannot validate shader or render output. Visual features require a real browser collector. Do not report a shader or draw behavior as verified from a Jest or typecheck pass.

## UNSUPPORTED versus FAIL

Capability absence is recorded as `UNSUPPORTED` only after capability discovery has run and reported the gap. In the HTML/Graphics probe, the fixture's own status value distinguishes an absent capability from an executed pass (`tools/verify/graphics-and-dom.cjs:104` proceeds to interaction only when the discovered status is `PASS`; a non-PASS status is reported, not asserted as success). Anything that throws before or during the probe is caught and recorded as `status: 'FAIL'` with the failing stage (`tools/verify/graphics-and-dom.cjs:127`).

| observation                                | correct label | why                                                  |
| ------------------------------------------ | ------------- | ---------------------------------------------------- |
| discovery reports the capability is absent | UNSUPPORTED   | the probe ran and honestly reported a gap            |
| browser launch throws                      | FAIL          | no probe executed                                    |
| shader compile or pipeline error           | FAIL          | execution reached a defect, not an absent capability |
| probe times out or yields a black frame    | FAIL          | execution happened and produced bad output           |

Do not soften a launch failure, a timeout, a shader error or a black screen into `UNSUPPORTED`. Capability absence is a discovery result, not an escape hatch for a failed run.

## Before you report a browser claim

Confirm Playwright resolution, the browser-binary availability, the current bundle and any dev server the gate needs; then read the produced report's exit code, timestamp and subset marker rather than assuming a written file proves success (see [gate-catalog.md](gate-catalog.md)).
