Derived from `src/cocos/render-scene/core/pass-utils.ts`, `src/cocos/render-scene/core/pass.ts`, `src/cocos/asset/assets/material.ts`, `src/cocos/asset/assets/image-asset.ts`, `src/cocos/2d/assets/sprite-frame.ts`, `src/cocos/core/math/color.ts`, `src/cocos/core/math/vec4.ts`, `src/cocos/core/platform/property-validation.ts`, `src/cocos/gfx/base/define.ts`, `src/air/builtin/builtin-effects.ts`, `docs/manual/uniform-types.md`, `docs/manual/materials.md` (as of 2026-10-09).

## `gfx.Type` ordinals used by effect JSON `type:` fields

`src/cocos/gfx/base/define.ts:294-329` (`export enum Type`, implicit ordinals starting at `UNKNOWN = 0`):

| Ordinal | `Type` member | Ordinal | `Type` member     |
| ------- | ------------- | ------- | ----------------- |
| 0       | `UNKNOWN`     | 13      | `FLOAT`           |
| 1       | `BOOL`        | 14      | `FLOAT2`          |
| 2       | `BOOL2`       | 15      | `FLOAT3`          |
| 3       | `BOOL3`       | 16      | `FLOAT4`          |
| 4       | `BOOL4`       | 17      | `MAT2`            |
| 5       | `INT`         | 21      | `MAT3`            |
| 6       | `INT2`        | 25      | `MAT4`            |
| 7       | `INT3`        | 26      | `SAMPLER1D`       |
| 8       | `INT4`        | 28      | `SAMPLER2D`       |
| 9       | `UINT`        | 29      | `SAMPLER2D_ARRAY` |
| 10      | `UINT2`       | 30      | `SAMPLER3D`       |
| 11      | `UINT3`       | 31      | `SAMPLER_CUBE`    |
| 12      | `UINT4`       | 32      | `SAMPLER`         |

`26` is the uniform/sampler boundary: `Material.setProperty` takes the UBO write path only when `type < Type.SAMPLER1D` (`src/cocos/asset/assets/material.ts:312`, `:527`), otherwise it binds a texture (`:535-543`).

## Accepted JS values per declared type

`MaterialProperty = number | Vec2 | Vec3 | Vec4 | Color | Mat3 | Mat4 | Quat` (`src/cocos/render-scene/core/pass-utils.ts:46`). `MaterialPropertyFull = MaterialProperty | TextureBase | Texture | null` (`src/cocos/asset/assets/material.ts:80`).

Validator gate: `type2validator` (`pass-utils.ts:76-87`) plus the finite-component scan `validUniformElement` (`:100-107`), run by `validateUniformValue` (`:110-129`).

| Declared type                  | Accepted instances                                                                      | Rejected value                                                                                 |
| ------------------------------ | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `INT`, `FLOAT` (5, 13)         | `number` only (`typeof v === 'number'`)                                                 | any object, `NaN`, `Infinity`, values not representable as finite `fround`                     |
| `INT2`, `FLOAT2` (6, 14)       | `Vec2`                                                                                  | `Vec3`, `Vec4`, `[x, y]`, `{ x, y }`                                                           |
| `INT3`, `FLOAT3` (7, 15)       | `Vec3`                                                                                  | `Vec2`, `Vec4`, `Color`, plain arrays                                                          |
| `INT4`, `FLOAT4` (8, 16)       | `Vec4` or `Color` or `Quat` (`:84`)                                                     | `Vec3`, `Mat3`, `[r, g, b, a]`                                                                 |
| `MAT3` (21)                    | `Mat3`                                                                                  | `Mat4`                                                                                         |
| `MAT4` (25)                    | `Mat4`                                                                                  | `Mat3`                                                                                         |
| `SAMPLER2D` (28)               | `TextureBase` (ie. `Texture2D`) or raw `gfx.Texture`, or `null`                         | `ImageAsset` / `SpriteFrame` (both extend `Asset`, not `TextureBase`): silent no-op, see below |
| array form of any of the above | `MaterialProperty[]` with `length <= count` (`:115`), `null` holes allowed (`:119-121`) | a longer array, sparse holes beyond `length`                                                   |

