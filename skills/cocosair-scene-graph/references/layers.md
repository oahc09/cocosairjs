Derived from src/cocos/scene-graph/layers.ts, src/cocos/rendering/scene-culling.ts, src/cocos/2d/renderer/batcher-2d.ts, src/cocos/2d/framework/ui-transform.ts, src/cocos/rendering/define.ts, src/cocos/misc/camera-component.ts, src/cocos/render-scene/scene/camera.ts, src/cocos/game/game.ts, src/air/bootstrap.ts, docs/manual/creating-a-scene.md, docs/manual/cameras.md (as of 2026-10-09)

## Layers bit table (src/cocos/scene-graph/layers.ts:34-46)

Values are read verbatim from the internal `layerList`; `Layers.Enum` and `Layers.BitMask` (layers.ts:66, :72) both expose these.

| Name             | Expression   | Decimal      | Bits (0-indexed) | Reserved? |
| ---------------- | ------------ | ------------ | ---------------- | --------- |
| `NONE`           | `0`          | `0`          | -                | -         |
| `IGNORE_RAYCAST` | `1 << 20`    | `1048576`    | 20               | yes       |
| `GIZMOS`         | `1 << 21`    | `2097152`    | 21               | yes       |
| `EDITOR`         | `1 << 22`    | `4194304`    | 22               | yes       |
| `UI_3D`          | `1 << 23`    | `8388608`    | 23               | yes       |
| `SCENE_GIZMO`    | `1 << 24`    | `16777216`   | 24               | yes       |
| `UI_2D`          | `1 << 25`    | `33554432`   | 25               | yes       |
| `PROFILER`       | `1 << 28`    | `268435456`  | 28               | yes       |
| `DEFAULT`        | `1 << 30`    | `1073741824` | 30               | yes       |
| `ALL`            | `0xffffffff` | `4294967295` | all              | -         |

Users own bits 0-19; bits 20-31 are system-preserved (layers.ts:33 comment and the `addLayer`/`deleteLayer` guards at :121, :142). A node's default is `Layers.Enum.DEFAULT` (node.ts:1641 `_layer = Layers.Enum.DEFAULT`). The 2D UI layer is `UI_2D` = `1 << 25`.

## Mask and registration API (src/cocos/scene-graph/layers.ts)

| Member                                         | Line | Behavior                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `makeMaskInclude(includes: number[]): number`  | 94   | ORs the listed masks together (accept only these)                                                                                                                                                                                                                                           |
| `makeMaskExclude(excludes: number[]): number`  | 106  | `~makeMaskInclude(excludes)` (accept everything except these)                                                                                                                                                                                                                               |
| `addLayer(name: string, bitNum: number): void` | 116  | Registers a user layer; warns and returns if `bitNum` is undefined or outside 0-19; asserts the name is unused; writes both `Enum` and `BitMask` and calls their `update`                                                                                                                   |
| `deleteLayer(bitNum: number): void`            | 141  | Removes a user layer; warns if `bitNum` outside 0-19                                                                                                                                                                                                                                        |
| `nameToLayer(name): number`                    | 161  | Returns the bit INDEX for a registered name via the integer `log2` (`core/math/bits.ts:101`); -1 only when `name` is `undefined` (`layers.ts:162-164`); an unregistered name string returns 0, the NONE index, because `log2` coerces `Layers.Enum[name]`'s `undefined` to 0 through `>>>=` |
| `layerToName(bitNum): string`                  | 175  | Returns the name for a bit POSITION index (uses `1 << bitNum`); warns if outside 0-31                                                                                                                                                                                                       |
| `init()` (internal)                            | 77   | Loads `customLayers` from project settings (`settings.querySettings`, :78) and calls `addLayer` for each (:80-83); returns immediately when the query yields nothing (:79)                                                                                                                  |

The supported path for a new layer is `Layers.addLayer`, never writing `Layers.Enum[...]` yourself. `Layers.init()` runs during `Game.init` (`src/cocos/game/game.ts:808`) and registers `customLayers` from project settings, but AIR boots with an empty `settingsPath: ''` (`src/air/bootstrap.ts:151`), so the settings query yields nothing and `init` returns at layers.ts:79 without registering anything; no custom layer exists until you call `addLayer`.

## Layer vs camera culling

`node.layer` is a single bit mask stored on the node (`layer` get node.ts:1982, set :1966; setting emits `LAYER_CHANGED`). The camera's `visibility` is a mask, and the two render paths test it with DIFFERENT predicates:

- 3D render queue: containment, `(visibility & node.layer) === node.layer` (`src/cocos/rendering/scene-culling.ts:198`; shadow pass :128), with a model-level alternative `(visibility & model.visFlags)` at :199. An OR-ed multi-bit `node.layer` must be WHOLLY inside the camera mask or the 3D pass culls it.
- 2D path: non-zero intersection, `camera.visibility & node.layer` (`src/cocos/2d/renderer/batcher-2d.ts:265`, `src/cocos/2d/framework/ui-transform.ts:422, :470`). A multi-bit layer that fails the 3D containment test can still pass here, so mixed 3D/2D setups should keep each node's layer contained in the masks that must see it.

The engine default is NOT "matches nothing": `CameraComponent._visibility` (`src/cocos/misc/camera-component.ts:178`) and the render-scene `Camera._visibility` (`src/cocos/render-scene/scene/camera.ts:875`, reset at :934) both initialize to `CAMERA_DEFAULT_MASK` (`src/cocos/rendering/define.ts:1052-1053`), which is `Layers.makeMaskExclude([UI_2D, GIZMOS, EDITOR, SCENE_GIZMO, PROFILER])` = signed `-325058561` (unsigned `3969908735`). That mask excludes only the five listed bits (21, 22, 24, 25, 28), so it INCLUDES `Layers.Enum.DEFAULT` (`CAMERA_DEFAULT_MASK & (1 << 30)` = `1073741824`, and a single bit trivially satisfies containment), every user bit 0-19, and bit 20 (`IGNORE_RAYCAST`): a default Camera draws DEFAULT-layer nodes, and any `addLayer`-registered custom layer (bits 0-19), without touching `visibility`. `IGNORE_RAYCAST` is a ray-picking convention, not a hide-from-camera bit: its only in-repo layer consumer is the reflection-probe exclusion (`src/cocos/3d/reflection-probe/reflection-probe-manager.ts:39`), while physics raycasts filter on `PhysicsGroup` bits, not `node.layer`: `PhysicsSystem.raycast` / `raycastClosest` take a group mask defaulting to `0xffffffff` (`src/cocos/physics/framework/physics-system.ts:511-518`, `:534-539`) and `PhysicsGroup` bits are registered from project settings (`:414`). A default camera only misses nodes placed solely on an excluded bit (e.g. `UI_2D`) or after the mask is replaced. `docs/manual/creating-a-scene.md:99, :105, :211, :251` and `examples/hello-cube/src/main.ts:44` state that the default `visibility` is `undefined` and nothing draws without setting it; that wording is stale against the current source. The camera field itself is owned by the cocosair-camera skill.

Composition recipes:

- Accept only default + a custom layer: `camera.visibility = Layers.makeMaskInclude([Layers.Enum.DEFAULT, Layers.Enum.MyUi])`.
- Accept all except a hidden layer: `camera.visibility = Layers.makeMaskExclude([Layers.Enum.MyUi])`.
- Assign the built-in 2D layer: `node.layer = Layers.Enum.UI_2D` (used by the UI canvas route; owned by the cocosair-ui-2d skill).
