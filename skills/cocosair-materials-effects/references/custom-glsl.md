Derived from `src/air/builtin/register.ts`, `src/air/builtin/builtin-glsl4.ts`, `src/air/builtin/builtin-effects.ts`, `src/air/effects/unlit-fog.ts`, `src/air/effects/sprite-mask.ts`, `src/cocos/3d/models/skinning-model.ts`, `src/cocos/asset/assets/effect-asset.ts`, `src/cocos/asset/assets/material.ts`, `src/cocos/render-scene/core/program-lib.ts`, `src/cocos/rendering/define.ts`, `src/cocos/gfx/base/define.ts`, `tools/build/effect-json.mjs`, `tools/debug/effect-layout.ts`, `examples/shader-custom-gradient/src/main.ts`, `examples/shader-dissolve/src/main.ts`, `docs/manual/custom-shaders.md`, `docs/manual/materials.md` (as of 2026-10-09).

## There is no `ShaderMaterial`

AIR has no parallel material class. The user entry point is a hand-written, already-compiled effect JSON object plus GLSL variants, fed to `EffectAsset.onLoaded()` and then to `Material.initialize({ effectAsset })` (`docs/manual/custom-shaders.md:13-16`). The builtins go through the identical path (`src/air/builtin/register.ts:102-117`). There is no `.effect` YAML compiler at runtime - what you write is the compile product.

## Which shader variant the device picks

`getDeviceShaderVersion(device)` maps `API.GLES2` and `API.WEBGL` to `glsl1`, `API.GLES3` and `API.WEBGL2` to `glsl3`, and everything else to `glsl4` (`src/cocos/render-scene/core/program-lib.ts:592-600`). Browser targets are WebGL 2 only, so **`glsl3` is the variant that renders**; `glsl1` is a retained upstream data shape the runtime does not consume (`docs/manual/custom-shaders.md:75-78`). Supply `glsl3` always; `glsl4` is the readable master source and the input for the transform below. `examples/shader-custom-gradient/src/main.ts:131-133` assigns `glsl4`, `glsl3` and `glsl1`, then calls `e.onLoaded()` at `:134`.

## `glsl4 -> glsl3` transform rules

`toGlsl3(src)` in `src/air/builtin/register.ts:20-30` applies four replacements, in order:

| Rule                          | Regex                                                                                                     | Result                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Strip `#extension` directives | `/#extension[^\n]*\n/g` -> `''`                                                                           | the Vulkan int-type extension is removed, so `u32vecN` must be rewritten (rule 4)                 |
| Drop debug-view UBO members   | `/^[^\n]*cc_debug_view_composite_pack_\d+;[^\n]*$/gm` -> `''`                                             | whole declaration line removed; engine 4.0 no longer has these members in `UBOGlobal`             |
| Normalize layout qualifiers   | `/layout\s*\(([^)]*)\)\s*/g` -> `'layout(std140) '` when the inner list contains `std140`, otherwise `''` | `set`/`binding`/`location` qualifiers are deleted; only `std140` survives                         |
| Rewrite explicit int vectors  | `/\bu32vec([234])\b/g` -> `'vec$1'`                                                                       | ESSL 3.00 has no `u32vecN`; skinning `a_joints` is fed as RGBA32F through `glVertexAttribPointer` |

Register comment on rule 2: keeping `cc_debug_view_composite_pack_1/2/3` makes the shader's block larger than the engine UBO and WebGL reports "uniform buffer too small" (`register.ts:17-18`, repeated in `docs/manual/custom-shaders.md:86-87`).

Vertex attribute locations are not carried over: the `location` qualifier is stripped and assignment is left to `bindAttribLocation` (`register.ts:15-16`).

## Set and binding layout enforced by `assignEffectBindings`

Constants (`src/air/builtin/register.ts:37-39`): `SET_GLOBAL = 0` (`SetIndex.GLOBAL`), `SET_MATERIAL = 1`, `SET_LOCAL = 2`, mirroring `src/cocos/rendering/define.ts`.

Global set (`:43-48`, applied at `:69-76`):

| Block      | Binding |
| ---------- | ------- |
| `CCGlobal` | 0       |
| `CCCamera` | 1       |
| `CCShadow` | 2       |
| `UBOCSM`   | 3       |

