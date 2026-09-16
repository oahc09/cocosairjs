import { createAirApp, Scene, input, Input } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B086');
input.on(Input.EventType.TOUCH_START, () => console.log('[B086] touch'));
input.on(Input.EventType.MOUSE_DOWN, () => console.log('[B086] mouse'));
app.run(scene);
