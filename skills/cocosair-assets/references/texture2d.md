Derived from `src/cocos/asset/assets/texture-2d.ts`, `src/cocos/asset/assets/image-asset.ts`, `src/cocos/asset/assets/simple-texture.ts`, `src/cocos/asset/assets/texture-base.ts`, `src/cocos/asset/assets/asset-enum.ts`, `src/cocos/gfx/webgl2/webgl2-commands.ts`, `src/cocos/gfx/webgl/webgl-device.ts`, `docs/manual/textures.md`, `docs/evidence/examples-verified.json`, `examples/texture-basic/src/main.ts`, `examples/texture2d-ops/src/main.ts`, `build/cocosair.module.js` (as of 2026-10-09).

A runtime texture is two objects: an `ImageAsset` (CPU-side pixel description) and a `Texture2D` (GPU sampling object). `ImageAsset` is at `src/cocos/asset/assets/image-asset.ts:182`, `Texture2D` at `src/cocos/asset/assets/texture-2d.ts:85` and extends `SimpleTexture` (`src/cocos/asset/assets/simple-texture.ts:61`) which extends `TextureBase` (`src/cocos/asset/assets/texture-base.ts:42`). `docs/manual/textures.md` is the narrative; this page carries the inventories and limits.

## Construction and reset paths

| Member                                                   | Declaration                                 | Contract                                                                                                                                                                                                           |
| -------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `new Texture2D(name?)`                                   | `src/cocos/asset/assets/texture-2d.ts:86`   | Empty texture until an image or reset.                                                                                                                                                                             |
| `reset(info: ITexture2DCreateInfo)`                      | `:192-202`                                  | Sets width/height/format; `mipmapLevel` defaults to 1 (`:196`), `baseLevel` to 0 (`:198`), `maxLevel` to 1000 (`:199`); after reset the gfx resource is invalid and you must `uploadData` explicitly (`:186-189`). |
| `ITexture2DCreateInfo`                                   | `:38-78`                                    | `width`, `height` required; `format` defaults `RGBA8888` (`:54`), `mipmapLevel`/`baseLevel`/`maxLevel` optional (`:63,70,77`).                                                                                     |
| `create(w, h, format, mipmapLevel, baseLevel, maxLevel)` | `:217`                                      | Deprecated positional alias that forwards to `reset` (`:218-225`); default `format = PixelFormat.RGBA8888` (`:217`).                                                                                               |
| `image` setter                                           | `:161-163`                                  | `this.image = img` equals `this.mipmaps = [img]` and clears all prior mipmaps (`:150-155`).                                                                                                                        |
| `mipmaps` setter                                         | `:99-116`                                   | One level calls `extractMipmaps`; multiple levels call `extractMipmap0` per level, then `_setMipmapParams` triggers a `reset` (`:121-147`).                                                                        |
| `new ImageAsset(nativeAsset?)`                           | `src/cocos/asset/assets/image-asset.ts:644` | If an argument is present it calls `reset` (`:660-662`).                                                                                                                                                           |
| `ImageAsset.reset(data)`                                 | `:670`                                      | Accepts `ImageSource` (`:154`: `HTMLCanvasElement \| HTMLImageElement \| IMemoryImageSource \| ImageBitmap`); a memory source sets `_format` from `data.format` (`:676`).                                          |
| `IMemoryImageSource`                                     | `:141-148`                                  | `{ _data, _compressed, width, height, format, mipmapLevelDataSize? }`.                                                                                                                                             |

## Upload, mipmap, and sampling APIs

`uploadData(source, level = 0, arrayIndex = 0)` (`src/cocos/asset/assets/simple-texture.ts:151`) returns early with no GPU texture (`:152`); an `ArrayBufferView` goes through `copyBuffersToTexture`, an HTML element or `ImageBitmap` through `copyTexImagesToTexture` (`:176-180`). Mipmap levels come from `updateMipmaps(firstLevel, count)` (`src/cocos/asset/assets/texture-2d.ts:232`) and `updateImage()` (`src/cocos/asset/assets/simple-texture.ts:119`). There is no `generateMipmaps` method and no `GraphicsTexturable` interface in the tree.

Sampling is set on `TextureBase`: `setWrapMode(wrapS, wrapT, wrapR?)` where `wrapR` defaults to `wrapS` (`src/cocos/asset/assets/texture-base.ts:205-206`), `setFilters(minFilter, magFilter)` (`:226`), `setMipFilter(mipFilter)` (`:242`), `setAnisotropy(a)` clamped to a max of 16 (`:256-257`). Mipmaps are generated at create time only when `_mipFilter !== NONE` and `canGenerateMipmap` passes (`src/cocos/asset/assets/simple-texture.ts:325-329`); `canGenerateMipmap` applies the power-of-two test only when `device.gfxAPI === API.WEBGL`, so WebGL2 always passes (`:47-51`).

## Enum values

| Enum                           | Declaration                                | Members                                                                                             |
| ------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| `WrapMode`                     | `src/cocos/asset/assets/asset-enum.ts:269` | `REPEAT` (`:276`), `CLAMP_TO_EDGE` (`:283`), `MIRRORED_REPEAT` (`:290`), `CLAMP_TO_BORDER` (`:297`) |
| `TextureFilter` (aka `Filter`) | `:306`                                     | `NONE` (`:307`), `LINEAR` (`:314`), `NEAREST` (`:321`)                                              |
| `PixelFormat`                  | `:42`                                      | maps to `gfx.Format`; compressed families are the PVR/ETC/ASTC entries (`:138-260`)                 |

