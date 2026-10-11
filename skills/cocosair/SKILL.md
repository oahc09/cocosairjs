---
name: cocosair
description: Route Cocos AIR (cocosair.js) work to the right cocosair-* subsystem skill and enforce Code First discipline - original Scene, Node, Camera, Component, Material, Texture2D and Sprite APIs, WebGL2-only rendering, createAirApp bootstrap ordering, and the source-export / bundle-reachable / browser-verified capability layers. Use when starting any cocosair.js task, adapting Cocos Creator knowledge to AIR, hitting WEBGL2_REQUIRED or USE_TEXTURE failures, or deciding which AIR skill to load.
---

# Cocos AIR skill router

Route every cocosair.js task to exactly one subsystem skill. Load this router first, then the matching skill; answer from the routed skill and the entry declarations, not from memory.

## Quick Start

```ts
import { createAirApp, Scene } from 'cocosair.js';

const app = await createAirApp({ canvas: '#GameCanvas' });
app.run(new Scene('Main'));
app.getScene(); // -> Scene | null
```

`#GameCanvas` must exist in the DOM before the engine is imported, because the screen adapter initializes at module-import time (startup contract in `README.md` and `AGENTS.md`). Per `build/cocosair.module.d.ts`: `AirAppOptions.canvas` accepts a selector string or an `HTMLCanvasElement`; `createAirApp(options)` returns `Promise<AirApp>`; `run(scene: Scene)` returns void; `getScene()` returns `Scene | null`.

## Related skills

Follow the first row whose "load when" matches the task language. Each skill lives at `../<skill>/SKILL.md`.

### Foundations

- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - load when installing `cocosair.js`, choosing among the main / `cocosair.js/bootstrap` / `cocosair.js/html-source` entries, writing the importmap and page skeleton, consuming TypeScript declarations, or varying `AIR_FEATURES`.
- [cocosair-application](../cocosair-application/SKILL.md) - load for `createAirApp` options, `run`/`close` and whole-page reload, single-runtime admission, designResolution/screenMode/pixelRatioCap, or WebGL context health.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - load for `Scene`/`Node`/`Component` lifecycle, layers and masks, `find`, node events, `NodePool`, or scene globals.
- [cocosair-camera](../cocosair-camera/SKILL.md) - load for perspective/ortho switching, `orthoHeight`, multi-camera viewport and priority, `worldToScreen`/`screenToWorld`/`screenPointToRay`, `frameObject`, or the oblique near plane.
- [cocosair-math](../cocosair-math/SKILL.md) - load for `Vec2`/`Vec3`/`Vec4`, `Mat3`/`Mat4`, `Quat`, `Rect`/`Size`, color conversion, easing, bits and random helpers, or matrix transform semantics.

### Rendering

- [cocosair-materials-effects](../cocosair-materials-effects/SKILL.md) - load for `Material`/`EffectAsset` technique/pass/defines, `setProperty` type matching, `USE_TEXTURE`, the built-in effect and material lists, or hand-written GLSL.
- [cocosair-rendering](../cocosair-rendering/SKILL.md) - load for light types and photometric units, the legacy-forward single `mainLight` limit, the shadow support matrix, RT/MSAA requested vs effective values, sRGB and prefiltered-environment contracts, UV row orientation, or default-pipeline post-process reachability.
- [cocosair-primitives-mesh](../cocosair-primitives-mesh/SKILL.md) - load for `Mesh` asset construction, primitive shapes, `createPrimitiveGeometry` parameters and limits, vertex attribute/index read-write, morph bounds, OBJ export, or wireframe.
- [cocosair-performance](../cocosair-performance/SKILL.md) - load for the batching routes, `batchStaticModel`, dynamic atlas, native instancing, culling, `Profiler`, render-on-demand, or mass-object and mass-animation recipes.

### Assets

