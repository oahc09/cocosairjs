# Cocos AIR asset triggers

Source annotations refer to the AIR checkout.

## When to use what

- "load a JSON/manifest file at runtime" -> `loadAssetAsync(url)` with no type argument (`src/air/utils/load-asset.ts:38`, `:68-77`).
- "load something I built in code" -> `assetManager.assets.add(key, asset)` then `loadAssetAsync(key, Type)` (`:60-62`); see `examples/ui-asset-loading/src/main.ts:339-342` for the round-trip shape.
- "load a png/jpg/audio/text by URL" -> `new AssetBank().load(url, { ext })` for refcounted ownership, or `assetManager.loadRemote` when you accept the engine's URL cache ([asset-bank.md](asset-bank.md)).
- "load a model" -> not this skill; `loadAssetAsync` routes `.gltf`/`.glb` to `GLTFLoader` (`src/air/utils/load-asset.ts:40-43`), see [cocosair-gltf](context.md#related-skills).
- "texture from pixels without a file" -> `new ImageAsset(canvasElement)` plus `texture.image =` (`src/cocos/asset/assets/image-asset.ts:670`, `src/cocos/asset/assets/texture-2d.ts:161-163`); to refill a level from a typed array, `reset(info)` then `uploadData(source, level)` ([texture2d.md](texture2d.md)).
- "sprite sheets" -> `parseAtlasText`/`createAtlasHandle` for libGDX text atlases; Creator `.plist` atlases are not this parser's input ([atlas.md](atlas.md)).
- "custom font" -> `loadBitmapFont(url, { bank })` then `label.font = handle.font`; the Creator TTF/font-asset workflow does not exist here ([bmfont.md](bmfont.md)).
- "the same URL hands back a destroyed asset, or a handle refuses to dispose" -> `assetManager.releaseAsset(asset)` before re-loading and never `destroy()` alone ([asset-bank.md](asset-bank.md)); `AIR_E_ATLAS_IN_USE` and `AIR_E_FNT_IN_USE` both mean someone still holds a reference, so detach the component first ([atlas.md](atlas.md), [bmfont.md](bmfont.md)).
- "how do I know this actually works in a browser" -> the evidence column of each reference names the validator, not just the example id.
