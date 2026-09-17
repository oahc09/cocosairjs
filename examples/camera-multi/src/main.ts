import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('camera-multi');
(window as any).__airApp = app;
app.run(scene);
console.log('[camera-multi] running');