Derived from `src/cocos/3d/assets/morph.ts`, `src/cocos/3d/assets/morph-rendering.ts`, `src/cocos/3d/assets/mesh.ts`, `src/cocos/3d/framework/mesh-renderer.ts`, `src/cocos/3d/models/morph-model.ts`, `src/cocos/3d/models/skinning-model.ts`, `src/cocos/3d/models/baked-skinning-model.ts`, `src/cocos/rendering/define.ts`, `src/cocos/animation/value-proxy-factories/morph-weights.ts`, `src/air/assets/gltf/mesh.ts`, `src/air/assets/gltf/animation.ts`, `src/air/assets/gltf/asset.ts`, `docs/example-api-inventory.json`, `examples/gltf-morph/src/main.ts`, `examples/mesh-morph-bounds/src/main.ts`, `build/cocosair.module.js` (as of 2026-10-10).

## Data shapes

Morph data lives inside the mesh struct, not on the renderer: `Mesh.IStruct.morph?: Morph` (`src/cocos/3d/assets/mesh.ts:218`, struct getter `:324`). Three interfaces describe it (`src/cocos/3d/assets/morph.ts`):

- `Morph` (`:69-85`) - `subMeshMorphs: (SubMeshMorph | null)[]` one entry per primitive, optional common `weights`, optional `targetNames` that is only meaningful when every sub-mesh has the same target count (`:80-84`).
- `SubMeshMorph` (`:44-59`) - `attributes: AttributeName[]` listing which attributes morph, `targets: MorphTarget[]`, and per-sub-mesh `weights?` that take precedence over the common list (`:64-67`).
- `MorphTarget` (`:32-37`) - `displacements: Mesh.IBufferView[]`, one view per entry of `attributes`, in the same order.

`IBufferView` is `{ offset, length, count, stride }` (`src/cocos/3d/assets/mesh.ts:63-68`) pointing into the single `mesh.data` blob. Displacements are additive per-vertex offsets in the attribute's own space, three floats per vertex; the loader comments the trap that `count` here is a _scalar float count_, not a vertex count (`src/air/assets/gltf/mesh.ts:219-220`), and the CPU path derives vertices as `displacements.length / 3` (`src/cocos/3d/assets/morph-rendering.ts:427`). A minimal literal:

```ts
// one blob holds vertex data, then indices, then every displacement array; the views point into it
mesh.reset({
    struct: {
        vertexBundles,
        primitives,
        morph: {
            subMeshMorphs: [{
                attributes: [gfx.AttributeName.ATTR_POSITION],   // 'a_position'; values are the strings themselves
                targets: [{
                    displacements: [{ offset: dispBytes, length: 12 * verts, count: 3 * verts, stride: 4 }],
                }],
            }],
            weights: [0],
        },
    },
    data,
});
```

The engine's `AttributeName` strings come from the same define module the `gfx` namespace re-exports (`src/cocos/gfx/base/define.ts:2074-2077`, where `ATTR_POSITION = 'a_position'`), and `AttributeName` itself is not a top-level name in the bundle, so reach it through `gfx` or write the literal string.
The loader form is the reliable template: `attributes` are the engine `AttributeName` values for POSITION, NORMAL or TANGENT only (`src/air/assets/gltf/mesh.ts:217`, validation at `src/air/assets/gltf/mesh.ts:137`), and each target contributes one appended float3 view per attribute (`:220`). Anything else in `attributes` reaches the blending switch and is dropped with `warnID(16374)` (`src/cocos/3d/assets/morph-rendering.ts:319-324`, `:460-464`).

## `Mesh.morphRendering` lifecycle

`morphRendering` is a public mutable field initialised to `null` (`src/cocos/3d/assets/mesh.ts:368`). It is assigned exactly once per GPU upload pass, and only when the struct carries morph data (`:571-573`) inside `initialize()` (`:412`), which `renderingSubMeshes` triggers lazily (`:359-362`) and `MeshRenderer`'s `mesh` setter calls first (`src/cocos/3d/framework/mesh-renderer.ts:487-490`). So:

- reading `mesh.morphRendering` right after `new Mesh()` or after `reset()` gives `null` - not an error, just not initialized yet; `examples/mesh-morph-bounds/src/main.ts:84-91` reads it as a probe for exactly that reason;
- a mesh without `struct.morph` keeps it `null` forever, so `MeshRenderer._watchMorphInMesh` bails out and no morph instance exists (`src/cocos/3d/framework/mesh-renderer.ts:1243-1247`);
- the object is created by `createMorphRendering(this, gfxDevice)` (`src/cocos/3d/assets/mesh.ts:572`), which returns `StdMorphRendering` (`src/cocos/3d/assets/morph-rendering.ts:89-91`).

`StdMorphRendering` picks a strategy per sub-mesh at construction: the CPU path when a global preference is set or the target count exceeds `UBOMorphEnum.MAX_MORPH_TARGET_COUNT` (60, `src/cocos/rendering/define.ts:695`), otherwise the GPU path (`src/cocos/3d/assets/morph-rendering.ts:120`). The GPU path uploads one vec4 vertex texture per attribute (`:265-288`), RGBA32F when the device can sample it and RGBA8888 with four times the pixels when it cannot (`:546-562`), and enables the vertex-id channel on the sub-mesh because sampling per-vertex data needs `gl_VertexID` (`:645-647`) - the WebGL 2 requirement the runtime already enforces at startup.

Each renderer then gets its own instance through `createInstance()` (`src/cocos/3d/assets/morph-rendering.ts:138-184`), whose four members are the whole blending surface: `setWeights(subMeshIndex, weights)` (`:145-147`), `requiredPatches(subMeshIndex)` (`:149-172`), `adaptPipelineState(subMeshIndex, descriptorSet)` (`:174-176`) and `destroy()` (`:178-182`). The instance is what `MeshRenderer` stores as `_morphInstance` (`src/cocos/3d/framework/mesh-renderer.ts:561`, created `:1249`, destroyed on rebind `:1234-1237` and on component destroy `:656-657`) and what it hands to the model (`:986-987`, `src/cocos/3d/models/morph-model.ts:99-101`).

## The weights API an app can actually name

None of `MorphRendering`, `StdMorphRendering`, `createMorphRendering`, `Morph`, `SubMeshMorph`, `MorphTarget`, `MorphModel` or the animation value-proxy factories appear in the runtime bundle's single export block (`build/cocosair.module.js`, currently :161574; `Mesh.morphRendering` is tracked as a member unit in `docs/example-api-inventory.json`). The public surface is on the renderer (`src/cocos/3d/framework/mesh-renderer.ts`):

| Member                                        | Line                              | Failure mode                                                                                 |
| --------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| `enableMorph` getter/setter                   | `:526-532`, default `true` `:564` | setter is a bare assignment; only `mesh` (`:492`) and `onLoad` (`:582`) rebuild the instance |
| `getWeight(subMeshIndex, shapeIndex)`         | `:677-683`                        | `assertIsTrue` on an out-of-range index, so it throws rather than returns a default          |
| `setWeights(weights, subMeshIndex)`           | `:695-706`                        | silent return when the index is out of bounds or the length differs from the target count    |
| `setWeight(weight, subMeshIndex, shapeIndex)` | `:720-731`                        | silent return on either out-of-range index                                                   |

Weights are stored first, then pushed: `_uploadSubMeshShapesWeights` calls `this._morphInstance?.setWeights(...)` (`:1309-1310`), so with no instance - morph-less mesh, or `_enableMorph` false at instance-build time (`:1239-1241`) - the call records values that never reach the GPU. Initial values come from the asset in precedence order `subMeshMorph.weights`, then `morph.weights`, then zeros (`:1260-1287`), and reassigning `mesh` re-runs that initialisation, which the doc comment warns resets every weight (`:475-479`). Nothing normalises morph weights; only the glTF geometry path normalises _skin_ weight sums (`src/air/assets/gltf/mesh.ts:111-118`), while `getBoneSpaceBounds` merely rejects non-finite or negative values (`src/cocos/3d/assets/mesh.ts:724-727`) and the manual assigns normalisation to the application (`docs/manual/skinning-code-first.md:7`).

