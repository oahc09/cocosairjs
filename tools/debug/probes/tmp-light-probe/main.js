/* GAP-L1 复现页 — 光贡献诊断探针（tools/debug/probes 隔离，不登记 files.json，不进 Gallery/coverage）。
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
 * 运行：NODE_PATH=<playwright> node tools/verify/g1-trial-run.cjs --root=tools/debug/probes --ids=tmp-light-probe
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

probe.ready = false;
probe.ok = true;

// ---- HDR 量级对照实验（GAP-L1 根因判定）：全新 scene3，默认 ambient，自有灯光 ----
// 背景：isHDR 默认 true（pipeline-scene-data.ts:138），exposure = 1/38400（camera.ts:413）
// → LDR 量级 illuminance(1.2/8) × exposure ≈ 3e-5 = 不可见；65000 为组件 HDR 默认量级。
const scene3 = new Scene('tmp-light-probe-3');
const cam3Node = new Node('Main Camera');
scene3.addChild(cam3Node);
cam3Node.setPosition(new Vec3(0, 1.6, 6));
cam3Node.lookAt(new Vec3(0, 1, 0));
const cam3 = cam3Node.addComponent(Camera);
cam3.projection = Camera.ProjectionType.PERSPECTIVE;
cam3.fov = 45;
cam3.near = 0.1;
cam3.far = 100;
cam3.clearFlags = Camera.ClearFlag.SOLID_COLOR;
cam3.clearColor = new Color(30, 40, 60, 255);
cam3.visibility = Layers.Enum.DEFAULT;

const key3Node = new Node('Main Light');
scene3.addChild(key3Node);
key3Node.setPosition(new Vec3(0, 8, 0));
key3Node.setRotationFromEuler(-45, -30, 0);
const key3 = key3Node.addComponent(DirectionalLight);
key3.illuminance = 65000; // HDR 量级（组件默认值同款）

const box3 = new Node('SubjectBox');
box3.layer = Layers.Enum.DEFAULT;
scene3.addChild(box3);
box3.setPosition(new Vec3(0, 1, 0));
const ren3 = box3.addComponent(MeshRenderer);
ren3.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
const mat3 = new Material();
mat3.initialize({ effectName: 'builtin-standard' });
mat3.setProperty('mainColor', new Color(200, 200, 200, 255)); // 白盒：色相即光色
ren3.setSharedMaterial(mat3, 0);

app.run(scene3);
await sleep(800);
probe.samples.HDR_A_main65000_white = await sampleCenter();

// HDR-B：主光红色 @65000
key3.color = new Color(255, 40, 30, 255);
await sleep(400);
probe.samples.HDR_B_main65000_red = await sampleCenter();
key3.color = new Color(255, 255, 255, 255);

// HDR-C：主光关闭对照（active=false → Light.onDisable → detach）
key3Node.active = false;
await sleep(400);
probe.samples.HDR_C_mainOff = await sampleCenter();
key3Node.active = true;
await sleep(400);
probe.samples.HDR_C2_mainBackOn = await sampleCenter();

// HDR-D：点光源（默认 luminance 不覆写 = 组件 HDR 标定值；LDR 量级 900 为旧探针误用）
const pl3Node = new Node('PointLightProbe3');
pl3Node.layer = Layers.Enum.DEFAULT;
scene3.addChild(pl3Node);
pl3Node.setPosition(new Vec3(1.4, 1.6, 1.6));
const pl3 = pl3Node.addComponent(PointLight);
pl3.range = 10;
await sleep(400);
probe.samples.HDR_D_pointDefaultOn = await sampleCenter();
pl3Node.active = false;
await sleep(400);
probe.samples.HDR_E_pointOff = await sampleCenter();

// HDR-F：illuminance 动态范围（65000 → 20000，同场景同帧序）
key3.illuminance = 20000;
await sleep(400);
probe.samples.HDR_F_main20000 = await sampleCenter();

// ---- GAP-L1b 点光路运行时诊断（只读管线内部状态；先恢复点光激活——E 相位关闭后灯已 detach） ----
pl3Node.active = true;
pl3.luminance = 4 * 1700;
await sleep(400);
probe.samples.HDR_G_pointReactivated = await sampleCenter();
try {
    const root = director.root;
    const ppl = root.pipeline;
    const sd = ppl.pipelineSceneData;
    probe.info.vplCount = sd.validPunctualLights ? sd.validPunctualLights.length : 'n/a';
    const rs3 = scene3.renderScene;
    const plInternal = rs3.pointLights && rs3.pointLights[0];
    probe.info.internalPointLight = plInternal
        ? {
              type: plInternal.type,
              pos: [plInternal.position.x, plInternal.position.y, plInternal.position.z],
              range: plInternal.range,
              luminance: plInternal.luminance,
              color: [plInternal.color.x, plInternal.color.y, plInternal.color.z],
              baked: plInternal.baked,
          }
        : 'none';
    // ForwardStage._lightPasses（私有字段 JS 可及）
    const flows = ppl.flows || [];
    let stage = null;
    for (const f of flows) {
        for (const s of f.stages || []) {
            if (s.constructor.name === 'ForwardStage') {
                stage = s;
            }
        }
    }
    probe.info.forwardStageFound = !!stage;
    if (stage) {
        probe.info.lightPasses = stage._lightPasses ? stage._lightPasses.length : 'n/a';
        probe.info.additiveQueues = stage.additiveInstanceQueues ? stage.additiveInstanceQueues.length : 'n/a';
    }
    // subModel passes 相位
    const models = sd.renderObjects || [];
    if (models.length) {
        const sm = models[0].model.subModels[0];
        probe.info.subModelPasses = sm.passes.map((p) => ({
            phase: p.phase,
            name: p.program && p.program.name ? String(p.program.name).slice(0, 40) : '?',
        }));
    }
} catch (e) {
    probe.info.plDiagErr = String(e.message || e);
}

// ---- GAP-L1c：additive queue 深探 ----
try {
    const ppl2 = director.root.pipeline;
    let stage2 = null;
    for (const f of ppl2.flows || []) {
        for (const st of f.stages || []) {
            if (st.constructor.name === 'ForwardStage') {
                stage2 = st;
            }
        }
    }
    const q = stage2 && stage2._additiveLightQueue;
    probe.info.queueFound = !!q;
    if (q) {
        probe.info.qLightPasses = q._lightPasses ? q._lightPasses.length : 'field-missing';
        probe.info.qBufferHead = q._lightBufferData
            ? Array.from(q._lightBufferData.slice(0, 12)).map((v) => Math.round(v * 1000) / 1000)
            : 'field-missing';
        probe.info.qStride = q._lightBufferStride;
        let recCalls = 0;
        let drawCalls = 0;
        const origRec = q.recordCommandBuffer.bind(q);
        q.recordCommandBuffer = function (...a) {
            recCalls++;
            return origRec(...a);
        };
        await sleep(400);
        probe.info.qRecordCallsIn400ms = recCalls;
        probe.info.qLightPassesAfter = q._lightPasses ? q._lightPasses.length : 'field-missing';
    }
    const cc = await import('/build/cocosair.module.js');
    probe.info.cclegacyRendering = typeof cc.legacyCC !== 'undefined' && cc.legacyCC.rendering ? 'present' : 'absent';
} catch (e) {
    probe.info.qErr = String(e.message || e);
}

probe.ready = true;
probe.ok = true;
