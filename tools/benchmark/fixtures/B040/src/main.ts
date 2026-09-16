import { createAirApp, Scene } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('B040');
(window as any).__airApp = app;
app.run(scene);
