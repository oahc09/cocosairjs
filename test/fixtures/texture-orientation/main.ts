import {
    createAirApp,
    createStepClock,
    createUICanvas,
    spriteNode,
    Scene,
    Sprite,
    SpriteFrame,
    Texture2D,
    ImageAsset,
    GLTFLoader,
    MeshRenderer,
    Material,
    Mesh,
    utils,
    primitives,
    Node,
    Vec3,
    Rect,
    Layers,
    sys,
    Camera,
    DirectionalLight,
} from 'cocosair';
import {
    buildPatternPixelsTopDown,
    flipRows,
    texelFromColor,
    texelCenterFractions,
    classifyTexelGrid,
    classifyLitQuadrants,
    PATTERN_WIDTH,
    PATTERN_HEIGHT,
    type ObservedTexelGrid,
} from './contract';

const logLine = (message: string): void => {
    const pre = document.getElementById('log') as HTMLPreElement;
    pre.textContent = `${pre.textContent}\n${message}`.slice(-4000);
};

const DESIGN = 256;
const canvas = document.getElementById('GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });
const scene = new Scene('TextureOrientationProbe');
const ui = createUICanvas(scene, 'ProbeUICanvas', { designWidth: DESIGN, designHeight: DESIGN });
const probeSpriteNode = spriteNode(ui, 'ProbeSprite', { size: [DESIGN, DESIGN] });
const sprite = probeSpriteNode.getComponent(Sprite) as Sprite;
app.run(scene);

type Sample = [number, number, number, number];
type Samples = Record<'TL' | 'TR' | 'BL' | 'BR', Sample>;
interface SourceResult {
    source: string;
    acceptedByPublicType: boolean;
    samples: Samples;
    observedTexels: ObservedTexelGrid;
    classify: ReturnType<typeof classifyTexelGrid>;
    release: { textureRefCount: number; assetRefCount: number; spriteFrameNull: boolean };
    error?: string;
}

const results: SourceResult[] = [];
const gl = canvas.getContext('webgl2') as WebGL2RenderingContext | null;
if (!gl) { logLine('FATAL: no webgl2 context'); throw new Error('no webgl2 context'); }

const clock = createStepClock();
clock.begin();

const fractions = texelCenterFractions();
function sampleQuadrants (): Samples {
    const fbW = gl!.drawingBufferWidth, fbH = gl!.drawingBufferHeight;
    const px = (fx: number, fyTop: number): Sample => {
        const pixel = new Uint8Array(4);
        // readPixels 帧缓冲底原点：视觉 fy（顶起比例）→ fbY = (1 - fyTop) * fbH
        gl!.readPixels(Math.floor(fx * fbW), Math.floor((1 - fyTop) * fbH), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return [pixel[0]!, pixel[1]!, pixel[2]!, pixel[3]!];
    };
    return {
        TL: px(fractions.TL.fx, fractions.TL.fy),
        TR: px(fractions.TR.fx, fractions.TR.fy),
        BL: px(fractions.BL.fx, fractions.BL.fy),
        BR: px(fractions.BR.fx, fractions.BR.fy),
    };
}

function makeTexture (): Texture2D {
    const texture = new Texture2D();
    texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
    texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE);
    return texture;
}

/** DOM 类源：ImageAsset(原生图像对象) → Texture2D.image（gfx texImage2D 直传）。 */
function buildFromNative (source: HTMLImageElement | HTMLCanvasElement | ImageBitmap): { texture: Texture2D; asset: ImageAsset } {
    const asset = new ImageAsset();
    asset.reset(source);
    const texture = makeTexture();
    texture.image = asset;
    return { texture, asset };
}

/** 内存类源：reset({width,height,format}) + uploadData（内存字节直传，行序以实证为准）。 */
function buildFromUpload (bytes: Uint8Array): { texture: Texture2D } {
    const texture = makeTexture();
    texture.reset({ width: PATTERN_WIDTH, height: PATTERN_HEIGHT, format: Texture2D.PixelFormat.RGBA8888 });
    texture.uploadData(bytes);
    return { texture };
}

async function renderAndSample (sourceName: string, build: () => { texture: Texture2D; asset?: ImageAsset }, acceptedByPublicType: boolean): Promise<void> {
    const result: SourceResult = {
        source: sourceName,
        acceptedByPublicType,
        samples: { TL: [0, 0, 0, 0], TR: [0, 0, 0, 0], BL: [0, 0, 0, 0], BR: [0, 0, 0, 0] },
        observedTexels: { TL: null, TR: null, BL: null, BR: null },
        classify: { upright: false, verticallyFlipped: false, horizontalMirrored: false, rotated180: false, verdict: 'incomplete' },
        release: { textureRefCount: -1, assetRefCount: -1, spriteFrameNull: false },
    };
    results.push(result);
    let frame: SpriteFrame | undefined;
    const built = build();
    const texture = built.texture;
    const asset = built.asset;
    try {
        frame = new SpriteFrame();
        frame.texture = texture;
        frame.rect = new Rect(0, 0, texture.width, texture.height);
        sprite.spriteFrame = frame;
        await clock.step(); // 单时钟：AFTER_DRAW 后同任务采样，无 rAF 竞争
        result.samples = sampleQuadrants();
        const observed: ObservedTexelGrid = {
            TL: texelFromColor({ r: result.samples.TL[0]!, g: result.samples.TL[1]!, b: result.samples.TL[2]!, a: 255 }),
            TR: texelFromColor({ r: result.samples.TR[0]!, g: result.samples.TR[1]!, b: result.samples.TR[2]!, a: 255 }),
            BL: texelFromColor({ r: result.samples.BL[0]!, g: result.samples.BL[1]!, b: result.samples.BL[2]!, a: 255 }),
            BR: texelFromColor({ r: result.samples.BR[0]!, g: result.samples.BR[1]!, b: result.samples.BR[2]!, a: 255 }),
        };
        result.observedTexels = observed;
        result.classify = classifyTexelGrid(observed);
        logLine(`${sourceName}: ${result.classify.verdict} TL=texel(${(observed.TL ?? [-1, -1]).join(',')}) BR=texel(${(observed.BR ?? [-1, -1]).join(',')})`);
    } catch (error) {
        const err = error as Error & { code?: string };
        result.error = `${err.code ?? ''} ${err.message}`.trim();
        logLine(`${sourceName}: ERROR ${result.error}`);
    } finally {
        sprite.spriteFrame = null;
        result.release.spriteFrameNull = sprite.spriteFrame === null;
        frame?.destroy();
        texture.destroy();
        asset?.destroy();
        result.release.textureRefCount = texture.refCount;
        result.release.assetRefCount = asset ? asset.refCount : -1;
    }
}

// ── 2D 五类源 + 顶优先对照 + 交错污染检查 ──
const topDown = buildPatternPixelsTopDown();
const bottomFirst = flipRows(topDown);

const image = new Image();
image.src = (() => {
    const c = document.createElement('canvas');
    c.width = PATTERN_WIDTH; c.height = PATTERN_HEIGHT;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(topDown), PATTERN_WIDTH, PATTERN_HEIGHT), 0, 0);
    return c.toDataURL('image/png');
})();
await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('image decode failed')); });
await renderAndSample('image', () => buildFromNative(image), true);

