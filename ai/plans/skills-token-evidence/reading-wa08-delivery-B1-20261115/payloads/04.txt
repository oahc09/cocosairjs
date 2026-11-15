Derived from `docs/manual/shadow-support-matrix.md`, `src/cocos/render-scene/scene/shadows.ts`, `src/cocos/render-scene/scene/directional-light.ts`, `src/cocos/3d/lights/directional-light-component.ts`, `src/cocos/3d/lights/spot-light-component.ts`, `src/cocos/3d/lights/point-light-component.ts`, `src/cocos/3d/lights/sphere-light-component.ts`, `src/cocos/rendering/shadow/shadow-flow.ts`, `src/cocos/render-scene/scene/point-light.ts`, `src/cocos/render-scene/core/render-scene.ts`, `build/cocosair.module.js`, `examples/campfire-night/` (as of 2026-10-09).

## Support grid (default WebGL2 legacy pipeline)

Contract search IDs (`docs/manual/shadow-support-matrix.md:5`): `AIR_SHADOW_POINT_UNSUPPORTED`, `AIR_SHADOW_PLANAR_ROI_NOT_VERIFIED`, `AIR_SHADOW_SPOT_RUNTIME_NOT_SAMPLED`. These are rendering-contract IDs, not glTF extensions.

| Light type               | Planar projection                                                          | ShadowMap                                       | Documented basis                                                                                        |
| ------------------------ | -------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Main `DirectionalLight`  | projects onto a single plane along `scene.renderScene.mainLight` direction | fixed-area / CSM path                           | ShadowFlow reads `mainLight` (`shadow-flow.ts:140`); planar path `PlanarShadowQueue`                    |
| `SpotLight`              | not a planar projection source                                             | supported when `shadowEnabled`                  | ShadowFlow collects `LightType.SPOT` (`shadow-flow.ts:122`); not separately evidenced this round        |
| `PointLight`             | not a planar projection source                                             | NOT supported                                   | `src/cocos/render-scene/scene/point-light.ts:32` states it does not support shadow generation currently |
| `SphereLight`            | not a planar projection source                                             | no default sphere shadow path                   | ShadowFlow does not collect this type                                                                   |
| `RangedDirectionalLight` | not a `scene.renderScene.mainLight` projection source                      | no default main-shadow contract for this matrix | local directional lighting is not CSM main light                                                        |
| Ambient                  | none                                                                       | none                                            | environment illumination, not a shadow caster                                                           |

ShadowFlow gate: if `!shadowInfo.enabled || shadowInfo.type !== ShadowType.ShadowMap` the flow returns immediately (`src/cocos/rendering/shadow/shadow-flow.ts:116`). Only `SPOT` lights with `spotLight.shadowEnabled` are collected in the punctual loop (`shadow-flow.ts:122`, `:124`), bounded by `shadowInfo.maxReceived` (`:120`).

## Enum ordinals (`src/cocos/render-scene/scene/shadows.ts`)

`ShadowType` (`:73`): `Planar=0`, `ShadowMap=1`. Note there is no `None`/`Inherit` in `ShadowType`; the "none" state is the internal constant `SHADOW_TYPE_NONE = ShadowType.ShadowMap + 1 = 2` (`:190`), and `Shadows._type` defaults to it (`:339`) while `_enabled` defaults to `false` (`:338`).

`PCFType` (`:97`): `HARD=0` (x1), `SOFT=1` (x4), `SOFT_2X=2` (x9), `SOFT_4X=3` (x16).

`CSMLevel` (`:132`): `LEVEL_1=1`, `LEVEL_2=2`, `LEVEL_3=3`, `LEVEL_4=4`.

`CSMOptimizationMode` (`:167`): `NONE=1`, `RemoveDuplicates=2`, `DisableRotationFix=3`.

`ShadowSize` (`:38`): `Low_256x256=256`, `Medium_512x512=512`, `High_1024x1024=1024`, `Ultra_2048x2048=2048`.

`Shadows` global defaults (`src/cocos/render-scene/scene/shadows.ts`):

