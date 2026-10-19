# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `node.layer` bits and the `visibility` mask values this camera tests against ([layers.md](../../cocosair-scene-graph/references/layers.md) there).
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry exposes `Camera` and `frameObject`.

Rendering pipeline, lights, shadows and post-process belong to the cocosair-rendering skill; UI canvas and design-resolution input handling belong to the cocosair-ui-2d and cocosair-input-action skills - load the matching existing skill only when the task crosses that boundary.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Frame a scene with the original `Camera` component: choose the projection and its clip planes, decide which layers it draws and in what order, and convert between world space and the physical screen rectangle it renders into. AIR ships no Creator camera preview; every camera is built and configured in code.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Dividing screen pixels by devicePixelRatio before screenToWorld
- [HIGH] Copying the render-camera argument order onto the component
- [MEDIUM] Stacking two cameras and trusting creation order for draw order

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Add and drive the Cocos AIR Camera component with the original Cocos APIs - projection switching between PERSPECTIVE and ORTHO, fov and fovAxis, orthoHeight and orthoWidth, near and far clip planes, the normalized rect viewport and priority draw order, visibility layer masks, the screen-to-world conversions worldToScreen/screenToWorld/screenPointToRay/convertToUINode in left-bottom-origin physical pixels, the AIR frameObject(camera,target,fallbackDistance=6) framing helper over MeshRenderer worldBounds, and the oblique near plane via calculateObliqueMat and clip-space minZ. Use when adding or configuring a camera, switching perspective or ortho, stacking a split-screen or overlay second camera, fitting a model in view, converting pointer pixels to a world ray or UI node, or debugging AIR_E_ORTHO_WIDTH and wrong screenToWorld results.

### Keywords

Cocos AIR, cocosair.js, camera

## References

- [camera-projection.md](camera-projection.md) - component field defaults with numbers, projection/clip-plane tables, `fovAxis`, `orthoWidth`/`AIR_E_ORTHO_WIDTH`, exposure enums, `frameObject` parameter and behavior matrix, oblique near plane and clip-space minZ.
- [multi-camera.md](multi-camera.md) - `priority` sort semantics, `clearFlags` values, `rect` viewport, `visibility`, `targetTexture`, and the two-camera overlay recipe.
- [screen-world.md](screen-world.md) - `worldToScreen`/`screenToWorld`/`screenPointToRay`/`convertToUINode` signatures and coordinate-space conventions, physical-pixel/DPR handling, depth `z` semantics.

## Canonical docs

`docs/manual/cameras.md`, `docs/manual/design-viewport-and-controls.md`.
