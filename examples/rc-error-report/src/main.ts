import { createAirApp, Scene } from 'cocosair';
var app = await createAirApp({ canvas: '#GameCanvas' });
var scene = new Scene('rc-error-report');
(window as any).__airApp = app;
app.run(scene);
console.log('[rc-error-report] running');