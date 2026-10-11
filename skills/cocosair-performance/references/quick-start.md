Derived from the cocosair-performance skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material,
         Vec3, primitives, utils, BatchingUtility, profiler, director, Director, game } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas', pixelRatioCap: 2 });  // #GameCanvas exists before this import
const scene = new Scene('Main');
const camNode = new Node('Main');
scene.addChild(camNode); camNode.setPosition(new Vec3(0, 3, 8)); camNode.lookAt(new Vec3(0, 1, 0));
camNode.addComponent(Camera);
const lightNode = new Node('Key');
scene.addChild(lightNode); lightNode.setPosition(new Vec3(0, 8, 6)); lightNode.lookAt(new Vec3(0, 0, 0));
lightNode.addComponent(DirectionalLight);
const mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));   // one Mesh object
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });                             // one Material object
const grid = new Node('grid');
scene.addChild(grid);
for (let i = 0; i < 9; i++) {                    // 3x3 cubes on separate nodes
    const cube = new Node(`cube-${i}`);
    grid.addChild(cube); cube.setPosition(new Vec3(i % 3 - 1, 0.5, Math.floor(i / 3) - 1));
    const renderer = cube.addComponent(MeshRenderer);
    renderer.mesh = mesh; renderer.material = material;   // shared resources still submit 9 models: 9 draws
}
const batchedRoot = new Node('batchedRoot');        // the merge output node, kept separate
scene.addChild(batchedRoot);
console.log('batchStaticModel', BatchingUtility.batchStaticModel(grid, batchedRoot));  // sources now enabled = false
app.run(scene);
profiler.showStats();                   // overlay rows: Draw call, Frame time (ms), Triangle, GFX Texture Mem(M)
// render on demand instead of a free-running loop: subscribe first, pause inside the callback, step per interaction
director.once(Director.EVENT_AFTER_DRAW, () => { if (!game.isPaused()) game.pause(); });
</script>
```
