Derived from the cocosair-camera skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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

Both cameras then tie at 0, and ties fall back to extraction order - the render window's own list order, which is node activation order, because `Array.prototype.sort` is stable and the per-frame ascending sort at `src/cocos/root.ts:795` leaves equal values in the order `extractRenderCameras` pushed them. Activation order shifts as nodes enable in different frames, so an unset `priority` makes the overlay draw order nondeterministic. Set distinct values; a runtime `priority` write does apply, but from the next frame, and re-enabling the node changes nothing about order. Recipe values: [multi-camera.md](multi-camera.md).
