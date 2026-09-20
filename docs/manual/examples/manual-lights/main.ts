/**
 * Cocos AIR 开发手册 — Lights（光源）
 * 配套文章：docs/manual/lights.md
 *
 * 四种光源组件轮流点亮同一颗球：DirectionalLight → PointLight → SpotLight → SphereLight，
 * 每 2.5s 切一次（Component.enabled 开关），覆盖层实时显示当前光型与关键属性。
 * 光源挂在自转 rig 下， Orbit 运动让明暗过渡每帧可见。
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
    update (dt: number): void {
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
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2; // 方向光强度单位：lux

const pointNode = new Node('PointLight');
pointNode.setPosition(new Vec3(2.6, 1.4, 0));
scene.addChild(pointNode);
const point = pointNode.addComponent(PointLight);
point.luminance = 40; // 点光强度实测可用口径：luminance（仓库 light-point 例同）
point.range = 8;

const spotNode = new Node('SpotLight');
spotNode.setPosition(new Vec3(0, 4.0, 0));
spotNode.lookAt(new Vec3(0, 0.9, 0));
scene.addChild(spotNode);
const spot = spotNode.addComponent(SpotLight);
spot.luminance = 120; // 仓库 light-spot 例同口径
spot.range = 12;
spot.size = 0.15;
spot.spotAngle = 40; // 锥角（度）

const sphereNode = new Node('SphereLight');
sphereNode.setPosition(new Vec3(-2.6, 1.4, 0));
scene.addChild(sphereNode);
const sphereLight = sphereNode.addComponent(SphereLight);
sphereLight.luminousFlux = 900;
sphereLight.range = 8;
sphereLight.size = 0.6; // 面积光尺寸：柔化阴影边界

// 开关走 node.active 而非 component.enabled：实测后者 off→on 之后光不再注册进渲染场景
const entries: [string, Node, string][] = [
    ['DirectionalLight', dirNode, 'illuminance=2 (lux), 方向=节点朝向'],
    ['PointLight', pointNode, 'luminance=40, range=8, 全向'],
    ['SpotLight', spotNode, 'luminance=120, spotAngle=40°, range=12'],
    ['SphereLight', sphereNode, 'luminousFlux=900 (lm), size=0.6, range=8'],
];

const info = document.querySelector('#info') as HTMLElement;
function showLight (idx: number): void {
    entries.forEach((e, i) => { e[1].active = (i === idx); });
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

    constructor () {
        super();
        this._t = 0;
        this._idx = -1;
    }
    update (dt: number): void {
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
