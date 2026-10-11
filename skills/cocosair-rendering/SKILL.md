---
name: cocosair-rendering
description: Drives the Cocos AIR rendering contracts in code - legacy forward lighting units with illuminance in Lux, the single mainLight rule for multiple directional lights and inspectAirDirectionalLights, the per-light-type shadow matrix with the four switches a ShadowMap cast needs, offscreen rendering through createAirRenderTarget and camera targetTexture with requested-versus-effective MSAA samples and sampleFallback, the one-per-scene AirTransmissionCapture behind transmission materials, texture format and sRGB decode preflight with resolveAirTextureFormat and validateAirTextureColorContract, and which post-process and custom-pipeline names a Code First app can really reach. Use when lighting looks flat, asking why there are no shadows, rendering a mirror or refraction into a texture, reading back a target's pixels, hitting AIR_E_RENDER_TARGET_SAMPLES or AIR_E_TEXTURE_COLOR, choosing rgba8, rgba16f or hardware-srgb, or deciding whether bloom and other post-processing run without a variant build.
---

# Cocos AIR rendering contracts

Configure what the legacy forward pipeline actually draws - light units and the one main light, shadow casting, offscreen camera targets, texture color contracts - and know which pipeline surfaces a Code First app can reach.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material,
         Vec3, primitives, utils, createAirRenderTarget, inspectAirDirectionalLights } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });  // #GameCanvas must exist before this import
