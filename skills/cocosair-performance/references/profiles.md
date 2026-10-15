Derived from `src/cocos/profiler/profiler.ts`, `src/exports/profiler.ts`, `src/cocos/core/platform/debug.ts`, `src/cocos/game/game.ts`, `src/cocos/game/director.ts`, `src/cocos/rendering/custom/pipeline.ts`, `src/cocos/rendering/custom/executor.ts`, `src/pal/screen-adapter/web/screen-adapter.js`, `src/air/app.ts`, `src/air/app-config.ts`, `src/air/bootstrap.ts`, `src/air/safe-bootstrap.ts`, `docs/manual/rendering-on-demand.md`, `docs/manual/interactive-performance.md`, `examples/profiler-overlay/main.js`, `examples/profiler-overlay/example.json`, `examples/starfield-galaxy/src/main.ts`, `docs/evidence/examples-verified.json`, `docs/evidence/recipes/competitive-batching/browser.json`, `tools/verify/interactive-performance.cjs`, `tools/benchmark/recipes/run-competitive-batching.cjs`, `tools/README.md`, `build/cocosair.module.js` (as of 2026-10-09).

## Profiler: what you can actually call

Two names reach the default bundle face: `Profiler` (the class, `src/cocos/profiler/profiler.ts:97`, `extends System`) and `profiler` (the module-level singleton created once at `:617` and also published as `cclegacy.profiler` at `:619`), re-exported through `src/exports/profiler.ts:1` and present in the export block of `build/cocosair.module.js`. There is one singleton, not one per app, and there is no numeric readout API - the whole surface is `showStats()` (`:233`), `hideStats()` (`:183`), `isShowingStats()` (`:179`), `setBackgroundColor(color)` (`:141`), `setFontColor(color)` (`:152`) and the counter descriptors (`get stats()` `:176`). Both color setters no-op when the value already matches (`:142-:143`, `:153-:154`) and otherwise destroy and rebuild a visible panel by calling `hideStats()` then `showStats()` (`:146-:149`, `:157-:160`), so set them before the first `showStats()`. The font defaults to `Color.WHITE` (`:126`).

A second activation path exists for projects that carry profiling settings: `init()` reads `settings.querySettings(SettingsCategory.PROFILING, 'showFPS')` and calls `showStats()` or `hideStats()` accordingly (`:132-:139`).

The counter set is fixed at `src/cocos/profiler/profiler.ts:74-87`:

| key             | label on the overlay | source of the number                                                                                          |
| --------------- | -------------------- | ------------------------------------------------------------------------------------------------------------- |
| `fps`           | `Framerate (FPS)`    | `counter.frame(now)` at `:581`; `below: 30` (`:75`) is only the overlay's red threshold, not a runtime target |
| `frame`         | `Frame time (ms)`    | started in `beforeUpdate`, ended at `:580`                                                                    |
| `logic`         | `Game Logic (ms)`    | BEFORE/AFTER_UPDATE pair registered at `:255-:256`                                                            |
| `physics`       | `Physics (ms)`       | BEFORE/AFTER_PHYSICS pair `:257-:258`                                                                         |
| `render`        | `Renderer (ms)`      | started at `:558`, ended at `:568`                                                                            |
| `present`       | `Present (ms)`       | started at `:569`, ended at `:582`                                                                            |
| `draws`         | `Draw call`          | `device.numDrawCalls` `:590`                                                                                  |
| `dispatches`    | `Dispatch call`      | `device.numDispatches ?? 0` `:592` (a missing value reads as 0)                                               |
| `instances`     | `Instance Count`     | `device.numInstances` `:593`                                                                                  |
| `tricount`      | `Triangle`           | `device.numTris` `:596`                                                                                       |
| `textureMemory` | `GFX Texture Mem(M)` | `device.memoryStatus.textureSize / (1024 * 1024)` `:595`                                                      |
| `bufferMemory`  | `GFX Buffer Mem(M)`  | `device.memoryStatus.bufferSize / (1024 * 1024)` `:594`                                                       |

Two mechanical consequences: the numbers refresh on a wall-clock gate, because `afterPresent` returns until 500 ms have passed since the last refresh (`:584-:586`, `_average = 500` at `:43`); and the overlay is itself scene geometry - `showStats` builds a 2D canvas plus a `MeshRenderer` and hands that model to the pipeline slot `director.root!.pipeline.profiler` (`:552`), which the custom pipeline renders only when the model exists, is enabled and the current pass carries `showStatistics` (`src/cocos/rendering/custom/executor.ts:1282-1283`; the context flag defaults to false `:1665` and is copied per pass from `pass.showStatistics` `:1954`; slot declared `src/cocos/rendering/custom/pipeline.ts:123`). The texture is 280x280 at 23 px font (`_constants` `:89-95`).

