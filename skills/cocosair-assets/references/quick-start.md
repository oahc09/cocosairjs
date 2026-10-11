Derived from the cocosair-assets skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, DirectionalLight, MeshRenderer, Material, Vec3, Layers,
         Texture2D, ImageAsset, primitives, utils, assetManager, loadAssetAsync, isValid, AssetBank } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const scene = new Scene('assets');
const camNode = new Node('Main');
scene.addChild(camNode); camNode.setPosition(new Vec3(0, 2, 6)); camNode.lookAt(new Vec3(0, 0, 0));
camNode.addComponent(Camera);
const lightNode = new Node('Key');
scene.addChild(lightNode); lightNode.setPosition(new Vec3(0, 8, 6)); lightNode.lookAt(new Vec3(0, 0, 0));
lightNode.addComponent(DirectionalLight);

// 1) no file involved: ImageAsset carries the CPU pixels, Texture2D is the GPU sampler
const imageAsset = new ImageAsset({
    width: 64, height: 64, _data: new Uint8Array(64 * 64 * 4).fill(120),
    _compressed: false, format: Texture2D.PixelFormat.RGBA8888,
});
const texture = new Texture2D();
texture.image = imageAsset;                    // equals mipmaps = [imageAsset]; clears other levels
// 2) Code First registry: the key you add is the path you load
assetManager.assets.add('gen/panel', texture);
const back = await loadAssetAsync('gen/panel', Texture2D);
console.log('roundtrip', back === texture, isValid(back));   // the registry is the cache
// 3) a runtime JSON file: fetch plus engine deserialize, plain-JSON fallback
console.log('manifest', await loadAssetAsync('assets/panel-manifest.json'));
// 4) refcounted remote bytes; ext is mandatory unless the URL already carries a suffix
const bank = new AssetBank();
const remote = await bank.load('/examples/tiledmap-basic/assets/tiles.png');   // -> ImageAsset
console.log('bank', remote.constructor.name, bank.refCount('/examples/tiledmap-basic/assets/tiles.png'));
// sample it (effect and property typing belong to cocosair-materials-effects)
const material = new Material();
material.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } });
material.setProperty('mainTexture', texture);
const cube = new Node('cube');
cube.layer = Layers.Enum.DEFAULT; cube.setPosition(new Vec3(0, 0.8, 0));
scene.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
renderer.material = material;
app.run(scene);   // async render loop; first frame draws on a later tick, so never free synchronously here
// Release LATER (on teardown), in guard order; freeing now blanks the cube (its material still samples `texture`)
async function teardown() {
    renderer.material = null; material.destroy(); assetManager.assets.remove('gen/panel'); // unbind the sampler first
    assetManager.releaseAsset(texture); texture.destroy(); await bank.release('/examples/tiledmap-basic/assets/tiles.png'); // isValid flips false at frame end
}
</script>
```
