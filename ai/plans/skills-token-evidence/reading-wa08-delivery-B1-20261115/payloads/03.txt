Derived from `docs/manual/lighting-units.md`, `src/air/rendering/engine-contracts.ts`, `src/cocos/3d/lights/light-component.ts`, `src/cocos/3d/lights/directional-light-component.ts`, `src/cocos/3d/lights/point-light-component.ts`, `src/cocos/3d/lights/sphere-light-component.ts`, `src/cocos/3d/lights/spot-light-component.ts`, `src/cocos/render-scene/scene/light.ts`, `src/cocos/render-scene/scene/directional-light.ts`, `src/cocos/render-scene/scene/point-light.ts`, `src/cocos/render-scene/scene/camera.ts`, `src/cocos/render-scene/scene/ambient.ts`, `src/cocos/rendering/render-additive-light-queue.ts`, `src/cocos/render-scene/core/render-scene.ts`, `build/cocosair.module.js` (as of 2026-10-09).

## Light component surface AIR exposes

Component classes (public, scene-graph `Component` subclasses):

| Component          | Class name            | `_type` set in `_createLight`     | Multiple per scene allowed |
| ------------------ | --------------------- | --------------------------------- | -------------------------- |
| `Light` (base)     | `cc.Light`            | `scene.LightType.UNKNOWN` default | n/a (base)                 |
| `DirectionalLight` | `cc.DirectionalLight` | `scene.LightType.DIRECTIONAL`     | one main light effective   |
| `SphereLight`      | `cc.SphereLight`      | `scene.LightType.SPHERE`          | yes                        |
| `PointLight`       | `cc.PointLight`       | `scene.LightType.POINT`           | yes                        |
| `SpotLight`        | `cc.SpotLight`        | `scene.LightType.SPOT`            | yes                        |

`src/cocos/3d/lights/directional-light-component.ts:536` (`_type = DIRECTIONAL`), `src/cocos/3d/lights/sphere-light-component.ts:172`, `src/cocos/3d/lights/point-light-component.ts:151`, `src/cocos/3d/lights/spot-light-component.ts:300`.

`LightType` enum ordinals (`src/cocos/render-scene/scene/light.ts:63`): `DIRECTIONAL=0`, `SPHERE=1`, `SPOT=2`, `POINT=3`, `RANGED_DIRECTIONAL=4`, `UNKNOWN=5`.

`Light` base defaults (`src/cocos/3d/lights/light-component.ts`):

| Member                 | Default               | Line   | Note                                   |
| ---------------------- | --------------------- | ------ | -------------------------------------- |
| `_color`               | `Color.WHITE.clone()` | `:121` | channels are 0..255                    |
| `_useColorTemperature` | `false`               | `:123` |                                        |
| `_colorTemperature`    | `6550`                | `:125` | `@range([1000, 15000, 100])` at `:178` |
| `_visibility`          | `CAMERA_DEFAULT_MASK` | `:129` |                                        |

`Light.color` setter requires a `Color` instance; non-`Color` throws `AIR_E_LIGHT_TYPE` ("Color (component RGB channels use 0..255)") and divides channels by 255 into the render-scene `Vec3` (`src/cocos/3d/lights/light-component.ts:143`, `:149`). `PhotometricTerm` enum (`:42`): `LUMINOUS_FLUX=0`, `LUMINANCE=1`.

## DirectionalLight illuminance

| Field                                  | Value                                                  | Line                                                    |
| -------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- |
| `_illuminanceHDR` default              | `65000`                                                | `src/cocos/3d/lights/directional-light-component.ts:48` |
| `_illuminanceLDR` default              | `65000 * Camera.standardExposureValue`                 | `:51`                                                   |
| `illuminance` `@range`                 | `[0, Number.POSITIVE_INFINITY, 10]`, type `CCInteger`  | `:100`                                                  |
| `illuminance` getter source            | HDR slot when `pipelineSceneData.isHDR`, else LDR slot | `:103`                                                  |
| `Ambient.SUN_ILLUM`                    | `65000.0`                                              | `src/cocos/render-scene/scene/ambient.ts:40`            |
| render-scene `_illuminanceHDR` default | `Ambient.SUN_ILLUM`                                    | `src/cocos/render-scene/scene/directional-light.ts:41`  |
| render-scene `_illuminanceLDR` default | `1.0`                                                  | `src/cocos/render-scene/scene/directional-light.ts:42`  |

