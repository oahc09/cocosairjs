/* GAP-L1 复现页 — 光贡献诊断探针（staging 隔离，不登记 files.json，不进 Gallery/coverage）。
 *
 * 结论（2026-09-25 实测，chromium headless ANGLE/SwiftShader，bundle 9376e3062269376c）：
 * - 点光源（PointLight）：静态创建/属性变更/active 开关 → 中心像素全程 [7,22,83,255] 零变化；
 * - 主方向光（DirectionalLight）：illuminance 1.2→8、color→纯红、新场景静态红光 → 像素零变化/无红色调；
 * - 对照组 1（材质 uniform）：mainColor 变更 → 像素立即变化 [41,15,7]（材质路径正常）；
 * - 对照组 2（SceneGlobals ambient）：skyColorHDR.set 原位变更 → 像素显著变化（绿偏 [19,75,19]）；
 * - renderScene._pointLights 已注册（count=1）、管线为 ForwardPipeline。
 * 判定：主光/点光的视觉贡献与其属性运行期同步在该快照不可观察（GAP-L1）。
 * 证据：docs/evidence/g1-light-contribution-gap.json；登记：docs/api-scenario-gap-matrix.md §7。
 *
 * 运行：NODE_PATH=<playwright> node tools/verify/g1-trial-run.cjs --root=ai/g1-staging --ids=tmp-light-probe
 */
import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    PointLight,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
    director,
    Director,
} from 'cocosair';

const probe = { id: 'tmp-light-probe', ready: false, ok: true, checks: [], samples: {}, info: {} };
window.__trialProbe = probe;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sampleCenter() {
    return new Promise((resolve, reject) => {
        const canvas = document.getElementById('GameCanvas');
        const timer = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            reject(new Error('no frame'));
        }, 8000);
        function onDraw() {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            clearTimeout(timer);
            const snap = document.createElement('canvas');
            snap.width = canvas.width;
            snap.height = canvas.height;
            const ctx = snap.getContext('2d');
            ctx.drawImage(canvas, 0, 0);
            const d = ctx.getImageData(snap.width >> 1, snap.height >> 1, 1, 1).data;
            resolve([d[0], d[1], d[2], d[3]]);
        }
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
}

const app = await createAirApp({ canvas: '#GameCanvas' });
window.__airApp = app;
const scene = new Scene('tmp-light-probe');

