/**
 * V0.8 BLOCK-2 — Invalid / Stress / Security Benchmark Catalog（B101–B150，50 项）。
 *
 * ID 段位遵循 schema.ts：B001–B100 首批发布后不复用，增量段从 B101 起。
 * 领域（§86 建议 150 项的增量）：
 *   - Invalid  B101–B118（18）：损坏/畸形资产的稳定拒绝（教学错误示例同样 Ready）；
 *   - Stress   B119–B134（16）：规模/频率压力下的无未捕获错误与可渲染性；
 *   - Security B135–B150（16）：路径穿越/外部取回/原型污染/整数溢出等敌意输入的安全拒绝。
 *
 * 判定语义：Reference Track 以冻结参考实现执行；PASS = 场景 Ready + 无未捕获运行时错误
 * （+ 各行附加 validator）。expectedStates 记录预期稳定行为，供 Agent Track 对照。
 */
import { BenchmarkDefinition } from './schema';

export interface IssRow {
    id: string;
    name: string;
    prompt: string;
    validators: string[];
    validatorParams?: Record<string, Record<string, unknown>>;
    refCode: string;
    timeBudgetMin?: number;
    expectedState: Record<string, unknown>;
}

// ---- 参考 实现模板 ----
/** Invalid/Security：加载敌意资产，捕获稳定错误码，场景保持 Ready。 */
const loadHostileRef = (id: string, asset: string, note: string): string => `import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, Color, utils, primitives, GLTFLoader } from 'cocosair';

// ${note}
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('${id}');

const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.4, 6.5));
cameraNode.setRotationFromEuler(-20, 0, 0);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);

// 地面参考物：即使加载失败，场景也有可渲染内容（scene-ready 语义）
const ground = new Node('ground');
ground.layer = Layers.Enum.DEFAULT;
scene.addChild(ground);
const groundRenderer = ground.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 6, length: 6, widthSegments: 1, lengthSegments: 1 }));

app.run(scene);

// 受控加载：引擎必须以稳定错误拒绝（而非崩溃/未捕获异常）。app.run 先行：即使敌意请求挂起，场景也保持 Ready。
let outcome = 'loaded';
try {
    const url = '/assets/${asset}';
    const asset = url.endsWith('.glb')
        ? await new GLTFLoader().parseAsync(await (await fetch(url)).arrayBuffer(), '/')
        : await new GLTFLoader().parseAsync(await (await fetch(url)).text(), '/');
    scene.addChild(asset.instantiate().root);
    console.log('[${id}] hostile asset parsed:', asset.warnings.length, 'warnings');
} catch (error) {
    const code = (error as { code?: string }).code ?? 'UNKNOWN';
    outcome = 'rejected:' + code;
    console.log('[${id}] stable rejection, code =', code);
}
(window as unknown as { __airOutcome: string }).__airOutcome = outcome;
`;

/** Stress：程序化构建压力场景（各行走 build 函数）。 */
const stressRef = (id: string, buildCode: string): string => `import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Animation, AnimationClip, Component, PointLight, Layers, Vec3, Color, Material, Texture2D, ImageAsset, tween, utils, primitives, GLTFLoader, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('${id}');

const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 26, 34));
cameraNode.setRotationFromEuler(-30, 0, 0);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
camera.far = 800;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 30, 0));
lightNode.setRotationFromEuler(-60, -20, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

const sharedMesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const sharedMaterial = new Material();
sharedMaterial.initialize({ effectName: 'builtin-standard' });
sharedMaterial.setProperty('mainColor', new Color(95, 205, 120, 255));

function spawn (name: string, x: number, y: number, z: number): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    scene.addChild(node);
    node.setPosition(new Vec3(x, y, z));
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = sharedMesh;
    renderer.material = sharedMaterial;
    return node;
}

app.run(scene);

${buildCode}
console.log('[${id}] stress scene running, nodeCount =', scene.children.length);
`;

