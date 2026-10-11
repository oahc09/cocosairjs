Derived from the cocosair-assets skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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