Failure mode for the uniform rows above is a THROW, not a silent drop: `validateUniformValue` raises `propertyTypeError('AIR_E_MATERIAL_TYPE', name, ...)` whose message embeds the expected shape and a working example (`pass-utils.ts:127-128`; `propertyTypeError` builds `TypeError` with `.code/.property/.expected/.example`, `src/cocos/core/platform/property-validation.ts:2-6`). Example strings come from `uniformExamples` (`pass-utils.ts:89-96`), e.g. `[Type.FLOAT4]` reads `new Vec4(1, 2, 3, 4), new Color(255, 128, 64, 255), or new Quat(0, 0, 0, 1)`.

Sampler-typed properties are the exception: they never reach `validateUniformValue` at all, because both the preparation loop and the upload branch gate on `type < Type.SAMPLER1D` (`material.ts:312`, `:527`) and only `_prepareUniformProperty` validates (`:496-519`). Passing an `ImageAsset` (`src/cocos/asset/assets/image-asset.ts:182`, extends `Asset`) or a `SpriteFrame` (`src/cocos/2d/assets/sprite-frame.ts:251`, extends `Asset`) to a `SAMPLER2D` property therefore produces a SILENT NO-OP: the value is truthy so `_bindTexture` is called (`material.ts:539-540`), it matches neither the raw-`Texture` nor the `TextureBase` branch and returns without binding (`:551-563`), yet `_uploadProperty` still returns `true` (`:544`), so the write is counted as a success, `warnID(16373)` is not emitted, and the value is retained in `_props` as if it had bound (`:323`). Wrap it first: `texture.image = imageAsset` or hand over a `Texture2D`.

A property NAME that the pass does not declare is the silent case: `Pass.getHandle(name)` returns `0` (`src/cocos/render-scene/core/pass.ts:263-264`), `Material._uploadProperty` returns `false` on a zero handle (`material.ts:524-525`), and `setProperty` only emits `warnID(16373, name)` once no pass accepted the write (`material.ts:337-339`).

## Color bytes versus fractions

`Color` stores 0-255 bytes and exposes vector-compatible getters: `get x() { return this._data[R_INDEX] * toFloat; }` with `toFloat = 1 / 255` (`src/cocos/core/math/color.ts:36`, `:390-397`; the matching setters multiply by 255). The UBO writer is `Vec4.toArray`, which reads `v.x, v.y, v.z, v.w` (`src/cocos/core/math/vec4.ts:505-511`, dispatched from `pass-utils.ts:71`).

Contract: a `Color` argument is converted from bytes to fractions at write time, so `new Color(225, 70, 60, 255)` reaches the shader as `(0.882, 0.275, 0.235, 1)`. A `Vec4` argument is written verbatim, so the same visual result is `new Vec4(0.882, 0.275, 0.235, 1)`. Both pass validation, so `new Vec4(225, 70, 60, 255)` is accepted and produces an out-of-range color with no error and no warning.

## `linear: true` properties

Properties declared `"linear": true` are sRGB->linear converted before upload, but ONLY for a non-array scalar value: `if (!array && pass.properties[name]?.linear)` builds a `Vec4`, runs `SRGBToLinear`, then restores `w` from the input (`src/cocos/asset/assets/material.ts:508-514`; `SRGBToLinear` imported from `src/cocos/rendering/pipeline-funcs` at `:34`). Arrays keep typed elements with no conversion (`:503-507`). The result is re-validated before any pass is touched (`:515-517`).

`builtin-standard` declares `linear: true` on `mainColor` and `emissive` (`src/air/builtin/builtin-effects.ts:601`); `builtin-unlit` declares it on `mainColor` and on the `color` alias (`:861`).

## `setProperty` flow, in order

`Material.setProperty(name, val, passIdx?)` (`src/cocos/asset/assets/material.ts:302-340`):

