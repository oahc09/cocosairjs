---
name: cocosair-gltf
description: Drives the Cocos AIR glTF and GLB surface - GLTFLoader with loadAsync and parseAsync, the three decoder setters and the provider factories behind them, getExtensionSupport and the five-status extension contract across 21 registered handlers, GLTFAsset with its five read-only collections plus instantiate(sceneIndex), GLTFInstance setAnimationLoop and dispose, the five GLTFError codes, and the plain Error, DOMException and tagged TypeError shapes that are not GLTFError. Use when a Draco, meshopt or KTX2 model reports GLTF_DECODER_MISSING, when getExtensionSupport says decoder-required, when a load rejects with no code field, when an instance animation will not loop, or when destroying a GLTFAsset leaves GPU resources behind.
---

# Cocos AIR glTF contracts

Load glTF and GLB straight from a URL or from bytes, inject your own decoders, instantiate shared assets into independent node trees, and read the support matrix honestly - there is no Creator importer and no bundled Draco, meshopt or KTX2 decoder here.

## Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, Vec3, Color, frameObject,
         GLTFLoader, createMeshoptDecoder } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const scene = new Scene('gltf');
const camNode = new Node('Main Camera');
scene.addChild(camNode); camNode.setPosition(new Vec3(0, 1.6, 5)); camNode.setRotationFromEuler(-12, 0, 0);
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45; camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(30, 40, 60, 255);
const lightNode = new Node('Main Light');
scene.addChild(lightNode); lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight).illuminance = 50000;
// 1) decoders are never bundled; build the URL at runtime so no bundler resolves it statically
const decoderUrl = '/build/gltf-decoders' + '/meshopt/meshopt_decoder.mjs';
const decoderModule = await import(/* @vite-ignore */ decoderUrl);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(createMeshoptDecoder(decoderModule.MeshoptDecoder));   // returns this, chainable
// 2) ask before you load; status is a function of what you just injected
for (const e of loader.getExtensionSupport()) if (e.status !== 'supported') console.warn(e.name, e.status, e.reason ?? '');
// 3) load, instantiate, frame; parseAsync(bytes, baseUrl) is the in-memory twin
const asset = await loader.loadAsync('./assets/meshopt-khr.glb');
console.log(asset.sceneNames, asset.meshes.length, asset.animations.length, asset.warnings);
const instance = asset.instantiate(0);
scene.addChild(instance.root); frameObject(camera, instance.root);
instance.setAnimationLoop(true, instance.animations[0]?.name);   // per-instance wrap; shared clips untouched
app.run(scene);   // async render loop; first frame draws on a later tick, so never free synchronously here
// 4) release LATER (on teardown): instance first, then asset - freeing now blanks the screen before frame 1
function teardown() { instance.dispose(); asset.destroy(); }  // dispose=stop+deactivate+destroy root; destroy defers GPU release to NODE_DESTROYED
</script>
```

## Related skills

- [cocosair](../cocosair/SKILL.md) - the router and Code First discipline; load it first.
- [cocosair-project-setup](../cocosair-project-setup/SKILL.md) - which entry exposes a name, how the importmap alias `cocosair` differs from the npm package `cocosair.js`, and where `build/gltf-decoders/` sits relative to your bundle.
- [cocosair-assets](../cocosair-assets/SKILL.md) - `loadAssetAsync` routes `.gltf`/`.glb` into this skill and stops being the generic path; `AssetBank` and `Texture2D` ownership live there.
- [cocosair-scene-graph](../cocosair-scene-graph/SKILL.md) - deferred `destroy()`, `isValid` and `NODE_DESTROYED` ordering, which is what makes `GLTFAsset` release deferred too, plus the `MeshRenderer` and `SkinnedMeshRenderer` the instantiated nodes carry.
- [cocosair-materials-effects](../cocosair-materials-effects/SKILL.md) - the `air-gltf-standard` and `air-gltf-physical` effects the parser builds; overriding them means overriding a shared material.
- [cocosair-animation-tween](../cocosair-animation-tween/SKILL.md) - the native `Animation` component and `AnimationClip` wrap modes that `setAnimationLoop` reconfigures per instance.
- [cocosair-skinning-morph](../cocosair-skinning-morph/SKILL.md) - joint paths, bind pose and morph targets for the skeletons and weight sets this skill loads.
- [cocosair-performance](../cocosair-performance/SKILL.md) - cost of re-instantiating versus sharing one `GLTFAsset`, and draw-call consequences of `EXT_mesh_gpu_instancing` expansion.
- [cocosair-verification](../cocosair-verification/SKILL.md) - the gates and collectors behind every browser claim quoted below, including `npm run capabilities` and `verify:decoders`.

## When to use what

- "load a model from a URL" -> `new GLTFLoader().loadAsync(url)`; the asset manager owns caching and in-flight deduplication (`references/loader-api.md`).
- "load from bytes I already have" -> `parseAsync(data, baseUrl)` with `string | ArrayBuffer`; pass `baseUrl` for a `.gltf` whose buffers and images are relative, and pass nothing for `data:`/`blob:` input (`src/air/assets/gltf/loader.ts:115`, `:200-202`).
- "compressed model" -> inject first, then load; `setMeshoptDecoder`, `setDRACODecoder`, `setKTX2Transcoder` (`references/decoders.md`).
- "does this browser support extension X" -> `getExtensionSupport()`, and read the five statuses rather than assuming (`references/extensions-matrix.md`).
- "several copies of the same model" -> one `GLTFAsset`, many `instantiate()` calls; meshes, materials, textures and skeletons are shared, node and animation state are not (`references/loader-api.md`).
- "loop one clip on one instance" -> `instance.setAnimationLoop(true, clipName)`; omit the name to select every clip of that instance.
- "why did my load throw with no code" -> it is a plain `Error`, a `DOMException` or a tagged `TypeError`, not a `GLTFError` (`references/diagnostics.md`).
- "write my own extension handler" -> `loader.register(factory)`; registration order is hook execution order, and the context type is not nameable from the declarations (`references/extensions-matrix.md`, `references/loader-api.md`).

## Contracts

- Two entry points, one pipeline. `loadAsync(url)` (`src/air/assets/gltf/loader.ts:108-113`) resolves the URL against `document.baseURI` (`:39-41`), derives `ext` from `/\.(gltf|glb)$/i` on the query-stripped path and falls back to `.glb` when there is no suffix (`:36-38`, `:112`), then hands off to `assetManager.loadRemote` with the resolved options under the `gltf` key. `parseAsync` (`:115-184`) is the same work in memory with no cache and an abort `signal`. It validates every accessor up front (`:136`) before any image decode or GPU allocation, snapshots handler data at `resolveData` (`:138`) before `releaseDecodedData()` drops the buffers (`:181`), and on any failure runs `context.dispose(); asset.destroy(); throw` (`:183`) so nothing half-built survives. Importing the glTF module registers all of this automatically: `src/air/assets/gltf/index.ts:25-26` calls `registerGLTFLoader()` at import time, and that function is idempotent through a module flag (`src/air/assets/gltf/loader.ts:187-189`). For both `.gltf` and `.glb` it installs a `fetch` downloader honoring `options.header` and `withCredentials` (`:191-196`), a parser that runs `decodeContainer` purely as validation (`:197-199`), and a factory calling `parseAsync` with a base of `new URL('.', absoluteURL(url)).href` - or `undefined` for `data:` and `blob:` URLs (`:200-202`). On factory failure it evicts `${url}@native` from the `files` and `parsed` caches (`:205`) so a transient error is not cached permanently. Call `registerGLTFLoader()` yourself only when importing the loader module directly.
- Decoders ship beside the bundle, never inside it. `build/gltf-decoders/` holds draco3d 1.5.7, meshoptimizer 1.2.0 and the three r168 Basis files with byte counts and sha256 in `build/gltf-decoders/MANIFEST.md`; `tools/verify/decoder-audit.cjs` fails the build if the bundle contains WASM magic bytes or a decoder file name. The only application-side entry is the three setters (`src/air/assets/gltf/loader.ts:82-90`), each accepting `null` to clear. With nothing injected and a required compression extension in use, the asset is rejected with `GLTF_DECODER_MISSING` (`src/air/assets/gltf/extensions/geometry/draco.ts:75-77`). The shipped Draco entry is Node/CommonJS by deliberate ruling, not oversight: browser Draco decode requires an app-supplied browser build (`references/decoders.md`).
- `getExtensionSupport()` reports a live value, not a build constant. It builds a throwaway probe context (`src/air/assets/gltf/loader.ts:95-106`) and computes `handler.support?.() ?? { name, status: 'supported' }`, so a handler with no `support()` - `KHR_materials_unlit` and `KHR_texture_transform` - is unconditionally `supported` (`:100`). The same loader reports `decoder-required` before injection and `supported` after; `examples/gltf-meshopt/src/main.ts:94-97` proves the flip by asserting the handler-level `support?.().status === 'supported'` once the shipped meshopt decoder is wired in. `KNOWN_UNIMPLEMENTED` is an empty array (`:49-51`), so the returned list is exactly the 21 handler entries in registration order. Of the five statuses only `supported` and `decoder-required` carry browser evidence; `device-dependent` is reachable from four `support()` implementations behind five extension names but appears in no tracked record, and `fallback` and `unsupported` are emitted by nothing shipped (`references/extensions-matrix.md`).
- Required and optional extensions behave differently. `validateRequired` (`src/air/assets/gltf/extension-registry.ts:104-124`) throws for an unknown or non-`supported` extension listed in `extensionsRequired`, mapping `decoder-required` to `GLTF_DECODER_MISSING`, `device-dependent` to `GLTF_DEVICE_UNSUPPORTED` and `fallback` to `GLTF_EXTENSION_UNSUPPORTED` (`:55-59`, `:118-121`); the same condition on an optional extension only warns and continues on the core fallback (`:122`). An unknown **optional** extension is fully silent - `continue` with no warning and no report entry (`:114`).
- `GLTFAsset` exposes five read-only collections, not nine. `meshes`, `materials`, `textures`, `skeletons` and `animations` are getters over the `@internal` mutable builder `owned` (`src/air/assets/gltf/asset.ts:52-58`); `sceneNames`, `document` (the original JSON, including camera and light descriptions and original node names) and `warnings` are separate members (`:59-62`), and `images` plus `meshMaterials` are `@internal` (`:63-64`).
- Instantiating shares assets and isolates state. `instantiate(sceneIndex = json.scene ?? 0)` (`src/air/assets/gltf/asset.ts:76`) computes a `visible` set by child walk and an `included` set that additionally pulls in every ancestor of every skin joint (`:84-89`), rebuilds each clip keeping only tracks whose hierarchy root is included and caches the result per scene index (`:90-101`), then builds fresh nodes. Skin nodes get a `SkinnedMeshRenderer` with `setUseBakedAnimation(false)`, `skinningRoot = root` and the shared skeleton (`:139-141`) after JOINTS_0 values are range-checked (`:135-138`); everything else gets a `MeshRenderer` (`:143`). The root also carries `GLTFWinding` (`:126`), a native `Animation` with `playOnLoad = false`, and the private `GLTFAnimationPolicy` at `@executionOrder(100)` - one past native `Animation`'s 99 - whose `onLoad` reapplies per-instance wrap modes that the native rebuild would otherwise drop (`:25-38`, `:159-163`).
- Release is deferred by design. `instantiate` takes one `addRef` and one instance count (`src/air/assets/gltf/asset.ts:164`) and hooks `root.once(Node.EventType.NODE_DESTROYED, ...)` which decrements in a microtask, because that event precedes child and component teardown (`:168-175`). `destroy()` sets `destroyRequested`, deregisters the uuid from `assets`, and calls `releaseResources()` immediately only when `instances === 0` (`:198-204`); otherwise the last instance's hook does it. `releaseResources()` destroys the `Set` union of materials, meshes, skeletons, animations, textures, images and every cached scene clip exactly once, then `super.destroy()` (`:205-212`). After `destroyRequested`, `instantiate()` rejects with `asset is destroyed` while live instances keep running (`:77`).
- `GLTFInstance` is a plain object, not a class. It is the literal returned at `src/air/assets/gltf/asset.ts:176` with `root`, `animations`, `setAnimationLoop` and `dispose` as closure properties, so no prototype, static, export-wrapper or namespace mechanism can bind to it - which is why neither method has any instrumentation evidence and their proof is the passing examples that call them (`references/loader-api.md`).
- Only some failures are `GLTFError`. `GLTFErrorCode` is the closed five-member union at `src/air/assets/gltf/diagnostics.ts:2-3`; the class sets `name = 'GLTFError'` and prefixes the message with `[glTF] ` (`:6-11`), so `code` is the only reliable discriminator - the registry throws plain `Error`s with the same prefix for a duplicate handler name (`src/air/assets/gltf/extension-registry.ts:86`) and a missing dependency (`:93`), `schema.ts` `check`/`item`/`integer` throw plain prefix-only `Error`s for every structural rule (`src/air/assets/gltf/schema.ts:55-65`), a cancelled load throws `DOMException('glTF load aborted', 'AbortError')` from both `src/air/assets/gltf/loader.ts:117` and `src/air/assets/gltf/parser-context.ts:84-85`, and `setAnimationLoop` throws a `TypeError` tagged `AIR_E_GLTF_ANIMATION_OPTIONS` (`src/air/assets/gltf/asset.ts:177-179`) which no `instanceof GLTFError` check will ever see.
- Warnings are a second channel. `context.warn` both records and `console.warn`s with the `[glTF] ` prefix (`src/air/assets/gltf/parser-context.ts:90`), and `asset.warnings` exposes the list afterwards. Cameras are kept as descriptions rather than instantiated, and `KHR_lights_punctual` `innerConeAngle` is retained as metadata with no engine plateau input - both surface as warnings (`src/air/assets/gltf/nodes.ts:16`, `src/air/assets/gltf/extensions/scene/lights.ts:117`).
- Progress is advisory and uneven. `container` and `objects` are always `(1, 1)`; `decode` and `textures` report the accessor and texture counts, so `loaded === total === 0` means an empty document, not a stall; `dependencies` is emitted only from inside `loadBuffers` and never carries a `url` (`src/air/assets/gltf/parser-context.ts:159`, `:168`), while `url` is populated only when `parseAsync` got a string (`src/air/assets/gltf/loader.ts:120-121`). Every emission sits inside the `parseAsync` try block, so a throwing `onProgress` fails the load through the normal teardown (`references/diagnostics.md`).
- Keep the three capability layers apart. `GLTFLoader`, `GLTFAsset`, `GLTFError`, `GLTFExtensionRegistry`, `registerGLTFLoader`, `configureGLTFLoaderDefaults`, `createDracoDecoder`, `createMeshoptDecoder`, `createKTX2Transcoder`, `isMeshoptAvailable`, `isKTX2Available`, `detectImageMime`, `SUPPORTED_IMAGE_MIMES`, `KTX2_RAW_MIME`, the three geometry factories and the four extension-name constants all resolve by symbol in the single `export { ... }` block of `build/cocosair.module.js` (currently `:161574`); `MAX_KTX2_DIMENSION`, `GLTFParserContext` and `gltfPhysicalEffect` do not. `GLTFParserContext` does appear 15 times in `build/cocosair.module.d.ts` but only as the mangled `__private._air_assets_gltf_parser_context__GLTFParserContext` (`:72760`), so a TypeScript consumer writing a custom factory cannot name its context parameter and must use `Parameters<GLTFExtensionFactory>[0]`.
- Browser evidence, stated plainly. At candidate fingerprint `2f089f6ce25eaccd` (`docs/evidence/examples-verified.json`, file-level `measuredAt` 2026-10-04T05:52:32.537Z), 18 gltf-touching ids are `result: PASS` and 17 of them carry gltf bindings. Strong: `GLTFLoader` (scene-ready x10), `parseAsync` (asset-loaded x10, visible-frame x3), `instantiate` (asset-loaded x5, visible-frame x2, node-exists x2, scene-ready x2, resource-released x1), `destroy` (resource-released x10). Real meshopt decode is browser-proven by `gltf-meshopt` (`visible-frame litRatio=0.1606`, `resource-released held=3 leaked=0`, `assets/meshopt-khr.glb=1728B` fetched). Real Draco decode and real KTX2 transcode are proven nowhere: `gltf-draco` has no `visible-frame` validator because what it proves is the refusal path, and no example imports the Basis transcoder. `GLTFInstance.setAnimationLoop`, `GLTFInstance.dispose`, `configureGLTFLoaderDefaults` and `registerGLTFLoader` have zero bindings.

## Common Mistakes

### [HIGH] Assuming the decoders are built in

Wrong:
```js
import { GLTFLoader } from 'cocosair';
const asset = await new GLTFLoader().loadAsync('./assets/model.glb');   // KHR_draco_mesh_compression required
```

Correct:
```js
import { GLTFLoader, createMeshoptDecoder } from 'cocosair';
const url = '/build/gltf-decoders' + '/meshopt/meshopt_decoder.mjs';    // concatenated: no static resolution
const mod = await import(/* @vite-ignore */ url);
const loader = new GLTFLoader().setMeshoptDecoder(createMeshoptDecoder(mod.MeshoptDecoder));
const asset = await loader.loadAsync('./assets/model.glb');
```

Decoders are never bundled and nothing is implicitly initialized (`build/gltf-decoders/MANIFEST.md:3-5`, `docs/gltf/gltf-decoder-deployment.md:41`), so a required compression extension without an injected provider rejects the whole asset with `GLTF_DECODER_MISSING` (`src/air/assets/gltf/extensions/geometry/draco.ts:75-77`).

### [HIGH] Reading `decoder-required` as `supported`

Wrong:
```js
const support = loader.getExtensionSupport();
if (support.some((e) => e.name === 'KHR_texture_basisu')) {
    await loader.loadAsync('./assets/ktx2.glb');    // presence in the list is not support
}
```

Correct:
```js
const entry = loader.getExtensionSupport().find((e) => e.name === 'KHR_texture_basisu');
if (entry?.status === 'supported') {
    await loader.loadAsync('./assets/ktx2.glb');
} else {
    console.warn(entry?.status, entry?.reason ?? '');   // 'decoder-required' plus how to fix it
}
```

`getExtensionSupport()` returns an entry for all 21 registered handlers regardless of status (`src/air/assets/gltf/loader.ts:99-101`), and the status is a function of the decoders currently injected, so the same loader flips from `decoder-required` to `supported` after `setMeshoptDecoder` (`examples/gltf-meshopt/src/main.ts:94-97`).

### [HIGH] Catching only `GLTFError`

Wrong:
```js
try { await loader.parseAsync(bytes, './assets/'); }
catch (e) { if (e instanceof GLTFError) log(e.code); else throw e; }   // rethrows three real cases
```

Correct:
```js
const ctrl = new AbortController();
const loader = new GLTFLoader({ signal: ctrl.signal });   // options come from the constructor, not parseAsync
try { await loader.parseAsync(bytes, './assets/'); }
catch (e) {
    if (e instanceof GLTFError) log(e.code, e.extension ?? '-');
    else if (e instanceof DOMException && e.name === 'AbortError') log('cancelled');
    else if (e.code === 'AIR_E_GLTF_ANIMATION_OPTIONS') log('instance misuse', e.clipName);
    else log('structural', e.message);      // plain [glTF] Error from schema.ts or the registry
}
```

One rejection surface produces four shapes: `GLTFError` with a `code`, plain prefix-only `Error`s from `schema.ts` and the registry (`src/air/assets/gltf/schema.ts:55-65`, `src/air/assets/gltf/extension-registry.ts:86`), `DOMException` on abort (`src/air/assets/gltf/loader.ts:117`), and the tagged `TypeError` from `setAnimationLoop` (`src/air/assets/gltf/asset.ts:177-179`).

### [MEDIUM] Naming glTF internals that are not on the public face

Wrong:
```ts
import { GLTFParserContext, gltfPhysicalEffect, MAX_KTX2_DIMENSION } from 'cocosair';
const factory = (context: GLTFParserContext) => ({ name: 'MY_ext', validate: () => {} });
```

Correct:
```ts
import type { GLTFExtensionFactory } from 'cocosair';
const factory: GLTFExtensionFactory = (context) => ({ name: 'MY_ext', validate: () => {} });
type Ctx = Parameters<GLTFExtensionFactory>[0];   // the only way to name the context type
```

`MAX_KTX2_DIMENSION` and `gltfPhysicalEffect` are absent from the runtime export block, and `GLTFParserContext` survives in `build/cocosair.module.d.ts` only as the mangled `__private` alias at `:72760`, so importing it by name fails at both compile time and run time.

### [MEDIUM] Expecting `asset.destroy()` to tear down live instances

Wrong:
```js
asset.destroy();                       // expecting the scene graph and GPU memory to go now
scene.removeChild(instance.root);
```

Correct:
```js
instance.dispose();                    // stop, deactivate, destroy the root
asset.destroy();                       // release runs when the last instance's hook fires
// or, to free the shared assets immediately: dispose every instance first, then destroy
```

`destroy()` calls `releaseResources()` immediately only when `instances === 0` (`src/air/assets/gltf/asset.ts:202`); with a live instance it just sets `destroyRequested`, and the shared meshes, materials, textures and skeletons stay valid until that instance's `NODE_DESTROYED` microtask decrements the count (`:168-175`).

## References

- `references/loader-api.md` - the two entry points and import-time registration, loader configuration and option precedence, the ordered `parseAsync` pipeline, the `GLTFAsset` member table and its deferred release, `instantiate(sceneIndex)` visibility versus inclusion and per-scene clip caching, the `GLTFInstance` contract, the public versus internal face, and the per-symbol evidence split.
- `references/extensions-matrix.md` - the five statuses with their error-code mapping and proof state, how `getExtensionSupport()` computes them, all 21 registrations in hook order with catalog status and official comparison, the required versus optional table, registration-order rules, and what the browser evidence does not cover.
- `references/decoders.md` - why decoders are outside the bundle, the shipped artifact inventory with byte counts, the three setters and three provider factories and their interfaces, the browser module-loading pattern and MIME requirements, the unusable meshopt barrel, the Node-only Draco ruling, the KTX2 ceiling and target formats, and what is actually verified.
- `references/diagnostics.md` - the five codes with recomputed throw-site counts, how to discriminate a caught error, the four non-`GLTFError` shapes, the two incompatible report types, where each progress phase is emitted, the warning channel and its one fully silent case, failure containment, and the evidence gap.

## Canonical docs

- `docs/gltf/gltf-runtime.md` - open for the load-and-play walkthrough, the other loading entries, multi-instance resource sharing, the support-boundary table and the material, lighting and instancing semantics behind it.
- `docs/gltf/gltf-extension-reference.md` - open for the general extension contract and the per-family detail: geometry compression, texture encoding, scene extensions and the material extension set, plus the official-sample comparison column.
- `docs/gltf/gltf-decoder-deployment.md` - open for the artifact inventory pointer, the injection API, static serving requirements, nested deployment paths, the offline acceptance gate and the failure-semantics quick reference.
- `build/gltf-decoders/MANIFEST.md` - open for authoritative versions, licenses, per-file byte counts and sha256, the gate identity, and the recorded browser-side Draco decision.
