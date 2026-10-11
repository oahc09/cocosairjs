// Generated from example-local GLSL; GPU compilation is separately measured.
export const effectDefinition = {
    name: 'air-e06-sparkle-zero',
    techniques: [
        {
            passes: [
                {
                    program: 'air-e06-sparkle-zero|78d920adc454c938',
                    rasterizerState: {
                        cullMode: 0,
                    },
                    depthStencilState: {
                        depthTest: true,
                        depthWrite: true,
                    },
                    blendState: {
                        targets: [
                            {
                                blend: false,
                            },
                        ],
                    },
                    properties: {
                        sparkle0: {
                            type: 16,
                            value: [0, 0, 0, 0],
                        },
                        sparkle1: {
                            type: 16,
                            value: [0, 0, 0, 0],
                        },
                        sparkle2: {
                            type: 16,
                            value: [0, 0, 0, 0],
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
            name: 'air-e06-sparkle-zero|78d920adc454c938',
            hash: 2027495597,
            builtins: {
                statistics: {
                    CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 50,
                    CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 7,
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
                    location: 1,
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
                            name: 'sparkle0',
                            type: 16,
                            count: 1,
                        },
                        {
                            name: 'sparkle1',
                            type: 16,
                            count: 1,
                        },
                        {
                            name: 'sparkle2',
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
                vert: 'precision highp float;\nlayout(set = 0, binding = 1) uniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nlayout(set = 2, binding = 0) uniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nlayout(set = 1, binding = 0) uniform Constants {\n  vec4 sparkle0;\n  vec4 sparkle1;\n  vec4 sparkle2;\n};\nlayout(location = 0) in vec3 a_position;\nlayout(location = 1) in vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main(){gl_Position=vec4(a_position.xy,0.0,1.0);v_uv=a_texCoord;}',
                frag: 'precision highp float;\nlayout(set = 0, binding = 0) uniform CCGlobal {\n  highp   vec4 cc_time;\n  mediump vec4 cc_screenSize;\n  mediump vec4 cc_nativeSize;\n  mediump vec4 cc_debug_view_mode;\n};\nlayout(set = 1, binding = 0) uniform Constants {\n  vec4 sparkle0;\n  vec4 sparkle1;\n  vec4 sparkle2;\n};\nlayout(set = 1, binding = 1) uniform sampler2D sourceTexture;\nin highp vec2 v_uv;\nlayout(location = 0) out vec4 cc_FragColor;\nprecision highp int;\r\n// Algorithm semantics: shader-effects-inc/shaders Sparkle dbfd42a (MIT).\r\n// Independent uint hash: not derived from Fi / upstream noise.hash32.\r\nfloat decode1(float x){return x<=0.04045?x/12.92:pow((x+0.055)/1.055,2.4);}\r\nvec3 decodeRGB(vec3 x){return vec3(decode1(x.r),decode1(x.g),decode1(x.b));}\r\nfloat encode1(float x){x=max(x,0.0);return x<=0.0031308?12.92*x:1.055*pow(x,1.0/2.4)-0.055;}\r\nvec3 encodeRGB(vec3 x){return vec3(encode1(x.r),encode1(x.g),encode1(x.b));}\r\nuint cellHash(ivec2 cell,uint salt){uint h=uint(cell.x)*1664525u+uint(cell.y)*1013904223u+salt*69069u+362437u;h=h^(h>>13u);h=h*1103515245u;return h^(h>>17u);}\r\nvec3 randomCell(ivec2 cell,uint salt){return vec3(float(cellHash(cell,salt)&65535u),float(cellHash(cell,salt+17u)&65535u),float(cellHash(cell,salt+53u)&65535u))/65535.0;}\r\nvec4 straightAt(vec2 uv){vec4 s=texture(sourceTexture,clamp(uv,vec2(0.0),vec2(1.0)));return vec4(decodeRGB(s.rgb),s.a);}\r\nfloat weightedLuma(vec4 s){return dot(s.rgb,vec3(0.2126,0.7152,0.0722))*s.a;}\r\nvec4 brightest(vec2 uv,float angle){vec4 best=straightAt(uv);float luma=weightedLuma(best);if(false){for(int i=0;i<4;i++){float a=angle+float(i)*1.5707963267948966;vec4 candidate=straightAt(uv+vec2(cos(a),sin(a))*sparkle0.w/sparkle2.xy);float lum=weightedLuma(candidate);if(lum>luma){best=candidate;luma=lum;}}}return best;}\r\nfloat star(vec2 o,float reach){vec2 a=abs(o);float core=exp(-dot(o,o)*0.9);float lengthRate=0.45/max(sparkle1.x,0.01);float rays=exp(-a.x*1.6-a.y*lengthRate)+exp(-a.y*1.6-a.x*lengthRate);return (core+0.25*rays)*(1.0-smoothstep(reach*0.6,reach,max(a.x,a.y)));}\r\nvoid main(){vec2 px=v_uv*sparkle2.xy;vec4 child=straightAt(v_uv);vec3 glow=vec3(0.0);\r\nif(sparkle0.y>0.0){for(int layer=0;layer<2;layer++){float cellSize=sparkle0.x*(layer==0?1.0:0.6666666666666667);ivec2 base=ivec2(floor(px/cellSize-0.5));uint salt=uint(floor((sparkle1.w+float(layer)*0.31)*4096.0));for(int dy=0;dy<2;dy++){for(int dx=0;dx<2;dx++){ivec2 cell=base+ivec2(dx,dy);vec3 r=randomCell(cell,salt);vec2 point=(vec2(cell)+0.5+(r.xy-0.5)*0.6)*cellSize;vec4 source=brightest(point/sparkle2.xy,float(layer)*0.7853981633974483);float presence=smoothstep(sparkle0.z,sparkle0.z+0.12,sqrt(max(weightedLuma(source),0.0)));float blink=max(sin(sparkle2.z*(0.8+r.z*1.2)+r.x*6.283185307179586),0.0);blink*=blink;blink*=blink;blink*=blink;float level=0.35+0.65*step(0.45,r.z);float lum=dot(source.rgb,vec3(0.2126,0.7152,0.0722));vec3 tint=mix(vec3(1.0),source.rgb/max(lum,0.001)*0.6,sparkle1.y);glow+=tint*star(px-point,cellSize*0.5)*blink*presence*level*sparkle0.y;}}}}\r\n// The composable effect is linear associated RGBA; diagnostic RT bypasses OETF.\r\nfloat alpha=min(child.a+max(glow.r,max(glow.g,glow.b)),1.0);vec3 associated=child.rgb*child.a+glow;\r\nif(sparkle2.w>0.5){cc_FragColor=vec4(associated,alpha);}else{cc_FragColor=vec4(alpha>0.0?encodeRGB(associated/alpha)*alpha:vec3(0.0),alpha);}}',
            },
            glsl3: {
                vert: 'precision highp float;\nuniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nuniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nuniform Constants {\n  vec4 sparkle0;\n  vec4 sparkle1;\n  vec4 sparkle2;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main(){gl_Position=vec4(a_position.xy,0.0,1.0);v_uv=a_texCoord;}',
                frag: 'precision highp float;\nuniform CCGlobal {\n  highp   vec4 cc_time;\n  mediump vec4 cc_screenSize;\n  mediump vec4 cc_nativeSize;\n  mediump vec4 cc_debug_view_mode;\n};\nuniform Constants {\n  vec4 sparkle0;\n  vec4 sparkle1;\n  vec4 sparkle2;\n};\nuniform sampler2D sourceTexture;\nin highp vec2 v_uv;\nout vec4 cc_FragColor;\nprecision highp int;\r\n// Algorithm semantics: shader-effects-inc/shaders Sparkle dbfd42a (MIT).\r\n// Independent uint hash: not derived from Fi / upstream noise.hash32.\r\nfloat decode1(float x){return x<=0.04045?x/12.92:pow((x+0.055)/1.055,2.4);}\r\nvec3 decodeRGB(vec3 x){return vec3(decode1(x.r),decode1(x.g),decode1(x.b));}\r\nfloat encode1(float x){x=max(x,0.0);return x<=0.0031308?12.92*x:1.055*pow(x,1.0/2.4)-0.055;}\r\nvec3 encodeRGB(vec3 x){return vec3(encode1(x.r),encode1(x.g),encode1(x.b));}\r\nuint cellHash(ivec2 cell,uint salt){uint h=uint(cell.x)*1664525u+uint(cell.y)*1013904223u+salt*69069u+362437u;h=h^(h>>13u);h=h*1103515245u;return h^(h>>17u);}\r\nvec3 randomCell(ivec2 cell,uint salt){return vec3(float(cellHash(cell,salt)&65535u),float(cellHash(cell,salt+17u)&65535u),float(cellHash(cell,salt+53u)&65535u))/65535.0;}\r\nvec4 straightAt(vec2 uv){vec4 s=texture(sourceTexture,clamp(uv,vec2(0.0),vec2(1.0)));return vec4(decodeRGB(s.rgb),s.a);}\r\nfloat weightedLuma(vec4 s){return dot(s.rgb,vec3(0.2126,0.7152,0.0722))*s.a;}\r\nvec4 brightest(vec2 uv,float angle){vec4 best=straightAt(uv);float luma=weightedLuma(best);if(false){for(int i=0;i<4;i++){float a=angle+float(i)*1.5707963267948966;vec4 candidate=straightAt(uv+vec2(cos(a),sin(a))*sparkle0.w/sparkle2.xy);float lum=weightedLuma(candidate);if(lum>luma){best=candidate;luma=lum;}}}return best;}\r\nfloat star(vec2 o,float reach){vec2 a=abs(o);float core=exp(-dot(o,o)*0.9);float lengthRate=0.45/max(sparkle1.x,0.01);float rays=exp(-a.x*1.6-a.y*lengthRate)+exp(-a.y*1.6-a.x*lengthRate);return (core+0.25*rays)*(1.0-smoothstep(reach*0.6,reach,max(a.x,a.y)));}\r\nvoid main(){vec2 px=v_uv*sparkle2.xy;vec4 child=straightAt(v_uv);vec3 glow=vec3(0.0);\r\nif(sparkle0.y>0.0){for(int layer=0;layer<2;layer++){float cellSize=sparkle0.x*(layer==0?1.0:0.6666666666666667);ivec2 base=ivec2(floor(px/cellSize-0.5));uint salt=uint(floor((sparkle1.w+float(layer)*0.31)*4096.0));for(int dy=0;dy<2;dy++){for(int dx=0;dx<2;dx++){ivec2 cell=base+ivec2(dx,dy);vec3 r=randomCell(cell,salt);vec2 point=(vec2(cell)+0.5+(r.xy-0.5)*0.6)*cellSize;vec4 source=brightest(point/sparkle2.xy,float(layer)*0.7853981633974483);float presence=smoothstep(sparkle0.z,sparkle0.z+0.12,sqrt(max(weightedLuma(source),0.0)));float blink=max(sin(sparkle2.z*(0.8+r.z*1.2)+r.x*6.283185307179586),0.0);blink*=blink;blink*=blink;blink*=blink;float level=0.35+0.65*step(0.45,r.z);float lum=dot(source.rgb,vec3(0.2126,0.7152,0.0722));vec3 tint=mix(vec3(1.0),source.rgb/max(lum,0.001)*0.6,sparkle1.y);glow+=tint*star(px-point,cellSize*0.5)*blink*presence*level*sparkle0.y;}}}}\r\n// The composable effect is linear associated RGBA; diagnostic RT bypasses OETF.\r\nfloat alpha=min(child.a+max(glow.r,max(glow.g,glow.b)),1.0);vec3 associated=child.rgb*child.a+glow;\r\nif(sparkle2.w>0.5){cc_FragColor=vec4(associated,alpha);}else{cc_FragColor=vec4(alpha>0.0?encodeRGB(associated/alpha)*alpha:vec3(0.0),alpha);}}',
            },
        },
    ],
    combinations: [],
    hideInEditor: false,
};
export const expandedEffectDefinition = {
    name: 'air-e06-sparkle-expanded',
    techniques: [
        {
            passes: [
                {
                    program: 'air-e06-sparkle-expanded|b617e9f2a3984163',
                    rasterizerState: {
                        cullMode: 0,
                    },
                    depthStencilState: {
                        depthTest: true,
                        depthWrite: true,
                    },
                    blendState: {
                        targets: [
                            {
                                blend: false,
                            },
                        ],
                    },
                    properties: {
                        sparkle0: {
                            type: 16,
                            value: [0, 0, 0, 0],
                        },
                        sparkle1: {
                            type: 16,
                            value: [0, 0, 0, 0],
                        },
                        sparkle2: {
                            type: 16,
                            value: [0, 0, 0, 0],
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
            name: 'air-e06-sparkle-expanded|b617e9f2a3984163',
            hash: 3055020530,
            builtins: {
                statistics: {
                    CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 50,
                    CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 7,
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
                    location: 1,
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
                            name: 'sparkle0',
                            type: 16,
                            count: 1,
                        },
                        {
                            name: 'sparkle1',
                            type: 16,
                            count: 1,
                        },
                        {
                            name: 'sparkle2',
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
                vert: 'precision highp float;\nlayout(set = 0, binding = 1) uniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nlayout(set = 2, binding = 0) uniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nlayout(set = 1, binding = 0) uniform Constants {\n  vec4 sparkle0;\n  vec4 sparkle1;\n  vec4 sparkle2;\n};\nlayout(location = 0) in vec3 a_position;\nlayout(location = 1) in vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main(){gl_Position=vec4(a_position.xy,0.0,1.0);v_uv=a_texCoord;}',
                frag: 'precision highp float;\nlayout(set = 0, binding = 0) uniform CCGlobal {\n  highp   vec4 cc_time;\n  mediump vec4 cc_screenSize;\n  mediump vec4 cc_nativeSize;\n  mediump vec4 cc_debug_view_mode;\n};\nlayout(set = 1, binding = 0) uniform Constants {\n  vec4 sparkle0;\n  vec4 sparkle1;\n  vec4 sparkle2;\n};\nlayout(set = 1, binding = 1) uniform sampler2D sourceTexture;\nin highp vec2 v_uv;\nlayout(location = 0) out vec4 cc_FragColor;\nprecision highp int;\r\n// Algorithm semantics: shader-effects-inc/shaders Sparkle dbfd42a (MIT).\r\n// Independent uint hash: not derived from Fi / upstream noise.hash32.\r\nfloat decode1(float x){return x<=0.04045?x/12.92:pow((x+0.055)/1.055,2.4);}\r\nvec3 decodeRGB(vec3 x){return vec3(decode1(x.r),decode1(x.g),decode1(x.b));}\r\nfloat encode1(float x){x=max(x,0.0);return x<=0.0031308?12.92*x:1.055*pow(x,1.0/2.4)-0.055;}\r\nvec3 encodeRGB(vec3 x){return vec3(encode1(x.r),encode1(x.g),encode1(x.b));}\r\nuint cellHash(ivec2 cell,uint salt){uint h=uint(cell.x)*1664525u+uint(cell.y)*1013904223u+salt*69069u+362437u;h=h^(h>>13u);h=h*1103515245u;return h^(h>>17u);}\r\nvec3 randomCell(ivec2 cell,uint salt){return vec3(float(cellHash(cell,salt)&65535u),float(cellHash(cell,salt+17u)&65535u),float(cellHash(cell,salt+53u)&65535u))/65535.0;}\r\nvec4 straightAt(vec2 uv){vec4 s=texture(sourceTexture,clamp(uv,vec2(0.0),vec2(1.0)));return vec4(decodeRGB(s.rgb),s.a);}\r\nfloat weightedLuma(vec4 s){return dot(s.rgb,vec3(0.2126,0.7152,0.0722))*s.a;}\r\nvec4 brightest(vec2 uv,float angle){vec4 best=straightAt(uv);float luma=weightedLuma(best);if(true){for(int i=0;i<4;i++){float a=angle+float(i)*1.5707963267948966;vec4 candidate=straightAt(uv+vec2(cos(a),sin(a))*sparkle0.w/sparkle2.xy);float lum=weightedLuma(candidate);if(lum>luma){best=candidate;luma=lum;}}}return best;}\r\nfloat star(vec2 o,float reach){vec2 a=abs(o);float core=exp(-dot(o,o)*0.9);float lengthRate=0.45/max(sparkle1.x,0.01);float rays=exp(-a.x*1.6-a.y*lengthRate)+exp(-a.y*1.6-a.x*lengthRate);return (core+0.25*rays)*(1.0-smoothstep(reach*0.6,reach,max(a.x,a.y)));}\r\nvoid main(){vec2 px=v_uv*sparkle2.xy;vec4 child=straightAt(v_uv);vec3 glow=vec3(0.0);\r\nif(sparkle0.y>0.0){for(int layer=0;layer<2;layer++){float cellSize=sparkle0.x*(layer==0?1.0:0.6666666666666667);ivec2 base=ivec2(floor(px/cellSize-0.5));uint salt=uint(floor((sparkle1.w+float(layer)*0.31)*4096.0));for(int dy=0;dy<2;dy++){for(int dx=0;dx<2;dx++){ivec2 cell=base+ivec2(dx,dy);vec3 r=randomCell(cell,salt);vec2 point=(vec2(cell)+0.5+(r.xy-0.5)*0.6)*cellSize;vec4 source=brightest(point/sparkle2.xy,float(layer)*0.7853981633974483);float presence=smoothstep(sparkle0.z,sparkle0.z+0.12,sqrt(max(weightedLuma(source),0.0)));float blink=max(sin(sparkle2.z*(0.8+r.z*1.2)+r.x*6.283185307179586),0.0);blink*=blink;blink*=blink;blink*=blink;float level=0.35+0.65*step(0.45,r.z);float lum=dot(source.rgb,vec3(0.2126,0.7152,0.0722));vec3 tint=mix(vec3(1.0),source.rgb/max(lum,0.001)*0.6,sparkle1.y);glow+=tint*star(px-point,cellSize*0.5)*blink*presence*level*sparkle0.y;}}}}\r\n// The composable effect is linear associated RGBA; diagnostic RT bypasses OETF.\r\nfloat alpha=min(child.a+max(glow.r,max(glow.g,glow.b)),1.0);vec3 associated=child.rgb*child.a+glow;\r\nif(sparkle2.w>0.5){cc_FragColor=vec4(associated,alpha);}else{cc_FragColor=vec4(alpha>0.0?encodeRGB(associated/alpha)*alpha:vec3(0.0),alpha);}}',
            },
            glsl3: {
                vert: 'precision highp float;\nuniform CCCamera {\n  highp   mat4 cc_matView;\n  highp   mat4 cc_matViewInv;\n  highp   mat4 cc_matProj;\n  highp   mat4 cc_matProjInv;\n  highp   mat4 cc_matViewProj;\n  highp   mat4 cc_matViewProjInv;\n  highp   vec4 cc_cameraPos;\n  mediump vec4 cc_surfaceTransform;\n  mediump vec4 cc_screenScale;\n  mediump vec4 cc_exposure;\n  mediump vec4 cc_mainLitDir;\n  mediump vec4 cc_mainLitColor;\n  mediump vec4 cc_ambientSky;\n  mediump vec4 cc_ambientGround;\n  mediump vec4 cc_fogColor;\n  mediump vec4 cc_fogBase;\n  mediump vec4 cc_fogAdd;\n  mediump vec4 cc_nearFar;\n  mediump vec4 cc_viewPort;\n};\nuniform CCLocal {\n  highp mat4 cc_matWorld;\n  highp mat4 cc_matWorldIT;\n  highp vec4 cc_lightingMapUVParam;\n  highp vec4 cc_localShadowBias;\n};\nuniform Constants {\n  vec4 sparkle0;\n  vec4 sparkle1;\n  vec4 sparkle2;\n};\nin vec3 a_position;\nin vec2 a_texCoord;\nout highp vec2 v_uv;\nvoid main(){gl_Position=vec4(a_position.xy,0.0,1.0);v_uv=a_texCoord;}',
                frag: 'precision highp float;\nuniform CCGlobal {\n  highp   vec4 cc_time;\n  mediump vec4 cc_screenSize;\n  mediump vec4 cc_nativeSize;\n  mediump vec4 cc_debug_view_mode;\n};\nuniform Constants {\n  vec4 sparkle0;\n  vec4 sparkle1;\n  vec4 sparkle2;\n};\nuniform sampler2D sourceTexture;\nin highp vec2 v_uv;\nout vec4 cc_FragColor;\nprecision highp int;\r\n// Algorithm semantics: shader-effects-inc/shaders Sparkle dbfd42a (MIT).\r\n// Independent uint hash: not derived from Fi / upstream noise.hash32.\r\nfloat decode1(float x){return x<=0.04045?x/12.92:pow((x+0.055)/1.055,2.4);}\r\nvec3 decodeRGB(vec3 x){return vec3(decode1(x.r),decode1(x.g),decode1(x.b));}\r\nfloat encode1(float x){x=max(x,0.0);return x<=0.0031308?12.92*x:1.055*pow(x,1.0/2.4)-0.055;}\r\nvec3 encodeRGB(vec3 x){return vec3(encode1(x.r),encode1(x.g),encode1(x.b));}\r\nuint cellHash(ivec2 cell,uint salt){uint h=uint(cell.x)*1664525u+uint(cell.y)*1013904223u+salt*69069u+362437u;h=h^(h>>13u);h=h*1103515245u;return h^(h>>17u);}\r\nvec3 randomCell(ivec2 cell,uint salt){return vec3(float(cellHash(cell,salt)&65535u),float(cellHash(cell,salt+17u)&65535u),float(cellHash(cell,salt+53u)&65535u))/65535.0;}\r\nvec4 straightAt(vec2 uv){vec4 s=texture(sourceTexture,clamp(uv,vec2(0.0),vec2(1.0)));return vec4(decodeRGB(s.rgb),s.a);}\r\nfloat weightedLuma(vec4 s){return dot(s.rgb,vec3(0.2126,0.7152,0.0722))*s.a;}\r\nvec4 brightest(vec2 uv,float angle){vec4 best=straightAt(uv);float luma=weightedLuma(best);if(true){for(int i=0;i<4;i++){float a=angle+float(i)*1.5707963267948966;vec4 candidate=straightAt(uv+vec2(cos(a),sin(a))*sparkle0.w/sparkle2.xy);float lum=weightedLuma(candidate);if(lum>luma){best=candidate;luma=lum;}}}return best;}\r\nfloat star(vec2 o,float reach){vec2 a=abs(o);float core=exp(-dot(o,o)*0.9);float lengthRate=0.45/max(sparkle1.x,0.01);float rays=exp(-a.x*1.6-a.y*lengthRate)+exp(-a.y*1.6-a.x*lengthRate);return (core+0.25*rays)*(1.0-smoothstep(reach*0.6,reach,max(a.x,a.y)));}\r\nvoid main(){vec2 px=v_uv*sparkle2.xy;vec4 child=straightAt(v_uv);vec3 glow=vec3(0.0);\r\nif(sparkle0.y>0.0){for(int layer=0;layer<2;layer++){float cellSize=sparkle0.x*(layer==0?1.0:0.6666666666666667);ivec2 base=ivec2(floor(px/cellSize-0.5));uint salt=uint(floor((sparkle1.w+float(layer)*0.31)*4096.0));for(int dy=0;dy<2;dy++){for(int dx=0;dx<2;dx++){ivec2 cell=base+ivec2(dx,dy);vec3 r=randomCell(cell,salt);vec2 point=(vec2(cell)+0.5+(r.xy-0.5)*0.6)*cellSize;vec4 source=brightest(point/sparkle2.xy,float(layer)*0.7853981633974483);float presence=smoothstep(sparkle0.z,sparkle0.z+0.12,sqrt(max(weightedLuma(source),0.0)));float blink=max(sin(sparkle2.z*(0.8+r.z*1.2)+r.x*6.283185307179586),0.0);blink*=blink;blink*=blink;blink*=blink;float level=0.35+0.65*step(0.45,r.z);float lum=dot(source.rgb,vec3(0.2126,0.7152,0.0722));vec3 tint=mix(vec3(1.0),source.rgb/max(lum,0.001)*0.6,sparkle1.y);glow+=tint*star(px-point,cellSize*0.5)*blink*presence*level*sparkle0.y;}}}}\r\n// The composable effect is linear associated RGBA; diagnostic RT bypasses OETF.\r\nfloat alpha=min(child.a+max(glow.r,max(glow.g,glow.b)),1.0);vec3 associated=child.rgb*child.a+glow;\r\nif(sparkle2.w>0.5){cc_FragColor=vec4(associated,alpha);}else{cc_FragColor=vec4(alpha>0.0?encodeRGB(associated/alpha)*alpha:vec3(0.0),alpha);}}',
            },
        },
    ],
    combinations: [],
    hideInEditor: false,
};
