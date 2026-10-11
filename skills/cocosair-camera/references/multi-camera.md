Derived from src/cocos/misc/camera-component.ts, src/cocos/render-scene/scene/camera.ts, src/cocos/render-scene/core/render-window.ts, src/cocos/render-scene/core/render-scene.ts, src/cocos/root.ts, src/cocos/rendering/render-pipeline.ts, src/cocos/rendering/scene-culling.ts, examples/camera-multi/src/main.ts, examples/camera-viewport-props/src/main.ts, docs/manual/cameras.md (as of 2026-10-09)

## Draw order: the priority sort chain

All cameras on one render window draw in ASCENDING `priority` - lower value = earlier = background layer. The authoritative ordering is recomputed EVERY FRAME: `root._frameMoveEnd` clears and refills `root._cameraList` from every render window (`root.ts:761`, `:769-771`), sorts it with `a.priority - b.priority` (`:795`) and hands that array to `this._pipeline.render(cameraList)` (`:801`); the classic pipeline iterates it in the order given (`src/cocos/rendering/render-pipeline.ts:494-495`) and a custom pipeline receives the same sorted array. The render window's own sort runs only at attach and fixes extraction order, i.e. the tie-break among equal priorities.

| Step                      | Location                                                | Fact                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Component default         | `camera-component.ts:146`                               | `_priority = 0`                                                                                                                                                                                                                         |
| Component range           | `camera-component.ts:211`                               | `@range([0, 65535, 1])` (UI range only; the setter itself does not clamp)                                                                                                                                                               |
| Component setter          | `camera-component.ts:217-222`                           | stores `_priority`, mirrors `this._camera.priority = val` when the render camera exists                                                                                                                                                 |
| Scene-camera setter       | `camera.ts:501-503`                                     | `set priority (val) { this._priority = val; }` - plain assignment, no re-sort and no dirty flag, because the per-frame sort re-reads the value                                                                                          |
| Priority read at creation | `camera-component.ts:712-722`                           | `_createCamera` passes `priority: this._priority` into `initialize`, so the value set BEFORE activation is honored                                                                                                                      |
| Scene attach              | `camera-component.ts:757` -> `render-scene.ts:268-272`  | `_attachToScene` (`:749-758`) calls `rs.addCamera(this._camera)`; `addCamera` calls `cam.attachToScene(this)` (`camera.ts:964-967`, only sets `_enabled`/`_scene`) and pushes into the RENDER-SCENE list, which rendering does not walk |
| Window attach             | `camera.ts:1208-1223` (`changeTargetWindow`)            | `win.attachCamera(this)` + `this.window = win` + `resize(win.width, win.height)` (width/height swapped when the surface orientation is 90/270)                                                                                          |
| Window list sort          | `render-window.ts:324-331`, `:365-367`                  | `attachCamera` skips a camera already in the list (`:325-329`), otherwise pushes and calls `sortCameras()`; this fixes EXTRACTION order (the tie-break) only                                                                            |
| Per-frame extraction      | `root.ts:761`, `:769-771` -> `render-window.ts:309-316` | `root._cameraList` is emptied in `_frameMoveBegin`, then refilled per window with `camera.enabled` cameras only, each `camera.update()`-d                                                                                               |
| Per-frame sort            | `root.ts:795`                                           | `cameraList.sort((a, b) => a.priority - b.priority)` - the AUTHORITATIVE draw order, recomputed every frame                                                                                                                             |

Consequences:

1. A `priority` write takes effect from the NEXT frame. The component setter mirrors onto the render camera (`camera-component.ts:217-222`), the render-scene setter just stores (`camera.ts:501-503`) with no re-sort and no dirty flag, and `root.ts:795` re-sorts the freshly extracted list every frame before the render handoff at `:801`, so nothing needs re-attaching for a new order to apply. Re-enabling the node does nothing for order: `onEnable` -> `_attachToScene` (`camera-component.ts:609-614`, `:749-758`) only moves the camera within the render-SCENE list (`render-scene.ts:268-272`), while rendering walks the render-WINDOW list.
2. `sortCameras` has exactly ONE call site, `attachCamera` (`render-window.ts:331`; a repo-wide grep finds no other caller), so the window's own ordering happens only when a camera enters it - `initialize` -> `changeTargetWindow` (`camera.ts:941-942`, `:1208-1223`) and every `targetTexture` reroute. `Array.prototype.sort` is stable, so that order survives the per-frame sort as the TIE-BREAK between equal priorities, and it equals node activation order - not a contract. Give stacked cameras distinct priorities.
3. Window plumbing changes membership, not priority: `changeTargetWindow` (`camera.ts:1208-1211`) first `detachCamera`s from the old window (`render-window.ts:344-351`, splices the entry out), then attaches and re-sorts on the new one; `attachCamera` ignores a camera already present (`:325-329`); `targetTexture` writes reroute through it (below).
4. Enable/disable is the per-frame gate: `extractRenderCameras` (`render-window.ts:309-316`, called from `root.ts:771`) pushes only `camera.enabled` cameras, and `_enabled` tracks the render scene (`attachToScene` `camera.ts:964-967` sets it true, `detachFromScene` `:973-975` false, read by the `enabled` getter `:478`) - so a disabled component drops out of the drawn list from the next frame while keeping its slot in the window list, where it still occupies a tie-break position.

## clearFlags per pass (values in [camera-projection.md](camera-projection.md))

| Camera role             | Setting                                       | Why                                                                                               |
| ----------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| First (lowest priority) | `Camera.ClearFlag.SOLID_COLOR` + `clearColor` | wipes color+depth+stencil (`ClearFlagBit.ALL = 7`)                                                |
| Overlay                 | `Camera.ClearFlag.DEPTH_ONLY`                 | clears only depth+stencil (`6`), keeps the lower camera's color, so the overlay composites on top |
| Accumulation pass       | `Camera.ClearFlag.DONT_CLEAR`                 | clears nothing (`0`)                                                                              |
| Skybox first pass       | `Camera.ClearFlag.SKYBOX`                     | `14` = skybox bit `8` + `DEPTH_STENCIL 6`; depth+stencil are cleared either way                   |

## rect: the normalized viewport

- Public surface is the component's `camera.rect`, a normalized `Rect(0, 0, 1, 1)` by default (`camera-component.ts:168`); the setter calls `this._camera.setViewportInOrientedSpace(val)` (`camera-component.ts:487`). x/y/width/height are fractions of the framebuffer, so split-screen is `Rect(0, 0, 0.5, 1)` + `Rect(0.5, 0, 0.5, 1)` on two cameras.
- `setViewportInOrientedSpace` (`camera.ts:1115-1155`) flips `y` first (`y = screenSpaceSignY < 0 ? 1 - val.y - height : val.y`, `:1117`; `screenSpaceSignY = 1` on the WebGL path, `gfx/base/define.ts:775`, so no flip), then writes `_viewport` ROTATED inside the `surfaceTransform` switch (`:1122-1146`; ROTATE_90 sets `x = 1 - y - height, y = x` at `:1124-1125`) and writes the unrotated `_orientedViewport` copy after the switch (`:1150-1153`), then re-resizes (`:1155`). The oriented copy is what the screen conversions use (see [screen-world.md](screen-world.md)).
- Setting the render-scene `camera.viewport` directly is a no-go path: the setter only emits `warnID(8302)` and reroutes to `setViewportInOrientedSpace` (`camera.ts:758-761`); use the component `rect`.
- `aspect` includes the viewport extent: `(width * viewport.width) / (height * viewport.height)` (`camera.ts:989` in `resize`, `:903` in `_updateAspect` `:902`), so a half-screen `rect` halves the aspect term feeding `Mat4.perspective`/`Mat4.ortho`.

## visibility: which camera draws which nodes

`camera.visibility` defaults to `CAMERA_DEFAULT_MASK` (`camera-component.ts:178`; scene-camera default `camera.ts:875`, reset `:934`). The culling predicate differs per pipeline - 3D uses containment `(visibility & node.layer) === node.layer` (`src/cocos/rendering/scene-culling.ts:198`); full bit tables and both predicates are owned by cocosair-scene-graph [layers.md](../../cocosair-scene-graph/references/layers.md). Two cameras over one scene partition content by layer:

```js
baseCamera.visibility = Layers.makeMaskInclude([Layers.Enum.DEFAULT]);     // 3D world
overlayCamera.visibility = Layers.makeMaskInclude([Layers.Enum.UI_2D]);    // overlay-only nodes
```

(`examples/camera-multi/src/main.ts:81, :95` - the same pair as `priority = 0` / `priority = 1` at `:82, :96` with `DEPTH_ONLY` on the overlay at `:94`.)

## targetTexture: rendering off-screen

- Default `null` = draw straight to the screen (`camera-component.ts:180`). Writing it (`:501-516`) rebinds the render window: a non-null `RenderTexture` routes the camera to `renderTexture.window` via `changeTargetWindow(window)` plus `setFixedSize(window.width, window.height)` (`_updateTargetTexture`, `:780-790`); assigning `null` back calls `changeTargetWindow(EDITOR_NOT_IN_PREVIEW ? tempWindow : null)` (`:511-514`; in a shipped AIR build that ternary yields `null` and the scene camera resolves it to `root.mainWindow`, `camera.ts:1212`) and sets `isWindowSize = true` (`camera-component.ts:513`), and the node emits `Camera.TARGET_TEXTURE_CHANGE` (`'tex-change'`, `camera-component.ts:515`; enum `CameraEvent`, `:94-96`).
- Initial window: `_createCamera` passes `window: root.mainWindow` only in editor mode and `root.tempWindow` otherwise (`camera-component.ts:719-720`), but nothing in `src/` ever ASSIGNS `root.tempWindow` - its setter (`src/cocos/root.ts:101-103`) has no caller and the field stays `null` (`:251`) - so in AIR that argument is `null`, and `initialize` -> `changeTargetWindow(info.window)` (`camera.ts:941`) falls through to `window || root.mainWindow` (`camera.ts:1212`). The camera is therefore already on the main window after activation, not "settled later": `_updateTargetTexture()` (`:746`, and on every `targetTexture` write) only acts when `_targetTexture` is non-null (`:785-788`), otherwise it changes nothing.
- Resize plumbing: `_checkTargetTextureEvent` (`:766`) listens to the texture's `resize` event; `onDestroy` (`:622-631`) unhooks it with `off('resize')` (`:629`).

## Two-camera overlay recipe (from examples/camera-multi/src/main.ts)

| Camera        | priority    | clearFlags                              | visibility                                       | layer of its content                     |
| ------------- | ----------- | --------------------------------------- | ------------------------------------------------ | ---------------------------------------- |
| BaseCamera    | `0` (`:82`) | `SOLID_COLOR` + `clearColor` (`:79-80`) | `makeMaskInclude([Layers.Enum.DEFAULT])` (`:81`) | `node.layer = Layers.Enum.DEFAULT`       |
| OverlayCamera | `1` (`:96`) | `DEPTH_ONLY` (`:94`)                    | `makeMaskInclude([Layers.Enum.UI_2D])` (`:95`)   | `node.layer = Layers.Enum.UI_2D` (`:62`) |

Both are `PERSPECTIVE`, `fov = 45`, `near = 0.1`, `far = 1000` (`:75-78`, `:90-93`). The distinct `0` / `1` pair is what makes the order deterministic; it holds whether the values are set before activation or rewritten at runtime (applied from the next frame, `root.ts:795`), while leaving both at the default `0` hands the decision to activation order.

## Capability layers (not to be conflated)

- Source export: the entire multi-camera machinery is plain `src/cocos` code; nothing beyond `Camera`/`Rect`/`Layers` is needed from users.
- Default-bundle reachable: `Camera`, `Camera.ClearFlag`, `Camera.ProjectionType` resolve by symbol name in `build/cocosair.module.d.ts` (`export class Camera extends Component` currently :24943); `Rect` and `Layers` are exported alongside.
- Browser-verified: NOT verified against the current candidate. `examples/camera-multi` and `examples/camera-viewport-props` exercise priority/clearFlags/rect/targetTexture reads (`examples/camera-viewport-props/src/main.ts:140, :156-157`) as Gallery demos; gallery history is not current-candidate evidence - check `docs/evidence` before repeating any runtime claim.
