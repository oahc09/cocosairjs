Derived from `src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts`, `src/cocos/2d/utils/dynamic-atlas/atlas.ts`, `src/cocos/2d/assets/sprite-frame.ts`, `src/cocos/asset/assets/texture-base.ts`, `src/cocos/2d/assembler/label/text-processing.ts`, `src/cocos/2d/renderer/batcher-2d.ts`, `src/cocos/2d/renderer/render-data.ts`, `src/cocos/2d/renderer/static-vb-accessor.ts`, `src/cocos/core/platform/macro.ts`, `src/cocos/root.ts`, `src/air/ui-mesh.ts`, `src/air/texture-sprite.ts`, `docs/manual/ui-textured-mesh.md`, `docs/evidence/examples-verified.json`, `build/cocosair.module.js` (as of 2026-10-09).

## Default state: dynamic atlas is OFF in a running AIR app

`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:45` declares `class DynamicAtlasManager extends System`. The field default is `private _enabled = false` (`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:56`).

The only code that turns it on is `init()` (`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:169-171`), which is marked `@internal` and does `this.enabled = !macro.CLEANUP_IMAGE_CACHE`. Nothing in `src/` calls it, and the built bundle contains no call to it either, so the singleton stays disabled. To use dynamic atlas you must set `dynamicAtlasManager.enabled = true` yourself.

Turning it on has a side effect you cannot undo locally: the `enabled` setter (`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:72-84`) calls `reset()` in both directions, destroying every existing atlas texture, and while enabling it subscribes `beforeSceneLoad` to `DirectorEvent.BEFORE_SCENE_LAUNCH` (`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:77`), which resets all atlases on every scene launch (`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:162-164`).

Knob defaults and their setters:

| Member            | Default | Source line                                                           |
| ----------------- | ------- | --------------------------------------------------------------------- |
| `maxAtlasCount`   | 5       | `src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:51`, setter `:96`  |
| `textureSize`     | 2048    | `src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:52`, setter `:135` |
| `maxFrameSize`    | 512     | `src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:53`, setter `:149` |
| `textureBleeding` | true    | `src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:54`, setter `:121` |
| `enabled`         | false   | `src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:56`, setter `:72`  |

The `textureSize` and `maxAtlasCount` setters only store the value; they do not resize or rebuild atlases already created, so change them before any frame is packed.

Singleton and registration: `export const dynamicAtlasManager = DynamicAtlasManager.instance = new DynamicAtlasManager()` at `src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:303` (the lowercase alias is doc-marked deprecated in favor of `DynamicAtlasManager.instance`), registered as a director system at `:305`, and mirrored on `cclegacy.internal.dynamicAtlasManager` at `:307`. `DynamicAtlasManager` and `dynamicAtlasManager` both appear in the single `export { ... }` block of `build/cocosair.module.js` (currently :161574).

## Acceptance rules (silent null, no exception)

`insertSpriteFrame` (`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:183`) returns `null`, without logging, when any of these hold (`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:188-198`):

- manager not enabled, or `this._atlasIndex >= this._maxAtlasCount`
- falsy sprite frame, or `spriteFrame.original` is set (a frame that is already a sub-rectangle of a source page)
- `spriteFrame.packable` is false
- sampler is not `minFilter LINEAR`, `magFilter LINEAR`, `mipFilter NONE` (the pixel-game filter guard)

`packToDynamicAtlas(comp, frame)` (`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:286-296`) is the path used by assemblers; it returns early unless `frame && !frame.original && frame.packable && frame.texture && frame.texture.width > 0 && frame.texture.height > 0`, and only on a non-null result calls `frame._setDynamicAtlasFrame(packedFrame)`.

Layout inside one atlas, `src/cocos/2d/utils/dynamic-atlas/atlas.ts`: `const space = 2` (`:32`) is the gap between frames; when the row cursor passes the atlas height the frame is refused (`if (this._nextY > this._height) { return null; }`, `:105-107`); when bleeding is enabled, frames with `width <= 8 || height <= 8` get extra edge copies (`:112-124`). `DynamicAtlasTexture extends Texture2D` at `:229`.

## What makes a SpriteFrame packable

`SpriteFrame._packable` defaults to `true` (`src/cocos/2d/assets/sprite-frame.ts:625`), exposed as `packable` (`:522-527`). `_checkPackable()` (`src/cocos/2d/assets/sprite-frame.ts:1175-1197`) sets it to `false` when the texture is not a `Texture2D` or is compressed, or when `!texture.image` or `width > dynamicAtlas.maxFrameSize` or `height > dynamicAtlas.maxFrameSize`; it sets `true` for canvas-backed images. `SpriteFrame.destroy()` first releases its atlas slot when packable (`src/cocos/2d/assets/sprite-frame.ts:942-946`).

Related manager API: `reset()` destroys all atlases (`src/cocos/2d/utils/dynamic-atlas/atlas-manager.ts:222`), `deleteAtlasSpriteFrame` (`:240`), `deleteAtlasTexture` (`:262`).

`macro.CLEANUP_IMAGE_CACHE` is `false` on web (`src/cocos/core/platform/macro.ts:1132`) and forced `true` only for JSB/minigame/runtime-based targets (`src/cocos/core/platform/macro.ts:1140`), so the `init()` path would enable the atlas on web; it is simply never invoked.

