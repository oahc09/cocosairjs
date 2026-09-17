import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('material-unlit');
(window as any).__airApp = app;
app.run(scene);
console.log('[material-unlit] running');