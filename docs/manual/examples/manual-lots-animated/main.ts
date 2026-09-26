/**
 * Cocos AIR 开发手册 — Optimizing Lots of Objects Animated（优化大量动画对象）
 * 配套文章：docs/manual/optimize-lots-of-objects-animated.md
 *
 * 20×20 = 400 颗立方体做正弦波场动画：不给每颗立方体挂组件，
 * 由单个 WaveField 管理组件持 Float32Array（基准坐标 + 相位）在 update 里集中写 setPosition——
 * 数据化布局把每帧逻辑成本收敛到一处，覆盖层实测该循环的毫秒开销。
 * 全部立方体共享同一份 mesh + 同一个 material；AIR 无用户面 InstancedMesh，
 * 这是"大量动态对象"当前可实测的最短路径（PARTIAL 归因见文章）。
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

const scene = new Scene('lots-animated');

// ---- 相机（固定斜视） ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(13.0, 9.5, 13.0));
cameraNode.lookAt(new Vec3(0, 0.8, 0));
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

// ---- 400 颗立方体：共享 mesh + material ----
const GRID = 20;
const SPACING = 1.1;

const grid = new Node('Grid');
scene.addChild(grid);

const sharedMesh = utils.createMesh(primitives.box({ width: 0.8, height: 0.8, length: 0.8 }));
const sharedMaterial = new Material();
sharedMaterial.initialize({ effectName: 'builtin-standard' });
sharedMaterial.setProperty('mainColor', new Color(240, 175, 90, 255));

const cubes: Node[] = [];
const baseX = new Float32Array(GRID * GRID);
const baseZ = new Float32Array(GRID * GRID);
const phase = new Float32Array(GRID * GRID);
for (let ix = 0; ix < GRID; ix++) {
    for (let iz = 0; iz < GRID; iz++) {
        const i = ix * GRID + iz;
        const x = (ix - (GRID - 1) / 2) * SPACING;
        const z = (iz - (GRID - 1) / 2) * SPACING;
        baseX[i] = x;
        baseZ[i] = z;
        phase[i] = Math.sqrt(x * x + z * z) * 0.9;
        const cubeNode = new Node(`Cube-${i}`);
        cubeNode.layer = Layers.Enum.DEFAULT;
        cubeNode.setPosition(new Vec3(x, 0.5, z));
        grid.addChild(cubeNode);
        const renderer = cubeNode.addComponent(MeshRenderer);
        renderer.mesh = sharedMesh;
        renderer.material = sharedMaterial;
        cubes.push(cubeNode);
    }
}

// ---- 单个管理组件：数据化布局，集中写 400 个变换 ----
const info = document.querySelector('#info') as HTMLElement;
class WaveField extends Component {
    private _t = 0;
    private _frames = 0;
    private _emaMs = 0;
    private _v: Vec3;

    constructor() {
        super();
        this._t = 0;
        this._frames = 0;
        this._emaMs = 0;
        this._v = new Vec3();
    }
    update(dt: number): void {
        const t0 = performance.now();
        this._t += dt;
        this._frames++;
        for (let i = 0; i < cubes.length; i++) {
            const y = 0.6 + Math.sin(this._t * 2.0 - phase[i]) * 0.55;
            this._v.set(baseX[i], y, baseZ[i]);
            cubes[i].setPosition(this._v);
        }
        const ms = performance.now() - t0;
        this._emaMs = this._emaMs === 0 ? ms : this._emaMs * 0.9 + ms * 0.1;
        info.textContent = [
            `cubes: ${cubes.length} (${GRID}×${GRID} wave field, shared mesh+material)`,
            `manager: 1 component + Float32Array (no per-cube component)`,
            `update cost: ${this._emaMs.toFixed(2)} ms/frame (ema), frames: ${this._frames}, t=${this._t.toFixed(1)}s`,
            'AIR: no user InstancedMesh → data-driven single manager',
        ].join('\n');
    }
}
cameraNode.addComponent(WaveField);

window.__airApp = app;
window.__inspect = { grid, cubes };
app.run(scene);

console.log('[manual/lots-animated] running on cocosair');
