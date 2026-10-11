---
name: cocosair-camera
description: Add and drive the Cocos AIR Camera component with the original Cocos APIs - projection switching between PERSPECTIVE and ORTHO, fov and fovAxis, orthoHeight and orthoWidth, near and far clip planes, the normalized rect viewport and priority draw order, visibility layer masks, the screen-to-world conversions worldToScreen/screenToWorld/screenPointToRay/convertToUINode in left-bottom-origin physical pixels, the AIR frameObject(camera,target,fallbackDistance=6) framing helper over MeshRenderer worldBounds, and the oblique near plane via calculateObliqueMat and clip-space minZ. Use when adding or configuring a camera, switching perspective or ortho, stacking a split-screen or overlay second camera, fitting a model in view, converting pointer pixels to a world ray or UI node, or debugging AIR_E_ORTHO_WIDTH and wrong screenToWorld results.
---

# Cocos AIR camera

Frame a scene with the original `Camera` component: choose the projection and its clip planes, decide which layers it draws and in what order, and convert between world space and the physical screen rectangle it renders into. AIR ships no Creator camera preview; every camera is built and configured in code.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, MeshRenderer, Material, Layers, Vec3, Color, primitives, utils, frameObject } from 'cocosair'; // page alias, not the package name

const app = await createAirApp({ canvas: '#GameCanvas' }); // canvas must exist before this import
const scene = new Scene('Main');

const camNode = new Node('Main Camera');
scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 2.2, 6.5));
camNode.lookAt(new Vec3(0, 0.6, 0));              // orientation follows the node; lookAt once at this position

const camera = camNode.addComponent(Camera);       // component owns the render-scene Camera (camera.camera)
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;                                  // degrees, vertical axis by default
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(28, 36, 52, 255);
camera.priority = 0;                              // lower priority draws first

const modelRoot = new Node('Model');              // frameObject measures this node's MeshRenderer bounds
modelRoot.layer = Layers.Enum.DEFAULT;            // must be contained in camera.visibility or it is culled
scene.addChild(modelRoot);
modelRoot.setPosition(new Vec3(0, 0.6, 0));
const renderer = modelRoot.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
renderer.material = material;

