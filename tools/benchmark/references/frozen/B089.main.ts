import { createAirApp, Scene, Camera, Node, Layers, input, Input, Vec3 } from 'cocosair';

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
