import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Animation, AnimationClip, Component, PointLight, Layers, Vec3, Color, Material, Texture2D, ImageAsset, tween, utils, primitives, GLTFLoader, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B123');

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
}
console.log('[B123] stress scene running, nodeCount =', scene.children.length);