frameObject(camera, modelRoot);                  // puts the camera on the boundsCenter->cameraPos ray at the fit distance and lookAt(boundsCenter)
app.run(scene);                                  // frameObject ran before run, so it used aspect = 1; see Contracts
</script>
```

Entry choice, the importmap alias and install are owned by [cocosair-project-setup](../cocosair-project-setup/SKILL.md); `createAirApp`/`run` by [cocosair-application](../cocosair-application/SKILL.md); node transform and layer bits by [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md).

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - `node.layer` bits and the `visibility` mask values this camera tests against (`references/layers.md` there).
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which entry exposes `Camera` and `frameObject`.

Rendering pipeline, lights, shadows and post-process belong to the cocosair-rendering skill; UI canvas and design-resolution input handling belong to the cocosair-ui-2d and cocosair-input-action skills - none of those three skills exists yet, so route through the router.

## When to use what

- "Put a view into a scene" -> `node.addComponent(Camera)`; the render object is `camera.camera` (`src/cocos/misc/camera-component.ts:202`).
- "Switch perspective and orthographic framing" -> `camera.projection`, plus `fov`/`fovAxis` or `orthoHeight`/`orthoWidth`; table in `references/camera-projection.md`.
- "Fit a loaded model in view" -> `frameObject(camera, target, fallbackDistance?)` (`src/air/utils/frame-object.ts:35`).
- "Split-screen or picture-in-picture" -> `camera.rect` (normalized viewport `Rect`).
- "Two cameras, who draws on top" -> `camera.priority` + `camera.clearFlags`; behavior in `references/multi-camera.md`.
- "Which nodes does this camera draw" -> `camera.visibility` layer mask (bit values owned by cocosair-scene-graph).
- "Convert a pointer pixel to a world ray / node position" -> `camera.screenToWorld`, `camera.screenPointToRay`, `camera.convertToUINode`; coordinate space in `references/screen-world.md`.
- "Clip at an arbitrary near plane (mirror, water)" -> `camera.camera.calculateObliqueMat(Vec4)` and `camera.camera.getClipSpaceMinz()`.

## Contracts

- The user surface is the `Camera` component (`@ccclass('cc.Camera')`, `src/cocos/misc/camera-component.ts:102`), not the render-scene `scene.Camera`. `_createCamera` builds the scene camera during `onLoad` (`:605`, `:712`); the component's own getters/setters only mirror onto it while it exists (every setter guards `if (this._camera)`, e.g. `:317`), so reads are valid before activation but writes before `onLoad` are held in the serializable fields and pushed on the next `_createCamera` (`:726-743`).
- `camera.camera` is TYPED non-null but IS `null` until the component activates: the getter returns `this._camera!` (`src/cocos/misc/camera-component.ts:202-204`) and `_camera` is only assigned inside `onLoad` -> `_createCamera` (`:713-714`), which needs the node active under a scene handed to `app.run`. So touch `camera.camera.*` (`calculateObliqueMat`, `aspect`, `width`/`height`, `changeTargetWindow`) only after the first run frame, and null-check it in code that can run earlier - `frameObject` does exactly that (`src/air/utils/frame-object.ts:44`). The same guard silently skips work that looks like it ran: the `fovAxis` setter's fov conversion sits inside `if (this._camera)` (`camera-component.ts:339-342`), so a pre-activation `fovAxis` write converts nothing and the `fov` number you typed is later interpreted against the other axis. `frameObject` hits the same null: it substitutes `aspect = 1` when `camera.camera` is missing (`src/air/utils/frame-object.ts:44-45`), so a call before the first run frame sizes the fit for a square window - harmless when the window is square or wider (the vertical half-fov governs), but on a portrait window the horizontal field is narrower than the fit assumed and the target overflows; call it after activation or increase `fov`.
- Component conversion methods take the INPUT first and an optional `out` second, returning `out`: `worldToScreen(worldPos, out?)` (`:654`), `screenToWorld(screenPos, out?)` (`:667`), `screenPointToRay(x, y, out?)` (`:641`). The wrapped render-scene `Camera` uses the opposite order `worldToScreen(out, worldPos)` etc. (`src/cocos/render-scene/scene/camera.ts:1336`, `:1282`, `:1243`). Call the component version; with no `out`, `screenToWorld` allocates one pre-filled with a COPY of the camera node's world position (`:668` -> `node.getWorldPosition()`, which returns a new `Vec3` when called without an argument, `src/cocos/scene-graph/node.ts:2666-2672`) - the node's stored position is not mutated, but pass an explicit `out` to avoid allocating per call.
- Screen space is physical framebuffer pixels with a LEFT-BOTTOM origin (doc comment `src/cocos/misc/camera-component.ts:634, :648`). `camera.width`/`camera.height` are the swapchain pixels: `resize` only assigns the size it is handed and derives `aspect` from it (`src/cocos/render-scene/scene/camera.ts:984-991`, called with the window size from `changeTargetWindow` `:1220-1221`), and the effective-DPR scaling happens upstream - DPR = `min(devicePixelRatio, cap)` with cap default 2 (`src/pal/screen-adapter/web/screen-adapter.js:78-81`), applied to the CSS size in `windowSize` (`:83-89`). `worldToScreen` returns `z` normalized to `[0,1]` (`camera.ts:1355`) and it is PROJECTIVE there (non-linear in world distance); `screenToWorld` does not invert that curve - it re-reads `screenPos.z` as a LINEAR near->far fraction (`:1310`), so the two `z` conventions do not round-trip: with `near = 0.1`, `far = 1000` a point at depth 5 projects to `z ~= 0.98` and 0.98 back-projects to depth ~980 on the same ray. Convert first (`docs/manual/cameras.md:300`, asserted in `examples/render-composite/src/main.ts:232-239`) or pick with `screenPointToRay` + an intersection. `event.getLocation()` already yields left-bottom physical pixels; pass it straight in.
- Priority is a draw ORDER key, re-sorted ASCENDING EVERY FRAME: `root._frameMoveEnd` sorts the extracted camera list with `a.priority - b.priority` (`src/cocos/root.ts:795`) right before handing it to `this._pipeline.render(cameraList)` (`:801`), and that list is rebuilt each frame from the render windows (`:761`, `:769-771` -> `src/cocos/render-scene/core/render-window.ts:309-316`). So a LOWER `priority` renders first (background) and a higher one over it, and a runtime `camera.priority` write takes effect from the NEXT frame - the render-scene setter is a bare store (`src/cocos/render-scene/scene/camera.ts:501-503`) because the sort is per-frame, not because writes are ignored. Default `priority` is 0 (`src/cocos/misc/camera-component.ts:146`), UI range `[0, 65535]` (`:211`). The window's own attach-time sort (`render-window.ts:365-367`, called only from `attachCamera` `:331`) fixes EXTRACTION order, which is what breaks ties between equal priorities (`Array.prototype.sort` is stable, so ties keep window push order = node activation order) - set distinct priorities whenever order matters; re-enabling the node does not change order (`camera-component.ts:609-614` -> `_attachToScene` `:749-758` -> `render-scene.ts:268-271` touches the render-SCENE list, which rendering does not walk).
- `orthoWidth` defaults to 0, which keeps native `orthoHeight * aspect` half-width; a finite non-negative value fixes the half-width independently and perspective ignores it (`src/cocos/misc/camera-component.ts:383-391`, `src/cocos/render-scene/scene/camera.ts:1079`). Assigning a negative or non-finite value throws `AIR_E_ORTHO_WIDTH` and keeps the old value (`camera-component.ts:387`, `camera.ts:697`).
- The component viewport is the normalized `camera.rect` `Rect(0,0,1,1)` (`src/cocos/misc/camera-component.ts:168, :481`). Setting the render-scene `viewport` directly warns (`warnID(8302)`, `camera.ts:758-760`) and is rerouted through `setViewportInOrientedSpace` (`:1115`), which flips `y` when `screenSpaceSignY < 0` and re-rotates per surface orientation.
- The oblique near plane lives on the render object: `camera.camera.calculateObliqueMat(viewSpacePlane: Vec4)` rebuilds the ordinary projection first, then rewrites the near row and inverse matrices (`camera.ts:1389-1418`); a non-finite/zero plane throws `AIR_E_CLIP_PLANE` (`TypeError`, `:1392`) and a degenerate plane against the projection throws `AIR_E_CLIP_PLANE` (`RangeError`, `:1404`). `getClipSpaceMinz()` returns the device `capabilities.clipSpaceMinZ` (`:1421`): -1 on the WebGL 2/GL path (`src/cocos/gfx/base/define.ts:774`), 0 only on WebGPU (`src/cocos/gfx/webgpu/webgpu-device.ts:544`); the WebGPU backend is not a shipped AIR target.
- Capability layers, stated separately (source export / default-bundle reachable / browser-verified): `Camera`, `Camera.ProjectionType`/`FOVAxis`/`ClearFlag` and `frameObject` all resolve by symbol name in the main entry declaration `build/cocosair.module.d.ts` (`Camera` currently :24943, `frameObject` currently :56816). They are NOT exposed by the narrow `cocosair.js/bootstrap` entry, whose declaration has one value export - `export declare function createAirApp` (currently :3 in `build/bootstrap.d.ts`) - plus the `AirApp`/`AirAppOptions` type re-export, nor by `cocosair.js/html-source`. No camera behavior here is browser-verified against the current candidate; the `examples/camera-*` Gallery apps exercise it, which is not current-candidate evidence.

## Common Mistakes

### [HIGH] Dividing screen pixels by devicePixelRatio before screenToWorld

Wrong:

```js
// cssPos came from getBoundingClientRect(), and you "undo" DPR by hand
const world = camera.screenToWorld(new Vec3(cssPos.x / window.devicePixelRatio,
                                           cssPos.y / window.devicePixelRatio, 0.5));
