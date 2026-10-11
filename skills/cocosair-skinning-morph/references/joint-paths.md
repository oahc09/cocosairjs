Derived from `src/cocos/3d/assets/skeleton.ts`, `src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts`, `src/cocos/3d/skinned-mesh-renderer/deprecated.ts`, `src/cocos/3d/models/skinning-validation.ts`, `src/cocos/3d/models/skinning-model.ts`, `src/cocos/3d/models/baked-skinning-model.ts`, `src/cocos/3d/assets/mesh.ts`, `src/cocos/rendering/define.ts`, `src/air/assets/gltf/nodes.ts`, `src/air/assets/gltf/asset.ts`, `docs/guides/skinned-model.md`, `docs/manual/skinning-code-first.md`, `examples/skinned-animation/main.js`, `build/cocosair.module.js` (as of 2026-10-10).

## What a joint is

`Skeleton` is an `Asset` holding two parallel arrays plus cached derived data (`src/cocos/3d/assets/skeleton.ts:35`):

| Member                     | Line       | Contract                                                                      |
| -------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `joints: string[]`         | `:55-61`   | paths relative to `SkinnedMeshRenderer.skinningRoot`, doc at `:31-32`         |
| `bindposes: Mat4[]`        | `:67-73`   | one matrix per joint, same index, length always equals `joints`               |
| `inverseBindposes: Mat4[]` | `:79-89`   | lazily built inverse cache; it is not invalidated by later `bindposes` writes |
| `hash: number`             | `:95-110`  | murmur hash over the `toPrecision(2)` bindpose floats, cached once computed   |
| `validate(): boolean`      | `:122-124` | true only when both arrays are non-empty                                      |
| `destroy()`                | `:112-115` | releases the skeleton from `Root.dataPoolManager` before the asset destroy    |

The path form is not cosmetic: every consumer looks the joint up with `root.getChildByPath(path)`, where `root` is the skinning root, in the pre-bind validation (`src/cocos/3d/models/skinning-validation.ts:13`), in the realtime joint collection (`src/cocos/3d/models/skinning-model.ts:161`) and in the bind-pose helper (`src/air/utils/restore-bind-pose.ts:39`). So a bone named `bone1` that sits under `bone0` must be written `bone0/bone1`, never `bone1`; the rule was recorded from the V0.1 regression in `docs/guides/skinned-model.md:9-12` and again in the helper's own note at `src/air/utils/skeleton-tree.ts:6-9`.

Duplicate paths are allowed by the runtime arrays but rejected for glTF skins, where joint uniqueness is a parse check (`src/air/assets/gltf/nodes.ts:90`).

## Who resolves the paths

`SkinnedMeshRenderer` holds the two references that define resolution: `skeleton` (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:62-71`) and `skinningRoot` (`:77-87`). Each setter funnels into `_refreshBinding`, which runs `_update` (that is, `model.bindSkeleton(skeleton, skinningRoot, mesh)`, `:205-210`) _before_ checking completeness and before rebuilding submodels, so a rejected bind leaves the previous model intact (`:165-178`, and the same ordering note in `docs/manual/skinning-code-first.md:23`). `_updateModelParams` refuses to build skinning descriptors while any of the three inputs is missing, disabling the model instead (`:154-163`); that is the mechanism behind the documented "assign while disabled, then enable" sequence (`docs/manual/skinning-code-first.md:13-21`).

The root also decides the pose transport. `_tryBindAnimation` walks `this.node` upward, and only when `skinningRoot` is that ancestor does it look for a `cc.SkeletalAnimation` on the root: an enabled animation keeps the association, otherwise the renderer is forced into realtime mode with `setUseBakedAnimation(false)` (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:180-203`). The browser-proven code-first rig relies on exactly this: the armature carries no animation component (`examples/skinned-animation/main.js:210-213`).

## AIR_E_SKINNING_JOINT_PATH

`validateSkinningBinding` (`src/cocos/3d/models/skinning-validation.ts:8-22`) is the only throw site of this code. Its shape matters:

- It iterates the bone-space bounds returned by `mesh.getBoneSpaceBounds(skeleton)` and `continue`s on any `null` entry (`:10-11`), so only joints that actually carry weight are checked. A joint in `joints` with no weighted vertex may point at a missing node and stay silent, which `docs/manual/skinning-code-first.md:9` records as intended behavior.
- `getBoneSpaceBounds` sets `bounds[i] = null` for every joint it never marked valid (`src/cocos/3d/assets/mesh.ts:754-756`), and marks a joint valid only when a non-zero weight references it (`:728`, `:747`).
- The failing condition is `typeof path !== 'string' || !root.getChildByPath(path)` (`src/cocos/3d/models/skinning-validation.ts:13`), so a non-string entry and a stale path throw identically.
- The message names the mesh, the skeleton, the root, the joint index and the path, and the thrown object carries `code`, `resource`, `node`, `joint`, `path` on top of the message (`:14-18`); `error()` is also called, so the console sees it before the throw (`:17`).

