Derived from the cocosair-gltf skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, Vec3, Color, frameObject,
         GLTFLoader, createMeshoptDecoder } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const scene = new Scene('gltf');
const camNode = new Node('Main Camera');
scene.addChild(camNode); camNode.setPosition(new Vec3(0, 1.6, 5)); camNode.setRotationFromEuler(-12, 0, 0);
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45; camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(30, 40, 60, 255);
const lightNode = new Node('Main Light');
scene.addChild(lightNode); lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight).illuminance = 50000;
// 1) decoders are never bundled; build the URL at runtime so no bundler resolves it statically
const decoderUrl = '/build/gltf-decoders' + '/meshopt/meshopt_decoder.mjs';
const decoderModule = await import(/* @vite-ignore */ decoderUrl);
const loader = new GLTFLoader();
loader.setMeshoptDecoder(createMeshoptDecoder(decoderModule.MeshoptDecoder));   // returns this, chainable
// 2) ask before you load; status is a function of what you just injected
for (const e of loader.getExtensionSupport()) if (e.status !== 'supported') console.warn(e.name, e.status, e.reason ?? '');
// 3) load, instantiate, frame; parseAsync(bytes, baseUrl) is the in-memory twin
const asset = await loader.loadAsync('./assets/meshopt-khr.glb');
console.log(asset.sceneNames, asset.meshes.length, asset.animations.length, asset.warnings);
const instance = asset.instantiate(0);
scene.addChild(instance.root); frameObject(camera, instance.root);
instance.setAnimationLoop(true, instance.animations[0]?.name);   // per-instance wrap; shared clips untouched
app.run(scene);   // async render loop; first frame draws on a later tick, so never free synchronously here
// 4) release LATER (on teardown): instance first, then asset - freeing now blanks the screen before frame 1
function teardown() { instance.dispose(); asset.destroy(); }  // dispose=stop+deactivate+destroy root; destroy defers GPU release to NODE_DESTROYED
</script>
```
