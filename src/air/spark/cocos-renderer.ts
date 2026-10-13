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
/**
 * Spark's rendering contract on native CocosAirJS gfx. No Three renderer or GPU implementation is
 * used. Cocos owns textures, buffers, shaders, VAOs, PSOs, framebuffers and draw commands. The
 * WebGL2 device escape hatch is limited to standalone uniform uploads, asynchronous PBO readback,
 * and upstream explicit sub-image uploads. See ai/plans/spark-integration.md (SPK-07/SPK-10) for the
 * audited gfx corrections and the XR-removal boundary this file ships.
 *
 * SPK-07 port of spark-cocosairjs/src/CocosRenderer.js. The former `import * as A from './air-compat.js'`
 * now imports only the symbols this file constructs or compares against, from the TS api-adapter
 * (./spark-api-adapter, SPK-05a). Hand-rolled vector/matrix/color math stays delegated to that adapter;
 * every GPU resource is created and submitted through native cocos gfx (../../cocos/gfx, SPK-1.3).
 * The locally declared `Spark*` interfaces below only describe the duck-typed surface of adapter/Spark
 * objects this file reads; they carry no algorithm and change no numeric value.
 */
import {
    AddEquation,
    AdditiveBlending,
    BackSide,
    Color,
    CustomBlending,
    DoubleSide,
    FloatType,
    HalfFloatType,
    IntType,
    LessEqualDepth,
    LinearFilter,
    LinearMipmapLinearFilter,
    LinearMipmapNearestFilter,
    Matrix4,
    MirroredRepeatWrapping,
    MultiplyBlending,
    NearestFilter,
    NearestMipmapLinearFilter,
    NearestMipmapNearestFilter,
    NoBlending,
    NormalBlending,
    OneMinusSrcAlphaFactor,
    RGBAIntegerFormat,
    RGFormat,
    RGIntegerFormat,
    RedFormat,
    RedIntegerFormat,
    RepeatWrapping,
    SRGBColorSpace,
    ShaderChunk,
    SrcAlphaFactor,
    SubtractiveBlending,
    UnsignedIntType,
    UnsignedShortType,
    Vector3,
    WebGLCoordinateSystem,
} from './spark-api-adapter';
import type {
    Attribute,
    BlendFactor,
    BlendOp,
    Buffer,
    CommandBuffer,
    ComparisonFunc,
    DescriptorSet,
    DescriptorSetLayout,
    Framebuffer,
    Format,
    InputAssembler,
    PipelineLayout,
    PipelineState,
    RenderPass,
    Sampler,
    Shader,
    StencilOp,
    Texture,
    TextureType,
} from '../../cocos/gfx';
import type { WebGL2Device } from '../../cocos/gfx/webgl2/webgl2-device';
import type { WebGL2Texture } from '../../cocos/gfx/webgl2/webgl2-texture';
import type { WebGL2Shader } from '../../cocos/gfx/webgl2/webgl2-shader';
import type { WebGL2Buffer } from '../../cocos/gfx/webgl2/webgl2-buffer';
import type { WebGL2Framebuffer } from '../../cocos/gfx/webgl2/webgl2-framebuffer';

// 冻结 Spark 本体在 onBeforeRender 中无条件读取 renderer.xr.*（enabled / isPresenting /
// getSession）。AIR 不提供 XR 会话，故保留恒空闲外壳使冻结代码短路到非 XR 分支；
// 不实现 setSession/setFoveation 等会话能力。
// SPK-10：原 `this.xr = new CocosXrManager(this)` 与其 sessionstart/sessionend 监听、
// setAnimationLoop 会话转发、dispose 链随 XR 管理器一并移除，缩减为恒非 XR 行为；
// 常规 requestAnimationFrame 渲染循环与 dispose 保持原语义。
interface InertXrShell {
    enabled: boolean;
    isPresenting: boolean;
    getSession(): null;
    getCamera(): null;
    setAnimationLoop(callback: AnimationLoopCallback | null): void;
}
const inertXr: InertXrShell = {
    enabled: false,
    isPresenting: false,
    getSession: () => null,
    getCamera: () => null,
    setAnimationLoop: () => {},
};

type GfxNamespace = typeof import('../../cocos/gfx');
type NumericArray =
    | Int8Array
    | Uint8Array
    | Uint8ClampedArray
    | Int16Array
    | Uint16Array
    | Int32Array
    | Uint32Array
    | Float32Array
    | Float64Array;
type AnimationLoopCallback = (time: number, ...args: unknown[]) => void;

/** Structural surface of the dynamically imported cocosair engine namespace, as `create()` uses it. */
interface AirAppSurface {
    run(scene: unknown): void | Promise<unknown>;
    close?(): void | Promise<unknown>;
}
interface AirNodeSurface {
    addChild(node: AirNodeSurface): void;
    addComponent(cameraClass: unknown): { visibility: number };
}
interface AirSceneSurface {
    addChild(node: AirNodeSurface): void;
}
interface AirEngineSurface {
    macro: { ENABLE_WEBGL_ANTIALIAS: boolean; ENABLE_TRANSPARENT_CANVAS: boolean };
    createAirApp(options: {
        canvas: HTMLCanvasElement;
        pixelRatioCap: number;
        diagnostics: string;
    }): Promise<AirAppSurface>;
    Scene: new (name?: string) => AirSceneSurface;
    Node: new (name?: string) => AirNodeSurface;
    Camera: unknown;
    Size: new (width: number, height: number) => unknown;
    screen: { windowSize: unknown };
    view: { setDesignResolutionSize(width: number, height: number, policy: unknown): void };
    ResolutionPolicy: { EXACT_FIT: unknown };
    director: {
        root: {
            device: WebGL2Device;
            resize(width: number, height: number): void;
            mainWindow: { framebuffer: WebGL2Framebuffer };
        };
    };
    game: { pause(): void };
    gfx: GfxNamespace;
}

/** Duck-typed shapes of adapter/Spark objects this renderer reads (no algorithm, fields only). */
interface SparkUniforms {
    [name: string]: { value: unknown } | undefined;
}
interface SparkImageData {
    width?: number;
    height?: number;
    depth?: number;
    data?: NumericArray | null;
    image?: SparkImageData;
}
interface SparkLayerUpdates {
    readonly size: number;
    [Symbol.iterator](): Iterator<number>;
}
interface SparkTexture {
    id?: number | string;
    uuid?: string;
    internalFormat?: string;
    format?: number;
    type?: number;
    colorSpace?: string;
    isDataArrayTexture?: boolean;
    isData3DTexture?: boolean;
    isCubeTexture?: boolean;
    isRenderTargetTexture?: boolean;
    renderTarget?: unknown;
    generateMipmaps?: boolean;
    version?: number;
    needsUpdate?: boolean;
    unpackAlignment?: number;
    minFilter?: number;
    magFilter?: number;
    wrapS?: number;
    wrapT?: number;
    wrapR?: number;
    anisotropy?: number;
    image?: SparkImageData | null;
    source?: { data?: SparkImageData; dataReady?: boolean } | null;
    layerUpdates?: SparkLayerUpdates;
    clearLayerUpdates?: () => void;
    addEventListener?: (type: string, callback: () => void) => void;
}
interface SparkAttribute {
    array: NumericArray;
    itemSize: number;
    count?: number;
    normalized?: boolean;
    version?: number;
    isInstancedBufferAttribute?: boolean;
    isInterleavedBufferAttribute?: boolean;
}
interface SparkGeometry {
    attributes: Record<string, SparkAttribute | undefined>;
    index?: SparkAttribute | null;
    instanceCount?: number;
    drawRange?: { start: number; count: number };
    addEventListener?: (type: string, callback: () => void) => void;
}
const STATE_KEYS = [
    'side',
    'transparent',
    'blending',
    'depthTest',
    'depthWrite',
    'depthFunc',
    'colorWrite',
    'premultipliedAlpha',
    'blendSrc',
    'blendDst',
    'blendSrcAlpha',
    'blendDstAlpha',
    'blendEquation',
    'blendEquationAlpha',
    'blendAlpha',
    'polygonOffset',
    'polygonOffsetFactor',
    'polygonOffsetUnits',
    'alphaToCoverage',
    'stencilWrite',
    'stencilFunc',
    'stencilRef',
    'stencilFuncMask',
    'stencilWriteMask',
    'stencilFail',
    'stencilZFail',
    'stencilZPass',
] as const;
interface SparkMaterial {
    id?: number | string;
    name?: string;
    type?: string;
    version?: number;
    visible?: boolean;
    vertexShader?: string;
    fragmentShader?: string;
    defines?: Record<string, string | number | boolean | undefined>;
    wireframe?: boolean;
    uniforms?: SparkUniforms;
    premultipliedAlpha?: boolean;
    isRawShaderMaterial?: boolean;
    transparent?: boolean;
    blending?: number;
    side?: number;
    depthTest?: boolean;
    depthWrite?: boolean;
    depthFunc?: number;
    colorWrite?: boolean;
    blendSrc?: number;
    blendDst?: number;
    blendSrcAlpha?: number;
    blendDstAlpha?: number;
    blendEquation?: number;
    blendEquationAlpha?: number;
    blendAlpha?: number;
    blendColor?: Color;
    polygonOffset?: boolean;
    polygonOffsetFactor?: number;
    polygonOffsetUnits?: number;
    alphaToCoverage?: boolean;
    stencilWrite?: boolean;
    stencilFunc?: number;
    stencilRef?: number;
    stencilFuncMask?: number;
    stencilWriteMask?: number;
    stencilFail?: number;
    stencilZFail?: number;
    stencilZPass?: number;
    onBeforeRender?: (
        renderer: CocosRenderer,
        scene: SparkObject,
        camera: SparkCamera | null,
        geometry: SparkGeometry | null | undefined,
        material: SparkMaterial,
        group: unknown,
    ) => void;
    addEventListener?: (type: string, callback: () => void) => void;
}
interface SparkLayers {
    test(layers: unknown): boolean;
}
interface SparkObject {
    visible?: boolean;
    children?: SparkObject[];
    geometry?: SparkGeometry | null;
    material?: SparkMaterial | SparkMaterial[] | null;
    layers?: SparkLayers;
    matrixWorld?: Matrix4;
    renderOrder?: number;
    onBeforeRender?: (
        renderer: CocosRenderer,
        scene: SparkObject,
        camera: SparkCamera | null,
        geometry: SparkGeometry | null | undefined,
        material: SparkMaterial,
        group: unknown,
    ) => void;
    onAfterRender?: (
        renderer: CocosRenderer,
        scene: SparkObject,
        camera: SparkCamera | null,
        geometry: SparkGeometry,
        material: SparkMaterial,
        group: unknown,
    ) => void;
    traverse?: (callback: (object: SparkObject) => void) => void;
    updateMatrixWorld?: (force?: boolean) => void;
}
interface SparkRectLike {
    x?: number;
    y?: number;
    z?: number;
    w?: number;
    width?: number;
    height?: number;
}
interface SparkCamera {
    visible?: boolean;
    parent?: SparkObject | null;
    children?: SparkObject[];
    layers?: SparkLayers;
    position?: Vector3;
    matrix?: Matrix4;
    matrixWorld?: Matrix4;
    matrixWorldInverse?: Matrix4;
    projectionMatrix?: Matrix4;
    projectionMatrixInverse?: Matrix4;
    matrixWorldAutoUpdate?: boolean;
    isOrthographicCamera?: boolean;
    isArrayCamera?: boolean;
    cameras?: SparkCamera[];
    viewport?: SparkRectLike;
    near?: number;
    far?: number;
    updateMatrixWorld?: (force?: boolean) => void;
}
interface SparkRenderTarget {
    width: number;
    height: number;
    depth?: number;
    isCocosRenderTarget?: boolean;
    _cocosFramebuffer?: WebGL2Framebuffer;
    isXRRenderTarget?: boolean;
    isWebGLArrayRenderTarget?: boolean;
    isWebGLCubeRenderTarget?: boolean;
    depthBuffer?: boolean;
    stencilBuffer?: boolean;
    texture?: SparkTexture;
    textures?: SparkTexture[];
    viewport?: SparkRectLike;
    scissor?: SparkRectLike;
    scissorTest?: boolean;
    _externalFramebuffer?: WebGLFramebuffer | null;
    addEventListener?: (type: string, callback: () => void) => void;
}
interface SparkVector2Setter {
    set(x: number, y: number): unknown;
}
interface SparkVector4Setter {
    set(x: number, y: number, z: number, w: number): unknown;
}
interface SparkColorSetter {
    setRGB(r: number, g: number, b: number): unknown;
}

