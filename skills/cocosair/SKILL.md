---
name: cocosair
description: Route Cocos AIR (cocosair.js) work to the right cocosair-* subsystem skill and enforce Code First discipline - original Scene, Node, Camera, Component, Material, Texture2D and Sprite APIs, WebGL2-only rendering, createAirApp bootstrap ordering, and the source-export / bundle-reachable / browser-verified capability layers. Use when starting any cocosair.js task, adapting Cocos Creator knowledge to AIR, hitting WEBGL2_REQUIRED or USE_TEXTURE failures, or deciding which AIR skill to load.
---

# Cocos AIR skill router

Choose one primary subsystem for the requested outcome, then load only direct dependencies needed by that task. Reuse this router once loaded; related-skill lists are optional routes, not instructions to load the whole suite. Resolve the working environment before reading source paths or running commands.

## Quick Start

```ts
import { createAirApp, Scene } from 'cocosair.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
app.run(new Scene('Main'));
app.getScene(); // -> Scene | null
```

For a direct main-entry import without a prior bootstrap binding, `#GameCanvas` must already exist in the DOM. For a custom ID, await `cocosair.js/bootstrap` with that canvas before dynamically importing the main entry; bootstrap sets `__CC_CANVAS__` before the screen adapter initializes (startup contract in `README.md` and `AGENTS.md`). Per `build/cocosair.module.d.ts`: `AirAppOptions.canvas` accepts a selector string or an `HTMLCanvasElement`; `createAirApp(options)` returns `Promise<AirApp>`; `run(scene: Scene)` returns void; `getScene()` returns `Scene | null`.

## Related skills

Choose by the main deliverable or failing behavior, not table order. Skill links below resolve relative to this file. Read [environment.md](references/environment.md) for checkout/package root resolution.

### Foundations

- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - Installation, package entries, importmap, TypeScript consumption and variant builds.
- [cocosair-application](../cocosair-application/SKILL.md) - Bootstrap options, app lifecycle, screen sizing and context health.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - Node/Component lifecycle, parenting, layers, events and scene globals.
- [cocosair-camera](../cocosair-camera/SKILL.md) - Projection, viewports, coordinate conversion, picking and framing.
- [cocosair-math](../cocosair-math/SKILL.md) - Vectors, matrices, quaternions, colors, easing and random helpers.

### Rendering

- [cocosair-materials-effects](../cocosair-materials-effects/SKILL.md) - Effect/pass/defines, property types, USE_TEXTURE and custom GLSL.
- [cocosair-rendering](../cocosair-rendering/SKILL.md) - Lights, shadows, render targets, MSAA, color and pipeline reachability.
- [cocosair-primitives-mesh](../cocosair-primitives-mesh/SKILL.md) - Geometry descriptors, Mesh attributes/indices, bounds and wireframe.
- [cocosair-performance](../cocosair-performance/SKILL.md) - Batching, atlas, instancing, profiling and rendering on demand.

### Assets

- [cocosair-assets](../cocosair-assets/SKILL.md) - Remote loading, AssetBank, textures, atlas and bitmap-font loading.
- [cocosair-gltf](../cocosair-gltf/SKILL.md) - glTF/GLB loading, extensions, decoders, progress and errors.

### Animation

- [cocosair-animation-tween](../cocosair-animation-tween/SKILL.md) - AnimationClip, tween composition, update loops and single step clock.
- [cocosair-skinning-morph](../cocosair-skinning-morph/SKILL.md) - Skeleton paths, bind pose, skinning, morph weights and baked animation.

### Content

