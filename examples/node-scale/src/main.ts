/**
 * node-scale — Node 缩放与父子缩放叠加。
 *
 * 演示：
 *  - setScale 设置本地缩放；
 *  - 父节点缩放会叠加到子节点（child world scale = parent × local）；
 *  - 非均匀缩放下子节点的世界形态。
 *
 * 启动：npm run dev -- --example node-scale → http://localhost:7454/$d/node-scale/
 */

import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Component, Layers, Vec3, Color, Material, utils, primitives , frameObject } from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('node-scale');

function materialWith (color: Color): Material {
  var material = new Material();
  material.initialize({ effectName: 'builtin-standard' });
  material.setProperty('mainColor', color);
  return material;
}

var cameraNode = new Node('Main Camera'); scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.4, 8)); cameraNode.setRotationFromEuler(-18, 0, 0);
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45;
camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT; camera.priority = 0;
var lightNode = new Node('Main Light'); scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight); light.illuminance = 2;

// 左：未缩放基准块；右：父块非均匀缩放（X 拉伸 2 倍），子块再叠加自身缩放
var base = new Node('Base'); base.layer = Layers.Enum.DEFAULT; scene.addChild(base);
base.setPosition(new Vec3(-2, 0.5, 0));
var baseRenderer = base.addComponent(MeshRenderer);
baseRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
baseRenderer.material = materialWith(new Color(95, 205, 120, 255));

var scaledParent = new Node('ScaledParent'); scaledParent.layer = Layers.Enum.DEFAULT; scene.addChild(scaledParent);
scaledParent.setPosition(new Vec3(2, 0.5, 0));
scaledParent.setScale(new Vec3(2, 1, 1));
var parentRenderer = scaledParent.addComponent(MeshRenderer);
parentRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
parentRenderer.material = materialWith(new Color(65, 155, 235, 255));

var child = new Node('ScaledChild'); child.layer = Layers.Enum.DEFAULT; scaledParent.addChild(child);
child.setPosition(new Vec3(0, 1, 0));
child.setScale(new Vec3(0.5, 0.5, 0.5));
var childRenderer = child.addComponent(MeshRenderer);
childRenderer.mesh = utils.createMesh(primitives.box({ width: 1, height: 1, length: 1 }));
childRenderer.material = materialWith(new Color(235, 125, 65, 255));

class Sway extends Component {
  update (dt: number): void {
    this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 25, 0);
  }
}
scaledParent.addComponent(Sway);
frameObject(camera, scene); // 相机取景：基准块与缩放块同框居中（§21 Expected Result）

app.run(scene);
console.log('[node-scale] running');
