# Effect Parameters (generated)

Auto-generated from the 13 frozen EffectDefinitions. Source of truth: each example's `parameters.json` (E01: `src/parameters.ts` static literal).

| Example | Name                  | Version | Parameters | Structure Key                                                    |
| ------- | --------------------- | ------- | ---------- | ---------------------------------------------------------------- |
| E01     | shader-noise-dissolve | 1.0.0   | 5          | f41c9c5f4a790eaf810f1f9edda2fec84c43b36463650b439ea51030d8c72047 |
| E02     | shader-thin-film      | 1       | 10         | b906b643ba847f96fe8aab2e84a19da44316edf8af97cfde16d3796de2e60dae |
| E03     | holographic           | 1.0.0   | 13         | bd12b79c0dabd74a53aa87db966b2c996a3cf4f6583f552a40693bebf5a92e1c |
| E04     | neon                  | 1.0.0   | 20         | 52213de9e21148ce4df0f5656c6d2cf3c7f656c03503cf62be7617a034af7ca5 |
| E05     | emboss                | 1.0.0   | 8          | c74abc6528af781730004f86d64768db79a57e56d4bc742fce4a20886c51c537 |
| E06     | sparkle               | 1.0.0   | 8          | d207d9b5b670829657e19ff1be9a4633fcf08037900e7e9579b70990424fe073 |
| E07     | liquidMetal           | 1.0.0   | 17         | 828944efecc0881c327d83eaaa2341df0ba10e277c72ac217169dcf1ffc06309 |
| E08     | cursorTrail           | 1.0.0   | 6          | e9e121949eb5ae7744f4ea1e6b4121b9f936b4c9c570836d247d34e7f82b088e |
| E09     | Glass                 | 1.0.0   | 19         | ca21f94f34cf7cbbe8cbc3b921df6f6e382499c2500f98153b757d1855a4ffae |
| C01     | laserCard             | 1.0.0   | 20         | 4efce27b23c700d37ce7028388fe5b544de08c17a2520076013778bdabbe5b99 |
| C02     | filmNeon              | 1.0.0   | 23         | 281a5ecc3382a8ba46bb1e4a731e0ad82e71c3e87055b2bf8e628fe5188af9d5 |
| C03     | glassTrail            | 1.0.0   | 19         | 0010a27c4826a065c3e123a6099d08e1c841ddccf2dcb40fe1945a6dc69d9cc4 |
| C04     | inputDissolve         | 1.0.0   | 8          | 9793a92bcc927e258e89b02476f2c82b2e7ad2d16e3d5753a3f22ab3875c0d3c |

## E01 — shader-noise-dissolve

| Parameter | Type    | Default | Range/Enum      | Update Mode | Description                                                   |
| --------- | ------- | ------- | --------------- | ----------- | ------------------------------------------------------------- |
| progress  | number  | 0.5     | 0–1 step 0.01   | uniform     | 0 fully visible, 1 fully removed.                             |
| scale     | number  | 3       | 0.5–20 step 0.1 | uniform     | Frequency in the aspect-correct UV domain.                    |
| softness  | number  | 0.25    | 0–1 step 0.01   | uniform     | Feather width; exactly zero uses a hard step.                 |
| seed      | number  | 0       | 0–100 step 0.01 | uniform     | Continuous domain offset, never rounded into an integer seed. |
| invert    | boolean | false   | —               | uniform     | Invert coverage, not progress.                                |

## E02 — shader-thin-film

