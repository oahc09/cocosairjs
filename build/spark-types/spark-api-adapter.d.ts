/**
 * Cocos AIR — Spark three.js-API 兼容门面（SPK-05a）。
 *
 * 本文件由 `spark-cocosairjs/src/air-compat.js` 逐成员转为 TypeScript：它是「冻结上游
 * Spark 的 three API 面 → CocosAirJS 元素」的适配器，供构建期把 `three` specifier
 * 重定向到此模块（SPK-11）。它不 `import` Three.js 运行库；GPU 工作全部在 CocosRenderer
 * 侧经原生 gfx 完成，本层只承载 CPU 场景/数据契约。数学符号（Vec/Mat/Quat/Color/Ray/Box3）
 * 由并行的 SPK-04 `./spark-math`（委托 `cc.math`）提供并原样再导出；PMREMGenerator 由
 * SPK-06 `./pmrem` 提供。本层不进 `cocosair` 根导出面（SPK-05a 硬约束 1）。
 *
 * 逐成员归属见每条 `@air-element` 注释；标注为 `none` 者为引擎无对应 API 形状、本层自持的
 * three 侧协议常量或兼容簿记类（其数值算法仍委托 ./spark-math → cc.math，无重复算法实现）。
 */
import { Euler, Matrix4, Quaternion, Vector3 } from './spark-math';
export * from './spark-math';
export declare const REVISION = "180";
export declare const FrontSide = 0;
export declare const BackSide = 1;
export declare const DoubleSide = 2;
export declare const NoBlending = 0;
export declare const NormalBlending = 1;
export declare const AdditiveBlending = 2;
export declare const SubtractiveBlending = 3;
export declare const MultiplyBlending = 4;
export declare const CustomBlending = 5;
export declare const AddEquation = 100;
export declare const SubtractEquation = 101;
export declare const ReverseSubtractEquation = 102;
export declare const MinEquation = 103;
export declare const MaxEquation = 104;
export declare const ZeroFactor = 200;
export declare const OneFactor = 201;
export declare const SrcColorFactor = 202;
export declare const OneMinusSrcColorFactor = 203;
export declare const SrcAlphaFactor = 204;
export declare const OneMinusSrcAlphaFactor = 205;
export declare const DstAlphaFactor = 206;
export declare const OneMinusDstAlphaFactor = 207;
export declare const DstColorFactor = 208;
export declare const OneMinusDstColorFactor = 209;
export declare const SrcAlphaSaturateFactor = 210;
export declare const NeverDepth = 0;
export declare const AlwaysDepth = 1;
export declare const LessDepth = 2;
export declare const LessEqualDepth = 3;
export declare const EqualDepth = 4;
export declare const GreaterEqualDepth = 5;
export declare const GreaterDepth = 6;
export declare const NotEqualDepth = 7;
export declare const NoToneMapping = 0;
export declare const LinearToneMapping = 1;
export declare const ReinhardToneMapping = 2;
export declare const ACESFilmicToneMapping = 4;
export declare const UVMapping = 300;
export declare const CubeReflectionMapping = 301;
export declare const CubeUVReflectionMapping = 306;
export declare const RepeatWrapping = 1000;
export declare const ClampToEdgeWrapping = 1001;
export declare const MirroredRepeatWrapping = 1002;
export declare const NearestFilter = 1003;
export declare const NearestMipmapNearestFilter = 1004;
export declare const NearestMipmapLinearFilter = 1005;
export declare const LinearFilter = 1006;
export declare const LinearMipmapNearestFilter = 1007;
export declare const LinearMipmapLinearFilter = 1008;
export declare const LinearMipMapLinearFilter = 1008;
export declare const UnsignedByteType = 1009;
export declare const ByteType = 1010;
export declare const ShortType = 1011;
export declare const UnsignedShortType = 1012;
export declare const IntType = 1013;
export declare const UnsignedIntType = 1014;
export declare const FloatType = 1015;
export declare const HalfFloatType = 1016;
export declare const AlphaFormat = 1021;
export declare const RGBFormat = 1022;
export declare const RGBAFormat = 1023;
export declare const DepthFormat = 1026;
export declare const DepthStencilFormat = 1027;
export declare const RedFormat = 1028;
export declare const RedIntegerFormat = 1029;
export declare const RGFormat = 1030;
export declare const RGIntegerFormat = 1031;
export declare const RGBIntegerFormat = 1032;
export declare const RGBAIntegerFormat = 1033;
export declare const GLSL1 = "100";
export declare const GLSL3 = "300 es";
export declare const WebGLCoordinateSystem = 2000;
export declare const WebGPUCoordinateSystem = 2001;
export declare const StaticDrawUsage = 35044;
export declare const DynamicDrawUsage = 35048;
export declare const StreamDrawUsage = 35040;
export declare const MOUSE: {
    LEFT: number;
    MIDDLE: number;
    RIGHT: number;
    ROTATE: number;
    DOLLY: number;
    PAN: number;
};
export declare const TOUCH: {
    ROTATE: number;
    PAN: number;
    DOLLY_PAN: number;
    DOLLY_ROTATE: number;
};
export declare class EventDispatcher {
    _listeners?: Record<string, Set<any>>;
    addEventListener(type: string, listener: any): void;
    hasEventListener(type: string, listener: any): boolean;
    removeEventListener(type: string, listener: any): void;
    dispatchEvent(event: any): void;
}
export declare class Layers {
    mask: number;
    constructor();
    set(c: number): void;
    enable(c: number): void;
    enableAll(): void;
    toggle(c: number): void;
    disable(c: number): void;
    disableAll(): void;
    test(l: Layers): boolean;
    isEnabled(c: number): boolean;
}
export declare class Object3D extends EventDispatcher {
    static DEFAULT_UP: Vector3;
    static DEFAULT_MATRIX_AUTO_UPDATE: boolean;
    static DEFAULT_MATRIX_WORLD_AUTO_UPDATE: boolean;
    [key: string]: any;
    constructor();
    onBeforeRender(): void;
    onAfterRender(): void;
    onBeforeShadow(): void;
    onAfterShadow(): void;
    add(...objects: any[]): this;
    remove(...objects: any[]): this;
    removeFromParent(): this;
    clear(): this;
    attach(o: any): this;
    traverse(fn: (o: any) => void): void;
    traverseVisible(fn: (o: any) => void): void;
    traverseAncestors(fn: (o: any) => void): void;
    getObjectByProperty(k: string, v: any): any;
    getObjectByName(v: any): any;
    getObjectById(v: any): any;
    getObjectsByProperty(k: string, v: any, result?: any[]): any[];
    updateMatrix(): void;
    updateMatrixWorld(force?: boolean): void;
    updateWorldMatrix(updateParents: boolean, updateChildren: boolean): void;
    applyMatrix4(m: Matrix4): this;
    applyQuaternion(q: Quaternion): this;
    setRotationFromAxisAngle(axis: Vector3, a: number): void;
    setRotationFromEuler(e: Euler): void;
    setRotationFromMatrix(m: Matrix4): void;
    setRotationFromQuaternion(q: Quaternion): void;
    rotateOnAxis(a: Vector3, t: number): this;
    rotateOnWorldAxis(a: Vector3, t: number): this;
    rotateX(t: number): this;
    rotateY(t: number): this;
    rotateZ(t: number): this;
    translateOnAxis(a: Vector3, d: number): this;
    translateX(d: number): this;
    translateY(d: number): this;
    translateZ(d: number): this;
    localToWorld(v: Vector3): Vector3;
    worldToLocal(v: Vector3): Vector3;
    getWorldPosition(t: Vector3): Vector3;
    getWorldQuaternion(t: Quaternion): Quaternion;
    getWorldScale(t: Vector3): Vector3;
    getWorldDirection(t: Vector3): Vector3;
    lookAt(x: any, y?: number, z?: number): void;
    copy(o: any, recursive?: boolean): this;
    clone(recursive?: boolean): any;
    raycast(): void;
}
export declare class Group extends Object3D {
    constructor();
}
export declare class Scene extends Object3D {
    constructor();
}
export declare class Camera extends Object3D {
    constructor();
    updateMatrixWorld(force?: boolean): void;
    updateWorldMatrix(a: boolean, b: boolean): void;
    getWorldDirection(t: Vector3): Vector3;
    copy(o: any, r?: boolean): this;
}
export declare class PerspectiveCamera extends Camera {
    constructor(fov?: number, aspect?: number, near?: number, far?: number);
    updateProjectionMatrix(): void;
    getFilmWidth(): number;
    getFilmHeight(): number;
    getFocalLength(): number;
    setFocalLength(v: number): void;
    getEffectiveFOV(): number;
    setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void;
    clearViewOffset(): void;
    copy(o: any, r?: boolean): this;
}
export declare class OrthographicCamera extends Camera {
    constructor(left?: number, right?: number, top?: number, bottom?: number, near?: number, far?: number);
    updateProjectionMatrix(): void;
    setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void;
    clearViewOffset(): void;
    copy(o: any, r?: boolean): this;
}
export declare class BufferAttribute {
    [key: string]: any;
    constructor(array: any, itemSize: number, normalized?: boolean);
    set needsUpdate(v: boolean);
    setUsage(v: number): this;
    addUpdateRange(start: number, count: number): void;
    clearUpdateRanges(): void;
    copy(a: any): this;
    clone(): any;
    set(a: any, offset?: number): this;
    getX(i: number): any;
    getY(i: number): any;
    getZ(i: number): any;
    getW(i: number): any;
    setX(i: number, x: number): this;
    setY(i: number, y: number): this;
    setZ(i: number, z: number): this;
    setW(i: number, w: number): this;
    setXY(i: number, x: number, y: number): this;
    setXYZ(i: number, x: number, y: number, z: number): this;
    setXYZW(i: number, x: number, y: number, z: number, w: number): this;
    applyMatrix4(m: Matrix4): this;
    onUpload(f: any): this;
    onUploadCallback(): void;
}
export declare class Float32BufferAttribute extends BufferAttribute {
    constructor(a: any, n: number, norm?: boolean);
}
export declare class Uint16BufferAttribute extends BufferAttribute {
    constructor(a: any, n: number, norm?: boolean);
}
export declare class Uint32BufferAttribute extends BufferAttribute {
    constructor(a: any, n: number, norm?: boolean);
}
export declare class InstancedBufferAttribute extends BufferAttribute {
    constructor(a: any, n: number, norm?: boolean, meshPerAttribute?: number);
}
export declare class BufferGeometry extends EventDispatcher {
    [key: string]: any;
    constructor();
    setAttribute(n: string, a: any): this;
    getAttribute(n: string): any;
    deleteAttribute(n: string): this;
    hasAttribute(n: string): boolean;
    setIndex(a: any): this;
    getIndex(): any;
    setDrawRange(start: number, count: number): void;
    addGroup(start: number, count: number, materialIndex?: number): void;
    clearGroups(): void;
    applyMatrix4(m: Matrix4): this;
    translate(x: number, y: number, z: number): this;
    scale(x: number, y: number, z: number): this;
    rotateX(a: number): this;
    rotateY(a: number): this;
    rotateZ(a: number): this;
    computeBoundingBox(): void;
    dispose(): void;
    clone(): any;
    copy(g: any): this;
}
export declare class InstancedBufferGeometry extends BufferGeometry {
    constructor();
    copy(g: any): this;
}
export declare class Material extends EventDispatcher {
    [key: string]: any;
    constructor();
    set needsUpdate(v: boolean);
    setValues(p: any): void;
    dispose(): void;
    copy(m: any): this;
    clone(): any;
    onBeforeCompile(): void;
    customProgramCacheKey(): string;
}
export declare class ShaderMaterial extends Material {
    constructor(parameters?: any);
    copy(m: any): this;
}
export declare class RawShaderMaterial extends ShaderMaterial {
    constructor(p?: any);
}
export declare class MeshStandardMaterial extends Material {
    constructor(p?: any);
}
export declare class MeshBasicMaterial extends Material {
    constructor(p?: any);
}
export declare class Mesh extends Object3D {
    constructor(geometry?: BufferGeometry, material?: MeshBasicMaterial);
    copy(m: any, r?: boolean): this;
    raycast(): void;
}
export declare class Source {
    [key: string]: any;
    constructor(data?: any);
    set needsUpdate(v: boolean);
}
export declare class Texture extends EventDispatcher {
    [key: string]: any;
    constructor(image?: any, mapping?: number, wrapS?: number, wrapT?: number, magFilter?: number, minFilter?: number, format?: number, type?: number, anisotropy?: number, colorSpace?: string);
    get image(): any;
    set image(v: any);
    set needsPMREMUpdate(v: boolean);
    set needsUpdate(v: boolean);
    addUpdateRange(start: number, count: number): void;
    clearUpdateRanges(): void;
    updateMatrix(): void;
    clone(): any;
    copy(t: any): this;
    dispose(): void;
}
export declare class DataTexture extends Texture {
    constructor(data?: any, width?: number, height?: number, format?: number, type?: number, mapping?: number, wrapS?: number, wrapT?: number, magFilter?: number, minFilter?: number, anisotropy?: number, colorSpace?: string);
}
export declare class DataArrayTexture extends Texture {
    constructor(data?: any, width?: number, height?: number, depth?: number);
    addLayerUpdate(layer: number): void;
    clearLayerUpdates(): void;
}
export declare class Data3DTexture extends DataArrayTexture {
    constructor(...a: any[]);
}
export declare class CubeTexture extends Texture {
    constructor(images?: any, ...a: any[]);
    get images(): any;
    set images(v: any);
}
export declare class RenderTarget extends EventDispatcher {
    [key: string]: any;
    constructor(width?: number, height?: number, options?: any);
    _createTexture(options: any): Texture;
    get texture(): any;
    set texture(v: any);
    setSize(width: number, height: number, depth?: number): void;
    dispose(): void;
    clone(): any;
    copy(r: any): this;
}
export declare class WebGLRenderTarget extends RenderTarget {
    constructor(...a: any[]);
}
export declare class WebGLArrayRenderTarget extends WebGLRenderTarget {
    constructor(width?: number, height?: number, depth?: number, options?: any);
}
export declare class WebGLCubeRenderTarget extends WebGLRenderTarget {
    constructor(size?: number, options?: any);
}
export declare class CubeCamera extends Object3D {
    constructor(near: number, far: number, renderTarget: any);
    updateCoordinateSystem(): void;
    update(renderer: any, scene: any): void;
}
export { PMREMGenerator } from './pmrem';
export declare class WebGLRenderer {
    constructor();
}
export declare class Raycaster {
    [key: string]: any;
    constructor(origin: any, direction: any, near?: number, far?: number);
    set(o: any, d: any): void;
    setFromCamera(p: any, c: any): void;
    intersectObject(o: any, recursive?: boolean, result?: any[]): any[];
    intersectObjects(objects: any[], recursive?: boolean, result?: any[]): any[];
}
export declare class LoadingManager {
    [key: string]: any;
    constructor(onLoad?: any, onProgress?: any, onError?: any);
    itemStart(url: string): void;
    itemEnd(url: string): void;
    itemError(url: string): void;
    resolveURL(url: string): any;
    setURLModifier(fn: any): this;
    addHandler(regex: any, loader: any): this;
    removeHandler(regex: any): this;
    getHandler(file: string): any;
}
export declare const DefaultLoadingManager: LoadingManager;
export declare class Loader {
    [key: string]: any;
    constructor(manager?: any);
    setCrossOrigin(v: any): this;
    setWithCredentials(v: any): this;
    setPath(v: any): this;
    setResourcePath(v: any): this;
    setRequestHeader(v: any): this;
    load(url?: any, onLoad?: any, onProgress?: any, onError?: any): any;
    loadAsync(url: any, onProgress?: any): Promise<any>;
}
export declare class FileLoader extends Loader {
    constructor(m?: any);
    setResponseType(v: any): this;
    setMimeType(v: any): this;
    load(url: any, onLoad?: any, onProgress?: any, onError?: any): void;
}
export declare class Timer {
    [key: string]: any;
    constructor();
    connect(d: any): this;
    disconnect(): void;
    getDelta(): number;
    getElapsed(): number;
    getTimescale(): any;
    setTimescale(v: number): this;
    reset(): this;
    dispose(): void;
    update(t?: number): this;
}
export declare class Clock {
    autoStart: boolean;
    running: boolean;
    oldTime: number;
    elapsedTime: number;
    constructor(autoStart?: boolean);
    start(): void;
    stop(): void;
    getDelta(): number;
    getElapsedTime(): number;
}
export declare const UniformsUtils: {
    clone(uniforms: any): any;
    merge(list: any[]): any;
};
export declare class Uniform {
    value: any;
    constructor(value: any);
    clone(): Uniform;
}
export declare const ShaderChunk: {
    logdepthbuf_pars_vertex: string;
    logdepthbuf_vertex: string;
    logdepthbuf_pars_fragment: string;
    logdepthbuf_fragment: string;
};
export declare class FullScreenQuad {
    _mesh: Mesh;
    _camera: OrthographicCamera;
    constructor(material: any);
    get material(): any;
    set material(v: any);
    dispose(): void;
    render(renderer: any): void;
}
export declare const COCOS_AIR_COMPAT: {
    engine: string;
    contractRevision: number;
    implementation: string;
    unsupported: string[];
};