const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 6));
cameraNode.lookAt(new Vec3(0, 1, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
camera.priority = 0;

const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
const keyLight = lightNode.addComponent(DirectionalLight);
keyLight.illuminance = 1.2;

const box = new Node('SubjectBox');
box.layer = Layers.Enum.DEFAULT;
scene.addChild(box);
box.setPosition(new Vec3(0, 1, 0));
const renderer = box.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
const mat = new Material();
mat.initialize({ effectName: 'builtin-standard' });
mat.setProperty('mainColor', new Color(70, 120, 235, 255));
renderer.setSharedMaterial(mat, 0);

// A：静态点光源（run 前建好，luminance 900）
const plNode = new Node('PointLightNode');
plNode.layer = Layers.Enum.DEFAULT;
scene.addChild(plNode);
plNode.setPosition(new Vec3(2, 2, 2));
const pl = plNode.addComponent(PointLight);
pl.luminance = 900;
pl.range = 12;

app.run(scene);
await sleep(800);
probe.samples.A_staticOn = await sampleCenter();

try {
    const rs = scene.renderScene;
    probe.info.pointLightCount = rs && rs.pointLights ? rs.pointLights.length : 'n/a';
} catch (e) {
    probe.info.rsErr = String(e.message || e);
}

pl.luminance = 0;
await sleep(400);
probe.samples.B_luminanceZero = await sampleCenter();
pl.luminance = 900;
await sleep(400);
probe.samples.C_luminanceBack = await sampleCenter();
plNode.active = false;
await sleep(400);
probe.samples.D_disabled = await sampleCenter();
plNode.active = true;
await sleep(400);
probe.samples.E_reenabled = await sampleCenter();
pl.luminance = 40;
pl.range = 8;
plNode.setPosition(new Vec3(0, 3.2, 0));
await sleep(400);
probe.samples.F_lightPointParams = await sampleCenter();

probe.info.pipelineName = director.root && director.root.pipeline ? director.root.pipeline.constructor.name : 'n/a';

keyLight.illuminance = 8;
await sleep(400);
probe.samples.G_keyLightBright = await sampleCenter();
keyLight.illuminance = 1.2;
await sleep(400);
probe.samples.H_keyLightBack = await sampleCenter();

// 判别实验：材质 uniform（对照，应生效） vs 光颜色 vs ambient
mat.setProperty('mainColor', new Color(235, 90, 40, 255));
await sleep(400);
probe.samples.I_materialChange = await sampleCenter();

keyLight.color = new Color(255, 0, 0, 255);
await sleep(400);
probe.samples.J_lightColorRed = await sampleCenter();

const amb = scene.globals.ambient;
probe.info.ambientBefore = [amb.skyColorHDR.x, amb.skyColorHDR.y, amb.skyColorHDR.z];
if (amb.skyColorHDR && amb.skyColorHDR.set) {
    amb.skyColorHDR.set(0.0, 1.0, 0.0, 1.0);
}
await sleep(400);
probe.samples.K_ambientGreen = await sampleCenter();

// L：新场景静态配置红色主光（判定「静态生效、动态失效」边界）
const scene2 = new Scene('tmp-light-probe-2');
const cam2Node = new Node('Main Camera');
scene2.addChild(cam2Node);
cam2Node.setPosition(new Vec3(0, 1.6, 6));
cam2Node.lookAt(new Vec3(0, 1, 0));
const cam2 = cam2Node.addComponent(Camera);
cam2.projection = Camera.ProjectionType.PERSPECTIVE;
cam2.fov = 45;
cam2.near = 0.1;
cam2.far = 100;
cam2.clearFlags = Camera.ClearFlag.SOLID_COLOR;
cam2.clearColor = new Color(30, 40, 60, 255);
cam2.visibility = Layers.Enum.DEFAULT;
const key2Node = new Node('Main Light');
scene2.addChild(key2Node);
key2Node.setPosition(new Vec3(0, 8, 0));
key2Node.setRotationFromEuler(-45, -30, 0);
const key2 = key2Node.addComponent(DirectionalLight);
key2.illuminance = 3;
key2.color = new Color(255, 60, 40, 255);
const box2 = new Node('SubjectBox');
box2.layer = Layers.Enum.DEFAULT;
scene2.addChild(box2);
box2.setPosition(new Vec3(0, 1, 0));
const ren2 = box2.addComponent(MeshRenderer);
ren2.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
const mat2 = new Material();
mat2.initialize({ effectName: 'builtin-standard' });
mat2.setProperty('mainColor', new Color(200, 200, 200, 255));
ren2.setSharedMaterial(mat2, 0);
app.run(scene2);
await sleep(800);
probe.samples.L_staticRedLightNewScene = await sampleCenter();

// M：ambient 引用内改（scene2）
try {
    const amb2 = scene2.globals.ambient;
    if (amb2.skyColorHDR && amb2.skyColorHDR.set) {
        amb2.skyColorHDR.set(0.0, 1.0, 0.0, 1.0);
    }
    await sleep(400);
    probe.samples.M_ambientMutated = await sampleCenter();
} catch (e) {
    probe.info.ambientMutateErr = String(e.message || e);
}

// N：mainLight 注册状态判定
try {
    const rs2 = scene2.renderScene;
    probe.info.mainLightIsNull = rs2._mainLight === null || rs2._mainLight === undefined;
    probe.info.mainLightCtor = rs2._mainLight ? rs2._mainLight.constructor.name : 'null';
    probe.info.directionalLights = rs2._directionalLights ? rs2._directionalLights.length : 'n/a';
} catch (e) {
    probe.info.nErr = String(e.message || e);
}

probe.ready = true;
probe.ok = true;
