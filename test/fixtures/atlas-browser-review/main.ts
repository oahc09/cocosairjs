const params = new URLSearchParams(location.search);
const { createAirApp } = await import(params.get('bootstrap') || '/build/cocosair.module.js');
const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings', designResolution: { width: 480, height: 360, policy: 0 } });
const { loadAtlas, AssetBank, Scene, Node, Sprite, Texture2D, UITransform, Canvas, createUICanvas, Color, game, director } = await import(params.get('runtime') || '/build/cocosair.module.js');
const bank = new AssetBank();
const base = new URL('./', location.href).href;
const legacy = await loadAtlas(base + 'legacy.atlas', { bank });
const compact = await loadAtlas(base + 'compact.atlas', { bank });
for (const handle of [legacy, compact]) for (const texture of handle.textures) texture.setFilters(Texture2D.Filter.NEAREST, Texture2D.Filter.NEAREST);
const scene = new Scene('AtlasRealPixels'), ui = createUICanvas(scene, 'Canvas', { designWidth: 480, designHeight: 360 });
ui.getComponent(Canvas).cameraComponent.clearColor = new Color(0, 0, 0, 255);
const owned = [], sprites = [];
function add(handle, name, x, y, w, h, trim = true, index = -1) {
    const frame = handle.getFrame(name, index); frame.packable = false; frame.addRef(); owned.push(frame);
    const node = new Node(name + index); node.layer = ui.layer; node.setPosition(x, y); ui.addChild(node);
    const transform = node.addComponent(UITransform); transform.setContentSize(w, h);
    const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.trim = trim; sprite.spriteFrame = frame; sprites.push(sprite);
    return frame;
}
const plain = add(legacy, 'plain', -120, 60, 64, 64);
const hero = add(legacy, 'hero', -20, 60, 32, 96);
const trimmed = add(legacy, 'trimmed', 80, 60, 128, 128, false);
for (let i = 0; i < 3; i++) add(legacy, 'walk', -100 + i * 65, -75, 32, 32, true, i);
const blob = add(compact, 'blob', 120, -80, 96, 112, false);
app.run(scene); game.pause();
function render() {
    director.tick(0);
    const gl = app.canvas.getContext('webgl2'), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const sample = (x, y) => Array.from(pixels.slice(((180 + y) * w + 240 + x) * 4, ((180 + y) * w + 240 + x) * 4 + 4));
    const frame = (value) => ({ rect: { x: value.rect.x, y: value.rect.y, width: value.rect.width, height: value.rect.height },
        original: { width: value.originalSize.width, height: value.originalSize.height }, offset: { x: value.offset.x, y: value.offset.y }, rotated: value.rotated, uv: [...value.uv] });
    return { dimensions: [w,h], plain: [[-136,76],[-104,76],[-136,44],[-104,44]].map(([x,y]) => sample(x,y)),
        hero: [sample(-20,90), sample(-20,30)], trim: [sample(60,60),sample(60,20),sample(80,100),sample(30,50),sample(80,0)],
        walk: [sample(-100,-75),sample(-35,-75),sample(30,-75)], blob: [sample(100,-100),sample(140,-60)],
        frames: { plain: frame(plain), hero: frame(hero), trimmed: frame(trimmed), blob: frame(blob) },
        pages: legacy.textures.map((t) => [t.width,t.height]), indexes: legacy.getFrames('walk').length,
        bankSize: bank.size, errors: app.diagnostics.snapshot().filter((entry) => entry.severity === 'error') };
}
window.__atlasReview = { ready: true, render, release: async () => {
    let guarded = null; try { legacy.dispose(); } catch (error) { guarded = error.code; }
    const before = { disposed: legacy.disposed, bankSize: bank.size };
    const receipt = await app.releaseScene();
    for (const frame of owned) frame.decRef();
    legacy.dispose(); compact.dispose(); legacy.dispose(); compact.dispose();
    // decRef requests release in a later task; scene release above predates these requests.
    await new Promise((resolve) => setTimeout(resolve, 50)); director.tick(0);
    return { guarded, before, receipt, bankSize: bank.size, disposed: legacy.disposed && compact.disposed,
        framesValid: owned.map((f) => f.isValid), textureRefs: [...legacy.textures,...compact.textures].map((t) => t.refCount), gpuMemory: 'unavailable' };
} };
