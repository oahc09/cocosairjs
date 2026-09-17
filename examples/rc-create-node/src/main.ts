import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('rc-create-node');
(window as any).__airApp = app;
app.run(scene);
console.log('[rc-create-node] running');