| Global sampler                                                     | Binding |
| ------------------------------------------------------------------ | ------- |
| `cc_shadowMap`                                                     | 4       |
| `cc_environment`                                                   | 5       |
| `cc_spotShadowMap10` / `cc_spotShadowMap25` / `cc_spotShadowMap50` | 6       |
| `cc_diffuseMap`                                                    | 7       |

Local set (`:55-60`, applied at `:79-86`):

| Block                 | Binding |
| --------------------- | ------- |
| `CCLocal`             | 0       |
| `CCForwardLight`      | 1       |
| `CCSkinningAnimation` | 2       |
| `CCSkinning`          | 3       |
| `CCSkinningTexture`   | 3       |
| `CCMorph`             | 4       |

| Local sampler             | Binding |
| ------------------------- | ------- |
| `cc_jointsTexture`        | 7       |
| `cc_morphPositionTexture` | 8       |
| `cc_morphNormalTexture`   | 9       |
| `cc_morphTangentTexture`  | 10      |

`CCSkinning` must map to 3, not 0. Its block name collides with `UBOSkinning.NAME` (`src/cocos/rendering/define.ts:651`, `:659-660`), and the engine binds the live (non-baked) joints buffer at the `UBO_SKINNING_TEXTURE` slot, `UBOSkinning.BINDING = 3`, in `SkinningModel._updateLocalDescriptors` (`src/cocos/3d/models/skinning-model.ts:97`, `:258-265`; `ModelLocalBindings` ordinals at `src/cocos/rendering/define.ts:137-142`), a constraint recorded in the register comment (`register.ts:51-54`). Falling back to 0 collides with `CCLocal` and `cc_joints` reads `CCLocal` data, which shows up as a character frozen in the bind pose (`register.ts:54`).

Unknown names default to binding 0 for blocks (`GLOBAL_BLOCK_BINDINGS[blk.name] ?? 0`, `:71`; `LOCAL_BLOCK_BINDINGS[blk.name] ?? 0`, `:81`) and to 7 for local samplers (`:85`).

Material set (`:88-97`): per shader entry, every `samplerTextures[i]` whose `set` is still `undefined` is assigned `set = 1` and a `binding` counting up from 0 in declaration order. A hand-written effect that pre-sets `binding` keeps it - `examples/shader-dissolve/src/main.ts:153` declares `samplerTextures: [{ name: 'mainTexture', type: 28, binding: 1 }]`, matching `docs/manual/custom-shaders.md:60-62` where the material `Constants` UBO occupies binding 0 and the sampler follows at binding 1.

## Effect JSON field contract

`src/cocos/asset/assets/effect-asset.ts:40-184` (declare namespace `EffectAsset`):

| Field                              | Declaration        | Contract                                                                                                                                                           |
| ---------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `techniques[].passes[].program`    | `:62`              | must match `shaders[i].name` character for character; auto-generated from `vert`/`frag` upstream, hand-written here                                                |
| `techniques[].passes[].properties` | `:66`              | `{ name: IPropertyInfo }`; defaults used when `setProperty` was never called                                                                                       |
| `IPropertyInfo.type`               | `:42`              | a `gfx.Type` ordinal, auto-extracted from the shader (`src/cocos/gfx/base/define.ts:294-329`)                                                                      |
| `IPropertyInfo.handleInfo`         | `:43`              | `[targetMember, offset, type]` alias tuple                                                                                                                         |
| `IPropertyInfo.linear`             | `:46`              | sRGB->linear before upload, scalar only                                                                                                                            |
| `IPassStates`                      | `:49-60`           | `priority`, `primitive`, `stage`, `rasterizerState`, `depthStencilState`, `blendState`, `dynamicStates`, `phase`, `pass`, `subpass`                                |
| `shaders[].builtins`               | `:169`             | `{ globals, locals, statistics }` - the input for `assignEffectBindings`                                                                                           |
| `shaders[].blocks[]`               | `:172`             | user UBO with `members: Uniform[]`                                                                                                                                 |
| `shaders[].attributes[]`           | `:171`             | `format` is a `gfx.Format` ordinal; `docs/manual/custom-shaders.md:136` fixes `a_position = 32` (RGB32F) at location 0 and `a_texCoord = 21` (RG32F) at location 2 |
| `combinations[]`                   | `:181-183`, `:321` | precompile macro matrix; `createAirUnlitFogEffect` sets `[]` (`src/air/effects/unlit-fog.ts:24`)                                                                   |