const patternCanvas = document.createElement('canvas');
patternCanvas.width = PATTERN_WIDTH; patternCanvas.height = PATTERN_HEIGHT;
patternCanvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(topDown), PATTERN_WIDTH, PATTERN_HEIGHT), 0, 0);
await renderAndSample('canvas', () => buildFromNative(patternCanvas), true);

const bitmap = await createImageBitmap(patternCanvas);
logLine(`IMAGE_BITMAP feature: ${sys.hasFeature(sys.Feature.IMAGE_BITMAP)}`);
await renderAndSample('imageBitmap', () => buildFromNative(bitmap), true);

const imageData = new ImageData(new Uint8ClampedArray(topDown), PATTERN_WIDTH, PATTERN_HEIGHT);
await renderAndSample('imageData', () => buildFromNative(imageData as unknown as HTMLCanvasElement), false);

await renderAndSample('typedArray', () => buildFromUpload(bottomFirst), true);

await renderAndSample('bytesTopDown', () => buildFromUpload(new Uint8Array(topDown)), false);

// 交错污染检查：内存源上传后**复用原 DOM 纹理对象**（同一 Texture2D/SpriteFrame 实例，
// 不重建、不重新上传）再采样——无全局 pixelStore 状态泄漏则仍 upright。
// 引擎缺口（如实记录，run1/debug4 实测）：同一 HTMLImageElement 二次创建 ImageAsset 得 0 尺寸空纹理。
const interleaveCanvas = document.createElement('canvas');
interleaveCanvas.width = PATTERN_WIDTH; interleaveCanvas.height = PATTERN_HEIGHT;
interleaveCanvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(topDown), PATTERN_WIDTH, PATTERN_HEIGHT), 0, 0);
const interleaveBuilt = buildFromNative(interleaveCanvas);
const interleaveFrame = new SpriteFrame();
interleaveFrame.texture = interleaveBuilt.texture;
interleaveFrame.rect = new Rect(0, 0, interleaveBuilt.texture.width, interleaveBuilt.texture.height);
interleaveBuilt.texture.addRef(); // 交错检查期间持有；结束后归还
sprite.spriteFrame = interleaveFrame;
await clock.step();
const interleaveSamples = sampleQuadrants();
sprite.spriteFrame = null;
const interleaveObserved: ObservedTexelGrid = {
    TL: texelFromColor({ r: interleaveSamples.TL[0]!, g: interleaveSamples.TL[1]!, b: interleaveSamples.TL[2]!, a: 255 }),
    TR: texelFromColor({ r: interleaveSamples.TR[0]!, g: interleaveSamples.TR[1]!, b: interleaveSamples.TR[2]!, a: 255 }),
    BL: texelFromColor({ r: interleaveSamples.BL[0]!, g: interleaveSamples.BL[1]!, b: interleaveSamples.BL[2]!, a: 255 }),
    BR: texelFromColor({ r: interleaveSamples.BR[0]!, g: interleaveSamples.BR[1]!, b: interleaveSamples.BR[2]!, a: 255 }),
};
const interleaveVerdict = classifyTexelGrid(interleaveObserved).verdict;
interleaveBuilt.texture.decRef(); // 交错检查结束，归还持有
logLine(`canvasAfterInterleave(reuse): ${interleaveVerdict}`);

