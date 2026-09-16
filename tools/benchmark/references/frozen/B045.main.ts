import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, Vec3, GLTFLoader, frameObject } from 'cocosair';

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
