import { createAirApp, Scene, Camera, DirectionalLight, Node, Layers, GLTFLoader, frameObject } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
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
app.run(scene);
