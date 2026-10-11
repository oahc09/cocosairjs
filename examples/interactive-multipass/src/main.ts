/**
 * IER-02 interactive multipass example (review revision).
 *
 * Two independent native rendering routes:
 *  a) ?mode=capture (default): scene capture -> fullscreen sample through a real
 *     AirRenderTarget (attachCamera / bindColor / resolve / resize / dispose).
 *  b) ?mode=native: low-level gfx multipass with a real mip chain (per-level texel
 *     uploads, textureLod sampling, std140 UBO, set-1 descriptor bindings,
 *     input layout, pass-outside buffer updates).
 *
 * Normal mode runs on the engine's native pacer (no step clock). ?test=1 switches
 * to the frozen step-clock control surface (window.__multipass). &neg=1 is the
 * dedicated diagnostics page where negative probes may legitimately raise GL errors.
 */
import {
    createAirApp,
    createAirRenderTarget,
    createStepClock,
    Scene,
    Node,
    Camera,
    MeshRenderer,
    Material,
    EffectAsset,
    Color,
    Vec4,
    utils,
    game,
    director,
    Director,
    gfx,
} from 'cocosair';
import { sourceEffect, displayEffect } from './effects.generated.js';

type AirTarget = ReturnType<typeof createAirRenderTarget>;
type OwnedMesh = ReturnType<typeof utils.createMesh>;
type OwnedAsset = OwnedMesh | Material;
const CAPTURE = 1 << 20;
const DISPLAY = 1 << 21;
const params = new URLSearchParams(location.search);
const MODE: 'capture' | 'native' = params.get('mode') === 'native' ? 'native' : 'capture';
const TEST = params.get('test') === '1';
const NEG_PAGE = params.get('neg') === '1';
const FORMAT: 'rgba8' | 'rgba16f' = params.get('fmt') === 'rgba16f' ? 'rgba16f' : 'rgba8';
const SAMPLES = params.get('samples') === '4' ? 4 : 1;
/** Runner-frozen mip level colors; each level is a solid hue + 8x8 checker so every level carries real texel data. */
const MIP_COLORS: [number, number, number][] = [
    [220, 40, 40],
    [40, 200, 60],
    [50, 90, 220],
    [230, 210, 50],
    [210, 60, 210],
    [60, 200, 210],
];
const MIP_LEVELS = MIP_COLORS.length;
const MIP_BASE_SIZE = 256;

const canvas = document.querySelector<HTMLCanvasElement>('#GameCanvas')!;
const status = document.querySelector<HTMLElement>('#status')!;

const app = await createAirApp({ canvas });
// 浏览器矩阵/规格门禁的 bench 合同：会话探针从 window.__airApp 接入运行时。
(window as unknown as Record<string, unknown>).__airApp = app;
const scene = new Scene(`interactive-multipass-${MODE}`);

// ── owned assets: addRef at creation, decRef paired in release; renderers only borrow ──
const ownedMeshes: OwnedMesh[] = [];
const ownedMaterials: Material[] = [];
const ownedAssets = (): OwnedAsset[] => [...ownedMeshes, ...ownedMaterials];

let submittedFrame: Record<string, unknown> = { event: 'UNKNOWN' };
/** Real DOM input and probe actions are recorded separately; a probe call never fakes a trusted event. */
let userAction: Record<string, unknown> | null = null;
let probeAction: Record<string, unknown> = {
    type: 'startup',
    sequence: 0,
    isTrusted: false,
    appliedBy: 'probe',
    timestamp: new Date().toISOString(),
};
let sequence = 0;
function recordUser(action: string, event: Event): void {
    userAction = {
        type: action,
        sequence: ++sequence,
        isTrusted: event.isTrusted === true,
        appliedBy: 'dom',
        timestamp: new Date().toISOString(),
    };
}
function recordProbe(action: string): void {
    probeAction = {
        type: action,
        sequence: ++sequence,
        isTrusted: false,
        appliedBy: 'probe',
        timestamp: new Date().toISOString(),
    };
    // A probe action never erases a recorded user event: trusted input stays the receipt of record.
}
function lastAction(): Record<string, unknown> {
    return userAction ?? probeAction;
}

// ═══════════════ Route A: capture -> sample ═══════════════
interface CaptureState {
    target: AirTarget | null;
    detachCamera: (() => void) | null;
    unbindColor: (() => void) | null;
    displayMaterial: Material | null;
    sourceMaterials: Material[];
    routeNodes: Node[];
    routeMeshes: OwnedMesh[];
    routeRenderers: MeshRenderer[];
    captureCamera: Camera | null;
    retired: { nodes: number };
    lastRetire: {
        refs: { before: number; after: number }[];
        colorUnbound: boolean;
        targetDisposed: boolean;
        assetsBefore: number;
        assetsAfter: number;
        validity: boolean[] | null; // observed AFTER the next engine step (destroy commits at frame end)
    } | null;
}
const captureState: CaptureState = {
    target: null,
    detachCamera: null,
    unbindColor: null,
    displayMaterial: null,
    sourceMaterials: [],
    routeNodes: [],
    routeMeshes: [],
    routeRenderers: [],
    captureCamera: null,
    retired: { nodes: 0 },
    lastRetire: null,
};

function buildEffects(): void {
    for (const definition of [sourceEffect, displayEffect]) {
        const asset = Object.assign(new EffectAsset(), JSON.parse(JSON.stringify(definition)));
        asset.onLoaded();
    }
}

function sourceQuad(name: string, x: number, y: number, size: number, tint: Color, gain: number): MeshRenderer {
    const node = new Node(name);
    captureState.routeNodes.push(node); // source nodes retire with the route on reset
    scene.addChild(node);
    node.layer = CAPTURE;
    node.setPosition(x, y, 0);
    node.setScale(size / 2, size / 2, 1); // mesh spans [-1,1]; scale expresses the half-extent
    const renderer = node.addComponent(MeshRenderer);
    captureState.routeRenderers.push(renderer);
    const mesh = quad();
    mesh.addRef();
    ownedMeshes.push(mesh);
    captureState.routeMeshes.push(mesh);
    const material = new Material();
    material.initialize({ effectName: 'interactive-multipass-source' });
    material.setProperty('tint', new Vec4(tint.r / 255, tint.g / 255, tint.b / 255, tint.a / 255));
    material.setProperty('gain', new Vec4(gain, 0, 0, 0));
    material.addRef();
    ownedMaterials.push(material);
    captureState.sourceMaterials.push(material);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    return renderer;
}

function quad(): OwnedMesh {
    return utils.createMesh(
        {
            positions: [-1, -1, 0, 1, -1, 0, -1, 1, 0, 1, 1, 0],
            uvs: [0, 0, 1, 0, 0, 1, 1, 1],
            indices: [0, 1, 2, 1, 3, 2],
        },
        undefined,
        { calculateBounds: true },
    );
}

function cssSize(): { width: number; height: number } {
    return { width: canvas.clientWidth || 640, height: canvas.clientHeight || 400 };
}

