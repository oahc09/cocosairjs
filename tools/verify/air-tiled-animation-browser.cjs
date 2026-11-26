const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');

const root = path.resolve(__dirname, '../..');
const fixture = '/__tiled_animation_fixture/';
const tmx = (tiles, width) =>
    '<map version="1.4" orientation="orthogonal" width="' +
    width +
    '" height="1" tilewidth="16" tileheight="16">' +
    '<tileset firstgid="1" source="tiles.tsx"/>' +
    '<layer name="floor" width="' +
    width +
    '" height="1"><data encoding="csv">' +
    tiles +
    '</data></layer></map>';
const tsx =
    '<tileset version="1.4" name="timeline" tilewidth="16" tileheight="16" tilecount="7" columns="7">' +
    '<image source="tiles.png" width="112" height="16"/>' +
    '<tile id="0"><animation><frame tileid="0" duration="125"/><frame tileid="1" duration="250"/>' +
    '<frame tileid="2" duration="375"/></animation></tile></tileset>';
const malformed = tsx.replace(
    '</tileset>',
    '<tile id="5"><animation/></tile><tile id="6"><animation><frame tileid="0" duration="0"/>' +
        '<frame tileid="1"/></animation></tile></tileset>',
);
// Authored solid 16x16 RGB swatches: red, green, blue, yellow, cyan, magenta, orange.
const png =
    'iVBORw0KGgoAAAANSUhEUgAAAHAAAAAQCAIAAABBdmxGAAAARElEQVR4nO3QsQ0AIAwDQY/O5mYGI9Gd9KWT4tJkalvvB22mtvX8vj2Z+u0DFChQoECBAgUKFChQoECBAgUKFCjQZ9ALvFZ2l83KJoYAAAAASUVORK5CYII=';
