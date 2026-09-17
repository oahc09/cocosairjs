import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('light-spot');
(window as any).__airApp = app;
app.run(scene);
console.log('[light-spot] running');