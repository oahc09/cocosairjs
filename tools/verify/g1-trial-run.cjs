/* G1 试验运行器 — 组合场景示例的行为探针验证（非正典证据）。
 *
 * 定位：计划书 §1「负控和试验运行应写仓库外临时路径或副本」。本运行器不写
 * docs/evidence/*，不触碰 examples/files.json，不做 apiProof 插桩——它只驱动
 * examples/<id>/ 页面、消费页内状态探针（window.__trialProbe），把结果写到
 * OS 临时目录。正典验证（v11-examples-verify 全链）在集成阶段另行执行。
 *
 * 页内合同：示例在确定性时间线终点设置
 *   window.__trialProbe = { id, ready: true, ok: boolean, checks: [{name, ok, detail}], state: {...} }
 * ready 之前的中间状态也必须挂同一对象（ready:false）。
 *
 * 执行：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/g1-trial-run.cjs --ids=a,b [--keep-open]
 * 产出：<os.tmpdir>/cocosair-g1-trial/<id>.json + <id>.png
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const REPO = path.resolve(__dirname, '..', '..');
const OUT_DIR = path.join(os.tmpdir(), 'cocosair-g1-trial');
const PER_EXAMPLE_TIMEOUT = 150000;

let playwright;
try {
    playwright = require('playwright');
} catch (e) {
    console.error(
        '[g1-trial] 需要外部 Playwright：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/g1-trial-run.cjs',
    );
    process.exit(2);
}

const esbuild = require(path.join(REPO, 'node_modules', 'esbuild'));
const { BrowserRuntime } = require(path.join(REPO, 'tools', 'benchmark', 'runner', 'browser-runtime.cjs'));

/** 与正典同源的 TS 类型合同（browser-runtime typecheck：对 build d.ts，strict:false）。 */
function typecheckExample(id) {
    const dir = path.join(ROOT, id);
    const entry = ['src/main.ts', 'main.ts'].map((rel) => path.join(dir, rel)).find((p) => fs.existsSync(p));
    if (!entry) {
        return [];
    } // 纯 JS 示例没有类型合同（与 browser-runtime 同语义）
    const ts = require(require.resolve('typescript', { paths: [REPO] }));
    const rt = new BrowserRuntime({ esbuild, repo: REPO });
    return rt.typecheck(entry, ts, { paths: { workspace: dir } });
}

const args = process.argv.slice(2);
const idsArg = args.find((a) => a.startsWith('--ids='));
if (!idsArg) {
    console.error('[g1-trial] 必须 --ids=<example 目录列表>');
    process.exit(2);
}
const ids = idsArg
    .slice(6)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
// --root=<examples 根>（默认 REPO/examples；隔离工作区试验时用 --root= 指向该根，避开对 examples/ 的并发触碰）
const rootArg = args.find((a) => a.startsWith('--root='));
const ROOT = rootArg ? path.resolve(REPO, rootArg.slice(7)) : path.join(REPO, 'examples');
const ROOT_REL = path.relative(REPO, ROOT).split(path.sep).join('/');
// 交互试验：--click 表示 ready 后对画布中心点 N 次再读探针（模拟 v11 交互窗口）
const clickArg = args.find((a) => a.startsWith('--click='));
const clicks = clickArg ? Number(clickArg.slice(8)) : 0;

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.glb': 'model/gltf-binary',
    '.bin': 'application/octet-stream',
    '.wasm': 'application/wasm',
    '.css': 'text/css; charset=utf-8',
    '.ts': 'text/javascript; charset=utf-8',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
};

/** 仓库根静态服务：/examples/**、/build/**、/docs/**（asset 路径按仓库真实布局直接可用）。 */
function startServer() {
    const server = http.createServer((req, res) => {
        try {
            const p = decodeURIComponent((req.url || '/').split('?')[0]);
            if (p === '/favicon.ico') {
                res.writeHead(204);
                res.end();
                return;
            }
            const file = require('../dev/resolve-script.cjs').resolveScript(
                path.resolve(path.join(REPO, p.replace(/^\/+/, ''))),
            );
            if (!file.startsWith(REPO)) {
                res.writeHead(403);
                res.end('forbidden');
                return;
            }
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
                res.writeHead(404);
                res.end('not found: ' + p);
                return;
            }
            if (path.extname(file) === '.ts') {
                const result = esbuild.transformSync(fs.readFileSync(file, 'utf8'), {
                    loader: 'ts',
                    format: 'esm',
                    target: 'es2022',
                    sourcefile: file,
                });
                res.writeHead(200, { 'Content-Type': MIME['.ts'], 'Cache-Control': 'no-store' });
                res.end(Buffer.from(result.code));
                return;
            }
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
                'Cache-Control': 'no-store',
            });
            res.end(fs.readFileSync(file));
        } catch (error) {
            if (!res.headersSent) {
                res.writeHead(500);
                res.end(String(error.message || error));
            }
        }
    });
    return new Promise((resolve) => {
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
    });
}

