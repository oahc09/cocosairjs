const params = new URLSearchParams(location.search), cap = params.get('cap');
const beforeBodyStyle = document.body.getAttribute('style'), beforeCanvasCSS = getComputedStyle(document.querySelector('canvas'));
const bodyBefore = { margin: getComputedStyle(document.body).margin, background: getComputedStyle(document.body).backgroundColor };
const { createAirApp } = await import('/build/cocosair.module.js');
const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings', ...(cap ? { pixelRatioCap: Number(cap) } : {}),
    designResolution: { width: 978, height: 846, policy: 0 } });
const { Scene, Node, Sprite, SpriteFrame, Texture2D, ImageAsset, Color, UITransform, Canvas, Vec2, Vec3,
    createUICanvas, game, director, view } = await import('/build/cocosair.module.js');
const scene = new Scene('DesignViewport'), ui = createUICanvas(scene, 'UI', { designWidth: 978, designHeight: 846 });
const camera = ui.getComponent(Canvas).cameraComponent;
const source = document.createElement('canvas'); source.width = source.height = 2;
const context = source.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 2, 2);
const image = new ImageAsset(source), texture = new Texture2D(), frame = new SpriteFrame(); texture.image = image; frame.texture = texture;
const hits = [], targets = [
    { id: 'bottom-left', x: 30, y: 30, color: [255, 0, 0, 255] },
    { id: 'bottom-right', x: 948, y: 30, color: [0, 255, 0, 255] },
    { id: 'top-left', x: 30, y: 816, color: [0, 0, 255, 255] },
    { id: 'top-right', x: 948, y: 816, color: [255, 255, 0, 255] },
];
for (const target of targets) {
    const node = new Node(target.id); node.layer = ui.layer; ui.addChild(node); node.setPosition(target.x - 489, target.y - 423);
    const sprite = node.addComponent(Sprite); sprite.sizeMode = Sprite.SizeMode.CUSTOM; sprite.spriteFrame = frame;
    sprite.color = new Color(...target.color); node.getComponent(UITransform).setContentSize(40, 40); target.node = node;
    node.on(Node.EventType.TOUCH_START, (event) => {
        const screen = event.getLocation(), design = event.getUILocation(), world = camera.screenToWorld(new Vec3(screen.x, screen.y, 0));
        const local = ui.getComponent(UITransform).convertToNodeSpaceAR(world);
        hits.push({ id: target.id, screen: [screen.x, screen.y], design: [design.x, design.y], local: [local.x + 489, local.y + 423] });
    });
}
app.run(scene); game.pause();
function sample() {
    director.tick(0);
    const gl = app.canvas.getContext('webgl2'), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const rect = app.canvas.getBoundingClientRect();
    const points = targets.map((target) => {
        const expected = [target.x / 978 * w, target.y / 846 * h], projected = camera.worldToScreen(target.node.worldPosition);
        const pixelX = Math.min(w - 1, Math.max(0, Math.floor(expected[0]))), pixelY = Math.min(h - 1, Math.max(0, Math.floor(expected[1])));
        const offset = (pixelY * w + pixelX) * 4;
        return { id: target.id, design: [target.x, target.y], expected, projected: [projected.x, projected.y],
            hit: target.node.getComponent(UITransform).hitTest(new Vec2(...expected)), color: target.color,
            pixel: Array.from(pixels.slice(offset, offset + 4)), click: [rect.left + target.x / 978 * rect.width, rect.top + (1 - target.y / 846) * rect.height] };
    });
    return { buffer: [w, h], css: [rect.width, rect.height], dpr: window.devicePixelRatio, scale: [view.getScaleX(), view.getScaleY()],
        uiSize: [ui.getComponent(UITransform).width, ui.getComponent(UITransform).height], orthoHeight: camera.orthoHeight,
        points, hits: hits.splice(0), bodyUnchanged: beforeBodyStyle === document.body.getAttribute('style')
            && bodyBefore.margin === getComputedStyle(document.body).margin && bodyBefore.background === getComputedStyle(document.body).backgroundColor,
        errors: app.diagnostics.snapshot().filter((entry) => entry.severity === 'error') };
}
let presentation = 0;
function present() { director.tick(0); presentation = requestAnimationFrame(present); }
window.__designProbe = { ready: true, sample, hits: () => hits.splice(0),
    startPresentation: () => { if (!presentation) present(); },
    stopPresentation: () => { cancelAnimationFrame(presentation); presentation = 0; }, release: async () => {
    cancelAnimationFrame(presentation); presentation = 0;
    const receipt = await app.releaseScene(); frame.destroy(); texture.destroy(); image.destroy(); return receipt;
} };
