// Opt-in single-browser experiment: native clip sampling and WebGL2 readback; no engine scheduling change.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');

const root = path.resolve(__dirname, '../..');
const readSha = (name) =>
    createHash('sha256')
        .update(readFileSync(path.join(root, name)))
        .digest('hex');
async function main() {
    const [engine, out] = process.argv.slice(2);
    assert(['chromium', 'firefox', 'webkit'].includes(engine) && out, 'usage: <chromium|firefox|webkit> <new.json>');
    const files = [
        'build/cocosair.module.js',
        'test/fixtures/crowd-pose/index.html',
        'test/fixtures/crowd-pose/main.ts',
        'test/fixtures/upstream-skinning/rig.gltf',
        'tools/verify/crowd-pose-browser.cjs',
    ];
    const fingerprints = Object.fromEntries(files.map((name) => [name, readSha(name)]));
    const server = await startExampleServer(root);
    let browser;
    try {
        browser = await require('playwright')[engine].launch({ headless: true, ...launchOptions(engine) });
        const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(server.origin + '/test/fixtures/crowd-pose/');
        await page
            .waitForFunction(() => window.__crowdPoseExperiment || false, null, { timeout: 30000 })
            .catch((error) => {
                throw Error(String(error) + '\n' + errors.join('\n'));
            });
        const trial = (selective) => page.evaluate((b) => window.__crowdPoseExperiment.run(b), selective);
        const waves = [];
        try {
            // Warm up each arm before an ABBA order, identical pose timeline and camera.
            await trial(false);
            await trial(true);
            for (const selective of [false, true, true, false]) waves.push({ selective, ...(await trial(selective)) });
        } finally {
            await page.evaluate(() => window.__crowdPoseExperiment.close());
            await page.close();
        }
        const baseline = waves[0];
        const checks = {
            pageErrorFree: !errors.length,
            poseWorkSelected: waves.every(
                (r) =>
                    r.updates.length === 60 &&
                    (r.selective
                        ? r.skipped > 0 && r.updates.every((n) => n > 0 && n < 200)
                        : r.updates.every((n) => n === 200)),
            ),
            reentered: waves.every((r) => r.reentries > 0),
            readbackValid: waves.every(
                (r) =>
                    r.captures.length === 10 &&
                    r.errors.every((e) => !e) &&
                    r.captures.every((c) => c.visiblePixels > 100) &&
                    new Set(r.captures.map((c) => c.sha256)).size > 2,
            ),
            pixelsEqual: waves.every((r) => JSON.stringify(r.captures) === JSON.stringify(baseline.captures)),
        };
        for (const name of files) assert.equal(readSha(name), fingerprints[name], 'changed during capture: ' + name);
        const pass = Object.values(checks).every(Boolean);
        const report = {
            status: pass ? 'PASS' : 'FAIL',
            engine,
            version: browser.version(),
            actors: 200,
            framesPerTrial: 60,
            fingerprints,
            checks,
            errors,
            waves,
            scope: 'Native manual clip sampling and byte-identical near-frustum reentry snapshots only. CPU timings cover pose sampling, not frame or GPU time.',
            unverified: [
                'production animation scheduling',
                'actual shadow-only coverage',
                'clip event delivery',
                'saved-pose reentry between sampled frames',
                'physical device performance',
                'memory and battery gains',
            ],
        };
        writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.log(
            JSON.stringify(
                {
                    status: report.status,
                    checks,
                    timingP95Us: waves.map((w) => w.poseSamplingCpuP95Us),
                    skipped: waves.map((w) => w.skipped),
                    reentries: waves.map((w) => w.reentries),
                },
                null,
                2,
            ),
        );
        if (!pass) process.exitCode = 1;
    } finally {
        try {
            if (browser) await browser.close();
        } finally {
            await server.close();
        }
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