## Texture identity, batching, and the internal descriptor-set cache

Batch membership is keyed on texture hash: `dataHash = murmurhash2_32_gc(`${bufferId}${layer} ${textureHash}`, 666)` (`src/cocos/2d/renderer/render-data.ts:460-463`), consumed by the break predicate in `src/cocos/2d/renderer/batcher-2d.ts:453`. A new texture object therefore starts a new batch even for identical pixels.

When a texture object is destroyed or replaced, the batcher's cached descriptor sets for the old texture hash must be dropped. This is an engine-internal mechanism, not a public API: `Batcher2D._releaseDescriptorSetCache` (`src/cocos/2d/renderer/batcher-2d.ts:993`) is doc-marked `@engineInternal`, and the comment directly above it states that although it is a private method it is invoked from text processing and texture destruction (`src/cocos/2d/renderer/batcher-2d.ts:987-988`). The in-tree callers are `TextureBase.destroy()` (`src/cocos/asset/assets/texture-base.ts:271-273`), label texture replacement (`src/cocos/2d/assembler/label/text-processing.ts:612` and `:614`), and AIR's texture sprite helper (`src/air/texture-sprite.ts:32`), all reached through `director.root.batcher2D` (`src/cocos/root.ts:153`). Do not call it from application code; release or replace the texture asset and the engine invalidates the cache.

The static vertex buffer accessor that holds baked UI geometry is sized from `macro.BATCHER2D_MEM_INCREMENT` (`src/cocos/2d/renderer/static-vb-accessor.ts:90-91`); `docs/manual/ui-textured-mesh.md:23` warns not to lower that macro below what a single component's geometry needs.

## AirUIMesh texture leases (the claim/release contract)

`AirUIMesh` (`src/air/ui-mesh.ts:83`, `@ccclass('AirUIMesh')`, requires `UITransform`) is the AIR UI component that submits arbitrary UV triangles through the native 2D batcher. Its assembler callback packs into the atlas and then renews leases: `dynamicAtlasManager.packToDynamicAtlas(mesh, frame)` followed by `mesh.refreshFrame()` (`src/air/ui-mesh.ts:38-39`).

Lease facts:

- `_textureLeases = new Set<TextureBase>()` (`src/air/ui-mesh.ts:86`) holds the texture references the component keeps alive.
- `refreshFrame()` (`src/air/ui-mesh.ts:121-129`) is doc-marked internal and adds one `addRef()` for `this._frame?.texture` and one for the original page texture `this._frame?.original?._texture`, each only when not already in the set, then marks `renderData.textureDirty`. Keeping the original page alive is what makes atlas restoration possible.
- The `spriteFrame` setter (`src/air/ui-mesh.ts:91-102`) throws `AIR_E_UI_MESH_DISPOSED` after disposal and `AIR_E_UI_MESH_FRAME` for an invalid value, refs the new texture and frame, releases the previous ones through `releaseFrame()`, records the new texture in `_textureLeases`, and subscribes `SpriteFrameEvent.UV_UPDATED` (`:102`).
- `releaseFrame()` (`src/air/ui-mesh.ts:134-137`) unsubscribes the event, `decRef()`s the frame and `decRef()`s and clears every leased texture. It never destroys the shared assets.
- `dispose()` (`src/air/ui-mesh.ts:112-115`) is idempotent, clears geometry/render data and releases leases; `onDestroy()` delegates to it (`src/air/ui-mesh.ts:116`). Later assignment of a frame or geometry throws `AIR_E_UI_MESH_DISPOSED`.
- Submission goes through the batcher: `_render(renderer)` calls `renderer.commitComp(this, this.renderData, this._frame, assembler, null)` (`src/air/ui-mesh.ts:119`, `commitComp` at `src/cocos/2d/renderer/batcher-2d.ts:429`).
- Capacity: `copyGeometry` requires 3..1024 XY vertices (`src/air/ui-mesh.ts:25`) and 1..1365 triangles, enforced as `indices.length` between 3 and 4095 and divisible by 3 (`src/air/ui-mesh.ts:29`); UVs must be finite and inside `[0, 1]` (`src/air/ui-mesh.ts:28`), and each accepted call returns deep-frozen copies so later mutation of the caller arrays cannot change rendering (`src/air/ui-mesh.ts:31`, `docs/manual/ui-textured-mesh.md:23`).

`docs/manual/ui-textured-mesh.md:27` states the same contract: the component holds independent references to the sprite frame, the original page and the dynamic atlas texture it used; rebinding or `dispose()` releases only those references and does not force-destroy shared resources, and to free an old texture immediately you unbind and then re-set. `docs/manual/ui-textured-mesh.md:25` states that a default material batches with sprites of the same texture, while different material, texture, or mask stencil splits the batch per native rules.

## Verification status

`DynamicAtlasManager`, `dynamicAtlasManager`, `AirUIMesh` and `UIStaticBatch` resolve by symbol name on the default bundle face (`build/cocosair.module.js`, currently :161574). `docs/evidence/examples-verified.json` (`measuredAt` 2026-10-04T05:52:32.537Z, `candidateFingerprint` 2f089f6ce25eaccd) has no `results[]` entry for dynamic atlas packing or for `AirUIMesh` batching behaviour, so atlas acceptance, bleeding, lease counting and batch-count effects are UNPROVEN in a browser at that fingerprint.
