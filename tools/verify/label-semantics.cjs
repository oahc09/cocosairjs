/* Label 语义矩阵运行器 — tools/debug/probes/label-semantics-probe。
 * 验证 NONE/CLAMP/SHRINK/RESIZE_HEIGHT 的布局、文字对齐与字影像素。
 * 执行：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/label-semantics.cjs
 * 产出：docs/evidence/w07-label-semantics.json
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const WORKSPACE = path.join(REPO, 'tools', 'debug', 'probes', 'label-semantics-probe');
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'w07-label-semantics.json');
const TIMEOUT_MS = 90000;

let playwright;
try {
    playwright = require('playwright');
} catch (e) {
    console.error('[w04] 需要外部 Playwright：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/step-clock.cjs');
    process.exit(2);
}

const MIME = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json',
};

function startServer () {
    const server = http.createServer((req, res) => {
        try {
            const p = decodeURIComponent((req.url || '/').split('?')[0]);
            if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
            if (p.startsWith('/build/')) {
                const f = path.join(REPO, p);
                if (fs.existsSync(f)) {
                    res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'application/octet-stream', 'Cache-Control': 'no-store' });
                    res.end(fs.readFileSync(f));
                    return;
                }
                res.writeHead(404); res.end(); return;
            }
            const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
            const f = path.join(WORKSPACE, rel);
            if (!f.startsWith(WORKSPACE) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
            res.end(fs.readFileSync(f));
        } catch (e) {
            if (!res.headersSent) { res.writeHead(500); res.end(String(e.message || e)); }
        }
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

(async function main () {
    const bundlePath = path.join(REPO, 'build', 'cocosair.module.js');
    if (!fs.existsSync(bundlePath)) { console.error('[w04] 先 npm run build'); process.exit(2); }
    const { server, port } = await startServer();
    const browser = await playwright.chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });

    const MODES = [{ id: 'label-semantics' }];
    const W = 1280; const H = 720;
    const runs = [];
    for (const mode of MODES) {
        const consoleMsgs = [];
        const pageErrors = [];
        let probe = null;
        let runError = null;
        const t0 = Date.now();
        const context = await browser.newContext({ viewport: { width: W, height: H } });
        const page = await context.newPage();
        try {
            page.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 300) }));
            page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e).slice(0, 600)));
            await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 60000 });
            await page.waitForFunction(() => window.__labelProbe && window.__labelProbe.ready === true, null, { timeout: TIMEOUT_MS });
            probe = await page.evaluate(() => window.__labelProbe);
        } catch (e) {
            runError = String((e && e.message) || e);
        } finally {
            await context.close().catch(() => {});
        }
        const failedChecks = probe ? probe.checks.filter((c) => !c.pass).map((c) => c.name) : ['probe-not-ready'];
        const pass = !!probe && probe.ready === true && probe.ok === true && pageErrors.length === 0 && runError === null && failedChecks.length === 0;
        runs.push({
            mode: mode.id, pass, durationMs: Date.now() - t0,
            probe: probe ? { ok: probe.ok, checks: probe.checks, samples: probe.samples, info: probe.info } : null,
            failedChecks, pageErrors, runError,
            consoleSummary: { total: consoleMsgs.length, warns: consoleMsgs.filter((c) => c.type === 'warning').length },
        });
        console.log(`[w07] ${mode.id}: ${pass ? 'PASS' : 'FAIL'}${failedChecks.length ? ' failed=[' + failedChecks.join(',') + ']' : ''}${pageErrors.length ? ' pageErrors=' + pageErrors.length : ''}${runError ? ' err=' + runError.slice(0, 100) : ''}`);
    }

    await browser.close();
    server.close();
    const verdictPass = runs.every((r) => r.pass);
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({
        measuredAt: new Date().toISOString(),
        evidence: 'w08-step-clock (Code First 与 Web 可靠性任务清单 W04)',
        taskDoc: 'ai/plans/code-first-web-reliability.md',
        bundle: { sha256_16: crypto.createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex').slice(0, 16), bytes: fs.statSync(bundlePath).size },
        browser: { name: 'chromium headless (ANGLE/SwiftShader)', viewport: `${W}x${H}`, hasTouchNote: 'anyid 模式 hasTouch=true（真实触摸 tap）；鼠标模拟触摸路径由引擎 input 系统在无触摸能力平台自处理，未单测' },
        contract: {
            begin: 'game.pause() 停真实 pacer（rAF/渲染/业务时钟/音频）',
            step: 'director.tick(dt ?? 1/60) + 等本帧 AFTER_DRAW；运行态调用抛错（反双时钟）',
            end: 'game.resume() 恢复真实时钟',
        },
        runs, verdict: verdictPass ? 'PASS' : 'FAIL',
    }, null, 2) + '\n');
    console.log(`[w07] verdict=${verdictPass ? 'PASS' : 'FAIL'} → ${path.relative(REPO, EVIDENCE_PATH)}`);
    process.exit(verdictPass ? 0 : 1);
})().catch((e) => { console.error('[w04] fatal: ' + ((e && e.stack) || e)); process.exit(1); });
