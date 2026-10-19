# Cocos AIR camera triggers

Source annotations refer to the AIR checkout.

## When to use what

- "Put a view into a scene" -> `node.addComponent(Camera)`; the render object is `camera.camera` (`src/cocos/misc/camera-component.ts:202`).
- "Switch perspective and orthographic framing" -> `camera.projection`, plus `fov`/`fovAxis` or `orthoHeight`/`orthoWidth`; table in [camera-projection.md](camera-projection.md).
- "Fit a loaded model in view" -> `frameObject(camera, target, fallbackDistance?)` (`src/air/utils/frame-object.ts:35`).
- "Split-screen or picture-in-picture" -> `camera.rect` (normalized viewport `Rect`).
- "Two cameras, who draws on top" -> `camera.priority` + `camera.clearFlags`; behavior in [multi-camera.md](multi-camera.md).
- "Which nodes does this camera draw" -> `camera.visibility` layer mask (bit values owned by cocosair-scene-graph).
- "Convert a pointer pixel to a world ray / node position" -> `camera.screenToWorld`, `camera.screenPointToRay`, `camera.convertToUINode`; coordinate space in [screen-world.md](screen-world.md).
- "Clip at an arbitrary near plane (mirror, water)" -> `camera.camera.calculateObliqueMat(Vec4)` and `camera.camera.getClipSpaceMinz()`.
