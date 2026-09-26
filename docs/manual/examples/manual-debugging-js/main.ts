/**
 * Cocos AIR 开发手册 — Debugging JavaScript（调试 JavaScript）
 * 配套文章：docs/manual/debugging-javascript.md
 *
 * 演示代码优先运行时的 JS 调试手段：
 *   - 运行时内省：director.getScene() + node.walk/children/components 打印场景图；
 *   - 覆盖层 dump：把场景图/世界坐标投到 DOM，便于无 devtools 时肉眼对账；
 *   - 守卫探针：把可疑调用包进 try/catch，把异常消息打到覆盖层而非让它未捕获崩溃；
 *   - window.__airApp / window.__debug 暴露给 devtools 控制台。
 * 立方体缓慢自转保证 frame-diff。
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
    director,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('debugging-javascript');

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

// ---- 立方体 + 子标记节点（演示层级内省）----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 1.0, 0));
scene.addChild(cubeNode);
const renderer = cubeNode.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
const material = new Material();
material.initialize({ effectName: 'builtin-standard' });
material.setProperty('mainColor', new Color(225, 165, 75, 255));
renderer.material = material;

const marker = new Node('Marker');
marker.layer = Layers.Enum.DEFAULT;
marker.setPosition(new Vec3(0, 0.9, 0));
cubeNode.addChild(marker);

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 20, 0);
    }
}
cubeNode.addComponent(Spinner);

// ---- 场景图内省 ----
const wp = new Vec3();
function graphLines(node: Node, depth: number, out: string[]): string[] {
    const comps = node.components.map((c) => c.constructor.name).join(',');
    node.getWorldPosition(wp);
    out.push(
        `${'  '.repeat(depth)}${node.name} [${comps || '-'}]` +
            ` @(${wp.x.toFixed(1)},${wp.y.toFixed(1)},${wp.z.toFixed(1)})`,
    );
    for (const child of node.children) graphLines(child, depth + 1, out);
    return out;
}
function dumpGraph(): void {
    const root = director.getScene() || scene;
    const lines = graphLines(root, 0, []);
    info.textContent = ['scene graph (director.getScene()):', ...lines].join('\n');
    console.log('[manual/debugging-js] scene graph:\n' + lines.join('\n'));
}

const info = document.querySelector('#info') as HTMLElement;

// ---- 守卫探针：可疑调用包 try/catch，异常打覆盖层不崩溃 ----
function guardedProbe(): void {
    let msg: string;
    try {
        // 故意调用不存在的方法，演示"把崩溃变成可读消息"
        cubeNode.thisMethodDoesNotExist();
        msg = 'probe: no error (unexpected)';
    } catch (e) {
        msg = `probe caught: ${e && e.name}: ${e && e.message}`;
    }
    info.textContent = msg + '\n(click "Dump scene graph" to restore)';
    console.log('[manual/debugging-js] ' + msg);
}

document.querySelector('#btn-probe')!.addEventListener('click', guardedProbe);
document.querySelector('#btn-dump')!.addEventListener('click', dumpGraph);

// 暴露给 devtools 控制台
window.__airApp = app;
window.__debug = { scene, cubeNode, marker, dumpGraph, guardedProbe };

app.run(scene);
dumpGraph();

console.log('[manual/debugging-javascript] running on cocosair');
