Derived from the cocosair-skinning-morph skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

### [HIGH] Writing joint short names instead of full paths

Wrong:

```js
skeleton.joints = ['bone0', 'bone1', 'bone2'];    // node names, not root-relative paths
renderer.skeleton = skeleton;                     // AIR_E_SKINNING_JOINT_PATH on joint 1
```

Correct:

```js
const skeleton = buildSkeletonTree(armature, ['bone0', 'bone0/bone1', 'bone0/bone1/bone2']);
renderer.skeleton = skeleton;                     // paths resolve with getChildByPath from the root
```

`Skeleton.joints` is documented as paths relative to `skinningRoot` (`src/cocos/3d/assets/skeleton.ts:31-32`) and every consumer resolves them that way (`src/cocos/3d/models/skinning-validation.ts:13`); the rule comes from the recorded V0.1 regression in `docs/guides/skinned-model.md:9-12`.

### [HIGH] Editing skeleton nodes after opting into baked animation

Wrong:

```js
renderer.setUseBakedAnimation(true);
bone1.setRotationFromEuler(0, 0, 30);   // nothing moves: the pose comes from the clip texture
```

Correct:

```js
renderer.setUseBakedAnimation(false);   // realtime mode samples the live joint nodes each frame
bone1.setRotationFromEuler(0, 0, 30);   // keep baked mode only if a clip drives the pose instead
```

`setUseBakedAnimation` swaps the model type and rebuilds it (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:129-145`), a baked model binds its pose to the texture uploaded from an `AnimationClip` (`src/cocos/3d/models/baked-skinning-model.ts:166-180`), and only realtime mode multiplies live joint world matrices by the bindpose (`src/cocos/3d/models/skinning-model.ts:208-216`, manual note `docs/manual/skinning-code-first.md:35`, `:44`).

### [MEDIUM] Expecting restoreBindPose to reorder the joints array

Wrong:

```js
restoreBindPose(armature, skeleton);
skeleton.joints.sort((a, b) => a.split('/').length - b.split('/').length);  // bindposes now misaligned
```

Correct:

```js
restoreBindPose(armature, skeleton);   // the depth sort runs over a copy of the indices
const path0 = skeleton.joints[0];      // still paired with skeleton.bindposes[0]
```

The helper sorts a `joints.map(...)` copy so ancestors restore before descendants (`src/air/utils/restore-bind-pose.ts:33-36`) and writes nothing back to the asset (`:36-56`); `docs/guides/skinned-model.md:30` states the pairing and `test/smoke/smoke-06-skeleton-utils.test.ts:81-84` pins it.

### [MEDIUM] Treating a morph weight call as proof it applied

Wrong:

```js
renderer.setWeights([0.5], 0);   // sub-mesh 0 has two targets: silent no-op
renderer.enableMorph = false;
renderer.enableMorph = true;     // nothing rebuilt the morph instance
```

Correct:

```js
const targets = mesh.struct.morph.subMeshMorphs[0].targets.length;
const weights = new Array(targets).fill(0); weights[0] = 0.5;
renderer.setWeights(weights, 0);  // length must equal that sub-mesh's target count
renderer.mesh = mesh;             // reassign to rebuild the instance after toggling enableMorph
```

`setWeights` returns early on a bad index or a length mismatch (`src/cocos/3d/framework/mesh-renderer.ts:697-703`), values only upload through the instance built by `_watchMorphInMesh` (`:1233-1249`, `:1309-1310`), and that runs only from the `mesh` setter and `onLoad` (`:492`, `:577-583`), so `enableMorph` alone (`:526-532`) rebuilds nothing.