Blending itself is a linear accumulation of weighted displacements per attribute (`src/cocos/3d/assets/morph-rendering.ts:418-445` for the CPU path, uniform-array writes at `:511-517` for the GPU path), which is why a single float per target per sub-mesh is the entire control surface - there is no named-target lookup at runtime beyond `Morph.targetNames` metadata (`src/cocos/3d/assets/morph.ts:80-84`).

## Macro patches and model selection

`MorphModel` prepends the instance patches to the material's own (`src/cocos/3d/models/morph-model.ts:52-62`) and feeds the descriptor sets through `adaptPipelineState` (`:103-109`). The GPU path requires `CC_MORPH_TARGET_USE_TEXTURE` (`src/cocos/3d/assets/morph-rendering.ts:313`), the CPU path adds `CC_MORPH_PRECOMPUTED` (`:447-452`), and both get `CC_USE_MORPH`, `CC_MORPH_TARGET_COUNT` and the per-attribute `CC_MORPH_TARGET_HAS_*` flags (`:157-171`); those names select the shader variant, so changing target counts changes pipeline state.

`MeshRenderer._createModel` only substitutes `MorphModel` when the current model type is still the base `Model`, deliberately not overwriting a derived type (`src/cocos/3d/framework/mesh-renderer.ts:971-987`). Both skinning models already derive from `MorphModel` (`src/cocos/3d/models/skinning-model.ts:97`, `src/cocos/3d/models/baked-skinning-model.ts:60`), so a mesh that carries both `JOINTS_0`/`WEIGHTS_0` and morph targets keeps its skinning transport and still blends: this is the combination glTF expressive characters rely on.

## Driving weights from animation

The native curve path exists but is not nameable from `cocosair`: `cc.animation.MorphWeightValueProxy` and `cc.animation.MorphWeightsValueProxy` wrap `setWeight` and `setWeights` on a `MeshRenderer` target (`src/cocos/animation/value-proxy-factories/morph-weights.ts:36-58`, `:67-82`), created through Creator serialization rather than code. In code-first Cocos AIR the working pattern is the one the glTF parser uses: attach a real-valued track whose proxy closes over the renderer, reading `getWeight(0, c)` and writing `setWeight(value, sub, c)` across every sub-mesh (`src/air/assets/gltf/animation.ts:101-110`), and set the asset's initial weights through `setWeights` per primitive at instantiate time (`src/air/assets/gltf/asset.ts:147-152`). Plain assignment is always available and is what `examples/gltf-morph/src/main.ts:62-67` exercises indirectly by playing the loaded clip.

## Evidence

Under candidate fingerprint `2f089f6ce25eaccd` (`docs/evidence/examples-verified.json`, file-level `measuredAt` 2026-10-04T05:52:32.537Z), `gltf-morph`, `mesh-morph-bounds`, `gltf-skin` and `skinned-animation` are all `result: PASS`. What that does and does not cover:

- `examples/gltf-morph/src/main.ts` proves the loaded path end to end: a Khronos `AnimatedMorphCube` GLB parsed, instantiated, its clips set to `Loop` and played, so displacement blending driven through animation is browser-exercised.
- `examples/mesh-morph-bounds/src/main.ts:84-99` proves only that reading `mesh.morphRendering` and calling `getBoneSpaceBounds` on a box-derived mesh does not throw; that mesh has no morph data, so it is a shape probe, not a blend test.
- No example in the repository authors `struct.morph` by hand, so the code-first morph literal above is derived from the parser (`src/air/assets/gltf/mesh.ts:36`, `:217-221`) and the interface contracts, not from a rendered sample. Treat the CPU blending branch (`src/cocos/3d/assets/morph-rendering.ts:347-482`) and the RGBA8888 fallback (`:557-561`) as unproven in this repository, since no tracked case exceeds 60 targets or runs on a device without float-texture sampling.
