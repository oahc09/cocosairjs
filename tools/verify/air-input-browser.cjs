/* PG-07/09/10/14: existing engine/PAL channels, real browser protocol input. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
const snapshot = (page) => page.evaluate(() => window.__airInputProbe.snapshot());
const reset = (page) => page.evaluate(() => window.__airInputProbe.resetCounts());

async function main() {
    const startedAt = new Date().toISOString();
    const args = process.argv.slice(2);
    if (args.some((arg) => !/^--(?:browser|out)=/.test(arg))) throw new Error('usage: node tools/verify/air-input-browser.cjs [--browser=chromium|firefox|webkit|all] [--out=<new.json>]');
    const selected = args.find((arg) => arg.startsWith('--browser='))?.split('=')[1] || 'all';
    const engines = selected === 'all' ? ['chromium', 'firefox', 'webkit'] : [selected];
    if (engines.some((engine) => !['chromium', 'firefox', 'webkit'].includes(engine))) throw new Error('unknown browser');
    const out = args.find((arg) => arg.startsWith('--out='))?.slice(6);
    if (out && fs.existsSync(path.resolve(root, out))) throw new Error('report already exists; choose a new output path');
    const files = ['build/cocosair.module.js', 'tools/verify/air-input-browser.cjs',
        'test/fixtures/air-input/index.html', 'test/fixtures/air-input/main.ts',
        'tools/debug/agent-session.ts', 'tools/debug/panel.ts'];
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)]));
    const server = await startExampleServer(root);
    const results = [];
    try {
        const playwright = require('playwright');
        for (const engine of engines) {
            let browser;
            let stage = 'infrastructure';
            try {
                if (engine === 'webkit' && !fs.existsSync(playwright.webkit.executablePath())) {
                    throw new Error(`matching WebKit binary missing: ${playwright.webkit.executablePath()}; install the revision required by this Playwright module`);
                }
                console.error(`[air-input] ${engine}: launch`);
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                for (const custom of [false, true]) {
                    const context = await browser.newContext({ viewport: { width: 900, height: 650 }, hasTouch: true, deviceScaleFactor: 1 });
                    const page = await context.newPage();
                    const errors = [];
                    page.on('pageerror', (error) => errors.push(String(error.stack || error)));
                    for (const module of ['agent-session', 'panel']) {
                        const built = esbuild.buildSync({ entryPoints: [path.join(root, `tools/debug/${module}.ts`)],
                            bundle: true, write: false, format: 'esm', target: 'es2022', platform: 'browser', external: ['cocosair'] });
                        await page.route(`**/tools/debug/${module}.js`, (route) => route.fulfill({ contentType: 'text/javascript', body: built.outputFiles[0].text }));
                    }
                    const url = `${server.origin}/test/fixtures/air-input/${custom ? '?custom' : ''}`;
                    await page.goto(url);
                    await page.waitForFunction(() => window.__airInputProbe?.state.ready, null, { timeout: 30000 });
                    stage = 'engine';
                    const checks = [];
                    const record = (name, detail) => {
                        checks.push({ name, status: 'PASS', detail });
                        console.error(`[air-input] ${engine}/${custom ? 'custom' : 'default'} PASS: ${name}`);
                    };
                    assert.equal(await page.locator('canvas').getAttribute('id'), custom ? 'PortCanvas' : 'GameCanvas');
                    assert.equal(await page.locator('canvas').evaluate((canvas) => canvas.tabIndex), 0);
                    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('canvas')), false);
                    await page.keyboard.press('a');
                    assert.equal((await snapshot(page)).keyDown, 0);
                    record('first screen does not steal keyboard focus');
                    await reset(page);
                    await page.mouse.click(450, 325);
                    await page.waitForFunction(() => window.__airInputProbe.state.region.end === 1);
                    const region = await snapshot(page);
                    assert.equal(region.region.start, 1);
                    assert.equal(region.global.start, 0);
                    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('canvas')), true);
                    assert.equal(await page.evaluate(() => window.__airInputProbe.region.components.length), 1);
                    record('non-rendering UITransform region receives single touch and consumes UI event', region);
                    await page.keyboard.press('a');
                    await page.waitForFunction(() => window.__airInputProbe.state.keyUp === 1);
                    const keys = await snapshot(page);
                    assert.equal(keys.keyDown, 1);
                    assert.equal(keys.captureDown, 1);
                    assert.equal(keys.bubbleDown, 0);
                    record('canvas keyboard after interaction; window capture precedes PAL; bubbling stopped', keys);
                    await page.locator('#editable').fill('');
                    await page.locator('#editable').click();
                    await page.keyboard.type('abc');
                    assert.equal(await page.locator('#editable').inputValue(), 'abc');
                    assert.equal((await snapshot(page)).keyDown, 1);
                    record('editable input retains focus and does not dispatch game keys');
                    await reset(page);
                    await page.mouse.move(750, 500);
                    await page.mouse.down();
                    await page.mouse.move(790, 550);
                    await page.mouse.up();
                    await page.waitForFunction(() => window.__airInputProbe.state.global.end === 1);
                    const drag = await snapshot(page);
                    assert.equal(drag.global.start, 1);
                    assert(drag.global.move >= 1);
                    assert.equal(drag.global.end, 1);
                    record('desktop mouse uses native single touch subscription', drag);
                    await reset(page);
                    await page.touchscreen.tap(450, 325);
                    await page.waitForFunction(() => window.__airInputProbe.state.region.end >= 1);
                    const touch = await snapshot(page);
                    assert.equal(touch.region.start, 1);
                    assert.equal(touch.region.end, 1);
                    assert(touch.trusted.some((event) => event.type === 'touchstart' && event.trusted));
                    record('browser protocol touch uses the same region subscription', touch);
                    const inspection = await page.evaluate(async () => {
                        const { createAgentSession } = await import('/tools/debug/agent-session.js');
                        const { createDebugPanel } = await import('/tools/debug/panel.js');
                        const { Node } = await import('cocosair');
                        const probe = window.__airInputProbe;
                        const session = createAgentSession({ app: probe.app });
                        const normal = session.inspectScene();
                        const container = new Node('InspectLimit');
                        for (let i = 0; i < 520; i++) container.addChild(new Node(`Item${i}`));
                        probe.scene.addChild(container);
                        const limited = session.inspectScene();
                        const panel = createDebugPanel({ app: probe.app });
                        const panelPresent = document.body.textContent.includes('truncated');
                        panel.close(); panel.close();
                        let panelClosed, sessionClosed;
                        try { panel.session.inspectScene(); } catch (error) { panelClosed = error.code; }
                        session.close(); session.close();
                        try { session.inspectScene(); } catch (error) { sessionClosed = error.code; }
                        container.destroy();
                        return { normal: { count: normal.nodes.length, names: normal.nodes.map((node) => node.name) },
                            limited: { count: limited.nodes.length, truncated: limited.truncated }, panelPresent, panelClosed, sessionClosed };
                    });
                    assert(inspection.normal.names.includes('NonRenderingInputRegion'));
                    assert.equal(inspection.limited.count, 500);
                    assert.equal(inspection.limited.truncated, true);
                    assert.equal(inspection.panelPresent, true);
                    assert.equal(inspection.panelClosed, 'SESSION_CLOSED');
                    assert.equal(inspection.sessionClosed, 'SESSION_CLOSED');
                    record('existing inspectScene/panel shows structure, reports truncation, closes idempotently', inspection);
                    assert.deepEqual(errors, []);
                    const artifacts = path.resolve(root, out ? out.replace(/\.json$/, '') + '-artifacts' : `output/playwright/air-input-${Date.now()}`);
                    fs.mkdirSync(artifacts, { recursive: true });
                    const screenshot = path.join(artifacts, `${engine}-${custom ? 'custom' : 'default'}.png`);
                    await page.screenshot({ path: screenshot });
                    results.push({ engine, browserVersion: browser.version(), canvas: custom ? 'custom' : 'default', url, status: 'PASS', checks,
                        screenshot: path.relative(root, screenshot).replace(/\\/g, '/'),
                        inputMethod: 'Playwright browser protocol mouse/keyboard/touch (isTrusted checked for touch); no physical device attestation' });
                    await context.close();
                    stage = 'infrastructure';
                }
            } catch (error) {
                results.push({ engine, status: 'FAIL', stage, error: String(error.stack || error) });
            } finally { if (browser) await browser.close(); }
        }
        for (const file of files) assert.equal(hash(file), fingerprints[file], `source or loaded bundle drift: ${file}`);
        const report = { startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root, fingerprints,
            scope: ['PG-07 focus', 'PG-09 no-renderer UI region', 'PG-10 desktop and browser-protocol-touch', 'PG-14 existing tools'],
            subset: true, completed: results.every((result) => result.status === 'PASS') && results.length === engines.length * 2,
            unverified: ['physical touch devices', 'hybrid-device overlap/cancel/leave sequence', 'action reducer/session behavior (PG-28)'], results };
        if (out) { const target = path.resolve(root, out); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' }); }
        console.log(JSON.stringify(report, null, 2));
        process.exitCode = report.completed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(String(error.stack || error)); process.exitCode = 1; });
