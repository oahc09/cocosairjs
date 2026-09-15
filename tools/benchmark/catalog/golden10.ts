/**
 * V0.6 §44/§50 — Golden 10 Benchmark Catalog（G1 用；扩展到 100 前必须先过 G1）。
 *
 * 覆盖（§44）：Scene / Camera / Asset / glTF / Animation / Material / Interaction /
 * Compressed Model / Runtime Control / Source Repair。
 * 每项同挂 Reference Track 与 Agent Track（共享 fixture 与 validators）。
 */
import { BenchmarkDefinition } from './schema';

const html = '<!DOCTYPE html><html><head><meta charset="utf-8">'
    + '<script type="importmap">{"imports":{"cocosair":"/build/cocosair.module.js"}}</script>'
    + '<script src="/__bench-prelude.js"></script>'
    + '</head><body style="margin:0"><canvas id="GameCanvas" width="480" height="360"></canvas>'
    + '<script type="module" src="./src/main.ts"></script></body></html>';

const COMMON_COMMANDS = [{ command: 'node', allowAnyArgs: false }, { command: 'npm', allowAnyArgs: false }];
const PROTECTED = ['protected'];

function def (partial: Partial<BenchmarkDefinition> & Pick<BenchmarkDefinition, 'id' | 'benchmarkType' | 'prompt' | 'validators' | 'referenceOperations' | 'referenceImplementation'>): BenchmarkDefinition {
    return {
        version: '1.0.0',
        name: partial.id!,
        category: 'Scene',
        difficulty: 'basic',
        startingFixture: `fixtures/${partial.id}`,
        writablePaths: ['src'],
        readablePaths: ['docs-agent'],
        protectedPaths: PROTECTED,
        allowedTools: ['read-file', 'write-file', 'patch-file', 'run-command', 'request-runtime-inspection', 'request-frame-capture', 'request-error-report', 'finish'],
        allowedCommands: COMMON_COMMANDS,
        allowedNetworkHosts: [],
        knowledgeProfile: 'K2',
        validatorParams: {},
        visualValidators: [],
        capabilityRequirements: ['webgl2'],
        browserRequirements: 'chromium>=100',
        repairBudget: 5,
        timeBudgetMs: 20 * 60_000,
        expectedStates: {},
        tags: ['golden10'],
        ...partial,
    } as BenchmarkDefinition;
}

