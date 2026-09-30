/* V0.5.1 T5 browser verification (G5): real page panel flow.
 * Execute with: NODE_PATH=<playwright node_modules> node tools/verify/devtools-panel-browser.cjs
 * Requires the dev server: node tools/dev/dev-server.cjs --port 7455
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:7455';
const CHROMIUM = process.env.AIR_CHROMIUM
    || 'C:\\Users\\caosh\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe';

(async () => {
    const browser = await chromium.launch({
        executablePath: CHROMIUM,
        args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'],
    });
    const results = [];
    const shotDir = path.join(__dirname, '..', '..', 'output', 'playwright');
    fs.mkdirSync(shotDir, { recursive: true });
    const page = await (await browser.newContext({ viewport: { width: 900, height: 800 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('PAGEERROR: ' + String(e).slice(0, 300)));
    page.on('console', (m) => { if (m.type() === 'error') { errors.push('CONSOLE: ' + m.text().slice(0, 200)); } });

    // 1. 真实页面（hello-cube）+ 显式启用（点击 dev server 注入的按钮）
    await page.goto(`${BASE}/hello-cube/`, { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    const btnVisible = await page.locator('#__air-debug-btn').isVisible();
    await page.locator('#__air-debug-btn').click();
    await page.waitForSelector('[data-air-debug-panel]', { timeout: 15000 });
    results.push({ name: '按钮显式启用面板', ok: btnVisible });

    // 2. Scene Tree 查看与节点选择（只读详情）
    await page.waitForFunction(() => {
        const tree = document.querySelectorAll('[data-air-debug-panel] div');
        return Array.from(tree).some((n) => (n.textContent || '').includes('Cube'));
    }, undefined, { timeout: 10000 });
    const cubeRow = page.locator('[data-air-debug-panel] div', { hasText: /^▸ Cube/ }).first();
    await cubeRow.click();
    await page.waitForFunction(() => (document.querySelector('[data-air-debug-panel]') || {}).textContent?.includes('MeshRenderer'));
    results.push({ name: 'Scene Tree + 节点只读详情', ok: true });

    // 3. 错误定位：注入一个 window error，面板错误列表出现（含序号/类别）
    await page.evaluate(() => window.dispatchEvent(new ErrorEvent('error', { message: 'panel-probe-error', error: new Error('panel-probe-error') })));
    await page.waitForFunction(() => (document.querySelector('[data-air-debug-panel]') || {}).textContent?.includes('panel-probe-error'), undefined, { timeout: 8000 });
    results.push({ name: '错误列表定位注入错误', ok: true });

    // 4. 截图入口（AFTER_DRAW 真实 PNG）
    await page.getByRole('button', { name: '截图' }).click();
    await page.waitForSelector('[data-air-debug-panel] img', { timeout: 15000 });
    const imgSrc = await page.evaluate(() => document.querySelector('[data-air-debug-panel] img').src);
    results.push({ name: '面板截图（真实 PNG）', ok: imgSrc.startsWith('data:image/png') });

    // 5. 性能摘要
    const perfOk = await page.waitForFunction(() => {
        const root = document.querySelector('[data-air-debug-panel]');
        return root && /draws:/.test(root.textContent) && /fps:/.test(root.textContent);
    }, undefined, { timeout: 8000 }).then(() => true).catch(() => false);
    results.push({ name: '性能摘要（draws/fps）', ok: perfOk });

    await page.screenshot({ path: path.join(shotDir, 'v051-panel-open.png') });

    // 6. Alt+D 折叠/恢复 + 关闭无残留
    await page.keyboard.press('Alt+d');
    const hidden = await page.evaluate(() => document.querySelector('[data-air-debug-panel]').style.display === 'none');
    await page.keyboard.press('Alt+d');
    results.push({ name: 'Alt+D 开关', ok: hidden });
    await page.getByRole('button', { name: '关闭' }).click();
    await page.waitForTimeout(300);
    const residue = await page.evaluate(() => ({
        panel: !!document.querySelector('[data-air-debug-panel]'),
        button: !!document.querySelector('#__air-debug-btn'),
    }));
    results.push({ name: '关闭后无面板 DOM 残留', ok: !residue.panel && residue.button });
    await page.screenshot({ path: path.join(shotDir, 'v051-panel-closed.png') });

    await browser.close();
    const failed = results.filter((r) => !r.ok);
    for (const r of results) { console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}`); }
    fs.writeFileSync(path.join(shotDir, 'v051-panel-result.json'), JSON.stringify({ results, errors }, null, 2));
    console.log(`\n== v051 panel browser: ${results.length - failed.length}/${results.length} passed ==`);
    if (errors.length) { console.log('page errors:', errors.join(' ; ')); }
    process.exit(failed.length || errors.length ? 1 : 0);
})();
