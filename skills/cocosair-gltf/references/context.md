# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry exposes a name, how the importmap alias `cocosair` differs from the npm package `cocosair.js`, and where `build/gltf-decoders/` sits relative to your bundle.
- [cocosair-assets](../../cocosair-assets/SKILL.md) - `loadAssetAsync` routes `.gltf`/`.glb` into this skill and stops being the generic path; `AssetBank` and `Texture2D` ownership live there.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - deferred `destroy()`, `isValid` and `NODE_DESTROYED` ordering, which is what makes `GLTFAsset` release deferred too, plus the `MeshRenderer` and `SkinnedMeshRenderer` the instantiated nodes carry.
- [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) - the `air-gltf-standard` and `air-gltf-physical` effects the parser builds; overriding them means overriding a shared material.
- [cocosair-animation-tween](../../cocosair-animation-tween/SKILL.md) - the native `Animation` component and `AnimationClip` wrap modes that `setAnimationLoop` reconfigures per instance.
- [cocosair-skinning-morph](../../cocosair-skinning-morph/SKILL.md) - joint paths, bind pose and morph targets for the skeletons and weight sets this skill loads.
- [cocosair-performance](../../cocosair-performance/SKILL.md) - cost of re-instantiating versus sharing one `GLTFAsset`, and draw-call consequences of `EXT_mesh_gpu_instancing` expansion.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - the gates and collectors behind every browser claim quoted below, including `npm run capabilities` and `verify:decoders`.