| Parameter    | Type   | Default  | Range/Enum         | Update Mode | Description                                                                                |
| ------------ | ------ | -------- | ------------------ | ----------- | ------------------------------------------------------------------------------------------ |
| shape        | string | "circle" | circle/rounded-box | structure   | Analytic two-dimensional SDF primitive; creates a new native material/mesh instance.       |
| rimWidth     | number | 1        | 0–3 step 0.01      | uniform     | Inward quadratic rim width; zero uses guarded 0.001 domain width.                          |
| edgeSoftness | number | 0.3      | 0–1 step 0.01      | uniform     | Inside coverage width; AA adds a pixel derivative minimum.                                 |
| thickness    | number | 0.5      | 0–1 step 0.01      | uniform     | Depth-dependent spectral phase, a visual model not physical optical thickness.             |
| dispersion   | number | 0.5      | 0–1 step 0.01      | uniform     | Directional normal/light contribution to spectral phase.                                   |
| saturation   | number | 1        | 0–1 step 0.01      | uniform     | White to cosine-spectrum mix.                                                              |
| phase        | number | 0        | 0–1 step 0.01      | uniform     | Periodic phase offset; phase 0 and 1 are identical.                                        |
| lightAngle   | number | 300      | 0–360 step 1       | uniform     | In-plane light direction; positive rotation is counterclockwise in bottom-origin local UV. |
| speed        | number | 0.1      | -1–1 step 0.01     | uniform     | Accumulated animated time; zero freezes, negative reverses, pause preserves time.          |
| opacity      | number | 1        | 0–1 step 0.01      | uniform     | Local extension multiplying straight alpha; zero leaves backdrop unchanged.                |

## E03 — holographic

| Parameter    | Type   | Default  | Range/Enum         | Update Mode | Description                                                                                                           |
| ------------ | ------ | -------- | ------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------- |
| shape        | string | "circle" | circle/rounded-box | structure   | Analytic 2D SDF shape: circle or rounded box. Upstream default sphere3D/volumetric/shape JSON platform NOT_SUPPORTED. |
| scale        | number | 1        | 0.4–2 step 0.01    | uniform     | Uniform shape scale in the rotated field space.                                                                       |
| rotation     | number | 0        | 0–360 step 1       | uniform     | Rigid in-plane rotation of the field; 360 is identity.                                                                |
| hueShift     | number | 0        | 0–360 step 1       | uniform     | Rotates the rainbow spectrum across the foil; 360 is the identity period.                                             |
| foilScale    | number | 1.5      | 0.3–6 step 0.01    | uniform     | Iridescent patch size — higher means smaller, busier patches.                                                         |
| saturation   | number | 0.75     | 0–1 step 0.01      | uniform     | Rainbow saturation; 0 is plain silver foil, 1 fully spectral.                                                         |
| roughness    | number | 0.25     | 0–1 step 0.01      | uniform     | Matte laminate grain; also softens the gloss highlight.                                                               |
| speed        | number | 1        | 0–2 step 0.01      | uniform     | Animated-time speed; 0 pauses the spectrum drift.                                                                     |
| crinkle      | number | 0.5      | 0–1 step 0.01      | uniform     | Laminate wrinkle strength; 0 leaves the flat dome normal.                                                             |
| crinkleScale | number | 1        | 0.3–6 step 0.01    | uniform     | Wrinkle feature size — higher means smaller, denser wrinkles.                                                         |
| sparkle      | number | 0.4      | 0–1 step 0.01      | uniform     | Glitter flake density; 0 removes the flake layer.                                                                     |
| edgeSoftness | number | 0.05     | 0–1 step 0.01      | uniform     | Shape boundary softness; at 0 the edge stays anti-aliased.                                                            |
| seed         | number | 0        | 0–8 step 0.01      | uniform     | Local extension: offsets every noise input coordinate. 0 is the upstream fixed-domain noise.                          |

## E04 — neon

