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

## Original entry guidance

Original wording is retained on demand for migration provenance, not as a second routing source. Statements and examples describe the source snapshot; consult the current main-entry contract when historical guidance conflicts.

Choose one primary subsystem for the requested outcome, then load only direct dependencies needed by that task. Reuse this router once loaded; related-skill lists are optional routes, not instructions to load the whole suite. Resolve the working environment before reading source paths or running commands.

## Quick Start

```ts
import { createAirApp, Scene } from 'cocosair.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
app.run(new Scene('Main'));
app.getScene(); // -> Scene | null
```

Use the single `cocosair.js` browser entry. Main may be imported before creating the canvas; pass the selected element and pixelRatioCap to createAirApp. No pre-import canvas/DPR global assignment is required. For lazy loading use an application-owned dynamic main import; bootstrap/html-source are no longer public subpaths.

## Related skills

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Routing across boundaries

- Startup errors -> application; unresolved imports or package entries -> project-setup.
- Load and animate a glTF model -> gltf primary; add skinning-morph or animation-tween only for the relevant deformation/playback issue.
- Load a bitmap font -> assets; bind an existing font to Label -> ui-2d.
- Debug DOM overlay clicks -> graphics-and-dom; add input-action only when focus/action routing is implicated.
- Implement a visual feature -> its subsystem primary; consult verification for the relevant collector or evidence question, not as a mandatory full gate sequence.

For a broad application, choose the primary skill for the current step and change it as the next concrete step changes. For an unmatched request, inspect the relevant installed declarations/manual chapter; use skill-index search terms to locate an owner. Ask for clarification only when the missing environment or intended behavior affects the result.

## Code First discipline

Read the relevant README/manual chapter from the located package or checkout. Source-only provenance is not an npm dependency; see [environment.md](environment.md).

1. Original APIs first: use the engine's `Scene`, `Node`, `Camera`, `Component`, `Material`, `Texture2D` and `Sprite`; AIR helpers compose these objects. Do not invent parallel scene, node or material abstractions.
2. Browser rendering requires WebGL 2 and nothing else; unsupported contexts reject startup with `WEBGL2_REQUIRED`. WebGL 1, Canvas and WebGPU are not supported renderer fallbacks. HEADLESS tests produce no rendered pixels.
3. Use only the browser main entry `cocosair.js`. Main import before canvas creation is supported; pass canvas and pixelRatioCap to createAirApp. For deferred loading, dynamically import the main entry in the application. Startup and HTML texture helpers share the main declarations; there are no bootstrap/html-source package subpaths.
4. Native material property writes require declared properties and matching value types; `USE_TEXTURE` must match whether the effect samples a texture.
5. Keep ownership explicit. Detach renderers and bindings before destroying their textures; borrow shared assets and release only resources the feature owns.
6. Skeletal joints use full paths relative to the skinning root. For glTF decoders and Spine, inspect their documented deployment and license boundaries.

For DOM overlays, SVG, rich fills and sprite masks, read `docs/manual/graphics-and-dom.md` and load cocosair-graphics-and-dom. HTML texture APIs are experimental and live in the opt-in `cocosair.js` entry; ordinary DOM overlays remain a separate capability.

## Contracts

- Capability layers, never conflated: source export (symbol present in that entry's `.d.ts`) / default-bundle reachable (exported and wired through the default aggregate entry; feature-set membership alone is not reachability - the `custom-pipeline-post-process` feature is in the default feature list at `tools/build/build.cjs:43`, yet post-process is unreachable in AIR's current shipping posture and is resolved as variant-build evidence only, `docs/reference/owner-decisions.md:42` row 6 / D11 / LV12-17) / browser-verified (executed PASS against the current candidate with evidence). "Mentioned in docs" is none of the three. `docs/manual/runtime-capability-layers.md` is the reference and splits further into exported / bundled / configured / verified; a default build and an `AIR_FEATURES` variant are different candidates.
- Validate changed behavior in a real browser. A typecheck or the existence of source/API declarations does not prove rendering, interaction or lifecycle behavior.

## No route matched

Read the current main-entry declarations and `docs/manual/index.md` from the located package or checkout. Startup and HTML APIs use the same main-entry declarations. Missing source or sibling skills are environment limitations; use available canonical docs without inventing APIs or a repository root.

## References

When adding, moving or editing suite references, run `node skills/cocosair/scripts/check-paths.cjs` from the checkout or package root. It checks local Markdown targets and rejects unlinked navigation paths in prose; it does not check source provenance, external URLs, anchors or runtime behavior. The selected scope must exist and contain at least one `SKILL.md`. `--selftest` exercises parsing and scope checks entirely in memory, without disk writes. Neither mode edits skill files or canonical evidence.

- [references/skill-index.md](skill-index.md) - search terms and subsystem ownership; read when the short route labels are insufficient.
- [references/environment.md](environment.md) - source-checkout, npm-consumer and copied-host-skill roots and prerequisites.

## Original metadata

### Description and description_en

The two source fields had exactly the same complete value, preserved once below.

Route Cocos AIR (cocosair.js) work to the right cocosair-* subsystem skill and enforce Code First discipline - original Scene, Node, Camera, Component, Material, Texture2D and Sprite APIs, WebGL2-only rendering, createAirApp bootstrap ordering, and the source-export / bundle-reachable / browser-verified capability layers. Use when starting any cocosair.js task, adapting Cocos Creator knowledge to AIR, hitting WEBGL2_REQUIRED or USE_TEXTURE failures, or deciding which AIR skill to load.

### Keywords

Cocos AIR, cocosair.js, cocosair

## Canonical docs

`README.md`, `AGENTS.md`, `docs/manual/index.md`, `docs/manual/runtime-capability-layers.md`, `docs/webgl2-only.md`.
