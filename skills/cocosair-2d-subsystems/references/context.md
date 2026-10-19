# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - the router and the Code First discipline this skill applies.
- [cocosair-ui-2d](../../cocosair-ui-2d/SKILL.md) - `Canvas`, UI camera and layer setup, `UITransform` sizing and draw order that every subsystem here except `Billboard` sits on top of.
- [cocosair-assets](../../cocosair-assets/SKILL.md) - `assetManager.loadRemote` with an explicit extension, `Texture2D` and `SpriteFrame` ownership, and the `ImageAsset` to `Texture2D` wrap these asset constructors need.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - `active` toggling that forces a TiledLayer rebuild, deferred `destroy()`, and the node transforms `Billboard` and `ArmatureDisplay` read.
- [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) - `builtin-billboard` and `SpineMaterialType` sit in the same effect registry; technique and blend-state overrides happen on the material.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - TiledMap culling projects through the camera that resolves at run time, and `Billboard` needs a 3D camera visibility, not the UI one.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which symbol each entry file exports and how the `cocosair` importmap alias is wired.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Build Spine, DragonBones, TiledMap, particle and billboard content from strings and bytes at runtime - there is no Creator importer, no uuid dependency graph and no prefab here, and one of these five subsystems cannot run at all in the default bundle.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Treating Spine as runnable out of the box
- [HIGH] Expecting a TiledMap cell edit to redraw itself
- [HIGH] Copying Creator plist blend values into a code-first emitter
- [MEDIUM] Importing names the bundle does not export
- [MEDIUM] Reusing Creator asset conventions for atlas and paths

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Drives the Cocos AIR 2D subsystem runtime modules in code-first scenes - the sp namespace and loadWasmModuleSpine plus the BLOCKED Spine backend and asset sourcing state, dragonBones ArmatureDisplay, DragonBonesAsset, DragonBonesAtlasAsset, CCFactory and AnimationCacheMode with realtime versus cached skinning on the vendored dragonbones-js, TiledMap, TiledMapAsset, TiledLayer, TiledObjectGroup and TiledTile built from runtime tmx and tsx strings, ParticleSystem2D and ParticleAsset fed by a generated plist through assetManager.parser.parsePlist, MotionStreak (exported as MotionStreak, there is no MotionStreak2D), and Billboard as a scene.Model whose size and rotation travel through one cc_size_rotation uniform. Use when a Spine skeleton draws nothing without any error, when a TiledMap cell edit or object query does not refresh or resolve, when plist-tuned particles compute but render no pixels, or when a billboard is invisible at its default size.

### Keywords

Cocos AIR, cocosair.js, 2d, subsystems

## References

- [spine.md](spine.md) - the export surface, the BLOCKED chain end to end, the stubbed `wasmUtil` list, `SkeletonData` and `Skeleton` fields that are already written against, and what an unblocked build would need.
- [dragonbones.md](dragonbones.md) - the three-object construction order, armature key, cache modes and their downgrade rule, factory and slot internals, the vendored `dragonbones-js` boundary, and the measured API pitfalls.
- [tiledmap.md](tiledmap.md) - asset-array wiring, the parse and build path, culling versus render-data dirty state, the three runtime-edit cases, object layer coordinate rewriting and queries.
- [particle-2d.md](particle-2d.md) - the plist chain end to end, the key dictionary with its silent-zero cases, gfx blend slots, frame and texture ownership, determinism trio, and `MotionStreak` as its sibling.
- [billboard.md](billboard.md) - model and mesh construction, the `cc_size_rotation` uniform contract, technique clamping and material copy, texture ownership, and the CPU-rotation route from the older manual.

## Canonical docs

- `docs/notes/spine-asset-sourcing.md` - open for the four empty asset sources, the code-regression versus degradation split, the unblock steps and the owner closure that keeps the shim.
- `docs/notes/dragonbones-notes.md` - open for the measured pitfall list: texture wrapping, armature key, setter input types, `armature` being a method, atlas data shapes and uncovered surface.
- `docs/notes/tiled-map-notes.md` - open for parse semantics, the three runtime-edit paths, object `class` versus geometry type, and the recorded residuals.
- `docs/notes/particle-2d-notes.md` - open for the plist pipeline findings, blend enum handling, runtime frames, the determinism trio and the silent zero-particle case.
- `docs/manual/tiled-culling-and-dirty-state.md` and `docs/manual/tiled-object-queries.md` - open for the refresh contract and the object query contract as tested.
- `docs/manual/2d-assets-and-effects.md` - open for the subsystem table: export surface present, browser evidence, blockers.
- `docs/manual/billboard.md` - open for the native component recipe including the zero default size; `docs/manual/billboards.md` - open for the CPU rotation route and its white-plane pitfall.
- `docs/reference/web-features.md` - open for the source-present, bundled and deployed-assets distinction this skill relies on.
