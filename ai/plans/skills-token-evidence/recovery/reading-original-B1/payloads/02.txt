# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

Choose by the main deliverable or failing behavior, not table order. Skill links below resolve relative to this file. Read [environment.md](environment.md) for checkout/package root resolution.

### Foundations

- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - Installation, package entries, importmap, TypeScript consumption and variant builds.
- [cocosair-application](../../cocosair-application/SKILL.md) - Bootstrap options, app lifecycle, screen sizing and context health.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - Node/Component lifecycle, parenting, layers, events and scene globals.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - Projection, viewports, coordinate conversion, picking and framing.
- [cocosair-math](../../cocosair-math/SKILL.md) - Vectors, matrices, quaternions, colors, easing and random helpers.

### Rendering

- [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) - Effect/pass/defines, property types, USE_TEXTURE and custom GLSL.
- [cocosair-rendering](../../cocosair-rendering/SKILL.md) - Lights, shadows, render targets, MSAA, color and pipeline reachability.
- [cocosair-primitives-mesh](../../cocosair-primitives-mesh/SKILL.md) - Geometry descriptors, Mesh attributes/indices, bounds and wireframe.
- [cocosair-performance](../../cocosair-performance/SKILL.md) - Batching, atlas, instancing, profiling and rendering on demand.

### Assets

- [cocosair-assets](../../cocosair-assets/SKILL.md) - Remote loading, AssetBank, textures, atlas and bitmap-font loading.
- [cocosair-gltf](../../cocosair-gltf/SKILL.md) - glTF/GLB loading, extensions, decoders, progress and errors.

### Animation

- [cocosair-animation-tween](../../cocosair-animation-tween/SKILL.md) - AnimationClip, tween composition, update loops and single step clock.
- [cocosair-skinning-morph](../../cocosair-skinning-morph/SKILL.md) - Skeleton paths, bind pose, skinning, morph weights and baked animation.

### Content

- [cocosair-ui-2d](../../cocosair-ui-2d/SKILL.md) - Canvas/layout/widgets, Label font binding and sorting.
- [cocosair-graphics-and-dom](../../cocosair-graphics-and-dom/SKILL.md) - Graphics/SVG/raster, masks/blend, texture sprites, UI mesh and DOM/HTML.
- [cocosair-2d-subsystems](../../cocosair-2d-subsystems/SKILL.md) - Spine, DragonBones, TiledMap, particles and Billboard.
- [cocosair-input-action](../../cocosair-input-action/SKILL.md) - Native/DOM input, actions, focus, session gates and SceneStack.
- [cocosair-physics](../../cocosair-physics/SKILL.md) - Builtin/cannon selection, collision versus integration and 2D Box2D.
- [cocosair-audio-video](../../cocosair-audio-video/SKILL.md) - Audio channels, gesture unlock, playback evidence, VideoPlayer and WebView.

### Operations

- [cocosair-agent-session](../../cocosair-agent-session/SKILL.md) - Dev-only runtime inspection, scoped writes, capture and diagnostics.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - Focused gates, command writes, per-API evidence and release acceptance.
