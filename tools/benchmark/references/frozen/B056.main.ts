import { createAirApp, Scene, isKTX2Available } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B056');
console.log('[B056] ktx2 available:', isKTX2Available(undefined));
app.run(scene);
