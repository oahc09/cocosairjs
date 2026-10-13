---
name: cocosair-gltf
description: "Drives the Cocos AIR glTF and GLB surface - GLTFLoader with loadAsync and parseAsync, the three decoder setters and the provider factories behind them, getExtensionSupport and the five-status extension contract across 21 registered handlers, GLTFAsset with its five read-only collections plus instantiate(sceneIndex), GLTFInstance setAnimationLoop and dispose, the five GLTFError codes, and the plain Error, DOMException and tagged TypeError shapes that are not GLTFError. Use when a Draco, meshopt or KTX2 model reports GLTF_DECODER_MISSING, when getExtensionSupport says decoder-required, when a load rejects with no code field, when an instance animation will not loop, or when destroying a GLTFAsset leaves GPU resources behind."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, gltf"
  description_en: "Drives the Cocos AIR glTF and GLB surface - GLTFLoader with loadAsync and parseAsync, the three decoder setters and the provider factories behind them, getExtensionSupport and the five-status extension contract across 21 registered handlers, GLTFAsset with its five read-only collections plus instantiate(sceneIndex), GLTFInstance setAnimationLoop and dispose, the five GLTFError codes, and the plain Error, DOMException and tagged TypeError shapes that are not GLTFError. Use when a Draco, meshopt or KTX2 model reports GLTF_DECODER_MISSING, when getExtensionSupport says decoder-required, when a load rejects with no code field, when an instance animation will not loop, or when destroying a GLTFAsset leaves GPU resources behind."
  description_zh: "加载 glTF 和 GLB，配置解码器、扩展、进度、实例和错误处理。用于模型加载、压缩资源部署和加载器能力诊断。"
---

# Cocos AIR glTF contracts

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Load glTF and GLB straight from a URL or from bytes, inject your own decoders, instantiate shared assets into independent node trees, and read the support matrix honestly - there is no Creator importer and no bundled Draco, meshopt or KTX2 decoder here.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "load a model from a URL" -> `new GLTFLoader().loadAsync(url)`; the asset manager owns caching and in-flight deduplication ([loader-api.md](references/loader-api.md)).
- "load from bytes I already have" -> `parseAsync(data, baseUrl)` with `string | ArrayBuffer`; pass `baseUrl` for a `.gltf` whose buffers and images are relative, and pass nothing for `data:`/`blob:` input (`src/air/assets/gltf/loader.ts:115`, `:200-202`).
- "compressed model" -> inject first, then load; `setMeshoptDecoder`, `setDRACODecoder`, `setKTX2Transcoder` ([decoders.md](references/decoders.md)).
- "does this browser support extension X" -> `getExtensionSupport()`, and read the five statuses rather than assuming ([extensions-matrix.md](references/extensions-matrix.md)).
- "several copies of the same model" -> one `GLTFAsset`, many `instantiate()` calls; meshes, materials, textures and skeletons are shared, node and animation state are not ([loader-api.md](references/loader-api.md)).
- "loop one clip on one instance" -> `instance.setAnimationLoop(true, clipName)`; omit the name to select every clip of that instance.
- "why did my load throw with no code" -> it is a plain `Error`, a `DOMException` or a tagged `TypeError`, not a `GLTFError` ([diagnostics.md](references/diagnostics.md)).
- "write my own extension handler" -> `loader.register(factory)`; registration order is hook execution order, and the context type is not nameable from the declarations ([extensions-matrix.md](references/extensions-matrix.md), [loader-api.md](references/loader-api.md)).

## Contracts

Configure required decoders before loading; declared extension support is not deployed-decoder or browser proof. Dispose instances before shared asset destruction and distinguish GLTFError from tagged TypeError/RangeError.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Assuming the decoders are built in
- [HIGH] Reading `decoder-required` as `supported`
- [HIGH] Catching only `GLTFError`
- [MEDIUM] Naming glTF internals that are not on the public face
- [MEDIUM] Expecting `asset.destroy()` to tear down live instances

## References

- [loader-api.md](references/loader-api.md) - the two entry points and import-time registration, loader configuration and option precedence, the ordered `parseAsync` pipeline, the `GLTFAsset` member table and its deferred release, `instantiate(sceneIndex)` visibility versus inclusion and per-scene clip caching, the `GLTFInstance` contract, the public versus internal face, and the per-symbol evidence split.
- [extensions-matrix.md](references/extensions-matrix.md) - the five statuses with their error-code mapping and proof state, how `getExtensionSupport()` computes them, all 21 registrations in hook order with catalog status and official comparison, the required versus optional table, registration-order rules, and what the browser evidence does not cover.
- [decoders.md](references/decoders.md) - why decoders are outside the bundle, the shipped artifact inventory with byte counts, the three setters and three provider factories and their interfaces, the browser module-loading pattern and MIME requirements, the unusable meshopt barrel, the Node-only Draco ruling, the KTX2 ceiling and target formats, and what is actually verified.
- [diagnostics.md](references/diagnostics.md) - the five codes with recomputed throw-site counts, how to discriminate a caught error, the four non-`GLTFError` shapes, the two incompatible report types, where each progress phase is emitted, the warning channel and its one fully silent case, failure containment, and the evidence gap.

## Canonical docs

- `docs/gltf/gltf-runtime.md` - open for the load-and-play walkthrough, the other loading entries, multi-instance resource sharing, the support-boundary table and the material, lighting and instancing semantics behind it.
- `docs/gltf/gltf-extension-reference.md` - open for the general extension contract and the per-family detail: geometry compression, texture encoding, scene extensions and the material extension set, plus the official-sample comparison column.
- `docs/gltf/gltf-decoder-deployment.md` - open for the artifact inventory pointer, the injection API, static serving requirements, nested deployment paths, the offline acceptance gate and the failure-semantics quick reference.
- `build/gltf-decoders/MANIFEST.md` - open for authoritative versions, licenses, per-file byte counts and sha256, the gate identity, and the recorded browser-side Draco decision.