interface ViewportRect {
    x: number;
    y: number;
    width: number;
    height: number;
}
type UniformArray = number | boolean | number[] | NumericArray;

/** Internal native-gfx entry caches (lifetime bookkeeping mirrors the source one for one). */
interface TextureEntry {
    texture: Texture;
    signature: string;
    version: number;
    w: number;
    h: number;
    depth: number;
    format: Format;
    type: TextureType;
    renderTarget: boolean;
}
interface PassSet {
    load: RenderPass;
    clear?: RenderPass;
}
interface LayerEntry {
    views: Texture[];
    framebuffer: Framebuffer;
}
interface TargetEntry {
    signature?: string;
    textures: SparkTexture[];
    passes: PassSet;
    depth?: Texture | null;
    layers?: Map<string, LayerEntry>;
    framebuffer?: Framebuffer;
    external?: boolean;
}
interface SamplerDecl {
    name: string;
    type: string;
    count: number;
}
interface SamplerSlot extends SamplerDecl {
    binding: number;
}
interface NativeUniform {
    type: number;
    size: number;
    name: string;
    location: WebGLUniformLocation | null;
}
interface MaterialEntry {
    key: string;
    shader: Shader;
    program: WebGLProgram;
    samplers: SamplerSlot[];
    uniforms: NativeUniform[];
    layout: DescriptorSetLayout;
    pl: PipelineLayout;
    ds: DescriptorSet;
    psos: Map<string, PipelineState>;
    vs: string;
    fs: string;
}
interface GeometryEntry {
    signature: string;
    attrs: Attribute[];
    buffers: Buffer[];
    ia: InputAssembler;
}
interface FramebufferEntry {
    framebuffer: Framebuffer;
    passes: PassSet;
    width: number;
    height: number;
    views?: Texture[];
}

// @air-element none:CocosRendererOptions —— CocosRenderer.create 的启动参数包（canvas/pixelRatio/engineUrl 等），引擎无同名元素，本层自持配置形状
export interface CocosRendererOptions {
    canvas?: HTMLCanvasElement | null;
    width?: number;
    height?: number;
    pixelRatio?: number;
    engineUrl?: string;
    antialias?: boolean;
    alpha?: boolean;
    ownsApp?: boolean;
    logarithmicDepthBuffer?: boolean;
    [key: string]: unknown;
}

const I4 = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
const I3 = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
const samplerRE =
    /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?([iu]?sampler(?:2DArray|2D|3D|Cube)(?:Shadow)?)\s+(\w+)(?:\s*\[\s*(\d+)\s*\])?\s*;/g;
function uniformValue(uniforms: SparkUniforms | undefined, name: string): unknown {
    const parts = name.replace(/\[(\d+)\]/g, '.$1').split('.');
    const head = parts.shift() as string;
    let value: unknown = uniforms?.[head]?.value;
    for (const part of parts) {
        // Typed-forced accessor: the source walked `value?.[part]` over arbitrary uniform payloads.
        value = (value as Record<string, unknown> | undefined)?.[part];
    }
    return value;
}
function reMatches(re: RegExp, source: string): RegExpExecArray[] {
    // Typed-forced stand-in for String.prototype.matchAll (tsconfig lib stops at es2017); same
    // global-regex scan, same capture groups, no behavior change.
    const out: RegExpExecArray[] = [];
    const scan = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = scan.exec(source)) !== null) out.push(m);
    return out;
}
function shaderSamplers(source: string): SamplerDecl[] {
    const structs = new Map<string, SamplerDecl[]>();
    for (const match of reMatches(/\bstruct\s+(\w+)\s*\{([^}]+)\}/g, source)) {
        const fields: SamplerDecl[] = [];
        for (const f of reMatches(/\b(\w+)\s+(\w+)(?:\s*\[\s*(\d+)\s*\])?\s*;/g, match[2]))
            fields.push({ type: f[1], name: f[2], count: Number(f[3] || 1) });
        structs.set(match[1], fields);
    }
    const out = new Map<string, SamplerDecl>();
    function visit(type: string, name: string, count: number): void {
        if (/^[iu]?sampler/.test(type)) out.set(name, { name, type, count });
        else if (structs.has(type)) {
            for (let i = 0; i < count; i++)
                for (const f of structs.get(type) as SamplerDecl[])
                    visit(f.type, `${name}${count > 1 ? '[' + i + ']' : ''}.${f.name}`, f.count);
        }
    }
    for (const m of reMatches(
        /\buniform\s+(?:(?:lowp|mediump|highp)\s+)?(\w+)\s+(\w+)(?:\s*\[\s*(\d+)\s*\])?\s*;/g,
        source,
    ))
        visit(m[1], m[2], Number(m[3] || 1));
    return [...out.values()];
}
function asArray(v: unknown): UniformArray {
    // Typed-forced view of the source duck-typing: adapter math objects expose .elements/.toArray/.x/.r.
    const o = v as {
        elements?: UniformArray;
        toArray?: () => UniformArray;
        x?: number;
        y?: number;
        z?: number;
        w?: number;
        r?: number;
        g?: number;
        b?: number;
    };
    if (o?.elements) return o.elements;
    if (o?.toArray) return o.toArray();
    if (o?.x !== undefined) return [o.x, o.y, o.z, o.w].filter((x) => x !== undefined) as number[];
    if (o?.r !== undefined) return [o.r, o.g, o.b] as number[];
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
        // Typed-forced stand-in for Array.prototype.flatMap (tsconfig lib stops at es2017).
        const flat: number[] = [];
        for (const x of v as unknown[]) flat.push(...(Array.from(asArray(x) as ArrayLike<unknown>) as number[]));
        return flat;
    }
    return v as UniformArray;
}
function rect(v: SparkRectLike | null | undefined, w = 0, h = 0): ViewportRect {
    return {
        x: v?.x ?? 0,
        y: v?.y ?? 0,
        width: v?.z ?? v?.width ?? w,
        height: v?.w ?? v?.height ?? h,
    };
}

// @air-element gfx:WebGL2Device —— 全部 GPU 资源经原生 gfx（Device / WebGL2Device）创建与提交；编排循环（isArrayCamera 眼循环、uniform/PBO 逃逸面）按计划 §SPK-07 明确要求保留
export class CocosRenderer {
    static async create({
        canvas,
        width = canvas?.width || 800,
        height = canvas?.height || 600,
        pixelRatio = 1,
        engineUrl,
        antialias = false,
        alpha = true,
        ...options
    }: CocosRendererOptions = {}): Promise<CocosRenderer> {
        if (!canvas) throw new Error('CocosRenderer.create requires a canvas');
        (globalThis as { __CC_CANVAS__?: unknown }).__CC_CANVAS__ = canvas;
        (globalThis as { __CCDPR_CAP__?: unknown }).__CCDPR_CAP__ = pixelRatio;
        // The source resolved this fallback against import.meta.url; this repo's typecheck runs under
        // module=commonjs where import.meta is rejected, so the specifier stays a relative string.
        const specifier: string = engineUrl ?? '../vendor/cocos/cocosair.module.js';
        const cc = (await import(specifier)) as AirEngineSurface;
        cc.macro.ENABLE_WEBGL_ANTIALIAS = antialias;
        cc.macro.ENABLE_TRANSPARENT_CANVAS = alpha;
        const app = await cc.createAirApp({
            canvas,
            pixelRatioCap: pixelRatio,
            diagnostics: 'warnings',
        });
        const scene = new cc.Scene('SparkNativeGraphics');
        const n = new cc.Node('SparkNativeCamera');
        scene.addChild(n);
        n.addComponent(cc.Camera).visibility = 0;
        await app.run(scene);
        cc.game.pause();
        const renderer = new CocosRenderer(cc, app, canvas, options);
        renderer._engineScene = scene;
        renderer.ownsApp = true;
        renderer._pixelRatio = pixelRatio;
        renderer.setSize(width, height, false);
        renderer._clearAlpha = alpha ? 0 : 1;
        return renderer;
    }
    public cc: AirEngineSurface;
    public app: AirAppSurface;
    public domElement: HTMLCanvasElement;
    public device: WebGL2Device;
    public g: GfxNamespace;
    public gl: WebGL2RenderingContext;
    public coordinateSystem: number;
    public ownsApp: boolean;
    public isCocosRenderer: true;
    public autoClear: boolean;
    public autoClearColor: boolean;
    public autoClearDepth: boolean;
    public autoClearStencil: boolean;
    public outputColorSpace: string;
    public toneMapping: number;
    public toneMappingExposure: number;
    public sortObjects: boolean;
    public _target: SparkRenderTarget | null;
    public _layer: number;
    public _mip: number;
    public _pixelRatio: number;
    public _renderDepth: number;
    public _clearColor: number[];
    public _clearAlpha: number;
    public _engineScene?: unknown;
    public _width!: number;
    public _height!: number;
    public _viewport!: ViewportRect;
    public _scissor!: ViewportRect;
    public _scissorTest?: boolean;
    public _eyeViewport: SparkRectLike | null = null;
    public _screen?: PassSet;
    public _boundTarget!: number;
    public _raf: number | null = null;
    public _loop: AnimationLoopCallback | null = null;
    public _disposed?: boolean;
    private _textures = new WeakMap<SparkTexture, TextureEntry>();
    private _targets = new WeakMap<SparkRenderTarget, TargetEntry>();
    private _materials = new WeakMap<SparkMaterial, MaterialEntry>();
    private _geometries = new WeakMap<SparkGeometry, Map<WebGLProgram, GeometryEntry>>();
    private _owned = new Set<{ destroy(): void }>();
    public _liveMaterials = new Set<MaterialEntry>();
    public _liveGeometries = new Set<GeometryEntry>();
    private _materialListeners = new WeakSet<SparkMaterial>();
    private _geometryListeners = new WeakSet<SparkGeometry>();
    private _textureListeners = new WeakSet<SparkTexture>();
    private _properties = new WeakMap<object, Record<string, unknown>>();
    public properties = {
        get: (o: object): Record<string, unknown> => {
            let p = this._properties.get(o);
            if (!p) this._properties.set(o, (p = {}));
            return p;
        },
        has: (o: object): boolean => this._properties.has(o),
        remove: (o: object): boolean => this._properties.delete(o),
    };
    /** SPK-10 inert XR shell: the field itself must survive because frozen Spark reads renderer.xr.* unconditionally. */
    public xr: InertXrShell = inertXr;
    public capabilities: {
        isWebGL2: true;
        logarithmicDepthBuffer: boolean;
        maxTextureSize: number;
        maxTextures: number;
        maxVertexTextures: number;
        precision: string;
    };
    public extensions: { get(name: string): unknown; has(name: string): boolean };
    public info: {
        render: { frame: number; calls: number; triangles: number; points: number; lines: number };
        memory: { geometries: number; textures: number };
        programs: { program: WebGLProgram; name: string; vertex: string; fragment: string }[];
    };
    public cmd: CommandBuffer;
    public _texBinding: number;
    public state: {
        activeTexture(unit: number): void;
        bindTexture(target: number, texture: WebGLTexture | null): void;
        unbindTexture(): void;
        pixelStorei(...args: [number, unknown]): void;
        reset(): void;
    };

