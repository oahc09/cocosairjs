/* W01 上下文丢失复现探针（tools/debug/probes 隔离，不登记 files.json，不进 Gallery/coverage）。
 *
 * 覆盖相位（query: ?expect=webgl|webgl2 由运行器注入，用于断言后端类型）：
 *   A_healthy        — 首帧后状态机 healthy、后端正确、画面非黑、像素采样留证；
 *   B_gateHealthy    — requestReload() 在 healthy 态被门掣（false 且不触发重载动作）；
 *   C_lost           — WEBGL_lose_context.loseContext() → 状态 lost、isContextLost=true、
 *                      game 已暂停（AFTER_DRAW 计数与业务时钟冻结，双采样 600ms 验证）；
 *   D_noSubmission   — lost 后 600ms 内无新帧、无时钟推进（暂停无效提交）；
 *   E_restoreFailed  — restoreContext() → webglcontextrestored → timeline 含瞬时态
 *                      restoring → failed（reason=not-rebuilt、suggestion=reload）；
 *                      引擎保持暂停（不产生僵尸渲染循环）；
 *   F_gateFailed     — requestReload() 在 failed 态生效（true 且注入的重载记录器恰好一次）；
 *   G_secondLoss     — 第二轮 lose/restore：lostCount=2、状态迁移稳定、无异常。
 *
 * 运行：NODE_PATH=<playwright> node tools/verify/context-loss.cjs
 * 证据：docs/evidence/w01-context-loss.json
 */
import {
    createAirApp,
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
    director,
    Director,
    Component,
} from 'cocosair';

const params = new URLSearchParams(location.search);
const expectBackend = params.get('expect') || 'webgl2';

const probe = { id: 'context-loss-probe', ready: false, ok: true, checks: [], samples: {}, info: {} };
window.__ctxLossProbe = probe;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, pass, detail) {
    probe.checks.push({ name, pass: !!pass, detail: detail === undefined ? undefined : String(detail) });
    if (!pass) {
        probe.ok = false;
    }
}

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

function waitState(health, target, timeoutMs) {
    return new Promise((resolve) => {
        const t0 = Date.now();
        (function poll() {
            const s = health.snapshot();
            if (s.state === target) {
                resolve(s);
                return;
            }
            if (Date.now() - t0 > timeoutMs) {
                resolve(s);
                return;
            }
            setTimeout(poll, 50);
        })();
    });
}

// 业务时钟组件：update(dt) 累加，game.pause() 后应冻结。
class Clock extends Component {
    start() {
        this.sum = 0;
        this.ticks = 0;
    }
    update(dt) {
        this.sum += dt;
        this.ticks += 1;
    }
}

let afterDrawCount = 0;
director.on(Director.EVENT_AFTER_DRAW, () => {
    afterDrawCount += 1;
});

// 受控重载注入：记录调用而非真实导航（W01 合同可测面）。
const reloadCalls = [];
const app = await createAirApp({
    canvas: '#GameCanvas',
    contextLoss: { reload: () => reloadCalls.push(Date.now()) },
});
window.__airApp = app;
const health = app.contextHealth;

const scene = new Scene('context-loss-probe');
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

const lightNode = new Node('Main Light');
scene.addChild(lightNode);
lightNode.setPosition(new Vec3(0, 8, 0));
lightNode.setRotationFromEuler(-45, -30, 0);
const keyLight = lightNode.addComponent(DirectionalLight);
keyLight.illuminance = 65000;

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

const clockNode = new Node('Clock');
scene.addChild(clockNode);
const clock = clockNode.addComponent(Clock);

app.run(scene);
await sleep(900);

// ---- A：healthy 快照 ----
const snapA = health.snapshot();
probe.samples.A_healthy = {
    state: snapA.state,
    backend: snapA.backend,
    isContextLost: snapA.isContextLost,
    gamePaused: snapA.gamePaused,
    pixel: await sampleCenter(),
    afterDrawCount,
    clockSum: Math.round((clock.sum || 0) * 1000) / 1000,
};
check('A_backend_detected', snapA.backend === expectBackend, `backend=${snapA.backend} expect=${expectBackend}`);
check('A_state_healthy', snapA.state === 'healthy', snapA.state);
check('A_not_context_lost', snapA.isContextLost === false, String(snapA.isContextLost));
const pxA = probe.samples.A_healthy.pixel;
check('A_pixel_visible', pxA[0] + pxA[1] + pxA[2] > 24, JSON.stringify(pxA));
check('A_game_running', snapA.gamePaused === false, String(snapA.gamePaused));

// ---- B：healthy 态重载门掣 ----
const gateHealthy = health.requestReload();
check(
    'B_reload_gated_in_healthy',
    gateHealthy === false && reloadCalls.length === 0,
    `ret=${gateHealthy} calls=${reloadCalls.length}`,
);

