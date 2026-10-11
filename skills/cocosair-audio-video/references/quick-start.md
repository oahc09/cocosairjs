Derived from the cocosair-audio-video skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, Color, Vec3, AudioService } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist first
const scene = new Scene('av-demo');
const camNode = new Node('Main Camera'); scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 1.6, 4));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.near = 0.1; camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(20, 24, 34, 255);
app.run(scene);                        // async render loop: frames land on later ticks

const audio = new AudioService(scene);           // one service per scene
let ready = false;
audio.load('bgm', './assets/music.mp3').then(() => { ready = true; });   // load early, play on gesture

// Autoplay policy bans sound before a user gesture: start playback inside the click handler.
document.addEventListener('click', () => {
    if (!ready) { return; }            // clip not decoded yet: retry on the next click
    audio.setBgmVolume(0.6);           // [0,1]; throws AIR_E_AUDIO_VOLUME otherwise
    audio.playBgm('bgm');              // synchronous call within the gesture
}, { once: false });

let last = -1; const head = setInterval(() => {
    const state = audio.bgmState();    // { id, playing, currentTime, loop, volume }
    if (state) {                       // evidence = measured currentTime advancing, not playing=true
        console.log('bgm head', state.currentTime.toFixed(2), 's, dropped sfx', audio.sfxDropped);
        if (state.currentTime > last && last >= 0) { clearInterval(head); }
        last = state.currentTime;
    }
}, 250);

function teardown() {                  // cleanup runs on page teardown, never inline after app.run()
    clearInterval(head);
    audio.dispose();                   // stops every channel and destroys its AudioSource nodes
}
</script>
```