    constructor(
        cc: AirEngineSurface,
        app: AirAppSurface,
        canvas: HTMLCanvasElement,
        options: CocosRendererOptions = {},
    ) {
        this.cc = cc;
        this.app = app;
        this.domElement = canvas;
        this.device = cc.director.root.device;
        this.g = cc.gfx;
        this.gl = this.device.gl;
        if (!this.gl) throw new Error('Spark native renderer requires Cocos WebGL2Device');
        this.coordinateSystem = WebGLCoordinateSystem ?? 2000;
        this.ownsApp = options.ownsApp ?? false;
        this.isCocosRenderer = true;
        this.autoClear = true;
        this.autoClearColor = true;
        this.autoClearDepth = true;
        this.autoClearStencil = true;
        this.outputColorSpace = SRGBColorSpace ?? 'srgb';
        this.toneMapping = 0;
        this.toneMappingExposure = 1;
        this.sortObjects = true;
        this._target = null;
        this._layer = 0;
        this._mip = 0;
        this._pixelRatio = 1;
        this._renderDepth = 0;
        this._clearColor = [0, 0, 0];
        this._clearAlpha = 1;
        // SPK-10: the former sessionstart/sessionend listeners on CocosXrManager only cancelled and
        // re-armed the requestAnimationFrame loop around an XR session; with no session they reduce to
        // the plain non-XR loop below, so the wiring is dropped and `xr` keeps the inert shell.
        this.capabilities = {
            isWebGL2: true,
            logarithmicDepthBuffer: !!options.logarithmicDepthBuffer,
            maxTextureSize: this.device.capabilities.maxTextureSize,
            maxTextures: this.device.capabilities.maxTextureUnits,
            maxVertexTextures: this.device.capabilities.maxVertexTextureUnits,
            precision: 'highp',
        };
        this.extensions = {
            get: (n: string) => this.gl.getExtension(n),
            has: (n: string) => !!this.gl.getExtension(n),
        };
        this.info = {
            render: { frame: 0, calls: 0, triangles: 0, points: 0, lines: 0 },
            memory: { geometries: 0, textures: 0 },
            programs: [],
        };
        this.cmd = this.device.createCommandBuffer(
            new this.g.CommandBufferInfo(this.device.queue, this.g.CommandBufferType.PRIMARY),
        );
        this._texBinding = Math.max(1, -this.device.bindingMappings.samplerTextureOffsets[0]);
        this.state = {
            activeTexture: (unit) => {
                this.gl.activeTexture(unit);
                this.device.getStateCache().texUnit = unit - this.gl.TEXTURE0;
            },
            bindTexture: (target, texture) => {
                this.gl.bindTexture(target, texture);
                this._boundTarget = target;
                const c = this.device.getStateCache();
                c.glTexUnits[c.texUnit].glTexture = texture;
            },
            unbindTexture: () => {
                const c = this.device.getStateCache();
                this.gl.bindTexture(this._boundTarget ?? this.gl.TEXTURE_2D, null);
                c.glTexUnits[c.texUnit].glTexture = null;
            },
            pixelStorei: (pname, value) => this.gl.pixelStorei(pname, value as number | boolean),
            reset: () => this.resetState(),
        };
    }
    public getContext(): WebGL2RenderingContext {
        return this.gl;
    }
    public getPixelRatio(): number {
        return this._pixelRatio;
    }
    public setPixelRatio(r: number): void {
        this._pixelRatio = r;
        this.setSize(this._width, this._height, false);
    }
    public setSize(w: number, h: number, updateStyle = true): this {
        this._width = w;
        this._height = h;
        const W = Math.max(1, Math.floor(w * this._pixelRatio)),
            H = Math.max(1, Math.floor(h * this._pixelRatio));
        this.cc.screen.windowSize = new this.cc.Size(W, H);
        this.cc.view.setDesignResolutionSize(w, h, this.cc.ResolutionPolicy.EXACT_FIT);
        this.domElement.width = W;
        this.domElement.height = H;
        this.cc.director.root.resize(W, H);
        if (updateStyle) {
            this.domElement.style.width = `${w}px`;
            this.domElement.style.height = `${h}px`;
        }
        this._viewport = { x: 0, y: 0, width: W, height: H };
        this._scissor = { ...this._viewport };
        return this;
    }
    public getSize<T extends SparkVector2Setter>(out: T): T {
        return out.set(this._width, this._height) as T;
    }
    public getDrawingBufferSize<T extends SparkVector2Setter>(out: T): T {
        return out.set(this.domElement.width, this.domElement.height) as T;
    }
    public setViewport(x: number | SparkRectLike, y?: number, w?: number, h?: number): void {
        this._viewport =
            typeof x === 'object'
                ? rect(x)
                : { x: x as number, y: y as number, width: w as number, height: h as number };
    }
    public getViewport<T extends SparkVector4Setter>(out: T): T {
        const r = this._viewport;
        return out.set(r.x, r.y, r.width, r.height) as T;
    }
    public setScissor(x: number | SparkRectLike, y?: number, w?: number, h?: number): void {
        this._scissor =
            typeof x === 'object'
                ? rect(x)
                : { x: x as number, y: y as number, width: w as number, height: h as number };
    }
    public getScissor<T extends SparkVector4Setter>(out: T): T {
        const r = this._scissor;
        return out.set(r.x, r.y, r.width, r.height) as T;
    }
    public setScissorTest(v: boolean): void {
        this._scissorTest = v;
    }
    public getScissorTest(): boolean {
        return !!this._scissorTest;
    }
    public setClearColor(c: number | string | { r: number; g: number; b: number }, a = this._clearAlpha): this {
        if (typeof c === 'number')
            this._clearColor = [((c >>> 16) & 255) / 255, ((c >>> 8) & 255) / 255, (c & 255) / 255];
        else if (typeof c === 'string') {
            // Typed-forced: the adapter Color constructor only types numeric components; .set() keeps
            // the identical string-parsing path the source's `new Color(c)` went through.
            const col = new Color().set(c);
            this._clearColor = [col.r, col.g, col.b];
        } else this._clearColor = [c.r, c.g, c.b];
        this._clearAlpha = a;
        return this;
    }
    public setClearAlpha(a: number): void {
        this._clearAlpha = a;
    }
    public getClearAlpha(): number {
        return this._clearAlpha;
    }
    public getClearColor<T extends SparkColorSetter>(out: T): T {
        // Explicit indices instead of spreading _clearColor: TS forbids spreading a number[] into
        // a fixed-arity setRGB; the stored array is always length 3 (see setClearColor).
        return out.setRGB(this._clearColor[0], this._clearColor[1], this._clearColor[2]) as T;
    }
    public getRenderTarget(): SparkRenderTarget | null {
        return this._target;
    }
    public getActiveCubeFace(): number {
        return this._layer;
    }
    public getActiveMipmapLevel(): number {
        return this._mip;
    }
    public setRenderTarget(target: SparkRenderTarget | null, layer = 0, mip = 0): void {
        this._target = target;
        this._layer = layer;
        this._mip = mip;
        if (target) {
            const e = this._ensureTarget(target);
            if (target.isWebGLArrayRenderTarget || target.isWebGLCubeRenderTarget) {
                const key = `${layer}:${mip}`,
                    old = e.layers?.get(key);
                if (old) {
                    this._destroy(old.framebuffer);
                    for (const view of old.views) this._destroy(view);
                    e.layers?.delete(key);
                }
            }
        }
    }
    public _own<T extends { destroy(): void }>(o: T): T {
        this._owned.add(o);
        return o;
    }
    public _destroy(o?: { destroy(): void } | null): void {
        if (o) {
            o.destroy();
            this._owned.delete(o);
        }
    }
    public _format(t: SparkTexture): Format {
        const g = this.g;
        const named = t.internalFormat;
        if (named && g.Format[named] !== undefined) return g.Format[named];
        const integer = t.format === RGBAIntegerFormat || t.format === RedIntegerFormat || t.format === RGIntegerFormat;
        const components =
            t.format === RedFormat || t.format === RedIntegerFormat
                ? 'R'
                : t.format === RGFormat || t.format === RGIntegerFormat
                  ? 'RG'
                  : 'RGBA';
        let suffix = '8';
        if (t.type === UnsignedIntType) suffix = integer ? '32UI' : '32F';
        else if (t.type === IntType) suffix = '32I';
        else if (t.type === FloatType) suffix = '32F';
        else if (t.type === HalfFloatType) suffix = '16F';
        else if (t.type === UnsignedShortType) suffix = integer ? '16UI' : '16F';
        else if (integer) suffix = '8UI';
        if (components === 'RGBA' && suffix === '8' && t.colorSpace === (SRGBColorSpace ?? 'srgb'))
            return g.Format.SRGB8_A8;
        return g.Format[components + suffix] ?? g.Format.RGBA8;
    }
    public _sampler(t: SparkTexture): Sampler {
        const g = this.g;
        const min = t.minFilter ?? LinearFilter;
        const nearest = [NearestFilter, NearestMipmapNearestFilter, NearestMipmapLinearFilter].includes(min);
        const mip = [NearestMipmapNearestFilter, LinearMipmapNearestFilter].includes(min)
            ? g.Filter.POINT
            : [NearestMipmapLinearFilter, LinearMipmapLinearFilter].includes(min)
              ? g.Filter.LINEAR
              : g.Filter.NONE;
        const address = (w?: number) =>
            w === RepeatWrapping ? g.Address.WRAP : w === MirroredRepeatWrapping ? g.Address.MIRROR : g.Address.CLAMP;
        return this.device.getSampler(
            new g.SamplerInfo(
                nearest ? g.Filter.POINT : g.Filter.LINEAR,
                t.magFilter === NearestFilter ? g.Filter.POINT : g.Filter.LINEAR,
                mip,
                address(t.wrapS),
                address(t.wrapT),
                address(t.wrapR),
                t.anisotropy ?? 1,
            ),
        );
    }
    public initTexture(t: SparkTexture): Texture {
        return this._texture(t)!.texture;
    }
    public _texture(t: SparkTexture | null | undefined, renderTarget = false): TextureEntry {
        if (!t) throw new Error('Missing texture for active Spark sampler');
        let e = this._textures.get(t);
        renderTarget = renderTarget || !!e?.renderTarget || !!t.isRenderTargetTexture || !!t.renderTarget;
        const existed = !!e;
        const image = t.image ?? t.source?.data ?? ({} as SparkImageData),
            faces = t.isCubeTexture && Array.isArray(image) ? (image as SparkImageData[]) : null,
            im: SparkImageData = faces ? (faces[0]?.image ?? faces[0] ?? {}) : image;
        const w = im.width || image.width || 1,
            h = im.height || image.height || 1,
            depth = im.depth || 1,
            g = this.g;
        const type = t.isDataArrayTexture
            ? g.TextureType.TEX2D_ARRAY
            : t.isData3DTexture
              ? g.TextureType.TEX3D
              : t.isCubeTexture
                ? g.TextureType.CUBE
                : g.TextureType.TEX2D;
        const format = this._format(t);
        const levelCount =
            (t.isCubeTexture && renderTarget) || t.generateMipmaps ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
        const signature = [w, h, depth, type, format, levelCount].join(':');
        if (!e || e.signature !== signature) {
            if (e) this._destroy(e.texture);
            const usage =
                g.TextureUsageBit.SAMPLED |
                g.TextureUsageBit.TRANSFER_DST |
                g.TextureUsageBit.TRANSFER_SRC |
                g.TextureUsageBit.COLOR_ATTACHMENT;
            const texture = this._own(
                this.device.createTexture(
                    new g.TextureInfo(
                        type,
                        usage,
                        format,
                        w,
                        h,
                        g.TextureFlagBit.NONE,
                        type === g.TextureType.TEX2D_ARRAY ? depth : type === g.TextureType.CUBE ? 6 : 1,
                        levelCount,
                        g.SampleCount.X1,
                        type === g.TextureType.TEX3D ? depth : 1,
                    ),
                ),
            );
            e = { texture, signature, version: -1, w, h, depth, format, type, renderTarget };
            this._textures.set(t, e);
            if (!existed) this.info.memory.textures++;
            Object.assign(this.properties.get(t), {
                __webglTexture: (texture as WebGL2Texture).gpuTexture.glTexture,
                __cocosTexture: texture,
            });
            if (!this._textureListeners.has(t)) {
                this._textureListeners.add(t);
                t.addEventListener?.('dispose', () => {
                    const current = this._textures.get(t);
                    if (current) {
                        this._destroy(current.texture);
                        this._textures.delete(t);
                        this.properties.remove(t);
                        this.info.memory.textures--;
                    }
                });
            }
        }
        if (!e.renderTarget && (e.version !== (t.version ?? 0) || t.needsUpdate === true)) {
            if (t.source?.dataReady === false) {
                e.version = t.version ?? 0;
                return e;
            }
            const data = im.data;
            if (faces) {
                const r = new g.BufferTextureCopy();
                r.texExtent = new g.Extent(w, h, 1);
                r.texSubres.layerCount = 6;
                const images = faces.map((f) => f.image ?? f);
                if (images.every((f) => f.data))
                    // Escape-hatch boundary kept from the source: DOM-image payloads reach the device
                    // as TexImageSource at runtime; the union is validated by the guards above.
                    this.device.copyBuffersToTexture(
                        images.map((f) => f.data) as unknown as ArrayBufferView[],
                        e!.texture,
                        [r],
                    );
                else if (images.every((f) => f.width && f.height && !(f.data === null)))
                    this.device.copyTexImagesToTexture(images as unknown as TexImageSource[], e!.texture, [r]);
                if (t.generateMipmaps) this._generateMipmaps(e.texture);
            } else if (data) {
                const r = new g.BufferTextureCopy();
                r.texExtent = new g.Extent(w, h, type === g.TextureType.TEX3D ? depth : 1);
                const gl = this.gl;
                const oldAlign = gl.getParameter(gl.UNPACK_ALIGNMENT);
                gl.pixelStorei(gl.UNPACK_ALIGNMENT, t.unpackAlignment ?? 1);
                if (type === g.TextureType.TEX2D_ARRAY) {
                    const values = w * h * (g.FormatInfos[format].size / data.BYTES_PER_ELEMENT);
                    if (t.layerUpdates?.size) {
                        const layers = [...t.layerUpdates],
                            bufs = layers.map((i) => data.subarray(i * values, (i + 1) * values)),
                            regions = layers.map((i) => {
                                const region = new g.BufferTextureCopy();
                                region.texExtent = new g.Extent(w, h, 1);
                                region.texSubres.baseArrayLayer = i;
                                return region;
                            });
                        this.device.copyBuffersToTexture(bufs, e.texture, regions);
                        t.clearLayerUpdates?.();
                    } else {
                        r.texSubres.layerCount = depth;
                        const bufs = Array.from({ length: depth }, (_, i) =>
                            data.subarray(i * values, (i + 1) * values),
                        );
                        this.device.copyBuffersToTexture(bufs, e.texture, [r]);
                    }
                } else this.device.copyBuffersToTexture([data], e.texture, [r]);
                gl.pixelStorei(gl.UNPACK_ALIGNMENT, oldAlign);
            } else if (
                im instanceof HTMLImageElement ||
                im instanceof HTMLCanvasElement ||
                (typeof ImageBitmap !== 'undefined' && im instanceof ImageBitmap)
            ) {
                const r = new g.BufferTextureCopy();
                r.texExtent = new g.Extent(w, h, 1);
                this.device.copyTexImagesToTexture([im], e.texture, [r]);
            }
            if (t.generateMipmaps && !faces) this._generateMipmaps(e.texture);
            e.version = t.version ?? 0;
        }
        return e;
    }
    public _ensureTarget(t: SparkRenderTarget): TargetEntry {
        if (t.isCocosRenderTarget) return this._ensureCocosTarget(t);
        // SPK-10: isXRRenderTarget targets were only produced by the removed CocosXrManager; the
        // branch is kept, like the isArrayCamera eye loop, as the low-risk general render-target path.
        if (t.isXRRenderTarget) return this._ensureXrTarget(t);
        const textures = t.textures?.length ? t.textures : [t.texture as SparkTexture];
        const sig = [
            t.width,
            t.height,
            t.depth ?? 1,
            ...textures.map((x) => `${x.id ?? x.uuid}:${this._format(x)}`),
        ].join(':');
        let e = this._targets.get(t);
        if (e && e.signature === sig) return e;
        if (e) this._disposeTarget(t);
        const g = this.g;
        for (const tx of textures) {
            tx.image ??= {};
            Object.assign(tx.image, {
                width: t.width,
                height: t.height,
                depth: t.depth ?? 1,
            });
            if (t.isWebGLArrayRenderTarget || (t.depth ?? 1) > 1) tx.isDataArrayTexture = true;
            this._texture(tx, true);
        }
        const formats = textures.map((tx) => (this._texture(tx, true) as TextureEntry).format);
        const passes: PassSet = {} as PassSet;
        for (const mode of ['load', 'clear']) {
            const colors = formats.map(
                (f) => new g.ColorAttachment(f, g.SampleCount.X1, mode === 'clear' ? g.LoadOp.CLEAR : g.LoadOp.LOAD),
            );
            const depth =
                t.depthBuffer !== false
                    ? new g.DepthStencilAttachment(
                          g.Format.DEPTH_STENCIL,
                          g.SampleCount.X1,
                          mode === 'clear' ? g.LoadOp.CLEAR : g.LoadOp.LOAD,
                          g.StoreOp.STORE,
                          mode === 'clear' ? g.LoadOp.CLEAR : g.LoadOp.LOAD,
                      )
                    : undefined;
            passes[mode] = this._own(this.device.createRenderPass(new g.RenderPassInfo(colors, depth)));
        }
        const depth =
            t.depthBuffer !== false
                ? this._own(
                      this.device.createTexture(
                          new g.TextureInfo(
                              g.TextureType.TEX2D,
                              g.TextureUsageBit.DEPTH_STENCIL_ATTACHMENT,
                              g.Format.DEPTH_STENCIL,
                              t.width,
                              t.height,
                          ),
                      ),
                  )
                : null;
        e = { signature: sig, textures, passes, depth, layers: new Map() };
        this._targets.set(t, e);
        t.addEventListener?.('dispose', () => this._disposeTarget(t));
        return e;
    }
    public _disposeTarget(t: SparkRenderTarget): void {
        if (t.isCocosRenderTarget) {
            const e = this._targets.get(t);
            if (e) {
                this._destroy(e.passes.load);
                this._targets.delete(t);
            }
            return;
        }
        if (t.isXRRenderTarget) return this._releaseXrTarget(t);
        const e = this._targets.get(t);
        if (!e) return;
        for (const v of e.layers?.values() ?? []) {
            this._destroy(v.framebuffer);
            for (const view of v.views) this._destroy(view);
        }
        for (const p of Object.values(e.passes)) this._destroy(p);
        this._destroy(e.depth);
        for (const tx of e.textures) {
            const v = this._textures.get(tx);
            if (v) {
                this._destroy(v.texture);
                this._textures.delete(tx);
                this.properties.remove(tx);
                this.info.memory.textures--;
            }
        }
        this._targets.delete(t);
    }
    public _framebuffer(
        t: SparkRenderTarget | null = this._target,
        layer = this._layer,
        mip = this._mip,
    ): FramebufferEntry {
        if (t?.isCocosRenderTarget) {
            const e = this._ensureCocosTarget(t);
            return { ...e, width: t.width, height: t.height } as FramebufferEntry;
        }
        if (t?.isXRRenderTarget) {
            const e = this._ensureXrTarget(t);
            (e.framebuffer as WebGL2Framebuffer).getGpuFramebuffer().glFramebuffer = t._externalFramebuffer ?? null;
            return { ...e, width: t.width, height: t.height } as FramebufferEntry;
        }
        if (!t)
            return {
                framebuffer: this.cc.director.root.mainWindow.framebuffer,
                passes: this._screenPasses(),
                width: this.domElement.width,
                height: this.domElement.height,
            };
        const e = this._ensureTarget(t),
            key = `${layer}:${mip}`;
        let f = e.layers?.get(key);
        if (!f) {
            const g = this.g;
            const views = e.textures.map((tx) => {
                const tex = (this._texture(tx, true) as TextureEntry).texture;
                return this._own(
                    this.device.createTexture(new g.TextureViewInfo(tex, tex.type, tex.format, mip, 1, layer, 1)),
                );
            });
            f = {
                views,
                framebuffer: this._own(
                    this.device.createFramebuffer(new g.FramebufferInfo(e.passes.load, views, e.depth ?? null)),
                ),
            };
            e.layers?.set(key, f);
        }
        return {
            ...f,
            passes: e.passes,
            width: t.width >> mip,
            height: t.height >> mip,
        };
    }
    public _ensureCocosTarget(t: SparkRenderTarget): TargetEntry {
        let e = this._targets.get(t);
        if (e) return e;
        const g = this.g,
            framebuffer = t._cocosFramebuffer;
        if (!framebuffer?.getGpuFramebuffer) throw new Error('Native Cocos target requires a gfx Framebuffer');
        const colors = framebuffer.colorTextures.map(
            (tx) => new g.ColorAttachment((tx as Texture).format, g.SampleCount.X1, g.LoadOp.LOAD),
        );
        const depth = framebuffer.depthStencilTexture;
        const pass = this._own(
            this.device.createRenderPass(
                new g.RenderPassInfo(
                    colors,
                    depth
                        ? new g.DepthStencilAttachment(
                              depth.format,
                              g.SampleCount.X1,
                              g.LoadOp.LOAD,
                              g.StoreOp.STORE,
                              g.LoadOp.LOAD,
                          )
                        : undefined,
                ),
            ),
        );
        e = {
            framebuffer,
            passes: { load: pass },
            textures: framebuffer.colorTextures.map((tx) => ({
                internalFormat: g.Format[(tx as Texture).format],
            })),
            external: true,
        };
        this._targets.set(t, e);
        return e;
    }
    public releaseRenderTarget(target: SparkRenderTarget): void {
        this._disposeTarget(target);
    }
    public _ensureXrTarget(t: SparkRenderTarget): TargetEntry {
        let e = this._targets.get(t);
        if (e) return e;
        const g = this.g,
            main = this.cc.director.root.mainWindow.framebuffer;
        const pass = this._own(
            this.device.createRenderPass(
                new g.RenderPassInfo(
                    [new g.ColorAttachment(g.Format.RGBA8, g.SampleCount.X1, g.LoadOp.LOAD)],
                    t.depthBuffer
                        ? new g.DepthStencilAttachment(
                              g.Format.DEPTH_STENCIL,
                              g.SampleCount.X1,
                              g.LoadOp.LOAD,
                              g.StoreOp.STORE,
                              g.LoadOp.LOAD,
                          )
                        : undefined,
                ),
            ),
        );
        const framebuffer = this._own(
            this.device.createFramebuffer(
                new g.FramebufferInfo(
                    pass,
                    main.colorTextures as Texture[],
                    t.depthBuffer ? main.depthStencilTexture : null,
                ),
            ),
        );
        (framebuffer as WebGL2Framebuffer).getGpuFramebuffer().glFramebuffer = t._externalFramebuffer ?? null;
        e = {
            framebuffer,
            passes: { load: pass },
            textures: [t.texture as SparkTexture],
            external: true,
        };
        this._targets.set(t, e);
        return e;
    }
    public _releaseXrTarget(t: SparkRenderTarget | null | undefined): void {
        if (!t) return;
        const e = this._targets.get(t);
        if (!e) return;
        (e.framebuffer as WebGL2Framebuffer).getGpuFramebuffer().glFramebuffer = null;
        this._destroy(e.framebuffer);
        this._destroy(e.passes.load);
        this._targets.delete(t);
    }
    public _screenPasses(): PassSet {
        if (this._screen) return this._screen;
        const g = this.g,
            fb = this.cc.director.root.mainWindow.framebuffer;
        const formats = fb.colorTextures.map((t) => (t as Texture).format);
        const passes = {} as PassSet;
        for (const mode of ['load', 'clear'])
            passes[mode] = this._own(
                this.device.createRenderPass(
                    new g.RenderPassInfo(
                        formats.map(
                            (f) =>
                                new g.ColorAttachment(
                                    f,
                                    g.SampleCount.X1,
                                    mode === 'clear' ? g.LoadOp.CLEAR : g.LoadOp.LOAD,
                                ),
                        ),
                        new g.DepthStencilAttachment(
                            fb.depthStencilTexture?.format ?? g.Format.DEPTH_STENCIL,
                            g.SampleCount.X1,
                            mode === 'clear' ? g.LoadOp.CLEAR : g.LoadOp.LOAD,
                            g.StoreOp.STORE,
                            mode === 'clear' ? g.LoadOp.CLEAR : g.LoadOp.LOAD,
                        ),
                    ),
                ),
            );
        return (this._screen = passes);
    }
    public _sources(m: SparkMaterial): { vs: string; fs: string } {
        let vs = m.vertexShader,
            fs = m.fragmentShader;
        if (!vs || !fs) throw new Error(`CocosRenderer requires shader material; unsupported ${m.type ?? 'material'}`);
        const expand = (s: string): string =>
            s.replace(/^[ \t]*#include\s+<([^>]+)>/gm, (_, name: string) => {
                const chunk = ShaderChunk?.[name];
                if (chunk !== undefined) return expand(chunk);
                if (name.startsWith('logdepthbuf_') && !this.capabilities.logarithmicDepthBuffer) return '';
                throw new Error(`Missing shader chunk <${name}>`);
            });
        vs = expand(vs).replace(/^\s*#version[^\n]*\n/, '');
        fs = expand(fs).replace(/^\s*#version[^\n]*\n/, '');
        let defines = Object.entries(m.defines ?? {})
            .filter(([, v]) => v !== false)
            .map(([k, v]) => `#define ${k} ${v === true ? '' : v}\n`)
            .join('');
        if (m.premultipliedAlpha) defines += '#define PREMULTIPLIED_ALPHA\n';
        if (this.capabilities.logarithmicDepthBuffer) defines += '#define USE_LOGARITHMIC_DEPTH_BUFFER\n';
        if (!m.isRawShaderMaterial) {
            const has = (n: string) => new RegExp(`\\b(?:uniform|in|attribute)\\s+\\w+\\s+${n}\\b`).test(vs as string);
            let builtins = '';
            for (const [type, name] of [
                ['vec3', 'position'],
                ['vec3', 'normal'],
                ['vec2', 'uv'],
                ['mat4', 'projectionMatrix'],
                ['mat4', 'modelViewMatrix'],
                ['mat4', 'modelMatrix'],
                ['mat4', 'viewMatrix'],
                ['mat3', 'normalMatrix'],
                ['vec3', 'cameraPosition'],
                ['bool', 'isOrthographic'],
            ] as [string, string][])
                if (!has(name))
                    builtins += `${['position', 'normal', 'uv'].includes(name) ? 'in' : 'uniform'} ${type} ${name};\n`;
            const precision =
                [
                    'float',
                    'int',
                    'sampler2D',
                    'samplerCube',
                    'sampler3D',
                    'sampler2DArray',
                    'sampler2DShadow',
                    'samplerCubeShadow',
                    'sampler2DArrayShadow',
                    'isampler2D',
                    'isampler3D',
                    'isamplerCube',
                    'isampler2DArray',
                    'usampler2D',
                    'usampler3D',
                    'usamplerCube',
                    'usampler2DArray',
                ]
                    .map((t) => `precision highp ${t};`)
                    .join('\n') + '\n';
            vs = '#define attribute in\n#define varying out\n#define texture2D texture\n' + precision + builtins + vs;
            fs =
                '#define varying in\n#define gl_FragDepthEXT gl_FragDepth\n#define texture2D texture\n#define textureCube texture\n' +
                precision +
                (!/uniform\s+bool\s+isOrthographic/.test(fs as string) ? 'uniform bool isOrthographic;\n' : '') +
                fs;
        }
        return { vs: defines + vs, fs: defines + fs };
    }
    public _material(m: SparkMaterial): MaterialEntry {
        let p = this._materials.get(m);
        const key = [
            m.version ?? 0,
            m.vertexShader,
            m.fragmentShader,
            JSON.stringify(m.defines ?? {}),
            m.premultipliedAlpha,
        ].join('|');
        if (p?.key === key) return p;
        if (p) this._disposeMaterial(m);
        const g = this.g,
            { vs, fs } = this._sources(m);
        const samplers: SamplerSlot[] = shaderSamplers(vs + '\n' + fs).map((s) => ({ ...s, binding: 0 }));
        const names = new Set(samplers.map((s) => s.name));
        let nextBinding = this._texBinding;
        for (const s of samplers) {
            s.binding = nextBinding;
            nextBinding += s.count;
        }
        const shaderInfo = new g.ShaderInfo();
        shaderInfo.name = `SparkNative:${m.name || m.id || this.info.programs.length}`;
        shaderInfo.stages = [
            new g.ShaderStage(g.ShaderStageFlagBit.VERTEX, vs),
            new g.ShaderStage(g.ShaderStageFlagBit.FRAGMENT, fs),
        ];
        shaderInfo.samplerTextures = samplers.map(
            (s) =>
                new g.UniformSamplerTexture(
                    0,
                    s.binding,
                    s.name,
                    s.type.includes('Array')
                        ? g.Type.SAMPLER2D_ARRAY
                        : s.type.includes('3D')
                          ? g.Type.SAMPLER3D
                          : s.type.includes('Cube')
                            ? g.Type.SAMPLER_CUBE
                            : g.Type.SAMPLER2D,
                    s.count,
                ),
        );
        const shader = this._own(this.device.createShader(shaderInfo));
        const program = (shader as WebGL2Shader).gpuShader.glProgram;
        if (!program || !this.gl.getProgramParameter(program, this.gl.LINK_STATUS))
            throw new Error(`Cocos native shader failed: ${shaderInfo.name}`);
        const bindings = samplers.map(
            (s) =>
                new g.DescriptorSetLayoutBinding(
                    s.binding,
                    g.DescriptorType.SAMPLER_TEXTURE,
                    s.count,
                    g.ShaderStageFlagBit.VERTEX | g.ShaderStageFlagBit.FRAGMENT,
                ),
        );
        const layout = this._own(this.device.createDescriptorSetLayout(new g.DescriptorSetLayoutInfo(bindings)));
        const pl = this._own(this.device.createPipelineLayout(new g.PipelineLayoutInfo([layout])));
        const ds = this._own(this.device.createDescriptorSet(new g.DescriptorSetInfo(layout)));
        const uniforms: NativeUniform[] = [];
        for (let i = 0; i < this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS); i++) {
            // Typed-forced assertion: getActiveUniform only returns null for out-of-range indices.
            const u = this.gl.getActiveUniform(program, i)!,
                name = u.name.replace(/\[0\]$/, '');
            if (names.has(name)) continue;
            uniforms.push({
                type: u.type,
                size: u.size,
                name,
                location: this.gl.getUniformLocation(program, name),
            });
        }
        p = {
            key,
            shader,
            program,
            samplers,
            uniforms,
            layout,
            pl,
            ds,
            psos: new Map(),
            vs,
            fs,
        };
        this._materials.set(m, p);
        this._liveMaterials.add(p);
        if (!this._materialListeners.has(m)) {
            this._materialListeners.add(m);
            m.addEventListener?.('dispose', () => this._disposeMaterial(m));
        }
        this.info.programs.push({
            program,
            name: shaderInfo.name,
            vertex: vs,
            fragment: fs,
        });
        return p;
    }
    public _disposeMaterial(m: SparkMaterial): void {
        const p = this._materials.get(m);
        if (!p) return;
        this._liveMaterials.delete(p);
        for (const v of p.psos.values()) this._destroy(v);
        for (const v of [p.ds, p.pl, p.layout, p.shader]) this._destroy(v);
        this._materials.delete(m);
        this.info.programs = this.info.programs.filter((r) => r.program !== p.program);
    }
    public _disposeGeometry(geo: SparkGeometry): void {
        const entries = this._geometries.get(geo);
        if (!entries) return;
        for (const e of entries.values()) {
            this._liveGeometries.delete(e);
            this._destroy(e.ia);
            for (const b of e.buffers) this._destroy(b);
        }
        entries.clear();
        this._geometries.delete(geo);
        this.info.memory.geometries--;
    }
    // Explicitly release graph-generated shader caches without changing Spark source.
    // The next draw lazily reconstructs the identical native shaders and vertex state.
    public purgeMaterialCache(): { materials: number; geometries: number; released: number; remaining: number } {
        const before = this._owned.size,
            materials = this._liveMaterials.size,
            geometries = this._liveGeometries.size;
        for (const e of this._liveGeometries) {
            this._destroy(e.ia);
            for (const b of e.buffers) this._destroy(b);
        }
        for (const p of this._liveMaterials) {
            for (const v of p.psos.values()) this._destroy(v);
            for (const v of [p.ds, p.pl, p.layout, p.shader]) this._destroy(v);
        }
        this._liveMaterials.clear();
        this._liveGeometries.clear();
        this._materials = new WeakMap();
        this._geometries = new WeakMap();
        this.info.programs = [];
        this.info.memory.geometries = 0;
        return {
            materials,
            geometries,
            released: before - this._owned.size,
            remaining: this._owned.size,
        };
    }
    public _generateMipmaps(texture: Texture): void {
        const gl = this.gl,
            c = this.device.getStateCache(),
            gpu = (texture as WebGL2Texture).gpuTexture,
            unit = c.glTexUnits[c.texUnit];
        gl.bindTexture(gpu.glTarget, gpu.glTexture);
        unit.glTexture = gpu.glTexture;
        gl.generateMipmap(gpu.glTarget);
    }
    public compile(scene: SparkObject, camera: SparkCamera | null): SparkObject {
        scene.traverse?.((o) => {
            if (o.material) {
                for (const m of Array.isArray(o.material) ? o.material : [o.material as SparkMaterial]) {
                    const p = this._material(m);
                    if (o.geometry) this._geometry(o.geometry, p);
                }
            }
        });
        return scene;
    }
    public async compileAsync(scene: SparkObject, camera: SparkCamera | null): Promise<SparkObject> {
        return this.compile(scene, camera);
    }
    public _geometry(geo: SparkGeometry, p: MaterialEntry): GeometryEntry {
        let byProgram = this._geometries.get(geo);
        if (!byProgram) {
            this._geometries.set(geo, (byProgram = new Map()));
            this.info.memory.geometries++;
            if (!this._geometryListeners.has(geo)) {
                this._geometryListeners.add(geo);
                geo.addEventListener?.('dispose', () => this._disposeGeometry(geo));
            }
        }
        let e = byProgram.get(p.program);
        const g = this.g;
        const inputs = (p.shader as WebGL2Shader).gpuShader.glInputs.filter(
            (i) => i.glLoc >= 0 && !i.name.startsWith('gl_'),
        );
        const signature =
            inputs
                .map((i) => {
                    const a = geo.attributes[i.name];
                    return `${i.name}:${a?.array?.byteLength}:${a?.itemSize}:${a?.version}`;
                })
                .join('|') + `:${geo.index?.array?.byteLength}:${geo.index?.version}`;
        if (e?.signature === signature) return e;
        if (e) {
            this._liveGeometries.delete(e);
            this._destroy(e.ia);
            for (const b of e.buffers) this._destroy(b);
        }
        const attrs: Attribute[] = [],
            buffers: Buffer[] = [];
        for (const input of inputs) {
            const a = geo.attributes[input.name];
            if (!a) throw new Error(`Missing geometry attribute ${input.name}`);
            if (a.isInterleavedBufferAttribute)
                throw new Error('Interleaved attributes require a native packing adapter');
            const n = a.itemSize,
                arr = a.array;
            const prefix = ['', 'R', 'RG', 'RGB', 'RGBA'][n];
            let suffix =
                arr instanceof Float32Array
                    ? '32F'
                    : arr instanceof Uint32Array
                      ? '32UI'
                      : arr instanceof Int32Array
                        ? '32I'
                        : arr instanceof Uint16Array
                          ? '16UI'
                          : arr instanceof Int16Array
                            ? '16I'
                            : arr instanceof Uint8Array
                              ? '8UI'
                              : '8I';
            if (a.normalized && suffix === '8UI') suffix = '8';
            const format = g.Format[prefix + suffix];
            if (format === undefined) throw new Error(`Unsupported native attribute format ${prefix + suffix}`);
            attrs.push(
                new g.Attribute(
                    input.name,
                    format,
                    !!a.normalized,
                    buffers.length,
                    !!a.isInstancedBufferAttribute,
                    input.glLoc,
                ),
            );
            const buffer = this._own(
                this.device.createBuffer(
                    new g.BufferInfo(
                        g.BufferUsageBit.VERTEX | g.BufferUsageBit.TRANSFER_DST,
                        g.MemoryUsageBit.HOST | g.MemoryUsageBit.DEVICE,
                        Math.max(4, arr.byteLength),
                        n * arr.BYTES_PER_ELEMENT,
                    ),
                ),
            );
            buffer.update(arr);
            buffers.push(buffer);
        }
        if (!buffers.length) {
            const buffer = this._own(
                this.device.createBuffer(new g.BufferInfo(g.BufferUsageBit.VERTEX, g.MemoryUsageBit.DEVICE, 12, 4)),
            );
            buffer.update(new Float32Array([0, 1, 2]));
            buffers.push(buffer);
        }
        let index: Buffer | null = null;
        if (geo.index) {
            const arr = geo.index.array;
            index = this._own(
                this.device.createBuffer(
                    new g.BufferInfo(
                        g.BufferUsageBit.INDEX | g.BufferUsageBit.TRANSFER_DST,
                        g.MemoryUsageBit.HOST | g.MemoryUsageBit.DEVICE,
                        arr.byteLength,
                        arr.BYTES_PER_ELEMENT,
                    ),
                ),
            );
            index.update(arr);
        }
        const ia = this._own(this.device.createInputAssembler(new g.InputAssemblerInfo(attrs, buffers, index)));
        if (index) buffers.push(index);
        e = { signature, attrs, buffers, ia };
        byProgram.set(p.program, e);
        this._liveGeometries.add(e);
        return e;
    }
    public _pso(
        m: SparkMaterial,
        p: MaterialEntry,
        geometry: GeometryEntry,
        pass: RenderPass,
        flipped = false,
    ): PipelineState {
        const g = this.g;
        if (m.wireframe)
            throw new Error('Native Spark renderer does not silently convert filled geometry to wireframe');
        const key = JSON.stringify([pass.objectID, flipped, ...STATE_KEYS.map((k) => m[k]), m.blendColor?.toArray?.()]);
        let out = p.psos.get(key);
        if (out) return out;
        const rs = new g.RasterizerState();
        rs.cullMode =
            m.side === DoubleSide ? g.CullMode.NONE : m.side === BackSide ? g.CullMode.FRONT : g.CullMode.BACK;
        rs.isFrontFaceCCW = !flipped;
        rs.depthBias = m.polygonOffset ? (m.polygonOffsetFactor ?? 0) : 0;
        rs.depthBiasSlop = m.polygonOffset ? (m.polygonOffsetUnits ?? 0) : 0;
        const depth = new g.DepthStencilState(m.depthTest !== false, m.depthWrite !== false);
        const comparisons: (ComparisonFunc | undefined)[] = [
            g.ComparisonFunc.NEVER,
            g.ComparisonFunc.ALWAYS,
            g.ComparisonFunc.LESS,
            g.ComparisonFunc.LESS_EQUAL,
            g.ComparisonFunc.EQUAL,
            g.ComparisonFunc.GREATER_EQUAL,
            g.ComparisonFunc.GREATER,
            g.ComparisonFunc.NOT_EQUAL,
        ];
        // Typed-forced reorder: the source assigned depthFunc then tested it for undefined; validating
        // first keeps the same throw and commits nothing on failure.
        const depthFunc = comparisons[m.depthFunc ?? LessEqualDepth];
        if (depthFunc === undefined) throw new Error(`Unsupported depth function ${m.depthFunc}`);
        depth.depthFunc = depthFunc;
        if (m.stencilWrite) {
            const func: Record<number, ComparisonFunc> = {
                512: g.ComparisonFunc.NEVER,
                513: g.ComparisonFunc.LESS,
                514: g.ComparisonFunc.EQUAL,
                515: g.ComparisonFunc.LESS_EQUAL,
                516: g.ComparisonFunc.GREATER,
                517: g.ComparisonFunc.NOT_EQUAL,
                518: g.ComparisonFunc.GREATER_EQUAL,
                519: g.ComparisonFunc.ALWAYS,
            };
            const ops: Record<number, StencilOp> = {
                0: g.StencilOp.ZERO,
                7680: g.StencilOp.KEEP,
                7681: g.StencilOp.REPLACE,
                7682: g.StencilOp.INCR,
                7683: g.StencilOp.DECR,
                5386: g.StencilOp.INVERT,
                34055: g.StencilOp.INCR_WRAP,
                34056: g.StencilOp.DECR_WRAP,
            };
            for (const face of ['Front', 'Back']) {
                depth[`stencilTest${face}` as 'stencilTestFront'] = true;
                depth[`stencilFunc${face}` as 'stencilFuncFront'] = func[m.stencilFunc ?? 519];
                depth[`stencilRef${face}` as 'stencilRefFront'] = m.stencilRef ?? 0;
                depth[`stencilReadMask${face}` as 'stencilReadMaskFront'] = m.stencilFuncMask ?? 255;
                depth[`stencilWriteMask${face}` as 'stencilWriteMaskFront'] = m.stencilWriteMask ?? 255;
                depth[`stencilFailOp${face}` as 'stencilFailOpFront'] = ops[m.stencilFail ?? 7680];
                depth[`stencilZFailOp${face}` as 'stencilZFailOpFront'] = ops[m.stencilZFail ?? 7680];
                depth[`stencilPassOp${face}` as 'stencilPassOpFront'] = ops[m.stencilZPass ?? 7680];
            }
        }
        const bs = new g.BlendState();
        bs.isA2C = !!m.alphaToCoverage;
        const t = bs.targets[0];
        t.blend = m.blending !== NoBlending && (m.transparent || m.blending !== NormalBlending);
        if (t.blend) {
            t.blendSrc = m.premultipliedAlpha ? g.BlendFactor.ONE : g.BlendFactor.SRC_ALPHA;
            t.blendDst = g.BlendFactor.ONE_MINUS_SRC_ALPHA;
            t.blendSrcAlpha = g.BlendFactor.ONE;
            t.blendDstAlpha = g.BlendFactor.ONE_MINUS_SRC_ALPHA;
            if (m.blending === AdditiveBlending) {
                t.blendDst = g.BlendFactor.ONE;
                t.blendDstAlpha = g.BlendFactor.ONE;
            } else if (m.blending === SubtractiveBlending) {
                if (!m.premultipliedAlpha) throw new Error('Subtractive blending requires premultipliedAlpha');
                t.blendSrc = g.BlendFactor.ZERO;
                t.blendDst = g.BlendFactor.ONE_MINUS_SRC_COLOR;
                t.blendSrcAlpha = g.BlendFactor.ZERO;
                t.blendDstAlpha = g.BlendFactor.ONE;
            } else if (m.blending === MultiplyBlending) {
                if (!m.premultipliedAlpha) throw new Error('Multiply blending requires premultipliedAlpha');
                t.blendSrc = g.BlendFactor.DST_COLOR;
                t.blendDst = g.BlendFactor.ONE_MINUS_SRC_ALPHA;
                t.blendSrcAlpha = g.BlendFactor.ZERO;
                t.blendDstAlpha = g.BlendFactor.ONE;
            } else if (m.blending === CustomBlending) {
                const factors: (BlendFactor | undefined)[] = [
                    g.BlendFactor.ZERO,
                    g.BlendFactor.ONE,
                    g.BlendFactor.SRC_COLOR,
                    g.BlendFactor.ONE_MINUS_SRC_COLOR,
                    g.BlendFactor.SRC_ALPHA,
                    g.BlendFactor.ONE_MINUS_SRC_ALPHA,
                    g.BlendFactor.DST_ALPHA,
                    g.BlendFactor.ONE_MINUS_DST_ALPHA,
                    g.BlendFactor.DST_COLOR,
                    g.BlendFactor.ONE_MINUS_DST_COLOR,
                    g.BlendFactor.SRC_ALPHA_SATURATE,
                    g.BlendFactor.CONSTANT_COLOR,
                    g.BlendFactor.ONE_MINUS_CONSTANT_COLOR,
                    g.BlendFactor.CONSTANT_ALPHA,
                    g.BlendFactor.ONE_MINUS_CONSTANT_ALPHA,
                ];
                const equations: (BlendOp | undefined)[] = [
                    g.BlendOp.ADD,
                    g.BlendOp.SUB,
                    g.BlendOp.REV_SUB,
                    g.BlendOp.MIN,
                    g.BlendOp.MAX,
                ];
                // Typed-forced reorder (as with depthFunc): validate the lookup before committing it.
                const custom = {
                    src: factors[(m.blendSrc ?? SrcAlphaFactor) - 200],
                    dst: factors[(m.blendDst ?? OneMinusSrcAlphaFactor) - 200],
                    srcAlpha: factors[(m.blendSrcAlpha ?? m.blendSrc ?? SrcAlphaFactor) - 200],
                    dstAlpha: factors[(m.blendDstAlpha ?? m.blendDst ?? OneMinusSrcAlphaFactor) - 200],
                    eq: equations[(m.blendEquation ?? AddEquation) - 100],
                    alphaEq: equations[(m.blendEquationAlpha ?? m.blendEquation ?? AddEquation) - 100],
                };
                if (Object.values(custom).some((v) => v === undefined))
                    throw new Error('Unsupported custom blend factor or equation');
                t.blendSrc = custom.src as BlendFactor;
                t.blendDst = custom.dst as BlendFactor;
                t.blendSrcAlpha = custom.srcAlpha as BlendFactor;
                t.blendDstAlpha = custom.dstAlpha as BlendFactor;
                t.blendEq = custom.eq as BlendOp;
                t.blendAlphaEq = custom.alphaEq as BlendOp;
                bs.blendColor = new g.Color(
                    m.blendColor?.r ?? 0,
                    m.blendColor?.g ?? 0,
                    m.blendColor?.b ?? 0,
                    m.blendAlpha ?? 0,
                );
            } else if (m.blending !== NormalBlending) throw new Error(`Unsupported blending mode ${m.blending}`);
        }
        if (m.colorWrite === false) t.blendColorMask = g.ColorMask.NONE;
        out = this._own(
            this.device.createPipelineState(
                new g.PipelineStateInfo(
                    p.shader,
                    p.pl,
                    pass,
                    new g.InputState(geometry.attrs),
                    rs,
                    depth,
                    bs,
                    g.PrimitiveMode.TRIANGLE_LIST,
                ),
            ),
        );
        p.psos.set(key, out);
        return out;
    }
    public _uniforms(m: SparkMaterial, p: MaterialEntry, obj: SparkObject, camera: SparkCamera | null): void {
        const gl = this.gl;
        let modelView: unknown;
        const model = obj.matrixWorld?.elements ?? I4,
            view = camera?.matrixWorldInverse?.elements ?? I4;
        if (camera && camera.matrixWorldInverse && obj.matrixWorld && Matrix4)
            modelView = new Matrix4().multiplyMatrices(camera.matrixWorldInverse, obj.matrixWorld).elements;
        const builtins: Record<string, unknown> = {
            projectionMatrix: camera?.projectionMatrix?.elements ?? I4,
            modelViewMatrix: modelView ?? I4,
            modelMatrix: model,
            viewMatrix: view,
            normalMatrix: I3,
            cameraPosition: camera?.position ?? [0, 0, 0],
            isOrthographic: !!camera?.isOrthographicCamera,
            logDepthBufFC: 2 / (Math.log((camera?.far ?? 2000) + 1) / Math.LN2),
        };
        for (const u of p.uniforms) {
            const value = uniformValue(m.uniforms, u.name) ?? builtins[u.name];
            if (value === undefined) continue;
            const v = asArray(value),
                l = u.location;
            // Typed-forced assertions only: the GL upload-list overloads name one concrete element
            // type per uniform class; the guard above the switch already fixed u.type for each case.
            switch (u.type) {
                case gl.FLOAT:
                    typeof v === 'number' ? gl.uniform1f(l, v) : gl.uniform1fv(l, v as number[] | Float32Array);
                    break;
                case gl.FLOAT_VEC2:
                    gl.uniform2fv(l, v as number[] | Float32Array);
                    break;
                case gl.FLOAT_VEC3:
                    gl.uniform3fv(l, v as number[] | Float32Array);
                    break;
                case gl.FLOAT_VEC4:
                    gl.uniform4fv(l, v as number[] | Float32Array);
                    break;
                case gl.INT:
                case gl.BOOL:
                    typeof v === 'number' || typeof v === 'boolean'
                        ? gl.uniform1i(l, Number(v))
                        : gl.uniform1iv(l, v as number[] | Int32Array);
                    break;
                case gl.INT_VEC2:
                case gl.BOOL_VEC2:
                    gl.uniform2iv(l, v as number[] | Int32Array);
                    break;
                case gl.INT_VEC3:
                case gl.BOOL_VEC3:
                    gl.uniform3iv(l, v as number[] | Int32Array);
                    break;
                case gl.INT_VEC4:
                case gl.BOOL_VEC4:
                    gl.uniform4iv(l, v as number[] | Int32Array);
                    break;
                case gl.UNSIGNED_INT:
                    typeof v === 'number' ? gl.uniform1ui(l, v) : gl.uniform1uiv(l, v as number[] | Uint32Array);
                    break;
                case gl.UNSIGNED_INT_VEC2:
                    gl.uniform2uiv(l, v as number[] | Uint32Array);
                    break;
                case gl.UNSIGNED_INT_VEC3:
                    gl.uniform3uiv(l, v as number[] | Uint32Array);
                    break;
                case gl.UNSIGNED_INT_VEC4:
                    gl.uniform4uiv(l, v as number[] | Uint32Array);
                    break;
                case gl.FLOAT_MAT2:
                    gl.uniformMatrix2fv(l, false, v as number[] | Float32Array);
                    break;
                case gl.FLOAT_MAT3:
                    gl.uniformMatrix3fv(l, false, v as number[] | Float32Array);
                    break;
                case gl.FLOAT_MAT4:
                    gl.uniformMatrix4fv(l, false, v as number[] | Float32Array);
                    break;
                default:
                    throw new Error(`Unsupported native uniform type ${u.type} (${u.name})`);
            }
        }
    }
    public _draw(obj: SparkObject, camera: SparkCamera | null, scene: SparkObject): void {
        const m = obj.material as SparkMaterial | SparkMaterial[] | null | undefined;
        if (!m || (m as SparkMaterial).visible === false) return;
        if (Array.isArray(m)) throw new Error('Multi-material geometry requires native group expansion');
        const mat = m as SparkMaterial;
        obj.onBeforeRender?.(this, scene, camera, obj.geometry, mat, null);
        mat.onBeforeRender?.(this, scene, camera, obj.geometry, obj, null);
        const geo = obj.geometry;
        if (!geo) return;
        const instances = geo.instanceCount;
        const p = this._material(mat),
            geom = this._geometry(geo, p);
        for (const s of p.samplers) {
            const values = uniformValue(mat.uniforms, s.name);
            for (let i = 0; i < s.count; i++) {
                const tx = (Array.isArray(values) ? values[i] : values) as SparkTexture | undefined;
                if (!tx) continue;
                const te = this._texture(tx);
                p.ds.bindTexture(s.binding, te.texture, i);
                p.ds.bindSampler(s.binding, this._sampler(tx), i);
            }
        }
        p.ds.update();
        if (instances === 0) return;
        const f = this._framebuffer(),
            pass = f.passes.load,
            g = this.g,
            cmd = this.cmd;
        cmd.begin();
        cmd.beginRenderPass(pass, f.framebuffer, new g.Rect(0, 0, f.width, f.height), [], 1, 0);
        const viewport =
            this._target?.isXRRenderTarget && this._eyeViewport
                ? rect(this._eyeViewport, f.width, f.height)
                : this._target
                  ? rect(this._target.viewport, f.width, f.height)
                  : this._viewport;
        cmd.setViewport(new g.Viewport(viewport.x, viewport.y, viewport.width, viewport.height));
        const scissor = this._target?.scissorTest
            ? rect(this._target.scissor, f.width, f.height)
            : !this._target && this._scissorTest
              ? this._scissor
              : { x: 0, y: 0, width: f.width, height: f.height };
        cmd.setScissor(new g.Rect(scissor.x, scissor.y, scissor.width, scissor.height));
        // Typed-forced form of `!!(obj.matrixWorld?.determinant?.() < 0)`: the && guard narrows the
        // optional matrixWorld while keeping the same non-negative default when it is absent.
        cmd.bindPipelineState(this._pso(mat, p, geom, pass, !!(obj.matrixWorld && obj.matrixWorld.determinant() < 0)));
        cmd.bindDescriptorSet(0, p.ds);
        cmd.bindInputAssembler(geom.ia);
        // Typed-forced view: bindStates exists at runtime on the WebGL2 command buffers but is
        // protected on the base type; the source flushes recorded binds here before the raw-GL
        // polygon-offset and uniform uploads below. Same call, same position, no behavior change.
        (cmd as CommandBuffer & { bindStates(): void }).bindStates();
        const previousPolygonOffset = this.gl.isEnabled(this.gl.POLYGON_OFFSET_FILL);
        if (mat.polygonOffset) this.gl.enable(this.gl.POLYGON_OFFSET_FILL);
        else this.gl.disable(this.gl.POLYGON_OFFSET_FILL);
        this._uniforms(mat, p, obj, camera);
        const range = geo.drawRange ?? { start: 0, count: Infinity };
        const total = geo.index?.count ?? geo.index?.array?.length ?? geo.attributes.position?.count ?? 3;
        const count = Math.max(0, Math.min(total - range.start, range.count));
        const inst = instances === undefined ? 0 : Math.max(0, Math.floor(instances));
        if (count > 0)
            cmd.draw(
                new g.DrawInfo(
                    geo.index ? 0 : count,
                    geo.index ? 0 : range.start,
                    geo.index ? count : 0,
                    geo.index ? range.start : 0,
                    0,
                    inst,
                ),
            );
        if (previousPolygonOffset) this.gl.enable(this.gl.POLYGON_OFFSET_FILL);
        else this.gl.disable(this.gl.POLYGON_OFFSET_FILL);
        cmd.endRenderPass();
        cmd.end();
        this.device.queue.submit([cmd]);
        this.info.render.calls++;
        this.info.render.triangles += (count / 3) * Math.max(1, inst);
        obj.onAfterRender?.(this, scene, camera, geo, mat, null);
    }
    public render(scene: SparkObject, camera: SparkCamera | null): void {
        if (this._disposed) throw new Error('CocosRenderer disposed');
        const outer = this._renderDepth++ === 0;
        try {
            if (outer) {
                this.info.render.frame++;
                this.info.render.calls = 0;
                this.info.render.triangles = 0;
            }
            scene.updateMatrixWorld?.();
            if (camera?.matrixWorldAutoUpdate !== false) {
                // Typed-forced nesting of the source `if (camera?.parent) ... camera?.matrixWorldInverse?...`
                // guards: identical semantics once camera is known non-null inside the block.
                if (camera) {
                    if (!camera.parent) camera.updateMatrixWorld?.();
                    // Typed-forced `!`: camera.matrixWorld is optional in the duck interface but always
                    // present at runtime (updateMatrixWorld above guarantees it), same assumption as source.
                    camera.matrixWorldInverse?.copy(camera.matrixWorld!).invert();
                }
            }
            // SPK-10: with the inert shell enabled/isPresenting are always false, so this selection
            // branch short-circuits to the non-XR camera. The manager-only calls (_poseValid,
            // cameraAutoUpdate, updateCamera) are removed together with CocosXrManager itself.
            if (this.xr.enabled && this.xr.isPresenting && !camera?.isArrayCamera) {
                camera = this.xr.getCamera() ?? camera;
            }
            if (this.autoClear) this.clear(this.autoClearColor, this.autoClearDepth, this.autoClearStencil);
            // isArrayCamera eye loop: kept as the general path (SPK-10 retains it deliberately; without
            // the XR manager `cameras` is always [camera]).
            const cameras: (SparkCamera | null)[] = camera?.isArrayCamera ? (camera.cameras ?? []) : [camera];
            for (const eye of cameras) {
                const previousEyeViewport = this._eyeViewport;
                this._eyeViewport = camera?.isArrayCamera ? (eye?.viewport ?? null) : null;
                try {
                    const list: { obj: SparkObject; z: number; sequence: number }[] = [];
                    let sequence = 0;
                    const visit = (obj: SparkObject) => {
                        if (obj.visible === false) return;
                        if (
                            obj.geometry &&
                            obj.material &&
                            (!eye?.layers || !obj.layers || eye.layers.test(obj.layers))
                        ) {
                            let z = 0;
                            if (obj.matrixWorld && eye?.matrixWorldInverse && eye?.projectionMatrix)
                                z = new Vector3()
                                    .setFromMatrixPosition(obj.matrixWorld)
                                    .applyMatrix4(eye.matrixWorldInverse)
                                    .applyMatrix4(eye.projectionMatrix).z;
                            list.push({ obj, z, sequence: sequence++ });
                        }
                        for (const child of obj.children ?? []) visit(child);
                    };
                    visit(scene);
                    if (this.sortObjects)
                        list.sort((a, b) => {
                            const at = !!(a.obj.material as SparkMaterial).transparent,
                                bt = !!(b.obj.material as SparkMaterial).transparent;
                            return (
                                Number(at) - Number(bt) ||
                                (a.obj.renderOrder ?? 0) - (b.obj.renderOrder ?? 0) ||
                                (at
                                    ? b.z - a.z
                                    : (((a.obj.material as SparkMaterial).id as number) ?? 0) -
                                          (((b.obj.material as SparkMaterial).id as number) ?? 0) || a.z - b.z) ||
                                a.sequence - b.sequence
                            );
                        });
                    for (const item of list) this._draw(item.obj, eye, scene);
                } finally {
                    this._eyeViewport = previousEyeViewport;
                }
            }
            if (this._target && !this._target.isXRRenderTarget && !this._target.isCocosRenderTarget)
                for (const tx of this._target.textures ?? [this._target.texture as SparkTexture])
                    if (tx?.generateMipmaps) this._generateMipmaps(this._texture(tx, true).texture);
        } finally {
            this._renderDepth--;
        }
    }
    public clear(color = true, depth = true, stencil = true): void {
        const f = this._framebuffer(),
            g = this.g,
            gl = this.gl;
        const stateCache = this.device.getStateCache(),
            savedDepthWrite = stateCache.dss.depthWrite,
            savedColorMask = stateCache.bs.targets[0].blendColorMask;
        const cmd = this.cmd;
        cmd.begin();
        cmd.beginRenderPass(f.passes.load, f.framebuffer, new g.Rect(0, 0, f.width, f.height), [], 1, 0);
        const scissor = this._target?.scissorTest
            ? rect(this._target.scissor, f.width, f.height)
            : !this._target && this._scissorTest
              ? this._scissor
              : { x: 0, y: 0, width: f.width, height: f.height };
        cmd.setScissor(new g.Rect(scissor.x, scissor.y, scissor.width, scissor.height));
        const colors: (SparkTexture | null)[] = this._target
            ? (this._ensureTarget(this._target) as TargetEntry).textures
            : [null];
        if (color) {
            gl.colorMask(true, true, true, true);
            this.device.getStateCache().bs.targets[0].blendColorMask = g.ColorMask.ALL;
            for (let i = 0; i < colors.length; i++) {
                const format = colors[i] ? this._format(colors[i] as SparkTexture) : g.Format.RGBA8;
                const fi = g.FormatInfos[format],
                    v = [...this._clearColor, this._clearAlpha];
                if (fi.type === g.FormatType.UINT) gl.clearBufferuiv(gl.COLOR, i, new Uint32Array(v));
                else if (fi.type === g.FormatType.INT) gl.clearBufferiv(gl.COLOR, i, new Int32Array(v));
                else gl.clearBufferfv(gl.COLOR, i, new Float32Array(v));
            }
        }
        if (depth && this._target?.depthBuffer !== false) {
            gl.depthMask(true);
            this.device.getStateCache().dss.depthWrite = true;
            gl.clearBufferfv(gl.DEPTH, 0, new Float32Array([1]));
        }
        if (
            stencil &&
            (this._target ? this._target.stencilBuffer : (gl.getContextAttributes() ?? { stencil: false }).stencil)
        ) {
            const front = stateCache.dss.stencilWriteMaskFront,
                back = stateCache.dss.stencilWriteMaskBack;
            gl.stencilMask(0xffffffff);
            gl.clearBufferiv(gl.STENCIL, 0, new Int32Array([0]));
            gl.stencilMaskSeparate(gl.FRONT, front);
            gl.stencilMaskSeparate(gl.BACK, back);
        }
        gl.depthMask(savedDepthWrite);
        stateCache.dss.depthWrite = savedDepthWrite;
        gl.colorMask(
            !!(savedColorMask & g.ColorMask.R),
            !!(savedColorMask & g.ColorMask.G),
            !!(savedColorMask & g.ColorMask.B),
            !!(savedColorMask & g.ColorMask.A),
        );
        stateCache.bs.targets[0].blendColorMask = savedColorMask;
        cmd.endRenderPass();
        cmd.end();
        this.device.queue.submit([cmd]);
    }
    public readRenderTargetPixels(
        target: SparkRenderTarget,
        x: number,
        y: number,
        w: number,
        h: number,
        buffer: ArrayBufferView,
        face?: number | null,
        textureIndex = 0,
    ): ArrayBufferView {
        const e = this._ensureTarget(target),
            te = target.isCocosRenderTarget
                ? { texture: target._cocosFramebuffer?.colorTextures[textureIndex] as Texture }
                : this._texture(e.textures[textureIndex], true),
            g = this.g;
        const r = new g.BufferTextureCopy();
        r.texOffset = new g.Offset(x, y, 0);
        r.texExtent = new g.Extent(w, h, 1);
        r.texSubres.baseArrayLayer = face ?? this._layer;
        this.device.copyTextureToBuffers(te.texture, [buffer], [r]);
        return buffer;
    }
    // Device escape hatch, kept exactly as the port exposes it (SPK-07): standalone asynchronous PBO
    // readback bypasses the gfx copy path on purpose. Do not widen or reroute.
    public async readRenderTargetPixelsAsync(
        target: SparkRenderTarget,
        x: number,
        y: number,
        w: number,
        h: number,
        buffer: ArrayBufferView,
        face?: number | null,
        textureIndex = 0,
    ): Promise<ArrayBufferView> {
        const gl = this.gl,
            g = this.g,
            layer = face ?? this._layer,
            f = this._framebuffer(target, layer, 0),
            gpu = (f.framebuffer as WebGL2Framebuffer).getGpuFramebuffer(),
            tex = (
                target.isCocosRenderTarget
                    ? (target._cocosFramebuffer?.colorTextures[textureIndex] as Texture)
                    : this._texture((this._ensureTarget(target) as TargetEntry).textures[textureIndex], true).texture
            ) as WebGL2Texture;
        const staging = this._own(
            this.device.createBuffer(
                new g.BufferInfo(
                    g.BufferUsageBit.VERTEX | g.BufferUsageBit.TRANSFER_DST,
                    g.MemoryUsageBit.HOST | g.MemoryUsageBit.DEVICE,
                    Math.max(4, buffer.byteLength),
                    4,
                ),
            ),
        );
        const native = (staging as WebGL2Buffer).getGpuBuffer().glBuffer;
        const oldRead = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
            oldDraw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
            oldPack = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING),
            oldAlign = gl.getParameter(gl.PACK_ALIGNMENT);
        let fence: WebGLSync | null = null;
        try {
            gl.bindFramebuffer(gl.FRAMEBUFFER, gpu.glFramebuffer);
            const framebufferStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (framebufferStatus !== gl.FRAMEBUFFER_COMPLETE)
                throw new Error(
                    'Incomplete native Spark readback framebuffer ' +
                        JSON.stringify({
                            status: framebufferStatus,
                            width: target.width,
                            height: target.height,
                            layer,
                            textureIndex,
                            colors: gpu.gpuColorViews.map((v) => ({
                                w: v.gpuTexture.width,
                                h: v.gpuTexture.height,
                                format: v.format,
                                baseLayer: v.baseLayer,
                            })),
                            depth: gpu.gpuDepthStencilView?.gpuTexture,
                        }),
                );
            gl.readBuffer(gl.COLOR_ATTACHMENT0 + textureIndex);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, native);
            gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
            gl.readPixels(x, y, w, h, tex.gpuTexture.glFormat, tex.gpuTexture.glType, 0);
            fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            gl.flush();
        } finally {
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, oldPack);
            gl.bindFramebuffer(gl.READ_FRAMEBUFFER, oldRead);
            gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, oldDraw);
            this.device.getStateCache().glReadFramebuffer = oldRead;
            this.device.getStateCache().glFramebuffer = oldDraw;
            gl.pixelStorei(gl.PACK_ALIGNMENT, oldAlign);
        }
        if (!fence) {
            this._destroy(staging);
            throw new Error('Cocos GPU readback fence creation failed');
        }
        // Typed-forced local: the fence narrowed above must stay non-null inside the poll closure.
        const sync = fence;
        try {
            await new Promise<void>((resolve, reject) => {
                const poll = () => {
                    if (this._disposed || gl.isContextLost())
                        return reject(new Error('Context lost during Cocos readback'));
                    const state = gl.clientWaitSync(sync, 0, 0);
                    if (state === gl.WAIT_FAILED) reject(new Error('Cocos readback fence failed'));
                    else if (state === gl.TIMEOUT_EXPIRED) setTimeout(poll, 0);
                    else resolve();
                };
                poll();
            });
            const previous = gl.getParameter(gl.PIXEL_PACK_BUFFER_BINDING);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, native);
            gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, buffer);
            gl.bindBuffer(gl.PIXEL_PACK_BUFFER, previous);
            return buffer;
        } finally {
            gl.deleteSync(sync);
            this._destroy(staging);
        }
    }
    public setAnimationLoop(callback: AnimationLoopCallback | null): void {
        if (this._raf != null) cancelAnimationFrame(this._raf);
        this._raf = null;
        this._loop = callback;
        // SPK-10: the forwarding target is the inert shell, so this is a no-op on the session side;
        // the normal requestAnimationFrame loop below keeps working unchanged.
        this.xr.setAnimationLoop(callback);
        if (callback && !this.xr.isPresenting) {
            const loop = (t: number) => {
                if (this._loop !== callback || this.xr.isPresenting) return;
                callback(t);
                this._raf = requestAnimationFrame(loop);
            };
            this._raf = requestAnimationFrame(loop);
        }
    }
    public resetState(): void {
        const c = this.device.getStateCache();
        this.gl.bindVertexArray(null);
        c.glVAO = null;
        this.gl.useProgram(null);
        c.glProgram = null;
        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
        c.glFramebuffer = null;
        c.glReadFramebuffer = null;
    }
    public dispose(): void {
        this.setAnimationLoop(null);
        this._disposed = true;
        // SPK-10: the former `this.xr.dispose()` ended the XR session and its animation loop; the
        // inert shell owns no session and nothing to release, so the call is dropped. dispose below
        // keeps the full non-XR release order.
        this.purgeMaterialCache();
        for (const o of [...this._owned].reverse()) this._destroy(o);
        this.cmd.destroy();
        if (this.ownsApp) this.app.close?.();
    }
}
