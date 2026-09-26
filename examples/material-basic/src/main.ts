import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Layers,
    Vec3,
    utils,
    primitives,
    builtinResMgr,
} from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('material-basic');
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
var colors = ['#ff4444', '#44ff44', '#4444ff'];
for (var i = 0; i < 3; i++) {
    var cube = new Node('cube-' + i);
    cube.layer = Layers.Enum.DEFAULT;
    cube.setPosition(new Vec3((i - 1) * 2.5, 0, 0));
    scene.addChild(cube);
    var r = cube.addComponent(MeshRenderer);
    r.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
    r.material = builtinResMgr.get('builtin-standard-material');
}
app.run(scene);
window.__airApp = app; // 开发面板/agent session 显式绑定入口（V0.5.1 T5）
