/**
 * texture-basic — 程序化 checkerboard → ImageAsset → Texture2D → 材质 mainTexture。
 *
 * 演示：不依赖任何图片文件，用像素数据构建贴图并接到标准材质上。
 */

import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, Component, Layers, Vec3, Color, Material, Texture2D, ImageAsset, utils, primitives } from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('texture-basic');

// 1) 程序化 checkerboard 像素数据（8×8 棋盘格，64×64 分辨率）
var SIZE = 64;
var pixels = new Uint8Array(SIZE * SIZE * 4);
for (var y = 0; y < SIZE; y++) {
  for (var x = 0; x < SIZE; x++) {
    var i = (SIZE * y + x) * 4;
    var bright = ((x >> 3) + (y >> 3)) % 2 === 0;
    var v = bright ? 235 : 45;
    pixels[i] = v; pixels[i + 1] = v; pixels[i + 2] = v; pixels[i + 3] = 255;
  }
}

// 2) ImageAsset → Texture2D
var imageAsset = new ImageAsset({ width: SIZE, height: SIZE, _data: pixels, _compressed: false, format: Texture2D.PixelFormat.RGBA8888 });
var texture = new Texture2D();
texture.image = imageAsset;

// 3) 标准材质 + USE_ALBEDO_MAP define + mainTexture
var material = new Material();
material.initialize({ effectName: 'builtin-standard', defines: { USE_ALBEDO_MAP: true } });
material.setProperty('mainTexture', texture);

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

var texturedCube = new Node('TexturedCube'); texturedCube.layer = Layers.Enum.DEFAULT; scene.addChild(texturedCube);
texturedCube.setPosition(new Vec3(0, 0.5, 0));
var renderer = texturedCube.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
renderer.material = material;

class Spin extends Component {
  update (dt: number): void {
    this.node.setRotationFromEuler(0, this.node.eulerAngles.y + dt * 35, 0);
  }
}
texturedCube.addComponent(Spin);

app.run(scene);
console.log('[texture-basic] running');
