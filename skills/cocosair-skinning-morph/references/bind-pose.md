Derived from `src/air/utils/skeleton-tree.ts`, `src/air/utils/restore-bind-pose.ts`, `src/air/utils/index.ts`, `src/cocos/3d/assets/skeleton.ts`, `src/cocos/3d/assets/mesh.ts`, `src/cocos/3d/models/skinning-model.ts`, `src/cocos/scene-graph/node.ts`, `src/cocos/core/math/mat4.ts`, `docs/guides/skinned-model.md`, `docs/manual/skinning-code-first.md`, `test/smoke/smoke-06-skeleton-utils.test.ts`, `examples/skinned-animation/main.js` (as of 2026-10-10).

## The convention

`bindposes[i]` is the inverse of joint `i`'s world matrix at capture time. That single sentence is the whole contract, recorded in `docs/guides/skinned-model.md:11` and implemented literally in `src/air/utils/skeleton-tree.ts:35`:

```ts
bindposes.push(bone.worldMatrix.clone().invert());
```

Two consequences follow. First, the pose the runtime treats as "rest" is whatever the bones' world transforms were when the asset was built, so `docs/guides/skinned-model.md:22` states the rule: build first, move later, and never move bones before capturing. Second, realtime skinning recovers the deformed pose by multiplying the live joint world matrix by that stored inverse (`src/cocos/3d/models/skinning-model.ts:212`, inside the per-frame `updateUBOs` loop at `:208-216`), so at the rest pose the product is the identity and the vertex keeps its authored position.

Reading a bone's `worldMatrix` is safe on a detached hierarchy: the getter runs `updateWorldTransform()` before returning `this._mat` (`src/cocos/scene-graph/node.ts:1910-1913`), which is why `examples/skinned-animation/main.js:195` can build the skeleton before the armature is added to the scene at `:270`.

## `buildSkeletonTree(root, jointPaths)`

Signature and behavior (`src/air/utils/skeleton-tree.ts:26-39`, re-exported at `src/air/utils/index.ts:13` through `src/air/index.ts:28`):

- Returns a fresh `Skeleton` asset; nothing is registered with the asset manager, so you own its lifetime and must `destroy()` it.
- `skeleton.joints = jointPaths.slice()` (`:28`), so later edits to your array cannot mutate the asset, and the array order becomes the joint index space that mesh `a_joints` values refer to.
- One `bindposes` entry per path, in the same order (`:29-37`), produced by `root.getChildByPath(path)` (`:31`).
- A path that does not resolve throws `Error` with the offending path and the root's name (`:32-34`); this is a plain `Error`, not the tagged `AIR_E_SKINNING_JOINT_PATH` object that the model binder throws (`src/cocos/3d/models/skinning-validation.ts:14-18`), so catch shapes differ between build time and bind time.
- `root` here is the node you will later assign to `SkinnedMeshRenderer.skinningRoot`; `docs/guides/skinned-model.md:29` requires the same root for `restoreBindPose`, and the same-root rule is what makes the paths resolve at all.

The helper is a convenience over the native asset, not a replacement: `Skeleton` still only stores two parallel arrays plus cached derived data (`src/cocos/3d/assets/skeleton.ts:55-73`), and `validate()` reports true as soon as both arrays are non-empty (`:122-124`) without checking that any path resolves.

## `restoreBindPose(root, skeleton)`

`src/air/utils/restore-bind-pose.ts:30-57` walks the joints and writes node transforms:

| Step                   | Line     | Detail                                                                                         |
| ---------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| depth ordering         | `:33-36` | `joints.map((path, index) => ...)` then `.sort()` over the copy, so ancestors restore first    |
| skip missing           | `:37-40` | no bindpose or no node for a path is skipped silently, so the helper works on partial rigs     |
| world back-computation | `:43`    | `Mat4.invert(m4_world, bindpose)`                                                              |
| local against parent   | `:45-51` | `inverse(parent.worldMatrix) * world`, or the world matrix itself when the joint has no parent |
| apply                  | `:52-55` | `Mat4.toSRT` then `setPosition`, `setRotation`, `setScale`                                     |

