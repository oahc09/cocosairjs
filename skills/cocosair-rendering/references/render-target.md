Derived from `src/air/rendering/render-target.ts`, `src/air/rendering/transmission-capture.ts`, `docs/manual/rendering-contracts.md`, `build/cocosair.module.d.ts` (declarations, current lines only), `build/cocosair.module.js`, `tools/verify/rendering-contracts.cjs` (as of 2026-10-09).

## AirTargetColorFormat

`src/air/rendering/render-target.ts:14`:

```ts
export type AirTargetColorFormat = 'rgba8' | 'rgba16f' | 'rgba32f' | 'srgb8-alpha8';
```

Format map to GFX (`src/air/rendering/render-target.ts:41`): `rgba8 -> Format.RGBA8`, `rgba16f -> Format.RGBA16F`, `rgba32f -> Format.RGBA32F`, `srgb8-alpha8 -> Format.SRGB8_A8`.

## AirRenderTargetOptions (defaults and validation)

Interface at `src/air/rendering/render-target.ts:15`. Defaults resolved in the constructor (`:97`-`:102`):

| Field            | Type                            | Default              | Line          | Validation                                          |
| ---------------- | ------------------------------- | -------------------- | ------------- | --------------------------------------------------- |
| `name`           | `string?`                       | none (undefined)     | `:16`         | allowed key                                         |
| `width`          | `number` (required)             | none                 | `:18`         | reference backing pixels, `positive` required       |
| `height`         | `number` (required)             | none                 | `:19`         | reference backing pixels, `positive` required       |
| `scale`          | `number?`                       | `1`                  | `:20`, `:101` | finite and positive                                 |
| `colorFormat`    | `AirTargetColorFormat?`         | `'rgba8'`            | `:21`, `:97`  | must be a known key and a renderable sampled format |
| `depthFormat`    | `'none' \| 'depth24-stencil8'?` | `'depth24-stencil8'` | `:22`, `:98`  | must be one of the two                              |
| `samples`        | `1 \| 2 \| 4 \| 8?`             | `1`                  | `:23`, `:102` | must be one of 1,2,4,8                              |
| `filter`         | `'nearest' \| 'linear'?`        | `'nearest'`          | `:24`, `:99`  | `linear` requires format LINEAR_FILTER              |
| `sampleFallback` | `'error' \| 'lower'?`           | `'error'`            | `:25`, `:100` | must be one of the two                              |

Constructor rejects unknown option keys and explicitly-`undefined` enum values (`src/air/rendering/render-target.ts:91`, `:93`).

## samples accepted set and sampleFallback semantics

Accepted literal set: `1 | 2 | 4 | 8` (`src/air/rendering/render-target.ts:23`, enforced `:105`). The device-supported set is the intersection of the color-renderbuffer and depth-renderbuffer `SAMPLES` parameters, always including 1 (`:114`-`:117`). Selection (`:118`-`:120`):

- If `samples` is in `supportedSamples`, it is used.
- Else if `sampleFallback === 'lower'`, the largest supported sample count `<= samples` is used.
- Else `sampleFallback === 'error'` and `actualSamples` is `0`, so the target throws `AIR_E_RENDER_TARGET_SAMPLES`.

After allocation, the driver's actual `gl.getParameter(gl.SAMPLES)` is compared; a mismatch throws `AIR_E_RENDER_TARGET_SAMPLES` (`:179`, `:180`). `resolveRequired` in `info` is true only when `effective.samples > 1` (`:141`).

## AirRenderTargetInfo (requested vs effective)

`src/air/rendering/render-target.ts:27`; produced by the `info` getter (`:138`, frozen `:139`):

| Field                 | Type                                                   | Meaning                                                   | Line                  |
| --------------------- | ------------------------------------------------------ | --------------------------------------------------------- | --------------------- |
| `requested`           | `Readonly<AirRenderTargetOptions>`                     | the frozen input options (updated width/height on resize) | `:28`, `:121`, `:188` |
| `effective`           | `{ colorFormat, depthFormat, samples, filter, scale }` | resolved/selected values after device negotiation         | `:29`, `:122`         |
| `width`               | `number`                                               | actual pixel width after scale, `>= 1`                    | `:30`, `:166`         |
| `height`              | `number`                                               | actual pixel height after scale, `>= 1`                   | `:31`, `:167`         |
| `samples`             | `number`                                               | equals `effective.samples`                                | `:32`, `:140`         |
| `generation`          | `number`                                               | incremented on each successful resize                     | `:33`, `:189`         |
| `framebufferComplete` | `boolean`                                              | `!disposed`                                               | `:34`, `:140`         |
| `resolveRequired`     | `boolean`                                              | `effective.samples > 1`                                   | `:35`, `:141`         |
| `disposed`            | `boolean`                                              | disposal flag                                             | `:36`, `:141`         |
| `supportedSamples`    | `readonly number[]`                                    | device-supported sample set (sorted)                      | `:37`, `:142`         |
| `glSamples`           | `number`                                               | last driver-allocated sample count                        | `:38`, `:142`         |

