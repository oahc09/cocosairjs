Derived from `src/air/assets/asset-bank.ts`, `src/air/ui-kit.ts`, `src/air/utils/load-asset.ts`, `src/cocos/asset/asset-manager/asset-manager.ts`, `src/cocos/asset/asset-manager/index.ts`, `docs/guides/asset-loading.md`, `docs/manual/asset-bank-loading.md`, `docs/manual/asset-loading-and-lifetime.md`, `build/cocosair.module.js`, `docs/evidence/examples-verified.json`, `examples/runtime-asset-release/src/main.ts`, `examples/ui-asset-loading/src/main.ts`, `test/smoke/port-gap-asset-bank.test.ts`, `test/smoke/port-gap-asset-bank-races.test.ts`, `test/fixtures/asset-bank-browser/main.ts` (as of 2026-10-09).

`AssetBank` is AIR's reference-counted wrapper over the engine `assetManager.loadRemote`; it is a Promise API, not a new asset system. The class is at `src/air/assets/asset-bank.ts:146`; its re-export site is `src/air/ui-kit.ts:142`. `docs/manual/asset-bank-loading.md` is the module's own contract page, and it states the evidence boundary itself: the Jest suites at controlled `loadRemote`/`loadAny` stubs plus jsdom are not real network or browser evidence (`docs/manual/asset-bank-loading.md:5`). The engine loading contract lives in `docs/guides/asset-loading.md` and `docs/manual/asset-loading-and-lifetime.md`; read those for narrative, use this page for the exact codes and limits.

## Public surface

