/**
 * Cocos AIR 开发手册 — Custom BufferGeometry（自定义几何）
 * 配套文章：docs/manual/custom-buffergeometry.md
 *
 * 不用任何 primitives 生成器：手写 IGeometry 的四组数组（positions / normals / uvs / indices）
 * 造一张正弦波纹网格 y = 0.35·sin(1.6x)·cos(1.6z)，法线用解析偏导归一化求得，
 * 再经 utils.createMesh 变成可渲染 Mesh。覆盖层打印顶点/索引数自证数组规模。
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
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('custom-geometry');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 3.4, 5.2));
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 22, 30, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 一盏方向光让波纹明暗起伏 ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;

// ---- 手写 IGeometry：正弦波纹网格 ----
const AMP = 0.35;
const FREQ = 1.6;
const SEG = 24;
const HALF = 2.0;

function heightAt(x: number, z: number): number {
    return AMP * Math.sin(FREQ * x) * Math.cos(FREQ * z);
}

const positions: number[] = [];
const normals: number[] = [];
const uvs: number[] = [];
const indices: number[] = [];
for (let j = 0; j <= SEG; j++) {
    for (let i = 0; i <= SEG; i++) {
        const x = -HALF + (i / SEG) * HALF * 2;
        const z = -HALF + (j / SEG) * HALF * 2;
        positions.push(x, heightAt(x, z), z);
        // 解析法线：n = normalize(-df/dx, 1, -df/dz)
        const dfdx = AMP * FREQ * Math.cos(FREQ * x) * Math.cos(FREQ * z);
        const dfdz = -AMP * FREQ * Math.sin(FREQ * x) * Math.sin(FREQ * z);
        const len = Math.hypot(dfdx, 1, dfdz);
        normals.push(-dfdx / len, 1 / len, -dfdz / len);
        uvs.push(i / SEG, j / SEG);
    }
}
for (let j = 0; j < SEG; j++) {
    for (let i = 0; i < SEG; i++) {
        const a = j * (SEG + 1) + i;
        const b = a + 1;
        const c = a + (SEG + 1);
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
    }
}

const waveGeometry = {
    positions,
    normals,
    uvs,
    indices,
    minPos: new Vec3(-HALF, -AMP, -HALF),
    maxPos: new Vec3(HALF, AMP, HALF),
};

const waveNode = new Node('WaveGrid');
waveNode.layer = Layers.Enum.DEFAULT;
scene.addChild(waveNode);
const waveRenderer = waveNode.addComponent(MeshRenderer);
waveRenderer.mesh = utils.createMesh(waveGeometry);
const waveMaterial = new Material();
waveMaterial.initialize({ effectName: 'builtin-standard' });
waveMaterial.setProperty('mainColor', new Color(95, 205, 160, 255));
waveMaterial.setProperty('roughness', 0.5);
waveRenderer.material = waveMaterial;

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 20, 0);
    }
}
waveNode.addComponent(Spinner);

const info = document.querySelector('#info') as HTMLElement;
info.textContent = [
    'custom geometry: hand-written IGeometry (no primitives.*)',
    `verts: ${positions.length / 3}  indices: ${indices.length}  tris: ${indices.length / 3}`,
    'y = 0.35*sin(1.6x)*cos(1.6z), normals = analytic partials',
    'utils.createMesh(IGeometry) → MeshRenderer.mesh',
].join('\n');

window.__airApp = app;
app.run(scene);

console.log('[manual/custom-geometry] running on cocosair');