export const GOLDEN10: BenchmarkDefinition[] = [
    def({
        id: 'B001', benchmarkType: 'source-create', category: 'Scene', name: 'scene-hierarchy',
        prompt: 'Create src/main.ts: bootstrap a cocosair app (must expose window.__airApp = app before run) on #GameCanvas with a scene containing a root node named "root" and a child named "cube". The cube must have a MeshRenderer with a box mesh and a builtin standard material, and a camera plus a directional light so the cube is visible.',
        validators: ['scene-ready', 'node-exists', 'no-runtime-error', 'visible-frame'],
        validatorParams: { 'node-exists': { name: 'cube' } },
        referenceImplementation: 'B001.main.ts',
        tags: ['golden10', 'scene'],
    }),
    def({
        id: 'B002', benchmarkType: 'source-create', category: 'Camera', name: 'camera-ortho-perspective',
        prompt: 'Create src/main.ts: a scene (expose window.__airApp = app) with two cubes at different depths and a perspective camera; the scene must expose window.__cameraToggle() that switches the camera projection between perspective and orthographic (orthoHeight 4).',
        validators: ['scene-ready', 'node-count', 'no-runtime-error', 'visible-frame'],
        validatorParams: { 'node-count': { min: 3 } },
        referenceImplementation: 'B002.main.ts',
        tags: ['golden10', 'camera'],
    }),
    def({
        id: 'B003', benchmarkType: 'source-create', category: 'Asset', name: 'asset-load-helper',
        prompt: 'Create src/main.ts: a scene (expose window.__airApp = app and run it first); then fetch the local asset "assets/demo.txt" provided by the fixture and verify its content; the scene must stay running and error-free.',
        validators: ['scene-ready', 'no-runtime-error'],
        referenceImplementation: 'B003.main.ts',
        tags: ['golden10', 'asset'],
    }),
    def({
        id: 'B004', benchmarkType: 'source-create', category: 'glTF', name: 'gltf-box-textured',
        prompt: 'Create src/main.ts: load "../assets/BoxTextured.glb" relative to the served root with GLTFLoader (fetch bytes + parseAsync), instantiate it into the scene, frame the camera on the model, and ensure a render frame completes without errors.',
        validators: ['scene-ready', 'asset-loaded', 'no-runtime-error', 'visible-frame'],
        validatorParams: { 'asset-loaded': { kind: 'Texture2D', min: 1 } },
        referenceImplementation: 'B004.main.ts',
        tags: ['golden10', 'gltf'],
    }),
    def({
        id: 'B005', benchmarkType: 'runtime-control', category: 'Animation', name: 'animation-play-clip',
        prompt: 'Use the runtime agent session to load and play an animation on the fixture scene.',
        validators: ['scene-ready', 'animation-playing', 'no-runtime-error'],
        referenceOperations: [
            { op: 'inspectScene' },
            { op: 'dispatch', requestId: 'B005-1', action: 'createNode', targetId: 'node-1', params: { name: 'anim-root' } },
            { op: 'dispatch', requestId: 'B005-2', action: 'addComponent', targetId: 'node-2', params: { component: 'Animation' } },
            { op: 'inspectScene', expect: { componentsByType: { Animation: 1 } } },
        ],
        tags: ['golden10', 'animation'],
    }),
    def({
        id: 'B006', benchmarkType: 'source-create', category: 'Material', name: 'material-pbr-property',
        prompt: 'Create src/main.ts: a scene (expose window.__airApp = app) with a cube using a standard PBR material whose base color is red (200,30,30) and metallic 0.8, lit by a directional light; must render without errors.',
        validators: ['scene-ready', 'material-property', 'no-runtime-error', 'visible-frame'],
        validatorParams: { 'material-property': { min: 1 } },
        referenceImplementation: 'B006.main.ts',
        tags: ['golden10', 'material'],
    }),
    def({
        id: 'B007', benchmarkType: 'runtime-control', category: 'Interaction', name: 'input-keyboard-move',
        prompt: 'Use the runtime agent session to add an input-driven cube: create a node, attach a MeshRenderer, and verify the fixture keyboard listener moves it.',
        validators: ['scene-ready', 'node-exists', 'no-runtime-error'],
        validatorParams: { 'node-exists': { name: 'moved-cube' } },
        referenceOperations: [
            { op: 'inspectScene' },
            { op: 'dispatch', requestId: 'B007-1', action: 'createNode', targetId: 'node-1', params: { name: 'moved-cube' } },
            { op: 'dispatch', requestId: 'B007-2', action: 'setTransform', targetId: 'node-2', params: { space: 'local', position: [1, 0, 0] } },
            { op: 'inspectNode', name: 'moved-cube', expect: { position: [1, 0, 0] } },
        ],
        tags: ['golden10', 'interaction'],
    }),
    def({
        id: 'B008', benchmarkType: 'source-create', category: 'Compression', name: 'draco-compressed-gltf',
        prompt: 'Create src/main.ts: a scene (expose window.__airApp = app) that loads a Draco-compressed GLB from "./assets/compressed.glb" with GLTFLoader (the decoder is preconfigured in this environment), instantiate it, and render one clean frame.',
        validators: ['scene-ready', 'capability-status', 'no-runtime-error'],
        validatorParams: { 'capability-status': { requires: 'draco-decoder' } },
        referenceImplementation: 'B008.main.ts',
        tags: ['golden10', 'compression'],
    }),
    def({
        id: 'B009', benchmarkType: 'runtime-control', category: 'Agent', name: 'runtime-control-closed-loop',
        prompt: 'Use the runtime agent session for a closed loop: create a node under the scene root, set its transform, inspect it back, capture a frame, and finish.',
        validators: ['scene-ready', 'node-exists', 'no-runtime-error'],
        validatorParams: { 'node-exists': { name: 'agent-node' } },
        referenceOperations: [
            { op: 'inspectScene' },
            { op: 'dispatch', requestId: 'B009-1', action: 'createNode', targetId: 'node-1', params: { name: 'agent-node' } },
            { op: 'dispatch', requestId: 'B009-2', action: 'setTransform', targetId: 'node-2', params: { space: 'local', position: [1, 1, 0], scale: [2, 2, 2] } },
            { op: 'inspectNode', name: 'agent-node', expect: { position: [1, 1, 0] } },
            { op: 'captureFrame' },
        ],
        tags: ['golden10', 'agent'],
    }),
    def({
        id: 'B010', benchmarkType: 'source-repair', category: 'Repair', name: 'repair-broken-scene',
        prompt: 'The fixture src/main.ts fails to build and run. Repair it so the scene renders a visible cube without runtime errors. Do not rewrite unrelated parts.',
        validators: ['scene-ready', 'node-exists', 'no-runtime-error', 'visible-frame'],
        validatorParams: { 'node-exists': { name: 'cube' } },
        referenceImplementation: 'B010.main.ts',
        tags: ['golden10', 'repair'],
    }),
];

