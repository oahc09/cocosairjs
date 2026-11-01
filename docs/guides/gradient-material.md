# Local-Y gradient material

`createAirGradientEffect()` adds a two-color, object-space vertical gradient through
native `EffectAsset` and `Material`. No Babylon dependency, material subclass, texture
or Creator asset pipeline is required. Create the effect **after** `createAirApp()`.

Run `npm run build && npm run dev`, then open
[`/docs/manual/examples/manual-gradient-material/`](../manual/examples/manual-gradient-material/index.html).
The example starts with the blue-to-black appearance of [Babylon Playground
2IFRKC/63](https://playground.babylonjs.com/#2IFRKC%2363), with controls for response,
offset, scale, smoothness and alpha. Its camera faces the opposite side of the XY
quad to match Cocos's camera convention; the gradient and white hemisphere response
are unchanged. It is a focused manual example, not a new certified Gallery campaign.

For package consumers, `npm run build:all` also refreshes the minified bundle,
declarations and npm runtime copies. This source-only PR does not replace the
previously committed generated SDK artifacts.

## Native API

```ts
import { createAirGradientEffect, Material, Vec4 } from 'cocosair.js';

// After await createAirApp(...):
const effect = createAirGradientEffect();
const material = new Material();
material.initialize({
    effectAsset: effect,
    technique: 0, // 0 opaque, 1 straight-alpha blend
    defines: {
        AIR_GRADIENT_UNLIT: true,
        AIR_GRADIENT_SRGB_OUTPUT: true, // linear input -> LDR display
    },
});
material.setProperty('topColor', new Vec4(0, 0, 1, 1));
material.setProperty('bottomColor', new Vec4(0, 0, 0, 1));
material.setProperty('offset', 0.5);
material.setProperty('scale', 1);
material.setProperty('smoothness', 1);
renderer.setSharedMaterial(material, 0);
```

Use real XY geometry (as in the example), a box, or any ordinary mesh whose local Y
varies. Cocos `primitives.plane()` is in the XZ plane: rotating its node does **not**
change local vertex Y, so it remains a constant color. Normals are required for lit
rendering. Node translation, rotation and scaling move the gradient with the object;
they do not redefine its coordinate range. Gradients are calculated per fragment,
not approximated by four vertex colors.

| Property      | Default     | Contract                                                                                  |
| ------------- | ----------- | ----------------------------------------------------------------------------------------- |
| `topColor`    | `(1,0,0,1)` | Linear RGBA `Vec4`; native `Color` also maps 0–255 channels to 0–1, without sRGB decoding |
| `bottomColor` | `(0,0,1,1)` | Linear RGBA, as above                                                                     |
| `offset`      | `0`         | Finite local-height translation                                                           |
| `scale`       | `1`         | Finite local-height multiplier; negative reverses, zero flattens                          |
| `smoothness`  | `1`         | Finite exponent; values below `.01` use `.01`; values above `10` are **not** capped       |
| `alpha`       | `1`         | Global opacity in `[0,1]`, multiplied by interpolated endpoint alpha                      |

The packed `gradient` Vec4 is `(offset, scale, smoothness, alpha)`; the four named
properties are native scalar aliases, not independent uniforms. Use the aliases for
ordinary edits. The factory does not install an alternative `setProperty` validation
layer: native property/type diagnostics reject non-finite or out-of-float32-range values.
As with any `pow` shader, extreme inputs can overflow floating-point arithmetic.

```text
height = max(localY * scale + offset, 0)
weight = pow(height, max(smoothness, .01))
base = bottomColor + (topColor - bottomColor) * weight
outputAlpha = clamp(base.a * alpha, 0, 1)
```

The weight is deliberately **not** capped at one: colors extrapolate above the top
range, matching the reference algorithm. Use geometry/offset/scale that map into
`[0,1]` when a bounded ramp is wanted. Alpha, unlike RGB, is clamped before blending.
Technique 0 has depth test/write and no blending; technique 1 has depth test, no
depth writes and straight-alpha RGB blending. Both back-face cull. Choose technique
before initialization; do not try to change shared Material render state in place.

## Lighting and color response

All three defines default to `false`:

- `AIR_GRADIENT_UNLIT`: bypass lighting and write the interpolated RGB directly.
- `AIR_GRADIENT_BABYLON_RESPONSE`: in lit mode, use the historical response
  `base.rgb * clamp(light * base.rgb, 0, 1)` instead of `base.rgb * light`.
  This is an explicit compatibility option, not a physically based BRDF.
- `AIR_GRADIENT_SRGB_OUTPUT`: encode the final linear RGB to sRGB for direct LDR
  display. Leave false for raw reference comparison or a linear render target.
  Do not encode again in later post-processing.

Scene lighting uses Cocos's existing world-normal ambient hemisphere (ground/sky)
plus main directional Lambert diffuse. The native `CCCamera` UBO provides colors,
directions and already exposure-adjusted intensities; the shader does not multiply
exposure twice. No custom light class or per-frame uniform synchronization is needed.
The reference's white sky and white ground at intensity one can be reproduced with:

```ts
scene.globals.skybox.useHDR = false;
scene.globals.ambient.skyColor = new Vec4(1, 1, 1, 1);
scene.globals.ambient.groundAlbedo = new Vec4(1, 1, 1, 1);
scene.globals.ambient.skyIllum = 1;
// No directional light. Initialize with AIR_GRADIENT_BABYLON_RESPONSE: true,
// AIR_GRADIENT_UNLIT: false, AIR_GRADIENT_SRGB_OUTPUT: false.
```

For blue/black endpoints, offset `.5`, scale/smoothness `1`, the center fragment is
raw blue `.25` in compatibility mode, versus `.5` unlit. At local Y `-.25` and `.25`,
compatibility blue is `.0625` and `.5625`. These values are before framebuffer
quantization; comparing an sRGB-encoded screenshot against raw numbers is invalid.

This first effect supports ordinary static `MeshRenderer` meshes on WebGL2. It has
no textures, fog, shadows, point/spot/additional lights, skinning, instancing or morph
support. GLSL4 layout metadata is supplied, but a WebGPU acceptance claim requires
separate driver tests. It does not replace `builtin-standard` for PBR surfaces.

## Ownership and updates

The factory returns a fresh independently owned effect; builtins are never changed.
Materials share its immutable shader program template, avoiding one new compiled
program name per factory call. `material.setProperty()` updates uniforms in place;
use a fresh material or native `MaterialInstance` when changing defines. If you read
`renderer.material`, subsequent edits must target that instance, not the old shared
asset. The example deliberately uses `setSharedMaterial` throughout.

After detaching all renderers, destroy owned materials, call
`EffectAsset.remove(effect)`, then `effect.destroy()`. Destroy owned meshes too.
Do not destroy an effect still used by another material. Recreating it is supported;
no per-frame listener or deferred precompile callback is retained by the factory.

## Evaluation and provenance

The existing `examples/shader-custom-gradient` is a horizontal **UV** gradient with
a time-varying wave. It does not implement this local-Y exponent ramp, endpoint
alpha, scene lighting or the specified Playground response, so it remains unchanged.

The exact snippet uses `HemisphericLight`, although its prose says directional.
The formulas were checked against the public [Babylon gradient shader at tag
4.1.0](https://github.com/BabylonJS/Babylon.js/blob/4.1.0/materialsLibrary/src/gradient/gradient.fragment.fx)
and the current gradient implementation. This implementation is independently
written in AIR's native effect format; no Babylon source or snippet code is bundled.
Babylon's engine is Apache-2.0; the Playground snippet does not carry an explicit
license declaration in its retrieved metadata. AIR's new source uses its MIT header.

Intentional differences from Babylon's historical material:

- Normal unlit is a direct ramp, not the reference shader's accidental cubic RGB.
- `alpha` genuinely multiplies endpoint alpha; the reference's material-alpha
  blending predicate and actual fragment alpha disagree.
- Only AIR's main directional and ambient hemisphere are supported, not Babylon's
  four-light/shadow/fog infrastructure. No alpha-test threshold is implied.
- Output encoding and the extra RGB multiplication are explicit defines; defaults
  never silently claim visual equivalence to an unrelated standard material.

Focused CPU contracts are in `test/smoke/gradient-effect.test.ts`. Actual pixel
validation must additionally compile/draw the shader in a real WebGL2 context;
headless tests and source-string assertions alone do not establish rendered parity.