1. Targets are `this._passes` (all) when `passIdx === undefined`, else `[this._passes[passIdx]]` (`:305`). An out-of-range `passIdx` is fatal rather than ignored: `warnID(16372, passIdx)` is emitted without returning (`:328-330`), then `:331-332` still indexes `this._passes[passIdx]` and hands the resulting `undefined` to `_uploadProperty`, which dereferences `pass.getHandle(name)` (`:524`) and throws `TypeError: Cannot read properties of undefined (reading 'getHandle')`. The `if (!pass) { continue; }` guard at `:308` protects only the preparation loop, and the sole warn-and-return path in this API family is `getProperty` (`:366-369`).
2. Preparation pass: for every target with a non-zero handle and `val !== null` and `type < Type.SAMPLER1D`, the value is validated, deep-copied via `v.clone()` (numbers are kept as numbers), and optionally linearized; results are cached per pass (`:307-315`, `:496-519`). All matching passes are prepared BEFORE any pass is written, so a type error cannot leave earlier passes half-updated (comment `:303-304`).
3. Upload pass: uniform types go through `Pass.setUniform(handle, value)` or `Pass.setUniformArray(handle, array)` (`:532-533`; `src/cocos/render-scene/core/pass.ts:290-298`, `:320-322`). `null` on a uniform calls `Pass.resetUniform(name)` (`material.ts:528-529`; `pass.ts:433-446` restores the effect-declared default, falling back to `getDefaultFromType`).
4. Sampler types: an array binds element-wise (`_bindTexture` per index, `material.ts:535-538`); a truthy texture binds (`:539-540`); a falsy value calls `pass.resetTexture(name)` (`:541-542`).
5. `_bindTexture` (`material.ts:551-564`): a raw `Texture` binds directly; a `TextureBase` binds `getGFXTexture()` plus `getGFXSampler()`, and returns early with NO error when the texture has zero width or height (`:557-560`).
6. Successful writes are retained per pass in `this._props[pass.propertyIndex][name] = val` (`:323`, `:333`), which is what `getProperty` reads back.

`Material.getProperty(name, passIdx?)` reads ONLY that retained map, so a value that was uploaded through `Pass.setUniform` directly is invisible to it (`material.ts:357-374`, doc note `:345-350`).

Per-frame uniform updates should use `Pass.setUniform(handle, value)` with a cached handle rather than repeated `setProperty` (`material.ts:290-295` doc comment; `pass.ts:290`).

## Handle aliasing: `handleInfo`

Effect properties may be aliases into another UBO member instead of their own storage: `"handleInfo": ["<blockMember>", <componentOffset>, <type>]`.

| Alias property      | Target member          | Offset | Type           | Effect                                        |
| ------------------- | ---------------------- | ------ | -------------- | --------------------------------------------- |
| `mainColor`         | `albedo`               | 0      | 16 `FLOAT4`    | `builtin-standard` (`builtin-effects.ts:601`) |
| `albedoScale`       | `albedoScaleAndCutoff` | 0      | 15 `FLOAT3`    | `builtin-standard` (`:601`)                   |
| `alphaThreshold`    | `albedoScaleAndCutoff` | 3      | 13 `FLOAT`     | `builtin-standard` (`:601`)                   |
| `occlusion`         | `pbrParams`            | 0      | 13             | `builtin-standard` (`:601`)                   |
| `roughness`         | `pbrParams`            | 1      | 13             | `builtin-standard` (`:601`)                   |
| `metallic`          | `pbrParams`            | 2      | 13             | `builtin-standard` (`:601`)                   |
| `specularIntensity` | `pbrParams`            | 3      | 13             | `builtin-standard` (`:601`)                   |
| `emissiveScale`     | `emissiveScaleParam`   | 0      | 15             | `builtin-standard` (`:601`)                   |
| `normalStrength`    | `emissiveScaleParam`   | 3      | 13             | `builtin-standard` (`:601`)                   |
| `mainTexture`       | `albedoMap`            | 0      | 28 `SAMPLER2D` | `builtin-standard` (`:601`)                   |
| `color`             | `mainColor`            | 0      | 16             | `builtin-unlit` (`:861`)                      |
| `colorScale`        | `colorScaleAndCutoff`  | 0      | 15             | `builtin-unlit` (`:861`)                      |
| `alphaThreshold`    | `colorScaleAndCutoff`  | 3      | 13             | `builtin-unlit` (`:861`)                      |

`Pass.getHandle(name, offset, targetType)` produces aliased component handles: `targetType` re-types the handle, otherwise a non-zero `offset` shifts the component and re-types against the reduced type (`src/cocos/render-scene/core/pass.ts:263-271`). The doc example at `:254-261` shows `pass.getHandle('albedoScale', 3, gfx.Type.FLOAT)` then `pass.setUniform(h, 0.5)` writing `albedoScale.w`.

## builtin-standard settable properties

From the single `properties` object at `src/air/builtin/builtin-effects.ts:601` (technique `opaque`, pass 0). Names are case sensitive.

