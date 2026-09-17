import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('mesh-plane');
(window as any).__airApp = app;
app.run(scene);
console.log('[mesh-plane] running');