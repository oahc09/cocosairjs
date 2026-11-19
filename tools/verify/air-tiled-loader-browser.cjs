const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');

const root = path.resolve(__dirname, '../..');
const fixture = '/__tiled_loader_fixture/';
const tmx =
    '<map version="1.4" orientation="orthogonal" width="2" height="1" tilewidth="16" tileheight="16">' +
    '<tileset firstgid="1" source="a/tiles.tsx"/><tileset firstgid="2" source="b/tiles.tsx"/>' +
    '<layer name="floor" width="2" height="1"><data encoding="csv">1,2</data></layer></map>';
const tsx =
    '<tileset version="1.4" name="tiles" tilewidth="16" tileheight="16" tilecount="1" columns="1">' +
    '<image source="tiles.png" width="16" height="16"/></tileset>';
// Solid 16×16 RGB test textures, authored for this fixture.
const red =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGN8La/KQApgIkn1qIZRDUNKAwDSlQFPNCACzAAAAABJRU5ErkJggg==';
const green =
    'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAAGUlEQVR4nGNUeKTGQApgIkn1qIZRDUNKAwC8ZwFIFrxXBQAAAABJRU5ErkJggg==';
const routes = {
    'map.tmx': ['application/xml', tmx],
    'a/tiles.tsx': ['application/xml', tsx],
    'b/tiles.tsx': ['application/xml', tsx],
    'a/tiles.png': ['image/png', Buffer.from(red, 'base64')],
    'b/tiles.png': ['image/png', Buffer.from(green, 'base64')],
};
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function main() {
    const [engine, dest, ...extra] = process.argv.slice(2);
    assert(
        ['chromium', 'firefox', 'webkit'].includes(engine) && dest && !extra.length,
        'usage: <engine> <new report.json>',
    );
    const output = path.resolve(dest);
    const shotDir = output + '.screens';
    assert(!fs.existsSync(output) && !fs.existsSync(shotDir), 'choose fresh report path');
    fs.mkdirSync(shotDir, { recursive: true });

    const files = [
        'src/air/assets/tiled-loader.ts',
        'src/air/index.ts',
        'src/cocos/tiledmap/tmx-xml-parser.ts',
        'build/cocosair.module.js',
        'tools/verify/air-tiled-loader-browser.cjs',
    ];
    const fingerprints = Object.fromEntries(files.map((name) => [name, sha(fs.readFileSync(path.join(root, name)))]));
    const server = await startExampleServer(root);
    const report = {
        scope: 'same-basename TSX, concurrent leases and repeated native Tiled rendering',
        engine,
        fingerprints,
        status: 'FAIL',
        requests: [],
        pageErrors: [],
        runtimeErrors: [],
        stages: {},
    };
    let browser;
    try {
        const playwright = require('playwright');
        browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
        report.browserVersion = browser.version();
        const page = await browser.newPage({ viewport: { width: 480, height: 360 } });
        page.on('pageerror', (error) => report.pageErrors.push(String(error)));
        page.on('console', (message) => {
            if (
                message.type() === 'error' &&
                !message.text().includes('[Physics] PhysicsSystem initDefaultMaterial()')
            ) {
                report.runtimeErrors.push(message.text());
            }
        });
        await page.route('**' + fixture + '**', async (route) => {
            const name = new URL(route.request().url()).pathname.slice(fixture.length);
            report.requests.push(name);
            if (!Object.hasOwn(routes, name)) return route.fulfill({ status: 404 });
            const [contentType, body] = routes[name];
            return route.fulfill({ contentType, body });
        });
        await page.goto(server.origin + '/examples/tiledmap-basic/');
        await page.waitForFunction(() => typeof window.__probe === 'function');
        await page.evaluate(
            async (fixtureURL) => {
                const { AssetBank, Node, TiledMap, UITransform, createStepClock, director, loadTiledMap } =
                    await import('/build/cocosair.module.js');
                const scene = director.getScene();
                for (const map of scene.getComponentsInChildren(TiledMap)) map.node.active = false;
                const parent = scene.getChildByName('Canvas');
                const bank = new AssetBank();
                const clock = createStepClock();
                clock.begin();
                const maps = {};
                async function acquire(key, height) {
                    const handle = await loadTiledMap(fixtureURL, { bank });
                    const node = new Node('Loader map ' + key);
                    node.layer = parent.layer;
                    node.addComponent(UITransform);
                    node.setPosition(0, height, 0);
                    parent.addChild(node);
                    const map = node.addComponent(TiledMap);
                    map.enableCulling = false;
                    map.tmxAsset = handle.asset;
                    maps[key] = { handle, node };
                    return [map.getLayer('floor').getTileGIDAt(0, 0), map.getLayer('floor').getTileGIDAt(1, 0)];
                }
                async function release(key) {
                    const { node, handle } = maps[key];
                    node.removeFromParent();
                    node.destroy();
                    await clock.step();
                    handle.dispose();
                    delete maps[key];
                }
                window.__tiledLoaderCheck = {
                    acquire,
                    release,
                    refs: () =>
                        ['a', 'b'].map((name) => bank.refCount(new URL(name + '/tiles.png', fixtureURL).href, 'png')),
                    step: () => clock.step(),
                    close: async () => {
                        for (const key of Object.keys(maps)) await release(key);
                        const entries = bank.size;
                        clock.end();
                        return entries;
                    },
                };
            },
            server.origin + fixture + 'map.tmx',
        );

        async function screen(stage) {
            const screenshot = await page.screenshot({ path: path.join(shotDir, stage + '.png') });
            const counts = await page.evaluate(async (data) => {
                const image = new Image();
                image.src = 'data:image/png;base64,' + data;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                const counts = [
                    [0, 0],
                    [0, 0],
                ];
                const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
                for (let n = 0; n < pixels.length; n += 4) {
                    const half = Math.floor(n / 4 / canvas.width) >= canvas.height / 2 ? 1 : 0;
                    if (pixels[n] > 170 && pixels[n + 1] < 85 && pixels[n + 2] < 85) counts[half][0]++;
                    if (pixels[n] < 85 && pixels[n + 1] > 170 && pixels[n + 2] < 85) counts[half][1]++;
                }
                return counts;
            }, screenshot.toString('base64'));
            report.stages[stage] = { counts, screenshotSha256: sha(screenshot) };
            return counts;
        }

        assert.deepEqual(
            await page.evaluate(async () => {
                const api = window.__tiledLoaderCheck;
                const gids = await Promise.all([api.acquire('top', 48), api.acquire('bottom', -48)]);
                await api.step();
                await api.step();
                return { gids, refs: api.refs() };
            }),
            {
                gids: [
                    [1, 2],
                    [1, 2],
                ],
                refs: [2, 2],
            },
        );
        assert.deepEqual(
            report.requests.slice().sort(),
            Object.keys(routes).sort(),
            'concurrent loads must share each fetch',
        );
        const both = await screen('two-maps');
        assert(
            both.every((half) => half.every((color) => color >= 140)),
            'both colors must render in both maps',
        );
        assert.deepEqual(
            await page.evaluate(async () => {
                const api = window.__tiledLoaderCheck;
                await api.release('top');
                await api.step();
                return api.refs();
            }),
            [1, 1],
        );
        assert.deepEqual(
            await screen('released-first'),
            [[0, 0], both[1]],
            'the remaining map must retain both textures',
        );
        assert.deepEqual(
            await page.evaluate(async () => {
                const api = window.__tiledLoaderCheck;
                await api.acquire('replacement', 48);
                await api.step();
                return api.refs();
            }),
            [2, 2],
        );
        assert.deepEqual(await screen('loaded-again'), both);
        assert.equal(await page.evaluate(() => window.__tiledLoaderCheck.close()), 0);
        assert.deepEqual(await screen('released-all'), [
            [0, 0],
            [0, 0],
        ]);
        assert.deepEqual(report.pageErrors, []);
        assert.deepEqual(report.runtimeErrors, []);
        for (const file of files)
            assert.equal(sha(fs.readFileSync(path.join(root, file))), fingerprints[file], 'source drift: ' + file);
        report.status = 'PASS';
    } catch (error) {
        report.error = String(error.stack || error);
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
        console.log(JSON.stringify(report, null, 2));
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
