/* G4 Shader 探针运行器 — tools/debug/probes/shader-probe（隔离探针，不进 Gallery/覆盖率门禁）。
 *
 * 任务计划书 §3 G4.1：验证「用户手写 GLSL → EffectAsset 注册 → Material 绑定 →
 * uniform 更新 → WebGL 上屏」与编译错误诊断路径。探针逻辑在示例页内
 * （window.__shaderProbe），本运行器负责：静态服务、无头浏览器、console/pageerror
 * 捕获、结果收集与证据落盘。
 *
 * 执行：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/g4-shader-probe.cjs
 * 产出：docs/evidence/g4-shader-probe.json + docs/evidence/examples/g4-shader-probe.png
 *
 * 判定：页内 checks 全 PASS ∧ 无 fatal ∧ checks 非空（反空转）⇒ verdict=PASS，退出码 0。
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..', '..');
// --root=<shader-probe 所在根>（默认 tools/debug/probes——探针为隔离诊断页，常驻工具区不进 Gallery）
const rootArg = process.argv.slice(2).find((a) => a.startsWith('--root='));
const WORKSPACE = rootArg
    ? path.join(path.resolve(REPO, rootArg.slice(7)), 'shader-probe')
    : path.join(REPO, 'tools', 'debug', 'probes', 'shader-probe');
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'g4-shader-probe.json');
const TIMEOUT_MS = 180000;

let playwright;
try {
    playwright = require('playwright');
} catch (e) {
    console.error(
        '[g4-probe] 需要外部 Playwright：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/g4-shader-probe.cjs',
    );
    console.error('[g4-probe] require 失败：' + e.message);
    process.exit(2);
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.css': 'text/css; charset=utf-8',
};

function startServer() {
    const server = http.createServer((req, res) => {
        try {
            const p = decodeURIComponent((req.url || '/').split('?')[0]);
            if (p === '/favicon.ico') {
                res.writeHead(204);
                res.end();
                return;
            }
            if (p.startsWith('/build/')) {
                const buildFile = path.join(REPO, p);
                if (fs.existsSync(buildFile) && fs.statSync(buildFile).isFile()) {
                    res.writeHead(200, {
                        'Content-Type': MIME[path.extname(buildFile)] || 'application/octet-stream',
                        'Cache-Control': 'no-store',
                    });
                    res.end(fs.readFileSync(buildFile));
                    return;
                }
                res.writeHead(404);
                res.end('not found (build?)');
                return;
            }
            let rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
            const file = path.resolve(path.join(WORKSPACE, rel));
            if (!file.startsWith(WORKSPACE)) {
                res.writeHead(403);
                res.end('forbidden');
                return;
            }
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
                res.writeHead(404);
                res.end('not found');
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

(async function main() {
    const bundlePath = path.join(REPO, 'build', 'cocosair.module.js');
    if (!fs.existsSync(bundlePath)) {
        console.error('[g4-probe] 缺少 build/cocosair.module.js —— 先跑 npm run build');
        process.exit(2);
    }
    if (!fs.existsSync(path.join(WORKSPACE, 'index.html'))) {
        console.error('[g4-probe] 缺少 ' + path.relative(REPO, WORKSPACE) + '/index.html');
        process.exit(2);
    }

    let head = '';
    try {
        head = execSync('git rev-parse HEAD', { cwd: REPO }).toString().trim();
    } catch (e) {
        /* 记录失败不阻断 */
    }
    let candidateFingerprint = '';
    try {
        candidateFingerprint = require(path.join(REPO, 'tools', 'verify', 'api-trace.cjs')).candidateFingerprint();
    } catch (e) {
        /* 同上 */
    }

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

    // 双后端：默认（device-manager 优选 WebGL2）+ 强制 WebGL1 降级对照
    //（init script 屏蔽 WebGL2RenderingContext → useWebGL2=false → WebGLDevice → program-lib 选 glsl1）
    const MODES = [
        {
            id: 'default',
            initScript: null,
            screenshot: path.join(REPO, 'docs', 'evidence', 'examples', 'g4-shader-probe-default.png'),
        },
        {
            id: 'force-webgl1',
            initScript: 'window.WebGL2RenderingContext = undefined;',
            screenshot: path.join(REPO, 'docs', 'evidence', 'examples', 'g4-shader-probe-force-webgl1.png'),
        },
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
                runnerConsole.push({ type: msg.type(), text: msg.text().slice(0, 800) });
            });
            page.on('pageerror', (err) => {
                pageErrors.push(String((err && err.message) || err).slice(0, 800));
            });
            if (mode.initScript) {
                await page.addInitScript(mode.initScript);
            }
            await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load', timeout: 60000 });
            await page.waitForFunction('window.__shaderProbe && window.__shaderProbe.done === true', null, {
                timeout: TIMEOUT_MS,
            });
            probe = await page.evaluate(() => window.__shaderProbe);
            await page.screenshot({ path: mode.screenshot });
        } catch (e) {
            runError = String((e && e.message) || e).slice(0, 500);
            try {
                probe = await page.evaluate(() => window.__shaderProbe || null);
            } catch (e2) {
                /* 捞不到就算了 */
            }
        } finally {
            await page.close();
        }

        const checks = (probe && probe.checks) || [];
        const failCount = checks.filter((c) => c.result !== 'PASS').length;
        const verdict = !runError && probe && !probe.fatal && checks.length > 0 && failCount === 0 ? 'PASS' : 'FAIL';
        runs.push({
            mode: mode.id,
            verdict,
            ms: Date.now() - t0,
            runError,
            fatal: (probe && probe.fatal) || null,
            checks,
            info: (probe && probe.info) || null,
            samples: (probe && probe.samples) || null,
            pageConsoleErrors: ((probe && probe.consoleErrors) || []).slice(0, 30),
            pageConsoleWarns: ((probe && probe.consoleWarns) || []).slice(0, 20),
            runnerConsoleErrors: runnerConsole.filter((c) => c.type === 'error').slice(0, 30),
            pageErrors: pageErrors.slice(0, 10),
            screenshot: path.relative(REPO, mode.screenshot).split(path.sep).join('/'),
        });
        console.log(`[g4-probe:${mode.id}] verdict=${verdict} checks=${checks.length} fail=${failCount}`);
        for (const c of checks) {
            console.log(`  [${c.result}] ${c.name} — ${c.detail}`);
        }
        if (probe && probe.info) {
            console.log(
                `  backend: glContext=${probe.info.glContext} gfxAPI=${probe.info.gfxAPIName}(${probe.info.gfxAPIValue}) glVersion=${probe.info.glVersion}`,
            );
            console.log(`  registerBeforeBoot=${probe.info.registerBeforeBoot}`);
        }
        if (runError) {
            console.log('  runError=' + runError);
        }
        if (probe && probe.fatal) {
            console.log('  fatal=' + probe.fatal.slice(0, 400));
        }
    }

    await browser.close();
    server.close();

    const verdict = runs.every((r) => r.verdict === 'PASS') ? 'PASS' : 'FAIL';
    const evidence = {
        measuredAt: new Date().toISOString(),
        runner: 'tools/verify/g4-shader-probe.cjs',
        mode: 'g4-shader-probe-v1',
        head,
        candidateFingerprint,
        browser: { name: 'chromium', headless: true, viewport: '1280x720', launchArgs: launchOpts.args },
        verdict,
        runs,
    };

    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(evidence, null, 2) + '\n');

    console.log(`[g4-probe] overall verdict=${verdict}（${runs.map((r) => r.mode + '=' + r.verdict).join(', ')}）`);
    console.log('[g4-probe] evidence → docs/evidence/g4-shader-probe.json');
    process.exitCode = verdict === 'PASS' ? 0 : 1;
})();