| Parameter         | Type   | Default   | Range/Enum         | Update Mode | Description                                                                                               |
| ----------------- | ------ | --------- | ------------------ | ----------- | --------------------------------------------------------------------------------------------------------- |
| shape             | string | "circle"  | circle/rounded-box | structure   | Analytic 2D SDF shape: circle or rounded box. Switching recompiles the effect variant.                    |
| scale             | number | 1         | 0.4–2 step 0.01    | uniform     | Uniform shape scale in the rotated field space; field units stay normalized to half canvas height.        |
| rotation          | number | 0         | 0–360 step 1       | uniform     | Rigid in-plane rotation of the field; zero is identity.                                                   |
| tubeThickness     | number | 0.03      | 0–0.08 step 0.001  | uniform     | Interior band of the tube measured in signed distance; zero collapses to an anti-aliased filament.        |
| secondaryBlend    | number | 0.5       | 0–1 step 0.01      | uniform     | Blend from mono tube color (0) to two-tone diffuse-lit coloring (1).                                      |
| intensity         | number | 1.15      | 0–3 step 0.01      | uniform     | Master linear gain on tube and glow radiance; zero drives emitted color to zero while masks stay defined. |
| hotCoreIntensity  | number | 0.85      | 0–1 step 0.01      | uniform     | Hot gas-discharge core strength over the deepest tube interior.                                           |
| glowIntensity     | number | 1.2       | 0–4 step 0.01      | uniform     | Outer glow gain shared by both exponential layers; zero removes the glow layer entirely.                  |
| glowRadius        | number | 0.12      | 0–0.4 step 0.001   | uniform     | Falloff scale of the two exponentials; zero is clamped to 0.001 exactly like the reference.               |
| lightAngle        | number | 135       | 0–360 step 1       | uniform     | Directional light azimuth for the semicircular cross-section shading; the z component stays fixed at 0.7. |
| specularIntensity | number | 0.6       | 0–2 step 0.01      | uniform     | Blinn-Phong highlight gain added after the diffuse shading.                                               |
| specularSize      | number | 0.35      | 0–1 step 0.01      | uniform     | Highlight tightness; shininess is exp2(8 - 7*size) so 0 is broad and 1 is a tight spark.                  |
| cornerSmoothing   | number | 0.5       | 0–1 step 0.01      | uniform     | Mix between the raw centre SDF and the 5-tap corner-smoothed average; also widens the stencil radius.     |
| flickerSpeed      | number | 1.5       | 0–8 step 0.01      | uniform     | Time multiplier feeding the three irrational-ratio flicker sines; zero freezes flicker.                   |
| flickerAmount     | number | 0.25      | 0–1 step 0.01      | uniform     | Dark-time amount; zero holds the lamp fully on at every time.                                             |
| flowSpeed         | number | 1.2       | 0–8 step 0.01      | uniform     | Angular sweep speed of the rotating brightness band; zero parks the band.                                 |
| flowAmount        | number | 0.35      | 0–1 step 0.01      | uniform     | How much the angular brightness band modulates the tube; zero disables flow entirely.                     |
| tubeColor         | string | "#00ddff" | —                  | uniform     | Primary tube color, sRGB hex; decoded to linear before the shading math.                                  |
| secondaryColor    | string | "#ff00aa" | —                  | uniform     | Shadow-side two-tone color, sRGB hex; decoded to linear.                                                  |
| glowColor         | string | "#00ddff" | —                  | uniform     | Outer glow color, sRGB hex; decoded to linear.                                                            |

## E05 — emboss

| Parameter       | Type   | Default    | Range/Enum         | Update Mode | Description                                                                                                                           |
| --------------- | ------ | ---------- | ------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| shape           | string | "circle"   | circle/rounded-box | structure   | Analytic 2D SDF shape: circle or rounded box. Switching recompiles the effect variant.                                                |
| scale           | number | 1          | 0.4–2 step 0.01    | uniform     | Uniform shape scale in the rotated field space.                                                                                       |
| rotation        | number | 0          | 0–360 step 1       | uniform     | Rigid in-plane rotation of the field; zero is identity.                                                                               |
| depth           | number | -0.5       | -1–1 step 0.01     | uniform     | Signed relief depth; negative is inset (debossed), positive is raised (embossed). Zero is an exact child passthrough including alpha. |
| lightAngle      | number | 260        | 0–360 step 1       | uniform     | Directional light azimuth for edge lighting and the cast-shadow trace; the z component stays fixed at 0.7.                            |
| lightIntensity  | number | 0.6        | 0–2 step 0.01      | uniform     | Strength of directional edge highlights and shadows; zero removes edge lighting entirely.                                             |
| shadowIntensity | number | 0.3        | 0–1 step 0.01      | uniform     | Darkness of the relief cast shadow; zero removes the shadow layer.                                                                    |
| sourceKind      | string | "standard" | standard/blank     | uniform     | Deterministic child source pattern; blank renders a fully transparent child (alpha-0 NaN guard).                                      |

