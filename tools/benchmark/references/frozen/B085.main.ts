import { createAirApp, Scene, input, Input } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B085');
input.on(Input.EventType.KEY_DOWN, (event) => { console.log('[B085] key', event.keyCode); });
app.run(scene);
