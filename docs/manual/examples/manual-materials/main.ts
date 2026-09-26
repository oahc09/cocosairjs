/**
 * Cocos AIR 开发手册 — Materials（材质）
 * 配套文章：docs/manual/materials.md
 *
 * 三 cube 并排对比三种"材质配方"（同一光源下）：
 *   A builtin-unlit                    —— 不受光，纯主色平涂
 *   B builtin-standard                 —— PBR 受光（介电体）
 *   C builtin-standard + emissive      —— 自发光叠加
 * 关键纪律：共享 builtin 材质绝不原地改 —— 每个 cube 都 new Material() 独立实例。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    MeshRenderer,
    Material,
    Layers,
    Vec3,
    Color,
    utils,
    primitives,
} from 'cocosair';

const canvas = document.querySelector('#GameCanvas') as HTMLCanvasElement;
const app = await createAirApp({ canvas });

const scene = new Scene('materials');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 6.5));
cameraNode.lookAt(new Vec3(0, 0.6, 0));
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
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 12, length: 12 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(70, 90, 80, 255));
groundRenderer.material = groundMaterial;

function addCube(name: string, x: number, configure: (material: Material) => void): Material {
    const node = new Node(name);
    node.layer = Layers.Enum.DEFAULT;
    node.setPosition(new Vec3(x, 0.7, 0));
    scene.addChild(node);
    const renderer = node.addComponent(MeshRenderer);
    renderer.mesh = utils.createMesh(primitives.box({ width: 1.1, height: 1.1, length: 1.1 }));
    const material = new Material(); // 独立实例：改属性不污染任何其他使用者
    configure(material);
    renderer.material = material;
    return material;
}

// A：unlit —— 没有光照项，主色平涂（UI/纯色标记常用）
const matA = addCube('A-unlit', -2.2, (m) => {
    m.initialize({ effectName: 'builtin-unlit' });
    m.setProperty('mainColor', new Color(230, 120, 60, 255));
});

// B：standard 介电体 —— 漫反射 + 粗糙度高光
const matB = addCube('B-standard', 0, (m) => {
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', new Color(90, 200, 220, 255));
    m.setProperty('metallic', 0.0);
    m.setProperty('roughness', 0.35);
});

// C：standard + 自发光 —— emissive 不依赖光源
const matC = addCube('C-emissive', 2.2, (m) => {
    m.initialize({ effectName: 'builtin-standard' });
    m.setProperty('mainColor', new Color(60, 60, 80, 255));
    m.setProperty('emissive', new Color(240, 90, 160, 255));
    m.setProperty('emissiveScale', new Vec3(1.5, 1.5, 1.5));
});

window.__airApp = app;
app.run(scene);

// ============ 覆盖层：材质配方 ============
(document.querySelector('#info') as HTMLElement).textContent = [
    'materials: same light, three recipes',
    `A builtin-unlit            effect=${matA.effectName}`,
    `B builtin-standard         effect=${matB.effectName}`,
    `C builtin-standard+emissive effect=${matC.effectName}`,
    'shared builtins never mutated: new Material() per cube',
].join('\n');

console.log('[manual/materials] running on cocosair');