## E06 — sparkle

| Parameter | Type   | Default | Range/Enum    | Update Mode | Description                                                                                   |
| --------- | ------ | ------- | ------------- | ----------- | --------------------------------------------------------------------------------------------- |
| size      | number | 100     | 10–200 step 1 | uniform     | Jittered-grid spacing in CSS pixels; second grid scales by 2/3.                               |
| intensity | number | 10      | 0–20 step 0.1 | uniform     | Additive linear-light star gain; zero is identity of linear associated RGBA, including alpha. |
| threshold | number | 0.2     | 0–1 step 0.01 | uniform     | smoothstep threshold with fixed 0.12 band; alpha weights luma before sqrt.                    |
| expand    | number | 0       | 0–100 step 1  | structure   | Radius of bounded four-tap ring search; crossing zero replaces the native effect instance.    |
| rayLength | number | 5       | 0–20 step 0.1 | uniform     | Exponential ray falloff is 0.45/max(rayLength,0.01).                                          |
| colorize  | number | 0.45    | 0–1 step 0.01 | uniform     | Blend white sparkle tint with source linear chroma / max(luma,0.001) * 0.6.                   |
| speed     | number | 1       | 0–5 step 0.05 | uniform     | Rate of the single native update owner; deterministic setTime bypasses time accumulation.     |
| seed      | number | 0       | 0–100 step 1  | uniform     | Seed is quantized to 1/4096 for the independently implemented uint hash; not Fi hash.         |

## E07 — liquidMetal

| Parameter    | Type   | Default  | Range/Enum           | Update Mode | Description                                                                                                                                                                                                           |
| ------------ | ------ | -------- | -------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shape        | string | "circle" | circle/rounded-box   | structure   | Analytic 2D SDF shape: circle or rounded box. Upstream default sphere3D/volumetric/shape JSON platform NOT_SUPPORTED.                                                                                                 |
| scale        | number | 1        | 0.4–2 step 0.01      | uniform     | Uniform shape scale in the rotated field space.                                                                                                                                                                       |
| rotation     | number | 0        | 0–360 step 1         | uniform     | Rigid in-plane rotation; 360 is identity.                                                                                                                                                                             |
| turbulence   | number | 1        | 0–1.5 step 0.01      | uniform     | Depth of the flowing molten folds; 0 leaves the pure bevel normal.                                                                                                                                                    |
| ripple       | number | 4        | 0.5–8 step 0.01      | uniform     | Molten fold scale (multiplied by 2.6 in the shader); higher = smaller, busier ripples.                                                                                                                                |
| warp         | number | 1.5      | 0–1.5 step 0.01      | uniform     | Flow swirl (multiplied by 0.9); domain-warps the folds into liquid curls.                                                                                                                                             |
| speed        | number | 0.5      | 0–4 step 0.01        | uniform     | Animated-time speed; 0 pauses flow and studio drift. Speed changes remap the phase (documented divergence from upstream accumulated Σdt·speed).                                                                       |
| environment  | number | 1.5      | 0–4 step 0.01        | uniform     | Strength of the reflected three-softbox studio.                                                                                                                                                                       |
| envRotation  | number | 0        | 0–360 step 1         | uniform     | Rotation of the studio frame around the surface.                                                                                                                                                                      |
| sharpness    | number | 0.6      | 0–1 step 0.01        | uniform     | Specular tightness; 1 = razor chrome glints, 0 = soft satin.                                                                                                                                                          |
| dispersion   | number | 0.4      | 0–1 step 0.01        | uniform     | Prismatic fringing along reflection edges (chromatic split, high quality only).                                                                                                                                       |
| lightAngle   | number | 265      | 0–360 step 1         | uniform     | Key-light direction for the specular glints (elevation fixed at −0.7).                                                                                                                                                |
| bevelWidth   | number | 0.05     | 0.005–0.2 step 0.001 | uniform     | Edge bevel width (floored at 0.003 in the profile).                                                                                                                                                                   |
| bevelShape   | number | 0        | 0–1 step 0.01        | uniform     | 0 = round fillet, 1 = machined chamfer profile with tangent breaks.                                                                                                                                                   |
| edgeSoftness | number | 0.05     | 0–1 step 0.01        | uniform     | Silhouette softness (upstream silhouetteAlpha chain).                                                                                                                                                                 |
| seed         | number | 0        | 0–8 step 0.01        | uniform     | Local extension: offsets the relief-noise domain. 0 is the fixed base domain.                                                                                                                                         |
| quality      | string | "high"   | low/high             | uniform     | Quality tier — a REAL compute change: high runs the chromatic-split path with a second studio evaluation per pixel; low shares one studio evaluation across RGB. Algorithm/cost difference documented in UPSTREAM.md. |

