import { createAirApp, Scene, isMeshoptAvailable } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B055');
console.log('[B055] meshopt available:', isMeshoptAvailable());
app.run(scene);
