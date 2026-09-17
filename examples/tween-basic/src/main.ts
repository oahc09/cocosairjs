import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Layers, Vec3, tween, TweenSystem, utils, primitives, builtinResMgr } from 'cocosair';
const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('tween-basic');
var cam = new Node('cam'); scene.addChild(cam);
cam.setPosition(new Vec3(0, 3, 9)); cam.setRotationFromEuler(-18, 0, 0);
cam.addComponent(Camera).visibility = Layers.Enum.DEFAULT;
var light = new Node('light'); scene.addChild(light);
light.setPosition(new Vec3(0, 8, 0)); light.setRotationFromEuler(-45, -30, 0);
light.addComponent(DirectionalLight).illuminance = 2;
var cube = new Node('tween-cube'); cube.layer = Layers.Enum.DEFAULT; scene.addChild(cube);
var r = cube.addComponent(MeshRenderer);
r.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
r.material = builtinResMgr.get('builtin-standard-material');
app.run(scene);
setInterval(function() {
  cube.setPosition(new Vec3(Math.sin(Date.now() / 1000) * 3, 0, 0));
}, 16);