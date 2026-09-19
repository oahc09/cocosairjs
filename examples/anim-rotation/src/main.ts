/**
 * anim-rotation — 程序化旋转动画：欧拉角逐帧累加。
 *
 * 演示：update 中按 dt 累加 Y 轴欧拉角，形成稳定匀速自转。
 */

import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Component, Layers, Vec3, Color, Material, utils, primitives } from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('anim-rotation');

function materialWith (color: Color): Material {
  var material = new Material();
  material.initialize({ effectName: 'builtin-standard' });
  material.setProperty('mainColor', color);
  return material;
}

var cameraNode = new Node('Main Camera'); scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.6, 7.5)); cameraNode.lookAt(new Vec3(0, 0.6, 0));
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45;
camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT; camera.priority = 0;
var lightNode = new Node('Main Light'); scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight); light.illuminance = 2;

var spinner = new Node('Spinner'); spinner.layer = Layers.Enum.DEFAULT; scene.addChild(spinner);
spinner.setPosition(new Vec3(0, 0.6, 0));
var renderer = spinner.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.2, height: 1.2, length: 1.2 }));
renderer.material = materialWith(new Color(235, 125, 65, 255));

class YawSpinner extends Component {
  update (dt: number): void {
    this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 90, 0);
  }
}
spinner.addComponent(YawSpinner);

app.run(scene);
console.log('[anim-rotation] running');
