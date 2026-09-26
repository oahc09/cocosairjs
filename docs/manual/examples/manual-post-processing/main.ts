/**
 * Cocos AIR 开发手册 — How to use Post Processing（后处理）
 * 配套文章：docs/manual/how-to-use-post-processing.md
 *
 * 实测相机上的后处理开关：camera.usePostProcess（bool）与 camera.postProcess（实例槽位）。
 * PostProcess 组件与效果设置类已在 `postProcess` 命名空间导出（V1.2 custom-pipeline 出口），
 * 但效果应用的像素级证据未证实（G4 探针：装配零报错、A/B 对照不可归因）——见文章 §2/§4。
 * 本篇只演示开关与槽位读回；每 3s 切换 usePostProcess 做 A/B；立方体自转保证 frame-diff。
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

const scene = new Scene('post-processing');

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

// ---- 立方体 ----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 1.0, 0));
scene.addChild(cubeNode);
const renderer = cubeNode.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
material.setProperty('mainColor', new Color(205, 95, 205, 255));
renderer.material = material;

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}
cubeNode.addComponent(Spinner);

// ---- 后处理开关读回 ----
const ppInitial = camera.postProcess;
const ppType = ppInitial === null ? 'null' : typeof ppInitial;

class Cycler extends Component {
    private _t = 0;
    private _on = false;

    constructor() {
        super();
        this._t = 0;
        this._on = false;
    }
    update(dt: number): void {
        this._t += dt;
        const on = Math.floor(this._t / 3) % 2 === 1;
        if (on !== this._on) {
            this._on = on;
            camera.usePostProcess = on;
        }
        info.textContent = [
            'post-process: camera.usePostProcess toggles every 3s',
            `now: usePostProcess=${camera.usePostProcess}`,
            `camera.postProcess slot: ${ppType} (empty slot; settings classes in postProcess namespace)`,
            'effect application unproven (pixel A/B inconclusive) — see article §2/§4',
        ].join('\n');
    }
}
const info = document.querySelector('#info') as HTMLElement;
cameraNode.addComponent(Cycler);

window.__airApp = app;
app.run(scene);

console.log('[manual/post-processing] running on cocosair');