| Member                             | Declaration                        | What it does                                                                                                                                                                                                                                                        |
| ---------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load<T>(url, optionsOrProgress?)` | `src/air/assets/asset-bank.ts:173` | Loads or joins the in-flight load; legacy `load(url, onProgress?)` and incremental `load(url, { ext?, signal?, onProgress? })` both route through `normalizeOptions` (`:104`). Generic `T` is a caller assertion only, the bank never infers a type from it (`:9`). |
| `release(url, ext?)`               | `:264`                             | Drops one subscription; when the local count reaches zero the bank `decRef`s only its own engine reference and returns `true` (`:270-274`). Never force-releases (`:258-263`).                                                                                      |
| `refCount(url, ext?)`              | `:160`                             | Subscriber refcount of a cached entry, `0` when absent; `ext` participates in the key (`:162`).                                                                                                                                                                     |
| `inFlightCount`                    | `:157`                             | Number of unsettled in-flight records (test observation surface).                                                                                                                                                                                                   |
| `size`                             | `:154`                             | Number of banked entries.                                                                                                                                                                                                                                           |
| `releaseAll()`                     | `:288`                             | Releases every cached entry and revokes in-flight waiters, returns the count released (`:290-304`).                                                                                                                                                                 |
| `static underlyingCancelSupported` | `:148`                             | Hard-coded `false`: the underlying `loadRemote` has no network cancel (`:147`).                                                                                                                                                                                     |

## Error codes and exact throw sites

`AirAssetErrorCode` is the union at `src/air/assets/asset-bank.ts:61-67`; every throw constructs `AirAssetError` (`:70`).

| Code                   | Message shape                              | Throw site                                                                                                                     |
| ---------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `AIR_E_INVALID_EXT`    | `ext must match /^[a-zA-Z0-9]{1,16}$/`     | `assertValidExt` `:94`; pattern declared `:77`                                                                                 |
| `AIR_E_EXT_REQUIRED`   | `suffix-less URL requires an explicit ext` | `assertSuffixRule` `:100`, guarded by `hasUrlSuffix` `:85-90`                                                                  |
| `AIR_E_ABORTED`        | `subscription aborted before load`         | `load` entry, pre-aborted signal `:183`                                                                                        |
| `AIR_E_ABORTED`        | `cached subscription aborted`              | cache-hit abort handler `:207`; in-callback self-abort `:225`; `_join` subscriber cancel `:320`; settle-time `:414` via `:428` |
| `AIR_E_PROGRESS_ERROR` | `onProgress threw`                         | cache-hit callback `:220`; `_join` first-phase `:332`; settle-time `:408` via `:428`                                           |
| `AIR_E_REVOKED`        | `... revoked by releaseAll`                | `releaseAll` in-flight loop `:301`; cache-hit entry removed mid-tick `:229`; settle-time `:414`                                |
| `AIR_E_LOAD_FAILED`    | `load failed: <url> (<cause>)`             | `_settle` on `err`/no-asset `:386`; the shared `_settleOneFailed` body is `:425-428`                                           |

## Semantics pinned from source

- Cache key: `cacheKey(url, ext)` = `url` with no ext, else `${url}|ext=${ext.toLowerCase()}` (`src/air/assets/asset-bank.ts:80-82`); the caller's `ext` is lower-cased once at `:175`, so differing `ext` values never merge.
- Explicit `ext` is passed to the engine as `.${ext}` plus `reloadAsset: true` (`:362`) to bypass the engine's URL-keyed early cache return at `src/cocos/asset/asset-manager/asset-manager.ts:654`; a suffix-only URL keeps the native cache path (`:365`).
- `signal` is subscriber-side only: abort removes just that waiter from the shared `InFlight` record (`:318`), the underlying request still completes; a fully orphaned late result is handled with a net-zero `addRef`/`decRef` pair (`:391-398`).
- A cache hit is delivered inside a microtask (`:212`, rationale `:188`), so a same-tick `abort`/`release`/`releaseAll` lands before delivery and only this subscription is refunded (`:193-207`).
- Progress reporting is two-phase honest: `onProgress(0, 1)` at subscribe (`:328`) and `onProgress(1, 1)` at settle (`:406`); `loadRemote` exposes no task-level progress (`:144`).
- `releaseAll` deletes every banked entry and its engine ref, marks each in-flight record revoked, then rejects all waiters (`:290-302`); a revoked late callback cannot delete a newer same-key record because of the identity guard `_deleteInFlight` (`:349`).

## Engine loading surface and AIR fallback chain

The remote entry `assetManager.loadRemote` has overloads at `src/cocos/asset/asset-manager/asset-manager.ts:649-651`; the singleton `assetManager` is created at `:868` and re-exported at `src/cocos/asset/asset-manager/index.ts:28`. `loadAssetAsync` (`src/air/utils/load-asset.ts:32` typed overload, `:38` url overload, `:39` impl) resolves in this order: GLTF route when `type === GLTFAsset` or the path is a gltf/glb (`:40-43`); a `resources` bundle when present (`:47-51`); otherwise the Code First registry `assetManager.assets.get(path)` gated on `instanceof type` (`:60-62`), and a URL `fetch` + engine `deserialize` with a plain-JSON fallback (`:68-77`). Failure messages: not-found throws at `:64`, HTTP non-ok throws `[cocosair] loadAssetAsync failed: <url> (<status>)` at `:70`.

## Default bundle face

Resolved by symbol name against the single `export { ... }` block of `build/cocosair.module.js` (the file the npm package ships as `cocosair.js`), not by importing from `src/`.

| Symbol              | Reaches the default face by name                  |
| ------------------- | ------------------------------------------------- |
| `AssetBank`         | yes, via `src/air/ui-kit.ts:142`                  |
| `assetManager`      | yes                                               |
| `loadAssetAsync`    | yes                                               |
| `ImageAsset`        | yes                                               |
| `Texture2D`         | yes                                               |
| `AirAssetError`     | no - `ui-kit.ts:143` re-exports it as a type only |
| `AirAssetErrorCode` | no - type only                                    |
| `load`              | no - not a bundle-face name                       |
| `loadRemote`        | no - reach it as `assetManager.loadRemote`        |

## Browser verification status

`docs/evidence/examples-verified.json` (file-level `measuredAt` 2026-10-04T05:52:32.537Z, top-level `candidateFingerprint` 2f089f6ce25eaccd; each `results[]` entry carries its own `candidateFingerprint` 2f089f6ce25eaccd and no `measuredAt`). No entry binds the `AssetBank` name at all: `AssetBank`, `AirAssetError`, `AirAssetErrorCode`, and `loadRemote` are therefore documented from source and jsdom smoke tests (`test/smoke/port-gap-asset-bank.test.ts`, `test/smoke/port-gap-asset-bank-races.test.ts`), and there is a browser fixture at `test/fixtures/asset-bank-browser/main.ts`, none of which appears in the examples evidence.

The two adjacent example ids prove the engine path, not the bank:

- `runtime-asset-release` (result PASS): binds `GLTFLoader` (`scene-ready`), `GLTFLoader.parseAsync` (`asset-loaded`), `GLTFAsset.instantiate` and `GLTFAsset.destroy` (`resource-released`). See `examples/runtime-asset-release/src/main.ts`.
- `ui-asset-loading` (result PASS): binds `loadAssetAsync` (`asset-loaded`), `ImageAsset`, `Texture2D` and `SpriteFrame.createWithImage` (`asset-loaded`), `AssetManager.releaseAsset` and `Texture2D.destroy` (`resource-released`), `math.Color` (`visible-frame`). It constructs textures with `new ImageAsset(canvas)` and never imports `AssetBank` (`examples/ui-asset-loading/src/main.ts:94`).

No recorded id proves `AssetBank.load`, the `signal`/`releaseAll` revoke paths, or the `AIR_E_*` codes in a real browser.
