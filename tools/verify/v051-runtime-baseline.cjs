/* V0.5.1 T6 — Runtime Baseline measurement & V0.5 load-regression check.
 * Execute with: NODE_PATH=<playwright node_modules> node tools/verify/v051-runtime-baseline.cjs
 * Requires the dev server: node tools/dev/dev-server.cjs --port 7455
 *
 * 口径：
 *  - BoxTextured 30 次冷加载中位数，相对 V0.5 冻结基线（docs/gltf/gltf-performance-baseline.md
 *    的 4.1 ms）回退不得超过 15%（同机同口径；工具关闭状态）。
 *  - 新增指标（startup / scene ready / first visible frame / asset load / debug overhead /
 *    memory）每配置 3 次页面加载，报告中位数与范围。
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = 'http://127.0.0.1:7455';
const RUNS = 3;
const V05_MEDIAN_MS = 4.1; // docs/gltf/gltf-performance-baseline.md 冻结基线
const REGRESSION_LIMIT = 1.15;
const exe = process.env.AIR_CHROMIUM
    || ['C:', 'Users', 'caosh', 'AppData', 'Local', 'ms-playwright', 'chromium-1234', 'chrome-win64', 'chrome.exe'].join('\\');

const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const range = (arr) => [Math.min(...arr), Math.max(...arr)];
const r1 = (v) => Math.round(v * 100) / 100;

(async () => {
    const browser = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });

    // ---- 1) BoxTextured 30 次冷加载（工具关闭；与 V0.5 同口径）----
    const loadPage = await (await browser.newContext({ viewport: { width: 640, height: 480 } })).newPage();
    await loadPage.goto(`${BASE}/gltf-viewer/`, { waitUntil: 'load' });
    const load = await loadPage.evaluate(async () => {
        const { GLTFLoader } = await import('/build/cocosair.module.js');
        const url = '/gltf-viewer/assets/BoxTextured.glb';
        const runs = [];
        for (let i = 0; i < 30; i++) {
            const response = await fetch(`${url}?run=${i}`, { cache: 'no-store' });
            const bytes = await response.arrayBuffer();
            const loader = new GLTFLoader();
            const start = performance.now();
            const asset = await loader.parseAsync(bytes);
            runs.push(performance.now() - start);
            asset.destroy();
            await new Promise((r) => setTimeout(r, 20));
        }
        const sorted = [...runs].sort((a, b) => a - b);
        return { runsMs: runs.map((r) => Math.round(r * 100) / 100), median: sorted[15], p5: sorted[1], p95: sorted[28] };
    });
    await loadPage.close();
    const regression = load.median / V05_MEDIAN_MS;

    // ---- 2) 新增指标：3 次页面加载 ----
    const pageRuns = [];
    for (let i = 0; i < RUNS; i++) {
        const ctx = await browser.newContext({ viewport: { width: 640, height: 480 } });
        const page = await ctx.newPage();
        const pageErrors = [];
        page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
        await page.goto(`${BASE}/shared/bench.html`, { waitUntil: 'load' });
        await page.waitForFunction(() => (window).__benchReady, undefined, { timeout: 120000 });
        const data = await page.evaluate(() => (window).__benchReady);
        console.log(`[run ${i}] bench keys:`, Object.keys(data || {}).join(','));
        await ctx.close();
        pageRuns.push({ ...data, pageErrors });
    }

    await browser.close();

    const firstVisible = pageRuns.map((r) => r.firstVisibleFrameMs);
    const startup = pageRuns.map((r) => r.startupMs);
    const coldMed = pageRuns.map((r) => median(r.assetColdMs));
    const warmMed = pageRuns.map((r) => median(r.assetWarmMs));
    const opsOff = pageRuns.map((r) => median(r.debugOverhead.opsOnMs) - r.debugOverhead.opsOffMs);
    const fpsOff = pageRuns.map((r) => r.debugOverhead.fpsOff);
    const fpsOn = pageRuns.map((r) => r.debugOverhead.fpsOn);

    const report = {
        measuredAt: new Date().toISOString(),
        environment: {
            userAgent: pageRuns[0].ua,
            webgl2: pageRuns[0].webgl2,
            viewport: '640x480',
            chromium: 'chromium-1234 (headless, ANGLE)',
            toolState: 'panel closed for load regression; overhead section measures panel on/off',
        },
        boxTextured30: {
            ...load,
            v05FrozenMedianMs: V05_MEDIAN_MS,
            regressionRatio: Math.round(regression * 1000) / 1000,
            regressionOk: regression <= REGRESSION_LIMIT,
        },
        newMetrics: {
            startupMs: { runs: startup.map(r1), median: r1(median(startup)), range: range(startup).map(r1), definition: 'bench 模块脚本起点 → createAirApp resolve' },
            sceneReadyMs: { runs: pageRuns.map((r) => r1(r.sceneReadyMs)), median: r1(median(pageRuns.map((r) => r.sceneReadyMs))), definition: 'app.run(scene) 调用 → runSceneImmediate 返回（同步激活）' },
            firstVisibleFrameMs: { runs: firstVisible.map(r1), median: r1(median(firstVisible)), range: range(firstVisible).map(r1), definition: 'scene ready → 首次画布中心像素 ≠ 清屏色（readPixels 判定）' },
            assetLoadMs: { coldMedian: r1(median(coldMed)), warmMedian: r1(median(warmMed)), definition: 'GLTFLoader 公开入口 fetch(bytes)→parseAsync；冷=每轮 no-store，热=同 bytes 重复 parse' },
            debugOverhead: {
                opsDeltaMs: { runs: opsOff.map(r1), median: r1(median(opsOff)), definition: 'inspectScene+inspectNode×50 面板开/关耗时差（正=面板开销）' },
                fpsOff: fpsOff.map(r1), fpsOn: fpsOn.map(r1),
            },
            memory: pageRuns.map((r) => r.memory),
        },
        pageErrors: pageRuns.flatMap((r) => r.pageErrors),
    };
    const out = path.join(__dirname, '..', '..', 'output', 'playwright', 'v051-runtime-baseline.json');
    fs.writeFileSync(out, JSON.stringify(report, null, 2));

    console.log(`BoxTextured 30-run median: ${load.median}ms (V0.5 frozen ${V05_MEDIAN_MS}ms, ratio ${report.boxTextured30.regressionRatio}, limit ${REGRESSION_LIMIT}) ${report.boxTextured30.regressionOk ? 'OK' : 'REGRESSION'}`);
    console.log(`startup median: ${report.newMetrics.startupMs.median}ms  range ${report.newMetrics.startupMs.range}`);
    console.log(`first visible frame median: ${report.newMetrics.firstVisibleFrameMs.median}ms  range ${report.newMetrics.firstVisibleFrameMs.range}`);
    console.log(`asset load: cold ${report.newMetrics.assetLoadMs.coldMedian}ms / warm ${report.newMetrics.assetLoadMs.warmMedian}ms`);
    console.log(`debug ops overhead median: ${report.newMetrics.debugOverhead.opsDeltaMs.median}ms  fps off/on: ${median(fpsOff).toFixed(0)}/${median(fpsOn).toFixed(0)}`);
    console.log(`memory: ${JSON.stringify(report.newMetrics.memory[0])}`);
    console.log(`report → ${out}`);
    const ok = report.boxTextured30.regressionOk && report.pageErrors.length === 0;
    process.exit(ok ? 0 : 1);
})();
