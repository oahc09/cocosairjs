Derived from the cocosair-rendering skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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
