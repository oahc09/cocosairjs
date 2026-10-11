Derived from the cocosair-animation-tween skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, Vec3, Color, Component,
         tween, Animation, AnimationClip, animation, createStepClock } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const scene = new Scene('anim');
const camNode = new Node('Main Camera'); scene.addChild(camNode);
camNode.setPosition(new Vec3(2.4, 3.0, 7.4)); camNode.lookAt(new Vec3(0, 1.3, 0));
const camera = camNode.addComponent(Camera);
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(18, 22, 30, 255);

const node = new Node('Dancer'); scene.addChild(node); node.setPosition(new Vec3(0.6, 1.0, 0));

// 1) code-first tween: one chain == one sequence; call is zero-duration, to interpolates
tween(node)
    .to(1.2, { position: new Vec3(2.2, 1.0, 0) })   // props are a plain object; no string-path form
    .to(0.8, { position: new Vec3(2.2, 2.2, 0) })
    .repeatForever()
    .start();                                        // start() registers the union with the ActionManager

// 2) code-first clip: track classes live ONLY under the `animation` namespace
const clip = new AnimationClip();
clip.name = 'orbit'; clip.duration = 2.0;
clip.wrapMode = AnimationClip.WrapMode.Loop;         // WrapMode is a static on AnimationClip
const track = new animation.VectorTrack();
track.path = new animation.TrackPath().toProperty('position');
track.channels()[0].curve.assignSorted([[0, 0], [1, 0.9], [2, 0]]);
clip.addTrack(track);
const anim = node.addComponent(Animation);
anim.defaultClip = clip;
class Starter extends Component {                    // play() before app.run gets reset by activation
    start() { anim.play(clip.name); }
}
node.addComponent(Starter);

app.run(scene);

// 3) deterministic stepping for evidence: pause the real clock, then step one frame at a time
const clock = createStepClock();                     // frameRate 60, stepTimeoutMs 2000 by default
clock.begin();                                       // game.pause(): stops rAF, render, business clock, audio
for (let i = 0; i < 90; i++) { await clock.step(1 / 60); }   // throws if the real clock is running
clock.end();                                         // game.resume()
</script>
```
