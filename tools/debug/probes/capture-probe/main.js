/* W03 官方截图时机探针（tools/debug/probes 隔离，不登记 files.json，不进 Gallery/coverage）。
 *
 * 任务清单 W03：同帧 AFTER_DRAW 三路采集对照 + 采集边界条件矩阵。
 *   A_sameFrame — 同一 AFTER_DRAW 帧内三路对照：
 *        m1 canvas.toDataURL()（agent-session captureFrame 同款）
 *        m2 gl.readPixels()（默认 framebuffer，行序翻转后与 m3 同序）
 *        m3 2D canvas drawImage→getImageData（v11 验证器同款）
 *     断言：m2 与 m3 逐像素 maxDiff ≤ 2（两条读回路径同帧等价）、清屏占比 ∈ (0,1)、均非黑。
 *   B_offscreenFbo — 原生离屏 FBO：clear 已知色 → readPixels 精确回读（离屏读回路径）。
 *   C_resize — 视口 1280x720 → 900x600：swapchain 尺寸链更新、采集非空。
 *   D_paused — game.pause() 后：事件等待式采集超时 ⇒ CAPTURE_FAILED 显式诊断；
 *     直接 toDataURL 仍返回上一帧（preserveDrawingBuffer 合同，AIR 上下文属性）。
 *   dprChain — window.devicePixelRatio / CSS 尺寸 / 绘图缓冲尺寸 链路留证（W06 共用）。
 *
 * 运行：NODE_PATH=<playwright> node tools/verify/w03-capture.cjs
 * 证据：docs/evidence/w03-capture.json
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
    game,
} from 'cocosair';

const params = new URLSearchParams(location.search);
const expectBackend = params.get('expect') || 'webgl2';

const CLEAR = [30, 40, 60];
const probe = { id: 'capture-probe', ready: false, ok: true, checks: [], samples: {}, info: {} };
window.__captureProbe = probe;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function check(name, pass, detail) {
    probe.checks.push({ name, pass: !!pass, detail: detail === undefined ? undefined : String(detail) });
    if (!pass) {
        probe.ok = false;
    }
}

async function sha16(bytes) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 16);
}

function stats(data, w, h) {
    let clear = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    const n = w * h;
    for (let i = 0; i < n; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        sr += r;
        sg += g;
        sb += b;
        if (Math.abs(r - CLEAR[0]) <= 2 && Math.abs(g - CLEAR[1]) <= 2 && Math.abs(b - CLEAR[2]) <= 2) {
            clear += 1;
        }
    }
    return {
        clearRatio: Math.round((clear / n) * 1000) / 1000,
        avg: [Math.round(sr / n), Math.round(sg / n), Math.round(sb / n)],
    };
}

function readPixelsFlipped(gl, w, h) {
    const px = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    // GL 原点左下 → 翻转到 2D 顶点序，与 getImageData 同序可比
    const flipped = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        const src = (h - 1 - y) * w * 4;
        flipped.set(px.subarray(src, src + w * 4), y * w * 4);
    }
    return flipped;
}

function maxDiff(a, b) {
    let m = 0;
    for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d > m) {
            m = d;
        }
    }
    return m;
}

function atAfterDraw() {
    return new Promise((resolve) => {
        function onDraw() {
            director.off(Director.EVENT_AFTER_DRAW, onDraw);
            resolve();
        }
        director.on(Director.EVENT_AFTER_DRAW, onDraw);
    });
}

const app = await createAirApp({ canvas: '#GameCanvas' });
const healthBackend = app.contextHealth.snapshot().backend;
probe.info.backend = healthBackend;
check('boot_backend', healthBackend === expectBackend, `backend=${healthBackend} expect=${expectBackend}`);

const scene = new Scene('capture-probe');
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
camera.clearColor = new Color(CLEAR[0], CLEAR[1], CLEAR[2], 255);
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

app.run(scene);
await sleep(700);

// DPR 链路留证（W06 共用）
const canvas = app.canvas;
probe.info.dprChain = {
    windowDevicePixelRatio: window.devicePixelRatio,
    cssSize: [canvas.clientWidth, canvas.clientHeight],
    buffer: [canvas.width, canvas.height],
    effectiveBufferRatio: Math.round((canvas.width / Math.max(1, canvas.clientWidth)) * 1000) / 1000,
};

// ---- A：同帧三路对照 ----
await atAfterDraw();
const m1url = canvas.toDataURL('image/png');
const gl = canvas.getContext(healthBackend);
const w = gl.drawingBufferWidth;
const h = gl.drawingBufferHeight;
const m2px = readPixelsFlipped(gl, w, h);
const m2err = gl.getError();
const snap2d = document.createElement('canvas');
snap2d.width = w;
snap2d.height = h;
const ctx2d = snap2d.getContext('2d', { willReadFrequently: true });
ctx2d.drawImage(canvas, 0, 0);
const m3px = ctx2d.getImageData(0, 0, w, h).data;
const m2stats = stats(m2px, w, h);
const m3stats = stats(m3px, w, h);
const diff = maxDiff(m2px, m3px);
probe.samples.A_sameFrame = {
    toDataURL: { byteLen: m1url.length, sha16: await sha16(new TextEncoder().encode(m1url)) },
    readPixels: { w, h, sha16: await sha16(m2px), glError: m2err, ...m2stats },
    canvas2dCopy: { w, h, sha16: await sha16(m3px), ...m3stats },
    crossPathMaxDiff: diff,
};
check('A_toDataURL_nonempty', m1url.length > 1000, `len=${m1url.length}`);
check('A_readPixels_no_glerror', m2err === 0, `gl.getError()=${m2err}`);
check('A_clear_ratio_mixed', m2stats.clearRatio > 0 && m2stats.clearRatio < 1, String(m2stats.clearRatio));
check('A_not_black', m2stats.avg[0] + m2stats.avg[1] + m2stats.avg[2] > 24, JSON.stringify(m2stats.avg));
check('A_paths_equivalent', diff <= 2, `readPixels vs 2D-copy maxDiff=${diff}`);
check(
    'A_clear_ratio_agrees',
    Math.abs(m2stats.clearRatio - m3stats.clearRatio) <= 0.02,
    `${m2stats.clearRatio} vs ${m3stats.clearRatio}`,
);

// ---- B：离屏 FBO 读回 ----
try {
    const fbo = gl.createFramebuffer();
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 8, 8, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const fboStatus = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.clearColor(17 / 255, 125 / 255, 90 / 255, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const fpx = new Uint8Array(8 * 8 * 4);
    gl.readPixels(0, 0, 8, 8, gl.RGBA, gl.UNSIGNED_BYTE, fpx);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    gl.deleteTexture(tex);
    let exact = true;
    for (let i = 0; i < fpx.length; i += 4) {
        if (
            Math.abs(fpx[i] - 17) > 1 ||
            Math.abs(fpx[i + 1] - 125) > 1 ||
            Math.abs(fpx[i + 2] - 90) > 1 ||
            fpx[i + 3] !== 255
        ) {
            exact = false;
            break;
        }
    }
    probe.samples.B_offscreenFbo = { fboStatusComplete: fboStatus === gl.FRAMEBUFFER_COMPLETE, exact };
    check('B_fbo_complete', fboStatus === gl.FRAMEBUFFER_COMPLETE, '0x' + fboStatus.toString(16));
    check('B_fbo_readback_exact', exact, 'clear (17,125,90) round-trip');
} catch (e) {
    probe.samples.B_offscreenFbo = { error: String((e && e.message) || e) };
    check('B_fbo_readback_exact', false, 'exception');
}

// ---- C：resize 后采集（运行器 setViewportSize(900,600) 驱动真实视口变化；本探针等待缓冲链更新） ----
// 断言纪律（W03）：不得用「拿到了 hash/长度」代替画面正确——resize 后必须是可见场景
// （clearRatio ∈ (0,1) 且非黑）。preserveDrawingBuffer 缺失时此相位曾对 WebGL2 全黑假绿。
const before = [canvas.width, canvas.height];
window.__awaitingResize = true;
let resized = false;
const tC0 = Date.now();
while (Date.now() - tC0 < 8000) {
    if (canvas.width !== before[0] || canvas.height !== before[1]) {
        resized = true;
        break;
    }
    await sleep(100);
}
let after = [canvas.width, canvas.height];
let shaAfter = null;
let cStats = null;
if (resized) {
    await sleep(500); // 等 swapchain resize 与若干帧重绘（帧外读回依赖 preserveDrawingBuffer）
    after = [canvas.width, canvas.height];
    const w2 = gl.drawingBufferWidth;
    const h2 = gl.drawingBufferHeight;
    const px2 = readPixelsFlipped(gl, w2, h2);
    shaAfter = await sha16(px2);
    cStats = stats(px2, w2, h2);
    probe.samples.C_resize = { before, after, sha16: shaAfter, ...cStats, glErrorAfterRead: gl.getError() };
} else {
    probe.samples.C_resize = {
        before,
        after,
        error: 'CAPTURE_FAILED: buffer did not follow viewport resize within 8s',
    };
}
check('C_resize_capture_ok', resized === true && !!shaAfter, JSON.stringify({ before, after, resized }));
check(
    'C_resize_content_visible',
    !!cStats && cStats.clearRatio > 0 && cStats.clearRatio < 1 && cStats.avg[0] + cStats.avg[1] + cStats.avg[2] > 24,
    cStats ? JSON.stringify(cStats) : 'no stats',
);

// ---- D：暂停后的采集边界 ----
game.pause();
await sleep(200);
const tPause0 = Date.now();
let waitingCaptureError = null;
await new Promise((resolve) => {
    const timer = setTimeout(() => {
        director.off(Director.EVENT_AFTER_DRAW, onDraw);
        waitingCaptureError = 'CAPTURE_FAILED: no AFTER_DRAW within 1500ms (paused)';
        resolve();
    }, 1500);
    function onDraw() {
        director.off(Director.EVENT_AFTER_DRAW, onDraw);
        clearTimeout(timer);
        resolve();
    }
    director.on(Director.EVENT_AFTER_DRAW, onDraw);
});
const waitedMs = Date.now() - tPause0;
const pausedUrl = canvas.toDataURL('image/png');
// 内容级断言：2D-copy 中心像素非黑（preserveDrawingBuffer 合同——暂停后仍保留最后一帧）。
const snapP = document.createElement('canvas');
snapP.width = canvas.width;
snapP.height = canvas.height;
const ctxP = snapP.getContext('2d');
ctxP.drawImage(canvas, 0, 0);
const pausedPx = ctxP.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
probe.samples.D_paused = {
    waitingCaptureError,
    waitedMs,
    directToDataURLLen: pausedUrl.length,
    directSha16: await sha16(new TextEncoder().encode(pausedUrl)),
    directCenterPx: [pausedPx[0], pausedPx[1], pausedPx[2], pausedPx[3]],
};
check(
    'D_waiting_capture_fails_explicitly',
    waitingCaptureError !== null && waitingCaptureError.indexOf('CAPTURE_FAILED') === 0,
    waitingCaptureError || 'unexpected frame',
);
check(
    'D_direct_capture_keeps_last_frame',
    pausedUrl.length > 1000 && pausedPx[0] + pausedPx[1] + pausedPx[2] > 24,
    `len=${pausedUrl.length} px=[${pausedPx[0]},${pausedPx[1]},${pausedPx[2]}]`,
);
game.resume();
await sleep(300);

probe.info.finalBackend = app.contextHealth.snapshot().backend;
probe.ready = true;
