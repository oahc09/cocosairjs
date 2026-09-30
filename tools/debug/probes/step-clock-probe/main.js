/* W08 确定性单时钟探针（tools/debug/probes 隔离，不登记 files.json，不进 Gallery/coverage）。
 *
 * 验证 createStepClock() 合同：
 *   A_dualClockGuard — 运行态直接 step() 抛错（反双时钟门卫）；
 *   B_realClockFrozen — begin() 后真实 rAF 不推进业务时钟（500ms 双采样 delta=0）；
 *   C_stepDeterminism — step(1/60)×90：累计 dt=1.5s±ε、旋转角=135°（90°/s）逐位精确；
 *   D_midValue        — 第 30 步中间值角 45°（0<angle<90，非端点）；
 *   E_resume          — end() 后真实时钟恢复（500ms 内 sum 增长）；
 *   F_hashStability   — 两轮相同步进序列，同帧像素 sha256_16 相同（SwiftShader 确定性）。
 *
 * 运行：NODE_PATH=<playwright> node tools/verify/step-clock.cjs
 * 证据：docs/evidence/w08-step-clock.json
 */
import {
    createAirApp,
    createStepClock,
    Scene,
    Node,
    MeshRenderer,
    Camera,
    DirectionalLight,
    Layers,
    Vec3,
    Color,
    Material,
    utils,
    primitives,
    Component,
    director,
    Director,
} from 'cocosair';

const probe = { id: 'step-clock-probe', ready: false, ok: true, checks: [], samples: {}, info: {} };
window.__stepProbe = probe;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function check(name, pass, detail) {
    probe.checks.push({ name, pass: !!pass, detail: detail === undefined ? undefined : String(detail) });
    if (!pass) {
        probe.ok = false;
    }
}
async function sha16(bytes) {
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(d))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
}
function frameBytes() {
    const canvas = document.getElementById('GameCanvas');
    const snap = document.createElement('canvas');
    snap.width = canvas.width;
    snap.height = canvas.height;
    const ctx = snap.getContext('2d');
    ctx.drawImage(canvas, 0, 0);
    return ctx.getImageData(0, 0, snap.width, snap.height).data;
}

const ROT_SPEED = 90; // 度/秒（确定性动画时钟载体，视觉上真实旋转盒体）
class Spinner extends Component {
    start() {
        this.sum = 0;
        this.angle = 0;
    }
    update(dt) {
        this.sum += dt;
        this.angle = (this.angle + ROT_SPEED * dt) % 360;
        this.node.setRotationFromEuler(this.angle, this.angle * 0.7, 0);
    }
}

const app = await createAirApp({ canvas: '#GameCanvas' });
const scene = new Scene('step-clock-probe');
const cameraNode = new Node('Cam');
scene.addChild(cameraNode);
cameraNode.setPosition(new Vec3(0, 1.6, 6));
cameraNode.lookAt(new Vec3(0, 1, 0));
const camera = cameraNode.addComponent(Camera);
camera.clearFlags = Camera.ClearFlag.SOLID_COLOR;
camera.clearColor = new Color(30, 40, 60, 255);
camera.visibility = Layers.Enum.DEFAULT;
const lightNode = new Node('Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
lightNode.addComponent(DirectionalLight).illuminance = 65000;
const box = new Node('Box');
box.layer = Layers.Enum.DEFAULT;
scene.addChild(box);
box.setPosition(new Vec3(0, 1, 0));
const renderer = box.addComponent(MeshRenderer);
renderer.mesh = utils.createMesh(primitives.box({ width: 1.6, height: 1.6, length: 1.6 }));
const mat = new Material();
mat.initialize({ effectName: 'builtin-standard' });
mat.setProperty('mainColor', new Color(70, 120, 235, 255));
renderer.setSharedMaterial(mat, 0);
const spinner = box.addComponent(Spinner);
const clock = createStepClock();

app.run(scene);
await sleep(600);

// ---- A：双时钟门卫 ----
let guardErr = null;
try {
    await clock.step();
} catch (e) {
    guardErr = String((e && e.message) || e);
}
probe.samples.A_dualClockGuard = guardErr;
check(
    'A_dual_clock_guard',
    guardErr !== null && guardErr.indexOf('dual clock') >= 0,
    guardErr ? guardErr.slice(0, 120) : 'stepped without begin()',
);

// ---- F 辅助：一轮 90 步序列的第 45 帧哈希（两轮对比） ----
async function runSequence() {
    spinner.start();
    clock.begin();
    let hash45 = null;
    for (let i = 1; i <= 90; i++) {
        const f = await clock.step(1 / 60);
        if (i === 30) {
            probe.samples.D_midValue = {
                step: i,
                angle: Math.round(spinner.angle * 1000) / 1000,
                sum: Math.round(spinner.sum * 1000) / 1000,
            };
        }
        if (i === 45) {
            hash45 = await sha16(frameBytes());
        }
        if (i === 90) {
            return { sum: spinner.sum, angle: spinner.angle, hash45, lastStep: f };
        }
    }
    return null;
}
const seq1 = await runSequence();
probe.samples.C_stepDeterminism = {
    steps: 90,
    sum: Math.round(seq1.sum * 1000) / 1000,
    angle: Math.round(seq1.angle * 1000) / 1000,
};
check('C_dt_accumulates', Math.abs(seq1.sum - 1.5) < 0.005, String(seq1.sum));
check('C_rotation_exact', Math.abs(seq1.angle - 135) < 0.01, String(seq1.angle));
check(
    'D_mid_value',
    probe.samples.D_midValue.angle > 44 && probe.samples.D_midValue.angle < 46,
    JSON.stringify(probe.samples.D_midValue),
);

// ---- B：begin 态真实 rAF 冻结（此时仍处于第一轮的暂停态） ----
const frozenA = spinner.sum;
await sleep(500);
const frozenDelta = spinner.sum - frozenA;
probe.samples.B_realClockFrozen = { frozenDelta: Math.round(frozenDelta * 1000) / 1000 };
check('B_real_clock_frozen', Math.abs(frozenDelta) < 1e-9, String(frozenDelta));

// ---- E：end() 恢复 ----
clock.end();
await sleep(500);
const resumedDelta = spinner.sum - frozenA;
probe.samples.E_resume = { resumedDelta: Math.round(resumedDelta * 1000) / 1000 };
check('E_resume_advances', resumedDelta > 0.1, String(resumedDelta));

// ---- F：第二轮同序列哈希稳定 ----
await sleep(200);
const seq2 = await runSequence();
clock.end();
probe.samples.F_hashStability = { run1: seq1.hash45, run2: seq2.hash45, equal: seq1.hash45 === seq2.hash45 };
check('F_hash_stability', seq1.hash45 === seq2.hash45, `${seq1.hash45} vs ${seq2.hash45}`);
check('F_second_run_exact', Math.abs(seq2.angle - 135) < 0.01, String(seq2.angle));

probe.info.steppedTotal = clock.stepped;
probe.ready = true;
