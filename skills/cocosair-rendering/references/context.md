# Working context

Use package imports and shipped docs for an application; use source paths and repository commands only in a confirmed AIR checkout. A copied host skill is not a runtime installation.

Read the [shared environment rules](../../cocosair/references/environment.md) when locating these roots. If sibling resources are unavailable, use the installed canonical chapter and disclose the limitation. Tool declarations identify workflow capabilities; they do not authorize installation, writes, publication or any action outside the user and host scope.

## Related skills

- [cocosair](../../cocosair/SKILL.md) - routing and shared Code First constraints; reuse it if already loaded.
- [cocosair-camera](../../cocosair-camera/SKILL.md) - the `Camera` component an offscreen pass needs: `priority`, `rect`, `visibility`, `targetTexture`.
- [cocosair-materials-effects](../../cocosair-materials-effects/SKILL.md) - authoring the effect and setting a material's `sampler2D`; this skill owns only the texture color contract and target bindings.
- [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md) - node activation order, `layer` bits and camera `visibility` masks, which decide what a shadow pass or an offscreen camera sees at all; `Vec3` directions come from [cocosair-math](../../cocosair-math/SKILL.md).
- [cocosair-application](../../cocosair-application/SKILL.md) - when the scene and its native render scene exist, which gates every light query below.
- [cocosair-project-setup](../../cocosair-project-setup/SKILL.md) - which entry exposes a symbol, and variant-build options such as `AIR_FEATURES`.

Offscreen passes for 2D and DOM content belong to [cocosair-graphics-and-dom](../../cocosair-graphics-and-dom/SKILL.md). glTF loading, primitive geometry, animation, UI, input, physics, audio and broad performance work belong to the cocosair-gltf, cocosair-primitives-mesh, cocosair-animation-tween, cocosair-ui-2d, cocosair-input-action, cocosair-physics, cocosair-audio-video and cocosair-performance skills; load the matching existing skill only for the task's direct dependencies.

## Original entry guidance

The original entry wording below is an on-demand archive, not a second routing source.

Use the [environment rules](context.md) to locate the checkout or installed package; sibling skills are optional direct dependencies, not a recursive load list.

Configure what the legacy forward pipeline actually draws - light units and the one main light, shadow casting, offscreen camera targets, texture color contracts - and know which pipeline surfaces a Code First app can reach.

Read [references/quick-start.md](quick-start.md) when constructing the minimal example. It preserves the complete setup and teardown sequence; select the source-checkout or npm-consumer environment first.

Read [references/context.md](context.md#related-skills) to select the owner of this step and only its directly needed dependencies. Reuse already loaded skills; this is not a recursive load list.

## Original mistake navigation

Before implementing the relevant path, read its wrong/right examples in [references/common-mistakes.md](common-mistakes.md):

- [HIGH] Turning on one shadow switch and expecting a shadow map
- [HIGH] Importing the custom pipeline namespace and expecting post-processing to run
- [HIGH] Adding a second directional light to fill the dark side
- [MEDIUM] Treating a requested sample count as the negotiated one
- [MEDIUM] Letting the color validator stand in for building the texture

## Original metadata

### Description and description_en

The two original fields contained exactly the same value, retained once here.

Drives the Cocos AIR rendering contracts in code - legacy forward lighting units with illuminance in Lux, the single mainLight rule for multiple directional lights and inspectAirDirectionalLights, the per-light-type shadow matrix with the four switches a ShadowMap cast needs, offscreen rendering through createAirRenderTarget and camera targetTexture with requested-versus-effective MSAA samples and sampleFallback, the one-per-scene AirTransmissionCapture behind transmission materials, texture format and sRGB decode preflight with resolveAirTextureFormat and validateAirTextureColorContract, and which post-process and custom-pipeline names a Code First app can really reach. Use when lighting looks flat, asking why there are no shadows, rendering a mirror or refraction into a texture, reading back a target's pixels, hitting AIR_E_RENDER_TARGET_SAMPLES or AIR_E_TEXTURE_COLOR, choosing rgba8, rgba16f or hardware-srgb, or deciding whether bloom and other post-processing run without a variant build.

### Keywords

Cocos AIR, cocosair.js, rendering

## References

- [lighting-units.md](lighting-units.md) - light component surface and defaults, `LightType` ordinals, illuminance and luminous-flux ranges with their HDR/LDR slots, `nt2lm`, the exposure and light-meter constants written into the UBO, the `mainLight` limitation text, the full `inspectAirDirectionalLights` return shape, light symbol reachability.
- [shadow-matrix.md](shadow-matrix.md) - the per-light-type support grid with its three contract IDs, the ShadowFlow gate, `ShadowType`/`PCFType`/`CSMLevel`/`CSMOptimizationMode`/`ShadowSize` ordinals, `Shadows` defaults, DirectionalLight and SpotLight shadow fields with ranges and clamps, fields the shipped pipeline ignores, silent-miss symptoms, shadow symbol reachability.
- [render-target.md](render-target.md) - `AirTargetColorFormat` and its GFX map, the options table with defaults and validation, MSAA negotiation and `sampleFallback`, every `AirRenderTargetInfo` field, method behaviors, the full `AIR_E_RENDER_TARGET_*` message table, the camera `targetTexture` relationship, `AirTransmissionCapture` lifecycle, target symbol reachability.
- [color-contract.md](color-contract.md) - module face and re-export chain, `AirColorContractError`, `resolveAirTextureFormat` rules with the accepted custom `PixelFormat` values, the sRGB format set with ordinals, `validateAirTextureColorContract` rejection literals and the accepted-cell grid, the prefiltered environment contract and receipt, texture row-order and UV rules, color symbol reachability and evidence scoping.
- [pipeline-reachability.md](pipeline-reachability.md) - the default `AIR_FEATURES` unit list, how a name reaches the built ESM face, `postProcess` on the delivery face, the custom-pipeline gate table, legacy pipeline entry points and flow-name constants, custom-pipeline binding ordinals, the four-layer reachability grid, the evidence-fingerprint caveat.

## Canonical docs

`docs/manual/rendering-contracts.md`, `docs/manual/lighting-units.md`, `docs/manual/shadow-support-matrix.md`, `docs/reference/rendering-color-diagnostics.md`, `docs/reference/texture-uv-verification.md`, `docs/reference/web-features.md`, `docs/notes/post-process-notes.md`.
