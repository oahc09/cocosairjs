import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('camera-ortho');
(window as any).__airApp = app;
app.run(scene);
console.log('[camera-ortho] running');