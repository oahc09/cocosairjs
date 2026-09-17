import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('node-active');
(window as any).__airApp = app;
app.run(scene);
console.log('[node-active] running');