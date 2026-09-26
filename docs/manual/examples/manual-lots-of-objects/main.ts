/**
 * Cocos AIR 开发手册 — Optimizing Lots of Objects（优化大量对象）
 * 配套文章：docs/manual/optimize-lots-of-objects.md
 *
 * 10×10 共 100 颗立方体共享同一份 mesh + 同一个 material（静态合批的前提），
 * 按钮切换 BatchingUtility.batchStaticModel / unbatchStaticModel：
 * 合批后 grid 下每个 MeshRenderer 被禁用，合并出的大 mesh 挂到 batchedRoot 上。
 * 相机绕场景缓慢公转，保证任意时刻画面都在变化（frame-diff）。
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
    BatchingUtility,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('lots-of-objects');

// ---- 相机（公转） ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 200;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(16, 20, 28, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-55, -35, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 4.5;

// ---- 100 颗立方体：共享 mesh + material，挂在 world/grid 下 ----
const GRID = 10;
const SPACING = 1.6;

const world = new Node('World');
scene.addChild(world);
const grid = new Node('Grid');
world.addChild(grid);
const batchedRoot = new Node('BatchedRoot');
world.addChild(batchedRoot);

const sharedMesh = utils.createMesh(primitives.box({ width: 1.0, height: 1.0, length: 1.0 }));
const sharedMaterial = new Material();
sharedMaterial.initialize({ effectName: 'builtin-standard' });
sharedMaterial.setProperty('mainColor', new Color(150, 215, 165, 255));

let cubeCount = 0;
for (let ix = 0; ix < GRID; ix++) {
    for (let iz = 0; iz < GRID; iz++) {
        const cubeNode = new Node(`Cube-${ix}-${iz}`);
        cubeNode.layer = Layers.Enum.DEFAULT;
        const x = (ix - (GRID - 1) / 2) * SPACING;
        const z = (iz - (GRID - 1) / 2) * SPACING;
        cubeNode.setPosition(new Vec3(x, 0.5, z));
        grid.addChild(cubeNode);
        const renderer = cubeNode.addComponent(MeshRenderer);
        renderer.mesh = sharedMesh;
        renderer.material = sharedMaterial;
        cubeCount++;
    }
}

// ---- 合批开关 ----
const btnBatch = document.querySelector('#btn-batch') as HTMLButtonElement;
let batched = false;
let batchResult = '—';
btnBatch.addEventListener('click', () => {
    try {
        if (!batched) {
            batchResult = `batchStaticModel → ${BatchingUtility.batchStaticModel(grid, batchedRoot)}`;
            batched = true;
        } else {
            batchResult = `unbatchStaticModel → ${BatchingUtility.unbatchStaticModel(grid, batchedRoot)}`;
            batched = false;
        }
    } catch (e) {
        batchResult = `error: ${e.name}: ${e.message}`;
    }
    btnBatch.textContent = `Batch: ${batched ? 'ON' : 'OFF'}`;
});

// ---- 相机公转 + 覆盖层 ----
const info = document.querySelector('#info') as HTMLElement;
class Orbit extends Component {
    private _angle = 30;

    constructor() {
        super();
        this._angle = 30;
    }
    update(dt: number): void {
        this._angle += dt * 12;
        const rad = (this._angle * Math.PI) / 180;
        const r = 19;
        this.node.setPosition(new Vec3(Math.sin(rad) * r, 8.5, Math.cos(rad) * r));
        this.node.lookAt(new Vec3(0, 0.5, 0));
        info.textContent = [
            `cubes: ${cubeCount} (${GRID}×${GRID}, shared mesh+material)`,
            `batched: ${batched ? 'ON' : 'OFF'}  (${batchResult})`,
            `orbit: ${this._angle.toFixed(0)}°`,
            'click [Batch] to toggle BatchingUtility.batchStaticModel',
        ].join('\n');
    }
}
cameraNode.addComponent(Orbit);

window.__airApp = app;
window.__inspect = { grid, batchedRoot, sharedMesh, sharedMaterial };
app.run(scene);

console.log('[manual/lots-of-objects] running on cocosair');
