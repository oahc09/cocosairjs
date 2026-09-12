/* V0.3 审查：独立浏览器复现（不依赖 v03-browser.js 的 CLI 回调格式）。
 * 2 变体 × 5 示例：0 错误 + draw 时刻前景像素（帧内采样，避免 preserveDrawingBuffer 问题）。 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:7465/nested/demo';
const EXAMPLES = ['starter', 'hello-cube', 'static-model', 'skinned-animation', 'gltf-viewer'];

const INIT_HOOK = `
window.__v03fg = -1; window.__v03draws = 0;
(function () {
    function sample(gl) {
        try {
            const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
            const px = new Uint8Array(w * h * 4);
            gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
            const bg = [px[0], px[1], px[2]];
            let count = 0;
            for (let i = 0; i < px.length; i += 40) {
                if (Math.abs(px[i] - bg[0]) + Math.abs(px[i + 1] - bg[1]) + Math.abs(px[i + 2] - bg[2]) > 24) count++;
            }
            window.__v03fg = count;
        } catch (e) { window.__v03fg = -2; }
    }
    function hook(Ctor) {
        if (!Ctor || !Ctor.prototype || Ctor.prototype.__v03hooked) return;
        Ctor.prototype.__v03hooked = true;
        for (const name of ['drawElements', 'drawArrays']) {
            const orig = Ctor.prototype[name];
            if (!orig) continue;
            let draws = 0;
            Ctor.prototype[name] = function () {
                const r = orig.apply(this, arguments);
                window.__v03draws++;
                if (++draws % 64 === 0) sample(this);
                return r;
            };
        }
    }
    hook(window.WebGLRenderingContext); hook(window.WebGL2RenderingContext);
})();
`;

(async () => {
    const browser = await chromium.launch({ args: ['--use-gl=angle', '--enable-unsafe-swiftshader'] });
    const results = [];
    let allPass = true;
    for (const variant of ['normal', 'minified']) {
        for (const example of EXAMPLES) {
            const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
            await ctx.addInitScript(INIT_HOOK);
            const page = await ctx.newPage();
            const errors = [];
            page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 200)));
            page.on('console', (m) => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 200)); });
            let status = {};
            try {
                await page.goto(`${BASE}/${variant}/${example}/`, { waitUntil: 'load', timeout: 30000 });
                await page.waitForFunction(async () => {
                    const mod = await import('../build/cocosair.module.js');
                    return !!mod.director.getScene();
                }, { timeout: 30000 });
                if (example === 'gltf-viewer') {
                    await page.waitForFunction(() => window.gltfViewer && window.gltfViewer.instance, { timeout: 30000 });
                }
                await page.waitForTimeout(2000);
                status = await page.evaluate(() => ({
                    fg: window.__v03fg,
                    draws: window.__v03draws,
                    model: window.gltfViewer ? window.gltfViewer.name : undefined,
                    hasInstance: window.gltfViewer ? !!window.gltfViewer.instance.root.isValid : undefined,
                }));
                const ok = errors.length === 0 && status.hasScene !== false
                    && (example === 'starter' ? true : status.fg > 0)
                    && (example !== 'gltf-viewer' || status.hasInstance === true);
                if (!ok) allPass = false;
                results.push({ variant, example, ok, status, errors: errors.slice(0, 3) });
            } catch (e) {
                allPass = false;
                results.push({ variant, example, ok: false, errors: [String(e).slice(0, 300)] });
            }
            await ctx.close();
        }
    }
    await browser.close();
    for (const r of results) {
        console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.variant}/${r.example}`, JSON.stringify(r.status || {}), r.errors && r.errors.length ? r.errors.join(' || ') : '');
    }
    console.log(allPass ? 'V03-REVIEW-BROWSER-PASS' : 'V03-REVIEW-BROWSER-FAIL');
    process.exit(allPass ? 0 : 1);
})();
