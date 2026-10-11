---
name: cocosair-2d-subsystems
description: Drives the Cocos AIR 2D subsystem runtime modules in code-first scenes - the sp namespace and loadWasmModuleSpine plus the BLOCKED Spine backend and asset sourcing state, dragonBones ArmatureDisplay, DragonBonesAsset, DragonBonesAtlasAsset, CCFactory and AnimationCacheMode with realtime versus cached skinning on the vendored dragonbones-js, TiledMap, TiledMapAsset, TiledLayer, TiledObjectGroup and TiledTile built from runtime tmx and tsx strings, ParticleSystem2D and ParticleAsset fed by a generated plist through assetManager.parser.parsePlist, MotionStreak (exported as MotionStreak, there is no MotionStreak2D), and Billboard as a scene.Model whose size and rotation travel through one cc_size_rotation uniform. Use when a Spine skeleton draws nothing without any error, when a TiledMap cell edit or object query does not refresh or resolve, when plist-tuned particles compute but render no pixels, or when a billboard is invisible at its default size.
---

# Cocos AIR 2D subsystem contracts

Build Spine, DragonBones, TiledMap, particle and billboard content from strings and bytes at runtime - there is no Creator importer, no uuid dependency graph and no prefab here, and one of these five subsystems cannot run at all in the default bundle.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, Canvas, UITransform, Layers, Color,
         ParticleSystem2D, ParticleAsset, SpriteFrame, Texture2D, ImageAsset,
         assetManager, view, ResolutionPolicy } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const UI = Layers.Enum.UI_2D;
view.setDesignResolutionSize(960, 540, ResolutionPolicy.SHOW_ALL);
const scene = new Scene('air-2d-subsystems');
const canvasNode = new Node('Canvas'); canvasNode.layer = UI; canvasNode.addComponent(UITransform);
const cameraNode = new Node('UICamera'); cameraNode.layer = UI; cameraNode.setPosition(0, 0, 1000);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO; camera.visibility = UI;
camera.clearColor = new Color(10, 14, 26, 255);
canvasNode.addChild(cameraNode); scene.addChild(canvasNode);
canvasNode.getComponent(Canvas).cameraComponent = camera;   // UI renderers only draw through their Canvas camera

// textures AFTER createAirApp: the gfx device is not ready before it, and every frame then warns on the sampler
const cvs = document.createElement('canvas'); cvs.width = 32; cvs.height = 32;
const ctx = cvs.getContext('2d');
const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(1, 'rgba(255,80,0,0)');
ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32);
const image = new ImageAsset(cvs);
const texture = new Texture2D(); texture.image = image;
const spriteFrame = new SpriteFrame(); spriteFrame.texture = texture;

