Derived from `src/air/builtin/builtin-effects.ts`, `src/air/builtin/builtin-glsl4.ts`, `src/air/builtin/builtin-material.ts`, `src/air/builtin/register.ts`, `src/air/effects/unlit-fog.ts`, `src/air/effects/sprite-mask.ts`, `src/air/rendering/engine-contracts.ts`, `src/air/rendering/material-diagnostics.ts`, `src/cocos/asset/assets/effect-asset.ts`, `src/cocos/asset/assets/material.ts`, `src/cocos/misc/renderer.ts`, `src/cocos/render-scene/core/pass-utils.ts`, `src/cocos/render-scene/core/pass.ts`, `src/cocos/render-scene/core/program-lib.ts`, `src/cocos/render-scene/core/program-utils.ts`, `src/cocos/render-scene/core/pass-instance.ts`, `src/cocos/render-scene/core/material-instance.ts`, `docs/manual/custom-shaders.md`, `docs/manual/materials.md`, `docs/manual/uniform-types.md` (as of 2026-10-09).

## Where a macro name has to appear to do anything

A define is a key in a `MacroRecord` (`src/cocos/render-scene/core/pass-utils.ts:194`: `Record<string, number | boolean | string>`). It only changes pixels when the shader source actually tests it. Four declaration sites in a shader entry:

| Site             | Field                                  | Effect                                                                                                                                                                   |
| ---------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shader reflect   | `shaders[i].defines[]`                 | `{ name, type, range?, options?, default? }` (`src/cocos/asset/assets/effect-asset.ts:135-141`); metadata for tooling and precompile combinations                        |
| Uniform block    | `blocks[].defines[]`                   | block is compiled in only when all listed macros hold                                                                                                                    |
| Sampler          | `samplerTextures[].defines[]`          | sampler slot exists only when the macro holds                                                                                                                            |
| Vertex attribute | `attributes[].defines[]`               | attribute is declared only when the macro holds; `!` prefix negates (`{ "name": "CCLocal", "defines": ["!USE_INSTANCING", "!USE_BATCHING"] }`, `builtin-effects.ts:870`) |
| Pass             | `techniques[].passes[].switch`         | `Material._createPasses` skips the pass entirely when `defines[passInfo.switch]` is falsy (`src/cocos/asset/assets/material.ts:451`)                                     |
| Pass             | `techniques[].passes[].embeddedMacros` | force-merged into the pass defines at creation (`material.ts:448-450`), e.g. `CC_FORWARD_ADD: true` on the standard `forward-add` pass (`builtin-effects.ts:601`)        |

Write path: `Material.initialize({ defines })` -> `_fillInfo` -> `_prepareInfo`, which broadcasts one object to every pass when the value is not an array (`material.ts:420-429`, pass count read from `this._effectAsset.techniques[this._techIdx].passes.length` at `:423`). Pass-indexed arrays are supported: `defines: [{...}, {...}]`.

## `USE_TEXTURE` versus `USE_ALBEDO_MAP`

These are two different macros on two different effects; they are not interchangeable.

| Effect             | Sampler property                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Declared gating macro                             | Source line                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- | ----------------------------------------------------- |
| `builtin-unlit`    | `mainTexture` (effective material set 1, binding 0)                                                                                                                                                                                                                                                                                                                                                                                                                                  | `USE_TEXTURE`                                     | `builtin-effects.ts:922`                              |
| `builtin-standard` | `mainTexture` -> alias `albedoMap` (binding 0), then `normalMap` 1, `pbrMap` 2, `metallicRoughnessMap` 3, `occlusionMap` 4, `emissiveMap` 5                                                                                                                                                                                                                                                                                                                                          | `USE_ALBEDO_MAP`                                  | `builtin-effects.ts:682-687`, `:755`; alias at `:601` |
| `builtin-sprite`   | none: its only pass property is `alphaThreshold` (`builtin-effects.ts:559`), so `setProperty('mainTexture', tex)` on a sprite material is an unknown name (`warnID(16373)`). The texture it samples is the LOCAL builtin `cc_spriteTexture`, gated by `USE_TEXTURE` in `builtins.locals.samplerTextures` (`:568`) and declared `#if USE_TEXTURE` / `layout(set = 2, binding = 11) uniform sampler2D cc_spriteTexture` in the sprite fragment (`src/air/builtin/builtin-glsl4.ts:86`) | `USE_TEXTURE` (a `defines[]` metadata entry only) | `builtin-effects.ts:559`, `:568`, `:576`              |

