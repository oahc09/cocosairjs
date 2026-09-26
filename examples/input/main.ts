/**
 * input — 键盘 / 鼠标 / 触摸交互（V0.5.1 T2）。
 *
 * 演示 input.on + Input.EventType：
 *  - KEY_DOWN/KEY_UP（WASD 平移方块）；
 *  - MOUSE_WHEEL（滚轮推拉相机）；
 *  - TOUCH_MOVE / MOUSE_MOVE（拖拽旋转方块）。
 *
 * 启动：npm run dev -- --example input → http://localhost:7454/$d/input/
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Component,
    input,
    Input,
    KeyCode,
    Layers,
    Vec2,
    utils,
    primitives,
    builtinResMgr,
    frameObject,
} from 'cocosair';
import { setupCamera, setupDirectionalLight } from '../shared/scene-kit.js';

const keys = new Set<number>();

class KeyboardMover extends Component {
    update(dt: number): void {
        let x = 0;
        let z = 0;
        if (keys.has(KeyCode.KEY_W)) {
            z -= 1;
        }
        if (keys.has(KeyCode.KEY_S)) {
            z += 1;
        }
        if (keys.has(KeyCode.KEY_A)) {
            x -= 1;
        }
        if (keys.has(KeyCode.KEY_D)) {
            x += 1;
        }
        if (x !== 0 || z !== 0) {
            this.node.setPosition(
                this.node.position.x + x * dt * 3,
                this.node.position.y,
                this.node.position.z + z * dt * 3,
            );
        }
    }
}

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('input-demo');
const camera = setupCamera(scene, { position: [0, 2.5, 7], rotationEuler: [-15, 0, 0] });
setupDirectionalLight(scene, { rotationEuler: [-45, -30, 0] });

const cube = new Node('interactive-cube');
cube.layer = Layers.Enum.DEFAULT;
scene.addChild(cube);
const renderer = cube.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
renderer.material = builtinResMgr.get('builtin-standard-material');
cube.addComponent(KeyboardMover);
frameObject(camera, cube); // 相机取景：目标居中（§21 Expected Result）

// ---- 键盘：WASD 平移（KEY_DOWN/KEY_UP 维护按键集合，避免依赖重复 keydown 频率）----
input.on(Input.EventType.KEY_DOWN, (event) => {
    keys.add(event.keyCode);
});
input.on(Input.EventType.KEY_UP, (event) => {
    keys.delete(event.keyCode);
});

// ---- 鼠标滚轮：推拉相机 ----
input.on(Input.EventType.MOUSE_WHEEL, (event) => {
    const pos = camera.node.position;
    const next = Math.min(20, Math.max(3, pos.z + event.getScrollY() * -0.01));
    camera.node.setPosition(pos.x, pos.y, next);
});

// ---- 拖拽（触摸或鼠标按下后移动）旋转方块 ----
let dragging = false;
let last: Vec2 = new Vec2();
const rotateBy = (delta: Vec2): void => {
    cube.setRotationFromEuler(cube.eulerAngles.x + delta.y * 0.5, cube.eulerAngles.y + delta.x * 0.5, 0);
};
input.on(Input.EventType.TOUCH_START, (event) => {
    dragging = true;
    event.getLocation(last);
});
input.on(Input.EventType.TOUCH_MOVE, (event) => {
    if (!dragging) {
        return;
    }
    const now = event.getLocation();
    rotateBy(new Vec2(now.x - last.x, now.y - last.y));
    event.getLocation(last);
});
input.on(Input.EventType.TOUCH_END, () => {
    dragging = false;
});
input.on(Input.EventType.TOUCH_CANCEL, () => {
    dragging = false;
});

window.__airApp = app; // 开发面板/agent session 显式绑定入口（V0.5.1 T5）
app.run(scene);
console.log('[input] running — WASD 平移 / 滚轮推拉 / 拖拽旋转');
