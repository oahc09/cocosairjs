# Agent Reference: Shader Effects (generated)

This is a reference for AI agents working with the CocosAirJS shader examples.
It lists the public SDK API, example parameter contracts, and usage patterns.

## Quick start

```typescript
import { createAirApp, Scene, Camera, Node, MeshRenderer, Material } from 'cocosair.js';
```

## Available examples

| ID  | Example                                                           | Description |
| --- | ----------------------------------------------------------------- | ----------- |
| E01 | [shader-noise-dissolve](../../../examples/shader-noise-dissolve/) | 1.0.0       |
| E02 | [shader-thin-film](../../../examples/shader-thin-film/)           | 1           |
| E03 | [holographic](../../../examples/shader-holographic/)              | 1.0.0       |
| E04 | [neon](../../../examples/shader-neon/)                            | 1.0.0       |
| E05 | [emboss](../../../examples/shader-emboss/)                        | 1.0.0       |
| E06 | [sparkle](../../../examples/shader-sparkle/)                      | 1.0.0       |
| E07 | [liquidMetal](../../../examples/shader-liquid-metal/)             | 1.0.0       |
| E08 | [cursorTrail](../../../examples/shader-cursor-trail/)             | 1.0.0       |
| E09 | [Glass](../../../examples/shader-glass/)                          | 1.0.0       |
| C01 | [laserCard](../../../examples/shader-laser-card/)                 | 1.0.0       |
| C02 | [filmNeon](../../../examples/shader-film-neon/)                   | 1.0.0       |
| C03 | [glassTrail](../../../examples/shader-glass-trail/)               | 1.0.0       |
| C04 | [inputDissolve](../../../examples/shader-input-dissolve/)         | 1.0.0       |

## Parameter contracts

Each example exposes its parameters through a frozen `parameters.json` contract
(E01 NoiseDissolve uses a static TypeScript literal in `src/parameters.ts`).
See [parameters table](shaders-effect-parameters.md) for the full list.

## Verification status

- Engine status is evaluated separately; see [current SDK delivery](../current-sdk-refresh-delivery.md). This generator does not validate those Gates.
- Agent Gate: NOT_RUN (requires separate isolated benchmark).
- This reference is generated from definitions — it does not substitute for browser verification.