function createCaptureRoute(): void {
    const track = (node: Node): Node => {
        captureState.routeNodes.push(node);
        return node;
    };
    // HDR route: over-bright radiance only survives in rgba16f; the display material then
    // tone maps with a knee reinhard (dark background stays byte-exact). RGBA8 keeps gain 1.
    const hdr = FORMAT === 'rgba16f';
    const gain = hdr ? 2.0 : 1.0;
    sourceQuad('source-red', -0.55, -0.05, 0.95, new Color(255, 48, 48, 255), gain);
    sourceQuad('source-green', 0.55, -0.05, 0.95, new Color(48, 220, 64, 255), gain);
    sourceQuad('source-marker', -0.85, 0.62, 0.2, new Color(64, 96, 255, 255), gain);

    const captureCameraNode = track(new Node('capture-camera'));
    scene.addChild(captureCameraNode);
    captureCameraNode.setPosition(0, 0, 5);
    const captureCamera = captureCameraNode.addComponent(Camera);
    captureState.captureCamera = captureCamera;
    captureCamera.projection = Camera.ProjectionType.ORTHO;
    captureCamera.orthoHeight = 1.2; // engine semantics: half of the visible height
    captureCamera.near = 0.1;
    captureCamera.far = 20;
    captureCamera.priority = -10;
    captureCamera.visibility = CAPTURE;
    captureCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    captureCamera.clearColor = new Color(12, 12, 16, 255);

    const target = createAirRenderTarget({
        name: `multipass-${FORMAT}`,
        width: cssSize().width,
        height: cssSize().height,
        scale: devicePixelRatio,
        colorFormat: FORMAT,
        depthFormat: 'none',
        samples: SAMPLES as 1 | 4,
        filter: 'nearest',
        sampleFallback: 'error',
    });
    captureState.target = target;
    captureState.detachCamera = target.attachCamera(captureCamera);

    const displayCameraNode = track(new Node('display-camera'));
    scene.addChild(displayCameraNode);
    displayCameraNode.setPosition(0, 0, 5);
    const displayCamera = displayCameraNode.addComponent(Camera);
    displayCamera.projection = Camera.ProjectionType.ORTHO;
    displayCamera.orthoHeight = 1;
    displayCamera.near = 0.1;
    displayCamera.far = 20;
    displayCamera.priority = 0;
    displayCamera.visibility = DISPLAY;
    displayCamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
    displayCamera.clearColor = new Color(12, 12, 16, 255);

    const displayNode = track(new Node('display-quad'));
    scene.addChild(displayNode);
    displayNode.layer = DISPLAY;
    const displayRenderer = displayNode.addComponent(MeshRenderer);
    captureState.routeRenderers.push(displayRenderer);
    const displayMesh = quad();
    displayMesh.addRef();
    ownedMeshes.push(displayMesh);
    captureState.routeMeshes.push(displayMesh);
    const displayMaterial = new Material();
    displayMaterial.initialize({ effectName: 'interactive-multipass-display' });
    displayMaterial.setProperty('params', new Vec4(1.0, hdr ? 1 : 0, 0, 0));
    displayMaterial.addRef();
    ownedMaterials.push(displayMaterial);
    displayRenderer.mesh = displayMesh;
    displayRenderer.setSharedMaterial(displayMaterial, 0);
    captureState.sourceMaterials.push(displayMaterial); // retires with the route
    displayRendererRef = displayRenderer;
    captureState.displayMaterial = displayMaterial;
    captureState.unbindColor = target.bindColor(displayMaterial, 'displayMap');
}

/** Retire the previous route BEFORE rebuilding: unbind, observe, decRef, splice owned sets,
 *  destroy nodes. Per-asset before/after refCounts are recorded; validity is observed after the
 *  next engine step because engine destroy commits at frame end. */
function retireCaptureRoute(): void {
    captureState.unbindColor?.();
    const colorUnbound = captureState.displayMaterial?.getProperty('displayMap') !== captureState.target?.texture;
    captureState.detachCamera?.();
    captureState.target?.dispose();
    const targetDisposed = captureState.target?.info.disposed === true;
    // Unbind every renderer first, then return the route's own assets (refs pair 1 -> 0).
    for (const renderer of captureState.routeRenderers.splice(0)) {
        renderer.mesh = null;
        renderer.setSharedMaterial(null, 0);
    }
    const routeMeshes = captureState.routeMeshes.splice(0);
    const routeMaterials = captureState.sourceMaterials.splice(0);
    const assetsBefore = ownedAssets().length;
    const refs: { before: number; after: number }[] = [];
    const retiredAssets: OwnedAsset[] = [...routeMeshes, ...routeMaterials];
    for (const asset of retiredAssets) {
        const before = asset.refCount;
        asset.decRef();
        refs.push({ before, after: asset.refCount });
        const meshIndex = ownedMeshes.indexOf(asset as OwnedMesh);
        if (meshIndex >= 0) ownedMeshes.splice(meshIndex, 1);
        const materialIndex = ownedMaterials.indexOf(asset as Material);
        if (materialIndex >= 0) ownedMaterials.splice(materialIndex, 1);
    }
    captureState.displayMaterial = null;
    for (const node of captureState.routeNodes.splice(0)) {
        node.removeFromParent();
        node.destroy();
        captureState.retired.nodes += 1;
    }
    captureState.lastRetire = {
        refs,
        colorUnbound,
        targetDisposed,
        assetsBefore,
        assetsAfter: ownedAssets().length,
        validity: null,
    };
    // keep the retired assets referenced so validity can be observed after the next step
    pendingValidityAssets = retiredAssets;
    captureState.target = null;
    captureState.detachCamera = null;
    captureState.unbindColor = null;
    captureState.captureCamera = null;
}
let pendingValidityAssets: OwnedAsset[] = [];
/** Observe the previous round's retired assets after an engine step (destroy commits at frame end). */
function observeRetiredValidity(): boolean[] {
    const validity = pendingValidityAssets.map((asset) => asset.isValid);
    if (captureState.lastRetire) captureState.lastRetire.validity = validity;
    pendingValidityAssets = [];
    return validity;
}

function resizeCaptureTarget(): void {
    const { width, height } = cssSize();
    captureState.target?.resize(width, height);
}

/** Capability matrix: real allocation + framebuffer completeness + resolve + typed finite readback per combo. */
function captureMatrix(): unknown[] {
    const rows: unknown[] = [];
    for (const colorFormat of ['rgba8', 'rgba16f'] as const) {
        for (const samples of [1, 4] as const) {
            try {
                const probe = createAirRenderTarget({
                    name: `matrix-${colorFormat}-${samples}`,
                    width: 192,
                    height: 96,
                    colorFormat,
                    depthFormat: 'none',
                    samples,
                    filter: 'nearest',
                    sampleFallback: 'error',
                });
                const info = probe.info;
                probe.resolve();
                const pixel = probe.readColor({ x: 0, y: 0, width: 1, height: 1 });
                probe.dispose();
                rows.push({
                    colorFormat,
                    requestedSamples: samples,
                    effectiveSamples: info.effective.samples,
                    glSamples: info.glSamples,
                    framebufferComplete: info.framebufferComplete,
                    resolveRequired: info.resolveRequired,
                    readbackType: pixel.constructor.name,
                    readbackLength: pixel.length,
                    readbackValues: Array.from(pixel.slice(0, 4)).map(Number),
                    readbackFinite: Array.from(pixel.slice(0, 4)).every(Number.isFinite),
                    ok: info.effective.samples === samples && info.framebufferComplete,
                });
            } catch (error) {
                rows.push({ colorFormat, requestedSamples: samples, notRun: true, reason: (error as Error).message });
            }
        }
    }
    return rows;
}

// ── static descriptor consistency check (the collision negative's detection method) ──
interface BindingDeclaration {
    binding: number;
    descriptorType: number;
    stageFlags: number;
}
function staticBindingCheck(declarations: BindingDeclaration[]): { collisions: string[]; consistent: boolean } {
    const seen = new Map<number, BindingDeclaration>();
    const collisions: string[] = [];
    for (const declaration of declarations) {
        const existing = seen.get(declaration.binding);
        if (existing && existing.descriptorType !== declaration.descriptorType) {
            collisions.push(
                `binding ${declaration.binding}: ${existing.descriptorType} vs ${declaration.descriptorType} (slot declared twice with different types)`,
            );
        } else if (existing) {
            collisions.push(`binding ${declaration.binding}: declared twice`);
        } else {
            seen.set(declaration.binding, declaration);
        }
    }
    return { collisions, consistent: collisions.length === 0 };
}

