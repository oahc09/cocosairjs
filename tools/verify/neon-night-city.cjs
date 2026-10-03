/* Read-only runtime verification: requires an existing bundle and TS-capable server. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const repo = path.resolve(__dirname, '..', '..');
const value = (name, fallback) => {
    const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.slice(name.length + 3) : fallback;
};
const url = value('url', 'http://127.0.0.1:7473/examples/neon-night-city/');
const out = path.resolve(repo, value('out', 'output/playwright/neon-night-city-acceptance.json'));
const modulePath = value('playwright-module', null);
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

async function main() {
    const { chromium } = require(modulePath ? path.resolve(modulePath) : 'playwright');
    const beforeBundle = hash(path.join(repo, 'build/cocosair.module.js'));
    const browser = await chromium.launch({ channel: 'chrome', headless: true });
    const errors = [];
    const report = {
        url,
        browser: 'Chrome WebGL2',
        measuredAt: new Date().toISOString(),
        viewport: [1280, 720],
        dpr: 1,
        checks: [],
        observations: {},
        errors,
        fingerprints: { bundle: beforeBundle, source: hash(path.join(repo, 'examples/neon-night-city/src/main.ts')) },
        performanceScope: 'actual rendered-frame callback intervals; GPU and display-present not measured',
    };
    const check = (name, ok, detail) => report.checks.push({ name, ok: !!ok, detail });
    try {
        const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
        page.on('pageerror', (e) => errors.push(String(e.message)));
        page.on('console', (m) => {
            if (m.type() === 'error') errors.push(m.text());
        });
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__appReady === true, undefined, { timeout: 10000 });
        await page.waitForTimeout(1500);
        const initial = await page.evaluate(() => ({
            state: window.__bench.getState(),
            attributes: window.__cityProbe.attributes(),
            order: window.__cityProbe.rainOrder(),
        }));
        check(
            'actual-full-scale',
            initial.state.buildingCount >= 200 &&
                initial.state.carCount >= 60 &&
                initial.state.rainParticleCount >= 1500 &&
                initial.state.windowCount >= 2000 &&
                initial.attributes.rainVertices === initial.state.rainParticleCount * 4,
            initial,
        );
        check('native-instancing-and-alpha-order', initial.attributes.instancing && initial.order, initial);
        await page.evaluate(() => {
            window.__cityAcceptance = {
                capture: async () => {
                    const cc = await import('cocosair');
                    return new Promise((resolve) =>
                        cc.director.once(cc.Director.EVENT_AFTER_DRAW, () => {
                            const c = document.querySelector('canvas');
                            const copy = document.createElement('canvas');
                            copy.width = c.width;
                            copy.height = c.height;
                            const ctx = copy.getContext('2d');
                            ctx.drawImage(c, 0, 0);
                            resolve({
                                bytes: ctx.getImageData(0, 0, copy.width, copy.height).data,
                                width: copy.width,
                                height: copy.height,
                                at: performance.now(),
                            });
                        }),
                    );
                },
                stats: (frame) => {
                    let lit = 0;
                    let top = 0;
                    const { bytes, width, height } = frame;
                    for (let y = 0; y < height; y++)
                        for (let x = 0; x < width; x++) {
                            const i = (y * width + x) * 4;
                            const luma = (bytes[i] + bytes[i + 1] + bytes[i + 2]) / 3;
                            if (luma > 32) lit++;
                            if (y < height * 0.45) top += luma;
                        }
                    return { coverage: lit / (width * height), topMean: top / (width * Math.ceil(height * 0.45)) };
                },
                delta: (a, b, startY = 0, endY = 1) => {
                    let changed = 0;
                    let count = 0;
                    for (let y = Math.floor(a.height * startY); y < Math.floor(a.height * endY); y++)
                        for (let x = 0; x < a.width; x++) {
                            const i = (y * a.width + x) * 4;
                            if (
                                Math.max(
                                    Math.abs(a.bytes[i] - b.bytes[i]),
                                    Math.abs(a.bytes[i + 1] - b.bytes[i + 1]),
                                    Math.abs(a.bytes[i + 2] - b.bytes[i + 2]),
                                ) > 8
                            )
                                changed++;
                            count++;
                        }
                    return { changed, ratio: changed / count, gapMs: b.at - a.at };
                },
            };
        });
        const coverage = await page.evaluate(async () =>
            window.__cityAcceptance.stats(await window.__cityAcceptance.capture()),
        );
        check('coverage-full-view', coverage.coverage >= 0.35, coverage);
        const carMotion = await page.evaluate(async () => {
            window.__cityProbe.freezeRain(true);
            const p = window.__cityAcceptance;
            const a = await p.capture();
            await new Promise((r) => setTimeout(r, 600));
            const b = await p.capture();
            window.__cityProbe.freezeRain(false);
            return p.delta(a, b, 0.62, 1);
        });
        check('cars-move-in-street-region', carMotion.changed > 200, carMotion);
        const rainMotion = await page.evaluate(async () => {
            window.__cityProbe.freezeCars(true);
            const p = window.__cityAcceptance;
            const a = await p.capture();
            await new Promise((r) => setTimeout(r, 100));
            const b = await p.capture();
            window.__cityProbe.freezeCars(false);
            return p.delta(a, b);
        });
        check('rain-motion-full-view', rainMotion.ratio >= 0.02, rainMotion);
        await page.evaluate(() => {
            window.__cityProbe.freezeRain(true);
            window.__cityProbe.freezeCars(true);
        });
        const fogOn = await page.evaluate(async () =>
            window.__cityAcceptance.stats(await window.__cityAcceptance.capture()),
        );
        await page.getByRole('button', { name: 'Toggle fog', exact: true }).click();
        const fogOff = await page.evaluate(async () => ({
            pixel: window.__cityAcceptance.stats(await window.__cityAcceptance.capture()),
            state: window.__bench.getState(),
        }));
        check(
            'fog-toggle-affects-skyline',
            !fogOff.state.fogEnabled && Math.abs(fogOn.topMean - fogOff.pixel.topMean) > 0.3,
            { fogOn, fogOff },
        );
        await page.getByRole('button', { name: 'Toggle fog', exact: true }).click();
        await page.getByRole('button', { name: 'Reset', exact: true }).click();
        await page.waitForTimeout(1600);
        const reset = await page.evaluate(() => ({
            state: window.__bench.getState(),
            order: window.__cityProbe.rainOrder(),
        }));
        check(
            'reset-restores-full-scene',
            reset.state.fogEnabled &&
                reset.state.buildingCount === initial.state.buildingCount &&
                reset.state.carCount === initial.state.carCount &&
                reset.state.rainParticleCount === initial.state.rainParticleCount &&
                reset.order,
            reset,
        );
        check('measured-callback-rate', reset.state.fps >= 30, { fps: reset.state.fps, scope: reset.state.fpsScope });
        fs.mkdirSync(path.dirname(out), { recursive: true });
        await page.screenshot({ path: out.replace(/\.json$/, '.png') });
        const lifecycle = await page.evaluate(() => window.__lifecycle());
        check(
            'owned-assets-release-and-rebuild',
            lifecycle.held > 0 && lifecycle.released && lifecycle.reloaded && !lifecycle.errors.length,
            lifecycle,
        );
        check('no-runtime-errors', !errors.length, errors);
        check(
            'bundle-not-rewritten-during-run',
            hash(path.join(repo, 'build/cocosair.module.js')) === beforeBundle,
            'existing bundle SHA unchanged',
        );
        report.observations = { initial, coverage, carMotion, rainMotion, fogOn, fogOff, reset, lifecycle };
        report.result = report.checks.every((c) => c.ok) ? 'PASS' : 'FAIL';
        fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({ result: report.result, out, checks: report.checks }, null, 2));
        process.exitCode = report.result === 'PASS' ? 0 : 1;
    } finally {
        await browser.close();
    }
}
main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
});
