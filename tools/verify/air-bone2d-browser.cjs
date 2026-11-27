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
    'src/air/bone2d/polygon.ts',
    'src/air/bone2d/two-color.ts',
    'src/air/bone2d/affine.ts',
    'src/air/bone2d/ik.ts',
    'test/fixtures/bone2d/ordered-ik.bone2d',
    'test/fixtures/bone2d/two-bone-ik.bone2d',
    'test/fixtures/bone2d/transform.bone2d',
    'test/fixtures/bone2d/slider.bone2d',
    'test/fixtures/bone2d/path-follow.bone2d',
    'src/air/bone2d/path.ts',
    'src/air/bone2d/physics.ts',
    'src/air/bone2d/playback.ts',
    'src/air/bone2d/image.ts',
    'test/fixtures/bone2d/web-game.json',
    'test/fixtures/bone2d/raster-formats.json',
    'test/fixtures/bone2d/playback.bone2d',
    'test/fixtures/bone2d/physics.bone2d',
    'src/air/bone2d/transform.ts',
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
        scope: 'Bone-2D native project: AIR WebGL2 sprites, meshes, sequences, pixels and lifecycle',
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
        if (req.url === '/ordered-ik.bone2d') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(fs.readFileSync(path.join(root, 'test/fixtures/bone2d/ordered-ik.bone2d')));
        }
        if (req.url === '/two-bone-ik.bone2d') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(fs.readFileSync(path.join(root, 'test/fixtures/bone2d/two-bone-ik.bone2d')));
        }
        if (req.url === '/transform.bone2d') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(fs.readFileSync(path.join(root, 'test/fixtures/bone2d/transform.bone2d')));
        }
        if (req.url === '/slider.bone2d') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(fs.readFileSync(path.join(root, 'test/fixtures/bone2d/slider.bone2d')));
        }
        if (req.url === '/path-follow.bone2d') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(fs.readFileSync(path.join(root, 'test/fixtures/bone2d/path-follow.bone2d')));
        }
        if (req.url === '/playback.bone2d') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(fs.readFileSync(path.join(root, 'test/fixtures/bone2d/playback.bone2d')));
        }
        if (req.url === '/physics.bone2d') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(fs.readFileSync(path.join(root, 'test/fixtures/bone2d/physics.bone2d')));
        }
        if (req.url === '/web-game.json' || req.url === '/raster-formats.json') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(fs.readFileSync(path.join(root, 'test/fixtures/bone2d', req.url.slice(1))));
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
            let atlasState, affineAtlasControl;
            const advancedAtlasFixture = (file) => {
                const bones = file.project.skeleton.bones;
                Object.assign(
                    bones.find((b) => b.id === 'arm-bone'),
                    { inherit: 'noScaleOrReflection', shearX: 18, shearY: -12 },
                );
                Object.assign(
                    bones.find((b) => b.id === 'root'),
                    { scaleX: -1.5, rotation: 18 },
                );
                return file;
            };
            const atlasMount = async (advanced = false) => {
                const project = JSON.parse(text);
                if (advanced) advancedAtlasFixture(project);
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
                const candidate = await air.createAirBone2dPlayer(parent, JSON.stringify(project), { atlas });
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
            const wardrobeClose = async () => {
                wardrobe.dispose();
                await clock.step(0);
            };
            let folderPlayer;
            const folderMount = async () => {
                const fixture = JSON.parse(text),
                    rig = fixture.project.skeleton,
                    clip = rig.animations[1];
                rig.drawOrderFolders = [{ id: 'fx', name: 'Effects', slots: ['body-slot', 'arm-slot'] }];
                clip.drawOrder = [];
                clip.drawOrderFolder = { fx: [{ time: 0.5, order: ['arm-slot'] }] };
                folderPlayer = await air.createAirBone2dPlayer(parent, JSON.stringify(fixture));
                folderPlayer.play('attack');
                folderPlayer.advance(0.625);
                await clock.step(0);
                return folderPlayer.node.children.map((node) => node.name);
            };
            const folderClose = async () => {
                folderPlayer.dispose();
                await clock.step(0);
            };
            let meshInstance, meshView, meshTexture;
            const setMesh = async ({ weighted, linked }) => {
                const fixture = JSON.parse(text),
                    rig = fixture.project.skeleton;
                const points = [
                    [0, 0],
                    [16, 0],
                    [0, 16],
                ];
                rig.slots[0].attachment = null;
                rig.skins[0].attachments['arm-slot'].arm = {
                    type: 'mesh',
                    name: 'arm',
                    path: 'arm',
                    color: [1, 1, 1, 1],
                    width: 8,
                    height: 8,
                    uvs: [0, 1, 1, 1, 0, 0],
                    triangles: [0, 1, 2],
                    hull: 3,
                    edges: [],
                    vertices: weighted ? [] : points.flat(),
                    weights: weighted
                        ? points.map(([x, y]) => [
                              ['root', x, y, 0.25],
                              ['arm-bone', x - 6, y, 0.75],
                          ])
                        : null,
                };
                if (linked) {
                    rig.skins.push({
                        id: 'linked',
                        name: 'Linked glove',
                        bones: [],
                        constraints: [],
                        attachments: {
                            'arm-slot': {
                                arm: {
                                    ...rig.skins[0].attachments['arm-slot'].arm,
                                    path: 'body',
                                    link: { source: 'arm', slot: null, skin: null, deform: true },
                                },
                            },
                        },
                    });
                }
                const clip = rig.animations[1];
                delete clip.bones['arm-bone'].rotate;
                const n = weighted ? 12 : 6,
                    delta = Array(n).fill(0);
                delta[n - 1] = 8;
                clip.deform.skin = {
                    'arm-slot': {
                        arm: [
                            { time: 0, value: Array(n).fill(0) },
                            { time: 0.5, value: delta },
                        ],
                    },
                };
                meshInstance = await air.createAirBone2dPlayer(parent, JSON.stringify(fixture));
                meshInstance.play('attack');
                if (linked) meshInstance.setSkins(['linked']);
                meshView = meshInstance.node
                    .getChildByName('arm-slot')
                    .getChildByName('Mesh')
                    .getComponent(air.AirUIMesh);
                meshTexture = meshView.spriteFrame.texture;
            };
            const meshStep = async (dt) => {
                const events = meshInstance.advance(dt).map((e) => e.id);
                await clock.step(0);
                return { positions: meshView.geometry.positions, frame: !!meshView.spriteFrame, events };
            };
            const meshClose = async () => {
                meshInstance.dispose();
                await clock.step(0);
                return !meshTexture.getGFXTexture();
            };
            let sequencePlayer, sequenceVisual;
            const sequenceTextures = new Set();
            const sequenceMount = async (asMesh) => {
                const value = JSON.parse(text),
                    rig = value.project.skeleton;
                const colorFrame = (name, color) => {
                    const canvas = document.createElement('canvas');
                    canvas.width = canvas.height = 16;
                    const context = canvas.getContext('2d');
                    context.fillStyle = 'rgb(' + color.join(',') + ')';
                    context.fillRect(0, 0, 16, 16);
                    context.fillStyle = '#fff';
                    context.fillRect(1, 1, 3, 5);
                    value.project.images.push({ name, width: 16, height: 16 });
                    value.images[name] = canvas.toDataURL();
                };
                [
                    [208, 20, 40],
                    [30, 160, 50],
                    [45, 70, 215],
                    [70, 125, 145],
                    [220, 145, 40],
                    [165, 35, 170],
                ].forEach((rgb, i) => colorFrame((i < 3 ? 'base' : 'overlay') + '00' + (7 + (i % 3)), rgb));
                const original = rig.skins[0].attachments['body-slot'].body;
                const sequence = { count: 3, start: 7, digits: 3, setupIndex: 1 };
                const base = { ...original, path: 'base', sequence };
                rig.slots[1].attachment = null;
                const clip = rig.animations[1];
                delete clip.slots['arm-slot'];
                if (asMesh) {
                    Object.assign(base, {
                        type: 'mesh',
                        vertices: [-8, -8, 8, -8, -8, 8],
                        weights: null,
                        uvs: [0, 1, 1, 1, 0, 0],
                        triangles: [0, 1, 2],
                    });
                    clip.deform.skin = {
                        'body-slot': {
                            body: [
                                { time: 0, value: [0, 0, 0, 0, 0, 0] },
                                { time: 0.5, value: [0, 0, 0, 0, 0, 5] },
                            ],
                        },
                    };
                }
                rig.skins[0].attachments['body-slot'].body = base;
                const overlay = { ...base, path: 'overlay' };
                if (asMesh) overlay.link = { source: 'body', slot: null, skin: null, deform: true };
                rig.skins.push({
                    id: 'overlay',
                    name: 'Overlay',
                    bones: [],
                    constraints: [],
                    attachments: { 'body-slot': { body: overlay } },
                });
                clip.sequence = {
                    skin: { 'body-slot': { body: [{ time: 0.25, index: 0, delay: 0.125, mode: 'pingpong' }] } },
                    overlay: { 'body-slot': { body: [{ time: 0.75, index: 0, delay: 0.125, mode: 'onceReverse' }] } },
                };
                sequencePlayer = await air.createAirBone2dPlayer(parent, JSON.stringify(value));
                sequencePlayer.play('attack');
                const body = sequencePlayer.node.getChildByName('body-slot');
                sequenceVisual = asMesh ? body.getChildByName('Mesh').getComponent(air.AirUIMesh) : leaves(body)[0];
            };
            const sequenceStep = async (step) => {
                if (step.seek !== undefined) sequencePlayer.seek(step.seek);
                if (step.skin !== undefined) sequencePlayer.setSkins(step.skin ? ['overlay'] : []);
                await clock.step(0);
                sequenceTextures.add(sequenceVisual.spriteFrame.texture);
                return { time: sequencePlayer.time, positions: sequenceVisual.geometry?.positions ?? null };
            };
            const sequenceClose = async () => {
                sequencePlayer.dispose();
                await clock.step(0);
                const released = [...sequenceTextures].every((t) => !t.getGFXTexture());
                sequenceTextures.clear();
                return released;
            };
            const shapes = async () => {
                const file = JSON.parse(text),
                    rig = file.project.skeleton;
                rig.slots[1].attachment = null;
                rig.skins[0].attachments['body-slot'].body = { type: 'point', x: 3, y: 4, rotation: 45 };
                const clip = rig.animations[1];
                delete clip.slots['arm-slot'];
                clip.slots['body-slot'] = { attachment: [{ time: 0.75, name: null }] };
                const overlay = (id, body) => ({
                    id,
                    name: id,
                    bones: [],
                    constraints: [],
                    attachments: { 'body-slot': { body } },
                });
                rig.skins.push(
                    overlay('bounds', {
                        type: 'boundingbox',
                        vertices: [],
                        weights: [[['root', 0, 0, 1]], [['root', 8, 0, 1]], [['root', 0, 8, 1]]],
                    }),
                    overlay('path', {
                        type: 'path',
                        vertices: [0, 0, 1, 0, 2, 3, 4, 3, 5, 0, 6, 0],
                        closed: false,
                        constantSpeed: true,
                    }),
                );
                clip.deform.bounds = { 'body-slot': { body: [{ time: 0.5, value: [0, 0, 0, 6, 0, 0] }] } };
                const player = await air.createAirBone2dPlayer(parent, JSON.stringify(file));
                const result = [];
                try {
                    player.play('attack');
                    player.seek(0.5);
                    result.push(player.getAttachmentGeometry('body-slot'));
                    player.setSkins(['bounds']);
                    result.push(player.getAttachmentGeometry('body-slot'));
                    player.setSkins(['bounds', 'path']);
                    result.push(player.getAttachmentGeometry('body-slot'));
                    await clock.step(0);
                    result.push(player.node.children.every((node) => !node.active));
                    player.seek(0.75);
                    result.push(player.getAttachmentGeometry('body-slot'));
                } finally {
                    player.dispose();
                    await clock.step(0);
                }
                return result;
            };
            let clipPlayer;
            const clipMount = async (deformClipping = false) => {
                const file = JSON.parse(text),
                    rig = file.project.skeleton,
                    clip = rig.animations[1];
                rig.bones.find((b) => b.id === 'arm-bone').x = 64;
                rig.slots.unshift({
                    id: 'clip-slot',
                    bone: 'root',
                    color: [1, 1, 1, 1],
                    dark: null,
                    attachment: 'clip',
                    blend: 'normal',
                });
                const mask = {
                    type: 'clipping',
                    vertices: [-40, -20, 0, -20, 0, 20, -40, 20],
                    convex: false,
                    inverse: false,
                    end: 'body-slot',
                    weights: null,
                };
                rig.skins[0].attachments['clip-slot'] = { clip: mask };
                rig.skins.push({
                    id: 'inverse',
                    name: 'Inverse',
                    bones: [],
                    constraints: [],
                    attachments: { 'clip-slot': { clip: { ...mask, inverse: true } } },
                });
                const points = [
                    [-40, -20],
                    [0, -20],
                    [0, -8],
                    [-32, -8],
                    [-32, 8],
                    [0, 8],
                    [0, 20],
                    [-40, 20],
                ];
                rig.skins.push({
                    id: 'dent',
                    name: 'Deformed concave mask',
                    bones: [],
                    constraints: [],
                    attachments: {
                        'clip-slot': {
                            clip: {
                                ...mask,
                                vertices: [],
                                weights: points.map(([x, y]) => [['root', x, y, 1]]),
                            },
                        },
                    },
                });
                const displacements = Array(16).fill(0);
                displacements[6] = displacements[8] = 22;
                clip.deform.dent = {
                    'clip-slot': {
                        clip: [
                            { time: 0, value: Array(16).fill(0) },
                            { time: 0.5, value: displacements },
                        ],
                    },
                };
                clip.bones = {};
                clip.drawOrder = [];
                clip.slots = { 'clip-slot': { attachment: [{ time: 0.75, name: null }] } };
                clipPlayer = await air.createAirBone2dPlayer(parent, JSON.stringify(file), { deformClipping });
                clipPlayer.play('attack');
            };
            const clipStep = async (stage) => {
                if (stage === 'inverse') clipPlayer.setSkins(['inverse']);
                if (stage === 'off') clipPlayer.seek(0.75);
                if (stage === 'dent') {
                    clipPlayer.seek(0);
                    clipPlayer.setSkins(['dent']);
                }
                if (stage === 'dent-deformed') clipPlayer.seek(0.5);
                if (stage === 'back') {
                    clipPlayer.seek(0);
                    clipPlayer.setSkins([]);
                }
                await clock.step(0);
                return clipPlayer.node.children.map((node) => [node.name, node.children.map((child) => child.name)]);
            };
            const clipClose = async () => {
                clipPlayer.dispose();
                await clock.step(0);
            };
            const blends = async (swap, tint = false) => {
                const camera = parent.getComponent(air.Canvas).cameraComponent;
                const saved = camera.clearColor.clone();
                const target = new air.RenderTexture();
                target.reset({ width: 320, height: 240 });
                camera.targetTexture = target;
                camera.clearColor = new air.Color(26, 51, 64, 64);
                const modes = ['normal', 'additive', 'multiply', 'screen'];
                const file = JSON.parse(text),
                    rig = file.project.skeleton,
                    skin = rig.skins[0];
                const drawing = document.createElement('canvas');
                drawing.width = drawing.height = 16;
                const ctx = drawing.getContext('2d');
                ctx.fillStyle = 'rgba(153,64,51,0.5)';
                ctx.fillRect(0, 0, 16, 16);
                file.images.body = drawing.toDataURL();
                const source = Array.from(ctx.getImageData(8, 8, 1, 1).data);
                const animatedLight = [0.75, 0.5, 0.25, 0.5];
                rig.slots = modes.map((blend, i) => ({
                    ...rig.slots[0],
                    id: blend,
                    blend,
                    dark: tint ? [i / 8, (3 - i) / 8, 0.125] : null,
                }));
                const tintClip = {
                    ...rig.animations[0],
                    id: 'mix-colors',
                    duration: 1,
                    bones: {},
                    drawOrder: [],
                    deform: {},
                    events: [],
                    slots: Object.fromEntries(
                        rig.slots.map(({ id, dark }, i) => [
                            id,
                            {
                                rgba: [{ time: 0, value: [0, 0, 0, 0] }],
                                rgba2: tint
                                    ? [
                                          { time: 0.25, value: [...animatedLight, ...dark] },
                                          {
                                              time: 0.75,
                                              value: [...animatedLight, dark[0] + 0.25, dark[1], (i + 1) / 8],
                                          },
                                      ]
                                    : [],
                            },
                        ]),
                    ),
                };
                rig.animations = tint ? [tintClip] : [];
                const setup = skin.attachments['body-slot'].body;
                skin.attachments = Object.fromEntries(
                    modes.map((mode, i) => {
                        const x = (i * 64 - 96) / 1.5;
                        const body =
                            i % 2 !== Number(swap)
                                ? {
                                      type: 'mesh',
                                      path: 'body',
                                      color: [1, 1, 1, 1],
                                      weights: null,
                                      vertices: [x - 12, -18, x + 12, -18, x + 12, 18, x - 12, 18],
                                      uvs: [0, 1, 1, 1, 1, 0, 0, 0],
                                      triangles: [0, 1, 2, 0, 2, 3],
                                  }
                                : { ...setup, x, width: 24, height: 36 };
                        return [mode, { body }];
                    }),
                );
                const read = (x) => Array.from(target.readPixels(x, 120, 1, 1));
                let player;
                try {
                    await clock.step(0);
                    const clear = read(160);
                    player = await air.createAirBone2dPlayer(parent, JSON.stringify(file));
                    await clock.step(0);
                    const capture = () => modes.map((_, i) => read(64 + i * 64));
                    const rgba = capture();
                    if (!tint) return { clear, source, rgba, gap: read(96) };
                    player.play('mix-colors');
                    player.seek(0.5);
                    await clock.step(0);
                    return { clear, source, rgba, animated: capture() };
                } finally {
                    player?.dispose();
                    camera.targetTexture = null;
                    camera.clearColor = saved;
                    target.destroy();
                    await clock.step(0);
                }
            };
            let affinePlayer;
            const affineMount = async (inherit) => {
                const file = JSON.parse(text),
                    rig = file.project.skeleton;
                const root = rig.bones.find((b) => b.id === 'root');
                const child = rig.bones.find((b) => b.id === 'arm-bone');
                Object.assign(root, { x: 10, y: 20, rotation: 30, scaleX: -2, scaleY: 1.5 });
                Object.assign(child, {
                    x: 3,
                    y: 4,
                    rotation: 40,
                    scaleX: 1.2,
                    scaleY: 0.8,
                    shearX: 4,
                    shearY: -12,
                    inherit,
                });
                rig.slots[0].attachment = null;
                const clip = rig.animations[1];
                clip.bones = {
                    'arm-bone': {
                        shear: [{ time: 0.5, value: [24, -3] }],
                        shearx: [{ time: 0.5, value: [6] }],
                    },
                };
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = 8;
                const ctx = canvas.getContext('2d');
                ['#ff3322', '#12ccee', '#44ee11', '#cc44ff'].forEach((color, i) => {
                    ctx.fillStyle = color;
                    ctx.fillRect(4 * (i % 2), 4 * Math.floor(i / 2), 4, 4);
                });
                file.images.arm = canvas.toDataURL();
                function overlay(id, arm) {
                    return { id, name: id, bones: [], constraints: [], attachments: { 'arm-slot': { arm } } };
                }
                rig.skins.push(
                    overlay('mesh', {
                        type: 'mesh',
                        path: 'arm',
                        weights: null,
                        color: [1, 1, 1, 1],
                        vertices: [-16, -8, 16, -8, 16, 8, -16, 8],
                        uvs: [0, 1, 1, 1, 1, 0, 0, 0],
                        triangles: [0, 1, 2, 0, 2, 3],
                    }),
                    overlay('point', { type: 'point', x: 5, y: 2, rotation: 0 }),
                );
                affinePlayer = await air.createAirBone2dPlayer(parent, JSON.stringify(file));
                affinePlayer.play('attack');
                affinePlayer.seek(0.5);
                await clock.step(0);
                const arm = affinePlayer.node.getChildByName('arm-slot');
                const m = leaves(arm)[0].node.worldMatrix;
                const o = affinePlayer.node.worldMatrix;
                return [m.m00, m.m04, m.m01, m.m05, m.m12 - o.m12, m.m13 - o.m13];
            };
            const affineSkin = async (skin) => {
                affinePlayer.setSkins([skin]);
                await clock.step(0);
                if (skin === 'point') return affinePlayer.getAttachmentGeometry('arm-slot');
                return affinePlayer.node.getChildByName('arm-slot').getChildByName('Mesh').getComponent(air.AirUIMesh)
                    .geometry.positions;
            };
            const affineClose = async () => {
                affinePlayer.dispose();
                await clock.step(0);
            };
            const affineAtlas = async (mount) => {
                if (mount) {
                    affineAtlasControl = await air.createAirBone2dPlayer(
                        parent,
                        JSON.stringify(advancedAtlasFixture(JSON.parse(text))),
                    );
                } else affineAtlasControl.dispose();
                await clock.step(0);
            };
            let requiredPlayer;
            const requiredMount = async () => {
                const file = JSON.parse(text),
                    rig = file.project.skeleton;
                const arm = rig.bones.find((bone) => bone.id === 'arm-bone');
                arm.skinRequired = true;
                rig.bones.push({ ...arm, id: 'arm-grip', parent: 'arm-bone' });
                rig.skins[0].bones = ['arm-bone'];
                rig.skins.push({ id: 'armor', name: 'Armor', bones: ['arm-grip'], constraints: [], attachments: {} });
                requiredPlayer = await air.createAirBone2dPlayer(parent, JSON.stringify(file));
                requiredPlayer.play('attack');
                const markers = requiredPlayer.advance(0.625).map((event) => event.id);
                await clock.step(0);
                return markers;
            };
            const requiredSkin = async (id) => {
                requiredPlayer.setSkins(id ? [id] : []);
                await clock.step(0);
                return { time: requiredPlayer.time, arm: requiredPlayer.node.getChildByName('arm-slot').active };
            };
            const requiredClose = async () => {
                const markers = requiredPlayer.advance(0.125).map((event) => event.id);
                requiredPlayer.dispose();
                await clock.step(0);
                return markers;
            };
            let ikPlayer;
            const ikMount = async (reverse) => {
                const file = await fetch('/ordered-ik.bone2d').then((r) => r.json());
                if (reverse) file.project.skeleton.constraints.reverse();
                ikPlayer = await air.createAirBone2dPlayer(parent, JSON.stringify(file));
                ikPlayer.play('idle');
                ikPlayer.seek(0.25);
            };
            const ikState = async (on) => {
                ikPlayer.setSkins(on ? ['engaged'] : []);
                await clock.step(0);
                const sprite = leaves(ikPlayer.node.getChildByName('arm-slot'))[0].node.worldMatrix;
                return {
                    angle: (Math.atan2(sprite.m01, sprite.m00) * 180) / Math.PI,
                    point: ikPlayer.getAttachmentGeometry('tip-slot'),
                    time: ikPlayer.time,
                };
            };
            const ikPairMount = async (mode) => {
                const file = await fetch('/two-bone-ik.bone2d').then((r) => r.json());
                const rig = file.project.skeleton;
                const ik = rig.constraints[0];
                if (mode === 'stretch') ik.stretch = true;
                if (mode === 'positive' || mode === 'negative') {
                    rig.bones[1].scaleX = 2;
                    Object.assign(rig.bones[4], { x: 5, y: 3 });
                    ik.bendPositive = mode === 'positive';
                }
                ikPlayer = await air.createAirBone2dPlayer(parent, JSON.stringify(file));
                ikPlayer.play('idle');
                ikPlayer.seek(0.25);
                await clock.step(0);
                const sprite = leaves(ikPlayer.node.getChildByName('arm-slot'))[0].node.worldMatrix;
                return {
                    tip: ikPlayer.getAttachmentGeometry('tip-slot'),
                    elbow: ikPlayer.getAttachmentGeometry('elbow-slot'),
                    spriteAngle: (Math.atan2(sprite.m01, sprite.m00) * 180) / Math.PI,
                };
            };
            const transformMount = async () => {
                const input = await fetch('/transform.bone2d').then((r) => r.text());
                ikPlayer = await air.createAirBone2dPlayer(parent, input);
                ikPlayer.play('idle');
            };
            const mappedPose = async (time) => {
                ikPlayer.seek(time);
                await clock.step(0);
                return ['local', 'world'].map((id) => {
                    const point = ikPlayer.getAttachmentGeometry(id + '-point');
                    const sprite = leaves(ikPlayer.node.getChildByName(id + '-sprite'))[0].node.worldMatrix;
                    const root = ikPlayer.node.worldMatrix;
                    return [point.x, point.y, sprite.m12 - root.m12, sprite.m13 - root.m13];
                });
            };
            const sliderMount = async ({ additive, zero, independent }) => {
                const file = await fetch('/slider.bone2d').then((r) => r.json());
                const rig = file.project.skeleton;
                Object.assign(rig.constraints[1], { additive, mix: zero ? 0 : 0.25 });
                if (independent) rig.animations[1].slots['arm-slot'].attachment[0].name = 'independent';
                ikPlayer = await air.createAirBone2dPlayer(parent, JSON.stringify(file));
                ikPlayer.play('idle');
            };
            const sliderStep = async (dt) => {
                const events = ikPlayer.advance(dt).map((event) => event.id);
                await clock.step(0);
                const mesh = ikPlayer.node
                    .getChildByName('arm-slot')
                    .getChildByName('Mesh')
                    .getComponent(air.AirUIMesh);
                return {
                    events,
                    time: ikPlayer.time,
                    width: mesh.spriteFrame.originalSize.width,
                    xy: mesh.geometry.positions,
                };
            };
            const pathMount = async (fixed) => {
                const file = await fetch('/path-follow.bone2d').then((r) => r.json());
                if (fixed !== undefined)
                    Object.assign(file.project.skeleton.constraints[0], { positionMode: 'fixed', position: fixed });
                ikPlayer = await air.createAirBone2dPlayer(parent, JSON.stringify(file));
                ikPlayer.play('idle');
            };
            const pathState = async ({ skin, time }) => {
                ikPlayer.setSkins(skin ? [skin] : []);
                ikPlayer.seek(time);
                await clock.step(0);
                const point = ikPlayer.getAttachmentGeometry('point');
                const sprite = leaves(ikPlayer.node.getChildByName('arm-slot'))[0].node.worldMatrix;
                const root = ikPlayer.node.worldMatrix;
                return { point, sprite: [sprite.m12 - root.m12, sprite.m13 - root.m13], time: ikPlayer.time };
            };
            const physicsMount = async (repeat) => {
                const file = await fetch('/physics.bone2d').then((r) => r.text());
                ikPlayer = await air.createAirBone2dPlayer(parent, file);
                ikPlayer.play('idle', repeat);
            };
            const physicsFrame = async ({ steps = [], seek, skin, paused } = {}) => {
                if (seek !== undefined) ikPlayer.seek(seek);
                if (skin !== undefined) ikPlayer.setSkins(skin ? ['enable-c'] : []);
                if (paused === true) ikPlayer.pause();
                if (paused === false) ikPlayer.resume();
                const markers = steps.flatMap((step) => ikPlayer.advance(step).map((m) => m.id));
                await clock.step(0);
                const root = ikPlayer.node.worldMatrix;
                const values = ['A', 'B', 'C'].map((id) => {
                    const point = ikPlayer.getAttachmentGeometry(id + '-point');
                    if (point === null) return null;
                    const sprite = leaves(ikPlayer.node.getChildByName(id + '-sprite'))[0].node.worldMatrix;
                    return { point, sprite: [sprite.m12 - root.m12, sprite.m13 - root.m13] };
                });
                return { time: ikPlayer.time, markers, values };
            };
            const previewMount = async () => {
                const file = await fetch('/playback.bone2d').then((r) => r.text());
                ikPlayer = await air.createAirBone2dPlayer(parent, file);
                ikPlayer.play('idle');
            };
            const previewFrame = async ({ play, fade, layers, delta, seek } = {}) => {
                if (play) ikPlayer.play(...play);
                if (fade) ikPlayer.crossfade(...fade);
                if (layers) ikPlayer.setLayers(layers);
                if (seek !== undefined) ikPlayer.seek(seek);
                const markers = delta === undefined ? [] : ikPlayer.advance(delta).map((m) => m.id);
                await clock.step(0);
                const point = ikPlayer.getAttachmentGeometry('point-slot');
                const sprite = leaves(ikPlayer.node.getChildByName('arm-slot'))[0];
                const mat = sprite.node.worldMatrix,
                    root = ikPlayer.node.worldMatrix;
                return {
                    time: ikPlayer.time,
                    direction: ikPlayer.direction,
                    playing: ikPlayer.playing,
                    pose: [point.y, point.rotation],
                    visible: [mat.m13 - root.m13, (Math.atan2(mat.m01, mat.m00) * 180) / Math.PI],
                    width: sprite.spriteFrame.originalSize.width,
                    markers,
                };
            };
            const gameMount = async ({ format = 'png', smooth = false, input = 'embedded' }) => {
                const data = await fetch('/web-game.json').then((r) => r.json());
                const images = await fetch('/raster-formats.json').then((r) => r.json());
                data.smooth = smooth;
                if (input === 'linked' || input === 'approved')
                    data.images.arm = 'https://unexpected.invalid/picture.png';
                else if (input === 'missing') data.images = {};
                else data.images.arm = images[format];
                try {
                    ikPlayer = await air.createAirBone2dPlayer(
                        parent,
                        JSON.stringify(data),
                        input === 'approved' ? { webGameImages: new Map([['arm', images[format]]]) } : undefined,
                    );
                    await clock.step(0);
                    return { status: 'ready', point: ikPlayer.getAttachmentGeometry('point-slot') };
                } catch (e) {
                    return { status: 'rejected', message: String(e.message) };
                }
            };
            const gamePixels = async (data) => {
                const image = new Image();
                image.src = 'data:image/png;base64,' + data;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                return [100, 159, 160, 220].map((x) => [...ctx.getImageData(x, 120, 1, 1).data]);
            };
            const ikClose = async () => {
                ikPlayer.dispose();
                await clock.step(0);
            };
            window.bone2dTest = {
                ikMount,
                ikState,
                ikPairMount,
                transformMount,
                mappedPose,
                sliderMount,
                sliderStep,
                pathMount,
                pathState,
                physicsMount,
                physicsFrame,
                previewMount,
                previewFrame,
                gameMount,
                gamePixels,
                ikClose,
                frame,
                requiredMount,
                requiredSkin,
                requiredClose,
                affineMount,
                affineSkin,
                affineClose,
                clipMount,
                blends,
                clipStep,
                clipClose,
                shapes,
                sequenceMount,
                sequenceStep,
                sequenceClose,
                negative,
                folderMount,
                folderClose,
                setMesh,
                meshStep,
                meshClose,
                skinsMount,
                skinsChange,
                wardrobeClose,
                atlasMount,
                affineAtlas,
                atlasRelease,
                close: async () => {
                    player.dispose();
                    sequencePlayer?.dispose();
                    clipPlayer?.dispose();
                    requiredPlayer?.dispose();
                    affinePlayer?.dispose();
                    ikPlayer?.dispose();
                    wardrobe?.dispose();
                    meshInstance?.dispose();
                    folderPlayer?.dispose();
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
        await page.evaluate(() => window.bone2dTest.wardrobeClose());
        const folderOrder = await page.evaluate(() => window.bone2dTest.folderMount());
        const folderShot = sha(await page.screenshot());
        assert.deepEqual(folderOrder, ['arm-slot', 'body-slot']);
        assert.equal(
            folderShot,
            s['attack-hitch'].screenshotSha256,
            'folder-only track must render the same order as full-track control',
        );
        report.folder = { order: folderOrder, screenshot: folderShot };
        await page.evaluate(() => window.bone2dTest.folderClose());
        report.mesh = [];
        for (const [weighted, linked] of [
            [true, false],
            [false, false],
            [true, true],
        ]) {
            await page.evaluate((v) => window.bone2dTest.setMesh(v), { weighted, linked });
            const baseline = await page.evaluate(() => window.bone2dTest.meshStep(0));
            const before = sha(await page.screenshot());
            const end = await page.evaluate(() => window.bone2dTest.meshStep(0.5));
            const after = sha(await page.screenshot());
            assert.deepEqual(end.positions, weighted ? [22.5, 0, 46.5, 0, 22.5, 22] : [39, 0, 63, 0, 39, 24]);
            assert.notEqual(before, s.dispose.screenshotSha256, 'there must be a visible native mesh at setup');
            assert.notEqual(before, after, 'skinning and deformation must change visible pixels');
            assert.notEqual(after, s.dispose.screenshotSha256, 'attack must still have a visible mesh');
            assert.deepEqual(end.events, ['ev-start', 'ev-impact']);
            const hidden = await page.evaluate(() => window.bone2dTest.meshStep(0.375));
            assert.equal(hidden.frame, false);
            assert.equal(sha(await page.screenshot()), s.dispose.screenshotSha256);
            const freed = await page.evaluate(() => window.bone2dTest.meshClose());
            assert.equal(freed, true);
            report.mesh.push({ weighted, linked, baseline, end, before, after, hidden, freed });
        }
        report.sequences = [];
        for (const mesh of [false, true]) {
            await page.evaluate((flag) => window.bone2dTest.sequenceMount(flag), mesh);
            const frames = [];
            for (const [step, time, rgb] of [
                [{ seek: 0.5 }, 0.5, [45, 70, 215]],
                [{ skin: true }, 0.5, [220, 145, 40]],
                [{ seek: 0.75 }, 0.75, [165, 35, 170]],
                [{ skin: false }, 0.75, [208, 20, 40]],
            ]) {
                const state = await page.evaluate((value) => window.bone2dTest.sequenceStep(value), step);
                assert.equal(state.time, time);
                const png = await page.screenshot();
                const matchingPixels = await page.evaluate(
                    async ([data, color]) => {
                        const image = new Image();
                        image.src = 'data:image/png;base64,' + data;
                        await image.decode();
                        const canvas = document.createElement('canvas');
                        canvas.width = image.width;
                        canvas.height = image.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(image, 0, 0);
                        const { data: rgba } = ctx.getImageData(0, 0, canvas.width, canvas.height);
                        let matches = 0;
                        for (let i = 0; i < rgba.length; i += 4) {
                            if (color.every((value, j) => Math.abs(value - rgba[i + j]) <= 2) && rgba[i + 3] === 255)
                                matches++;
                        }
                        return matches;
                    },
                    [png.toString('base64'), rgb],
                );
                assert.ok(matchingPixels > 10, 'selected picture must produce expected composited color: ' + rgb);
                frames.push({ ...state, rgb, matchingPixels, screenshot: sha(png) });
            }
            if (mesh) {
                const expected = [-12, -8, 12, -8, -12, 13];
                frames.forEach((frame) => assert.deepEqual(frame.positions, expected));
            }
            const released = await page.evaluate(() => window.bone2dTest.sequenceClose());
            assert.equal(released, true);
            report.sequences.push({ mesh, frames, released });
        }
        report.shapes = await page.evaluate(() => window.bone2dTest.shapes());
        const [point, bounds, curve, noDraw, hiddenShape] = report.shapes;
        assert.equal(point.kind, 'point');
        assert.deepEqual([point.x, point.y], [4.5, 4]);
        assert.ok(Math.abs(point.rotation - 33.69006752598) < 1e-8);
        assert.deepEqual(bounds, { kind: 'boundingbox', vertices: [0, 0, 12, 6, 0, 8] });
        assert.deepEqual(curve, {
            kind: 'path',
            vertices: [0, 0, 1.5, 0, 3, 3, 6, 3, 7.5, 0, 9, 0],
            closed: false,
            constantSpeed: true,
        });
        assert.equal(noDraw, true);
        assert.equal(hiddenShape, null);
        await page.evaluate(() => window.bone2dTest.clipMount());
        report.clipping = {};
        const clipPixels = async () =>
            page.evaluate(
                async (data) => {
                    const image = new Image();
                    image.src = 'data:image/png;base64,' + data;
                    await image.decode();
                    const canvas = document.createElement('canvas');
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(image, 0, 0);
                    return [
                        [130, 120],
                        [190, 120],
                        [256, 120],
                        [25, 120],
                        [130, 108],
                    ].map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]);
                },
                (await page.screenshot()).toString('base64'),
            );
        for (const stage of ['normal', 'inverse', 'off', 'dent', 'dent-deformed', 'back']) {
            const nodes = await page.evaluate((s) => window.bone2dTest.clipStep(s), stage);
            const pixels = await clipPixels();
            report.clipping[stage] = { nodes, pixels };
        }
        const { normal, inverse, off, back } = report.clipping;
        const [left, right, outside, bg, top] = off.pixels;
        assert.notDeepEqual(top, bg);
        assert.notDeepEqual(left, bg);
        assert.notDeepEqual(right, bg);
        assert.notDeepEqual(outside, bg);
        assert.deepEqual(
            normal.pixels,
            [left, bg, outside, bg, top],
            'the inclusive end slot is clipped, the following slot is not',
        );
        assert.deepEqual(
            inverse.pixels,
            [bg, right, outside, bg, bg],
            'inverse clipping must preserve only outside pixels',
        );
        assert.deepEqual(
            report.clipping.dent.pixels,
            [bg, bg, outside, bg, top],
            'the concave indentation excludes the left sample',
        );
        assert.deepEqual(
            report.clipping['dent-deformed'].pixels,
            report.clipping.dent.pixels,
            'default clipping follows the pinned editor and ignores deform keys',
        );
        assert.deepEqual(back, normal, 'seek and skin swap must recreate the original compositor state');
        await page.evaluate(() => window.bone2dTest.clipClose());
        await page.evaluate(() => window.bone2dTest.clipMount(true));
        await page.evaluate(() => window.bone2dTest.clipStep('dent'));
        await page.evaluate(() => window.bone2dTest.clipStep('dent-deformed'));
        report.clipDeformExtension = await clipPixels();
        assert.deepEqual(report.clipDeformExtension, normal.pixels, 'opt-in deformed outline exposes the left sample');
        await page.evaluate(() => window.bone2dTest.clipClose());
        report.blends = await page.evaluate(() => window.bone2dTest.blends(false));
        report.blendsSwapped = await page.evaluate(() => window.bone2dTest.blends(true));
        assert.deepEqual(report.blendsSwapped, report.blends, 'sprites and meshes must give the same composited bytes');
        const { clear, source, rgba, gap } = report.blends;
        const compare = (actual, wanted) =>
            assert.ok(
                actual.length === wanted.length && actual.every((byte, i) => Math.abs(byte - wanted[i]) <= 2),
                JSON.stringify({ actual, wanted }),
            );
        compare(clear, [26, 51, 64, 64]);
        compare(source, [153, 64, 51, 128]);
        compare(gap, clear);
        const [r, g, b, a] = source.map((v) => v / 255);
        const [u, v, w, d] = clear.map((n) => n / 255);
        const src = [r, g, b],
            dst = [u, v, w];
        const color = [
            src.map((x, i) => x * a + dst[i] * (1 - a)),
            src.map((x, i) => x * a + dst[i]),
            src.map((x, i) => x * dst[i] + dst[i] * (1 - a)),
            src.map((x, i) => x + dst[i] * (1 - x)),
        ];
        color.forEach((rgb, i) =>
            compare(
                rgba[i],
                [...rgb, a + d * (i === 1 ? 1 : 1 - a)].map((n) => Math.round(255 * n)),
            ),
        );
        report.twoColor = await page.evaluate(() => window.bone2dTest.blends(false, true));
        report.twoColorSwapped = await page.evaluate(() => window.bone2dTest.blends(true, true));
        assert.deepEqual(
            report.twoColorSwapped,
            report.twoColor,
            'two-color state stays with its slot on both renderers',
        );
        function composed(mode, dark, light) {
            const lightBytes = light.map((x) => Math.round(x * 255) / 255);
            const shader = src.map((x, i) => x * lightBytes[i] + (1 - x) * dark[i]);
            const alpha = a * lightBytes[3];
            return [
                ...shader.map((x, i) => {
                    if (mode === 0) return x * alpha + dst[i] * (1 - alpha);
                    if (mode === 1) return x * alpha + dst[i];
                    if (mode === 2) return x * dst[i] + dst[i] * (1 - alpha);
                    return x + dst[i] * (1 - x);
                }),
                alpha + d * (mode === 1 ? 1 : 1 - alpha),
            ].map((n) => Math.round(255 * n));
        }
        for (let i = 0; i < 4; ++i) {
            compare(report.twoColor.rgba[i], composed(i, [i / 8, (3 - i) / 8, 0.125], [1, 1, 1, 1]));
            compare(
                report.twoColor.animated[i],
                composed(i, [i / 8 + 0.125, (3 - i) / 8, (i + 2) / 16], [0.75, 0.5, 0.25, 0.5]),
            );
        }
        report.inherit = [];
        for (const [mode, basis] of [
            ['normal', [-2.025449, 0.041812, 0.4228, 1.279957]],
            ['onlyTranslation', [0.771345, -0.338095, 0.919253, 0.725046]],
            ['noRotationOrReflection', [1.645296, -0.47695, 1.660788, 1.105]],
            ['noScale', [-1.172973, -0.177467, 0.253246, 0.780068]],
            ['noScaleOrReflection', [-1.18885, -0.236343, -0.163207, -0.764292]],
        ]) {
            const sprite = await page.evaluate((m) => window.bone2dTest.affineMount(m), mode);
            const close = (actual, expected) => {
                assert.equal(actual.length, expected.length);
                actual.forEach((value, i) =>
                    assert.ok(Math.abs(value - expected[i]) < 3e-5, JSON.stringify({ mode, actual, expected })),
                );
            };
            close(sprite, [...basis, 1.803847, 22.196152]);
            const transform = ([x, y]) => [
                basis[0] * x + basis[1] * y + 1.803847,
                basis[2] * x + basis[3] * y + 22.196152,
            ];
            const probes = [
                [-8, 4],
                [8, 4],
                [-8, -4],
                [8, -4],
            ]
                .map(transform)
                .map(([x, y]) => [Math.round(160 + x), Math.round(120 - y)]);
            const capture = async () =>
                page.evaluate(
                    async ([pixels, data]) => {
                        const image = new Image();
                        image.src = 'data:image/png;base64,' + data;
                        await image.decode();
                        const canvas = document.createElement('canvas');
                        canvas.width = image.width;
                        canvas.height = image.height;
                        const context = canvas.getContext('2d');
                        context.drawImage(image, 0, 0);
                        return pixels.map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
                    },
                    [probes, (await page.screenshot()).toString('base64')],
                );
            const spritePixels = await capture();
            assert.deepEqual(spritePixels, [
                [255, 51, 34, 255],
                [18, 204, 238, 255],
                [68, 238, 17, 255],
                [204, 68, 255, 255],
            ]);
            const mesh = await page.evaluate(() => window.bone2dTest.affineSkin('mesh'));
            close(
                mesh,
                [
                    [-16, -8],
                    [16, -8],
                    [16, 8],
                    [-16, 8],
                ].flatMap(transform),
            );
            const meshPixels = await capture();
            assert.deepEqual(meshPixels, spritePixels);
            const point = await page.evaluate(() => window.bone2dTest.affineSkin('point'));
            const degrees = (Math.atan2(basis[2], basis[0]) * 180) / Math.PI;
            close([point.x, point.y, point.rotation], [...transform([5, 2]), degrees]);
            await page.evaluate(() => window.bone2dTest.affineClose());
            report.inherit.push({ mode, sprite, mesh, point, probes, spritePixels, meshPixels });
        }
        await page.evaluate(() => window.bone2dTest.affineAtlas(true));
        const embedded = await page.screenshot();
        await page.evaluate(() => window.bone2dTest.affineAtlas(false));
        await page.evaluate(() => window.bone2dTest.atlasMount(true));
        const packed = await page.screenshot();
        const coverage = await page.evaluate(
            async (pages) => {
                const read = async (data) => {
                    const image = new Image();
                    image.src = 'data:image/png;base64,' + data;
                    await image.decode();
                    const canvas = document.createElement('canvas');
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(image, 0, 0);
                    return { pixels: ctx.getImageData(0, 0, canvas.width, canvas.height).data, width: canvas.width };
                };
                const [left, right] = await Promise.all(pages.map(read));
                const same = (a, i, b, j) => [0, 1, 2, 3].every((c) => a[i + c] === b[j + c]);
                const interior = (a, i, width) =>
                    [4, -4, 4 * width, -4 * width].every((offset) => same(a, i, a, i + offset));
                let ink = 0,
                    different = 0,
                    interiorDifferences = 0;
                for (let i = 0; i < left.pixels.length; i += 4) {
                    if (!same(left.pixels, i, left.pixels, 0) || !same(right.pixels, i, right.pixels, 0)) ink++;
                    if (same(left.pixels, i, right.pixels, i)) continue;
                    different++;
                    if (interior(left.pixels, i, left.width) && interior(right.pixels, i, right.width))
                        interiorDifferences++;
                }
                return { ink, different, interiorDifferences };
            },
            [embedded.toString('base64'), packed.toString('base64')],
        );
        report.affineAtlas = { embedded: sha(embedded), packed: sha(packed), ...coverage };
        // The rotated/trimmed and full textures can use different coverage at a rotated edge.
        // Interior colors must remain exact, and the bounded fixture cannot lose its silhouette.
        assert.ok(coverage.ink > 2000 && coverage.different <= coverage.ink * 0.05, JSON.stringify(coverage));
        assert.equal(coverage.interiorDifferences, 0);
        await page.evaluate(() => window.bone2dTest.atlasRelease());
        const startMarkers = await page.evaluate(() => window.bone2dTest.requiredMount());
        assert.deepEqual(startMarkers, ['ev-start', 'ev-impact']);
        const hiddenHash = sha(await page.screenshot());
        const fallback = await page.evaluate(() => window.bone2dTest.requiredSkin('skin'));
        assert.deepEqual(fallback, { time: 0.625, arm: false });
        assert.equal(sha(await page.screenshot()), hiddenHash);
        const mounted = await page.evaluate(() => window.bone2dTest.requiredSkin('armor'));
        assert.deepEqual(mounted, { time: 0.625, arm: true });
        const shownHash = sha(await page.screenshot());
        assert.notEqual(shownHash, hiddenHash);
        assert.equal(
            shownHash,
            s['attack-hitch'].screenshotSha256,
            'required ancestor evaluates at the unchanged clip time',
        );
        const unworn = await page.evaluate(() => window.bone2dTest.requiredSkin(null));
        assert.deepEqual(unworn, { time: 0.625, arm: false });
        assert.equal(sha(await page.screenshot()), hiddenHash);
        const laterMarkers = await page.evaluate(() => window.bone2dTest.requiredClose());
        assert.deepEqual(laterMarkers, []);
        report.skinRequirements = { hiddenHash, shownHash, startMarkers, laterMarkers };
        {
            await page.evaluate(() => window.bone2dTest.ikMount(false));
            const off = await page.evaluate(() => window.bone2dTest.ikState(false));
            const ikOffHash = sha(await page.screenshot());
            const on = await page.evaluate(() => window.bone2dTest.ikState(true));
            const ikOnHash = sha(await page.screenshot());
            assert.equal(off.time, 0.25);
            assert.equal(on.time, off.time);
            assert.equal(off.point.kind, 'point');
            assert.ok(Math.abs(off.angle - 36.86989765) < 1e-4);
            assert.ok(Math.hypot(off.point.x - 4, off.point.y) < 1e-5);
            assert.ok(Math.abs(on.angle - 90) < 1e-4);
            assert.ok(Math.hypot(on.point.x, on.point.y - 4) < 1e-5);
            assert.notEqual(ikOnHash, ikOffHash);
            assert.deepEqual(await page.evaluate(() => window.bone2dTest.ikState(false)), off);
            assert.equal(sha(await page.screenshot()), ikOffHash);
            await page.evaluate(() => window.bone2dTest.ikClose());
            await page.evaluate(() => window.bone2dTest.ikMount(true));
            const reversed = await page.evaluate(() => window.bone2dTest.ikState(true));
            assert.ok(Math.abs(reversed.angle - off.angle) < 1e-4);
            assert.deepEqual(reversed.point, on.point);
            assert.equal(sha(await page.screenshot()), ikOffHash);
            await page.evaluate(() => window.bone2dTest.ikClose());
            report.orderedIk = { off, on, reversed, ikOffHash, ikOnHash };
        }
        const pairs = {};
        for (const mode of ['rest', 'stretch', 'positive', 'negative']) {
            const state = await page.evaluate((m) => window.bone2dTest.ikPairMount(m), mode);
            pairs[mode] = { ...state, screenshot: sha(await page.screenshot()) };
            assert.equal(state.elbow.kind, 'point');
            assert.equal(state.tip.kind, 'point');
            const expected = mode === 'rest' || mode === 'stretch' ? [4, 2] : [5, 3];
            assert.ok(Math.hypot(state.tip.x - expected[0], state.tip.y - expected[1]) < 1e-5, JSON.stringify(state));
            assert.ok(Math.abs(state.elbow.rotation - state.spriteAngle) < 1e-4, JSON.stringify(state));
            await page.evaluate(() => window.bone2dTest.ikClose());
        }
        assert.ok(Math.hypot(pairs.rest.elbow.x - 2.2, pairs.rest.elbow.y + 0.4) < 1e-5);
        assert.ok(Math.abs(pairs.rest.spriteAngle - 53.130102) < 1e-4);
        assert.ok(Math.abs(pairs.stretch.spriteAngle - 47.864456) < 1e-4);
        assert.ok(
            Math.hypot(
                pairs.positive.elbow.x - pairs.negative.elbow.x,
                pairs.positive.elbow.y - pairs.negative.elbow.y,
            ) > 2,
        );
        assert.notEqual(pairs.rest.screenshot, pairs.stretch.screenshot);
        assert.notEqual(pairs.positive.screenshot, pairs.negative.screenshot);
        report.twoBoneIk = pairs;
        await page.evaluate(() => window.bone2dTest.transformMount());
        const mappedStart = await page.evaluate(() => window.bone2dTest.mappedPose(0));
        const mappedStartHash = sha(await page.screenshot());
        const mappedEnd = await page.evaluate(() => window.bone2dTest.mappedPose(1));
        const mappedEndHash = sha(await page.screenshot());
        assert.deepEqual(mappedStart, [
            [10, 14, 10, 14],
            [-20, -14, -20, -14],
        ]);
        assert.deepEqual(mappedEnd, [
            [9, 14, 9, 14],
            [9, -14, 9, -14],
        ]);
        assert.notEqual(mappedEndHash, mappedStartHash);
        assert.deepEqual(await page.evaluate(() => window.bone2dTest.mappedPose(0)), mappedStart);
        assert.equal(sha(await page.screenshot()), mappedStartHash);
        report.transform = { mappedStart, mappedEnd, mappedStartHash, mappedEndHash };
        await page.evaluate(() => window.bone2dTest.ikClose());
        report.slider = {};
        for (const mode of [
            { key: 'replace', additive: false, zero: false, independent: false, xy: [11, 0, -33, 0, 5.5, 8] },
            { key: 'add', additive: true, zero: false, independent: false, xy: [13, 0, 45, 0, 17, 8] },
            { key: 'zero', additive: false, zero: true, independent: false, xy: [12, 0, 60, 0, 18, 8] },
            { key: 'independent', additive: false, zero: false, independent: true, xy: [11, 0, -33, 0, 11, 8] },
        ]) {
            await page.evaluate((m) => window.bone2dTest.sliderMount(m), mode);
            const before = await page.evaluate(() => window.bone2dTest.sliderStep(0.25));
            const beforeHash = sha(await page.screenshot());
            const after = await page.evaluate(() => window.bone2dTest.sliderStep(0.5));
            const afterHash = sha(await page.screenshot());
            assert.deepEqual(before, { events: [], time: 0.25, width: 16, xy: [12, 0, 60, 0, 18, 8] });
            assert.deepEqual(after, { events: ['ev-start'], time: 0.75, width: mode.zero ? 16 : 8, xy: mode.xy });
            if (mode.zero) assert.equal(afterHash, beforeHash);
            else assert.notEqual(afterHash, beforeHash);
            report.slider[mode.key] = { before, after, beforeHash, afterHash };
            await page.evaluate(() => window.bone2dTest.ikClose());
        }
        const path = {};
        async function pathCase(key, skin, time, x, y) {
            const state = await page.evaluate((v) => window.bone2dTest.pathState(v), { skin, time });
            const { point, sprite } = state;
            assert.equal(point.kind, 'point');
            assert.ok(Math.hypot(point.x - x, point.y - y) < 2e-6, JSON.stringify(state));
            assert.ok(Math.hypot(sprite[0] - x, sprite[1] - y) < 2e-6, JSON.stringify(state));
            assert.equal(state.time, time);
            path[key] = { ...state, image: sha(await page.screenshot()) };
        }
        await page.evaluate(() => window.bone2dTest.pathMount());
        await pathCase('setupParameter', '', 0, 1.75, 0);
        await pathCase('liveDistance', 'distance', 0, 3.9625233619, 0);
        await pathCase('setupParameterScaled', '', 1, 3.5, 0);
        await pathCase('liveDistanceScaled', 'distance', 1, 7.9250467239, 0);
        await pathCase('nonPath', 'nonpath', 1, 40, 10);
        await pathCase('setupParameterAgain', '', 0, 1.75, 0);
        assert.notEqual(path.setupParameter.image, path.liveDistance.image);
        assert.notEqual(path.setupParameterScaled.image, path.liveDistanceScaled.image);
        assert.equal(path.setupParameterAgain.image, path.setupParameter.image);
        await page.evaluate(() => window.bone2dTest.ikClose());
        for (const position of [-2, 10]) {
            await page.evaluate((v) => window.bone2dTest.pathMount(v), position);
            await pathCase(String(position), 'distance', 0, position, 0);
            await page.evaluate(() => window.bone2dTest.ikClose());
        }
        report.pathConstraint = path;
        const physics = {};
        const tick = 1 / 64;
        async function springCase(label, input, time, want, expectedMarkers = []) {
            const state = await page.evaluate((v) => window.bone2dTest.physicsFrame(v), input);
            assert.equal(state.time, time);
            assert.deepEqual(state.markers, expectedMarkers);
            state.values.forEach((observed, i) => {
                const x = want[i];
                if (x === null) return assert.equal(observed, null);
                assert.ok(Math.abs(observed.point.x - x) < 2e-6, JSON.stringify(state));
                assert.ok(Math.abs(observed.sprite[0] - x) < 2e-6, JSON.stringify(state));
                assert.ok(Math.abs(observed.sprite[1] - observed.point.y) < 2e-6, JSON.stringify(state));
            });
            physics[label] = { ...state, image: sha(await page.screenshot()) };
        }
        await page.evaluate(() => window.bone2dTest.physicsMount(true));
        await springCase('rest', {}, 0, [-24, -24, null]);
        await springCase('separateWind', { steps: [tick, tick] }, 2 * tick, [-20.4375, -23.5625, null], ['ev-start']);
        await springCase('paused', { paused: true, steps: [tick] }, 2 * tick, [-20.4375, -23.5625, null]);
        await springCase(
            'globalReset',
            { paused: false, steps: Array(6).fill(tick) },
            0.125,
            [-8, -8, null],
            ['ev-impact'],
        );
        await springCase('exclusiveBoundary', { steps: [tick] }, 0.140625, [-7, -7, null]);
        await springCase('namedReset', { steps: Array(3).fill(tick) }, 0.1875, [5.375, 0, null]);
        await springCase('activate', { skin: true }, 0.1875, [5.375, 0, 0]);
        // After a seek both springs pull back from the wrap discontinuity,
        // while tail and head markers are delivered once each.
        await springCase('preWrap', { seek: 0.234375 }, 0.234375, [6, 6, 6]);
        await springCase(
            'shortWrap',
            { steps: [0.03125] },
            0.015625,
            [-6.4375, -9.5625, -6.4375],
            ['ev-end', 'ev-start'],
        );
        await springCase('hitch', { steps: [0.296875] }, 0.0625, [-16, -16, -16], ['ev-impact', 'ev-end', 'ev-start']);
        await springCase('seek', { seek: 0.03125, skin: false }, 0.03125, [-20, -20, null]);
        assert.notEqual(physics.separateWind.image, physics.seek.image);
        assert.equal(physics.separateWind.image, physics.paused.image);
        await page.evaluate(() => window.bone2dTest.ikClose());
        report.physics = physics;
        const preview = {};
        async function poseCase(label, input, time, y, angle, width, markers = [], direction = 1) {
            const frame = await page.evaluate((v) => window.bone2dTest.previewFrame(v), input);
            assert.ok(Math.abs(frame.time - time) < 1e-9, JSON.stringify(frame));
            assert.equal(frame.direction, direction);
            assert.equal(frame.width, width);
            assert.deepEqual(frame.markers, markers);
            for (const [dy, rotation] of [frame.pose, frame.visible]) {
                assert.ok(Math.abs(dy - y) < 1e-5, JSON.stringify(frame));
                assert.ok(Math.abs(((rotation - angle + 540) % 360) - 180) < 1e-4, JSON.stringify(frame));
            }
            preview[label] = { ...frame, image: sha(await page.screenshot()) };
        }
        await page.evaluate(() => window.bone2dTest.previewMount());
        await poseCase('single', {}, 0, 20, 170, 8);
        await poseCase('destinationAtZero', { fade: ['attack'] }, 0, 20, 170, 16);
        await poseCase('half', { delta: 0.5 }, 0.5, 12, 180, 16, ['ev-start', 'ev-impact']);
        await poseCase('interrupted', { fade: ['idle', { duration: 1 }] }, 0, 12, 180, 8);
        await poseCase('holdFirst', { play: ['idle'], fade: ['attack', { holdPrevious: true }] }, 0, 20, 170, 16);
        await poseCase('holdNearly', { delta: 0.999 }, 0.999, 20, 189.98, 16, ['ev-start', 'ev-impact', 'ev-end']);
        await poseCase('holdTerminal', { delta: 0.001 }, 1, 4, -170, 16);
        await poseCase('replaceBelow', { play: ['idle'], layers: [{ id: 'attack', weight: 0.49 }] }, 0, 20, 179.8, 8);
        await poseCase('replaceAt', { layers: [{ id: 'attack', weight: 0.5 }] }, 0, 20, 180, 16);
        await poseCase('add', { layers: [{ id: 'attack', additive: true }], delta: 0.5 }, 0.5, 20, 0, 8, ['ev-start']);
        await poseCase(
            'rangeStart',
            { layers: [], play: ['attack', { useSavedSettings: true, speed: 2 }] },
            0.25,
            4,
            -170,
            16,
        );
        await poseCase('rangeTurn', { delta: 0.25 }, 0.75, 4, -170, 16, ['ev-start', 'ev-impact', 'ev-end'], -1);
        await poseCase('rangeReturn', { delta: 0.25 }, 0.25, 4, -170, 16, ['ev-impact', 'ev-start']);
        assert.notEqual(preview.single.image, preview.destinationAtZero.image);
        assert.notEqual(preview.replaceBelow.image, preview.replaceAt.image);
        assert.notEqual(preview.holdNearly.image, preview.holdTerminal.image);
        assert.equal(preview.rangeStart.image, preview.rangeReturn.image);
        await page.evaluate(() => window.bone2dTest.ikClose());
        report.preview = preview;
        const formats = {},
            externalRequests = [];
        const observeExternal = (request) => {
            if (request.url().includes('unexpected.invalid')) externalRequests.push(request.url());
        };
        page.on('request', observeExternal);
        for (const [key, options] of Object.entries({
            nearest: {},
            linear: { smooth: true },
            gif: { format: 'gif' },
            webp: { format: 'webp' },
            jpeg: { format: 'jpeg' },
            approved: { input: 'approved' },
            missing: { input: 'missing' },
            linked: { input: 'linked' },
        })) {
            const frame = await page.evaluate((opts) => window.bone2dTest.gameMount(opts), options);
            if (key === 'missing' || key === 'linked') {
                assert.equal(frame.status, 'rejected');
                assert.match(frame.message, key === 'missing' ? /unknown image: arm/ : /host override: arm/);
                formats[key] = frame;
                continue;
            }
            assert.equal(frame.status, 'ready', JSON.stringify(frame));
            assert.equal(frame.point.x, 0);
            const png = await page.screenshot();
            const pixels = await page.evaluate((data) => window.bone2dTest.gamePixels(data), png.toString('base64'));
            const [left, before, after, right] = pixels;
            if (key === 'linear') {
                for (const middle of [before, after])
                    assert.ok(middle[0] > 70 && middle[2] > 70, JSON.stringify(pixels));
                assert.ok(left[0] > before[0] && before[0] > after[0] && after[0] > right[0], JSON.stringify(pixels));
            } else {
                assert.ok(left[0] > 245 && left[2] < 10 && right[2] > 245 && right[0] < 10, JSON.stringify(pixels));
                assert.deepEqual(before, left);
                assert.deepEqual(after, right);
            }
            formats[key] = { ...frame, pixels, screenshot: sha(png) };
            await page.evaluate(() => window.bone2dTest.ikClose());
        }
        assert.deepEqual(externalRequests, []);
        page.off('request', observeExternal);
        assert.equal(formats.approved.screenshot, formats.nearest.screenshot);
        assert.notEqual(formats.linear.screenshot, formats.nearest.screenshot);
        report.webGame = formats;
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
