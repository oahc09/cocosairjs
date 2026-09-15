import { createAirApp, Scene, GLTFLoader } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B008');
app.run(scene);
const response = await fetch('/assets/compressed.glb');
const bytes = await response.arrayBuffer();
const asset = await new GLTFLoader().parseAsync(bytes, '/');
const instance = asset.instantiate();
scene.addChild(instance.root);
