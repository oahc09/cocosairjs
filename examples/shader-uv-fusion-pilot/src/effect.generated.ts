// Generated from frozen complete E05/E09 shaders.
export const definitions = {
    'emboss:reference': {
        name: 'air-w5-fusion-emboss-reference',
        techniques: [
            {
                passes: [
                    {
                        program: 'air-w5-fusion-emboss-reference-program',
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: true, depthWrite: true },
                        blendState: { targets: [{ blend: false }] },
                        properties: {
                            emboss0: { value: [0, 0, 0, 0] },
                            emboss1: { value: [0, 0, 0, 0] },
                            emboss2: { value: [0, 0, 0, 0] },
                        },
                    },
                ],
            },
        ],
        shaders: [
            {
                name: 'air-w5-fusion-emboss-reference-program',
                hash: 9510501,
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 47,
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 11,
                    },
                    globals: {
                        blocks: [
                            { name: 'CCGlobal', defines: [], set: 0, binding: 0 },
                            { name: 'CCCamera', defines: [], set: 0, binding: 1 },
                        ],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                    locals: {
                        blocks: [{ name: 'CCLocal', defines: [], set: 2, binding: 0 }],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                },
                defines: [{ name: 'SHAPE_BOX', type: 'boolean' }],
                attributes: [
                    { name: 'a_position', defines: [], format: 32, location: 0 },
                    { name: 'a_texCoord', defines: [], format: 21, location: 2 },
                ],
                blocks: [
                    {
                        name: 'Constants',
                        defines: [],
                        binding: 0,
                        stageFlags: 16,
                        members: [
                            { name: 'emboss0', type: 16, count: 1 },
                            { name: 'emboss1', type: 16, count: 1 },
                            { name: 'emboss2', type: 16, count: 1 },
                        ],
                    },
                ],
                samplerTextures: [
                    { name: 'childTexture', type: 28, count: 1, defines: [], stageFlags: 16, set: 1, binding: 1 },
                ],
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
                glsl1: {
                    vert: 'precision highp float;\nuniform highp mat4 cc_matView;\nuniform highp mat4 cc_matViewInv;\nuniform highp mat4 cc_matProj;\nuniform highp mat4 cc_matProjInv;\nuniform highp mat4 cc_matViewProj;\nuniform highp mat4 cc_matViewProjInv;\nuniform highp vec4 cc_cameraPos;\nuniform mediump vec4 cc_surfaceTransform;\nuniform mediump vec4 cc_screenScale;\nuniform mediump vec4 cc_exposure;\nuniform mediump vec4 cc_mainLitDir;\nuniform mediump vec4 cc_mainLitColor;\nuniform mediump vec4 cc_ambientSky;\nuniform mediump vec4 cc_ambientGround;\nuniform mediump vec4 cc_fogColor;\nuniform mediump vec4 cc_fogBase;\nuniform mediump vec4 cc_fogAdd;\nuniform mediump vec4 cc_nearFar;\nuniform mediump vec4 cc_viewPort;\nuniform highp mat4 cc_matWorld;\nuniform highp mat4 cc_matWorldIT;\nuniform highp vec4 cc_lightingMapUVParam;\nuniform highp vec4 cc_localShadowBias;\nattribute highp vec3 a_position;\nattribute mediump vec2 a_texCoord;\nvarying mediump vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);\n}',
                    frag: 'precision highp float; void main(){gl_FragColor=vec4(0.0);}',
                },
                glsl3: {
                    vert: 'precision highp float;\nuniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nuniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: '// Adapted math ideas: Shader Effects Inc. 2026 MIT, see ../UPSTREAM.md and ../LICENSE.reference.txt.\n// Independent flat-2D implementation: analytic SDF shapes (circle / rounded box), no TypeGPU\n// runtime, no SDF texture platform, no volumetric path. Signed height plateau from the SDF,\n// central-difference normals, two-tap cast-shadow trace and a parallax-like child UV warp.\nprecision highp float;\nin highp vec2 v_uv;\nuniform Constants {\n    vec4 emboss0;  // scale, rotation(deg), depth(signed), lightAngle(deg)\n    vec4 emboss1;  // lightIntensity, shadowIntensity, unused, linearDiagnostic\n    vec4 emboss2;  // canvas.width, canvas.height, sourceKind, unused\n};\nuniform highp sampler2D childTexture;\nout vec4 cc_FragColor;\nconst float INV_LIGHT_LEN = 0.81923192051904048;\nconst float LZN = 0.57346234436332832;\nfloat distanceField(vec2 p) {\n#if SHAPE_BOX\n    vec2 q = abs(p) - vec2(0.24, 0.16);\n    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.04;\n#else\n    return length(p) - 0.30;\n#endif\n}\n// Signed plateau height. The reference writes smoothstep(tw, -tw, s) with reversed edges; GLSL\n// leaves edge0 > edge1 undefined, so this is the explicit ordered-edge inverse.\nfloat heightField(float s, float depth, float transitionW) {\n    return depth * (1.0 - smoothstep(-transitionW, transitionW, s));\n}\nvoid main() {\n    float aspect = emboss2.x / emboss2.y;\n    vec2 delta = vec2((v_uv.x - 0.5) * aspect, v_uv.y - 0.5);\n    float rad = emboss0.y * 0.017453292519943295;\n    float cosR = cos(rad);\n    float sinR = sin(rad);\n    vec2 f = vec2(delta.x * cosR + delta.y * sinR, delta.y * cosR - delta.x * sinR) / emboss0.x;\n    const float eps = 0.003;\n    const float tw = 0.003;\n    float depth = emboss0.z;\n    // Centre + four cardinal SDF taps (central differences) and the two shadow-trace taps.\n    float sC = distanceField(f);\n    float sR = distanceField(f + vec2(eps, 0.0));\n    float sL = distanceField(f - vec2(eps, 0.0));\n    float sU = distanceField(f + vec2(0.0, eps));\n    float sD = distanceField(f - vec2(0.0, eps));\n    float lightRad = emboss0.w * 0.017453292519943295;\n    float lx = cos(lightRad);\n    float ly = sin(lightRad);\n    float absDepth = max(abs(depth), 0.0001);\n    float spread = absDepth * 0.06;\n    float h1raw = distanceField(f + vec2(lx, ly) * spread * 0.5);\n    float h2raw = distanceField(f + vec2(lx, ly) * spread);\n    // Surface normal from the height gradient; edge lighting relative to the flat z baseline.\n    float hR = heightField(sR, depth, tw);\n    float hL = heightField(sL, depth, tw);\n    float hU = heightField(sU, depth, tw);\n    float hD = heightField(sD, depth, tw);\n    float dhx = (hR - hL) / (eps * 2.0);\n    float dhy = (hU - hD) / (eps * 2.0);\n    float nLen = sqrt(dhx * dhx + dhy * dhy + 1.0);\n    float NdotL = (-dhx / nLen) * (lx * INV_LIGHT_LEN) + (-dhy / nLen) * (ly * INV_LIGHT_LEN) + (1.0 / nLen) * LZN;\n    float edgeLighting = (NdotL - LZN) * emboss1.x;\n    float highlight = max(edgeLighting, 0.0);\n    float edgeShadow = max(-edgeLighting, 0.0);\n    // Cast shadow: heights at the two trace points vs the centre, through the wide transition.\n    float hC = heightField(sC, depth, tw);\n    float shadowTw = absDepth * 0.06;\n    float h1 = heightField(h1raw, depth, shadowTw);\n    float h2 = heightField(h2raw, depth, shadowTw);\n    float diff1 = (h1 - hC) / absDepth;\n    float diff2 = (h2 - hC) / absDepth;\n    float castShadow = smoothstep(0.0, 0.5, diff1) * 0.55 + smoothstep(0.0, 0.5, diff2) * 0.45;\n    float totalShadow = clamp(edgeShadow + castShadow, 0.0, 1.0) * emboss1.y;\n    // Parallax-like child UV warp: scale the child around the centre inside the boundary. This is\n    // a UV warp, not a claim of physical geometry displacement.\n    float inside = 1.0 - smoothstep(-tw, tw, sC);\n    float dispScale = 1.0 - depth * 0.05 * inside;\n    vec2 warped = vec2(0.5 + (v_uv.x - 0.5) * dispScale, 0.5 + (v_uv.y - 0.5) * dispScale);\n    // Child RTT samples are premultiplied; unpremultiply (alpha-0 safe) to straight colour.\n    vec4 child = texture(childTexture, warped);\n    float childAlpha = child.a;\n    vec3 straightRgb = childAlpha > 0.001 ? child.rgb / childAlpha : vec3(0.0);\n    vec3 finalRgb = clamp(straightRgb * (1.0 - totalShadow) + vec3(highlight), 0.0, 1.0);\n    // Straight linear RGBA out; the preview applies the sRGB OETF once, the linear diagnostic\n    // render target receives the raw values on a transparent clear with blending disabled.\n    vec3 outRgb = emboss1.w > 0.5\n        ? finalRgb\n        : mix(12.92 * finalRgb, 1.055 * pow(max(finalRgb, 0.0), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), finalRgb));\n    cc_FragColor = vec4(outRgb, childAlpha);\n}\n',
                },
                glsl4: {
                    vert: 'precision highp float;\nlayout(set = 0, binding = 1) uniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nlayout(set = 2, binding = 0) uniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: '// Adapted math ideas: Shader Effects Inc. 2026 MIT, see ../UPSTREAM.md and ../LICENSE.reference.txt.\n// Independent flat-2D implementation: analytic SDF shapes (circle / rounded box), no TypeGPU\n// runtime, no SDF texture platform, no volumetric path. Signed height plateau from the SDF,\n// central-difference normals, two-tap cast-shadow trace and a parallax-like child UV warp.\nprecision highp float;\nin highp vec2 v_uv;\nlayout(set = 1, binding = 0) uniform Constants {\n    vec4 emboss0;  // scale, rotation(deg), depth(signed), lightAngle(deg)\n    vec4 emboss1;  // lightIntensity, shadowIntensity, unused, linearDiagnostic\n    vec4 emboss2;  // canvas.width, canvas.height, sourceKind, unused\n};\nlayout(set = 1, binding = 1) uniform highp sampler2D childTexture;\nout vec4 cc_FragColor;\nconst float INV_LIGHT_LEN = 0.81923192051904048;\nconst float LZN = 0.57346234436332832;\nfloat distanceField(vec2 p) {\n#if SHAPE_BOX\n    vec2 q = abs(p) - vec2(0.24, 0.16);\n    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.04;\n#else\n    return length(p) - 0.30;\n#endif\n}\n// Signed plateau height. The reference writes smoothstep(tw, -tw, s) with reversed edges; GLSL\n// leaves edge0 > edge1 undefined, so this is the explicit ordered-edge inverse.\nfloat heightField(float s, float depth, float transitionW) {\n    return depth * (1.0 - smoothstep(-transitionW, transitionW, s));\n}\nvoid main() {\n    float aspect = emboss2.x / emboss2.y;\n    vec2 delta = vec2((v_uv.x - 0.5) * aspect, v_uv.y - 0.5);\n    float rad = emboss0.y * 0.017453292519943295;\n    float cosR = cos(rad);\n    float sinR = sin(rad);\n    vec2 f = vec2(delta.x * cosR + delta.y * sinR, delta.y * cosR - delta.x * sinR) / emboss0.x;\n    const float eps = 0.003;\n    const float tw = 0.003;\n    float depth = emboss0.z;\n    // Centre + four cardinal SDF taps (central differences) and the two shadow-trace taps.\n    float sC = distanceField(f);\n    float sR = distanceField(f + vec2(eps, 0.0));\n    float sL = distanceField(f - vec2(eps, 0.0));\n    float sU = distanceField(f + vec2(0.0, eps));\n    float sD = distanceField(f - vec2(0.0, eps));\n    float lightRad = emboss0.w * 0.017453292519943295;\n    float lx = cos(lightRad);\n    float ly = sin(lightRad);\n    float absDepth = max(abs(depth), 0.0001);\n    float spread = absDepth * 0.06;\n    float h1raw = distanceField(f + vec2(lx, ly) * spread * 0.5);\n    float h2raw = distanceField(f + vec2(lx, ly) * spread);\n    // Surface normal from the height gradient; edge lighting relative to the flat z baseline.\n    float hR = heightField(sR, depth, tw);\n    float hL = heightField(sL, depth, tw);\n    float hU = heightField(sU, depth, tw);\n    float hD = heightField(sD, depth, tw);\n    float dhx = (hR - hL) / (eps * 2.0);\n    float dhy = (hU - hD) / (eps * 2.0);\n    float nLen = sqrt(dhx * dhx + dhy * dhy + 1.0);\n    float NdotL = (-dhx / nLen) * (lx * INV_LIGHT_LEN) + (-dhy / nLen) * (ly * INV_LIGHT_LEN) + (1.0 / nLen) * LZN;\n    float edgeLighting = (NdotL - LZN) * emboss1.x;\n    float highlight = max(edgeLighting, 0.0);\n    float edgeShadow = max(-edgeLighting, 0.0);\n    // Cast shadow: heights at the two trace points vs the centre, through the wide transition.\n    float hC = heightField(sC, depth, tw);\n    float shadowTw = absDepth * 0.06;\n    float h1 = heightField(h1raw, depth, shadowTw);\n    float h2 = heightField(h2raw, depth, shadowTw);\n    float diff1 = (h1 - hC) / absDepth;\n    float diff2 = (h2 - hC) / absDepth;\n    float castShadow = smoothstep(0.0, 0.5, diff1) * 0.55 + smoothstep(0.0, 0.5, diff2) * 0.45;\n    float totalShadow = clamp(edgeShadow + castShadow, 0.0, 1.0) * emboss1.y;\n    // Parallax-like child UV warp: scale the child around the centre inside the boundary. This is\n    // a UV warp, not a claim of physical geometry displacement.\n    float inside = 1.0 - smoothstep(-tw, tw, sC);\n    float dispScale = 1.0 - depth * 0.05 * inside;\n    vec2 warped = vec2(0.5 + (v_uv.x - 0.5) * dispScale, 0.5 + (v_uv.y - 0.5) * dispScale);\n    // Child RTT samples are premultiplied; unpremultiply (alpha-0 safe) to straight colour.\n    vec4 child = texture(childTexture, warped);\n    float childAlpha = child.a;\n    vec3 straightRgb = childAlpha > 0.001 ? child.rgb / childAlpha : vec3(0.0);\n    vec3 finalRgb = clamp(straightRgb * (1.0 - totalShadow) + vec3(highlight), 0.0, 1.0);\n    // Straight linear RGBA out; the preview applies the sRGB OETF once, the linear diagnostic\n    // render target receives the raw values on a transparent clear with blending disabled.\n    vec3 outRgb = emboss1.w > 0.5\n        ? finalRgb\n        : mix(12.92 * finalRgb, 1.055 * pow(max(finalRgb, 0.0), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), finalRgb));\n    cc_FragColor = vec4(outRgb, childAlpha);\n}\n',
                },
            },
        ],
        combinations: [],
        hideInEditor: false,
    },
    'emboss:fused': {
        name: 'air-w5-fusion-emboss-fused',
        techniques: [
            {
                passes: [
                    {
                        program: 'air-w5-fusion-emboss-fused-program',
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: true, depthWrite: true },
                        blendState: { targets: [{ blend: false }] },
                        properties: {
                            emboss0: { value: [0, 0, 0, 0] },
                            emboss1: { value: [0, 0, 0, 0] },
                            emboss2: { value: [0, 0, 0, 0] },
                        },
                    },
                ],
            },
        ],
        shaders: [
            {
                name: 'air-w5-fusion-emboss-fused-program',
                hash: 9510502,
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 47,
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 7,
                    },
                    globals: {
                        blocks: [
                            { name: 'CCGlobal', defines: [], set: 0, binding: 0 },
                            { name: 'CCCamera', defines: [], set: 0, binding: 1 },
                        ],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                    locals: {
                        blocks: [{ name: 'CCLocal', defines: [], set: 2, binding: 0 }],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                },
                defines: [{ name: 'SHAPE_BOX', type: 'boolean' }],
                attributes: [
                    { name: 'a_position', defines: [], format: 32, location: 0 },
                    { name: 'a_texCoord', defines: [], format: 21, location: 2 },
                ],
                blocks: [
                    {
                        name: 'Constants',
                        defines: [],
                        binding: 0,
                        stageFlags: 16,
                        members: [
                            { name: 'emboss0', type: 16, count: 1 },
                            { name: 'emboss1', type: 16, count: 1 },
                            { name: 'emboss2', type: 16, count: 1 },
                        ],
                    },
                ],
                samplerTextures: [],
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
                glsl1: {
                    vert: 'precision highp float;\nuniform highp mat4 cc_matView;\nuniform highp mat4 cc_matViewInv;\nuniform highp mat4 cc_matProj;\nuniform highp mat4 cc_matProjInv;\nuniform highp mat4 cc_matViewProj;\nuniform highp mat4 cc_matViewProjInv;\nuniform highp vec4 cc_cameraPos;\nuniform mediump vec4 cc_surfaceTransform;\nuniform mediump vec4 cc_screenScale;\nuniform mediump vec4 cc_exposure;\nuniform mediump vec4 cc_mainLitDir;\nuniform mediump vec4 cc_mainLitColor;\nuniform mediump vec4 cc_ambientSky;\nuniform mediump vec4 cc_ambientGround;\nuniform mediump vec4 cc_fogColor;\nuniform mediump vec4 cc_fogBase;\nuniform mediump vec4 cc_fogAdd;\nuniform mediump vec4 cc_nearFar;\nuniform mediump vec4 cc_viewPort;\nuniform highp mat4 cc_matWorld;\nuniform highp mat4 cc_matWorldIT;\nuniform highp vec4 cc_lightingMapUVParam;\nuniform highp vec4 cc_localShadowBias;\nattribute highp vec3 a_position;\nattribute mediump vec2 a_texCoord;\nvarying mediump vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);\n}',
                    frag: 'precision highp float; void main(){gl_FragColor=vec4(0.0);}',
                },
                glsl3: {
                    vert: 'precision highp float;\nuniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nuniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: '// Adapted math ideas: Shader Effects Inc. 2026 MIT, see ../UPSTREAM.md and ../LICENSE.reference.txt.\n// Independent flat-2D implementation: analytic SDF shapes (circle / rounded box), no TypeGPU\n// runtime, no SDF texture platform, no volumetric path. Signed height plateau from the SDF,\n// central-difference normals, two-tap cast-shadow trace and a parallax-like child UV warp.\nprecision highp float;\nin highp vec2 v_uv;\nuniform Constants {\n    vec4 emboss0;  // scale, rotation(deg), depth(signed), lightAngle(deg)\n    vec4 emboss1;  // lightIntensity, shadowIntensity, unused, linearDiagnostic\n    vec4 emboss2;  // canvas.width, canvas.height, sourceKind, unused\n};\nvec4 storedPattern(vec2 coords) {\n    if (emboss2.z > 0.5) return vec4(0.0);\n    vec2 uv = (clamp(floor(coords * 256.0), vec2(0.0), vec2(255.0)) + 0.5) / 256.0;\n    vec2 cell = floor(uv * 8.0);\n    float check = mod(cell.x + cell.y, 2.0) < 0.5 ? 0.35 : 0.65;\n    vec3 rgb = vec3(check + uv.x * 0.1, check * 0.8, check * 0.6);\n    float alpha = uv.x < 0.5 ? 1.0 : 0.5;\n    if (length(uv - vec2(0.75, 0.25)) < 0.08) { rgb = vec3(1.0, 0.437, 0.0); alpha = 0.0; }\n    if (length(uv - vec2(0.25, 0.75)) < 0.08) { rgb = vec3(0.9, 0.2, 0.5); alpha = 1.0; }\n    return floor(vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha) * 255.0 + 0.5) / 255.0;\n}\n\nout vec4 cc_FragColor;\nconst float INV_LIGHT_LEN = 0.81923192051904048;\nconst float LZN = 0.57346234436332832;\nfloat distanceField(vec2 p) {\n#if SHAPE_BOX\n    vec2 q = abs(p) - vec2(0.24, 0.16);\n    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.04;\n#else\n    return length(p) - 0.30;\n#endif\n}\n// Signed plateau height. The reference writes smoothstep(tw, -tw, s) with reversed edges; GLSL\n// leaves edge0 > edge1 undefined, so this is the explicit ordered-edge inverse.\nfloat heightField(float s, float depth, float transitionW) {\n    return depth * (1.0 - smoothstep(-transitionW, transitionW, s));\n}\nvoid main() {\n    float aspect = emboss2.x / emboss2.y;\n    vec2 delta = vec2((v_uv.x - 0.5) * aspect, v_uv.y - 0.5);\n    float rad = emboss0.y * 0.017453292519943295;\n    float cosR = cos(rad);\n    float sinR = sin(rad);\n    vec2 f = vec2(delta.x * cosR + delta.y * sinR, delta.y * cosR - delta.x * sinR) / emboss0.x;\n    const float eps = 0.003;\n    const float tw = 0.003;\n    float depth = emboss0.z;\n    // Centre + four cardinal SDF taps (central differences) and the two shadow-trace taps.\n    float sC = distanceField(f);\n    float sR = distanceField(f + vec2(eps, 0.0));\n    float sL = distanceField(f - vec2(eps, 0.0));\n    float sU = distanceField(f + vec2(0.0, eps));\n    float sD = distanceField(f - vec2(0.0, eps));\n    float lightRad = emboss0.w * 0.017453292519943295;\n    float lx = cos(lightRad);\n    float ly = sin(lightRad);\n    float absDepth = max(abs(depth), 0.0001);\n    float spread = absDepth * 0.06;\n    float h1raw = distanceField(f + vec2(lx, ly) * spread * 0.5);\n    float h2raw = distanceField(f + vec2(lx, ly) * spread);\n    // Surface normal from the height gradient; edge lighting relative to the flat z baseline.\n    float hR = heightField(sR, depth, tw);\n    float hL = heightField(sL, depth, tw);\n    float hU = heightField(sU, depth, tw);\n    float hD = heightField(sD, depth, tw);\n    float dhx = (hR - hL) / (eps * 2.0);\n    float dhy = (hU - hD) / (eps * 2.0);\n    float nLen = sqrt(dhx * dhx + dhy * dhy + 1.0);\n    float NdotL = (-dhx / nLen) * (lx * INV_LIGHT_LEN) + (-dhy / nLen) * (ly * INV_LIGHT_LEN) + (1.0 / nLen) * LZN;\n    float edgeLighting = (NdotL - LZN) * emboss1.x;\n    float highlight = max(edgeLighting, 0.0);\n    float edgeShadow = max(-edgeLighting, 0.0);\n    // Cast shadow: heights at the two trace points vs the centre, through the wide transition.\n    float hC = heightField(sC, depth, tw);\n    float shadowTw = absDepth * 0.06;\n    float h1 = heightField(h1raw, depth, shadowTw);\n    float h2 = heightField(h2raw, depth, shadowTw);\n    float diff1 = (h1 - hC) / absDepth;\n    float diff2 = (h2 - hC) / absDepth;\n    float castShadow = smoothstep(0.0, 0.5, diff1) * 0.55 + smoothstep(0.0, 0.5, diff2) * 0.45;\n    float totalShadow = clamp(edgeShadow + castShadow, 0.0, 1.0) * emboss1.y;\n    // Parallax-like child UV warp: scale the child around the centre inside the boundary. This is\n    // a UV warp, not a claim of physical geometry displacement.\n    float inside = 1.0 - smoothstep(-tw, tw, sC);\n    float dispScale = 1.0 - depth * 0.05 * inside;\n    vec2 warped = vec2(0.5 + (v_uv.x - 0.5) * dispScale, 0.5 + (v_uv.y - 0.5) * dispScale);\n    // Child RTT samples are premultiplied; unpremultiply (alpha-0 safe) to straight colour.\n    vec4 child = storedPattern(warped);\n    float childAlpha = child.a;\n    vec3 straightRgb = childAlpha > 0.001 ? child.rgb / childAlpha : vec3(0.0);\n    vec3 finalRgb = clamp(straightRgb * (1.0 - totalShadow) + vec3(highlight), 0.0, 1.0);\n    // Straight linear RGBA out; the preview applies the sRGB OETF once, the linear diagnostic\n    // render target receives the raw values on a transparent clear with blending disabled.\n    vec3 outRgb = emboss1.w > 0.5\n        ? finalRgb\n        : mix(12.92 * finalRgb, 1.055 * pow(max(finalRgb, 0.0), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), finalRgb));\n    cc_FragColor = vec4(outRgb, childAlpha);\n}\n',
                },
                glsl4: {
                    vert: 'precision highp float;\nlayout(set = 0, binding = 1) uniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nlayout(set = 2, binding = 0) uniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: '// Adapted math ideas: Shader Effects Inc. 2026 MIT, see ../UPSTREAM.md and ../LICENSE.reference.txt.\n// Independent flat-2D implementation: analytic SDF shapes (circle / rounded box), no TypeGPU\n// runtime, no SDF texture platform, no volumetric path. Signed height plateau from the SDF,\n// central-difference normals, two-tap cast-shadow trace and a parallax-like child UV warp.\nprecision highp float;\nin highp vec2 v_uv;\nlayout(set = 1, binding = 0) uniform Constants {\n    vec4 emboss0;  // scale, rotation(deg), depth(signed), lightAngle(deg)\n    vec4 emboss1;  // lightIntensity, shadowIntensity, unused, linearDiagnostic\n    vec4 emboss2;  // canvas.width, canvas.height, sourceKind, unused\n};\nvec4 storedPattern(vec2 coords) {\n    if (emboss2.z > 0.5) return vec4(0.0);\n    vec2 uv = (clamp(floor(coords * 256.0), vec2(0.0), vec2(255.0)) + 0.5) / 256.0;\n    vec2 cell = floor(uv * 8.0);\n    float check = mod(cell.x + cell.y, 2.0) < 0.5 ? 0.35 : 0.65;\n    vec3 rgb = vec3(check + uv.x * 0.1, check * 0.8, check * 0.6);\n    float alpha = uv.x < 0.5 ? 1.0 : 0.5;\n    if (length(uv - vec2(0.75, 0.25)) < 0.08) { rgb = vec3(1.0, 0.437, 0.0); alpha = 0.0; }\n    if (length(uv - vec2(0.25, 0.75)) < 0.08) { rgb = vec3(0.9, 0.2, 0.5); alpha = 1.0; }\n    return floor(vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha) * 255.0 + 0.5) / 255.0;\n}\n\nout vec4 cc_FragColor;\nconst float INV_LIGHT_LEN = 0.81923192051904048;\nconst float LZN = 0.57346234436332832;\nfloat distanceField(vec2 p) {\n#if SHAPE_BOX\n    vec2 q = abs(p) - vec2(0.24, 0.16);\n    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.04;\n#else\n    return length(p) - 0.30;\n#endif\n}\n// Signed plateau height. The reference writes smoothstep(tw, -tw, s) with reversed edges; GLSL\n// leaves edge0 > edge1 undefined, so this is the explicit ordered-edge inverse.\nfloat heightField(float s, float depth, float transitionW) {\n    return depth * (1.0 - smoothstep(-transitionW, transitionW, s));\n}\nvoid main() {\n    float aspect = emboss2.x / emboss2.y;\n    vec2 delta = vec2((v_uv.x - 0.5) * aspect, v_uv.y - 0.5);\n    float rad = emboss0.y * 0.017453292519943295;\n    float cosR = cos(rad);\n    float sinR = sin(rad);\n    vec2 f = vec2(delta.x * cosR + delta.y * sinR, delta.y * cosR - delta.x * sinR) / emboss0.x;\n    const float eps = 0.003;\n    const float tw = 0.003;\n    float depth = emboss0.z;\n    // Centre + four cardinal SDF taps (central differences) and the two shadow-trace taps.\n    float sC = distanceField(f);\n    float sR = distanceField(f + vec2(eps, 0.0));\n    float sL = distanceField(f - vec2(eps, 0.0));\n    float sU = distanceField(f + vec2(0.0, eps));\n    float sD = distanceField(f - vec2(0.0, eps));\n    float lightRad = emboss0.w * 0.017453292519943295;\n    float lx = cos(lightRad);\n    float ly = sin(lightRad);\n    float absDepth = max(abs(depth), 0.0001);\n    float spread = absDepth * 0.06;\n    float h1raw = distanceField(f + vec2(lx, ly) * spread * 0.5);\n    float h2raw = distanceField(f + vec2(lx, ly) * spread);\n    // Surface normal from the height gradient; edge lighting relative to the flat z baseline.\n    float hR = heightField(sR, depth, tw);\n    float hL = heightField(sL, depth, tw);\n    float hU = heightField(sU, depth, tw);\n    float hD = heightField(sD, depth, tw);\n    float dhx = (hR - hL) / (eps * 2.0);\n    float dhy = (hU - hD) / (eps * 2.0);\n    float nLen = sqrt(dhx * dhx + dhy * dhy + 1.0);\n    float NdotL = (-dhx / nLen) * (lx * INV_LIGHT_LEN) + (-dhy / nLen) * (ly * INV_LIGHT_LEN) + (1.0 / nLen) * LZN;\n    float edgeLighting = (NdotL - LZN) * emboss1.x;\n    float highlight = max(edgeLighting, 0.0);\n    float edgeShadow = max(-edgeLighting, 0.0);\n    // Cast shadow: heights at the two trace points vs the centre, through the wide transition.\n    float hC = heightField(sC, depth, tw);\n    float shadowTw = absDepth * 0.06;\n    float h1 = heightField(h1raw, depth, shadowTw);\n    float h2 = heightField(h2raw, depth, shadowTw);\n    float diff1 = (h1 - hC) / absDepth;\n    float diff2 = (h2 - hC) / absDepth;\n    float castShadow = smoothstep(0.0, 0.5, diff1) * 0.55 + smoothstep(0.0, 0.5, diff2) * 0.45;\n    float totalShadow = clamp(edgeShadow + castShadow, 0.0, 1.0) * emboss1.y;\n    // Parallax-like child UV warp: scale the child around the centre inside the boundary. This is\n    // a UV warp, not a claim of physical geometry displacement.\n    float inside = 1.0 - smoothstep(-tw, tw, sC);\n    float dispScale = 1.0 - depth * 0.05 * inside;\n    vec2 warped = vec2(0.5 + (v_uv.x - 0.5) * dispScale, 0.5 + (v_uv.y - 0.5) * dispScale);\n    // Child RTT samples are premultiplied; unpremultiply (alpha-0 safe) to straight colour.\n    vec4 child = storedPattern(warped);\n    float childAlpha = child.a;\n    vec3 straightRgb = childAlpha > 0.001 ? child.rgb / childAlpha : vec3(0.0);\n    vec3 finalRgb = clamp(straightRgb * (1.0 - totalShadow) + vec3(highlight), 0.0, 1.0);\n    // Straight linear RGBA out; the preview applies the sRGB OETF once, the linear diagnostic\n    // render target receives the raw values on a transparent clear with blending disabled.\n    vec3 outRgb = emboss1.w > 0.5\n        ? finalRgb\n        : mix(12.92 * finalRgb, 1.055 * pow(max(finalRgb, 0.0), vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), finalRgb));\n    cc_FragColor = vec4(outRgb, childAlpha);\n}\n',
                },
            },
        ],
        combinations: [],
        hideInEditor: false,
    },
    'emboss:pattern': {
        name: 'air-w5-fusion-emboss-pattern',
        techniques: [
            {
                passes: [
                    {
                        program: 'air-w5-fusion-emboss-pattern-program',
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: true, depthWrite: true },
                        blendState: { targets: [{ blend: false }] },
                        properties: { pattern0: { value: [0, 0, 0, 0] } },
                    },
                ],
            },
        ],
        shaders: [
            {
                name: 'air-w5-fusion-emboss-pattern-program',
                hash: 9510503,
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 47,
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 5,
                    },
                    globals: {
                        blocks: [
                            { name: 'CCGlobal', defines: [], set: 0, binding: 0 },
                            { name: 'CCCamera', defines: [], set: 0, binding: 1 },
                        ],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                    locals: {
                        blocks: [{ name: 'CCLocal', defines: [], set: 2, binding: 0 }],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                },
                defines: [],
                attributes: [
                    { name: 'a_position', defines: [], format: 32, location: 0 },
                    { name: 'a_texCoord', defines: [], format: 21, location: 2 },
                ],
                blocks: [
                    {
                        name: 'Constants',
                        defines: [],
                        binding: 0,
                        stageFlags: 16,
                        members: [{ name: 'pattern0', type: 16, count: 1 }],
                    },
                ],
                samplerTextures: [],
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
                glsl1: {
                    vert: 'precision highp float;\nuniform highp mat4 cc_matView;\nuniform highp mat4 cc_matViewInv;\nuniform highp mat4 cc_matProj;\nuniform highp mat4 cc_matProjInv;\nuniform highp mat4 cc_matViewProj;\nuniform highp mat4 cc_matViewProjInv;\nuniform highp vec4 cc_cameraPos;\nuniform mediump vec4 cc_surfaceTransform;\nuniform mediump vec4 cc_screenScale;\nuniform mediump vec4 cc_exposure;\nuniform mediump vec4 cc_mainLitDir;\nuniform mediump vec4 cc_mainLitColor;\nuniform mediump vec4 cc_ambientSky;\nuniform mediump vec4 cc_ambientGround;\nuniform mediump vec4 cc_fogColor;\nuniform mediump vec4 cc_fogBase;\nuniform mediump vec4 cc_fogAdd;\nuniform mediump vec4 cc_nearFar;\nuniform mediump vec4 cc_viewPort;\nuniform highp mat4 cc_matWorld;\nuniform highp mat4 cc_matWorldIT;\nuniform highp vec4 cc_lightingMapUVParam;\nuniform highp vec4 cc_localShadowBias;\nattribute highp vec3 a_position;\nattribute mediump vec2 a_texCoord;\nvarying mediump vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);\n}',
                    frag: 'precision highp float; void main(){gl_FragColor=vec4(0.0);}',
                },
                glsl3: {
                    vert: 'precision highp float;\nuniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nuniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: '// E05 deterministic child source pattern. Renders PREMULTIPLIED output into the child render\n// target over a transparent clear (the canonical RTT convention the emboss shader inverts).\n// Contents: 8x8 checker with a u-gradient (UV-direction anchors), opaque left half, exactly\n// 0.5-alpha right half (no-double-premultiply probe), an alpha-0 disc with hidden non-zero RGB\n// (premultiply storage zeroes it; the unpremultiply guard must yield 0 with no NaN), an opaque\n// anchor disc, and a fully transparent "blank" mode.\nprecision highp float;\nin highp vec2 v_uv;\nuniform Constants {\n    vec4 pattern0;  // sourceKind(0=standard,1=blank), unused, unused, unused\n};\nout vec4 cc_FragColor;\nvoid main() {\n    if (pattern0.x > 0.5) {\n        cc_FragColor = vec4(0.0, 0.0, 0.0, 0.0);\n        return;\n    }\n    vec2 cell = floor(v_uv * 8.0);\n    float check = mod(cell.x + cell.y, 2.0) < 0.5 ? 0.35 : 0.65;\n    vec3 rgb = vec3(check, check * 0.8, check * 0.6);\n    rgb.r += v_uv.x * 0.1;\n    float alpha = v_uv.x < 0.5 ? 1.0 : 0.5;\n    if (length(v_uv - vec2(0.75, 0.25)) < 0.08) {\n        rgb = vec3(1.0, 0.437, 0.0);\n        alpha = 0.0;\n    }\n    if (length(v_uv - vec2(0.25, 0.75)) < 0.08) {\n        rgb = vec3(0.9, 0.2, 0.5);\n        alpha = 1.0;\n    }\n    cc_FragColor = vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha);\n}\n',
                },
                glsl4: {
                    vert: 'precision highp float;\nlayout(set = 0, binding = 1) uniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nlayout(set = 2, binding = 0) uniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: '// E05 deterministic child source pattern. Renders PREMULTIPLIED output into the child render\n// target over a transparent clear (the canonical RTT convention the emboss shader inverts).\n// Contents: 8x8 checker with a u-gradient (UV-direction anchors), opaque left half, exactly\n// 0.5-alpha right half (no-double-premultiply probe), an alpha-0 disc with hidden non-zero RGB\n// (premultiply storage zeroes it; the unpremultiply guard must yield 0 with no NaN), an opaque\n// anchor disc, and a fully transparent "blank" mode.\nprecision highp float;\nin highp vec2 v_uv;\nlayout(set = 1, binding = 0) uniform Constants {\n    vec4 pattern0;  // sourceKind(0=standard,1=blank), unused, unused, unused\n};\nout vec4 cc_FragColor;\nvoid main() {\n    if (pattern0.x > 0.5) {\n        cc_FragColor = vec4(0.0, 0.0, 0.0, 0.0);\n        return;\n    }\n    vec2 cell = floor(v_uv * 8.0);\n    float check = mod(cell.x + cell.y, 2.0) < 0.5 ? 0.35 : 0.65;\n    vec3 rgb = vec3(check, check * 0.8, check * 0.6);\n    rgb.r += v_uv.x * 0.1;\n    float alpha = v_uv.x < 0.5 ? 1.0 : 0.5;\n    if (length(v_uv - vec2(0.75, 0.25)) < 0.08) {\n        rgb = vec3(1.0, 0.437, 0.0);\n        alpha = 0.0;\n    }\n    if (length(v_uv - vec2(0.25, 0.75)) < 0.08) {\n        rgb = vec3(0.9, 0.2, 0.5);\n        alpha = 1.0;\n    }\n    cc_FragColor = vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha);\n}\n',
                },
            },
        ],
        combinations: [],
        hideInEditor: false,
    },
    'glass:reference': {
        name: 'air-w5-fusion-glass-reference',
        techniques: [
            {
                passes: [
                    {
                        program: 'air-w5-fusion-glass-reference-program',
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: true, depthWrite: true },
                        blendState: { targets: [{ blend: false }] },
                        properties: {
                            glass0: { value: [0, 0, 0, 0] },
                            glass1: { value: [0, 0, 0, 0] },
                            glass2: { value: [0, 0, 0, 0] },
                            glass3: { value: [0, 0, 0, 0] },
                            glass4: { value: [0, 0, 0, 0] },
                            glass5: { value: [0, 0, 0, 0] },
                        },
                    },
                ],
            },
        ],
        shaders: [
            {
                name: 'air-w5-fusion-glass-reference-program',
                hash: 9510504,
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 47,
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 14,
                    },
                    globals: {
                        blocks: [
                            { name: 'CCGlobal', defines: [], set: 0, binding: 0 },
                            { name: 'CCCamera', defines: [], set: 0, binding: 1 },
                        ],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                    locals: {
                        blocks: [{ name: 'CCLocal', defines: [], set: 2, binding: 0 }],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                },
                defines: [
                    { name: 'SHAPE_BOX', type: 'boolean' },
                    { name: 'USE_BLUR', type: 'boolean' },
                    { name: 'USE_ABERRATION', type: 'boolean' },
                ],
                attributes: [
                    { name: 'a_position', defines: [], format: 32, location: 0 },
                    { name: 'a_texCoord', defines: [], format: 21, location: 2 },
                ],
                blocks: [
                    {
                        name: 'Constants',
                        defines: [],
                        binding: 0,
                        stageFlags: 16,
                        members: [
                            { name: 'glass0', type: 16, count: 1 },
                            { name: 'glass1', type: 16, count: 1 },
                            { name: 'glass2', type: 16, count: 1 },
                            { name: 'glass3', type: 16, count: 1 },
                            { name: 'glass4', type: 16, count: 1 },
                            { name: 'glass5', type: 16, count: 1 },
                        ],
                    },
                ],
                samplerTextures: [
                    { name: 'childTexture', type: 28, count: 1, defines: [], stageFlags: 16, set: 1, binding: 1 },
                ],
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
                glsl1: {
                    vert: 'precision highp float;\nuniform highp mat4 cc_matView;\nuniform highp mat4 cc_matViewInv;\nuniform highp mat4 cc_matProj;\nuniform highp mat4 cc_matProjInv;\nuniform highp mat4 cc_matViewProj;\nuniform highp mat4 cc_matViewProjInv;\nuniform highp vec4 cc_cameraPos;\nuniform mediump vec4 cc_surfaceTransform;\nuniform mediump vec4 cc_screenScale;\nuniform mediump vec4 cc_exposure;\nuniform mediump vec4 cc_mainLitDir;\nuniform mediump vec4 cc_mainLitColor;\nuniform mediump vec4 cc_ambientSky;\nuniform mediump vec4 cc_ambientGround;\nuniform mediump vec4 cc_fogColor;\nuniform mediump vec4 cc_fogBase;\nuniform mediump vec4 cc_fogAdd;\nuniform mediump vec4 cc_nearFar;\nuniform mediump vec4 cc_viewPort;\nuniform highp mat4 cc_matWorld;\nuniform highp mat4 cc_matWorldIT;\nuniform highp vec4 cc_lightingMapUVParam;\nuniform highp vec4 cc_localShadowBias;\nattribute highp vec3 a_position;\nattribute mediump vec2 a_texCoord;\nvarying mediump vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);\n}',
                    frag: 'precision highp float; void main(){gl_FragColor=vec4(0.0);}',
                },
                glsl3: {
                    vert: 'precision highp float;\nuniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nuniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: "// E09 native adaptation of the pinned Glass helper's analytic + Vogel fallback path.\n// No Gaussian compute prepass, TypeGPU or external canvas. Child RT is premultiplied RGBA8.\nprecision highp float;\nprecision highp int;\nin highp vec2 v_uv;\nuniform Constants {\n    vec4 glass0; // scale, rotation degrees, refraction, transformed thickness\n    vec4 glass1; // blur, aberration, innerZoom, edgeSoftness\n    vec4 glass2; // lightAngle degrees, highlight, highlightSoftness, fresnel\n    vec4 glass3; // fresnelSoftness, tintIntensity, preserveLum flag, cutout flag\n    vec4 glass4; // linear tint rgb, diagnostic flag\n    vec4 glass5; // backing width, height, reserved\n};\nuniform sampler2D childTexture;\nout vec4 cc_FragColor;\nconst float PI_OVER_180 = 0.017453292519943295;\nfloat sdf(vec2 p) {\n#if SHAPE_BOX\n    vec2 q = abs(p) - vec2(0.24, 0.16);\n    return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - 0.04;\n#else\n    return length(p) - 0.3;\n#endif\n}\nvec4 unpremultiply(vec4 c) {\n    return vec4(c.a > 0.001 ? c.rgb / c.a : vec3(0.0), c.a);\n}\nvec4 sampleLens(vec2 uv) {\n#if USE_BLUR\n    vec4 sum = vec4(0.0);\n    for (int i = 0; i < 9; i++) {\n        float angle = float(i) * 2.39996322972865332;\n        float r = sqrt(float(i) / 9.0);\n        vec2 disk = vec2(cos(angle), sin(angle)) * r;\n        sum += texture(childTexture, uv + disk / glass5.xy * glass1.x * 2.0);\n    }\n    return sum / 9.0;\n#else\n    return texture(childTexture, uv);\n#endif\n}\nvec3 encode(vec3 c) {\n    return mix(1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,\n               12.92 * c, lessThanEqual(c, vec3(0.0031308)));\n}\nvoid main() {\n    float aspect = glass5.x / glass5.y;\n    float rotation = glass0.y * PI_OVER_180;\n    vec2 d = (v_uv - vec2(0.5)) * vec2(aspect, 1.0);\n    vec2 f = vec2(d.x * cos(rotation) + d.y * sin(rotation),\n                  d.y * cos(rotation) - d.x * sin(rotation)) / glass0.x;\n    float sRaw = sdf(f);\n    vec2 grad = vec2(sdf(f + vec2(0.01, 0.0)), sdf(f + vec2(0.0, 0.01))) - vec2(sRaw);\n    grad /= 0.01;\n    float s = sRaw / glass0.x;\n    float depthNorm = clamp(-s / max(glass0.w * 0.3, 0.005), 0.0, 1.0);\n    float refrStrength = (1.0 - depthNorm) * (1.0 - depthNorm);\n    float slopeScale = min(1.0, 12.0 / max(length(grad), 0.0001));\n    vec2 offset = -grad * slopeScale * glass0.z * 0.15 * refrStrength / vec2(aspect, 1.0);\n    vec2 lensUV = vec2(0.5) + (v_uv - vec2(0.5)) / glass1.z + offset;\n    vec4 lens;\n#if USE_ABERRATION\n    vec2 chr = offset * glass1.y * 0.06;\n    vec4 rc = sampleLens(lensUV + chr);\n    vec4 gc = sampleLens(lensUV);\n    vec4 bc = sampleLens(lensUV - chr);\n    lens = vec4(rc.r, gc.g, bc.b, gc.a);\n#else\n    lens = sampleLens(lensUV);\n#endif\n    lens = unpremultiply(lens);\n    vec4 base = unpremultiply(texture(childTexture, v_uv));\n    vec3 tinted = mix(lens.rgb, glass4.rgb, glass3.y);\n    if (glass3.z > 0.5) tinted *= dot(lens.rgb, vec3(0.299, 0.587, 0.114)) /\n                                  max(dot(tinted, vec3(0.299, 0.587, 0.114)), 0.0001);\n    float pxH = 1.0 / glass5.y;\n    float sharp = max(glass1.w * 0.5, 0.001);\n    float w1 = max(sharp * 0.03125, pxH * 1.5);\n    float rb1 = clamp(-s / w1, 0.0, 1.0);\n    float w2 = max(sharp * 0.0625, pxH * 1.5);\n    float rb2base = clamp(-(s - pxH) / w2, 0.0, 1.0) - clamp(-s / w2, 0.0, 1.0);\n    vec2 light = vec2(cos(glass2.x * PI_OVER_180), sin(glass2.x * PI_OVER_180));\n    float rb2 = rb2base * clamp(dot(grad, light) * 0.5 + 0.5, 0.0, 1.0) * glass2.y;\n    vec3 normal = normalize(vec3(grad, 2.0));\n    vec3 halfVector = vec3(light, 2.0) * 0.4472135954999579;\n    float specular = pow(clamp(dot(normal, halfVector), 0.0, 1.0), exp2(8.0 - glass2.z * 7.0)) * glass2.y * refrStrength;\n    float fresnelDepth = clamp(-s / max(glass3.x * 0.06, 0.001), 0.0, 1.0);\n    float rim = (1.0 - fresnelDepth) * (1.0 - fresnelDepth) * glass2.w * rb1;\n    vec4 lighting = vec4(tinted + vec3(rb2 + specular + rim), lens.a + rb2);\n    float transition = smoothstep(0.0, 1.0, rb1);\n    vec4 result = mix(base, lighting, transition);\n    result.a *= glass3.w > 0.5 ? transition : 1.0;\n    cc_FragColor = glass4.a > 0.5 ? result : vec4(encode(result.rgb), result.a);\n}\n",
                },
                glsl4: {
                    vert: 'precision highp float;\nlayout(set = 0, binding = 1) uniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nlayout(set = 2, binding = 0) uniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: "// E09 native adaptation of the pinned Glass helper's analytic + Vogel fallback path.\n// No Gaussian compute prepass, TypeGPU or external canvas. Child RT is premultiplied RGBA8.\nprecision highp float;\nprecision highp int;\nin highp vec2 v_uv;\nlayout(set = 1, binding = 0) uniform Constants {\n    vec4 glass0; // scale, rotation degrees, refraction, transformed thickness\n    vec4 glass1; // blur, aberration, innerZoom, edgeSoftness\n    vec4 glass2; // lightAngle degrees, highlight, highlightSoftness, fresnel\n    vec4 glass3; // fresnelSoftness, tintIntensity, preserveLum flag, cutout flag\n    vec4 glass4; // linear tint rgb, diagnostic flag\n    vec4 glass5; // backing width, height, reserved\n};\nlayout(set = 1, binding = 1) uniform sampler2D childTexture;\nout vec4 cc_FragColor;\nconst float PI_OVER_180 = 0.017453292519943295;\nfloat sdf(vec2 p) {\n#if SHAPE_BOX\n    vec2 q = abs(p) - vec2(0.24, 0.16);\n    return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - 0.04;\n#else\n    return length(p) - 0.3;\n#endif\n}\nvec4 unpremultiply(vec4 c) {\n    return vec4(c.a > 0.001 ? c.rgb / c.a : vec3(0.0), c.a);\n}\nvec4 sampleLens(vec2 uv) {\n#if USE_BLUR\n    vec4 sum = vec4(0.0);\n    for (int i = 0; i < 9; i++) {\n        float angle = float(i) * 2.39996322972865332;\n        float r = sqrt(float(i) / 9.0);\n        vec2 disk = vec2(cos(angle), sin(angle)) * r;\n        sum += texture(childTexture, uv + disk / glass5.xy * glass1.x * 2.0);\n    }\n    return sum / 9.0;\n#else\n    return texture(childTexture, uv);\n#endif\n}\nvec3 encode(vec3 c) {\n    return mix(1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,\n               12.92 * c, lessThanEqual(c, vec3(0.0031308)));\n}\nvoid main() {\n    float aspect = glass5.x / glass5.y;\n    float rotation = glass0.y * PI_OVER_180;\n    vec2 d = (v_uv - vec2(0.5)) * vec2(aspect, 1.0);\n    vec2 f = vec2(d.x * cos(rotation) + d.y * sin(rotation),\n                  d.y * cos(rotation) - d.x * sin(rotation)) / glass0.x;\n    float sRaw = sdf(f);\n    vec2 grad = vec2(sdf(f + vec2(0.01, 0.0)), sdf(f + vec2(0.0, 0.01))) - vec2(sRaw);\n    grad /= 0.01;\n    float s = sRaw / glass0.x;\n    float depthNorm = clamp(-s / max(glass0.w * 0.3, 0.005), 0.0, 1.0);\n    float refrStrength = (1.0 - depthNorm) * (1.0 - depthNorm);\n    float slopeScale = min(1.0, 12.0 / max(length(grad), 0.0001));\n    vec2 offset = -grad * slopeScale * glass0.z * 0.15 * refrStrength / vec2(aspect, 1.0);\n    vec2 lensUV = vec2(0.5) + (v_uv - vec2(0.5)) / glass1.z + offset;\n    vec4 lens;\n#if USE_ABERRATION\n    vec2 chr = offset * glass1.y * 0.06;\n    vec4 rc = sampleLens(lensUV + chr);\n    vec4 gc = sampleLens(lensUV);\n    vec4 bc = sampleLens(lensUV - chr);\n    lens = vec4(rc.r, gc.g, bc.b, gc.a);\n#else\n    lens = sampleLens(lensUV);\n#endif\n    lens = unpremultiply(lens);\n    vec4 base = unpremultiply(texture(childTexture, v_uv));\n    vec3 tinted = mix(lens.rgb, glass4.rgb, glass3.y);\n    if (glass3.z > 0.5) tinted *= dot(lens.rgb, vec3(0.299, 0.587, 0.114)) /\n                                  max(dot(tinted, vec3(0.299, 0.587, 0.114)), 0.0001);\n    float pxH = 1.0 / glass5.y;\n    float sharp = max(glass1.w * 0.5, 0.001);\n    float w1 = max(sharp * 0.03125, pxH * 1.5);\n    float rb1 = clamp(-s / w1, 0.0, 1.0);\n    float w2 = max(sharp * 0.0625, pxH * 1.5);\n    float rb2base = clamp(-(s - pxH) / w2, 0.0, 1.0) - clamp(-s / w2, 0.0, 1.0);\n    vec2 light = vec2(cos(glass2.x * PI_OVER_180), sin(glass2.x * PI_OVER_180));\n    float rb2 = rb2base * clamp(dot(grad, light) * 0.5 + 0.5, 0.0, 1.0) * glass2.y;\n    vec3 normal = normalize(vec3(grad, 2.0));\n    vec3 halfVector = vec3(light, 2.0) * 0.4472135954999579;\n    float specular = pow(clamp(dot(normal, halfVector), 0.0, 1.0), exp2(8.0 - glass2.z * 7.0)) * glass2.y * refrStrength;\n    float fresnelDepth = clamp(-s / max(glass3.x * 0.06, 0.001), 0.0, 1.0);\n    float rim = (1.0 - fresnelDepth) * (1.0 - fresnelDepth) * glass2.w * rb1;\n    vec4 lighting = vec4(tinted + vec3(rb2 + specular + rim), lens.a + rb2);\n    float transition = smoothstep(0.0, 1.0, rb1);\n    vec4 result = mix(base, lighting, transition);\n    result.a *= glass3.w > 0.5 ? transition : 1.0;\n    cc_FragColor = glass4.a > 0.5 ? result : vec4(encode(result.rgb), result.a);\n}\n",
                },
            },
        ],
        combinations: [],
        hideInEditor: false,
    },
    'glass:fused': {
        name: 'air-w5-fusion-glass-fused',
        techniques: [
            {
                passes: [
                    {
                        program: 'air-w5-fusion-glass-fused-program',
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: true, depthWrite: true },
                        blendState: { targets: [{ blend: false }] },
                        properties: {
                            glass0: { value: [0, 0, 0, 0] },
                            glass1: { value: [0, 0, 0, 0] },
                            glass2: { value: [0, 0, 0, 0] },
                            glass3: { value: [0, 0, 0, 0] },
                            glass4: { value: [0, 0, 0, 0] },
                            glass5: { value: [0, 0, 0, 0] },
                        },
                    },
                ],
            },
        ],
        shaders: [
            {
                name: 'air-w5-fusion-glass-fused-program',
                hash: 9510505,
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 47,
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 10,
                    },
                    globals: {
                        blocks: [
                            { name: 'CCGlobal', defines: [], set: 0, binding: 0 },
                            { name: 'CCCamera', defines: [], set: 0, binding: 1 },
                        ],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                    locals: {
                        blocks: [{ name: 'CCLocal', defines: [], set: 2, binding: 0 }],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                },
                defines: [
                    { name: 'SHAPE_BOX', type: 'boolean' },
                    { name: 'USE_BLUR', type: 'boolean' },
                    { name: 'USE_ABERRATION', type: 'boolean' },
                ],
                attributes: [
                    { name: 'a_position', defines: [], format: 32, location: 0 },
                    { name: 'a_texCoord', defines: [], format: 21, location: 2 },
                ],
                blocks: [
                    {
                        name: 'Constants',
                        defines: [],
                        binding: 0,
                        stageFlags: 16,
                        members: [
                            { name: 'glass0', type: 16, count: 1 },
                            { name: 'glass1', type: 16, count: 1 },
                            { name: 'glass2', type: 16, count: 1 },
                            { name: 'glass3', type: 16, count: 1 },
                            { name: 'glass4', type: 16, count: 1 },
                            { name: 'glass5', type: 16, count: 1 },
                        ],
                    },
                ],
                samplerTextures: [],
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
                glsl1: {
                    vert: 'precision highp float;\nuniform highp mat4 cc_matView;\nuniform highp mat4 cc_matViewInv;\nuniform highp mat4 cc_matProj;\nuniform highp mat4 cc_matProjInv;\nuniform highp mat4 cc_matViewProj;\nuniform highp mat4 cc_matViewProjInv;\nuniform highp vec4 cc_cameraPos;\nuniform mediump vec4 cc_surfaceTransform;\nuniform mediump vec4 cc_screenScale;\nuniform mediump vec4 cc_exposure;\nuniform mediump vec4 cc_mainLitDir;\nuniform mediump vec4 cc_mainLitColor;\nuniform mediump vec4 cc_ambientSky;\nuniform mediump vec4 cc_ambientGround;\nuniform mediump vec4 cc_fogColor;\nuniform mediump vec4 cc_fogBase;\nuniform mediump vec4 cc_fogAdd;\nuniform mediump vec4 cc_nearFar;\nuniform mediump vec4 cc_viewPort;\nuniform highp mat4 cc_matWorld;\nuniform highp mat4 cc_matWorldIT;\nuniform highp vec4 cc_lightingMapUVParam;\nuniform highp vec4 cc_localShadowBias;\nattribute highp vec3 a_position;\nattribute mediump vec2 a_texCoord;\nvarying mediump vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);\n}',
                    frag: 'precision highp float; void main(){gl_FragColor=vec4(0.0);}',
                },
                glsl3: {
                    vert: 'precision highp float;\nuniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nuniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: "// E09 native adaptation of the pinned Glass helper's analytic + Vogel fallback path.\n// No Gaussian compute prepass, TypeGPU or external canvas. Child RT is premultiplied RGBA8.\nprecision highp float;\nprecision highp int;\nin highp vec2 v_uv;\nuniform Constants {\n    vec4 glass0; // scale, rotation degrees, refraction, transformed thickness\n    vec4 glass1; // blur, aberration, innerZoom, edgeSoftness\n    vec4 glass2; // lightAngle degrees, highlight, highlightSoftness, fresnel\n    vec4 glass3; // fresnelSoftness, tintIntensity, preserveLum flag, cutout flag\n    vec4 glass4; // linear tint rgb, diagnostic flag\n    vec4 glass5; // backing width, height, reserved\n};\nvec4 storedPattern(vec2 coords) {\n    if (glass5.z > 0.5) return vec4(0.0);\n    vec2 uv = (clamp(floor(coords * 256.0), vec2(0.0), vec2(255.0)) + 0.5) / 256.0;\n    vec2 cell = floor(uv * 8.0);\n    float check = mod(cell.x + cell.y, 2.0) < 0.5 ? 0.35 : 0.65;\n    vec3 rgb = vec3(check + uv.x * 0.1, check * 0.8, check * 0.6);\n    float alpha = uv.x < 0.5 ? 1.0 : 0.5;\n    if (length(uv - vec2(0.75, 0.25)) < 0.08) { rgb = vec3(1.0, 0.437, 0.0); alpha = 0.0; }\n    if (length(uv - vec2(0.25, 0.75)) < 0.08) { rgb = vec3(0.9, 0.2, 0.5); alpha = 1.0; }\n    return floor(vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha) * 255.0 + 0.5) / 255.0;\n}\n\nout vec4 cc_FragColor;\nconst float PI_OVER_180 = 0.017453292519943295;\nfloat sdf(vec2 p) {\n#if SHAPE_BOX\n    vec2 q = abs(p) - vec2(0.24, 0.16);\n    return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - 0.04;\n#else\n    return length(p) - 0.3;\n#endif\n}\nvec4 unpremultiply(vec4 c) {\n    return vec4(c.a > 0.001 ? c.rgb / c.a : vec3(0.0), c.a);\n}\nvec4 sampleLens(vec2 uv) {\n#if USE_BLUR\n    vec4 sum = vec4(0.0);\n    for (int i = 0; i < 9; i++) {\n        float angle = float(i) * 2.39996322972865332;\n        float r = sqrt(float(i) / 9.0);\n        vec2 disk = vec2(cos(angle), sin(angle)) * r;\n        sum += storedPattern(uv + disk / glass5.xy * glass1.x * 2.0);\n    }\n    return sum / 9.0;\n#else\n    return storedPattern(uv);\n#endif\n}\nvec3 encode(vec3 c) {\n    return mix(1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,\n               12.92 * c, lessThanEqual(c, vec3(0.0031308)));\n}\nvoid main() {\n    float aspect = glass5.x / glass5.y;\n    float rotation = glass0.y * PI_OVER_180;\n    vec2 d = (v_uv - vec2(0.5)) * vec2(aspect, 1.0);\n    vec2 f = vec2(d.x * cos(rotation) + d.y * sin(rotation),\n                  d.y * cos(rotation) - d.x * sin(rotation)) / glass0.x;\n    float sRaw = sdf(f);\n    vec2 grad = vec2(sdf(f + vec2(0.01, 0.0)), sdf(f + vec2(0.0, 0.01))) - vec2(sRaw);\n    grad /= 0.01;\n    float s = sRaw / glass0.x;\n    float depthNorm = clamp(-s / max(glass0.w * 0.3, 0.005), 0.0, 1.0);\n    float refrStrength = (1.0 - depthNorm) * (1.0 - depthNorm);\n    float slopeScale = min(1.0, 12.0 / max(length(grad), 0.0001));\n    vec2 offset = -grad * slopeScale * glass0.z * 0.15 * refrStrength / vec2(aspect, 1.0);\n    vec2 lensUV = vec2(0.5) + (v_uv - vec2(0.5)) / glass1.z + offset;\n    vec4 lens;\n#if USE_ABERRATION\n    vec2 chr = offset * glass1.y * 0.06;\n    vec4 rc = sampleLens(lensUV + chr);\n    vec4 gc = sampleLens(lensUV);\n    vec4 bc = sampleLens(lensUV - chr);\n    lens = vec4(rc.r, gc.g, bc.b, gc.a);\n#else\n    lens = sampleLens(lensUV);\n#endif\n    lens = unpremultiply(lens);\n    vec4 base = unpremultiply(storedPattern(v_uv));\n    vec3 tinted = mix(lens.rgb, glass4.rgb, glass3.y);\n    if (glass3.z > 0.5) tinted *= dot(lens.rgb, vec3(0.299, 0.587, 0.114)) /\n                                  max(dot(tinted, vec3(0.299, 0.587, 0.114)), 0.0001);\n    float pxH = 1.0 / glass5.y;\n    float sharp = max(glass1.w * 0.5, 0.001);\n    float w1 = max(sharp * 0.03125, pxH * 1.5);\n    float rb1 = clamp(-s / w1, 0.0, 1.0);\n    float w2 = max(sharp * 0.0625, pxH * 1.5);\n    float rb2base = clamp(-(s - pxH) / w2, 0.0, 1.0) - clamp(-s / w2, 0.0, 1.0);\n    vec2 light = vec2(cos(glass2.x * PI_OVER_180), sin(glass2.x * PI_OVER_180));\n    float rb2 = rb2base * clamp(dot(grad, light) * 0.5 + 0.5, 0.0, 1.0) * glass2.y;\n    vec3 normal = normalize(vec3(grad, 2.0));\n    vec3 halfVector = vec3(light, 2.0) * 0.4472135954999579;\n    float specular = pow(clamp(dot(normal, halfVector), 0.0, 1.0), exp2(8.0 - glass2.z * 7.0)) * glass2.y * refrStrength;\n    float fresnelDepth = clamp(-s / max(glass3.x * 0.06, 0.001), 0.0, 1.0);\n    float rim = (1.0 - fresnelDepth) * (1.0 - fresnelDepth) * glass2.w * rb1;\n    vec4 lighting = vec4(tinted + vec3(rb2 + specular + rim), lens.a + rb2);\n    float transition = smoothstep(0.0, 1.0, rb1);\n    vec4 result = mix(base, lighting, transition);\n    result.a *= glass3.w > 0.5 ? transition : 1.0;\n    cc_FragColor = glass4.a > 0.5 ? result : vec4(encode(result.rgb), result.a);\n}\n",
                },
                glsl4: {
                    vert: 'precision highp float;\nlayout(set = 0, binding = 1) uniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nlayout(set = 2, binding = 0) uniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: "// E09 native adaptation of the pinned Glass helper's analytic + Vogel fallback path.\n// No Gaussian compute prepass, TypeGPU or external canvas. Child RT is premultiplied RGBA8.\nprecision highp float;\nprecision highp int;\nin highp vec2 v_uv;\nlayout(set = 1, binding = 0) uniform Constants {\n    vec4 glass0; // scale, rotation degrees, refraction, transformed thickness\n    vec4 glass1; // blur, aberration, innerZoom, edgeSoftness\n    vec4 glass2; // lightAngle degrees, highlight, highlightSoftness, fresnel\n    vec4 glass3; // fresnelSoftness, tintIntensity, preserveLum flag, cutout flag\n    vec4 glass4; // linear tint rgb, diagnostic flag\n    vec4 glass5; // backing width, height, reserved\n};\nvec4 storedPattern(vec2 coords) {\n    if (glass5.z > 0.5) return vec4(0.0);\n    vec2 uv = (clamp(floor(coords * 256.0), vec2(0.0), vec2(255.0)) + 0.5) / 256.0;\n    vec2 cell = floor(uv * 8.0);\n    float check = mod(cell.x + cell.y, 2.0) < 0.5 ? 0.35 : 0.65;\n    vec3 rgb = vec3(check + uv.x * 0.1, check * 0.8, check * 0.6);\n    float alpha = uv.x < 0.5 ? 1.0 : 0.5;\n    if (length(uv - vec2(0.75, 0.25)) < 0.08) { rgb = vec3(1.0, 0.437, 0.0); alpha = 0.0; }\n    if (length(uv - vec2(0.25, 0.75)) < 0.08) { rgb = vec3(0.9, 0.2, 0.5); alpha = 1.0; }\n    return floor(vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha) * 255.0 + 0.5) / 255.0;\n}\n\nout vec4 cc_FragColor;\nconst float PI_OVER_180 = 0.017453292519943295;\nfloat sdf(vec2 p) {\n#if SHAPE_BOX\n    vec2 q = abs(p) - vec2(0.24, 0.16);\n    return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - 0.04;\n#else\n    return length(p) - 0.3;\n#endif\n}\nvec4 unpremultiply(vec4 c) {\n    return vec4(c.a > 0.001 ? c.rgb / c.a : vec3(0.0), c.a);\n}\nvec4 sampleLens(vec2 uv) {\n#if USE_BLUR\n    vec4 sum = vec4(0.0);\n    for (int i = 0; i < 9; i++) {\n        float angle = float(i) * 2.39996322972865332;\n        float r = sqrt(float(i) / 9.0);\n        vec2 disk = vec2(cos(angle), sin(angle)) * r;\n        sum += storedPattern(uv + disk / glass5.xy * glass1.x * 2.0);\n    }\n    return sum / 9.0;\n#else\n    return storedPattern(uv);\n#endif\n}\nvec3 encode(vec3 c) {\n    return mix(1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055,\n               12.92 * c, lessThanEqual(c, vec3(0.0031308)));\n}\nvoid main() {\n    float aspect = glass5.x / glass5.y;\n    float rotation = glass0.y * PI_OVER_180;\n    vec2 d = (v_uv - vec2(0.5)) * vec2(aspect, 1.0);\n    vec2 f = vec2(d.x * cos(rotation) + d.y * sin(rotation),\n                  d.y * cos(rotation) - d.x * sin(rotation)) / glass0.x;\n    float sRaw = sdf(f);\n    vec2 grad = vec2(sdf(f + vec2(0.01, 0.0)), sdf(f + vec2(0.0, 0.01))) - vec2(sRaw);\n    grad /= 0.01;\n    float s = sRaw / glass0.x;\n    float depthNorm = clamp(-s / max(glass0.w * 0.3, 0.005), 0.0, 1.0);\n    float refrStrength = (1.0 - depthNorm) * (1.0 - depthNorm);\n    float slopeScale = min(1.0, 12.0 / max(length(grad), 0.0001));\n    vec2 offset = -grad * slopeScale * glass0.z * 0.15 * refrStrength / vec2(aspect, 1.0);\n    vec2 lensUV = vec2(0.5) + (v_uv - vec2(0.5)) / glass1.z + offset;\n    vec4 lens;\n#if USE_ABERRATION\n    vec2 chr = offset * glass1.y * 0.06;\n    vec4 rc = sampleLens(lensUV + chr);\n    vec4 gc = sampleLens(lensUV);\n    vec4 bc = sampleLens(lensUV - chr);\n    lens = vec4(rc.r, gc.g, bc.b, gc.a);\n#else\n    lens = sampleLens(lensUV);\n#endif\n    lens = unpremultiply(lens);\n    vec4 base = unpremultiply(storedPattern(v_uv));\n    vec3 tinted = mix(lens.rgb, glass4.rgb, glass3.y);\n    if (glass3.z > 0.5) tinted *= dot(lens.rgb, vec3(0.299, 0.587, 0.114)) /\n                                  max(dot(tinted, vec3(0.299, 0.587, 0.114)), 0.0001);\n    float pxH = 1.0 / glass5.y;\n    float sharp = max(glass1.w * 0.5, 0.001);\n    float w1 = max(sharp * 0.03125, pxH * 1.5);\n    float rb1 = clamp(-s / w1, 0.0, 1.0);\n    float w2 = max(sharp * 0.0625, pxH * 1.5);\n    float rb2base = clamp(-(s - pxH) / w2, 0.0, 1.0) - clamp(-s / w2, 0.0, 1.0);\n    vec2 light = vec2(cos(glass2.x * PI_OVER_180), sin(glass2.x * PI_OVER_180));\n    float rb2 = rb2base * clamp(dot(grad, light) * 0.5 + 0.5, 0.0, 1.0) * glass2.y;\n    vec3 normal = normalize(vec3(grad, 2.0));\n    vec3 halfVector = vec3(light, 2.0) * 0.4472135954999579;\n    float specular = pow(clamp(dot(normal, halfVector), 0.0, 1.0), exp2(8.0 - glass2.z * 7.0)) * glass2.y * refrStrength;\n    float fresnelDepth = clamp(-s / max(glass3.x * 0.06, 0.001), 0.0, 1.0);\n    float rim = (1.0 - fresnelDepth) * (1.0 - fresnelDepth) * glass2.w * rb1;\n    vec4 lighting = vec4(tinted + vec3(rb2 + specular + rim), lens.a + rb2);\n    float transition = smoothstep(0.0, 1.0, rb1);\n    vec4 result = mix(base, lighting, transition);\n    result.a *= glass3.w > 0.5 ? transition : 1.0;\n    cc_FragColor = glass4.a > 0.5 ? result : vec4(encode(result.rgb), result.a);\n}\n",
                },
            },
        ],
        combinations: [],
        hideInEditor: false,
    },
    'glass:pattern': {
        name: 'air-w5-fusion-glass-pattern',
        techniques: [
            {
                passes: [
                    {
                        program: 'air-w5-fusion-glass-pattern-program',
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: true, depthWrite: true },
                        blendState: { targets: [{ blend: false }] },
                        properties: { pattern0: { value: [0, 0, 0, 0] } },
                    },
                ],
            },
        ],
        shaders: [
            {
                name: 'air-w5-fusion-glass-pattern-program',
                hash: 9510506,
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 47,
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 5,
                    },
                    globals: {
                        blocks: [
                            { name: 'CCGlobal', defines: [], set: 0, binding: 0 },
                            { name: 'CCCamera', defines: [], set: 0, binding: 1 },
                        ],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                    locals: {
                        blocks: [{ name: 'CCLocal', defines: [], set: 2, binding: 0 }],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                },
                defines: [],
                attributes: [
                    { name: 'a_position', defines: [], format: 32, location: 0 },
                    { name: 'a_texCoord', defines: [], format: 21, location: 2 },
                ],
                blocks: [
                    {
                        name: 'Constants',
                        defines: [],
                        binding: 0,
                        stageFlags: 16,
                        members: [{ name: 'pattern0', type: 16, count: 1 }],
                    },
                ],
                samplerTextures: [],
                buffers: [],
                images: [],
                textures: [],
                samplers: [],
                subpassInputs: [],
                glsl1: {
                    vert: 'precision highp float;\nuniform highp mat4 cc_matView;\nuniform highp mat4 cc_matViewInv;\nuniform highp mat4 cc_matProj;\nuniform highp mat4 cc_matProjInv;\nuniform highp mat4 cc_matViewProj;\nuniform highp mat4 cc_matViewProjInv;\nuniform highp vec4 cc_cameraPos;\nuniform mediump vec4 cc_surfaceTransform;\nuniform mediump vec4 cc_screenScale;\nuniform mediump vec4 cc_exposure;\nuniform mediump vec4 cc_mainLitDir;\nuniform mediump vec4 cc_mainLitColor;\nuniform mediump vec4 cc_ambientSky;\nuniform mediump vec4 cc_ambientGround;\nuniform mediump vec4 cc_fogColor;\nuniform mediump vec4 cc_fogBase;\nuniform mediump vec4 cc_fogAdd;\nuniform mediump vec4 cc_nearFar;\nuniform mediump vec4 cc_viewPort;\nuniform highp mat4 cc_matWorld;\nuniform highp mat4 cc_matWorldIT;\nuniform highp vec4 cc_lightingMapUVParam;\nuniform highp vec4 cc_localShadowBias;\nattribute highp vec3 a_position;\nattribute mediump vec2 a_texCoord;\nvarying mediump vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);\n}',
                    frag: 'precision highp float; void main(){gl_FragColor=vec4(0.0);}',
                },
                glsl3: {
                    vert: 'precision highp float;\nuniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nuniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: '// E09 deterministic child source pattern. Renders PREMULTIPLIED output into the child render\n// target over a transparent clear (the canonical RTT convention the glass shader inverts).\n// Contents: 8x8 checker with a u-gradient (UV-direction anchors), opaque left half, exactly\n// 0.5-alpha right half (no-double-premultiply probe), an alpha-0 disc with hidden non-zero RGB\n// (premultiply storage zeroes it; the unpremultiply guard must yield 0 with no NaN), an opaque\n// anchor disc, and a fully transparent "blank" mode.\nprecision highp float;\nin highp vec2 v_uv;\nuniform Constants {\n    vec4 pattern0;  // sourceKind(0=standard,1=blank), unused, unused, unused\n};\nout vec4 cc_FragColor;\nvoid main() {\n    if (pattern0.x > 0.5) {\n        cc_FragColor = vec4(0.0, 0.0, 0.0, 0.0);\n        return;\n    }\n    vec2 cell = floor(v_uv * 8.0);\n    float check = mod(cell.x + cell.y, 2.0) < 0.5 ? 0.35 : 0.65;\n    vec3 rgb = vec3(check, check * 0.8, check * 0.6);\n    rgb.r += v_uv.x * 0.1;\n    float alpha = v_uv.x < 0.5 ? 1.0 : 0.5;\n    if (length(v_uv - vec2(0.75, 0.25)) < 0.08) {\n        rgb = vec3(1.0, 0.437, 0.0);\n        alpha = 0.0;\n    }\n    if (length(v_uv - vec2(0.25, 0.75)) < 0.08) {\n        rgb = vec3(0.9, 0.2, 0.5);\n        alpha = 1.0;\n    }\n    cc_FragColor = vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha);\n}\n',
                },
                glsl4: {
                    vert: 'precision highp float;\nlayout(set = 0, binding = 1) uniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nlayout(set = 2, binding = 0) uniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main () {\n  v_uv = a_texCoord;\n  gl_Position = vec4(a_position.xy, 0.0, 1.0);\n}',
                    frag: '// E09 deterministic child source pattern. Renders PREMULTIPLIED output into the child render\n// target over a transparent clear (the canonical RTT convention the glass shader inverts).\n// Contents: 8x8 checker with a u-gradient (UV-direction anchors), opaque left half, exactly\n// 0.5-alpha right half (no-double-premultiply probe), an alpha-0 disc with hidden non-zero RGB\n// (premultiply storage zeroes it; the unpremultiply guard must yield 0 with no NaN), an opaque\n// anchor disc, and a fully transparent "blank" mode.\nprecision highp float;\nin highp vec2 v_uv;\nlayout(set = 1, binding = 0) uniform Constants {\n    vec4 pattern0;  // sourceKind(0=standard,1=blank), unused, unused, unused\n};\nout vec4 cc_FragColor;\nvoid main() {\n    if (pattern0.x > 0.5) {\n        cc_FragColor = vec4(0.0, 0.0, 0.0, 0.0);\n        return;\n    }\n    vec2 cell = floor(v_uv * 8.0);\n    float check = mod(cell.x + cell.y, 2.0) < 0.5 ? 0.35 : 0.65;\n    vec3 rgb = vec3(check, check * 0.8, check * 0.6);\n    rgb.r += v_uv.x * 0.1;\n    float alpha = v_uv.x < 0.5 ? 1.0 : 0.5;\n    if (length(v_uv - vec2(0.75, 0.25)) < 0.08) {\n        rgb = vec3(1.0, 0.437, 0.0);\n        alpha = 0.0;\n    }\n    if (length(v_uv - vec2(0.25, 0.75)) < 0.08) {\n        rgb = vec3(0.9, 0.2, 0.5);\n        alpha = 1.0;\n    }\n    cc_FragColor = vec4(clamp(rgb, 0.0, 1.0) * alpha, alpha);\n}\n',
                },
            },
        ],
        combinations: [],
        hideInEditor: false,
    },
};
export const parameterDefinitions = {
    emboss: {
        schemaVersion: 'shaders-effect-contract/1',
        name: 'emboss',
        version: '1.0.0',
        params: {
            shape: {
                type: 'string',
                defaultValue: 'circle',
                enum: ['circle', 'rounded-box'],
                updateMode: 'structure',
                description: 'Analytic 2D SDF shape: circle or rounded box. Switching recompiles the effect variant.',
            },
            scale: {
                type: 'number',
                defaultValue: 1,
                min: 0.4,
                max: 2,
                step: 0.01,
                unit: 'multiplier',
                updateMode: 'uniform',
                description: 'Uniform shape scale in the rotated field space.',
            },
            rotation: {
                type: 'number',
                defaultValue: 0,
                min: 0,
                max: 360,
                step: 1,
                unit: 'degree',
                updateMode: 'uniform',
                description: 'Rigid in-plane rotation of the field; zero is identity.',
            },
            depth: {
                type: 'number',
                defaultValue: -0.5,
                min: -1,
                max: 1,
                step: 0.01,
                unit: 'signed relief',
                updateMode: 'uniform',
                description:
                    'Signed relief depth; negative is inset (debossed), positive is raised (embossed). Zero is an exact child passthrough including alpha.',
            },
            lightAngle: {
                type: 'number',
                defaultValue: 260,
                min: 0,
                max: 360,
                step: 1,
                unit: 'degree',
                updateMode: 'uniform',
                description:
                    'Directional light azimuth for edge lighting and the cast-shadow trace; the z component stays fixed at 0.7.',
            },
            lightIntensity: {
                type: 'number',
                defaultValue: 0.6,
                min: 0,
                max: 2,
                step: 0.01,
                unit: 'linear gain',
                updateMode: 'uniform',
                description:
                    'Strength of directional edge highlights and shadows; zero removes edge lighting entirely.',
            },
            shadowIntensity: {
                type: 'number',
                defaultValue: 0.3,
                min: 0,
                max: 1,
                step: 0.01,
                unit: 'ratio',
                updateMode: 'uniform',
                description: 'Darkness of the relief cast shadow; zero removes the shadow layer.',
            },
            sourceKind: {
                type: 'string',
                defaultValue: 'standard',
                enum: ['standard', 'blank'],
                updateMode: 'uniform',
                description:
                    'Deterministic child source pattern; blank renders a fully transparent child (alpha-0 NaN guard).',
            },
        },
    },
    glass: {
        schemaVersion: 'effect-parameters/1',
        name: 'Glass',
        version: '1.0.0',
        params: {
            shape: {
                type: 'string',
                defaultValue: 'circle',
                enum: ['circle', 'rounded-box'],
                description: 'Two analytic shapes; no volumetric/SDF texture platform',
                unit: 'unitless',
                updateMode: 'variant-or-uniform',
            },
            scale: {
                type: 'number',
                defaultValue: 1,
                min: 0.1,
                max: 3,
                unit: 'unitless',
                description: 'scale',
                updateMode: 'uniform',
                step: 0.01,
            },
            rotation: {
                type: 'number',
                defaultValue: 0,
                min: 0,
                max: 360,
                unit: 'degree',
                description: 'rotation',
                updateMode: 'uniform',
                step: 0.01,
            },
            refraction: {
                type: 'number',
                defaultValue: 1,
                min: 0,
                max: 2,
                unit: 'unitless',
                description: 'refraction',
                updateMode: 'uniform',
                step: 0.01,
            },
            thickness: {
                type: 'number',
                defaultValue: 0.5,
                min: 0,
                max: 1,
                unit: 'unitless',
                description: 'thickness',
                updateMode: 'uniform',
                step: 0.01,
            },
            blur: {
                type: 'number',
                defaultValue: 0,
                min: 0,
                max: 20,
                description: 'Native nine-tap Vogel fallback, not Gaussian compute prepass',
                unit: 'unitless',
                updateMode: 'variant-or-uniform',
                step: 0.01,
            },
            aberration: {
                type: 'number',
                defaultValue: 0.5,
                min: 0,
                max: 1,
                unit: 'unitless',
                description: 'aberration',
                updateMode: 'variant-or-uniform',
                step: 0.01,
            },
            innerZoom: {
                type: 'number',
                defaultValue: 1,
                min: 0.5,
                max: 3,
                unit: 'unitless',
                description: 'innerZoom',
                updateMode: 'uniform',
                step: 0.01,
            },
            edgeSoftness: {
                type: 'number',
                defaultValue: 0.1,
                min: 0,
                max: 1,
                unit: 'unitless',
                description: 'edgeSoftness',
                updateMode: 'uniform',
                step: 0.01,
            },
            lightAngle: {
                type: 'number',
                defaultValue: 300,
                min: 0,
                max: 360,
                unit: 'degree',
                description: 'lightAngle',
                updateMode: 'uniform',
                step: 0.01,
            },
            highlight: {
                type: 'number',
                defaultValue: 0.05,
                min: 0,
                max: 1,
                unit: 'unitless',
                description: 'highlight',
                updateMode: 'uniform',
                step: 0.01,
            },
            highlightSoftness: {
                type: 'number',
                defaultValue: 0.5,
                min: 0,
                max: 1,
                unit: 'unitless',
                description: 'highlightSoftness',
                updateMode: 'uniform',
                step: 0.01,
            },
            fresnel: {
                type: 'number',
                defaultValue: 0.2,
                min: 0,
                max: 1,
                unit: 'unitless',
                description: 'fresnel',
                updateMode: 'uniform',
                step: 0.01,
            },
            fresnelSoftness: {
                type: 'number',
                defaultValue: 0.5,
                min: 0,
                max: 1,
                unit: 'unitless',
                description: 'fresnelSoftness',
                updateMode: 'uniform',
                step: 0.01,
            },
            tintIntensity: {
                type: 'number',
                defaultValue: 0,
                min: 0,
                max: 1,
                unit: 'unitless',
                description: 'tintIntensity',
                updateMode: 'uniform',
                step: 0.01,
            },
            tintPreserveLuminosity: {
                type: 'number',
                defaultValue: 1,
                min: 0,
                max: 1,
                description: 'Scalar flag: enabled iff > 0.5',
                unit: 'unitless',
                updateMode: 'uniform',
                step: 0.01,
            },
            tintColor: {
                type: 'string',
                defaultValue: '#ffffff',
                unit: 'hex-rgb',
                description: 'tintColor',
                updateMode: 'uniform',
            },
            cutout: {
                type: 'string',
                defaultValue: 'none',
                enum: ['none', 'shape'],
                unit: 'unitless',
                description: 'cutout',
                updateMode: 'uniform',
            },
            sourceKind: {
                type: 'string',
                defaultValue: 'standard',
                enum: ['standard', 'blank'],
                unit: 'unitless',
                description: 'sourceKind',
                updateMode: 'uniform',
            },
        },
    },
};