// ---- C：人为丢失 ----
const gl = app.canvas.getContext(snapA.backend);
const ext = gl && gl.getExtension('WEBGL_lose_context');
check('C_lose_ext_available', !!ext, ext ? 'ok' : 'WEBGL_lose_context unavailable');
if (ext) {
    ext.loseContext();
    const snapC = await waitState(health, 'lost', 5000);
    probe.samples.C_lost = {
        state: snapC.state,
        isContextLost: snapC.isContextLost,
        gamePaused: snapC.gamePaused,
        lostCount: snapC.lostCount,
        afterDrawCount,
        clockSum: Math.round((clock.sum || 0) * 1000) / 1000,
        lastEvent: snapC.lastEvent,
    };
    check('C_state_lost', snapC.state === 'lost', snapC.state);
    check('C_isContextLost_true', snapC.isContextLost === true, String(snapC.isContextLost));
    check('C_game_paused', snapC.gamePaused === true, String(snapC.gamePaused));

    // ---- D：lost 后无提交（600ms 双采样：帧计数与时钟都冻结） ----
    const framesAtLost = afterDrawCount;
    const sumAtLost = clock.sum;
    await sleep(600);
    probe.samples.D_noSubmission = {
        afterDrawDelta: afterDrawCount - framesAtLost,
        clockSumDelta: Math.round((clock.sum - sumAtLost) * 1000) / 1000,
    };
    check('D_no_frames_after_lost', afterDrawCount === framesAtLost, String(afterDrawCount - framesAtLost));
    check('D_clock_frozen', Math.abs(clock.sum - sumAtLost) < 1e-9, String(clock.sum - sumAtLost));

    // ---- E：恢复路径 → restoring 瞬时态 → failed（如实判定，不宣称自愈） ----
    ext.restoreContext();
    const snapE = await waitState(health, 'failed', 5000);
    await sleep(400); // 若引擎意外复活渲染，这里会推进帧计数
    const sawRestoring = snapE.timeline.some((t) => t.type === 'restoring');
    probe.samples.E_restoreFailed = {
        state: snapE.state,
        reason: snapE.reason,
        suggestion: snapE.suggestion,
        restoredCount: snapE.restoredCount,
        sawRestoring,
        isContextLost: snapE.isContextLost,
        afterDrawDeltaAfterRestore: afterDrawCount - framesAtLost,
        timeline: snapE.timeline,
    };
    check('E_state_failed', snapE.state === 'failed', snapE.state);
    check('E_reason_not_rebuilt', !!snapE.reason && snapE.reason.indexOf('not-rebuilt') >= 0, snapE.reason);
    check('E_suggestion_reload', snapE.suggestion === 'reload', snapE.suggestion);
    check('E_saw_restoring_transient', sawRestoring, 'timeline lacks restoring');
    check('E_still_no_frames', afterDrawCount === framesAtLost, String(afterDrawCount - framesAtLost));

    // ---- F：failed 态受控重载生效 ----
    const gateFailed = health.requestReload();
    check(
        'F_reload_in_failed',
        gateFailed === true && reloadCalls.length === 1,
        `ret=${gateFailed} calls=${reloadCalls.length}`,
    );

    // ---- G：第二轮丢失（多次丢失稳定性） ----
    const gl2 = app.canvas.getContext(snapA.backend);
    const ext2 = gl2 && gl2.getExtension('WEBGL_lose_context');
    if (ext2) {
        ext2.loseContext();
        const snapG1 = await waitState(health, 'lost', 5000);
        ext2.restoreContext();
        const snapG2 = await waitState(health, 'failed', 5000);
        probe.samples.G_secondLoss = {
            stateAfterLose: snapG1.state,
            lostCount: snapG1.lostCount,
            stateAfterRestore: snapG2.state,
            reason: snapG2.reason,
        };
        check('G_second_lost_count_2', snapG1.lostCount === 2, String(snapG1.lostCount));
        check('G_second_failed_again', snapG2.state === 'failed', snapG2.state);
    } else {
        check('G_second_lose_ext', false, 'extension lost after first cycle');
    }
}

function countTree(node, acc) {
    acc.nodes += 1;
    if (node.getComponent(MeshRenderer)) {
        acc.renderers += 1;
    }
    for (const c of node.children) {
        countTree(c, acc);
    }
    return acc;
}

probe.info.expectBackend = expectBackend;
probe.info.sceneStats = countTree(scene, { nodes: 0, renderers: 0 });
probe.info.finalSnapshot = health.snapshot();
probe.info.afterDrawTotal = afterDrawCount;
probe.info.reloadCalls = reloadCalls.length;
probe.ready = true;
