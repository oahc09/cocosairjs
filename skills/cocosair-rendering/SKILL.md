---
name: cocosair-rendering
description: "Drives the Cocos AIR rendering contracts in code - legacy forward lighting units with illuminance in Lux, the single mainLight rule for multiple directional lights and inspectAirDirectionalLights, the per-light-type shadow matrix with the four switches a ShadowMap cast needs, offscreen rendering through createAirRenderTarget and camera targetTexture with requested-versus-effective MSAA samples and sampleFallback, the one-per-scene AirTransmissionCapture behind transmission materials, texture format and sRGB decode preflight with resolveAirTextureFormat and validateAirTextureColorContract, and which post-process and custom-pipeline names a Code First app can really reach. Use when lighting looks flat, asking why there are no shadows, rendering a mirror or refraction into a texture, reading back a target's pixels, hitting AIR_E_RENDER_TARGET_SAMPLES or AIR_E_TEXTURE_COLOR, choosing rgba8, rgba16f or hardware-srgb, or deciding whether bloom and other post-processing run without a variant build."
license: MIT
compatibility: "Cocos AIR source checkout or installed cocosair.js package. Browser rendering requires WebGL 2; source tooling requires Node.js >=18. Use the host-provided tools and user-authorized workspace."
allowed-tools: Read Edit Write Bash
metadata:
  author: "oahc09@gmail.com"
  version: "1.0.0"
  last-updated: "2026-10-13"
  keywords: "Cocos AIR, cocosair.js, rendering"
  description_en: "Drives the Cocos AIR rendering contracts in code - legacy forward lighting units with illuminance in Lux, the single mainLight rule for multiple directional lights and inspectAirDirectionalLights, the per-light-type shadow matrix with the four switches a ShadowMap cast needs, offscreen rendering through createAirRenderTarget and camera targetTexture with requested-versus-effective MSAA samples and sampleFallback, the one-per-scene AirTransmissionCapture behind transmission materials, texture format and sRGB decode preflight with resolveAirTextureFormat and validateAirTextureColorContract, and which post-process and custom-pipeline names a Code First app can really reach. Use when lighting looks flat, asking why there are no shadows, rendering a mirror or refraction into a texture, reading back a target's pixels, hitting AIR_E_RENDER_TARGET_SAMPLES or AIR_E_TEXTURE_COLOR, choosing rgba8, rgba16f or hardware-srgb, or deciding whether bloom and other post-processing run without a variant build."
  description_zh: "配置灯光、阴影、渲染目标、MSAA、颜色契约和管线可达性。用于光照、阴影、离屏渲染、读回或后处理问题。"
---

# Cocos AIR rendering contracts

