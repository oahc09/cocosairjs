/**
 * light-two-directional — 主光 + 补光组合；点击画面循环主光强度 OFF→LOW→NORMAL。
 *
 * 演示：DirectionalLight.illuminance 三态切换（0 / 0.5 / 2），补光保证场景始终可辨。
 */
import { createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, PointLight, SpotLight, Component, input, Input, Layers, Vec3, Color, Material, utils, primitives } from 'cocosair';

var app = await createAirApp({ canvas: '#GameCanvas' });
(window as any).__airApp = app;
var scene = new Scene('light-two-directional');

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

// 主光：默认 NORMAL 强度；点击画面循环 OFF(0) → LOW(0.5) → NORMAL(2)
var keyNode = new Node('Key Light'); scene.addChild(keyNode);
keyNode.setPosition(new Vec3(0, 8, 0)); keyNode.setRotationFromEuler(-45, -30, 0);
var keyLight = keyNode.addComponent(DirectionalLight);
keyLight.illuminance = 2;

// 补光：弱蓝光从反方向填充，保证主光关闭时场景仍可辨
var fillNode = new Node('Fill Light'); scene.addChild(fillNode);
fillNode.setPosition(new Vec3(0, 4, -8)); fillNode.setRotationFromEuler(-10, 180, 0);
var fillLight = fillNode.addComponent(DirectionalLight);
fillLight.illuminance = 0.4;

var Subject = new Node('Subject'); Subject.layer = Layers.Enum.DEFAULT; scene.addChild(Subject);
Subject.setPosition(new Vec3(0, 0.6, 0));
var SubjectRenderer = Subject.addComponent(MeshRenderer);
SubjectRenderer.mesh = utils.createMesh(primitives.box({ width: 1.4, height: 1.2, length: 1.4 }));
SubjectRenderer.material = materialWith(new Color(235, 205, 75, 255));

var LEVELS: any[] = [
  { name: 'NORMAL', value: 2, sky: [30, 40, 60] },
  { name: 'LOW', value: 0.5, sky: [52, 56, 66] },
  { name: 'OFF', value: 0, sky: [96, 92, 84] },
];
var level = 0;
var stateEl = document.createElement('div');
stateEl.style.cssText = 'position:fixed;left:12px;top:10px;color:#9cd;font:13px monospace';
document.body.appendChild(stateEl);
function render() { stateEl.textContent = 'key light: ' + LEVELS[level].name + ' (' + LEVELS[level].value + ') — click to cycle'; }
render();

input.on(Input.EventType.TOUCH_START, function () {
  level = (level + 1) % LEVELS.length;
  keyLight.illuminance = LEVELS[level].value;
  camera.clearColor = new Color(LEVELS[level].sky[0], LEVELS[level].sky[1], LEVELS[level].sky[2], 255); // 天光随档位变化：画面确定性可观察
  render();
  (window as any).__lightState = LEVELS[level].name;
});

app.run(scene);
console.log('[light-two-directional] running');