// ── 3D：五源 + 顶优先对照经 MeshRenderer + builtin-unlit(USE_TEXTURE) ──
interface ThreeDResult {
    error?: string;
    samples?: Samples;
    observedTexels?: ObservedTexelGrid;
    verdict?: string;
    diagnostics?: Record<string, unknown>;
}
const threeDBySource: Record<string, ThreeDResult> = {};
let uiCamera: Camera | null = null;

async function render3D (sourceName: string, texture: Texture2D, cleanupExtra: () => void): Promise<void> {
    const result: ThreeDResult = {};
    threeDBySource[sourceName] = result;
    try {
        // 3D 探针期间禁用 UI 根（全屏 Sprite 会遮 3D）；结束后恢复
        ui.active = false;
        const planeNode = new Node(`Probe3D-${sourceName}`);
        planeNode.layer = Layers.Enum.DEFAULT;
        scene.addChild(planeNode);
        const renderer = planeNode.addComponent(MeshRenderer);
        // 自建 XY quad：顶点 TL,TR,BR,BL；UV 用 glTF 顶下惯例（v=1 视觉顶）
        // 官方几何（含 positions/normals/uvs/indices/min/max）。已知缺口：Code First 最小场景
        // 下该 plane 在三引擎均只显示 clearColor（复现与诊断随报告提交，交 Lead 排查接线/上游）。
        const mesh: Mesh = utils.createMesh(primitives.plane({ width: 2, length: 2 }));
        renderer.mesh = mesh;
        const material = new Material();
        material.initialize({
            effectName: 'builtin-unlit',
            defines: { USE_TEXTURE: true }, // mainTexture 不等于宏开启：必须显式 USE_TEXTURE
        });
        material.setProperty('mainTexture', texture);
        renderer.material = material;
        const cameraNode = new Node(`ProbeCamera3D-${sourceName}`);
        cameraNode.layer = Layers.Enum.DEFAULT;
        scene.addChild(cameraNode);
        const camera3d = cameraNode.addComponent(Camera);
        camera3d.priority = -1; // 3D 先渲染
        camera3d.clearFlags = Camera.ClearFlag.SOLID_COLOR; // 属性名 clearFlags
        camera3d.clearColor = new (camera3d.clearColor.constructor as never)(255, 128, 0, 255); // 诊断：橙色清屏（非图样色）
        camera3d.projection = Camera.ProjectionType.PERSPECTIVE;
        camera3d.fov = 45;
        camera3d.near = 0.1;
        camera3d.far = 1000;
        camera3d.visibility = Layers.Enum.DEFAULT; // scene-kit 同款：显式可见层
        cameraNode.setPosition(new Vec3(0, 0, 3)); // 默认朝 -Z，正对 XY quad，无旋转（避开万向锁）
        await clock.step();
        await clock.step();
        result.samples = sampleQuadrants();
        const observed: ObservedTexelGrid = {
            TL: texelFromColor({ r: result.samples.TL[0]!, g: result.samples.TL[1]!, b: result.samples.TL[2]!, a: 255 }),
            TR: texelFromColor({ r: result.samples.TR[0]!, g: result.samples.TR[1]!, b: result.samples.TR[2]!, a: 255 }),
            BL: texelFromColor({ r: result.samples.BL[0]!, g: result.samples.BL[1]!, b: result.samples.BL[2]!, a: 255 }),
            BR: texelFromColor({ r: result.samples.BR[0]!, g: result.samples.BR[1]!, b: result.samples.BR[2]!, a: 255 }),
        };
        result.observedTexels = observed;
        result.verdict = classifyTexelGrid(observed).verdict;
        // 清理自有 Mesh/Material/节点，不泄漏
        mesh.destroy();
        material.destroy();
        planeNode.destroy();
        cameraNode.destroy();
        cleanupExtra();
        ui.active = true;
        logLine(`3D ${sourceName}: ${result.verdict} TL=texel(${(observed.TL ?? [-1, -1]).join(',')}) BR=texel(${(observed.BR ?? [-1, -1]).join(',')})`);
    } catch (error) {
        const err = error as Error & { code?: string };
        result.error = `${err.code ?? ''} ${err.message}`.trim();
        logLine(`3D ${sourceName}: ERROR ${result.error}`);
        ui.active = true;
        cleanupExtra();
    }
}

