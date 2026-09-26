/**
 * Cocos AIR 开发手册 — Fundamentals（基本概念）
 * 配套文章：docs/manual/fundamentals.md
 *
 * 一个"全景注释版"的最小场景，把 AIR 的四个核心概念各占一段命名注释：
 *   App      —— createAirApp 返回的运行时入口（run / getScene / canvas）
 *   Scene    —— 节点树的根容器
 *   Node     —— 变换载体（位置/旋转/缩放 + 父子层级）
 *   Component—— 挂在 Node 上的行为/渲染单元（Camera / Light / MeshRenderer / 自定义）
 *
 * 额外放一个"子 cube"挂在旋转 cube 下，演示层级继承：父转子随。
 * 覆盖层打印运行时的 App→Scene→Node→Component 树，和代码一一对应。
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

// ============ App：运行时入口 ============
const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

// ============ Scene：节点树根容器 ============
const scene = new Scene('fundamentals');

// ============ Node + Component：相机 ============
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(3.4, 2.6, 4.6));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(20, 26, 38, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ============ Node + Component：平行光 ============
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ============ Node + Component：地面 ============
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

// ============ Node + Component：自转 cube（父） ============
const cubeNode = new Node('Spinning Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
cubeNode.setPosition(new Vec3(0, 0.8, 0));
scene.addChild(cubeNode);
const cubeRenderer = cubeNode.addComponent(MeshRenderer);
cubeRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
const cubeMaterial = new Material();
cubeMaterial.initialize({ effectName: 'builtin-standard' });
cubeMaterial.setProperty('mainColor', new Color(230, 130, 50, 255));
cubeRenderer.material = cubeMaterial;

// 自定义 Component：逐帧更新是 AIR 的"动画"入口
class Rotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 45, 0);
    }
}
cubeNode.addComponent(Rotator);

// ============ 层级：子 cube 挂在父 cube 下，继承父变换 ============
const childNode = new Node('Child Cube');
childNode.layer = Layers.Enum.DEFAULT;
childNode.setPosition(new Vec3(0, 1.1, 0)); // 相对父节点的局部坐标
cubeNode.addChild(childNode);
const childRenderer = childNode.addComponent(MeshRenderer);
childRenderer.mesh = utils.createMesh(primitives.box({ width: 0.4, height: 0.4, length: 0.4 }));
const childMaterial = new Material();
childMaterial.initialize({ effectName: 'builtin-standard' });
childMaterial.setProperty('mainColor', new Color(90, 200, 220, 255));
childRenderer.material = childMaterial;

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：打印运行时结构树 ============
function describe(node: Node, depth: number): string {
    const comps = node.components.map((c) => c.constructor.name).join('+');
    let out = `${'  '.repeat(depth)}${node.name} [${comps || 'no-component'}]`;
    for (const child of node.children) {
        out += '\n' + describe(child, depth + 1);
    }
    return out;
}
(document.querySelector('#info') as HTMLElement).textContent = [
    'App → Scene → Node → Component',
    `app.canvas: ${app.canvas.width}x${app.canvas.height}`,
    describe(scene, 0),
].join('\n');

console.log('[manual/fundamentals] running on cocosair');
