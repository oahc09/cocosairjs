'use strict';

const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { resolve } = require('node:path');
const { webkit } = require('playwright');
const { verifySourceBinding } = require('../../build/source-binding.cjs');

const sourceExpression = 'vec2 unjittedUV = uv - taaParams1.xy / 2.;';
const root = resolve(__dirname, '../../..');
const sdk = resolve(root, 'build/cocosair.module.js');
const assets = {
    '/sdk.mjs': ['text/javascript', sdk],
    '/fixture.mjs': ['text/javascript', resolve(__dirname, 'taa-jitter-page.mjs')],
    '/taa.effect': [
        'text/plain',
        resolve(root, 'vendor/builtin-source/editor/assets/effects/pipeline/post-process/taa.effect'),
    ],
};

function check(report) {
    if (!report.webgl?.startsWith('WebGL 2') || report.phases !== 64 || report.results.length !== 4)
        throw new Error('Incomplete WebGL2 controls');
    const [sx, sy] = report.samplePixels;
    for (const { projection, passPixels, tracks } of report.results) {
        for (const [index, depth] of report.depthOrder.entries()) {
            const z = projection === 'perspective' ? depth : 1;
            const legacy = [sx, sy].map((v, axis) => (v * passPixels[axis]) / (2 * z * report.canvasPixels[axis]));
            const expected = { legacy, clipW: [sx, sy], sampleSigned: [0, 0], sampleWrongSign: [2 * sx, 2 * sy] };
            for (const [track, vector] of Object.entries(expected)) {
                if (vector.some((v, axis) => !(Math.abs(v - tracks[track][index][axis]) < 0.025)))
                    throw new Error(`${track} mismatch at ${projection} ${passPixels} depth ${depth}`);
            }
        }
    }
}

function checkReprojection(report) {
    if (!report.webgl?.startsWith('WebGL 2') || report.samples.length !== 48)
        throw new Error('Incomplete reprojection controls');
    const equal = (a, b) => Math.abs(a - b) < 0.000025;
    const f = Math.sqrt(3);
    const stripe = (u, v) => {
        const col = Math.max(0, Math.min(15, Math.floor(u * 16)));
        const row = Math.max(0, Math.min(15, Math.floor(v * 16)));
        return [11 * (col + 1), 13 * (row + 1), (row % 3) * 51];
    };
    for (const a of report.samples) {
        const model = a.profile === 'modeled-webgpu';
        const d = model && a.policy === 'frozen' ? (a.depth * 100) / (200 - a.depth) : a.depth;
        const currentYSign = model && a.policy !== 'frozen' ? -1 : 1;
        const world = [
            ((2 * 0.33 - 1) * d) / (f / (4 / 3)) + (a.moved ? 0.25 : 0),
            (currentYSign * (2 * a.row - 1) * d) / f - (a.moved ? 0.5 : 0),
            -d,
        ];
        const u = 0.33 + (a.moved ? (0.25 * (f / (4 / 3))) / (2 * d) : 0);
        let v = a.row + (a.moved ? ((model ? 1 : -1) * 0.5 * f) / (2 * d) : 0);
        if (model && a.policy === 'frozen') v = -(a.row - (a.moved ? (0.5 * f) / (2 * d) : 0));
        if (model && a.policy === 'depth-only') v -= 1;
        if (
            world.some((v, i) => !equal(a.world[i], v)) ||
            !equal(a.prior[0], u) ||
            !equal(a.prior[1], v) ||
            !a.stripe.every((channel, index) => channel === stripe(u, v)[index])
        )
            throw new Error('Unexpected depth or history coordinate: ' + JSON.stringify(a));
    }
}

async function main([executable, output, flag, ...rest]) {
    if (!executable || !output || rest.length || (flag && flag !== '--reprojection'))
        throw new Error('Usage: node taa-jitter-probe.cjs <WPE executable> <new-report.json> [--reprojection]');
    if (flag) assets['/fixture.mjs'][1] = resolve(__dirname, 'taa-reprojection-page.mjs');
    const binding = verifySourceBinding(root, sdk);
    if (!binding.matches) throw new Error('Requires source-bound development SDK');
    const frozenEffects = readFileSync(resolve(root, 'vendor/builtin-source/generated/custom-effects.json'));
    const shaders = JSON.parse(frozenEffects).find((effect) => effect.name === 'pipeline/post-process/taa')?.shaders;
    if (shaders?.length !== 1 || !shaders[0].glsl3?.frag.includes(sourceExpression))
        throw new Error('Frozen WebGL2 TAA shader no longer matches the sampling control');
    if (
        flag &&
        (!shaders[0].glsl3.frag.includes('screenPos.xyz * 2. - 1.0') || !shaders[0].glsl3.frag.includes('uv.y = -uv.y'))
    )
        throw new Error('Frozen helpers no longer match the reprojection control');
    const assetHashes = { frozenEffects: createHash('sha256').update(frozenEffects).digest('hex') };
    for (const [route, asset] of Object.entries(assets)) {
        asset[1] = readFileSync(asset[1]);
        assetHashes[route] = createHash('sha256').update(asset[1]).digest('hex');
    }
    const server = createServer((req, res) => {
        const html =
            '<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><script type="module" src="/fixture.mjs"></script>';
        const asset = req.url === '/' ? ['text/html', html] : assets[req.url];
        if (!asset) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': asset[0] }).end(asset[1]);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let browser;
    const report = {
        mode: flag
            ? 'webgl2-reprojection-with-modeled-clip-conventions'
            : 'webgl2-offscreen-projection-and-current-color-expression',
        binding,
        assetHashes,
        errors: [],
    };
    try {
        browser = await webkit.launch({ executablePath: resolve(executable) });
        report.browserVersion = browser.version();
        const page = await browser.newPage();
        page.on('pageerror', (error) => report.errors.push(error.message));
        page.on('response', (response) => {
            if (response.status() >= 400) report.errors.push(`HTTP ${response.status()} ${response.url()}`);
        });
        page.on('requestfailed', (request) => report.errors.push(request.failure()?.errorText));
        page.on('console', (event) => {
            if (event.type() === 'error') report.errors.push(event.text());
        });
        await page.goto(`http://127.0.0.1:${server.address().port}/`);
        await page.waitForFunction(() => typeof window.probeJitter === 'function', null, { timeout: 12000 });
        Object.assign(report, await page.evaluate(() => window.probeJitter()));
        if (flag) checkReprojection(report);
        else check(report);
    } catch (error) {
        report.errors.push(error.message);
    } finally {
        try {
            await browser?.close();
        } finally {
            await new Promise((resolve) => server.close(resolve));
            writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        }
    }
    if (report.errors.length) throw new Error(report.errors.join('; '));
}

main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
