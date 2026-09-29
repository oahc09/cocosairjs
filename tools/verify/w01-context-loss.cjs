/* W01 上下文丢失运行器 — tools/debug/probes/context-loss-probe（隔离探针，不进 Gallery/coverage 门禁）。
 *
 * 任务清单 W01：在受支持的 WebGL2 后端实际复现 WEBGL_lose_context，验证
 * Air 生命周期合同（healthy→lost→restoring→failed 状态机）：
 *   - lost 后 game.pause() 生效（AFTER_DRAW 计数与业务时钟冻结 = 暂停无效提交）；
 *   - 恢复路径如实判定 failed（不宣称自愈）+ 受控重载门掣（healthy 拒绝 / failed 生效）；
 *   - 多次丢失稳定；pageerror 必须为零（失败状态不得记 PASS）。
 *
 * 执行：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/w01-context-loss.cjs
 * 产出：docs/evidence/w01-context-loss.json（独立证据路径，不覆写并发工作的正式证据）
 *
 * 判定：WebGL2 probe.ok ∧ probe.ready ∧ pageErrors=0 ∧ checks 全 PASS ⇒ verdict=PASS，退出码 0。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const WORKSPACE = path.join(REPO, 'tools', 'debug', 'probes', 'context-loss-probe');
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'w01-context-loss.json');
const TIMEOUT_MS = 180000;

let playwright;
try {
    playwright = require('playwright');
} catch (e) {
    console.error('[w01] 需要外部 Playwright：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/w01-context-loss.cjs');
    console.error('[w01] require 失败：' + e.message);
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

function sha256_16 (file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').slice(0, 16);
}

(async function main () {
    const bundlePath = path.join(REPO, 'build', 'cocosair.module.js');
    if (!fs.existsSync(bundlePath)) {
        console.error('[w01] 缺少 build/cocosair.module.js —— 先跑 npm run build');
        process.exit(2);
    }
    if (!fs.existsSync(path.join(WORKSPACE, 'index.html'))) {
        console.error('[w01] 缺少 ' + path.relative(REPO, WORKSPACE) + '/index.html');
        process.exit(2);
    }

    const { server, port } = await startServer();
    const launchOpts = { headless: true, args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] };
    if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH) {
        launchOpts.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    }
    const browser = await playwright.chromium.launch(launchOpts);

    // WebGL 1 startup rejection is verified separately by webgl2-only.cjs.
    const MODES = [
        { id: 'webgl2', expect: 'webgl2', initScript: null },
    ];

    const runs = [];
    for (const mode of MODES) {
        const runnerConsole = [];
        const pageErrors = [];
        let probe = null;
        let runError = null;
        const t0 = Date.now();
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
        try {
            page.on('console', (msg) => {
                runnerConsole.push({ type: msg.type(), text: msg.text().slice(0, 400) });
            });
            page.on('pageerror', (err) => {
                pageErrors.push(String((err && err.message) || err).slice(0, 800));
            });
            if (mode.initScript) { await page.addInitScript(mode.initScript); }
            await page.goto(`http://127.0.0.1:${port}/index.html?expect=${mode.expect}`, { waitUntil: 'load', timeout: 60000 });
            await page.waitForFunction(() => window.__ctxLossProbe && window.__ctxLossProbe.ready === true, null, { timeout: TIMEOUT_MS });
            probe = await page.evaluate(() => window.__ctxLossProbe);
        } catch (e) {
            runError = String((e && e.message) || e);
        } finally {
            await page.close().catch(() => {});
        }

        const failedChecks = probe ? probe.checks.filter((c) => !c.pass).map((c) => c.name) : ['probe-not-ready'];
        // 预期内的引擎告警（swapchain warnID 11000 / warn(event)）不算失败；pageerror 计零。
        const unexpectedConsole = runnerConsole.filter((c) => c.type === 'error');
        const pass = !!probe && probe.ready === true && probe.ok === true
            && pageErrors.length === 0 && runError === null && failedChecks.length === 0;
        runs.push({
            mode: mode.id,
            expectBackend: mode.expect,
            pass,
            durationMs: Date.now() - t0,
            probe: probe ? {
                ok: probe.ok, ready: probe.ready,
                samples: probe.samples,
                info: probe.info,
                checks: probe.checks,
            } : null,
            failedChecks,
            pageErrors,
            unexpectedConsoleErrors: unexpectedConsole,
            consoleSummary: {
                total: runnerConsole.length,
                warns: runnerConsole.filter((c) => c.type === 'warning').length,
                errors: unexpectedConsole.length,
            },
            runError,
        });
        console.log(`[w01] ${mode.id}: ${pass ? 'PASS' : 'FAIL'}`
            + (failedChecks.length ? ` failed=[${failedChecks.join(',')}]` : '')
            + (pageErrors.length ? ` pageErrors=${pageErrors.length}` : '')
            + (runError ? ` runError=${runError.slice(0, 120)}` : ''));
    }

    await browser.close();
    server.close();

    const bundle = { sha256_16: sha256_16(bundlePath), bytes: fs.statSync(bundlePath).size };
    const verdictPass = runs.every((r) => r.pass);
    const evidence = {
        measuredAt: new Date().toISOString(),
        evidence: 'w01-context-loss (Code First 与 Web 可靠性任务清单 W01)',
        taskDoc: 'ai/Cocos Air Code First 与 Web 可靠性优化任务清单.md',
        bundle,
        browser: { name: 'chromium headless (ANGLE/SwiftShader)', viewport: '1280x720', launchArgs: launchOpts.args },
        contract: {
            states: ['healthy', 'lost', 'restoring', 'failed'],
            lost: 'preventDefault + game.pause()（停 rAF/渲染/业务时钟/音频 = 暂停无效提交）',
            restored: '如实判定 failed（GPU 资源不重建，不宣称自愈）+ 受控重载建议',
            reloadGate: 'requestReload()：healthy 态拒绝（false），failed 态执行（true）',
        },
        runs,
        verdict: verdictPass ? 'PASS' : 'FAIL',
    };
    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
    console.log(`[w01] verdict=${evidence.verdict} → ${path.relative(REPO, EVIDENCE_PATH)}`);
    process.exit(verdictPass ? 0 : 1);
})().catch((e) => {
    console.error('[w01] fatal: ' + ((e && e.stack) || e));
    process.exit(1);
});