```

Correct:

```js
// event.getLocation() is already left-bottom-origin physical pixels; feed it through directly
const p = event.getLocation();
const world = camera.screenToWorld(new Vec3(p.x, p.y, 0.5), new Vec3());
```

`worldToScreen`/`screenToWorld` operate in the framebuffer's physical pixels (`camera.width`/`camera.height` are the effective-DPR swapchain size), so an agent that reads "screen space" as CSS pixels divides by `devicePixelRatio` a second time; the result is a world ray/point scaled by `1/dpr^2` that lands off-target, and the extra `y` flip the manual CSS conversion needs is silently skipped, so the pick is vertically inverted too.

### [HIGH] Copying the render-camera argument order onto the component

Wrong:

```js
const out = new Vec3();
camera.worldToScreen(out, worldPos);   // scene-camera order: the component reads `out` as worldPos
camera.screenToWorld(out, screenPos);  // reads out (zeros) as the screen pixel and writes the world point into screenPos
```

Correct:

```js
const out = new Vec3();
camera.worldToScreen(worldPos, out);   // component order: input first, optional out second
camera.screenToWorld(screenPos, out);
```

Upstream Cocos docs and the internal `scene.Camera` use `worldToScreen(out, worldPos)`, so an agent transcribes that order onto the user-facing component: `out` (zeros) is then treated as the world position, the real point is dropped, and the call returns a value with no throw - the object just silently contains the projection of the wrong input. The mirrored swap on `screenToWorld` is equally silent and reads the other way: the zeroed `out` is CONSUMED as the screen pixel, the world point is written into `screenPos` (the object you meant as input), and `out` keeps its zeros - nothing is ignored, both arguments change role.

### [MEDIUM] Stacking two cameras and trusting creation order for draw order

Wrong:

```js
const base = baseNode.addComponent(Camera);      // priority 0 (default)
const overlay = overlayNode.addComponent(Camera); // also priority 0
overlay.clearFlags = Camera.ClearFlag.DEPTH_ONLY;
// both are 0, so the attach order decides who wins - and the overlay sometimes paints under
```

Correct:

```js
base.priority = 0;                                // drawn first (background)
overlay.priority = 1;                             // drawn after, composited over base
overlay.clearFlags = Camera.ClearFlag.DEPTH_ONLY;  // keep base color, write only depth+overlay
```

Both cameras then tie at 0, and ties fall back to extraction order - the render window's own list order, which is node activation order, because `Array.prototype.sort` is stable and the per-frame ascending sort at `src/cocos/root.ts:795` leaves equal values in the order `extractRenderCameras` pushed them. Activation order shifts as nodes enable in different frames, so an unset `priority` makes the overlay draw order nondeterministic. Set distinct values; a runtime `priority` write does apply, but from the next frame, and re-enabling the node changes nothing about order. Recipe values: `references/multi-camera.md`.

## References

- `references/camera-projection.md` - component field defaults with numbers, projection/clip-plane tables, `fovAxis`, `orthoWidth`/`AIR_E_ORTHO_WIDTH`, exposure enums, `frameObject` parameter and behavior matrix, oblique near plane and clip-space minZ.
- `references/multi-camera.md` - `priority` sort semantics, `clearFlags` values, `rect` viewport, `visibility`, `targetTexture`, and the two-camera overlay recipe.
- `references/screen-world.md` - `worldToScreen`/`screenToWorld`/`screenPointToRay`/`convertToUINode` signatures and coordinate-space conventions, physical-pixel/DPR handling, depth `z` semantics.

## Canonical docs

`docs/manual/cameras.md`, `docs/manual/design-viewport-and-controls.md`.
