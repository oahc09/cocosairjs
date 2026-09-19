/**
 * mesh-cylinder — 圆柱图元（primitives.cylinder）+ 慢速自转
 *
 * 纯 Code First：无 Creator、无 .scene。canvas id 必须为 'GameCanvas'（sys 按此查找画布）。
 */
import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Component, Layers, Vec3, Color, Material, utils, primitives } from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('mesh-cylinder');

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
var cylinder = new Node('cylinder'); cylinder.layer = Layers.Enum.DEFAULT; scene.addChild(cylinder);
cylinder.setPosition(new Vec3(0, 0.9, 0));
var cylinderRenderer = cylinder.addComponent(MeshRenderer);
cylinderRenderer.mesh = utils.createMesh(primitives.cylinder(0.6, 0.6, 1.8));
cylinderRenderer.material = materialWith(new Color(205, 90, 190, 255));
cylinder.addComponent(Rotator);

app.run(scene);
console.log('[mesh-cylinder] running');
