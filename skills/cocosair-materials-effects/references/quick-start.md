Derived from the cocosair-materials-effects skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">{ "imports": { "cocosair": "/build/cocosair.module.js" } }</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, MeshRenderer, Material,
         Texture2D, ImageAsset, Layers, Vec3, Vec4, Color, primitives, utils,
         inspectAirMaterial } from 'cocosair'; // page alias, not the package name

const app = await createAirApp({ canvas: '#GameCanvas' }); // device first: passes need root.device
const scene = new Scene('materials');

const camNode = new Node('Main Camera');
scene.addChild(camNode); camNode.setPosition(new Vec3(0, 1.8, 6.5)); camNode.lookAt(new Vec3(0, 0.6, 0));
const camera = camNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.visibility = Layers.Enum.DEFAULT;

const texture = new Texture2D(); // procedural source, no asset files
texture.image = new ImageAsset({ width: 8, height: 8, _data: new Uint8Array(8 * 8 * 4).fill(255), _compressed: false, format: Texture2D.PixelFormat.RGBA8888 });

function addCube (name, x, init, configure) {
    const node = new Node(name); node.layer = Layers.Enum.DEFAULT; scene.addChild(node);
    node.setPosition(new Vec3(x, 0.7, 0));
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1.1, height: 1.1, length: 1.1 }));
    const material = new Material();          // one instance per object: never mutate a shared builtin
    material.initialize(init); configure(material); // defines must be complete at initialize
    renderer.setSharedMaterial(material, 0);  // shared reference: setProperty on `material` drives pixels
    return material;
}

addCube('lit', -2.2, { effectName: 'builtin-standard' }, (m) => {
    m.setProperty('mainColor', new Color(90, 200, 220, 255)); // bytes 0-255, written as 0-1 fractions
    m.setProperty('metallic', 0.0); m.setProperty('roughness', 0.35); // float uniforms take plain numbers
});
addCube('flat', 0, { effectName: 'builtin-unlit' }, (m) => m.setProperty('mainColor', new Color(230, 120, 60, 255)));
const mapped = addCube('mapped', 2.2, { effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } }, (m) => {
    m.setProperty('mainTexture', texture);   // without the macro the write succeeds and the map is never sampled
    m.setProperty('tilingOffset', new Vec4(2, 2, 0, 0)); // x/y tiling, z/w offset
});

console.log(inspectAirMaterial(mapped));      // one frozen record per pass: program, depth/blend/cull, bound textures
app.run(scene);
</script>
```

Entry choice and the importmap alias belong to [cocosair-project-setup](../../cocosair-project-setup/SKILL.md); `createAirApp` and `run` to [cocosair-application](../../cocosair-application/SKILL.md).
