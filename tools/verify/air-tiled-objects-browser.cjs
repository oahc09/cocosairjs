const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { evaluateProbeRanges } = require('./probe-ranges.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (file) =>
    crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, file)))
        .digest('hex');
const dig = (value, key) => key.split('.').reduce((v, part) => v?.[part], value);
function contractChecks(probe, checks) {
    const results = [];
    for (const [key, expected] of Object.entries(checks.probeEquals || {})) {
        results.push({ assertion: key, ok: dig(probe, key) === expected, actual: dig(probe, key), expected });
    }
    for (const key of checks.probePresent || []) results.push({ assertion: key, ok: dig(probe, key) !== undefined });
    for (const key of checks.probeNonEmpty || []) {
        const value = dig(probe, key);
        results.push({
            assertion: key,
            ok: Array.isArray(value)
                ? value.length > 0
                : typeof value === 'number'
                  ? Number.isFinite(value) && value !== 0
                  : Boolean(value),
        });
    }
    return results.concat(evaluateProbeRanges(probe, checks.probeRanges));
}
async function staticTilePixels(page, shotDir, engine) {
    await page.evaluate(async () => {
        const { createStepClock, director, TiledMap } = await import('/build/cocosair.module.js');
        const maps = director.getScene().getComponentsInChildren(TiledMap);
        const ortho = maps.find((map) => map.getMapOrientation() === TiledMap.Orientation.ORTHO);
        const iso = maps.find((map) => map.getMapOrientation() === TiledMap.Orientation.ISO);
        const layer = iso.getLayer('diamond');
        if (!ortho || !layer.node.activeInHierarchy || layer.hasAnimation())
            throw new Error('static fixture is not ready');
        const clock = createStepClock();
        clock.begin();
        ortho.node.active = false; // Hide the unrelated animated map, never toggle the target layer.
        window.__staticTilePixels = { layer, clock };
    });
    const receipts = [];
    try {
        for (const culling of [false, true]) {
            await page.evaluate(async (enabled) => {
                const { layer, clock } = window.__staticTilePixels;
                layer.enableCulling = enabled;
                await clock.step();
                await clock.step(); // Settle the selected culling mode before taking the baseline.
            }, culling);
            const mode = culling ? 'culled' : 'unculled';
            const captures = {};
            const capture = async (stage) => {
                const file = path.join(shotDir, `${engine}-${mode}-${stage}.png`);
                const pixels = await page.screenshot({ path: file });
                captures[stage] = {
                    screenshot: path.relative(root, file),
                    sha256: crypto.createHash('sha256').update(pixels).digest('hex'),
                };
                return pixels;
            };
            const control = async (kind) =>
                page.evaluate(async (action) => {
                    const { layer, clock } = window.__staticTilePixels;
                    if (!layer.node.activeInHierarchy || layer.hasAnimation())
                        throw new Error('target layer changed lifecycle');
                    if (action === 'single-clear') layer.setTileGIDAt(0, 2, 2);
                    else if (action === 'single-fill') layer.setTileGIDAt(1, 2, 2);
                    else if (action === 'batch-clear') layer.setTilesGIDAt([0, 0], 1, 1, 2);
                    else if (action === 'batch-fill') layer.setTilesGIDAt([1, 2], 1, 1, 2);
                    await clock.step();
                    return [layer.getTileGIDAt(2, 2), layer.getTileGIDAt(1, 1), layer.getTileGIDAt(2, 1)];
                }, kind);

            assert.deepEqual(await control('baseline'), [1, 1, 2]);
            const baseline = await capture('baseline');
            assert.deepEqual(await control('single-clear'), [0, 1, 2]);
            const single = await capture('single-clear');
            assert(!baseline.equals(single), `${mode}: clearing one tile did not change displayed pixels`);
            assert.deepEqual(await control('single-fill'), [1, 1, 2]);
            assert(
                baseline.equals(await capture('single-fill')),
                `${mode}: filling the empty tile did not restore pixels`,
            );
            assert.deepEqual(await control('batch-clear'), [1, 0, 0]);
            const batch = await capture('batch-clear');
            assert(!baseline.equals(batch), `${mode}: clearing two tiles did not change displayed pixels`);
            assert.deepEqual(await control('batch-fill'), [1, 1, 2]);
            assert(baseline.equals(await capture('batch-fill')), `${mode}: batch fill did not restore pixels`);
            receipts.push({ culling, captures });
        }
    } finally {
        await page.evaluate(() => {
            window.__staticTilePixels.clock.end();
            delete window.__staticTilePixels;
        });
    }
    return receipts;
}

