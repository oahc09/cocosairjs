---
name: air-code-first
description: Build applications with Cocos AIR's original Cocos scene, component, material and asset APIs, without Creator. Use when implementing a cocosair.js application or adapting a Creator example to AIR.
---

# Cocos AIR Code First

Read the installed package README and relevant manual chapter before selecting helpers.

- Use original `Scene`, `Node`, `Camera`, `Component`, `Material`, `Texture2D` and `Sprite`. AIR helpers compose these objects; do not invent parallel scene classes.
- Browser rendering requires WebGL 2. HEADLESS tests produce no rendered pixels. WebGL 1, Canvas and WebGPU are not supported renderer fallbacks.
- Main-entry evaluation needs the engine canvas to exist first. For a custom canvas or startup configuration, import `createAirApp` from `cocosair.js/bootstrap`, await it, then dynamically import the main package. Package aliases used by an application may differ from `cocosair.js`.
- Native material property writes require declared properties and matching value types. `USE_TEXTURE` must match whether the effect samples a texture.
- Keep ownership explicit. Detach renderers and bindings before destroying their textures; borrow shared assets and release only resources the feature owns.
- Skeletal joints use full paths relative to the skinning root. For glTF decoders and Spine, inspect their documented deployment and license boundaries.

For DOM overlays, SVG, rich fills and sprite masks, read `docs/manual/graphics-and-dom.md`. HTML texture APIs are experimental and live in the opt-in `cocosair.js/html-source` entry; ordinary DOM overlays remain a separate capability.

Validate changed behavior in a real browser. A typecheck or the existence of source/API declarations does not prove rendering, interaction or lifecycle behavior.
