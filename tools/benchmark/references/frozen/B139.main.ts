import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, Color, utils, primitives, GLTFLoader } from 'cocosair';

// __proto__ key in JSON
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B139');

const cameraNode = new Node('camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.4, 6.5));
cameraNode.setRotationFromEuler(-20, 0, 0);
const camera = cameraNode.addComponent(Camera);
camera.visibility = Layers.Enum.DEFAULT;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
const lightNode = new Node('light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight);

// 地面参考物：即使加载失败，场景也有可渲染内容（scene-ready 语义）
const ground = new Node('ground');
ground.layer = Layers.Enum.DEFAULT;
scene.addChild(ground);
const groundRenderer = ground.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 6, length: 6, widthSegments: 1, lengthSegments: 1 }));

app.run(scene);

// 受控加载：引擎必须以稳定错误拒绝（而非崩溃/未捕获异常）。app.run 先行：即使敌意请求挂起，场景也保持 Ready。
let outcome = 'loaded';
try {
    const url = '/assets/proto-pollution.gltf';
    const asset = url.endsWith('.glb')
        ? await new GLTFLoader().parseAsync(await (await fetch(url)).arrayBuffer(), '/')
        : await new GLTFLoader().parseAsync(await (await fetch(url)).text(), '/');
    scene.addChild(asset.instantiate().root);
    console.log('[B139] hostile asset parsed:', asset.warnings.length, 'warnings');
} catch (error) {
    const code = (error as { code?: string }).code ?? 'UNKNOWN';
    outcome = 'rejected:' + code;
    console.log('[B139] stable rejection, code =', code);
}
(window as unknown as { __airOutcome: string }).__airOutcome = outcome;

const polluted = ({} as Record<string, unknown>).hasOwnProperty('spam');
console.log('[B139] prototype pollution check:', polluted ? 'POLLUTED' : 'clean');