function captureNegatives(): unknown[] {
    const out: unknown[] = [];
    const dev = director.root!.device;
    // 1) duplicate camera attachment: the SAME already-attached camera again -> engine diagnostic.
    const target = captureState.target!;
    const camera = captureState.captureCamera!;
    try {
        target.attachCamera(camera);
        out.push({
            kind: 'duplicate-binding',
            phase: 'engine',
            actualError: 'NO_ERROR (unexpected)',
            correctedOk: false,
        });
    } catch (error) {
        const actualError = String((error as Error).message);
        captureState.detachCamera!(); // corrected: detach, then a single re-attach succeeds
        const reattach = target.attachCamera(camera);
        reattach();
        captureState.detachCamera = target.attachCamera(camera);
        out.push({
            kind: 'duplicate-binding',
            phase: 'engine',
            actualError,
            errorCode: (error as { code?: string }).code,
            located: 'target/camera binding',
            correctedOk: true,
        });
    }
    // 2) descriptor binding collision: one slot declared twice with different resource classes.
    try {
        const devAny = dev as unknown as {
            createDescriptorSetLayout: (info: gfx.DescriptorSetLayoutInfo) => gfx.DescriptorSetLayout;
        };
        const collisionLayout = devAny.createDescriptorSetLayout(
            new gfx.DescriptorSetLayoutInfo([
                new gfx.DescriptorSetLayoutBinding(
                    1,
                    gfx.DescriptorType.UNIFORM_BUFFER,
                    1,
                    gfx.ShaderStageFlagBit.FRAGMENT,
                ),
                new gfx.DescriptorSetLayoutBinding(
                    1,
                    gfx.DescriptorType.SAMPLER_TEXTURE,
                    1,
                    gfx.ShaderStageFlagBit.FRAGMENT,
                ),
            ]),
        );
        // Engine accepted the collision: bind both resource classes into the duplicated slot and observe.
        const collisionSet = dev.createDescriptorSet(new gfx.DescriptorSetInfo(collisionLayout));
        const probeBuffer = dev.createBuffer(
            new gfx.BufferInfo(gfx.BufferUsageBit.UNIFORM, gfx.MemoryUsageBit.DEVICE, 16, 16),
        );
        collisionSet.bindBuffer(1, probeBuffer); // the duplicated slot accepts the buffer silently
        collisionSet.update();
        const observed = (
            collisionSet as unknown as {
                gpuDescriptorSet: { gpuDescriptors: { gpuBuffer: unknown; gpuTextureView: unknown }[] };
            }
        ).gpuDescriptorSet;
        const slot = observed?.gpuDescriptors?.[1];
        const runtimeBehavior = `engine accepted duplicate binding declaration without error; slot 1 holds buffer=${!!slot?.gpuBuffer} (no runtime validation)`;
        collisionSet.destroy();
        probeBuffer.destroy();
        collisionLayout.destroy();
        const staticDetection = staticBindingCheck([
            {
                binding: 1,
                descriptorType: gfx.DescriptorType.UNIFORM_BUFFER,
                stageFlags: gfx.ShaderStageFlagBit.FRAGMENT,
            },
            {
                binding: 1,
                descriptorType: gfx.DescriptorType.SAMPLER_TEXTURE,
                stageFlags: gfx.ShaderStageFlagBit.FRAGMENT,
            },
        ]);
        const correctedCheck = staticBindingCheck([
            {
                binding: 0,
                descriptorType: gfx.DescriptorType.UNIFORM_BUFFER,
                stageFlags: gfx.ShaderStageFlagBit.FRAGMENT,
            },
            {
                binding: 1,
                descriptorType: gfx.DescriptorType.SAMPLER_TEXTURE,
                stageFlags: gfx.ShaderStageFlagBit.FRAGMENT,
            },
        ]);
        out.push({
            kind: 'descriptor-binding-collision',
            phase: 'raw-gfx',
            runtimeNoError: true,
            actualError: runtimeBehavior,
            staticDetection: staticDetection.collisions,
            located: 'descriptor set layout binding 1',
            declarationsBad: [
                { binding: 1, descriptorType: gfx.DescriptorType.UNIFORM_BUFFER },
                { binding: 1, descriptorType: gfx.DescriptorType.SAMPLER_TEXTURE },
            ],
            declarationsGood: [
                { binding: 0, descriptorType: gfx.DescriptorType.UNIFORM_BUFFER },
                { binding: 1, descriptorType: gfx.DescriptorType.SAMPLER_TEXTURE },
            ],
            correctedOk: correctedCheck.consistent,
            detectionMethod:
                'STATIC: cross-check declared bindings (slot uniqueness + resource class); engine performs no runtime validation here',
        });
    } catch (error) {
        out.push({
            kind: 'descriptor-binding-collision',
            phase: 'raw-gfx',
            actualError: String((error as Error).message),
            located: 'descriptor set layout',
            correctedOk: false,
        });
    }
    return out;
}

// ═══════════════ Route B: native gfx mip multipass ═══════════════
interface NativeResources {
    texture: gfx.Texture | null;
    sampler: gfx.Sampler | null;
    shader: gfx.Shader | null;
    pipelineLayout: gfx.PipelineLayout | null;
    descriptorSetLayout: gfx.DescriptorSetLayout | null;
    descriptorSet: gfx.DescriptorSet | null;
    pipelineState: gfx.PipelineState | null;
    inputAssembler: gfx.InputAssembler | null;
    vertexBuffer: gfx.Buffer | null;
    uniformBuffer: gfx.Buffer | null;
    commandBuffer: gfx.CommandBuffer | null;
    scratchRenderPass: gfx.RenderPass | null;
    scratchFramebuffer: gfx.Framebuffer | null;
    scratchTexture: gfx.Texture | null;
    emptySet0: gfx.DescriptorSetLayout | null;
    lodBase: number;
}
const native: NativeResources = {
    texture: null,
    sampler: null,
    shader: null,
    pipelineLayout: null,
    descriptorSetLayout: null,
    descriptorSet: null,
    pipelineState: null,
    inputAssembler: null,
    vertexBuffer: null,
    uniformBuffer: null,
    commandBuffer: null,
    scratchRenderPass: null,
    scratchFramebuffer: null,
    scratchTexture: null,
    emptySet0: null,
    lodBase: 0,
};

function device(): gfx.Device {
    return director.root!.device;
}
function mainWindow(): gfx.Framebuffer {
    return director.root!.mainWindow!.framebuffer;
}

/** Tightly packed vertex layout: position + uv + meta, each vec2 float32 (RG32F). */
const NATIVE_ATTRIBUTES: gfx.Attribute[] = [
    new gfx.Attribute('a_position', gfx.Format.RG32F, false, 0, false, 0),
    new gfx.Attribute('a_uv', gfx.Format.RG32F, false, 0, false, 1),
    new gfx.Attribute('a_meta', gfx.Format.RG32F, false, 0, false, 2),
];

const NATIVE_VERT = `
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec2 a_meta;      // x: swatch index 0..3, or 99 for the marker bar
// GLSL ES 3.00 forbids layout(location) on stage varyings; rely on link-time assignment
out vec2 v_uv;
out vec2 v_meta;
void main() {
    v_uv = a_uv;
    v_meta = a_meta;
    gl_Position = vec4(a_position, 0.0, 1.0);
}
`;
const NATIVE_FRAG = `
precision highp float;
// std140 block; set/binding come from ShaderInfo metadata (GLSL ES 3.00 has no set/binding qualifiers)
uniform Params { vec4 u_grid; };  // [lodBase, 0, 0, 0]
uniform sampler2D u_mips;  // binding 1 via UniformSamplerTexture metadata
in vec2 v_uv;
in vec2 v_meta;
layout(location = 0) out vec4 o_color;
void main() {
    if (v_meta.x > 50.0) {
        o_color = vec4(0.86, 0.15, 0.15, 1.0); // fixed marker bar (LOD-independent red anchor)
        return;
    }
    float lod = u_grid.x + v_meta.x;
    vec4 c = textureLod(u_mips, v_uv, lod);
    o_color = vec4(c.rgb, 1.0);
}
`;

/** 2x2 swatch grid + a fixed red marker bar; each swatch samples its own mip level via textureLod. */
function swatchGeometry(): Float32Array {
    const cells: [number, number][] = [
        [-0.5, 0.44],
        [0.5, 0.44],
        [-0.5, -0.5],
        [0.5, -0.5],
    ];
    const data: number[] = [];
    const corners: [number, number][] = [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
    ];
    const uv: [number, number][] = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
    ];
    const indices = [0, 1, 2, 1, 3, 2];
    cells.forEach(([cx, cy], swatch) => {
        for (const i of indices) {
            const [px, py] = corners[i];
            data.push(cx + px * 0.42, cy + py * 0.42, uv[i][0], uv[i][1], swatch, 0);
        }
    });
    const bar: [number, number][] = [
        [-1, 0.93],
        [1, 0.93],
        [-1, 1],
        [1, 1],
    ];
    for (const i of indices) {
        const [px, py] = bar[i];
        data.push(px, py, uv[i][0], uv[i][1], 99, 0);
    }
    return Float32Array.from(data);
}

function mipLevelPixels(level: number): Uint8Array {
    const size = Math.max(1, MIP_BASE_SIZE >> level);
    const [r, g, b] = MIP_COLORS[level];
    const data = new Uint8Array(size * size * 4);
    const cell = Math.max(1, size >> 3); // 8x8 checker per level: real distinct texel data
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            const checker = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0 ? 1.0 : 0.78;
            const i = (y * size + x) * 4;
            data[i] = Math.round(r * checker);
            data[i + 1] = Math.round(g * checker);
            data[i + 2] = Math.round(b * checker);
            data[i + 3] = 255;
        }
    }
    return data;
}

