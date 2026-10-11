Derived from the cocosair-ui-2d skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, UITransform, Sprite, Label, Layers, view, ResolutionPolicy,
         ImageAsset, Texture2D, SpriteFrame, Color, createUICanvas, spriteNode, labelNode } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
view.setDesignResolutionSize(window.innerWidth, window.innerHeight, ResolutionPolicy.EXACT_FIT);
const scene = new Scene('ui');

// 1) Canvas + fullscreen Widget + ortho UI camera. createUICanvas sets node.layer,
//    camera.visibility and canvas.cameraComponent consistently to Layers.Enum.UI_2D.
const canvasNode = createUICanvas(scene, 'UICanvas', { designWidth: 1280, designHeight: 720 });

// 2) A panel with a runtime-generated frame (AIR has no image asset pipeline).
function solidFrame (cssColor) {
    const cvs = document.createElement('canvas'); cvs.width = 16; cvs.height = 16;
    const ctx = cvs.getContext('2d'); ctx.fillStyle = cssColor; ctx.fillRect(0, 0, 16, 16);
    const tex = new Texture2D(); tex.image = new ImageAsset(cvs);
    const sf = new SpriteFrame(); sf.texture = tex; return sf;
}
const panel = spriteNode(canvasNode, 'Panel', { size: [360, 120], position: [0, 40] });
const sprite = panel.getComponent(Sprite);
sprite.sizeMode = Sprite.SizeMode.CUSTOM;              // already CUSTOM from spriteNode; set before the frame
sprite.spriteFrame = solidFrame('#3478f6');

// 3) A label child of that panel; labelNode inherits the UI_2D layer and uses the system font.
labelNode(panel, 'Hello Cocos AIR', 'Title', { fontSize: 32, position: [0, 8], color: Color.WHITE });

// 4) Sorting2D on the panel pushes it behind later siblings via the UIRenderer priority it writes.
app.run(scene);                       // async render loop: frame 1 lands on a later tick
function teardown() { canvasNode.destroy(); }   // release later, never inline right after run
</script>
```
