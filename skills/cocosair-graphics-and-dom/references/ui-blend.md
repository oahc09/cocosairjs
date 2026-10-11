Derived from src/air/ui-blend.ts and docs/manual/graphics-and-dom.md (as of 2026-10-10)

# Opt-in UI blend inheritance

`createAirUIBlendScope(root, mode = 'normal')` is an explicit controller that propagates a UI
blend mode down a subtree, covering native `UIRenderer` components including `ParticleSystem2D`.
It adds no implicit `Node.blendMode` and changes no default scene inheritance
(`src/air/ui-blend.ts:10-11`, `docs/manual/graphics-and-dom.md:117`).

## Modes

`AirUIBlendMode` is `'normal' | 'add' | 'multiply'`, each mapped to a native source/destination
factor pair (`src/air/ui-blend.ts:5-9`):

- `normal` - `SRC_ALPHA` / `ONE_MINUS_SRC_ALPHA`
- `add` - `SRC_ALPHA` / `ONE`
- `multiply` - `DST_COLOR` / `ONE_MINUS_SRC_ALPHA`

Any other value throws `AIR_E_UI_BLEND_MODE` at construction or in `set()`
(`src/air/ui-blend.ts:14`, `:53`).

## How it writes GPU state

`apply()` sets the renderer's private `_srcBlendFactor`/`_dstBlendFactor` and, when they differ,
pushes the change through the supported `MaterialInstance` API `overridePipelineStates`, which
also invalidates the material/PSO hash for an already-rendered particle batch
(`src/air/ui-blend.ts:19-28`, `docs/manual/graphics-and-dom.md:117`). Other material state is
preserved; only the blend target is overridden (`src/air/ui-blend.ts:26`).

## Inheritance and override semantics

The controller keeps a per-node `overrides` map seeded with `root` and walks the subtree on each
`update()`, inheriting the parent's selected mode unless a node is set explicitly
(`src/air/ui-blend.ts:15-16`, `:36-49`). `set(node, mode)` records an explicit override;
`set(node, null)` removes it and restores inheritance (`:53`). Explicit child overrides always
win over inherited values (`docs/manual/graphics-and-dom.md:117`). Renderers that leave the
visited set are restored to their recorded originals (`src/air/ui-blend.ts:50`).

## Update cadence

Construction calls `update()` once. After any hierarchy change, component add/remove, particle
initialization, or material change, call `update()` again so new renderers receive the factors
(`src/air/ui-blend.ts:52`, `docs/manual/graphics-and-dom.md:113`). Calling methods after dispose
throws `AIR_E_UI_BLEND_DISPOSED` (`src/air/ui-blend.ts:18`).

```js
const blend = createAirUIBlendScope(effectRoot, 'add');
blend.set(childNode, 'normal');   // explicit subtree override
blend.set(childNode, null);       // back to inherited
blend.update();                   // after hierarchy/component/particle/material edits
blend.dispose();                  // restores factors the controller still owns
```

## Ownership

`dispose()` and moving a node out of the subtree restore only the blend factors the controller
still owns; if another system changes the same renderer concurrently, unbind this controller first
(`src/air/ui-blend.ts:29-35`, `:54`, `docs/manual/graphics-and-dom.md:117`).

## Verification

Compare normal/add pixels against native particles in a real browser. See
`examples/sprite-mask-blend/src/main.ts` for the runnable contrast scene
(`examples/sprite-mask-blend/src/main.ts:1`).
