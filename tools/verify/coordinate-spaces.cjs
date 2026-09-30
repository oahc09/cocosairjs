/* W05 坐标空间运行器 — tools/debug/probes/coordinate-spaces-probe（DPR{1,2} × 中心点击）。 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const WORKSPACE = path.join(REPO, 'tools', 'debug', 'probes', 'coordinate-spaces-probe');
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'w05-coordinate-spaces.json');
const TIMEOUT_MS = 90000;

let playwright;
try { playwright = require('playwright'); } catch (e) {
    console.error('[w05] 需要外部 Playwright：NODE_PATH=<含 playwright 的 node_modules>');
    process.exit(2);
}

function startServer () {
    const server = http.createServer((req, res) => {
        try {
            const p = decodeURIComponent((req.url || '/').split('?')[0]);
            if (p === '/favicon.ico') { res.writeHead(204); res.end(); return; }
            if (p.startsWith('/build/')) {
                const f = path.join(REPO, p);
                if (fs.existsSync(f)) {
                    res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
                    res.end(fs.readFileSync(f)); return;
                }
                res.writeHead(404); res.end(); return;
            }
            const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
            const f = path.join(WORKSPACE, rel);
            if (!f.startsWith(WORKSPACE) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
            res.writeHead(200, { 'Content-Type': path.extname(f) === '.html' ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
            res.end(fs.readFileSync(f));
        } catch (e) { if (!res.headersSent) { res.writeHead(500); res.end(String(e.message || e)); } }
    });
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })));
}

(async function main () {
    const bundlePath = path.join(REPO, 'build', 'cocosair.module.js');
    if (!fs.existsSync(bundlePath)) { console.error('[w05] 先 npm run build'); process.exit(2); }
    const { server, port } = await startServer();
    const browser = await playwright.chromium.launch({ headless: true, args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const W = 1280; const H = 720;
    const runs = [];
    for (const mode of [{ id: 'dpr1', dpr: 1 }, { id: 'dpr2', dpr: 2 }]) {
        const pageErrors = [];
        let probe = null; let runError = null;
        const t0 = Date.now();
        const context = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: mode.dpr });
        const page = await context.newPage();
        try {
            page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e).slice(0, 600)));
            await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 60000 });
            await page.waitForFunction(() => window.__coordArmed === true, null, { timeout: TIMEOUT_MS });
            await page.mouse.click(800, 200);
            await page.waitForTimeout(200);
            await page.evaluate((c) => { window.__coordClick = c; }, { clientX: 800, clientY: 200, viewportH: H });
            await page.waitForFunction(() => window.__coordProbe && window.__coordProbe.ready === true, null, { timeout: TIMEOUT_MS });
            probe = await page.evaluate(() => window.__coordProbe);
        } catch (e) { runError = String((e && e.message) || e); } finally { await context.close().catch(() => {}); }
        const failedChecks = probe ? probe.checks.filter((c) => !c.pass).map((c) => c.name) : ['probe-not-ready'];
        const pass = !!probe && probe.ready === true && probe.ok === true && pageErrors.length === 0 && runError === null && failedChecks.length === 0;
        runs.push({ mode: mode.id, dpr: mode.dpr, pass, durationMs: Date.now() - t0,
            probe: probe || null, failedChecks, pageErrors, runError });
        console.log(`[w05] ${mode.id}: ${pass ? 'PASS' : 'FAIL'}${failedChecks.length ? ' failed=[' + failedChecks.join(',') + ']' : ''}${pageErrors.length ? ' pageErrors=' + pageErrors.length : ''}${runError ? ' err=' + runError.slice(0, 100) : ''}`);
    }
    await browser.close(); server.close();
    const verdictPass = runs.every((r) => r.pass);
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({
        measuredAt: new Date().toISOString(),
        evidence: 'w05-coordinate-spaces (Code First 与 Web 可靠性任务清单 W05)',
        taskDoc: 'ai/plans/code-first-web-reliability.md',
        bundle: { sha256_16: crypto.createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex').slice(0, 16), bytes: fs.statSync(bundlePath).size },
        browser: { name: 'chromium headless (ANGLE/SwiftShader)', viewport: `${W}x${H}`, matrix: 'DPR{1,2}，中心点击 (640,360)' },
        runs, verdict: verdictPass ? 'PASS' : 'FAIL',
    }, null, 2) + '\n');
    console.log(`[w05] verdict=${verdictPass ? 'PASS' : 'FAIL'} → ${path.relative(REPO, EVIDENCE_PATH)}`);
    process.exit(verdictPass ? 0 : 1);
})().catch((e) => { console.error('[w05] fatal: ' + ((e && e.stack) || e)); process.exit(1); });
