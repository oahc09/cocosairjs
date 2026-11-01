#!/usr/bin/env node
// Focused actual-browser collector. No server, external requests, sandbox flags,
// shader adapters, engine private patches, or Gallery certification.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
function option(name, fallback) {
    const i = args.indexOf(name);
    return i < 0 ? fallback : args[i + 1];
}
const browserName = option('--browser', 'webkit');
if (!['webkit', 'chromium'].includes(browserName)) throw new Error('--browser must be webkit or chromium');
const runtime = path.resolve(option('--runtime', path.join(root, 'build/npm/cocosair.module.js')));
const out = path.resolve(option('--out', path.join(root, 'tmp/gradient-effect-browser')));
const executablePath = option('--executable', undefined);
const playwright = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const runtimeBytes = fs.readFileSync(runtime);
fs.mkdirSync(out, { recursive: true });
(async () => {
    const browser = await playwright[browserName].launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
    });
    const report = {
        timestamp: new Date().toISOString(),
        browser: browserName,
        browserVersion: browser.version(),
        collectorSHA256: sha(fs.readFileSync(__filename)),
        effectSourceSHA256: sha(fs.readFileSync(path.join(root, 'src/air/effects/gradient.ts'))),
        runtime: path.relative(root, runtime),
        runtimeSHA256: sha(runtimeBytes),
        scope: 'Fresh SDK public API; actual WebGL shader compilation/render/readPixels plus native example DOM interactions. Offline route fixture, not HTTP deployment or real-device/performance certification.',
        fixture: null,
        example: null,
    };
    try {
        async function pageFor(files, width, height) {
            const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
            const errors = [],
                resources = [];
            page.on('pageerror', (error) => errors.push(String(error)));
            page.on('console', (message) => {
                if (message.type() === 'error') errors.push(message.text());
            });
            await page.route('**/*', (route) => {
                const url = new URL(route.request().url());
                const body = url.origin === 'http://gradient.test' ? files.get(url.pathname) : null;
                if (!body) return route.abort();
                resources.push({ path: url.pathname, sha256: sha(body) });
                return route.fulfill({ body, contentType: url.pathname === '/' ? 'text/html' : 'text/javascript' });
            });
            await page.goto('http://gradient.test/');
            return { page, errors, resources };
        }
        const fixtureDir = path.join(root, 'test/fixtures/gradient-effect');
        const f = await pageFor(
            new Map([
                ['/', fs.readFileSync(path.join(fixtureDir, 'index.html'))],
                ['/main.js', fs.readFileSync(path.join(fixtureDir, 'main.js'))],
                ['/runtime.js', runtimeBytes],
            ]),
            512,
            512,
        );
        await f.page.waitForFunction(() => window.__qa?.done, {}, { timeout: 120000 });
        report.fixture = { result: await f.page.evaluate(() => window.__qa), errors: f.errors, resources: f.resources };
        await f.page.screenshot({ path: path.join(out, 'reference-gradient.png') });
        await f.page.close();
        const exampleDir = path.join(root, 'docs/manual/examples/manual-gradient-material');
        const ts = require('typescript');
        const exampleSource = fs.readFileSync(path.join(exampleDir, 'main.ts'), 'utf8');
        const exampleJS = ts.transpileModule(exampleSource, {
            compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
        }).outputText;
        const e = await pageFor(
            new Map([
                ['/', fs.readFileSync(path.join(exampleDir, 'index.html'))],
                ['/main.ts', Buffer.from(exampleJS)],
                ['/build/cocosair.module.js', runtimeBytes],
            ]),
            960,
            720,
        );
        await e.page.waitForFunction(() => document.querySelector('#offset-value')?.textContent === '0.5');
        await e.page.evaluate(async () => {
            const { createStepClock } = await import('/build/cocosair.module.js');
            window.__gradientClock = createStepClock({ stepTimeoutMs: 10000 });
            window.__gradientClock.begin();
            window.__gradientFrames = [];
        });
        const pixel = () =>
            e.page.evaluate(async () => {
                window.__gradientFrames.push(await window.__gradientClock.step(1 / 60));
                const canvas = document.querySelector('canvas'),
                    gl = canvas.getContext('webgl2'),
                    value = new Uint8Array(4);
                gl.readPixels(canvas.width / 2, canvas.height / 2, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, value);
                return [...value];
            });
        const checks = [];
        let before = await pixel();
        checks.push({ name: 'reference-mid-blue', ok: Math.abs(before[2] - 64) <= 3, pixel: before });
        await e.page.selectOption('#mode', 'unlit');
        let after = await pixel();
        checks.push({ name: 'mode-select-changes-real-render', ok: after[2] > before[2] + 40, before, after });
        await e.page.locator('#alpha').focus();
        await e.page.keyboard.press('Home');
        after = await pixel();
        checks.push({
            name: 'alpha-keyboard-zero',
            ok: after.every((v, i) => Math.abs(v - [32, 32, 32, 255][i]) <= 2),
            pixel: after,
        });
        await e.page.keyboard.press('End');
        await e.page.locator('#offset').focus();
        await e.page.keyboard.press('Home');
        after = await pixel();
        checks.push({ name: 'offset-keyboard-negative', ok: after[2] === 0, pixel: after });
        await e.page.keyboard.press('End');
        after = await pixel();
        checks.push({ name: 'offset-keyboard-positive', ok: after[2] > 250, pixel: after });
        const pacing = await e.page.evaluate(() => {
            window.__gradientClock.end();
            return { nativePacingRestored: !window.__gradientClock.stepping, frameReceipts: window.__gradientFrames };
        });
        report.example = {
            ...pacing,
            checks,
            errors: e.errors,
            resources: e.resources,
            sourceSHA256: sha(exampleSource),
            ok: checks.every((check) => check.ok) && e.errors.length === 0 && pacing.nativePacingRestored,
        };
        await e.page.screenshot({ path: path.join(out, 'example-interaction.png') });
        await e.page.close();
        report.ok =
            report.fixture.result.ok &&
            report.fixture.result.nativePacingRestored &&
            report.fixture.errors.length === 0 &&
            report.example.ok;
    } catch (error) {
        for (const context of browser.contexts())
            for (const page of context.pages()) {
                await page.evaluate(() => window.__gradientClock?.end()).catch(() => {});
            }
        report.ok = false;
        report.fatal = String(error);
    } finally {
        await browser.close();
    }
    fs.writeFileSync(path.join(out, 'result.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(
        JSON.stringify({
            ok: report.ok,
            fixture: report.fixture?.result.checks.length,
            example: report.example?.checks.length,
            report: path.join(out, 'result.json'),
            fatal: report.fatal,
        }),
    );
    if (!report.ok) process.exitCode = 1;
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
