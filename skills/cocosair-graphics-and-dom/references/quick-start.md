Derived from the cocosair-graphics-and-dom skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, Graphics, Layers, UITransform, Canvas, Color,
         view, ResolutionPolicy, drawAirGraphics, airGraphicsCommandsToSvg,
         rasterizeAirGraphics, createAirTextureSprite } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' }); // #GameCanvas must exist first
view.setDesignResolutionSize(1280, 720, ResolutionPolicy.EXACT_FIT);
const scene = new Scene('graphics');
const UI = Layers.Enum.UI_2D;                              // the layer bit is on Layers.Enum; Layers.UI_2D is undefined
const ui = new Node('UI'); ui.layer = UI;
ui.addComponent(UITransform).setContentSize(1280, 720);
const canvasComponent = ui.addComponent(Canvas);          // UI renderers draw through their Canvas camera
scene.addChild(ui);
const camNode = new Node('UICamera'); camNode.layer = UI; camNode.setPosition(0, 0, 1000);
ui.addChild(camNode);
const cam = camNode.addComponent(Camera);
cam.projection = Camera.ProjectionType.ORTHO; cam.visibility = UI;
cam.clearColor = new Color(24, 30, 44, 255);
canvasComponent.cameraComponent = cam;

// 1) Solid commands replayed on a native Graphics component (Y up, node-centred).
const g = ui.addComponent(Graphics);
drawAirGraphics(g, [
    { op: 'rect', args: [-420, -140, 200, 100] },
    { op: 'fill', paint: { color: '#ff0000' } },
]);
const svg = airGraphicsCommandsToSvg(
    [{ op: 'rect', args: [0, 0, 100, 50] }, { op: 'fill', paint: { color: '#ff0000' } }],
    { x: 0, y: 0, width: 100, height: 50 });

// 2) Rich fills (gradient/pattern/hole) rasterize into a native Texture2D, then display.
const paint = rasterizeAirGraphics(
    [{ op: 'rect', args: [0, 0, 200, 100] },
     { op: 'fill', paint: { kind: 'linear', from: [0, 0], to: [200, 0],
       stops: [{ offset: 0, color: '#ff0000' }, { offset: 1, color: '#0000ff' }] } }],
    { bounds: { x: 0, y: 0, width: 200, height: 100 }, resolution: 2 });
const display = createAirTextureSprite(ui, paint.texture, { size: [200, 100] });
display.node.setPosition(140, 0, 0);

app.run(scene); // first frame draws on a later tick; never tear down inline here

function teardown() {
    display.dispose();   // owned node/SpriteFrame first, borrowed texture untouched
    paint.dispose();     // destroy the raster Texture2D after its display
    g.clear();
}
</script>
```
