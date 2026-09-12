/**
 * V0.1 RC 三示例浏览器冒烟回归。
 * 判定：0 个着色器/运行时错误 + 画面存在与背景色不同的像素（有内容渲染）。
 * 用法: 需 dev server 运行于 127.0.0.1:7454；
 *       NODE_PATH=<playwright所在node_modules> node tools/verify/examples-smoke.cjs
 */
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    let failed = false;
    for (const ex of ['hello-cube', 'static-model', 'skinned-animation']) {
        const errs = [];
        page.removeAllListeners('console');
        page.on('console', (m) => { if (m.type() === 'error' && !/getParameter/.test(m.text())) errs.push(m.text().slice(0, 120)); });
        await page.goto(`http://127.0.0.1:7454/${ex}/`, { waitUntil: 'load' });
        await page.waitForTimeout(4000);
        const buf = await page.screenshot();
        const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
        const diff = await page.evaluate(async (src) => {
            const img = new Image();
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            const bg = [d[0], d[1], d[2]]; // 以左上角像素为背景参考
            let n = 0;
            for (let i = 0; i < d.length; i += 16) {
                if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 24) n++;
            }
            return n;
        }, dataUrl);
        const ok = errs.length === 0 && diff > 100;
        if (!ok) failed = true;
        console.log(`${ok ? 'PASS' : 'FAIL'} ${ex}: contentSamples=${diff}, errors=${errs.length}${errs.length ? ' -> ' + errs[0] : ''}`);
    }
    await browser.close();
    process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e.message); process.exit(1); });
