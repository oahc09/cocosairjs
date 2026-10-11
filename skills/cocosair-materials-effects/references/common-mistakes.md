Derived from the cocosair-materials-effects skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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