`hideStats` is a full teardown: it destroys the node, the shared material, the mesh, the canvas and the texture (`:186-:205`), removes all seven director listeners (`:220-:226`), clears the pipeline slot to `null` (`:228`) and sets `cclegacy.game.config.showFPS = false` (`:229`); `showStats` sets the same flag true (`:266`) and re-listens for `Game.EVENT_RESTART` so the node regenerates after a restart (`:248-:249`).

Do not write `setDisplayStats(true)` / `isDisplayStats()`: both are `@deprecated` since v3.6 (`src/cocos/core/platform/debug.ts:414`, `:405`) and are thin forwarders to `legacyCC.profiler.showStats()/hideStats()` (`:416-:419`) and `isShowingStats()` (`:407-:408`), each silently doing nothing when `cclegacy.profiler` is absent.

Browser status: `examples/profiler-overlay/main.js` is the runnable proof. `:65-:67` sets both colors then calls `showStats()`, and `:70` derives the badge from `profiler instanceof Profiler && profiler.isShowingStats()` rather than from a DOM counter. Its `examples/profiler-overlay/example.json` (`specStatus: "frozen"`, `promotion.candidate: "2f089f6ce25eaccd"`) is the spec, and `docs/evidence/examples-verified.json` records the id as `PASS` with `visible-frame` plus `frame-diff` and executed `Profiler.showStats`/`setBackgroundColor`/`setFontColor`/`isShowingStats`. The spec's `api.forbiddenShortcut` list explicitly rules out the two shortcuts an agent reaches for: drawing your own DOM FPS text instead of the engine panel, and importing `profiler` without calling `showStats()` then claiming the panel is visible.

## On-demand rendering is pause plus step, not a mode

`docs/manual/rendering-on-demand.md:6` records the status as PARTIAL: `app.run(scene)` always starts a continuous loop, so on-demand is layered on top of it as a workaround. The mechanism, in source order:

- `game.pause()` (`src/cocos/game/game.ts:591`) returns early if already paused (`:592`), sets `_paused`, stops the pacer (`:594`) and emits `Game.EVENT_PAUSE` (`:595`).
- `game.step()` (`:551`) is exactly `director.tick(this._calculateDT(true))` (`:552`), and with `useFixedDeltaTime` the returned dt is `frameTime / 1000` (`:1048-:1050`). A stepped frame therefore advances by the nominal interval and ignores the wall clock; `game.deltaTime` (`:432`) reports that same fixed value while the flag is set.
- `game.frameRate` setter (`:416`) coerces non-numbers with `parseInt` and falls back to `60` on `NaN` (`:417-:421`), then sets `this.frameTime = 1000 / frameRate` (`:424`) and retargets the live pacer (`:425`). Change it before you rely on `step()` dt.
- `game.resume()` (`:603`) calls `input._clearEvents()` first (`:605`): input queued while paused is dropped, not replayed.
- `game.isPaused()` (`:615`) is the flag to assert on.

`director.pause()` cannot substitute: it only sets `_paused` (`src/cocos/game/director.ts:333-:334`), and inside `director.tick` that flag gates the update block alone (`:795-:816`) while `uiRendererManager.updateAllDirtyRenderers()` and `this._root!.frameMove(dt)` run unconditionally (`:818-:821`). Rendering keeps spinning. `Director.EVENT_AFTER_DRAW` (`:240`) is emitted immediately after `frameMove` (`:821`), which makes it the hook for "the first real frame landed".

Two traps the manual documents from measurement (`docs/manual/rendering-on-demand.md:50-:59`, `:78-:80`): calling `game.pause()` synchronously right after `app.run(scene)` draws zero frames and `EVENT_AFTER_DRAW` never fires, so subscribe with `director.once(Director.EVENT_AFTER_DRAW, ...)` and pause inside it; and `game.pause()` suspends more than rendering - input dispatch (Web/minigame platform input excepted) and audio come with it (`:84`), so an on-demand scene must name its own wake-up source (pointer handler, `setInterval` poll, network callback).