Use the [environment rules](references/context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Configure what the legacy forward pipeline actually draws - light units and the one main light, shadow casting, offscreen camera targets, texture color contracts - and know which pipeline surfaces a Code First app can reach.

## Quick Start

Read [references/quick-start.md](references/quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

## Related skills

Read [references/context.md](references/context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## When to use what

- "Why is the scene the wrong brightness" -> `DirectionalLight.illuminance` (Lux) or `SphereLight`/`PointLight`/`SpotLight` `luminousFlux`/`luminance`; the HDR and LDR slots and every unit constant are in [lighting-units.md](references/lighting-units.md).
- "Which directional light is actually lighting my scene" -> `inspectAirDirectionalLights(scene)` (`src/air/rendering/engine-contracts.ts:104`).
- "Why are there no shadows" -> the support grid in [shadow-matrix.md](references/shadow-matrix.md), then the four switches in Contracts.
- "Can this light type cast at all" -> `PointLight` has no shadow path in the source (`src/cocos/render-scene/scene/point-light.ts:32`); Sphere is never collected by the flow (`src/cocos/rendering/shadow/shadow-flow.ts:122`).
- "Render a mirror, refraction or a second viewpoint into a texture" -> `createAirRenderTarget(options)` (`src/air/rendering/render-target.ts:290`) plus `attachCamera(camera, beforeRender?)` (`:197`); the raw path is `camera.targetTexture`.
- "Feed that texture into a material after a resize" -> `target.bindColor(material, property, passIdx?)` (`:257`), `bindDepth` (`:258`), `readColor(region?)` for pixels (`:262`).
- "Glass or gem refraction from a glTF material" -> `AirTransmissionCapture` (`src/air/rendering/transmission-capture.ts:74`), one per scene, with `TRANSMISSION_LAYER` (`:29`).
- "Is this format plus this decode legal" -> `resolveAirTextureFormat` (`src/air/rendering/color-contract.ts:21`) and `validateAirTextureColorContract` (`:38`).
- "Can I turn bloom on" -> `postProcess` is the only custom-pipeline-side name the default aggregate exports (`src/exports/air.ts:39`); `director.root.usesCustomPipeline` tells you which pipeline is live (`src/cocos/root.ts:121`).

## Contracts

Legacy forward uses one effective main directional light. Check the shadow support matrix and all cast/receive switches. Report requested versus effective MSAA and verify actual pixels.

Read [references/contracts.md](references/contracts.md) only when the task needs exact option rules, limits, error behavior or source annotations. Prefer the topic references below for a narrower question.

## Common Mistakes

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](references/common-mistakes.md):

- [HIGH] Turning on one shadow switch and expecting a shadow map
- [HIGH] Importing the custom pipeline namespace and expecting post-processing to run
- [HIGH] Adding a second directional light to fill the dark side
- [MEDIUM] Treating a requested sample count as the negotiated one
- [MEDIUM] Letting the color validator stand in for building the texture

## References

- [lighting-units.md](references/lighting-units.md) - light component surface and defaults, `LightType` ordinals, illuminance and luminous-flux ranges with their HDR/LDR slots, `nt2lm`, the exposure and light-meter constants written into the UBO, the `mainLight` limitation text, the full `inspectAirDirectionalLights` return shape, light symbol reachability.
- [shadow-matrix.md](references/shadow-matrix.md) - the per-light-type support grid with its three contract IDs, the ShadowFlow gate, `ShadowType`/`PCFType`/`CSMLevel`/`CSMOptimizationMode`/`ShadowSize` ordinals, `Shadows` defaults, DirectionalLight and SpotLight shadow fields with ranges and clamps, fields the shipped pipeline ignores, silent-miss symptoms, shadow symbol reachability.
- [render-target.md](references/render-target.md) - `AirTargetColorFormat` and its GFX map, the options table with defaults and validation, MSAA negotiation and `sampleFallback`, every `AirRenderTargetInfo` field, method behaviors, the full `AIR_E_RENDER_TARGET_*` message table, the camera `targetTexture` relationship, `AirTransmissionCapture` lifecycle, target symbol reachability.
- [color-contract.md](references/color-contract.md) - module face and re-export chain, `AirColorContractError`, `resolveAirTextureFormat` rules with the accepted custom `PixelFormat` values, the sRGB format set with ordinals, `validateAirTextureColorContract` rejection literals and the accepted-cell grid, the prefiltered environment contract and receipt, texture row-order and UV rules, color symbol reachability and evidence scoping.
- [pipeline-reachability.md](references/pipeline-reachability.md) - the default `AIR_FEATURES` unit list, how a name reaches the built ESM face, `postProcess` on the delivery face, the custom-pipeline gate table, legacy pipeline entry points and flow-name constants, custom-pipeline binding ordinals, the four-layer reachability grid, the evidence-fingerprint caveat.

## Canonical docs

`docs/manual/rendering-contracts.md`, `docs/manual/lighting-units.md`, `docs/manual/shadow-support-matrix.md`, `docs/reference/rendering-color-diagnostics.md`, `docs/reference/texture-uv-verification.md`, `docs/reference/web-features.md`, `docs/notes/post-process-notes.md`.
