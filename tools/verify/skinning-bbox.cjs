/**
 * L13 蒙皮回归工具：多帧截图 bbox 对比（需 dev server @ 127.0.0.1:7454，playwright 来自 WorkBuddy node workspace）。
 * 用法: NODE_PATH=<playwright所在node_modules> node tools/verify/skinning-bbox.cjs
 */
const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.goto('http://127.0.0.1:7454/skinned-animation/', { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    for (let i = 0; i < 4; i++) {
        const buf = await page.screenshot();
        const dataUrl = 'data:image/png;base64,' + buf.toString('base64');
        const bbox = await page.evaluate(async (src) => {
            const img = new Image();
            await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = src; });
            const c = document.createElement('canvas');
            c.width = img.width; c.height = img.height;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            const isBg = (r, g, b) => Math.abs(r - 30) < 12 && Math.abs(g - 40) < 12 && Math.abs(b - 60) < 12;
            let minx = c.width, miny = c.height, maxx = 0, maxy = 0;
            for (let y = 0; y < c.height; y += 2) {
                for (let x = 0; x < c.width; x += 2) {
                    const o = (y * c.width + x) * 4;
                    if (!isBg(d[o], d[o + 1], d[o + 2])) {
                        if (x < minx) minx = x; if (x > maxx) maxx = x;
                        if (y < miny) miny = y; if (y > maxy) maxy = y;
                    }
                }
            }
            return { minx, miny, maxx, maxy, w: maxx - minx, h: maxy - miny };
        }, dataUrl);
        console.log(`frame ${i}:`, JSON.stringify(bbox));
        await page.waitForTimeout(450);
    }
    await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
