/**
 * V0.6 §8 — Golden 10 Reference Implementations（冻结；Agent 不可读/不可写）。
 * Runner 物化到 trial 的 protected/ 下并做 SHA-256 台账。
 */
export const REFERENCES: Record<string, string> = {};

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
renderer.material = builtinResMgr.get<import('cocosair').Material>('builtin-standard-material');
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
    renderer.material = builtinResMgr.get<import('cocosair').Material>('builtin-standard-material');
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
material.initialize({ effectName: 'builtin-standard', defines: { USE_BASE_COLOR: true } });
renderer.material = material;
renderer.material = builtinResMgr.get<import('cocosair').Material>('builtin-standard-material');
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
renderer.material = builtinResMgr.get<import('cocosair').Material>('builtin-standard-material');
(window as unknown as { __airApp: unknown }).__airApp = app;
app.run(scene);
`;