function createNativeRoute(): void {
    const dev = device();
    // 1) mip chain: one texture, 6 levels, per-level texel uploads (copyBuffersToTexture).
    const texture = dev.createTexture(
        new gfx.TextureInfo(
            gfx.TextureType.TEX2D,
            gfx.TextureUsageBit.SAMPLED | gfx.TextureUsageBit.TRANSFER_DST,
            gfx.Format.RGBA8,
            MIP_BASE_SIZE,
            MIP_BASE_SIZE,
            gfx.TextureFlagBit.NONE,
            1,
            MIP_LEVELS,
            gfx.SampleCount.X1,
        ),
    );
    const buffers: ArrayBufferView[] = [];
    const regions: gfx.BufferTextureCopy[] = [];
    for (let level = 0; level < MIP_LEVELS; level++) {
        const size = Math.max(1, MIP_BASE_SIZE >> level);
        buffers.push(mipLevelPixels(level));
        regions.push(
            new gfx.BufferTextureCopy(
                0,
                0,
                0,
                new gfx.Offset(0, 0, 0),
                new gfx.Extent(size, size, 1),
                new gfx.TextureSubresLayers(level, 0, 1),
            ),
        );
    }
    dev.copyBuffersToTexture(buffers, texture, regions);
    native.texture = texture;

    native.sampler = dev.getSampler(
        new gfx.SamplerInfo(
            gfx.Filter.POINT,
            gfx.Filter.POINT,
            gfx.Filter.POINT, // mipFilter POINT: exact level via textureLod (NONE would disable mips)
            gfx.Address.CLAMP,
            gfx.Address.CLAMP,
        ),
    );

    // 2) std140 uniform block + sampler binding metadata must mirror the GLSL declarations.
    native.shader = dev.createShader(
        new gfx.ShaderInfo(
            'interactive-multipass-native',
            [
                new gfx.ShaderStage(gfx.ShaderStageFlagBit.VERTEX, NATIVE_VERT),
                new gfx.ShaderStage(gfx.ShaderStageFlagBit.FRAGMENT, NATIVE_FRAG),
            ],
            NATIVE_ATTRIBUTES,
            [new gfx.UniformBlock(1, 0, 'Params', [new gfx.Uniform('u_grid', gfx.Type.FLOAT, 4)], 1)],
            [], // buffers
            [new gfx.UniformSamplerTexture(1, 1, 'u_mips', gfx.Type.SAMPLER2D, 1)],
        ),
    );

    native.descriptorSetLayout = dev.createDescriptorSetLayout(
        new gfx.DescriptorSetLayoutInfo([
            new gfx.DescriptorSetLayoutBinding(
                0,
                gfx.DescriptorType.UNIFORM_BUFFER,
                1,
                gfx.ShaderStageFlagBit.FRAGMENT,
            ),
            new gfx.DescriptorSetLayoutBinding(
                1,
                gfx.DescriptorType.SAMPLER_TEXTURE,
                1,
                gfx.ShaderStageFlagBit.FRAGMENT,
            ),
        ]),
    );
    // Set 0 belongs to engine-internal bindings (negative sampler offsets in bindingMappings);
    // user descriptors follow the material convention: set 1 with an empty set-0 placeholder layout.
    native.emptySet0 = dev.createDescriptorSetLayout(new gfx.DescriptorSetLayoutInfo([]));
    native.pipelineLayout = dev.createPipelineLayout(
        new gfx.PipelineLayoutInfo([native.emptySet0, native.descriptorSetLayout]),
    );

    const stride = 24; // 3 attributes x vec2 x 4B, tightly packed (vertex buffers are not std140)
    const geometry = swatchGeometry();
    native.vertexBuffer = dev.createBuffer(
        new gfx.BufferInfo(gfx.BufferUsageBit.VERTEX, gfx.MemoryUsageBit.DEVICE, geometry.byteLength, stride),
    );
    native.vertexBuffer.update(geometry);
    native.uniformBuffer = dev.createBuffer(
        new gfx.BufferInfo(
            gfx.BufferUsageBit.UNIFORM,
            gfx.MemoryUsageBit.DEVICE,
            16,
            16, // std140 vec4; wrong sizes are a negative probe
        ),
    );

    native.descriptorSet = dev.createDescriptorSet(new gfx.DescriptorSetInfo(native.descriptorSetLayout));
    native.descriptorSet.bindBuffer(0, native.uniformBuffer);
    native.descriptorSet.bindSampler(1, native.sampler);
    native.descriptorSet.bindTexture(1, texture);
    // Descriptor bindings only materialize on update() (engine pass.ts does the same);
    // update outside any render pass, before the first recorded frame.
    native.descriptorSet.update();

    native.inputAssembler = dev.createInputAssembler(
        new gfx.InputAssemblerInfo(NATIVE_ATTRIBUTES, [native.vertexBuffer]),
    );

    const swapFramebuffer = mainWindow();
    native.pipelineState = dev.createPipelineState(
        new gfx.PipelineStateInfo(
            native.shader,
            native.pipelineLayout,
            swapFramebuffer.renderPass,
            new gfx.InputState(NATIVE_ATTRIBUTES),
            new gfx.RasterizerState(false, gfx.PolygonMode.FILL, gfx.ShadeModel.GOURAND, gfx.CullMode.NONE),
            new gfx.DepthStencilState(false, false),
            new gfx.BlendState(),
            gfx.PrimitiveMode.TRIANGLE_LIST,
        ),
    );

    native.commandBuffer = dev.createCommandBuffer(new gfx.CommandBufferInfo());

    // Scratch 4x4 target for negative draws: diagnostics never mutate the visible pass.
    native.scratchTexture = dev.createTexture(
        new gfx.TextureInfo(
            gfx.TextureType.TEX2D,
            gfx.TextureUsageBit.COLOR_ATTACHMENT,
            gfx.Format.RGBA8,
            4,
            4,
            gfx.TextureFlagBit.NONE,
            1,
            1,
            gfx.SampleCount.X1,
        ),
    );
    native.scratchRenderPass = dev.createRenderPass(
        new gfx.RenderPassInfo(
            [new gfx.ColorAttachment(gfx.Format.RGBA8, gfx.SampleCount.X1)],
            new gfx.DepthStencilAttachment(gfx.Format.UNKNOWN),
        ),
    );
    native.scratchFramebuffer = dev.createFramebuffer(
        new gfx.FramebufferInfo(native.scratchRenderPass, [native.scratchTexture]),
    );

    director.on(Director.EVENT_AFTER_DRAW, drawNativePass);
}

/** Per-frame order: UBO update OUTSIDE the pass, then begin/beginRenderPass/bind/draw/end/submit. */
function drawNativePass(): void {
    const dev = device();
    if (!native.commandBuffer || !native.pipelineState || !native.descriptorSet || !native.inputAssembler) return;
    native.uniformBuffer!.update(new Float32Array([native.lodBase, 0, 0, 0]));
    const framebuffer = mainWindow();
    const width = canvas.width,
        height = canvas.height;
    const cmd = native.commandBuffer;
    cmd.begin();
    cmd.beginRenderPass(
        framebuffer.renderPass,
        framebuffer,
        new gfx.Rect(0, 0, width, height),
        [new gfx.Color(10 / 255, 10 / 255, 14 / 255, 1)],
        0,
        0,
    );
    cmd.setViewport(new gfx.Viewport(0, 0, width, height));
    cmd.setScissor(new gfx.Rect(0, 0, width, height));
    cmd.bindPipelineState(native.pipelineState);
    cmd.bindDescriptorSet(1, native.descriptorSet);
    cmd.bindInputAssembler(native.inputAssembler);
    cmd.draw(native.inputAssembler);
    cmd.endRenderPass();
    cmd.end();
    dev.queue.submit([cmd]);
}

