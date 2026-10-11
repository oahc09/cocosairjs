---
name: cocosair-skinning-morph
description: Drives Cocos AIR skeletal skinning and morph targets from code - SkinnedMeshRenderer skeleton and skinningRoot binding, Skeleton.joints as full paths relative to the skinning root with AIR_E_SKINNING_JOINT_PATH, buildSkeletonTree bindposes as inverse world matrices, restoreBindPose ancestor-first ordering, realtime versus baked pose through setUseBakedAnimation, joint palette capacity and AIR_E_SKINNING_CAPACITY, Mesh.morphRendering plus getBoneSpaceBounds, and MeshRenderer setWeight, setWeights and enableMorph. Use when a skinned mesh stays in rest pose or draws nothing, when a joint path throws AIR_E_SKINNING_JOINT_PATH, when moving bone nodes after setUseBakedAnimation(true) has no effect, when a morph weight setter appears to be ignored, or when binding a hand-built Mesh to a Skeleton without the Cocos Creator asset pipeline.
---

# Cocos AIR skinning and morph contracts

Bind a code-built bone hierarchy to a skinned mesh, keep the bind pose restorable, choose realtime versus baked pose honestly, and drive morph weights through the native renderer - no Prefab, no Editor, no parallel skeleton abstraction.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, Component, Material, Color, Vec3,
         SkinnedMeshRenderer, Mesh, gfx, buildSkeletonTree, restoreBindPose, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const scene = new Scene('skinning');
const camNode = new Node('Main Camera'); scene.addChild(camNode); camNode.setPosition(new Vec3(0, 2.4, 6.5));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45; camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(28, 36, 52, 255);
const lightNode = new Node('Main Light');
scene.addChild(lightNode); lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight).illuminance = 55000;

// 1) bones: joint paths resolve with getChildByPath from the skinning root, so write FULL paths
const armature = new Node('Armature');
const bone0 = new Node('bone0'); armature.addChild(bone0);
const bone1 = new Node('bone1'); bone0.addChild(bone1); bone1.setPosition(0, 1.5, 0);
const bone2 = new Node('bone2'); bone1.addChild(bone2); bone2.setPosition(0, 1.5, 0);
const jointPaths = ['bone0', 'bone0/bone1', 'bone0/bone1/bone2'];

// 2) rigidly weighted ribbon: a_position + a_normal (RGB32F), a_joints + a_weights (RGBA32F), stride 56
const ROWS = 9, COLS = 4, SEG = 0.5, X = [-0.25, 0.25, 0.25, -0.25], Z = [-0.25, -0.25, 0.25, 0.25];
const vert = new Float32Array(ROWS * COLS * 14), tri = [];
for (let r = 0; r < ROWS; r++) {
    const y = r * SEG, joint = y < 1.5 ? 0 : (y < 3.0 ? 1 : 2);   // joint INDEX into jointPaths, not a name
    for (let c = 0; c < COLS; c++) {
        const o = (r * COLS + c) * 14;
        vert[o] = X[c]; vert[o + 1] = y; vert[o + 2] = Z[c]; vert[o + 5] = -1;   // normal (0, 0, -1)
        vert[o + 6] = joint; vert[o + 10] = 1;                                  // per-vertex weights sum to 1
        if (r < ROWS - 1) { const c2 = (c + 1) % COLS, a = r * COLS + c, d = (r + 1) * COLS + c, e = (r + 1) * COLS + c2; tri.push(a, d, e, a, e, r * COLS + c2); }
    }
}
const indexData = new Uint16Array(tri); const data = new Uint8Array(vert.byteLength + indexData.byteLength);
data.set(new Uint8Array(vert.buffer), 0); data.set(new Uint8Array(indexData.buffer), vert.byteLength);
const mesh = new Mesh();
mesh.reset({
    struct: {
        vertexBundles: [{ view: { offset: 0, length: vert.byteLength, count: ROWS * COLS, stride: 56 }, attributes: [
            { name: 'a_position', format: gfx.Format.RGB32F, isInstanced: false }, { name: 'a_normal', format: gfx.Format.RGB32F, isInstanced: false },
            { name: 'a_joints', format: gfx.Format.RGBA32F, isInstanced: false }, { name: 'a_weights', format: gfx.Format.RGBA32F, isInstanced: false }] }],
        primitives: [{ primitiveMode: gfx.PrimitiveMode.TRIANGLE_LIST, vertexBundelIndices: [0],
            indexView: { offset: vert.byteLength, length: indexData.byteLength, count: tri.length, stride: 2 } }],
        minPosition: { x: -0.25, y: 0, z: -0.25 }, maxPosition: { x: 0.25, y: (ROWS - 1) * SEG, z: 0.25 },
    },
    data,
});

