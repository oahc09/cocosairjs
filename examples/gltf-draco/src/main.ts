import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('gltf-draco');
(window as any).__airApp = app;
app.run(scene);
console.log('[gltf-draco] running');