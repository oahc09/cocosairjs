Derived from the cocosair-2d-subsystems skill and its canonical docs/source pointers; reorganized on 2026-10-11. Source annotations below identify repository inputs, not files guaranteed to ship to npm consumers.

Environment: the HTML examples using `/build/` require the AIR development server and an existing bundle. In npm applications use the installed package name and the application's own bundler/server; resolve docs and declarations from that package. Do not copy repository URLs into a consumer app. Browser behavior is verified only for explicitly tested snippets and candidates.

# Quick Start

```html
<canvas id="GameCanvas"></canvas>
<script type="importmap">
  { "imports": { "cocosair": "/build/cocosair.module.js" } }
</script>
<script type="module">
import { createAirApp, Scene, Node, Camera, Canvas, UITransform, Layers, Color,
         ParticleSystem2D, ParticleAsset, SpriteFrame, Texture2D, ImageAsset,
         assetManager, view, ResolutionPolicy } from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });   // #GameCanvas must exist before this import
const UI = Layers.Enum.UI_2D;
view.setDesignResolutionSize(960, 540, ResolutionPolicy.SHOW_ALL);
const scene = new Scene('air-2d-subsystems');
const canvasNode = new Node('Canvas'); canvasNode.layer = UI; canvasNode.addComponent(UITransform);
const canvasComponent = canvasNode.addComponent(Canvas);
const cameraNode = new Node('UICamera'); cameraNode.layer = UI; cameraNode.setPosition(0, 0, 1000);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO; camera.visibility = UI;
camera.clearColor = new Color(10, 14, 26, 255);
canvasNode.addChild(cameraNode); scene.addChild(canvasNode);
canvasComponent.cameraComponent = camera;   // UI renderers only draw through their Canvas camera

// textures AFTER createAirApp: the gfx device is not ready before it, and every frame then warns on the sampler
const cvs = document.createElement('canvas'); cvs.width = 32; cvs.height = 32;
const ctx = cvs.getContext('2d');
const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
gradient.addColorStop(0, 'rgba(255,255,255,1)'); gradient.addColorStop(1, 'rgba(255,80,0,0)');
ctx.fillStyle = gradient; ctx.fillRect(0, 0, 32, 32);
const image = new ImageAsset(cvs);
const texture = new Texture2D(); texture.image = image;
const spriteFrame = new SpriteFrame(); spriteFrame.texture = texture;

// the plist is generated here, parsed by the engine parser, carried by the asset, read only when custom is false
function plistXml (entries) {
    const body = Object.entries(entries).map((e) => {
        const tag = typeof e[1] === 'number' ? (Number.isInteger(e[1]) ? 'integer' : 'real') : 'string';
        return '<key>' + e[0] + '</key><' + tag + '>' + e[1] + '</' + tag + '>';
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8"?><plist version="1.0"><dict>' + body + '</dict></plist>';
}
let dict = null;
assetManager.parser.parsePlist(plistXml({
    emitterType: 0, maxParticles: 240, duration: -1, positionType: 0,
    particleLifespan: 1.1, particleLifespanVariance: 0.35, emissionRate: 120,   // 'life' is not a plist key
    angle: 90, angleVariance: 14, speed: 55, speedVariance: 25, gravityx: 0, gravityy: 34,
    startColorRed: 1, startColorGreen: 1, startColorBlue: 1, startColorAlpha: 1,
    finishColorRed: 1, finishColorGreen: 0.3, finishColorBlue: 0, finishColorAlpha: 0,
    startParticleSize: 30, finishParticleSize: -1, sourcePositionVariancex: 8, sourcePositionVariancey: 3,
    blendFuncSource: 2, blendFuncDestination: 1,   // gfx BlendFactor slots (max value 14), not raw GL 770 and 1
}), {}, (err, data) => { if (err) throw err; dict = data; });
const particleNode = new Node('Flame'); particleNode.layer = UI; particleNode.addComponent(UITransform);
particleNode.setPosition(-150, -140, 0); canvasNode.addChild(particleNode);
const ps = particleNode.addComponent(ParticleSystem2D);
ps.spriteFrame = spriteFrame;
const particleAsset = new ParticleAsset();
particleAsset._nativeAsset = dict;
ps.custom = false;   // custom = true makes _applyFile skip the whole dictionary mapping
ps.file = particleAsset;

app.run(scene);   // async render loop; the first frame lands on a later tick

function teardown () {   // never call this inline; releasing now blanks the screen before frame 1
    scene.destroy();
    ps.file = null;
    particleAsset.destroy();
    spriteFrame.destroy(); texture.destroy(); image.destroy();
}
</script>
```

Spine, DragonBones, TiledMap and Billboard follow the same construction discipline with different payloads; each has a reference file below.
