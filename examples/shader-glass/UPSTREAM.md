# E09 pinned source and adaptation

- upstream_repo: shader-effects-inc/shaders
- upstream_commit: dbfd42abe341e7a6ea0b8ea1f5bab018b8e8439a
- upstream_file: packages/core/src/shaders/Glass/index.ts (SHA256 964f8b456050a05e5a3dc278c5c40b5d6c880d02889e11d7b203d1d2a63afc45)
- license: MIT, applicable notices preserved in LICENSE.reference.txt
- helper: gpu/kit/effects/glass.ts executable Glass math and Vogel disk fallback; blur.ts reviewed, Gaussian compute branch NOT_IMPLEMENTED
- algorithm_ideas_adopted: forward gradient EPS0.01; thickness UI×0.5; refraction depth (1-d)^2; capped slope; chromatic UV; 9/27 Vogel samples; premultiplied RTT then safe unpremultiply; tint luminance; rim/specular/fresnel/cutout cubic mask
- implementation_differences: native child-camera RTT + main material two render passes, fixed256² RGBA8/NEAREST instead of upstream varying RTT/filtering; analytic circle/rounded-box only; fixed centre and white highlight/fresnel; native compile defines on zero crossing; no Gaussian compute, TypeGPU, volumetric or SDF platform
- cocosairjs_apis_used: createAirApp/createStepClock/createAirRenderTarget, Scene/Node/Camera/MeshRenderer, EffectAsset/Material, utils.createMesh

No upstream runtime is imported. GPU/PNG acceptance is recorded separately with frozen inputs and real browser data; this source declaration alone is not evidence of visual equivalence.
