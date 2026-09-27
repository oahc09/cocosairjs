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