`illuminance` is documented in Lux (lx) (`src/cocos/render-scene/scene/directional-light.ts:80`). No `luminousPowerToIlluminance`-style helper exists in the sources read; the only unit helper is `nt2lm`.

## Local light (Point / Sphere / Spot) luminous units

`nt2lm(size) = 4 * PI * PI * size * size` (`src/cocos/render-scene/scene/light.ts:72`).

| Field                             | Default / range                                                        | Line                                                                                         |
| --------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Point/Sphere/Spot `_luminanceHDR` | `1700 / nt2lm(0.15)`                                                   | `point-light-component.ts:44`, `sphere-light-component.ts:47`, `spot-light-component.ts:48`  |
| `_luminanceLDR`                   | `1700 / nt2lm(0.15) * standardExposureValue * standardLightMeterScale` | `point-light-component.ts:46`, `sphere-light-component.ts:49`, `spot-light-component.ts:51`  |
| `_term`                           | `PhotometricTerm.LUMINOUS_FLUX`                                        | `point-light-component.ts:48`, `sphere-light-component.ts:51`, `spot-light-component.ts:54`  |
| `_range`                          | `1`                                                                    | `point-light-component.ts:50`, `sphere-light-component.ts:53`, `spot-light-component.ts:57`  |
| `luminousFlux` `@range`           | `[0, +Infinity, 100]`, `CCInteger`                                     | `point-light-component.ts:59`, `sphere-light-component.ts:62`, `spot-light-component.ts:81`  |
| `luminance` `@range`              | `[0, +Infinity, 10]`, `CCInteger`                                      | `point-light-component.ts:90`, `sphere-light-component.ts:92`, `spot-light-component.ts:110` |
| Sphere/Spot `_size`               | `0.15`, `@range([0.0, 10.0, 0.001])`                                   | `sphere-light-component.ts:44`, `:137`, `spot-light-component.ts:44`, `:155`                 |
| Spot `_spotAngle`                 | `60`, `@range([2, 180, 1])`                                            | `spot-light-component.ts:60`, `:189`                                                         |
| Spot `_angleAttenuationStrength`  | `0`, `@range([0, 1, 0.001])`                                           | `spot-light-component.ts:63`, `:206`                                                         |

Point light uses `nt2lm(1.0)` (size = 1) in its `luminousFlux` getter/setter (`src/cocos/3d/lights/point-light-component.ts:64`, `:73`); Sphere and Spot use `nt2lm(this._size)` (`sphere-light-component.ts:67`, `spot-light-component.ts:85`).

## Conversion written into the UBO (manual + queue source)

Constants:

| Symbol                                                                                       | Value           | Line                                                     |
| -------------------------------------------------------------------------------------------- | --------------- | -------------------------------------------------------- |
| `Camera.standardExposureValue` (the render-scene `Camera` class, not the exported component) | `1.0 / 38400.0` | `src/cocos/render-scene/scene/camera.ts:413`             |
| `Camera.standardLightMeterScale` (same render-scene class)                                   | `10000.0`       | `src/cocos/render-scene/scene/camera.ts:421`             |
| `RenderAdditiveLightQueue._lightMeterScale`                                                  | `10000.0`       | `src/cocos/rendering/render-additive-light-queue.ts:130` |

HDR vs LDR write rule (English paraphrase of `docs/manual/lighting-units.md:7`-`:12`):

