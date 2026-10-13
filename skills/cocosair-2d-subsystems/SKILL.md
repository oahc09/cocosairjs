---
name: cocosair-2d-subsystems
description: "Drives the Cocos AIR 2D subsystem runtime modules in code-first scenes - the sp namespace and loadWasmModuleSpine plus the BLOCKED Spine backend and asset sourcing state, dragonBones ArmatureDisplay, DragonBonesAsset, DragonBonesAtlasAsset, CCFactory and AnimationCacheMode with realtime versus cached skinning on the vendored dragonbones-js, TiledMap, TiledMapAsset, TiledLayer, TiledObjectGroup and TiledTile built from runtime tmx and tsx strings, ParticleSystem2D and ParticleAsset fed by a generated plist through assetManager.parser.parsePlist, MotionStreak (exported as MotionStreak, there is no MotionStreak2D), and Billboard as a scene.Model whose size and rotation travel through one cc_size_rotation uniform. Use when a Spine skeleton draws nothing without any error, when a TiledMap cell edit or object query does not refresh or resolve, when plist-tuned particles compute but render no pixels, or when a billboard is invisible at its default size."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, 2d, subsystems"
  description_en: "Drives the Cocos AIR 2D subsystem runtime modules in code-first scenes - the sp namespace and loadWasmModuleSpine plus the BLOCKED Spine backend and asset sourcing state, dragonBones ArmatureDisplay, DragonBonesAsset, DragonBonesAtlasAsset, CCFactory and AnimationCacheMode with realtime versus cached skinning on the vendored dragonbones-js, TiledMap, TiledMapAsset, TiledLayer, TiledObjectGroup and TiledTile built from runtime tmx and tsx strings, ParticleSystem2D and ParticleAsset fed by a generated plist through assetManager.parser.parsePlist, MotionStreak (exported as MotionStreak, there is no MotionStreak2D), and Billboard as a scene.Model whose size and rotation travel through one cc_size_rotation uniform. Use when a Spine skeleton draws nothing without any error, when a TiledMap cell edit or object query does not refresh or resolve, when plist-tuned particles compute but render no pixels, or when a billboard is invisible at its default size."
  description_zh: "配置 Spine、DragonBones、TiledMap、二维粒子和 Billboard 的原生运行时契约。用于资源构造、空白画面或子系统能力边界问题。"
---

# Cocos AIR 2D subsystem contracts

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Build Spine, DragonBones, TiledMap, particle and billboard content from strings and bytes at runtime - there is no Creator importer, no uuid dependency graph and no prefab here, and one of these five subsystems cannot run at all in the default bundle.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

| Subsystem     | Runnable today | Import symbols                                                                                  | Constructed from                                   | Main trap                            |
| ------------- | -------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------ |
| Spine         | No, BLOCKED    | `sp`, `loadWasmModuleSpine`                                                                     | skeleton json or binary, atlas text, `Texture2D[]` | null runtime data, no error          |
| DragonBones   | Yes            | `dragonBones` namespace                                                                         | two assets from JSON strings plus one `Texture2D`  | asset setters want raw text          |
| TiledMap      | Yes            | `TiledMap`, `TiledMapAsset`, `TiledLayer`, `TiledObjectGroup`, `TiledTile`, `TiledUserNodeData` | tmx XML string, tsx text, sprite frames            | name lookup by parallel arrays       |
| Particle 2D   | Yes            | `ParticleSystem2D`, `ParticleAsset`                                                             | plist text parsed at run time                      | plist key names and blend enum slots |
| Motion streak | Yes            | `MotionStreak`, `MotionStreakAssemblerManager`                                                  | a plain `Texture2D`                                | no `MotionStreak2D` exists           |
| Billboard     | Yes            | `Billboard`                                                                                     | any `Texture2D` the app keeps alive                | `width` and `height` default to 0    |

## Contracts

Create the Canvas component before assigning its camera. Use runtime payloads, not Creator imports. Spine remains backend/asset blocked; particle plist fields and blend factors follow the native runtime contract.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Treating Spine as runnable out of the box
- [HIGH] Expecting a TiledMap cell edit to redraw itself
- [HIGH] Copying Creator plist blend values into a code-first emitter
- [MEDIUM] Importing names the bundle does not export
- [MEDIUM] Reusing Creator asset conventions for atlas and paths

## References

- [spine.md](references/spine.md) - the export surface, the BLOCKED chain end to end, the stubbed `wasmUtil` list, `SkeletonData` and `Skeleton` fields that are already written against, and what an unblocked build would need.
- [dragonbones.md](references/dragonbones.md) - the three-object construction order, armature key, cache modes and their downgrade rule, factory and slot internals, the vendored `dragonbones-js` boundary, and the measured API pitfalls.
- [tiledmap.md](references/tiledmap.md) - asset-array wiring, the parse and build path, culling versus render-data dirty state, the three runtime-edit cases, object layer coordinate rewriting and queries.
- [particle-2d.md](references/particle-2d.md) - the plist chain end to end, the key dictionary with its silent-zero cases, gfx blend slots, frame and texture ownership, determinism trio, and `MotionStreak` as its sibling.
- [billboard.md](references/billboard.md) - model and mesh construction, the `cc_size_rotation` uniform contract, technique clamping and material copy, texture ownership, and the CPU-rotation route from the older manual.

## Canonical docs

- `docs/notes/spine-asset-sourcing.md` - open for the four empty asset sources, the code-regression versus degradation split, the unblock steps and the owner closure that keeps the shim.
- `docs/notes/dragonbones-notes.md` - open for the measured pitfall list: texture wrapping, armature key, setter input types, `armature` being a method, atlas data shapes and uncovered surface.
- `docs/notes/tiled-map-notes.md` - open for parse semantics, the three runtime-edit paths, object `class` versus geometry type, and the recorded residuals.
- `docs/notes/particle-2d-notes.md` - open for the plist pipeline findings, blend enum handling, runtime frames, the determinism trio and the silent zero-particle case.
- `docs/manual/tiled-culling-and-dirty-state.md` and `docs/manual/tiled-object-queries.md` - open for the refresh contract and the object query contract as tested.
- `docs/manual/2d-assets-and-effects.md` - open for the subsystem table: export surface present, browser evidence, blockers.
- `docs/manual/billboard.md` - open for the native component recipe including the zero default size; `docs/manual/billboards.md` - open for the CPU rotation route and its white-plane pitfall.
- `docs/reference/web-features.md` - open for the source-present, bundled and deployed-assets distinction this skill relies on.
