Derived from `src/air/rendering/color-contract.ts`, `src/air/rendering/render-target.ts`, `src/air/index.ts`, `src/exports/air.ts`, `src/cocos/gfx/base/define.ts`, `src/cocos/asset/assets/asset-enum.ts`, `docs/reference/rendering-color-diagnostics.md`, `docs/reference/texture-uv-verification.md`, `docs/manual/rendering-contracts.md`, `examples/shared/canvas-texture.js`, `test/smoke/render-dx-color-contract.test.ts`, `tools/verify/consumer-acceptance.cjs`, `docs/evidence/examples-verified.json`, `docs/evidence/examples/rendering-contracts/`, `build/cocosair.module.js`, `build/cocosair.module.d.ts`, `tools/build/build.cjs`, `src/air/rendering/material-diagnostics.ts`, `docs/evidence/texture-orientation/` (as of 2026-10-09).

## Module face

| Item                                | Value                                                                                             | Source                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Implementation file                 | `src/air/rendering/color-contract.ts` (100 lines)                                                 | whole file                                                                                  |
| Re-exported by the `air` unit       | `export * from './rendering/color-contract';`                                                     | `src/air/index.ts:39`                                                                       |
| Aggregate entry of unit `air`       | `export * from '../air';`                                                                         | `src/exports/air.ts:42`                                                                     |
| Unit `air` in the default build set | first entry of `AIR_FEATURES`                                                                     | `tools/build/build.cjs:25`                                                                  |
| Rejection mechanism                 | every rejection is a thrown `AirColorContractError`; the module contains no `warn`/`console` call | `src/air/rendering/color-contract.ts:13` (no line matches `warn` or `console` in that file) |
| Preflight scope                     | pure preflight: never changes texture bytes, standard material decode, or framebuffer output      | `src/air/rendering/color-contract.ts:37`                                                    |

## AirColorContractError

Declared at `src/air/rendering/color-contract.ts:6`; `class AirColorContractError extends TypeError`.

| Member           | Value                                     | Line  |
| ---------------- | ----------------------------------------- | ----- |
| `code`           | constructor parameter, `readonly`         | `:7`  |
| `property`       | constructor parameter, `readonly`         | `:7`  |
| message template | `` `[${code}] ${property}: ${message}` `` | `:8`  |
| `name`           | `'AirColorContractError'`                 | `:9`  |
| internal thrower | `fail(code, property, message): never`    | `:13` |

## resolveAirTextureFormat

Signature (`src/air/rendering/color-contract.ts:21`):

```ts
export function resolveAirTextureFormat (info: { format?: Format | PixelFormat }, defaultFormat: Format = Format.RGBA8): Format
```

| Condition on `info`                                                    | Result                                                       | Code                   | Message literal                                                         | Line                |
| ---------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------- | ----------------------------------------------------------------------- | ------------------- |
| `format` key absent (`hasOwnProperty` false)                           | returns `defaultFormat`, default `Format.RGBA8` (ordinal 35) | none                   | none                                                                    | `:22`, `:23`, `:21` |
| `format` key present with value `undefined`                            | throws                                                       | `AIR_E_TEXTURE_FORMAT` | `explicit undefined is not a pixel format; omit format for the default` | `:24`               |
| value not a number, not an integer, or `= 0` / negative                | throws                                                       | `AIR_E_TEXTURE_FORMAT` | `use a supported numeric GFX/PixelFormat value`                         | `:25`, `:27`        |
| value `>= Format.COUNT` and not one of the three custom values below   | throws                                                       | `AIR_E_TEXTURE_FORMAT` | `use a supported numeric GFX/PixelFormat value`                         | `:26`, `:27`        |
| value an integer `1..116` (`UNKNOWN`=0 excluded, `COUNT`=117 excluded) | returns it as `Format`                                       | none                   | none                                                                    | `:25`, `:29`        |

Custom values accepted above `Format.COUNT` (`src/air/rendering/color-contract.ts:26`), from `src/cocos/asset/assets/asset-enum.ts`:

| `PixelFormat` member | Value                                                | Source              |
| -------------------- | ---------------------------------------------------- | ------------------- |
| `RGB_A_PVRTC_2BPPV1` | 1024 (`CustomPixelFormat.VALUE`, `asset-enum.ts:29`) | `asset-enum.ts:151` |
| `RGB_A_PVRTC_4BPPV1` | 1025                                                 | `asset-enum.ts:169` |
| `RGBA_ETC1`          | 1026                                                 | `asset-enum.ts:179` |

Locked assertions (`test/smoke/render-dx-color-contract.test.ts`): omitted key returns `Format.RGBA8` (`:39`); explicit `defaultFormat` wins (`:40`); `undefined`, `Format.UNKNOWN`, `-1`, `NaN`, `9999` all throw matching `/AIR_E_TEXTURE_FORMAT/` (`:41`, `:42`).

## sRGB format set accepted by the runtime

`isAirSRGBFormat` (`src/air/rendering/color-contract.ts:15`) tests membership in an explicit 10-member set (`:14`) or the contiguous ASTC range `Format.ASTC_SRGBA_4X4 .. Format.ASTC_SRGBA_12X12` (`:16`).

| `gfx.Format` member | Ordinal | `FormatInfos[].name` | `define.ts` enum line | Info line | `PixelFormat` alias             |
| ------------------- | ------- | -------------------- | --------------------- | --------- | ------------------------------- |
| `SRGB8`             | 25      | `SRGB8`              | `:154`                | `:2148`   | `SRGB888` (`asset-enum.ts:90`)  |
| `SRGB8_A8`          | 37      | `SRGB8_A8`           | `:167`                | `:2161`   | `SRGA8888` (`asset-enum.ts:95`) |
| `BC1_SRGB`          | 58      | `BC1_SRGB`           | `:197`                | `:2185`   | none                            |
| `BC1_SRGB_ALPHA`    | 59      | `BC1_SRGB_ALPHA`     | `:198`                | `:2186`   | none                            |
| `BC2_SRGB`          | 61      | `BC2_SRGB`           | `:201`                | `:2188`   | none                            |
| `BC3_SRGB`          | 63      | `BC3_SRGB`           | `:204`                | `:2190`   | none                            |
| `BC7_SRGB`          | 71      | `BC7_SRGB`           | `:218`                | `:2198`   | none                            |
| `ETC2_SRGB8`        | 74      | `ETC2_SRGB8`         | `:223`                | `:2202`   | none                            |
| `ETC2_SRGB8_A1`     | 76      | `ETC2_SRGB8_A1`      | `:225`                | `:2204`   | none                            |
| `ETC2_SRGB8_A8`     | 78      | `ETC2_SRGB8_A8`      | `:227`                | `:2206`   | none                            |
| `ASTC_SRGBA_4X4`    | 103     | `ASTC_SRGBA_4x4`     | `:258`                | `:2234`   | none                            |
| `ASTC_SRGBA_12X12`  | 116     | `ASTC_SRGBA_12x12`   | `:271`                | `:2247`   | none                            |

The ASTC sRGB block is contiguous: 103 `4x4`, 104 `5x4`, 105 `5x5`, 106 `6x5`, 107 `6x6`, 108 `8x5`, 109 `8x6`, 110 `8x8`, 111 `10x5`, 112 `10x6`, 113 `10x8`, 114 `10x10`, 115 `12x10`, 116 `12x12` (`src/cocos/gfx/base/define.ts:258`-`:271`, info entries `:2234`-`:2247`). `Format.COUNT` = 117 (`:274`).

| Related predicate / helper         | Contract                                                                                                                  | Line                                                                                          |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `isAirDepthFormat(format)`         | true only for `Format.DEPTH` (54) and `Format.DEPTH_STENCIL` (55)                                                         | `src/air/rendering/color-contract.ts:18`; ordinals `src/cocos/gfx/base/define.ts:188`, `:189` |
| `describeAirTextureFormat(format)` | frozen `{ format, name, srgb, depth }`; `name` = `FormatInfos[format].name`, else `PixelFormat[format]`, else `'UNKNOWN'` | `src/air/rendering/color-contract.ts:98`, `:99`                                               |
| sRGB flag in `FormatInfo`          | none: constructor parameters are `name, size, count, type, hasAlpha, hasDepth, hasStencil, isCompressed`                  | `src/cocos/gfx/base/define.ts:1936`-`:1945`                                                   |
| Consumer inside AIR                | `describeAirTextureFormat` feeds the sampled-texture snapshot of `inspectAirMaterial`                                     | `src/air/rendering/material-diagnostics.ts:2`, `:39`                                          |

