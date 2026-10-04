const { createAirApp } = await import('/build/bootstrap.js');
const app = await createAirApp({ canvas: '#GameCanvas', diagnostics: 'warnings' });
const { Scene, Node, Camera, Billboard, Texture2D, ImageAsset, Color, game, director } = await import('/build/cocosair.module.js');
const scene = new Scene('NativeBillboard'), cameraNode = new Node('Camera');
const camera = cameraNode.addComponent(Camera); camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = 3; camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(0, 0, 0, 255);
scene.addChild(cameraNode);
const node = new Node('Billboard'); scene.addChild(node);
const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
const context = canvas.getContext('2d'); context.fillStyle = 'red'; context.fillRect(0, 0, 8, 16);
context.fillStyle = 'lime'; context.fillRect(8, 0, 8, 16);
const image = new ImageAsset(canvas), texture = new Texture2D(); texture.image = image;
const billboard = node.addComponent(Billboard); billboard.texture = texture; billboard.width = 2; billboard.height = 1;
app.run(scene); game.pause();
const model = billboard['_model'], material = billboard['_material'], mesh = billboard['_mesh'];
function render(angle, rotation = 0) {
    cameraNode.setPosition(6 * Math.sin(angle), 0, 6 * Math.cos(angle)); cameraNode.lookAt(node.worldPosition);
    billboard.rotation = rotation; director.tick(0);
    const gl = app.canvas.getContext('webgl2'), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
    const pixels = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let count = 0, minX = w, maxX = -1, minY = h, maxY = -1, red = 0, green = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        if (pixels[o] > 180 && pixels[o + 1] < 80 || pixels[o + 1] > 180 && pixels[o] < 80) {
            count++; minX = Math.min(x, minX); maxX = Math.max(x, maxX); minY = Math.min(y, minY); maxY = Math.max(y, maxY);
            if (pixels[o] > 180) red++; else green++;
        }
    }
    return { count, red, green, width: count ? maxX - minX + 1 : 0, height: count ? maxY - minY + 1 : 0, modelAttached: !!model.scene };
}
window.__billboardProbe = { ready: true, render, lifecycle: () => {
    billboard.enabled = false; const disabled = render(0);
    billboard.enabled = true; const enabled = render(0);
    billboard.width = 1; billboard.height = 2; const resized = render(0);
    billboard.width = 2; billboard.height = 1; render(0, 90);
    billboard.technique = 99; const technique = billboard.technique;
    return { disabled, enabled, resized, technique };
}, release: async () => {
    const receipt = await app.releaseScene();
    const state = { receipt, modelAttached: !!model.scene, modelInitialized: model.isInitialized,
        meshValid: mesh.isValid, materialValid: material.isValid, textureValid: texture.isValid };
    texture.destroy(); image.destroy(); return state;
} };
