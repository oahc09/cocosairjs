---
name: cocosair-assets
description: Drives the Cocos AIR asset surface - the Code First loading route (assetManager.assets registry plus loadAssetAsync and its gltf, resources, registry, then URL deserialize order), the reference-counted AssetBank over assetManager.loadRemote with the ext and cache-key rules, the subscriber-side-only signal and the full AIR_E_* throw map, the two-object texture model where ImageAsset carries CPU pixels and Texture2D samples them through reset, uploadData, updateMipmaps and the wrap and filter setters, parseAtlasText and createAtlasHandle for libGDX TexturePacker text atlases with top-left rect.y semantics, and parseFnt, createBitmapFont and loadBitmapFont for single-page BMFont. Use when assetManager.resources is null, when load or loadRemote is not an importable name, when reloading the same URL hands back a destroyed asset, when an atlas or font handle refuses to dispose, or when a label still renders with a system font.
---

# Cocos AIR asset contracts

Load assets through the Code First registry and the reference-counted bank, build textures from canvas and pixel data, and parse libGDX atlases and BMFont pages - there is no Creator bundle pipeline here, so every bundle-era snippet needs re-grounding.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Vec3, Layers,
         Texture2D, ImageAsset, primitives, utils, assetManager, loadAssetAsync, isValid, AssetBank } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const scene = new Scene('assets');
const camNode = new Node('Main');
scene.addChild(camNode); camNode.setPosition(new Vec3(0, 2, 6)); camNode.lookAt(new Vec3(0, 0, 0));
camNode.addComponent(Camera);
const lightNode = new Node('Key');
scene.addChild(lightNode); lightNode.setPosition(new Vec3(0, 8, 6)); lightNode.lookAt(new Vec3(0, 0, 0));
lightNode.addComponent(DirectionalLight);

// 1) no file involved: ImageAsset carries the CPU pixels, Texture2D is the GPU sampler
const imageAsset = new ImageAsset({
    width: 64, height: 64, _data: new Uint8Array(64 * 64 * 4).fill(120),
    _compressed: false, format: Texture2D.PixelFormat.RGBA8888,
});
const texture = new Texture2D();
texture.image = imageAsset;                    // equals mipmaps = [imageAsset]; clears other levels
// 2) Code First registry: the key you add is the path you load
assetManager.assets.add('gen/panel', texture);
const back = await loadAssetAsync('gen/panel', Texture2D);
console.log('roundtrip', back === texture, isValid(back));   // the registry is the cache
// 3) a runtime JSON file: fetch plus engine deserialize, plain-JSON fallback
console.log('manifest', await loadAssetAsync('assets/panel-manifest.json'));
// 4) refcounted remote bytes; ext is mandatory unless the URL already carries a suffix
const bank = new AssetBank();
const remote = await bank.load('/examples/tiledmap-basic/assets/tiles.png');   // -> ImageAsset
console.log('bank', remote.constructor.name, bank.refCount('/examples/tiledmap-basic/assets/tiles.png'));
// sample it (effect and property typing belong to cocosair-materials-effects)
const material = new Material();
material.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } });
material.setProperty('mainTexture', texture);
const cube = new Node('cube');
cube.layer = Layers.Enum.DEFAULT; cube.setPosition(new Vec3(0, 0.8, 0));
scene.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
renderer.material = material;
app.run(scene);   // async render loop; first frame draws on a later tick, so never free synchronously here
// Release LATER (on teardown), in guard order; freeing now blanks the cube (its material still samples `texture`)
async function teardown() {
    renderer.material = null; material.destroy(); assetManager.assets.remove('gen/panel'); // unbind the sampler first
    assetManager.releaseAsset(texture); texture.destroy(); await bank.release('/examples/tiledmap-basic/assets/tiles.png'); // isValid flips false at frame end
}
</script>
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which entry exposes a name and how `AIR_FEATURES` variants are built; this skill reads the default bundle face only.
- [cocosair-application](../cocosair-application/SKILL.md) - `createAirApp` boot order and the `#GameCanvas` import contract; asset manager initialization comes from there, not from this skill.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - the deferred `destroy()` and `isValid` rules this skill's asset release ordering depends on.
- [cocosair-materials-effects](../cocosair-materials-effects/SKILL.md) - sampling a `Texture2D` from a material (`USE_TEXTURE`, `setProperty` type matching); this skill owns producing and releasing the texture.
- [cocosair-primitives-mesh](../cocosair-primitives-mesh/SKILL.md) - `utils.createMesh` results are assets you register and release the same way.
- [cocosair-gltf](../cocosair-gltf/SKILL.md) - `GLTFLoader`/`GLTFAsset` and decoder injection; `loadAssetAsync` routes `.gltf`/`.glb` there and stops being the generic path.
- [cocosair-ui-2d](../cocosair-ui-2d/SKILL.md) - `Sprite` and `Label` consumption of `SpriteFrame` and `BitmapFont`; this skill owns the loading and refcount side.
- [cocosair-performance](../cocosair-performance/SKILL.md) - `dynamicAtlasManager` re-copying atlas and sprite frames, and texture identity in 2D batch keys.
- [cocosair-graphics-and-dom](../cocosair-graphics-and-dom/SKILL.md) - canvas and DOM image sources for textures, and `AirUIMesh` texture leases.
- [cocosair-verification](../cocosair-verification/SKILL.md) - the gates and collectors behind every browser claim quoted below.