## Public methods

| Method                                    | Behavior                                                                                             | Line   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- | ------ |
| `resize(baseWidth, baseHeight)`           | reallocate at `floor(dim * scale)`, min 1; bumps `generation`; rebinds cameras and material bindings | `:164` |
| `attachCamera(camera, beforeRender?)`     | sets `camera.targetTexture`, registers pipeline begin/end listeners, returns `detach()`              | `:197` |
| `resolve()`                               | blits multisample rendering buffer to the resolved output; no-op when `samples === 1`                | `:216` |
| `bindColor(material, property, passIdx?)` | binds `this.texture` to an active `sampler2D`; returns `unbind()`                                    | `:257` |
| `bindDepth(material, property, passIdx?)` | binds `this.depthTexture`; returns `unbind()`                                                        | `:258` |
| `readColor(region?)`                      | resolves then `readPixels`; `Float32Array` for float formats, `Uint8Array` otherwise                 | `:262` |
| `dispose()`                               | unbinds, detaches cameras, destroys textures; safe to repeat                                         | `:280` |

`createAirRenderTarget(options)` returns `new AirRenderTarget(options)` (`src/air/rendering/render-target.ts:290`).

## Throw and warn message literals (all via `failure`, `src/air/rendering/render-target.ts:43`)

`failure` throws `Error("[<code>] <message>")` and sets `error.code`. Device must be WebGL2 and `director.root.device` present, else the first throw (`:88`).

| Code                             | Literal message                                                                     | Trigger                                           | Line           |
| -------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- | -------------- |
| `AIR_E_RENDER_TARGET_SIZE`       | `<name> must be finite and positive`                                                | `width`/`height`/`scale` not finite positive      | `:49`          |
| `AIR_E_RENDER_TARGET_DEVICE`     | `await createAirApp(); this target requires WebGL2`                                 | no device or `gfxAPI !== WEBGL2`                  | `:88`          |
| `AIR_E_RENDER_TARGET_OPTIONS`    | `provide target options`                                                            | options missing or not an object                  | `:90`          |
| `AIR_E_RENDER_TARGET_OPTION`     | `unknown option <key>; use the explicit colorFormat/depthFormat contract`           | option key outside allow-list                     | `:92`          |
| `AIR_E_RENDER_TARGET_OPTION`     | `<key> was explicitly undefined; check the enum/name or omit it to use the default` | enum/scale key present but `undefined`            | `:95`          |
| `AIR_E_RENDER_TARGET_FORMAT`     | `unknown colorFormat <colorFormat>`                                                 | colorFormat not a `formats` key                   | `:103`         |
| `AIR_E_RENDER_TARGET_OPTION`     | `unsupported depthFormat/filter/sampleFallback/samples`                             | any of these outside allowed literals             | `:106`         |
| `AIR_E_RENDER_TARGET_FORMAT`     | `<colorFormat> is not a renderable sampled format on this device`                   | format lacks RENDER_TARGET or SAMPLED_TEXTURE     | `:108`, `:109` |
| `AIR_E_RENDER_TARGET_FILTER`     | `<colorFormat> does not support linear filtering`                                   | `filter: 'linear'` without LINEAR_FILTER          | `:110`, `:111` |
| `AIR_E_RENDER_TARGET_SAMPLES`    | `<colorFormat>/<depthFormat> cannot use <samples> samples; supported=<list>`        | unsupported sample with `sampleFallback: 'error'` | `:120`         |
| `AIR_E_RENDER_TARGET_SAMPLES`    | `driver allocated <glSamples> samples instead of <effective.samples>`               | driver sample mismatch after init                 | `:179`, `:180` |
| `AIR_E_RENDER_TARGET_SIZE`       | `scaled dimensions exceed MAX_TEXTURE_SIZE`                                         | scaled width/height above device cap              | `:168`, `:169` |
| `AIR_E_RENDER_TARGET_INCOMPLETE` | `<colorFormat> framebuffer is incomplete`                                           | `checkFramebufferStatus !== FRAMEBUFFER_COMPLETE` | `:156`, `:157` |
| `AIR_E_RENDER_TARGET_DISPOSED`   | `target has been disposed`                                                          | any operation after `dispose()`                   | `:130`         |
| `AIR_E_RENDER_TARGET_DEPTH`      | `target has no readable depth attachment`                                           | depth read when attachment missing                | `:135`         |
| `AIR_E_RENDER_TARGET_DEPTH`      | `request depth24-stencil8 before binding depth`                                     | `bindDepth` when `depthFormat === 'none'`         | `:259`         |
| `AIR_E_RENDER_TARGET_CAMERA`     | `camera is already attached to this target`                                         | `attachCamera` on an attached camera              | `:199`         |
| `AIR_E_RENDER_TARGET_RESOLVE`    | `resolve failed with GL error <error>`                                              | `gl.getError()` non-zero after blit               | `:231`, `:232` |
| `AIR_E_RENDER_TARGET_BINDING`    | `<material.name>.<property> must be an active sampler2D in the requested pass`      | handle missing / not single SAMPLER2D             | `:242`, `:244` |
| `AIR_E_RENDER_TARGET_READ`       | `read rectangle must be integral and inside the target`                             | non-integer or out-of-bounds region               | `:265`, `:266` |
| `AIR_E_RENDER_TARGET_READ`       | `color readback failed with GL error <error>`                                       | `gl.getError()` non-zero after readPixels         | `:276`         |