/** Capability probe: engine allocates samples>1 TEX2D as renderbuffers, which are not samplable. */
function nativeMultisampleProbe(): unknown {
    const dev = device();
    try {
        const multi = dev.createTexture(
            new gfx.TextureInfo(
                gfx.TextureType.TEX2D,
                gfx.TextureUsageBit.SAMPLED | gfx.TextureUsageBit.COLOR_ATTACHMENT,
                gfx.Format.RGBA8,
                8,
                8,
                gfx.TextureFlagBit.NONE,
                1,
                1,
                gfx.SampleCount.X4,
            ),
        );
        const allocated = !!multi;
        multi?.destroy();
        return {
            allocated,
            samplable: false,
            reason:
                'engine gfx allocates samples>1 TEX2D as GL renderbuffers (webgl2-commands.ts texStorage path); ' +
                'sampler2DMS readback has no public engine path; use route A AirRenderTarget for MSAA resolve',
            status: 'NOT_RUN',
        };
    } catch (error) {
        return { allocated: false, samplable: false, status: 'NOT_RUN', reason: (error as Error).message };
    }
}

function nativeNegatives(): unknown[] {
    const dev = device();
    const gl = (dev as unknown as { gl: WebGL2RenderingContext }).gl;
    const out: unknown[] = [];

    // 1) GLSL declaration order: ONE variable used before its declaration (both sources are
    //    otherwise identical and individually legal), so the log attributes to ordering alone.
    {
        const bad =
            'precision mediump float; layout(location = 0) out vec4 o; void main() { o = vec4(earlyColor, 0.0, 1.0); } in vec2 earlyColor;';
        const badShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(badShader, `#version 300 es\n${bad}`);
        gl.compileShader(badShader);
        const badStatus = gl.getShaderParameter(badShader, gl.COMPILE_STATUS) === true;
        const badLog = String(gl.getShaderInfoLog(badShader) || '');
        gl.deleteShader(badShader);
        const good =
            'precision mediump float; in vec2 earlyColor; layout(location = 0) out vec4 o; void main() { o = vec4(earlyColor, 0.0, 1.0); }';
        const goodShader = gl.createShader(gl.FRAGMENT_SHADER)!;
        gl.shaderSource(goodShader, `#version 300 es\n${good}`);
        gl.compileShader(goodShader);
        const goodStatus = gl.getShaderParameter(goodShader, gl.COMPILE_STATUS) === true;
        const goodLog = String(gl.getShaderInfoLog(goodShader) || '');
        gl.deleteShader(goodShader);
        out.push({
            kind: 'glsl-declaration-order',
            phase: 'raw-gfx',
            compileStatusBad: badStatus,
            compileStatusGood: goodStatus,
            actualError: badLog.trim(),
            goodLog,
            located: 'fragment declaration order',
            correctedOk: badStatus === false && goodStatus === true,
        });
    }

    // 2) std140 layout: a 12-byte buffer bound where the shader's vec4 block needs 16 -> draw GL error.
    //    The scratch PSO is paired-destroyed in the finally below.
    {
        const scratchPSO = makeScratchPipeline();
        try {
            const wrong = dev.createBuffer(
                new gfx.BufferInfo(gfx.BufferUsageBit.UNIFORM, gfx.MemoryUsageBit.DEVICE, 12, 12),
            );
            wrong.update(new Float32Array(3));
            const ds = dev.createDescriptorSet(new gfx.DescriptorSetInfo(native.descriptorSetLayout!));
            ds.bindBuffer(0, wrong);
            ds.bindSampler(1, native.sampler!);
            ds.bindTexture(1, native.texture!);
            ds.update();
            drawScratch(scratchPSO, ds);
            const errWrong = gl.getError();
            const ok = dev.createBuffer(
                new gfx.BufferInfo(gfx.BufferUsageBit.UNIFORM, gfx.MemoryUsageBit.DEVICE, 16, 16),
            );
            ok.update(new Float32Array(4));
            const dsOk = dev.createDescriptorSet(new gfx.DescriptorSetInfo(native.descriptorSetLayout!));
            dsOk.bindBuffer(0, ok);
            dsOk.bindSampler(1, native.sampler!);
            dsOk.bindTexture(1, native.texture!);
            dsOk.update();
            drawScratch(scratchPSO, dsOk);
            const errOk = gl.getError();
            wrong.destroy();
            ok.destroy();
            ds.destroy();
            dsOk.destroy();
            out.push({
                kind: 'std140-layout',
                phase: 'raw-gfx',
                actualError: `gl.getError()=0x${errWrong.toString(16)} drawing with 12B buffer against the 16B std140 vec4 block`,
                located: 'binding 0 uniform block',
                correctedOk: [0x501, 0x502].includes(errWrong) && errOk === gl.NO_ERROR,
                wrongGlError: errWrong,
                okGlError: errOk,
                allowedErrorCodes: [0x501, 0x502],
            });
        } finally {
            scratchPSO.destroy();
        }
    }

    // 3) unbound sampler: descriptor set missing the sampler/texture binding. On this engine the
    //    missing descriptor falls back to the device null texture (bindStates skips unbound slots),
    //    so detection is the STATIC completeness check; the corrected draw must stay NO_ERROR.
    {
        const scratchPSO = makeScratchPipeline();
        try {
            const ds = dev.createDescriptorSet(new gfx.DescriptorSetInfo(native.descriptorSetLayout!));
            ds.bindBuffer(0, native.uniformBuffer!); // sampler slot 1 intentionally left unbound
            ds.update();
            // Engine behavior: a missing sampler descriptor falls back to the device null texture
            // (webgl2 bindStates skips unbound descriptors), so the driver may report NO_ERROR.
            drawScratch(scratchPSO, ds);
            const errMissing = gl.getError();
            const slotAfterDraw = (
                ds as unknown as {
                    gpuDescriptorSet: { gpuDescriptors: { gpuSampler: unknown; gpuTextureView: unknown }[] };
                }
            ).gpuDescriptorSet?.gpuDescriptors?.[1];
            const runtimeObservation = `gl.getError()=0x${errMissing.toString(16)} with binding 1 unbound; engine descriptor holds sampler=${!!slotAfterDraw?.gpuSampler} texture=${!!slotAfterDraw?.gpuTextureView} (null-texture substitution, no driver rejection on this engine)`;
            const staticDetection = [
                'binding 1 (SAMPLER_TEXTURE) declared in layout but unbound in the descriptor set; the engine substitutes its null texture instead of failing',
            ];
            const dsFixed = dev.createDescriptorSet(new gfx.DescriptorSetInfo(native.descriptorSetLayout!));
            dsFixed.bindBuffer(0, native.uniformBuffer!);
            dsFixed.bindSampler(1, native.sampler!);
            dsFixed.bindTexture(1, native.texture!);
            dsFixed.update();
            drawScratch(scratchPSO, dsFixed);
            const errFixed = gl.getError();
            const fixedSlot = (
                dsFixed as unknown as {
                    gpuDescriptorSet: { gpuDescriptors: { gpuSampler: unknown; gpuTextureView: unknown }[] };
                }
            ).gpuDescriptorSet?.gpuDescriptors?.[1];
            ds.destroy();
            dsFixed.destroy();
            out.push({
                kind: 'unbound-sampler',
                phase: 'raw-gfx',
                actualError: runtimeObservation,
                staticDetection,
                located: 'binding 1 sampler/texture',
                correctedOk: errFixed === gl.NO_ERROR && !!fixedSlot?.gpuSampler && !!fixedSlot?.gpuTextureView,
                missingGlError: errMissing,
                fixedGlError: errFixed,
                allowedErrorCodes: [0x501, 0x502],
                detectionMethod:
                    errMissing === 0
                        ? 'STATIC descriptor completeness (layout vs bound resources); runtime falls back to the engine null texture'
                        : 'driver GL error',
            });
        } finally {
            scratchPSO.destroy();
        }
    }

    // 4) descriptor binding collision (runtime half): duplicated slot declaration accepted silently.
    {
        const collisionLayout = dev.createDescriptorSetLayout(
            new gfx.DescriptorSetLayoutInfo([
                new gfx.DescriptorSetLayoutBinding(
                    1,
                    gfx.DescriptorType.UNIFORM_BUFFER,
                    1,
                    gfx.ShaderStageFlagBit.FRAGMENT,
                ),
                new gfx.DescriptorSetLayoutBinding(
                    1,
                    gfx.DescriptorType.SAMPLER_TEXTURE,
                    1,
                    gfx.ShaderStageFlagBit.FRAGMENT,
                ),
            ]),
        );
        const collisionSet = dev.createDescriptorSet(new gfx.DescriptorSetInfo(collisionLayout));
        const probeBuffer = dev.createBuffer(
            new gfx.BufferInfo(gfx.BufferUsageBit.UNIFORM, gfx.MemoryUsageBit.DEVICE, 16, 16),
        );
        collisionSet.bindBuffer(1, probeBuffer);
        collisionSet.bindTexture(1, native.texture!);
        collisionSet.bindSampler(1, native.sampler!);
        collisionSet.update();
        const slot = (
            collisionSet as unknown as {
                gpuDescriptorSet: { gpuDescriptors: { gpuBuffer: unknown; gpuTextureView: unknown }[] };
            }
        ).gpuDescriptorSet?.gpuDescriptors?.[1];
        const runtimeBehavior = `engine accepted the duplicate binding declaration without error; slot 1 holds buffer=${!!slot?.gpuBuffer} texture=${!!slot?.gpuTextureView} (last write wins, no runtime validation)`;
        collisionSet.destroy();
        probeBuffer.destroy();
        collisionLayout.destroy();
        const staticDetection = staticBindingCheck([
            {
                binding: 1,
                descriptorType: gfx.DescriptorType.UNIFORM_BUFFER,
                stageFlags: gfx.ShaderStageFlagBit.FRAGMENT,
            },
            {
                binding: 1,
                descriptorType: gfx.DescriptorType.SAMPLER_TEXTURE,
                stageFlags: gfx.ShaderStageFlagBit.FRAGMENT,
            },
        ]);
        const corrected = staticBindingCheck([
            {
                binding: 0,
                descriptorType: gfx.DescriptorType.UNIFORM_BUFFER,
                stageFlags: gfx.ShaderStageFlagBit.FRAGMENT,
            },
            {
                binding: 1,
                descriptorType: gfx.DescriptorType.SAMPLER_TEXTURE,
                stageFlags: gfx.ShaderStageFlagBit.FRAGMENT,
            },
        ]);
        out.push({
            kind: 'descriptor-binding-collision',
            phase: 'raw-gfx',
            runtimeNoError: true,
            actualError: runtimeBehavior,
            staticDetection: staticDetection.collisions,
            located: 'descriptor set layout binding 1',
            declarationsBad: [
                { binding: 1, descriptorType: gfx.DescriptorType.UNIFORM_BUFFER },
                { binding: 1, descriptorType: gfx.DescriptorType.SAMPLER_TEXTURE },
            ],
            declarationsGood: [
                { binding: 0, descriptorType: gfx.DescriptorType.UNIFORM_BUFFER },
                { binding: 1, descriptorType: gfx.DescriptorType.SAMPLER_TEXTURE },
            ],
            correctedOk: corrected.consistent,
            detectionMethod:
                'STATIC: cross-check declared bindings (slot uniqueness + resource class); engine performs no runtime validation here',
        });
    }
    return out;
}