## When to use what

- "load a JSON/manifest file at runtime" -> `loadAssetAsync(url)` with no type argument (`src/air/utils/load-asset.ts:38`, `:68-77`).
- "load something I built in code" -> `assetManager.assets.add(key, asset)` then `loadAssetAsync(key, Type)` (`:60-62`); see `examples/ui-asset-loading/src/main.ts:339-342` for the round-trip shape.
- "load a png/jpg/audio/text by URL" -> `new AssetBank().load(url, { ext })` for refcounted ownership, or `assetManager.loadRemote` when you accept the engine's URL cache (`references/asset-bank.md`).
- "load a model" -> not this skill; `loadAssetAsync` routes `.gltf`/`.glb` to `GLTFLoader` (`src/air/utils/load-asset.ts:40-43`), see [cocosair-gltf](../cocosair-gltf/SKILL.md).
- "texture from pixels without a file" -> `new ImageAsset(canvasElement)` plus `texture.image =` (`src/cocos/asset/assets/image-asset.ts:670`, `src/cocos/asset/assets/texture-2d.ts:161-163`); to refill a level from a typed array, `reset(info)` then `uploadData(source, level)` (`references/texture2d.md`).
- "sprite sheets" -> `parseAtlasText`/`createAtlasHandle` for libGDX text atlases; Creator `.plist` atlases are not this parser's input (`references/atlas.md`).
- "custom font" -> `loadBitmapFont(url, { bank })` then `label.font = handle.font`; the Creator TTF/font-asset workflow does not exist here (`references/bmfont.md`).
- "the same URL hands back a destroyed asset, or a handle refuses to dispose" -> `assetManager.releaseAsset(asset)` before re-loading and never `destroy()` alone (`references/asset-bank.md`); `AIR_E_ATLAS_IN_USE` and `AIR_E_FNT_IN_USE` both mean someone still holds a reference, so detach the component first (`references/atlas.md`, `references/bmfont.md`).
- "how do I know this actually works in a browser" -> the evidence column of each reference names the validator, not just the example id.

## Contracts