## E08 — cursorTrail

| Parameter | Type   | Default   | Range/Enum     | Update Mode | Description                                                               |
| --------- | ------ | --------- | -------------- | ----------- | ------------------------------------------------------------------------- |
| colorA    | string | "#00aaff" | —              | uniform     | Color of fresh trails (sRGB hex, decoded to linear).                      |
| colorB    | string | "#ff00aa" | —              | uniform     | Color trails transition to as they fade (sRGB hex, decoded to linear).    |
| radius    | number | 0.5       | 0.5–2 step 0.1 | uniform     | Base radius of the trail stroke (×0.1 in UV units in the shader).         |
| length    | number | 0.5       | 0.1–2 step 0.1 | uniform     | How long the trail persists; age rate = min(dt, 0.25) / max(0.1, length). |
| shrink    | number | 1         | 0–1 step 0.1   | uniform     | Stroke taper as it fades (0 = no taper, 1 = full taper).                  |
| softness  | number | 0         | 0–1 step 0.01  | uniform     | Edge softness (0 = crisp analytic edge, 1 = very soft).                   |

## E09 — Glass

| Parameter              | Type   | Default    | Range/Enum         | Update Mode | Description                                                  |
| ---------------------- | ------ | ---------- | ------------------ | ----------- | ------------------------------------------------------------ |
| shape                  | string | "circle"   | circle/rounded-box | pipeline    | Two analytic shapes; no volumetric/SDF texture platform      |
| scale                  | number | 1          | 0.1–3 step 0.01    | uniform     | scale                                                        |
| rotation               | number | 0          | 0–360 step 0.01    | uniform     | rotation                                                     |
| refraction             | number | 1          | 0–2 step 0.01      | uniform     | refraction                                                   |
| thickness              | number | 0.5        | 0–1 step 0.01      | uniform     | thickness                                                    |
| blur                   | number | 0          | 0–20 step 0.01     | pipeline    | Native nine-tap Vogel fallback, not Gaussian compute prepass |
| aberration             | number | 0.5        | 0–1 step 0.01      | pipeline    | aberration                                                   |
| innerZoom              | number | 1          | 0.5–3 step 0.01    | uniform     | innerZoom                                                    |
| edgeSoftness           | number | 0.1        | 0–1 step 0.01      | uniform     | edgeSoftness                                                 |
| lightAngle             | number | 300        | 0–360 step 0.01    | uniform     | lightAngle                                                   |
| highlight              | number | 0.05       | 0–1 step 0.01      | uniform     | highlight                                                    |
| highlightSoftness      | number | 0.5        | 0–1 step 0.01      | uniform     | highlightSoftness                                            |
| fresnel                | number | 0.2        | 0–1 step 0.01      | uniform     | fresnel                                                      |
| fresnelSoftness        | number | 0.5        | 0–1 step 0.01      | uniform     | fresnelSoftness                                              |
| tintIntensity          | number | 0          | 0–1 step 0.01      | uniform     | tintIntensity                                                |
| tintPreserveLuminosity | number | 1          | 0–1 step 0.01      | uniform     | Scalar flag: enabled iff > 0.5                               |
| tintColor              | string | "#ffffff"  | —                  | uniform     | tintColor                                                    |
| cutout                 | string | "none"     | none/shape         | uniform     | cutout                                                       |
| sourceKind             | string | "standard" | standard/blank     | uniform     | sourceKind                                                   |

