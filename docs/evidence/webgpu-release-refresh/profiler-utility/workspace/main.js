/**
 * Cocos AIR — v12-profiler-overlay（LV12-02）
 *
 * Code First 场景 + Profiler 系统面板：showStats() 后帧率/绘制调用等计数器叠加绘制在画面上。
 */

import {
    Layers,
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Component,
    builtinResMgr,
    utils,
    primitives,
    Vec3,
    Color,
    profiler,
    Profiler,
} from 'cocosair';

class Rotator extends Component {
    update(dt) {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 60, 0);
    }
}

const canvas = document.querySelector('#GameCanvas');
const app = await createAirApp({ canvas, renderer: 'webgpu' });

const scene = new Scene('v12-profiler-overlay');

const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(24, 32, 48, 255);
camera.visibility = Layers.Enum.DEFAULT;

const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 10, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 75000;

const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
scene.addChild(cubeNode);
const meshRenderer = cubeNode.addComponent(MeshRenderer);
meshRenderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
meshRenderer.material = builtinResMgr.get('builtin-standard-material');
cubeNode.addComponent(Rotator);

window.__airApp = app;
app.run(scene);

profiler.setBackgroundColor(new Color(20, 28, 40, 210));
profiler.setFontColor(Color.WHITE);
profiler.showStats();

// 自检：面板状态必须来自引擎 Profiler 系统本身（DOM 徽标只报告布尔值，数值仍由引擎面板绘制）
const overlayActive = profiler instanceof Profiler && profiler.isShowingStats();
const badge = document.querySelector('#ProfilerBadge');
if (badge) {
    badge.textContent = `Profiler overlay: ${overlayActive ? 'showing' : 'hidden'}`;
}

window.__probe = async () => {
    const stats = profiler.stats;
    const counters = {};
    for (const [k, v] of Object.entries(stats || {})) {
        counters[k] = {
            value: v && v.counter ? Number(v.counter.value.toFixed(2)) : null,
            enabled: !!(v && v.enabled),
        };
    }
    return { overlayActive, counters };
};
