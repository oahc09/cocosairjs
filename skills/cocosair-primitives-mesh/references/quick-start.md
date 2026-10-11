Derived from the cocosair-primitives-mesh skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, Material, MeshRenderer,
         Layers, Color, Vec3, primitives, utils, createPrimitiveGeometry } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const scene = new Scene('Main');
const camNode = new Node('Main'); scene.addChild(camNode);
camNode.setPosition(new Vec3(0, 2, 8)); camNode.lookAt(new Vec3(0, 1, 0));
camNode.addComponent(Camera);
const lightNode = new Node('Key'); scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0); lightNode.addComponent(DirectionalLight);

// 1. descriptor helper: validated named parameters, returns IGeometry (NOT a Mesh)
const geometry = createPrimitiveGeometry({ type: 'cylinder', radiusTop: 0.2, radiusBottom: 0.5, height: 2, radialSegments: 16 });
const nodeA = new Node('Cyl'); nodeA.layer = Layers.Enum.DEFAULT; nodeA.setPosition(new Vec3(-1.5, 1, 0)); scene.addChild(nodeA);
const a = nodeA.addComponent(MeshRenderer);
a.mesh = utils.MeshUtils.createMesh(geometry);                         // IGeometry -> Mesh asset is the only renderable hand-off

// 2. native generator with positional arguments (cone is cone(radius, height, opts), not an options object)
const nodeB = new Node('Cone'); nodeB.layer = Layers.Enum.DEFAULT; nodeB.setPosition(new Vec3(1.5, 1, 0)); scene.addChild(nodeB);
const b = nodeB.addComponent(MeshRenderer);
b.mesh = utils.MeshUtils.createMesh(primitives.cone(0.5, 1.3, { radialSegments: 32 }));

const material = new Material(); material.initialize({ effectName: 'builtin-standard' }); material.setProperty('mainColor', new Color(200, 210, 230));
a.material = material; b.material = material;
app.run(scene);   // async render loop; the first frame draws on a later tick, so never free the Meshes synchronously here
// Release LATER (on teardown): unbind the renderers first, then destroy the app-owned Meshes.
function teardown() {
    const mA = a.mesh, mB = b.mesh;   // Mesh.destroy() frees GPU buffers synchronously, so grab them before unbinding
    a.mesh = null; b.mesh = null;      // stop the MeshRenderers sampling the geometry
    mA.destroy(); mB.destroy();        // the app owns the Meshes createMesh returned
}
</script>
```
