Derived from `src/cocos/particle/billboard.ts`, `src/air/index.ts`, `src/air/builtin/builtin-effects.ts`, `src/air/builtin/builtin-material.ts`, `docs/manual/billboard.md`, `docs/manual/billboards.md`, `docs/manual/2d-assets-and-effects.md`, `build/cocosair.module.js` (as of 2026-10-10).

# What it does

`Billboard` is a 3D model component that does a 2D job: it is a camera-facing quad built from a
`scene.Model` with a four-vertex mesh, not a `UIRenderer`. `src/air/index.ts:30` re-exports it from
`src/cocos/particle/billboard.ts`, where `cc.Billboard` extends `Component` (`:36`, `:40`) and
`createModel()` builds the four-vertex quad plus the `scene.Model` (`:243-276`). Because it is a 3D
model, it needs a camera whose visibility includes the node layer, not the UI camera that the other
subsystems here sit on.

# The cc_size_rotation uniform contract

All three channels travel through a single `cc_size_rotation` `Vec4` (`src/cocos/particle/billboard.ts:190`,
the uniform declared in `src/air/builtin/builtin-effects.ts:32`):

- `width` writes the `x` component (`src/cocos/particle/billboard.ts:94-108`).
- `height` writes the `y` component (`:71-85`).
- `rotation` writes the `z` component in radians after a degrees input (`:117-131`).

Because the rectangle size comes only from that uniform, node scale does not scale it; changing the
node's `setScale` leaves the billboard the same pixel size. `width` and `height` default to 0
(`src/cocos/particle/billboard.ts:65`, `:88`) and `onEnable` pushes those zeros into the uniform
(`:200-208`), so an enabled billboard with no explicit size is invisible by contract - the first
thing to set is a non-zero width and height.

# Technique, material and texture ownership

- The `builtin-billboard` effect ships exactly one technique (`src/air/builtin/builtin-effects.ts:5-32`), so `technique` clamps to 0 whenever a material exists (`src/cocos/particle/billboard.ts:137-155`).
- `updateTechnique` only rebuilds when the index actually changed, destroying and recreating the model, mesh and material (`src/cocos/particle/billboard.ts:157-182`).
- The material is copied from `default-billboard-material` (`src/cocos/particle/billboard.ts:270-273`, registered in `src/air/builtin/builtin-material.ts:129-133`); blend-state overrides happen on that copied material, not on the effect default.
- `onDestroy` nulls the texture reference without destroying it, because the application owns the texture (`src/cocos/particle/billboard.ts:214-226`).

# Gotchas

- A billboard assigned to the UI camera layer draws nothing; give it a 3D camera visibility that includes its node layer (`src/cocos/particle/billboard.ts:243-276`).
- Enabling it without setting `width` and `height` leaves the `cc_size_rotation` at zero (`src/cocos/particle/billboard.ts:200-208`) - invisible, no warning.
- Reaching for `technique > 0` silently stays on technique 0 because the effect has one (`src/air/builtin/builtin-effects.ts:5-32`, clamp at `src/cocos/particle/billboard.ts:137-155`).
- Do not destroy the texture through the component; `onDestroy` only drops the reference (`src/cocos/particle/billboard.ts:214-226`), the app keeps and releases it.
- For rotation the CPU route in the older manual (`docs/manual/billboards.md`, with its white-plane pitfall) rotates in JS; the native component recipe in `docs/manual/billboard.md` carries the zero default size described above.