- [cocosair-assets](../cocosair-assets/SKILL.md) - load for `assetManager`, `load`/`loadRemote`, `loadAssetAsync`, `AssetBank` refcounting and `ext` rules, the absent `resources` bundle reality, `Texture2D`/`ImageAsset` construction and mipmap, libGDX atlas, or `parseFnt`/`createBitmapFont`/`loadBitmapFont` bitmap-font parsing and loading up to the unpacked single-page limit.
- [cocosair-gltf](../cocosair-gltf/SKILL.md) - load for `GLTFLoader`/`GLTFAsset`/`instantiate`, extension factories and `getExtensionSupport()` tiers, draco/meshopt/ktx2 decoder injection and deployment, progress phases, or glTF error codes.

### Animation

- [cocosair-animation-tween](../cocosair-animation-tween/SKILL.md) - load for `AnimationClip`/`Animation`, `tween` composition and recycling, `update(dt)` fixed-step discipline, `createStepClock` single-clock rules, or pose-graph availability.
- [cocosair-skinning-morph](../cocosair-skinning-morph/SKILL.md) - load for `SkinnedMeshRenderer`, `Skeleton.joints` full-path rule, `buildSkeletonTree`, `restoreBindPose`, morph targets and weights, `setUseBakedAnimation`, or CCSkinning binding 3.

### Content

- [cocosair-ui-2d](../cocosair-ui-2d/SKILL.md) - load for `createUICanvas`, Canvas/Widget/Layout and Button/ScrollView/ProgressBar/Slider/Toggle/EditBox, `Label` system-font rendering and binding an already-loaded bitmap font to `Label` so it renders, `RichText`, or sorting layers.
- [cocosair-graphics-and-dom](../cocosair-graphics-and-dom/SKILL.md) - load for graphics command replay, SVG serialization, raster fills and limits, pattern transform, sprite mask channels, UI blend scope, texture sprites, `AirUIMesh` limits, DOM overlays, or the experimental `html-source` entry.
- [cocosair-2d-subsystems](../cocosair-2d-subsystems/SKILL.md) - load for Spine, DragonBones, TiledMap layer and object queries, ParticleSystem2D and plist, or `Billboard`.
- [cocosair-input-action](../cocosair-input-action/SKILL.md) - load for `input`/`systemEvent`, touch and key codes, `createActionState`/`createActionInput` backends (the `dom` backend requires an explicit canvas), `createSessionGate`, `SceneStack` input interception, or the focus contract.
- [cocosair-physics](../cocosair-physics/SKILL.md) - load for choosing `physics: 'builtin' | 'cannon'` and its before-`game.init` timing, zero-backend warn-only behavior, 2D Box2D query/integration boundaries, `default-physics-material` seeding, or absent WASM backends.
- [cocosair-audio-video](../cocosair-audio-video/SKILL.md) - load for `AudioService` BGM/SFX channels and `maxSfxVoices` overflow, judging playback by measured `currentTime` rather than `playing`, `AudioSource` gesture unlock, `VideoPlayer` platform notes, or `WebView` limits.

### Operations

- [cocosair-agent-session](../cocosair-agent-session/SKILL.md) - load when driving a live page through `__airApp`, agent/DevTools session observation and controlled writes, the `rc-*` request contracts, or diagnostic caps, truncation and visual-probe regions.
- [cocosair-verification](../cocosair-verification/SKILL.md) - load when verifying AIR changes, telling write gates from read-only gates, reading evidence fingerprints and subset semantics, or setting up Playwright tooling.

## When to use what

- "Why did startup throw `WEBGL2_REQUIRED`?" -> the context has no usable WebGL 2; there is no fallback (Contracts).
- "Which class holds my data?" -> original `Node`/`Component`; view via `Camera`; pixels via `Material` + `Texture2D` and renderers (`Sprite`, `SkinnedMeshRenderer`).
- "Is this capability usable?" -> answer with the three-layer vocabulary below, never "the docs mention it".

## Code First discipline

Read the installed package README and the relevant manual chapter before selecting helpers.

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

Read the current `build/cocosair.module.d.ts` for the main-entry surface and the status table in `docs/manual/index.md`. Stay inside the repository; do not introduce URLs or API knowledge from outside it.

## References

- `references/skill-index.md` - one line per skill: coverage, key classes/functions, canonical doc paths.

## Canonical docs

`README.md`, `AGENTS.md`, `docs/manual/index.md`, `docs/manual/runtime-capability-layers.md`, `docs/webgl2-only.md`.
