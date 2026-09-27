/**
 * anim-position — 程序化位置动画：Component.update + 正弦轨迹。
 *
 * 演示：每帧用 dt 推进相位，方块沿 X 轴做正弦往复运动。
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Component,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
    frameObject,
} from 'cocosair';
import { installAssetLifecycle } from '../../shared/asset-lifecycle.js';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('anim-position');

function materialWith(color: Color): Material {
    var material = new Material();
    material.initialize({ effectName: 'builtin-standard' });
    material.setProperty('mainColor', color);
    return material;
}

var cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.6, 7.5));
cameraNode.setRotationFromEuler(-20, 0, 0);
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;
var lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight);
light.illuminance = 50000;

var mover = new Node('Mover');
mover.layer = Layers.Enum.DEFAULT;
scene.addChild(mover);
mover.setPosition(new Vec3(0, 0.6, 0));
var renderer = mover.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
renderer.material = materialWith(new Color(65, 155, 235, 255));

class SineMover extends Component {
    private t = 0;
    update(dt: number): void {
        this.t += dt;
        this.node.setPosition(Math.sin(this.t * 2) * 0.8, 0.6, 0);
    }
}
mover.addComponent(SineMover);
// 显式相机位姿：正弦运动带（x∈±0.8, y=0.6）位于画面中央
cameraNode.setPosition(new Vec3(0, 1.4, 4.8));
cameraNode.lookAt(new Vec3(0, 0.6, 0));

app.run(scene);
void import('./animation-contract.js')
    .then(async ({ verifyAnimationContract }) => {
        installAssetLifecycle(await verifyAnimationContract(scene));
    })
    .catch((error) => {
        if ((window as any).__trialProbe) {
            (window as any).__trialProbe.ready = true;
            (window as any).__trialProbe.error = String(error);
        }
        throw error;
    });
console.log('[anim-position] running');
