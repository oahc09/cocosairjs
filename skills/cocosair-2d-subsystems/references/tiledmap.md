Derived from `src/cocos/tiledmap/tiled-map.ts`, `src/cocos/tiledmap/tiled-layer.ts`, `src/cocos/tiledmap/tiled-object-group.ts`, `src/cocos/tiledmap/tiled-types.ts`, `src/cocos/tiledmap/tiled-tile.ts`, `src/cocos/tiledmap/assembler/simple.ts`, `src/cocos/2d/framework/ui-renderer.ts`, `examples/tiledmap-basic/main.js`, `docs/notes/tiled-map-notes.md`, `docs/manual/tiled-culling-and-dirty-state.md`, `docs/manual/tiled-object-queries.md`, `build/cocosair.module.js` (as of 2026-10-10).

# What it does

TiledMap renders a TMX map built entirely at run time from strings and sprite frames - there is no
Creator importer and no uuid graph. The bundle export block of `build/cocosair.module.js` (currently
`:161574`) carries `TiledMap`, `TiledMapAsset`, `TiledLayer`, `TiledObjectGroup`, `TiledTile` and
`TiledUserNodeData`. Layers and object groups are ordinary `UIRenderer` batched nodes, so they
inherit the UI camera and the `markForUpdateRenderData` dirty machinery.

# Construction chain (a bag of parallel arrays)

`_applyFile` zips `spriteFrameNames`, `spriteFrameSizes` and `spriteFrames` into lookup maps, zips
`tsxFileNames` with `tsxFiles[i].text`, then hands `tmxXmlStr` to `TMXMapInfo`
(`src/cocos/tiledmap/tiled-map.ts:340-388`, tsx map `:375-380`, parse call `:382`). A tileset whose
`sourceImage` has no matching frame logs `warnID(16406, i)` (`:478`) and drops those tiles.
`tmxAsset` assignment is what builds the layer nodes (`src/cocos/tiledmap/tiled-map.ts:104-110`),
and `__preload` applies lazily only if an asset was set before enable (`:327`), so assign the asset
first. `TiledMap.enableCulling` fans the value out to every layer (`:125-131`) and layer-level
`enableCulling` marks render data directly (`src/cocos/tiledmap/tiled-layer.ts:229-236`).

# The refresh ladder (culling dirty is not render-data dirty)

- `setTileGIDAt(gid, x, y, flags)` masks the flipped bits off the incoming gid (`src/cocos/tiledmap/tiled-layer.ts:693-694`), throws on an out-of-range cell (`:699`), and `flags` is the fourth argument (`:711`).
- `_updateTileForGID` writes the cell, patches vertex bookkeeping and sets only `_cullingDirty` (`src/cocos/tiledmap/tiled-layer.ts:714-731`, flag at `:730`).
- That flag is consumed inside `updateViewPort` (`src/cocos/tiledmap/tiled-layer.ts:865`), reached only through `updateCulling` when `_enableCulling` is true (`:910-933`, guard `:913`, camera re-resolve `:916`).
- The assembler calls `updateCulling` first (`src/cocos/tiledmap/assembler/simple.ts:115-116`) and rebuilds on `colorChanged || isCullingDirty() || isUserNodeDirty() || hasAnimation() || hasTiledNode() || node.hasChangedFlags` (`:119-120`, `destroyRenderData()` `:122`).
- But `updateRenderData` only runs when the renderer is already marked dirty, so the measured refresh for a runtime cell edit is `markForUpdateRenderData()` (`src/cocos/2d/framework/ui-renderer.ts:431-433`) or toggling the layer node active (`examples/tiledmap-basic/main.js:396-405` shows the ladder, reactivation at `:403-405`).
- TSX `<animation>` is the one path that refreshes by itself: `lateUpdate` swaps `_texGrids[gid]` and re-marks animated layers (`src/cocos/tiledmap/tiled-map.ts:645-659`).

# Object queries and coordinate rewriting

- `getObjectsByType('solid')` matches the TMX `class` (legacy `type`) string, while a number matches the `TMXObjectType` enum (`src/cocos/tiledmap/tiled-object-group.ts:179`, `className` declared at `src/cocos/tiledmap/tiled-types.ts:454`).
- `getRawObjects()` returns frozen snapshots of the original TMX numbers (`src/cocos/tiledmap/tiled-object-group.ts:174`, built at `:259-260`) because `_init` rewrites `object.x` and `object.y` in place and keeps the originals only in `object.offset` (`:263-284`, ortho flip `:284`, isometric divisor `tileSize.height` `:276-283`).
- Only TEXT and IMAGE objects get child nodes (`src/cocos/tiledmap/tiled-object-group.ts:286-300`); RECT, ELLIPSE, POLYGON and POLYLINE stay pure data.
- `TiledTile` exposes the cell through a `grid` accessor, not `gid` (`src/cocos/tiledmap/tiled-tile.ts:109-118`).

# Gotchas

- Editing a cell with `setTileGIDAt` changes data but not pixels until you call `markForUpdateRenderData` or reactivate the layer node; `setCullingDirty(true)` alone is never consumed with culling off.
- Passing `flags` in the third position mis-throws or drops flip bits; the signature order is `(gid, x, y, flags)` (`src/cocos/tiledmap/tiled-layer.ts:711`).
- Trusting `object.x` after `_init` gives the rewritten engine coordinate, not the authored TMX value; read `getRawObjects()` for the original (`src/cocos/tiledmap/tiled-object-group.ts:174`).
