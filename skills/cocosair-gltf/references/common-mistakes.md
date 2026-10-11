Derived from the cocosair-gltf skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

# Common Mistakes

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
