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

// tools/benchmark/catalog/catalog100.ts
var catalog100_exports = {};
__export(catalog100_exports, {
  CATALOG100: () => CATALOG100,
  CATALOG_BENCHMARKS: () => CATALOG_BENCHMARKS,
  GOLDEN_REVISION: () => CATALOG_REVISION,
  REF_CODES: () => REF_CODES,
  SPECS: () => SPECS,
  deriveRcOps: () => deriveRcOps
});
module.exports = __toCommonJS(catalog100_exports);

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
var CATALOG_REVISION = "golden10-r1";

// tools/benchmark/catalog/catalog100.ts
var rcApp = (id) => `import { createAirApp, Scene } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('${id}');
(window as any).__airApp = app;
app.run(scene);
`;
var ROWS = [
  // ---- B001-B010：Scene / Node / Transform（B001 = golden scene-hierarchy）----
  {
    id: "B002",
    type: "runtime-control",
    category: "Scene",
    name: "rc-create-named-node",
    prompt: 'Use the runtime agent session to create a node named "marker" under the scene root and verify it exists.',
    validators: ["scene-ready", "node-exists", "no-runtime-error"],
    validatorParams: { "node-exists": { name: "marker" } },
    template: "rc-app",
    params: {},
    refCode: rcApp("B002")
  },
  {
    id: "B003",
    type: "source-create",
    category: "Scene",
    name: "three-node-row",
    prompt: 'Create src/main.ts: a scene with exactly three cubes named "a", "b", "c" placed in a row at x = -2, 0, 2 (y=z=0), with camera and light; all visible without runtime errors.',
    validators: ["scene-ready", "node-count", "node-exists", "no-runtime-error", "visible-frame"],
    validatorParams: { "node-count": { equals: 6 }, "node-exists": { name: "b" } },
    template: "scene-cubes",
    params: { cubes: [{ name: "a", pos: [-2, 0, 0] }, { name: "b", pos: [0, 0, 0] }, { name: "c", pos: [2, 0, 0] }] }
  },
  {
    id: "B004",
    type: "source-create",
    category: "Scene",
    name: "parent-child-transform",
    prompt: 'Create src/main.ts: a node "parent" at position (1, 0, 0) with a child cube "child" at local position (0, 1, 0). The child world position must be (1, 1, 0).',
    validators: ["scene-ready", "node-exists", "transform-equals", "no-runtime-error"],
    validatorParams: {
      "node-exists": { name: "child" },
      "transform-equals": { nodeName: "child", space: "world", position: [1, 1, 0] }
    },
    template: "scene-cubes",
    params: { cubes: [{ name: "parent", pos: [1, 0, 0] }, { name: "child", pos: [0, 1, 0] }], extra: 'const parent = scene.getChildByName("parent")!;\nconst child = scene.getChildByName("child")!;\nparent.addChild(child);\nchild.setPosition(new Vec3(0, 1, 0));' }
  },
  {
    id: "B005",
    type: "source-create",
    category: "Scene",
    name: "world-position-offset",
    prompt: 'Create src/main.ts: a cube "moved" whose WORLD position is (2, 3, -1) (set via setWorldPosition; the scene has no transformed parents so local equals world).',
    validators: ["scene-ready", "transform-equals", "no-runtime-error"],
    validatorParams: { "transform-equals": { nodeName: "moved", space: "world", position: [2, 3, -1] } },
    template: "scene-cubes",
    params: { cubes: [{ name: "moved", pos: [2, 3, -1] }], world: true }
  },
  {
    id: "B006",
    type: "source-create",
    category: "Scene",
    name: "cube-grid-2x2",
    prompt: 'Create src/main.ts: a 2x2 grid of four cubes named "g0".."g3" at (\xB11.5, 0, \xB11.5), all with box meshes.',
    validators: ["scene-ready", "node-count", "node-exists", "no-runtime-error"],
    validatorParams: { "node-count": { equals: 7 }, "node-exists": { name: "g3" } },
    template: "scene-cubes",
    params: { cubes: [{ name: "g0", pos: [-1.5, 0, -1.5] }, { name: "g1", pos: [1.5, 0, -1.5] }, { name: "g2", pos: [-1.5, 0, 1.5] }, { name: "g3", pos: [1.5, 0, 1.5] }] }
  },
  {
    id: "B007",
    type: "source-create",
    category: "Scene",
    name: "non-uniform-scale",
    prompt: 'Create src/main.ts: a cube "slab" with non-uniform scale (3, 0.5, 1) \u2014 a flat slab. Verify its local scale by keeping the transform exactly as specified.',
    validators: ["scene-ready", "transform-equals", "no-runtime-error"],
    validatorParams: { "transform-equals": { nodeName: "slab", scale: [3, 0.5, 1] } },
    template: "scene-cubes",
    params: { cubes: [{ name: "slab", pos: [0, 0, 0], scale: [3, 0.5, 1] }] }
  },
  {
    id: "B008",
    type: "source-create",
    category: "Scene",
    name: "tall-stack",
    prompt: 'Create src/main.ts: a vertical stack of three cubes named "s-bottom", "s-mid", "s-top" at y = 0, 1, 2 respectively (x=z=0).',
    validators: ["scene-ready", "node-count", "node-exists", "no-runtime-error"],
    validatorParams: { "node-count": { equals: 6 }, "node-exists": { name: "s-top" } },
    template: "scene-cubes",
    params: { cubes: [{ name: "s-bottom", pos: [0, 0, 0] }, { name: "s-mid", pos: [0, 1, 0] }, { name: "s-top", pos: [0, 2, 0] }] }
  },
  {
    id: "B009",
    type: "source-create",
    category: "Scene",
    name: "deep-nesting",
    prompt: 'Create src/main.ts: a chain "l1" \u2192 "l2" \u2192 "l3" where l2 is child of l1 and l3 is child of l2; l3 sits at local (0, 1, 0) inside l2.',
    validators: ["scene-ready", "node-count", "node-exists", "no-runtime-error"],
    validatorParams: { "node-count": { equals: 6 }, "node-exists": { name: "l3" } },
    template: "scene-cubes",
    params: { cubes: [{ name: "l1", pos: [0, 0, 0] }, { name: "l2", pos: [0, 0, 0] }, { name: "l3", pos: [0, 1, 0] }], extra: 'const l1 = scene.getChildByName("l1")!; const l2 = scene.getChildByName("l2")!; const l3 = scene.getChildByName("l3")!;\nl2.parent = l1; l3.parent = l2;' }
  },
  {
    id: "B010",
    type: "runtime-control",
    category: "Scene",
    name: "rc-create-and-move",
    prompt: 'Use the runtime agent session: create a node named "rc-moved" under the scene root, set its local position to (-1, 2, 0), and inspect it back.',
    validators: ["scene-ready", "node-exists", "no-runtime-error"],
    validatorParams: { "node-exists": { name: "rc-moved" } },
    template: "rc-app",
    params: {},
    refCode: rcApp("B010")
  },
  // ---- B011-B020：Camera（B011 = golden camera-ortho-perspective）----
  {
    id: "B012",
    type: "source-create",
    category: "Camera",
    name: "camera-high-angle",
    prompt: "Create src/main.ts: a cube at origin viewed by a camera placed high above at (0, 8, 2) looking down (rotation x \u2248 -75\xB0), producing a visible top-down view without errors.",
    validators: ["scene-ready", "node-exists", "no-runtime-error", "visible-frame"],
    validatorParams: { "node-exists": { name: "cube" } },
    template: "scene-cubes",
    params: { cubes: [{ name: "cube", pos: [0, 0, 0] }], camera: { pos: [0, 8, 2], euler: [-75, 0, 0] } }
  },
  {
    id: "B013",
    type: "source-create",
    category: "Camera",
    name: "camera-near-clip",
    prompt: 'Create src/main.ts: two cubes along z at 2 and 6 units in front of a camera at origin (looking -z); the nearer cube named "near-cube".',
    validators: ["scene-ready", "node-exists", "node-count", "no-runtime-error", "visible-frame"],
    validatorParams: { "node-count": { equals: 5 }, "node-exists": { name: "near-cube" } },
    template: "scene-cubes",
    params: { cubes: [{ name: "near-cube", pos: [0, 0, -2] }, { name: "far-cube", pos: [0, 0, -6] }], camera: { pos: [0, 0, 0], euler: [0, 0, 0] } }
  },
  {
    id: "B014",
    type: "runtime-control",
    category: "Camera",
    name: "rc-camera-create",
    prompt: 'Use the runtime agent session: create a node named "rc-camera" with a Camera component (whitelisted) under the scene root.',
    validators: ["scene-ready", "node-exists", "no-runtime-error"],
    validatorParams: { "node-exists": { name: "rc-camera" } },
    template: "rc-app",
    params: {},
    refCode: rcApp("B014")
  },
  {
    id: "B015",
    type: "source-create",
    category: "Camera",
    name: "two-camera-scene",
    prompt: 'Create src/main.ts: a scene with two cameras named "cam-main" (priority 0) and "cam-second" (priority -1), both seeing one cube.',
    validators: ["scene-ready", "node-exists", "no-runtime-error"],
    validatorParams: { "node-exists": { name: "cam-second" } },
    template: "scene-cubes",
    params: { cubes: [{ name: "cube", pos: [0, 0, 0] }], extra: 'const second = new Node("cam-second");\nscene.addChild(second);\nsecond.setPosition(new Vec3(3, 3, 3));\nconst cam2 = second.addComponent(Camera);\ncam2.visibility = Layers.Enum.DEFAULT;\ncam2.priority = -1;' }
  },
  // ---- B016-B030 补充至 Lighting 段（此处并入 Scene/Camera 段的补充项）----
  // ---- B031-B040：Mesh / Material / Texture（B031 = golden material-pbr）----
  {
    id: "B032",
    type: "source-create",
    category: "Mesh",
    name: "sphere-mesh",
    prompt: 'Create src/main.ts: a sphere (primitives.sphere) named "ball" with a standard material, lit and visible.',
    validators: ["scene-ready", "node-exists", "no-runtime-error", "visible-frame"],
    validatorParams: { "node-exists": { name: "ball" } },
    template: "custom",
    params: { ref: "B032" },
    refCode: `import { createAirApp, Scene, Node, MeshRenderer, Animation, Camera, DirectionalLight, Layers, Vec3, utils, primitives, builtinResMgr } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B032');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.setRotationFromEuler(-15, 0, 0);
cameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
const ball = new Node('ball');
ball.layer = Layers.Enum.DEFAULT;
scene.addChild(ball);
const renderer = ball.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.sphere({ radius: 0.8 }));
renderer.material = builtinResMgr.get('builtin-standard-material');
app.run(scene);
`
  },
  {
    id: "B033",
    type: "runtime-control",
    category: "Mesh",
    name: "rc-mesh-renderer",
    prompt: 'Use the runtime agent session: create a node named "rc-mesh" and attach a MeshRenderer component (whitelist).',
    validators: ["scene-ready", "node-exists", "no-runtime-error"],
    validatorParams: { "node-exists": { name: "rc-mesh" } },
    template: "rc-app",
    params: {},
    refCode: rcApp("B033")
  },
  // ---- B041-B050：glTF / Asset（B041 asset-helper、B042 gltf-box-textured = golden）----
  {
    id: "B043",
    type: "source-create",
    category: "glTF",
    name: "gltf-instantiate-animations",
    prompt: 'Create src/main.ts: load "/assets/BoxTextured.glb" with GLTFLoader, instantiate it, and report how many animations the instance exposes (0 is fine for BoxTextured) \u2014 the scene must stay error-free and running with the model in the tree.',
    validators: ["scene-ready", "no-runtime-error", "visible-frame"],
    template: "custom",
    params: { ref: "B043" },
    refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B043');
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
app.run(scene);
`
  },
  {
    id: "B044",
    type: "runtime-control",
    category: "glTF",
    name: "rc-inspect-assets",
    prompt: "Use the runtime agent session: call inspectAsset and confirm the report is JSON-serializable with unchecked entries preserved.",
    validators: ["scene-ready", "no-runtime-error"],
    template: "rc-app",
    params: {},
    refCode: rcApp("B044")
  },
  // ---- B051：Compression（golden draco）----
  // ---- B061：Animation（golden）----
  {
    id: "B062",
    type: "runtime-control",
    category: "Animation",
    name: "rc-animation-component-count",
    prompt: 'Use the runtime agent session: create a node named "animator" and attach an Animation component; inspectScene must then report the Animation component.',
    validators: ["scene-ready", "animation-playing", "no-runtime-error"],
    template: "rc-app",
    params: {},
    refCode: rcApp("B062")
  },
  // ---- B081：Interaction（golden keyboard）----
  {
    id: "B082",
    type: "runtime-control",
    category: "Interaction",
    name: "rc-rotate-node",
    prompt: 'Use the runtime agent session: create a node named "spinner" and set its local rotation euler to (0, 90, 0); inspect it back.',
    validators: ["scene-ready", "node-exists", "no-runtime-error"],
    validatorParams: { "node-exists": { name: "spinner" } },
    template: "rc-app",
    params: {},
    refCode: rcApp("B082")
  },
  // ---- B091：Agent（golden closed-loop）----
  // ---- B100：Source Repair（golden repair-broken-scene）----
  // ---- B092-B099：Agent / Runtime Feedback 段补充 ----
  {
    id: "B092",
    type: "runtime-control",
    category: "Agent",
    name: "rc-settransform-world",
    prompt: "Use the runtime agent session: create a node and set its WORLD position to (3, 0, -2) via setTransform space=world, then inspect the world position back.",
    validators: ["scene-ready", "no-runtime-error"],
    template: "rc-app",
    params: {},
    refCode: rcApp("B092")
  },
  {
    id: "B093",
    type: "runtime-control",
    category: "Agent",
    name: "rc-policy-denied",
    prompt: "Correctly handle a policy rejection: attempt to write outside the writable scope, confirm the stable denial code, then finish normally.",
    validators: ["scene-ready", "no-runtime-error"],
    template: "rc-app",
    params: {},
    refCode: rcApp("B093")
  },
  {
    id: "B094",
    type: "runtime-control",
    category: "Agent",
    name: "rc-frame-capture",
    prompt: "Use the runtime agent session to capture a frame after creating a node, and confirm the capture is a PNG with non-zero size.",
    validators: ["scene-ready", "no-runtime-error"],
    template: "rc-app",
    params: {},
    refCode: rcApp("B094")
  },
  {
    id: "B095",
    type: "runtime-control",
    category: "Agent",
    name: "rc-error-report",
    prompt: "Use the runtime agent session to request the runtime error report (getRuntimeErrors) and finish; an empty report is a pass.",
    validators: ["scene-ready", "no-runtime-error"],
    template: "rc-app",
    params: {},
    refCode: rcApp("B095")
  },
  // ---- B016-B020：Camera 补充 ----
  { id: "B016", type: "source-create", category: "Camera", name: "camera-lookat-cube", prompt: "Create src/main.ts: a camera at (4, 4, 4) aimed at a cube at origin (rotate the camera so the cube is centered), no runtime errors, cube visible.", validators: ["scene-ready", "node-exists", "no-runtime-error", "visible-frame"], validatorParams: { "node-exists": { name: "cube" } }, template: "scene-cubes", params: { cubes: [{ name: "cube", pos: [0, 0, 0] }], camera: { pos: [4, 4, 4], euler: [-35, 45, 0] } } },
  { id: "B017", type: "source-create", category: "Camera", name: "camera-large-far", prompt: "Create src/main.ts: a scene whose camera far plane is 5000 with a distant cube at z = -900 (visible, proving the far plane is large enough).", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "distant", pos: [0, 0, -900], scale: [120, 120, 120] }], camera: { pos: [0, 0, 0], euler: [0, 0, 0], far: 5e3 } } },
  { id: "B018", type: "runtime-control", category: "Camera", name: "rc-move-camera-node", prompt: "Use the runtime agent session: create a node named rc-cam with a Camera component and set its local position to (0, 5, 5).", validators: ["scene-ready", "node-exists", "no-runtime-error"], validatorParams: { "node-exists": { name: "rc-cam" } }, template: "rc-app", params: {}, refCode: rcApp("B018") },
  { id: "B019", type: "source-create", category: "Camera", name: "camera-narrow-fov", prompt: "Create src/main.ts: a perspective camera with fov 30 viewing a cube at z=-8 (narrow fov keeps it framed), visible without errors.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "cube", pos: [0, 0, -8] }], camera: { pos: [0, 0, 0], euler: [0, 0, 0], fov: 30 } } },
  { id: "B020", type: "source-create", category: "Camera", name: "ortho-uniform-view", prompt: "Create src/main.ts: an orthographic camera (orthoHeight 4) viewing depth-stacked cubes that must appear the same size; no runtime errors.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "near", pos: [0, 0, 0] }, { name: "far", pos: [0, 0, -4] }], camera: { pos: [0, 0, 8], euler: [0, 0, 0], ortho: 4 } } },
  // ---- B021-B030：Lighting ----
  { id: "B021", type: "source-create", category: "Lighting", name: "spot-light-scene", prompt: "Create src/main.ts: light the cube with a SpotLight (whitelist component) instead of a directional light; the cube must remain visible.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "cube", pos: [0, 0, 0] }], light: { kind: "spot" } } },
  { id: "B022", type: "source-create", category: "Lighting", name: "sphere-light-scene", prompt: "Create src/main.ts: light the cube with a SphereLight positioned above it; cube visible, no errors.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "cube", pos: [0, 0, 0] }], light: { kind: "sphere" } } },
  { id: "B023", type: "source-create", category: "Lighting", name: "high-illuminance", prompt: "Create src/main.ts: a directional light with illuminance 6 lighting a white cube; the scene renders without errors and the cube is visible.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "cube", pos: [0, 0, 0] }], light: { kind: "directional", illuminance: 6 } } },
  { id: "B024", type: "source-create", category: "Lighting", name: "low-illuminance", prompt: "Create src/main.ts: a dim directional light (illuminance 0.6) and a cube; the render must complete without errors.", validators: ["scene-ready", "no-runtime-error"], template: "scene-cubes", params: { cubes: [{ name: "cube", pos: [0, 0, 0] }], light: { kind: "directional", illuminance: 0.6 } } },
  { id: "B025", type: "source-create", category: "Lighting", name: "two-directional-lights", prompt: "Create src/main.ts: two directional lights named key-light and fill-light (crossing angles) lighting one cube.", validators: ["scene-ready", "node-exists", "no-runtime-error", "visible-frame"], validatorParams: { "node-exists": { name: "fill-light" } }, template: "scene-cubes", params: { cubes: [{ name: "cube", pos: [0, 0, 0] }], light: { kind: "two-directional" } } },
  { id: "B026", type: "runtime-control", category: "Lighting", name: "rc-spot-light", prompt: "Use the runtime agent session: create a node named rc-spot and attach a SpotLight component.", validators: ["scene-ready", "node-exists", "no-runtime-error"], validatorParams: { "node-exists": { name: "rc-spot" } }, template: "rc-app", params: {}, refCode: rcApp("B026") },
  { id: "B027", type: "runtime-control", category: "Lighting", name: "rc-sphere-light", prompt: "Use the runtime agent session: create a node named rc-sphere-light and attach a SphereLight component.", validators: ["scene-ready", "node-exists", "no-runtime-error"], validatorParams: { "node-exists": { name: "rc-sphere-light" } }, template: "rc-app", params: {}, refCode: rcApp("B027") },
  { id: "B028", type: "source-create", category: "Lighting", name: "light-from-below", prompt: "Create src/main.ts: a directional light placed below the cube (pointing up) lighting its underside; render completes without errors.", validators: ["scene-ready", "no-runtime-error"], template: "scene-cubes", params: { cubes: [{ name: "cube", pos: [0, 0, 0] }], light: { kind: "directional", euler: [60, 0, 0], pos: [0, -5, 0] } } },
  { id: "B029", type: "runtime-control", category: "Lighting", name: "rc-light-move", prompt: "Use the runtime agent session: create a node named rc-light-pos with a PointLight component and set its position to (2, 4, 2).", validators: ["scene-ready", "node-exists", "no-runtime-error"], validatorParams: { "node-exists": { name: "rc-light-pos" } }, template: "rc-app", params: {}, refCode: rcApp("B029") },
  { id: "B030", type: "source-create", category: "Lighting", name: "ranged-directional", prompt: "Create src/main.ts: use a RangedDirectionalLight component to light a cube; no errors, cube visible.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "cube", pos: [0, 0, 0] }], light: { kind: "ranged-directional" } } },
  // ---- B034-B040：Mesh / Material / Texture 补充 ----
  { id: "B034", type: "source-create", category: "Mesh", name: "torus-mesh", prompt: "Create src/main.ts: a torus (primitives.torus) named ring with a standard material; visible, no errors.", validators: ["scene-ready", "node-exists", "no-runtime-error", "visible-frame"], validatorParams: { "node-exists": { name: "ring" } }, template: "scene-cubes", params: { cubes: [{ name: "ring", pos: [0, 0, 0] }], mesh: "torus", camera: { pos: [0, 0.6, 3.5], euler: [-10, 0, 0] } } },
  { id: "B035", type: "source-create", category: "Mesh", name: "cylinder-mesh", prompt: "Create src/main.ts: a cylinder named pillar with standard material; visible, no errors.", validators: ["scene-ready", "node-exists", "no-runtime-error", "visible-frame"], validatorParams: { "node-exists": { name: "pillar" } }, template: "scene-cubes", params: { cubes: [{ name: "pillar", pos: [0, 0, 0] }], mesh: "cylinder", camera: { pos: [0, 1, 5], euler: [-8, 0, 0] } } },
  { id: "B036", type: "source-create", category: "Mesh", name: "plane-ground", prompt: "Create src/main.ts: a ground plane named ground plus one cube resting on it; both visible.", validators: ["scene-ready", "node-exists", "no-runtime-error", "visible-frame"], validatorParams: { "node-exists": { name: "ground" } }, template: "scene-cubes", params: { cubes: [{ name: "ground", pos: [0, -0.5, 0] }, { name: "cube", pos: [0, 0.2, 0] }], mesh: "mixed-plane" } },
  { id: "B037", type: "source-create", category: "Material", name: "two-cubes-two-materials", prompt: "Create src/main.ts: two cubes red-cube and blue-cube side by side, each with its own Material instance (builtin-standard), no runtime errors.", validators: ["scene-ready", "node-exists", "material-property", "no-runtime-error"], validatorParams: { "node-exists": { name: "blue-cube" }, "material-property": { min: 2 } }, template: "scene-cubes", params: { cubes: [{ name: "red-cube", pos: [-1.5, 0, 0] }, { name: "blue-cube", pos: [1.5, 0, 0] }], independentMaterials: true } },
  { id: "B038", type: "source-create", category: "Texture", name: "textured-cube-uv", prompt: "Create src/main.ts: a cube with a standard material and generated texture applied; visible without errors.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "tex-cube", pos: [0, 0, 0] }] } },
  { id: "B039", type: "runtime-control", category: "Material", name: "rc-inspect-material-count", prompt: "Use the runtime agent session: after creating two nodes with MeshRenderers, inspectAsset and confirm Material count is reported.", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B039") },
  { id: "B040", type: "runtime-control", category: "Mesh", name: "rc-node-scale", prompt: "Use the runtime agent session: create a node named rc-slab and set its scale to (4, 0.25, 1) via setTransform.", validators: ["scene-ready", "node-exists", "no-runtime-error"], validatorParams: { "node-exists": { name: "rc-slab" } }, template: "rc-app", params: {}, refCode: rcApp("B040") },
  // ---- B045-B050：glTF / Asset 补充 ----
  { id: "B045", type: "source-create", category: "glTF", name: "gltf-two-instances", prompt: 'Create src/main.ts: load "/assets/BoxTextured.glb" once and instantiate it TWICE into the scene at different positions; both instances render without errors.', validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "custom", params: { ref: "B045" }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, Vec3, GLTFLoader, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B045');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
const bytes = await (await fetch('/assets/BoxTextured.glb')).arrayBuffer();
const asset = await new GLTFLoader().parseAsync(bytes, '/');
for (const x of [-1.5, 1.5]) {
    const instance = asset.instantiate();
    instance.root.setPosition(new Vec3(x, 0, 0));
    scene.addChild(instance.root);
}
frameObject(camera, scene);
app.run(scene);
` },
  { id: "B046", type: "runtime-control", category: "glTF", name: "rc-loadasset-boxtextured", prompt: "Use the runtime agent session loadAsset action to load BoxTextured.glb (URL provided in fixture docs-agent note), then instantiateAsset into the scene.", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B046") },
  { id: "B047", type: "source-create", category: "Asset", name: "asset-lifecycle-reload", prompt: 'Create src/main.ts: load "/assets/BoxTextured.glb", destroy the asset after instantiating once, then load it AGAIN and instantiate a second model; the scene must remain error-free.', validators: ["scene-ready", "no-runtime-error", "resource-released"], template: "custom", params: { ref: "B047" }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B047');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const load = async () => new GLTFLoader().parseAsync(await (await fetch('/assets/BoxTextured.glb')).arrayBuffer(), '/');
const first = await load();
const inst1 = first.instantiate();
scene.addChild(inst1.root);
first.destroy();
const second = await load();
scene.addChild(second.instantiate().root);
` },
  { id: "B048", type: "runtime-control", category: "Asset", name: "rc-instantiate-scope", prompt: "Use the runtime agent session: create a node named rc-parent, then create a child under it named rc-child, then inspect the child (parentId must be the parent id).", validators: ["scene-ready", "node-exists", "no-runtime-error"], validatorParams: { "node-exists": { name: "rc-child" } }, template: "rc-app", params: {}, refCode: rcApp("B048") },
  { id: "B049", type: "source-create", category: "Asset", name: "gltf-warnings-clean", prompt: "Create src/main.ts: load BoxTextured.glb and confirm asset.warnings is empty (log the count); instantiate and render cleanly.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "custom", params: { ref: "B049" }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B049');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const asset = await new GLTFLoader().parseAsync(await (await fetch('/assets/BoxTextured.glb')).arrayBuffer(), '/');
console.log('[B049] warnings:', asset.warnings.length);
scene.addChild(asset.instantiate().root);
frameObject(camera, scene);
` },
  { id: "B050", type: "runtime-control", category: "glTF", name: "rc-inspect-scene-deep", prompt: "Use the runtime agent session: create three nodes (rc-a, rc-b under rc-a, rc-c under rc-b) and confirm inspectScene reports nodeCount >= 4.", validators: ["scene-ready", "node-count", "no-runtime-error"], validatorParams: { "node-count": { min: 4 } }, template: "rc-app", params: {}, refCode: rcApp("B050") },
  // ---- B052-B060：glTF Extensions / Compression 补充 ----
  { id: "B052", type: "source-create", category: "Compression", name: "draco-sequential-encoding", prompt: 'Create src/main.ts: load "/assets/sequential-draco.glb" (Draco sequential encoding) with GLTFLoader, instantiate, render one clean frame.', validators: ["scene-ready", "capability-status", "no-runtime-error"], template: "custom", params: { ref: "B052" }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B052');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const bytes = await (await fetch('/assets/sequential-draco.glb')).arrayBuffer();
const asset = await new GLTFLoader().parseAsync(bytes, '/');
scene.addChild(asset.instantiate().root);
` },
  { id: "B053", type: "runtime-control", category: "Compression", name: "rc-extension-support-report", prompt: "Use the runtime agent session: inspect the scene and finish; the fixture page preloads GLTF extension support info in the docs-agent note for cross-checking.", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B053") },
  { id: "B054", type: "runtime-control", category: "Compression", name: "rc-draco-load-scope", prompt: 'Use the runtime agent session: loadAsset "/assets/compressed.glb" (draco decoder is preconfigured in this environment) and report the assetId.', validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B054") },
  { id: "B055", type: "source-create", category: "Compression", name: "meshopt-availability-guard", prompt: "Create src/main.ts: check meshopt availability via the cocosair export isMeshoptAvailable and log the boolean; the scene must run regardless of the result (no errors).", validators: ["scene-ready", "no-runtime-error"], template: "custom", params: { ref: "B055" }, refCode: `import { createAirApp, Scene, isMeshoptAvailable } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B055');
console.log('[B055] meshopt available:', isMeshoptAvailable());
app.run(scene);
` },
  { id: "B056", type: "source-create", category: "Compression", name: "ktx2-availability-guard", prompt: "Create src/main.ts: log isKTX2Available() capability check using the exported helper; scene runs error-free.", validators: ["scene-ready", "no-runtime-error"], template: "custom", params: { ref: "B056" }, refCode: `import { createAirApp, Scene, isKTX2Available } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B056');
console.log('[B056] ktx2 available:', isKTX2Available());
app.run(scene);
` },
  { id: "B057", type: "source-create", category: "Compression", name: "draco-reload-twice", prompt: 'Create src/main.ts: load "/assets/compressed.glb" twice sequentially (destroy between) with the configured draco decoder; no errors.', validators: ["scene-ready", "no-runtime-error", "resource-released"], template: "custom", params: { ref: "B057" }, refCode: `import { createAirApp, Scene, GLTFLoader } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B057');
app.run(scene);
const load = async () => new GLTFLoader().parseAsync(await (await fetch('/assets/compressed.glb')).arrayBuffer(), '/');
const a = await load();
a.destroy();
const b = await load();
b.destroy();
` },
  { id: "B058", type: "runtime-control", category: "Compression", name: "rc-draco-instantiate", prompt: 'Use the runtime agent session: loadAsset "/assets/compressed.glb" then instantiateAsset under the scene root.', validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B058") },
  { id: "B059", type: "runtime-control", category: "Compression", name: "rc-capability-error-code", prompt: "Use the runtime agent session: attempt loadAsset on an invalid data URL and verify the stable LOAD_FAILED error code is returned, then finish successfully.", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B059") },
  { id: "B060", type: "source-create", category: "Compression", name: "quantization-mesh", prompt: 'Create src/main.ts: load "/assets/BoxTextured.glb" (KHR_mesh_quantization compatible) and render cleanly.', validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "custom", params: { ref: "B060" }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B060');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const asset = await new GLTFLoader().parseAsync(await (await fetch('/assets/BoxTextured.glb')).arrayBuffer(), '/');
scene.addChild(asset.instantiate().root);
frameObject(camera, scene);
` },
  // ---- B063-B070：Animation / Skeleton 补充 ----
  { id: "B063", type: "source-create", category: "Animation", name: "animation-component-source", prompt: "Create src/main.ts: add an Animation component to a cube node (clips may be empty); inspectScene must see the Animation component.", validators: ["scene-ready", "animation-playing", "no-runtime-error"], template: "scene-cubes", params: { cubes: [{ name: "animated", pos: [0, 0, 0] }], extra: 'const animated = scene.getChildByName("animated")!;\nanimated.addComponent(Animation);' } },
  { id: "B064", type: "source-create", category: "Skeleton", name: "skinned-simple-skin", prompt: 'Create src/main.ts: load "/assets/SimpleSkin.gltf" (served by the fixture) with GLTFLoader, instantiate the skinned model, and render a frame.', validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "custom", params: { ref: "B064" }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B064');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const asset = await new GLTFLoader().parseAsync(await (await fetch('/assets/SimpleSkin.gltf')).text(), '/assets/');
scene.addChild(asset.instantiate().root);
frameObject(camera, scene);
` },
  { id: "B065", type: "source-create", category: "Animation", name: "morph-cube-load", prompt: 'Create src/main.ts: load "/assets/AnimatedMorphCube.glb", instantiate the morph cube, and render without errors.', validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "custom", params: { ref: "B065" }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B065');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const asset = await new GLTFLoader().parseAsync(await (await fetch('/assets/AnimatedMorphCube.glb')).arrayBuffer(), '/');
scene.addChild(asset.instantiate().root);
frameObject(camera, scene);
` },
  { id: "B066", type: "runtime-control", category: "Animation", name: "rc-anim-two-nodes", prompt: "Use the runtime agent session: create nodes anim-a and anim-b, attach Animation to both, then inspectScene for the Animation count.", validators: ["scene-ready", "animation-playing", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B066") },
  { id: "B067", type: "runtime-control", category: "Skeleton", name: "rc-skin-instantiate", prompt: 'Use the runtime agent session: loadAsset "/assets/SimpleSkin.gltf" (skinned) then instantiateAsset under the scene root.', validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B067") },
  { id: "B068", type: "source-create", category: "Animation", name: "tween-rotation", prompt: "Create src/main.ts: rotate a cube continuously using a Component whose update() advances euler.y; the scene runs error-free.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "spinner", pos: [0, 0, 0] }] } },
  { id: "B069", type: "runtime-control", category: "Animation", name: "rc-animation-whitelist-guard", prompt: "Use the runtime agent session: confirm that addComponent with a non-whitelisted type returns INVALID_ARGUMENT (stable error), then finish normally.", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B069") },
  { id: "B070", type: "source-create", category: "Skeleton", name: "skinned-skeleton-components", prompt: 'Create src/main.ts: load "/assets/SimpleSkin.gltf" and confirm the instantiated tree contains a SkinnedMeshRenderer (log it); render without errors.', validators: ["scene-ready", "no-runtime-error"], template: "custom", params: { ref: "B070" }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, SkinnedMeshRenderer, GLTFLoader } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B070');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
app.run(scene);
const asset = await new GLTFLoader().parseAsync(await (await fetch('/assets/SimpleSkin.gltf')).text(), '/assets/');
const instance = asset.instantiate();
scene.addChild(instance.root);
const skinned = instance.root.getComponentsInChildren(SkinnedMeshRenderer);
console.log('[B070] skinned renderers:', skinned.length);
` },
  { id: "B071", type: "source-create", category: "Advanced Materials", name: "unlit-material-cube", prompt: "Create src/main.ts: a cube with the builtin-unlit material (no lighting dependency); it must be visible without any light in the scene.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "unlit", pos: [0, 0, 0] }], light: { kind: "none" }, material: "builtin-unlit-material" } },
  { id: "B072", type: "source-create", category: "Advanced Materials", name: "metallic-roughness-cube", prompt: "Create src/main.ts: a cube with standard material under a directional light; visible, no errors.", validators: ["scene-ready", "material-property", "no-runtime-error", "visible-frame"], validatorParams: { "material-property": { min: 1 } }, template: "scene-cubes", params: { cubes: [{ name: "metal", pos: [0, 0, 0] }] } },
  { id: "B073", type: "source-create", category: "Advanced Materials", name: "two-cube-contrast", prompt: "Create src/main.ts: a bright cube and a dark cube side by side using standard materials; both visible, no errors.", validators: ["scene-ready", "node-count", "no-runtime-error"], validatorParams: { "node-count": { equals: 5 } }, template: "scene-cubes", params: { cubes: [{ name: "bright", pos: [-1.5, 0, 0] }, { name: "dark", pos: [1.5, 0, 0] }] } },
  { id: "B074", type: "source-create", category: "Advanced Materials", name: "alpha-blend-cube", prompt: "Create src/main.ts: a cube using builtin-transparent material blended over a solid cube behind it; render without errors and the front cube visible.", validators: ["scene-ready", "node-count", "no-runtime-error", "visible-frame"], validatorParams: { "node-count": { equals: 5 } }, template: "scene-cubes", params: { cubes: [{ name: "solid", pos: [0, 0, -0.6] }, { name: "glassy", pos: [0, 0, 0] }], material: "builtin-transparent-material" } },
  { id: "B075", type: "runtime-control", category: "Advanced Materials", name: "rc-material-inspect", prompt: "Use the runtime agent session: create a node with MeshRenderer, then inspectAsset for Material counts.", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B075") },
  { id: "B076", type: "source-create", category: "Advanced Materials", name: "emissive-look-cube", prompt: "Create src/main.ts: an emissive-look cube using the builtin unlit material with a bright color under no light; visible, no errors.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "emissive", pos: [0, 0, 0] }], light: { kind: "none" }, material: "builtin-unlit-material" } },
  { id: "B077", type: "runtime-control", category: "Advanced Materials", name: "rc-material-two-nodes", prompt: "Use the runtime agent session: create two nodes mat-a and mat-b each with MeshRenderer; inspectScene reports 2 MeshRenderers.", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B077") },
  { id: "B078", type: "source-create", category: "Advanced Materials", name: "cubes-material-variant-row", prompt: "Create src/main.ts: a row of three cubes each with its own Material instance (independent instances, not shared); inspectable via material count.", validators: ["scene-ready", "material-property", "no-runtime-error"], validatorParams: { "material-property": { min: 3 } }, template: "scene-cubes", params: { cubes: [{ name: "m1", pos: [-2, 0, 0] }, { name: "m2", pos: [0, 0, 0] }, { name: "m3", pos: [2, 0, 0] }], independentMaterials: true } },
  { id: "B079", type: "source-create", category: "Advanced Materials", name: "texture-cube-boxtextured", prompt: 'Create src/main.ts: load "/assets/BoxTextured.glb" (texture map) and render it centered; visible, no errors.', validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "custom", params: { ref: "B079" }, refCode: `import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B079');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
const asset = await new GLTFLoader().parseAsync(await (await fetch('/assets/BoxTextured.glb')).arrayBuffer(), '/');
scene.addChild(asset.instantiate().root);
frameObject(camera, scene);
app.run(scene);
` },
  { id: "B080", type: "runtime-control", category: "Advanced Materials", name: "rc-material-ids-stable", prompt: "Use the runtime agent session: create a node with MeshRenderer, inspect it twice, and confirm the component id is stable across inspections; finish.", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B080") },
  // ---- B083-B090：Input / Interaction 补充 ----
  { id: "B083", type: "runtime-control", category: "Interaction", name: "rc-multi-node-transform", prompt: "Use the runtime agent session: create nodes i1, i2, i3 and set distinct positions; inspect all three back.", validators: ["scene-ready", "node-count", "no-runtime-error"], validatorParams: { "node-count": { min: 4 } }, template: "rc-app", params: {}, refCode: rcApp("B083") },
  { id: "B084", type: "runtime-control", category: "Interaction", name: "rc-world-vs-local", prompt: "Use the runtime agent session: create a node and set local position (0, 1, 0) then world position (2, 0, 0); inspect world position equals (2, 0, 0).", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B084") },
  { id: "B085", type: "source-create", category: "Input", name: "keyboard-listener-min", prompt: "Create src/main.ts: register input.on(Input.EventType.KEY_DOWN) to log key presses and keep the scene running error-free.", validators: ["scene-ready", "no-runtime-error"], template: "custom", params: { ref: "B085" }, refCode: `import { createAirApp, Scene, input, Input } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B085');
input.on(Input.EventType.KEY_DOWN, (event) => { console.log('[B085] key', event.keyCode); });
app.run(scene);
` },
  { id: "B086", type: "source-create", category: "Input", name: "pointer-events-min", prompt: "Create src/main.ts: register TOUCH_START and MOUSE_DOWN handlers that log; scene runs error-free.", validators: ["scene-ready", "no-runtime-error"], template: "custom", params: { ref: "B086" }, refCode: `import { createAirApp, Scene, input, Input } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B086');
input.on(Input.EventType.TOUCH_START, () => console.log('[B086] touch'));
input.on(Input.EventType.MOUSE_DOWN, () => console.log('[B086] mouse'));
app.run(scene);
` },
  { id: "B087", type: "runtime-control", category: "Interaction", name: "rc-destroy-created", prompt: "Use the runtime agent session: create a node named rc-gone, then confirm a dispatch to a bogus id returns STALE_TARGET (stable code), then finish.", validators: ["scene-ready", "node-exists", "no-runtime-error"], validatorParams: { "node-exists": { name: "rc-gone" } }, template: "rc-app", params: {}, refCode: rcApp("B087") },
  { id: "B088", type: "runtime-control", category: "Interaction", name: "rc-request-id-reuse", prompt: "Use the runtime agent session: send the same requestId twice (second must be rejected INVALID_ARGUMENT), then finish.", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B088") },
  { id: "B089", type: "source-create", category: "Interaction", name: "wheel-zoom-camera", prompt: "Create src/main.ts: register MOUSE_WHEEL to move the camera z within [3, 20]; scene runs error-free.", validators: ["scene-ready", "no-runtime-error"], template: "custom", params: { ref: "B089" }, refCode: `import { createAirApp, Scene, Camera, Node, Layers, input, Input, Vec3 } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B089');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 0, 8));
cameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT;
input.on(Input.EventType.MOUSE_WHEEL, (event) => {
    const z = Math.min(20, Math.max(3, cameraNode.position.z + event.getScrollY() * -0.01));
    cameraNode.setPosition(new Vec3(0, 0, z));
});
app.run(scene);
` },
  { id: "B090", type: "source-create", category: "Interaction", name: "touch-drag-rotate", prompt: "Create src/main.ts: rotate a cube while a pointer drag is active (TOUCH_MOVE events); scene runs error-free.", validators: ["scene-ready", "no-runtime-error"], template: "custom", params: { ref: "B090" }, refCode: `import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, input, Input, Vec3, utils, primitives, builtinResMgr } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B090');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.setRotationFromEuler(-15, 0, 0);
cameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);
const cube = new Node('cube');
cube.layer = Layers.Enum.DEFAULT;
scene.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
renderer.material = builtinResMgr.get('builtin-standard-material');
let dragging = false;
input.on(Input.EventType.TOUCH_START, () => { dragging = true; });
input.on(Input.EventType.TOUCH_MOVE, () => { if (dragging) { cube.setRotationFromEuler(0, 1, 0); } });
input.on(Input.EventType.TOUCH_END, () => { dragging = false; });
app.run(scene);
` },
  // ---- B096-B099：Agent / Runtime Feedback 补充 ----
  { id: "B096", type: "runtime-control", category: "Agent", name: "rc-many-nodes", prompt: "Use the runtime agent session: create ten nodes rc-n0..rc-n9 and confirm nodeCount increased by at least 10.", validators: ["scene-ready", "node-count", "no-runtime-error"], validatorParams: { "node-count": { min: 11 } }, template: "rc-app", params: {}, refCode: rcApp("B096") },
  { id: "B097", type: "runtime-control", category: "Agent", name: "rc-inspect-twice-stable", prompt: "Use the runtime agent session: create a node, inspectScene twice, and confirm the node id is identical across inspections (stable ID contract).", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B097") },
  { id: "B098", type: "runtime-control", category: "Agent", name: "rc-stale-target", prompt: "Use the runtime agent session: confirm that a dispatch to a bogus target returns STALE_TARGET (stable code), then finish.", validators: ["scene-ready", "no-runtime-error"], template: "rc-app", params: {}, refCode: rcApp("B098") },
  { id: "B099", type: "source-create", category: "Agent", name: "scene-stats-report", prompt: "Create src/main.ts: after bootstrapping a cube scene, log a one-line scene summary (renderer count) using the cocosair APIs; scene runs error-free.", validators: ["scene-ready", "no-runtime-error", "visible-frame"], template: "scene-cubes", params: { cubes: [{ name: "cube", pos: [0, 0, 0] }], extra: "console.log('[B099] renderers:', scene.getComponentsInChildren(MeshRenderer).length);" } }
];
function buildCatalog() {
  const specs = /* @__PURE__ */ new Map();
  const refCodes = /* @__PURE__ */ new Map();
  const byId = /* @__PURE__ */ new Map();
  for (const golden of GOLDEN10) {
    byId.set(golden.id, golden);
    specs.set(golden.id, { template: "golden", params: {} });
  }
  let n = 0;
  for (const row of ROWS) {
    if (byId.has(row.id)) {
      throw new Error("duplicate id in catalog: " + row.id);
    }
    const def2 = {
      id: row.id,
      version: "1.0.0",
      name: row.name,
      benchmarkType: row.type,
      category: row.category,
      difficulty: row.difficulty ?? "basic",
      prompt: row.prompt,
      startingFixture: `fixtures/${row.id}`,
      ...row.type === "runtime-control" ? { referenceOperations: [] } : { referenceImplementation: `${row.id}.main.ts` },
      writablePaths: ["src"],
      readablePaths: ["docs-agent"],
      protectedPaths: ["protected"],
      allowedTools: ["read-file", "write-file", "patch-file", "run-command", "request-runtime-inspection", "request-frame-capture", "request-error-report", "finish"],
      allowedCommands: [{ command: "node", allowAnyArgs: false }, { command: "npm", allowAnyArgs: false }],
      allowedNetworkHosts: [],
      knowledgeProfile: "K2",
      validators: row.validators,
      validatorParams: row.validatorParams ?? {},
      visualValidators: [],
      capabilityRequirements: ["webgl2"],
      browserRequirements: "chromium>=100",
      repairBudget: 5,
      timeBudgetMs: 20 * 6e4,
      expectedStates: {},
      tags: ["catalog100"]
    };
    if (row.type === "runtime-control") {
      def2.referenceOperations = deriveRcOps(def2);
    }
    byId.set(row.id, def2);
    specs.set(row.id, { template: row.template, params: row.params });
    if (row.refCode) {
      refCodes.set(row.id, row.refCode);
    }
    n++;
  }
  void n;
  return { benchmarks: Array.from(byId.values()), specs, refCodes };
}
var built = buildCatalog();
function deriveRcOps(def2) {
  const ops = [{ op: "inspectScene" }];
  const params = def2.validatorParams ?? {};
  const p = params["node-exists"];
  if (p?.name) {
    ops.push({ op: "dispatch", requestId: def2.id + "-create", action: "createNode", targetId: "node-1", params: { name: p.name } });
  }
  const anim = def2.validators.includes("animation-playing");
  if (anim && !p?.name) {
    ops.push({ op: "dispatch", requestId: def2.id + "-anim", action: "createNode", targetId: "node-1", params: { name: "anim-node" } });
    ops.push({ op: "dispatch", requestId: def2.id + "-anim-add", action: "addComponent", targetId: "node-2", params: { component: "Animation" } });
  } else if (anim) {
    ops.push({ op: "dispatch", requestId: def2.id + "-anim-add", action: "addComponent", targetId: "node-2", params: { component: "Animation" } });
  }
  const mesh = def2.validators.includes("material-property") || def2.validators.includes("asset-loaded");
  if (mesh) {
    ops.push({ op: "dispatch", requestId: def2.id + "-m1", action: "createNode", targetId: "node-1", params: { name: "rc-mesh-a" } });
    ops.push({ op: "dispatch", requestId: def2.id + "-m1-add", action: "addComponent", targetId: "node-3", params: { component: "MeshRenderer" } });
    ops.push({ op: "dispatch", requestId: def2.id + "-m2", action: "createNode", targetId: "node-1", params: { name: "rc-mesh-b" } });
    ops.push({ op: "dispatch", requestId: def2.id + "-m2-add", action: "addComponent", targetId: "node-4", params: { component: "MeshRenderer" } });
  }
  const count = params["node-count"];
  if (count?.min) {
    const need = count.min - 1;
    for (let i = 0; i < need; i++) {
      ops.push({ op: "dispatch", requestId: `${def2.id}-bulk-${i}`, action: "createNode", targetId: "node-1", params: { name: `rc-bulk-${i}` } });
    }
  }
  ops.push({ op: "inspectScene" });
  return ops;
}
var CATALOG_BENCHMARKS = built.benchmarks;
var SPECS = built.specs;
var REF_CODES = built.refCodes;
var CATALOG100 = { revision: "catalog100-r1", benchmarks: CATALOG_BENCHMARKS };
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CATALOG100,
  CATALOG_BENCHMARKS,
  GOLDEN_REVISION,
  REF_CODES,
  SPECS,
  deriveRcOps
});
