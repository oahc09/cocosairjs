/**
 * Cocos AIR 开发手册 — Lights（光源）
 * 配套文章：docs/manual/lights.md
 *
 * 四种光源组件轮流点亮同一颗球：DirectionalLight → PointLight → SpotLight → SphereLight，
 * 每 2.5s 切一次（node.active 开关），覆盖层实时显示当前光型与关键属性。
 * 强度全部为 HDR 量级（isHDR 默认 true，见 lights.md §1 单位纪律；r53 GAP-L1 修复轮标定）。
 * 可视锚点 cube 在自转 rig 上公转，保证任意时刻画面持续变化（frame-diff 合同）。
 */

import {
    createAirApp,
    Scene,
    Node,
    Camera,
    DirectionalLight,
    PointLight,
    SpotLight,
    SphereLight,
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

const scene = new Scene('lights');

// ---- 相机 ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.0, 7.0));
cameraNode.lookAt(new Vec3(0, 0.9, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(16, 20, 28, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 地面 + 中心球 ----
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 16, length: 16 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(80, 95, 90, 255));
groundRenderer.material = groundMaterial;

const ballNode = new Node('Ball');
ballNode.layer = Layers.Enum.DEFAULT;
ballNode.setPosition(new Vec3(0, 0.9, 0));
scene.addChild(ballNode);
const ballRenderer = ballNode.addComponent(MeshRenderer);
ballRenderer.mesh = utils.createMesh(primitives.sphere(0.9, { widthSegments: 48, heightSegments: 24 }));
const ballMaterial = new Material();
ballMaterial.initialize({ effectName: 'builtin-standard' });
ballMaterial.setProperty('mainColor', new Color(220, 215, 205, 255));
ballMaterial.setProperty('roughness', 0.4);
ballRenderer.material = ballMaterial;

// ---- 自转 rig：光源挂它下面公转 ----
const rig = new Node('LightRig');
scene.addChild(rig);
class Spinner extends Component {
    update(dt: number): void {
        this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 40, 0);
    }
}
rig.addComponent(Spinner);

// 可视锚点：方向光阶段没有位置可言，靠这颗小 cube 的公转让动画可见
const markerNode = new Node('OrbitMarker');
markerNode.layer = Layers.Enum.DEFAULT;
markerNode.setPosition(new Vec3(0, 0.35, 2.4));
rig.addChild(markerNode);
const markerRenderer = markerNode.addComponent(MeshRenderer);
markerRenderer.mesh = utils.createMesh(primitives.box({ width: 0.3, height: 0.3, length: 0.3 }));
const markerMaterial = new Material();
markerMaterial.initialize({ effectName: 'builtin-unlit' });
markerMaterial.setProperty('mainColor', new Color(250, 200, 80, 255));
markerRenderer.material = markerMaterial;

// ---- 四种光源（同一时刻只 active 一个；直接挂 scene：实测挂旋转父节点下光不跟随） ----
// 单位纪律（r53，GAP-L1 修复轮标定）：isHDR 默认 true（exposure=1/38400），强度必须用 HDR 量级
// （illuminance/luminance ≈ 千级到数万）；LDR 量级（2/40/120）× exposure ≈ 0 = 视觉不可见。
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 30000; // HDR 量级（≈室内强照明；直射日光 ≈65000+）

const pointNode = new Node('PointLight');
pointNode.setPosition(new Vec3(2.6, 1.4, 0));
scene.addChild(pointNode);
const point = pointNode.addComponent(PointLight);
point.luminance = 1700; // 组件默认标定即 HDR 量级；近侧球面出现高光池
point.range = 8;

const spotNode = new Node('SpotLight');
spotNode.setPosition(new Vec3(0, 4.0, 0));
// 朝正下方用欧拉角，不要用 lookAt：视线 (0,-1,0) 与默认 up (0,1,0) 共线 → fromViewUp 万向锁退化，
// 旋转落回单位四元数、光锥水平射出打不到球（实测 internalSpot.dir=[0,0,-1]；r53 标定页复现）
spotNode.setRotationFromEuler(-90, 0, 0);
scene.addChild(spotNode);
const spot = spotNode.addComponent(SpotLight);
spot.luminance = 24000; // HDR 量级；spot 的 illum 按发光面积缩放（size²/d²），需要比 point 更高的 luminance
spot.range = 12;
spot.size = 0.15;
spot.spotAngle = 40; // 锥角（度）

const sphereNode = new Node('SphereLight');
sphereNode.setPosition(new Vec3(-2.6, 1.4, 0));
scene.addChild(sphereNode);
const sphereLight = sphereNode.addComponent(SphereLight);
sphereLight.luminousFlux = 900; // 光通量（lm）；球侧出现明亮补光
sphereLight.range = 8;
sphereLight.size = 0.6; // 面积光尺寸：柔化阴影边界

// 开关走 node.active 而非 component.enabled：实测后者 off→on 之后光不再注册进渲染场景
const entries: [string, Node, string][] = [
    ['DirectionalLight', dirNode, 'illuminance=30000 (HDR lux), 方向=节点朝向'],
    ['PointLight', pointNode, 'luminance=1700, range=8, 全向'],
    ['SpotLight', spotNode, 'luminance=24000, spotAngle=40°, range=12, 欧拉角朝下'],
    ['SphereLight', sphereNode, 'luminousFlux=900 (lm), size=0.6, range=8'],
];

const info = document.querySelector('#info') as HTMLElement;
function showLight(idx: number): void {
    entries.forEach((e, i) => {
        e[1].active = i === idx;
    });
    info.textContent = [
        'lights: cycling 4 types every 2.5s',
        `now: ${entries[idx][0]} — ${entries[idx][2]}`,
        'order: directional → point → spot → sphere',
        'rig orbits 40°/s; yellow marker shows the orbit',
    ].join('\n');
}

class Cycler extends Component {
    private _t: number;
    private _idx: number;

    constructor() {
        super();
        this._t = 0;
        this._idx = -1;
    }
    update(dt: number): void {
        this._t += dt;
        const idx = Math.floor(this._t / 2.5) % entries.length;
        if (idx !== this._idx) {
            this._idx = idx;
            showLight(idx);
        }
    }
}
rig.addComponent(Cycler);
showLight(0);

window.__airApp = app;
app.run(scene);

console.log('[manual/lights] running on cocosair');
