const { createAirApp } = await import('/build/bootstrap.js');
const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings', designResolution: { width: 480, height: 360, policy: 0 } });
const { Scene, Node, AirUIMesh, Sprite, SpriteFrame, Texture2D, ImageAsset, Material, Color, UITransform, Mask,
    UIOpacity, createUICanvas, game, director } = await import('/build/cocosair.module.js');
const scene = new Scene('UI-Mesh'), ui = createUICanvas(scene, 'Canvas', { designWidth: 480, designHeight: 360 });
const canvas = document.createElement('canvas'); canvas.width = canvas.height = 8;
const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 8, 8);
const image = new ImageAsset(canvas), texture = new Texture2D(), frame = new SpriteFrame();
texture.image = image; frame.texture = texture; frame.addRef(); texture.addRef();
const triangle = { positions: [-60, -50, 60, -50, 0, 50], uvs: [0, 0, 1, 0, .5, 1], indices: [0, 1, 2] };
function mesh(parent, name, x, y, color) {
    const node = new Node(name); node.layer = ui.layer; node.setPosition(x, y); parent.addChild(node);
    const component = node.addComponent(AirUIMesh); component.spriteFrame = frame; component.setGeometry(triangle); component.color = color;
    node.getComponent(UITransform).setContentSize(120, 100); return component;
}
function sprite(parent, name, x, y, color) {
    const node = new Node(name); node.layer = ui.layer; node.setPosition(x, y); parent.addChild(node);
    const component = node.addComponent(Sprite); component.spriteFrame = frame; component.sizeMode = Sprite.SizeMode.CUSTOM;
    node.getComponent(UITransform).setContentSize(30, 30); component.color = color; return component;
}
// First mesh overlays a Sprite, and a later Sprite overlays the mesh in the same UI tree.
sprite(ui, 'Before', -120, 50, new Color(0, 0, 255, 255));
const first = mesh(ui, 'Triangle', -120, 50, new Color(255, 0, 0, 255));
const after = sprite(ui, 'After', -120, 50, new Color(0, 255, 0, 255));
const maskNode = new Node('Mask'); maskNode.layer = ui.layer; maskNode.setPosition(110, 50); ui.addChild(maskNode);
maskNode.addComponent(UITransform).setContentSize(40, 40); maskNode.addComponent(Mask).type = Mask.Type.GRAPHICS_RECT;
const masked = mesh(maskNode, 'MaskedTriangle', 0, 0, new Color(255, 0, 0, 255));
const blend = mesh(ui, 'OpacityTriangle', 0, -100, new Color(255, 0, 0, 255)); blend.node.addComponent(UIOpacity).opacity = 128;
const uvCanvas = document.createElement('canvas'); uvCanvas.width = uvCanvas.height = 8;
const uvCtx = uvCanvas.getContext('2d');
for (const [color, x, y] of [['red', 0, 0], ['lime', 4, 0], ['blue', 0, 4], ['yellow', 4, 4]]) {
    uvCtx.fillStyle = color; uvCtx.fillRect(x, y, 4, 4);
}
const uvImage = new ImageAsset(uvCanvas), uvTexture = new Texture2D(), uvFrame = new SpriteFrame();
uvTexture.image = uvImage; uvFrame.texture = uvTexture; uvFrame.rotated = true; uvFrame.addRef(); uvTexture.addRef();
const uvMesh = mesh(ui, 'RotatedUV', -25, -15, new Color(255, 255, 255, 255)); uvMesh.spriteFrame = uvFrame;
uvMesh.setGeometry({ positions: [-16,-16,16,-16,-16,16,16,16], uvs: [0,0,1,0,0,1,1,1], indices: [0,1,2,1,3,2] });
const uvSprite = sprite(ui, 'NativeUVReference', 25, -15, new Color(255, 255, 255, 255)); uvSprite.spriteFrame = uvFrame;
uvSprite.node.getComponent(UITransform).setContentSize(32, 32);
let batches = [];
const custom = new Material(); custom.initialize({ effectName: 'builtin-sprite', defines: { USE_TEXTURE: true } });
app.session.own(() => { if (first.isValid) first.customMaterial = null; custom.destroy(); }, 'ui-mesh-custom-material');
director.on(director.constructor.EVENT_BEFORE_RENDER, () => {
    batches = scene.renderScene.batches.map((batch) => ({ indices: batch.inputAssembler?.indexCount, stencil: batch.passes[0]?.depthStencilState.stencilTestFront }));
});
app.run(scene); game.pause();
function render(mode = 'initial') {
    if (mode === 'changed') { first.setGeometry({ ...triangle, positions: triangle.positions.map((value, index) => index % 2 ? value : value * .5) }); after.node.setPosition(-105, 50); }
    if (mode === 'reenabled') { first.enabled = false; director.tick(0); first.enabled = true; }
    if (mode === 'material') { first.customMaterial = custom; first.color = new Color(0, 0, 255, 255); }
    director.tick(0);
    const gl = app.canvas.getContext('webgl2'), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const pixel = (x, y) => Array.from(pixels.slice(((180 + y) * w + 240 + x) * 4, ((180 + y) * w + 240 + x) * 4 + 4));
    return { center: pixel(-120, 50), redTriangle: pixel(-145, 25), maskInside: pixel(110, 50), maskOutside: pixel(140, 25),
        opacity: pixel(0, -100), customColor: pixel(-120, 30), materialCurrent: first.renderData.material === first.getRenderMaterial(0), geometryCount: first.geometry.positions.length / 2,
        dimensions: [w, h], frameRefs: frame.refCount, textureRefs: texture.refCount, batches,
        uvMesh: [[-8,-8],[8,-8],[-8,8],[8,8]].map(([x,y]) => pixel(-25+x,-15+y)),
        uvSprite: [[-8,-8],[8,-8],[-8,8],[8,8]].map(([x,y]) => pixel(25+x,-15+y)),
        errors: app.diagnostics.snapshot().filter((entry) => entry.severity === 'error') };
}
window.__uiMeshProbe = { ready: true, render, release: async () => {
    const receipt = await app.releaseScene();
    const state = { receipt, disposed: [first, masked, blend, uvMesh].every((mesh) => mesh.disposed), frameRefs: frame.refCount, textureRefs: texture.refCount,
        frameValid: frame.isValid, textureValid: texture.isValid };
    frame.decRef(); texture.decRef(); image.destroy(); uvFrame.decRef(); uvTexture.decRef(); uvImage.destroy(); return state;
} };
