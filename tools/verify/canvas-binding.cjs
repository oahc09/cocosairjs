/* W04 画布绑定与焦点合同运行器 — tools/debug/probes/canvas-binding-probe。
 *
 * 模式：classic（控制组）/ anyid（__CC_CANVAS__ 覆盖 + 动态 import，hasTouch 上下文做真实触摸）/
 * decoy（冲突显式拒绝）。anyid 用 hasTouch 上下文 + touchscreen.tap 覆盖触摸面。
 *
 * 执行：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/canvas-binding.cjs
 * 产出：docs/evidence/w04-canvas-binding.json
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const REPO = path.resolve(__dirname, '..', '..');
const WORKSPACE = path.join(REPO, 'tools', 'debug', 'probes', 'canvas-binding-probe');
const EVIDENCE_PATH = path.join(REPO, 'docs', 'evidence', 'w04-canvas-binding.json');
const TIMEOUT_MS = 90000;

let playwright;
try {
    playwright = require('playwright');
} catch (e) {
    console.error(
        '[w04] 需要外部 Playwright：NODE_PATH=<含 playwright 的 node_modules> node tools/verify/canvas-binding.cjs',
    );
    process.exit(2);
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
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
                const f = path.join(REPO, p);
                if (fs.existsSync(f)) {
                    res.writeHead(200, {
                        'Content-Type': p.endsWith('.js')
                            ? 'text/javascript; charset=utf-8'
                            : 'application/octet-stream',
                        'Cache-Control': 'no-store',
                    });
                    res.end(fs.readFileSync(f));
                    return;
                }
                res.writeHead(404);
                res.end();
                return;
            }
            const rel = p === '/' ? 'index.html' : p.replace(/^\/+/, '');
            const f = path.join(WORKSPACE, rel);
            if (!f.startsWith(WORKSPACE) || !fs.existsSync(f)) {
                res.writeHead(404);
                res.end();
                return;
            }
            res.writeHead(200, {
                'Content-Type': MIME[path.extname(f)] || 'application/octet-stream',
                'Cache-Control': 'no-store',
            });
            res.end(fs.readFileSync(f));
        } catch (e) {
            if (!res.headersSent) {
                res.writeHead(500);
                res.end(String(e.message || e));
            }
        }
    });
    return new Promise((resolve) =>
        server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port })),
    );
}

(async function main() {
    const bundlePath = path.join(REPO, 'build', 'cocosair.module.js');
    if (!fs.existsSync(bundlePath)) {
        console.error('[w04] 先 npm run build');
        process.exit(2);
    }
    const { server, port } = await startServer();
    const browser = await playwright.chromium.launch({
        headless: true,
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader'],
    });

    const MODES = [
        { id: 'classic', hasTouch: false },
        { id: 'anyid', hasTouch: true },
        { id: 'decoy', hasTouch: false },
        { id: 'unbound', hasTouch: false },
    ];
    const W = 1280;
    const H = 720;
    const runs = [];
    for (const mode of MODES) {
        const consoleMsgs = [];
        const pageErrors = [];
        let probe = null;
        let runError = null;
        const t0 = Date.now();
        const context = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: mode.hasTouch });
        const page = await context.newPage();
        try {
            page.on('console', (m) => consoleMsgs.push({ type: m.type(), text: m.text().slice(0, 300) }));
            page.on('pageerror', (e) => pageErrors.push(String((e && e.message) || e).slice(0, 600)));
            await page.goto(`http://127.0.0.1:${port}/index.html?mode=${mode.id}`, {
                waitUntil: 'load',
                timeout: 60000,
            });
            await page.waitForFunction(
                () => window.__bindingProbe && (window.__bindingArmed || window.__bindingProbe.ready),
                null,
                { timeout: TIMEOUT_MS },
            );

            if (mode.id !== 'decoy' && mode.id !== 'unbound') {
                // 鼠标：点击 (400,300) → 期望左下原点 location (400, 720-300=420)
                await page.mouse.click(400, 300);
                await page.waitForTimeout(250);
                const snap1 = await page.evaluate(() => ({
                    active: document.activeElement === window.__bindingCanvas,
                    mouse: (window.__bindingProbe.mouseEvents || [])[0] || null,
                }));
                // 键盘：聚焦态按键
                await page.keyboard.press('KeyK');
                await page.waitForTimeout(150);
                const keyFocused = await page.evaluate(() => (window.__bindingProbe.keyEvents || []).length);
                // 失焦后按键（应不产生引擎键盘事件）
                await page.evaluate(() => window.__bindingCanvas.blur());
                await page.waitForTimeout(100);
                await page.keyboard.press('KeyL');
                await page.waitForTimeout(150);
                const keyBlurredDelta =
                    (await page.evaluate(() => (window.__bindingProbe.keyEvents || []).length)) - keyFocused;
                // 再点击复焦
                await page.mouse.click(500, 400);
                await page.waitForTimeout(200);
                const refocus = await page.evaluate(() => document.activeElement === window.__bindingCanvas);
                // 触摸（hasTouch 上下文）
                let touchStart = null;
                if (mode.hasTouch) {
                    await page.touchscreen.tap(300, 300);
                    await page.waitForTimeout(250);
                    touchStart = await page.evaluate(() => (window.__bindingProbe.touchEvents || []).length > 0);
                }
                await page.evaluate(
                    (r) => {
                        window.__bindingResults = r;
                    },
                    {
                        mouseDown: snap1.mouse,
                        expectedMouse: { x: 400, y: H - 300 },
                        focusAfterClick: snap1.active,
                        keyWhileFocused: keyFocused,
                        keyWhileBlurred: keyBlurredDelta,
                        focusAfterReclick: refocus,
                        touchTested: mode.hasTouch,
                        touchStart,
                    },
                );
            }
            await page.waitForFunction(() => window.__bindingProbe && window.__bindingProbe.ready === true, null, {
                timeout: TIMEOUT_MS,
            });
            probe = await page.evaluate(() => window.__bindingProbe);
        } catch (e) {
            runError = String((e && e.message) || e);
        } finally {
            await context.close().catch(() => {});
        }
        const failedChecks = probe ? probe.checks.filter((c) => !c.pass).map((c) => c.name) : ['probe-not-ready'];
        const pass =
            !!probe &&
            probe.ready === true &&
            probe.ok === true &&
            pageErrors.length === 0 &&
            runError === null &&
            failedChecks.length === 0;
        runs.push({
            mode: mode.id,
            hasTouch: mode.hasTouch,
            pass,
            durationMs: Date.now() - t0,
            probe: probe ? { ok: probe.ok, checks: probe.checks, samples: probe.samples, info: probe.info } : null,
            failedChecks,
            pageErrors,
            runError,
            consoleSummary: {
                total: consoleMsgs.length,
                warns: consoleMsgs.filter((c) => c.type === 'warning').length,
            },
        });
        console.log(
            `[w04] ${mode.id}: ${pass ? 'PASS' : 'FAIL'}${failedChecks.length ? ' failed=[' + failedChecks.join(',') + ']' : ''}${pageErrors.length ? ' pageErrors=' + pageErrors.length : ''}${runError ? ' err=' + runError.slice(0, 100) : ''}`,
        );
    }

    await browser.close();
    server.close();
    const verdictPass = runs.every((r) => r.pass);
    fs.writeFileSync(
        EVIDENCE_PATH,
        JSON.stringify(
            {
                measuredAt: new Date().toISOString(),
                evidence: 'w04-canvas-binding (Code First 与 Web 可靠性任务清单 W04)',
                taskDoc: 'ai/plans/code-first-web-reliability.md',
                bundle: {
                    sha256_16: crypto
                        .createHash('sha256')
                        .update(fs.readFileSync(bundlePath))
                        .digest('hex')
                        .slice(0, 16),
                    bytes: fs.statSync(bundlePath).size,
                },
                browser: {
                    name: 'chromium headless (ANGLE/SwiftShader)',
                    viewport: `${W}x${H}`,
                    hasTouchNote:
                        'anyid 模式 hasTouch=true（真实触摸 tap）；鼠标模拟触摸路径由引擎 input 系统在无触摸能力平台自处理，未单测',
                },
                contract: {
                    override:
                        'globalThis.__CC_CANVAS__ = <canvas> 必须在引擎 import 前设置（静态页内联脚本或动态 import 前）',
                    conflict: '页面已有另一 #GameCanvas + 传入自定义 id 画布 ⇒ createAirApp 显式抛错',
                    focus: 'tabIndex 默认 0；PAL mousedown/touchstart 自动 canvas.focus()；键盘事件仅聚焦时到达',
                },
                runs,
                verdict: verdictPass ? 'PASS' : 'FAIL',
            },
            null,
            2,
        ) + '\n',
    );
    console.log(`[w04] verdict=${verdictPass ? 'PASS' : 'FAIL'} → ${path.relative(REPO, EVIDENCE_PATH)}`);
    process.exit(verdictPass ? 0 : 1);
})().catch((e) => {
    console.error('[w04] fatal: ' + ((e && e.stack) || e));
    process.exit(1);
});
