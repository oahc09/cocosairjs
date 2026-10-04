const { createAirApp } = await import('/build/bootstrap.js');
const app = await createAirApp({ canvas: '#GameCanvas', designResolution: { width: 480, height: 360, policy: 0 } });
const { Scene, Node, Label, UITransform, createUICanvas, Color, game, director,
    AssetBank, loadBitmapFont, createBitmapFont } = await import('/build/cocosair.module.js');
const bank = new AssetBank();
const owned = await loadBitmapFont(new URL('./font.fnt', location.href).href, { bank });
const noKerning = createBitmapFont({ ...owned.data, kerningDict: {} }, owned.font.spriteFrame);
const scene = new Scene('BMFont');
const ui = createUICanvas(scene, 'FontCanvas', { designWidth: 480, designHeight: 360 });
const labels = [16, 20, 24].map((size, index) => {
    const node = new Node('Font-' + size); node.layer = ui.layer;
    node.addComponent(UITransform).setAnchorPoint(0, 0);
    node.setPosition(-180, 80 - index * 80);
    const label = node.addComponent(Label);
    label.font = owned.font; label.fontSize = size; label.lineHeight = size;
    label.overflow = Label.Overflow.NONE; label.color = new Color(255, 255, 255, 255); label.string = 'AV';
    ui.addChild(node); return label;
});
app.session.own(() => {
    labels.forEach((label) => { label.font = null; });
    noKerning.dispose(); owned.dispose(); bank.releaseAll();
}, 'bitmap-fonts');
app.run(scene); game.pause();
function render(kerning) {
    labels.forEach((label) => { label.font = kerning ? owned.font : noKerning.font; });
    director.tick(0);
    const gl = app.canvas.getContext('webgl2'), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const scan = (channel) => {
        const scanlines = [];
        for (let y = 0; y < h; y++) {
            let minX = w, maxX = -1, count = 0;
            for (let x = 0; x < w; x++) {
                const offset = (y * w + x) * 4;
                if (pixels[offset + channel] > 180 && pixels[offset + (channel === 0 ? 1 : 0)] < 80 && pixels[offset + 2] < 80) {
                    minX = Math.min(minX, x); maxX = Math.max(maxX, x); count++;
                }
            }
            if (count) scanlines.push({ y, minX, maxX, count });
        }
        const boxes = [];
        for (const row of scanlines) {
            let box = boxes.at(-1);
            if (!box || row.y > box.maxY + 1) { box = { minY: row.y, maxY: row.y, minX: row.minX, maxX: row.maxX, count: 0 }; boxes.push(box); }
            box.maxY = row.y; box.minX = Math.min(box.minX, row.minX); box.maxX = Math.max(box.maxX, row.maxX); box.count += row.count;
        }
        return boxes;
    };
    return { red: scan(0), green: scan(1), dimensions: [w, h],
        labels: labels.map((label) => ({ size: label.fontSize, width: label.node.getComponent(UITransform).width })) };
}
window.__bmfontProbe = { ready: true, render, release: async () => {
    const receipt = await app.releaseScene(); return { receipt, bankSize: bank.size, disposed: owned.disposed && noKerning.disposed };
} };