## validateAirTextureColorContract

Signature (`src/air/rendering/color-contract.ts:38`):

```ts
export function validateAirTextureColorContract (input: AirTextureColorContract): Readonly<Required<AirTextureColorContract>>
```

Interface (`:32`-`:36`): `format?: Format | PixelFormat`, `usage: 'color' | 'linear-data' | 'depth'`, `decode: 'none' | 'shader-srgb' | 'hardware-srgb'`. Return is `Object.freeze({ format, usage, decode })` (`:46`), with `format` already resolved by `resolveAirTextureFormat` (`:39`).

Rejection literals, all code `AIR_E_TEXTURE_COLOR`:

| Property | Message literal                                                                                                        | Trigger                                                             | Line  |
| -------- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----- |
| `usage`  | `declare color, linear-data or depth`                                                                                  | `usage` outside the three literals                                  | `:40` |
| `decode` | `declare the actual sampling decode exactly once`                                                                      | `decode` outside `none`, `shader-srgb`, `hardware-srgb`             | `:41` |
| `format` | `depth usage requires a depth format; depth formats cannot be color/data textures`                                     | `usage === 'depth'` differs from `isAirDepthFormat(format)`         | `:43` |
| `decode` | `normal/roughness/metallic/depth data must remain linear, with no sRGB decode`                                         | non-`color` usage with an sRGB format or `decode` not `none`        | `:44` |
| `decode` | `hardware-srgb requires an sRGB GPU format; an sRGB format already decodes RGB and must not be software-decoded again` | `decode === 'hardware-srgb'` differs from `isAirSRGBFormat(format)` | `:45` |

Accepted cells (`+` passes, `-` throws `AIR_E_TEXTURE_COLOR`); "linear format" means non-sRGB, non-depth:

| usage         | format class          | `none`      | `shader-srgb` | `hardware-srgb` |
| ------------- | --------------------- | ----------- | ------------- | --------------- |
| `color`       | linear                | `+`         | `+`           | `-` (`:45`)     |
| `color`       | sRGB                  | `-` (`:45`) | `-` (`:45`)   | `+`             |
| `color`       | depth                 | `-` (`:43`) | `-` (`:43`)   | `-` (`:43`)     |
| `linear-data` | linear                | `+`         | `-` (`:44`)   | `-` (`:44`)     |
| `linear-data` | sRGB                  | `-` (`:44`) | `-` (`:44`)   | `-` (`:44`)     |
| `depth`       | DEPTH / DEPTH_STENCIL | `+`         | `-` (`:44`)   | `-` (`:44`)     |

Positive and negative controls pinned by `test/smoke/render-dx-color-contract.test.ts:44`-`:64`: accepted `RGBA8 + color + shader-srgb` (`:46`), `SRGB8_A8 + color + hardware-srgb` (`:49`), `linear-data + none` with omitted format (`:52`), `DEPTH + depth + none` (`:53`); rejected `SRGB8_A8/color/shader-srgb`, `RGBA8/color/hardware-srgb`, `SRGB8_A8/linear-data/none`, `RGBA8/linear-data/shader-srgb`, `DEPTH/color/none`, `RGBA8/depth/none` (`:56`-`:64`).

Documented semantic pairing (`docs/reference/rendering-color-diagnostics.md:23`-`:29`, English paraphrase):

| Content                                   | `usage`       | Format and decode                                   |
| ----------------------------------------- | ------------- | --------------------------------------------------- |
| standard-material albedo/emissive         | `color`       | linear GPU format holding sRGB bytes, `shader-srgb` |
| custom effect with hardware color decode  | `color`       | sRGB GPU format, `hardware-srgb`                    |
| already linearized color                  | `color`       | linear GPU format, `none`                           |
| normal / metallic / roughness / occlusion | `linear-data` | linear GPU format, `none`                           |
| sampleable depth attachment               | `depth`       | `DEPTH` or `DEPTH_STENCIL`, `none`                  |

