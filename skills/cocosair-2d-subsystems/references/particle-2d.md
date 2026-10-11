Derived from `src/cocos/particle-2d/particle-system-2d.ts`, `src/cocos/particle-2d/particle-asset.ts`, `src/cocos/particle-2d/particle-simulator-2d.ts`, `src/cocos/particle-2d/particle-system-2d-assembler.ts`, `src/cocos/particle-2d/motion-streak-2d.ts`, `src/cocos/particle-2d/index.ts`, `src/cocos/asset/asset-manager/parser.ts`, `src/cocos/gfx/base/define.ts`, `src/cocos/2d/framework/ui-renderer.ts`, `docs/notes/particle-2d-notes.md`, `build/cocosair.module.js` (as of 2026-10-10).

# What it does

`ParticleSystem2D` renders a `ParticleSystem` emitter tuned by an external plist, driven entirely at
run time: the app generates or fetches the plist text, the engine parses it into a dictionary, and
the component reads that dictionary when it applies its file. `ParticleSystem2D`, `ParticleAsset` and
`ParticleSystem2DAssembler` reach the app through the single `export { ... }` block of
`build/cocosair.module.js` (currently `:161574`). `MotionStreak` is the sibling renderer in the same
module - a plain trailing ribbon, not a particle emitter.

# The plist chain, end to end

Before attaching the emitter, create a `Canvas` component on its UI root, then assign the orthographic camera to that component's `cameraComponent`. `UITransform` does not create a `Canvas`; `getComponent(Canvas)` on a root with only `UITransform` returns null. Alternatively use `createUICanvas` from cocosair-ui-2d.

1. `assetManager.parser.parsePlist` maps `.plist` input and fails with `parse failed` on malformed text (`src/cocos/asset/asset-manager/parser.ts:63`, `:164-172`).
2. The parsed dictionary is attached as `asset._nativeAsset`; `ParticleAsset` itself declares only `spriteFrame` (`src/cocos/particle-2d/particle-asset.ts:38-43`), so the config never lives on the asset as named fields.
3. `custom = false` plus a `file` assignment triggers `_applyFile`, which calls `_initWithDictionary(file._nativeAsset)` only in the non-custom branch (`src/cocos/particle-2d/particle-system-2d.ts:922-948`, guard `:933-936`).

# Key dictionary and its silent-zero cases

- The lifespan key is `particleLifespan` (`src/cocos/particle-2d/particle-system-2d.ts:1047`); assigning `life` in a plist does nothing. A missing lifespan makes `life` 0, which zeroes the emission clamp (`:1055`).
- Set the `startColorRed/Green/Blue/Alpha` and `finishColorRed/Green/Blue/Alpha` values explicitly. `_initWithDictionary` defaults missing channels to zero; without `startColorAlpha`, particles can simulate with zero visible opacity.
- `emissionRate` is re-clamped to `totalParticles / life` (`src/cocos/particle-2d/particle-system-2d.ts:1055`), so a large plist rate is silently capped.
- `blendFuncSource` and `blendFuncDestination` are written straight into the gfx `BlendFactor` slots (`src/cocos/particle-2d/particle-system-2d.ts:1062-1063`), whose enum tops out at 14 (`src/cocos/gfx/base/define.ts:505-521`). The Creator plist values 770 and 1 land out of range, so the emitter simulates fully while drawing nothing. Override them via the inherited `srcBlendFactor` and `dstBlendFactor` accessors on `UIRenderer` (`src/cocos/2d/framework/ui-renderer.ts:246-247`), or keep the plist integers in the gfx slot range.

# Determinism trio

`loadRemote` on a plist yields a bare `Asset`, so the `parsePlist` step is mandatory
(`docs/notes/particle-2d-notes.md:45`). Cross-engine reproducibility needs all three of: a replaced
random generator (`math.setRandGenerator`), manual `simulator.step(dt)`
(`src/cocos/particle-2d/particle-system-2d.ts:869-870`,
`src/cocos/particle-2d/particle-simulator-2d.ts:344`), and a pinned
`assembler.maxParticleDeltaTime`, which is latched once from the frame time on the first assembler
fetch (`src/cocos/particle-2d/particle-simulator-2d.ts:349`,
`src/cocos/particle-2d/particle-system-2d-assembler.ts:32`, `:47-48`). Leaving any one out makes the
count differ run to run.

# MotionStreak sibling

There is no `MotionStreak2D` in the export block: the class is `cc.MotionStreak`
(`src/cocos/particle-2d/motion-streak-2d.ts:68`, `:73`) re-exported as `MotionStreak`
(`src/cocos/particle-2d/index.ts:31-37`). `MotionStreak.texture` is typed as a raw `Texture2D`
(`src/cocos/particle-2d/motion-streak-2d.ts:143`), not a `SpriteFrame`, so feed it the wrapped
texture directly.

# Gotchas

- `custom = true` makes `_applyFile` skip the whole dictionary mapping (`src/cocos/particle-2d/particle-system-2d.ts:933-936`); the emitter then runs only on your property assignments and ignores the plist.
- Copying a Creator-exported plist verbatim carries blend values 770 and 1 (`src/cocos/particle-2d/particle-system-2d.ts:1062-1063`) into gfx slots that end at 14 (`src/cocos/gfx/base/define.ts:505-521`) - the classic "computes but renders no pixels" case.
- Textures must be created after `createAirApp`; the gfx device is not ready before it and every frame warns on the sampler.