## C01 — laserCard

| Parameter             | Type   | Default  | Range/Enum         | Update Mode | Description                                                                                |
| --------------------- | ------ | -------- | ------------------ | ----------- | ------------------------------------------------------------------------------------------ |
| shape                 | string | "circle" | circle/rounded-box | structure   | Shared analytic SDF shape for all three stages.                                            |
| holoEnabled           | string | "on"     | on/off             | uniform     | Holographic stage enable. off = neutral card input (deterministic checker pattern).        |
| embossEnabled         | string | "on"     | on/off             | uniform     | Emboss stage enable. off = holographic output passthrough (bypass emboss RT).              |
| sparkleEnabled        | string | "on"     | on/off             | uniform     | Sparkle stage enable. off = emboss output direct to screen (display copy pass still runs). |
| holoRoughness         | number | 0.25     | 0–1 step 0.01      | uniform     | Holographic matte grain (E03 roughness).                                                   |
| holoCrinkle           | number | 0.5      | 0–1 step 0.01      | uniform     | Holographic wrinkle strength (E03 crinkle).                                                |
| holoSparkle           | number | 0.4      | 0–1 step 0.01      | uniform     | Holographic glitter (E03 sparkle — note: distinct from the C01 Sparkle stage).             |
| holoFoilScale         | number | 1.5      | 0.3–6 step 0.01    | uniform     | Holographic iridescent patch scale (E03 foilScale).                                        |
| holoSaturation        | number | 0.75     | 0–1 step 0.01      | uniform     | Holographic spectral saturation.                                                           |
| holoHueShift          | number | 0        | 0–360 step 1       | uniform     | Holographic hue rotation.                                                                  |
| embossDepth           | number | -0.5     | -1–1 step 0.01     | uniform     | Emboss relief depth (E05 depth). negative=inset, positive=raised.                          |
| embossLightAngle      | number | 260      | 0–360 step 1       | uniform     | Emboss light angle for edge lighting.                                                      |
| embossShadowIntensity | number | 0.3      | 0–1 step 0.01      | uniform     | Emboss cast shadow darkness.                                                               |
| sparkleSize           | number | 70       | 10–200 step 1      | uniform     | Sparkle grid spacing (E06 size).                                                           |
| sparkleIntensity      | number | 0.45     | 0–20 step 0.1      | uniform     | Sparkle star gain (E06 intensity).                                                         |
| sparkleThreshold      | number | 0.2      | 0–1 step 0.01      | uniform     | Sparkle luminance gating threshold (E06 threshold).                                        |
| sparkleRayLength      | number | 5        | 0.1–20 step 0.1    | uniform     | Sparkle ray length (E06 rayLength).                                                        |
| sparkleColorize       | number | 0.35     | 0–1 step 0.01      | uniform     | Sparkle source-color mixing (E06 colorize).                                                |
| time                  | number | 0.25     | 0–60 step 0.01     | uniform     | Shared animation time. Read-only via setTime API; included in schema for oracle.           |
| sparkleSeed           | number | 0        | 0–8 step 0.01      | uniform     | Sparkle seed offset (E06 seed). Different values produce different star patterns.          |

