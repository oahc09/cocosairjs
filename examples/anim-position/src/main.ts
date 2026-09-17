import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('anim-position');
(window as any).__airApp = app;
app.run(scene);
console.log('[anim-position] running');