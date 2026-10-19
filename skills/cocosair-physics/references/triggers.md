# physics contracts triggers

For original references to the contracts below, see [Contracts](contracts.md). Source annotations refer to the AIR checkout.

## When to use what

- "queries, triggers, collision callbacks only" -> default `physics: 'builtin'`; zero external dependencies, real raycasts, no simulation.
- "gravity, falling, stacking, forces" -> `createAirApp({ physics: 'cannon' })`; pure-JS cannon from the vendored `@cocos/cannon`, both backends already in the default bundle (`tools/build/build.cjs:41`).
- "2D rigid bodies and queries" -> box2d is the default 2D backend (`src/cocos/physics-2d/box2d/instantiate.ts:43`); `PhysicsSystem2D.raycast/testPoint/testAABB` (`src/cocos/physics-2d/framework/physics-system.ts:362`, `:370`, `:378`), see [2d-box2d.md](2d-box2d.md).
- "ammo / physx / box2d-wasm" -> not shipped; the Emscripten artifacts do not exist in this repository (`docs/notes/physics-asset-sourcing.md:11-17`), see [backend-selection.md](backend-selection.md).
- "why did my trigger stop firing after `setGroup`" -> the mask half of the pair is still 1; fix both sides (`docs/notes/physics-3d-notes.md:56-63`).
