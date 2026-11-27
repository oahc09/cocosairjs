'use strict';

const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const { once } = require('node:events');
const { createServer } = require('node:http');
const { join, resolve } = require('node:path');
const { webkit } = require('playwright');
const { verifySourceBinding } = require('../../build/source-binding.cjs');

const motion = ['plain-off', 'plain-taa', 'fence-off', 'fence-taa', 'fence-zero', 'fence-current', 'fence-union'];
const root = resolve(__dirname, '../../..');
const files = {
    '/build/cocosair.module.js': ['text/javascript', join(root, 'build/cocosair.module.js')],
    '/vendor/builtin-source/generated/custom-effects.json': [
        'application/json',
        join(root, 'vendor/builtin-source/generated/custom-effects.json'),
    ],
    '/vendor/builtin-source/generated/custom-layout.bin': [
        'application/octet-stream',
        join(root, 'vendor/builtin-source/generated/custom-layout.bin'),
    ],
    '/motion.mjs': ['text/javascript', join(__dirname, 'taa-motion-page.mjs')],
    '/fixture.mjs': ['text/javascript', join(__dirname, 'taa-native-page.mjs')],
};
const html = `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,">
<div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas" width="384" height="256"></canvas></div></div>
<script type="module" src="/fixture.mjs"></script>`;

function inspect(track) {
    let badHistory = 0;
    let wrongPreviousMatrix = 0;
    let changedMaterial = 0;
    let readbackErrors = 0;
    const previous = new Map();
    const comparableFrames = track.records.slice(0, 3);
    for (const frame of track.records) {
        readbackErrors += Object.values(frame.pixels).filter((p) => p.error).length;
    }
    // The first three frames use fixed targets and small continuous camera moves.
    // Cut and resize are reported separately and not counted as valid preserved history.
    for (const frame of comparableFrames) {
        for (const draw of frame.captures) {
            const prior = previous.get(draw.name);
            const expectedHistory = prior?.output ?? draw.inputs.inputTexture;
            const expectedMatrix = prior?.current ?? draw.current;
            badHistory += Number(
                !expectedHistory || draw.inputs.taaPrevTexture !== expectedHistory || draw.output === expectedHistory,
            );
            wrongPreviousMatrix += Number(JSON.stringify(draw.atQueue.previous) !== JSON.stringify(expectedMatrix));
            changedMaterial += Number(JSON.stringify(draw.atQueue) !== JSON.stringify(draw.afterFrame));
            previous.set(draw.name, draw);
        }
    }
    return { badHistory, wrongPreviousMatrix, changedMaterial, readbackErrors };
}

function inspectMotion(result) {
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    if (result.errors.length) throw new Error('Incomplete native motion capture');
    for (const name of motion) {
        const track = result.tracks[name];
        if (
            !track ||
            track.transportErrors.length ||
            track.consoleErrors.length ||
            track.extent.join(',') !== '160,96' ||
            track.scanFromX !== 69 ||
            track.scanY !== 48
        )
            throw new Error('Invalid native motion capture: ' + name);
        const frames = track.records;
        const enabled = !name.endsWith('-off');
        if (
            frames.some(
                (r, i) =>
                    r.worldX !== -7 + 8 * i ||
                    r.draws.length !== Number(enabled) ||
                    r.scan.length !== 17 ||
                    !/^[a-f0-9]{64}$/.test(r.rgbaSha256),
            )
        )
            throw new Error('Invalid motion-frame controls: ' + name);
        if (enabled) {
            const [a, b] = frames.map((r) => r.draws[0]);
            for (const draw of [a, b]) {
                if (
                    !same(draw.params, [0, 0, name === 'fence-zero' ? 0 : 0.9]) ||
                    draw.width !== 160 ||
                    draw.height !== 96 ||
                    !draw.inputs.depthTex
                )
                    throw new Error('TAA was not exercised at the declared feedback and jitter: ' + name);
            }
            if (
                !a.inputs.inputTexture ||
                a.inputs.taaPrevTexture !== a.inputs.inputTexture ||
                !a.output ||
                b.inputs.taaPrevTexture !== a.output ||
                b.output === a.output
            )
                throw new Error('Invalid seed/history binding: ' + name);
        }
    }
    for (const name of ['fence-zero', 'fence-union']) {
        if (
            result.tracks[name].records.some(
                (frame, i) => frame.rgbaSha256 !== result.tracks['fence-off'].records[i].rgbaSha256,
            )
        )
            throw new Error('Full offscreen output does not match the clean control: ' + name);
    }
    const line = (name, i) => result.tracks[name].records[i].scan;
    const p = (name, x, i = 1) => line(name, i)[x - 69][0];
    const clean = line('fence-off', 1);
    const noFence = line('plain-off', 1);
    const bright = p('fence-off', 79);
    if (
        bright < 200 ||
        p('fence-off', 74) !== 0 ||
        p('fence-off', 75) !== bright ||
        p('plain-off', 75) !== 0 ||
        p('fence-off', 74, 0) !== bright ||
        p('fence-off', 79, 0) !== 0 ||
        p('plain-taa', 74) !== noFence[5][0] ||
        p('fence-taa', 74) < bright * 0.65 ||
        p('fence-taa', 75) !== bright ||
        p('fence-taa', 79) > bright * 0.15 ||
        p('fence-current', 74) !== p('fence-taa', 74) ||
        p('fence-current', 79) !== bright ||
        !same(line('fence-zero', 1), clean) ||
        !same(line('fence-union', 1), clean)
    )
        throw new Error('Fence negative control or mask comparison did not reproduce');
}

