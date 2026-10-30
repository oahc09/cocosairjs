/** Original procedural materials. All fragment output is linear HDR radiance. */
import { EffectAsset, Material, Vec4, Mat4, gfx } from 'cocosair';
import { UBO_CC_CAMERA_GLSL4, UBO_CC_GLOBAL_GLSL4, UBO_CC_LOCAL_GLSL4 } from '../../shared/shader-blocks.js';

const vertex = `precision highp float;
${UBO_CC_CAMERA_GLSL4}
${UBO_CC_LOCAL_GLSL4}
in vec3 a_position; in vec3 a_normal;
out highp vec3 v_world; out highp vec3 v_normal; out highp vec3 v_local;
void main(){
vec3 position=a_position,normal=a_normal;
#if AIR_LIQUID_GLASS
float a=dot(a_position,vec3(3.1,4.2,2.7))+clock.x*.65;
float b=dot(a_position,vec3(-3.8,2.3,4.1))-clock.x*.48;
float wave=sin(a)*sin(b)*.055*settings.z*settings.w;
vec3 gradient=(vec3(3.1,4.2,2.7)*cos(a)*sin(b)+vec3(-3.8,2.3,4.1)*sin(a)*cos(b))*.055*settings.z*settings.w;
position+=a_normal*wave;normal=normalize(a_normal-gradient);
#endif
vec4 p=cc_matWorld*vec4(position,1.0);v_world=p.xyz;
v_local=a_position;v_normal=normalize(mat3(cc_matWorldIT)*normal);gl_Position=cc_matViewProj*p;}`;

const surface = `
vec3 n=normalize(v_normal),v=normalize(cc_cameraPos.xyz-v_world);
float facing=clamp(abs(dot(n,v)),0.0,1.0),rim=pow(1.0-facing,4.0);
vec3 reflected=reflect(-v,n);
// Analytic studio softboxes. These shape the metal; the floor uses a real camera reflection.
float key=pow(max(dot(reflected,normalize(vec3(-0.7,1.2,1.0))),0.0),38.0);
float strip=exp(-pow((reflected.x+0.55)*14.0,2.0))*smoothstep(-0.35,0.5,reflected.y);
float amber=pow(max(dot(reflected,normalize(vec3(1.0,0.3,-0.4))),0.0),20.0);
vec3 environment=vec3(0.018,0.025,0.032)+vec3(1.25,1.55,1.7)*key+vec3(0.035,0.62,0.85)*strip+vec3(1.0,0.3,0.08)*amber;
vec3 c;
if(settings.x>1.5){
  float tubeLight=0.6+0.4*pow(facing,0.4);
  c=tint.rgb*settings.y*tubeLight;
}else if(settings.x>0.5){
#if AIR_LIQUID_GLASS
if(settings.w>.5){
  vec4 projected=captureViewProj*vec4(v_world,1.0);
  vec2 uv=projected.xy/projected.w*.5+.5;
  vec3 viewNormal=normalize(mat3(cc_matView)*n);
  float thickness=1.7*sqrt(max(.0,facing));
  vec2 bend=-viewNormal.xy*.065*thickness;
  vec3 transmitted=vec3(texture(captureTexture,clamp(uv+bend*.9975,.001,.999)).r,
      texture(captureTexture,clamp(uv+bend,.001,.999)).g,
      texture(captureTexture,clamp(uv+bend*1.0025,.001,.999)).b);
  float fresnel=.04+.96*pow(1.0-facing,5.0);
  vec3 absorption=exp(-vec3(.10,.025,.015)*thickness);
  c=transmitted*absorption*(1.0-fresnel)+environment*(.14+fresnel*.85);
  vec3 softbox=vec3(.55,.75,.82)*pow(max(dot(reflected,normalize(vec3(.15,.8,1.0))),0.0),10.0);
  softbox+=vec3(.14,.28,.32)*exp(-pow((reflected.y+.3)*8.0,2.0));
  c+=softbox*(.35+fresnel*.5)+vec3(.003,.007,.008);
  c+=vec3(.025,.09,.12)*rim;
}else{c=environment*(.28+rim*.5)+vec3(.002,.005,.009)+tint.rgb*rim*.7;}
#else
  float longitude=atan(v_local.z,v_local.x);
  float latitude=asin(clamp(v_local.y/1.14,-1.0,1.0));
  float etched=pow(0.5+0.5*sin(latitude*72.0+longitude*5.0-clock.x*0.16),38.0);
  float seam=exp(-pow((latitude+0.12*sin(longitude*3.0+clock.x*.1))*220.0,2.0));
  c=environment*(0.28+rim*0.5)+vec3(0.002,0.005,0.009);
  c+=tint.rgb*(rim*.7+etched*rim*.08+seam*1.7);
#endif
}else{
  float light=max(dot(n,normalize(vec3(-0.5,0.8,0.4))),0.0);
  float radius=length(v_local.xz);
  float micro=radius*160.0;
  float grooves=sin(micro)*0.008*(1.0-smoothstep(.3,1.0,fwidth(micro)));
  float phase=radius*18.0;
  float aa=max(fwidth(phase),.015);
  float line=(1.0-smoothstep(.045,.045+aa,abs(fract(phase)-.5)))*(1.0-smoothstep(.5,1.0,aa));
  float engraving=1.0-0.25*line*abs(n.y);
  c=(tint.rgb*(0.025+light*.12)+environment*(.28+rim*.65))*(engraving+grooves);
  c+=vec3(.02,.05,.055)*rim;
}
float fog=exp(-length(cc_cameraPos.xyz-v_world)*0.008);
cc_FragColor=vec4(c*fog,1.0);`;

