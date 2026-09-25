/* 临时诊断探针（不进任何登记；诊断完成后删除）：点光源贡献路径。 */
import {
  createAirApp, Scene, Node, MeshRenderer, Camera, DirectionalLight, PointLight,
  Layers, Vec3, Color, Material, utils, primitives, director, Director,
} from 'cocosair';

const probe = { ready: false, samples: {}, info: {}, checks: [] };
(window).__trialProbe = probe;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sampleCenter () {
  return new Promise((resolve, reject) => {
    const canvas = document.getElementById('GameCanvas');
    const timer = setTimeout(() => { director.off(Director.EVENT_AFTER_DRAW, onDraw); reject(new Error('no frame')); }, 8000);
    function onDraw () {
      director.off(Director.EVENT_AFTER_DRAW, onDraw);
      clearTimeout(timer);
      const snap = document.createElement('canvas');
      snap.width = canvas.width; snap.height = canvas.height;
      const ctx = snap.getContext('2d');
      ctx.drawImage(canvas, 0, 0);
      const d = ctx.getImageData(snap.width >> 1, snap.height >> 1, 1, 1).data;
      resolve([d[0], d[1], d[2], d[3]]);
    }
    director.on(Director.EVENT_AFTER_DRAW, onDraw);
  });
}

const app = await createAirApp({ canvas: '#GameCanvas' });
(window).__airApp = app;
const scene = new Scene('tmp-light-probe');

const cameraNode = new Node('Main Camera'); scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 6)); cameraNode.lookAt(new Vec3(0, 1, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE; camera.fov = 45;
camera.near = 0.1; camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR; camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT; camera.priority = 0;

const lightNode = new Node('Main Light'); scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0)); lightNode.setRotationFromEuler(-45, -30, 0);
const keyLight = lightNode.addComponent(DirectionalLight); keyLight.illuminance = 1.2;

const box = new Node('SubjectBox'); box.layer = Layers.Enum.DEFAULT; scene.addChild(box);
box.setPosition(new Vec3(0, 1, 0));
const renderer = box.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
const mat = new Material();
mat.initialize({ effectName: 'builtin-standard' });
mat.setProperty('mainColor', new Color(70, 120, 235, 255));
renderer.setSharedMaterial(mat, 0);

// A：静态点光源（run 前建好，luminance 900）
const plNode = new Node('PointLightNode'); plNode.layer = Layers.Enum.DEFAULT; scene.addChild(plNode);
plNode.setPosition(new Vec3(2, 2, 2));
const pl = plNode.addComponent(PointLight);
pl.luminance = 900; pl.range = 12;

app.run(scene);
await sleep(800);
probe.samples.A_staticOn = await sampleCenter();

// 内部状态：renderScene 光源数组
try {
  const rs = scene.renderScene;
  probe.info.pointLightCount = rs && rs.pointLights ? rs.pointLights.length : 'n/a';
  probe.info.keys = rs ? Object.keys(rs).filter((k) => /[Ll]ight/.test(k)).slice(0, 10) : [];
} catch (e) { probe.info.rsErr = String(e.message || e); }

// B：luminance 归零
pl.luminance = 0;
await sleep(400);
probe.samples.B_luminanceZero = await sampleCenter();

// C：再拉回 900
pl.luminance = 900;
await sleep(400);
probe.samples.C_luminanceBack = await sampleCenter();

// D：active=false
plNode.active = false;
await sleep(400);
probe.samples.D_disabled = await sampleCenter();

// E：active=true
plNode.active = true;
await sleep(400);
probe.samples.E_reenabled = await sampleCenter();

// F：换用 light-point 同款参数（luminance 40，位置 (0,3.2,0)）
pl.luminance = 40; pl.range = 8;
plNode.setPosition(new Vec3(0, 3.2, 0));
await sleep(400);
probe.samples.F_lightPointParams = await sampleCenter();


probe.ok = true;

// ---- 追加诊断：方向光属性路径 / 管线身份 / 聚光灯 ----
probe.info.pipelineName = director.root && director.root.pipeline ? director.root.pipeline.constructor.name : 'n/a';

keyLight.illuminance = 8;
await sleep(400);
probe.samples.G_keyLightBright = await sampleCenter();

keyLight.illuminance = 1.2;
await sleep(400);
probe.samples.H_keyLightBack = await sampleCenter();
probe.ready = false;

// ---- 判别实验：材质 uniform（对照，应生效） vs 光颜色 vs 环境光 ----
mat.setProperty('mainColor', new Color(235, 90, 40, 255));
await sleep(400);
probe.samples.I_materialChange = await sampleCenter();

keyLight.color = new Color(255, 0, 0, 255);
await sleep(400);
probe.samples.J_lightColorRed = await sampleCenter();

const amb = scene.globals.ambient;
probe.info.ambientBefore = [amb.skyColorHDR.x, amb.skyColorHDR.y, amb.skyColorHDR.z];
if (amb.skyColorHDR && amb.skyColorHDR.set) { amb.skyColorHDR.set(0.0, 1.0, 0.0, 1.0); }
await sleep(400);
probe.samples.K_ambientGreen = await sampleCenter();
probe.info.ambientAfter = [amb.skyColorHDR.x, amb.skyColorHDR.y, amb.skyColorHDR.z];
probe.ready = false;

// ---- L：新场景静态配置红色主光（判定「静态生效、动态失效」边界） ----
const scene2 = new Scene('tmp-light-probe-2');
const cam2Node = new Node('Main Camera'); scene2.addChild(cam2Node);
cam2Node.setPosition(new Vec3(0, 1.6, 6)); cam2Node.lookAt(new Vec3(0, 1, 0));
const cam2 = cam2Node.addComponent(Camera);
cam2.projection = Camera.ProjectionType.PERSPECTIVE; cam2.fov = 45; cam2.near = 0.1; cam2.far = 100;
cam2.clearFlags = Camera.ClearFlag.SOLID_COLOR; cam2.clearColor = new Color(30, 40, 60, 255);
cam2.visibility = Layers.Enum.DEFAULT;
const key2Node = new Node('Main Light'); scene2.addChild(key2Node);
key2Node.setPosition(new Vec3(0, 8, 0)); key2Node.setRotationFromEuler(-45, -30, 0);
const key2 = key2Node.addComponent(DirectionalLight);
key2.illuminance = 3; key2.color = new Color(255, 60, 40, 255);
const box2 = new Node('SubjectBox'); box2.layer = Layers.Enum.DEFAULT; scene2.addChild(box2);
box2.setPosition(new Vec3(0, 1, 0));
const ren2 = box2.addComponent(MeshRenderer);
ren2.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
const mat2 = new Material(); mat2.initialize({ effectName: 'builtin-standard' });
mat2.setProperty('mainColor', new Color(200, 200, 200, 255));
ren2.setSharedMaterial(mat2, 0);
app.run(scene2);
await sleep(800);
probe.samples.L_staticRedLightNewScene = await sampleCenter();

// ---- M：ambient 引用内改（getter-only 属性的 in-place mutate 路径） ----
try {
  const amb2 = scene2.globals.ambient;
  if (amb2.skyColorHDR && amb2.skyColorHDR.set) { amb2.skyColorHDR.set(0.0, 1.0, 0.0, 1.0); }
  await sleep(400);
  probe.samples.M_ambientMutated = await sampleCenter();
} catch (e) { probe.info.ambientMutateErr = String(e.message || e); }
probe.ready = true;
