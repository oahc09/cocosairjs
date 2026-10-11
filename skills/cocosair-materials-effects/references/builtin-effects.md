Derived from `src/air/builtin/builtin-effects.ts`, `src/air/builtin/builtin-glsl4.ts`, `src/air/builtin/builtin-material.ts`, `src/air/builtin/register.ts`, `src/air/bootstrap.ts`, `src/air/index.ts`, `src/cocos/asset/assets/effect-asset.ts`, `src/cocos/render-scene/core/pass.ts`, `src/cocos/render-scene/core/material-instance.ts`, `src/cocos/misc/renderer.ts`, `build/cocosair.module.js`, `build/cocosair.module.d.ts`, `docs/manual/materials.md`, `docs/manual/uniform-types.md` (as of 2026-10-09).

## What the AIR builtin fixture set actually contains

`src/air/builtin/builtin-effects.ts:3` declares `export const effects = [ ... ];` (array closes at `:1463`). It holds **21 top-level effect entries**, all written at 4-space indentation as `"name": ...`:

- **14** entries carry the `builtin-` prefix.
- **7** entries are `pipeline/*` and `util/*` internal effects. They are registered by the same loop and are queryable through `EffectAsset.get`, but they are not scene-material recipes; `src/cocos/asset/assets/effect-asset.ts:186-211` (`legacyBuiltinEffectNames`) lists them under their short forms (`bloom`, `skybox`, `deferred-lighting`, `post-process`, `profiler`, `splash-screen`, `planar-shadow`).

`src/air/builtin/builtin-glsl4.ts:2` declares `export const glsl4 = [ ... ];` with exactly 21 outer arrays, one per effect entry, indexed by position (`glsl4[effectIndex][shaderIndex]`, `src/air/builtin/register.ts:105`).

Counting note: `grep -c '"name":'` over-counts (nested `"name":` keys sit at 8 spaces: 31 of them) and a name pattern that excludes `/` under-counts (14). Enumerate with `grep -nE '^    "name": '` to get all 21.

## The 21 registered effect entries

| Effect name                  | Definition line        | Technique/pass shape                       |
| ---------------------------- | ---------------------- | ------------------------------------------ |
| `builtin-billboard`          | `builtin-effects.ts:5` | not enumerated here                        |
| `builtin-clear-stencil`      | `:50`                  | not enumerated here                        |
| `builtin-debug-renderer`     | `:78`                  | not enumerated here                        |
| `builtin-geometry-renderer`  | `:110`                 | not enumerated here                        |
| `builtin-graphics`           | `:263`                 | not enumerated here                        |
| `builtin-occlusion-query`    | `:293`                 | not enumerated here                        |
| `builtin-particle-gpu`       | `:321`                 | not enumerated here                        |
| `builtin-particle-trail`     | `:417`                 | not enumerated here                        |
| `builtin-particle`           | `:465`                 | not enumerated here                        |
| `builtin-spine`              | `:518`                 | not enumerated here                        |
| `builtin-sprite`             | `:557`                 | template consumed by `attachAirSpriteMask` |
| `builtin-standard`           | `:599`                 | 1 technique `opaque`, 3 passes (`:601`)    |
| `builtin-terrain`            | `:766`                 | not enumerated here                        |
| `builtin-unlit`              | `:859`                 | 1 technique `opaque`, 1 pass (`:861`)      |
| `pipeline/bloom`             | `:933`                 | internal pipeline effect                   |
| `pipeline/deferred-lighting` | `:1154`                | internal pipeline effect                   |
| `pipeline/planar-shadow`     | `:1221`                | internal pipeline effect                   |
| `pipeline/post-process`      | `:1276`                | internal pipeline effect                   |
| `pipeline/skybox`            | `:1334`                | internal pipeline effect                   |
| `util/profiler`              | `:1386`                | internal util effect                       |
| `util/splash-screen`         | `:1424`                | internal util effect                       |

`builtin-standard` passes in order: `opaque`, `forward-add` (`propertyIndex: 0`, `embeddedMacros: { CC_FORWARD_ADD: true }`, additive blend, `depthWrite: false`), `shadow-caster` (`propertyIndex: 0`, `rasterizerState.cullMode: 1`). All three are read from the single JSON line `builtin-effects.ts:601`.

## The 17 registered builtin materials

15 uuids come from `src/air/builtin/builtin-material.ts` (`initBuiltinMaterial`, `:6-157`); 2 more are created inside `registerBuiltinAirAssets` itself (`src/air/builtin/register.ts:123-131`). Total 17, not 15.

