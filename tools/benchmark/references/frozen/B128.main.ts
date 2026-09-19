import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Animation, AnimationClip, Component, PointLight, Layers, Vec3, Color, Material, Texture2D, ImageAsset, tween, utils, primitives, GLTFLoader, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B128');

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


class IdleSpin extends Component {
    update (dt: number): void { this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 30, 0); }
}
for (let i = 0; i < 100; i++) {
    const node = spawn('anim-' + i, (i % 10) * 1.5 - 6.75, 0, Math.floor(i / 10) * 1.5 - 6.75);
    node.addComponent(Animation);
    if (i === 0) { node.addComponent(IdleSpin); }
}
console.log('[B128] stress scene running, nodeCount =', scene.children.length);
