/* Compare the real Kit Web Game export against its own pinned editor's frame renderer. */
'use strict';
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const fs = require('node:fs');
const { createServer } = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const refSha = '34a5fecd89428b84a1030d4a017d313a192eeb8a';
const root = path.resolve(__dirname, '../..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function captureReference(browser, url) {
    const page = await browser.newPage();
    try {
        await page.goto(url + '?demo');
        return await readEditorFrames(page);
    } finally {
        await page.close();
    }
}

function readEditorFrames(page) {
    return page.evaluate(async () => {
        const { docStore } = await import('/src/store/doc.ts');
        const { buildWebGame } = await import('/src/editor/exportPlayer.ts');
        const { prepareRender } = await import('/src/editor/renderAnimation.ts');
        const { compileSkeleton, createSkeleton } = await import('/src/core/skeleton.ts');
        const { makePoser } = await import('/src/core/framepose.ts');
        const base64 = (u8) => {
            let encoded = '';
            for (let i = 0; i < u8.length; i += 0x4000) encoded += String.fromCharCode(...u8.subarray(i, i + 0x4000));
            return btoa(encoded);
        };
        for (let attempt = 0; attempt < 100 && docStore.get().skeleton.animations.length !== 4; attempt++) {
            await new Promise((r) => setTimeout(r, 50));
        }
        const doc = docStore.get().skeleton;
        if (
            doc.animations
                .map((clip) => clip.name)
                .sort()
                .join(',') !== 'idle,jump,walk,wave'
        )
            throw Error('Pinned Kit demo clips are missing: ' + doc.name);
        const { zip, missing } = await buildWebGame(doc);
        if (missing.length) throw Error('Missing ' + missing.join(', '));
        const sources = {};
        for (const mode of ['full', 'no-physics']) {
            const rig = structuredClone(doc);
            if (mode === 'no-physics') rig.constraints = rig.constraints.filter((c) => c.type !== 'physics');
            const result = [];
            for (const animation of rig.animations) {
                const r = prepareRender({ doc: rig, animation, fps: 30, scale: 1, padding: 4, background: null });
                const compiled = compileSkeleton(rig);
                const model = createSkeleton(compiled);
                const poser = makePoser(model, animation, 30, mode === 'full');
                for (const number of mode === 'full' ? Array.from({ length: r.count }, (_, i) => i) : [0, 11, 23]) {
                    const which = Math.min(r.count - 1, number);
                    poser.pose(which);
                    const bones = model.bones.map((b) => [
                        b.data.id,
                        b.data.name,
                        b.a,
                        b.b,
                        b.c,
                        b.d,
                        b.worldX,
                        b.worldY,
                    ]);
                    const frame = r.frame(which);
                    result.push({
                        id: animation.id,
                        name: animation.name,
                        number: which,
                        width: r.width,
                        height: r.height,
                        origin: r.origin,
                        pixels: base64(frame.data),
                        bones,
                    });
                }
                r.dispose();
            }
            sources[mode] = result;
        }
        return { zip: base64(zip), sources };
    });
}