async function main() {
    const args = process.argv.slice(2);
    const arg = args.find((option) => option.startsWith('--out='));
    const selection = args.find((option) => option.startsWith('--engines='));
    assert(arg?.slice(6), '--out=<new.json> required');
    assert(args.length === (selection ? 2 : 1), 'use --out and optional --engines');
    const allEngines = ['chromium', 'firefox', 'webkit'];
    const engines = selection ? selection.slice(10).split(',') : allEngines;
    assert(
        engines.every((engine) => allEngines.includes(engine)) && new Set(engines).size === engines.length,
        '--engines must contain unique chromium, firefox or webkit names',
    );
    const output = path.resolve(root, arg.slice(6));
    assert(!fs.existsSync(output), 'new report required');
    const shotDir = output.replace(/\.json$/, '-artifacts');
    fs.mkdirSync(shotDir, { recursive: true });
    const files = [
        'src/cocos/tiledmap/tiled-object-group.ts',
        'src/cocos/tiledmap/tiled-types.ts',
        'src/cocos/tiledmap/tmx-xml-parser.ts',
        'src/cocos/tiledmap/tiled-layer.ts',
        'build/cocosair.module.js',
        'tools/verify/air-tiled-objects-browser.cjs',
        'tools/verify/browser-matrix-contract.json',
        'tools/verify/browser-engines.cjs',
        'examples/tiledmap-basic/main.js',
        'examples/tiledmap-basic/index.html',
        ...fs
            .readdirSync(path.join(root, 'examples/tiledmap-basic/assets'))
            .map((name) => 'examples/tiledmap-basic/assets/' + name),
    ];
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)]));
    const contract = JSON.parse(fs.readFileSync(path.join(root, 'tools/verify/browser-matrix-contract.json')))[
        'tiledmap-basic'
    ];
    const startedAt = new Date().toISOString(),
        results = [],
        server = await startExampleServer(root);
    try {
        const playwright = require('playwright');
        for (const engine of engines) {
            let browser;
            try {
                if (engine === 'webkit')
                    assert(fs.existsSync(playwright.webkit.executablePath()), 'matching WebKit required');
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
                const errors = [],
                    failedRequests = [];
                page.on('pageerror', (error) => errors.push(String(error)));
                page.on('console', (message) => {
                    if (
                        message.type() === 'error' &&
                        !message.text().includes('[Physics] PhysicsSystem initDefaultMaterial()')
                    )
                        errors.push(message.text());
                });
                page.on('response', (response) => {
                    if (response.status() >= 400) failedRequests.push(response.url());
                });
                await page.goto(server.origin + '/examples/tiledmap-basic/');
                await page.waitForFunction(() => typeof window.__probe === 'function');
                await page.waitForTimeout(contract.waitMs);
                await page.mouse.click(...contract.click.split(',').map(Number));
                await page.waitForTimeout(contract.afterClickMs);
                const probe = await page.evaluate(() => window.__probe());
                const checks = contractChecks(probe, contract.checks);
                assert.deepEqual(
                    checks.filter((check) => !check.ok),
                    [],
                    'existing P1-P8 contract regressed',
                );
                const objects = await page.evaluate(async () => {
                    const { director, TiledMap } = await import('/build/cocosair.module.js');
                    const maps = director.getScene().getComponentsInChildren(TiledMap);
                    const result = [];
                    for (const map of maps) {
                        const iso = map.getMapOrientation() === TiledMap.Orientation.ISO;
                        const xml = new DOMParser().parseFromString(map.tmxAsset.tmxXmlStr, 'application/xml');
                        for (const group of map.getObjectGroups()) {
                            const originals = [...xml.querySelectorAll('objectgroup')].find(
                                (g) => g.getAttribute('name') === group.getGroupName(),
                            );
                            const raw = group.getRawObjects();
                            if (!Object.isFrozen(raw)) throw new Error('raw array mutable');
                            for (const original of originals.querySelectorAll('object')) {
                                const id = original.getAttribute('id'),
                                    entry = raw.find((o) => String(o.id) === id);
                                const converted = group.getObjects().find((o) => String(o.id) === id);
                                const x = Number(original.getAttribute('x')),
                                    y = Number(original.getAttribute('y'));
                                const className = original.getAttribute('class') || original.getAttribute('type') || '';
                                if (
                                    !entry ||
                                    !Object.isFrozen(entry) ||
                                    entry.x !== x ||
                                    entry.y !== y ||
                                    entry.className !== className ||
                                    !group.getObjectsByType(className).includes(converted) ||
                                    !group.getObjectsByType(converted.type).includes(converted)
                                )
                                    throw new Error('raw/type mismatch: ' + id);
                                const size = map.getMapSize(),
                                    tile = map.getTileSize();
                                const expectedX = iso
                                    ? (tile.width / 2) * (size.height + x / tile.height - y / tile.height)
                                    : x;
                                const expectedY = iso
                                    ? (tile.height / 2) * (size.width + size.height - x / tile.height - y / tile.height)
                                    : size.height * tile.height - y;
                                if (converted.x !== expectedX || converted.y !== expectedY)
                                    throw new Error('native coordinates changed: ' + id);
                                const polygon = original.querySelector('polygon,polyline');
                                if (polygon) {
                                    const points = polygon
                                        .getAttribute('points')
                                        .split(' ')
                                        .map((pair) => pair.split(',').map(Number));
                                    const stored = entry.points || entry.polylinePoints;
                                    if (
                                        !Object.isFrozen(stored) ||
                                        points.some(
                                            (p, i) =>
                                                !Object.isFrozen(stored[i]) ||
                                                stored[i].x !== p[0] ||
                                                stored[i].y !== p[1],
                                        )
                                    )
                                        throw new Error('raw points changed');
                                }
                                result.push({
                                    iso,
                                    name: entry.name,
                                    className,
                                    raw: [x, y],
                                    engine: [converted.x, converted.y],
                                });
                            }
                        }
                    }
                    return result;
                });
                assert(objects.some((object) => object.iso));
                assert(objects.some((object) => !object.iso));
                assert(objects.some((object) => object.className === 'solid'));
                const first = await page.screenshot();
                let second,
                    attempts = 0;
                do {
                    await page.waitForTimeout(400);
                    second = await page.screenshot();
                    attempts++;
                } while (first.equals(second) && attempts < 5);
                assert(!first.equals(second), 'animated tile frame did not change');
                assert(second.length >= contract.checks.minPngBytes);
                const screenshot = path.join(shotDir, engine + '.png');
                fs.writeFileSync(screenshot, second);
                const staticEdits = await staticTilePixels(page, shotDir, engine);
                assert.deepEqual(errors, []);
                assert.deepEqual(failedRequests, []);
                results.push({
                    engine,
                    status: 'PASS',
                    browserVersion: browser.version(),
                    checks,
                    objects,
                    staticEdits,
                    frameAttempts: attempts,
                    screenshot: path.relative(root, screenshot),
                    screenshotSha256: crypto.createHash('sha256').update(second).digest('hex'),
                });
            } catch (error) {
                results.push({ engine, status: 'FAIL', error: String(error.stack || error) });
            } finally {
                if (browser) await browser.close();
            }
            console.error('[tiled-objects] ' + JSON.stringify(results.at(-1)));
        }
        for (const file of files) assert.equal(hash(file), fingerprints[file], 'candidate drift: ' + file);
        const passed = results.length === engines.length && results.every((result) => result.status === 'PASS');
        fs.writeFileSync(
            output,
            JSON.stringify(
                {
                    startedAt,
                    endedAt: new Date().toISOString(),
                    command: process.argv,
                    cwd: root,
                    scope: [
                        'PG-03 original/class/shape coordinates',
                        'tiledmap-basic P1-P8',
                        'static single/batch browser pixels (culling on/off)',
                    ],
                    subset: true,
                    completed: false,
                    scopePassed: passed,
                    browserCoverage: engines,
                    fingerprints,
                    results,
                },
                null,
                2,
            ) + '\n',
            { flag: 'wx' },
        );
        process.exitCode = passed ? 0 : 1;
    } finally {
        await server.close();
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