async function runOne(browser, port, id) {
    const t0 = Date.now();
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const consoleErrors = [];
    const pageErrors = [];
    page.on('console', (m) => {
        if (m.type() === 'error') {
            consoleErrors.push(m.text().slice(0, 400));
        }
    });
    page.on('pageerror', (e) => {
        pageErrors.push(String((e && (e.stack || e.message)) || e).slice(0, 900));
    });
    const result = { id, ms: 0, verdict: 'FAIL', probe: null, consoleErrors, pageErrors, runError: null };
    try {
        await page.goto(`http://127.0.0.1:${port}/${ROOT_REL}/${id}/index.html`, { waitUntil: 'load', timeout: 60000 });
        await page.waitForFunction('window.__trialProbe && window.__trialProbe.ready === true', null, {
            timeout: PER_EXAMPLE_TIMEOUT,
        });
        if (clicks > 0) {
            const canvas = await page.$('#GameCanvas');
            const box = await canvas.boundingBox();
            for (let i = 0; i < clicks; i++) {
                await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                await new Promise((r) => setTimeout(r, 700));
            }
            // 点击后示例若有 post-click 断言，等 probe 重新 ready（clickPhase 完成）
            await page
                .waitForFunction('window.__trialProbe && window.__trialProbe.clickPhaseDone === true', null, {
                    timeout: 15000,
                })
                .catch(() => {
                    /* 无点击相位则忽略 */
                });
        }
        result.probe = await page.evaluate(() => window.__trialProbe);
        await page.screenshot({ path: path.join(OUT_DIR, id + '.png') });
        const checks = (result.probe && result.probe.checks) || [];
        const failed = checks.filter((c) => !c.ok);
        result.verdict =
            result.probe && result.probe.ok === true && failed.length === 0 && pageErrors.length === 0
                ? 'PASS'
                : 'FAIL';
        result.failedChecks = failed.map((c) => c.name + ': ' + c.detail);
    } catch (e) {
        result.runError = String((e && e.message) || e).slice(0, 400);
        try {
            result.probe = await page.evaluate(() => window.__trialProbe || null);
        } catch (e2) {
            /* 忽略 */
        }
    } finally {
        result.ms = Date.now() - t0;
        await page.close();
    }
    return result;
}

(async function main() {
    if (!fs.existsSync(path.join(REPO, 'build', 'cocosair.module.js'))) {
        console.error('[g1-trial] 缺少 build/cocosair.module.js —— 先跑 npm run build');
        process.exit(2);
    }
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const { server, port } = await startServer();
    const launchOpts = { headless: true };
    const chromiumExe = [
        'C:',
        'Users',
        'caosh',
        'AppData',
        'Local',
        'ms-playwright',
        'chromium-1228',
        'chrome-win64',
        'chrome.exe',
    ].join('\\');
    if (fs.existsSync(chromiumExe)) {
        launchOpts.executablePath = chromiumExe;
    }
    launchOpts.args = ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'];
    const browser = await playwright.chromium.launch(launchOpts);

    const results = [];
    try {
        for (const id of ids) {
            const dir = path.join(ROOT, id);
            if (!fs.existsSync(path.join(dir, 'index.html'))) {
                console.error(`[g1-trial] ${ROOT_REL}/${id}/index.html 不存在，跳过`);
                results.push({ id, verdict: 'SKIP', runError: 'missing index.html' });
                continue;
            }
            const diags = typecheckExample(id);
            if (diags.length > 0) {
                console.error(`[g1-trial] examples/${id} 类型合同 FAIL：`);
                diags.slice(0, 10).forEach((d) => console.error('  ' + d));
                results.push({ id, verdict: 'FAIL', runError: 'typecheck: ' + diags.slice(0, 3).join(' | ') });
                continue;
            }
            const r = await runOne(browser, port, id);
            results.push(r);
            console.log(`[${r.verdict}] ${id} (${(r.ms / 1000).toFixed(1)}s)`);
            for (const c of (r.probe && r.probe.checks) || []) {
                console.log(`  [${c.ok ? 'ok' : 'FAIL'}] ${c.name} — ${c.detail}`);
            }
            if (r.runError) {
                console.log('  runError: ' + r.runError);
            }
            if (r.pageErrors && r.pageErrors.length) {
                console.log('  pageErrors: ' + r.pageErrors.slice(0, 3).join(' | '));
            }
            if (r.consoleErrors && r.consoleErrors.length) {
                console.log('  consoleErrors: ' + r.consoleErrors.slice(0, 3).join(' | '));
            }
        }
    } finally {
        await browser.close();
        server.close();
    }

    const summary = {
        measuredAt: new Date().toISOString(),
        runner: 'tools/verify/g1-trial-run.cjs (trial, non-canonical)',
        outDir: OUT_DIR,
        results,
    };
    fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    const pass = results.filter((r) => r.verdict === 'PASS').length;
    console.log(`[g1-trial] ${pass}/${results.length} PASS → ${path.join(OUT_DIR, 'summary.json')}`);
    process.exitCode = pass === results.length ? 0 : 1;
})();
