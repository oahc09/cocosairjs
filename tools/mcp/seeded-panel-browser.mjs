/** Proof from fresh generation processes through the existing Viewer and its rendered canvas. */
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import pngjs from 'pngjs';
import { inspectPng } from './agent-review.mjs';
import { localPage } from './browser.mjs';

const require = createRequire(import.meta.url);
const { checkedPanel } = require('../fixtures/seeded-material-panel.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const root = fileURLToPath(new URL('../../', import.meta.url));
const bundlePath = join(root, 'build/cocosair.module.js');
const binding = verifySourceBinding(root, bundlePath);
assert.ok(binding.matches, JSON.stringify(binding));
const bindingBytes = readFileSync(bundlePath + '.sources.json');
const bundleSha256 = sha256(readFileSync(bundlePath));
assert.equal(sha256(bindingBytes), binding.receiptSha256);
assert.equal(JSON.parse(bindingBytes).bundleSha256, bundleSha256);
const base = localPage(process.env.AIR_REVIEW_BASE ?? 'http://127.0.0.1:7454/');
const output = mkdtempSync(join(tmpdir(), 'air-seeded-panel-'));
const fixture = join(root, 'tools/fixtures/seeded-material-panel.cjs');

function generate(name, seed) {
    const path = join(output, name);
    const stdout = execFileSync(process.execPath, [fixture, 'generate', '--seed', String(seed), '--out', path]);
    const checked = checkedPanel(path, seed);
    assert.deepEqual(JSON.parse(stdout), checked.receipt);
    return checked;
}
const first = generate('first', 42);
const retry = generate('retry', 42);
const newSeed = generate('different', 137);
assert.deepEqual(first.receipt, retry.receipt);
for (const [name, bytes] of Object.entries(first.files)) {
    assert.deepEqual(bytes, retry.files[name]);
    assert.notEqual(sha256(bytes), sha256(newSeed.files[name]));
}

const bad = join(output, 'tampered');
mkdirSync(bad);
for (const name of ['tiles.png', 'panel.glb', 'fixture.json'])
    copyFileSync(join(output, 'first', name), join(bad, name));
const tamperedBytes = Buffer.from(first.files['panel.glb']);
tamperedBytes[tamperedBytes.length - 8] ^= 1;
writeFileSync(join(bad, 'panel.glb'), tamperedBytes);
const rejection = spawnSync(process.execPath, [fixture, 'check', '--seed', '42', '--out', bad], { encoding: 'utf8' });
assert.equal(rejection.status, 1);
assert.match(rejection.stderr, /ASSET_MISMATCH: panel\.glb/);

const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.AIR_CHROMIUM,
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
async function review(name, candidate) {
    const context = await browser.newContext({ viewport: { width: 640, height: 480 }, serviceWorkers: 'block' });
    try {
        const url = new URL('/gltf-viewer/', base);
        const assetPath = '/__seeded-panel/' + name + '.glb';
        url.searchParams.set('url', assetPath);
        url.searchParams.set('model', name + '.glb');
        let assetRead = false;
        let engineRead = false;
        await context.route('**/*', async (route) => {
            const target = new URL(route.request().url());
            if (target.origin !== base.origin) return route.abort('blockedbyclient');
            if (target.pathname === assetPath && !target.search) {
                assetRead = true;
                return route.fulfill({
                    status: 200,
                    contentType: 'model/gltf-binary',
                    body: candidate.files['panel.glb'],
                });
            }
            const response = await route.fetch({ timeout: 10000, maxRedirects: 0 });
            if (response.status() >= 300 && response.status() < 400) return route.abort('blockedbyclient');
            if (target.pathname === '/build/cocosair.module.js') {
                engineRead = response.ok() && sha256(await response.body()) === bundleSha256;
                if (!engineRead) return route.abort('blockedbyclient');
            }
            return route.fulfill({ response });
        });
        await context.routeWebSocket('**/*', (socket) => socket.close());
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (err) => errors.push(String(err)));
        page.on('console', (msg) => {
            if (msg.type() === 'error') errors.push(msg.text());
        });
        await page.goto(url.href, { waitUntil: 'load', timeout: 15000 });
        await page.waitForFunction((expected) => window.gltfViewer?.name === expected, name + '.glb', {
            timeout: 15000,
        });
        assert.ok(assetRead && engineRead, 'Live viewer must consume admitted GLB and engine');
        const proof = await page.evaluate(async () => {
            const { asset, instance } = window.gltfViewer;
            const { attachMcpBridge } = await import('/__debug/mcp-bridge.js');
            const { director, MeshRenderer } = await import('/build/cocosair.module.js');
            const bridge = attachMcpBridge(window.__airApp, false);
            const renderer = instance.root.getComponentsInChildren(MeshRenderer)[0];
            try {
                if (!bridge.isEngine(director)) throw new Error('Unexpected engine instance');
                const identity = await bridge.call('reviewIdentity', {});
                const frame = await bridge.call('capture', {});
                return {
                    identity,
                    frame,
                    node: renderer?.node.name,
                    mesh: renderer?.mesh === asset.meshes[0],
                    materialCount: asset.materials.length,
                    textureSizes: asset.textures.map((texture) => [texture.width, texture.height]),
                };
            } finally {
                bridge.close();
            }
        });
        assert.deepEqual(errors, []);
        assert.equal(proof.identity.backend, 'webgl2');
        assert.equal(proof.frame.sceneId, proof.identity.sceneId);
        assert.equal(proof.node, 'SeededPanel__0');
        assert.equal(proof.mesh, true);
        assert.equal(proof.materialCount, 1);
        assert.deepEqual(proof.textureSizes, [[64, 64]]);
        const png = inspectPng(proof.frame, pngjs.PNG);
        assert.ok(png.contrastPixels > 1000);
        writeFileSync(join(output, name + '.png'), png.bytes);
        delete proof.frame.png;
        const result = {
            ...proof,
            fixture: candidate.receipt,
            pngSha256: png.sha256,
            contrastPixels: png.contrastPixels,
        };
        writeFileSync(join(output, name + '-view.json'), JSON.stringify(result, null, 2) + '\n');
        return { proof: result, png: pngjs.PNG.sync.read(png.bytes) };
    } finally {
        await context.close();
    }
}
try {
    const a = await review('first', first);
    const b = await review('retry', retry);
    const c = await review('different', newSeed);
    assert.deepEqual(a.png.data, b.png.data, 'Same seed renders identical pixels in fresh browser contexts');
    assert.deepEqual([a.png.width, a.png.height], [c.png.width, c.png.height]);
    let changedPixels = 0;
    for (let i = 0; i < a.png.data.length; i += 4) {
        if ([0, 1, 2].reduce((delta, k) => delta + Math.abs(a.png.data[i + k] - c.png.data[i + k]), 0) > 12)
            changedPixels++;
    }
    assert.ok(changedPixels > 1000, 'Seed-change must be visible in the actual Viewer');
    const summary = {
        bundleSha256,
        output,
        changedPixels,
        reproducible: true,
        tampered: 'rejected before serving',
        receipt: first.receipt,
    };
    writeFileSync(join(output, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    console.log(JSON.stringify(summary));
} finally {
    await browser.close();
}
