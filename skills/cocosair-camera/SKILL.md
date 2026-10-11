---
name: cocosair-camera
description: Add and drive the Cocos AIR Camera component with the original Cocos APIs - projection switching between PERSPECTIVE and ORTHO, fov and fovAxis, orthoHeight and orthoWidth, near and far clip planes, the normalized rect viewport and priority draw order, visibility layer masks, the screen-to-world conversions worldToScreen/screenToWorld/screenPointToRay/convertToUINode in left-bottom-origin physical pixels, the AIR frameObject(camera,target,fallbackDistance=6) framing helper over MeshRenderer worldBounds, and the oblique near plane via calculateObliqueMat and clip-space minZ. Use when adding or configuring a camera, switching perspective or ortho, stacking a split-screen or overlay second camera, fitting a model in view, converting pointer pixels to a world ray or UI node, or debugging AIR_E_ORTHO_WIDTH and wrong screenToWorld results.
---

# Cocos AIR camera

Use the [environment rules](../cocosair/references/environment.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Frame a scene with the original `Camera` component: choose the projection and its clip planes, decide which layers it draws and in what order, and convert between world space and the physical screen rectangle it renders into. AIR ships no Creator camera preview; every camera is built and configured in code.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

- [cocosair](../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - `node.layer` bits and the `visibility` mask values this camera tests against ([layers.md](../cocosair-scene-graph/references/layers.md) there).
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which entry exposes `Camera` and `frameObject`.

Rendering pipeline, lights, shadows and post-process belong to the cocosair-rendering skill; UI canvas and design-resolution input handling belong to the cocosair-ui-2d and cocosair-input-action skills - load the matching existing skill only when the task crosses that boundary.

## When to use what

- "Put a view into a scene" -> `node.addComponent(Camera)`; the render object is `camera.camera` (`src/cocos/misc/camera-component.ts:202`).
- "Switch perspective and orthographic framing" -> `camera.projection`, plus `fov`/`fovAxis` or `orthoHeight`/`orthoWidth`; table in [camera-projection.md](references/camera-projection.md).
- "Fit a loaded model in view" -> `frameObject(camera, target, fallbackDistance?)` (`src/air/utils/frame-object.ts:35`).
- "Split-screen or picture-in-picture" -> `camera.rect` (normalized viewport `Rect`).
- "Two cameras, who draws on top" -> `camera.priority` + `camera.clearFlags`; behavior in [multi-camera.md](references/multi-camera.md).
- "Which nodes does this camera draw" -> `camera.visibility` layer mask (bit values owned by cocosair-scene-graph).
- "Convert a pointer pixel to a world ray / node position" -> `camera.screenToWorld`, `camera.screenPointToRay`, `camera.convertToUINode`; coordinate space in [screen-world.md](references/screen-world.md).
- "Clip at an arbitrary near plane (mirror, water)" -> `camera.camera.calculateObliqueMat(Vec4)` and `camera.camera.getClipSpaceMinz()`.

## Contracts

Use component conversion methods and left-bottom framebuffer pixels. `worldToScreen` and `screenToWorld` use different depth conventions; prefer a ray for picking. Camera visibility must include the node layer.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Dividing screen pixels by devicePixelRatio before screenToWorld
- [HIGH] Copying the render-camera argument order onto the component
- [MEDIUM] Stacking two cameras and trusting creation order for draw order

## References

- [camera-projection.md](references/camera-projection.md) - component field defaults with numbers, projection/clip-plane tables, `fovAxis`, `orthoWidth`/`AIR_E_ORTHO_WIDTH`, exposure enums, `frameObject` parameter and behavior matrix, oblique near plane and clip-space minZ.
- [multi-camera.md](references/multi-camera.md) - `priority` sort semantics, `clearFlags` values, `rect` viewport, `visibility`, `targetTexture`, and the two-camera overlay recipe.
- [screen-world.md](references/screen-world.md) - `worldToScreen`/`screenToWorld`/`screenPointToRay`/`convertToUINode` signatures and coordinate-space conventions, physical-pixel/DPR handling, depth `z` semantics.

## Canonical docs

`docs/manual/cameras.md`, `docs/manual/design-viewport-and-controls.md`.
