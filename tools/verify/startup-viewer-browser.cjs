'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { once } = require('node:events');
const { readFileSync, writeFileSync } = require('node:fs');
const { createServer } = require('node:http');
const { join, resolve } = require('node:path');
const { chromium } = require('playwright');
const { verifySourceBinding } = require('../build/source-binding.cjs');

const root = resolve(__dirname, '../..');
const [fullPath, viewerPath] = process.argv.slice(2);
if (!fullPath || !viewerPath) throw new Error('Usage: node startup-viewer-browser.cjs <full-sdk> <viewer-sdk>');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bundles = [resolve(fullPath), resolve(viewerPath)];
const bindings = bundles.map((file) => verifySourceBinding(root, file));
assert.ok(
    bindings.every((binding) => binding.matches),
    'Build both bundles from the current source tree',
);

// Each page loads exactly one bundle. The module body is completed by the local server.
const script = (arm) => `
import * as c from '/${arm}.mjs';
const rejected = [];
try {
    const canvas = document.querySelector('canvas');
    if ('${arm}' === 'viewer') {
        for (const options of [
            {renderer:'webgpu'}, {renderMode:3}, {physics:'cannon'},
            {physics:'box3d'}, {physics2D:'box2d-v3-wasm'}, {webgpuAssetBaseUrl:'./x'},
        ]) {
            try { await c.createAirApp({canvas, ...options}); rejected.push('ACCEPTED'); }
            catch (error) { rejected.push(error.code); }
        }
    }
    const app = await c.createAirApp({canvas, renderer:'webgl2', pixelRatioCap:1,
        designResolution:{width:480,height:270,policy:0}});
    const scene = new c.Scene('Startup viewer physical');
    scene.globals.postSettings.toneMappingType = 1;
    const cameraNode = new c.Node('camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0,0,10);
    const camera = cameraNode.addComponent(c.Camera);
    camera.projection = c.Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 2.6;
    camera.near = 0.1;
    camera.far = 30;
    camera.clearFlags = c.Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new c.Color(9,10,14,255);
    camera.visibility = c.Layers.Enum.DEFAULT;
    const asset = await new c.GLTFLoader().loadAsync('/physical.glb');
    const instance = asset.instantiate();
    scene.addChild(instance.root);
    const materials = Object.fromEntries(asset.materials.map(m => [m.name,m.effectAsset.name]));
    const gl = canvas.getContext('webgl2');
    const capture = new Promise((done) => c.director.once(c.Director.EVENT_AFTER_DRAW, () => {
        const rgba = new Uint8Array(canvas.width * canvas.height * 4);
        gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,rgba);
        done({ rgba, error: gl.getError() });
    }));
    app.run(scene);
    const { rgba, error } = await capture;
    const pixels = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', rgba)),
        n => n.toString(16).padStart(2,'0')).join('');
    const content = rgba.some((n,i) => i%4 !== 3 && n > 45);
    window.release = async () => app.releaseScene();
    window.result = { rejected, pixels, content, materials, error, width:canvas.width,height:canvas.height };
} catch (error) {window.result = {error: String(error), rejected};}
`;
const routes = new Map([
    ['/full.mjs', ['text/javascript', readFileSync(bundles[0])]],
    ['/viewer.mjs', ['text/javascript', readFileSync(bundles[1])]],
    ['/physical.glb', ['model/gltf-binary', readFileSync(join(root, 'examples/gltf-viewer/assets/physical.glb'))]],
]);
for (const arm of ['full', 'viewer']) {
    routes.set('/' + arm, [
        'text/html',
        `<!doctype html><html><link rel="icon" href="data:,">
        <style>body{margin:0}canvas{display:block;width:480px;height:270px}</style>
        <div id="GameDiv"><div id="Cocos3dGameContainer"><canvas width="480" height="270"></canvas></div></div>
        <script type="module" src="/app-${arm}.mjs"></script></html>`,
    ]);
    routes.set('/app-' + arm + '.mjs', ['text/javascript', script(arm)]);
}

(async () => {
    const server = createServer((req, res) => {
        const route = routes.get(new URL(req.url, 'http://localhost').pathname);
        if (!route) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': route[0], 'Cache-Control': 'no-store' }).end(route[1]);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let browser;
    try {
        browser = await chromium.launch({ executablePath: process.env.AIR_CHROMIUM_PATH, chromiumSandbox: true });
        const receipts = {};
        for (const arm of ['full', 'viewer']) {
            const page = await browser.newPage({ viewport: { width: 480, height: 270 }, deviceScaleFactor: 1 });
            const errors = [];
            page.on('pageerror', (e) => errors.push(String(e)));
            page.on('console', (m) => {
                if (m.type() === 'error') errors.push(m.text());
            });
            page.on('requestfailed', (request) => errors.push(request.url()));
            page.on('response', (response) => {
                if (response.status() >= 400) errors.push(response.url());
            });
            try {
                await page.goto('http://127.0.0.1:' + server.address().port + '/' + arm);
                await page.waitForFunction(() => Boolean(window.result));
                const value = await page.evaluate(() => window.result);
                assert.equal(value.error, 0, JSON.stringify({ value, errors }));
                assert.equal(value.content, true);
                assert.deepEqual([value.width, value.height], [480, 270]);
                assert.equal(value.materials['ior2.5 + strength4'], 'air-gltf-physical');
                assert.equal(value.materials['identity pbr'], 'air-gltf-standard');
                assert.deepEqual(value.rejected, arm === 'viewer' ? Array(6).fill('AIR_E_VIEWER_PROFILE') : []);
                const release = await page.evaluate(() => window.release());
                assert.equal(release.status, 'released');
                assert.deepEqual(errors, []);
                receipts[arm] = { ...value, release };
            } finally {
                await page.close();
            }
        }
        assert.equal(receipts.viewer.pixels, receipts.full.pixels);
        const result = {
            browser: browser.version(),
            bindings: bindings.map((b) => b.receiptSha256),
            fixture: hash(routes.get('/physical.glb')[1]),
            receipts,
        };
        const json = JSON.stringify(result, null, 2) + '\n';
        if (process.env.AIR_VIEWER_PROBE_OUTPUT)
            writeFileSync(process.env.AIR_VIEWER_PROBE_OUTPUT, json, { flag: 'wx' });
        else process.stdout.write(json);
    } finally {
        await browser?.close();
        server.close();
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
