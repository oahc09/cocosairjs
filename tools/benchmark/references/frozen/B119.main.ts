import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Animation, AnimationClip, Component, PointLight, Layers, Vec3, Color, Material, Texture2D, ImageAsset, tween, utils, primitives, GLTFLoader, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B119');

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
frameObject(camera, wave);
console.log('[B119] stress scene running, nodeCount =', scene.children.length);
