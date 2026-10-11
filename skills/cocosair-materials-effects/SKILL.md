---
name: cocosair-materials-effects
description: Author and drive Cocos AIR materials in a Code First scene - new Material() plus initialize({effectName, defines, technique, states}), the 21 registered AIR effect entries and 17 builtin materials, setProperty value types for float, Vec3, Vec4, Color, Texture2D and arrays, the USE_TEXTURE versus USE_ALBEDO_MAP define gates, handleInfo property aliases, MaterialInstance versus shared materials, the Pass warn stubs for recompileShaders and overridePipelineStates, the glsl4 to glsl3 source transform, the set and binding layout assignEffectBindings enforces including CCSkinning at binding 3, createAirUnlitFogEffect, attachAirSpriteMask and inspectAirMaterial. Use when creating or configuring a Material or EffectAsset, picking builtin-standard or builtin-unlit, setting a color, texture or uniform array, overriding blend or depth state, writing custom GLSL, or debugging AIR_E_MATERIAL_NOT_READY, AIR_E_MATERIAL_TYPE, uniform buffer too small, a flat untextured surface or a setProperty call that does nothing.
---

# Cocos AIR materials and effects

A material in AIR is one effect recipe plus a bag of uniform values: `new Material()`, `initialize({ effectName })` picks the recipe, `setProperty(name, value)` fills it. There is no material inheritance tree, no `ShaderMaterial`, and no Editor asset pipeline - recipe names are strings and custom shaders are hand-written compiled effect JSON.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">{ "imports": { "cocosair": "/build/cocosair.module.js" } }</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, MeshRenderer, Material,
         Texture2D, ImageAsset, Layers, Vec3, Vec4, Color, primitives, utils,
         inspectAirMaterial } from 'cocosair'; // page alias, not the package name

const app = await createAirApp({ canvas: '#GameCanvas' }); // device first: passes need root.device
const scene = new Scene('materials');

const camNode = new Node('Main Camera');
scene.addChild(camNode); camNode.setPosition(new Vec3(0, 1.8, 6.5)); camNode.lookAt(new Vec3(0, 0.6, 0));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.visibility = Layers.Enum.DEFAULT;

const texture = new Texture2D(); // procedural source, no asset files
texture.image = new ImageAsset({ width: 8, height: 8, _data: new Uint8Array(8 * 8 * 4).fill(255), _compressed: false, format: Texture2D.PixelFormat.RGBA8888 });

function addCube (name, x, init, configure) {
    const node = new Node(name); node.layer = Layers.Enum.DEFAULT; scene.addChild(node);
    node.setPosition(new Vec3(x, 0.7, 0));
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1.1, height: 1.1, length: 1.1 }));
    const material = new Material();          // one instance per object: never mutate a shared builtin
    material.initialize(init); configure(material); // defines must be complete at initialize
    renderer.setSharedMaterial(material, 0);  // shared reference: setProperty on `material` drives pixels
    return material;
}

addCube('lit', -2.2, { effectName: 'builtin-standard' }, (m) => {
    m.setProperty('mainColor', new Color(90, 200, 220, 255)); // bytes 0-255, written as 0-1 fractions
    m.setProperty('metallic', 0.0); m.setProperty('roughness', 0.35); // float uniforms take plain numbers
});
addCube('flat', 0, { effectName: 'builtin-unlit' }, (m) => m.setProperty('mainColor', new Color(230, 120, 60, 255)));
const mapped = addCube('mapped', 2.2, { effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } }, (m) => {
    m.setProperty('mainTexture', texture);   // without the macro the write succeeds and the map is never sampled
    m.setProperty('tilingOffset', new Vec4(2, 2, 0, 0)); // x/y tiling, z/w offset
});

