/* W02 冷启动回归运行器 — tools/debug/probes/coldstart-probe（隔离探针，不进 Gallery/coverage 门禁）。
 *
 * 任务清单 W02：固定 bundle hash 的最小页面，无 Creator 资产包、空缓存（每轮独立
 * browser context + cache-busting query）条件下跑三条路径 ×两轮（重复启动覆盖）：
 *   builtin / cannon / lowlevel（公开 game.init()）。
 *
 * 执行：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/coldstart.cjs
 * 产出：docs/evidence/w02-coldstart.json（独立证据路径）
 *
 * 判定：全部 run pass（probe.ok ∧ ready ∧ pageErrors=0 ∧ failedChecks=∅）⇒ verdict=PASS，退出码 0。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const WORKSPACE = path.join(REPO, 'tools', 'debug', 'probes', 'coldstart-probe');
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'w02-coldstart.json');
const TIMEOUT_MS = 120000;

let playwright;
try {
    playwright = require('playwright');
} catch (e) {
    console.error('[w02] 需要外部 Playwright：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/coldstart.cjs');
    console.error('[w02] require 失败：' + e.message);
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
        console.error('[w02] 缺少 build/cocosair.module.js —— 先跑 npm run build');
        process.exit(2);
    }
    const { server, port } = await startServer();
    const launchOpts = { headless: true, args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] };
    const browser = await playwright.chromium.launch(launchOpts);

    const PATHS = [
        { id: 'builtin' },
        { id: 'cannon' },
        { id: 'lowlevel' },
    ];
    const REPEATS = 2; // 重复启动覆盖：同一页面整链路跑两轮（各自独立 context = 空缓存）
    const runs = [];
    for (const p of PATHS) {
        for (let i = 1; i <= REPEATS; i++) {
            const runnerConsole = [];
            const pageErrors = [];
            let probe = null;
            let runError = null;
            const t0 = Date.now();
            // 独立 context：无共享 HTTP 缓存（空缓存条件）；buster 防中间层缓存。
            const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
            const page = await context.newPage();
            try {
                page.on('console', (msg) => {
                    runnerConsole.push({ type: msg.type(), text: msg.text().slice(0, 400) });
                });
                page.on('pageerror', (err) => {
                    pageErrors.push(String((err && err.message) || err).slice(0, 800));
                });
                await page.goto(`http://127.0.0.1:${port}/index.html?path=${p.id}&run=${i}_${Date.now()}`, { waitUntil: 'load', timeout: 60000 });
                await page.waitForFunction(() => window.__coldstartProbe && window.__coldstartProbe.ready === true, null, { timeout: TIMEOUT_MS });
                probe = await page.evaluate(() => window.__coldstartProbe);
            } catch (e) {
                runError = String((e && e.message) || e);
            } finally {
                await context.close().catch(() => {});
            }
            const failedChecks = probe ? probe.checks.filter((c) => !c.pass).map((c) => c.name) : ['probe-not-ready'];
            const pass = !!probe && probe.ready === true && probe.ok === true
                && pageErrors.length === 0 && runError === null && failedChecks.length === 0;
            runs.push({
                path: p.id, run: i, pass,
                durationMs: Date.now() - t0,
                probe: probe || null,
                failedChecks, pageErrors,
                consoleSummary: {
                    total: runnerConsole.length,
                    errors: runnerConsole.filter((c) => c.type === 'error').length,
                },
                runError,
            });
            console.log(`[w02] ${p.id}#${i}: ${pass ? 'PASS' : 'FAIL'}`
                + (failedChecks.length ? ` failed=[${failedChecks.join(',')}]` : '')
                + (pageErrors.length ? ` pageErrors=${pageErrors.length}` : '')
                + (runError ? ` runError=${runError.slice(0, 120)}` : ''));
        }
    }

    await browser.close();
    server.close();

    const bundle = { sha256_16: sha256_16(bundlePath), bytes: fs.statSync(bundlePath).size };
    const verdictPass = runs.every((r) => r.pass);
    const evidence = {
        measuredAt: new Date().toISOString(),
        evidence: 'w02-coldstart (Code First 与 Web 可靠性任务清单 W02)',
        taskDoc: 'ai/plans/code-first-web-reliability.md',
        bundle,
        browser: { name: 'chromium headless (ANGLE/SwiftShader)', viewport: '1280x720', launchArgs: launchOpts.args },
        conditions: {
            creatorAssetPackage: 'none（settingsPath=""，无远程 settings.json）',
            cache: '每轮独立 browser context（无跨轮 HTTP 缓存）+ cache-busting query',
            repeats: REPEATS,
        },
        runs,
        verdict: verdictPass ? 'PASS' : 'FAIL',
    };
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');
    console.log(`[w02] verdict=${evidence.verdict} → ${path.relative(REPO, EVIDENCE_PATH)}`);
    process.exit(verdictPass ? 0 : 1);
})().catch((e) => {
    console.error('[w02] fatal: ' + ((e && e.stack) || e));
    process.exit(1);
});