Defaults serialized on `TextureBase`: `_format = RGBA8888` (`src/cocos/asset/assets/texture-base.ts:98`), `_minFilter`/`_magFilter = LINEAR` (`:104,110`), `_mipFilter = NONE` (`:116`), `_wrapS`/`_wrapT`/`_wrapR = REPEAT` (`:122,128,134`). `docs/manual/textures.md:33` states the default wrap is `CLAMP_TO_EDGE`; the source default fields are `REPEAT` (lines above), so treat that doc line as stale.

## Format legality and size limits

`_setGFXFormat` coerces an undefined format to `RGBA8888` (`src/cocos/asset/assets/texture-base.ts:359-361`); `_getGFXPixelFormat` folds `RGBA_ETC1` into `RGB_ETC1` and the two `RGB_A_PVRTC_*` alpha-atlas formats into their RGB variants (`:363-372`). Normal image files such as png/jpg yield `RGBA8888` only (`src/cocos/asset/assets/asset-enum.ts:34-36`); the other uncompressed formats come from raw CPU data, and the compressed set is flagged by `ImageAsset.isCompressed` (`src/cocos/asset/assets/image-asset.ts:608-611`). The device ceiling is `capabilities.maxTextureSize`, read from GL `MAX_TEXTURE_SIZE` (`src/cocos/gfx/webgl/webgl-device.ts:180`). Exceeding it at create time is a soft log, not a throw: `errorID(9100, maxSize, maxTextureSize)` at `src/cocos/gfx/webgl2/webgl2-commands.ts:931-933`. A CPU upload whose computed element length is not an integer is a hard `assertID(Number.isInteger(length), 9101)` at `src/cocos/gfx/webgl2/webgl2-commands.ts:2826`.

## Identity and lifecycle helpers

- The recognized image extensions are the `private static` `ImageAsset.extnames`: `.png, .jpg, .jpeg, .bmp, .webp, .pvr, .pkm, .astc` (`src/cocos/asset/assets/image-asset.ts:631`, consumed internally at `:721` and `:755`) - a format inventory, not an API you read from user code.
- `Texture2D.initDefault(uuid?)` builds an `ImageAsset` via its own `initDefault` and assigns it to `image` (`src/cocos/asset/assets/texture-2d.ts:357-362`); `ImageAsset.initDefault` reuses one shared 2x2 magenta canvas placeholder (`src/cocos/asset/assets/image-asset.ts:790-803`).
- `Texture2D.validate()` is true only when `mipmaps.length` is non-zero (`src/cocos/asset/assets/texture-2d.ts:364`); `ImageAsset.validate()` is `!!this.data` (`src/cocos/asset/assets/image-asset.ts:805`).
- `Texture2D.destroy()` clears `_mipmaps` and `_generatedMipmaps` before the base destroy (`src/cocos/asset/assets/texture-2d.ts:262-265`); `Texture2D.description()` and `toString()` report the mip0 url and dimension (`src/cocos/asset/assets/texture-2d.ts:273,228`).
- `getGFXTexture()` returns the internal texture view (`src/cocos/asset/assets/simple-texture.ts:105`) and `getGFXSampler()` lazily acquires one from the device (`src/cocos/asset/assets/texture-base.ts:307`).

## Default bundle face

Resolved by symbol name against the single `export { ... }` block of `build/cocosair.module.js` (the file the npm package ships as `cocosair.js`). `Texture2D` and `ImageAsset` resolve by symbol name; `SimpleTexture` and `TextureBase` do not appear as exported names, so they are reached only through a `Texture2D` instance and its inherited methods, not by import. The `PixelFormat`/`WrapMode`/`Filter` enums are reached as statics on `TextureBase` (`src/cocos/asset/assets/texture-base.ts:80-92`), which is not itself an importable name.

## Browser verification status

From `docs/evidence/examples-verified.json` (top-level `measuredAt` 2026-10-04T05:52:32.537Z; each `results[]` entry carries `candidateFingerprint` 2f089f6ce25eaccd and no `measuredAt`):

- `texture-basic` (result PASS): `ImageAsset` and `Texture2D` are bound to the `material-property` validator (a real property readback on a rendered material), and `Texture2D.destroy` to `resource-released`. This is the strongest texture evidence.
- `texture2d-ops` (result PASS): `Texture2D.constructor/.reset/.image/.mipmaps/.updateMipmaps/.validate/.description/.toString/.releaseTexture/.initDefault/.getHtmlElementObj` are bound only to `no-runtime-error`, and only `Texture2D.create` to `visible-frame`; all record `reads = 0`. This proves the methods run without throwing, not that they produce correct pixels.
- `texture2d-serialization` (result PASS): `Texture2D._serialize/_deserialize/onLoaded` are `no-runtime-error`; `_mipmaps` is `proof = attested` bound to `visible-frame`.

`uploadData`, `setWrapMode`, `setFilters`, `setMipFilter`, and `setAnisotropy` are not bound to any texture example, so they are documented from source only. The procedural checkerboard path in `examples/texture-basic/src/main.ts` sets `texture.image`, which is the source-backed route described above.
