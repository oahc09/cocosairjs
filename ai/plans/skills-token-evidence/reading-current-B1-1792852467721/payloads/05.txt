Derived from the cocosair-rendering skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material,
         Vec3, primitives, utils, createAirRenderTarget, inspectAirDirectionalLights } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });  // #GameCanvas must exist before this import
const scene = new Scene('Main');
const camNode = new Node('Main');
scene.addChild(camNode); camNode.setPosition(new Vec3(0, 3, 8)); camNode.lookAt(new Vec3(0, 1, 0));
const camera = camNode.addComponent(Camera);
const keyNode = new Node('Key');
scene.addChild(keyNode); keyNode.setPosition(new Vec3(0, 8, 6)); keyNode.lookAt(new Vec3(0, 0, 0));
const key = keyNode.addComponent(DirectionalLight);          // the last activated directional becomes renderScene.mainLight
key.illuminance = 12000;                                     // Lux on the HDR slot, default 65000
scene.globals.shadows.enabled = true;                        // shadow switch 1 of 4
scene.globals.shadows.type = 1;                              // switch 2: ShadowMap, the default is Planar
key.shadowEnabled = true;                                    // switch 3: per light
const boxNode = new Node('Box');
scene.addChild(boxNode); boxNode.setPosition(new Vec3(0, 1, 0));
const renderer = boxNode.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
renderer.material = material;
renderer.shadowCastingMode = MeshRenderer.ShadowCastingMode.ON;   // switch 4: the default is OFF
const shotNode = new Node('Offscreen');                      // a camera aimed at a target stops drawing to the canvas
scene.addChild(shotNode); shotNode.setPosition(new Vec3(4, 3, 8)); shotNode.lookAt(new Vec3(0, 1, 0));
const shotCamera = shotNode.addComponent(Camera);            // the on-screen camera keeps its own output
const shot = createAirRenderTarget({ width: 512, height: 512, samples: 4, sampleFallback: 'lower' });
const detach = shot.attachCamera(shotCamera);                // resolves MSAA when that camera ends
app.run(scene);   // async render loop; the first frame draws on a later tick, so never dispose the offscreen target synchronously here
console.log(shot.info.effective, shot.info.requested);       // only info shows what the device granted (readable synchronously)
console.log(inspectAirDirectionalLights(scene));             // { status, mainLight, lights[].effective }
// Release LATER (on teardown), never inline before frame 1: disposing first leaves the attached camera targeting a dead texture. dispose repeats safely.
function teardown() { detach(); shot.dispose(); }
</script>
```

Entry choice and the importmap alias are owned by [cocosair-project-setup](../../cocosair-project-setup/SKILL.md); `createAirApp` and `run` by [cocosair-application](../../cocosair-application/SKILL.md).
