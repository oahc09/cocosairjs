import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('texture-basic');
(window as any).__airApp = app;
app.run(scene);
console.log('[texture-basic] running');