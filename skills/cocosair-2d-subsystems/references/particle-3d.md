# Code First native 3D particles

Use `createAirParticleSystem` for emitters, lifetime, CPU trails and native CPU/GPU particle processors without Editor assets. It returns the original `ParticleSystem`; do not wrap it in another scene/player abstraction. `ParticleSystem2D` and its plist payload are a separate route. For fixed GPU shape transitions use [morph fields](../../cocosair-performance/references/gpu-morph-fields.md).

These are current SDK helpers, not an assumption about older npm versions. Check the consumer's exports/declarations. The AIR aggregate exports the native classes; there is no independent `particle` AIR_FEATURES entry to turn on. Current focused browser coverage is WebGL2, not a full WebGPU or release matrix.

## Configure before activation

After `createAirApp()`, with a Scene/Camera prepared:

```ts
import { createAirParticleSystem, ParticleSpace, ParticleShapeType } from 'cocosair.js';

const particles = createAirParticleSystem({
    parent: scene,
    configure(p) {
        p.capacity = 256;
        p.startLifetime.constant = 2;
        p.startSizeX.constant = 0.15;
        p.startSpeed.constant = 1.5;
        p.rateOverTime.constant = 40;
        p.simulationSpace = ParticleSpace.World;
        p.shapeModule!.enable = true;
        p.shapeModule!.shapeType = ParticleShapeType.Sphere;
        p.trailModule!.enable = true;
    },
});
```

`configure` runs synchronously on an inactive, unparented Node before native onLoad/onEnable. Do not activate/parent that node yourself. The helper creates native module objects and nonzero neutral defaults that otherwise came from serialized Editor data. It cleans a failed configuration and returns the original component on success. `playOnAwake` defaults true; set false in configure for explicit playback.

Use native `CurveRange`, `GradientRange`, `Burst`, and module properties. For a size curve, enable `sizeOvertimeModule`, set `size.mode = ParticleCurveMode.Curve`, then fill `size.spline.assignSorted([[0,{value:1}], [1,{value:0}]])`. CPU supports the native lifecycle modules, texture animation, noise/limits and trails; no per-particle Node or second player is needed.

`useGPU:true` requests native analytical GPU particles and curve textures. Unsupported devices throw `AIR_PARTICLE_GPU_UNSUPPORTED`; GPU trail/noise/velocity-limit configuration throws `AIR_PARTICLE_GPU_MODULE`. GPU mode is not arbitrary compute or a reusable force solver. Do not silently drop an unsupported module or hot-switch processors while preserving a live population; stop/clear first. Runtime GPU curve edits need `particles.processor.updateMaterialParams()` to repack textures.

## Spaces, state and ownership

Local particles move with their emitter; World particles keep emitted world positions. Do not apply the emitter transform again to already-world coordinates. Custom space has no acceptance claim here. CPU trails may start disabled and be enabled later; the next native update initializes their owner/material/buffers before simulation. Verify actual trail geometry on that frame, not just an enable flag. Configure capacity/lifetime before activation because they affect native trail allocation.

`pause()` retains particles/time, `play()` resumes, `stopEmitting()` drains the population, and `stop()` clears it. `play()` after stop starts emission again. The component has no dispose handle: destroy `particles.node` and allow native deferred destruction. Original shared textures/materials/meshes remain caller-owned; do not destroy a shared asset once per component. There is no separate asset registration JSON requirement.

Set materials through `setSharedMaterial(material,0)`: `builtin-particle` for CPU, `builtin-particle-gpu` for GPU. `renderer.particleMaterial` is not an activation-free substitute for configuring shared materials. Keep the selected shader/processor compatible. Deleting a material before its renderers detach can break other consumers.

Checkout example `/particles-3d/` covers spray, embers, particle smoke, rain and snow; it is not volumetric smoke. `tools/verify/particles.cjs` checks real CPU/GPU pixels, size curves, local/world positions, delayed trail enable, pause/drain/replay, GPU buffer/texture deletion and reentry. A timer/count alone cannot prove rendering or release. Local Chromium subsets are not universal frame-rate, compositor or release evidence.