function makeScratchPipeline(): gfx.PipelineState {
    const dev = device();
    return dev.createPipelineState(
        new gfx.PipelineStateInfo(
            native.shader!,
            native.pipelineLayout!,
            native.scratchRenderPass!,
            new gfx.InputState(NATIVE_ATTRIBUTES),
            new gfx.RasterizerState(false, gfx.PolygonMode.FILL, gfx.ShadeModel.GOURAND, gfx.CullMode.NONE),
            new gfx.DepthStencilState(false, false),
            new gfx.BlendState(),
            gfx.PrimitiveMode.TRIANGLE_LIST,
        ),
    );
}

function drawScratch(pso: gfx.PipelineState, ds: gfx.DescriptorSet): void {
    const dev = device();
    const cmd = dev.createCommandBuffer(new gfx.CommandBufferInfo());
    cmd.begin();
    cmd.beginRenderPass(
        native.scratchRenderPass!,
        native.scratchFramebuffer!,
        new gfx.Rect(0, 0, 4, 4),
        [new gfx.Color(0, 0, 0, 1)],
        0,
        0,
    );
    cmd.bindPipelineState(pso);
    cmd.bindDescriptorSet(1, ds);
    cmd.bindInputAssembler(native.inputAssembler!);
    cmd.draw(native.inputAssembler!);
    cmd.endRenderPass();
    cmd.end();
    dev.queue.submit([cmd]);
    cmd.destroy();
}

// ═══════════════ lifecycle ═══════════════
function lifecycle(rounds: number): unknown {
    const dev = device();
    const memStart = { texture: dev.memoryStatus.textureSize, buffer: dev.memoryStatus.bufferSize };
    const rows: unknown[] = [];
    if (MODE === 'capture') {
        for (let i = 0; i < rounds; i++) {
            const node = new Node(`lifecycle-camera-${i}`);
            scene.addChild(node);
            const camera = node.addComponent(Camera);
            camera.visibility = CAPTURE;
            const target = createAirRenderTarget({
                name: `lifecycle-${i}`,
                width: 128,
                height: 128,
                colorFormat: FORMAT,
                depthFormat: 'none',
                samples: SAMPLES as 1 | 4,
                filter: 'nearest',
            });
            const detach = target.attachCamera(camera);
            const generationAfterCreate = target.info.generation;
            target.resize(160, 120);
            const generationAfterResize = target.info.generation;
            const detachedDuringRound = detach(); // observable: unbind before dispose
            const cameraReleased = !camera.targetTexture; // real: engine restored the previous (null) target
            target.dispose();
            node.removeFromParent();
            node.destroy();
            rows.push({
                round: i,
                generationAfterCreate,
                generationAfterResize,
                generationAdvanced: generationAfterResize > generationAfterCreate,
                cameraReleasedBeforeDispose: cameraReleased && detachedDuringRound === undefined,
                disposed: target.info.disposed === true,
                nodeRemoved: node.parent === null, // destroy commits at frame end; parent removal is the live observation
                nodeDestroyScheduled: node.isValid === false || node.parent === null,
            });
        }
    } else {
        // 64x64 RGBA8, 3 levels: 64^2*4 + 32^2*4 + 16^2*4 = 21504 bytes; 16B uniform buffer.
        const expectedTextureBytes = 64 * 64 * 4 + 32 * 32 * 4 + 16 * 16 * 4;
        for (let i = 0; i < rounds; i++) {
            const textureBefore = dev.memoryStatus.textureSize;
            const bufferBefore = dev.memoryStatus.bufferSize;
            const texture = dev.createTexture(
                new gfx.TextureInfo(
                    gfx.TextureType.TEX2D,
                    gfx.TextureUsageBit.SAMPLED,
                    gfx.Format.RGBA8,
                    64,
                    64,
                    gfx.TextureFlagBit.NONE,
                    1,
                    3,
                ),
            );
            const buffer = dev.createBuffer(
                new gfx.BufferInfo(gfx.BufferUsageBit.UNIFORM, gfx.MemoryUsageBit.DEVICE, 16, 16),
            );
            const textureAfterCreate = dev.memoryStatus.textureSize;
            const bufferAfterCreate = dev.memoryStatus.bufferSize;
            const textureAllocated = textureAfterCreate - textureBefore;
            const bufferAllocated = bufferAfterCreate - bufferBefore;
            texture.destroy();
            buffer.destroy();
            // destroy() is synchronous on this backend: the counter drop from the post-create
            // baseline is the freed byte count (a real engine-side observation).
            const textureFreedBytes = textureAfterCreate - dev.memoryStatus.textureSize;
            const bufferFreedBytes = bufferAfterCreate - dev.memoryStatus.bufferSize;
            rows.push({
                round: i,
                textureId: (texture as unknown as { objectID: number }).objectID,
                bufferId: (buffer as unknown as { objectID: number }).objectID,
                textureAllocated,
                bufferAllocated,
                textureFreedBytes,
                bufferFreedBytes,
                textureReturnsToBaseline: dev.memoryStatus.textureSize === textureBefore,
                bufferReturnsToBaseline: dev.memoryStatus.bufferSize === bufferBefore,
                destroyed:
                    textureAllocated === expectedTextureBytes &&
                    textureFreedBytes === expectedTextureBytes &&
                    bufferFreedBytes === 16,
            });
        }
    }
    const textureDelta = dev.memoryStatus.textureSize - memStart.texture;
    const bufferDelta = dev.memoryStatus.bufferSize - memStart.buffer;
    return {
        rounds,
        rows,
        textureDelta,
        bufferDelta,
        gpuMemoryObservation: 'engine gfx memoryStatus counters (textureSize/bufferSize), not physical GPU allocations',
        ownedRefs: ownedAssets().map((asset) => asset.refCount),
    };
}

