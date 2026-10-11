Derived from docs/webgl2-only.md, src/air/context-health.ts (as of 2026-10-08)

`attachContextHealth(canvas, options?)` returns an `AirContextHealth` handle (`src/air/context-health.ts:87-90`, declared under the same symbol name in the generated `build/cocosair.module.d.ts`, currently :55934 - numbers there shift on the next `npm run build:dts`). `createAirApp` attaches it before `game.init` (`src/air/bootstrap.ts:133-134`), so it is already listening when the swapchain first exists; the upstream WebGL2 swapchain only warns on `webglcontextlost`.

## State machine

Type: `'healthy' | 'lost' | 'restoring' | 'failed'` (`src/air/context-health.ts:25`, exported from the main entry declaration as the symbol `AirContextHealthState`, currently `build/cocosair.module.d.ts:55956`). Initial state is `healthy` (`:92`).

| State       | Entered when                                      | Code side effects                                                                                                                 | Loop effect                                                                                                           |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `healthy`   | construction; never re-entered by a restore event | `lastEvent` is reset to `null` on a transition into it (`:151`)                                                                   | running                                                                                                               |
| `lost`      | `webglcontextlost` on the canvas (`:159-169`)     | `event.preventDefault()` inside a try (`:162`), `lostCount += 1`, timeline entry `detail: 'webglcontextlost'`, observers notified | `game.pause()` when `autoPause` is not `false` (`:165-167`), which stops the pacer (`src/cocos/game/game.ts:591-596`) |
| `restoring` | `webglcontextrestored` (`:171-173`)               | `restoredCount += 1`, timeline `detail: 'webglcontextrestored'`; transient only, `failed` is pushed in the same handler           | stays paused                                                                                                          |
| `failed`    | immediately after `restoring` (`:174-176`)        | `reason = 'context-restored-but-gpu-resources-not-rebuilt'`, `suggestion: 'reload'`                                               | stays paused                                                                                                          |

There is no transition back to `healthy` anywhere in the file: once lost, the only documented route forward is a reload.

## Snapshot fields

`snapshot()` (`src/air/context-health.ts:31-51`, built at `:125-144`).

| Field           | Type                                        | Value rule                                                                                                                                                                          |
| --------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `state`         | `AirContextHealthState`                     | current state                                                                                                                                                                       |
| `backend`       | `'webgl2' \| 'none' \| 'unknown'`           | `acquireGl()` calls `canvas.getContext('webgl2')`; a returned context records `webgl2`, otherwise `none`; `unknown` only until the first snapshot or lost event (`:93`, `:104-115`) |
| `lostCount`     | `number`                                    | cumulative `webglcontextlost` observations                                                                                                                                          |
| `restoredCount` | `number`                                    | cumulative `webglcontextrestored` observations                                                                                                                                      |
| `isContextLost` | `boolean \| null`                           | live `gl.isContextLost()`; `null` when no context or the call throws (`:126-129`)                                                                                                   |
| `gamePaused`    | `boolean \| null`                           | reads the private `game._paused`; `null` when unreadable (`:117-123`)                                                                                                               |
| `reason`        | `string \| null`                            | non-null only in `failed`; cleared by every other transition (`:148`)                                                                                                               |
| `suggestion`    | `'reload' \| 'none'`                        | `'reload'` exactly when `state === 'failed'` (`:139`)                                                                                                                               |
| `lastEvent`     | `'lost' \| 'restoring' \| 'failed' \| null` | `null` in `healthy` (`:151`)                                                                                                                                                        |
| `lastEventAt`   | `number \| null`                            | `Date.now()` of the last transition (`:152`)                                                                                                                                        |
| `timeline`      | `{ at, type, detail? }[]`                   | copy of the transition log, newest last, hard cap 32 entries: oldest are spliced off (`:80`, `:149-150`)                                                                            |

## Handle members

| Member            | Rule                                                                                                                                                                      | Source                                                       |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `snapshot()`      | pure read; also probes the GL context, so it is what sets `backend`                                                                                                       | `:125-144`                                                   |
| `onChange(cb)`    | returns an unsubscribe function; `options.onEvent` is registered as a listener up front (`:102`); a throwing observer is caught and cannot break the machine (`:154-156`) | `:184-187`                                                   |
| `requestReload()` | returns `false` and does nothing unless `state === 'failed'`; otherwise invokes `options.reload ?? window.location.reload()` and returns `true`                           | `:188-195`                                                   |
| `destroy()`       | removes both canvas listeners and clears the observer set; `close()` and a failed `game.init` call it                                                                     | `:196-201`; `src/air/app.ts:205`; `src/air/bootstrap.ts:161` |

## Options

| Field       | Type                 | Default                                                                 | Rule                                                                                                         |
| ----------- | -------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `autoPause` | `boolean`            | `true` (`contextLoss.autoPause ?? true` in `src/air/app-config.ts:111`) | `false` keeps the loop running against a dead context; only `=== false` disables it (`context-health.ts:91`) |
| `reload`    | `() => void`         | `window.location.reload()` when `window.location` exists                | injectable for tests; compared by function identity during admission (`src/air/app-config.ts:120`)           |
| `onEvent`   | `(snapshot) => void` | none                                                                    | added as the first observer; identity participates in `AIR_E_APP_CONFLICT`                                   |

## What it does not do

- It does not rebuild GPU resources: no texture, buffer, program or framebuffer recreation happens on `webglcontextrestored`; the transition to `failed` is the honest verdict (`src/air/context-health.ts:13-15`, `:171-177`).
- It does not resume the loop. Nothing in this file calls `game.resume()` - the only loop control it performs is `game.pause()` on a loss (`src/air/context-health.ts:166`), and it never arms `_needsResume`, so `run()` will not resume an autoPause-stopped loop either (the resume path at `src/air/app.ts:152-158` only fires for a `releaseScene()` pause). That is intentional: after a loss the state is `failed` and no GPU resource is rebuilt, so the route is `requestReload()` - an in-document `game.resume()` would only un-pause the pacer to render against a dead context.
- It does not watch a canvas you never attached it to, and `AirApp.contextHealth` is destroyed by `close()`.
- It is not a WebGL 2 availability probe: absence of a WebGL 2 implementation is rejected at device creation with `WEBGL2_REQUIRED` (`src/cocos/gfx/device-manager.ts:180-186`), not reported as a health state.

## Evidence status

Source export and default-bundle reachability: exported through `src/air/index.ts:11` and present in the generated main-entry declaration as the symbol `attachContextHealth` (`build/cocosair.module.d.ts`, currently :55934; numbers shift across `npm run build:dts`). Browser execution of the W01 contract exists in `docs/evidence/w01-context-loss.json` (verdict `PASS`, measured 2026-10-01, single Chromium run asserting `A_healthy`, `C_lost`, `D_noSubmission`, `E_restoreFailed`, `G_secondLoss`), and the regression command is `node tools/verify/context-loss.cjs` (`docs/webgl2-only.md:21-27`). That file is pinned to bundle sha prefix `20a95e6d7e2f348e`; the current `build/cocosair.module.js` hashes to `3a448f029369ac02`, so cite it as historical until the gate is re-run against the current candidate.