const ROWS: IssRow[] = [
    // ================= Invalid B101–B118（18） =================
    { id: 'B101', name: 'corrupt-glb-magic', prompt: 'Load "/assets/corrupt-magic.glb" (invalid magic number). The engine must reject it with a stable error (no crash, no uncaught exception); the scene stays ready with a ground reference.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B101', 'corrupt-magic.glb', 'GLB magic must be glTF'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B102', name: 'truncated-glb-header', prompt: 'Load "/assets/truncated.glb" (file cut mid-header). Stable rejection, scene ready, no uncaught errors.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B102', 'truncated.glb', 'truncated GLB header'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B103', name: 'invalid-accessor-componentType', prompt: 'Load "/assets/invalid-accessor.glb" (accessor componentType is not a valid enum value). Stable rejection without crash.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B103', 'invalid-accessor.glb', 'componentType 0xFFFF is invalid'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B104', name: 'empty-json-gltf', prompt: 'Load "/assets/empty.gltf" (zero-length JSON). Stable rejection without crash.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B104', 'empty.gltf', 'empty file'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B105', name: 'missing-buffer-uri', prompt: 'Load "/assets/missing-buffer.gltf" (buffer uri points to a nonexistent file). Stable rejection; no uncaught async error.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B105', 'missing-buffer.gltf', 'buffer uri 404'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B106', name: 'zero-byte-glb', prompt: 'Load "/assets/zero-byte.glb" (0-byte file). Stable rejection without crash.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B106', 'zero-byte.glb', 'zero byte file'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B107', name: 'invalid-json-gltf', prompt: 'Load "/assets/invalid-json.gltf" (malformed JSON text). Stable parse rejection.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B107', 'invalid-json.gltf', 'invalid JSON'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B108', name: 'deep-nesting-json', prompt: 'Load "/assets/deep-nesting.gltf" (JSON nested beyond sane depth). Rejection or safe parse — either way no crash and no stack overflow.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B108', 'deep-nesting.gltf', 'deeply nested JSON'), expectedState: { outcome: 'loaded|rejected:GLTF_*' } },
    { id: 'B109', name: 'negative-buffer-byteLength', prompt: 'Load "/assets/negative-bytelength.gltf" (buffer.byteLength = -100). Negative sizes must be rejected with a stable error, not treated as huge allocations.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B109', 'negative-bytelength.gltf', 'negative byteLength'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B110', name: 'buffer-view-overflow', prompt: 'Load "/assets/overflow-view.gltf" (bufferView declares 1MB on a 78-byte buffer). Stable rejection; no OOB read.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B110', 'overflow-view.gltf', 'bufferView beyond buffer'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B111', name: 'accessor-count-mismatch', prompt: 'Load "/assets/accessor-mismatch.glb" (accessor count exceeds bufferView capacity). Stable rejection; no OOB read.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B111', 'accessor-mismatch.glb', 'accessor count overflow'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B112', name: 'corrupt-png-texture', prompt: 'Load "/assets/corrupt-png.gltf" (texture PNG magic corrupted). Texture decode must fail with a stable error or warning — never an uncaught exception.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B112', 'corrupt-png.gltf', 'corrupt PNG bytes'), expectedState: { outcome: 'loaded|rejected:GLTF_*' } },
    { id: 'B113', name: 'scene-index-out-of-range', prompt: 'Load "/assets/scene-oob.gltf" (scene index 99 with only one scene). Stable rejection or graceful fallback; no crash.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B113', 'scene-oob.gltf', 'scene index OOB'), expectedState: { outcome: 'loaded|rejected:GLTF_*' } },
    { id: 'B114', name: 'node-hierarchy-cycle', prompt: 'Load "/assets/node-cycle.gltf" (two nodes are each other\'s children). The parser must detect the cycle and reject/stabilize — never infinite-loop.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B114', 'node-cycle.gltf', 'mutual child cycle'), expectedState: { outcome: 'loaded|rejected:GLTF_*' } },
    { id: 'B115', name: 'bin-chunk-length-mismatch', prompt: 'Load "/assets/chunk-mismatch.glb" (BIN chunk header claims more bytes than the file holds). Stable rejection; no OOB read.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B115', 'chunk-mismatch.glb', 'BIN chunk length beyond file'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B116', name: 'unsupported-asset-version', prompt: 'Load "/assets/version-99.gltf" (asset.version "99.0"). The parser must handle the unknown version with a warning or stable rejection — not a crash.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B116', 'version-99.gltf', 'asset.version 99.0'), expectedState: { outcome: 'loaded|rejected:GLTF_*' } },
    { id: 'B117', name: 'unknown-required-extension', prompt: 'Load "/assets/required-unknown-ext.gltf" (extensionsRequired: ["ACME_fake_ext"]). Must resolve to a stable unsupported/extension error contract.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B117', 'required-unknown-ext.gltf', 'unknown required extension'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B118', name: 'mime-confused-binary-as-gltf', prompt: 'Load "/assets/mime-confused.gltf" (binary GLB content stored under a .gltf name). The parser must detect the container mismatch and reject/stabilize.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B118', 'mime-confused.gltf', 'GLB bytes with .gltf name'), expectedState: { outcome: 'loaded|rejected:GLTF_*' } },

    // ================= Stress B119–B134（16） =================
    { id: 'B119', name: 'large-mesh-60k-vertices', prompt: 'Build a scene with a single procedurally generated mesh holding 60,000 vertices (grid, Uint16 indices). Render without errors; the mesh is visible.', validators: ['scene-ready', 'no-runtime-error', 'visible-frame'], refCode: stressRef('B119', `
// 300 x 200 网格 = 60000 顶点（Uint16 索引值域内）
const W = 300, H = 200, STEP = 0.06;
const positions: number[] = [];
for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) { positions.push((x - W / 2) * STEP, Math.sin(x * 0.2) * 0.2, (y - H / 2) * STEP); }
}
const indices: number[] = [];
for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
        const a = y * W + x, b = a + 1, c = a + W, d = c + 1;
        indices.push(a, c, b, b, c, d);
    }
}
const bigMesh = utils.createMesh({ positions, indices });
const wave = new Node('wave-60k');
wave.layer = Layers.Enum.DEFAULT;
scene.addChild(wave);
const waveRenderer = wave.addComponent(MeshRenderer);
waveRenderer.mesh = bigMesh;
waveRenderer.material = sharedMaterial;
frameObject(camera, wave);`), timeBudgetMin: 30, expectedState: { vertices: 60000 } },
    { id: 'B120', name: 'many-nodes-2000', prompt: 'Build a scene with 2,000 nodes sharing one mesh/material, laid out in a grid. node-count >= 2000 and no runtime errors.', validators: ['scene-ready', 'node-count', 'no-runtime-error'], validatorParams: { 'node-count': { min: 2000 } }, refCode: stressRef('B120', `
for (let i = 0; i < 2000; i++) {
    const x = (i % 50) * 1.2 - 30;
    const z = Math.floor(i / 50) * 1.2 - 12;
    spawn('node-' + i, x, 0, z);
}`), timeBudgetMin: 30, expectedState: { nodeCount: 2000 } },
    { id: 'B121', name: 'deep-hierarchy-500', prompt: 'Build a 500-level parent chain (depth-0 … depth-499). All nodes must exist and the scene must run error-free.', validators: ['scene-ready', 'node-count', 'no-runtime-error'], validatorParams: { 'node-count': { min: 501 } }, refCode: stressRef('B121', `
let parent = spawn('depth-0', 0, 0, 0);
for (let i = 1; i < 500; i++) {
    const node = new Node('depth-' + i);
    node.layer = Layers.Enum.DEFAULT;
    parent.addChild(node);
    node.setPosition(new Vec3(0.01, 0.02, 0));
    parent = node;
}`), timeBudgetMin: 30, expectedState: { depth: 500 } },
    { id: 'B122', name: 'many-materials-200', prompt: 'Create 200 cubes each with its OWN Material instance (200 distinct materials). material-property count >= 200, no errors.', validators: ['scene-ready', 'material-property', 'no-runtime-error'], validatorParams: { 'material-property': { min: 200 } }, refCode: stressRef('B122', `
for (let i = 0; i < 200; i++) {
    const node = spawn('mat-cube-' + i, (i % 20) * 1.2 - 12, 0, Math.floor(i / 20) * 1.2 - 12);
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', new Color((i * 7) % 255, (i * 13) % 255, (i * 29) % 255, 255));
    (node.getComponent(MeshRenderer) as MeshRenderer).material = material;
}`), timeBudgetMin: 30, expectedState: { materials: 200 } },
    { id: 'B123', name: 'many-textures-64', prompt: 'Create 64 procedural checker textures (64x64 each) applied to 64 cubes via 64 materials. All upload without errors.', validators: ['scene-ready', 'material-property', 'no-runtime-error'], validatorParams: { 'material-property': { min: 64 } }, refCode: stressRef('B123', `
function checkerTexture (seed: number): Texture2D {
    const SIZE = 64;
    const pixels = new Uint8Array(SIZE * SIZE * 4);
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = (SIZE * y + x) * 4;
            const v = ((x >> 3) + (y >> 3) + seed) % 2 === 0 ? 230 : 40;
            pixels[i] = v; pixels[i + 1] = v; pixels[i + 2] = v; pixels[i + 3] = 255;
        }
    }
    const texture = new Texture2D();
    texture.image = new ImageAsset({ width: SIZE, height: SIZE, _data: pixels, _compressed: false, format: Texture2D.PixelFormat.RGBA8888 });
    return texture;
}
for (let i = 0; i < 64; i++) {
    const node = spawn('tex-cube-' + i, (i % 8) * 1.6 - 5.6, 0, Math.floor(i / 8) * 1.6 - 5.6);
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } });
    material.setProperty('mainTexture', checkerTexture(i));
    (node.getComponent(MeshRenderer) as MeshRenderer).material = material;
}`), timeBudgetMin: 30, expectedState: { textures: 64 } },
    { id: 'B124', name: 'many-lights-8', prompt: 'Light one scene with 8 PointLights (range-limited) plus the directional key. Scene runs error-free with all 8 lights attached.', validators: ['scene-ready', 'node-count', 'no-runtime-error'], validatorParams: { 'node-count': { min: 9 } }, refCode: stressRef('B124', `
for (let i = 0; i < 8; i++) {
    const node = new Node('point-light-' + i);
    node.layer = Layers.Enum.DEFAULT;
    scene.addChild(node);
    const angle = (i / 8) * Math.PI * 2;
    node.setPosition(new Vec3(Math.cos(angle) * 6, 3, Math.sin(angle) * 6));
    const point = node.addComponent(PointLight);
    point.luminance = 10;
    point.range = 12;
}
for (let i = 0; i < 4; i++) { spawn('lit-cube-' + i, i * 2 - 3, 0, 0); }`), timeBudgetMin: 30, expectedState: { lights: 8 } },
    { id: 'B125', name: 'many-draw-calls-500', prompt: 'Render 500 separately-transformed cubes (500 draw calls) sharing one mesh/material. Visible frame, no errors.', validators: ['scene-ready', 'no-runtime-error', 'visible-frame'], refCode: stressRef('B125', `
for (let i = 0; i < 500; i++) {
    spawn('draw-' + i, (i % 25) * 1.2 - 14.4, 0, Math.floor(i / 25) * 1.2 - 12);
}`), timeBudgetMin: 30, expectedState: { drawCalls: 500 } },
    { id: 'B126', name: 'big-glb-multimb', prompt: 'Load "/assets/big-multimb.glb" (multi-megabyte GLB, ~100k vertices) and render it. Load completes without errors; model visible.', validators: ['scene-ready', 'no-runtime-error', 'visible-frame', 'asset-loaded'], refCode: stressRef('B126', `
const bytes = await (await fetch('/assets/big-multimb.glb')).arrayBuffer();
const asset = await new GLTFLoader().parseAsync(bytes, '/');
const model = asset.instantiate();
scene.addChild(model.root);
frameObject(camera, model.root);`), timeBudgetMin: 30, expectedState: { bytes: '>2MB' } },
    { id: 'B127', name: 'rapid-load-dispose-20', prompt: 'Run 20 rapid load→instantiate→destroy cycles of "/assets/rapid-cycle.glb". Every cycle completes; after the last, no assets/nodes remain alive.', validators: ['scene-ready', 'no-runtime-error', 'resource-released'], refCode: stressRef('B127', `
for (let i = 0; i < 20; i++) {
    const bytes = await (await fetch('/assets/rapid-cycle.glb')).arrayBuffer();
    const asset = await new GLTFLoader().parseAsync(bytes, '/');
    const instance = asset.instantiate();
    scene.addChild(instance.root);
    scene.removeChild(instance.root);
    instance.dispose();
    asset.destroy();
}
await Promise.resolve();`), timeBudgetMin: 30, expectedState: { cycles: 20 } },
    { id: 'B128', name: 'many-animation-components-100', prompt: 'Create 100 nodes each carrying an Animation component; one clip plays. animation-playing passes; no errors.', validators: ['scene-ready', 'animation-playing', 'no-runtime-error'], refCode: stressRef('B128', `
class IdleSpin extends Component {
    update (dt: number): void { this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 30, 0); }
}
for (let i = 0; i < 100; i++) {
    const node = spawn('anim-' + i, (i % 10) * 1.5 - 6.75, 0, Math.floor(i / 10) * 1.5 - 6.75);
    node.addComponent(Animation);
    if (i === 0) { node.addComponent(IdleSpin); }
}`), timeBudgetMin: 30, expectedState: { animationComponents: 100 } },
    { id: 'B129', name: 'instancing-100', prompt: 'Load "/assets/rapid-cycle.glb" once and instantiate it 100 times at grid positions. All instances render; node-count >= 101.', validators: ['scene-ready', 'node-count', 'no-runtime-error'], validatorParams: { 'node-count': { min: 101 } }, refCode: stressRef('B129', `
const bytes = await (await fetch('/assets/rapid-cycle.glb')).arrayBuffer();
const asset = await new GLTFLoader().parseAsync(bytes, '/');
for (let i = 0; i < 100; i++) {
    const instance = asset.instantiate();
    instance.root.setPosition(new Vec3((i % 10) * 1.6 - 7.2, 0, Math.floor(i / 10) * 1.6 - 7.2));
    scene.addChild(instance.root);
}`), timeBudgetMin: 30, expectedState: { instances: 100 } },
    { id: 'B130', name: 'large-texture-2048', prompt: 'Upload a 2048x2048 procedural RGBA texture to a cube. Upload and render complete without errors.', validators: ['scene-ready', 'no-runtime-error', 'visible-frame'], refCode: stressRef('B130', `
const SIZE = 2048;
const pixels = new Uint8Array(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
        const i = (SIZE * y + x) * 4;
        const v = ((x >> 6) + (y >> 6)) % 2 === 0 ? 235 : 60;
        pixels[i] = v; pixels[i + 1] = v; pixels[i + 2] = 150; pixels[i + 3] = 255;
    }
}
const texture = new Texture2D();
texture.image = new ImageAsset({ width: SIZE, height: SIZE, _data: pixels, _compressed: false, format: Texture2D.PixelFormat.RGBA8888 });
const material = new Material();
material.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } });
material.setProperty('mainTexture', texture);
const node = spawn('big-tex-cube', 0, 0, 0);
(node.getComponent(MeshRenderer) as MeshRenderer).material = material;
frameObject(camera, node);`), timeBudgetMin: 30, expectedState: { textureSize: 2048 } },
    { id: 'B131', name: 'many-components-1500', prompt: 'Create 500 nodes each with a MeshRenderer plus an Animation component, and 500 more plain nodes (1500 components total). Scene runs error-free.', validators: ['scene-ready', 'node-count', 'animation-playing', 'no-runtime-error'], validatorParams: { 'node-count': { min: 1001 } }, refCode: stressRef('B131', `
for (let i = 0; i < 500; i++) {
    spawn('comp-' + i, (i % 25) * 1.2 - 15, 0, Math.floor(i / 25) * 1.2 - 6).addComponent(Animation);
}
for (let i = 0; i < 500; i++) { spawn('plain-' + i, (i % 25) * 1.2 - 15, 3, Math.floor(i / 25) * 1.2); }`), timeBudgetMin: 30, expectedState: { components: 1500 } },
    { id: 'B132', name: 'repeated-capture-30', prompt: 'Capture the running canvas 30 times in a row (toDataURL under rAF pacing). Every capture returns a non-trivial PNG; no errors.', validators: ['scene-ready', 'no-runtime-error', 'visible-frame'], refCode: stressRef('B132', `
const subject = spawn('capture-cube', 0, 0, 0);
frameObject(camera, subject);
const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
let shortest = Infinity;
for (let i = 0; i < 30; i++) {
    await new Promise((resolve) => requestAnimationFrame(resolve));
    const png = canvas.toDataURL('image/png');
    if (png.length < shortest) { shortest = png.length; }
}
console.log('[B132] 30 captures done, shortest dataURL =', shortest);
(window as unknown as { __captureShortest: number }).__captureShortest = shortest;`), timeBudgetMin: 30, expectedState: { captures: 30 } },
    { id: 'B133', name: 'many-tweens-500', prompt: 'Start 500 parallel tweens moving 500 cubes to new positions (sineInOut). Tweens run concurrently; no errors during the burst.', validators: ['scene-ready', 'node-count', 'no-runtime-error'], validatorParams: { 'node-count': { min: 501 } }, refCode: stressRef('B133', `
for (let i = 0; i < 500; i++) {
    const node = spawn('tween-' + i, (i % 25) * 1.2 - 15, 0, Math.floor(i / 25) * 1.2 - 6);
    tween(node).to(1.5, { position: new Vec3(node.position.x, 2 + (i % 5), node.position.z) }, { easing: 'sineInOut' }).start();
}`), timeBudgetMin: 30, expectedState: { tweens: 500 } },
    { id: 'B134', name: 'stress-mixed-scene', prompt: 'Combined stress: 300 cubes (20 distinct materials), 4 PointLights, one spin animation, and a 1024x1024 texture — all in ONE scene. No errors.', validators: ['scene-ready', 'node-count', 'no-runtime-error'], validatorParams: { 'node-count': { min: 305 } }, refCode: stressRef('B134', `
for (let i = 0; i < 4; i++) {
    const node = new Node('mixed-light-' + i);
    node.layer = Layers.Enum.DEFAULT;
    scene.addChild(node);
    node.setPosition(new Vec3(Math.cos(i) * 5, 4, Math.sin(i) * 5));
    const point = node.addComponent(PointLight);
    point.luminance = 8;
    point.range = 20;
}
const SIZE = 1024;
const pixels = new Uint8Array(SIZE * SIZE * 4);
for (let y = 0; y < SIZE; y += SIZE) { pixels.fill(200, y * 4, (y + 1) * 4); }
const texture = new Texture2D();
texture.image = new ImageAsset({ width: SIZE, height: SIZE, _data: pixels, _compressed: false, format: Texture2D.PixelFormat.RGBA8888 });
for (let i = 0; i < 300; i++) {
    const node = spawn('mixed-' + i, (i % 20) * 1.2 - 12, 0, Math.floor(i / 20) * 1.2 - 6);
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } });
    material.setProperty('mainTexture', texture);
    (node.getComponent(MeshRenderer) as MeshRenderer).material = material;
    if (i === 0) { node.addComponent(Animation); }
}`), timeBudgetMin: 30, expectedState: { nodes: 300, lights: 4 } },

    // ================= Security B135–B150（16） =================
    { id: 'B135', name: 'path-traversal-buffer-uri', prompt: 'Load "/assets/traversal-buffer.gltf" whose buffer uri is "../../../../outside.bin". The engine must NOT read outside the asset root — stable rejection only.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B135', 'traversal-buffer.gltf', 'buffer uri escapes asset root'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B136', name: 'absolute-path-buffer-uri', prompt: 'Load "/assets/absolute-path.gltf" whose buffer uri is "/etc/passwd". Absolute filesystem URIs must be rejected without any host read.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B136', 'absolute-path.gltf', 'absolute path uri'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B137', name: 'external-url-buffer-uri', prompt: 'Load "/assets/external-url.gltf" whose buffer uri is an external http URL (TEST-NET). The engine must not fetch external hosts — stable rejection.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B137', 'external-url.gltf', 'external http uri (TEST-NET-3)'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B138', name: 'data-uri-oversized', prompt: 'Load "/assets/data-uri-huge.gltf" (data: buffer URI declaring 64MB). Oversized data URIs must be bounded — stable rejection, no OOM crash.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B138', 'data-uri-huge.gltf', 'oversized data URI'), expectedState: { outcome: 'loaded|rejected:GLTF_*' } },
    { id: 'B139', name: 'prototype-pollution-json', prompt: 'Load "/assets/proto-pollution.gltf" (JSON contains "__proto__" keys). Parsing must not pollute Object.prototype; scene runs clean.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B139', 'proto-pollution.gltf', '__proto__ key in JSON') + `
const polluted = ({} as Record<string, unknown>).hasOwnProperty('spam');
console.log('[B139] prototype pollution check:', polluted ? 'POLLUTED' : 'clean');
`, expectedState: { pollution: false } },
    { id: 'B140', name: 'constructor-pollution-json', prompt: 'Load "/assets/constructor-pollution.gltf" (JSON contains "constructor"."prototype" keys). Parsing must stay safe; no errors.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B140', 'constructor-pollution.gltf', 'constructor.prototype key in JSON'), expectedState: { pollution: false } },
    { id: 'B141', name: 'negative-accessor-count', prompt: 'Load "/assets/negative-count.gltf" (accessor.count = -5). Negative counts must be rejected with a stable error.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B141', 'negative-count.gltf', 'negative accessor count'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B142', name: 'integer-overflow-byteoffset', prompt: 'Load "/assets/overflow-offset.gltf" (bufferView.byteOffset near 2^53). Overflowing offsets must be rejected — no wraparound allocation.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B142', 'overflow-offset.gltf', 'byteOffset near Number.MAX_SAFE_INTEGER'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B143', name: 'nan-infinity-accessor-bounds', prompt: 'Load "/assets/nan-minmax.gltf" (accessor min/max contain NaN/Infinity). Poisoned bounds must not produce NaN transforms; parse safely or reject.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B143', 'nan-minmax.gltf', 'NaN/Infinity in min/max'), expectedState: { outcome: 'loaded|rejected:GLTF_*' } },
    { id: 'B144', name: 'glb-unknown-extra-chunks', prompt: 'Load "/assets/extra-chunks.glb" (unexpected chunk types appended after JSON+BIN). Parser reads declared chunks only; loads or rejects stably — no OOB read.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B144', 'extra-chunks.glb', 'unknown extra chunks'), expectedState: { outcome: 'loaded|rejected:GLTF_*' } },
    { id: 'B145', name: 'query-encoded-traversal', prompt: 'Load "/assets/query-traversal.gltf" (buffer uri "assets/../../outside.bin?token=1"). Traversal hidden behind a query string must be rejected.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B145', 'query-traversal.gltf', 'traversal disguised with query string'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B146', name: 'percent-encoded-traversal', prompt: 'Load "/assets/percent-traversal.gltf" (buffer uri "%2e%2e%2f%2e%2e%2fout.bin"). Percent-encoded traversal must be rejected like plain traversal.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B146', 'percent-traversal.gltf', 'percent-encoded ../..'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B147', name: 'hostile-extension-names', prompt: 'Load "/assets/hostile-ext.gltf" (extensionsRequired: ["__proto__", "constructor"]). Hostile extension names must yield the stable unsupported contract — no pollution.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B147', 'hostile-ext.gltf', 'hostile extension names'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B148', name: 'json-string-bomb', prompt: 'Load "/assets/string-bomb.gltf" (JSON extras containing ~100MB of repeated strings). Parsing must stay bounded — rejection or safe parse, never an OOM crash.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B148', 'string-bomb.gltf', 'oversized JSON strings'), timeBudgetMin: 30, expectedState: { outcome: 'loaded|rejected:GLTF_*' } },
    { id: 'B149', name: 'file-scheme-texture-uri', prompt: 'Load "/assets/file-scheme-texture.gltf" (image uri "file:///C:/secrets.png"). file:// URIs must be rejected without any host read.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B149', 'file-scheme-texture.gltf', 'file:// texture uri'), expectedState: { outcome: 'rejected:GLTF_*' } },
    { id: 'B150', name: 'trailing-garbage-glb', prompt: 'Load "/assets/trailing-garbage.glb" (valid GLB followed by 4MB of trailing zeros). Parser must honor declared chunk lengths only — loads cleanly or rejects stably.', validators: ['scene-ready', 'no-runtime-error'], refCode: loadHostileRef('B150', 'trailing-garbage.glb', '4MB trailing garbage'), expectedState: { outcome: 'loaded|rejected:GLTF_*' } },
];

