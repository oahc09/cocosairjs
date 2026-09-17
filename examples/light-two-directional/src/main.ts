import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('light-two-directional');
(window as any).__airApp = app;
app.run(scene);
console.log('[light-two-directional] running');