// Focused actual browser acceptance. Explicit new output, no watcher/build/download/publication.
const fs = require('node:fs'),
    path = require('node:path'),
    crypto = require('node:crypto'),
    cp = require('node:child_process');
const assert = require('node:assert/strict'),
    { PNG } = require('pngjs'),
    playwright = require('playwright');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const root = path.resolve(__dirname, '../..'),
    sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const fileHash = (file) => sha(fs.readFileSync(path.join(root, file)));
function inkBands(bytes, x0, y0, x1, y1) {
    const png = PNG.sync.read(bytes),
        scaleX = png.width / 720,
        scaleY = png.height / 720,
        rows = [];
    for (let y = Math.floor((720 - y1) * scaleY); y < Math.ceil((720 - y0) * scaleY); y++) {
        let found = false;
        for (let x = Math.floor(x0 * scaleX); x < Math.ceil(x1 * scaleX); x++) {
            const i = (y * png.width + x) * 4;
            if (png.data[i] > 180 && png.data[i + 1] > 180 && png.data[i + 2] > 180) {
                found = true;
                break;
            }
        }
        if (found) rows.push(y);
    }
    let groups = 0,
        previous = -Infinity;
    for (const row of rows) {
        if (row - previous > Math.max(2, 3 * scaleY)) groups++;
        previous = row;
    }
    return { groups, inkRows: rows.length, height: rows.length ? (rows.at(-1) - rows[0] + 1) / scaleY : 0 };
}
const files = [
    'build/cocosair.module.js',
    'build/bootstrap.js',
    'src/air/bootstrap.ts',
    'src/air/app-config.ts',
    'src/air/ui-kit.ts',
    'tools/build/screen-layout-patch.cjs',
    'src/pal/screen-adapter/web/screen-adapter.js',
    'tools/recipes/board-state.ts',
    'examples/responsive-board-recipes/index.html',
    'examples/responsive-board-recipes/model.ts',
    'examples/responsive-board-recipes/src/main.ts',
    'tools/verify/responsive-host-browser.cjs',
];
async function run() {
    const option = process.argv.find((v) => v.startsWith('--out='));
    assert(option, '--out=<new.json> required');
    const out = path.resolve(root, option.slice(6));
    assert(!fs.existsSync(out), 'refusing to overwrite an attempt');
    const engines = process.argv.find((v) => v.startsWith('--browser='))?.slice(10) || 'all';
    const capture = process.argv.find((v) => v.startsWith('--capture='))?.slice(10) || 'page';
    assert(['page', 'canvas'].includes(capture), 'capture must be page or canvas');
    assert(['all', 'chromium', 'firefox', 'webkit'].includes(engines), 'invalid browser');
    const startedAt = new Date().toISOString(),
        fingerprints = Object.fromEntries(files.map((f) => [f, fileHash(f)]));
    const artifactDir = out.slice(0, -5) + '-artifacts';
    fs.mkdirSync(artifactDir, { recursive: true });
    const baselineDir = path.join(root, 'output/responsive-host/baseline');
    fs.mkdirSync(baselineDir, { recursive: true });
    // Immutable reviewed original. Never reset the checkout or reuse the candidate bytes as a baseline.
    const original = cp.spawnSync('git', ['show', 'b1ef301:build/cocosair.module.js'], { maxBuffer: 20 * 1024 * 1024 });
    assert.equal(original.status, 0);
    fs.writeFileSync(path.join(baselineDir, 'cocosair.module.js'), original.stdout);
    const browsers = {};
    const results = [],
        server = await startExampleServer(root);
    const negativeControls = [];
    try {
        for (const engine of engines === 'all' ? ['chromium', 'firefox', 'webkit'] : [engines]) {
            const browser = await playwright[engine].launch({
                ...launchOptions(engine),
                env: loopbackBrowserEnv(),
                headless: true,
            });
            browsers[engine] = {
                version: browser.version(),
                executable: launchOptions(engine).executablePath,
                headless: true,
            };
            try {
                for (const dpr of [1, 2]) {
                    const page = await browser.newPage({
                        viewport: { width: 900, height: 900 },
                        deviceScaleFactor: dpr,
                        hasTouch: true,
                    });
                    const errors = [],
                        checks = [],
                        screenshots = [];
                    const pageComposition = [];
                    await page.addInitScript(() => {
                        window.__layoutObservers = [];
                        const Native = window.ResizeObserver;
                        window.ResizeObserver = class extends Native {
                            constructor(callback) {
                                super(callback);
                                this.receipt = { disconnected: false };
                                window.__layoutObservers.push(this.receipt);
                            }
                            disconnect() {
                                this.receipt.disconnected = true;
                                super.disconnect();
                            }
                        };
                    });
                    page.on('pageerror', (e) => errors.push(e.message));
                    page.on('console', (e) => {
                        if (e.type() === 'error') errors.push(e.text());
                    });
                    const check = (name, detail, validate) => {
                        validate();
                        checks.push({ name, ok: true, detail });
                    };
                    const frame = async (dt) => page.evaluate((dt) => window.__boardProbe.frame(dt), dt ?? 0);
                    const snap = () => page.evaluate(() => window.__boardProbe.snapshot());
                    const shot = async (name, present = true) => {
                        if (present) {
                            // Settle pending layout/resources and submit a native frame without advancing rules.
                            await page.evaluate(
                                () =>
                                    new Promise((resolve) =>
                                        requestAnimationFrame(() => requestAnimationFrame(resolve)),
                                    ),
                            );
                            await frame();
                        }
                        const pageBytes = await page.locator('#GameCanvas').screenshot();
                        let bytes = pageBytes;
                        if (capture === 'canvas') {
                            const url = await page.evaluate(() => {
                                const canvas = document.getElementById('GameCanvas'),
                                    gl = canvas.getContext('webgl2');
                                if (!gl?.getContextAttributes()?.preserveDrawingBuffer)
                                    throw Error('native capture requires preserved drawing buffer');
                                return canvas.toDataURL('image/png');
                            });
                            bytes = Buffer.from(url.split(',')[1], 'base64');
                            const paired = path.join(artifactDir, `${engine}-dpr${dpr}-${name}-page.png`);
                            fs.writeFileSync(paired, pageBytes);
                            screenshots.push({
                                file: path.relative(root, paired).replace(/\\/g, '/'),
                                sha256: sha(pageBytes),
                                method: 'PAGE_COMPOSITOR',
                            });
                            const a = PNG.sync.read(bytes),
                                b = PNG.sync.read(pageBytes);
                            const pixel = (png) => {
                                const i =
                                    (Math.floor((413 / 720) * png.height) * png.width +
                                        Math.floor((307 / 720) * png.width)) *
                                    4;
                                return [...png.data.subarray(i, i + 3)];
                            };
                            const native = pixel(a),
                                pageColor = pixel(b);
                            pageComposition.push({
                                name,
                                status: native.every((v, i) => Math.abs(v - pageColor[i]) <= 8) ? 'PASS' : 'FAIL',
                                native,
                                page: pageColor,
                            });
                        }
                        const file = path.join(artifactDir, `${engine}-dpr${dpr}-${name}.png`);
                        fs.writeFileSync(file, bytes);
                        screenshots.push({
                            file: path.relative(root, file).replace(/\\/g, '/'),
                            sha256: sha(bytes),
                            method: capture === 'canvas' ? 'CANVAS_NATIVE' : 'PAGE_COMPOSITOR',
                        });
                        return bytes;
                    };
                    async function clickDesign(x, y, touch = false) {
                        const rect = await page.locator('#GameCanvas').boundingBox();
                        const point = { x: rect.x + (x / 720) * rect.width, y: rect.y + (1 - y / 720) * rect.height };
                        if (touch) await page.touchscreen.tap(point.x, point.y);
                        else await page.mouse.click(point.x, point.y);
                        await frame();
                    }
                    try {
                        await page.goto(server.origin + '/examples/responsive-board-recipes/?test=1');
                        await page.waitForFunction(() => window.__boardProbe, null, { timeout: 30000 });
                        const initial = await snap();
                        check('initial container buffer uses effective DPR', initial, () => {
                            assert.deepEqual(initial.buffer, [900 * dpr, 900 * dpr]);
                            assert.equal(initial.dpr, dpr);
                        });
                        const startup = await shot('startup');
                        for (const viewport of [
                            { width: 900, height: 900 },
                            { width: 390, height: 844 },
                            { width: 1100, height: 900 },
                        ]) {
                            await page.setViewportSize(viewport);
                            await page.waitForFunction(() => {
                                const p = window.__boardProbe.snapshot(),
                                    c = document.querySelector('#GameCanvas');
                                return (
                                    p.buffer[0] === Math.round(c.clientWidth * p.dpr) &&
                                    p.buffer[1] === Math.round(c.clientHeight * p.dpr)
                                );
                            });
                            await frame();
                            const size = await snap();
                            check('resize synchronizes buffer and native input scale ' + viewport.width, size, () => {
                                assert.equal(size.viewScale[0], size.buffer[0] / 720);
                                assert.equal(size.viewScale[1], size.buffer[1] / 720);
                            });
                            for (const [x, y] of [
                                [122, 122],
                                [598, 122],
                                [122, 598],
                                [598, 598],
                                [300, 300],
                                [360, 360],
                            ]) {
                                const before = await snap();
                                await clickDesign(x, y);
                                const after = await snap();
                                const expected =
                                    Math.floor(((600 - y) / 480) * 4) * 4 + Math.floor(((x - 120) / 480) * 4);
                                check(`trusted click ${x},${y} at ${viewport.width}`, after, () => {
                                    assert.equal(after.hits, before.hits + 1);
                                    assert.equal(after.selected, expected);
                                });
                            }
                        }
                        const beforeParent = await snap();
                        await page.evaluate(
                            () => (document.getElementById('host').style.cssText = 'width:512px;height:512px'),
                        );
                        await page.waitForFunction(
                            () => window.__boardProbe.snapshot().buffer[0] === 512 * window.__boardProbe.snapshot().dpr,
                        );
                        await frame();
                        await clickDesign(300, 300, true);
                        const parent = await snap();
                        check('parent-only resize and trusted touch hit once', parent, () => {
                            assert.deepEqual(parent.buffer, [512 * dpr, 512 * dpr]);
                            assert.equal(parent.hits, beforeParent.hits + 1);
                            assert.equal(parent.selected, 9);
                        });
                        const picked = await shot('parent-touch');
                        const png = PNG.sync.read(picked),
                            ix = Math.floor((300 / 720) * png.width),
                            iy = Math.floor((420 / 720) * png.height),
                            pixel = [...png.data.subarray((iy * png.width + ix) * 4, (iy * png.width + ix) * 4 + 4)];
                        check('selected cell is actually presented, not only a changed model', pixel, () => {
                            assert(pixel[1] > 140 && pixel[2] > 80);
                            assert.notEqual(sha(picked), sha(startup));
                        });
                        await page.evaluate(() => (document.getElementById('host').style.display = 'none'));
                        await page.waitForTimeout(80);
                        const hidden = await snap();
                        await page.evaluate(() => (document.getElementById('host').style.display = ''));
                        await page.waitForTimeout(80);
                        await frame();
                        check('hidden zero-size retains valid buffer and reveals', await snap(), () =>
                            assert.deepEqual(hidden.buffer, parent.buffer),
                        );
                        for (const [columns, rows] of [
                            [4, 4],
                            [10, 20],
                            [16, 16],
                        ]) {
                            await page.selectOption('#board', `${columns},${rows}`);
                            await frame();
                            await clickDesign(307, 307);
                            const s = await snap();
                            check(`board ${columns}x${rows} local picking`, s, () => {
                                assert.equal(s.hits, 1);
                                assert.equal(
                                    s.selected,
                                    Math.floor((293 / 480) * rows) * columns + Math.floor((187 / 480) * columns),
                                );
                            });
                        }
                        await page.evaluate(() => window.__boardProbe.restart());
                        await frame();
                        const nodes = (await snap()).nodes;
                        for (let i = 0; i < 100; i++) await page.evaluate(() => window.__boardProbe.restart());
                        await clickDesign(300, 300);
                        const restarted = await snap();
                        check('100 model restarts retain nodes and do not duplicate listeners', restarted, () => {
                            assert.equal(restarted.nodes, nodes);
                            assert.equal(restarted.hits, 1);
                        });
                        await page.locator('#GameCanvas').focus();
                        await page.keyboard.down('2');
                        await frame();
                        await page.keyboard.up('2');
                        await frame();
                        await page.keyboard.down('2');
                        await frame();
                        await page.keyboard.up('2');
                        await frame();
                        await page.keyboard.down('Space');
                        for (let i = 0; i < 5; i++) await page.keyboard.down('Space');
                        await frame();
                        await page.keyboard.up('Space');
                        await frame();
                        const keys = await snap();
                        check('independent key releases and repeat produce only press edges', keys, () => {
                            assert.equal(keys.drops, 3);
                            assert(keys.keyboard.pressing >= 5);
                        });
                        await page.keyboard.down('Space');
                        await frame();
                        assert.equal((await snap()).held, true);
                        await page.locator('#text').focus();
                        await page.keyboard.up('Space');
                        await frame();
                        const movedFocus = await snap();
                        check('keyup after real editable focus change clears native ownership', movedFocus, () => {
                            assert.equal(movedFocus.held, false);
                            assert.equal(movedFocus.drops, 4);
                        });
                        await page.keyboard.press('Shift+Digit9');
                        await page.keyboard.press('Digit9');
                        const text = await page.locator('#text').inputValue();
                        await frame();
                        const textState = await snap();
                        check(
                            'text input is separate from physical key actions',
                            { text, drops: textState.drops },
                            () => {
                                assert.equal(text, '(9');
                                assert.equal(textState.drops, 4);
                            },
                        );
                        await page.evaluate(() => window.__boardProbe.restart());
                        await frame();
                        const clean = await shot('clean');
                        await page.evaluate(() => window.__boardProbe.fixture({ selected: 0, hits: 3, pulse: 0.35 }));
                        const stale = await shot('fixture-before-draw', false);
                        assert.equal(
                            sha(stale),
                            sha(clean),
                            'negative control: fixture state is not an already-presented frame',
                        );
                        await frame();
                        const fixture = await shot('fixture-after-draw');
                        const fixtureState = await snap();
                        check('zero-time native draw binds fixture to changed pixels', fixtureState, () => {
                            assert.notEqual(sha(fixture), sha(clean));
                            assert.equal(fixtureState.hits, 3);
                        });
                        const pulseBefore = await snap();
                        await page.evaluate(() => window.__boardProbe.pause(true));
                        await frame(1);
                        const pausedState = await snap();
                        check('Pause freezes visual timer', pausedState, () =>
                            assert.equal(pausedState.pulse, pulseBefore.pulse),
                        );
                        await page.evaluate(() => window.__boardProbe.pause(false));
                        await frame(0.2);
                        const middle = await shot('pulse-middle');
                        await frame(0.2);
                        const ended = await shot('pulse-end');
                        const end = await snap();
                        check('visible timer ends while rule state is stable', end, () => {
                            assert.equal(end.hits, 3);
                            assert.equal(end.selected, 0);
                            assert.equal(end.pulse, 0);
                            assert.notEqual(sha(middle), sha(ended));
                        });
                        const draws = end.draws;
                        await frame(0);
                        const idle = await snap();
                        check('idle visual cache does not rebuild', idle, () => assert.equal(idle.draws, draws));
                        const rejected = await page.evaluate(() => {
                            try {
                                window.__boardProbe.fixture({ selected: -1, hits: 3, pulse: 0 });
                                return false;
                            } catch {
                                return true;
                            }
                        });
                        check('invalid fixture rejected before rendering', rejected, () => assert(rejected));
                        await page.evaluate(() => window.__boardProbe.label('RESTART', 48));
                        await frame();
                        const labels = await shot('single-line-narrow');
                        const single = inkBands(labels, 636, 480, 684, 560),
                            right = inkBands(labels, 628, 595, 692, 675),
                            multi = inkBands(labels, 10, 595, 110, 685);
                        check(
                            'dynamic narrow single line and preserved multiline actual ink',
                            { single, right, multi },
                            () => {
                                assert.equal(single.groups, 1);
                                assert(single.inkRows > 0 && single.height <= 24);
                                assert.equal(right.groups, 1);
                                assert(right.inkRows > 0);
                                assert(multi.groups >= 2);
                            },
                        );
                        const receipt = await page.evaluate(() => window.__boardProbe.close());
                        check('scene cleanup returns owned input receipt', receipt, () => {
                            assert.equal(receipt.status, 'released');
                            assert(receipt.completed.some((label) => label.startsWith('board-input#')));
                        });
                        const closed = await snap();
                        assert.equal(closed.adapterAttached, false);
                        assert.equal(closed.held, false);
                        await page.locator('#restart').click();
                        await page.locator('#flag').click();
                        const closedAfterUI = await snap();
                        check('closed session detaches HUD handlers and leaves model unchanged', closedAfterUI, () => {
                            assert.equal(closedAfterUI.uiValid, false);
                            assert.equal(closedAfterUI.hits, closed.hits);
                            assert.equal(closedAfterUI.flags, closed.flags);
                        });
                        await page.evaluate(() => (document.getElementById('host').style.width = '490px'));
                        await page.waitForTimeout(80);
                        const observerReceipt = await page.evaluate(() => window.__layoutObservers);
                        check('close disconnects layout observer and prevents parent updates', observerReceipt, () => {
                            assert(observerReceipt.length > 0 && observerReceipt.every((r) => r.disconnected));
                        });
                        assert.deepEqual((await snap()).buffer, closed.buffer);
                        check('no console or page errors', errors, () => assert.deepEqual(errors, []));
                        results.push({ engine, dpr, status: 'PASS', checks, screenshots, errors, pageComposition });
                    } catch (error) {
                        results.push({
                            engine,
                            dpr,
                            status: 'FAIL',
                            checks,
                            screenshots,
                            pageComposition,
                            errors,
                            error: String(error),
                        });
                    } finally {
                        await page.close();
                    }
                }
                {
                    const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
                    const errors = [];
                    page.on('pageerror', (e) => errors.push(e.message));
                    try {
                        await page.route('**/examples/responsive-board-recipes/*', async (route) => {
                            if (!route.request().url().includes('?test=1&safe=1')) return route.continue();
                            const html = fs
                                .readFileSync(path.join(root, 'examples/responsive-board-recipes/index.html'), 'utf8')
                                .replace(
                                    /<section id="host">[\s\S]*?<\/section>/,
                                    '<section id="host"><canvas id="custom-board" tabindex="0"></canvas></section>',
                                );
                            return route.fulfill({ contentType: 'text/html', body: html });
                        });
                        await page.goto(server.origin + '/examples/responsive-board-recipes/?test=1&safe=1&cap=1.5');
                        await page.waitForFunction(() => window.__boardProbe);
                        const safe = await page.evaluate(() => ({
                            ...window.__boardProbe.snapshot(),
                            id: document.querySelector('canvas').id,
                            bodyStyle: document.body.style.cssText,
                            nested: document.getElementById('host').contains(document.getElementById('GameDiv')),
                        }));
                        assert.deepEqual(safe.buffer, [1350, 1350]);
                        assert.equal(safe.dpr, 1.5);
                        assert.equal(safe.id, 'custom-board');
                        assert.equal(safe.bodyStyle, '');
                        assert(safe.nested);
                        await page.evaluate(
                            () => (document.getElementById('host').style.cssText = 'width:390px;height:390px'),
                        );
                        await page.waitForFunction(() => window.__boardProbe.snapshot().buffer[0] === 585);
                        await page.evaluate(() => window.__boardProbe.frame());
                        const box = await page.locator('#custom-board').boundingBox();
                        await page.mouse.click(box.x + (300 / 720) * box.width, box.y + (420 / 720) * box.height);
                        await page.evaluate(() => window.__boardProbe.frame());
                        const resized = await page.evaluate(() => window.__boardProbe.snapshot());
                        assert.deepEqual(resized.buffer, [585, 585]);
                        assert.equal(resized.hits, 1);
                        assert.equal(resized.selected, 9);
                        const receipt = await page.evaluate(() => window.__boardProbe.close());
                        assert.equal(receipt.status, 'released');
                        assert.deepEqual(errors, []);
                        results.push({
                            engine,
                            mode: 'safe-bootstrap-custom-container',
                            status: 'PASS',
                            checks: [
                                {
                                    name: 'custom canvas, wrappers, effective fractional cap and body ownership',
                                    ok: true,
                                    detail: safe,
                                },
                                {
                                    name: 'fractional effective DPR remains synchronized through parent resize and input',
                                    ok: true,
                                    detail: resized,
                                },
                            ],
                        });
                    } catch (error) {
                        results.push({
                            engine,
                            mode: 'safe-bootstrap-custom-container',
                            status: 'FAIL',
                            errors,
                            error: String(error),
                        });
                    } finally {
                        await page.close();
                    }
                }
                for (const mode of ['window', 'default']) {
                    const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 2 });
                    const errors = [];
                    page.on('pageerror', (e) => errors.push(e.message));
                    try {
                        await page.goto(server.origin + `/examples/responsive-board-recipes/?test=1&${mode}=1`);
                        await page.waitForFunction(() => window.__boardProbe);
                        const initial = await page.evaluate(() => window.__boardProbe.snapshot());
                        assert.deepEqual(initial.buffer, [1800, 1400]);
                        await page.setViewportSize({ width: 390, height: 844 });
                        await page.waitForFunction(() => window.__boardProbe.snapshot().buffer[1] === 1688);
                        await page.evaluate(() => window.__boardProbe.frame());
                        const rect = await page.locator('#GameCanvas').boundingBox();
                        await page.mouse.click(rect.x + (300 / 720) * rect.width, rect.y + (420 / 720) * rect.height);
                        await page.evaluate(() => window.__boardProbe.frame());
                        const resized = await page.evaluate(() => window.__boardProbe.snapshot());
                        assert.deepEqual(resized.buffer, [780, 1688]);
                        assert.equal(resized.hits, 1);
                        assert.equal(resized.selected, 9);
                        const receipt = await page.evaluate(() => window.__boardProbe.close());
                        assert.equal(receipt.status, 'released');
                        assert.deepEqual(errors, []);
                        results.push({
                            engine,
                            mode,
                            status: 'PASS',
                            checks: [
                                {
                                    name: 'window fill startup and resize preserve native policy and target hit',
                                    ok: true,
                                    detail: { initial, resized },
                                },
                            ],
                        });
                    } catch (error) {
                        results.push({ engine, mode, status: 'FAIL', errors, error: String(error) });
                    } finally {
                        await page.close();
                    }
                }
                if (engine === 'chromium') {
                    const page = await browser.newPage({ viewport: { width: 900, height: 900 }, deviceScaleFactor: 2 });
                    try {
                        await page.goto(server.origin + '/examples/responsive-board-recipes/?test=1&legacy=1');
                        await page.waitForFunction(() => window.__boardProbe);
                        await page.setViewportSize({ width: 390, height: 844 });
                        await page.waitForTimeout(100);
                        const originalState = await page.evaluate(() => window.__boardProbe.snapshot());
                        assert.notDeepEqual(
                            originalState.buffer,
                            [780, 780],
                            'original must fail responsive buffer contract',
                        );
                        const rect = await page.locator('#GameCanvas').boundingBox();
                        await page.mouse.click(rect.x + (300 / 720) * rect.width, rect.y + (420 / 720) * rect.height);
                        await page.evaluate(() => window.__boardProbe.frame());
                        const wrongHit = await page.evaluate(() => window.__boardProbe.snapshot());
                        assert(
                            wrongHit.hits !== 1 || wrongHit.selected !== 9,
                            'original must fail the target hit, not merely expose a buffer mismatch',
                        );
                        await page.evaluate(() => window.__boardProbe.legacyWorkaround());
                        await page.evaluate(() => window.__boardProbe.frame());
                        await page.evaluate(() => window.__boardProbe.restart());
                        await page.mouse.click(rect.x + (300 / 720) * rect.width, rect.y + (420 / 720) * rect.height);
                        await page.evaluate(() => window.__boardProbe.frame());
                        const workaround = await page.evaluate(() => window.__boardProbe.snapshot());
                        assert.deepEqual(workaround.buffer, [780, 780]);
                        assert.equal(workaround.hits, 1);
                        assert.equal(workaround.selected, 9);
                        negativeControls.push({
                            status: 'PASS',
                            originalFails: true,
                            applicationWorkaroundPasses: true,
                            originalState,
                            wrongHit,
                            workaround,
                        });
                    } catch (error) {
                        negativeControls.push({ status: 'FAIL', error: String(error) });
                    } finally {
                        await page.close();
                    }
                }
            } finally {
                await browser.close();
            }
        }
        for (const file of files)
            assert.equal(fileHash(file), fingerprints[file], 'source or candidate drift: ' + file);
        const pass = results.every((r) => r.status === 'PASS') && negativeControls.every((r) => r.status === 'PASS');
        fs.writeFileSync(
            out,
            JSON.stringify(
                {
                    schema: 'air-responsive-host-proof/1',
                    command: process.argv,
                    playwrightVersion: require('playwright/package.json').version,
                    browsers,
                    startedAt,
                    endedAt: new Date().toISOString(),
                    scope: 'native responsive container, three board recipes, deterministic input/visual verification',
                    captureMethod: capture === 'canvas' ? 'CANVAS_NATIVE' : 'PAGE_COMPOSITOR',
                    pageCompositionPassed:
                        capture === 'page'
                            ? pass
                            : results.filter((r) => r.dpr !== undefined).length > 0 &&
                              results
                                  .filter((r) => r.dpr !== undefined)
                                  .every(
                                      (r) =>
                                          r.pageComposition?.length > 0 &&
                                          r.pageComposition.every((c) => c.status === 'PASS'),
                                  ),
                    completed: true,
                    subset: true,
                    scopePassed: pass,
                    fullExternalGamesVerified: false,
                    fingerprints,
                    baseline: { revision: 'b1ef301', sha256: sha(original.stdout) },
                    results,
                    negativeControls,
                    limitations: [
                        'External 50 games and 707 scenarios not available; no physical device/present/FPS claims.',
                    ],
                },
                null,
                2,
            ) + '\n',
            { flag: 'wx' },
        );
        process.exitCode = pass ? 0 : 1;
    } finally {
        await server.close();
    }
}
run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
