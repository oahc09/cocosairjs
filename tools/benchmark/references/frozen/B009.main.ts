import { createAirApp, Scene, Node, MeshRenderer, Material, Animation, Camera, DirectionalLight, Layers, Vec3, Color, utils, primitives, builtinResMgr } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('catalog');
const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 3, 9));
cameraNode.setRotationFromEuler(-18, 0, 0);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;
function spawnCube (name: string, pos: number[], scale?: number[]): void {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(pos[0], pos[1], pos[2]));
    if (scale) { node.setScale(new Vec3(scale[0], scale[1], scale[2])); }
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
    renderer.material = builtinResMgr.get<import('cocosair').Material>('builtin-standard-material');
}
spawnCube("l1", [0, 0, 0]);
spawnCube("l2", [0, 0, 0]);
spawnCube("l3", [0, 1, 0]);

const l1 = scene.getChildByName("l1")!; const l2 = scene.getChildByName("l2")!; const l3 = scene.getChildByName("l3")!;
l2.parent = l1; l3.parent = l2;

app.run(scene);
