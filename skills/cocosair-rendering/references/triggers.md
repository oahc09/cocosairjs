# Rendering triggers

For the four switches called “Contracts” below, see [Contracts](contracts.md). Source annotations refer to the AIR checkout.

## When to use what

- "Why is the scene the wrong brightness" -> `DirectionalLight.illuminance` (Lux) or `SphereLight`/`PointLight`/`SpotLight` `luminousFlux`/`luminance`; the HDR and LDR slots and every unit constant are in [lighting-units.md](lighting-units.md).
- "Which directional light is actually lighting my scene" -> `inspectAirDirectionalLights(scene)` (`src/air/rendering/engine-contracts.ts:104`).
- "Why are there no shadows" -> the support grid in [shadow-matrix.md](shadow-matrix.md), then the four switches in Contracts.
- "Can this light type cast at all" -> `PointLight` has no shadow path in the source (`src/cocos/render-scene/scene/point-light.ts:32`); Sphere is never collected by the flow (`src/cocos/rendering/shadow/shadow-flow.ts:122`).
- "Render a mirror, refraction or a second viewpoint into a texture" -> `createAirRenderTarget(options)` (`src/air/rendering/render-target.ts:290`) plus `attachCamera(camera, beforeRender?)` (`:197`); the raw path is `camera.targetTexture`.
- "Feed that texture into a material after a resize" -> `target.bindColor(material, property, passIdx?)` (`:257`), `bindDepth` (`:258`), `readColor(region?)` for pixels (`:262`).
- "Glass or gem refraction from a glTF material" -> `AirTransmissionCapture` (`src/air/rendering/transmission-capture.ts:74`), one per scene, with `TRANSMISSION_LAYER` (`:29`).
- "Is this format plus this decode legal" -> `resolveAirTextureFormat` (`src/air/rendering/color-contract.ts:21`) and `validateAirTextureColorContract` (`:38`).
- "Can I turn bloom on" -> `postProcess` is the only custom-pipeline-side name the default aggregate exports (`src/exports/air.ts:39`); `director.root.usesCustomPipeline` tells you which pipeline is live (`src/cocos/root.ts:121`).
