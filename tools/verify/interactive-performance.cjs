'use strict';
// Local pilot only. A target device and product budget have not been supplied.
const fs = require('fs'),
    path = require('path'),
    crypto = require('crypto');
const ROOT = path.resolve(__dirname, '../..');
const DESIGN = Object.freeze({
    engine: 'chromium',
    warmupMs: 1000,
    windowMs: 5000,
    repetitions: 3,
    dprs: [1, 2],
    workloads: ['idle', 'target-switch-500ms', 'audio'],
    screenshots: [false, true],
    screenshotPeriodMs: 1000,
    reason: 'Short local pilot to establish attribution and tooling overhead while target hardware/budget are unavailable; does not replace recommended 3x60s device acceptance',
});
const INPUTS = Object.freeze([
    'build/cocosair.module.js',
    'build/cocosair.module.d.ts',
    'examples/interactive-timeline/index.html',
    'examples/interactive-timeline/src/main.ts',
    'examples/interactive-timeline/src/timeline-contract.ts',
    'examples/interactive-timeline/assets/original-16s.wav',
    'tools/verify/interactive-performance.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/competitive-example-server.cjs',
    'examples/shared/asset-lifecycle.js',
    'examples/shared/asset-lifecycle.d.ts',
    'tools/verify/interactive-performance-audit.cjs',
]);
const PILOT_BUDGET = Object.freeze({
    result: 'NOT_RUN',
    device: 'NOT_PROVIDED',
    frameTimeBudget: 'NOT_PROVIDED',
    visibleQualityBudget: 'NOT_PROVIDED',
    droppedFrames: 'UNKNOWN: no deadline budget, no assumed 60fps',
});
function stats(values) {
    if (!values.length || values.some((v) => !Number.isFinite(v) || v < 0))
        throw Error('finite nonnegative raw samples required');
    const sorted = [...values].sort((a, b) => a - b),
        p = (q) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
    return {
        count: values.length,
        p50: p(0.5),
        p95: p(0.95),
        p99: p(0.99),
        worst: sorted.at(-1),
        mean: values.reduce((a, b) => a + b, 0) / values.length,
    };
}
const fp = (p) => {
    const b = fs.readFileSync(path.resolve(ROOT, p));
    return { path: p, bytes: b.length, sha256: crypto.createHash('sha256').update(b).digest('hex') };
};
async function click(page, id) {
    const r = await page.locator(id).evaluate((el) => {
        const b = el.getBoundingClientRect();
        return { x: b.left + b.width / 2, y: b.top + b.height / 2, disabled: el.disabled };
    });
    if (r.disabled) throw Error('disabled ' + id);
    await page.mouse.click(r.x, r.y);
}
async function main() {
    const out = process.argv.find((x) => x.startsWith('--out='))?.slice(6);
    if (!out || fs.existsSync(out)) throw Error('explicit new --out required');
    const artifacts = path.resolve(out.replace(/\.json$/, '') + '-artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    const report = {
        schemaVersion: 'ier-performance-pilot/2',
        result: 'LIMITED',
        subset: true,
        completed: false,
        executionChannel: 'Lead',
        startedAt: new Date().toISOString(),
        command: process.argv.join(' '),
        cwd: ROOT,
        design: DESIGN,
        budget: PILOT_BUDGET,
        fingerprints: INPUTS.map(fp),
        rows: [],
        limitations: [
            'Software/local browser pilot is not physical-device evidence',
            'CPU update and draw markers measure callback intervals, not isolated engine CPU time or GPU execution',
            'GPU timer unavailable: no timer query inserted around engine rendering',
            'Host process load and compositor are not OS-isolated',
            'Per-window screenshots sampled once per second; visual validity comes from independent timeline evidence, not mean frame time',
        ],
    };
    const server = await require('./competitive-example-server.cjs').startExampleServer(ROOT),
        browser = await require('playwright').chromium.launch({
            ...require('./browser-engines.cjs').launchOptions('chromium'),
            headless: true,
        });
    try {
        for (const dpr of DESIGN.dprs)
            for (const workload of DESIGN.workloads)
                for (const screenshots of DESIGN.screenshots)
                    for (let rep = 0; rep < 3; rep++) {
                        const context = await browser.newContext({
                                viewport: { width: 1050, height: 900 },
                                deviceScaleFactor: dpr,
                            }),
                            page = await context.newPage(),
                            row = {
                                dpr,
                                workload,
                                screenshots,
                                rep,
                                version: browser.version(),
                                pageErrors: [],
                                consoleErrors: [],
                                captures: [],
                                toolSamples: [],
                            };
                        report.rows.push(row);
                        page.on('pageerror', (e) => row.pageErrors.push(String(e)));
                        page.on('console', (m) => {
                            if (m.type() === 'error') row.consoleErrors.push(m.text());
                        });
                        try {
                            await page.goto(server.origin + '/examples/interactive-timeline/', {
                                waitUntil: 'domcontentloaded',
                            });
                            await page.waitForFunction(() => window.__timeline, null, { polling: 20 });
                            if (workload === 'audio') {
                                await page.waitForFunction(() => window.__timeline.snapshot().audio.ready, null, {
                                    polling: 20,
                                });
                                await click(page, '#play');
                            }
                            await page.waitForTimeout(DESIGN.warmupMs);
                            row.before = await page.evaluate(() => window.__timeline.snapshot());
                            row.renderer = await page.evaluate(() => {
                                const gl = document.querySelector('canvas').getContext('webgl2'),
                                    ext = gl.getExtension('WEBGL_debug_renderer_info');
                                return {
                                    vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : 'unavailable',
                                    renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable',
                                    gpuTime: 'unavailable',
                                };
                            });
                            await page.evaluate(async () => {
                                const cc = await import('/build/cocosair.module.js');
                                let before = 0,
                                    updateEnd = 0,
                                    drawStart = 0,
                                    last = null;
                                const rows = [];
                                const bu = () => {
                                        before = performance.now();
                                    },
                                    au = () => (updateEnd = performance.now()),
                                    bd = () => (drawStart = performance.now()),
                                    ad = () => {
                                        const t = performance.now();
                                        rows.push({
                                            timestamp: t,
                                            interval: last === null ? null : t - last,
                                            updateMs: updateEnd - before,
                                            submitMs: t - drawStart,
                                            nativeFrame: cc.director.getTotalFrames(),
                                        });
                                        last = t;
                                    };
                                for (const [event, fn] of [
                                    [cc.Director.EVENT_BEFORE_UPDATE, bu],
                                    [cc.Director.EVENT_AFTER_UPDATE, au],
                                    [cc.Director.EVENT_BEFORE_DRAW, bd],
                                    [cc.Director.EVENT_AFTER_DRAW, ad],
                                ])
                                    cc.director.on(event, fn);
                                window.__perf = {
                                    rows,
                                    stop: () => {
                                        for (const [event, fn] of [
                                            [cc.Director.EVENT_BEFORE_UPDATE, bu],
                                            [cc.Director.EVENT_AFTER_UPDATE, au],
                                            [cc.Director.EVENT_BEFORE_DRAW, bd],
                                            [cc.Director.EVENT_AFTER_DRAW, ad],
                                        ])
                                            cc.director.off(event, fn);
                                        return rows;
                                    },
                                };
                            });
                            const start = performance.now();
                            let nextShot = start,
                                nextTarget = start,
                                shot = 0,
                                target = 0;
                            while (performance.now() - start < DESIGN.windowMs) {
                                const now = performance.now();
                                if (workload === 'target-switch-500ms' && now >= nextTarget) {
                                    await click(page, '#target' + target);
                                    target = (target + 1) % 3;
                                    nextTarget += 500;
                                }
                                if (screenshots && now >= nextShot) {
                                    const name = path.join(artifacts, `${dpr}-${workload}-${rep}-${shot++}.png`),
                                        t = performance.now();
                                    await page.screenshot({ path: name });
                                    row.toolSamples.push({
                                        operation: 'page.screenshot',
                                        wallMs: performance.now() - t,
                                    });
                                    row.captures.push(fp(path.relative(ROOT, name).replace(/\\/g, '/')));
                                    nextShot += 1000;
                                }
                                await page.waitForTimeout(20);
                            }
                            row.observedWindowMs = performance.now() - start;
                            row.raw = await page.evaluate(() => window.__perf.stop());
                            row.after = await page.evaluate(() => window.__timeline.snapshot());
                            row.statistics = {
                                frameCallbackMs: stats(row.raw.map((x) => x.interval).filter((x) => x !== null)),
                                cpuUpdateMarkersMs: stats(row.raw.map((x) => x.updateMs)),
                                cpuSubmitMarkersMs: stats(row.raw.map((x) => x.submitMs)),
                                screenshotWallMs: row.toolSamples.length
                                    ? stats(row.toolSamples.map((x) => x.wallMs))
                                    : null,
                            };
                            row.release = await page.evaluate(() => window.__timeline.release());
                            console.log(
                                dpr,
                                workload,
                                screenshots,
                                rep,
                                JSON.stringify(row.statistics.frameCallbackMs),
                            );
                        } catch (e) {
                            row.pageErrors.push(String(e.stack || e));
                        } finally {
                            await context.close();
                        }
                    }
    } finally {
        await browser.close();
        await server.close();
    }
    report.endedAt = new Date().toISOString();
    report.validation = require('./interactive-performance-audit.cjs').checkReport(report);
    report.measurementComplete = report.validation.measurementValid;
    report.exitCode = report.measurementComplete ? 0 : 1;
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    process.exitCode = report.exitCode;
}
module.exports = { stats, DESIGN, INPUTS, PILOT_BUDGET };
if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
