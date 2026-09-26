/**
 * Cocos AIR 开发手册 — Creating a Scene（创建场景）
 * 配套文章：docs/manual/creating-a-scene.md
 *
 * 手册示例最小三件套：App（createAirApp）→ Scene → Camera + Light + Mesh。
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
} from 'cocosair';

// 每帧让 cube 自转：自定义组件的 update(dt) 是 AIR 的"逐帧更新"入口
class Rotator extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 45, 0);
    }
}

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('creating-a-scene');

// ---- 1. 相机：看到场景的窗口 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2, 6));
cameraNode.lookAt(new Vec3(0, 0, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT; // 4.0-alpha 默认 undefined，不设置就什么都不画
camera.priority = 0;

// ---- 2. 光源：让 standard 材质有明暗 ----
const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 10, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
const light = lightNode.addComponent(DirectionalLight);
light.illuminance = 2;

// ---- 3. 网格：几何 + 材质挂到 MeshRenderer ----
const cubeNode = new Node('Cube');
cubeNode.layer = Layers.Enum.DEFAULT;
scene.addChild(cubeNode);
const meshRenderer = cubeNode.addComponent(MeshRenderer);
meshRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
meshRenderer.material = builtinResMgr.get('builtin-standard-material');
cubeNode.addComponent(Rotator);

window.__airApp = app; // 每个手册示例末尾固定，供控制台探查与验证器使用
app.run(scene);

console.log('[manual/creating-a-scene] running on cocosair');
