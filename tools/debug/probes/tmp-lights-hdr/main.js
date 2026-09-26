/* manual-lights HDR 量级标定探针（tools/debug/probes 隔离，不登记 files.json，不进 Gallery/coverage）。
 *
 * 目的：GAP-L1 修复（r53）后为 docs/manual/examples/manual-lights 校准四型光源的 HDR 量级参数，
 * 使每一相都有明确可视贡献且不整体饱和。场景与 manual-lights 完全同构（同相机/地面/球/灯位）。
 *
 * 流程：全灯关（ambient 基线）→ 逐相激活单灯并采样球心与地面像素：
 *   dir@{2,30000,65000} · point@{40,1700,8000,24000} · spot@{120,1700,8000,24000} · sphere@{900,8000,40000}
 * 判定（写入 checks，不 throw——标定页允许部分相不达标）：每个候选记录 delta 亮度。
 *
 * 运行：NODE_PATH=<playwright> node tools/verify/g1-trial-run.cjs --root=tools/debug/probes --ids=tmp-lights-hdr
 */
import {
    createAirApp,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    PointLight,
    SpotLight,
    SphereLight,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
    director,
    Director,
} from 'cocosair';

const probe = { id: 'tmp-lights-hdr', ready: false, ok: true, checks: [], state: {} };
window.__trialProbe = probe;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lum = (px) => 0.2126 * px[0] + 0.7152 * px[1] + 0.0722 * px[2];

function sampleAt(x, y) {
    return new Promise((resolve, reject) => {
        const canvas = document.getElementById('GameCanvas');
        const timer = setTimeout(() => {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            reject(new Error('no frame within 8s'));
        }, 8000);
        function onDraw() {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            clearTimeout(timer);
            try {
                const snap = document.createElement('canvas');
                snap.width = canvas.width;
                snap.height = canvas.height;
                const ctx = snap.getContext('2d');
                ctx.drawImage(canvas, 0, 0);
                const d = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
                resolve([d[0], d[1], d[2], d[3]]);
            } catch (e) {
                reject(e);
            }
        }
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
}

const app = await createAirApp({ canvas: '#GameCanvas' });
window.__airApp = app;
const scene = new Scene('lights-hdr-calib');

// ---- 相机（manual-lights 同构） ----
const cameraNode = new Node('Main Camera');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 2.0, 7.0));
cameraNode.lookAt(new Vec3(0, 0.9, 0));
const camera = cameraNode.addComponent(Camera);
camera.projection = Camera.ProjectionType.PERSPECTIVE;
camera.fov = 45;
camera.near = 0.1;
camera.far = 100;
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(16, 20, 28, 255);
camera.visibility = Layers.Enum.DEFAULT;

// ---- 地面 + 中心球（manual-lights 同参数） ----
const groundNode = new Node('Ground');
groundNode.layer = Layers.Enum.DEFAULT;
scene.addChild(groundNode);
const groundRenderer = groundNode.addComponent(MeshRenderer);
groundRenderer.mesh = utils.createMesh(primitives.plane({ width: 16, length: 16 }));
const groundMaterial = new Material();
groundMaterial.initialize({ effectName: 'builtin-standard' });
groundMaterial.setProperty('mainColor', new Color(80, 95, 90, 255));
groundRenderer.material = groundMaterial;

const ballNode = new Node('Ball');
ballNode.layer = Layers.Enum.DEFAULT;
ballNode.setPosition(new Vec3(0, 0.9, 0));
scene.addChild(ballNode);
const ballRenderer = ballNode.addComponent(MeshRenderer);
ballRenderer.mesh = utils.createMesh(primitives.sphere(0.9, { widthSegments: 48, heightSegments: 24 }));
const ballMaterial = new Material();
ballMaterial.initialize({ effectName: 'builtin-standard' });
ballMaterial.setProperty('mainColor', new Color(220, 215, 205, 255));
ballMaterial.setProperty('roughness', 0.4);
ballRenderer.material = ballMaterial;

// ---- 四灯（manual-lights 同灯位；全部初始关闭） ----
const dirNode = new Node('DirLight');
dirNode.setRotationFromEuler(-50, -30, 0);
scene.addChild(dirNode);
const dir = dirNode.addComponent(DirectionalLight);
dir.illuminance = 2;
dirNode.active = false;

const pointNode = new Node('PointLight');
pointNode.setPosition(new Vec3(2.6, 1.4, 0));
scene.addChild(pointNode);
const point = pointNode.addComponent(PointLight);
point.luminance = 40;
point.range = 8;
pointNode.active = false;

const spotNode = new Node('SpotLight');
spotNode.setPosition(new Vec3(0, 4.0, 0));
spotNode.setRotationFromEuler(-90, 0, 0); // 朝正下方（-Y）：避开 lookAt 正上→正下的万向锁退化（原 manual-lights 用 lookAt 导致光锥水平、打不到球）
scene.addChild(spotNode);
const spot = spotNode.addComponent(SpotLight);
spot.luminance = 120;
spot.range = 12;
spot.size = 0.15;
spot.spotAngle = 40;
spotNode.active = false;

const sphereNode = new Node('SphereLight');
sphereNode.setPosition(new Vec3(-2.6, 1.4, 0));
scene.addChild(sphereNode);
const sphereLight = sphereNode.addComponent(SphereLight);
sphereLight.luminousFlux = 900;
sphereLight.range = 8;
sphereLight.size = 0.6;
sphereNode.active = false;