| Material uuid                       | Source line              | `effectName`             | `defines` passed to `initialize`                                                            |
| ----------------------------------- | ------------------------ | ------------------------ | ------------------------------------------------------------------------------------------- |
| `missing-effect-material`           | `builtin-material.ts:11` | `builtin-unlit`          | `{ USE_COLOR: true }`, `mainColor = color('#ffff00')`                                       |
| `missing-material`                  | `:22`                    | `builtin-unlit`          | `{ USE_COLOR: true }`, `mainColor = color('#ff00ff')`                                       |
| `default-clear-stencil`             | `:32`                    | `builtin-clear-stencil`  | `{ USE_TEXTURE: false }`                                                                    |
| `ui-base-material`                  | `:42`                    | `builtin-sprite`         | `{ USE_TEXTURE: false }`                                                                    |
| `ui-sprite-material`                | `:52`                    | `builtin-sprite`         | `{ USE_TEXTURE: true, CC_USE_EMBEDDED_ALPHA: false, IS_GRAY: false }`                       |
| `ui-alpha-test-material`            | `:62`                    | `builtin-sprite`         | `{ USE_TEXTURE: true, USE_ALPHA_TEST: true, CC_USE_EMBEDDED_ALPHA: false, IS_GRAY: false }` |
| `ui-sprite-gray-material`           | `:72`                    | `builtin-sprite`         | `{ USE_TEXTURE: true, CC_USE_EMBEDDED_ALPHA: false, IS_GRAY: true }`                        |
| `ui-sprite-alpha-sep-material`      | `:82`                    | `builtin-sprite`         | `{ USE_TEXTURE: true, CC_USE_EMBEDDED_ALPHA: true, IS_GRAY: false }`                        |
| `ui-sprite-gray-alpha-sep-material` | `:92`                    | `builtin-sprite`         | `{ USE_TEXTURE: true, CC_USE_EMBEDDED_ALPHA: true, IS_GRAY: true }`                         |
| `ui-graphics-material`              | `:102`                   | `builtin-graphics`       | none                                                                                        |
| `default-particle-material`         | `:109`                   | `builtin-particle`       | none                                                                                        |
| `default-particle-gpu-material`     | `:116`                   | `builtin-particle-gpu`   | none                                                                                        |
| `default-trail-material`            | `:123`                   | `builtin-particle-trail` | none                                                                                        |
| `default-billboard-material`        | `:130`                   | `builtin-billboard`      | none                                                                                        |
| `default-spine-material`            | `:137`                   | `builtin-spine`          | `{ USE_TEXTURE: true, CC_USE_EMBEDDED_ALPHA: false, IS_GRAY: false }`                       |
| `builtin-standard-material`         | `register.ts:124-125`    | `builtin-standard`       | none                                                                                        |
| `builtin-unlit-material`            | `register.ts:129-130`    | `builtin-unlit`          | `{ USE_TEXTURE: false }`                                                                    |

`missing-effect-material` and `missing-material` are diagnostics: a solid yellow or solid magenta object on screen means an effect or material reference did not resolve (`docs/manual/materials.md:29`).

## Registration path and timing

- `registerBuiltinAirAssets()` (`src/air/builtin/register.ts:100-132`) is the whole sequence: build the 21 `EffectAsset`s (`:102-117`), then `initBuiltinMaterial()` (`:120`), then `standardMtl`/`unlitMtl` (`:123-131`).
- Each effect is `Object.assign(new EffectAsset(), e)` (`:103`); its `glsl3` variant is DERIVED from the paired `glsl4` source at registration time (`:106-112`), never read from the fixture. `assignEffectBindings(effect)` runs before `effect.onLoaded()` (`:114-116`).
- `effect.hideInEditor = true` (`:115`) for every builtin effect.
- Materials are registered by uuid into `builtinResMgr` (`builtinResMgr.addAsset(uuid, mtl)`), imported from `src/cocos/asset/asset-manager` (`register.ts:7`, `builtin-material.ts:1`).
- Every material that needs a shader is pushed into `materialsToBeCompiled` and gets `pass.tryCompile()` on `Game.EVENT_GAME_INITED` (`builtin-material.ts:149-156`; `missing-effect-material` at `:18`, `ui-graphics-material` at `:105`, and so on for each row above).
- `registerBuiltinAirAssets` is wired to `Game.EVENT_POST_SUBSYSTEM_INIT` by `src/air/bootstrap.ts:145` (`game.once(...)`) and unwired at `:166` (`game.off(...)`). It is exported only from `src/air/builtin/register.ts` and is NOT re-exported by `src/air/index.ts:8-41`, so it is NOT a name in the main bundle export list.

## Reachability of the names in this file

Parsed from the single `export { ... }` block of `build/cocosair.module.js` (626 exported names):

| Symbol                     | In the main bundle export list |
| -------------------------- | ------------------------------ |
| `Material`                 | yes                            |
| `EffectAsset`              | yes                            |
| `builtinResMgr`            | yes                            |
| `createAirUnlitFogEffect`  | yes                            |
| `inspectAirMaterial`       | yes                            |
| `attachAirSpriteMask`      | yes                            |
| `createAirRenderTarget`    | yes                            |
| `registerBuiltinAirAssets` | no - source import only        |
| `Pass`                     | no                             |
| `PassInstance`             | no                             |
| `MaterialInstance`         | no                             |

`MaterialInstance` and `PassInstance` are still reachable as runtime objects, never as imported constructors: `renderer.material` / `renderer.getMaterialInstance(i)` returns a `MaterialInstance` whose `.passes` are `PassInstance` (`src/cocos/misc/renderer.ts:100-102`, `:196-207`; `src/cocos/render-scene/core/material-instance.ts:104-112`). `Pass` is reached from `material.passes[i]`. Type positions exist in `build/cocosair.module.d.ts` (`renderer.MaterialInstance`, currently :11362).

## Do-not-mutate rule

`builtin-standard-material` and `builtin-unlit-material` are one shared object each. Writing them through `builtinResMgr.get('builtin-standard-material').setProperty(...)` changes every consumer; the manual recipe is `new Material()` + `initialize({ effectName })` per object instead (`docs/manual/materials.md:42-45`, `docs/manual/uniform-types.md:65`).