| Property               | Type           | Default              | Notes                                                          |
| ---------------------- | -------------- | -------------------- | -------------------------------------------------------------- |
| `tilingOffset`         | 16 `FLOAT4`    | `[1, 1, 0, 0]`       | x/y = tiling, z/w = offset (`docs/manual/uniform-types.md:24`) |
| `mainColor`            | 16 `FLOAT4`    | `[1, 1, 1, 1]`       | `linear: true`, aliases `albedo`                               |
| `albedoScale`          | 15 `FLOAT3`    | `[1, 1, 1]`          | aliases `albedoScaleAndCutoff`                                 |
| `alphaThreshold`       | 13 `FLOAT`     | `[0.5]`              | needs `USE_ALPHA_TEST`                                         |
| `occlusion`            | 13 `FLOAT`     | `[1]`                | `pbrParams.x`                                                  |
| `roughness`            | 13 `FLOAT`     | `[0.8]`              | `pbrParams.y`                                                  |
| `metallic`             | 13 `FLOAT`     | `[0.6]`              | `pbrParams.z`                                                  |
| `specularIntensity`    | 13 `FLOAT`     | `[0.5]`              | `pbrParams.w`                                                  |
| `emissive`             | 16 `FLOAT4`    | `[0, 0, 0, 1]`       | `linear: true`, own UBO member                                 |
| `emissiveScale`        | 15 `FLOAT3`    | `[1, 1, 1]`          | aliases `emissiveScaleParam`                                   |
| `normalStrength`       | 13 `FLOAT`     | `[1]`                | aliases `emissiveScaleParam.w`                                 |
| `mainTexture`          | 28 `SAMPLER2D` | `grey`               | aliases `albedoMap`, needs `USE_ALBEDO_MAP`                    |
| `normalMap`            | 28 `SAMPLER2D` | `normal`             | needs `USE_NORMAL_MAP`                                         |
| `pbrMap`               | 28 `SAMPLER2D` | `grey`               | needs `USE_PBR_MAP`                                            |
| `metallicRoughnessMap` | 28 `SAMPLER2D` | `grey`               | needs `USE_METALLIC_ROUGHNESS_MAP`                             |
| `occlusionMap`         | 28 `SAMPLER2D` | `white`              | needs `USE_OCCLUSION_MAP`                                      |
| `emissiveMap`          | 28 `SAMPLER2D` | `grey`               | needs `USE_EMISSIVE_MAP`                                       |
| `albedo`               | 16 `FLOAT4`    | `[1, 1, 1, 1]`       | raw member behind `mainColor`                                  |
| `albedoScaleAndCutoff` | 16 `FLOAT4`    | `[1, 1, 1, 0.5]`     | raw member                                                     |
| `pbrParams`            | 16 `FLOAT4`    | `[1, 0.8, 0.6, 0.5]` | raw member                                                     |
| `emissiveScaleParam`   | 16 `FLOAT4`    | `[1, 1, 1, 1]`       | raw member                                                     |
| `albedoMap`            | 28 `SAMPLER2D` | `grey`               | raw sampler                                                    |

## builtin-unlit settable properties

From `src/air/builtin/builtin-effects.ts:861` (technique `opaque`, pass 0):

| Property              | Type           | Default          | Notes                                |
| --------------------- | -------------- | ---------------- | ------------------------------------ |
| `mainTexture`         | 28 `SAMPLER2D` | `grey`           | gated by `USE_TEXTURE` (`:922`)      |
| `tilingOffset`        | 16 `FLOAT4`    | `[1, 1, 0, 0]`   |                                      |
| `mainColor`           | 16 `FLOAT4`    | `[1, 1, 1, 1]`   | `linear: true`                       |
| `colorScale`          | 15 `FLOAT3`    | `[1, 1, 1]`      | aliases `colorScaleAndCutoff`        |
| `alphaThreshold`      | 13 `FLOAT`     | `[0.5]`          | needs `USE_ALPHA_TEST`               |
| `color`               | 16 `FLOAT4`    | none             | alias of `mainColor`, `linear: true` |
| `colorScaleAndCutoff` | 16 `FLOAT4`    | `[1, 1, 1, 0.5]` | raw member                           |

## Default sampler values and `resetTextures`

Sampler defaults are built-in resource names, not files: `grey`, `white`, `normal` appear as `"value"` strings in the fixtures above (`src/air/builtin/builtin-effects.ts:601`, `:861`). Type-level fallbacks come from `getDefaultFromType`, which returns `default-texture`, `default-cube-texture`, `default-array-texture`, `default-3d-texture` for the sampler types and zero/identity arrays otherwise (`src/cocos/render-scene/core/pass-utils.ts:143-173`). `Material.resetUniforms(clearPasses = true)` empties `_props` and then calls `pass.resetUBOs()` plus `pass.resetTextures()` per pass (`src/cocos/asset/assets/material.ts:279-287`).