app.run(scene);
await sleep(600);

const canvas = document.getElementById('GameCanvas');
const bx = canvas.width / 2,
    by = canvas.height * 0.47; // 球心（相机 lookAt (0,0.9,0) 投影附近）
const gx = canvas.width / 2,
    gy = canvas.height * 0.78; // 球下地面

// 多点采样：球心/球顶/球左/球右 + 光下地面（侧向与顶向光源在球心像素 SNL≈0，单点采样会假阴）
const PTS = {
    ballC: [bx, by],
    ballT: [bx, by - 100],
    ballL: [bx - 100, by],
    ballR: [bx + 100, by],
    groundUnder: [gx, gy],
    groundSpot: [canvas.width / 2, canvas.height * 0.66],
};

async function phase(name, node, mutate) {
    if (mutate) mutate();
    [dirNode, pointNode, spotNode, sphereNode].forEach((n) => {
        n.active = n === node;
    });
    await sleep(320);
    const out = {};
    for (const [k, [x, y]] of Object.entries(PTS)) {
        out[k] = await sampleAt(x, y);
    }
    probe.state[name] = out;
    probe.checks.push({
        name,
        ok: true,
        detail: Object.entries(out)
            .map(([k, v]) => k + '=' + JSON.stringify(v.slice(0, 3)))
            .join(' '),
    });
}
// ambient 基线（全关，逐点）
[dirNode, pointNode, spotNode, sphereNode].forEach((n) => {
    n.active = false;
});
await sleep(320);
const basePts = {};
for (const [k, [x, y]] of Object.entries(PTS)) {
    basePts[k] = await sampleAt(x, y);
}
probe.state.baseline = basePts;

// dir 候选
for (const v of [2, 30000, 65000]) {
    await phase('dir@' + v, dirNode, () => {
        dir.illuminance = v;
    });
}
// point 候选
for (const v of [40, 1700, 8000, 24000]) {
    await phase('point@' + v, pointNode, () => {
        point.luminance = v;
    });
}
// spot 候选
for (const v of [120, 1700, 8000, 24000]) {
    await phase('spot@' + v, spotNode, () => {
        spot.luminance = v;
    });
}
// sphere 候选（luminousFlux）
for (const v of [900, 8000, 40000]) {
    await phase('sphere@' + v, sphereNode, () => {
        sphereLight.luminousFlux = v;
    });
}

// 达标判定：任一采样点亮度较该点基线上升 >=25% 且该点未饱和（<248）
for (const [name, pts] of Object.entries(probe.state)) {
    if (name === 'baseline') continue;
    const c = probe.checks.find((x) => x.name === name);
    let usable = false;
    const per = [];
    for (const [k, v] of Object.entries(pts)) {
        const l = lum(v);
        const b = lum(basePts[k]);
        const ok = l >= b * 1.25 && l < 248;
        per.push(k + ':' + Math.round(b) + '→' + Math.round(l) + (ok ? '*' : l >= 248 ? '!' : ''));
        if (ok) usable = true;
    }
    c.ok = usable;
    c.detail = per.join(' ') + ' → ' + (usable ? 'USABLE' : 'no-usable-point');
}
probe.ok = probe.checks.some((c) => c.ok);

// ---- SPOT 全灭运行时诊断（只读管线内部状态；spot 单独激活 @24000） ----
spot.luminance = 24000;
[dirNode, pointNode, sphereNode].forEach((n) => {
    n.active = false;
});
spotNode.active = true;
await sleep(400);
try {
    const root = director.root;
    const ppl = root.pipeline;
    const sd = ppl.pipelineSceneData;
    const diag = {};
    diag.vplCount = sd.validPunctualLights ? sd.validPunctualLights.length : 'n/a';
    diag.vplTypes = (sd.validPunctualLights || []).map((l) => l.type);
    const rs = scene.renderScene;
    diag.sceneSpotCount = rs.spotLights ? rs.spotLights.length : 'n/a';
    const si = rs.spotLights && rs.spotLights[0];
    diag.internalSpot = si
        ? {
              type: si.type,
              pos: [si.position.x, si.position.y, si.position.z],
              dir: [si.direction.x, si.direction.y, si.direction.z].map((v) => Math.round(v * 1000) / 1000),
              range: si.range,
              luminance: si.luminance,
              spotAngleCos: si.spotAngle,
              size: si.size,
              baked: si.baked,
          }
        : 'none';
    let stage = null;
    for (const f of ppl.flows || []) {
        for (const st of f.stages || []) {
            if (st.constructor.name === 'ForwardStage') {
                stage = st;
            }
        }
    }
    const q = stage && stage._additiveLightQueue;
    diag.qLightPasses = q && q._lightPasses ? q._lightPasses.length : 'field-missing';
    diag.qBufferHead =
        q && q._lightBufferData
            ? Array.from(q._lightBufferData.slice(0, 20)).map((v) => Math.round(v * 1000) / 1000)
            : 'field-missing';
    diag.bufferFloats = q && q._lightBufferData ? q._lightBufferData.length : 'n/a';
    probe.state.spotDiag = diag;
} catch (e) {
    probe.state.spotDiag = 'error: ' + e.message;
}

probe.ready = true;