console.log(inspectAirMaterial(mapped));      // one frozen record per pass: program, depth/blend/cull, bound textures
app.run(scene);
</script>
```

Entry choice and the importmap alias belong to [cocosair-project-setup](../cocosair-project-setup/SKILL.md); `createAirApp` and `run` to [cocosair-application](../cocosair-application/SKILL.md).

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which entry exposes `Material` and `EffectAsset`.
- [cocosair-application](../cocosair-application/SKILL.md) - the device-initialization ordering that `Material.initialize` depends on.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - `MeshRenderer` attachment, `node.layer` bits a material's draws are culled against.
- [cocosair-camera](../cocosair-camera/SKILL.md) - `camera.visibility` and clear flags decide whether a correct material is visible at all.
- [cocosair-math](../cocosair-math/SKILL.md) - `Color`, `Vec3`, `Vec4`, `Mat3`, `Mat4`, `Quat` values a `setProperty` call must carry.
- [cocosair-graphics-and-dom](../cocosair-graphics-and-dom/SKILL.md) - the `ui-graphics-material` / `builtin-graphics` path and canvas-backed textures.
- [cocosair-verification](../cocosair-verification/SKILL.md) - pixel readback recipes that prove a material actually rendered.

Lighting, shadows and the post-process pipeline belong to the cocosair-rendering skill; mesh primitives and multi-material sub-models to cocosair-primitives-mesh; `SkinnedMeshRenderer` macro handling to cocosair-skinning-morph; UI 2D materials to cocosair-ui-2d; glTF material import to cocosair-gltf. None of those skills exists yet, so route through [cocosair](../cocosair/SKILL.md).

## When to use what

- "Paint a 3D object, no lighting" -> `initialize({ effectName: 'builtin-unlit' })` + `mainColor`.
- "Physically shaded object" -> `effectName: 'builtin-standard'` + `metallic`/`roughness`/`emissive`; table in `references/property-types.md`.
- "Show a texture" -> the map macro FIRST in `initialize({ defines })`, then `setProperty`; `USE_TEXTURE` for unlit and sprite, `USE_ALBEDO_MAP` for standard (`references/defines.md`).
- "Two objects, same recipe, different colors" -> two `new Material()`; `Material.copy(src, overrides?)`, never a shared builtin write.
- "Change one renderer without touching its material" -> `renderer.getMaterialInstance(i)` / the `renderer.material` getter; semantics in `references/builtin-effects.md`.
- "Change a macro or blend state after initialization" -> `MaterialInstance.recompileShaders` / `MaterialInstance.overridePipelineStates`; a plain `Material` only warns.
- "Write my own GLSL" -> compiled-shape effect JSON + `glsl3` variant + `effect.onLoaded()`; `references/custom-glsl.md`.
- "Per-frame uniform" -> cache `pass.getHandle(name)` and call `Pass.setUniform(handle, value)`.
- "Fog on an unlit object" -> `createAirUnlitFogEffect()`.
- "Mask a Sprite" -> `attachAirSpriteMask(sprite, texture, options?)`.
- "What state does this material really have" -> `inspectAirMaterial(material)`, or `inspectAirMeshMaterial(mesh, material)` for define-versus-attribute checks.

## Contracts

- Order is fixed: `await createAirApp(...)` before `Material.initialize`. `_createPasses` reads `cclegacy.director.root.device` and throws `AIR_E_MATERIAL_NOT_READY` when it is missing, naming `await createAirApp({ canvas })` as the fix (`src/cocos/asset/assets/material.ts:452-456`). `EffectAsset.onLoaded()` has no such requirement: it registers metadata immediately and defers GPU program registration to `Game.EVENT_RENDERER_INITED` while `deviceManager.gfxDevice` is absent (`src/cocos/asset/assets/effect-asset.ts:339-351`), so an effect can be registered before the app while a pass-bearing material cannot (`docs/manual/materials.md:10`).
- `initialize` is one-shot per object. When `_passes` is already populated it emits `warnID(12005)` and returns, keeping the old effect, technique and defines (`material.ts:206-217`). Re-configuration goes through `reset(info)` (same body, `:225-227`), `copy(mat, overrides?)` (`:382-399`) or a fresh `Material`. `destroy()` is terminal - "cannot re-initialize after destroy" (`:229-244`).
- `setProperty(name, value, passIdx?)` writes the SAME property to every pass when `passIdx` is omitted, and all passes are prepared before any is written so a rejected value cannot leave earlier passes half-updated (`material.ts:302-340`, intent comment `:303-304`). An out-of-range `passIdx` is NOT a soft failure: it emits `warnID(16372, passIdx)` without returning, then still indexes `this._passes[passIdx]` and uploads into it, so `Pass.getHandle` dereferences `undefined` and the call throws `TypeError: Cannot read properties of undefined (reading 'getHandle')` (`:328-333`, `:524`). The `if (!pass) { continue; }` guard covers only the preparation loop (`:308`); the one warn-and-return path is `getProperty`, which answers `null` (`:366-369`). Pass an in-range index or omit `passIdx` (doc `:299`).
- Value types are enforced by a THROW. `validateUniformValue` raises `AIR_E_MATERIAL_TYPE` (`TypeError` carrying `.code/.property/.expected/.example`) for a wrong instance class, a non-finite or `fround`-unrepresentable component, or an array longer than the declared `count` (`src/cocos/render-scene/core/pass-utils.ts:110-129`, `src/cocos/core/platform/property-validation.ts:2-11`). The accepted class per `gfx.Type` is the `type2validator` matrix (`pass-utils.ts:76-87`); `FLOAT4` accepts `Vec4`, `Color` or `Quat`, `FLOAT3` accepts only `Vec3`. The full table is in `references/property-types.md`.
- An unknown property NAME never throws: `Pass.getHandle` returns `0` for it (`src/cocos/render-scene/core/pass.ts:263-264`), `_uploadProperty` returns `false` (`material.ts:524-525`), and the only signal is `warnID(16373, name)` when no pass accepted the write (`:337-339`). Names are case sensitive and effects alias them - `mainColor` writes `albedo` and `mainTexture` writes `albedoMap` on `builtin-standard` (`src/air/builtin/builtin-effects.ts:601`).
- `Color` carries 0-255 bytes but its `x/y/z/w` getters return `byte / 255` (`src/cocos/core/math/color.ts:36`, `:390-397`) and the UBO writer reads `v.x..v.w` (`src/cocos/core/math/vec4.ts:505-511`), so a `Color` arrives as fractions and a `Vec4` arrives verbatim. Both validate, so an out-of-range `Vec4` renders wrong with no diagnostic.
- Properties declared `"linear": true` are sRGB-to-linear converted, but only for a non-array scalar; `w` is copied back from the input and arrays are never converted (`material.ts:503-517`; `SRGBToLinear` imported at `:34`). `mainColor` and `emissive` on standard, `mainColor` and `color` on unlit carry it (`src/air/builtin/builtin-effects.ts:601`, `:861`).
- Passing `null` resets instead of clearing to zero: `null` on a uniform calls `Pass.resetUniform(name)`, which restores the effect-declared default value and falls back to `getDefaultFromType` (`material.ts:528-529`, `src/cocos/render-scene/core/pass.ts:433-446`); `null` on a sampler calls `pass.resetTexture(name)` (`material.ts:541-542`). A `TextureBase` whose gfx texture has zero width or height is skipped silently, with the warning commented out (`material.ts:555-560`).
- `Material.recompileShaders` and `Material.overridePipelineStates` are warn stubs that do nothing (`warnID(16370)`, `warnID(16371)`, `material.ts:252-264`), and the base `Pass.overridePipelineStates` is a warn stub too (`warnID(12102)`, `src/cocos/render-scene/core/pass.ts:377-379`). Only `MaterialInstance` implements them (`src/cocos/render-scene/core/material-instance.ts:64-90`) via `PassInstance` (`src/cocos/render-scene/core/pass-instance.ts:81-100`). `PassOverrides` is `RecursivePartial<EffectAsset.IPassStates>` (`src/cocos/render-scene/core/pass.ts:52`) over `priority`, `primitive`, `stage`, `rasterizerState`, `depthStencilState`, `blendState`, `dynamicStates`, `phase` (`src/cocos/asset/assets/effect-asset.ts:49-60`), and an override rebuilds from the effect's own pass info first, so it replaces rather than patches (`pass-instance.ts:82-88`). `docs/manual/custom-shaders.md:118-119` records the discipline: give complete `defines` at `initialize`.
- Shared versus instanced semantics: `renderer.setSharedMaterial(m, 0)` stores the reference, so `m.setProperty` drives the pixels directly, and passing a `MaterialInstance` there raises `errorID(12012)` (`src/cocos/misc/renderer.ts:175-189`). The `renderer.material` GETTER is not symmetric with the setter - it returns `getMaterialInstance(0)`, which constructs a `MaterialInstance` copy on first read (`:100-102`, `:196-207`) and from then on that instance is what renders. `MaterialInstance.destroy()` returns `true` unconditionally and its passes are `PassInstance`s that force `USE_INSTANCING = false` (`material-instance.ts:92-95`, `pass-instance.ts:118-121`).
- Builtin effects and materials are registered by `registerBuiltinAirAssets()` on `Game.EVENT_POST_SUBSYSTEM_INIT` (`src/air/builtin/register.ts:100-132`, wired at `src/air/bootstrap.ts:145`), which is part of the `createAirApp` path; the function is exported from its own module only and is not a name in the main bundle export list, so a hand-rolled engine bootstrap gets neither the 21 effects nor the 17 materials.
- WebGL 2 is the only browser target, so `getDeviceShaderVersion` selects the `glsl3` variant (`src/cocos/render-scene/core/program-lib.ts:592-600`); `glsl1` is retained upstream shape that the runtime does not consume, and every shader variant must be self-contained because there is no chunk include system (`docs/manual/custom-shaders.md:75-78`, `:13-16`).
- Capability layers, stated separately (source export / default-bundle reachable / browser-verified): `Material`, `EffectAsset`, `builtinResMgr`, `createAirUnlitFogEffect`, `inspectAirMaterial`, `inspectAirMeshMaterial`, `attachAirSpriteMask` and `createAirRenderTarget` resolve by name in the main entry - the first five also resolve by symbol name in `build/cocosair.module.d.ts`; `registerBuiltinAirAssets`, `Pass`, `PassInstance` and `MaterialInstance` are NOT in the 626-name `export { ... }` block of `build/cocosair.module.js` (parse that block programmatically rather than grepping it), so treat them as objects you receive, not names you import. `docs/evidence/examples-verified.json` records `material-*` and `shader-*` Gallery runs against its own recorded candidate fingerprint, which is evidence for that candidate and not for today's bytes.

## Common Mistakes

### [HIGH] Setting the texture without its map macro

Wrong:

```js
const m = new Material();
m.initialize({ effectName: 'builtin-unlit' });      // USE_TEXTURE defaults to off
m.setProperty('mainTexture', myTexture);            // handle exists, write succeeds, no diagnostic
```

Correct:

```js
const m = new Material();
m.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
m.setProperty('mainTexture', myTexture);
```

`mainTexture` on `builtin-unlit` is gated by `defines: ["USE_TEXTURE"]` (`src/air/builtin/builtin-effects.ts:922`) while `builtin-standard` gates its albedo sampler with `USE_ALBEDO_MAP` (`:682`, alias `mainTexture` -> `albedoMap` at `:601`), and the two names are not interchangeable - `docs/manual/custom-shaders.md:124-125` records that the wrong macro "is silently ignored and renders a flat color". An agent copies one macro name onto the other effect, or copies a PixiJS/ShaderMaterial habit where passing a texture is enough: the property handle still resolves, so nothing throws or warns, the texture binds into the descriptor set, and the compiled variant simply never samples it. The visible symptom is a correctly colored but untextured object.

### [HIGH] Writing a shared material after the renderer instantiated it

Wrong:

```js
renderer.setSharedMaterial(material, 0);
const live = renderer.material;              // getter silently creates a MaterialInstance copy
material.setProperty('mainColor', new Color(255, 0, 0, 255));   // writes the shared asset, not the screen
```

Correct:

```js
renderer.setSharedMaterial(material, 0);
renderer.getMaterialInstance(0).setProperty('mainColor', new Color(255, 0, 0, 255)); // the live object
// or keep it shared on purpose and never read renderer.material
```

The `material` GETTER returns `getMaterialInstance(0)`, which builds a `MaterialInstance` from the shared material the first time it is read and keeps it afterwards (`src/cocos/misc/renderer.ts:100-102`, `:196-207`), while the SETTER of the same property just stores the reference (`:104-109`). Reads and writes on one property name behave differently, so an agent that inspects `renderer.material` for logging silently reroutes all later updates; both calls are declared `: void` (`src/cocos/misc/renderer.ts:175`, `src/cocos/asset/assets/material.ts:302`) so neither reports whether it reached the rendering object, and nothing warns. `examples/shader-dissolve/src/main.ts:127` records the same lesson from the Gallery: "all runtime `setProperty` goes through the instance, because updating the shared material decouples from the picture". `docs/manual/uniform-types.md:65` adds the mirror hazard: `builtinResMgr.get('builtin-standard-material')` is one global shared object, so writing it repaints every consumer at once.

### [HIGH] Calling the runtime recompile and state-override API on a plain Material

Wrong:

```js
material.overridePipelineStates({ blendState: { targets: [{ blend: true }] } });
material.recompileShaders({ USE_TEXTURE: true });   // both are warn stubs on Material
```

Correct:

```js
const inst = renderer.getMaterialInstance(0);       // MaterialInstance only
inst.overridePipelineStates({ blendState: { targets: [{ blend: true }] } }, 0);
inst.recompileShaders({ USE_TEXTURE: true }, 0);
// preferred: decide macros and states before initialize, via { defines, states }
```

`Material.recompileShaders` and `Material.overridePipelineStates` bodies are single `warnID` calls (`src/cocos/asset/assets/material.ts:252-264`) and the base `Pass.overridePipelineStates` is one too (`src/cocos/render-scene/core/pass.ts:377-379`); the working implementations live on `MaterialInstance` and `PassInstance` (`src/cocos/render-scene/core/material-instance.ts:64-90`, `src/cocos/render-scene/core/pass-instance.ts:81-100`). The signatures are identical on both classes and the return type is `void`, so an agent that saw `overridePipelineStates` on the type surface calls it on the object at hand; the console gets one `warnID` line and the transparency or the macro never changes. Also note `PassInstance.overridePipelineStates` resets the blend, rasterizer and depth-stencil states and refills from the effect's own pass info before applying the override (`pass-instance.ts:82-88`), so a partial override object restores the effect defaults rather than merging into the current state.

### [MEDIUM] Hand-writing a glsl3 variant that keeps Vulkan-only members

Wrong:

```glsl
// copied verbatim from the builtin glsl4 fixture into shaders[0].glsl3.frag
#extension GL_EXT_shader_explicit_arithmetic_types_int32 : require
layout(set = 0, binding = 0) uniform CCGlobal {
  highp vec4 cc_time;
  mediump vec4 cc_debug_view_composite_pack_1;
  mediump vec4 cc_debug_view_composite_pack_2;
};
layout(set = 2, binding = 3) in u32vec4 a_joints;
```

Correct:

```glsl
precision highp float;
uniform CCGlobal {          // set/binding stripped, debug members dropped
  highp vec4 cc_time;
};
in vec4 a_joints;           // u32vecN -> vecN; locations come from bindAttribLocation
void main () { /* ... */ }
```

The engine never feeds `glsl4` to a WebGL 2 device; `getDeviceShaderVersion` picks `glsl3` (`src/cocos/render-scene/core/program-lib.ts:592-600`), and `registerBuiltinAirAssets` derives the builtin `glsl3` from `glsl4` with four exact replacements - drop `#extension` lines, drop every `cc_debug_view_composite_pack_N;` declaration line, strip `layout(...)` except a `std140` inner list, and rewrite `u32vec2/3/4` as `vec2/3/4` (`src/air/builtin/register.ts:20-30`; the shipped fixtures hold 11 `u32vec4` and 9 `#extension` occurrences and no `std140`). An agent transcribes the readable `glsl4` source into `glsl3` because the two look almost alike; the extra UBO members make the shader block bigger than the engine buffer, which surfaces as the "uniform buffer too small" case called out at `src/air/builtin/register.ts:17-18` and `docs/manual/custom-shaders.md:86-87`, while a leftover `u32vec4` fails to compile at all. `examples/shared/shader-blocks.js:128` shows the same strip applied by the Gallery samples, and `tools/debug/effect-layout.ts:53` (`AIR_E_EFFECT_LAYOUT`, `:10-12`) can pre-check a layout before registration.

