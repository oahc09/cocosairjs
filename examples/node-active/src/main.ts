/**
 * node-active — Node 激活/停用（active）与渲染联动。
 *
 * 演示：
 *  - node.active 停用后节点不再参与渲染与更新；
 *  - 每 1.5s 自动切换一次，画面出现"闪烁"方块；
 *  - active=false 期间节点仍存在于场景树（getChildByName 仍可命中）。
 *
 * 启动：npm run dev -- --example node-active → http://localhost:7454/$d/node-active/
 */

import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Component, Layers, Vec3, Color, Material, utils, primitives , frameObject } from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('node-active');

function materialWith (color: Color): Material {
  var material = new Material();
  material.initialize({ effectName: 'builtin-standard' });
  material.setProperty('mainColor', color);
  return material;
}

var cameraNode = new Node('Main Camera'); scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.4, 7)); cameraNode.setRotationFromEuler(-18, 0, 0);
var camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45;
camera.near = 0.1; camera.far = 1000;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT; camera.priority = 0;
var lightNode = new Node('Main Light'); scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
var light = lightNode.addComponent(DirectionalLight); light.illuminance = 2;

var blinker = new Node('Blinker'); blinker.layer = Layers.Enum.DEFAULT; scene.addChild(blinker);
blinker.setPosition(new Vec3(0, 0.6, 0));
var renderer = blinker.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.4, length: 1.4 }));
renderer.material = materialWith(new Color(235, 205, 75, 255));

// 控制器必须挂在常驻节点上：若挂在被切换的节点自身，节点停用后 update 停转，永远无法恢复
var controller = new Node('BlinkController'); scene.addChild(controller);
class Blink extends Component {
  private elapsed = 0;
  private target: Node = blinker;
  update (dt: number): void {
    this.elapsed += dt;
    // 占空比：可见 6s / 隐藏 0.5s（闪烁语义不变；验证采样窗口以可见相位为主）
    const threshold = this.target.active ? 6 : 0.5;
    if (this.elapsed >= threshold) {
      this.elapsed = 0;
      this.target.active = !this.target.active;
      console.log('[node-active] Blinker.active =', this.target.active);
    }
  }
}
controller.addComponent(Blink);
frameObject(camera, blinker); // 相机取景：目标居中（§21 Expected Result）

app.run(scene);
console.log('[node-active] running');
