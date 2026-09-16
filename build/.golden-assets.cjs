var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// tools/benchmark/references/golden10-assets.ts
var golden10_assets_exports = {};
__export(golden10_assets_exports, {
  GOLDEN10: () => GOLDEN10,
  GOLDEN10_MATERIALS: () => GOLDEN10_MATERIALS,
  REFERENCES: () => REFERENCES
});
module.exports = __toCommonJS(golden10_assets_exports);

// tools/benchmark/catalog/golden10.ts
var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><script type="importmap">{"imports":{"cocosair":"/build/cocosair.module.js"}}</script><script src="/__bench-prelude.js"></script></head><body style="margin:0"><canvas id="GameCanvas" width="480" height="360"></canvas><script type="module" src="./src/main.ts"></script></body></html>';
var COMMON_COMMANDS = [{ command: "node", allowAnyArgs: false }, { command: "npm", allowAnyArgs: false }];
var PROTECTED = ["protected"];
function def(partial) {
  return {
    version: "1.0.0",
    name: partial.id,
    category: "Scene",
    difficulty: "basic",
    startingFixture: `fixtures/${partial.id}`,
    writablePaths: ["src"],
    readablePaths: ["docs-agent"],
    protectedPaths: PROTECTED,
    allowedTools: ["read-file", "write-file", "patch-file", "run-command", "request-runtime-inspection", "request-frame-capture", "request-error-report", "finish"],
    allowedCommands: COMMON_COMMANDS,
    allowedNetworkHosts: [],
    knowledgeProfile: "K2",
    validatorParams: {},
    visualValidators: [],
    capabilityRequirements: ["webgl2"],
    browserRequirements: "chromium>=100",
    repairBudget: 5,
    timeBudgetMs: 20 * 6e4,
    expectedStates: {},
    tags: ["golden10"],
    ...partial
  };
}
var GOLDEN10 = [
  def({
    id: "B001",
    benchmarkType: "source-create",
    category: "Scene",
    name: "scene-hierarchy",
    prompt: 'Create src/main.ts: bootstrap a cocosair app (must expose window.__airApp = app before run) on #GameCanvas with a scene containing a root node named "root" and a child named "cube". The cube must have a MeshRenderer with a box mesh and a builtin standard material, and a camera plus a directional light so the cube is visible.',
    validators: ["scene-ready", "node-exists", "no-runtime-error", "visible-frame"],
    validatorParams: { "node-exists": { name: "cube" } },
    referenceImplementation: "B001.main.ts",
    tags: ["golden10", "scene"]
  }),
  def({
    id: "B011",
    benchmarkType: "source-create",
    category: "Camera",
    name: "camera-ortho-perspective",
    prompt: "Create src/main.ts: a scene (expose window.__airApp = app) with two cubes at different depths and a perspective camera; the scene must expose window.__cameraToggle() that switches the camera projection between perspective and orthographic (orthoHeight 4).",
    validators: ["scene-ready", "node-count", "no-runtime-error", "visible-frame"],
    validatorParams: { "node-count": { min: 3 } },
    referenceImplementation: "B011.main.ts",
    tags: ["golden10", "camera"]
  }),
  def({
    id: "B041",
    benchmarkType: "source-create",
    category: "Asset",
    name: "asset-load-helper",
    prompt: 'Create src/main.ts: a scene (expose window.__airApp = app and run it first); then fetch the local asset "assets/demo.txt" provided by the fixture and verify its content; the scene must stay running and error-free.',
    validators: ["scene-ready", "no-runtime-error"],
    referenceImplementation: "B041.main.ts",
    tags: ["golden10", "asset"]
  }),
  def({
    id: "B042",
    benchmarkType: "source-create",
    category: "glTF",
    name: "gltf-box-textured",
    prompt: 'Create src/main.ts: load "../assets/BoxTextured.glb" relative to the served root with GLTFLoader (fetch bytes + parseAsync), instantiate it into the scene, frame the camera on the model, and ensure a render frame completes without errors.',
    validators: ["scene-ready", "asset-loaded", "no-runtime-error", "visible-frame"],
    validatorParams: { "asset-loaded": { kind: "Texture2D", min: 1 } },
    referenceImplementation: "B042.main.ts",
    tags: ["golden10", "gltf"]
  }),
  def({
    id: "B061",
    benchmarkType: "runtime-control",
    category: "Animation",
    name: "animation-play-clip",
    prompt: "Use the runtime agent session to load and play an animation on the fixture scene.",
    validators: ["scene-ready", "animation-playing", "no-runtime-error"],
    referenceOperations: [
      { op: "inspectScene" },
      { op: "dispatch", requestId: "B061-1", action: "createNode", targetId: "node-1", params: { name: "anim-root" } },
      { op: "dispatch", requestId: "B061-2", action: "addComponent", targetId: "node-2", params: { component: "Animation" } },
      { op: "inspectScene", expect: { componentsByType: { Animation: 1 } } }
    ],
    tags: ["golden10", "animation"]
  }),
  def({
    id: "B031",
    benchmarkType: "source-create",
    category: "Material",
    name: "material-pbr-property",
    prompt: "Create src/main.ts: a scene (expose window.__airApp = app) with a cube using a standard PBR material whose base color is red (200,30,30) and metallic 0.8, lit by a directional light; must render without errors.",
    validators: ["scene-ready", "material-property", "no-runtime-error", "visible-frame"],
    validatorParams: { "material-property": { min: 1 } },
    referenceImplementation: "B031.main.ts",
    tags: ["golden10", "material"]
  }),
  def({
    id: "B081",
    benchmarkType: "runtime-control",
    category: "Interaction",
    name: "input-keyboard-move",
    prompt: "Use the runtime agent session to add an input-driven cube: create a node, attach a MeshRenderer, and verify the fixture keyboard listener moves it.",
    validators: ["scene-ready", "node-exists", "no-runtime-error"],
    validatorParams: { "node-exists": { name: "moved-cube" } },
    referenceOperations: [
      { op: "inspectScene" },
      { op: "dispatch", requestId: "B081-1", action: "createNode", targetId: "node-1", params: { name: "moved-cube" } },
      { op: "dispatch", requestId: "B081-2", action: "setTransform", targetId: "node-2", params: { space: "local", position: [1, 0, 0] } },
      { op: "inspectNode", name: "moved-cube", expect: { position: [1, 0, 0] } }
    ],
    tags: ["golden10", "interaction"]
  }),
  def({
    id: "B051",
    benchmarkType: "source-create",
    category: "Compression",
    name: "draco-compressed-gltf",
    prompt: 'Create src/main.ts: a scene (expose window.__airApp = app) that loads a Draco-compressed GLB from "./assets/compressed.glb" with GLTFLoader (the decoder is preconfigured in this environment), instantiate it, and render one clean frame.',
    validators: ["scene-ready", "capability-status", "no-runtime-error"],
    validatorParams: { "capability-status": { requires: "draco-decoder" } },
    referenceImplementation: "B051.main.ts",
    tags: ["golden10", "compression"]
  }),
  def({
    id: "B091",
    benchmarkType: "runtime-control",
    category: "Agent",
    name: "runtime-control-closed-loop",
    prompt: "Use the runtime agent session for a closed loop: create a node under the scene root, set its transform, inspect it back, capture a frame, and finish.",
    validators: ["scene-ready", "node-exists", "no-runtime-error"],
    validatorParams: { "node-exists": { name: "agent-node" } },
    referenceOperations: [
      { op: "inspectScene" },
      { op: "dispatch", requestId: "B091-1", action: "createNode", targetId: "node-1", params: { name: "agent-node" } },
      { op: "dispatch", requestId: "B091-2", action: "setTransform", targetId: "node-2", params: { space: "local", position: [1, 1, 0], scale: [2, 2, 2] } },
      { op: "inspectNode", name: "agent-node", expect: { position: [1, 1, 0] } },
      { op: "captureFrame" }
    ],
    tags: ["golden10", "agent"]
  }),
  def({
    id: "B100",
    benchmarkType: "source-repair",
    category: "Repair",
    name: "repair-broken-scene",
    prompt: "The fixture src/main.ts fails to build and run. Repair it so the scene renders a visible cube without runtime errors. Do not rewrite unrelated parts.",
    validators: ["scene-ready", "node-exists", "no-runtime-error", "visible-frame"],
    validatorParams: { "node-exists": { name: "cube" } },
    referenceImplementation: "B100.main.ts",
    tags: ["golden10", "repair"]
  })
];
var GOLDEN10_MATERIALS = {};
var material = (id, files) => {
  GOLDEN10_MATERIALS[id] = { fixtureFiles: { "index.html": html, ...files } };
};
material("B001", {
  "src/main.ts": "// TODO: create the scene (see benchmark prompt)\n",
  "docs-agent/getting-started.md": 'See docs/06-code-first-getting-started.md semantics: createAirApp({canvas:"#GameCanvas"}).'
});
material("B011", {
  "src/main.ts": "// TODO: two cubes + switchable camera\n"
});
material("B041", {
  "src/main.ts": '// TODO: loadAssetAsync("assets/demo.txt")\n',
  "assets/demo.txt": "demo-asset-content"
});
material("B042", {
  "src/main.ts": "// TODO: GLTFLoader.parseAsync on BoxTextured.glb\n"
});
material("B061", { "src/main.ts": "import { createAirApp, Scene } from 'cocosair';\nconst app = await createAirApp({ canvas: '#GameCanvas' });\nconst scene = new Scene('B005');\n(window as any).__airApp = app;\napp.run(scene);\n" });
material("B031", {
  "src/main.ts": "// TODO: red metallic cube\n"
});
material("B081", { "src/main.ts": "import { createAirApp, Scene } from 'cocosair';\nconst app = await createAirApp({ canvas: '#GameCanvas' });\nconst scene = new Scene('B007');\n(window as any).__airApp = app;\napp.run(scene);\n" });
material("B051", {
  "src/main.ts": "// TODO: load draco-compressed model\n"
});
material("B091", { "src/main.ts": "import { createAirApp, Scene } from 'cocosair';\nconst app = await createAirApp({ canvas: '#GameCanvas' });\nconst scene = new Scene('B009');\n(window as any).__airApp = app;\napp.run(scene);\n" });
material("B100", {
  "src/main.ts": [
    "import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, utils, primitives, builtinResMgr } from 'cocosair';",
    "",
    'const app = await createAirApp({ canvas: "#GameCanvas" });',
    'const scene = new Scene("repair-demo");',
    'const cameraNode = new Node("Camera");',
    "scene.addChild(cameraNode);",
    "cameraNode.setPosition(new Vec3(0, 2, 6));",
    "const camera = cameraNode.addComponent(Camera);",
    "camera.visibility = Layers.Enum.DEFAULT;",
    'const lightNode = new Node("Light");',
    "scene.addChild(lightNode);",
    "lightNode.addComponent(DirectionalLight);",
    'const cube = new Node("cube");',
    "cube.layer = Layers.Enum.DEFAULT;",
    "scene.addChild(cube);",
    "const renderer = cube.addComponent(MeshRenderer);",
    "renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));",
    'renderer.material = builtinResMgr.get("builtin-standard-material");',
    "app.run(scene);",
    "cube.destroy(); // BUG: destroys the cube immediately \u2014 remove this line",
    ""
  ].join("\n")
});

