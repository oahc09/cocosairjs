/*
 Copyright (c) 2026-2027 oahc09@gmail.com

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
*/
import {
    BufferGeometry,
    CubeReflectionMapping,
    CubeUVReflectionMapping,
    Float32BufferAttribute,
    GLSL3,
    HalfFloatType,
    LinearFilter,
    Mesh,
    NoBlending,
    NoToneMapping,
    OrthographicCamera,
    PerspectiveCamera,
    RGBAFormat,
    RawShaderMaterial,
    Scene,
    WebGLRenderTarget,
} from './spark-api-adapter';
import { Color, LinearSRGBColorSpace, Vector3 } from './spark-math';

interface PMREMImageInfo {
    width?: number;
    height?: number;
    image?: PMREMImageInfo;
}
interface PMREMSourceTexture {
    isCubeTexture?: boolean;
    isRenderTargetTexture?: boolean;
    mapping?: number;
    image?: unknown;
}
interface PMREMBackground extends PMREMSourceTexture {
    isTexture?: boolean;
    isColor?: boolean;
}
interface PMREMUniformSlot {
    value: unknown;
}
type PMREMUniforms = Record<string, PMREMUniformSlot>;
type PMREMDefines = Record<string, string | number>;
interface PMREMSceneOptions {
    size?: number;
    position?: Vector3;
}
interface PMREMLevel {
    index: number;
    size: number;
    mip: number;
    sigma: number;
    x: number;
    y: number;
    width: number;
    height: number;
}
interface PMREMLayout {
    lodMax: number;
    cubeSize: number;
    width: number;
    height: number;
    levels: PMREMLevel[];
}
interface PMREMRenderer {
    autoClear: boolean;
    toneMapping: number;
    xr: { enabled: boolean };
    render(object3D: unknown, camera: unknown): void;
    setRenderTarget(target: WebGLRenderTarget | null, face?: number, mip?: number): void;
    getRenderTarget(): WebGLRenderTarget | null;
    getActiveCubeFace(): number;
    getActiveMipmapLevel(): number;
    clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
    getClearColor(out: Color): Color;
    compile?(object3D: unknown, camera: unknown): void;
    _material?(material: RawShaderMaterial): void;
}

const MIN_MIP = 4,
    MIN_FACE = 16,
    MAX_SAMPLES = 20;
const CUBE_REFRACTION_MAPPING = 302;
const EXTRA_SIGMAS = [0.125, 0.215, 0.35, 0.446, 0.526, 0.582];
const PHI = (1 + Math.sqrt(5)) / 2,
    INV_PHI = 1 / PHI;