| Input                          | HDR writes                                             | LDR writes                                |
| ------------------------------ | ------------------------------------------------------ | ----------------------------------------- |
| `DirectionalLight.illuminance` | illuminance x camera.exposure                          | illuminanceLDR, no exposure multiply      |
| `Ambient.skyIllum`             | skyIllum x camera.exposure                             | skyIllumLDR, no exposure multiply         |
| Point/Sphere/Spot `luminance`  | luminance x camera.exposure x standardLightMeterScale  | luminanceLDR                              |
| HDR local `luminousFlux`       | setter divides by `nt2lm(size)` then applies row above | LDR setter stores the LDR scalar directly |

Queue lines: Sphere `luminance * exposure * _lightMeterScale` (`render-additive-light-queue.ts:524`), Spot `:554`, Point `:588`; RangedDirectional `illuminance * exposure` (`:624`). The same 10000 meter scale applies to Point/Sphere/Spot, not Spot only.

## Legacy forward mainLight limitation and `inspectAirDirectionalLights`

The legacy forward camera UBO shades only `renderScene.mainLight` for ordinary directional lights (`src/cocos/render-scene/core/render-scene.ts:100` comment, `:306` `setMainLight`). On adding a second directional light, `addDirectionalLight` emits one warn (`src/cocos/render-scene/core/render-scene.ts:338`):

```
[AIR_W_DIRECTIONAL_LIGHT_LIMIT] ordinary directionals share one legacy mainLight; extra registered lights do not add illumination. Inspect scene.mainLight.
```

`inspectAirDirectionalLights(scene)` (`src/air/rendering/engine-contracts.ts:104`) return shape:

| Field                         | Value when native render scene missing | Value when available                                                                                                 |
| ----------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `status`                      | `'unavailable'`                        | `'available'`                                                                                                        |
| `reason`                      | `'scene has no native render scene'`   | absent                                                                                                               |
| `scope`                       | absent                                 | `'legacy-forward-main-directional'`                                                                                  |
| `ordinaryDirectionalCapacity` | absent                                 | `1`                                                                                                                  |
| `selection`                   | absent                                 | `'native-mainLight'`                                                                                                 |
| `lights`                      | `[]`                                   | one entry per `directionalLights`, each `{ node: uuid-or-null, name: name-or-null, effective: light === mainLight }` |
| `mainLight`                   | absent                                 | `mainLight.node.uuid` or `null`                                                                                      |
| `note`                        | absent                                 | `'Custom pipeline/ranged directionals are outside this ordinary mainLight contract.'`                                |

No threshold constant is applied inside the inspector; it reports identity only (`effective` is boolean `light === native.mainLight`). Punctual (Point/Sphere/Spot) lights are not capped in the source read: the queue buffer grows to `nextPow2(validPunctualLights.length)` (`render-additive-light-queue.ts:489`, `:492`).

## Bundle reachability (single `export { ... }` block of `build/cocosair.module.js`, 626 names)

| Symbol                        | Top-level ESM export    | Evidence                                                                                      |
| ----------------------------- | ----------------------- | --------------------------------------------------------------------------------------------- |
| `Light`                       | resolves by symbol name | export block                                                                                  |
| `DirectionalLight`            | resolves by symbol name | export block                                                                                  |
| `SphereLight`                 | resolves by symbol name | export block                                                                                  |
| `PointLight`                  | resolves by symbol name | export block                                                                                  |
| `SpotLight`                   | resolves by symbol name | export block                                                                                  |
| `RangedDirectionalLight`      | resolves by symbol name | export block                                                                                  |
| `inspectAirDirectionalLights` | resolves by symbol name | export block                                                                                  |
| `LightType`                   | not top-level           | lives in `src/cocos/render-scene/scene/light.ts:63`, `scene` namespace not a top-level export |
| `nt2lm`                       | not top-level           | `src/cocos/render-scene/scene/light.ts:72`                                                    |

"resolves by symbol name" means it appears in the generated bundle/declarations; it is not browser-verified.