Additional documented facts: sRGB format plus `shader-srgb` is rejected as double decode (`docs/reference/rendering-color-diagnostics.md:31`); alpha is always treated as a linear value (`:31`); allocation-time device capability is still decided by the real allocation and framebuffer check, not by this validator (`:3`).

## Prefiltered environment contract

Interfaces (`src/air/rendering/color-contract.ts`): `AirPrefilteredEnvironmentContract` `:49`-`:55` = `distribution: 'ggx'`, `roughnessLevels: readonly number[]`, `encoding: 'linear' | 'srgb' | 'rgbe'`, `source: string` (caller attestation only, `:53`); `AirPrefilteredEnvironmentReceipt` `:56` = readonly `levels`, `format`, `source`, `lodMapping: 'roughness*envmap.mipmapLevel (clamped)'`; face keys `right, left, top, bottom, front, back` (`:57`).

`validateAirPrefilteredEnvironment (cube: TextureCube, contract): AirPrefilteredEnvironmentReceipt` (`:60`); all codes below are `AIR_E_ENV_PREFILTER`:

| Property              | Message literal                                                                                                                  | Trigger                                                                            | Line         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------ |
| `cube`                | `a live native TextureCube is required`                                                                                          | argument is not a `TextureCube` or `!isValid`                                      | `:61`        |
| `cube.mipmapMode`     | `native baked convolution data is required; ordinary/AUTO mipmaps are not PMREM`                                                 | `!cube.isUsingOfflineMipmaps()`                                                    | `:62`        |
| `source`              | `declare GGX prefilter provenance`                                                                                               | `distribution` not `'ggx'`, or `source` not a non-blank string                     | `:63`        |
| `roughnessLevels`     | `provide explicit six-face mipmaps and one roughness value for every level`                                                      | fewer than 2 mipmap levels, or array length differs from level count               | `:65`        |
| `format`              | `a known native color pixel format is required`                                                                                  | `resolveAirTextureFormat({ format })` throws for `cube.getPixelFormat()`           | `:67`, `:68` |
| `cube.mipmapLevel`    | `GPU mip count must match the explicit prefiltered levels`                                                                       | `cube.mipmapLevel` differs from level count                                        | `:69`        |
| `roughnessLevels`     | `native standard shader uses roughness*envmap.mipmapLevel, clamped to the last mip; incompatible schedules need a custom shader` | a level value not finite, or `\|roughness - level/levels\| > 1e-6`                 | `:72`        |
| `mipmaps[level].face` | `all six native image faces must have matching square mip dimensions and format`                                                 | a face missing, invalid, non-square at `max(1, width >> level)`, or format differs | `:73`-`:76`  |
| `encoding`            | `declare a color encoding for the filtered environment`                                                                          | `encoding` outside the three literals, or the format is a depth format             | `:79`        |
| `encoding`            | `native standard environment sampling decodes sRGB or RGBE; linear input requires a custom environment shader`                   | `encoding === 'linear'`                                                            | `:80`        |
| `cube.isRGBE`         | `native cube RGBE metadata must match the declared encoding`                                                                     | `cube.isRGBE` differs from `encoding === 'rgbe'`                                   | `:81`        |
| `format`              | `native environment shaders use software decode; hardware sRGB requires an explicit custom environment shader`                   | `isAirSRGBFormat(format)` is true                                                  | `:83`        |

The last two rows are the rejected combinations the guide describes: a hardware-sRGB GPU format and a linear-encoded environment, because the native environment shaders perform software decode for sRGB/RGBE input (`src/air/rendering/color-contract.ts:82`, `docs/reference/rendering-color-diagnostics.md:54`).

`bindAirPrefilteredEnvironment (scene: Scene, cube: TextureCube, contract): AirPrefilteredEnvironmentReceipt` (`:88`) validates first (`:89`), then:

| Property                   | Message literal                                                                                  | Trigger                                              | Line         |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------- | ------------ |
| `scene.envmap`             | `set a compatible native environment map first; this helper does not implicitly enable lighting` | scene invalid or `scene.globals.skybox.envmap` unset | `:90`, `:91` |
| `scene.envmap.isRGBE`      | `the native shader decode macro comes from envmap; reflectionMap encoding must match it`         | envmap RGBE flag differs from cube                   | `:92`        |
| `scene.envmap.mipmapLevel` | `native roughness LOD comes from envmap; its mip count must match reflectionMap`                 | envmap mip count differs from receipt `levels`       | `:93`        |