// 3) bindpose = inverse(bone world matrix right now): capture before any bone is moved
const skeleton = buildSkeletonTree(armature, jointPaths);

// 4) mesh + skeleton + root must all exist before enabling; with no enabled SkeletalAnimation on the
//    root the native association path picks realtime skinning, so live bone edits drive the pose
const renderer = armature.addComponent(SkinnedMeshRenderer);
renderer.enabled = false;
renderer.mesh = mesh; renderer.skeleton = skeleton; renderer.skinningRoot = armature;
const material = new Material();
material.initialize({ effectName: 'builtin-standard' }); material.setProperty('mainColor', new Color(240, 160, 40, 255));
renderer.setSharedMaterial(material, 0);
renderer.enabled = true;
scene.addChild(armature);

// 5) edit real joint nodes; bounds and the joint upload complete on the next engine frame
class TentacleDriver extends Component {
    constructor () { super(); this.t = 0; }
    update (dt) { this.t += dt; bone1.setRotationFromEuler(0, 0, Math.sin(this.t * 1.6) * 40); bone2.setRotationFromEuler(0, 0, Math.sin(this.t * 1.6 + 0.9) * 50); }
}
armature.addComponent(TentacleDriver);
restoreBindPose(armature, skeleton);   // back to the pose buildSkeletonTree captured
frameObject(camera, armature);
app.run(scene);                        // async render loop: frame 1 lands on a later tick

function teardown() { renderer.destroy(); mesh.destroy(); skeleton.destroy(); material.destroy(); }
</script>
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - `getChildByPath` resolution, parenting order and deferred `destroy()`, which a joint path and a release both depend on.
- [cocosair-primitives-mesh](../cocosair-primitives-mesh/SKILL.md) - `Mesh` struct, vertex bundles and `minPosition`/`maxPosition`; the geometry half of a skinned mesh.
- [cocosair-materials-effects](../cocosair-materials-effects/SKILL.md) - the effect and `MaterialInstance` side of `setSharedMaterial`, which realtime mode forces.
- [cocosair-animation-tween](../cocosair-animation-tween/SKILL.md) - `SkeletalAnimation` clips and `useBakedAnimation`, the only way to move a pose in baked mode.
- [cocosair-gltf](../cocosair-gltf/SKILL.md) - where loaded joints, bindposes and morph weights come from.
- [cocosair-verification](../cocosair-verification/SKILL.md) - the smoke test and browser probes behind the claims below.

## When to use what

- "build a skeleton in code" -> `buildSkeletonTree(root, jointPaths)`; it writes `joints` and `bindposes` in one pass (`src/air/utils/skeleton-tree.ts:26-39`). "reset the rig" -> `restoreBindPose(root, skeleton)` with the same root you passed to it (`src/air/utils/restore-bind-pose.ts:30`, `docs/guides/skinned-model.md:29`).
- "wiggle bones by hand" -> realtime mode: keep the renderer under the root and install no enabled `SkeletalAnimation` there (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:197-202`, `docs/manual/skinning-code-first.md:35`).
- "play a fixed clip" -> `SkeletalAnimation` plus baked mode, which is also the renderer's default model type (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:101`, `src/cocos/3d/skeletal-animation/skeletal-animation.ts:150`).
- "blend shape weights" -> author `struct.morph`, then `renderer.setWeights(weights, subMeshIndex)` (`src/cocos/3d/assets/mesh.ts:218`, `src/cocos/3d/framework/mesh-renderer.ts:695-706`).
- "why did binding throw" -> read the `AIR_E_SKINNING_*` code; each one names one data problem (`docs/manual/skinning-code-first.md:23`, `references/joint-paths.md`). "is my bindpose still valid" -> the caches and rebind rules in `references/bind-pose.md`; the asset caches by matrix signature, not by node state.