const floor = `
vec4 projected=captureViewProj*vec4(v_world,1.0);
vec2 uv=projected.xy/projected.w*0.5+0.5;
float ripple=sin(v_world.z*8.0+clock.x*0.3)*sin(v_world.x*6.0-clock.x*0.2);
uv.x+=ripple*0.00025;
vec2 blur=vec2(.0008,.0012)*(1.0+length(v_world.xz)*.1);
vec3 reflected=texture(captureTexture,clamp(uv,0.001,0.999)).rgb*.4;
reflected+=(texture(captureTexture,clamp(uv+blur,0.001,0.999)).rgb+texture(captureTexture,clamp(uv-blur,0.001,0.999)).rgb+texture(captureTexture,clamp(uv+vec2(blur.x,-blur.y),0.001,0.999)).rgb+texture(captureTexture,clamp(uv+vec2(-blur.x,blur.y),0.001,0.999)).rgb)*.15;
float inside=step(0.0,uv.x)*step(uv.x,1.0)*step(0.0,uv.y)*step(uv.y,1.0)*step(0.0,projected.w);
float distanceFade=exp(-length(v_world.xz)*0.026);
float grain=fract(sin(dot(floor(v_world.xz*65.0),vec2(127.1,311.7)))*43758.5453);
float tiles=pow(1.0-smoothstep(0.001,0.004,abs(fract(v_world.x*0.125)-0.5)),5.0);
float ring=exp(-pow((length(v_world.xz)-3.55)*45.0,2.0));
vec3 c=vec3(0.0015,0.003,0.005)+reflected*inside*0.32*distanceFade*(0.96+grain*0.04);
c+=tint.rgb*ring*0.10+vec3(0.001,0.002,0.003)*tiles*exp(-length(v_world.xz)*0.08);
c=mix(vec3(1.0,3.0,6.0)/255.0,c,exp(-length(v_world.xz)*.04));
cc_FragColor=vec4(c,1.0);`;

