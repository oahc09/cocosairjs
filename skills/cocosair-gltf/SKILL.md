---
name: cocosair-gltf
description: "Load glTF/GLB models, extensions, decoder injection and instances. Use for Draco/meshopt/KTX2 deployment, GLTF_DECODER_MISSING, uncoded load errors or animation loops."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
when_to_use:
  - load a glTF or GLB from URL or bytes
  - compressed model will not load
  - which glTF extensions are supported
  - instance animation will not loop
  - destroying a model leaves GPU resources
owns: [gltf, glb, decoder-injection, extension-support, model-instancing, gltf-errors]
not_for:
  - generic asset caching -> cocosair-assets
  - edit imported shared materials -> cocosair-materials-effects
  - skeleton bind poses or morph weights -> cocosair-skinning-morph
layer: subsystem
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  description_zh: "加载 glTF 和 GLB，配置解码器、扩展、进度、实例和错误处理。用于模型加载、压缩资源部署和加载器能力诊断。"
---

# Cocos AIR glTF contracts

Stop once you can answer the task. Do not read another same-topic reference for the same question.

Scope: glTF/GLB loading, shared instances, extension support and decoder deployment.

Environment: use package imports in apps; source paths require an AIR checkout. See [context](references/context.md).

## Quick Start

For complete setup and teardown, read [Quick Start](references/quick-start.md).

Siblings: [direct dependencies](references/context.md#related-skills); reuse loaded skills.

## Triggers

- Load a model URL or existing bytes
- Deploy and inject compressed-model decoders
- Check extension support in this browser
- Instantiate several copies with shared assets
- Loop clips per model instance
- Diagnose loads without a GLTFError code
- Register custom extension handlers

Exact API and symptom mappings: [triggers](references/triggers.md).

## Contracts

Configure required decoders before loading; declared extension support is not deployed-decoder or browser proof. Dispose instances before shared asset destruction and distinguish GLTFError from tagged TypeError/RangeError.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

- [HIGH] Decoders are external and require explicit deployment.
- [HIGH] Decoder-required does not mean supported.
- [HIGH] Catching only GLTFError misses other failure shapes.
- [MEDIUM] Check public exports; destroy instances before shared assets.

Read relevant [wrong/right examples](references/common-mistakes.md) before implementation.

## Reference map

- [Load or instantiate?](references/loader-api.md) - Options and shared lifetime
- [Extension supported?](references/extensions-matrix.md) - Statuses and hooks
- [Compressed model fails?](references/decoders.md) - Injection and deployment
- [Missing error code?](references/diagnostics.md) - Errors, reports and progress