## Contracts

- `SkinnedMeshRenderer extends MeshRenderer` (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:49`) is the only skinning component; `_updateModelParams` leaves the model undrawable until `mesh`, `skeleton` and `skinningRoot` all exist (`:154-163`), which is why the documented order assigns while `enabled = false` and enables last (`docs/manual/skinning-code-first.md:13-21`). The `skeleton` and `skinningRoot` setters both run `_refreshBinding`, validating before the old binding is replaced and then rebuilding submodels because `bindSkeleton` swapped the buffers or textures underneath them (`:67-71`, `:82-87`, `:165-178`, `src/cocos/3d/models/skinning-model.ts:140-170`).
- Joint paths, never short names: `Skeleton` documents `joints` as paths relative to `skinningRoot` (`src/cocos/3d/assets/skeleton.ts:31-32`, `:55-61`) and every consumer resolves them through `root.getChildByPath(path)` (`src/cocos/3d/models/skinning-validation.ts:13`, `src/cocos/3d/models/skinning-model.ts:161`), while `joints[i]` stays index-paired with `bindposes[i]` (`src/cocos/3d/assets/skeleton.ts:52-53`, `:63-73`). `AIR_E_SKINNING_JOINT_PATH` throws only for a *weighted* joint whose path does not resolve (`src/cocos/3d/models/skinning-validation.ts:11-18`), the error carries `code`, `resource`, `node`, `joint`, `path` (`:18`), and an unweighted joint yields a `null` bone-space bound and is skipped (`src/cocos/3d/assets/mesh.ts:754-756`, `docs/manual/skinning-code-first.md:9`).
- `buildSkeletonTree(root, jointPaths)` records `bindposes[i] = root.getChildByPath(path).worldMatrix.clone().invert()` and throws on a missing path (`src/air/utils/skeleton-tree.ts:30-37`, `:31-34`); realtime mode then multiplies the live joint world matrix by that inverse each frame (`src/cocos/3d/models/skinning-model.ts:208-216`), so the captured matrix is what makes the rest pose restorable. `Node.worldMatrix` updates itself first, so a detached rig still captures correctly (`src/cocos/scene-graph/node.ts:1910-1913`).
- `restoreBindPose(root, skeleton)` inverts each bindpose back to world, converts to local against the parent's current world matrix and applies SRT, walking depth-first over a *sorted copy* of the index map (`src/air/utils/restore-bind-pose.ts:33-36`, `:43-55`); nothing is written back to the asset, so ordering is preserved (`docs/guides/skinned-model.md:30`, `test/smoke/smoke-06-skeleton-utils.test.ts:81-84`).
- Two pose transports, one switch: the constructor defaults to `BakedSkinningModel` (`src/cocos/3d/skinned-mesh-renderer/skinned-mesh-renderer.ts:101`), `setUseBakedAnimation(val, force)` rebuilds the live model when it changes (`:129-145`), and `_tryBindAnimation` re-decides the mode from the root association (`:197-202`), so the call is a rebuild entry, not a persistent lock (`docs/manual/skinning-code-first.md:44`). Baked mode reads the pose from the clip's uploaded joint texture and never from the live joint transforms (`src/cocos/3d/models/baked-skinning-model.ts:166-180`, `:114-125`); realtime mode is the one that samples nodes (`src/cocos/3d/models/skinning-model.ts:208-216`), which is the difference the mode switch actually buys you.
- Capacity is about the slots written, not the skeleton size: `bindSkeleton` compares `UBOSkinning.JOINT_UNIFORM_CAPACITY` (`src/cocos/rendering/define.ts:653`, fallback 30 at `:600`) against `joints.length` and takes the 256-wide realtime texture above it (`src/cocos/3d/models/skinning-model.ts:143-145`, `:153`, `:84`), and `validateSkinningCapacity` checks each `jointMaps` slot against that capacity, throwing `AIR_E_SKINNING_CAPACITY` (`src/cocos/3d/models/skinning-validation.ts:25-41`, `docs/manual/skinning-code-first.md:54`).
- `Mesh.morphRendering` is a lifecycle field: `null` by default (`src/cocos/3d/assets/mesh.ts:368`), created inside `initialize()` only when `struct.morph` exists (`:412`, `:571-573`), which `renderingSubMeshes` triggers lazily (`:359-362`) and the `mesh` setter triggers first (`src/cocos/3d/framework/mesh-renderer.ts:487-492`, `:1233-1249`). Morph weights are a silent contract: `setWeights(weights, subMeshIndex)` returns without effect on an out-of-range index or a target-count mismatch (`:695-706`), `setWeight` likewise (`:720-731`), values only reach the GPU through the morph instance (`:1309-1310`), initial values come from the asset (`:1260-1287`), and reassigning `mesh` re-inits them (`:491`, reset note `:475-479`). `enableMorph` is a bare flag (`:526-532`, default `true` at `:564`); the instance is only built from the `mesh` setter and `onLoad` (`:492`, `:577-583`), so toggling it after binding does nothing until the mesh is reassigned.
- Skinning and morph compose rather than compete: `SkinningModel` and `BakedSkinningModel` both extend `MorphModel` (`src/cocos/3d/models/skinning-model.ts:97`, `src/cocos/3d/models/baked-skinning-model.ts:60`), and `_createModel` substitutes `MorphModel` only when the type is still the base `Model` (`src/cocos/3d/framework/mesh-renderer.ts:971-987`), so a skinned sub-mesh keeps its morph macro patches (`src/cocos/3d/assets/morph-rendering.ts:157-171`).
- The deprecated alias is real and shipped: `SkinningModelComponent` is `SkinnedMeshRenderer` re-exported with a `cclegacy` registration and a `cc.SkinningModelComponent` class alias (`src/cocos/3d/skinned-mesh-renderer/deprecated.ts:32-34`), alongside `SkinningModelUnit` (`:39-41`) and `BatchedSkinningModelComponent` (`:46-48`); the bundle's single export block carries all of them plus `SkinnedMeshRenderer`, `Skeleton`, `Mesh`, `buildSkeletonTree` and `restoreBindPose` (`build/cocosair.module.js`, currently :161574), while `MorphRendering`, `createMorphRendering`, `Morph` and `AttributeName` do not appear there, so morph data must be authored as a plain literal.
- Evidence, stated plainly: under candidate fingerprint `2f089f6ce25eaccd` (`docs/evidence/examples-verified.json`, file-level `measuredAt` 2026-10-04T05:52:32.537Z) the ids `skinned-animation`, `gltf-skin`, `gltf-morph` and `mesh-morph-bounds` are `result: PASS`, and `examples/skinned-animation/main.js:195`, `:210-213`, `:273` are the browser-exercised build, bind and restore sequence; `docs/manual/skinning-code-first.md:46` records 96 access-order combinations drawn in three browsers, and `:31` limits that coverage to the tested single joint and the built-in effects.

## Common Mistakes

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

## References

- `references/joint-paths.md` - path resolution and its consumers, the weighted-joint scope of the path error, palette and capacity rules, glTF-loaded paths, and the deprecated component aliases.
- `references/bind-pose.md` - the inverse-world bindpose convention, capture timing, `restoreBindPose` ordering and math, stale caches, and rebinding after an asset edit.
- `references/morph.md` - morph data shapes, `morphRendering` lifecycle, GPU versus CPU blending, the renderer weight API, macro patches, and morph combined with skinning.

## Canonical docs

- `docs/manual/skinning-code-first.md` - open for the binding order, the `AIR_E_SKINNING_*` taxonomy, root space versus node scale, manual joints and the first frame, capacity and the read-only inspector.
- `docs/guides/skinned-model.md` - open for the `buildSkeletonTree`, `restoreBindPose` and `frameObject` helper contracts, the joint path rule history, and the covering test and example.