| Member               | Default              | Line   |
| -------------------- | -------------------- | ------ |
| `MAX_FAR`            | `2000.0`             | `:201` |
| `maxReceived`        | `4`                  | `:330` |
| `_size` (shadow map) | `Vec2(1024, 1024)`   | `:344` |
| `_normal`            | `Vec3(0, 1, 0)`      | `:342` |
| `_distance`          | `0`                  | `:340` |
| `_planeBias`         | `1.0`                | `:341` |
| `_shadowColor`       | `Color(0, 0, 0, 76)` | `:343` |

`Shadows.activate` maps to pipeline macro `CC_SHADOW_TYPE`: `0` disabled, `1` planar, `2` shadow-map (`:381`, `:388`, `:394`, `:406`).

## DirectionalLight shadow fields (defaults, ranges, clamps)

From `src/cocos/3d/lights/directional-light-component.ts` (component defaults shown; render-scene `DirectionalLight` mirrors them):

| Field                                | Default                                  | `@range` / clamp                                      | Line                                                   |
| ------------------------------------ | ---------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `shadowEnabled`                      | `false`                                  | boolean                                               | `:55`, `:131`                                          |
| `shadowPcf`                          | `PCFType.HARD`                           | enum `PCFType`                                        | `:59`, `:151`                                          |
| `shadowBias`                         | `0.00001`                                | `CCFloat`                                             | `:61`, `:171`                                          |
| `shadowNormalBias`                   | `0.0`                                    | `CCFloat`                                             | `:63`, `:191`                                          |
| `shadowSaturation`                   | `1.0`                                    | `[0.0, 1.0, 0.01]`, setter clamps 0..1                | `:65`, `:210`, `:217`                                  |
| `shadowDistance`                     | `50`                                     | `[0.0, 2000.0, 0.1]`, setter `Math.min(val, MAX_FAR)` | `:67`, `:237`, `:244`                                  |
| `shadowInvisibleOcclusionRange`      | `200`                                    | `[0.0, 2000.0, 1.0]`, setter `Math.min(val, MAX_FAR)` | `:69`, `:266`, `:273`                                  |
| `csmLevel` / `enableCSM`             | `CSMLevel.LEVEL_4`                       | `enableCSM` true when `csmLevel > LEVEL_1`            | `:71`, `:313`, `:317`                                  |
| `csmLayerLambda`                     | `0.75`                                   | `[0.0, 1.0, 0.01]`                                    | `:73`, `:332`                                          |
| `csmOptimizationMode` (component)    | `CSMOptimizationMode.RemoveDuplicates`   | enum                                                  | `:75`                                                  |
| `csmOptimizationMode` (render-scene) | `CSMOptimizationMode.DisableRotationFix` | enum                                                  | `src/cocos/render-scene/scene/directional-light.ts:57` |
| `shadowFixedArea`                    | `false`                                  | boolean                                               | `:86`, `:376`                                          |
| `shadowNear`                         | `0.1`                                    | `CCFloat`                                             | `:88`, `:399`                                          |
| `shadowFar`                          | `10.0`                                   | setter `Math.min(val, MAX_FAR)`                       | `:90`, `:426`                                          |
| `shadowOrthoSize`                    | `5`                                      | `CCFloat`                                             | `:92`, `:444`                                          |
| `csmLayersTransition`                | `false`                                  | boolean                                               | `:80`, `:488`                                          |
| `csmTransitionRange`                 | `0.05`                                   | `[0.0, 1.0, 0.01]`                                    | `:82`, `:509`                                          |

`shadowDistance` setter warns `warnID(15003, ...)` when `shadowDistance / 0.1 < 10.0` (`src/cocos/3d/lights/directional-light-component.ts:245`).

Render-scene `DirectionalLight.activate` sets macro `CC_DIR_LIGHT_SHADOW_TYPE`: `0` when disabled, `1` for fixed-area or non-CSM, `2` for CSM (`csmLevel > 1` and `csmSupported`), plus `CC_DIR_SHADOW_PCF_TYPE = shadowPcf` (`src/cocos/render-scene/scene/directional-light.ts:340`, `:344`, `:346`, `:350`, `:352`, `:354`).

## SpotLight shadow fields (subset)

