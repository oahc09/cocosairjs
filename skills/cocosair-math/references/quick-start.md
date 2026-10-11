Derived from the cocosair-math skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, Vec3, Quat, Mat4, Color, math, easing, lerp, clamp01 } from 'cocosair'; // page alias, not the package name

const app = await createAirApp({ canvas: '#GameCanvas' }); // canvas must exist before this import
const scene = new Scene('Main');
const camNode = new Node('Main Camera');
scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 1.5, 5));
camNode.setRotationFromEuler(-15, 0, 0);   // DEGREES; composed by Quat.fromEuler in YZX order
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
const box = new Node('Box');
scene.addChild(box);

const scratch = new Vec3();                       // owned by this scope only, so in-place writes are safe
const dir = Vec3.normalize(scratch, Vec3.RIGHT);  // statics write the first argument; Vec3.RIGHT is only READ
const rot = new Quat();
const local = new Mat4();
Quat.fromEuler(rot, 0, 30, 0);                    // degrees in, quaternion out
Mat4.fromSRT(local, rot, scratch, Vec3.ONE);      // scale -> rotation -> translation, i.e. out = T * R * S
box.matrix = local;                               // the Node.matrix setter decomposes it back with Mat4.toSRT

const tint = new Color(255, 128, 0, 255);         // channels are 0-255 bytes, not 0-1 floats
tint.fromHEX('#ff8000');
console.log(tint.toCSS('rgba'));                  // "rgba(255,128,0,1.00)"

const y = lerp(0, 2, easing.cubicInOut(clamp01(0.5))); // easing is a top-level namespace, not math.ease*
box.setPosition(dir.x * 2, y, dir.z);
console.assert(math.equals(y, 1), 'midpoint of the cubic curve maps to the midpoint of the range');

app.run(scene);
</script>
```

Entry choice, the importmap alias and the install are owned by [cocosair-project-setup](../../cocosair-project-setup/SKILL.md); `createAirApp`/`run` by [cocosair-application](../../cocosair-application/SKILL.md).