Material-set bindings are NOT the numbers written in the fixture JSON: `assignEffectBindings` walks each shader's `samplerTextures` and, for every entry whose `set` is still `undefined`, overwrites `set = 1` and renumbers `binding` from 0 in declaration order (`src/air/builtin/register.ts:88-97`), and no fixture material sampler declares `set`. The replayed effective values are the ones in the table above (`mainTexture` -> 0 on unlit, `albedoMap` -> 0 ... `emissiveMap` -> 5 on standard); see [custom-glsl.md](custom-glsl.md) for the rule.

`docs/manual/uniform-types.md:64` and `:274` state the standard requirement (`defines: { USE_ALBEDO_MAP: true }`); `docs/manual/custom-shaders.md:124-125` states the unlit requirement and records that the wrong name "is silently ignored and renders a flat color". Symptom in both directions between the two material-set effects above: `setProperty` succeeds (the handle exists in `_propertyHandleMap`, so nothing throws and no warning is printed), the texture is bound into the descriptor set, and the compiled variant simply never samples it.

## `USE_COLOR` is inert on `builtin-unlit`

`src/air/builtin/builtin-material.ts:14` and `:25` initialize `missing-effect-material` and `missing-material` with `defines: { USE_COLOR: true }`, and `src/cocos/asset/assets/material.ts:583` (`Material.initDefault`) does the same. The token `USE_COLOR` occurs **zero times** in `src/air/builtin/builtin-glsl4.ts` (the GLSL bodies) and zero times in `src/air/builtin/builtin-effects.ts` (no declare, no gating list), and it is absent from `builtin-unlit`'s declared `defines[]` block (`builtin-effects.ts:873-893`, the 21 entries tabled below).

Nothing is emitted for it at all: the shader prefix is built by `prepareDefines(defines, tmpl.defines)`, which iterates ONLY the effect's declared define list and pushes one `{ name, value, isDefault }` per declared entry (`src/cocos/render-scene/core/program-utils.ts:49-60`), and the caller turns that array into `#define` lines (`src/cocos/render-scene/core/program-lib.ts:561-563`). A key the effect never declared, like `USE_COLOR`, is therefore not written into the source, which is why it cannot change any pixels. For a hand-written effect that means the macro must exist in `shaders[i].defines[]` before `defines: { MY_MACRO: true }` has any reach; passing it in `initialize` alone is inert the same way `USE_COLOR` is.

The yellow / magenta appearance comes only from the color property writes: `setProperty('mainColor', color('#ffff00'))` at `builtin-material.ts:16` and `color('#ff00ff')` at `:27` (`docs/manual/materials.md:29` describes the same visual signal). The macro that actually gates per-vertex color on `builtin-unlit` is `USE_VERTEX_COLOR` (`builtin-effects.ts:888`), which drives the `a_color` attribute at `:910` and is checked by `inspectAirMeshMaterial` (`src/air/rendering/engine-contracts.ts:27-32`).

## `builtin-unlit` declared defines (`builtin-effects.ts:873-893`, 21 entries)

| Line | Name                             | Type    | Range or options       |
| ---- | -------------------------------- | ------- | ---------------------- |
| 873  | `USE_INSTANCING`                 | boolean | -                      |
| 874  | `USE_BATCHING`                   | boolean | -                      |
| 875  | `CC_USE_SKINNING`                | boolean | -                      |
| 876  | `CC_USE_BAKED_ANIMATION`         | boolean | -                      |
| 877  | `CC_USE_LIGHTMAP`                | boolean | -                      |
| 878  | `CC_RECEIVE_SHADOW`              | boolean | -                      |
| 879  | `CC_USE_MORPH`                   | boolean | -                      |
| 880  | `CC_MORPH_TARGET_COUNT`          | number  | `[2, 8]`               |
| 881  | `CC_MORPH_TARGET_HAS_POSITION`   | boolean | -                      |
| 882  | `CC_MORPH_TARGET_HAS_NORMAL`     | boolean | -                      |
| 883  | `CC_MORPH_TARGET_HAS_TANGENT`    | boolean | -                      |
| 884  | `CC_MORPH_PRECOMPUTED`           | boolean | -                      |
| 885  | `CC_USE_REAL_TIME_JOINT_TEXTURE` | boolean | -                      |
| 886  | `CC_USE_FOG`                     | number  | `[0, 4]`               |
| 887  | `CC_USE_ACCURATE_FOG`            | boolean | -                      |
| 888  | `USE_VERTEX_COLOR`               | boolean | -                      |
| 889  | `USE_TEXTURE`                    | boolean | -                      |
| 890  | `SAMPLE_FROM_RT`                 | boolean | -                      |
| 891  | `CC_USE_HDR`                     | boolean | -                      |
| 892  | `USE_ALPHA_TEST`                 | boolean | -                      |
| 893  | `ALPHA_TEST_CHANNEL`             | string  | `["a", "r", "g", "b"]` |

## `builtin-sprite` declared defines (`builtin-effects.ts:571-577`, 7 entries)