async function main([executable, output, flag, ...rest]) {
    if (
        !executable ||
        !output ||
        rest.length ||
        (flag && !['--expect-baseline', '--expect-isolation', '--expect-jitter', '--expect-motion'].includes(flag))
    )
        throw new Error(
            'Usage: node taa-native-probe.cjs <WPE executable> <new-report.json> [--expect-baseline|--expect-isolation|--expect-jitter|--expect-motion]',
        );
    const binding = verifySourceBinding(root, files['/build/cocosair.module.js'][1]);
    if (!binding.matches) throw new Error('Native probe requires an SDK bound to the current src bytes');
    const hashes = {};
    for (const [route, asset] of Object.entries(files)) {
        asset[1] = readFileSync(asset[1]);
        hashes[route] = createHash('sha256').update(asset[1]).digest('hex');
    }
    const server = createServer((req, res) => {
        const route = new URL(req.url, 'http://localhost').pathname;
        const page = flag === '--expect-motion' ? html.replace('/fixture.mjs', '/motion.mjs') : html;
        const asset = route === '/' ? ['text/html', page] : files[route];
        if (!asset) return res.writeHead(404).end();
        res.writeHead(200, { 'Content-Type': asset[0], 'Cache-Control': 'no-store' }).end(asset[1]);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    let browser;
    const result = { mode: 'native-webgl2-custom-pipeline', assetHashes: hashes, binding, tracks: {}, errors: [] };
    try {
        browser = await webkit.launch({ executablePath: resolve(executable) });
        result.browserVersion = browser.version();
        const modes = flag === '--expect-motion' ? motion.slice() : ['off', 'single', 'both'];
        if (flag === '--expect-jitter') modes.push('isolated-jitter');
        if (flag === '--expect-isolation') modes.push('isolated', 'isolated-control', 'isolated-b');
        for (const mode of modes) {
            const page = await browser.newPage({ viewport: { width: 384, height: 256 }, deviceScaleFactor: 1 });
            const consoleErrors = [];
            const transportErrors = [];
            page.on('pageerror', (error) => transportErrors.push(error.message));
            page.on('requestfailed', (request) => transportErrors.push(request.failure()?.errorText));
            page.on('response', (response) => {
                if (response.status() >= 400) transportErrors.push(`HTTP ${response.status()} ${response.url()}`);
            });
            page.on('console', (event) => {
                if (event.type() === 'error') consoleErrors.push(event.text());
            });
            try {
                await page.goto(`http://127.0.0.1:${server.address().port}/?mode=${mode}`);
                await page.waitForFunction(() => typeof window.__probe === 'function', null, { timeout: 15000 });
                const data = await page.evaluate(() => window.__probe());
                if (
                    data.mode !== mode ||
                    !data.webgl2 ||
                    !data.rgba16f ||
                    data.records.length !== (flag === '--expect-motion' ? 2 : 5)
                )
                    throw new Error(`Incomplete or unsupported track: ${mode}`);
                result.tracks[mode] = {
                    ...data,
                    check: flag === '--expect-motion' ? null : inspect(data),
                    consoleErrors,
                    transportErrors,
                };
            } catch (error) {
                result.errors.push(`${mode}: ${error.message}`, ...transportErrors, ...consoleErrors);
            } finally {
                await page.close();
            }
        }
    } finally {
        try {
            await browser?.close();
        } finally {
            await new Promise((resolve) => server.close(resolve));
            writeFileSync(output, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
        }
    }
    if (flag === '--expect-motion') {
        inspectMotion(result);
        return;
    }
    const { off, single, both } = result.tracks;
    if (
        result.errors.length ||
        !both ||
        !off ||
        !single ||
        Object.values(result.tracks).some((t) => t.transportErrors.length)
    )
        throw new Error('Invalid or incomplete capture');
    const offStart = off.records[0].pixels;
    if (
        offStart.A.center[0] <= offStart.A.center[1] ||
        offStart.B.center[1] <= offStart.B.center[0] ||
        !offStart.A.sha256 ||
        !offStart.B.sha256 ||
        offStart.A.sha256 === offStart.B.sha256 ||
        [off, single].some((t) => t.check.readbackErrors || t.consoleErrors.length || t.check.badHistory)
    ) {
        throw new Error('TAA-off/single-camera controls failed');
    }
    if (flag === '--expect-baseline' || flag === '--expect-isolation' || flag === '--expect-jitter') {
        if (both.check.badHistory !== 5 || both.check.wrongPreviousMatrix !== 5 || both.check.changedMaterial !== 3)
            throw new Error('Expected contamination did not reproduce');
    } else if (Object.values(both.check).some(Boolean) || both.consoleErrors.length)
        throw new Error('Dual-camera native TAA invariant failed: see report');

    if (flag === '--expect-jitter') {
        const track = result.tracks['isolated-jitter'];
        if (!track || Object.values(track.check).some(Boolean) || track.consoleErrors.length)
            throw new Error('Native pixel-jitter control failed');
        const nonzero = new Set();
        for (const [i, frame] of track.records.entries()) {
            if (frame.alias) throw new Error('Native pixel-jitter control aliased camera materials');
            for (const draw of frame.captures) {
                const { baseline, pixels } = draw.projectionProof;
                if (
                    draw.name === 'A'
                        ? !(baseline[11] === -1 && baseline[15] === 0)
                        : !(baseline[11] === 0 && baseline[15] === 1)
                )
                    throw new Error('Unexpected native projection type');
                const extent = draw.name === 'B' ? [132, 75] : i < 4 ? [160, 96] : [192, 112];
                const near = (a, b) => Math.abs(a - b) < 1e-8;
                if (draw.width !== extent[0] || draw.height !== extent[1])
                    throw new Error('Unexpected native post-process extent');
                for (const depth of [2, 8]) {
                    const at = (matrix, axis) =>
                        (-depth * matrix[8 + axis] + matrix[12 + axis]) / (-depth * matrix[11] + matrix[15]);
                    for (const [axis, size] of extent.entries()) {
                        const ndc = at(draw.beforeProj, axis) - at(baseline, axis);
                        if (Math.abs(pixels[axis]) > 0.01) nonzero.add(draw.name + axis);
                        if (!near((ndc * size) / 2, pixels[axis]) || !near(draw.atQueue.params[axis], -ndc))
                            throw new Error('Same-frame pixel shift or signed native material upload mismatch');
                    }
                }
            }
        }
        if (nonzero.size !== 4) throw new Error('Insufficient native jitter coverage on both axes');
    }

    if (flag === '--expect-isolation') {
        const isolated = result.tracks.isolated;
        const bControl = result.tracks['isolated-control'];
        const bOnly = result.tracks['isolated-b'];
        if (
            [isolated, bControl, bOnly].some(
                (t) => !t || Object.values(t.check).some(Boolean) || t.consoleErrors.length,
            )
        )
            throw new Error('The isolation or control tracks is not clean');
        for (const [i, f] of isolated.records.entries()) {
            const [a, b] = ['A', 'B'].map((name) => f.captures.find((d) => d.name === name));
            if (!a || !b) throw new Error(`Missing camera draw in isolation frame ${i}`);
            const priorB = isolated.records[i - 1]?.captures.find((d) => d.name === 'B');
            const expectedBHistory = priorB?.output ?? b.inputs.inputTexture;
            if (
                f.alias ||
                b.inputs.taaPrevTexture !== expectedBHistory ||
                JSON.stringify(b.atQueue.previous) !== JSON.stringify(priorB?.current ?? b.current) ||
                JSON.stringify(b.atQueue) !== JSON.stringify(b.afterFrame) ||
                JSON.stringify(a.atQueue) !== JSON.stringify(a.afterFrame) ||
                !f.pixels.B.sha256 ||
                b.atQueue.params[2] !== 0.75 ||
                a.atQueue.params[2] !== 0.95 ||
                f.pixels.B.sha256 !== bControl.records[i].pixels.B.sha256 ||
                (i >= 3 &&
                    (a.inputs.taaPrevTexture !== a.inputs.inputTexture ||
                        JSON.stringify(a.atQueue.previous) !== JSON.stringify(a.current))) ||
                (i === 4 && (f.pixels.A.width !== 192 || f.pixels.A.height !== 112))
            )
                throw new Error(`Camera-local cut/resize or B pixel isolation failed in frame ${i}`);
        }
    }
}

main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