No chunk includes: every variant must be self-contained (`docs/manual/custom-shaders.md:76`).

## Registration sequence and timing

```text
await createAirApp({ canvas })              # device + root first
Object.assign(new EffectAsset(), json)      # template from compiled JSON
effect.shaders[0].glsl3 = { vert, frag }    # variant sources
effect.onLoaded()                           # registers; new Material() afterwards
new Material(); mat.initialize({ effectAsset: effect })
mat.setProperty(...)                        # uniforms and textures
renderer.setSharedMaterial(mat, 0)          # or renderer.material = mat
```

- `EffectAsset.onLoaded()` always calls `EffectAsset.register(this)` first (`src/cocos/asset/assets/effect-asset.ts:339-340`); when `deviceManager.gfxDevice` is still absent it defers program registration to `Game.EVENT_RENDERER_INITED` and returns (`:344-351`). So metadata is queryable before boot while the pass-bearing `Material.initialize` is not (`docs/manual/custom-shaders.md:110-112`, `docs/manual/materials.md:10`).
- Registry API: `EffectAsset.register(asset)` `:227-230`, `EffectAsset.remove(asset | name)` `:238-252` (accepts a name or a uuid), `EffectAsset.get(name)` `:261`, `EffectAsset.getAll()` `:279`. Re-registering the same name overwrites without throwing (`docs/manual/custom-shaders.md:109`).
- `Material.initialize({ effectAsset })` on a material that already has passes warns (`warnID(12005)`) and returns without changing anything (`src/cocos/asset/assets/material.ts:207-210`). Use a fresh `Material`, `reset(info)` (`:225-227`) or `copy(mat, overrides?)` (`:382-399`).
- Release path used by the Gallery example: hold the references, then `EffectAsset.remove(effect)` plus material destroy (`examples/shader-custom-gradient/src/main.ts:313`, `:327`).

## Optional pre-registration layout check

`prepareEffectForRegistration(effectJson)` (`tools/debug/effect-layout.ts:53`) clones the JSON, allocates non-conflicting material sampler slots, and validates set/binding, sampler type and count, per-stage `stageFlags`, UBO member order and type, and GLSL4 layout versus reflection. Failure throws `AIR_E_EFFECT_LAYOUT` with per-issue codes and messages (`tools/debug/effect-layout.ts:10-12`). Current scope is unconditional `vec4`/`mat4` UBOs and `sampler2D` only; UBOs must start at material binding 0 and be contiguous (`docs/manual/custom-shaders.md:172`). It rejects function-valued JSON (`NON_JSON_FUNCTION`) and cycles (`NON_JSON_CYCLE`) before cloning (`docs/manual/custom-shaders.md:229`). It is a repository development tool: not exported from the runtime bundle, and calling the native `onLoaded()` does not enable it (`docs/manual/custom-shaders.md:158`).

## Generator instead of hand-copying

`node tools/build/effect-json.mjs <spec.json> <out.json>` emits a WebGL2-registrable JSON with `glsl4` and a same-source `glsl3`; it does not emit the retired WebGL1 variant (`docs/manual/custom-shaders.md:178-188`). Supported declarations (`docs/manual/custom-shaders.md:190-202`): attributes `vec2/vec3/vec4` with explicit unique locations 0-15; varyings `float/vec2/vec3/vec4`; uniforms `vec4`/`mat4` with `count = 1` only; samplers `sampler2D` with a builtin default texture name; `primitive` values `POINT_LIST`, `LINE_LIST/STRIP/LOOP`, `TRIANGLE_LIST/STRIP/FAN`. The `Constants` block accepts only 16-byte-aligned `vec4` and `mat4` so the engine's dense handle offsets match `std140`; `float`, `vec2`, `vec3`, arrays, structs, integers and user-defined UBOs are refused to avoid silent padding guesses. Preprocessing, includes, YAML `.effect`, dynamic macros, MRT, compute and general GLSL transpilation are out of scope.

