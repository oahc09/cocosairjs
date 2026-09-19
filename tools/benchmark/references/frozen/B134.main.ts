import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Animation, AnimationClip, Component, PointLight, Layers, Vec3, Color, Material, Texture2D, ImageAsset, tween, utils, primitives, GLTFLoader, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B134');

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
}
console.log('[B134] stress scene running, nodeCount =', scene.children.length);
