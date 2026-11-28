# Optional WebGL2 startup viewer

Choose the viewer when a browser page needs a code-first 3D scene or a glTF
viewer, not the full engine feature set. Use the
[isolated build commands](../reference/npm-scripts.md#optional-webgl2-startup-viewer)
and serve the resulting ESM artifact. The existing default npm entry and its
declarations still describe the full engine.

```js
import { createAirApp, Scene, Node, Camera, GLTFLoader } from './cocosair.viewer.min.mjs';

const app = await createAirApp({ canvas: '#GameCanvas', renderer: 'webgl2' });
const scene = new Scene('Viewer');
const camera = new Node('Camera');
scene.addChild(camera);
camera.setPosition(0, 0, 5);
camera.addComponent(Camera);
scene.addChild((await new GLTFLoader().loadAsync('./model.glb')).instantiate().root);
app.run(scene);
```

The profile keeps the legacy pipeline, basic scene and mesh APIs, glTF material
and decoding code, animation and skinning. It removes entry roots for the custom
pipeline and post-processing, external physics backends, UI and browser media
components, workers, and 2D skeletal middleware. Shared dependencies needed by
retained code may still be present. The viewer accepts only WebGL2 and rejects
explicit alternative renderer/physics options; use the full SDK for them or for
custom pipeline settings. Both native physics registries retain
lightweight builtin defaults, not Cannon or Box2D. Compressed glTF assets still require any decoder
sidecars configured by the application; this profile does not copy or package them.

Select one build before importing or booting the engine. Do not import both
generated modules into one document or treat this artifact as an in-place upgrade
to the full runtime; they each contain Cocos engine classes and singleton state.

Run the native extension-material/scene release proof after building the full
and viewer bundles. The browser command requires a Playwright installation;
use `NODE_PATH` and `AIR_CHROMIUM_PATH` to supply it and the browser binary if
not installed in this checkout.

```sh
node tools/verify/startup-viewer-browser.cjs build/cocosair.module.min.js /absolute/path/to/air-viewer/cocosair.viewer.min.mjs
```

Performance claims should compare the same assets and output in both builds.
First-draw callbacks do not measure display presentation, and a software WebGL2
result is not a hardware result.