const AXES: [number, number, number][] = [
    [-PHI, INV_PHI, 0],
    [PHI, INV_PHI, 0],
    [-INV_PHI, 0, PHI],
    [INV_PHI, 0, PHI],
    [0, PHI, -INV_PHI],
    [0, PHI, INV_PHI],
    [-1, 1, -1],
    [1, 1, -1],
    [-1, 1, 1],
    [1, 1, 1],
];
const VERTEX = `
precision mediump float;
precision mediump int;
in highp vec3 position;
in highp vec2 uv;
in float faceIndex;
out vec3 direction;
vec3 faceDirection(vec2 p,float face){
 p=2.0*p-1.0;
 vec3 d=vec3(p,1.0);
 if(face==0.0)d=d.zyx;
 else if(face==1.0){d=d.xzy;d.xz*=-1.0;}
 else if(face==2.0)d.x*=-1.0;
 else if(face==3.0){d=d.zyx;d.xz*=-1.0;}
 else if(face==4.0){d=d.xzy;d.xy*=-1.0;}
 else if(face==5.0)d.z*=-1.0;
 return d;
}
void main(){direction=faceDirection(uv,faceIndex);gl_Position=vec4(position,1.0);}
`;
// @air-element none:CUBEUV_SAMPLING_GLSL —— 引擎无 CubeUV 图集采样着色器库：gfx 侧只建模纹理枚举（gfx.Format/gfx.TextureType）与命令提交，不含 airCubeFace/airCubeFaceUV/airBilinearCubeUV/airRoughnessToMip/airTextureCubeUV 这段 r180 CubeUV 数据契约的 GLSL 函数体，AIR 自持。消费方需自行定义 CUBEUV_MAX_MIP、CUBEUV_TEXEL_WIDTH 与 CUBEUV_TEXEL_HEIGHT，与生成的图集布局一致
export const CUBEUV_SAMPLING_GLSL = `
float airCubeFace(vec3 d){
 vec3 a=abs(d);
 if(a.x>a.z){if(a.x>a.y)return d.x>0.0?0.0:3.0;else return d.y>0.0?1.0:4.0;}
 else{if(a.z>a.y)return d.z>0.0?2.0:5.0;else return d.y>0.0?1.0:4.0;}
}
vec2 airCubeFaceUV(vec3 d,float f){
 vec2 uv;
 if(f==0.0)uv=vec2(d.z,d.y)/abs(d.x);
 else if(f==1.0)uv=vec2(-d.x,-d.z)/abs(d.y);
 else if(f==2.0)uv=vec2(-d.x,d.y)/abs(d.z);
 else if(f==3.0)uv=vec2(-d.z,d.y)/abs(d.x);
 else if(f==4.0)uv=vec2(-d.x,d.z)/abs(d.y);
 else uv=vec2(d.x,d.y)/abs(d.z);
 return 0.5*(uv+1.0);
}
vec3 airBilinearCubeUV(sampler2D atlas,vec3 d,float mip){
 float face=airCubeFace(d);
 float extra=max(4.0-mip,0.0);
 mip=max(mip,4.0);
 float size=exp2(mip);
 highp vec2 uv=airCubeFaceUV(d,face)*(size-2.0)+1.0;
 if(face>2.0){uv.y+=size;face-=3.0;}
 uv.x+=face*size;
 uv.x+=extra*3.0*16.0;
 uv.y+=4.0*(exp2(CUBEUV_MAX_MIP)-size);
 uv.x*=CUBEUV_TEXEL_WIDTH;
 uv.y*=CUBEUV_TEXEL_HEIGHT;
 return textureGrad(atlas,uv,vec2(0.0),vec2(0.0)).rgb;
}
float airRoughnessToMip(float r){
 if(r>=0.8)return (1.0-r)*(-1.0-(-2.0))/(1.0-0.8)+(-2.0);
 if(r>=0.4)return (0.8-r)*(2.0-(-1.0))/(0.8-0.4)+(-1.0);
 if(r>=0.305)return (0.4-r)*(3.0-2.0)/(0.4-0.305)+2.0;
 if(r>=0.21)return (0.305-r)*(4.0-3.0)/(0.305-0.21)+3.0;
 return -2.0*log2(1.16*r);
}
vec4 airTextureCubeUV(sampler2D atlas,vec3 d,float roughness){
 float mip=clamp(airRoughnessToMip(roughness),-2.0,CUBEUV_MAX_MIP);
 float fraction=fract(mip),whole=floor(mip);
 vec3 c=airBilinearCubeUV(atlas,d,whole);
 if(fraction==0.0)return vec4(c,1.0);
 return vec4(mix(c,airBilinearCubeUV(atlas,d,whole+1.0),fraction),1.0);
}
`;
const FRAGMENT_HEADER =
    'precision mediump float;\nprecision mediump int;\nprecision highp sampler2D;\nprecision highp samplerCube;\nin vec3 direction;\nout highp vec4 fragColor;\n';
const BLUR_FRAGMENT =
    FRAGMENT_HEADER +
    `
uniform sampler2D envMap;
uniform int samples;
uniform float weights[20];
uniform bool latitudinal;
uniform float dTheta;
uniform float mipInt;
uniform vec3 poleAxis;
` +
    CUBEUV_SAMPLING_GLSL +
    `
vec3 rotatedSample(float theta,vec3 axis){
 float c=cos(theta);
 vec3 d=direction*c+cross(axis,direction)*sin(theta)+axis*dot(axis,direction)*(1.0-c);
 return airBilinearCubeUV(envMap,d,mipInt);
}
void main(){
 vec3 axis=latitudinal?poleAxis:cross(poleAxis,direction);
 if(all(equal(axis,vec3(0.0))))axis=vec3(direction.z,0.0,-direction.x);
 axis=normalize(axis);
 fragColor=vec4(0.0,0.0,0.0,1.0);
 fragColor.rgb+=weights[0]*rotatedSample(0.0,axis);
 for(int i=1;i<20;i++){
  if(i>=samples)break;
  float theta=dTheta*float(i);
  fragColor.rgb+=weights[i]*rotatedSample(-1.0*theta,axis);
  fragColor.rgb+=weights[i]*rotatedSample(theta,axis);
 }
}
`;