## C02 — filmNeon

| Parameter         | Type   | Default   | Range/Enum                    | Update Mode | Description                                                                                                                                     |
| ----------------- | ------ | --------- | ----------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| shape             | string | "circle"  | circle/rounded-box            | structure   | Shared analytic 2D SDF shape for both layers. sphere3D/SDF textures/shape JSON NOT_SUPPORTED.                                                   |
| filmEnabled       | string | "on"      | on/off                        | uniform     | Thin-film layer enable. 'off' is a REAL identity: the layer's straight RGBA is exactly (0,0,0,0), so the composite equals the neon layer alone. |
| neonEnabled       | string | "on"      | on/off                        | uniform     | Neon edge layer enable. 'off' is a REAL identity: the composite equals the thin-film layer alone.                                               |
| rimWidth          | number | 1         | 0.1–2 step 0.01               | uniform     | Thin-film rim width (film0.x of the parent effect; ×0.1 in the shader).                                                                         |
| edgeSoftness      | number | 0.3       | 0.001–2 step 0.01             | uniform     | Thin-film edge softness (film0.y of the parent effect).                                                                                         |
| thickness         | number | 0.5       | 0–2 step 0.01                 | uniform     | Thin-film optical thickness (film0.z).                                                                                                          |
| dispersion        | number | 0.5       | 0–2 step 0.01                 | uniform     | Thin-film directional dispersion (film0.w).                                                                                                     |
| saturation        | number | 1         | 0–1 step 0.01                 | uniform     | Thin-film spectrum saturation (film1.y).                                                                                                        |
| phase             | number | 0         | 0–6.283185307179586 step 0.01 | uniform     | Thin-film phase offset (film1.x).                                                                                                               |
| opacity           | number | 1         | 0–1 step 0.01                 | uniform     | Thin-film opacity (film1.w); alpha = rim × opacity.                                                                                             |
| tubeColor         | string | "#00ddff" | —                             | uniform     | Neon tube color (sRGB hex, decoded to linear).                                                                                                  |
| secondaryColor    | string | "#ff00aa" | —                             | uniform     | Neon secondary color for two-tone diffuse shading (sRGB hex).                                                                                   |
| glowColor         | string | "#00ddff" | —                             | uniform     | Neon glow color (sRGB hex).                                                                                                                     |
| secondaryBlend    | number | 0.5       | 0–1 step 0.01                 | uniform     | Neon two-tone blend (neon0.z of the parent effect).                                                                                             |
| tubeThickness     | number | 0.03      | 0–0.08 step 0.001             | uniform     | Neon tube thickness (neon0.w of the parent effect).                                                                                             |
| intensity         | number | 1.15      | 0–3 step 0.01                 | uniform     | Neon master intensity (neon1.x).                                                                                                                |
| hotCoreIntensity  | number | 0.85      | 0–1 step 0.01                 | uniform     | Neon hot core intensity (neon1.y).                                                                                                              |
| glowIntensity     | number | 1.2       | 0–4 step 0.01                 | uniform     | Neon outer glow intensity (neon1.z).                                                                                                            |
| glowRadius        | number | 0.12      | 0–0.4 step 0.001              | uniform     | Neon glow radius (neon1.w).                                                                                                                     |
| lightAngle        | number | 135       | 0–360 step 1                  | uniform     | Neon light angle (neon2.x; the film's directional angle uses the same shared value × its own contract).                                         |
| specularIntensity | number | 0.6       | 0–2 step 0.01                 | uniform     | Neon specular intensity (neon2.y).                                                                                                              |
| specularSize      | number | 0.35      | 0–1 step 0.01                 | uniform     | Neon specular tightness (neon2.z).                                                                                                              |
| cornerSmoothing   | number | 0.5       | 0–1 step 0.01                 | uniform     | Neon stencil smoothing (neon2.w).                                                                                                               |

## C03 — glassTrail

| Parameter         | Type   | Default   | Range/Enum         | Update Mode | Description                                                                     |
| ----------------- | ------ | --------- | ------------------ | ----------- | ------------------------------------------------------------------------------- |
| shape             | string | "circle"  | circle/rounded-box | structure   | Shared Glass SDF shape.                                                         |
| glassEnabled      | string | "on"      | on/off             | uniform     | Glass stage. off = trail passthrough display copy (still one pass).             |
| trailEnabled      | string | "on"      | on/off             | uniform     | Trail recording and rendering. off = transparent identity child input to Glass. |
| trailColorA       | string | "#00aaff" | —                  | uniform     | Trail fresh color (sRGB hex).                                                   |
| trailColorB       | string | "#ff00aa" | —                  | uniform     | Trail fade color (sRGB hex).                                                    |
| trailRadius       | number | 0.5       | 0.5–2 step 0.1     | uniform     | Trail base radius (E08 radius).                                                 |
| trailLength       | number | 0.5       | 0.1–2 step 0.1     | uniform     | Trail persistence in seconds (E08 length).                                      |
| trailShrink       | number | 1         | 0–1 step 0.1       | uniform     | Trail taper (E08 shrink).                                                       |
| trailSoftness     | number | 0         | 0–1 step 0.01      | uniform     | Trail edge softness (E08 softness).                                             |
| glassRefraction   | number | 1         | 0–3 step 0.01      | uniform     | Glass refraction strength (E09 refraction).                                     |
| glassThickness    | number | 0.5       | 0–2 step 0.01      | uniform     | Glass thickness (E09 thickness).                                                |
| glassBlur         | number | 0         | 0–16 step 1        | uniform     | Glass Vogel blur sample count (E09 blur; 0=no blur).                            |
| glassAberration   | number | 0.5       | 0–2 step 0.01      | uniform     | Glass chromatic aberration (E09 aberration).                                    |
| glassInnerZoom    | number | 1         | 0.5–2 step 0.01    | uniform     | Glass inner zoom (E09 innerZoom).                                               |
| glassEdgeSoftness | number | 0.1       | 0–1 step 0.01      | uniform     | Glass silhouette softness (E09 edgeSoftness).                                   |
| glassLightAngle   | number | 300       | 0–360 step 1       | uniform     | Glass highlight light angle (E09 lightAngle).                                   |
| glassHighlight    | number | 0.05      | 0–1 step 0.01      | uniform     | Glass highlight intensity (E09 highlight).                                      |
| glassFresnel      | number | 0.2       | 0–2 step 0.01      | uniform     | Glass fresnel rim (E09 fresnel).                                                |
| time              | number | 0.25      | 0–60 step 0.01     | uniform     | Shared simulation time (read-only via setTime).                                 |

## C04 — inputDissolve

| Parameter       | Type   | Default | Range/Enum                | Update Mode | Description                                         |
| --------------- | ------ | ------- | ------------------------- | ----------- | --------------------------------------------------- |
| route           | enum   | "image" | image/procedural/rendered | structure   | Input route                                         |
| progress        | number | 0.35    | 0–1 step 0.01             | uniform     | Dissolve progress (0 identity, 1 fully transparent) |
| scale           | number | 3       | 0.5–20 step 0.1           | uniform     | Noise frequency                                     |
| softness        | number | 0.25    | 0–1 step 0.01             | uniform     | Edge feather                                        |
| seed            | number | 0       | 0–100 step 1              | uniform     | Pattern seed                                        |
| invert          | enum   | "off"   | off/on                    | uniform     | Reverse dissolve order                              |
| dissolveEnabled | enum   | "on"    | on/off                    | uniform     | Layer enable (off = true input-copy pass)           |
| time            | number | 0       | 0–3600 step 0.01          | uniform     | Presentation clock (read-only)                      |