- There is no Editor asset pipeline. `resources` resolves by symbol name on the default bundle face, but the export is a bare `new Bundle()` (`src/cocos/asset/asset-manager/bundle.ts:655`); `assetManager.resources` (`src/cocos/asset/asset-manager/asset-manager.ts:369-370`) and `assetManager.getBundle(name)` (`:482-483`) read the module-level `bundles` cache (`src/cocos/asset/asset-manager/shared.ts:35`), which the manager also exposes as `public bundles` (`src/cocos/asset/asset-manager/asset-manager.ts:162`), and only a Creator-format config puts anything in it (`src/cocos/asset/asset-manager/factory.ts:84` maps the name `resources` onto that singleton). With nothing registered the getter is `null`, so `loadAssetAsync` skips the bundle branch entirely (`src/air/utils/load-asset.ts:47-48`); if you do hand it an unconfigured bundle, `Bundle.load` rejects through `Bundle ${item.bundle} doesn't contain ${item.path}` (`src/cocos/asset/asset-manager/url-transformer.ts:106`) and `loadAssetAsync` swallows that rejection and falls through to the registry (`src/air/utils/load-asset.ts:49-57`). `Bundle`, `Config`, `PackManager`, `Variant` and `Cache` are not export names on the default face, so a bundle instance is only reachable through `assetManager.getBundle(...)` and `assetManager.assets` is a plain string-keyed map (`src/cocos/asset/asset-manager/cache.ts:184-189`, `get` `:206`, `has` `:225`, `remove` `:244`).
- `loadAssetAsync` (`src/air/utils/load-asset.ts:32` typed overload, `:38` url overload, `:39` implementation) resolves in a fixed order: glTF when `type === GLTFAsset` or the path is `.gltf`/`.glb` (`:40-43`), then the `resources` bundle when present (`:47-51`), then the registry `assetManager.assets.get(path)` gated on `cached instanceof type` (`:60-62`), then a registry hit keyed by path before anything is fetched. With a `type` and no hit it throws ``[cocosair] loadAssetAsync: '<path>' not found. Register it via assetManager.assets.add('<path>', asset), or set up a resources bundle.`` (`:64`). Without a `type` it fetches and engine-deserializes, falling back to `JSON.parse` when the payload is not serialized (`:68-77`), and a non-2xx response throws ``[cocosair] loadAssetAsync failed: <url> (<status>)`` (`:70`). Both message shapes are the contract recorded at `docs/manual/asset-loading-and-lifetime.md:20`, `:22`.
- The registry is a cache, not a guard. `assetManager.assets.add(key, asset)` silently overwrites an existing key (`src/cocos/asset/asset-manager/cache.ts:184-189`), a `destroy()` only takes effect at the end of the frame, and a destroyed asset stays reachable through its key until you `remove` it - `loadAssetAsync(path, type)` will hand back the dead instance (`docs/manual/asset-loading-and-lifetime.md:26-34`, items 1 through 5). Same-key reload therefore requires the sequence `remove(key)` -> rebuild -> `add(key)` -> `loadAssetAsync`, and every consumer must call `isValid(asset)` after a load (`examples/ui-asset-loading/src/main.ts` runs exactly that round-trip and is bound to the `asset-loaded` validator).
- `loadRemote` is a method, not an import: neither `load` nor `loadRemote` nor `loadAny` appears as an export name, so reach them as `assetManager.loadRemote(url, optionsOrExt?, onComplete?)` (`src/cocos/asset/asset-manager/asset-manager.ts:649-651`). Its first statement is the URL-keyed short circuit: when `reloadAsset` is falsy and `assets.has(url)` it returns the cached asset immediately (`:654-656`), which is how a destroyed `AudioClip` or texture comes back after `destroy()` alone - `examples/audio-basic/main.js:523-530` documents exactly that recovery, and the fix is `assetManager.releaseAsset(asset)` (`src/cocos/asset/asset-manager/asset-manager.ts:754-755`, which runs `releaseManager.tryRelease(asset, true)`). `AssetBank` sidesteps the trap by always sending `reloadAsset: true` with an explicit `ext` (`src/air/assets/asset-bank.ts:362`).
- `AssetBank` (`src/air/assets/asset-bank.ts:146`, re-exported at `src/air/ui-kit.ts:142`) is a Promise wrapper with reference counting, not a second asset system: `load` (`:173`), `release` (`:264`), `refCount` (`:160`), `inFlightCount` (`:157`), `size` (`:154`), `releaseAll` (`:288`) and the hard-coded `static underlyingCancelSupported = false` (`:148`) are the whole public surface, and the generic `T` on `load` is a caller assertion the bank never checks (`:9`). The cache key is `url` alone or `` `${url}|ext=${ext.toLowerCase()}` `` (`:80-82`, lower-cased once at `:175`), so `ext` is part of identity and the same URL under two `ext` values is two entries.
- `ext` rules are strict: it must match `/^[a-zA-Z0-9]{1,16}$/` or `AIR_E_INVALID_EXT` throws (`:77`, `:94`), and a URL with no suffix requires an explicit `ext` or `AIR_E_EXT_REQUIRED` throws (`:85-90`, `:100`). The value reaches the engine as `.${ext}` with `reloadAsset: true` (`:362`); a suffix-only URL keeps the native cache path (`:365`). `signal` cancels the subscription only - the waiter is removed from the shared in-flight record (`:318`), the network request still completes, and an orphaned late result is balanced with a net-zero `addRef`/`decRef` pair (`:391-398`). Progress is honestly two-phase, `onProgress(0, 1)` at subscribe and `(1, 1)` at settle (`:328`, `:406`), because `loadRemote` exposes no task-level progress at all (`:144`). A cache hit is delivered in a microtask (`:212`, rationale `:188`), so a same-tick `abort` or `release` wins and refunds only that subscription (`:193-207`).
- The `AIR_E_*` codes are typed but not importable: `AirAssetErrorCode` is the union at `src/air/assets/asset-bank.ts:61-67` and `AirAssetError` the class at `:70`, both re-exported from `src/air/ui-kit.ts:143` as types only, so neither name resolves in the default bundle export block and you match on `err.code`. Throw sites: `AIR_E_ABORTED` at `:183`, `:207`, `:225`, `:320`, `:414` via `:428`; `AIR_E_PROGRESS_ERROR` at `:220`, `:332`, `:408`; `AIR_E_REVOKED` at `:301`, `:229`, `:414`; `AIR_E_LOAD_FAILED` at `:386` with the shared body at `:425-428`. `release` never force-releases (`:258-263`), and `releaseAll` revokes in-flight waiters under an identity guard so a late callback cannot delete a newer same-key record (`:290-302`, `:349`).
- A runtime texture is two objects. `ImageAsset` (`src/cocos/asset/assets/image-asset.ts:182`) describes CPU pixels and accepts `HTMLCanvasElement | HTMLImageElement | IMemoryImageSource | ImageBitmap` through `reset` (`:670`, `:154`); `Texture2D` (`src/cocos/asset/assets/texture-2d.ts:85`) is the GPU sampler. `texture.image = img` is `mipmaps = [img]` and clears every other level (`:161-163`, `:150-155`); `reset(info)` leaves the gfx resource invalid until you `uploadData` (`:192-202`, `src/cocos/asset/assets/simple-texture.ts:151`). There is no `generateMipmaps` method - levels come from `updateMipmaps(firstLevel, count)` (`src/cocos/asset/assets/texture-2d.ts:232`) and from create-time generation only when the mip filter is not `NONE` (`src/cocos/asset/assets/simple-texture.ts:325-329`), and the power-of-two test is skipped on WebGL2 (`:47-51`). Sampling is `setWrapMode`/`setFilters`/`setMipFilter`/`setAnisotropy` on `TextureBase` (`src/cocos/asset/assets/texture-base.ts:205`, `:226`, `:242`, `:256`), whose serialized wrap defaults are `REPEAT` (`:122`, `:128`, `:134`) - `docs/manual/textures.md:33` claims `CLAMP_TO_EDGE` and is stale. Over-size is a soft log, not a throw (`errorID(9100...)` at `src/cocos/gfx/webgl2/webgl2-commands.ts:931-933`), against `capabilities.maxTextureSize` (`src/cocos/gfx/webgl/webgl-device.ts:180`).
- `SpriteFrame` binding is untracked. `Sprite`'s `spriteFrame` setter and its `_applySpriteFrame` never call `addRef()` or `decRef()` (`src/cocos/2d/components/sprite.ts:207-218`, `:691`), and `Label.font` does the same for a `BitmapFont` (`src/cocos/2d/components/label.ts:466-487`), so a bound component is invisible to every handle guard in this skill. Ref before you bind and unref after you unbind (`docs/manual/atlas-loading.md:42`, `docs/manual/bitmap-font-loading.md:37`), and expect `AIR_E_ATLAS_IN_USE` (`src/air/assets/atlas/atlas-factory.ts:106` - `frame.refCount > 1`) or `AIR_E_FNT_IN_USE` (`src/air/assets/bmfont.ts:123`) when you forget.
- libGDX atlases: `parseAtlasText(text)` (`src/air/assets/atlas/atlas-parser.ts:143`) accepts the legacy (`xy` + `size`, `orig` + `offset`) and compact (`bounds`, `offsets`) dialects and rejects mixing them, unknown keys, and Creator `.plist` input (`:213-264`). `rect` keeps `xy` with top-left origin and no page flip (`src/air/assets/atlas/atlas-factory.ts:46`, ruling recorded at `:7-9` and `docs/manual/atlas-loading.md:35`), rotation stays a `rotated` flag rather than a rect change (`:43`), and the engine consumes `rect` as UV directly (`src/cocos/2d/assets/sprite-frame.ts:1038`, `:1088`). `createAtlasHandle` takes exactly one reference per page texture and per frame (`src/air/assets/atlas/atlas-factory.ts:89-90`) and destroys everything it built if any region fails (`:85-88`); `loadAtlas` is PNG-only on the auto path (`src/air/assets/atlas/atlas-loader.ts:48`, `:53`, `:57`) and indexes page loads by `pageIndex` so completion order cannot reorder textures (`:89`, `:96-107`).
- BMFont: `parseFnt` (`src/air/assets/bmfont.ts:36`) is text-dialect only - XML and binary input throws `AIR_E_FNT_FORMAT` (`:37`) - and enforces `pages=1`, `page id=0`, `char page=0` and unpacked (`:63`, `:64`, `:73`), so a multi-page or packed font never reaches the factory. `createBitmapFont` (`:104`) demands a full unrotated page matching `scaleW`/`scaleH` on both the frame rect and the texture (`:105-109`), else `AIR_E_FNT_PAGE_TEXTURE` (`:110`); a trimmed sub-rectangle cannot be a font page. `loadBitmapFont` (`:132`) loads the `.fnt` and one `.png` through a caller-supplied `AssetBank`, and the assembler picks the bmfont path whenever `comp.font instanceof BitmapFont` before `cacheMode` is consulted (`src/cocos/2d/assembler/label/index.ts:34-40`), which makes `cacheMode` effectively inert for a BMFont label (`src/cocos/2d/components/label.ts:489-495`).
- Keep the three capability layers apart. `assetManager`, `AssetManager`, `resources`, `loadAssetAsync`, `AssetBank`, `Texture2D`, `ImageAsset`, `SpriteFrame`, `SpriteAtlas`, `BitmapFont`, `Font`, `Asset`, `TextAsset`, `JsonAsset`, `EffectAsset`, `parseFnt`, `createBitmapFont`, `loadBitmapFont`, `parseAtlasText`, `createAtlasHandle`, `createAtlasSpriteFrame`, `loadAtlas` and `isValid` each resolve by symbol name in the single `export { ... }` block of `build/cocosair.module.js`; `load`, `loadRemote`, `loadAny`, `Bundle`, `PackManager`, `Config`, `Variant`, `Cache`, `SimpleTexture`, `TextureBase`, `AirAssetError` and `AirAssetErrorCode` do not, so those last two are compile-time-only shapes. Browser-verified at candidate fingerprint `2f089f6ce25eaccd`: `ui-asset-loading` binds `loadAssetAsync`, `ImageAsset`, `Texture2D` and `SpriteFrame.createWithImage` to `asset-loaded` and `AssetManager.releaseAsset` plus `Texture2D.destroy` to `resource-released`; `texture-basic` binds `ImageAsset`/`Texture2D` to `material-property`; `static-model` binds `loadAssetAsync` to `scene-ready` only; `texture2d-ops` binds twelve `Texture2D` members to `no-runtime-error` alone with `reads = 0`, so it proves the calls do not throw, not that pixels are correct. No `results[]` entry binds `AssetBank`, `loadRemote`, any atlas function or any bitmap-font function, and `docs/evidence/port-gap/eg3-installed-atlas-s11.json` (gate `EG3`, `execution.status: PASS`, `scope.subset: true`, `completed: false`) is the only tracked atlas record - `docs/manual/asset-bank-loading.md:5` states its own jsdom boundary too.

