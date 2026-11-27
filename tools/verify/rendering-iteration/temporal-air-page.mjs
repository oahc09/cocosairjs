import {
    Camera,
    Color,
    createAirApp,
    director,
    Director,
    Layers,
    macro,
    Material,
    MeshRenderer,
    Node,
    primitives,
    Scene,
    utils,
} from '/sdk.mjs';

const WIDTH = 160;
const HEIGHT = 96;
const SAMPLE = 4;
const WIDTH_PX = WIDTH * SAMPLE;
const HEIGHT_PX = HEIGHT * SAMPLE;
const canvas = document.querySelector('canvas');
macro.ENABLE_WEBGL_ANTIALIAS = false;
const app = await createAirApp({
    canvas,
    pixelRatioCap: 1,
    designResolution: { width: WIDTH_PX, height: HEIGHT_PX, policy: 0 },
});
const scene = new Scene('E12 temporal preflight');
scene.globals.postSettings.toneMappingType = 1;
const cameraNode = new Node('Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(0, 0, 100);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.ORTHO;
camera.orthoHeight = HEIGHT / 2;
camera.near = 1;
camera.far = 200;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(0, 0, 0, 255);
camera.visibility = Layers.Enum.DEFAULT;

const quad = utils.createMesh(primitives.quad());
const linearToSrgb = (value) =>
    Math.round((value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055) * 255);
function material(rgb) {
    const value = new Material();
    value.initialize({ effectName: 'builtin-unlit' });
    value.setProperty('mainColor', new Color(...rgb.map(linearToSrgb), 255));
    return value;
}
function group(name) {
    const node = new Node(name);
    scene.addChild(node);
    return node;
}
function rectangle(parent, x0, y0, x1, y1, z, mat) {
    const node = new Node('Quad');
    parent.addChild(node);
    node.setPosition((x0 + x1) / 2 - WIDTH / 2, HEIGHT / 2 - (y0 + y1) / 2, z);
    node.setScale(x1 - x0, y1 - y0, 1);
    const mesh = node.addComponent(MeshRenderer);
    mesh.mesh = quad;
    mesh.setMaterial(mat, 0);
    return node;
}
const back = group('Backdrop');
const colors = [
    [material([0.48, 0.23, 0.22]), material([0.64, 0.35, 0.22])],
    [material([0.21, 0.43, 0.21]), material([0.33, 0.59, 0.21])],
];
for (let yi = 0; yi < Math.ceil(HEIGHT / 11); yi++) {
    for (let xi = 0; xi < 17; xi++) {
        const first = xi * 13;
        const last = first + 13;
        const color = (xi + yi) % 2;
        if (first < 80) rectangle(back, first, yi * 11, Math.min(80, last), (yi + 1) * 11, 0, colors[0][color]);
        if (last > 80) rectangle(back, Math.max(80, first), yi * 11, last, (yi + 1) * 11, 0, colors[1][color]);
    }
}
const gate = group('Thin fence');
const gateMat = material([0.14, 0.15, 0.18]);
for (let x = 0; x < 220; x += 5.5) rectangle(gate, x, 18, x + 0.73, 80, 2, gateMat);

const mover = group('Moving disc');
const geometry = { positions: [0, 0, 0], indices: [] };
const segments = 192;
for (let i = 0; i < segments; i++) {
    const a = (Math.PI * 2 * i) / segments;
    geometry.positions.push(12 * Math.cos(a), 12 * Math.sin(a), 0);
    geometry.indices.push(0, i + 1, ((i + 1) % segments) + 1);
}
const mesh = mover.addComponent(MeshRenderer);
mesh.mesh = utils.createMesh(geometry);
mesh.setMaterial(material([1, 0.32, 0.05]), 0);

function position(index) {
    const cameraX = index < 8 ? index / 3 : 42 + (index - 8) / 3;
    back.setPosition(-cameraX * 0.55, 0, 0);
    gate.setPosition(-cameraX, 0, 0);
    mover.setPosition(28 + 5 * index - cameraX * 0.8 - WIDTH / 2, HEIGHT / 2 - 49, 1);
}
position(0);
const nextDraw = () => new Promise((resolve) => director.once(Director.EVENT_AFTER_DRAW, resolve));
const first = nextDraw();
app.run(scene);
await first;
window.renderTemporalFrame = async (index) => {
    if (!Number.isInteger(index) || index < 0 || index >= 16) throw new Error('Bad temporal frame');
    position(index);
    await nextDraw();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    return { index, framebuffer: [canvas.width, canvas.height], dpr: window.devicePixelRatio };
};
