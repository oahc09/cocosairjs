/* Software WebKit correctness/transport diagnostic for the deferred model effect. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { gzipSync } = require('node:zlib');
const { webkit } = require('playwright');
const { PNG } = require('pngjs');
const { digest, writeNew } = require('./evidence.cjs');
const { stripRuntimeSourceMap } = require('../../build/runtime-layout.cjs');

const html = `<!DOCTYPE html><html><head><link rel="icon" href="data:,">
<style>html,body{margin:0}canvas{display:block;width:480px;height:270px}</style></head>
<body><div id="GameDiv"><div id="Cocos3dGameContainer"><canvas id="GameCanvas" width="480" height="270"></canvas></div></div>
<script type="module" src="/page.mjs"></script></body></html>`;
const effectPath = '/optional-gltf-effect.json';

function countVisible(data) {
    const png = PNG.sync.read(data);
    let visible = 0;
    const background = png.data.subarray(0, 3);
    for (let i = 0; i < png.data.length; i += 4) {
        if ([0, 1, 2].some((c) => Math.abs(png.data[i + c] - background[c]) > 5)) visible++;
    }
    return visible;
}

async function main([fullPath, probeDir, executable, out, ...extra]) {
    if (!fullPath || !probeDir || !executable || !out || extra.length)
        throw new Error('Usage: node lazy-gltf-browser.cjs <full-sdk> <probe-dir> <WPE-executable> <new-out>');
    const full = Buffer.from(stripRuntimeSourceMap(fs.readFileSync(fullPath, 'utf8')));
    const reduced = fs.readFileSync(path.join(probeDir, 'runtime.mjs'));
    const sidecar = fs.readFileSync(path.join(probeDir, effectPath.slice(1)));
    const declared = JSON.parse(fs.readFileSync(path.join(probeDir, 'receipt.json'), 'utf8'));
    assert.equal(digest(reduced), declared.runtime.sha256);
    assert.equal(digest(sidecar), declared.payload.sha256);
    const pageJs = fs.readFileSync(path.join(__dirname, 'lazy-gltf-page.mjs'));
    fs.mkdirSync(out);
    const results = [];
    const cases = [
        ['full-delayed-default', false, false, false, false],
        ['probe-delayed-default', true, false, false, false],
        ['full-cold-physical', false, true, true, false],
        ['probe-cold-physical', true, true, true, false],
        ['probe-two-loads-cancel-one', true, false, false, true],
        ['probe-corrupt-effect-then-retry', true, false, false, false, true],
    ];
    for (const [id, lazy, cold, physical, pair, corrupt] of cases) {
        let held;
        let effectRequests = 0;
        const body = lazy ? reduced : full;
        const data = new Map([
            ['/', ['text/html', Buffer.from(html)]],
            ['/page.mjs', ['text/javascript', pageJs]],
            ['/runtime.mjs', ['text/javascript', body]],
            [effectPath, ['application/json', sidecar]],
        ]);
        const zipped = new Map([...data].map(([p, [type, bytes]]) => [p, [type, gzipSync(bytes, { level: 9 })]]));
        const send = (res, route) => {
            if (!zipped.has(route)) return res.writeHead(404).end();
            const [type, bytes] = zipped.get(route);
            res.writeHead(200, {
                'Content-Type': type,
                'Content-Encoding': 'gzip',
                'Cache-Control': 'no-store',
                'Content-Length': bytes.length,
            });
            return res.end(bytes);
        };
        const server = http.createServer((req, res) => {
            if (req.url === effectPath) {
                effectRequests++;
                if (corrupt && effectRequests === 1) {
                    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
                    return res.end('{}');
                }
                if (pair) {
                    if (held) return res.writeHead(500).end();
                    held = res;
                    return;
                }
            }
            return send(res, req.url);
        });
        let browser;
        const record = {
            id,
            errors: [],
            fullRuntimeSha256: digest(full),
            runtimeSha256: digest(body),
            assetsGzipBytes: {
                runtime: zipped.get('/runtime.mjs')[1].length,
                optionalEffect: lazy ? zipped.get(effectPath)[1].length : 0,
            },
        };
        try {
            await new Promise((resolve, reject) => {
                server.once('error', reject);
                server.listen(0, '127.0.0.1', resolve);
            });
            browser = await webkit.launch({ executablePath: path.resolve(executable) });
            record.browser = browser.version();
            const page = await browser.newPage({ viewport: { width: 480, height: 270 }, deviceScaleFactor: 1 });
            page.setDefaultTimeout(15000);
            page.on('pageerror', (error) => record.errors.push(error.message));
            page.on('console', (msg) => {
                if (msg.type() === 'error') record.errors.push(msg.text());
            });
            page.on('response', (res) => {
                if (res.status() >= 400) record.errors.push(`HTTP ${res.status()}`);
            });
            await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'commit' });
            await page.waitForFunction(() => Boolean(window.probe));
            record.before = await page.evaluate(
                ([cold, physical]) => window.probe.run(cold, physical),
                [cold, physical],
            );
            assert.equal(record.before.template, !lazy);
            assert.equal(effectRequests, 0);
            await page.evaluate((pair) => window.probe.begin(pair), pair);
            if (pair) {
                await page.waitForFunction(() => window.probe.snapshot().states.texturePhases >= 2);
                assert.ok(held, 'effect request never reached the gate');
                record.cancelled = await page.evaluate(() => window.probe.cancel());
                assert.equal(record.cancelled.aborted, true);
                assert.equal(record.cancelled.unexpectedlyAllocated, false);
                assert.equal(record.cancelled.registrations, 0);
                send(held, effectPath);
                held = null;
            }
            if (corrupt) {
                record.rejectedPayload = await page.evaluate(() => window.probe.finish(false));
                assert.match(record.rejectedPayload.error, /Optional glTF effect identity mismatch/);
                assert.equal(record.rejectedPayload.registrations, 0);
                await page.evaluate(() => window.probe.begin(false));
            }
            record.after = await page.evaluate((pair) => window.probe.finish(pair), pair);
            assert.equal(record.after.error, undefined);
            assert.equal(record.after.registrations, 1);
            assert.equal(record.after.physicalEffect, physical);
            assert.equal(effectRequests, corrupt ? 2 : Number(lazy));
            const arrivals = record.after.resources.filter(({ path }) => path === effectPath);
            assert.equal(arrivals.length, effectRequests);
            if (lazy) {
                const arrival = arrivals.at(-1);
                assert.equal(arrival.encoded, record.assetsGzipBytes.optionalEffect);
                assert.ok(arrival.responseEnd <= record.after.states.modelDraw);
                if (!cold) assert.ok(record.before.states.cubeDraw < arrival.responseEnd);
            }
            assert.equal(
                record.after.resources.find(({ path }) => path === '/runtime.mjs')?.encoded,
                record.assetsGzipBytes.runtime,
            );

            const image = await page.screenshot({ type: 'png' });
            record.foregroundPixels = countVisible(image);
            assert.ok(record.foregroundPixels > 500, 'no model pixels confirmed');
            record.imageSha256 = digest(image);
            fs.writeFileSync(path.join(out, id + '.png'), image, { flag: 'wx' });
            record.release = await page.evaluate(() => window.probe.cleanup());
            assert.equal(record.release.template, true);
            assert.equal(record.release.modelValid, false);
            assert.equal(record.release.anyMeshValid, false);
        } catch (error) {
            record.errors.push(error.message);
        } finally {
            if (held) held.destroy();
            if (browser) {
                try {
                    await browser.close();
                } catch (error) {
                    record.errors.push(error.message);
                }
            }
            await new Promise((resolve) => server.close(resolve));
            record.effectRequests = effectRequests;
            writeNew(path.join(out, id + '.json'), record);
            results.push(record);
        }
    }
    const [a, b, c, d, e, f] = results;
    const visualEqual = Boolean(
        a.imageSha256 &&
        a.imageSha256 === b.imageSha256 &&
        a.imageSha256 === e.imageSha256 &&
        a.imageSha256 === f.imageSha256 &&
        c.imageSha256 &&
        c.imageSha256 === d.imageSha256,
    );
    const passed = visualEqual && results.every((record) => !record.errors.length);
    writeNew(path.join(out, 'summary.json'), {
        scope: 'loopback software WebKit; direct SDK artifact; not npm or device certification',
        passed,
        visualEqual,
        cases: results.map(({ id, errors, foregroundPixels }) => ({ id, errors, foregroundPixels })),
    });
    if (!passed) throw new Error('glTF deferred diagnostic failed; see retained receipts');
}

main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
