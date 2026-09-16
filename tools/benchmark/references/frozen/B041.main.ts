import { createAirApp, Scene } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
(window as unknown as { __airApp: unknown }).__airApp = app;
const scene = new Scene('B003');
app.run(scene);
const response = await fetch('/assets/demo.txt');
const text = await response.text();
if (text.trim() !== 'demo-asset-content') { throw new Error('asset content mismatch: ' + text); }
console.log('[B003] asset loaded:', text);