## References

- `references/builtin-effects.md` - the 21 registered effect entries with definition lines, the 17 builtin material uuids with their `effectName` and `defines`, the registration and `tryCompile` timing, and which names are absent from the bundle export list.
- `references/property-types.md` - `gfx.Type` ordinals, the accepted-JS-value matrix per declared type with its error codes, `Color` byte-versus-fraction conversion, `linear: true` handling, the `setProperty` step order, `handleInfo` alias tables, and the full settable property lists of `builtin-standard` and `builtin-unlit`.
- `references/custom-glsl.md` - effect JSON field contract, variant selection, the four `glsl4 -> glsl3` rules, the `assignEffectBindings` set/binding matrices including `CCSkinning -> 3` and why, registration timing, the `effect-json.mjs` generator and `effect-layout.ts` pre-check, black-screen triage order.
- `references/defines.md` - where a macro must appear to have any effect, `USE_TEXTURE` versus `USE_ALBEDO_MAP`, the inert `USE_COLOR` define, the complete declared define lists of unlit, sprite and standard, runtime macro changes, fog defines and `createAirUnlitFogEffect`, define read-back and diagnostics.

## Canonical docs

`docs/manual/materials.md`, `docs/manual/custom-shaders.md`, `docs/manual/uniform-types.md`. Runnable references: `examples/shader-custom-gradient`, `examples/shader-dissolve`, `examples/material-basic`, `examples/material-color`, `examples/material-unlit`, `examples/material-ops`, `examples/material-lifecycle`.
