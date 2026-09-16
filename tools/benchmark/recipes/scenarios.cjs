// V0.6 — Recipe scenario source templates (pure JS).
var TS_NC = '// @ts-nocheck\n';

function cubeScene(id, cubes, extra) {
  var cubeCode = cubes.map(function(c) {
    return 'spawnCube(' + JSON.stringify(c.name) + ', [' + c.pos.join(', ') + ']' + (c.scale ? ', [' + c.scale.join(', ') + ']' : '') + ');';
  }).join('\n');
  return "import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, Color, utils, primitives, builtinResMgr } from 'cocosair';\n\nvar app = await createAirApp({ canvas: '#GameCanvas' });\n(window as any).__airApp = app;\nvar scene = new Scene('" + id + "');\nvar cameraNode = new Node('camera');\nscene.addChild(cameraNode);\ncameraNode.setPosition(new Vec3(0, 3, 9));\ncameraNode.setRotationFromEuler(-18, 0, 0);\nvar camera = cameraNode.addComponent(Camera);\ncamera.visibility = Layers.Enum.DEFAULT;\ncamera.clearFlags = Camera.ClearFlag.SOLID_COLOR;\ncamera.clearColor = new Color(30, 40, 60, 255);\nvar lightNode = new Node('light');\nscene.addChild(lightNode);\nlightNode.setPosition(new Vec3(0, 8, 0));\nlightNode.setRotationFromEuler(-45, -30, 0);\nvar light = lightNode.addComponent(DirectionalLight);\nlight.illuminance = 2;\n\nfunction spawnCube(name: string, pos: number[], scale?: number[]): void {\n    var node = new Node(name);\n    node.layer = Layers.Enum.DEFAULT;\n    node.setPosition(new Vec3(pos[0], pos[1], pos[2]));\n    if (scale) { node.setScale(new Vec3(scale[0], scale[1], scale[2])); }\n    scene.addChild(node);\n    var r = node.addComponent(MeshRenderer);\n    r.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));\n    r.material = builtinResMgr.get('builtin-standard-material');\n}\n\n" + cubeCode + "\n" + (extra || '') + "\napp.run(scene);\n";
}

function gltfScene(id, assetPath, instances) {
  instances = instances || 1;
  var instCode = '';
  if (instances === 1) instCode = 'scene.addChild(asset.instantiate().root);';
  else {
    for (var i = 0; i < instances; i++) {
      var x = (i - (instances - 1) / 2) * 3;
      instCode += 'var inst' + i + ' = asset.instantiate();\ninst' + i + '.root.setPosition(new Vec3(' + x + ', 0, 0));\nscene.addChild(inst' + i + '.root);\n';
    }
  }
  return "import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, Vec3, GLTFLoader, frameObject } from 'cocosair';\n\nvar app = await createAirApp({ canvas: '#GameCanvas' });\n(window as any).__airApp = app;\nvar scene = new Scene('" + id + "');\nvar cameraNode = new Node('camera');\nscene.addChild(cameraNode);\nvar camera = cameraNode.addComponent(Camera);\ncamera.visibility = Layers.Enum.DEFAULT;\nvar lightNode = new Node('light');\nscene.addChild(lightNode);\nlightNode.setRotationFromEuler(-45, -30, 0);\nlightNode.addComponent(DirectionalLight);\napp.run(scene);\nvar bytes = await (await fetch('" + assetPath + "')).arrayBuffer();\nvar asset = await new GLTFLoader().parseAsync(bytes, '/');\n" + instCode + "\nframeObject(camera, scene);\n";
}

function animScene(id) {
  return "import { createAirApp, Scene, Node, MeshRenderer, Animation, Camera, DirectionalLight, Layers, Vec3, utils, primitives, builtinResMgr } from 'cocosair';\n\nvar app = await createAirApp({ canvas: '#GameCanvas' });\n(window as any).__airApp = app;\nvar scene = new Scene('" + id + "');\nvar cameraNode = new Node('camera');\nscene.addChild(cameraNode);\ncameraNode.setPosition(new Vec3(0, 3, 9));\ncameraNode.setRotationFromEuler(-18, 0, 0);\ncameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT;\nvar lightNode = new Node('light');\nscene.addChild(lightNode);\nlightNode.setRotationFromEuler(-45, -30, 0);\nlightNode.addComponent(DirectionalLight);\nvar cube = new Node('animated-cube');\ncube.layer = Layers.Enum.DEFAULT;\nscene.addChild(cube);\nvar renderer = cube.addComponent(MeshRenderer);\nrenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));\nrenderer.material = builtinResMgr.get('builtin-standard-material');\nvar anim = cube.addComponent(Animation);\n(window as any).__spin = function() { cube.setRotationFromEuler(0, cube.eulerAngles.y + 5, 0); };\napp.run(scene);\n";
}