Because binding validation runs before the old model binding is replaced (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:166-167`), catching this error during a live rebind leaves the previous pose rendering; the manual also warns that `onLoad` swallows and logs the exception while direct setter calls throw, so a `try/catch` around `app.run` is not a success test (`docs/manual/skinning-code-first.md:23`).

The other skinning codes come from the mesh-side check `getBoneSpaceBounds` (`src/cocos/3d/assets/mesh.ts:698-702` throws a tagged `RangeError`): `AIR_E_SKINNING_ATTRIBUTE_LAYOUT` for mismatched 3/4-component attribute counts (`:713-717`), `AIR_E_SKINNING_WEIGHT` for a non-finite or negative weight (`:724-727`), `AIR_E_SKINNING_JOINT_INDEX` for a joint outside `[0, bindposes.length)` (`:730-733`), `AIR_E_SKINNING_BINDPOSE` for a non-finite weighted bindpose (`:737-742`) and `AIR_E_SKINNING_BOUNDS` for non-finite transformed positions (`:734-746`). The taxonomy is summarised in `docs/manual/skinning-code-first.md:23`.

## Palette, slots and AIR_E_SKINNING_CAPACITY

`SkinningModel.bindSkeleton` chooses the transport capacity up front: `UBOSkinning.JOINT_UNIFORM_CAPACITY` when the skeleton fits, otherwise `RealTimeJointTexture.WIDTH` of 256 (`src/cocos/3d/models/skinning-model.ts:143-145`, `:84`), and switches itself to realtime texture mode when `joints.length` exceeds the uniform capacity (`:153`). `validateSkinningCapacity` then checks the slots the uploader will actually write, honouring `mesh.struct.jointMaps` per palette when present (`src/cocos/3d/models/skinning-validation.ts:27-31`, `jointMaps` declared at `src/cocos/3d/assets/mesh.ts:212`), and throws `AIR_E_SKINNING_CAPACITY` with `joint`, `palette`, `slot` and `capacity` fields (`src/cocos/3d/models/skinning-validation.ts:32-39`). Growing the skeleton therefore cannot fix it; the error text recommends splitting into local joint palettes, and `docs/manual/skinning-code-first.md:54` confirms that a 300-joint skeleton mapping joint 299 into slot 0 is legal.

The uniform capacity is device-derived: `UBOSkinning.initLayout(maxJoints)` recomputes it from `maxVertexUniformVectors`, clamped at 256 (`src/cocos/rendering/custom/web-program-library.ts:915-917`, assignment inside `initLayout` at `src/cocos/rendering/define.ts:676-680`, getter at `:653`, module-level fallback constant 30 at `:600`), so a binding that succeeds on one browser can differ on another; `tools/verify/air-skinning-capacity-browser.cjs` records the observed per-device limit and the fallback texture format, and `docs/manual/skinning-code-first.md:56` reports 256 uniform slots on the three tested browsers.

## What glTF hands you instead

`createSkeletons` maps each glTF skin joint index onto the document node path built by the layout pass (`src/air/assets/gltf/nodes.ts:97`), where paths are parent-chain joins over sanitised node names of the form `name__<index>` (`:13`, `:18-26`). Node-name sanitisation replaces `/` and `\` with `_` precisely so a developer name cannot forge a path separator (`:13`). Bindposes come from `inverseBindMatrices` as column-major `MAT4` accessors, and a skin without that accessor gets identity matrices (`:99`, `:103`). The glTF parser also caps skin size against `max(capacity, 256)` and requires a sampleable joint texture above the uniform capacity (`:92-94`).

`GLTFAsset.instantiate` then builds each skinned node as `SkinnedMeshRenderer` with `setUseBakedAnimation(false)`, `skinningRoot = root` and the shared skeleton, after a range check that every `JOINTS` value is below `skeleton.joints.length` (`src/air/assets/gltf/asset.ts:135-141`). Consequence: for loaded models the joint paths and array order are owned by the parser, so never rewrite `skeleton.joints` to "look nicer"; the mesh weight indices refer to array positions, not to names.

## Aliases you may see in older code

`SkinningModelComponent` is not a separate class: `src/cocos/3d/skinned-mesh-renderer/deprecated.ts:32-34` re-exports `SkinnedMeshRenderer` under that deprecated name, registers it on `cclegacy` and sets the `cc.SkinningModelComponent` class alias, with the same treatment for `SkinningModelUnit` (`:39-41`) and `BatchedSkinningModelComponent` over `SkinnedMeshBatchRenderer` (`:46-48`). The runtime bundle's single export block carries all of these aliases plus `SkinnedMeshRenderer`, `SkinnedMeshUnit`, `SkinnedMeshBatchRenderer`, `Skeleton`, `buildSkeletonTree` and `restoreBindPose` (`build/cocosair.module.js`, currently :161574). Prefer the current names in new code; the aliases exist so serialized class names still resolve.