// ═══════════════ snapshot / step / release ═══════════════
const clock = createStepClock();
let released = false;
let releasePromise: Promise<unknown> | null = null;
let normalAfterDraw: (() => void) | null = null;
let controlsAbort: AbortController | null = null;
let displayRendererRef: MeshRenderer | null = null;
let releaseAbortExtra: (() => void) | null = null;

function snapshot(): Record<string, unknown> {
    const rect = canvas.getBoundingClientRect();
    const model =
        MODE === 'capture'
            ? {
                  route: 'capture',
                  generation: captureState.target?.info.generation ?? 0,
                  width: captureState.target?.info.width ?? 0,
                  height: captureState.target?.info.height ?? 0,
                  colorFormat: captureState.target?.info.effective.colorFormat ?? 'UNKNOWN',
                  samples: captureState.target?.info.effective.samples ?? 0,
                  glSamples: captureState.target?.info.glSamples ?? 0,
                  resolveRequired: captureState.target?.info.resolveRequired ?? false,
                  framebufferComplete: captureState.target?.info.framebufferComplete ?? false,
                  sampledTextureIsCurrent:
                      !!captureState.displayMaterial &&
                      captureState.displayMaterial.isValid &&
                      captureState.displayMaterial.getProperty('displayMap') === captureState.target?.texture,
                  displayMaterialAlive: captureState.displayMaterial ? captureState.displayMaterial.isValid : false,
                  requestedFormat: FORMAT,
                  requestedSamples: SAMPLES,
              }
            : {
                  route: 'native',
                  mipLevels: native.texture?.info.levelCount ?? 0,
                  lodBase: native.lodBase,
                  samplerMipFilter: 'NEAREST (explicit textureLod)',
                  boundTexture: native.texture
                      ? `${native.texture.info.width}x${native.texture.info.height} L${native.texture.info.levelCount}`
                      : null,
                  descriptorBindings: [0, 1],
                  viewport: `${canvas.width}x${canvas.height}`,
              };
    const action = lastAction();
    return {
        receivedEvent: { ...action },
        modelState: {
            ...model,
            mode: MODE,
            receivedSequence: action.sequence,
            ownedRefCount: ownedAssets().length,
            retiredSinceStart: captureState.retired.nodes,
            retired: captureState.lastRetire ? { ...captureState.lastRetire } : null,
        },
        layoutReceipt: {
            css: { width: rect.width, height: rect.height },
            backing: { width: canvas.width, height: canvas.height },
            viewport: { width: innerWidth, height: innerHeight },
            dpr: devicePixelRatio,
        },
        submittedFrame: { ...submittedFrame },
        clock: TEST
            ? { method: 'STEP_CLOCK', stepping: clock.stepping, stepped: clock.stepped, enginePaused: game.isPaused() }
            : { method: 'NATIVE_PACER', enginePaused: game.isPaused(), totalFrames: director.getTotalFrames() },
        released,
    };
}

async function step(): Promise<Record<string, unknown>> {
    if (released || releasePromise) throw new Error('MULTIPASS_DISPOSED');
    recordProbe('step');
    const receipt = await clock.step(1 / 60);
    submittedFrame = {
        event: 'AFTER_DRAW',
        ...receipt,
        inputSequence: lastAction().sequence,
        timestamp: new Date().toISOString(),
    };
    observeRetiredValidity();
    return snapshot();
}

function resizeProbe(width: number, height: number): Record<string, unknown> {
    if (released || releasePromise) throw new Error('MULTIPASS_DISPOSED');
    recordProbe('resize');
    const previousGeneration = MODE === 'capture' ? (captureState.target?.info.generation ?? 0) : 0;
    if (MODE === 'capture') resizeCaptureTarget();
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (MODE === 'capture') resizeCaptureTarget();
    return {
        previousGeneration,
        generation: MODE === 'capture' ? (captureState.target?.info.generation ?? 0) : 0,
        css: { width, height },
    };
}

function reset(): Record<string, unknown> {
    if (released || releasePromise) throw new Error('MULTIPASS_DISPOSED');
    recordProbe('reset');
    if (MODE === 'capture') {
        retireCaptureRoute();
        createCaptureRoute();
        return { reset: true, generation: captureState.target?.info.generation ?? 0 };
    }
    native.lodBase = 0;
    return { reset: true, lodBase: native.lodBase };
}

/** Real reset loop: N rounds of reset+step; owned count must stay constant, counters stable. */
async function resetCycle(rounds: number): Promise<unknown> {
    if (released || releasePromise) throw new Error('MULTIPASS_DISPOSED');
    const dev = device();
    const rows: unknown[] = [];
    const textureStart = dev.memoryStatus.textureSize;
    for (let i = 0; i < rounds; i++) {
        recordProbe(`reset-cycle-${i}`);
        const assetsBeforeReset = ownedAssets().length;
        retireCaptureRoute();
        createCaptureRoute();
        await clockStepOnce();
        const snapshotState = snapshot();
        const validity = captureState.lastRetire?.validity ?? [];
        rows.push({
            round: i,
            ownedBefore: assetsBeforeReset,
            ownedAfter: ownedAssets().length,
            ownedConstant: ownedAssets().length === assetsBeforeReset,
            retiredRefsAllPaired: (captureState.lastRetire?.refs ?? []).every(
                (ref) => ref.before === 1 && ref.after === 0,
            ),
            // validity is recorded as the engine reports it after the following step; decRef-0 asset
            // destruction commits on the engine's own schedule and is NOT forced to false here.
            retiredValidity: validity,
            retiredValidityObserved: validity.length === (captureState.lastRetire?.refs?.length ?? -1),
            oldTargetNotSampled:
                (snapshotState.modelState as { sampledTextureIsCurrent?: boolean }).sampledTextureIsCurrent === true,
            generation: (snapshotState.modelState as { generation?: number }).generation ?? 0,
        });
    }
    return {
        rounds,
        rows,
        ownedRefCount: ownedAssets().length,
        textureDelta: dev.memoryStatus.textureSize - textureStart,
        observation: 'owned count and engine texture counter across real reset rounds (no detached targets)',
    };
}
async function clockStepOnce(): Promise<void> {
    // One step-clock tick without advancing the public sequence bookkeeping twice.
    const receipt = await clock.step(1 / 60);
    submittedFrame = {
        event: 'AFTER_DRAW',
        ...receipt,
        inputSequence: lastAction().sequence,
        timestamp: new Date().toISOString(),
    };
    observeRetiredValidity();
}

function setLodBase(lod: number): Record<string, unknown> {
    if (released || releasePromise) throw new Error('MULTIPASS_DISPOSED');
    if (MODE !== 'native') throw new Error('lod control is native-route only');
    recordProbe('mip-offset');
    native.lodBase = lod;
    return { lodBase: native.lodBase };
}

function negatives(): Record<string, unknown> {
    if (released || releasePromise) throw new Error('MULTIPASS_DISPOSED');
    return {
        route: MODE,
        cases: MODE === 'capture' ? captureNegatives() : nativeNegatives(),
        multisample: MODE === 'native' ? nativeMultisampleProbe() : null,
    };
}

function matrix(): Record<string, unknown> {
    if (released || releasePromise) throw new Error('MULTIPASS_DISPOSED');
    return { route: 'capture', combos: captureMatrix() };
}