On success it only assigns `scene.globals.skybox.reflectionMap = cube` (`:94`); it generates no convolution, enables no IBL, changes no exposure, and transfers no ownership (`:87`). Failed binds leave the previous `reflectionMap` (`test/smoke/render-dx-color-contract.test.ts:99`, `:102`).

## Texture row order and UV

Measured paths (`docs/reference/texture-uv-verification.md:5`-`:11`, English paraphrase of the recorded table):

| Actual path                                    | Image or bytes                                                            | Visual top-edge UV | Observed                               |
| ---------------------------------------------- | ------------------------------------------------------------------------- | ------------------ | -------------------------------------- |
| native `Sprite`                                | `HTMLImage`/Canvas/`ImageBitmap`, top-first bytes or `IMemoryImageSource` | `v = 0`            | corners upright, left/right correct    |
| native plane rotated +90 deg on X              | same image or top-first bytes                                             | `v = 1`            | vertically flipped, left/right correct |
| same plane                                     | bytes after `copyCanvasRows` row flip                                     | `v = 1`            | corners upright, left/right correct    |
| public `GLTFLoader`, external PNG              | top-first image, nearest/clamp sampler                                    | `v = 0`            | corners upright, left/right correct    |
| public `GLTFLoader`, embedded image bufferView | same PNG encoding and sampler                                             | `v = 0`            | corners upright, left/right correct    |

Row rules:

| Rule                                      | Detail                                                                                                                     | Source                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| no decode path flips rows                 | correction happens in uploaded byte order, not in a color decode branch                                                    | `docs/reference/texture-uv-verification.md:21`    |
| `uploadData` preserves byte order         | documented on the shared helper                                                                                            | `examples/shared/canvas-texture.js:2`             |
| Sprite needs top-first bytes              | visual top has `v = 0`                                                                                                     | `examples/shared/canvas-texture.js:2`             |
| +90X plane needs flipped rows             | visual top has `v = 1`                                                                                                     | `examples/shared/canvas-texture.js:1`, `:7`, `:8` |
| buffer length guard                       | `throw new Error('canvas texture buffer size mismatch')` when `target.length !== image.data.length`                        | `examples/shared/canvas-texture.js:6`             |
| no global `flipY` switch                  | default upload behavior kept; glTF UV/winding compensation untouched; adjust UV or prepare byte copies per target geometry | `docs/reference/texture-uv-verification.md:21`    |
| wrong pairing symptom                     | image renders vertically flipped while left/right stay correct                                                             | `docs/reference/texture-uv-verification.md:8`     |
| `ImageData` is not a public `ImageSource` | write to a Canvas or pass bytes to `uploadData`; a cast is not a supported path                                            | `docs/reference/texture-uv-verification.md:21`    |
| glTF sampler                              | actual GFX sampler is nearest/clamp; illegal wrap values rejected through the public parser                                | `docs/reference/texture-uv-verification.md:17`    |
| evidence set for this page                | `docs/evidence/texture-orientation/pg24-texture-orientation-attempt1.json`, `-run1.json` ... `-run4.json`                  | directory listing                                 |
| scope caveat                              | reports remain limited subsets; they do not certify all model UVs, compressed textures, color spaces, or physical devices  | `docs/reference/texture-uv-verification.md:23`    |

## Render-target color formats (cross-reference)

`AirTargetColorFormat` = `'rgba8' | 'rgba16f' | 'rgba32f' | 'srgb8-alpha8'` (`src/air/rendering/render-target.ts:14`); `srgb8-alpha8` maps to `Format.SRGB8_A8`, ordinal 37 (`src/air/rendering/render-target.ts:41`). The option table, defaults, MSAA negotiation, and the `AIR_E_RENDER_TARGET_*` literals are in [render-target.md](render-target.md) in this directory; `createAirRenderTarget` never routes through `validateAirTextureColorContract` (`src/air/rendering/render-target.ts` contains no import of `color-contract`).