- [cocosair-ui-2d](../cocosair-ui-2d/SKILL.md) - Canvas/layout/widgets, Label font binding and sorting.
- [cocosair-graphics-and-dom](../cocosair-graphics-and-dom/SKILL.md) - Graphics/SVG/raster, masks/blend, texture sprites, UI mesh and DOM/HTML.
- [cocosair-2d-subsystems](../cocosair-2d-subsystems/SKILL.md) - Spine, DragonBones, TiledMap, particles and Billboard.
- [cocosair-input-action](../cocosair-input-action/SKILL.md) - Native/DOM input, actions, focus, session gates and SceneStack.
- [cocosair-physics](../cocosair-physics/SKILL.md) - Builtin/cannon selection, collision versus integration and 2D Box2D.
- [cocosair-audio-video](../cocosair-audio-video/SKILL.md) - Audio channels, gesture unlock, playback evidence, VideoPlayer and WebView.

### Operations

- [cocosair-agent-session](../cocosair-agent-session/SKILL.md) - Dev-only runtime inspection, scoped writes, capture and diagnostics.
- [cocosair-verification](../cocosair-verification/SKILL.md) - Focused gates, command writes, per-API evidence and release acceptance.

## Routing across boundaries

- Startup errors -> application; unresolved imports or package entries -> project-setup.
- Load and animate a glTF model -> gltf primary; add skinning-morph or animation-tween only for the relevant deformation/playback issue.
- Load a bitmap font -> assets; bind an existing font to Label -> ui-2d.
- Debug DOM overlay clicks -> graphics-and-dom; add input-action only when focus/action routing is implicated.
- Implement a visual feature -> its subsystem primary; consult verification for the relevant collector or evidence question, not as a mandatory full gate sequence.

For a broad application, choose the primary skill for the current step and change it as the next concrete step changes. For an unmatched request, inspect the relevant installed declarations/manual chapter; use skill-index search terms to locate an owner. Ask for clarification only when the missing environment or intended behavior affects the result.

## When to use what

- "Why did startup throw `WEBGL2_REQUIRED`?" -> the context has no usable WebGL 2; there is no fallback (Contracts).
- "Which class holds my data?" -> original `Node`/`Component`; view via `Camera`; pixels via `Material` + `Texture2D` and renderers (`Sprite`, `SkinnedMeshRenderer`).
- "Is this capability usable?" -> answer with the three-layer vocabulary below, never "the docs mention it".

## Code First discipline

Read the relevant README/manual chapter from the located package or checkout. Source-only provenance is not an npm dependency; see [environment.md](references/environment.md).

1. Original APIs first: use the engine's `Scene`, `Node`, `Camera`, `Component`, `Material`, `Texture2D` and `Sprite`; AIR helpers compose these objects. Do not invent parallel scene, node or material abstractions.
2. Browser rendering requires WebGL 2 and nothing else; unsupported contexts reject startup with `WEBGL2_REQUIRED`. WebGL 1, Canvas and WebGPU are not supported renderer fallbacks. HEADLESS tests produce no rendered pixels.
3. Main-entry evaluation needs the engine canvas to exist first. For a custom canvas or startup configuration, import `createAirApp` from `cocosair.js/bootstrap`, await it, then dynamically import the main package. `createAirApp` is exported from both entries: the main `cocosair.js` entry carries it with the full engine surface; `cocosair.js/bootstrap` is the narrow handwritten entry exposing only `createAirApp` plus the `AirApp`/`AirAppOptions` types. Package aliases used by an application may differ from `cocosair.js`.
4. Native material property writes require declared properties and matching value types; `USE_TEXTURE` must match whether the effect samples a texture.
5. Keep ownership explicit. Detach renderers and bindings before destroying their textures; borrow shared assets and release only resources the feature owns.
6. Skeletal joints use full paths relative to the skinning root. For glTF decoders and Spine, inspect their documented deployment and license boundaries.

For DOM overlays, SVG, rich fills and sprite masks, read `docs/manual/graphics-and-dom.md` and load cocosair-graphics-and-dom. HTML texture APIs are experimental and live in the opt-in `cocosair.js/html-source` entry; ordinary DOM overlays remain a separate capability.

## Contracts

