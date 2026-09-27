# Errors

## [ERR-20260927-001] g1-trial-playwright-resolution

**Logged**: 2026-09-27T03:38:12Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
The G1 trial runner could not resolve the Playwright package from the default Node environment.

### Error
```text
[g1-trial] 需要外部 Playwright：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/g1-trial-run.cjs
```

### Context
- Command: `node tools/verify/g1-trial-run.cjs --ids=ui-components --click=1`
- The repository does not declare Playwright as a local dependency; this environment exposes it through the Codex bundled Node package directory.

### Suggested Fix
Set `NODE_PATH` to the available Playwright-containing `node_modules` directory for browser verification commands.

### Metadata
- Reproducible: yes
- Related Files: `tools/verify/g1-trial-run.cjs`

### Resolution
- **Resolved**: 2026-09-27T03:38:12Z
- **Notes**: Located Playwright in the Codex bundled Node packages and reran the trial with `NODE_PATH` set for that process. The subsequent V1.1 targeted run passed, exposing a separate uncancelled timeout timer that kept Node alive after completion; that runner issue is recorded below.

---

## [ERR-20260927-003] powershell-inventory-json-case-collision

**Logged**: 2026-09-27T03:51:33Z
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
PowerShell's default JSON conversion rejected API inventory keys that differ only by letter case.

### Error
```text
ConvertFrom-Json: JSON contains keys with different casing; use -AsHashTable.
```

### Context
- Attempted to group case-sensitive `docs/example-api-inventory.json` entries by class using `ConvertFrom-Json`.
- The inventory legitimately contains both `Sprite.fillType` and `Sprite.FillType`.

### Suggested Fix
Use Node.js `JSON.parse` or PowerShell `ConvertFrom-Json -AsHashTable` when processing this inventory.

### Metadata
- Reproducible: yes
- Related Files: `docs/example-api-inventory.json`

### Resolution
- **Resolved**: 2026-09-27T03:51:33Z
- **Notes**: Repeated the read-only grouping with Node.js JSON parsing, which preserves the case-sensitive API names.

---

## [ERR-20260927-002] v11-verifier-keeps-process-alive

**Logged**: 2026-09-27T03:41:56Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
The V1.1 verifier left its per-example timeout active after successful completion, keeping Node alive until the timeout elapsed.

### Error
The verifier printed its final `1/1 PASS` summary but retained the Node process for the full 120-second timeout interval.

### Context
- Command: `node tools/verify/v11-examples-verify.cjs --ids=ui-components --out=<temp> --artifact-dir=<temp>`
- The example result and evidence were written successfully; the process remained alive due to the timer created in `verifyOne`.

### Suggested Fix
Retain the timeout handle and clear it after the per-example result settles.

### Metadata
- Reproducible: yes
- Related Files: `tools/verify/v11-examples-verify.cjs`

### Resolution
- **Resolved**: 2026-09-27T03:41:56Z
- **Notes**: Clear the timeout handle after the per-example run settles; reran `ui-components` and confirmed the verifier exits immediately after its successful summary.

---

## [ERR-20260927-004] api-trace-class-length-collision

**Logged**: 2026-09-27T05:08:41Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
API tracing mistook a class constructor's built-in `Function.length` for an instance method such as `Quat.length`.

### Error
The V1.1 run reported `math.Quat.length` as not observed and failed `api-executed`, even though the example called the instance method.

### Context
- Command: full `node tools/verify/v11-examples-verify.cjs` run.
- The API trace wrapper first inspected the class constructor's own `length` data property and did not fall through to the matching prototype method.

### Suggested Fix
When non-writable constructor metadata shadows a same-named prototype method, instrument the prototype method and keep other configurable data reads on the `read` channel.

### Metadata
- Reproducible: yes
- Related Files: `tools/verify/api-trace.cjs`

### Resolution
- **Resolved**: 2026-09-27T05:08:41Z
- **Notes**: Added the constructor-metadata collision guard; targeted Quat/Vec2 regressions passed, followed by the full 140/140 V1.1 run.

---

## [ERR-20260927-005] gallery-decoder-probe-race

**Logged**: 2026-09-27T05:08:41Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
The Gallery artifact verifier sampled decoder resources before asynchronous glTF fetch and parse work completed.

### Error
`gltf-draco` intermittently failed the GLB request and decoder-state checks immediately after the page published `__airApp`.

### Context
- Command: `node tools/verify/v11-gallery-artifact.cjs verify`
- The example publishes its app before awaiting `fetch('./assets/draco.glb')` and `loader.parseAsync(...)`; the verifier only waited for the app boot signal.

### Suggested Fix
Wait for the example's terminal `window.__decoderState` before reading resource timing and decoder status.

