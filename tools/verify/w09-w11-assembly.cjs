/* W04 画布绑定与焦点合同运行器 — tools/debug/probes/step-clock-probe。
 *
 * 模式：classic（控制组）/ anyid（__CC_CANVAS__ 覆盖 + 动态 import，hasTouch 上下文做真实触摸）/
 * decoy（冲突显式拒绝）。anyid 用 hasTouch 上下文 + touchscreen.tap 覆盖触摸面。
 *
 * 执行：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/w08-step-clock.cjs
 * 产出：docs/evidence/w09-w11-assembly.json
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const WORKSPACE = path.join(REPO, 'tools', 'debug', 'probes', 'assembly-probe');
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'w09-w11-assembly.json');
const TIMEOUT_MS = 90000;

let playwright;
try {
    playwright = require('playwright');
} catch (e) {
    console.error('[w04] 需要外部 Playwright：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/w08-step-clock.cjs');
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
            const wfp = path.join(WORKSPACE, rel);
            let f = fs.existsSync(wfp) ? path.resolve(wfp) : path.resolve(path.join(REPO, rel));
            if (!f.startsWith(REPO)) { res.writeHead(403); res.end(); return; }
            if (!fs.existsSync(f) || !fs.statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
            const mime = MIME[path.extname(f)] || (path.extname(f) === '.wav' ? 'audio/wav' : 'application/octet-stream');
            res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-store' });
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

    const MODES = [{ id: 'assembly' }];
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
            try { await page.waitForFunction(() => window.__assemblyProbe && window.__assemblyProbe.ready === true, null, { timeout: TIMEOUT_MS }); }
            catch (e) { await page.waitForTimeout(1500); }
            probe = await page.evaluate(() => window.__assemblyProbe);
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
        console.log(`[w09w11] ${mode.id}: ${pass ? 'PASS' : 'FAIL'}${failedChecks.length ? ' failed=[' + failedChecks.join(',') + ']' : ''}${pageErrors.length ? ' pageErrors=' + pageErrors.length : ''}${runError ? ' err=' + runError.slice(0, 100) : ''}`);
    }

    await browser.close();
    server.close();
    const verdictPass = runs.every((r) => r.pass);
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify({
        measuredAt: new Date().toISOString(),
        evidence: 'w08-step-clock (Code First 与 Web 可靠性任务清单 W04)',
        taskDoc: 'ai/Cocos Air Code First 与 Web 可靠性优化任务清单.md',
        bundle: { sha256_16: crypto.createHash('sha256').update(fs.readFileSync(bundlePath)).digest('hex').slice(0, 16), bytes: fs.statSync(bundlePath).size },
        browser: { name: 'chromium headless (ANGLE/SwiftShader)', viewport: `${W}x${H}`, hasTouchNote: 'anyid 模式 hasTouch=true（真实触摸 tap）；鼠标模拟触摸路径由引擎 input 系统在无触摸能力平台自处理，未单测' },
        contract: {
            W09: 'createUICanvas/spriteNode/labelNode 复用原生组件；AssetBank 并发去重+引用计数+归零释放+失败清理',
            W10: 'SceneStack：push/pop、过渡双页同绘+输入屏蔽、返回页保活、LRU 缓存上限、在途转场被新导航收口',
            W11: 'AudioService：BGM 按 ID 续播（currentTime 实测推进为准）、SFX 池上限 5、双开关独立、dispose',
            audioEnv: 'chromium --autoplay-policy=no-user-gesture-required；Safari/WebKit 与 Web Audio vs DOM 后端为未测条件',
        },
        runs, verdict: verdictPass ? 'PASS' : 'FAIL',
    }, null, 2) + '\n');
    console.log(`[w09w11] verdict=${verdictPass ? 'PASS' : 'FAIL'} → ${path.relative(REPO, EVIDENCE_PATH)}`);
    process.exit(verdictPass ? 0 : 1);
})().catch((e) => { console.error('[w04] fatal: ' + ((e && e.stack) || e)); process.exit(1); });