export function makeSculptureMaterial(
    name: string,
    floorMaterial = false,
    glassMaterial = false,
): { material: Material; effect: EffectAsset } {
    const { Type, Format, ShaderStageFlagBit } = gfx;
    const members = [
        { name: 'tint', type: Type.FLOAT4, count: 1 },
        { name: 'settings', type: Type.FLOAT4, count: 1 },
        { name: 'clock', type: Type.FLOAT4, count: 1 },
        ...(floorMaterial || glassMaterial ? [{ name: 'captureViewProj', type: Type.MAT4, count: 1 }] : []),
    ];
    const capture = floorMaterial || glassMaterial;
    const constants = `layout(set=1,binding=0) uniform Constants { vec4 tint; vec4 settings; vec4 clock; ${capture ? 'mat4 captureViewProj;' : ''} };`;
    const vert = vertex.replace(
        'in vec3 a_position;',
        '#define AIR_LIQUID_GLASS ' +
            (glassMaterial ? '1' : '0') +
            '\n' +
            (glassMaterial ? constants : '') +
            '\nin vec3 a_position;',
    );
    const frag = `precision highp float;
${UBO_CC_CAMERA_GLSL4}
${UBO_CC_GLOBAL_GLSL4}
${constants}
#define AIR_LIQUID_GLASS ${glassMaterial ? 1 : 0}
${capture ? 'layout(set=1,binding=1) uniform sampler2D captureTexture;' : ''}
in highp vec3 v_world; in highp vec3 v_normal; in highp vec3 v_local;
layout(location=0) out vec4 cc_FragColor;
void main(){${floorMaterial ? floor : surface}}`;
    const strip = (code: string) => code.replace(/layout\s*\([^)]*\)\s*/g, '');
    const effect = Object.assign(new EffectAsset(), {
        name,
        techniques: [
            {
                passes: [
                    {
                        program: name,
                        rasterizerState: { cullMode: 0 },
                        depthStencilState: { depthTest: true, depthWrite: true },
                        blendState: { targets: [{ blend: false }] },
                        properties: {
                            tint: { value: [0.05, 0.6, 1, 1], type: Type.FLOAT4 },
                            settings: { value: [0, 1, 0, 0], type: Type.FLOAT4 },
                            clock: { value: [0, 0, 0, 0], type: Type.FLOAT4 },
                            ...(capture
                                ? {
                                      captureViewProj: {
                                          value: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
                                          type: Type.MAT4,
                                      },
                                      captureTexture: { value: 'black', type: Type.SAMPLER2D },
                                  }
                                : {}),
                        },
                    },
                ],
            },
        ],
        shaders: [
            {
                name,
                glsl4: { vert, frag },
                glsl3: { vert: strip(vert), frag: strip(frag) },
                defines: [],
                attributes: [
                    { name: 'a_position', format: Format.RGB32F, location: 0, defines: [] },
                    { name: 'a_normal', format: Format.RGB32F, location: 1, defines: [] },
                ],
                builtins: {
                    statistics: {
                        CC_EFFECT_USED_VERTEX_UNIFORM_VECTORS: 47,
                        CC_EFFECT_USED_FRAGMENT_UNIFORM_VECTORS: 20,
                    },
                    globals: {
                        blocks: [
                            { name: 'CCGlobal', set: 0, binding: 0, defines: [] },
                            { name: 'CCCamera', set: 0, binding: 1, defines: [] },
                        ],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                    locals: {
                        blocks: [{ name: 'CCLocal', set: 2, binding: 0, defines: [] }],
                        samplerTextures: [],
                        buffers: [],
                        images: [],
                    },
                },
                blocks: [
                    {
                        name: 'Constants',
                        set: 1,
                        binding: 0,
                        stageFlags: glassMaterial
                            ? ShaderStageFlagBit.VERTEX | ShaderStageFlagBit.FRAGMENT
                            : ShaderStageFlagBit.FRAGMENT,
                        members,
                    },
                ],
                samplerTextures: capture
                    ? [
                          {
                              name: 'captureTexture',
                              set: 1,
                              binding: 1,
                              type: Type.SAMPLER2D,
                              count: 1,
                              stageFlags: ShaderStageFlagBit.FRAGMENT,
                              defines: [],
                          },
                      ]
                    : [],
            },
        ],
        combinations: [],
    });
    effect.onLoaded();
    const material = new Material();
    material.initialize({ effectAsset: effect });
    material.setProperty('tint', new Vec4(0.04, 0.7, 1, 1));
    material.setProperty('settings', new Vec4(0, 1, 0, 0));
    material.setProperty('clock', new Vec4());
    if (capture) material.setProperty('captureViewProj', new Mat4());
    return { material, effect };
}
