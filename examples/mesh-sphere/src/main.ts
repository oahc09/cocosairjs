/**
 * mesh-sphere — 球体图元 + 标准材质 + 慢速自转（E001 basic-cube 同构）
 *
 * 纯 Code First：无 Creator、无 .scene。canvas id 必须为 'GameCanvas'（sys 按此查找画布）。
 */
import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Component, Layers, Vec3, Color, Material, utils, primitives } from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('mesh-sphere');

function materialWith(color: Color): Material {
  var material = new Material();
  material.initialize({ effectName: 'builtin-standard' });
  material.setProperty('mainColor', color);
  return material;
}

class Rotator extends Component {
  update (dt: number): void {
    this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 45, 0);
  }
}

var cameraNode = new Node('Main Camera'); scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.4, 6.5)); cameraNode.setRotationFromEuler(-20, 0, 0);
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45;
camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT; camera.priority = 0;
var lightNode = new Node('Main Light'); scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight); light.illuminance = 2;
var sphere = new Node('sphere'); sphere.layer = Layers.Enum.DEFAULT; scene.addChild(sphere);
sphere.setPosition(new Vec3(0, 0.6, 0));
var sphereRenderer = sphere.addComponent(MeshRenderer);
sphereRenderer.mesh = utils.createMesh(primitives.sphere(0.8));
sphereRenderer.material = materialWith(new Color(65, 155, 235, 255));
sphere.addComponent(Rotator);

app.run(scene);
console.log('[mesh-sphere] running');
