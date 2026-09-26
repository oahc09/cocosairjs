/**
 * tween-basic — tween() 补间动画：位置往返的完整补间链。
 *
 * 演示：tween(target).to(...).to(..., {onComplete}) 组成往返补间，
 * onComplete 自续接实现循环；缓动函数 sineInOut。
 */

import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Layers,
    Vec3,
    tween,
    utils,
    primitives,
    builtinResMgr,
} from 'cocosair';

const app = await createAirApp({ canvas: '#GameCanvas' });
window.__airApp = app; // 开发面板/agent session 显式绑定入口（V0.5.1 T5）
const scene = new Scene('tween-basic');
var cam = new Node('cam');
scene.addChild(cam);
cam.setPosition(new Vec3(0, 3, 9));
cam.lookAt(new Vec3(0, 0, 0));
cam.addComponent(Camera).visibility = Layers.Enum.DEFAULT;
var light = new Node('light');
scene.addChild(light);
light.setPosition(new Vec3(0, 8, 0));
light.setRotationFromEuler(-45, -30, 0);
light.addComponent(DirectionalLight).illuminance = 50000;
var cube = new Node('tween-cube');
cube.layer = Layers.Enum.DEFAULT;
scene.addChild(cube);
cube.setPosition(new Vec3(-3, 0, 0));
var r = cube.addComponent(MeshRenderer);
r.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
r.material = builtinResMgr.get('builtin-standard-material');

function pingpong(): void {
    tween(cube)
        .to(1.2, { position: new Vec3(3, 0, 0) }, { easing: 'sineInOut' })
        .to(1.2, { position: new Vec3(-3, 0, 0) }, { easing: 'sineInOut', onComplete: pingpong })
        .start();
}
pingpong();

app.run(scene);
