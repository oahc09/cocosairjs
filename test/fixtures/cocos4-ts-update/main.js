import {
    createAirApp,
    Scene,
    Node,
    createUICanvas,
    UIMesh,
    UITransform,
    UIOpacity,
    Texture2D,
    ImageAsset,
    Graphics,
    Label,
    Button,
    RenderTexture,
    Color,
    director,
    game,
    gfx,
} from '/build/cocosair.module.js';

const app = await createAirApp({
    canvas: '#GameCanvas',
    diagnostics: 'warnings',
    designResolution: { width: 640, height: 480, policy: 0 },
});
const scene = new Scene('Cocos4 TS regression');
const ui = createUICanvas(scene, 'Canvas', { designWidth: 640, designHeight: 480 });
const checks = [];
function check(name, pass, detail) {
    checks.push({ name, pass: !!pass, detail });
}
function node(name, x, y, width = 80, height = 80) {
    const result = new Node(name);
    result.layer = ui.layer;
    ui.addChild(result);
    result.setPosition(x, y);
    result.addComponent(UITransform).setContentSize(width, height);
    return result;
}
const source = document.createElement('canvas');
source.width = source.height = 2;
source.getContext('2d').fillStyle = 'white';
source.getContext('2d').fillRect(0, 0, 2, 2);
const image = new ImageAsset(source);
const texture = new Texture2D();
texture.image = image;
function data(quad, color) {
    const positions = quad
        ? [
              [-30, -30],
              [30, -30],
              [-30, 30],
              [30, 30],
          ]
        : [
              [-30, -30],
              [30, -30],
              [0, 30],
          ];
    const vertexData = new Uint8Array(positions.length * 24);
    const view = new DataView(vertexData.buffer);
    positions.forEach(([x, y], i) => {
        const o = i * 24;
        view.setFloat32(o, x, true);
        view.setFloat32(o + 4, y, true);
        view.setFloat32(o + 8, 0, true);
        view.setFloat32(o + 12, 0.5, true);
        view.setFloat32(o + 16, 0.5, true);
        vertexData.set([...color, 255], o + 20);
    });
    const indices = new Uint16Array(quad ? [0, 1, 2, 1, 3, 2] : [0, 1, 2]);
    return {
        vertexCount: positions.length,
        vertexStride: 24,
        vertexData,
        indexCount: indices.length,
        indexData: new Uint8Array(indices.buffer),
        segments: [{ indexOffset: 0, indexCount: indices.length, texture, material: null }],
    };
}
const meshes = [];
for (const [batch, y] of [
    [false, 150],
    [true, 40],
]) {
    for (const [quad, x, color] of [
        [false, -200, [255, 0, 0]],
        [true, -80, [0, 255, 0]],
    ]) {
        const mesh = node(`${batch}-${quad}`, x, y).addComponent(UIMesh);
        mesh.enableBatch = batch;
        mesh.setMeshData(data(quad, color));
        meshes.push(mesh);
    }
}
const graphics = node('Graphics', 130, 130).addComponent(Graphics);
function drawGraphics(count) {
    graphics.clear();
    graphics.fillColor = new Color(40, 140, 255, 255);
    for (let i = 0; i < count; i++) {
        graphics.rect((i % 30) * 2 - 30, Math.floor(i / 30) * 2 - 30, 2, 2);
        graphics.fill();
    }
}
drawGraphics(900);
const label = node('Bold long label', 0, -90, 600, 60).addComponent(Label);
label.string = 'Bold font regression: ABC 123 长文本 '.repeat(4);
label.fontFamily = 'sans-serif';
label.fontSize = 20;
label.isBold = true;
label.overflow = Label.Overflow.CLAMP;
label.color = new Color(255, 255, 255, 255);
const buttonNode = node('Button', 0, -180, 140, 50);
const buttonGraphic = buttonNode.addComponent(Graphics);
buttonGraphic.fillColor = new Color(255, 180, 30, 255);
buttonGraphic.rect(-70, -25, 140, 50);
buttonGraphic.fill();
buttonNode.addComponent(Button);
let clicks = 0;
buttonNode.on(Button.EventType.CLICK, () => clicks++);
app.run(scene);
game.pause();
const gl = app.canvas.getContext('webgl2');
function snapshot() {
    director.tick(1 / 60);
    const width = gl.drawingBufferWidth,
        height = gl.drawingBufferHeight;
    const bytes = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    const pixel = (x, y) =>
        Array.from(
            bytes.slice(
                (Math.round(((240 + y) * height) / 480) * width + Math.round(((320 + x) * width) / 640)) * 4,
                (Math.round(((240 + y) * height) / 480) * width + Math.round(((320 + x) * width) / 640)) * 4 + 4,
            ),
        );
    let textPixels = 0;
    for (let y = -115; y < -65; y++)
        for (let x = -290; x < 290; x++) {
            const p = pixel(x, y);
            if (p[0] > 160 && p[1] > 160 && p[2] > 160) textPixels++;
        }
    return {
        meshPixels: [pixel(-200, 145), pixel(-80, 145), pixel(-200, 35), pixel(-80, 35)],
        graphics: pixel(130, 130),
        textPixels,
        clicks,
        dimensions: [width, height],
    };
}
function dominant(p, c) {
    return p[c] > 180 && p[(c + 1) % 3] < 80 && p[(c + 2) % 3] < 80;
}
const first = snapshot();
check(
    'triangle and quad visible in both batching modes',
    first.meshPixels.every((p, i) => dominant(p, i % 2)),
    first,
);
for (let i = 0; i < 5; i++) {
    meshes[1].setMeshData(data(true, [0, 255, 0]));
    meshes[3].setMeshData(data(true, [0, 255, 0]));
    const stable = snapshot();
    check(
        `unchanged triangle sibling indices frame ${i}`,
        stable.meshPixels.every((p, j) => dominant(p, j % 2)),
        stable.meshPixels,
    );
}
check('long bold system label rendered', first.textPixels > 100, first.textPixels);
for (const mesh of [meshes[0], meshes[2]]) {
    mesh.node.setPosition(mesh.node.position.x + 30, mesh.node.position.y, 0);
    mesh.node.addComponent(UIOpacity).opacity = 128;
}
const transformed = snapshot();
check(
    'node translation moves triangle out of old sample',
    transformed.meshPixels[0][0] < 100 && transformed.meshPixels[2][0] < 100,
    transformed.meshPixels,
);
// Restore position but retain opacity to distinguish a real half-alpha draw from absence.
for (const mesh of [meshes[0], meshes[2]]) mesh.node.setPosition(mesh.node.position.x - 30, mesh.node.position.y, 0);
const faded = snapshot();
check(
    'cascaded opacity in both batching modes',
    [faded.meshPixels[0], faded.meshPixels[2]].every((p) => p[0] > 100 && p[0] < 180),
    faded.meshPixels,
);
drawGraphics(4);
snapshot();
drawGraphics(900);
const reused = snapshot();
check('Graphics grows and reuses visible geometry', reused.graphics[2] > 180, reused.graphics);
const rt = new RenderTexture();
const cap = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE));
rt.reset({ width: 16, height: 2 });
rt.resize(cap, 2);
check('RenderTexture accepts device-cap width above 2048', rt.width === cap && rt.height === 2 && cap > 2048, {
    requested: cap,
    width: rt.width,
    height: rt.height,
});
rt.destroy();
// Public gfx allocation and update, with native GPU readback as the independent oracle.
const buffer = director.root.device.createBuffer(
    new gfx.BufferInfo(gfx.BufferUsageBit.VERTEX | gfx.BufferUsageBit.TRANSFER_DST, gfx.MemoryUsageBit.DEVICE, 16, 4),
);
try {
    buffer.resize(64);
    const gpu = buffer.getGpuBuffer();
    const old = gl.getParameter(gl.COPY_READ_BUFFER_BINDING);
    gl.bindBuffer(gl.COPY_READ_BUFFER, gpu.glBuffer);
    const actual = gl.getBufferParameter(gl.COPY_READ_BUFFER, gl.BUFFER_SIZE);
    check('gfx resize metadata equals native allocation', actual === 64 && buffer.size === actual, {
        actual,
        size: buffer.size,
    });
    gl.bindBuffer(gl.COPY_READ_BUFFER, old);
    const backing = new Uint8Array([91, 92, 11, 22, 33, 44, 93, 94]);
    buffer.update(backing.subarray(2, 6));
    gl.bindBuffer(gl.COPY_READ_BUFFER, gpu.glBuffer);
    const read = new Uint8Array(4);
    gl.getBufferSubData(gl.COPY_READ_BUFFER, 0, read);
    gl.bindBuffer(gl.COPY_READ_BUFFER, old);
    check('typed subview uploads its own byte range', String(read) === '11,22,33,44', Array.from(read));
} finally {
    buffer.destroy();
}
window.cocos4Probe = {
    ready: true,
    checks,
    first,
    transformed,
    faded,
    reused,
    snapshot,
    finish() {
        const result = snapshot();
        check('native pointer dispatch reaches Button CLICK', clicks === 1, clicks);
        return {
            ok: checks.every((c) => c.pass),
            checks,
            result,
            errors: app.diagnostics.snapshot().filter((e) => e.severity === 'error'),
        };
    },
    async release() {
        return app.releaseScene();
    },
};