// the plist is generated here, parsed by the engine parser, carried by the asset, read only when custom is false
function plistXml (entries) {
    const body = Object.entries(entries).map((e) => {
        const tag = typeof e[1] === 'number' ? (Number.isInteger(e[1]) ? 'integer' : 'real') : 'string';
        return '<key>' + e[0] + '</key><' + tag + '>' + e[1] + '</' + tag + '>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>' + body + '</dict></plist>';
}
let dict = null;
assetManager.parser.parsePlist(plistXml({
    emitterType: 0, maxParticles: 240, duration: -1, positionType: 0,
    particleLifespan: 1.1, particleLifespanVariance: 0.35, emissionRate: 120,   // 'life' is not a plist key
    angle: 90, angleVariance: 14, speed: 55, speedVariance: 25, gravityx: 0, gravityy: 34,
    startParticleSize: 30, finishParticleSize: -1, sourcePositionVariancex: 8, sourcePositionVariancey: 3,
    blendFuncSource: 2, blendFuncDestination: 1,   // gfx BlendFactor slots (max value 14), not raw GL 770 and 1
}), {}, (err, data) => { if (err) throw err; dict = data; });
const particleNode = new Node('Flame'); particleNode.layer = UI; particleNode.addComponent(UITransform);
particleNode.setPosition(-150, -140, 0); canvasNode.addChild(particleNode);
const ps = particleNode.addComponent(ParticleSystem2D);
ps.spriteFrame = spriteFrame;
const particleAsset = new ParticleAsset();
particleAsset._nativeAsset = dict;
ps.custom = false;   // custom = true makes _applyFile skip the whole dictionary mapping
ps.file = particleAsset;

app.run(scene);   // async render loop; the first frame lands on a later tick

function teardown () {   // never call this inline; releasing now blanks the screen before frame 1
    scene.destroy();
    ps.file = null;
    particleAsset.destroy();
    spriteFrame.destroy(); texture.destroy(); image.destroy();
}
</script>
```

Spine, DragonBones, TiledMap and Billboard follow the same construction discipline with different payloads; each has a reference file below.

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and the Code First discipline this skill applies.
- [cocosair-ui-2d](../cocosair-ui-2d/SKILL.md) - `Canvas`, UI camera and layer setup, `UITransform` sizing and draw order that every subsystem here except `Billboard` sits on top of.
- [cocosair-assets](../cocosair-assets/SKILL.md) - `assetManager.loadRemote` with an explicit extension, `Texture2D` and `SpriteFrame` ownership, and the `ImageAsset` to `Texture2D` wrap these asset constructors need.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - `active` toggling that forces a TiledLayer rebuild, deferred `destroy()`, and the node transforms `Billboard` and `ArmatureDisplay` read.
- [cocosair-materials-effects](../cocosair-materials-effects/SKILL.md) - `builtin-billboard` and `SpineMaterialType` sit in the same effect registry; technique and blend-state overrides happen on the material.
- [cocosair-camera](../cocosair-camera/SKILL.md) - TiledMap culling projects through the camera that resolves at run time, and `Billboard` needs a 3D camera visibility, not the UI one.
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which symbol each entry file exports and how the `cocosair` importmap alias is wired.

## When to use what

| Subsystem | Runnable today | Import symbols | Constructed from | Main trap |
|---|---|---|---|---|
| Spine | No, BLOCKED | `sp`, `loadWasmModuleSpine` | skeleton json or binary, atlas text, `Texture2D[]` | null runtime data, no error |
| DragonBones | Yes | `dragonBones` namespace | two assets from JSON strings plus one `Texture2D` | asset setters want raw text |
| TiledMap | Yes | `TiledMap`, `TiledMapAsset`, `TiledLayer`, `TiledObjectGroup`, `TiledTile`, `TiledUserNodeData` | tmx XML string, tsx text, sprite frames | name lookup by parallel arrays |
| Particle 2D | Yes | `ParticleSystem2D`, `ParticleAsset` | plist text parsed at run time | plist key names and blend enum slots |
| Motion streak | Yes | `MotionStreak`, `MotionStreakAssemblerManager` | a plain `Texture2D` | no `MotionStreak2D` exists |
| Billboard | Yes | `Billboard` | any `Texture2D` the app keeps alive | `width` and `height` default to 0 |

## Contracts

- The bundle export line is the whole public face. The single `export { ... }` block of `build/cocosair.module.js` (currently `:161574`) is the only name list; `MotionStreak2D` is absent from `src/` entirely, the class is `cc.MotionStreak` (`src/cocos/particle-2d/motion-streak-2d.ts:68`, `:73`) re-exported as `MotionStreak` (`src/cocos/particle-2d/index.ts:31-37`). Full symbol list in each reference file.
- Spine is BLOCKED at the backend and asset layer, not the API layer: `src/exports/spine.ts:3` and `:5` give `sp` plus `loadWasmModuleSpine`, but the shim installs warn-and-return-null stubs over `spine.wasmUtil` (`src/cocos/spine/lib/air-spine-instantiate-js.ts:26-52`), so `SkeletonData.getRuntimeData()` returns null (`src/cocos/spine/skeleton-data.ts:199-237`) and `Skeleton._updateSkeletonData()` bails silently at `src/cocos/spine/skeleton.ts:791`. Awaiting `loadWasmModuleSpine` proves nothing (`src/cocos/spine/index.ts:127-136`). See `references/spine.md`.
- DragonBones is runnable and needs three objects plus one key: atlas asset `atlasJson` parses text (`src/cocos/dragon-bones/DragonBonesAtlasAsset.ts:53-59`) and `texture` wants a `Texture2D` (`:86-90`); skeleton via `dragonBonesJson` text (`src/cocos/dragon-bones/DragonBonesAsset.ts:58`); `asset.init(factory, atlasUuid)` returns the armature key (`:99-128`). `armature` is a METHOD (`src/cocos/dragon-bones/ArmatureDisplay.ts:1469`), `playAnimation(name, 0)` is play-once so loop needs `-1` (`:1269`), and `premultipliedAlpha` defaults to `false` (`:412`). See `references/dragonbones.md`.
- TiledMap builds its whole map from a `TiledMapAsset` bag of parallel arrays handed to `TMXMapInfo` (`src/cocos/tiledmap/tiled-map.ts:340-388`). A runtime cell edit via `setTileGIDAt(gid, x, y, flags)` (`src/cocos/tiledmap/tiled-layer.ts:693-711`) sets only `_cullingDirty` (`:714-731`) which is not render-data dirty, so refresh needs `markForUpdateRenderData()` (`src/cocos/2d/framework/ui-renderer.ts:431-433`) or node reactivation (`examples/tiledmap-basic/main.js:396-405`). Object queries read `class`, geometry reads the shape enum (`src/cocos/tiledmap/tiled-object-group.ts:179`). See `references/tiledmap.md`.
- ParticleSystem2D reads the plist, not your assignments: `parsePlist` (`src/cocos/asset/asset-manager/parser.ts:63`) -> `asset._nativeAsset` -> `custom = false` + `file` fires `_initWithDictionary` (`src/cocos/particle-2d/particle-system-2d.ts:922-948`). The lifespan key is `particleLifespan` (`:1047`) and `blendFuncSource`/`blendFuncDestination` land in gfx `BlendFactor` slots capped at 14 (`:1062-1063`, `src/cocos/gfx/base/define.ts:505-521`), so Creator's 770 and 1 draw nothing. See `references/particle-2d.md`.
- Billboard is a `scene.Model` with a four-vertex quad (`src/cocos/particle/billboard.ts:243-276`) re-exported from `src/air/index.ts:30`, needing a 3D camera visibility not the UI one. `width` and `height` default to 0 (`:65`, `:88`) and travel with `rotation` through one `cc_size_rotation` `Vec4` (`:190`), so node scale is ignored and an unsized billboard is invisible; the effect has one technique so `technique` clamps to 0 (`:137-155`) and `onDestroy` drops but never destroys the app-owned texture (`:214-226`). See `references/billboard.md`.

## Common Mistakes

### [HIGH] Treating Spine as runnable out of the box

Wrong: `await loadWasmModuleSpine()` then `sk.skeletonData = data` - it resolves without loading anything and the skeleton renders no draw list with no exception, only one console warning.

Correct:
```js
import { sp } from 'cocosair';
const data = new sp.SkeletonData();                // the class is real and importable
console.warn('spine runtime backend not deployed: LV12-10 BLOCKED, no emscripten artifacts');
// deploy spine.wasm / spine.asm.js / spine.js.mem first, then delete the AIR shim override
```

The shim returns null from every `wasmUtil` stub (`src/cocos/spine/lib/air-spine-instantiate-js.ts:26-52`), `getRuntimeData()` therefore yields null (`src/cocos/spine/skeleton-data.ts:199-237`) and the skeleton bails at `src/cocos/spine/skeleton.ts:791`; the unblock path is recorded in `docs/notes/spine-asset-sourcing.md:43-47`.

### [HIGH] Expecting a TiledMap cell edit to redraw itself

Wrong: `layer.setTileGIDAt(2, 3, 1)` then `layer.setCullingDirty(true)` - data changes but pixels do not, and the culling flag is never consumed when culling is off.

Correct:
```js
const layer = map.getLayer('ground');
layer.setTileGIDAt(2, 3, 1, TiledMap.TileFlag.DIAGONAL);   // flags is the 4th argument
layer.markForUpdateRenderData();                            // or toggle layer.node.active false then true
```

`_updateTileForGID` sets only `_cullingDirty` (`src/cocos/tiledmap/tiled-layer.ts:714-731`), which is consumed at the end of `updateViewPort` (`:865`) and reached only through the culling path (`:913`); the measured refresh ladder in `examples/tiledmap-basic/main.js:396-405` shows node reactivation as the working rung.

### [HIGH] Copying Creator plist blend values into a code-first emitter

Wrong: reusing an exported plist that sets `blendFuncSource: 770, blendFuncDestination: 1` - those raw GL constants land out of the gfx `BlendFactor` range and the emitter simulates but draws nothing.

Correct:
```js
ps.custom = false;                    // true skips _initWithDictionary entirely
ps.file = particleAsset;              // dict came from assetManager.parser.parsePlist
ps.srcBlendFactor = 2;                // gfx BlendFactor.SRC_ALPHA
ps.dstBlendFactor = 1;                // gfx BlendFactor.ONE
```

`_initWithDictionary` writes the plist integers straight into `BlendFactor` slots (`src/cocos/particle-2d/particle-system-2d.ts:1062-1063`) whose enum ends at 14 (`src/cocos/gfx/base/define.ts:505-521`), and a missing `particleLifespan` makes `life` 0 which zeroes the emission clamp (`src/cocos/particle-2d/particle-system-2d.ts:1047`, `:1055`) - both cases simulate perfectly and draw nothing.

### [MEDIUM] Importing names the bundle does not export

Wrong: `import { MotionStreak2D }` and `skeleton.registerSpineEventHandler(handler, sp.AnimationEventType.START)` - neither name exists here, and the streak wants a `Texture2D` not a `SpriteFrame`.

Correct:
```js
import { MotionStreak, sp } from 'cocosair';
const skeleton = node.addComponent(sp.Skeleton);
skeleton.setStartListener((entry) => console.log(entry.animation.name));     // or setEventListener
const streak = node.addComponent(MotionStreak);   // class name is cc.MotionStreak
streak.texture = texture;                          // a Texture2D, not a SpriteFrame
```

The export block of `build/cocosair.module.js` (currently `:161574`) has `MotionStreak` and `MotionStreakAssemblerManager` and no `MotionStreak2D`; `registerSpineEventHandler` matches nothing in `src/`, and `MotionStreak.texture` is typed as a raw texture (`src/cocos/particle-2d/motion-streak-2d.ts:143`).

### [MEDIUM] Reusing Creator asset conventions for atlas and paths

Wrong: `atlasAsset.atlasJson = await assetManager.loadRemote(...)` and `ps.file = await assetManager.loadRemote(...)` - the setters want raw text and a parsed plist, and a `loadRemote` plist arrives as a bare `Asset`.

Correct:
```js
atlasAsset.atlasJson = text;                     // raw string; the setter parses it
atlasAsset.texture = wrappedTexture2D;           // ImageAsset must be wrapped first
particleAsset._nativeAsset = parsedPlistDict;    // parse the plist yourself, then hand it over
ps.file = particleAsset;
ms.texture = texture;                            // Texture2D, not SpriteFrame
```

The `atlasJson` and `dragonBonesJson` setters parse text (`src/cocos/dragon-bones/DragonBonesAtlasAsset.ts:53-59`, `src/cocos/dragon-bones/DragonBonesAsset.ts:58`), a `loadRemote` plist arrives as a bare `Asset` (`docs/notes/particle-2d-notes.md:45`), and `examples/dragonbones-basic/main.js:239-252` shows the required `ImageAsset` to `Texture2D` wrap before the atlas asset will accept a texture.

## References

- `references/spine.md` - the export surface, the BLOCKED chain end to end, the stubbed `wasmUtil` list, `SkeletonData` and `Skeleton` fields that are already written against, and what an unblocked build would need.
- `references/dragonbones.md` - the three-object construction order, armature key, cache modes and their downgrade rule, factory and slot internals, the vendored `dragonbones-js` boundary, and the measured API pitfalls.
- `references/tiledmap.md` - asset-array wiring, the parse and build path, culling versus render-data dirty state, the three runtime-edit cases, object layer coordinate rewriting and queries.
- `references/particle-2d.md` - the plist chain end to end, the key dictionary with its silent-zero cases, gfx blend slots, frame and texture ownership, determinism trio, and `MotionStreak` as its sibling.
- `references/billboard.md` - model and mesh construction, the `cc_size_rotation` uniform contract, technique clamping and material copy, texture ownership, and the CPU-rotation route from the older manual.

## Canonical docs

- `docs/notes/spine-asset-sourcing.md` - open for the four empty asset sources, the code-regression versus degradation split, the unblock steps and the owner closure that keeps the shim.
- `docs/notes/dragonbones-notes.md` - open for the measured pitfall list: texture wrapping, armature key, setter input types, `armature` being a method, atlas data shapes and uncovered surface.
- `docs/notes/tiled-map-notes.md` - open for parse semantics, the three runtime-edit paths, object `class` versus geometry type, and the recorded residuals.
- `docs/notes/particle-2d-notes.md` - open for the plist pipeline findings, blend enum handling, runtime frames, the determinism trio and the silent zero-particle case.
- `docs/manual/tiled-culling-and-dirty-state.md` and `docs/manual/tiled-object-queries.md` - open for the refresh contract and the object query contract as tested.
- `docs/manual/2d-assets-and-effects.md` - open for the subsystem table: export surface present, browser evidence, blockers.
- `docs/manual/billboard.md` - open for the native component recipe including the zero default size; `docs/manual/billboards.md` - open for the CPU rotation route and its white-plane pitfall.
- `docs/reference/web-features.md` - open for the source-present, bundled and deployed-assets distinction this skill relies on.
