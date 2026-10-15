import { copyCanvasRows } from '../../../examples/shared/canvas-texture.js';
const { createAirApp } = await import('/build/cocosair.module.js');
const app = await createAirApp({ canvas: '#GameCanvas', designResolution: { width: 480, height: 360, policy: 0 } });
const { Scene, Node, Camera, Color, Layers, Canvas, createUICanvas, UITransform, Sprite, SpriteFrame,
    Texture2D, ImageAsset, MeshRenderer, Material, utils, primitives, director, game } = await import('/build/cocosair.module.js');
const scene = new Scene('TextureUVBasis');
const ui = createUICanvas(scene, 'Canvas', { designWidth: 480, designHeight: 360 });
const uiCamera = ui.getComponent(Canvas).cameraComponent;
uiCamera.clearColor = new Color(0, 0, 0, 255);
const spriteNode = new Node('Sprite'); spriteNode.layer = ui.layer; ui.addChild(spriteNode);
spriteNode.addComponent(UITransform).setContentSize(128, 128);
const sprite = spriteNode.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM;
const planeNode = new Node('NativePlane'); planeNode.layer = Layers.Enum.DEFAULT; scene.addChild(planeNode);
planeNode.setRotationFromEuler(90, 0, 0);
const geometry = primitives.plane({ width: 128, length: 128, widthSegments: 1, lengthSegments: 1 });
const mesh = utils.createMesh(geometry); const renderer = planeNode.addComponent(MeshRenderer); renderer.mesh = mesh;
const material = new Material(); material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } }); renderer.material = material;
const cameraNode = new Node('PlaneCamera'); scene.addChild(cameraNode); cameraNode.setPosition(0, 0, 10);
const camera = cameraNode.addComponent(Camera); camera.projection = Camera.ProjectionType.ORTHO; camera.orthoHeight = 180;
camera.visibility = Layers.Enum.DEFAULT; camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(0, 0, 0, 255);
const source = document.createElement('canvas'); source.width = 2; source.height = 2;
const rgba = new Uint8ClampedArray([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,0,255]);
source.getContext('2d').putImageData(new ImageData(rgba, 2, 2), 0, 0);
const image = new ImageAsset(source), native = new Texture2D(); native.image = image;
const raw = new Texture2D(), copied = new Texture2D();
for (const texture of [raw, copied]) texture.reset({ width: 2, height: 2, format: Texture2D.PixelFormat.RGBA8888 });
raw.uploadData(new Uint8Array(rgba)); const flipped = new Uint8Array(16);
copyCanvasRows(source.getContext('2d').getImageData(0, 0, 2, 2), flipped); copied.uploadData(flipped);
for (const texture of [native, raw, copied]) { texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST); texture.setWrapMode(Texture2D.WrapMode.CLAMP_TO_EDGE, Texture2D.WrapMode.CLAMP_TO_EDGE); }
const frames = [native,raw,copied].map((texture) => { const frame = new SpriteFrame(); frame.texture = texture; frame.packable = false; return frame; });
app.run(scene); game.pause();
function sample() {
    const gl = app.canvas.getContext('webgl2'), result = [];
    for (const [x,y] of [[-32,32],[32,32],[-32,-32],[32,-32]]) {
        const bytes = new Uint8Array(4); gl.readPixels(240+x,180+y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,bytes); result.push([...bytes]);
    }
    return result;
}
function render() {
    const observations = [];
    // Reuse the original DOM texture after all byte uploads, including the flipped copy.
    for (const kind of ['sprite','plane']) for (const index of [0,1,2,0]) {
        ui.active = kind === 'sprite'; planeNode.active = kind === 'plane'; camera.enabled = kind === 'plane';
        sprite.spriteFrame = frames[index]; material.setProperty('mainTexture', [native,raw,copied][index]);
        director.tick(0); director.tick(0);
        observations.push({ kind, source: ['canvas','rawTopFirst','copyCanvasRows'][index], pixels: sample() });
    }
    return { observations, positions: geometry.positions, uvs: geometry.uvs, copiedBytes: [...flipped], spriteUV: [...frames[0].uv], errors: app.diagnostics.snapshot().filter((e) => e.severity === 'error') };
}
window.__textureUVBasis = { ready: true, render, release: async () => {
    sprite.spriteFrame = null; renderer.mesh = null; renderer.material = null;
    const receipt = await app.releaseScene();
    frames.forEach((frame) => frame.destroy()); [native,raw,copied].forEach((texture) => texture.destroy()); image.destroy(); mesh.destroy(); material.destroy();
    director.tick(0); return { receipt, valid: [mesh,material,...frames,native,raw,copied,image].map((asset) => asset.isValid) };
} };