- Capability layers, never conflated: source export (symbol present in that entry's `.d.ts`) / default-bundle reachable (exported and wired through the default aggregate entry; feature-set membership alone is not reachability - the `custom-pipeline-post-process` feature is in the default feature list at `tools/build/build.cjs:43`, yet post-process is unreachable in AIR's current shipping posture and is resolved as variant-build evidence only, `docs/reference/owner-decisions.md:42` row 6 / D11 / LV12-17) / browser-verified (executed PASS against the current candidate with evidence). "Mentioned in docs" is none of the three. `docs/manual/runtime-capability-layers.md` is the reference and splits further into exported / bundled / configured / verified; a default build and an `AIR_FEATURES` variant are different candidates.
- Validate changed behavior in a real browser. A typecheck or the existence of source/API declarations does not prove rendering, interaction or lifecycle behavior.

## Common Mistakes

### [HIGH] Importing the main entry before the canvas exists

Wrong:

```html
<script type="module">
  const { createAirApp } = await import('cocosair.js'); // #GameCanvas not in DOM yet
</script>
```

Correct:

```html
<canvas id="GameCanvas"></canvas>
<script type="module">
  import { createAirApp } from 'cocosair.js/bootstrap';
  const app = await createAirApp({ canvas: '#GameCanvas' });
  const cc = await import('cocosair.js');
</script>
```

Pages adapted from Creator or other engines add the canvas from script; the screen adapter initializes during main-entry import, so startup fails before any app code runs.

### [HIGH] Assuming the Creator asset pipeline exists

Wrong:

```ts
assetManager.loadAny({ bundle: 'resources', path: 'models/robot' });
```

Correct:

```ts
import { Scene, Node } from 'cocosair.js';
// Build the scene in code with the original classes - there is no resources bundle to load from.
const scene = new Scene('Main');
scene.addChild(new Node('Robot')); // Scene extends Node: attach children to it directly
// Load models through the documented glTF path; route every other asset through cocosair-assets.
```

AIR ships no Creator Editor or `.scene`/Prefab/`resources` bundle pipeline; a Creator-parity load fails on the missing bundle instead of falling back.

### [MEDIUM] Treating a docs mention as a usable capability

Wrong:

```ts
// "the repo has pose-graph notes, so I can ship pose-graph animation" - assume reachability from a mention.
import { MarionetteController } from 'cocosair.js'; // absent from the default entry: marionette is not in the default feature set
```

Correct:

```ts
// Answer from a layer you state yourself - this is not an engine export:
type CapabilityLayer = 'source-export' | 'bundle-reachable' | 'browser-verified';
// Then cite that entry's .d.ts and current evidence; the pose graph is neither.
```

Docs enumerate the engine surface; bundle reachability and browser verification are separate candidates, and conflating them produces demos that cannot run.

## No route matched

Read the current main-entry declarations and `docs/manual/index.md` from the located package or checkout. Use the bootstrap/HTML declarations for those subpaths. Missing source or sibling skills are environment limitations; use available canonical docs without inventing APIs or a repository root.

## References

When adding, moving or editing suite references, run `node skills/cocosair/scripts/check-paths.cjs` from the checkout or package root. It checks local Markdown targets and rejects unlinked navigation paths in prose; it does not check source provenance, external URLs, anchors or runtime behavior. The selected scope must exist and contain at least one `SKILL.md`. `--selftest` exercises parsing and scope checks entirely in memory, without disk writes. Neither mode edits skill files or canonical evidence.

- [references/skill-index.md](references/skill-index.md) - search terms and subsystem ownership; read when the short route labels are insufficient.
- [references/environment.md](references/environment.md) - source-checkout, npm-consumer and copied-host-skill roots and prerequisites.

## Canonical docs

`README.md`, `AGENTS.md`, `docs/manual/index.md`, `docs/manual/runtime-capability-layers.md`, `docs/webgl2-only.md`.