### Metadata
- Reproducible: yes
- Related Files: `tools/verify/v11-gallery-artifact.cjs`

### Resolution
- **Resolved**: 2026-09-27T05:08:41Z
- **Notes**: Added a bounded decoder-state wait and reran the complete Gallery artifact check: 211/211 PASS.

---

## [ERR-20260927-006] g1-extensionless-contract-import

**Logged**: 2026-09-27T07:34:28Z
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
The G1 browser trial timed out because a new TypeScript helper was imported without the `.js` extension required by the repository's source resolver.

### Error
The page received a 404 for the extensionless helper import and never published `window.__trialProbe`.

### Context
- Command: `node tools/verify/g1-trial-run.cjs --ids=math-vec3-length-products`
- The repo dev server resolves `.js` imports to sibling `.ts` sources; it does not resolve extensionless relative imports.

### Suggested Fix
Use explicit `.js` extensions for relative ESM imports, including imports whose source file is `.ts`.

### Metadata
- Reproducible: yes
- Related Files: `examples/math-vec3-length-products/src/main.ts`

### Resolution
- **Resolved**: 2026-09-27T07:34:28Z
- **Notes**: Changed the import to `./vec3-core-contract.js`; the 43-check Vec3 browser trial passed.

---

## [ERR-20260927-007] duplicate-mat3-api-claim

**Logged**: 2026-09-27T07:34:28Z
**Priority**: medium
**Status**: resolved
**Area**: docs

### Summary
A corrected Mat3 field claim remained duplicated in the frozen example specification.

### Error
Strict specification validation rejected both `api.claims` and `api.evidence` for duplicate `math.Mat3.m04` entries.

### Context
- The original `math-mat3-elements` specification listed `math.Mat4.m04` at the line that actually reads `Mat3.m04`.
- Rebinding that unit to the real declaration exposed the duplicate in the same specification.

### Suggested Fix
Keep a single `math.Mat3.m04` claim and evidence row, and verify against the AST inventory.

### Metadata
- Reproducible: yes
- Related Files: `examples/math-mat3-elements/example.json`

### Resolution
- **Resolved**: 2026-09-27T07:34:28Z
- **Notes**: Removed the duplicate after correction; strict validation returned to 145/145 and the focused Mat3 V1.1 run passed.

---

## [ERR-20260927-008] test-inventory-parallel-contention

**Logged**: 2026-09-27T07:44:43Z
**Priority**: low
**Status**: resolved
**Area**: tests

### Summary
Running test-inventory alongside the full Jest suite caused the inventory runner to miss one long-running suite.

### Error
The concurrent inventory check observed 32 suites / 262 tests and reported `smoke-28-benchmark-regression.test.ts` missing, while the separate Jest run completed 32/32 suites and 263/263 tests.

### Context
- Commands: `npm test` and `npm run verify:test-inventory` launched concurrently.
- The smoke suite took about 68 seconds under concurrent load; the inventory check was then rerun alone.

### Suggested Fix
Run test-inventory after Jest has exited instead of concurrently with another Jest process.

### Metadata
- Reproducible: yes
- Related Files: `tools/verify/test-inventory.cjs`

### Resolution
- **Resolved**: 2026-09-27T07:44:43Z
- **Notes**: The sequential `npm run verify:test-inventory` rerun passed with 32 suites / 263 tests and no failures.

---

## [ERR-20260927-009] instance-data-trace-owner-resolution

**Logged**: 2026-09-27T07:44:43Z
**Priority**: medium
**Status**: resolved
**Area**: tests

### Summary
Value-type fields and the renderer Camera pipeline are instance-owned data properties, so prototype-only tracing could not prove their reads.

### Error
The first full V1.1 pass with generic instance-field tracking produced false `api-executed` failures for unrelated DragonBones and GLTF asset data, and aliased math constructors did not share the instance instrumentation registry.

### Context
- Commands: focused and full `tools/verify/v11-examples-verify.cjs` runs during Wave 7.
- The valid owners are inventory-declared Core math value types and `renderer.scene.Camera`; field instrumentation must attach to the constructed or accessor-returned instance.

### Suggested Fix
Gate own-field instrumentation by inventory parent and property kind, and register constructor aliases by class identity/name before reading fields.

### Metadata
- Reproducible: yes
- Related Files: `tools/verify/api-trace.cjs`

### Resolution
- **Resolved**: 2026-09-27T07:44:43Z
- **Notes**: Limited instrumentation to declared math value-type properties and renderer.scene.Camera fields, added returned-object instrumentation, and completed the full V1.1 run at 140/140 PASS with 0 unproven.

---