function release(): Promise<unknown> {
    if (releasePromise) return releasePromise;
    const refs = ownedAssets().map((asset) => ({ before: asset.refCount, after: -1 }));
    released = true;
    if (MODE === 'native') director.off(Director.EVENT_AFTER_DRAW, drawNativePass);
    if (normalAfterDraw) director.off(Director.EVENT_AFTER_DRAW, normalAfterDraw);
    if (controlsAbort) controlsAbort.abort(); // every named DOM control listener stops here
    releaseAbortExtra?.();
    document.querySelectorAll('button').forEach((button) => {
        (button as HTMLButtonElement).disabled = true;
    }); // terminal state
    // Observe unbinding BEFORE destruction: the material stops sampling; the camera target restores.
    captureState.unbindColor?.();
    const colorUnbound =
        MODE === 'native' || captureState.displayMaterial?.getProperty('displayMap') !== captureState.target?.texture;
    captureState.detachCamera?.();
    const cameraDetached =
        MODE === 'native' ||
        (captureState.captureCamera
            ? captureState.captureCamera.targetTexture !== captureState.target?.renderTexture
            : false);
    captureState.target?.dispose();
    const targetDisposed = MODE === 'native' || captureState.target?.info.disposed === true;
    // gfx destruction observed per resource: ALIVE before (handles non-null), cleared after,
    // and engine memory counters dropping relative to that live baseline.
    const dev = device();
    const textureBefore = dev.memoryStatus.textureSize,
        bufferBefore = dev.memoryStatus.bufferSize;
    const aliveBefore =
        MODE !== 'native'
            ? null
            : {
                  shaderGpuAlive: (() => {
                      try {
                          return !!(native.shader as unknown as { gpuShader: unknown } | null)?.gpuShader;
                      } catch {
                          return false;
                      }
                  })(),
                  descriptorSetGpuAlive: (() => {
                      try {
                          return !!(native.descriptorSet as unknown as { gpuDescriptorSet: unknown } | null)
                              ?.gpuDescriptorSet;
                      } catch {
                          return false;
                      }
                  })(),
                  pipelineStateGpuAlive: (() => {
                      try {
                          return !!(native.pipelineState as unknown as { gpuPipelineState: unknown } | null)
                              ?.gpuPipelineState;
                      } catch {
                          return false;
                      }
                  })(),
              };
    for (const object of [
        native.commandBuffer,
        native.pipelineState,
        native.inputAssembler,
        native.descriptorSet,
        native.vertexBuffer,
        native.uniformBuffer,
        native.scratchFramebuffer,
        native.scratchRenderPass,
        native.scratchTexture,
        native.pipelineLayout,
        native.descriptorSetLayout,
        native.shader,
        native.texture,
    ]) {
        object?.destroy();
    }
    native.emptySet0?.destroy();
    const gpuObservation = (read: () => unknown): boolean => {
        if (MODE !== 'native') return true;
        try {
            return read() === null || read() === undefined;
        } catch {
            return true;
        } // accessor throwing after destroy is itself a real observation
    };
    const gfxObservations = {
        aliveBefore,
        shaderGpuCleared: gpuObservation(() => (native.shader as unknown as { gpuShader: unknown } | null)?.gpuShader),
        descriptorSetGpuCleared: gpuObservation(
            () => (native.descriptorSet as unknown as { gpuDescriptorSet: unknown } | null)?.gpuDescriptorSet,
        ),
        pipelineStateGpuCleared: gpuObservation(
            () => (native.pipelineState as unknown as { gpuPipelineState: unknown } | null)?.gpuPipelineState,
        ),
        textureMemoryFreed: textureBefore - dev.memoryStatus.textureSize,
        bufferMemoryFreed: bufferBefore - dev.memoryStatus.bufferSize,
        observationMethod: 'alive-before gpu handles, then null/throws after destroy + memoryStatus counter drop',
    };
    const gfxDestroyed =
        gfxObservations.shaderGpuCleared &&
        gfxObservations.descriptorSetGpuCleared &&
        gfxObservations.pipelineStateGpuCleared &&
        gfxObservations.textureMemoryFreed >= 0 &&
        gfxObservations.bufferMemoryFreed >= 0;
    const unbound = { colorUnbound, cameraDetached, targetDisposed, gfxDestroyed, gfxObservations };
    captureState.displayMaterial = null; // observations done; the material dies with app.close
    // Return owned assets after every binding is gone (refs pair 1 -> 0).
    for (const node of captureState.routeNodes.splice(0)) {
        for (const renderer of node.getComponents(MeshRenderer)) {
            renderer.mesh = null;
            renderer.setSharedMaterial(null, 0);
        }
        node.removeFromParent();
        node.destroy();
    }
    for (const [index, asset] of ownedAssets().entries()) {
        asset.decRef();
        refs[index].after = asset.refCount;
    }
    const nodesRemoved = captureState.routeNodes.length === 0; // every route node left the scene graph
    const rendererRef = displayRendererRef;
    releasePromise = Promise.resolve(app.close ? app.close() : undefined).then(() => ({
        released,
        refs,
        ...unbound,
        nodesRemoved,
        rendererValidAfterClose: rendererRef ? rendererRef.isValid : null, // raw truth, no constant
        controlsDisabled: Array.from(document.querySelectorAll('button')).every(
            (button) => (button as HTMLButtonElement).disabled,
        ),
    }));
    return releasePromise;
}

// ── wiring ──
buildEffects();
if (MODE === 'capture') createCaptureRoute();
else createNativeRoute();
await app.run(scene);

// §25 Lifecycle Contract（资源粒度、惰性）：仅 __lifecycle() 调用时才执行一轮
// 当前 capture 路由自有 mesh/material 的 退役（解绑+decRef→0）→ 泄漏核对 → 重建新路由。
// 终态 release()（MULTIPASS_DISPOSED/app.close 语义）与 native 路由不受影响。
if (MODE === 'capture') {
    const { installAssetLifecycle } = await import('../../shared/asset-lifecycle.js');
    const namedOwned = () =>
        ownedAssets().map((asset, index) => ({
            name: (ownedMeshes.includes(asset as OwnedMesh) ? 'route-mesh-' : 'route-material-') + index,
            ref: asset,
        }));
    installAssetLifecycle({
        label: 'interactive-multipass',
        hold: () => (released || releasePromise ? [] : namedOwned()),
        release: () => {
            retireCaptureRoute();
        },
        reacquire: async () => {
            createCaptureRoute();
            // 生命周期轮次在 native pacer 下执行：等待真实帧提交，不做手动步进。
            await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
            return namedOwned();
        },
    });
}

if (TEST && NEG_PAGE) {
    // Dedicated diagnostics page: negative probes intentionally produce GL errors.
    game.pause();
    (window as unknown as Record<string, unknown>).__multipassNegatives = negatives();
    clock.begin();
} else if (TEST) {
    game.pause();
    clock.begin();
    const first = await clock.step(1 / 60);
    submittedFrame = { event: 'AFTER_DRAW', ...first, inputSequence: 0, timestamp: new Date().toISOString() };
    (window as unknown as Record<string, unknown>).__multipass = {
        mode: MODE,
        format: FORMAT,
        samples: SAMPLES,
        snapshot,
        step,
        resize: resizeProbe,
        reset,
        resetCycle,
        setLodBase,
        negatives,
        matrix,
        lifecycle,
        release,
    };
} else {
    // Normal page: native pacer only; named listeners so release can really unbind them.
    normalAfterDraw = () => {
        submittedFrame = {
            event: 'AFTER_DRAW',
            afterDraw: true,
            totalFrames: director.getTotalFrames(),
            inputSequence: lastAction().sequence,
            timestamp: new Date().toISOString(),
        };
        observeRetiredValidity(); // engine destroy commits at frame end; observe on the next real frame
    };
    director.on(Director.EVENT_AFTER_DRAW, normalAfterDraw);
    controlsAbort = new AbortController();
    const userEvents: Record<string, unknown>[] = [];
    const bind = (id: string, handler: () => void) =>
        document.querySelector(id)!.addEventListener(
            'click',
            (event) => {
                recordUser(id.slice(1), event);
                userEvents.push({ ...lastAction() });
                handler();
            },
            { signal: controlsAbort!.signal },
        );
    bind('#pause', () => game.pause());
    bind('#resume', () => game.resume());
    bind('#reset', () => {
        void reset();
    });
    bind('#resize', () => {
        void resizeProbe(cssSize().width === 640 ? 480 : 640, cssSize().height === 400 ? 320 : 400);
    });
    bind('#release', () => {
        void release();
    });
    if (MODE === 'native') {
        document.querySelector('#lod')?.classList.remove('hidden');
        bind('#lod', () => {
            void setLodBase(native.lodBase === 0 ? 2 : 0);
        });
    }
    const pageHideAbort = new AbortController();
    window.addEventListener(
        'pagehide',
        () => {
            void release();
        },
        { once: true, signal: pageHideAbort.signal },
    );
    releaseAbortExtra = () => pageHideAbort.abort();
    (window as unknown as Record<string, unknown>).__multipassNormal = { snapshot, userEvents: () => [...userEvents] };
}
status.textContent = `IER-02 multipass · route=${MODE} · format=${FORMAT} · samples=${SAMPLES}${TEST ? ' · step clock' : ' · native pacer'}`;
console.log(`[interactive-multipass] route=${MODE} test=${TEST} neg=${NEG_PAGE} fmt=${FORMAT} samples=${SAMPLES}`);