## Bundle reachability per symbol

Default bundle face parsed from the single `export { ... }` block of `build/cocosair.module.js`: 626 entries, of which 92 use `X as Y` alias form. "Resolves by symbol name" is a bundle/declaration lookup, not browser verification.

| Symbol                              | Source                                  | Default bundle ESM export             | Declaration (`build/cocosair.module.d.ts`, current lines) | Evidence                                                                                             |
| ----------------------------------- | --------------------------------------- | ------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `AirColorContractError`             | `src/air/rendering/color-contract.ts:6` | resolves by symbol name               | `export class` currently `:57369`                         | `tools/verify/consumer-acceptance.cjs:142`, `:143`                                                   |
| `isAirSRGBFormat`                   | `:15`                                   | resolves by symbol name               | currently `:57351`                                        | bundle parse                                                                                         |
| `isAirDepthFormat`                  | `:18`                                   | resolves by symbol name               | currently `:57352`                                        | bundle parse                                                                                         |
| `resolveAirTextureFormat`           | `:21`                                   | resolves by symbol name               | currently `:57354`                                        | `test/smoke/render-dx-color-contract.test.ts:39`; `tools/verify/consumer-acceptance.cjs:152`, `:156` |
| `validateAirTextureColorContract`   | `:38`                                   | resolves by symbol name               | currently `:57358`                                        | `test/smoke/render-dx-color-contract.test.ts:44`; `tools/verify/consumer-acceptance.cjs:154`, `:239` |
| `validateAirPrefilteredEnvironment` | `:60`                                   | resolves by symbol name               | currently `:57360`                                        | `test/smoke/render-dx-color-contract.test.ts:66`; `tools/verify/consumer-acceptance.cjs:241`         |
| `bindAirPrefilteredEnvironment`     | `:88`                                   | resolves by symbol name               | currently `:57362`                                        | `test/smoke/render-dx-color-contract.test.ts:87`; `tools/verify/consumer-acceptance.cjs:241`         |
| `describeAirTextureFormat`          | `:98`                                   | resolves by symbol name               | yes                                                       | `tools/verify/consumer-acceptance.cjs:143`                                                           |
| `AirTextureColorContract`           | `:32`                                   | type-only, not in the JS export block | `export interface` currently `:57374`                     | declarations only                                                                                    |
| `AirPrefilteredEnvironmentContract` | `:49`                                   | type-only, not in the JS export block | referenced at currently `:57360`                          | declarations only                                                                                    |
| `AirPrefilteredEnvironmentReceipt`  | `:56`                                   | type-only, not in the JS export block | referenced at currently `:57360`                          | declarations only                                                                                    |

Browser layer for these APIs: the color/HDR example `hdr-color-pipeline` is covered by `docs/evidence/examples/rendering-contracts/hdr/chromium.json`, `hdr/firefox.json`, `hdr/webkit.json` (each carries its own `bundle` field) and by the two-example formal collectors `formal-chromium.json` (`measuredAt 2026-10-05T07:02:45.440Z`, `hdr-color-pipeline` result `FAIL`, `completed false`, `partial true`), `formal-chromium-attempt2.json` (`2026-10-05T07:06:09.506Z`, 2/2 pass, `scopePassed true`), `formal-firefox.json` (`07:17:10.325Z`) and `formal-webkit.json` (`07:20:40.185Z`), all recording `candidateFingerprint 36938d0c6e6194b3` and `subset ["hdr-color-pipeline","water-multipass"]`. `hdr-color-pipeline` and `water-multipass` are absent from the 154 ids in `docs/evidence/examples-verified.json` (file `measuredAt 2026-10-04T05:52:32.537Z`, `completed true`, `partial false`, file-level `candidateFingerprint 2f089f6ce25eaccd`, equal to every entry's own fingerprint). That recorded fingerprint is not today's bytes: recomputing now through `node -p "require('./tools/verify/api-trace.cjs').candidateFingerprint()"` yields `8f3e573cebbb315f`. `test/smoke/render-dx-color-contract.test.ts` runs under jsdom with `renderMode: 3` (`:36`), so it is a CPU contract test, not GPU presentation evidence.
