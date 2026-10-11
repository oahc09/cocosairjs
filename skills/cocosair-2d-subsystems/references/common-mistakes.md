Derived from the cocosair-2d-subsystems skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

### [HIGH] Treating Spine as runnable out of the box

Wrong: `await loadWasmModuleSpine()` then `sk.skeletonData = data` - it resolves without loading anything and the skeleton renders no draw list with no exception, only one console warning.

Correct:

```js
import { sp } from 'cocosair';
const data = new sp.SkeletonData();                // the class is real and importable
console.warn('spine runtime backend not deployed: LV12-10 BLOCKED, no emscripten artifacts');
// deploy spine.wasm / spine.asm.js / spine.js.mem first, then delete the AIR shim override
```

The shim returns null from every `wasmUtil` stub (`src/cocos/spine/lib/air-spine-instantiate-js.ts:26-52`), `getRuntimeData()` therefore yields null (`src/cocos/spine/skeleton-data.ts:199-237`) and the skeleton bails at `src/cocos/spine/skeleton.ts:791`; the unblock path is recorded in `docs/notes/spine-asset-sourcing.md:43-47`.

### [HIGH] Expecting a TiledMap cell edit to redraw itself

Wrong: `layer.setTileGIDAt(2, 3, 1)` then `layer.setCullingDirty(true)` - data changes but pixels do not, and the culling flag is never consumed when culling is off.

Correct:

```js
const layer = map.getLayer('ground');
layer.setTileGIDAt(2, 3, 1, TiledMap.TileFlag.DIAGONAL);   // flags is the 4th argument
layer.markForUpdateRenderData();                            // or toggle layer.node.active false then true
```

`_updateTileForGID` sets only `_cullingDirty` (`src/cocos/tiledmap/tiled-layer.ts:714-731`), which is consumed at the end of `updateViewPort` (`:865`) and reached only through the culling path (`:913`); the measured refresh ladder in `examples/tiledmap-basic/main.js:396-405` shows node reactivation as the working rung.

### [HIGH] Copying Creator plist blend values into a code-first emitter

Wrong: reusing an exported plist that sets `blendFuncSource: 770, blendFuncDestination: 1` - those raw GL constants land out of the gfx `BlendFactor` range and the emitter simulates but draws nothing.

Correct:

```js
ps.custom = false;                    // true skips _initWithDictionary entirely
ps.file = particleAsset;              // dict came from assetManager.parser.parsePlist
ps.srcBlendFactor = 2;                // gfx BlendFactor.SRC_ALPHA
ps.dstBlendFactor = 1;                // gfx BlendFactor.ONE
```

`_initWithDictionary` writes the plist integers straight into `BlendFactor` slots (`src/cocos/particle-2d/particle-system-2d.ts:1062-1063`) whose enum ends at 14 (`src/cocos/gfx/base/define.ts:505-521`), and a missing `particleLifespan` makes `life` 0 which zeroes the emission clamp (`src/cocos/particle-2d/particle-system-2d.ts:1047`, `:1055`) - both cases simulate perfectly and draw nothing.

### [MEDIUM] Importing names the bundle does not export

Wrong: `import { MotionStreak2D }` and `skeleton.registerSpineEventHandler(handler, sp.AnimationEventType.START)` - neither name exists here, and the streak wants a `Texture2D` not a `SpriteFrame`.

Correct:

```js
import { MotionStreak, sp } from 'cocosair';
const skeleton = node.addComponent(sp.Skeleton);
skeleton.setStartListener((entry) => console.log(entry.animation.name));     // or setEventListener
const streak = node.addComponent(MotionStreak);   // class name is cc.MotionStreak
streak.texture = texture;                          // a Texture2D, not a SpriteFrame
```

The export block of `build/cocosair.module.js` (currently `:161574`) has `MotionStreak` and `MotionStreakAssemblerManager` and no `MotionStreak2D`; `registerSpineEventHandler` matches nothing in `src/`, and `MotionStreak.texture` is typed as a raw texture (`src/cocos/particle-2d/motion-streak-2d.ts:143`).

### [MEDIUM] Reusing Creator asset conventions for atlas and paths

Wrong: `atlasAsset.atlasJson = await assetManager.loadRemote(...)` and `ps.file = await assetManager.loadRemote(...)` - the setters want raw text and a parsed plist, and a `loadRemote` plist arrives as a bare `Asset`.

Correct:

```js
atlasAsset.atlasJson = text;                     // raw string; the setter parses it
atlasAsset.texture = wrappedTexture2D;           // ImageAsset must be wrapped first
particleAsset._nativeAsset = parsedPlistDict;    // parse the plist yourself, then hand it over
ps.file = particleAsset;
ms.texture = texture;                            // Texture2D, not SpriteFrame
```

The `atlasJson` and `dragonBonesJson` setters parse text (`src/cocos/dragon-bones/DragonBonesAtlasAsset.ts:53-59`, `src/cocos/dragon-bones/DragonBonesAsset.ts:58`), a `loadRemote` plist arrives as a bare `Asset` (`docs/notes/particle-2d-notes.md:45`), and `examples/dragonbones-basic/main.js:239-252` shows the required `ImageAsset` to `Texture2D` wrap before the atlas asset will accept a texture.
