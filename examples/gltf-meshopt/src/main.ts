import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('gltf-meshopt');
(window as any).__airApp = app;
app.run(scene);
console.log('[gltf-meshopt] running');