| Line | Name                    | Type    |
| ---- | ----------------------- | ------- |
| 571  | `USE_LOCAL`             | boolean |
| 572  | `SAMPLE_FROM_RT`        | boolean |
| 573  | `USE_PIXEL_ALIGNMENT`   | boolean |
| 574  | `CC_USE_EMBEDDED_ALPHA` | boolean |
| 575  | `USE_ALPHA_TEST`        | boolean |
| 576  | `USE_TEXTURE`           | boolean |
| 577  | `IS_GRAY`               | boolean |

`USE_LOCAL` also gates the `CCLocal` block for sprite (`builtin-effects.ts:568`). `attachAirSpriteMask` requires the exact triple `{ USE_TEXTURE: true, USE_ALPHA_TEST: false, CC_USE_EMBEDDED_ALPHA: false }` when it initializes its derived material (`src/air/effects/sprite-mask.ts:59`).

## `builtin-standard` declared defines (`builtin-effects.ts:613-651`, 39 entries)

The main shader (`standard|standard-vs|standard-fs`, `:605`) declares all 39; the shadow-caster shader (`:700`) declares its own smaller set including `USE_ALBEDO_MAP` (`:722`).

| Line | Name                             | Type    | Range or options    |
| ---- | -------------------------------- | ------- | ------------------- |
| 613  | `USE_INSTANCING`                 | boolean | -                   |
| 614  | `USE_BATCHING`                   | boolean | -                   |
| 615  | `CC_USE_SKINNING`                | boolean | -                   |
| 616  | `CC_USE_BAKED_ANIMATION`         | boolean | -                   |
| 617  | `CC_USE_LIGHTMAP`                | boolean | -                   |
| 618  | `CC_RECEIVE_SHADOW`              | boolean | -                   |
| 619  | `CC_USE_MORPH`                   | boolean | -                   |
| 620  | `CC_MORPH_TARGET_COUNT`          | number  | `[2, 8]`            |
| 621  | `CC_MORPH_TARGET_HAS_POSITION`   | boolean | -                   |
| 622  | `CC_MORPH_TARGET_HAS_NORMAL`     | boolean | -                   |
| 623  | `CC_MORPH_TARGET_HAS_TANGENT`    | boolean | -                   |
| 624  | `CC_MORPH_PRECOMPUTED`           | boolean | -                   |
| 625  | `CC_USE_REAL_TIME_JOINT_TEXTURE` | boolean | -                   |
| 626  | `CC_USE_FOG`                     | number  | `[0, 4]`            |
| 627  | `CC_USE_ACCURATE_FOG`            | boolean | -                   |
| 628  | `USE_VERTEX_COLOR`               | boolean | -                   |
| 629  | `HAS_SECOND_UV`                  | boolean | -                   |
| 630  | `USE_NORMAL_MAP`                 | boolean | -                   |
| 631  | `CC_FORWARD_ADD`                 | boolean | -                   |
| 632  | `USE_TWOSIDE`                    | boolean | -                   |
| 633  | `SAMPLE_FROM_RT`                 | boolean | -                   |
| 634  | `CC_SHADOWMAP_FORMAT`            | number  | `[0, 3]`            |
| 635  | `CC_USE_IBL`                     | number  | `[0, 2]`            |
| 636  | `CC_USE_DIFFUSEMAP`              | number  | `[0, 2]`            |
| 637  | `USE_REFLECTION_DENOISE`         | boolean | -                   |
| 638  | `CC_USE_HDR`                     | boolean | -                   |
| 639  | `USE_ALBEDO_MAP`                 | boolean | -                   |
| 640  | `ALBEDO_UV`                      | string  | `["v_uv", "v_uv1"]` |
| 641  | `NORMAL_UV`                      | string  | `["v_uv", "v_uv1"]` |
| 642  | `PBR_UV`                         | string  | `["v_uv", "v_uv1"]` |
| 643  | `USE_PBR_MAP`                    | boolean | -                   |
| 644  | `USE_METALLIC_ROUGHNESS_MAP`     | boolean | -                   |
| 645  | `USE_OCCLUSION_MAP`              | boolean | -                   |
| 646  | `USE_EMISSIVE_MAP`               | boolean | -                   |
| 647  | `EMISSIVE_UV`                    | string  | `["v_uv", "v_uv1"]` |
| 648  | `USE_ALPHA_TEST`                 | boolean | -                   |
| 649  | `ALPHA_TEST_CHANNEL`             | string  | `["a", "r"]`        |
| 650  | `CC_PIPELINE_TYPE`               | number  | `[0, 1]`            |
| 651  | `CC_FORCE_FORWARD_SHADING`       | boolean | -                   |

