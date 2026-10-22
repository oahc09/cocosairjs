# glTF material parameter and update contract

The loader validates asset input against the pinned Khronos contracts. A successful parse is not proof that every extreme finite JavaScript value can be represented with GPU float precision. Shader numerical and visual acceptance is separate from schema acceptance.

## Iridescence

| Parameter                   | Type / range                      | Default | Unit / channel                             | Color space | Update                                  |
| --------------------------- | --------------------------------- | ------- | ------------------------------------------ | ----------- | --------------------------------------- |
| iridescenceFactor           | finite number in [0, 1]           | 0       | scalar, multiplied by iridescenceTexture.R | linear data | uniform when physical variant is active |
| iridescenceIor              | finite number >= 1                | 1.3     | dimensionless scalar                       | not a color | uniform                                 |
| iridescenceThicknessMinimum | finite number >= 0 and <= maximum | 100     | nanometers                                 | linear data | uniform                                 |
| iridescenceThicknessMaximum | finite number >= minimum          | 400     | nanometers                                 | linear data | uniform                                 |
| iridescenceThicknessTexture | glTF TextureInfo                  | absent  | G interpolates minimum to maximum          | linear data | texture binding / macro                 |

Only an omitted value uses its default. null, NaN, Infinity, negative thickness and reversed thickness ranges are rejected. There is no Khronos IOR upper limit and the shader no longer silently clamps it to 2.33334. Without a thickness texture, maximum thickness is used regardless of whether KHR_materials_volume is present. Missing intensity texture contributes 1.

Khronos defines no iridescenceIorTexture. The historical AIR-only field and its existing green-channel mapping are retained solely for compatibility, not advertised as glTF portability. Standard assets should use the scalar iridescenceIor. No property renaming to another engine's API is required.

The native physical uniform `airIridescence` is (factor, film IOR, minimum nm, maximum nm). The original material shader approximation uses three wavelengths, 680/550/450 nm; this update does not claim a new spectral BRDF or mathematical equivalence to another engine. Very large finite schema values have not been established as numerically useful GPU inputs. WebGPU acceptance remains experimental and independent of WebGL2 results.

## Runtime edits use native material APIs

Changing the previously parsed JSON does not automatically change a material. Use the native material property API. For per-object updates, call renderer.setSharedMaterial(template, 0), then renderer.getMaterialInstance(0); the returned instance owns its uniform state. Do not mutate a shared template unless every consumer should see the change. MaterialInstance is not a separate guaranteed package constructor export.

For an already-active physical variant, update `airIridescence` with Vec4(factor, ior, minNm, maxNm). `albedo` is linear RGBA, not display-sRGB bytes. Alpha updates do not change alphaMode or blend/depth state automatically. A transparent material must already have the appropriate blend state, or its native instance must explicitly override pipeline state. Mutating uniforms does not require shader recompilation.

The glTF texture transforms are per slot. `airAlbedoUV0` and `airAlbedoUV1` store the first two affine rows used for the base-color UVs. For offset (tx, ty), scale (sx, sy), rotation r, the existing loader's UV convention is row0=(cos(r)*sx, sin(r)*sy, tx, 0), row1=(-sin(r)*sx, cos(r)*sy, ty, 0). Rotation is radians. Other slots use their own prefixes; sharing a texture does not imply sharing its UV transform.

Texture presence, UV set selection and feature macros are shader-variant inputs; blend/depth/cull are pipeline state; scalar colors and affine UV rows are uniforms. Native recompileShaders and overridePipelineStates operate on material instances, not a base Material. If a material was created without the required physical effect or texture slot, construct the correct final material rather than pretending that setting an unused uniform enables the feature.

`inspectAirMaterial` and `inspectAirMeshMaterial` remain read-only. They neither warm up nor render, and their presence does not establish that the browser has presented a frame.

## Verification boundary

The focused CPU regression compares modified native instance uniforms against a directly constructed final-state material and checks sibling/template isolation. It covers IOR boundaries, factor/thickness invalid inputs, defaults, packed uniform order and shader sampling expressions. CPU tests and source checks do not replace real shader compilation, pixels or compositor capture; those results are recorded separately in the upstream-update acceptance ledger.