From `src/cocos/3d/lights/spot-light-component.ts`: `shadowEnabled` default `false` (`:67`, `:226`), `shadowPcf` `PCFType.HARD` (`:69`, `:246`), `shadowBias` `0.00001` (`:71`, `:264`), `shadowNormalBias` `0.0` (`:73`, `:284`). Spot exposes only these four shadow fields; it has no `shadowSaturation`, `shadowDistance`, `shadowInvisibleOcclusionRange`, CSM, or fixed-area fields. Visibility gates require `shadows.type === ShadowType.ShadowMap` (`:222`, `:241`, `:260`, `:279`).

Point and Sphere components define no shadow fields at all (confirmed in `point-light-component.ts` and `sphere-light-component.ts` property lists).

## Fields ignored by the shipped pipeline

- `shadowSaturation`, `shadowDistance`, `shadowInvisibleOcclusionRange`, `shadowNear`, `shadowFar`, `shadowOrthoSize`, CSM fields only take effect on the `DirectionalLight` main-light ShadowMap path; they are not read for Sphere/Point (no path) and Spot does not expose them.
- Component setters propagate to `this._light` only when the render-scene light already exists (`if (this._light)`), so assignment before `_createLight` runs stores the private field without an immediate pipeline effect.

## Documented workarounds and silent-miss symptom

Unsupported-cell handling recorded in the source (`docs/manual/shadow-support-matrix.md`):

- Point shadows (`AIR_SHADOW_POINT_UNSUPPORTED`): the render PointLight source states shadow generation is not supported (`src/cocos/render-scene/scene/point-light.ts:32`); no in-repo workaround exists - Spot results cannot stand in for point light (`docs/manual/shadow-support-matrix.md:14`).
- Planar (`AIR_SHADOW_PLANAR_ROI_NOT_VERIFIED`): the native planar path exists but the documented round did not obtain a decidable ROI pixel change despite setting caster, receiving plane, and bias; continue by recording the projection range and receiving plane, not by treating field assignment as acceptance (`docs/manual/shadow-support-matrix.md:33`, `:34`).
- Spot (`AIR_SHADOW_SPOT_RUNTIME_NOT_SAMPLED`): Spot ShadowMap path is collected by ShadowFlow (`shadow-flow.ts:122`) but was not separately evidenced this round (`docs/manual/shadow-support-matrix.md:13`).

Concrete silent-miss symptoms read this session:

- Global shadow off: `Shadows._enabled` defaults `false` (`shadows.ts:338`) and `DirectionalLight._shadowEnabled` defaults `false` (`directional-light-component.ts:55`); with either off, `ShadowFlow.render` returns without drawing a shadow map (`shadow-flow.ts:116`). No warn is emitted for "shadows expected but disabled" in the files read.
- Extra directional lights: adding a second directional light emits the one-time warn `[AIR_W_DIRECTIONAL_LIGHT_LIMIT] ...extra registered lights do not add illumination. Inspect scene.mainLight.` (`src/cocos/render-scene/core/render-scene.ts:338`); only `mainLight` casts (`shadow-flow.ts:140`).
- Models without valid bounds are skipped by the directional shadow culling queue (`docs/manual/shadow-support-matrix.md:23`).

## Bundle reachability (single `export { ... }` block of `build/cocosair.module.js`)

| Symbol                | Top-level ESM export    | Evidence                                                                               |
| --------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `DirectionalLight`    | resolves by symbol name | export block                                                                           |
| `SpotLight`           | resolves by symbol name | export block                                                                           |
| `PointLight`          | resolves by symbol name | export block                                                                           |
| `SphereLight`         | resolves by symbol name | export block                                                                           |
| `ShadowType`          | not top-level           | `src/cocos/render-scene/scene/shadows.ts:73`; `scene` namespace not a top-level export |
| `PCFType`             | not top-level           | `shadows.ts:97`                                                                        |
| `CSMLevel`            | not top-level           | `shadows.ts:132`                                                                       |
| `CSMOptimizationMode` | not top-level           | `shadows.ts:167`                                                                       |
| `Shadows`             | not top-level           | `shadows.ts:196`                                                                       |

Resolving by symbol name is a declaration/bundle lookup, not browser verification. The documented ShadowMap pixel evidence for the main light is scoped to `examples/campfire-night/` fixed scenes recorded under that revision's fingerprint (`docs/manual/shadow-support-matrix.md:28`, `:30`).