`ALPHA_TEST_CHANNEL` option sets differ between the two effects: unlit allows `a/r/g/b` (`:893`), standard allows only `a/r` (`:649`).

## Changing macros after `initialize`

- `Material.recompileShaders(overrides, passIdx?)` on a plain `Material` is a warn stub: `warnID(16370, this.name)` and no work (`src/cocos/asset/assets/material.ts:252-254`). Same for `Material.overridePipelineStates` -> `warnID(16371)` (`:262-264`). `docs/manual/custom-shaders.md:118-119` records this as "defines must be given at initialize time".
- `MaterialInstance.recompileShaders` is the real implementation: it calls `pass.tryCompile(overrides)` for all passes or one (`src/cocos/render-scene/core/material-instance.ts:64-73`), and `PassInstance.tryCompile` first runs `overrideMacros(this._defines, defineOverrides)` and returns early when nothing changed (`src/cocos/render-scene/core/pass-instance.ts:91-100`; `overrideMacros` compares with `!==` per key, `pass-utils.ts:202-212`). A `0` versus `false` or `1` versus `true` mismatch therefore counts as "different" and triggers a recompile, and vice versa counts as identical.
- To get an instance: `renderer.material` (getter) or `renderer.getMaterialInstance(i)` (`src/cocos/misc/renderer.ts:100-102`, `:196-207`).
- `PassInstance._syncBatchingScheme` hard-sets `this._defines.USE_INSTANCING = false` and `BatchingSchemes.NONE` on every instance (`pass-instance.ts:118-121`), so an instance never inherits instancing.

## Fog macros and `createAirUnlitFogEffect`

`CC_USE_FOG` is a numeric macro with range `[0, 4]` (`builtin-effects.ts:886`, `:626`) and `CC_USE_ACCURATE_FOG` is boolean (`:887`). `createAirUnlitFogEffect()` (`src/air/effects/unlit-fog.ts:17-57`) does not touch those numbers; it clones `builtin-unlit`'s techniques and shaders (`:22-23`), then rewrites both `glsl3` and `glsl4` sources:

| Rewrite                                                                                                                           | Source line          |
| --------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Require `EffectAsset.get('builtin-unlit')`, else throw `[AIR_UNLIT_FOG] initialize AIR builtin assets before creating the effect` | `unlit-fog.ts:18-19` |
| Require the exact strings `CC_TRANSFER_FOG(matWorld * position);` and `CC_APPLY_FOG(o);`, else throw and register nothing         | `:29-33`             |
| Require `precision highp float;` in both stages of both variants, else throw                                                      | `:34-38`             |
| Emit `out highp vec3 air_fogWorldPos;` in the vertex stage, `layout(location = 3) ` only for `glsl4`                              | `:34`, `:39`         |
| Replace `CC_APPLY_FOG(o);` with `CC_APPLY_FOG(o, air_fogWorldPos);` so fog uses the per-fragment world position                   | `:41-42`             |
| Rehash the shader and rename it `<previousName>\|air-fog:<hash>`, then repoint every `pass.program`                               | `:44-48`             |
| Register through `effect.onLoaded()` and then unsubscribe its deferred `_precompile` from `Game.EVENT_RENDERER_INITED`            | `:50-55`             |

Names are `air-unlit-fog-<n>` with a module-level counter (`:4`, `:21`). Material creation still compiles lazily, so removing the precompile callback does not disable the effect (`:51-53`).

## Reading defines back

- `pass.defines` returns the live `_defines` record (`src/cocos/render-scene/core/pass.ts:899`), so `material.passes[0].defines.USE_TEXTURE` is the authoritative post-initialize value.
- `inspectAirMaterial(material)` reports `program`, `propertyIndex`, `priority`, `phase`, `stage`, `depthTest`/`depthWrite`/`depthFunc`, `cullMode`, `blendTargets`, and material-set `textures[]` per pass, and it is read-only: no compile, no mutation, no draw, no GPU query (`src/air/rendering/material-diagnostics.ts:26-54`). It only reports material-set combined sampler textures; global and local bindings belong to the renderer (`:28-29`).
- `inspectAirMeshMaterial(mesh, material, primitiveIndex?, renderer?)` cross-checks mesh attributes against pass defines and returns coded issues: `AIR_W_VERTEX_COLOR_DISABLED`, `AIR_E_VERTEX_COLOR_MISSING`, `AIR_W_VERTEX_COLOR_INACTIVE`, `AIR_W_TEXTURE_UV_MISSING` (`src/air/rendering/engine-contracts.ts:26-35`). The builtin contract is only applied when `material.effectAsset.name === 'builtin-unlit'` or it starts with `air-unlit-fog-` (`:19`); `builtinContractChecked: false` means those checks were skipped, not that they passed (`:39`).
