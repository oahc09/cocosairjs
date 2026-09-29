/* W03 官方截图时机运行器 — tools/debug/probes/capture-probe（隔离探针，不进 Gallery/coverage 门禁）。
 *
 * 任务清单 W03：矩阵 = 后端{webgl2, webgl1} × DPR{1,2}。每轮：
 *   - 页面 A 相位（同帧三路对照）后截 Playwright 页面截图（compositor 输出，存证 + 尺寸断言）；
 *   - 驱动 setViewportSize(900,600) 触发 C 相位 resize 链；
 *   - D 相位验证暂停态采集边界（事件等待式 → CAPTURE_FAILED；直接读 → 上一帧）。
 *
 * 执行：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/w03-capture.cjs
 * 产出：docs/evidence/w03-capture.json + docs/evidence/examples/w03-capture-<mode>.png
 *
 * 判定：全部 run pass（probe.ok ∧ ready ∧ pageErrors=0 ∧ 页面截图尺寸=viewport×DPR）⇒ PASS。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const WORKSPACE = path.join(REPO, 'tools', 'debug', 'probes', 'capture-probe');
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'w03-capture.json');
const SHOT_DIR = path.join(REPO, 'docs', 'evidence', 'examples');
const TIMEOUT_MS = 120000;

let playwright;
try {
    playwright = require('playwright');
} catch (e) {
    console.error('[w03] 需要外部 Playwright：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/w03-capture.cjs');
    console.error('[w03] require 失败：' + e.message);
    process.exit(2);
}

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
    '.png': 'image/png', '.css': 'text/css; charset=utf-8',
};

function startServer () {
    const server = http.createServer((req, res) => {
        try {
            const p = decodeURIComponent((req.url || '/').split('?')[0]);
            if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
            if (p.startsWith('/build/')) {
                const buildFile = path.join(REPO, p);
                if (fs.existsSync(buildFile) && fs.statSync(buildFile).isFile()) {
                    res.writeHead(200, { 'Content-Type': MIME[path.extname(buildFile)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
                    res.end(fs.readFileSync(buildFile));
                    return;
                }
                res.writeHead(404); res.end('not found (build?)'); return;
            }
            let rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
            const file = path.resolve(path.join(WORKSPACE, rel));
            if (!file.startsWith(WORKSPACE)) { res.writeHead(403); res.end('forbidden'); return; }
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(fs.readFileSync(file));
        } catch (error) {
            if (!res.headersSent) { res.writeHead(500); res.end(String(error.message || error)); }
        }
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

function sha256_16 (buf) {
    return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16);
}

// PNG 尺寸解析（IHDR，无需解码库）：字节 16..23 为 big-endian 宽高
function pngSize (buf) {
    if (buf.length < 24 || buf.toString('ascii', 12, 16) !== 'IHDR') { return null; }
    return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

(async function main () {
    const bundlePath = path.join(REPO, 'build', 'cocosair.module.js');
    if (!fs.existsSync(bundlePath)) {
        console.error('[w03] 缺少 build/cocosair.module.js —— 先跑 npm run build');
        process.exit(2);
    }
    const { server, port } = await startServer();
    const launchOpts = { headless: true, args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] };
    const browser = await playwright.chromium.launch(launchOpts);

    const MODES = [
        { id: 'webgl2-dpr1', expect: 'webgl2', dpr: 1, initScript: null },
        { id: 'webgl2-dpr2', expect: 'webgl2', dpr: 2, initScript: null },
        { id: 'webgl1-dpr1', expect: 'webgl', dpr: 1, initScript: 'window.WebGL2RenderingContext = undefined;' },
        { id: 'webgl1-dpr2', expect: 'webgl', dpr: 2, initScript: 'window.WebGL2RenderingContext = undefined;' },
    ];

    fs.mkdirSync(SHOT_DIR, { recursive: true });
    const runs = [];
    for (const mode of MODES) {
        const runnerConsole = [];
        const pageErrors = [];
        let probe = null;
        let runError = null;
        let shot = null;
        const t0 = Date.now();
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            deviceScaleFactor: mode.dpr,
        });
        const page = await context.newPage();
        try {
            page.on('console', (msg) => {
                runnerConsole.push({ type: msg.type(), text: msg.text().slice(0, 400) });
            });
            page.on('pageerror', (err) => {
                pageErrors.push(String((err && err.message) || err).slice(0, 800));
            });
            if (mode.initScript) { await page.addInitScript(mode.initScript); }
            await page.goto(`http://127.0.0.1:${port}/index.html?expect=${mode.expect}`, { waitUntil: 'load', timeout: 60000 });
            // A 相位完成后截 compositor 页面截图（与 canvas 采集同一可见状态）
            await page.waitForFunction(() => window.__captureProbe && window.__captureProbe.samples.A_sameFrame, null, { timeout: TIMEOUT_MS });
            const shotBuf = await page.screenshot({ type: 'png' });
            const shotPath = path.join(SHOT_DIR, `w03-capture-${mode.id}.png`);
            fs.writeFileSync(shotPath, shotBuf);
            shot = { path: path.relative(REPO, shotPath), bytes: shotBuf.length, sha256_16: sha256_16(shotBuf), size: pngSize(shotBuf) };
            // C 相位：驱动真实视口变化
            await page.setViewportSize({ width: 900, height: 600 });
            await page.waitForFunction(() => window.__captureProbe && window.__captureProbe.ready === true, null, { timeout: TIMEOUT_MS });
            probe = await page.evaluate(() => window.__captureProbe);
        } catch (e) {
            runError = String((e && e.message) || e);
        } finally {
            await context.close().catch(() => {});
        }

        const failedChecks = probe ? probe.checks.filter((c) => !c.pass).map((c) => c.name) : ['probe-not-ready'];
        // 页面截图尺寸必须等于 viewport × DPR（compositor 与 DPR 链一致性）
        const shotDimsOk = !!shot && Array.isArray(shot.size) && shot.size[0] === 1280 * mode.dpr && shot.size[1] === 720 * mode.dpr;
        const pass = !!probe && probe.ready === true && probe.ok === true
            && pageErrors.length === 0 && runError === null && failedChecks.length === 0 && shotDimsOk;
        runs.push({
            mode: mode.id, dpr: mode.dpr, pass,
            durationMs: Date.now() - t0,
            probe: probe || null, shot,
            shotDimsOk,
            failedChecks, pageErrors,
            consoleSummary: {
                total: runnerConsole.length,
                errors: runnerConsole.filter((c) => c.type === 'error').length,
            },
            runError,
        });
        console.log(`[w03] ${mode.id}: ${pass ? 'PASS' : 'FAIL'}`
            + (failedChecks.length ? ` failed=[${failedChecks.join(',')}]` : '')
            + (shotDimsOk ? '' : ' shotDims mismatch')
            + (pageErrors.length ? ` pageErrors=${pageErrors.length}` : '')
            + (runError ? ` runError=${runError.slice(0, 120)}` : ''));
    }

    await browser.close();
    server.close();

    const bundle = { sha256_16: sha256_16(fs.readFileSync(bundlePath)), bytes: fs.statSync(bundlePath).size };
    const verdictPass = runs.every((r) => r.pass);
    const evidence = {
        measuredAt: new Date().toISOString(),
        evidence: 'w03-capture (Code First 与 Web 可靠性任务清单 W03)',
        taskDoc: 'ai/Cocos Air Code First 与 Web 可靠性优化任务清单.md',
        bundle,
        browser: { name: 'chromium headless (ANGLE/SwiftShader)', viewport: '1280x720', launchArgs: launchOpts.args },
        matrix: 'backend{webgl2,webgl1} × DPR{1,2}',
        runs,
        verdict: verdictPass ? 'PASS' : 'FAIL',
    };
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
    console.log(`[w03] verdict=${evidence.verdict} → ${path.relative(REPO, EVIDENCE_PATH)}`);
    process.exit(verdictPass ? 0 : 1);
})().catch((e) => {
    console.error('[w03] fatal: ' + ((e && e.stack) || e));
    process.exit(1);
});
