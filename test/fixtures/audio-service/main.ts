import { createAirApp, AudioService, Scene } from '../../../build/cocosair.module.js';
const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('Audio service'); app.run(scene);
const service = new AudioService(scene);
await service.load('a', '/examples/audio-basic/assets/tone.wav');
await service.load('b', '/examples/audio-basic/assets/tone.wav?second');
service.setBgmVolume(0.35);
let gesture = () => service.playBgm('a');
app.canvas.addEventListener('mouseup', () => { const action = gesture; gesture = () => {}; action(); });
(window as any).__audioServiceProbe = {
    ready: true, state: () => service.bgmState(), pause: () => service.pauseBgm(), stop: () => service.stopBgm(),
    resume: () => { gesture = () => service.resumeBgm(); }, volume: (value) => service.setBgmVolume(value),
    switch: () => { gesture = () => service.playBgm('b'); }, dispose: () => { service.dispose(); return service.bgmState(); },
};