function raw(name: string, fragment: string, uniforms: PMREMUniforms, defines: PMREMDefines = {}): RawShaderMaterial {
    return new RawShaderMaterial({
        name,
        vertexShader: VERTEX,
        fragmentShader: fragment,
        uniforms,
        defines,
        glslVersion: GLSL3,
        blending: NoBlending,
        depthTest: false,
        depthWrite: false,
    });
}
function rectangle(target: WebGLRenderTarget, x: number, y: number, w: number, h: number): void {
    target.viewport.set(x, y, w, h);
    target.scissor.set(x, y, w, h);
}
function save(renderer: PMREMRenderer) {
    return {
        target: renderer.getRenderTarget(),
        face: renderer.getActiveCubeFace(),
        mip: renderer.getActiveMipmapLevel(),
        xr: renderer.xr.enabled,
        autoClear: renderer.autoClear,
        toneMapping: renderer.toneMapping,
    };
}
function restore(renderer: PMREMRenderer, state: ReturnType<typeof save>): void {
    renderer.setRenderTarget(state.target, state.face, state.mip);
    renderer.xr.enabled = state.xr;
    renderer.autoClear = state.autoClear;
    renderer.toneMapping = state.toneMapping;
}
function planes(size: number): BufferGeometry {
    const positions: number[] = [],
        uvs: number[] = [],
        faces: number[] = [],
        pad = 1 / (size - 2);
    const corners: [number, number][] = [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
        [1, 1],
        [0, 1],
    ];
    for (let f = 0; f < 6; f++) {
        const x = ((f % 3) * 2) / 3 - 1,
            y = f > 2 ? 0 : -1;
        for (const [u, v] of corners) {
            positions.push(x + (u * 2) / 3, y + v, 0);
            uvs.push(u ? 1 + pad : -pad, v ? 1 + pad : -pad);
            faces.push(f);
        }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(positions, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
    g.setAttribute('faceIndex', new Float32BufferAttribute(faces, 1));
    return g;
}
// @air-element none:pmremLayout —— CPU 端的 CubeUV 布局计算（LOD 上界、sigma 序列、每级图集矩形）：引擎无 IBL 预滤波布局概念，cc.math 只提供标量/向量原语，AIR 自持。请求尺寸非有限值或 face 小于 MIN_FACE 时抛 RangeError，与 r180 一致；纯元数据，供 fixture 校验与原生 PBR 消费方使用
export function pmremLayout(requestedSize: number): PMREMLayout {
    const lodMax = Math.floor(Math.log2(requestedSize)),
        cubeSize = 2 ** lodMax;
    if (!Number.isFinite(requestedSize) || cubeSize < MIN_FACE)
        throw new RangeError('PMREM cube face size must be at least 16');
    const width = 3 * Math.max(cubeSize, 16 * 7),
        height = 4 * cubeSize;
    const levels: PMREMLevel[] = Array.from({ length: lodMax - MIN_MIP + 1 + EXTRA_SIGMAS.length }, (_, i) => {
        const size = 2 ** Math.max(MIN_MIP, lodMax - i),
            extra = i - (lodMax - MIN_MIP);
        return {
            index: i,
            size,
            mip: lodMax - i,
            sigma: i === 0 ? 0 : extra > 0 ? EXTRA_SIGMAS[extra - 1] : 1 / size,
            x: 3 * size * Math.max(0, extra),
            y: 4 * (cubeSize - size),
            width: 3 * size,
            height: 2 * size,
        };
    });
    return { lodMax, cubeSize, width, height, levels };
}
// @air-element none:PMREMGenerator —— 引擎无 PMREM/IBL 预滤波管线：球面高斯经纬两轮 blur 的渲染循环、CPU 权重计算与 GLSL 片段源码为 AIR 自持算法主体，故本条不能标 cc.*/gfx:*；不手写任何 GL 状态与着色器编译，GPU 资源全部委托 spark-api-adapter 的 WebGLRenderTarget/BufferGeometry/Float32BufferAttribute/RawShaderMaterial/Mesh/OrthographicCamera/PerspectiveCamera（由原生 gfx.TextureType/gfx.Format/gfx.Type/gfx.Filter 与 gfx 命令缓冲落地）、向量与颜色委托 spark-math 的 cc.math.Vec3/cc.math.Color，绘制与提交委托外部 renderer 的 render/setRenderTarget/getRenderTarget/getActiveCubeFace/getActiveMipmapLevel/clear/getClearColor/compile 契约。保留 r180 可观察行为：无外部输出目标时才重建各级资源；fromCubemap 复用同一 target 跨尺寸时仍按新尺寸校验布局；xr.enabled 的临时关闭在 SPK-07 惰性外壳下退化为恒等操作；fromScene 的六个面朝向是 CubeUV 图集约定，与 CubeCamera 顺序不同
export class PMREMGenerator {
    _renderer: PMREMRenderer;
    _pingPongRenderTarget: WebGLRenderTarget | null = null;
    _lodPlanes: BufferGeometry[] = [];
    _sizeLods: number[] = [];
    _sigmas: number[] = [];
    _blurMaterial: RawShaderMaterial | null = null;
    _cubemapMaterial: RawShaderMaterial | null = null;
    _equirectMaterial: RawShaderMaterial | null = null;
    _solidMaterial: RawShaderMaterial | null = null;
    _flatCamera: OrthographicCamera;
    _layout: PMREMLayout | null = null;
    _cubeSize = 0;
    _lodMax = 0;

    constructor(renderer: PMREMRenderer) {
        if (!renderer?.render || !renderer?.setRenderTarget)
            throw new TypeError('PMREMGenerator requires a native-compatible renderer');
        this._renderer = renderer;
        this._flatCamera = new OrthographicCamera();
    }
    _prepare(size: number): void {
        const next = pmremLayout(size);
        this._cubeSize = next.cubeSize;
        this._lodMax = next.lodMax;
        if (this._layout?.cubeSize === next.cubeSize) return;
        this._releaseLevels();
        this._layout = next;
        this._cubeSize = next.cubeSize;
        this._lodMax = next.lodMax;
        this._lodPlanes = next.levels.map((x) => planes(x.size));
        this._sizeLods = next.levels.map((x) => x.size);
        this._sigmas = next.levels.map((x) => x.sigma);
        this._pingPongRenderTarget = this._newTarget();
        this._blurMaterial = raw(
            'AirPMREM.SphericalGaussian',
            BLUR_FRAGMENT,
            {
                envMap: { value: null },
                samples: { value: 1 },
                weights: { value: new Float32Array(MAX_SAMPLES) },
                latitudinal: { value: false },
                dTheta: { value: 0 },
                mipInt: { value: 0 },
                poleAxis: { value: new Vector3(0, 1, 0) },
            },
            {
                CUBEUV_MAX_MIP: `${next.lodMax}.0`,
                CUBEUV_TEXEL_WIDTH: 1 / next.width,
                CUBEUV_TEXEL_HEIGHT: 1 / next.height,
            },
        );
    }
    _newTarget(): WebGLRenderTarget {
        const { width, height, cubeSize, lodMax } = this._layout!;
        const t = new WebGLRenderTarget(width, height, {
            magFilter: LinearFilter,
            minFilter: LinearFilter,
            generateMipmaps: false,
            type: HalfFloatType,
            format: RGBAFormat,
            colorSpace: LinearSRGBColorSpace,
            depthBuffer: false,
        });
        t.texture.mapping = CubeUVReflectionMapping;
        t.texture.name = 'PMREM.cubeUv';
        t.texture.userData.pmrem = {
            cubeSize,
            lodMax,
            minMip: MIN_MIP,
            extraSigmas: [...EXTRA_SIGMAS],
            implementation: 'native-cocos-gfx',
        };
        t.scissorTest = true;
        return t;
    }
    _inputMaterial(cube: boolean): RawShaderMaterial {
        if (cube)
            return (this._cubemapMaterial ??= raw(
                'AirPMREM.CubemapToCubeUV',
                FRAGMENT_HEADER +
                    'uniform samplerCube envMap;\nuniform float flipEnvMap;\nvoid main(){fragColor=texture(envMap,vec3(flipEnvMap*direction.x,direction.yz));}',
                { envMap: { value: null }, flipEnvMap: { value: -1 } },
            ));
        return (this._equirectMaterial ??= raw(
            'AirPMREM.EquirectangularToCubeUV',
            FRAGMENT_HEADER +
                'uniform sampler2D envMap;\nvoid main(){vec3 d=normalize(direction);vec2 uv=vec2(atan(d.z,d.x)*0.15915494309189535+0.5,asin(clamp(d.y,-1.0,1.0))*0.3183098861837907+0.5);fragColor=vec4(texture(envMap,uv).rgb,1.0);}',
            { envMap: { value: null } },
        ));
    }
    _draw(
        material: RawShaderMaterial,
        index: number,
        target: WebGLRenderTarget,
        box: readonly [number, number, number, number],
    ): void {
        rectangle(target, ...box);
        this._renderer.setRenderTarget(target);
        const mesh = new Mesh(this._lodPlanes[index], material);
        mesh.frustumCulled = false;
        this._renderer.render(mesh, this._flatCamera);
    }
    _convert(texture: PMREMSourceTexture, target: WebGLRenderTarget): void {
        const cube = !!(
                texture.isCubeTexture ||
                texture.mapping === CubeReflectionMapping ||
                texture.mapping === CUBE_REFRACTION_MAPPING
            ),
            material = this._inputMaterial(cube);
        material.uniforms.envMap.value = texture;
        if (cube) material.uniforms.flipEnvMap.value = texture.isRenderTargetTexture === false ? -1 : 1;
        this._draw(material, 0, target, [0, 0, 3 * this._cubeSize, 2 * this._cubeSize]);
    }
    _halfBlur(
        input: WebGLRenderTarget,
        output: WebGLRenderTarget,
        inIndex: number,
        outIndex: number,
        sigma: number,
        latitudinal: boolean,
        pole?: Vector3,
    ): void {
        const u = this._blurMaterial!.uniforms,
            pixels = this._sizeLods[inIndex] - 1;
        const delta = Number.isFinite(sigma) ? Math.PI / (2 * pixels) : (2 * Math.PI) / (2 * MAX_SAMPLES - 1),
            sd = sigma / delta;
        const samples = Number.isFinite(sigma) ? 1 + Math.floor(3 * sd) : MAX_SAMPLES;
        if (samples > MAX_SAMPLES)
            console.warn(`AirPMREM: blur requests ${samples} samples; truncated to ${MAX_SAMPLES}`);
        const weights: number[] = [];
        let sum = 0;
        for (let i = 0; i < MAX_SAMPLES; i++) {
            const x = i / sd,
                w = Math.exp((-x * x) / 2);
            weights.push(w);
            if (i === 0) sum += w;
            else if (i < samples) sum += 2 * w;
        }
        for (let i = 0; i < MAX_SAMPLES; i++) weights[i] /= sum;
        u.envMap.value = input.texture;
        u.samples.value = samples;
        u.weights.value = weights;
        u.latitudinal.value = latitudinal;
        u.dTheta.value = delta;
        u.mipInt.value = this._lodMax - inIndex;
        if (pole) u.poleAxis.value = pole;
        const size = this._sizeLods[outIndex],
            extra = outIndex - this._lodMax + MIN_MIP;
        this._draw(this._blurMaterial!, outIndex, output, [
            3 * size * Math.max(0, extra),
            4 * (this._cubeSize - size),
            3 * size,
            2 * size,
        ]);
    }
    _blur(target: WebGLRenderTarget, inIndex: number, outIndex: number, sigma: number, pole?: Vector3): void {
        this._halfBlur(target, this._pingPongRenderTarget!, inIndex, outIndex, sigma, true, pole);
        this._halfBlur(this._pingPongRenderTarget!, target, outIndex, outIndex, sigma, false, pole);
    }
    _filter(target: WebGLRenderTarget): void {
        const count = this._layout!.levels.length;
        this._renderer.autoClear = false;
        for (let i = 1; i < count; i++) {
            const sigma = Math.sqrt(this._sigmas[i] ** 2 - this._sigmas[i - 1] ** 2);
            const pole = new Vector3(...AXES[(count - i - 1) % AXES.length]);
            this._blur(target, i - 1, i, sigma, pole);
        }
    }
    _fromTexture(texture: PMREMSourceTexture, target: WebGLRenderTarget | null, cube: boolean): WebGLRenderTarget {
        const image = texture.image as (PMREMImageInfo[] & PMREMImageInfo) | undefined;
        const size = Number(
            cube
                ? image?.length === 0
                    ? 16
                    : (image?.[0]?.width ?? image?.[0]?.image?.width ?? image?.width)
                : (image?.width ?? NaN) / 4,
        );
        if (target) {
            const layout = pmremLayout(size);
            this._cubeSize = layout.cubeSize;
            this._lodMax = layout.lodMax;
            if (!this._lodPlanes.length)
                throw new Error('Initialize PMREM level resources before supplying an external render target');
        } else this._prepare(size);
        const output = target ?? this._newTarget();
        const renderer = this._renderer,
            state = save(renderer);
        try {
            renderer.xr.enabled = false;
            this._convert(texture, output);
            this._filter(output);
            return output;
        } finally {
            output.scissorTest = false;
            rectangle(output, 0, 0, output.width, output.height);
            restore(renderer, state);
        }
    }
    fromCubemap(texture: PMREMSourceTexture, target: WebGLRenderTarget | null = null): WebGLRenderTarget {
        return this._fromTexture(texture, target, true);
    }
    fromEquirectangular(texture: PMREMSourceTexture, target: WebGLRenderTarget | null = null): WebGLRenderTarget {
        return this._fromTexture(texture, target, false);
    }
    fromScene(scene: Scene, sigma = 0, near = 0.1, far = 100, options: PMREMSceneOptions = {}): WebGLRenderTarget {
        this._prepare(options.size ?? 256);
        const output = this._newTarget();
        output.depthBuffer = true;
        const renderer = this._renderer,
            state = save(renderer),
            background = scene.background,
            source = background as PMREMBackground | null,
            position = options.position ?? new Vector3(),
            camera = new PerspectiveCamera(90, 1, near, far);
        try {
            renderer.xr.enabled = false;
            renderer.autoClear = false;
            renderer.toneMapping = NoToneMapping;
            if (source?.isTexture) this._convert(source, output);
            else {
                const color = source?.isColor ? source : renderer.getClearColor(new Color());
                const m = (this._solidMaterial ??= raw(
                    'AirPMREM.SolidBackground',
                    FRAGMENT_HEADER + 'uniform vec3 color;\nvoid main(){fragColor=vec4(color,1.0);}',
                    { color: { value: new Color() } },
                ));
                m.uniforms.color.value.copy(color);
                this._draw(m, 0, output, [0, 0, 3 * this._cubeSize, 2 * this._cubeSize]);
            }
            scene.background = null;
            const up = [1, -1, 1, 1, 1, 1],
                sign = [1, 1, 1, -1, -1, -1];
            renderer.setRenderTarget(output);
            renderer.clear(false, true, false);
            for (let face = 0; face < 6; face++) {
                const axis = face % 3;
                camera.position.copy(position);
                if (axis === 0) {
                    camera.up.set(0, up[face], 0);
                    camera.lookAt(position.x + sign[face], position.y, position.z);
                } else if (axis === 1) {
                    camera.up.set(0, 0, up[face]);
                    camera.lookAt(position.x, position.y + sign[face], position.z);
                } else {
                    camera.up.set(0, up[face], 0);
                    camera.lookAt(position.x, position.y, position.z + sign[face]);
                }
                rectangle(output, axis * this._cubeSize, face > 2 ? this._cubeSize : 0, this._cubeSize, this._cubeSize);
                renderer.setRenderTarget(output);
                renderer.render(scene, camera);
            }
            if (sigma > 0) this._blur(output, 0, 0, sigma);
            this._filter(output);
            return output;
        } finally {
            scene.background = background;
            output.scissorTest = false;
            rectangle(output, 0, 0, output.width, output.height);
            restore(renderer, state);
        }
    }
    _compile(material: RawShaderMaterial): void {
        if (!this._lodPlanes.length) this._prepare(16);
        const mesh = new Mesh(this._lodPlanes[0], material);
        if (typeof this._renderer.compile === 'function') this._renderer.compile(mesh, this._flatCamera);
        else if (typeof this._renderer._material === 'function') this._renderer._material(material);
        else throw new Error('Renderer does not provide shader compilation; PMREM precompile cannot be completed');
    }
    compileCubemapShader(): void {
        this._compile(this._inputMaterial(true));
    }
    compileEquirectangularShader(): void {
        this._compile(this._inputMaterial(false));
    }
    _releaseLevels(): void {
        this._blurMaterial?.dispose();
        this._pingPongRenderTarget?.dispose();
        for (const g of this._lodPlanes) g.dispose();
        this._blurMaterial = null;
        this._pingPongRenderTarget = null;
        this._lodPlanes = [];
    }
    dispose(): void {
        this._releaseLevels();
        this._cubemapMaterial?.dispose();
        this._equirectMaterial?.dispose();
        this._solidMaterial?.dispose();
        this._cubemapMaterial = null;
        this._equirectMaterial = null;
        this._solidMaterial = null;
        this._layout = null;
    }
}