async function compareFrames(browser, bundle, payload, reference, output) {
    const server = createServer((req, res) => {
        if (req.url === '/runtime.js') {
            res.setHeader('Content-Type', 'text/javascript');
            return res.end(bundle);
        }
        if (req.url === '/kit.json') {
            res.setHeader('Content-Type', 'application/json');
            return res.end(payload);
        }
        if (req.url === '/')
            return res.end('<!doctype html><html><body style="margin:0"><canvas id="game"></canvas></body></html>');
        res.writeHead(404).end();
    });

    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    try {
        const pages = [];
        for (const [mode, frames] of Object.entries(reference)) {
            for (const id of [...new Set(frames.map((f) => f.id))]) {
                const group = frames.filter((f) => f.id === id);
                const { width, height } = group[0];
                const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
                const errors = [];
                page.on('pageerror', (error) => errors.push(String(error)));
                await page.goto('http://127.0.0.1:' + server.address().port);
                const readings = await page.evaluate(
                    async ({ mode, group }) => {
                        const air = await import('/runtime.js');
                        const { width, height, origin, id } = group[0];
                        const canvas = document.getElementById('game');
                        canvas.style.cssText = 'width:' + width + 'px;height:' + height + 'px';
                        air.macro.ENABLE_TRANSPARENT_CANVAS = true;
                        const app = await air.createAirApp({ canvas: '#game', pixelRatioCap: 1 });
                        const scene = new air.Scene('Kit comparison');
                        const parent = air.createUICanvas(scene, 'Canvas', {
                            designWidth: width,
                            designHeight: height,
                        });
                        const camera = parent.getComponent(air.Canvas).cameraComponent;
                        camera.clearColor = new air.Color(0, 0, 0, 0);
                        app.run(scene);
                        const gl = air.director.root.device.gl;
                        if (!gl.getContextAttributes().alpha || !gl.getContextAttributes().antialias)
                            throw new Error('Expected transparent multisampled canvas');
                        const read = () => {
                            const bytes = new Uint8Array(width * height * 4);
                            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                            gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
                            return bytes;
                        };
                        const clock = air.createStepClock();
                        clock.begin();
                        const data = await (await fetch('/kit.json')).json();
                        if (mode === 'no-physics')
                            data.skeleton.constraints = data.skeleton.constraints.filter((c) => c.type !== 'physics');
                        const player = await air.createAirBone2dPlayer(parent, JSON.stringify(data));
                        player.node.setPosition(origin[0] - width / 2, height / 2 - origin[1], 0);
                        player.play(id);
                        const wanted = new Set(group.map((a) => a.number));
                        const actual = [];
                        for (let frame = 0; frame <= Math.max(...wanted); frame++) {
                            if (frame) player.advance(1 / 30);
                            if (!wanted.has(frame)) continue;
                            await clock.step(0);
                            const bytes = read();
                            let raw = '';
                            for (let y = height - 1; y >= 0; y--)
                                raw += String.fromCharCode(...bytes.subarray(y * width * 4, (y + 1) * width * 4));
                            actual.push({
                                frame,
                                pixels: btoa(raw),
                                bones: data.skeleton.bones.map((b) => [b.id, player.bone(b.id)]),
                            });
                        }
                        player.dispose();
                        await clock.step(0);
                        const blank = read().every((v) => v === 0);
                        clock.end();
                        return { actual, blank };
                    },
                    { mode, group: group.map(({ pixels, bones, ...meta }) => meta) },
                );
                assert.deepEqual(errors, []);
                assert.equal(readings.blank, true);
                for (const f of group) {
                    const a = readings.actual.find((x) => x.frame === f.number);
                    fs.writeFileSync(
                        path.join(output, `${mode}-${f.name}-${f.number}.rgba`),
                        Buffer.from(a.pixels, 'base64'),
                        { flag: 'wx' },
                    );
                    const expected = Buffer.from(f.pixels, 'base64');
                    const actual = Buffer.from(a.pixels, 'base64');
                    assert.equal(expected.length, actual.length);
                    let visible = 0,
                        overlap = 0,
                        changed = 0,
                        interior = 0,
                        changedInterior = 0;
                    for (let i = 0; i < actual.length; i += 4) {
                        const ae = expected[i + 3],
                            aa = actual[i + 3];
                        if (ae === 0 && aa === 0) continue;
                        visible++;
                        if (ae && aa) overlap++;
                        const different =
                            Math.max(
                                Math.abs(ae - aa),
                                ...[0, 1, 2].map((c) =>
                                    Math.abs(Math.round((expected[i + c] * ae) / 255) - actual[i + c]),
                                ),
                            ) > 6;
                        if (different) changed++;
                        if (ae === 255 && aa === 255) {
                            interior++;
                            if (different) changedInterior++;
                        }
                    }
                    assert(visible > 0 && overlap > 0);
                    const p = new Map(a.bones);
                    const boneErrors = f.bones.flatMap(([id, name, m00, _b, m10, _d, x, y]) => {
                        const b = p.get(id);
                        if (!b) return [];
                        const rotation = (Math.atan2(m10, m00) * 180) / Math.PI;
                        return [
                            {
                                name,
                                position: Math.hypot(x - b.x, y - b.y),
                                angle: Math.abs(((((rotation - b.rotation) % 360) + 540) % 360) - 180),
                            },
                        ];
                    });
                    pages.push({
                        mode,
                        name: f.name,
                        frame: f.number,
                        dimensions: [f.width, f.height],
                        visible,
                        overlap,
                        changed,
                        changeRate: changed / visible,
                        changedInterior,
                        interior,
                        boneErrors,
                    });
                }
                await page.close();
            }
        }
        return pages;
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

async function main(referenceRoot, output, ...extra) {
    assert(
        referenceRoot && output && !extra.length,
        'Usage: node tools/verify/air-bone2d-kit.cjs <pinned-editor-checkout> <new-evidence-dir>',
    );
    referenceRoot = path.resolve(referenceRoot);
    output = path.resolve(output);
    const git = (args) => execFileSync('git', ['-C', referenceRoot, ...args], { encoding: 'utf8' });
    assert.equal(git(['rev-parse', 'HEAD']).trim(), refSha, 'Use the pinned Bone-2D v1.5 reference');
    assert.equal(
        git(['status', '--porcelain', '--untracked-files=no']).trim(),
        '',
        'The editor checkout must be clean',
    );
    const bundleFile = path.join(root, 'build/cocosair.module.js');
    const binding = verifySourceBinding(root, bundleFile);
    assert(binding.matches, 'Build the current development SDK before comparing Kit');
    const bundle = fs.readFileSync(bundleFile);
    const write = (name, bytes) => fs.writeFileSync(path.join(output, name), bytes, { flag: 'wx' });
    fs.mkdirSync(output);
    const vite = await import(pathToFileURL(path.join(referenceRoot, 'node_modules/vite/dist/node/index.js')).href);
    let browser;
    let editor;
    try {
        browser = await chromium.launch({
            executablePath: process.env.AIR_CHROMIUM_PATH,
            args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        });
        editor = await vite.createServer({
            root: referenceRoot,
            server: { host: '127.0.0.1', port: 0, strictPort: true },
        });
        await editor.listen();
        const { port } = editor.httpServer.address();
        const result = await captureReference(browser, 'http://127.0.0.1:' + port + '/');
        await editor.close();
        editor = null;
        const zip = Buffer.from(result.zip, 'base64');
        write('kit-web-game.zip', zip);
        const payload = execFileSync('unzip', ['-p', path.join(output, 'kit-web-game.zip'), 'kit.json']);
        write('kit.json', payload);
        const expected = JSON.stringify(result.sources);
        write('reference.json', expected);
        const frames = await compareFrames(browser, bundle, payload, result.sources, output);
        const full = frames.filter((r) => r.mode === 'full');
        const staticControls = frames.filter((r) => r.mode === 'no-physics');
        const threshold = 0.002;
        const worst = Math.max(...full.map((p) => p.changeRate));
        const pass =
            full.length === 198 &&
            staticControls.length === 12 &&
            worst < threshold &&
            staticControls.every((p) => p.changeRate === 0);
        const report = {
            pass,
            threshold,
            worst,
            browser: browser.version(),
            referenceCommit: refSha,
            binding,
            scriptSHA256: sha(fs.readFileSync(__filename)),
            bundleSHA256: sha(bundle),
            characterSHA256: sha(payload),
            exportSHA256: sha(zip),
            referenceSHA256: sha(expected),
            frames,
        };
        write('report.json', JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify({ pass, frames: full.length, staticControls: staticControls.length, worst }));
        assert(pass, 'Kit pixel parity gate failed; see report.json');
    } finally {
        try {
            await editor?.close();
        } finally {
            await browser?.close();
        }
    }
}
main(...process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