const scene = new Scene('Main');
const camNode = new Node('Main');
scene.addChild(camNode); camNode.setPosition(new Vec3(0, 3, 8)); camNode.lookAt(new Vec3(0, 1, 0));
const camera = camNode.addComponent(Camera);
const keyNode = new Node('Key');
scene.addChild(keyNode); keyNode.setPosition(new Vec3(0, 8, 6)); keyNode.lookAt(new Vec3(0, 0, 0));
const key = keyNode.addComponent(DirectionalLight);          // the last activated directional becomes renderScene.mainLight
key.illuminance = 12000;                                     // Lux on the HDR slot, default 65000
scene.globals.shadows.enabled = true;                        // shadow switch 1 of 4
scene.globals.shadows.type = 1;                              // switch 2: ShadowMap, the default is Planar
key.shadowEnabled = true;                                    // switch 3: per light
const boxNode = new Node('Box');
scene.addChild(boxNode); boxNode.setPosition(new Vec3(0, 1, 0));
const renderer = boxNode.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
renderer.material = material;
renderer.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;   // switch 4: the default is OFF
const shotNode = new Node('Offscreen');                      // a camera aimed at a target stops drawing to the canvas
scene.addChild(shotNode); shotNode.setPosition(new Vec3(4, 3, 8)); shotNode.lookAt(new Vec3(0, 1, 0));
const shotCamera = shotNode.addComponent(Camera);            // the on-screen camera keeps its own output
const shot = createAirRenderTarget({ width: 512, height: 512, samples: 4, sampleFallback: 'lower' });
const detach = shot.attachCamera(shotCamera);                // resolves MSAA when that camera ends
app.run(scene);   // async render loop; the first frame draws on a later tick, so never dispose the offscreen target synchronously here
console.log(shot.info.effective, shot.info.requested);       // only info shows what the device granted (readable synchronously)
console.log(inspectAirDirectionalLights(scene));             // { status, mainLight, lights[].effective }
// Release LATER (on teardown), never inline before frame 1: disposing first leaves the attached camera targeting a dead texture. dispose repeats safely.
function teardown() { detach(); shot.dispose(); }
</script>
```

Entry choice and the importmap alias are owned by [cocosair-project-setup](../cocosair-project-setup/SKILL.md); `createAirApp` and `run` by [cocosair-application](../cocosair-application/SKILL.md).

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-camera](../cocosair-camera/SKILL.md) - the `Camera` component an offscreen pass needs: `priority`, `rect`, `visibility`, `targetTexture`.
- [cocosair-materials-effects](../cocosair-materials-effects/SKILL.md) - authoring the effect and setting a material's `sampler2D`; this skill owns only the texture color contract and target bindings.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - node activation order, `layer` bits and camera `visibility` masks, which decide what a shadow pass or an offscreen camera sees at all; `Vec3` directions come from [cocosair-math](../cocosair-math/SKILL.md).
- [cocosair-application](../cocosair-application/SKILL.md) - when the scene and its native render scene exist, which gates every light query below.
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which entry exposes a symbol, and variant-build options such as `AIR_FEATURES`.

Offscreen passes for 2D and DOM content belong to [cocosair-graphics-and-dom](../cocosair-graphics-and-dom/SKILL.md). glTF loading, primitive geometry, animation, UI, input, physics, audio and broad performance work belong to the cocosair-gltf, cocosair-primitives-mesh, cocosair-animation-tween, cocosair-ui-2d, cocosair-input-action, cocosair-physics, cocosair-audio-video and cocosair-performance skills; none of those exists yet, so route through the router.

## When to use what

- "Why is the scene the wrong brightness" -> `DirectionalLight.illuminance` (Lux) or `SphereLight`/`PointLight`/`SpotLight` `luminousFlux`/`luminance`; the HDR and LDR slots and every unit constant are in `references/lighting-units.md`.
- "Which directional light is actually lighting my scene" -> `inspectAirDirectionalLights(scene)` (`src/air/rendering/engine-contracts.ts:104`).
- "Why are there no shadows" -> the support grid in `references/shadow-matrix.md`, then the four switches in Contracts.
- "Can this light type cast at all" -> `PointLight` has no shadow path in the source (`src/cocos/render-scene/scene/point-light.ts:32`); Sphere is never collected by the flow (`src/cocos/rendering/shadow/shadow-flow.ts:122`).
- "Render a mirror, refraction or a second viewpoint into a texture" -> `createAirRenderTarget(options)` (`src/air/rendering/render-target.ts:290`) plus `attachCamera(camera, beforeRender?)` (`:197`); the raw path is `camera.targetTexture`.
- "Feed that texture into a material after a resize" -> `target.bindColor(material, property, passIdx?)` (`:257`), `bindDepth` (`:258`), `readColor(region?)` for pixels (`:262`).
- "Glass or gem refraction from a glTF material" -> `AirTransmissionCapture` (`src/air/rendering/transmission-capture.ts:74`), one per scene, with `TRANSMISSION_LAYER` (`:29`).
- "Is this format plus this decode legal" -> `resolveAirTextureFormat` (`src/air/rendering/color-contract.ts:21`) and `validateAirTextureColorContract` (`:38`).
- "Can I turn bloom on" -> `postProcess` is the only custom-pipeline-side name the default aggregate exports (`src/exports/air.ts:39`); `director.root.usesCustomPipeline` tells you which pipeline is live (`src/cocos/root.ts:121`).

## Contracts

- Ordinary directional lights share ONE `scene.renderScene.mainLight` (there is no `Scene.mainLight` accessor; the engine warn text below says `scene.mainLight` loosely): `_attachToScene` calls `addDirectionalLight` then `setMainLight` for every directional it activates (`src/cocos/3d/lights/light-component.ts:291`, `:292`), so the LAST activated directional wins and the earlier one stops contributing; the legacy forward camera UBO shades `mainLight` only (`src/cocos/render-scene/core/render-scene.ts:100`). Registration emits a single warn when the list reaches two (`:338`), text `[AIR_W_DIRECTIONAL_LIGHT_LIMIT] ordinary directionals share one legacy mainLight; extra registered lights do not add illumination. Inspect scene.mainLight.`. `inspectAirDirectionalLights(scene)` reports identity and nothing else - `status: 'unavailable'` with `lights: []` while the scene has no native render scene (`src/air/rendering/engine-contracts.ts:106`), then `scope: 'legacy-forward-main-directional'`, `ordinaryDirectionalCapacity: 1`, `selection: 'native-mainLight'` (`:107-108`) and one entry per registered light with `effective: light === native.mainLight` (`:110`); it applies no brightness threshold.
- Shadows need four independent switches and no path warns when one is missing: `scene.globals.shadows.enabled` (default `false`, `src/cocos/scene-graph/scene-globals.ts:987`), `scene.globals.shadows.type = ShadowMap` (the field default is `Planar`, `:989`), the light's own `shadowEnabled` (default `false`, `src/cocos/3d/lights/directional-light-component.ts:55`), and `renderer.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON` (component default `OFF`, `src/cocos/3d/framework/mesh-renderer.ts:339`, static enum at `:318`). `ShadowFlow.render` returns at its guard unless `enabled && type === ShadowMap` (`src/cocos/rendering/shadow/shadow-flow.ts:116`), the map pass then serves only `camera.scene.mainLight` (`:140`), and culling drops any model whose `castShadow` is false (`src/cocos/rendering/scene-culling.ts:193`) or whose world bounds are missing (`:132`).
- The scene-global object mirrors into the pipeline object on a defined schedule: `SceneGlobals.activate` binds `sceneData.shadows` when the scene activates (`src/cocos/scene-graph/scene-globals.ts:1709`, driven from `src/cocos/scene-graph/scene.ts:204`) and `ShadowsInfo.activate` then calls `resource.initialize(this)` and `activate()` (`:1022`-`:1025`), which copies `enabled` and forces the internal `SHADOW_TYPE_NONE` while disabled (`src/cocos/render-scene/scene/shadows.ts:367`, `:368`); after activation the `enabled`/`type` setters push straight through (`src/cocos/scene-graph/scene-globals.ts:867`, `:886`; pipeline-side setters `src/cocos/render-scene/scene/shadows.ts:217`, `:230`). `ShadowType`, `PCFType`, `CSMLevel` and `Shadows` are not export names on the default bundle face, so Code First callers pass the ordinals `0` Planar and `1` ShadowMap (`src/cocos/render-scene/scene/shadows.ts:80`, `:88`) and read `docs/manual/shadow-support-matrix.md` for which light types cast at all.
- A render target negotiates with the driver and you only learn the outcome from `info`: `AirTargetColorFormat` is exactly `'rgba8' | 'rgba16f' | 'rgba32f' | 'srgb8-alpha8'` (`src/air/rendering/render-target.ts:14`), `samples` is exactly the literal set `1 | 2 | 4 | 8` (`:23`, validated `:105`) intersected with the device's color and depth `SAMPLES` support (`:114`-`:117`), and `sampleFallback` defaults to `'error'` (`:100`) - an unsupported count then throws `AIR_E_RENDER_TARGET_SAMPLES` listing the supported set (`:120`), while `'lower'` silently selects the largest supported value at or below the request (`:119`). Even a negotiated value is provisional: a mismatched driver `SAMPLES` reading after allocation throws `AIR_E_RENDER_TARGET_SAMPLES` (`:179`). The frozen `info` getter (`:138`-`:142`) is the only readout, separating `requested` from `effective` and exposing `samples`, `resolveRequired` (`true` only above 1 effective sample, `:141`), `supportedSamples`, `glSamples`, `generation` and `disposed`.
- The target owns the native object and its identity changes on resize: `attachCamera` stores the camera's prior `targetTexture`, assigns its own and registers `RENDER_CAMERA_BEGIN`/`RENDER_CAMERA_END` listeners - the end listener calling `resolve()` so the next camera samples in the same frame - then returns the `detach()` closure (`src/air/rendering/render-target.ts:200`, `:203`, `:204`, `:213`). `resolve()` is a no-op at 1 sample (`:218`). A successful resize builds a new native `RenderTexture` and rebinds attached cameras by reassigning `camera.targetTexture` (`:192`); code assigning `camera.targetTexture` by hand must follow the new object itself (`docs/manual/rendering-contracts.md:32`). `texture`/`depthTexture` are borrowed views and `dispose()` unbinds, detaches and repeats safely (`:280`, `:281`).
- `AirTransmissionCapture` allows exactly one capture per scene and says so loudly: `onEnable` scans the module-level active set and throws when another enabled capture shares `node.scene` (`src/air/rendering/transmission-capture.ts:103`-`:105`), because a material instance carries one scene-color binding. Assigning `mainCamera` re-arms an already-enabled capture so node-activation ordering cannot strand it (`:81`-`:86`), the capability is armed only while enabled on a WebGL2 device (`:112`, `:65`), and `onDisable`/`onDestroy` release bindings and restore main-camera visibility before the `RenderTexture` dies (`:120`, `:130`).
- Color decisions are preflight only and the accepted pairing set is closed: `decode` is `none | shader-srgb | hardware-srgb` (`src/air/rendering/color-contract.ts:35`), and `hardware-srgb` is accepted exactly when the resolved format is in the sRGB set - every other pairing throws at `:45` with `hardware-srgb requires an sRGB GPU format; an sRGB format already decodes RGB and must not be software-decoded again`, a non-`color` usage carrying an sRGB format or any decode other than `none` throws at `:44` with `normal/roughness/metallic/depth data must remain linear, with no sRGB decode`, and `usage` disagreeing with `isAirDepthFormat` throws at `:43`. An explicitly `undefined` format throws `AIR_E_TEXTURE_FORMAT` instead of taking the default (`:24`); every rejection is an `AirColorContractError extends TypeError` formatted `[code] property: message` (`:6`-`:9`). Nothing is repaired: the module never changes texture bytes, standard material decode or framebuffer output (`:37`).
- Post-process reachability is three different layers, and the custom pipeline is compiled but inert by default. `custom-pipeline` IS element 10 of the default `AIR_FEATURES` list (`tools/build/build.cjs:27`) and `rendering` IS a name in the built bundle's export block (`src/exports/custom-pipeline.ts:4`), but the aggregate source file the `air` unit builds from never re-exports `./custom-pipeline` (`src/exports/air.ts:6`-`:42`), so `import { rendering }` resolves against the built ESM artifact while the aggregate source face does not surface it at all. At runtime `game` reads the `rendering.customPipeline` setting and, being falsy for AIR because bootstrap passes only `rendering.renderMode` (`src/air/bootstrap.ts:152`), assigns `cclegacy.rendering = undefined` (`src/cocos/game/game.ts:804`); `Root.setRenderPipeline(false)` takes the legacy branch and clears `usesCustomPipeline` (`src/cocos/root.ts:385`, `:392`), and the director wires a custom builder only while that flag and `cclegacy.rendering` are both live (`src/cocos/game/director.ts:857`). The single reader of `camera.usePostProcess` is the custom-pipeline `PostProcessBuilder` (`src/cocos/rendering/post-process/post-process-builder.ts:201`), registered under `'Forward'` and `'Custom'` (`src/cocos/rendering/post-process/index.ts:9`), so the `postProcess` namespace the aggregate does export (`src/exports/air.ts:39`) compiles and never runs unless a variant build plus a truthy setting take over; `docs/reference/owner-decisions.md:42` records those gates and the variant-evidence resolution.
- Capability layers stay separate. `createAirRenderTarget`, `AirRenderTarget`, `AirTransmissionCapture`, `TRANSMISSION_LAYER`, `isTransmissionMaterial`, `inspectAirDirectionalLights`, the color-contract functions, the five light components, `rendering` and `postProcess` all resolve by symbol name in the single export block of `build/cocosair.module.js` (626 names parsed) - a build lookup, not browser verification. `ShadowType`, `PCFType`, `CSMLevel`, `Shadows`, `LightType`, `ModelShadowCastingMode`, `legacy_rendering`, `Format` and `PixelFormat` are not export names there: the GFX enums arrive only as the namespace `gfx` (`src/exports/base.ts:34`, `:46`), so a format is written `gfx.Format.RGBA8` (ordinal 35) or `gfx.Format.SRGB8_A8` (37), and `AirTargetColorFormat`, `AirRenderTargetOptions`, `AirRenderTargetInfo`, `AirTextureColorContract` are declarations only. No recorded browser evidence in this repository covers the default bundle's `rendering` face, and `docs/evidence/examples-verified.json` proves only the candidate fingerprint it records, not today's bytes.

## Common Mistakes

### [HIGH] Turning on one shadow switch and expecting a shadow map

Wrong:
```js
light.shadowEnabled = true;
scene.globals.shadows.enabled = true;   // type left at its shipped default
// no shadow, no warn, no error - the render looks exactly as flat as before
```

Correct:
```js
scene.globals.shadows.enabled = true;
scene.globals.shadows.type = 1;                                     // ShadowMap; the default is Planar
light.shadowEnabled = true;
renderer.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;     // default OFF
```

`ShadowsInfo._type` ships as `Planar` (`src/cocos/scene-graph/scene-globals.ts:989`), so `ShadowFlow.render` bails at its guard on `type !== ShadowMap` (`src/cocos/rendering/shadow/shadow-flow.ts:116`) and no map is produced, while the planar path is the one `docs/manual/shadow-support-matrix.md:33` records as not visually settled. An agent writes the light-level flag because that is the object it can see in the API, and the other two gates stay silent - a disabled global never mentions itself and `castShadow` false just drops the model from the queue (`src/cocos/rendering/scene-culling.ts:193`).

### [HIGH] Importing the custom pipeline namespace and expecting post-processing to run

Wrong:
```js
import { rendering, postProcess } from 'cocosair';
rendering.getCustomPipeline('Forward');   // returns a builder, so it looks wired up
camera.postProcess = setting;
camera.usePostProcess = true;             // frame renders, no bloom, no throw
```

Correct:
```js
import { director } from 'cocosair';
if (!director.root.usesCustomPipeline) {  // the shipped default: the legacy forward pipeline
    // multipass in app code: draw a lower-priority camera into an AirRenderTarget,
    // then sample shot.texture from your own effect; leave postProcess untouched
}
// genuine custom-pipeline features need a variant build plus a truthy rendering.customPipeline setting
```

`rendering` is on the built bundle face but bootstrap never sets the `customPipeline` rendering key (`src/air/bootstrap.ts:152`), so `game` clears `cclegacy.rendering` (`src/cocos/game/game.ts:804`) and the root stays legacy (`src/cocos/root.ts:392`); the builder is never consulted (`src/cocos/game/director.ts:857`), so every `usePostProcess` write is accepted and ignored.

### [HIGH] Adding a second directional light to fill the dark side

Wrong:
```js
const sun = sunNode.addComponent(DirectionalLight);   // attached first
sun.illuminance = 12000;
const fill = fillNode.addComponent(DirectionalLight); // attached later
fill.illuminance = 3000;   // the sun's shading vanishes and the scene relights from the fill direction
```

Correct:
```js
const sun = sunNode.addComponent(DirectionalLight);
sun.illuminance = 12000;
const fill = fillNode.addComponent(SphereLight);      // punctual lights add, they do not replace
console.log(inspectAirDirectionalLights(scene));      // lights[].effective marks the one mainLight
```

Both directional components go through the same attach path that assigns the scene main light (`src/cocos/3d/lights/light-component.ts:292`), so the later one becomes `mainLight` and the earlier stops shading while still sitting in `directionalLights` looking configured; the only signal is the single warn at registration length two (`src/cocos/render-scene/core/render-scene.ts:338`), which names no light and never repeats.

### [MEDIUM] Treating a requested sample count as the negotiated one

Wrong:
```js
const shot = createAirRenderTarget({ width: 1024, height: 1024, samples: 8, sampleFallback: 'lower' });
const detach = shot.attachCamera(offCamera);
status.textContent = `8x MSAA at ${shot.info.requested.width}px`;   // echoes the input, not the device
```

Correct:
```js
const shot = createAirRenderTarget({ width: 1024, height: 1024, samples: 8, sampleFallback: 'lower' });
const { samples, supportedSamples, glSamples, resolveRequired } = shot.info;
if (samples !== 8) console.warn('MSAA negotiated down to', samples, supportedSamples, glSamples, resolveRequired);
```

`sampleFallback: 'lower'` steps down with no message (`src/air/rendering/render-target.ts:119`) while `info.requested` keeps the frozen input (`:121`), so reading `requested` reports a count the framebuffer never allocated and the code skips `resolve()`, the blit that only exists above 1 sample (`:141`, `:218`).

### [MEDIUM] Letting the color validator stand in for building the texture

Wrong:
```js
import { gfx, validateAirTextureColorContract } from 'cocosair';
validateAirTextureColorContract({ format: gfx.Format.RGBA8, usage: 'linear-data', decode: 'none' });
texture.reset({ format: gfx.Format.SRGB8_A8, width, height });   // a channel map that must stay linear
texture.uploadData(pixels);
```

Correct:
```js
import { gfx, validateAirTextureColorContract } from 'cocosair';
const decided = validateAirTextureColorContract({ format: gfx.Format.RGBA8, usage: 'linear-data', decode: 'none' });
texture.reset({ format: decided.format, width, height });
texture.uploadData(pixels);   // reset invalidates the resource: bytes land only via uploadData
```

The call checks the pairing you hand it and returns a frozen receipt (`src/air/rendering/color-contract.ts:46`); it inspects no texture and repairs nothing (`:37`), so the `:44` rejection fires only for the combination you wrote down and a second, inconsistent construction path still uploads a hardware-decoded sRGB format for normal, roughness or metallic data. Agents read the function name as enforcement rather than as a pure check on the arguments, so the channel map ends up color-decoded and the surface shades wrong with nothing in the log.

## References

- `references/lighting-units.md` - light component surface and defaults, `LightType` ordinals, illuminance and luminous-flux ranges with their HDR/LDR slots, `nt2lm`, the exposure and light-meter constants written into the UBO, the `mainLight` limitation text, the full `inspectAirDirectionalLights` return shape, light symbol reachability.
- `references/shadow-matrix.md` - the per-light-type support grid with its three contract IDs, the ShadowFlow gate, `ShadowType`/`PCFType`/`CSMLevel`/`CSMOptimizationMode`/`ShadowSize` ordinals, `Shadows` defaults, DirectionalLight and SpotLight shadow fields with ranges and clamps, fields the shipped pipeline ignores, silent-miss symptoms, shadow symbol reachability.
- `references/render-target.md` - `AirTargetColorFormat` and its GFX map, the options table with defaults and validation, MSAA negotiation and `sampleFallback`, every `AirRenderTargetInfo` field, method behaviors, the full `AIR_E_RENDER_TARGET_*` message table, the camera `targetTexture` relationship, `AirTransmissionCapture` lifecycle, target symbol reachability.
- `references/color-contract.md` - module face and re-export chain, `AirColorContractError`, `resolveAirTextureFormat` rules with the accepted custom `PixelFormat` values, the sRGB format set with ordinals, `validateAirTextureColorContract` rejection literals and the accepted-cell grid, the prefiltered environment contract and receipt, texture row-order and UV rules, color symbol reachability and evidence scoping.
- `references/pipeline-reachability.md` - the default `AIR_FEATURES` unit list, how a name reaches the built ESM face, `postProcess` on the delivery face, the custom-pipeline gate table, legacy pipeline entry points and flow-name constants, custom-pipeline binding ordinals, the four-layer reachability grid, the evidence-fingerprint caveat.

## Canonical docs

`docs/manual/rendering-contracts.md`, `docs/manual/lighting-units.md`, `docs/manual/shadow-support-matrix.md`, `docs/reference/rendering-color-diagnostics.md`, `docs/reference/texture-uv-verification.md`, `docs/reference/web-features.md`, `docs/notes/post-process-notes.md`.