## Common Mistakes

### [HIGH] Assuming a resources bundle or Creator build output

Wrong:
```js
import { resources, load, loadRemote } from 'cocosair';   // load and loadRemote are not export names
const tex = await new Promise((r, j) => resources.load('panel', Texture2D, (e, a) => e ? j(e) : r(a)));
assetManager.init({ bundleVers: { resources: '1.0' } });  // nothing reads a Creator settings file here
```

Correct:
```js
import { assetManager, loadAssetAsync, Texture2D } from 'cocosair';
assetManager.assets.add('gen/panel', myTexture);          // register, then load by the same key
const tex = await loadAssetAsync('gen/panel', Texture2D);
const cfg = await loadAssetAsync('assets/panel-manifest.json');   // plain URL, no type argument
```

`resources` is an unregistered `new Bundle()` (`src/cocos/asset/asset-manager/bundle.ts:655`) whose `_config` has no addressable paths, so its `load` rejects with `Bundle resources doesn't contain panel` (`src/cocos/asset/asset-manager/url-transformer.ts:106`) while `assetManager.resources` is `null` (`src/cocos/asset/asset-manager/asset-manager.ts:369-370`) - the registry and the URL form are the two routes that actually resolve.

### [HIGH] Treating an AbortSignal as a network cancel