const colors = [
    [255, 0, 0],
    [0, 255, 0],
    [0, 0, 255],
    [255, 255, 0],
    [0, 255, 255],
    [255, 0, 255],
    [255, 128, 0],
];
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function main() {
    const [engine, target, ...extra] = process.argv.slice(2);
    assert(
        ['chromium', 'firefox', 'webkit'].includes(engine) && target && !extra.length,
        'usage: <engine> <fresh report.json>',
    );
    const output = path.resolve(target);
    assert(!fs.existsSync(output), 'choose fresh report path');
    const files = [
        'src/cocos/tiledmap/tiled-map.ts',
        'src/cocos/tiledmap/tmx-xml-parser.ts',
        'build/cocosair.module.js',
        'tools/verify/air-tiled-animation-browser.cjs',
    ];
    const fingerprints = Object.fromEntries(files.map((name) => [name, sha(fs.readFileSync(path.join(root, name)))]));
    const report = {
        scope: 'native Tiled TSX animation with controlled engine delta time, real rendered pixels and existing static/transform refresh',
        engine,
        fingerprints,
        status: 'FAIL',
        pageErrors: [],
        runtimeErrors: [],
        stages: {},
    };
    const server = await startExampleServer(root);
    let browser;
    try {
        browser = await require('playwright')[engine].launch({ ...launchOptions(engine), headless: true });
        report.browserVersion = browser.version();
        const page = await browser.newPage({ viewport: { width: 480, height: 360 }, deviceScaleFactor: 1 });
        page.on('pageerror', (error) => report.pageErrors.push(String(error)));
        page.on('console', (message) => {
            if (message.type() === 'error' && !message.text().includes('[Physics] PhysicsSystem initDefaultMaterial()'))
                report.runtimeErrors.push(message.text());
        });
        await page.route('**' + fixture + '**', (route) => {
            const name = new URL(route.request().url()).pathname.slice(fixture.length);
            if (name.endsWith('/tiles.tsx'))
                return route.fulfill({
                    contentType: 'application/xml',
                    body: name.startsWith('bad/') ? malformed : tsx,
                });
            if (name.endsWith('/tiles.png'))
                return route.fulfill({ contentType: 'image/png', body: Buffer.from(png, 'base64') });
            if (name === 'animated/map.tmx')
                return route.fulfill({ contentType: 'application/xml', body: tmx('1', 1) });
            if (name === 'static/map.tmx') return route.fulfill({ contentType: 'application/xml', body: tmx('4', 1) });
            if (name === 'bad/map.tmx') return route.fulfill({ contentType: 'application/xml', body: tmx('6,7', 2) });
            return route.fulfill({ status: 404 });
        });
        await page.goto(server.origin + '/examples/tiledmap-basic/');
        await page.waitForFunction(() => typeof window.__probe === 'function');
        await page.evaluate(async (url) => {
            const { AssetBank, Node, TiledMap, UITransform, createStepClock, director, loadTiledMap } =
                await import('/build/cocosair.module.js');
            const scene = director.getScene();
            const parent = scene.getChildByName('Canvas');
            for (const child of parent.children) {
                if (child.name !== 'UICamera') child.active = false;
            }
            const clock = createStepClock();
            clock.begin();
            const bank = new AssetBank();
            const maps = {};
            window.__tileClockCheck = {
                mount: async (key, x) => {
                    const handle = await loadTiledMap(new URL(key + '/map.tmx', url).href, { bank });
                    const node = new Node(key);
                    node.layer = parent.layer;
                    node.addComponent(UITransform);
                    node.setPosition(x, 0, 0);
                    parent.addChild(node);
                    const map = node.addComponent(TiledMap);
                    map.enableCulling = false;
                    map.tmxAsset = handle.asset;
                    maps[key] = { handle, node, layer: map.getLayer('floor') };
                },
                remove: async (key) => {
                    const { handle, node } = maps[key];
                    node.removeFromParent();
                    node.destroy();
                    await clock.step(0);
                    handle.dispose();
                    delete maps[key];
                },
                step: async (parts) => {
                    for (const dt of parts) await clock.step(dt);
                },
                editStatic: () => maps.static.layer.setTileGIDAt(5, 0, 0),
                moveStatic: () => maps.static.node.setPosition(76, 0, 0),
                camera: () =>
                    Array.from(['x', 'y', 'z'], (axis) => parent.getChildByName('UICamera').worldPosition[axis]),
                finish: () => {
                    clock.end();
                    return bank.size;
                },
            };
        }, server.origin + fixture);

        async function capture(name, parts) {
            await page.evaluate((dts) => window.__tileClockCheck.step(dts), parts);
            const screenshot = await page.screenshot();
            const pixels = await page.evaluate(
                async ({ data, markers }) => {
                    const image = new Image();
                    image.src = 'data:image/png;base64,' + data;
                    await image.decode();
                    const canvas = document.createElement('canvas');
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(image, 0, 0);
                    const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                    const counts = markers.map(() => 0);
                    const left = markers.map(() => canvas.width);
                    for (let n = 0; n < bytes.length; n += 4) {
                        const index = markers.findIndex((rgb) => rgb.every((c, k) => Math.abs(bytes[n + k] - c) < 4));
                        if (index < 0) continue;
                        counts[index]++;
                        left[index] = Math.min(left[index], (n / 4) % canvas.width);
                    }
                    return { counts, left: left.map((x) => (x === canvas.width ? null : x)) };
                },
                { data: screenshot.toString('base64'), markers: colors },
            );
            report.stages[name] = { ...pixels, screenshotSha256: sha(screenshot) };
            return pixels;
        }

        const camera = await page.evaluate(() => window.__tileClockCheck.camera());
        await page.evaluate(() => window.__tileClockCheck.mount('static', 44));
        const timings = [
            ['initial', [0], 0],
            ['just-before', [0.1249], 0],
            ['first-boundary', [0.125], 1],
            ['second-boundary', [0.375], 2],
            ['hitch', [0.5], 2],
            ['split', [0.125, 0.125, 0.25], 2],
            ['exact-wrap', [0.75], 0],
            ['long-hitch', [75000.5], 2],
        ];
        for (const [name, parts] of timings) {
            await page.evaluate(() => window.__tileClockCheck.mount('animated', -44));
            await capture(name, parts);
            if (name === 'hitch' || name === 'split') await capture(name + '-followup', [0.25]);
            await page.evaluate(() => window.__tileClockCheck.remove('animated'));
        }
        await page.evaluate(() => window.__tileClockCheck.editStatic());
        const edit = await capture('static-edit', [0]);
        await page.evaluate(() => window.__tileClockCheck.moveStatic());
        const moved = await capture('static-transform', [0]);
        assert.deepEqual(await page.evaluate(() => window.__tileClockCheck.camera()), camera);
        assert(edit.counts[3] === 0 && edit.counts[4] >= 140, 'stationary static edit must render');
        assert(
            moved.counts[4] === edit.counts[4] && moved.left[4] - edit.left[4] === 32,
            'transform must move the static pixels',
        );
        function frame(name, expected) {
            const { counts } = report.stages[name];
            assert(
                counts[expected] >= 140 && counts.slice(0, 3).filter(Boolean).length === 1,
                name + ' expected frame ' + expected + ', observed ' + counts.slice(0, 3),
            );
        }
        for (const [name, , expected] of timings) frame(name, expected);
        frame('hitch-followup', 0);
        frame('split-followup', 0);
        assert.equal(report.stages.hitch.screenshotSha256, report.stages.split.screenshotSha256);
        assert.equal(
            report.stages['hitch-followup'].screenshotSha256,
            report.stages['split-followup'].screenshotSha256,
        );
        await page.evaluate(() => window.__tileClockCheck.mount('bad', -44));
        const bad = await capture('bad-static-fallback', [0, 1, 4]);
        assert(bad.counts[5] >= 140 && bad.counts[6] >= 140 && bad.counts.slice(0, 3).every((n) => n === 0));
        report.remainingBankEntries = await page.evaluate(async () => {
            await window.__tileClockCheck.remove('bad');
            await window.__tileClockCheck.remove('static');
            return window.__tileClockCheck.finish();
        });
        assert.equal(report.remainingBankEntries, 0);
        assert.deepEqual(report.pageErrors, []);
        assert.deepEqual(report.runtimeErrors, []);
        for (const name of files)
            assert.equal(sha(fs.readFileSync(path.join(root, name))), fingerprints[name], 'source drift: ' + name);
        report.status = 'PASS';
    } catch (error) {
        report.error = String(error.message || error);
        process.exitCode = 1;
    } finally {
        try {
            await browser?.close();
        } catch (error) {
            report.status = 'FAIL';
            report.browserCloseError = String(error);
            process.exitCode = 1;
        }
        await server.close();
        fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