## Relationship to camera targetTexture

`attachCamera` stores the camera's prior `targetTexture`, sets `camera.targetTexture = this.renderTexture`, and registers `RENDER_CAMERA_BEGIN`/`RENDER_CAMERA_END` pipeline listeners (`src/air/rendering/render-target.ts:200`, `:204`, `:205`, `:206`). The end listener calls `resolve()` so the next camera can sample `target.texture` in the same frame (`:203`, `docs/manual/rendering-contracts.md:28`). On a successful resize the target re-assigns each attached camera via `camera.targetTexture = null; camera.targetTexture = this.renderTexture;` because `renderTexture` points at a new native object (`src/air/rendering/render-target.ts:192`, `docs/manual/rendering-contracts.md:32`). `detach` restores the previous `targetTexture` only while it still equals this target (`:211`). Business code assigning `camera.targetTexture` directly must follow the new object itself (`docs/manual/rendering-contracts.md:32`).

## AirTransmissionCapture (one-per-scene, lifecycle)

`AirTransmissionCapture` is a `Component` (`@ccclass('air.AirTransmissionCapture')`, `src/air/rendering/transmission-capture.ts:74`). `TRANSMISSION_LAYER = 1 << 26` (`:29`).

One-per-scene enforcement runs in `onEnable`: it scans the module-level `active` set and throws if another capture shares the same `node.scene` (`src/air/rendering/transmission-capture.ts:103`-`:108`). Error literal (`:105`):

```
AirTransmissionCapture: only one capture per scene is supported (material instances carry a single scene-color binding; multi-camera is not yet implemented).
```

Lifecycle rules:

- `mainCamera` setter arms the capture when enabled in hierarchy and on a capable device (`src/air/rendering/transmission-capture.ts:81`-`:87`).
- `_ensure` creates the offscreen `Node`, a lower-priority offscreen `Camera` (`priority = main.priority - 1`) targeting a `RenderTexture`, and arms the capability (`:232`-`:254`).
- `lateUpdate` rebinds `cc_sceneColorTex` and `airSceneColorInfo` per owned renderer, resizes the RT with the main window, and syncs offscreen transform/visibility (`:139`-`:187`).
- `onDisable` deletes from `active`, disables the offscreen pass, releases bindings, restores main-camera visibility, and clears the capability when no capture remains (`:115`-`:126`).
- `onDestroy` releases bindings before the `RenderTexture` is destroyed, restores visibility, tears down, and clears the capability when `active.size === 0` (`:128`-`:137`).
- Capability is armed only while a capture is enabled on a WebGL2 device; otherwise the transmission/volume/dispersion extensions report `device-dependent` (`src/air/rendering/transmission-capture.ts:10`, `:65`).

## Bundle reachability (single `export { ... }` block of `build/cocosair.module.js`)

| Symbol                   | Runtime ESM export                | Declaration                                             | Evidence                                    |
| ------------------------ | --------------------------------- | ------------------------------------------------------- | ------------------------------------------- |
| `AirRenderTarget`        | resolves by symbol name           | class declaration, constructor in d.ts currently :57336 | bundle parse + `build/cocosair.module.d.ts` |
| `createAirRenderTarget`  | resolves by symbol name           | d.ts currently :57298                                   | bundle parse                                |
| `AirTransmissionCapture` | resolves by symbol name           | yes                                                     | bundle parse                                |
| `TRANSMISSION_LAYER`     | resolves by symbol name           | yes                                                     | bundle parse                                |
| `isTransmissionMaterial` | resolves by symbol name           | yes                                                     | bundle parse                                |
| `AirTargetColorFormat`   | type-only, not in JS export block | `export type` in d.ts currently :57299                  | declarations only                           |
| `AirRenderTargetOptions` | type-only, not in JS export block | `export interface` d.ts currently :57300                | declarations only                           |
| `AirRenderTargetInfo`    | type-only, not in JS export block | `export interface` d.ts currently :57312                | declarations only                           |

"Resolves by symbol name" is a bundle/declaration lookup, not browser verification. The browser contract evidence for format/MSAA/depth/resize cases is `tools/verify/rendering-contracts.cjs` scoped and recorded per its own candidate fingerprint (`docs/manual/rendering-contracts.md:34`, `:49`).
