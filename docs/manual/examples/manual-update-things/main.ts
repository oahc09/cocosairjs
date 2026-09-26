/**
 * Cocos AIR 开发手册 — How to update Things（每帧更新）
 * 配套文章：docs/manual/how-to-update-things.md
 *
 * 三种每帧驱动同页对照：
 *  1) update(dt)：立方体 A 自转（dt 驱动，帧率无关）；
 *  2) lateUpdate(dt)：立方体 B 上下浮动（在全部 update 之后跑，覆盖层验证顺序）；
 *  3) this.schedule(cb, interval)：立方体 C 每 0.5s 脉冲缩放（调度器间隔回调，非每帧）。
 * 覆盖层打印 dt 统计（min/max/avg）、三类 tick 计数与 update→lateUpdate 顺序验证位。
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
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('update-things');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.0, 3.0, 6.4));
cameraNode.lookAt(new Vec3(0, 1.1, 0));
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

// ---- 共享 mesh/material ----
const cubeMesh = utils.createMesh(primitives.box({ width: 0.9, height: 0.9, length: 0.9 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(65, 155, 235, 255));

function makeCube(name: string, x: number): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, 1.0, 0));
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = cubeMesh;
    renderer.material = cubeMaterial;
    return node;
}

// ---- 统计 ----
const stats = {
    frames: 0,
    dtMin: Infinity,
    dtMax: 0,
    dtSum: 0,
    updateTicks: 0,
    lateTicks: 0,
    schedTicks: 0,
    orderOk: false,
    sawUpdateThisFrame: false,
};

// ---- 1) update(dt) 自转 ----
class SpinByUpdate extends Component {
    update(dt: number): void {
        stats.updateTicks++;
        stats.sawUpdateThisFrame = true;
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 60, 0);
    }
}

// ---- 2) lateUpdate(dt) 浮动 ----
class BobByLateUpdate extends Component {
    private _t = 0;
    constructor() {
        super();
        this._t = 0;
    }
    lateUpdate(dt: number): void {
        stats.lateTicks++;
        if (stats.sawUpdateThisFrame) stats.orderOk = true;
        stats.sawUpdateThisFrame = false;
        this._t += dt;
        this.node.setPosition(new Vec3(0, 1.0 + Math.sin(this._t * 2.0) * 0.45, 0));
    }
}

// ---- 3) schedule 间隔脉冲 ----
class PulseBySchedule extends Component {
    private _big = false;
    start(): void {
        this._big = false;
        this.schedule(this.pulse, 0.5);
    }
    pulse(): void {
        stats.schedTicks++;
        this._big = !this._big;
        const s = this._big ? 1.3 : 1.0;
        this.node.setScale(new Vec3(s, s, s));
    }
}

const cubeA = makeCube('A-update', -1.8);
cubeA.addComponent(SpinByUpdate);
const cubeB = makeCube('B-lateUpdate', 0);
cubeB.addComponent(BobByLateUpdate);
const cubeC = makeCube('C-schedule', 1.8);
cubeC.addComponent(PulseBySchedule);

// ---- 覆盖层 + dt 统计 ----
const info = document.querySelector('#info') as HTMLElement;
class Overseer extends Component {
    update(dt: number): void {
        stats.frames++;
        stats.dtMin = Math.min(stats.dtMin, dt);
        stats.dtMax = Math.max(stats.dtMax, dt);
        stats.dtSum += dt;
        info.textContent = [
            'drive: update(dt) spin | lateUpdate(dt) bob | schedule(cb, 0.5) pulse',
            `frames: ${stats.frames}  dt ms: min=${(stats.dtMin * 1000).toFixed(1)} max=${(stats.dtMax * 1000).toFixed(1)} avg=${((stats.dtSum / stats.frames) * 1000).toFixed(1)}`,
            `ticks: update=${stats.updateTicks} lateUpdate=${stats.lateTicks} schedule=${stats.schedTicks}`,
            `order update→lateUpdate verified: ${stats.orderOk}`,
        ].join('\n');
    }
}
cameraNode.addComponent(Overseer);

window.__airApp = app;
app.run(scene);

console.log('[manual/update-things] running on cocosair');