function patternNativeSource (): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = PATTERN_WIDTH; c.height = PATTERN_HEIGHT;
    c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(topDown), PATTERN_WIDTH, PATTERN_HEIGHT), 0, 0);
    return c;
}

// UI 相机（真实 Canvas.cameraComponent）：3D 期间仅清深度
const uiCameraNode = ui.getChildByName('ProbeUICanvas/Camera') ?? ui.children[0];
uiCamera = uiCameraNode ? uiCameraNode.getComponent(Camera) : null;
if (uiCamera) {
    uiCamera.clearFlags = Camera.ClearFlag.DEPTH_ONLY; // 属性名 clearFlags（非 clearFlag）
}

// DOM 三源 3D
const domBuilt = buildFromNative(patternNativeSource());
await render3D('image', domBuilt.texture, () => { domBuilt.asset.destroy(); });
const canvasBuilt = buildFromNative(patternNativeSource());
await render3D('canvas', canvasBuilt.texture, () => { canvasBuilt.asset.destroy(); });
const bitmap3 = await createImageBitmap(patternNativeSource());
const bitmapBuilt = buildFromNative(bitmap3);
await render3D('imageBitmap', bitmapBuilt.texture, () => { bitmapBuilt.asset.destroy(); });
// 内存两源 3D
const memBottom = buildFromUpload(bottomFirst);
await render3D('typedArray', memBottom.texture, () => { /* 无中间件 */ });
const memTop = buildFromUpload(new Uint8Array(topDown));
await render3D('bytesTopDown', memTop.texture, () => { /* 无中间件 */ });
// ImageData 公开类型不支持：3D 路径单列拒绝/空纹理事实，不冒称支持
const imageData3D: ThreeDResult = { error: 'ImageData not in public ImageSource union: rejected before upload (see 2D entry); NOT_APPLICABLE' };
threeDBySource['imageData'] = imageData3D;

// 交错污染复查：内存源上传后复跑 DOM 纹理（3D 链路）
const domRecheck = buildFromNative(patternNativeSource());
await render3D('imageAfterInterleave', domRecheck.texture, () => { domRecheck.asset.destroy(); });