// tools/benchmark/references/golden10-references.ts
var REFERENCES = {};
REFERENCES.B001 = `import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, utils, primitives, builtinResMgr } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B001');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.setRotationFromEuler(-15, 0, 0);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
const root = new Node('root');
scene.addChild(root);
const cube = new Node('cube');
cube.layer = Layers.Enum.DEFAULT;
root.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
renderer.material = builtinResMgr.get('builtin-standard-material');
(window as unknown as { __airApp: unknown }).__airApp = app;
app.run(scene);
`;
REFERENCES.B011 = `import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, utils, primitives, builtinResMgr } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B002');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 8));
cameraNode.setRotationFromEuler(-12, 0, 0);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
for (let i = 0; i < 2; i++) {
    const cube = new Node('cube-' + i);
    cube.layer = Layers.Enum.DEFAULT;
    cube.setPosition(new Vec3(0, 0, -i * 3));
    scene.addChild(cube);
    const renderer = cube.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
    renderer.material = builtinResMgr.get('builtin-standard-material');
}
(window as unknown as { __cameraToggle: () => void }).__cameraToggle = () => {
    camera.projection = camera.projection === Camera.ProjectionType.ORTHO
        ? Camera.ProjectionType.PERSPECTIVE
        : Camera.ProjectionType.ORTHO;
    if (camera.projection === Camera.ProjectionType.ORTHO) { camera.orthoHeight = 4; }
};
(window as unknown as { __airApp: unknown }).__airApp = app;
app.run(scene);
`;
REFERENCES.B041 = `import { createAirApp, Scene } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B003');
app.run(scene);
const response = await fetch('/assets/demo.txt');
const text = await response.text();
if (text.trim() !== 'demo-asset-content') { throw new Error('asset content mismatch: ' + text); }
console.log('[B003] asset loaded:', text);
`;
REFERENCES.B042 = `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B004');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
const response = await fetch('/assets/BoxTextured.glb');
const bytes = await response.arrayBuffer();
const asset = await new GLTFLoader().parseAsync(bytes, '/');
const instance = asset.instantiate();
scene.addChild(instance.root);
frameObject(camera, instance.root);
(window as unknown as { __airApp: unknown }).__airApp = app;
app.run(scene);
`;
REFERENCES.B031 = `import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, Color, utils, primitives, Material, builtinResMgr } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B006');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.setRotationFromEuler(-15, 0, 0);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
const cube = new Node('cube');
cube.layer = Layers.Enum.DEFAULT;
scene.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard', defines: { USE_BASE_COLOR: true }, macroRemap: {} });
renderer.material = material;
renderer.material = builtinResMgr.get('builtin-standard-material');
void Color;
(window as unknown as { __airApp: unknown }).__airApp = app;
app.run(scene);
`;
REFERENCES.B051 = `import { createAirApp, Scene, GLTFLoader } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B008');
app.run(scene);
const response = await fetch('/assets/compressed.glb');
const bytes = await response.arrayBuffer();
const asset = await new GLTFLoader().parseAsync(bytes, '/');
const instance = asset.instantiate();
scene.addChild(instance.root);
`;
REFERENCES.B100 = `import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, utils, primitives, builtinResMgr } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('repair-demo');
const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.setRotationFromEuler(-15, 0, 0);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
const cube = new Node('cube');
cube.layer = Layers.Enum.DEFAULT;
scene.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
renderer.material = builtinResMgr.get('builtin-standard-material');
(window as unknown as { __airApp: unknown }).__airApp = app;
app.run(scene);
`;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  GOLDEN10,
  GOLDEN10_MATERIALS,
  REFERENCES
});
