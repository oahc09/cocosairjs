const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { once } = require('node:events');
const { launchOptions } = require('./browser-engines.cjs');

const root = path.resolve(__dirname, '../..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const files = [
    'src/air/bone2d/project.ts',
    'src/air/bone2d/player.ts',
    'build/cocosair.module.js',
    'test/fixtures/bone2d/clawbot.bone2d',
    'tools/verify/air-bone2d-browser.cjs',
];
async function main() {
    const [engine, output, ...extra] = process.argv.slice(2);
    assert(
        ['chromium', 'firefox', 'webkit'].includes(engine) && output && !extra.length,
        'usage: <engine> <fresh report.json>',
    );
    assert(!fs.existsSync(output), 'choose a fresh report path');
    const runtime = fs.readFileSync(path.join(root, files[2]));
    const nativeFile = fs.readFileSync(path.join(root, files[3]));
    const report = {
        status: 'FAIL',
        engine,
        scope: 'Rigid Bone-2D native project, AIR WebGL2 UI sprites, pixel and lifecycle checks',
        fingerprints: Object.fromEntries(files.map((file) => [file, sha(fs.readFileSync(path.join(root, file)))])),
        pageErrors: [],
        snapshots: {},
    };
    const server = http.createServer((req, res) => {
        if (req.url === '/runtime.js') {
            res.setHeader('Content-Type', 'text/javascript');
            return res.end(runtime);
        }
        if (req.url === '/clawbot.bone2d') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(nativeFile);
        }
        if (req.url === '/') {
            res.setHeader('Content-Type', 'text/html');
            return res.end(
                '<!doctype html><meta charset=utf-8><style>html,body,#game{margin:0;width:100%;height:100%;display:block}</style><canvas id=game></canvas>',
            );
        }
        res.writeHead(404).end();
    });
    let browser;
    try {
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        browser = await require('playwright')[engine].launch({ ...launchOptions(engine), headless: true });
        report.browser = browser.version();
        const page = await browser.newPage({ viewport: { width: 320, height: 240 }, deviceScaleFactor: 1 });
        page.on('pageerror', (e) => report.pageErrors.push(String(e)));
        await page.goto('http://127.0.0.1:' + server.address().port);
        report.initial = await page.evaluate(async () => {
            const air = await import('/runtime.js');
            const app = await air.createAirApp({ canvas: '#game', pixelRatioCap: 1 });
            const text = await (await fetch('/clawbot.bone2d')).text();
            const scene = new air.Scene('Bone2D Verification');
            const parent = air.createUICanvas(scene, 'Canvas', { designWidth: 320, designHeight: 240 });
            app.run(scene);
            const clock = air.createStepClock();
            clock.begin();
            await clock.step(0);
            let player = await air.createAirBone2dPlayer(parent, text);
            function leaves(node) {
                const sprite = node.getComponent(air.Sprite);
                return sprite ? [sprite] : node.children.flatMap(leaves);
            }
            const captured = leaves(player.node).map((sprite) => sprite.spriteFrame.texture);
            const frame = async (stage) => {
                let events = [];
                if (stage === 'idle') {
                    player.play('idle', true);
                    player.advance(0.5);
                }
                if (stage === 'attack-start') {
                    player.play('attack');
                    events = player.advance(0.25);
                }
                if (stage === 'attack-hitch') events = player.advance(0.375);
                if (stage === 'pause') {
                    player.pause();
                    events = player.advance(0.125);
                }
                if (stage === 'seek') {
                    player.seek(0.9);
                    player.resume();
                }
                if (stage === 'finish') events = player.advance(0.25);
                if (stage === 'loop') {
                    player.play('attack', true);
                    events = player.advance(2.125);
                }
                if (stage === 'dispose') player.dispose();
                await clock.step(0);
                const leaf = player.node.isValid
                    ? leaves(player.node).find((sprite) => sprite.node.parent?.name === 'arm-bone')?.node
                    : null;
                const m = leaf?.worldMatrix;
                return {
                    ids: events.map((e) => e.id),
                    playing: player.playing,
                    time: player.time,
                    matrix: m ? [m.m00, m.m01, m.m04, m.m05, m.m12, m.m13] : null,
                    order: player.node.isValid ? player.node.children.map((node) => node.name) : [],
                    textures: captured.map((t) => !!t.getGFXTexture()),
                    mounts: parent.children.filter((node) => node.name === 'Bone2D').length,
                };
            };
            let atlasState;
            const atlasMount = async () => {
                const project = JSON.parse(text);
                const page = document.createElement('canvas');
                page.width = 24;
                page.height = 16;
                const ctx = page.getContext('2d');
                const img = new Image();
                img.src = project.images.body;
                await img.decode();
                ctx.drawImage(img, 1, 1, 14, 14, 0, 0, 14, 14);
                img.src = project.images.arm;
                await img.decode();
                ctx.save();
                ctx.translate(16, 8);
                ctx.rotate(-Math.PI / 2);
                ctx.drawImage(img, 0, 0);
                ctx.restore();
                const source = new air.ImageAsset();
                source.reset(page);
                const tex = new air.Texture2D();
                tex.image = source;
                tex.setFilters(air.Texture2D.Filter.NEAREST, air.Texture2D.Filter.NEAREST);
                const atlas = air.createAtlasHandle(
                    air.parseAtlasText(
                        [
                            'fixture.png',
                            'size: 24,16',
                            'filter: Nearest,Nearest',
                            'pma: false',
                            'body',
                            'bounds: 0,0,14,14',
                            'offsets: 1,1,16,16',
                            'arm',
                            'bounds: 16,0,8,8',
                            'rotate: 90',
                        ].join('\n'),
                    ),
                    [tex],
                );
                const candidate = await air.createAirBone2dPlayer(parent, text, { atlas });
                let guarded = false;
                try {
                    atlas.dispose();
                } catch (e) {
                    guarded = e.code === 'AIR_E_ATLAS_IN_USE';
                }
                await clock.step(0);
                atlasState = { atlas, candidate, source, tex };
                return {
                    guarded,
                    rotated: atlas.getFrame('arm').rotated,
                    original: atlas.getFrame('body').originalSize.width,
                };
            };
            const atlasRelease = async () => {
                const { atlas, candidate, source, tex } = atlasState;
                candidate.dispose();
                await clock.step(0);
                const borrowedStillLive = !!tex.getGFXTexture();
                atlas.dispose();
                source.destroy();
                await clock.step(0);
                return {
                    borrowedStillLive,
                    atlasDisposed: atlas.disposed,
                    mounts: parent.children.filter((node) => node.name === 'Bone2D').length,
                };
            };
            const negative = async () => {
                const data = JSON.parse(text);
                data.images.arm = 'https://invalid.example/image.png';
                let invalid, aborted;
                try {
                    await air.createAirBone2dPlayer(parent, JSON.stringify(data));
                } catch (e) {
                    invalid = e.message;
                }
                const stop = new AbortController();
                stop.abort();
                try {
                    await air.createAirBone2dPlayer(parent, text, { signal: stop.signal });
                } catch (e) {
                    aborted = e.message;
                }
                const wrapper = new air.Node('Bone2D independent owner');
                parent.addChild(wrapper);
                const instance = await air.createAirBone2dPlayer(wrapper, text);
                const autoTexture = leaves(instance.node)[0].spriteFrame.texture;
                wrapper.destroy();
                await clock.step(0);
                return {
                    invalid,
                    aborted,
                    autoReleased: !autoTexture.getGFXTexture(),
                    mounts: parent.children.filter((node) => node.name === 'Bone2D').length,
                };
            };
            let wardrobe;
            const skinsMount = async () => {
                const value = JSON.parse(text),
                    model = value.project;
                const rig = model.skeleton;
                const arm = rig.skins[0].attachments['arm-slot'].arm;
                rig.skins.push(
                    {
                        id: 'red',
                        name: 'Red glove',
                        bones: [],
                        constraints: [],
                        attachments: { 'arm-slot': { arm: { ...arm, path: 'body' } } },
                    },
                    {
                        id: 'cyan',
                        name: 'Cyan glove',
                        bones: [],
                        constraints: [],
                        attachments: { 'arm-slot': { arm } },
                    },
                );
                model.others = [
                    { ...rig, name: 'Alternate skeleton', animations: [{ ...rig.animations[0], id: 'alt-idle' }] },
                ];
                model.activeAt = 1;
                wardrobe = await air.createAirBone2dPlayer(parent, JSON.stringify(value), { skeletonIndex: 0 });
                wardrobe.play('alt-idle', true);
                wardrobe.advance(0.125);
                await clock.step(0);
                return {
                    rigs: wardrobe.skeletonNames,
                    index: wardrobe.skeletonIndex,
                    skins: wardrobe.skins.map((s) => s.id),
                };
            };
            const skinsChange = async (ids) => {
                let invalid;
                try {
                    wardrobe.setSkins(ids);
                } catch (e) {
                    invalid = e.message;
                }
                await clock.step(0);
                return { time: wardrobe.time, invalid };
            };
            window.bone2dTest = {
                frame,
                negative,
                skinsMount,
                skinsChange,
                atlasMount,
                atlasRelease,
                close: async () => {
                    player.dispose();
                    wardrobe?.dispose();
                    clock.end();
                    await app.close();
                },
            };
            return {
                gl2: air.director.root.device.gl instanceof WebGL2RenderingContext,
                available: player.animations.map((a) => a.id),
            };
        });
        assert.deepEqual(report.initial, { gl2: true, available: ['idle', 'attack'] });
        for (const stage of ['idle', 'attack-start', 'attack-hitch', 'pause', 'seek', 'finish', 'loop', 'dispose']) {
            const state = await page.evaluate((name) => window.bone2dTest.frame(name), stage);
            const screenshot = await page.screenshot();
            const pixels = await page.evaluate(async (data) => {
                const img = new Image();
                img.src = 'data:image/png;base64,' + data;
                await img.decode();
                const c = document.createElement('canvas');
                c.width = img.width;
                c.height = img.height;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0);
                const d = ctx.getImageData(0, 0, c.width, c.height).data;
                const colors = [
                    [255, 49, 47],
                    [15, 228, 238],
                ];
                const counts = [0, 0],
                    bounds = [null, null];
                let center = null;
                for (let i = 0; i < d.length; i += 4) {
                    const x = (i / 4) % c.width,
                        y = Math.floor(i / 4 / c.width);
                    const hit = colors.findIndex((rgb) => rgb.every((v, ch) => Math.abs(v - d[i + ch]) < 4));
                    if (x === c.width / 2 && y === c.height / 2) center = hit;
                    if (hit < 0) continue;
                    counts[hit]++;
                    if (!bounds[hit]) bounds[hit] = [x, y, x, y];
                    else {
                        const b = bounds[hit];
                        b[0] = Math.min(b[0], x);
                        b[1] = Math.min(b[1], y);
                        b[2] = Math.max(b[2], x);
                        b[3] = Math.max(b[3], y);
                    }
                }
                return { counts, bounds, center };
            }, screenshot.toString('base64'));
            report.snapshots[stage] = { ...state, pixels, screenshotSha256: sha(screenshot) };
        }
        const s = report.snapshots;
        assert.ok(
            s.idle.pixels.counts.every((n) => n > 100),
            JSON.stringify(s.idle),
        );
        assert.equal(s['attack-start'].pixels.center, 1);
        assert.equal(s['attack-hitch'].pixels.center, 0);
        assert.ok(s['attack-hitch'].pixels.bounds[1][2] > s['attack-start'].pixels.bounds[1][2]);
        assert.deepEqual(s['attack-hitch'].order, ['arm-slot', 'body-slot']);
        const m = s['attack-hitch'].matrix;
        assert.ok(Math.abs(m[0] * m[2] + m[1] * m[3] + 0.625) < 1e-5, JSON.stringify(m)); // composed affine isn't orthogonal
        assert.equal(s.pause.screenshotSha256, s['attack-hitch'].screenshotSha256);
        assert.deepEqual(s['attack-start'].ids, ['ev-start']);
        assert.deepEqual(s['attack-hitch'].ids, ['ev-impact']);
        assert.deepEqual(s.pause.ids, []);
        assert.deepEqual(s.seek.ids, []);
        assert.equal(s.seek.pixels.counts[1], 0);
        assert.deepEqual(s.finish.ids, ['ev-end']);
        assert.equal(s.finish.playing, false);
        assert.deepEqual(s.loop.ids, [
            'ev-start',
            'ev-impact',
            'ev-end',
            'ev-start',
            'ev-impact',
            'ev-end',
            'ev-start',
        ]);
        assert.equal(s.loop.time, 0.125);
        assert.deepEqual(s.dispose.pixels.counts, [0, 0]);
        assert.deepEqual(s.dispose.textures, [false, false]);
        assert.equal(s.dispose.mounts, 0);
        report.negatives = await page.evaluate(() => window.bone2dTest.negative());
        assert.match(report.negatives.invalid, /expected embedded PNG/);
        assert.equal(report.negatives.aborted, 'AIR_E_BONE2D_ABORTED');
        assert.equal(report.negatives.mounts, 0);
        assert.equal(report.negatives.autoReleased, true);
        report.atlas = await page.evaluate(() => window.bone2dTest.atlasMount());
        assert.deepEqual(report.atlas, { guarded: true, rotated: true, original: 16 });
        report.atlas.screenshotSha256 = sha(await page.screenshot());
        assert.equal(
            report.atlas.screenshotSha256,
            s['attack-start'].screenshotSha256,
            'trimmed body and asymmetric rotated arm must match the embedded setup pixels',
        );
        report.atlas.release = await page.evaluate(() => window.bone2dTest.atlasRelease());
        assert.deepEqual(report.atlas.release, { borrowedStillLive: true, atlasDisposed: true, mounts: 0 });
        report.wardrobe = await page.evaluate(() => window.bone2dTest.skinsMount());
        assert.deepEqual(report.wardrobe, {
            rigs: ['Alternate skeleton', 'Clawbot'],
            index: 0,
            skins: ['skin', 'red', 'cyan'],
        });
        const baseSkin = sha(await page.screenshot());
        const red = await page.evaluate(() => window.bone2dTest.skinsChange(['red']));
        assert.equal(red.time, 0.125);
        assert.equal(red.invalid, undefined);
        const redSkin = sha(await page.screenshot());
        assert.notEqual(redSkin, baseSkin);
        const invalidSkin = await page.evaluate(() => window.bone2dTest.skinsChange(['invalid']));
        assert.match(invalidSkin.invalid, /unknown skin/);
        assert.equal(sha(await page.screenshot()), redSkin, 'invalid skin must leave the existing display unchanged');
        await page.evaluate(() => window.bone2dTest.skinsChange(['red', 'cyan']));
        assert.equal(sha(await page.screenshot()), baseSkin, 'last overlay wins, preserving default body');
        await page.evaluate(() => window.bone2dTest.skinsChange(['cyan', 'red']));
        assert.equal(sha(await page.screenshot()), redSkin);
        await page.evaluate(() => window.bone2dTest.skinsChange([]));
        assert.equal(sha(await page.screenshot()), baseSkin);
        report.wardrobe.screenshots = { base: baseSkin, red: redSkin };
        await page.evaluate(() => window.bone2dTest.close());
        assert.deepEqual(report.pageErrors, []);
        report.status = 'PASS';
    } catch (e) {
        report.error = String(e.stack || e);
        throw e;
    } finally {
        try {
            if (browser) await browser.close();
        } finally {
            server.close();
            fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        }
    }
}
main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
});