function buildIssCatalog (): { benchmarks: BenchmarkDefinition[]; specs: Map<string, { template: string; params: Record<string, unknown> }>; refCodes: Map<string, string> } {
    const specs = new Map<string, { template: string; params: Record<string, unknown> }>();
    const refCodes = new Map<string, string>();
    const benchmarks: BenchmarkDefinition[] = [];
    for (const row of ROWS) {
        const id = row.id;
        const num = parseInt(id.slice(1), 10);
        const domain = num <= 118 ? 'Invalid' : num <= 134 ? 'Stress' : 'Security';
        const def: BenchmarkDefinition = {
            id,
            version: '1.0.0',
            name: row.name,
            benchmarkType: 'source-create',
            category: domain,
            difficulty: domain === 'Stress' ? 'intermediate' : 'basic',
            prompt: row.prompt,
            startingFixture: `fixtures/${id}`,
            referenceImplementation: `${id}.main.ts`,
            writablePaths: ['src'],
            readablePaths: ['docs-agent'],
            protectedPaths: ['protected'],
            allowedTools: ['read-file', 'write-file', 'patch-file', 'run-command', 'request-runtime-inspection', 'request-frame-capture', 'request-error-report', 'finish'],
            allowedCommands: [{ command: 'node', allowAnyArgs: false }, { command: 'npm', allowAnyArgs: false }],
            allowedNetworkHosts: [],
            knowledgeProfile: 'K2',
            validators: row.validators,
            validatorParams: row.validatorParams ?? {},
            visualValidators: [],
            capabilityRequirements: ['webgl2'],
            browserRequirements: 'chromium>=100',
            repairBudget: 5,
            timeBudgetMs: (row.timeBudgetMin ?? 20) * 60_000,
            expectedStates: { expected: row.expectedState },
            tags: ['catalog-iss', domain.toLowerCase()],
        };
        benchmarks.push(def);
        specs.set(id, { template: 'iss-load', params: { asset: '' } });
        refCodes.set(id, row.refCode);
    }
    return { benchmarks, specs, refCodes };
}

const built = buildIssCatalog();
export const ISS_BENCHMARKS: BenchmarkDefinition[] = built.benchmarks;
export const ISS_SPECS = built.specs;
export const ISS_REF_CODES = built.refCodes;
export const CATALOG_ISS = { revision: 'catalog-iss-r1', benchmarks: ISS_BENCHMARKS };
