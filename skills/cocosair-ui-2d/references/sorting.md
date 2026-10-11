Derived from src/cocos/sorting/sorting-2d.ts, src/cocos/sorting/sorting-layers.ts, src/cocos/physics-2d/builtin/intersection-2d.ts, src/cocos/scene-graph/layers.ts, build/cocosair.module.js - 2026-10-10

# 2D sorting

Three symbols share the "2D sorting" heading on the export block (`build/cocosair.module.js`,
currently :161574), but they are not one system: `SortingLayers` and `Sorting2D` drive draw order,
while `Intersection2D` is an unrelated 2D geometry helper. Note also that `Layers` (node layers,
`src/cocos/scene-graph/layers.ts:60`) is a different concept from `SortingLayers` - node layers gate
camera `visibility`, sorting layers gate draw order within a batch.

## Sorting2D

`Sorting2D extends Component` and is annotated `@requireComponent(UIRenderer)`
(`src/cocos/sorting/sorting-2d.ts:50-51`), so it only works on a node already carrying a `UIRenderer`
subclass - `Sprite`, `Label`, `Graphics` and friends. Its two knobs:

- `sortingLayer` - a `SortingLayers.Enum` id; the setter rejects an id that is not valid (`src/cocos/sorting/sorting-2d.ts:64-71`), backed by `SortingLayers.isLayerValid` (`src/cocos/sorting/sorting-layers.ts:129-137`).
- `sortingOrder` - clamped to int16 range `[-32768, 32767]` (`src/cocos/sorting/sorting-2d.ts:33-34`, `:81-85`); smaller renders first under the default rule.

Both setters funnel into `_updateSortingPriority()`, which, when enabled, writes
`uiRenderer.priority = SortingLayers.getSortingPriority(getLayerIndex(layer), order)`
(`src/cocos/sorting/sorting-2d.ts:115-126`). When the component is disabled it restores the default
priority (`:122-124`). `onEnable`/`onDisable` also bump a module-level count reported to the batcher
via `_setSorting2DCount` (`src/cocos/sorting/sorting-2d.ts:101-113`). The priority write, not a
parallel queue, is what reorders draws.

```js
const sorting = panelNode.addComponent(Sorting2D);   // panelNode already has a Sprite (a UIRenderer)
sorting.sortingLayer = SortingLayers.Enum.default;   // the only built-in id
sorting.sortingOrder = -10;                          // render before order-0 siblings
```

## SortingLayers

`SortingLayers` is a static manager (`src/cocos/sorting/sorting-layers.ts:50`). Priority packing:
`getSortingPriority(layer, order) = (((layer + (1<<15)) << 16) | (order + (1<<15))) >>> 0`
(`src/cocos/sorting/sorting-layers.ts:64-66`), so layer dominates order: a higher layer index always
sorts later regardless of `sortingOrder` (`src/cocos/sorting/sorting-layers.ts:46-48`).

Out of the box `SortingLayers.Enum` carries only `default: 0` (`src/cocos/sorting/sorting-layers.ts:36-38`),
and `getBuiltinLayers()` returns exactly `[{ id: 0, name: 'default', value: 0 }]`
(`src/cocos/sorting/sorting-layers.ts:143-144`). Extra layers come from the `ENGINE.sortingLayers`
setting loaded in `init()` at `Game.EVENT_POST_SUBSYSTEM_INIT` (`src/cocos/sorting/sorting-layers.ts:40-42`,
`:152-154`). Query helpers are `getLayerIndex` (`:76-84`), `getLayerIndexByName` (`:90-93`) and
`getLayerByName` (`:113-123`); an unknown id logs `errorID(2105)` and returns `0` (`:81`, `:134`).
With only the default layer registered, all differentiation happens through `sortingOrder`.

## Intersection2D is not a sorter

`Intersection2D` is `export default class Intersection2D` (`src/cocos/physics-2d/builtin/intersection-2d.ts:301`)
holding static 2D shape-intersection tests (segment/segment, rect/polygon and related math, e.g.
`src/cocos/physics-2d/builtin/intersection-2d.ts:34-40`, `:60-85`). It is used by the 2D physics
backend, not the batcher. It sits next to the sorting names on the export block but has no effect on
draw order; use it for overlap math, not for stacking sprites.

## Layer versus sorting layer

| Concept       | Type                   | Controls                                                     | Source                                      |
| ------------- | ---------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| Node layer    | bitmask per node       | whether a camera renders the node (`visibility` AND `layer`) | `src/cocos/scene-graph/layers.ts:34-46`     |
| Sorting layer | int id per `Sorting2D` | draw order among batched 2D renderers                        | `src/cocos/sorting/sorting-layers.ts:36-38` |

UI nodes still need a node layer that matches the UI camera `visibility` before sorting even applies
(`src/air/ui-kit.ts:38`, `:61`); `Sorting2D` then orders what the camera already accepts.