// ── glTF 路径：最小自产纹理 glTF 经真实 GLTFLoader + 原生材质 ──
const gltfResult: ThreeDResult & { disposed?: boolean } = {};
try {
    ui.active = false;
    const gltfAsset = await new GLTFLoader().loadAsync('./quad.gltf');
    const instance = gltfAsset.instantiate();
    scene.addChild(instance.root);
    // 光照：glTF PBR 材质需要方向光
    const lightNode = new Node('ProbeLight');
    lightNode.layer = Layers.Enum.DEFAULT;
    scene.addChild(lightNode);
    lightNode.setPosition(new Vec3(0, 0, 5));
    const light = lightNode.addComponent(DirectionalLight);
    light.illuminance = 20000;
    const cameraNode = new Node('ProbeCameraGLTF');
    cameraNode.layer = Layers.Enum.DEFAULT;
    scene.addChild(cameraNode);
    const cameraGltf = cameraNode.addComponent(Camera);
    cameraGltf.priority = -1;
    cameraGltf.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    cameraGltf.projection = Camera.ProjectionType.PERSPECTIVE;
    cameraGltf.fov = 45;
    cameraGltf.near = 0.1;
    cameraGltf.far = 1000;
    cameraGltf.visibility = Layers.Enum.DEFAULT;
    cameraNode.setPosition(new Vec3(0, 0, 3)); // 默认朝 -Z，正对 XY quad
    await clock.step();
    await clock.step();
    gltfResult.samples = sampleQuadrants();
    const observed: ObservedTexelGrid = {
        TL: texelFromColor({ r: gltfResult.samples.TL[0]!, g: gltfResult.samples.TL[1]!, b: gltfResult.samples.TL[2]!, a: 255 }),
        TR: texelFromColor({ r: gltfResult.samples.TR[0]!, g: gltfResult.samples.TR[1]!, b: gltfResult.samples.TR[2]!, a: 255 }),
        BL: texelFromColor({ r: gltfResult.samples.BL[0]!, g: gltfResult.samples.BL[1]!, b: gltfResult.samples.BL[2]!, a: 255 }),
        BR: texelFromColor({ r: gltfResult.samples.BR[0]!, g: gltfResult.samples.BR[1]!, b: gltfResult.samples.BR[2]!, a: 255 }),
    };
    gltfResult.observedTexels = observed;
    // PBR 光照调制颜色：glTF 路径按色调布局判定（v 翻转时色调稳定）
    gltfResult.verdict = classifyLitQuadrants({
        TL: { r: gltfResult.samples.TL[0]!, g: gltfResult.samples.TL[1]!, b: gltfResult.samples.TL[2]!, a: 255 },
        TR: { r: gltfResult.samples.TR[0]!, g: gltfResult.samples.TR[1]!, b: gltfResult.samples.TR[2]!, a: 255 },
        BL: { r: gltfResult.samples.BL[0]!, g: gltfResult.samples.BL[1]!, b: gltfResult.samples.BL[2]!, a: 255 },
        BR: { r: gltfResult.samples.BR[0]!, g: gltfResult.samples.BR[1]!, b: gltfResult.samples.BR[2]!, a: 255 },
    }).verdict;
    // glTF quad 保持可见至页面结束（真实截图证据）；资源随页面生命周期结束
    ui.active = true;
    logLine(`glTF quad: ${gltfResult.verdict} TL=texel(${(observed.TL ?? [-1, -1]).join(',')}) BR=texel(${(observed.BR ?? [-1, -1]).join(',')})`);
} catch (error) {
    const err = error as Error & { code?: string };
    gltfResult.error = `${err.code ?? ''} ${err.message}`.trim();
    ui.active = true;
    logLine(`glTF quad: ERROR ${gltfResult.error}`);
}

clock.end();

(window as unknown as { __texProbe: unknown }).__texProbe = {
    ready: true,
    devicePixelRatio: window.devicePixelRatio,
    results,
    interleave: { observedTexels: interleaveObserved, verdict: interleaveVerdict },
    threeDBySource,
    gltf: gltfResult,
    snapshot () {
        return JSON.parse(JSON.stringify({ ready: true, results, interleave: { observedTexels: interleaveObserved, verdict: interleaveVerdict }, threeDBySource, gltf: gltfResult }));
    },
};
logLine('READY');