Wrong:
```js
const ctrl = new AbortController();
const p = bank.load('http://cdn/large.pkm', { ext: 'pkm', signal: ctrl.signal });
ctrl.abort();          // expecting the transfer to stop and bytes to be refunded
await p.catch(() => {});
```

Correct:
```js
const ctrl = new AbortController();
const p = bank.load(url, { ext: 'png', signal: ctrl.signal });
// abort only drops this waiter; keep the promise alive and ignore the result
const asset = await p.catch((e) => { if (e.code === 'AIR_E_ABORTED') return null; throw e; });
if (asset) bank.release(url, 'png');      // release the subscription you actually took
```

`AssetBank.underlyingCancelSupported` is the literal `false` (`src/air/assets/asset-bank.ts:148`) because `loadRemote` has no cancellation channel at all; abort removes this waiter from the shared in-flight record (`:318`) and lets the request finish, balancing an orphaned result with a net-zero ref pair (`:391-398`), so treating it as a bandwidth or teardown mechanism leaks the load you thought you cancelled.

### [HIGH] Copying the manual line that Label can only use system fonts

Wrong:
```js
// docs/manual/creating-text.md:38-39 says AIR has no font asset pipeline
label.useSystemFont = true;                 // and stops there
const font = await loadAssetAsync('assets/game.fnt');   // wrong helper for a typed font
```

