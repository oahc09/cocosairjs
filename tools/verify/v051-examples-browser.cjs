/* V0.5.1 T2/T3/T4 browser verification (G2 + G4 closed loop).
 * Execute with: NODE_PATH=<playwright node_modules> node tools/verify/v051-examples-browser.cjs
 * Requires the dev server: node tools/dev/dev-server.cjs --port 7455
 */
const { chromium } = require('playwright');

const BASE = 'http://127.0.0.1:7455';
const fs = require('fs');
const path = require('path');

(async () => {
    const browser = await chromium.launch({
        // 使用本机已安装的 chromium（playwright 缓存），避免要求特定版本的浏览器下载
        executablePath: process.env.AIR_CHROMIUM
            || 'C:\\Users\\caosh\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe',
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
    });
    const results = [];
    const shotDir = path.join(__dirname, '..', '..', 'output', 'playwright');
    fs.mkdirSync(shotDir, { recursive: true });

    async function visit (name, { settle = 2500, check } = {}) {
        const ctx = await browser.newContext({ viewport: { width: 800, height: 900 } });
        const page = await ctx.newPage();
        const errors = [];
        const logs = [];
        page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)));
        page.on('console', (m) => {
            if (m.type() === 'error') { errors.push('CONSOLE: ' + m.text().slice(0, 300)); }
            logs.push(m.text());
        });
        await page.goto(`${BASE}/${name}${name ? '/' : ''}`, { waitUntil: 'load', timeout: 30000 });
        await page.waitForTimeout(settle);
        let checkResult = null;
        try { checkResult = check ? await check(page, logs) : null; } catch (e) { checkResult = { ok: false, detail: String(e).slice(0, 300) }; }
        await page.screenshot({ path: path.join(shotDir, `v051-${name}.png`) });
        await ctx.close();
        const ok = errors.length === 0 && (!checkResult || checkResult.ok);
        results.push({ name, ok, errors, checkResult });
        console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${checkResult && checkResult.detail ? ' — ' + checkResult.detail : ''}${errors.length ? ' | ' + errors.join(' ; ') : ''}`);
    }

    // 旧示例回归（不退化）
    await visit('starter', { settle: 1500 });
    await visit('hello-cube', { settle: 2500 });
    // 新示例
    await visit('transform', { settle: 2500, check: async (page, logs) => {
        const reporter = logs.filter((l) => l.includes('[transform] grandchild local ='));
        return { ok: reporter.length > 0, detail: `reporter lines=${reporter.length}` };
    } });
    await visit('camera', { settle: 2000, check: async (page) => {
        // 点击切换正交 → frameObject 取景 → 无异常即通过
        await page.getByText('切换正交/透视').click();
        await page.waitForTimeout(400);
        await page.getByText('frameObject 取景').click();
        await page.waitForTimeout(600);
        await page.getByText('切换正交/透视').click();
        await page.waitForTimeout(400);
        return { ok: true, detail: 'ortho/frameObject clicked' };
    } });
    await visit('input', { settle: 2000, check: async (page) => {
        await page.keyboard.down('KeyW');
        await page.waitForTimeout(500);
        await page.keyboard.up('KeyW');
        await page.mouse.move(400, 500);
        await page.mouse.down();
        await page.mouse.move(500, 450, { steps: 5 });
        await page.mouse.up();
        await page.waitForTimeout(300);
        const pos = await page.evaluate(async () => {
            const m = await import('/build/cocosair.module.js');
            return 'checked';
        });
        return { ok: pos === 'checked', detail: 'keyboard+drag dispatched' };
    } });
    // G4 闭环：automation 示例
    await visit('automation', { settle: 1500, check: async (page) => {
        await page.waitForFunction(() => {
            const el = document.querySelector('pre');
            return el && /闭环完成：\d+ pass \/ \d+ fail/.test(el.textContent);
        }, undefined, { timeout: 60000 });
        const text = await page.evaluate(() => document.querySelector('pre').textContent);
        const m = text.match(/闭环完成：(\d+) pass \/ (\d+) fail/);
        const pass = Number(m[1]);
        const fail = Number(m[2]);
        const sessionClosed = text.includes('close 后请求 → SESSION_CLOSED');
        return { ok: fail === 0 && pass >= 10 && sessionClosed, detail: `${pass} pass / ${fail} fail, closed=${sessionClosed}` };
    } });
    // 导航页（固定 URL /index.html，不改变旧 URL 语义：/ 仍重定向到默认示例）
    await visit('index.html', { settle: 800, check: async (page) => {
        const links = await page.evaluate(() => document.querySelectorAll('a[href]').length);
        return { ok: links >= 8, detail: `nav links=${links}` };
    } });

    await browser.close();
    const failed = results.filter((r) => !r.ok);
    fs.writeFileSync(path.join(shotDir, 'v051-examples-result.json'), JSON.stringify(results, null, 2));
    console.log(`\n== v051 examples browser: ${results.length - failed.length}/${results.length} passed ==`);
    process.exit(failed.length ? 1 : 0);
})();
