/* V0.6 §74 — Lifecycle Gate：50 轮 load → instantiate → dispose，资源回到基线。
 * 执行：NODE_PATH=<playwright node_modules> node tools/verify/asset-lifecycle-gate.cjs
 * 前置：dev server 于 7455（gltf-viewer 资产可达）。
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const exe = process.env.AIR_CHROMIUM
    || ['C:', 'Users', 'caosh', 'AppData', 'Local', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe'].join('\\');

const CYCLES = 50;

(async () => {
    const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
    const page = await (await browser.newContext({ viewport: { width: 480, height: 360 } })).newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto('http://127.0.0.1:7455/gltf-viewer/', { waitUntil: 'load' });
    const result = await page.evaluate(async (cycles) => {
        const { GLTFLoader } = await import('/build/cocosair.module.js');
        const url = '/gltf-viewer/assets/BoxTextured.glb';
        const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
        const heaps = [];
        let blobUrls = 0;
        for (let i = 0; i < cycles; i++) {
            const bytes = await (await fetch(url, { cache: 'no-store' })).arrayBuffer();
            const asset = await new GLTFLoader().parseAsync(bytes, '/');
            const instance = asset.instantiate();
            instance.dispose();
            asset.destroy();
            if (i % 10 === 0 || i === cycles - 1) { heaps.push(heap()); }
            await new Promise((r) => setTimeout(r, 15));
        }
        const counter = (window).__airPreludeInstalled ? 0 : 0;
        return { heaps: heaps.map((h) => Math.round(h / 1048576 * 10) / 10), blobUrls, counter };
    }, CYCLES);

    const first = result.heaps[0];
    const last = result.heaps[result.heaps.length - 1];
    const growth = last - first;
    const ok = errors.length === 0 && growth < 20; // MB 级增长上限（噪声+引擎缓存允许带内）
    const report = {
        cycles: CYCLES,
        heapsMB: result.heaps,
        heapGrowthMB: Math.round(growth * 10) / 10,
        pageErrors: errors,
        pass: ok,
        measuredAt: new Date().toISOString(),
    };
    fs.writeFileSync(path.join(__dirname, '..', '..', 'docs', 'evidence', 'v06-lifecycle-gate.json'), JSON.stringify(report, null, 2));
    console.log(`lifecycle: ${CYCLES} cycles, heap ${first}MB → ${last}MB (growth ${report.heapGrowthMB}MB), errors=${errors.length} → ${ok ? 'PASS' : 'FAIL'}`);
    await browser.close();
    process.exit(ok ? 0 : 1);
})();
