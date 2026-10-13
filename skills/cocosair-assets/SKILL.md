---
name: cocosair-assets
description: "Drives the Cocos AIR asset surface - the Code First loading route (assetManager.assets registry plus loadAssetAsync and its gltf, resources, registry, then URL deserialize order), the reference-counted AssetBank over assetManager.loadRemote with the ext and cache-key rules, the subscriber-side-only signal and the full AIR_E_* throw map, the two-object texture model where ImageAsset carries CPU pixels and Texture2D samples them through reset, uploadData, updateMipmaps and the wrap and filter setters, parseAtlasText and createAtlasHandle for libGDX TexturePacker text atlases with top-left rect.y semantics, and parseFnt, createBitmapFont and loadBitmapFont for single-page BMFont. Use when assetManager.resources is null, when load or loadRemote is not an importable name, when reloading the same URL hands back a destroyed asset, when an atlas or font handle refuses to dispose, or when a label still renders with a system font."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, assets"
  description_en: "Drives the Cocos AIR asset surface - the Code First loading route (assetManager.assets registry plus loadAssetAsync and its gltf, resources, registry, then URL deserialize order), the reference-counted AssetBank over assetManager.loadRemote with the ext and cache-key rules, the subscriber-side-only signal and the full AIR_E_* throw map, the two-object texture model where ImageAsset carries CPU pixels and Texture2D samples them through reset, uploadData, updateMipmaps and the wrap and filter setters, parseAtlasText and createAtlasHandle for libGDX TexturePacker text atlases with top-left rect.y semantics, and parseFnt, createBitmapFont and loadBitmapFont for single-page BMFont. Use when assetManager.resources is null, when load or loadRemote is not an importable name, when reloading the same URL hands back a destroyed asset, when an atlas or font handle refuses to dispose, or when a label still renders with a system font."
  description_zh: "管理远程资产、AssetBank 引用计数、纹理、图集和位图字体。用于加载、缓存、取消、共享资源释放或字体导入问题。"
---

# Cocos AIR asset contracts

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Load assets through the Code First registry and the reference-counted bank, build textures from canvas and pixel data, and parse libGDX atlases and BMFont pages - there is no Creator bundle pipeline here, so every bundle-era snippet needs re-grounding.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "load a JSON/manifest file at runtime" -> `loadAssetAsync(url)` with no type argument (`src/air/utils/load-asset.ts:38`, `:68-77`).
- "load something I built in code" -> `assetManager.assets.add(key, asset)` then `loadAssetAsync(key, Type)` (`:60-62`); see `examples/ui-asset-loading/src/main.ts:339-342` for the round-trip shape.
- "load a png/jpg/audio/text by URL" -> `new AssetBank().load(url, { ext })` for refcounted ownership, or `assetManager.loadRemote` when you accept the engine's URL cache ([asset-bank.md](references/asset-bank.md)).
- "load a model" -> not this skill; `loadAssetAsync` routes `.gltf`/`.glb` to `GLTFLoader` (`src/air/utils/load-asset.ts:40-43`), see [cocosair-gltf](references/context.md#related-skills).
- "texture from pixels without a file" -> `new ImageAsset(canvasElement)` plus `texture.image =` (`src/cocos/asset/assets/image-asset.ts:670`, `src/cocos/asset/assets/texture-2d.ts:161-163`); to refill a level from a typed array, `reset(info)` then `uploadData(source, level)` ([texture2d.md](references/texture2d.md)).
- "sprite sheets" -> `parseAtlasText`/`createAtlasHandle` for libGDX text atlases; Creator `.plist` atlases are not this parser's input ([atlas.md](references/atlas.md)).
- "custom font" -> `loadBitmapFont(url, { bank })` then `label.font = handle.font`; the Creator TTF/font-asset workflow does not exist here ([bmfont.md](references/bmfont.md)).
- "the same URL hands back a destroyed asset, or a handle refuses to dispose" -> `assetManager.releaseAsset(asset)` before re-loading and never `destroy()` alone ([asset-bank.md](references/asset-bank.md)); `AIR_E_ATLAS_IN_USE` and `AIR_E_FNT_IN_USE` both mean someone still holds a reference, so detach the component first ([atlas.md](references/atlas.md), [bmfont.md](references/bmfont.md)).
- "how do I know this actually works in a browser" -> the evidence column of each reference names the validator, not just the example id.

## Contracts

AIR has no implicit Creator resources bundle. Keep ImageAsset/Texture2D and cache/refcount ownership distinct; detach users before disposing handles. Abort cancels a subscriber, not the shared underlying request.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Assuming a resources bundle or Creator build output
- [HIGH] Treating an AbortSignal as a network cancel
- [HIGH] Copying the manual line that Label can only use system fonts
- [MEDIUM] Suffix-less or trimmed-atlas URLs

## References

- [asset-bank.md](references/asset-bank.md) - the `AssetBank` public surface, every `AIR_E_*` throw site, cache-key and `ext` rules, subscriber-side `signal`, microtask cache hits, two-phase progress, `releaseAll` revoke ordering, the `loadAssetAsync` fallback chain, default bundle face, browser status.
- [texture2d.md](references/texture2d.md) - `ImageAsset` and `Texture2D` construction and reset paths, `uploadData` and mipmap generation, wrap/filter/anisotropy setters and serialized defaults, enum inventories, format legality and `maxTextureSize` behavior, lifecycle helpers, which members only reach `no-runtime-error`.
- [atlas.md](references/atlas.md) - `parseAtlasText` dialects and key sets, the `AirAtlasDocument` shape, top-origin `rect.y` ruling and rotation, throw versus silent handling, `createAtlasHandle` ownership and the in-use guard, `loadAtlas` pipeline and abort semantics, tracked versus regenerable evidence.
- [bmfont.md](references/bmfont.md) - `parseFnt` accepted records and every guard, the single-page constraint, `createBitmapFont` page validation and handle refs, `Label` selection and sizing and kerning key math, `loadBitmapFont` steps and error surface, the stale manual statement.

## Canonical docs

- `docs/guides/asset-loading.md` - open for the two `loadAssetAsync` overloads and the registry example; note it predates the glTF branch, so read its resolution order as incomplete.
- `docs/manual/asset-loading-and-lifetime.md` - open for the three entry points with their measured rejection messages and the five lifetime semantics the manual example asserts line by line.
- `docs/manual/asset-bank-loading.md` - open for the `AssetBank` contract page and its own statement of what jsdom evidence does not prove.
- `docs/manual/atlas-loading.md` - open for the top-origin ruling, the trim formula, the page-size guard, the no-automatic-`addRef` rule and the PNG-only auto path.
- `docs/manual/bitmap-font-loading.md` - open for the single-page rule, the `Label` binding contract, the scale reuse behavior and the error inventory.
- `docs/manual/textures.md` - open for the texture narrative and the format table; treat its default-wrap sentence as stale against `src/cocos/asset/assets/texture-base.ts:122`.
