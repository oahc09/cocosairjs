/* V0.2 browser verification: load each example, wait, check canvas pixels + errors. */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:7461';
const EXAMPLES = ['starter', 'hello-cube', 'static-model', 'skinned-animation'];

(async () => {
    const browser = await chromium.launch({
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
    });
    const results = [];
    for (const ex of EXAMPLES) {
        const ctx = await browser.newContext({ viewport: { width: 640, height: 960 } });
        const page = await ctx.newPage();
        const errors = [];
        const logs = [];
        page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)));
        page.on('console', (m) => {
            if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300));
            logs.push(m.text());
        });
        try {
            await page.goto(`${BASE}/${ex}/`, { waitUntil: 'load', timeout: 20000 });
            await page.waitForTimeout(4000);
            const status = await page.evaluate(() => ({
                glDraws: window.__glStats ? window.__glStats.draws : -1,
                airErrors: (window.__airErrors || []).slice(0, 5),
                canvas: !!document.querySelector('canvas'),
                title: document.title,
            }));
            // starter 为空场景（无相机/网格），0 draw 属预期 → 以运行日志标记判定
            const starterOk = ex === 'starter'
                ? logs.some((t) => String(t).includes('[starter] running'))
                : true;
            const ok = status.airErrors.length === 0 && errors.length === 0 && status.canvas
                && starterOk && (ex === 'starter' ? true : status.glDraws > 0);
            results.push({ ex, ok, status, errors: errors.slice(0, 5) });
        } catch (e) {
            results.push({ ex, ok: false, errors: [String(e).slice(0, 300)] });
        }
        await ctx.close();
    }
    await browser.close();
    let pass = true;
    for (const r of results) {
        console.log(`[${r.ok ? 'PASS' : 'FAIL'}] ${r.ex}`, JSON.stringify(r.status || r.errors));
        if (r.errors && r.errors.length) console.log('   errors:', r.errors.join(' || '));
        if (!r.ok) pass = false;
    }
    console.log(pass ? 'ALL-EXAMPLES-PASS' : 'EXAMPLES-FAILED');
    process.exit(pass ? 0 : 1);
})();