function inputScene(id) {
  return "import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, input, Input, Vec3, utils, primitives, builtinResMgr } from 'cocosair';\n\nvar app = await createAirApp({ canvas: '#GameCanvas' });\n(window as any).__airApp = app;\nvar scene = new Scene('" + id + "');\nvar cameraNode = new Node('camera');\nscene.addChild(cameraNode);\ncameraNode.setPosition(new Vec3(0, 3, 9));\ncameraNode.setRotationFromEuler(-18, 0, 0);\ncameraNode.addComponent(Camera).visibility = Layers.Enum.DEFAULT;\nvar lightNode = new Node('light');\nscene.addChild(lightNode);\nlightNode.setRotationFromEuler(-45, -30, 0);\nlightNode.addComponent(DirectionalLight);\nvar cube = new Node('interactive-cube');\ncube.layer = Layers.Enum.DEFAULT;\nscene.addChild(cube);\nvar r = cube.addComponent(MeshRenderer);\nr.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));\nr.material = builtinResMgr.get('builtin-standard-material');\nvar moved = false;\ninput.on(Input.EventType.KEY_DOWN, function() {\n    cube.setPosition(new Vec3(cube.position.x + 0.5, cube.position.y, cube.position.z));\n    moved = true;\n});\n(window as any).__interactionState = function() { return { moved: moved, pos: [cube.position.x, cube.position.y, cube.position.z] }; };\n(window as any).__simulateInput = function() { cube.setPosition(new Vec3(cube.position.x + 0.5, cube.position.y, cube.position.z)); moved = true; };\napp.run(scene);\n";
}

var SCENARIOS = {
  R001: { source: gltfScene('R001', '/assets/BoxTextured.glb'), hasInteraction: false, hasLifecycle: false },
  R002: { source: animScene('R002'), hasInteraction: false, hasLifecycle: false },
  R003: { source: inputScene('R003'), hasInteraction: true, hasLifecycle: false },
  R004: { source: gltfScene('R004', '/assets/BoxTextured.glb', 2), hasInteraction: false, hasLifecycle: false },
  R005: { source: cubeScene('R005', [{ name: 'red', pos: [-1.5, 0, 0] }, { name: 'blue', pos: [1.5, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R006: { source: gltfScene('R006', '/assets/BoxTextured.glb'), hasInteraction: false, hasLifecycle: true },
  R007: { source: inputScene('R007'), hasInteraction: true, hasLifecycle: false },
  R008: { source: cubeScene('R008', [{ name: 'part-a', pos: [-1, 0, 0] }, { name: 'part-b', pos: [1, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R009: { source: cubeScene('R009', [{ name: 'variant-a', pos: [-1.5, 0, 0] }, { name: 'variant-b', pos: [1.5, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R010: { source: gltfScene('R010', '/assets/BoxTextured.glb', 2), hasInteraction: false, hasLifecycle: false },
  R011: { source: cubeScene('R011', [{ name: 'target', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R012: { source: animScene('R012'), hasInteraction: false, hasLifecycle: false },
  R013: { source: cubeScene('R013', [{ name: 'cube', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R014: { source: cubeScene('R014', [{ name: 'cube', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R015: { source: cubeScene('R015', [{ name: 'cube', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R016: { source: animScene('R016'), hasInteraction: false, hasLifecycle: false },
  R017: { source: cubeScene('R017', [{ name: 'mat-cube', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R018: { source: inputScene('R018'), hasInteraction: true, hasLifecycle: false },
  R019: { source: cubeScene('R019', [{ name: 'selectable', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R020: { source: inputScene('R020'), hasInteraction: true, hasLifecycle: false },
  R021: { source: cubeScene('R021', [{ name: 'glass', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R022: { source: cubeScene('R022', [{ name: 'clearcoat', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R023: { source: cubeScene('R023', [{ name: 'transmission', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R024: { source: cubeScene('R024', [{ name: 'anisotropic', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R025: { source: cubeScene('R025', [{ name: 'iridescent', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R026: { source: animScene('R026'), hasInteraction: false, hasLifecycle: false },
  R027: { source: gltfScene('R027', '/assets/BoxTextured.glb'), hasInteraction: false, hasLifecycle: false },
  R028: { source: animScene('R028'), hasInteraction: false, hasLifecycle: false },
  R029: { source: cubeScene('R029', [{ name: 'weather-cube', pos: [0, 0, 0] }]), hasInteraction: false, hasLifecycle: false },
  R030: { source: inputScene('R030'), hasInteraction: true, hasLifecycle: true },
};

module.exports = { SCENARIOS: SCENARIOS };
