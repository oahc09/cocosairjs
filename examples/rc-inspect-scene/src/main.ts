import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('rc-inspect-scene');
(window as any).__airApp = app;
app.run(scene);
console.log('[rc-inspect-scene] running');