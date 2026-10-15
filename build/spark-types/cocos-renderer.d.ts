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
import { nativeEngine } from './engine';
import type { AirApp } from './engine';
import { Color, Matrix4, Vector3 } from './spark-api-adapter';
import type { Attribute, Buffer, CommandBuffer, DescriptorSet, DescriptorSetLayout, Framebuffer, Format, InputAssembler, PipelineLayout, PipelineState, RenderPass, Sampler, Shader, Texture, TextureType } from './native-gfx.js';
import type { WebGL2Device } from './native-gfx.js';
import type { WebGL2Framebuffer } from './native-gfx.js';
interface InertXrShell {
    enabled: boolean;
    isPresenting: boolean;
    getSession(): null;
    getCamera(): null;
    setAnimationLoop(callback: AnimationLoopCallback | null): void;
}
type GfxNamespace = typeof import('../cocosair.module.js').gfx;
type NumericArray = Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float32Array | Float64Array;
type AnimationLoopCallback = (time: number, ...args: unknown[]) => void;
/** Structural surface of the dynamically imported cocosair engine namespace, as `create()` uses it. */
interface AirAppSurface {
    run(scene: unknown): void | Promise<unknown>;
    close?(): void | Promise<unknown>;
}
interface AirNodeSurface {
    addChild(node: AirNodeSurface): void;
    addComponent(cameraClass: unknown): {
        visibility: number;
    };
}
interface AirSceneSurface {
    addChild(node: AirNodeSurface): void;
}
interface AirEngineSurface {
    macro: {
        ENABLE_WEBGL_ANTIALIAS: boolean;
        ENABLE_TRANSPARENT_CANVAS: boolean;
    };
    createAirApp(options: {
        canvas: HTMLCanvasElement;
        pixelRatioCap: number;
        diagnostics: string;
    }): Promise<AirAppSurface>;
    Scene: new (name?: string) => AirSceneSurface;
    Node: new (name?: string) => AirNodeSurface;
    Camera: unknown;
    Size: new (width: number, height: number) => unknown;
    screen: {
        windowSize: unknown;
    };
    view: {
        setDesignResolutionSize(width: number, height: number, policy: unknown): void;
    };
    ResolutionPolicy: {
        EXACT_FIT: unknown;
    };
    director: {
        root: {
            device: WebGL2Device;
            resize(width: number, height: number): void;
            mainWindow: {
                framebuffer: WebGL2Framebuffer;
            };
        };
    };
    game: {
        pause(): void;
    };
    gfx: GfxNamespace;
}
/** Duck-typed shapes of adapter/Spark objects this renderer reads (no algorithm, fields only). */
interface SparkUniforms {
    [name: string]: {
        value: unknown;
    } | undefined;
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
    source?: {
        data?: SparkImageData;
        dataReady?: boolean;
    } | null;
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
    drawRange?: {
        start: number;
        count: number;
    };
    addEventListener?: (type: string, callback: () => void) => void;
}
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
    onBeforeRender?: (renderer: CocosRenderer, scene: SparkObject, camera: SparkCamera | null, geometry: SparkGeometry | null | undefined, material: SparkMaterial, group: unknown) => void;
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
    onBeforeRender?: (renderer: CocosRenderer, scene: SparkObject, camera: SparkCamera | null, geometry: SparkGeometry | null | undefined, material: SparkMaterial, group: unknown) => void;
    onAfterRender?: (renderer: CocosRenderer, scene: SparkObject, camera: SparkCamera | null, geometry: SparkGeometry, material: SparkMaterial, group: unknown) => void;
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
export declare class CocosRenderer {
    static create({ canvas, width, height, pixelRatio, engineUrl, antialias, alpha, ...options }?: CocosRendererOptions): Promise<CocosRenderer>;
    cc: AirEngineSurface;
    app: AirAppSurface;
    domElement: HTMLCanvasElement;
    device: WebGL2Device;
    g: GfxNamespace;
    gl: WebGL2RenderingContext;
    coordinateSystem: number;
    ownsApp: boolean;
    isCocosRenderer: true;
    autoClear: boolean;
    autoClearColor: boolean;
    autoClearDepth: boolean;
    autoClearStencil: boolean;
    outputColorSpace: string;
    toneMapping: number;
    toneMappingExposure: number;
    sortObjects: boolean;
    _target: SparkRenderTarget | null;
    _layer: number;
    _mip: number;
    _pixelRatio: number;
    _renderDepth: number;
    _clearColor: number[];
    _clearAlpha: number;
    _engineScene?: unknown;
    _width: number;
    _height: number;
    _viewport: ViewportRect;
    _scissor: ViewportRect;
    _scissorTest?: boolean;
    _eyeViewport: SparkRectLike | null;
    _screen?: PassSet;
    _boundTarget: number;
    _raf: number | null;
    _loop: AnimationLoopCallback | null;
    _disposed?: boolean;
    private _textures;
    private _targets;
    private _materials;
    private _geometries;
    private _owned;
    _liveMaterials: Set<MaterialEntry>;
    _liveGeometries: Set<GeometryEntry>;
    private _materialListeners;
    private _geometryListeners;
    private _textureListeners;
    private _properties;
    properties: {
        get: (o: object) => Record<string, unknown>;
        has: (o: object) => boolean;
        remove: (o: object) => boolean;
    };
    /** SPK-10 inert XR shell: the field itself must survive because frozen Spark reads renderer.xr.* unconditionally. */
    xr: InertXrShell;
    capabilities: {
        isWebGL2: true;
        logarithmicDepthBuffer: boolean;
        maxTextureSize: number;
        maxTextures: number;
        maxVertexTextures: number;
        precision: string;
    };
    extensions: {
        get(name: string): unknown;
        has(name: string): boolean;
    };
    info: {
        render: {
            frame: number;
            calls: number;
            triangles: number;
            points: number;
            lines: number;
        };
        memory: {
            geometries: number;
            textures: number;
        };
        programs: {
            program: WebGLProgram;
            name: string;
            vertex: string;
            fragment: string;
        }[];
    };
    cmd: CommandBuffer;
    _texBinding: number;
    state: {
        activeTexture(unit: number): void;
        bindTexture(target: number, texture: WebGLTexture | null): void;
        unbindTexture(): void;
        pixelStorei(...args: [number, unknown]): void;
        reset(): void;
    };
    constructor(cc: typeof nativeEngine, app: AirApp, canvas: HTMLCanvasElement, options?: CocosRendererOptions);
    constructor(cc: AirEngineSurface, app: AirAppSurface, canvas: HTMLCanvasElement, options?: CocosRendererOptions);
    getContext(): WebGL2RenderingContext;
    getPixelRatio(): number;
    setPixelRatio(r: number): void;
    setSize(w: number, h: number, updateStyle?: boolean): this;
    getSize<T extends SparkVector2Setter>(out: T): T;
    getDrawingBufferSize<T extends SparkVector2Setter>(out: T): T;
    setViewport(x: number | SparkRectLike, y?: number, w?: number, h?: number): void;
    getViewport<T extends SparkVector4Setter>(out: T): T;
    setScissor(x: number | SparkRectLike, y?: number, w?: number, h?: number): void;
    getScissor<T extends SparkVector4Setter>(out: T): T;
    setScissorTest(v: boolean): void;
    getScissorTest(): boolean;
    setClearColor(c: number | string | {
        r: number;
        g: number;
        b: number;
    }, a?: number): this;
    setClearAlpha(a: number): void;
    getClearAlpha(): number;
    getClearColor<T extends SparkColorSetter>(out: T): T;
    getRenderTarget(): SparkRenderTarget | null;
    getActiveCubeFace(): number;
    getActiveMipmapLevel(): number;
    setRenderTarget(target: SparkRenderTarget | null, layer?: number, mip?: number): void;
    _own<T extends {
        destroy(): void;
    }>(o: T): T;
    _destroy(o?: {
        destroy(): void;
    } | null): void;
    _format(t: SparkTexture): Format;
    _sampler(t: SparkTexture): Sampler;
    initTexture(t: SparkTexture): Texture;
    _texture(t: SparkTexture | null | undefined, renderTarget?: boolean): TextureEntry;
    _ensureTarget(t: SparkRenderTarget): TargetEntry;
    _disposeTarget(t: SparkRenderTarget): void;
    _framebuffer(t?: SparkRenderTarget | null, layer?: number, mip?: number): FramebufferEntry;
    _ensureCocosTarget(t: SparkRenderTarget): TargetEntry;
    releaseRenderTarget(target: SparkRenderTarget): void;
    _ensureXrTarget(t: SparkRenderTarget): TargetEntry;
    _releaseXrTarget(t: SparkRenderTarget | null | undefined): void;
    _screenPasses(): PassSet;
    _sources(m: SparkMaterial): {
        vs: string;
        fs: string;
    };
    _material(m: SparkMaterial): MaterialEntry;
    _disposeMaterial(m: SparkMaterial): void;
    _disposeGeometry(geo: SparkGeometry): void;
    purgeMaterialCache(): {
        materials: number;
        geometries: number;
        released: number;
        remaining: number;
    };
    _generateMipmaps(texture: Texture): void;
    compile(scene: SparkObject, camera: SparkCamera | null): SparkObject;
    compileAsync(scene: SparkObject, camera: SparkCamera | null): Promise<SparkObject>;
    _geometry(geo: SparkGeometry, p: MaterialEntry): GeometryEntry;
    _pso(m: SparkMaterial, p: MaterialEntry, geometry: GeometryEntry, pass: RenderPass, flipped?: boolean): PipelineState;
    _uniforms(m: SparkMaterial, p: MaterialEntry, obj: SparkObject, camera: SparkCamera | null): void;
    _draw(obj: SparkObject, camera: SparkCamera | null, scene: SparkObject): void;
    render(scene: SparkObject, camera: SparkCamera | null): void;
    clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
    readRenderTargetPixels(target: SparkRenderTarget, x: number, y: number, w: number, h: number, buffer: ArrayBufferView, face?: number | null, textureIndex?: number): ArrayBufferView;
    readRenderTargetPixelsAsync(target: SparkRenderTarget, x: number, y: number, w: number, h: number, buffer: ArrayBufferView, face?: number | null, textureIndex?: number): Promise<ArrayBufferView>;
    setAnimationLoop(callback: AnimationLoopCallback | null): void;
    resetState(): void;
    dispose(): void;
}
export {};