/** fixture/参考实现物料（Runner 在 Trial 创建时物化到 workspace/protected）。 */
export const GOLDEN10_MATERIALS: Record<string, { fixtureFiles: Record<string, string> }> = {};
const material = (id: string, files: Record<string, string>): void => {
    GOLDEN10_MATERIALS[id] = { fixtureFiles: { 'index.html': html, ...files } };
};

material('B001', {
    'src/main.ts': '// TODO: create the scene (see benchmark prompt)\n',
    'docs-agent/getting-started.md': 'See docs/06-code-first-getting-started.md semantics: createAirApp({canvas:"#GameCanvas"}).',
});
material('B002', {
    'src/main.ts': '// TODO: two cubes + switchable camera\n',
});
material('B003', {
    'src/main.ts': '// TODO: loadAssetAsync("assets/demo.txt")\n',
    'assets/demo.txt': 'demo-asset-content',
});
material('B004', {
    'src/main.ts': '// TODO: GLTFLoader.parseAsync on BoxTextured.glb\n',
});
material('B005', { 'src/main.ts': "import { createAirApp, Scene } from 'cocosair';\nconst app = await createAirApp({ canvas: '#GameCanvas' });\nconst scene = new Scene('B005');\n(window as any).__airApp = app;\napp.run(scene);\n" });
material('B006', {
    'src/main.ts': '// TODO: red metallic cube\n',
});
material('B007', { 'src/main.ts': "import { createAirApp, Scene } from 'cocosair';\nconst app = await createAirApp({ canvas: '#GameCanvas' });\nconst scene = new Scene('B007');\n(window as any).__airApp = app;\napp.run(scene);\n" });
material('B008', {
    'src/main.ts': '// TODO: load draco-compressed model\n',
});
material('B009', { 'src/main.ts': "import { createAirApp, Scene } from 'cocosair';\nconst app = await createAirApp({ canvas: '#GameCanvas' });\nconst scene = new Scene('B009');\n(window as any).__airApp = app;\napp.run(scene);\n" });
material('B010', {
    'src/main.ts': [
        "import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, utils, primitives, builtinResMgr } from 'cocosair';",
        '',
        'const app = await createAirApp({ canvas: "#GameCanvas" });',
        'const scene = new Scene("repair-demo");',
        'const cameraNode = new Node("Camera");',
        'scene.addChild(cameraNode);',
        'cameraNode.setPosition(new Vec3(0, 2, 6));',
        'const camera = cameraNode.addComponent(Camera);',
        'camera.visibility = Layers.Enum.DEFAULT;',
        'const lightNode = new Node("Light");',
        'scene.addChild(lightNode);',
        'lightNode.addComponent(DirectionalLight);',
        'const cube = new Node("cube");',
        'cube.layer = Layers.Enum.DEFAULT;',
        'scene.addChild(cube);',
        'const renderer = cube.addComponent(MeshRenderer);',
        'renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));',
        'renderer.material = builtinResMgr.get("builtin-standard-material");',
        'app.run(scene);',
        'cube.destroy(); // BUG: destroys the cube immediately — remove this line',
        '',
    ].join('\n'),
});

export const CATALOG_REVISION = 'golden10-r1';
export const GOLDEN_CATALOG = { revision: CATALOG_REVISION, benchmarks: GOLDEN10 };
