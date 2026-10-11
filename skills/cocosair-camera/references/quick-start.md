Derived from the cocosair-camera skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, MeshRenderer, Material, Layers, Vec3, Color, primitives, utils, frameObject } from 'cocosair'; // page alias, not the package name

const app = await createAirApp({ canvas: '#GameCanvas' }); // canvas must exist before this import
const scene = new Scene('Main');

const camNode = new Node('Main Camera');
scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 2.2, 6.5));
camNode.lookAt(new Vec3(0, 0.6, 0));              // orientation follows the node; lookAt once at this position

const camera = camNode.addComponent(Camera);       // component owns the render-scene Camera (camera.camera)
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;                                  // degrees, vertical axis by default
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(28, 36, 52, 255);
camera.priority = 0;                              // lower priority draws first

const modelRoot = new Node('Model');              // frameObject measures this node's MeshRenderer bounds
modelRoot.layer = Layers.Enum.DEFAULT;            // must be contained in camera.visibility or it is culled
scene.addChild(modelRoot);
modelRoot.setPosition(new Vec3(0, 0.6, 0));
const renderer = modelRoot.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
renderer.material = material;

frameObject(camera, modelRoot);                  // puts the camera on the boundsCenter->cameraPos ray at the fit distance and lookAt(boundsCenter)
app.run(scene);                                  // frameObject ran before run, so it used aspect = 1; see Contracts
</script>
```

Entry choice, the importmap alias and install are owned by [cocosair-project-setup](../../cocosair-project-setup/SKILL.md); `createAirApp`/`run` by [cocosair-application](../../cocosair-application/SKILL.md); node transform and layer bits by [cocosair-scene-graph](../../cocosair-scene-graph/SKILL.md).
