/**
 * material-color — Material.initialize + setProperty('mainColor') 设置材质主色。
 *
 * 演示：三个相同立方体仅 mainColor 不同，其余参数完全一致。
 */
import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Component, Layers, Vec3, Color, Material, utils, primitives } from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('material-color');

function materialWith (color: Color): Material {
  var material = new Material();
  material.initialize({ effectName: 'builtin-standard' });
  material.setProperty('mainColor', color);
  return material;
}

var cameraNode = new Node('Main Camera'); scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.6, 7.5)); cameraNode.setRotationFromEuler(-20, 0, 0);
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45;
camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT; camera.priority = 0;

var lightNode = new Node('Main Light'); scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight); light.illuminance = 2;

var COLORS: any = { Red: [235, 70, 70, 255], Green: [70, 200, 90, 255], Blue: [70, 120, 235, 255] };
var x = -2.4;
for (var name of Object.keys(COLORS)) {
  var node = new Node(name); node.layer = Layers.Enum.DEFAULT; scene.addChild(node);
  node.setPosition(new Vec3(x, 0.5, 0)); x += 2.4;
  var renderer = node.addComponent(MeshRenderer);
  renderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
  var material = new Material();
  material.initialize({ effectName: 'builtin-standard' });
  material.setProperty('mainColor', new Color(COLORS[name][0], COLORS[name][1], COLORS[name][2], 255));
  renderer.material = material;
}

app.run(scene);
console.log('[material-color] running');