## pixelRatioCap, DPR and the resolution chain

`AirAppOptions.pixelRatioCap?: number` (`src/air/app.ts:81`). Resolution order in `normalizeAirOptions`: the option, else the legacy global `__CCDPR_CAP__` when it parses finite and positive, else `2` (`src/air/app-config.ts:66-67`). A `0`, negative or non-finite value throws `AIR_E_PIXEL_RATIO_CAP` (`:68-69`).

Pass pixelRatioCap through createAirApp. Main import may precede canvas creation; startup admission sets canvas density before PAL binding. No independent safe package entry or pre-import global assignment is required.

Cost model, in the order the engine applies it: `windowSize` is CSS pixels times `devicePixelRatio` (`src/pal/screen-adapter/web/screen-adapter.js:83-88`), then `resolution = windowSize * resolutionScale` (`:97-:100`), and writing `resolutionScale` triggers `_cbToUpdateFrameBuffer` (`:105-:111`). Lowering the cap cuts fragment work at fixed layout; `resolutionScale` shrinks the framebuffer itself, which costs text and thin-geometry legibility. AIR design resolution is validated in the same normalizer - finite positive `width`/`height` plus a native policy integer `0..4`, else `AIR_E_DESIGN_RESOLUTION` (`src/air/app-config.ts:71-75`).

## What the 50k starfield evidence proves, and what it does not

`examples/starfield-galaxy/src/main.ts` plots `STAR_COUNT = 50000` points (`:21`) as one `MeshRenderer` on one node (`:88`), with the mesh declaring `primitiveMode: gfx.PrimitiveMode.POINT_LIST` (`:98`) plus explicit `minPos`/`maxPos` bounds (`:99-:100`) built through `utils.createMesh` (`:96`). The on-screen readout and the probe both read the live count back from `renderer.mesh.struct.vertexBundles[0].view.count` (`:156`, `:174`), so the 50000 is asserted from the runtime mesh rather than from the constant.

The matching `docs/evidence/examples-verified.json` result (id `starfield-galaxy`, `result: "PASS"`, per-result `candidateFingerprint: "2f089f6ce25eaccd"`, file-level `measuredAt: "2026-10-04T05:52:32.537Z"` - results carry no own timestamp) covers `scene-ready`, `node-exists`, `no-runtime-error`, `frame-diff`, `visible-frame` (`litRatio=1.0000`), the reset-button interaction and `resource-released` (`held=3 leaked=0 reloaded=true`), and records two executed APIs: `Material.setProperty` (451 calls) and `utils.createMesh` (2 calls).

It does not record a frame rate. The example's own `fps` is a rolling 2000 ms window of `EVENT_AFTER_DRAW` timestamps (`examples/starfield-galaxy/src/main.ts:167-:172`) and the probe labels it `real-render-loop-2s; not GPU or display-present` (`:164`). Never present 50k points as a throughput number, and never present that `fps` as GPU evidence.

## Tools-side profiling writes evidence; it is not a runtime knob

Two collectors exist, and both refuse to overwrite:

- `node tools/verify/interactive-performance.cjs --out=<new.json>` freezes 36 local five-second windows (Chromium, DPR 1 and 2, three workloads, screenshots on and off, three repeats) and keeps raw per-frame intervals, CPU update/submit marker ranges and screenshot wall-time (`tools/README.md:190`). Its own report is `result: 'LIMITED'`, `subset: true`, `completed: false`, with the budget block `NOT_RUN` and GPU time `unavailable` because no timer query is inserted (`tools/verify/interactive-performance.cjs` design block); the boundary text is `docs/manual/interactive-performance.md:3-:7`. Marker ranges include the callbacks' own cost and are not GPU execution time. Missing `--out=`, or pointing at an existing file, throws before any measurement.
- `node tools/benchmark/recipes/run-competitive-batching.cjs` runs the eight batching/instancing conditions with 120-frame raw sampling and writes `docs/evidence/recipes/competitive-batching/browser.json` plus 8 PNGs; gate it with `node tools/verify/recipe-review-gate.cjs --scope=competitive-batching` (`tools/README.md:99-:100`). A PASS for this scope is not the legacy Golden/Catalog/30-Recipe PASS.

Neither command is read-only, neither runs inside a user's app, and neither builds the SDK - they require the current `build/cocosair.module.js`. For an in-app decision, use the runtime overlay above plus your own counters; use the tools only when the task is to produce evidence about this repository.