Ordering matters twice. The sort exists because a child's local matrix is computed against its parent's _current_ world matrix (`:46-48`); restoring a child before its parent would compute against the parent's live, deformed transform. And because the sort runs over a mapped copy (`:34-35`), `skeleton.joints` and `skeleton.bindposes` keep their original index pairing (`docs/guides/skinned-model.md:30`), which the round-trip test pins in `test/smoke/smoke-06-skeleton-utils.test.ts:81-84`.

The helper restores translation, rotation and scale only. `Mat4.toSRT` decomposes into those three factors (`src/cocos/core/math/mat4.ts:878`), so a bindpose carrying shear cannot be restored exactly, and a mesh whose rest pose depends on shear should not be authored through this path.

Root space versus node space: the skinning transform is the skinning root, joints contribute matrices relative to it, and the root's world matrix is applied afterwards (`docs/manual/skinning-code-first.md:27`, implementation at `src/cocos/3d/models/skinning-model.ts:154` and the bounds transform at `:195-199`). Scaling the renderer's own node therefore does not override root space; scaling the root or a shared ancestor does.

## Caches that can go stale

- `Skeleton.inverseBindposes` builds its array once and reuses it (`src/cocos/3d/assets/skeleton.ts:79-89`); mutating `bindposes` afterwards leaves that cache describing the old matrices.
- `Skeleton.hash` is cached the first time it is read (`:95-110`), so an in-place bindpose edit is not visible through the hash. `docs/manual/skinning-code-first.md:62` states this is why the mesh cannot key its bone-space bounds on the hash.
- `Mesh.getBoneSpaceBounds` therefore keys a `WeakMap` on the `Skeleton` object and re-verifies a matrix signature built from all bindposes (`src/cocos/3d/assets/mesh.ts:390-392`, `:692-694`), recomputing whenever a matrix changed; only a complete successful pass is cached (`:758-759`), so a failed query never stores partial bounds. Weak keys mean a discarded skeleton cannot be kept alive by the cache (`:390-391`).
- `reset` clears that cache (`src/cocos/3d/assets/mesh.ts:676-682`), `updateSubMesh` clears it (`:628`) and `merge` reaches it through `reset` (`:1053`), matching the invalidation entry points listed in `docs/manual/skinning-code-first.md:62`. Editing `mesh.data` bytes directly is not one of those entry points.

Invalidating bounds does not rebind anything. `docs/manual/skinning-code-first.md:64` is explicit: after mutating assets, build a new `Skeleton` and assign it through the native binding path, or rebuild the model through the mode switch (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:129-145`), and return the old mesh, skeleton and material references in pairs. A live `SkinnedMeshRenderer` holding a mutated skeleton keeps the old joint set until `bindSkeleton` runs again (`src/cocos/3d/models/skinning-model.ts:140-170`).

## Rebuild recipe

```ts
// rest pose captured while the rig is still straight
const skeleton = buildSkeletonTree(armature, ['bone0', 'bone0/bone1', 'bone0/bone1/bone2']);
renderer.skeleton = skeleton;              // setter revalidates and rebinds
renderer.skinningRoot = armature;

// later, back to rest before recapturing with a different rig layout
restoreBindPose(armature, skeleton);
const next = buildSkeletonTree(armature, ['bone0', 'bone0/bone1']);   // new asset, new indices
renderer.skeleton = next;                  // rebind against the shorter joint list
skeleton.destroy();                        // only after nothing else references it
```

Reweighting a mesh for a new joint order is your job: mesh `a_joints` values are indices into `skeleton.joints`, checked against `bindposes.length` at bounds time (`src/cocos/3d/assets/mesh.ts:730-733`), and the glTF path pre-checks the same range before it binds a loaded skin (`src/air/assets/gltf/asset.ts:135-138`).

## Coverage

`test/smoke/smoke-06-skeleton-utils.test.ts` asserts the asset shape and finiteness after a build (`:37-42`), the missing-path throw (`:46-48`), and a restore round trip that reproduces parent scale and child offsets (`:68-71`). The browser-side sequence is `examples/skinned-animation/main.js:195` for the build, `:210-213` for the renderer binding and `:273` for the restore, recorded `result: PASS` under candidate fingerprint `2f089f6ce25eaccd` in `docs/evidence/examples-verified.json` (`measuredAt` 2026-10-04T05:52:32.537Z). Neither test nor example proves a bindpose transfer from an external format: `docs/guides/skinned-model.md:31` limits the helper to the capture-time convention it implements.
