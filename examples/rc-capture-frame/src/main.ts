import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('rc-capture-frame');
(window as any).__airApp = app;
app.run(scene);
console.log('[rc-capture-frame] running');