Correct:
```js
const bank = new AssetBank();
const handle = await loadBitmapFont('assets/game.fnt', { bank });   // parses .fnt plus its single .png page
label.font = handle.font;          // untracked hold: no addRef from the Label setter
label.useSystemFont = false;       // the setter flips it, but be explicit at read time
// before disposing: label.font = null, then handle.dispose()
```

The runtime BMFont path is shipped and reachable (`src/air/assets/bmfont.ts:36`, `:104`, `:132`; re-exported at `src/air/index.ts:32`; assembler switch at `src/cocos/2d/assembler/label/index.ts:34-40`) - only the Creator font-asset workflow is missing, and `docs/manual/bitmap-font-loading.md:1-5` documents the delivered path.

### [MEDIUM] Suffix-less or trimmed-atlas URLs

Wrong:
```js
await bank.load('https://cdn/asset');                    // throws AIR_E_EXT_REQUIRED
await bank.load('https://cdn/asset', { ext: 'image/png' }); // throws AIR_E_INVALID_EXT (a MIME type is not an ext)
await loadAtlas('pack.atlas', { bank });                 // page file listed as "hero" with no suffix
const font = createBitmapFont(data, trimmedSubFrame);    // throws AIR_E_FNT_PAGE_TEXTURE
```

Correct:
```js
await bank.load('https://cdn/asset', { ext: 'png' });    // 1-16 alphanumerics; case is normalized, so 'PNG' also works
await loadAtlas('pack.atlas', { bank, pageExt: 'png' }); // explicit extension for suffix-less pages
const font = createBitmapFont(data, fullUnrotatedPage);   // frame rect 0,0,scaleW,scaleH and matching texture
```

