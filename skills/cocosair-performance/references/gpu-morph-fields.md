# GPU point and voxel morph fields

Use `createAirMorphField` for a fixed population changing between sampled shapes: text, images and meshes. It owns one indexed instance batch and immutable shape atlases. It is not glTF/SkinnedMeshRenderer Morph weights, an emitter with lifetime, a feedback simulation or a force-field solver. For emitters use [native 3D particles](../../cocosair-2d-subsystems/references/particle-3d.md).

Check actual SDK exports before using newer helpers. WebGL2, two vertex texture units, RGBA32F sampling and compatible instance attributes are required; this field does not offer a WebGPU fallback.

## Sample, then interpolate

After `createAirApp()`, prepare a Scene and Camera:

```ts
import { createAirMorphField, sampleAirTextShape, sampleAirTriangleShape, primitives } from 'cocosair.js';

const count = 16384;
const text = await sampleAirTextShape({ text: 'AIR', count, size: 6, seed: 42 });
const geometry = primitives.sphere(2);
const sphere = sampleAirTriangleShape({
    positions: new Float32Array(geometry.positions),
    normals: new Float32Array(geometry.normals!),
    indices: new Uint32Array(geometry.indices!),
    count,
    seed: 42,
});
const field = createAirMorphField({ parent: scene, targets: [text, sphere], mode: 'points', size: 0.04 });
field.setTransition(0, 1, 0.5);
field.setSurface('polished', 0.18);
```

`AirPointShape` contains flat Float32 positions and nonnegative **linear RGB**, three values per sample; optional normals are finite, nonzero local vectors of the same length. All targets need the same sample count. Indices define correspondence; there is no optimal matching or implicit truncation/resampling.

Image sampling accepts decoded RGBA bytes, weights eligible pixels by alpha, maps the top row to positive Y, centers the plane and decodes sRGB. `size` is width; height retains the source aspect. Triangle sampling weights by area and interpolates optional vertex colors/normals; it does not apply asset node transforms, skinning or Morph weights. Degenerate/invalid data fail explicitly rather than inventing geometry.

Text sampling awaits `document.fonts.load`, rasterizes one line, samples it, then clears the temporary canvas in finally. Font/browser/system metrics affect the shape. A seed repeats the same pixel input; it is not a cross-platform font snapshot. Empty/multiline/oversized text is rejected.

## Rendering and polish

`points` are round camera-facing quads, 6 indices per instance, not `gl.POINTS`. `voxels` are cubes with 36 indices. Both are opaque with depth writes; there is no transparent sorting, projected shadow or dynamic GPU raycast. The per-instance envelope covers **all** target positions and primitive offsets, so a target can remain visible when the original shape is outside the frustum.

Defaults remain unlit. Optional `surface:'polished'` / `setSurface('polished', roughness)` adds procedural studio reflection, Fresnel and clearcoat bands; roughness is 0.04..1. Normals share spare channels in the two existing atlases. Points use micro-bead normals, voxels use face normals; parent normals use inverse transpose. For smooth mesh highlights, supply sampled vertex normals. Changing DirectionalLight cannot tune this private studio effect: it is not full PBR/IBL or screen reflection. Point beads retain planar depth, not sphere depth.

Polished RGB acts as a clamped 0..1 base color; `setIntensity()` is the final linear HDR gain. Use native HDR post-processing for Bloom/tone mapping. Excess exposure/Bloom can erase the specular contrast. Compare roughness values and rotate the object; verify the actual highlight pixels. Do not replace the private field material with builtin-standard or apply native `USE_INSTANCING` to its managed stream.

## Drive and own

Progress changes update native uniform data only. Drive them through normal Component `update(dt)` or `game.deltaTime`; Director BEFORE_UPDATE itself passes no dt. For tests pause native pacing and use one `createStepClock`, with `step(1 / 60)` in **seconds**. Do not advance the real pacer and a manual clock together.

Size/mode/count/target-list changes rebuild the field; dispose the old handle. `setSurface`, intensity and progress need no rebuild. `dispose()` or external node destruction releases its buffers, Mesh, Material and two textures; caller arrays and shared program caches have separate ownership. Repeated dispose is safe; creation failure cleans partial resources.

`maxGpuBytes` defaults to 256 MiB for atlases/instance data; count/texture limits are allocation guards, not FPS promises. `info.gpuBytes` excludes material/driver caches; `initialDataBytes` is payload size. `transitionDataBytes=0` excludes uniform/camera uploads. CPU submission, GPU completion, screenshot synchronization and compositor presentation are distinct.

Checkout example `/morph-field/` demonstrates 16,384 samples, point/voxel, polish/roughness and HDR. `tools/verify/morph-field.cjs` observes actual draws, shape/instance upload calls, key/middle pixels, atlas rows, normals/highlights, resize and GPU deletion. That local Chromium evidence does not certify all browsers or a release.
