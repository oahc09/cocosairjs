// Generated from noise.frag and generate-effects.mjs; retain THIRD_PARTY_NOTICES.txt.
export const effectDefinition = {
    name: 'shader-noise-dissolve',
    techniques: [
        {
            passes: [
                {
                    program: 'shader-noise-dissolve|7dee7725447adb22',
                    rasterizerState: {
                        cullMode: 0,
                    },
                    depthStencilState: {
                        depthTest: false,
                        depthWrite: false,
                    },
                    blendState: {
                        targets: [
                            {
                                blend: false,
                            },
                        ],
                    },
                    properties: {
                        params: {
                            type: 16,
                            value: [0.5, 3, 0.25, 0],
                        },
                        geometry: {
                            type: 16,
                            value: [1, 0, 0, 0],
                        },
                        sourceTexture: {
                            type: 28,
                            value: 'white',
                        },
                    },
                },
            ],
        },
    ],
    shaders: [
        {
            name: 'shader-noise-dissolve|7dee7725447adb22',
            hash: 2112780069,
            builtins: {
                statistics: {
                    CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 49,
                    CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 6,
                },
                globals: {
                    blocks: [
                        {
                            name: 'CCGlobal',
                            defines: [],
                            set: 0,
                            binding: 0,
                        },
                        {
                            name: 'CCCamera',
                            defines: [],
                            set: 0,
                            binding: 1,
                        },
                    ],
                    samplerTextures: [],
                    buffers: [],
                    images: [],
                },
                locals: {
                    blocks: [
                        {
                            name: 'CCLocal',
                            defines: [],
                            set: 2,
                            binding: 0,
                        },
                    ],
                    samplerTextures: [],
                    buffers: [],
                    images: [],
                },
            },
            defines: [],
            attributes: [
                {
                    name: 'a_position',
                    defines: [],
                    format: 32,
                    location: 0,
                },
                {
                    name: 'a_texCoord',
                    defines: [],
                    format: 21,
                    location: 2,
                },
            ],
            blocks: [
                {
                    name: 'Constants',
                    defines: [],
                    binding: 0,
                    stageFlags: 17,
                    members: [
                        {
                            name: 'params',
                            type: 16,
                            count: 1,
                        },
                        {
                            name: 'geometry',
                            type: 16,
                            count: 1,
                        },
                    ],
                },
            ],
            samplerTextures: [
                {
                    name: 'sourceTexture',
                    type: 28,
                    count: 1,
                    defines: [],
                    stageFlags: 16,
                    set: 1,
                    binding: 1,
                },
            ],
            buffers: [],
            images: [],
            textures: [],
            samplers: [],
            subpassInputs: [],
            glsl4: {
                vert: 'precision highp float;\nlayout(set = 0, binding = 1) uniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nlayout(set = 2, binding = 0) uniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nlayout(set = 1, binding = 0) uniform Constants {\n  vec4 params;\n  vec4 geometry;\n};\nlayout(location = 0) in vec3 a_position;\nlayout(location = 2) in vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main(){ v_uv=a_texCoord; gl_Position=vec4(a_position,1.0); }',
                frag: 'precision highp float;\nlayout(set = 0, binding = 0) uniform CCGlobal {\n  highp   vec4 cc_time;\n  mediump vec4 cc_screenSize;\n  mediump vec4 cc_nativeSize;\n  mediump vec4 cc_debug_view_mode;\n};\nlayout(set = 1, binding = 0) uniform Constants {\n  vec4 params;\n  vec4 geometry;\n};\nlayout(set = 1, binding = 1) uniform sampler2D sourceTexture;\nin highp vec2 v_uv;\nlayout(location = 0) out vec4 cc_FragColor;\n// Modified GLSL port, 2026-10-09: MaterialX/OSL 2D gradient/hash only.\n// Copyright (c) 2009-2010 Sony Pictures Imageworks Inc., et al.\n// SPDX-License-Identifier: BSD-3-Clause\n// MaterialX modifications: conservatively retain Apache-2.0; shader-effects port MIT.\n// Full notices accompany this example in THIRD_PARTY_NOTICES.txt; not Fi-hash.\nuint rotate32(uint x, uint k) { return (x << k) | (x >> (32u-k)); }\nuint latticeHash(ivec2 xy) {\n    uint origin=0xdeadbeefu+8u+13u;\n    uint a=origin+uint(xy.x), b=origin+uint(xy.y), c=origin;\n    c^=b; c-=rotate32(b,14u); a^=c; a-=rotate32(c,11u);\n    b^=a; b-=rotate32(a,25u); c^=b; c-=rotate32(b,16u);\n    a^=c; a-=rotate32(c,4u); b^=a; b-=rotate32(a,14u);\n    c^=b; c-=rotate32(b,24u); return c;\n}\nfloat gradient(ivec2 xy, vec2 delta) {\n    uint h=latticeHash(xy)&7u;\n    float a=h<4u?delta.x:delta.y;\n    float b=2.0*(h<4u?delta.y:delta.x);\n    return ((h&1u)!=0u?-a:a)+((h&2u)!=0u?-b:b);\n}\nfloat perlin(vec2 p) {\n    ivec2 cell=ivec2(floor(p)); vec2 f=fract(p);\n    vec2 q=f*f*f*(f*(f*6.0-15.0)+10.0);\n    float a=gradient(cell,f),b=gradient(cell+ivec2(1,0),f-vec2(1,0));\n    float c=gradient(cell+ivec2(0,1),f-vec2(0,1)),d=gradient(cell+ivec2(1,1),f-vec2(1,1));\n    return 0.6616*mix(mix(a,b,q.x),mix(c,d,q.x),q.y);\n}\nfloat coverage(vec2 uv) {\n    vec2 p=vec2(uv.x*geometry.x*params.y+params.w*13.7,uv.y*params.y+params.w*7.9);\n    float a=perlin(p),b=perlin(p*2.0+vec2(17.3+params.w*3.1,9.1));\n    float c=perlin(p*4.0+vec2(41.7,27.9+params.w*5.3));\n    return clamp(0.5+0.9*(a+0.5*b+0.25*c)/1.75,0.0,1.0);\n}\nvoid main() {\n    vec2 uv=vec2(v_uv.x,1.0-v_uv.y); // visual top y=0, independent of source upload orientation\n    float check=mod(floor(uv.x*16.0)+floor(uv.y*16.0),2.0);\n    if (geometry.z>2.5) { cc_FragColor=vec4(vec3(mix(0.125490196,0.250980392,check)),1.0); return; }\n    vec4 color=texture(sourceTexture,uv); float c=coverage(uv);\n    if (geometry.y>0.5) c=1.0-c;\n    float mask;\n    if(params.x<=0.0) mask=1.0;\n    else if(params.x>=1.0) mask=0.0;\n    else if(params.z==0.0) mask=step(params.x,c);\n    else { float f=max(params.z,0.0001);float front=params.x*(1.0+2.0*f)-f;mask=smoothstep(front-f,front+f,c); }\n    if (geometry.z>1.5) cc_FragColor=vec4(color.rgb,color.a*mask); // diagnostic straight-alpha output\n    else if (geometry.z>0.5) cc_FragColor=vec4(c,mask,color.a*mask,1.0);\n    else cc_FragColor=vec4(color.rgb,color.a*mask); // only alpha changes\n}',
            },
            glsl3: {
                vert: 'precision highp float;\nuniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nuniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nuniform Constants {\n  vec4 params;\n  vec4 geometry;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main(){ v_uv=a_texCoord; gl_Position=vec4(a_position,1.0); }',
                frag: 'precision highp float;\nuniform CCGlobal {\n  highp   vec4 cc_time;\n  mediump vec4 cc_screenSize;\n  mediump vec4 cc_nativeSize;\n  mediump vec4 cc_debug_view_mode;\n};\nuniform Constants {\n  vec4 params;\n  vec4 geometry;\n};\nuniform sampler2D sourceTexture;\nin highp vec2 v_uv;\nout vec4 cc_FragColor;\n// Modified GLSL port, 2026-10-09: MaterialX/OSL 2D gradient/hash only.\n// Copyright (c) 2009-2010 Sony Pictures Imageworks Inc., et al.\n// SPDX-License-Identifier: BSD-3-Clause\n// MaterialX modifications: conservatively retain Apache-2.0; shader-effects port MIT.\n// Full notices accompany this example in THIRD_PARTY_NOTICES.txt; not Fi-hash.\nuint rotate32(uint x, uint k) { return (x << k) | (x >> (32u-k)); }\nuint latticeHash(ivec2 xy) {\n    uint origin=0xdeadbeefu+8u+13u;\n    uint a=origin+uint(xy.x), b=origin+uint(xy.y), c=origin;\n    c^=b; c-=rotate32(b,14u); a^=c; a-=rotate32(c,11u);\n    b^=a; b-=rotate32(a,25u); c^=b; c-=rotate32(b,16u);\n    a^=c; a-=rotate32(c,4u); b^=a; b-=rotate32(a,14u);\n    c^=b; c-=rotate32(b,24u); return c;\n}\nfloat gradient(ivec2 xy, vec2 delta) {\n    uint h=latticeHash(xy)&7u;\n    float a=h<4u?delta.x:delta.y;\n    float b=2.0*(h<4u?delta.y:delta.x);\n    return ((h&1u)!=0u?-a:a)+((h&2u)!=0u?-b:b);\n}\nfloat perlin(vec2 p) {\n    ivec2 cell=ivec2(floor(p)); vec2 f=fract(p);\n    vec2 q=f*f*f*(f*(f*6.0-15.0)+10.0);\n    float a=gradient(cell,f),b=gradient(cell+ivec2(1,0),f-vec2(1,0));\n    float c=gradient(cell+ivec2(0,1),f-vec2(0,1)),d=gradient(cell+ivec2(1,1),f-vec2(1,1));\n    return 0.6616*mix(mix(a,b,q.x),mix(c,d,q.x),q.y);\n}\nfloat coverage(vec2 uv) {\n    vec2 p=vec2(uv.x*geometry.x*params.y+params.w*13.7,uv.y*params.y+params.w*7.9);\n    float a=perlin(p),b=perlin(p*2.0+vec2(17.3+params.w*3.1,9.1));\n    float c=perlin(p*4.0+vec2(41.7,27.9+params.w*5.3));\n    return clamp(0.5+0.9*(a+0.5*b+0.25*c)/1.75,0.0,1.0);\n}\nvoid main() {\n    vec2 uv=vec2(v_uv.x,1.0-v_uv.y); // visual top y=0, independent of source upload orientation\n    float check=mod(floor(uv.x*16.0)+floor(uv.y*16.0),2.0);\n    if (geometry.z>2.5) { cc_FragColor=vec4(vec3(mix(0.125490196,0.250980392,check)),1.0); return; }\n    vec4 color=texture(sourceTexture,uv); float c=coverage(uv);\n    if (geometry.y>0.5) c=1.0-c;\n    float mask;\n    if(params.x<=0.0) mask=1.0;\n    else if(params.x>=1.0) mask=0.0;\n    else if(params.z==0.0) mask=step(params.x,c);\n    else { float f=max(params.z,0.0001);float front=params.x*(1.0+2.0*f)-f;mask=smoothstep(front-f,front+f,c); }\n    if (geometry.z>1.5) cc_FragColor=vec4(color.rgb,color.a*mask); // diagnostic straight-alpha output\n    else if (geometry.z>0.5) cc_FragColor=vec4(c,mask,color.a*mask,1.0);\n    else cc_FragColor=vec4(color.rgb,color.a*mask); // only alpha changes\n}',
            },
        },
    ],
    combinations: [],
    hideInEditor: false,
} as const;