`ext` is validated against `/^[a-zA-Z0-9]{1,16}$/` and is part of the cache key (`src/air/assets/asset-bank.ts:77`, `:94`, `:80-82`), a suffix-less page without `pageExt` is rejected by the loader (`src/air/assets/atlas/atlas-loader.ts:52-54`), and the font factory validates the whole page (`src/air/assets/bmfont.ts:105-109`) - all four failures are throws with stable codes, so read the code instead of retrying the same call.

## References

- `references/asset-bank.md` - the `AssetBank` public surface, every `AIR_E_*` throw site, cache-key and `ext` rules, subscriber-side `signal`, microtask cache hits, two-phase progress, `releaseAll` revoke ordering, the `loadAssetAsync` fallback chain, default bundle face, browser status.
- `references/texture2d.md` - `ImageAsset` and `Texture2D` construction and reset paths, `uploadData` and mipmap generation, wrap/filter/anisotropy setters and serialized defaults, enum inventories, format legality and `maxTextureSize` behavior, lifecycle helpers, which members only reach `no-runtime-error`.
- `references/atlas.md` - `parseAtlasText` dialects and key sets, the `AirAtlasDocument` shape, top-origin `rect.y` ruling and rotation, throw versus silent handling, `createAtlasHandle` ownership and the in-use guard, `loadAtlas` pipeline and abort semantics, tracked versus regenerable evidence.
- `references/bmfont.md` - `parseFnt` accepted records and every guard, the single-page constraint, `createBitmapFont` page validation and handle refs, `Label` selection and sizing and kerning key math, `loadBitmapFont` steps and error surface, the stale manual statement.

## Canonical docs

- `docs/guides/asset-loading.md` - open for the two `loadAssetAsync` overloads and the registry example; note it predates the glTF branch, so read its resolution order as incomplete.
- `docs/manual/asset-loading-and-lifetime.md` - open for the three entry points with their measured rejection messages and the five lifetime semantics the manual example asserts line by line.
- `docs/manual/asset-bank-loading.md` - open for the `AssetBank` contract page and its own statement of what jsdom evidence does not prove.
- `docs/manual/atlas-loading.md` - open for the top-origin ruling, the trim formula, the page-size guard, the no-automatic-`addRef` rule and the PNG-only auto path.
- `docs/manual/bitmap-font-loading.md` - open for the single-page rule, the `Label` binding contract, the scale reuse behavior and the error inventory.
- `docs/manual/textures.md` - open for the texture narrative and the format table; treat its default-wrap sentence as stale against `src/cocos/asset/assets/texture-base.ts:122`.