## In-repo source-transform precedents

Two AIR conveniences derive an effect from a builtin at runtime; both require the builtin registration to have happened first and both throw rather than degrade:

| Helper                                           | Builtin dependency                  | Failure                                                                                                           | Rewrite performed                                                                                                      |
| ------------------------------------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `createAirUnlitFogEffect()`                      | `EffectAsset.get('builtin-unlit')`  | `[AIR_UNLIT_FOG] initialize AIR builtin assets before creating the effect` (`src/air/effects/unlit-fog.ts:18-19`) | inserts an `air_fogWorldPos` varying and calls `CC_APPLY_FOG(o, air_fogWorldPos)` (`:39-42`)                           |
| `attachAirSpriteMask(sprite, texture, options?)` | `EffectAsset.get('builtin-sprite')` | `AIR_E_SPRITE_MASK_BUILTIN` (`src/air/effects/sprite-mask.ts:25`)                                                 | appends an `AirMask` UBO plus `airMaskTexture` sampler and injects mask code at the `ALPHA_TEST(o);` anchor (`:39-46`) |

`attachAirSpriteMask` also refuses when the sprite already has a custom material (`AIR_E_SPRITE_MASK_MATERIAL`, `src/air/effects/sprite-mask.ts:24`) and validates its option fields up front (`AIR_E_SPRITE_MASK_OPTIONS`, `:21-23`). It declares its own material-set slots explicitly: `airMaskTexture` at `binding: 0` (`:42`) and the fragment-only `AirMask` UBO at `binding: 1` (`:39-41`), with the matching `layout(set = 1, binding = 0)` sampler and `layout(set = 1, binding = 1)` UBO written into the `glsl4` variant (`:45`). That is sampler-BEFORE-UBO, the reverse of the `Constants` at 0 / sampler at 1 ordering recorded above (`:68`, `docs/manual/custom-shaders.md:60-62`, `:172`); read it as what this AIR effect happens to do, not as an example of the convention. It is also never renumbered: `assignEffectBindings` runs only inside `registerBuiltinAirAssets` (`src/air/builtin/register.ts:114`), while the mask effect goes straight to `effect.onLoaded()` (`src/air/effects/sprite-mask.ts:56`).

## Black-screen triage order

From `docs/manual/custom-shaders.md:135`, in sequence:

1. `EffectAsset.get(name)` returns the instance?
2. `pass.program` and `shaders[0].name` identical character for character?
3. `attributes` `format`/`location` match the mesh (`a_position` = 32 at 0, `a_texCoord` = 21 at 2)?
4. UBO member order identical to the engine source?
5. Which variant did the device take (`getDeviceShaderVersion`, `src/cocos/render-scene/core/program-lib.ts:592-600`; WebGL 2 -> `glsl3`)?

Compile errors surface as a three-part `console.error` (shader name, source dump with line numbers, ANGLE info log) while the page stays alive (`docs/manual/custom-shaders.md:130-132`).

## Known runtime-contract notes

- `matWorld` and lighting builtins: a custom shader consuming `cc_mainLitDir`/`cc_mainLitColor` must use HDR magnitudes (main-light illuminance around 65000 with `isHDR` default true and exposure `1/38400`); LDR-magnitude numbers render as zero (`docs/manual/custom-shaders.md:138-141`).
- Vertex-stage `#define`s do not reach the fragment stage - each variant is preprocessed separately; macros shared across both stages must go through the effect `defines` metadata plus `Material.initialize({ defines })` (`docs/manual/custom-shaders.md:174`).
- `POINT_LIST` is enum value 0 and is preserved by both static and dynamic `createMesh`; omitting the primitive keeps the `TRIANGLE_LIST` default. The PSO takes `pass.primitive`, so `geometry.primitiveMode` and the effect pass `primitive` must both be set (`docs/manual/custom-shaders.md:212-218`).
- Point shaders must write `gl_PointSize`; line width is not `gl_PointSize` and the portable value is the default 1 pixel (`docs/manual/custom-shaders.md:219-220`).
