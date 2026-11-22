// Opt-in single-browser experiment: native clip sampling and WebGL2 readback; no engine scheduling change.
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { readFileSync, realpathSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');

const root = path.resolve(__dirname, '../..');
const readSha = (name) =>
    createHash('sha256')
        .update(readFileSync(path.join(root, name)))
        .digest('hex');
async function main() {
    const [engine, out, option, ...extra] = process.argv.slice(2);
    assert(
        ['chromium', 'firefox', 'webkit'].includes(engine) &&
            out &&
            !extra.length &&
            (option === undefined || /^--bundle=.+$/.test(option)),
        'usage: <chromium|firefox|webkit> <new.json> [--bundle=<workspace ESM bundle>]',
    );
    const fixture = 'test/fixtures/crowd-pose/index.html';
    const override = option !== undefined;
    const bundle = override ? realpathSync(path.resolve(root, option.slice('--bundle='.length))) : null;
    let binding;
    let bundleName = 'build/cocosair.module.js';
    if (override) {
        assert(
            bundle.startsWith(realpathSync(root) + path.sep) && bundle.endsWith('.js'),
            'The candidate must be a workspace .js bundle',
        );
        bundleName = path.relative(realpathSync(root), bundle).split(path.sep).join('/');
        binding = verifySourceBinding(root, bundle);
        assert(
            binding.matches && binding.origin === 'compiler-map',
            'Candidate requires a matching compiler-map source binding: ' + JSON.stringify(binding),
        );
    }
    const files = [
        bundleName,
        ...(override ? [bundleName + '.map', bundleName + '.sources.json', 'tools/build/source-binding.cjs'] : []),
        fixture,
        'test/fixtures/crowd-pose/main.ts',
        'test/fixtures/upstream-skinning/rig.gltf',
        'tools/verify/crowd-pose-browser.cjs',
    ];
    const fingerprints = Object.fromEntries(files.map((name) => [name, readSha(name)]));
    const server = await startExampleServer(root);
    let browser;
    try {
        browser = await require('playwright')[engine].launch({
            headless: true,
            ...launchOptions(engine),
            env: loopbackBrowserEnv(),
        });
        const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(String(error)));
        const fixtureUrl = server.origin + '/test/fixtures/crowd-pose/';
        const sdkUrl = server.origin + '/' + bundleName.split('/').map(encodeURIComponent).join('/');
        // Replace only this fixture's import map for the explicitly requested run. The HTML on disk
        // and the default Playwright/direct-browser path still load the historical default bundle.
        if (override) {
            const html = readFileSync(path.join(root, fixture), 'utf8');
            const mapEntry = '"cocosair": "/build/cocosair.module.js"';
            assert.equal(html.split(mapEntry).length, 2, 'Expected one crowd fixture SDK mapping');
            await page.route(fixtureUrl, (route) =>
                route.fulfill({
                    contentType: 'text/html',
                    body: html.replace(mapEntry, '"cocosair": ' + JSON.stringify(sdkUrl)),
                }),
            );
        }
        const [sdkResponse] = await Promise.all([
            page.waitForResponse(sdkUrl, { timeout: 30000 }),
            page.goto(fixtureUrl),
        ]);
        assert(sdkResponse.ok(), 'Crowd fixture did not load the selected bundle');
        assert.equal(
            createHash('sha256')
                .update(await sdkResponse.body())
                .digest('hex'),
            fingerprints[bundleName],
            'Browser bundle bytes do not match the selected artifact',
        );
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
        if (override) assert.deepEqual(verifySourceBinding(root, bundle), binding, 'Candidate source binding changed');
        const pass = Object.values(checks).every(Boolean);
        const report = {
            status: pass ? 'PASS' : 'FAIL',
            engine,
            version: browser.version(),
            actors: 200,
            framesPerTrial: 60,
            fingerprints,
            ...(override ? { candidate: { bundle: bundleName, sourceBinding: binding } } : {}),
            timingConclusion:
                'DIAGNOSTIC_ONLY: No CPU speedup is inferred from these timings, including clock-floor samples.',
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
