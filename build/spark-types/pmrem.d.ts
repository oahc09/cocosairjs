import { BufferGeometry, OrthographicCamera, RawShaderMaterial, Scene, WebGLRenderTarget } from './spark-api-adapter';
import { Color, Vector3 } from './spark-math';
interface PMREMSourceTexture {
    isCubeTexture?: boolean;
    isRenderTargetTexture?: boolean;
    mapping?: number;
    image?: unknown;
}
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
    xr: {
        enabled: boolean;
    };
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
export declare const CUBEUV_SAMPLING_GLSL = "\nfloat airCubeFace(vec3 d){\n vec3 a=abs(d);\n if(a.x>a.z){if(a.x>a.y)return d.x>0.0?0.0:3.0;else return d.y>0.0?1.0:4.0;}\n else{if(a.z>a.y)return d.z>0.0?2.0:5.0;else return d.y>0.0?1.0:4.0;}\n}\nvec2 airCubeFaceUV(vec3 d,float f){\n vec2 uv;\n if(f==0.0)uv=vec2(d.z,d.y)/abs(d.x);\n else if(f==1.0)uv=vec2(-d.x,-d.z)/abs(d.y);\n else if(f==2.0)uv=vec2(-d.x,d.y)/abs(d.z);\n else if(f==3.0)uv=vec2(-d.z,d.y)/abs(d.x);\n else if(f==4.0)uv=vec2(-d.x,d.z)/abs(d.y);\n else uv=vec2(d.x,d.y)/abs(d.z);\n return 0.5*(uv+1.0);\n}\nvec3 airBilinearCubeUV(sampler2D atlas,vec3 d,float mip){\n float face=airCubeFace(d);\n float extra=max(4.0-mip,0.0);\n mip=max(mip,4.0);\n float size=exp2(mip);\n highp vec2 uv=airCubeFaceUV(d,face)*(size-2.0)+1.0;\n if(face>2.0){uv.y+=size;face-=3.0;}\n uv.x+=face*size;\n uv.x+=extra*3.0*16.0;\n uv.y+=4.0*(exp2(CUBEUV_MAX_MIP)-size);\n uv.x*=CUBEUV_TEXEL_WIDTH;\n uv.y*=CUBEUV_TEXEL_HEIGHT;\n return textureGrad(atlas,uv,vec2(0.0),vec2(0.0)).rgb;\n}\nfloat airRoughnessToMip(float r){\n if(r>=0.8)return (1.0-r)*(-1.0-(-2.0))/(1.0-0.8)+(-2.0);\n if(r>=0.4)return (0.8-r)*(2.0-(-1.0))/(0.8-0.4)+(-1.0);\n if(r>=0.305)return (0.4-r)*(3.0-2.0)/(0.4-0.305)+2.0;\n if(r>=0.21)return (0.305-r)*(4.0-3.0)/(0.305-0.21)+3.0;\n return -2.0*log2(1.16*r);\n}\nvec4 airTextureCubeUV(sampler2D atlas,vec3 d,float roughness){\n float mip=clamp(airRoughnessToMip(roughness),-2.0,CUBEUV_MAX_MIP);\n float fraction=fract(mip),whole=floor(mip);\n vec3 c=airBilinearCubeUV(atlas,d,whole);\n if(fraction==0.0)return vec4(c,1.0);\n return vec4(mix(c,airBilinearCubeUV(atlas,d,whole+1.0),fraction),1.0);\n}\n";
export declare function pmremLayout(requestedSize: number): PMREMLayout;
export declare class PMREMGenerator {
    _renderer: PMREMRenderer;
    _pingPongRenderTarget: WebGLRenderTarget | null;
    _lodPlanes: BufferGeometry[];
    _sizeLods: number[];
    _sigmas: number[];
    _blurMaterial: RawShaderMaterial | null;
    _cubemapMaterial: RawShaderMaterial | null;
    _equirectMaterial: RawShaderMaterial | null;
    _solidMaterial: RawShaderMaterial | null;
    _flatCamera: OrthographicCamera;
    _layout: PMREMLayout | null;
    _cubeSize: number;
    _lodMax: number;
    constructor(renderer: PMREMRenderer);
    _prepare(size: number): void;
    _newTarget(): WebGLRenderTarget;
    _inputMaterial(cube: boolean): RawShaderMaterial;
    _draw(material: RawShaderMaterial, index: number, target: WebGLRenderTarget, box: readonly [number, number, number, number]): void;
    _convert(texture: PMREMSourceTexture, target: WebGLRenderTarget): void;
    _halfBlur(input: WebGLRenderTarget, output: WebGLRenderTarget, inIndex: number, outIndex: number, sigma: number, latitudinal: boolean, pole?: Vector3): void;
    _blur(target: WebGLRenderTarget, inIndex: number, outIndex: number, sigma: number, pole?: Vector3): void;
    _filter(target: WebGLRenderTarget): void;
    _fromTexture(texture: PMREMSourceTexture, target: WebGLRenderTarget | null, cube: boolean): WebGLRenderTarget;
    fromCubemap(texture: PMREMSourceTexture, target?: WebGLRenderTarget | null): WebGLRenderTarget;
    fromEquirectangular(texture: PMREMSourceTexture, target?: WebGLRenderTarget | null): WebGLRenderTarget;
    fromScene(scene: Scene, sigma?: number, near?: number, far?: number, options?: PMREMSceneOptions): WebGLRenderTarget;
    _compile(material: RawShaderMaterial): void;
    compileCubemapShader(): void;
    compileEquirectangularShader(): void;
    _releaseLevels(): void;
    dispose(): void;
}
export {};
