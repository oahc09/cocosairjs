/**
 * Cocos AIR 开发手册 — Scenegraph（场景图）
 * 配套文章：docs/manual/scenegraph.md
 *
 * 三层结构：Scene → Rig（旋转的父组）→ Arm-A / Arm-B（子）→ Tip（孙）。
 * 父组旋转带动全部后代；Tip 用 active=false 演示隐藏（覆盖层打印 active 标志）。
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

const scene = new Scene('scenegraph');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.2, 7.5));
cameraNode.lookAt(new Vec3(0, 0.8, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(18, 24, 34, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 光源 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 地面 ----
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 14, length: 14 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

function addCube(name: string, parent: Node, x: number, y: number, z: number, color: Color, size: number = 0.8): Node {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, y, z)); // 局部坐标：相对父节点
    parent.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: size, height: size, length: size }));
    const material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    renderer.material = material;
    return node;
}

// ---- 三层场景图：Rig 旋转 → 子臂继承 → 孙节点 Tip 隐藏 ----
const rig = new Node('Rig');
rig.layer = Layers.Enum.DEFAULT;
rig.setPosition(new Vec3(0, 1.0, 0));
scene.addChild(rig);

class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 30, 0);
    }
}
rig.addComponent(Spinner);

const armA = addCube('Arm-A', rig, -2, 0, 0, new Color(230, 120, 60, 255));
const armB = addCube('Arm-B', rig, 2, 0, 0, new Color(90, 200, 220, 255));
const tip = addCube('Tip', armB, 0, 1.2, 0, new Color(240, 210, 90, 255), 0.5);

// 隐藏孙节点：active=false 时自身与后代都不渲染、update 也不跑
tip.active = false;

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：层级与 active 标志 ============
const wp = armA.worldPosition;
(document.querySelector('#info') as HTMLElement).textContent = [
    'scenegraph: Scene → Rig → Arm-A / Arm-B → Tip',
    'Rig spins 30°/s; arms+tip inherit the transform',
    `Arm-A local(-2,0,0) world(${wp.x.toFixed(2)},${wp.y.toFixed(2)},${wp.z.toFixed(2)})`,
    `Tip active=${tip.active} activeInHierarchy=${tip.activeInHierarchy} (hidden)`,
].join('\n');

console.log('[manual/scenegraph] running on cocosair');
