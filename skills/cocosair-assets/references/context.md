# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry exposes a name and how `AIR_FEATURES` variants are built; this skill reads the default bundle face only.
- [cocosair-application](../../cocosair-application/SKILL.md) - `createAirApp` boot order and the `#GameCanvas` import contract; asset manager initialization comes from there, not from this skill.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - the deferred `destroy()` and `isValid` rules this skill's asset release ordering depends on.
- [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) - sampling a `Texture2D` from a material (`USE_TEXTURE`, `setProperty` type matching); this skill owns producing and releasing the texture.
- [cocosair-primitives-mesh](../../cocosair-primitives-mesh/SKILL.md) - `utils.createMesh` results are assets you register and release the same way.
- [cocosair-gltf](../../cocosair-gltf/SKILL.md) - `GLTFLoader`/`GLTFAsset` and decoder injection; `loadAssetAsync` routes `.gltf`/`.glb` there and stops being the generic path.
- [cocosair-ui-2d](../../cocosair-ui-2d/SKILL.md) - `Sprite` and `Label` consumption of `SpriteFrame` and `BitmapFont`; this skill owns the loading and refcount side.
- [cocosair-performance](../../cocosair-performance/SKILL.md) - `dynamicAtlasManager` re-copying atlas and sprite frames, and texture identity in 2D batch keys.
- [cocosair-graphics-and-dom](../../cocosair-graphics-and-dom/SKILL.md) - canvas and DOM image sources for textures, and `AirUIMesh` texture leases.
- [cocosair-verification](../../cocosair-verification/SKILL.md) - the gates and collectors behind every browser claim quoted below.
