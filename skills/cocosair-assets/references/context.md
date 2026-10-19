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

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Load assets through the Code First registry and the reference-counted bank, build textures from canvas and pixel data, and parse libGDX atlases and BMFont pages - there is no Creator bundle pipeline here, so every bundle-era snippet needs re-grounding.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Assuming a resources bundle or Creator build output
- [HIGH] Treating an AbortSignal as a network cancel
- [HIGH] Copying the manual line that Label can only use system fonts
- [MEDIUM] Suffix-less or trimmed-atlas URLs

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Drives the Cocos AIR asset surface - the Code First loading route (assetManager.assets registry plus loadAssetAsync and its gltf, resources, registry, then URL deserialize order), the reference-counted AssetBank over assetManager.loadRemote with the ext and cache-key rules, the subscriber-side-only signal and the full AIR_E_* throw map, the two-object texture model where ImageAsset carries CPU pixels and Texture2D samples them through reset, uploadData, updateMipmaps and the wrap and filter setters, parseAtlasText and createAtlasHandle for libGDX TexturePacker text atlases with top-left rect.y semantics, and parseFnt, createBitmapFont and loadBitmapFont for single-page BMFont. Use when assetManager.resources is null, when load or loadRemote is not an importable name, when reloading the same URL hands back a destroyed asset, when an atlas or font handle refuses to dispose, or when a label still renders with a system font.

### Keywords

Cocos AIR, cocosair.js, assets

## References

- [asset-bank.md](asset-bank.md) - the `AssetBank` public surface, every `AIR_E_*` throw site, cache-key and `ext` rules, subscriber-side `signal`, microtask cache hits, two-phase progress, `releaseAll` revoke ordering, the `loadAssetAsync` fallback chain, default bundle face, browser status.
- [texture2d.md](texture2d.md) - `ImageAsset` and `Texture2D` construction and reset paths, `uploadData` and mipmap generation, wrap/filter/anisotropy setters and serialized defaults, enum inventories, format legality and `maxTextureSize` behavior, lifecycle helpers, which members only reach `no-runtime-error`.
- [atlas.md](atlas.md) - `parseAtlasText` dialects and key sets, the `AirAtlasDocument` shape, top-origin `rect.y` ruling and rotation, throw versus silent handling, `createAtlasHandle` ownership and the in-use guard, `loadAtlas` pipeline and abort semantics, tracked versus regenerable evidence.
- [bmfont.md](bmfont.md) - `parseFnt` accepted records and every guard, the single-page constraint, `createBitmapFont` page validation and handle refs, `Label` selection and sizing and kerning key math, `loadBitmapFont` steps and error surface, the stale manual statement.

## Canonical docs

- `docs/guides/asset-loading.md` - open for the two `loadAssetAsync` overloads and the registry example; note it predates the glTF branch, so read its resolution order as incomplete.
- `docs/manual/asset-loading-and-lifetime.md` - open for the three entry points with their measured rejection messages and the five lifetime semantics the manual example asserts line by line.
- `docs/manual/asset-bank-loading.md` - open for the `AssetBank` contract page and its own statement of what jsdom evidence does not prove.
- `docs/manual/atlas-loading.md` - open for the top-origin ruling, the trim formula, the page-size guard, the no-automatic-`addRef` rule and the PNG-only auto path.
- `docs/manual/bitmap-font-loading.md` - open for the single-page rule, the `Label` binding contract, the scale reuse behavior and the error inventory.
- `docs/manual/textures.md` - open for the texture narrative and the format table; treat its default-wrap sentence as stale against `src/cocos/asset/assets/texture-base.ts:122`.
