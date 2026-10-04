/**
 * Cocos AIR 开发手册 — Tips / Get Keyboard Input From a Canvas（画布键盘输入）
 * 配套文章：docs/manual/tips.md#get-keyboard-input-from-a-canvas-从画布获取键盘输入
 *
 * Web PAL 在聚焦的 canvas 上接收键盘，再派发给全局 input 单例。
 * createAirApp 设置可聚焦性；画布交互或显式 Start/Resume 聚焦后才接收按键。
 * 文本输入保留自己的焦点，不由游戏每帧抢回。
 * 本例维护一个 pressed 集合：WASD/方向键平移立方体、Space 加速自转，覆盖层实时回显；
 * 无按键时立方体仍空闲自转 20°/s，保证 frame-diff 有帧间差异。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Component,
    Layers,
    Vec3,
    Color,
    utils,
    primitives,
    input,
    SystemEventType,
    KeyCode,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('tips-keyboard');

// ---- 相机（斜视，保证三面受光 distinctColors>=3）----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.0, 3.0, 6.4));
cameraNode.lookAt(new Vec3(0, 1.0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 立方体 ----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 1.0, 0));
scene.addChild(cubeNode);
const renderer = cubeNode.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
material.setProperty('mainColor', new Color(120, 205, 150, 255));
renderer.material = material;

// ---- 键盘输入 ----
const KEY_NAMES = new Map<KeyCode, string>([
    [KeyCode.KEY_W, 'W'],
    [KeyCode.KEY_A, 'A'],
    [KeyCode.KEY_S, 'S'],
    [KeyCode.KEY_D, 'D'],
    [KeyCode.ARROW_UP, 'ArrowUp'],
    [KeyCode.ARROW_DOWN, 'ArrowDown'],
    [KeyCode.ARROW_LEFT, 'ArrowLeft'],
    [KeyCode.ARROW_RIGHT, 'ArrowRight'],
    [KeyCode.SPACE, 'Space'],
]);
const pressed = new Set<KeyCode>();
let lastKey = '(none)';

input.on(SystemEventType.KEY_DOWN, (e) => {
    pressed.add(e.keyCode);
    lastKey = KEY_NAMES.get(e.keyCode) || String(e.keyCode);
});
input.on(SystemEventType.KEY_UP, (e) => {
    pressed.delete(e.keyCode);
});

const info = document.querySelector('#info') as HTMLElement;
class KeyboardMover extends Component {
    update(dt: number): void {
        let dx = 0;
        let dz = 0;
        if (pressed.has(KeyCode.KEY_A) || pressed.has(KeyCode.ARROW_LEFT)) dx -= 1;
        if (pressed.has(KeyCode.KEY_D) || pressed.has(KeyCode.ARROW_RIGHT)) dx += 1;
        if (pressed.has(KeyCode.KEY_W) || pressed.has(KeyCode.ARROW_UP)) dz -= 1;
        if (pressed.has(KeyCode.KEY_S) || pressed.has(KeyCode.ARROW_DOWN)) dz += 1;
        const p = this.node.position;
        this.node.setPosition(p.x + dx * dt * 2, p.y, p.z + dz * dt * 2);
        // 空闲自转保证无按键时也有帧间差异（frame-diff）；Space 叠加更快自转
        const spin = pressed.has(KeyCode.SPACE) ? 90 : 20;
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * spin, 0);
        const names = [...pressed].map((k) => KEY_NAMES.get(k) || k).join(',');
        info.textContent = [
            'keyboard: WASD / arrows move, Space spins faster',
            `last key: ${lastKey}`,
            `pressed: ${names || '(none)'}`,
            `cube: (${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})`,
        ].join('\n');
    }
}
cubeNode.addComponent(KeyboardMover);

window.__airApp = app;
app.run(scene);

console.log('[manual/tips-keyboard] running on cocosair');
