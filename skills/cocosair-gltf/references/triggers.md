# Cocos AIR glTF triggers

Source annotations refer to the AIR checkout.

## When to use what

- "load a model from a URL" -> `new GLTFLoader().loadAsync(url)`; the asset manager owns caching and in-flight deduplication ([loader-api.md](loader-api.md)).
- "load from bytes I already have" -> `parseAsync(data, baseUrl)` with `string | ArrayBuffer`; pass `baseUrl` for a `.gltf` whose buffers and images are relative, and pass nothing for `data:`/`blob:` input (`src/air/assets/gltf/loader.ts:115`, `:200-202`).
- "compressed model" -> inject first, then load; `setMeshoptDecoder`, `setDRACODecoder`, `setKTX2Transcoder` ([decoders.md](decoders.md)).
- "does this browser support extension X" -> `getExtensionSupport()`, and read the five statuses rather than assuming ([extensions-matrix.md](extensions-matrix.md)).
- "several copies of the same model" -> one `GLTFAsset`, many `instantiate()` calls; meshes, materials, textures and skeletons are shared, node and animation state are not ([loader-api.md](loader-api.md)).
- "loop one clip on one instance" -> `instance.setAnimationLoop(true, clipName)`; omit the name to select every clip of that instance.
- "why did my load throw with no code" -> it is a plain `Error`, a `DOMException` or a tagged `TypeError`, not a `GLTFError` ([diagnostics.md](diagnostics.md)).
- "write my own extension handler" -> `loader.register(factory)`; registration order is hook execution order, and the context type is not nameable from the declarations ([extensions-matrix.md](extensions-matrix.md), [loader-api.md](loader-api.md)).
