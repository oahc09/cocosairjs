const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
async function unlockAndMeasure (page) {
    // DOM media may finish its asynchronous clone/load after the first gesture.
    // Further clicks invoke PAL's own pending unlock listener; the fixture's service action is one-shot.
    for (let gestures = 1; gestures <= 20; gestures++) {
        await page.mouse.click(200, 200); await page.waitForTimeout(600);
        const first = await page.evaluate(() => window.__audioServiceProbe.state());
        if (!first?.playing || first.currentTime < 0.25 || first.currentTime > 0.8) continue;
        await page.waitForTimeout(100);
        const second = await page.evaluate(() => window.__audioServiceProbe.state());
        if (second.playing && second.currentTime > first.currentTime + 0.04) return { gestures, first, second };
    }
    throw new Error('BGM clock did not measurably advance after bounded trusted gestures');
}
async function main () {
    const arg = process.argv[2]; assert(arg?.startsWith('--out='), '--out=<new.json> required');
    const output = path.resolve(root, arg.slice(6)); assert(!fs.existsSync(output), 'new report required');
    const startedAt = new Date().toISOString(), files = ['src/air/audio-service.ts', 'build/cocosair.module.js',
        'test/fixtures/audio-service/main.ts', 'tools/verify/air-audio-service-browser.cjs', 'examples/audio-basic/assets/tone.wav'];
    const fingerprints = Object.fromEntries(files.map((file) => [file, hash(file)]));
    const results = [], server = await startExampleServer(root);
    try {
        const playwright = require('playwright');
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser;
            try {
                if (engine === 'webkit') assert(fs.existsSync(playwright.webkit.executablePath()), 'matching WebKit required');
                browser = await playwright[engine].launch({ ...launchOptions(engine), headless: true });
                const page = await browser.newPage(), errors = [];
                page.on('pageerror', (error) => errors.push(String(error)));
                await page.goto(server.origin + '/test/fixtures/audio-service/');
                await page.waitForFunction(() => window.__audioServiceProbe?.ready);
                const startupClock = await unlockAndMeasure(page);
                const playing = startupClock.second;
                assert.equal(playing.volume, 0.35); assert.equal(playing.id, 'a');
                await page.evaluate(() => window.__audioServiceProbe.pause());
                await page.waitForFunction(() => !window.__audioServiceProbe.state().playing);
                const paused = await page.evaluate(() => window.__audioServiceProbe.state());
                await page.waitForTimeout(200);
                const stillPaused = await page.evaluate(() => window.__audioServiceProbe.state());
                assert(Math.abs(stillPaused.currentTime - paused.currentTime) < 0.03);
                await page.evaluate(() => window.__audioServiceProbe.resume());
                await page.mouse.click(200, 200);
                await page.waitForTimeout(150); await page.mouse.click(200, 200);
                await page.waitForFunction((time) => window.__audioServiceProbe.state().currentTime > time + 0.12, paused.currentTime);
                const resumed = await page.evaluate(() => window.__audioServiceProbe.state());
                await page.evaluate(() => window.__audioServiceProbe.stop());
                await page.waitForFunction(() => !window.__audioServiceProbe.state().playing && window.__audioServiceProbe.state().currentTime < 0.03);
                const stopped = await page.evaluate(() => window.__audioServiceProbe.state());
                assert.equal(stopped.id, 'a'); assert.equal(stopped.volume, 0.35);
                await page.waitForTimeout(200);
                assert((await page.evaluate(() => window.__audioServiceProbe.state())).currentTime < 0.03);
                await page.evaluate(() => window.__audioServiceProbe.resume());
                await page.mouse.click(200, 200);
                await page.waitForTimeout(150); await page.mouse.click(200, 200);
                await page.waitForFunction(() => window.__audioServiceProbe.state().currentTime > 0.1);
                const restarted = await page.evaluate(() => window.__audioServiceProbe.state());
                assert(restarted.currentTime < resumed.currentTime);
                await page.evaluate(() => { window.__audioServiceProbe.volume(0.2); window.__audioServiceProbe.switch(); });
                const switchedClock = await unlockAndMeasure(page);
                const switched = switchedClock.second; assert.equal(switched.id, 'b'); assert.equal(switched.volume, 0.2);
                const invalidCode = await page.evaluate(() => { try { window.__audioServiceProbe.volume(NaN); } catch (error) { return error.code; } });
                assert.equal(invalidCode, 'AIR_E_AUDIO_VOLUME');
                assert.equal(await page.evaluate(() => window.__audioServiceProbe.dispose()), null); assert.deepEqual(errors, []);
                results.push({ engine, status: 'PASS', browserVersion: browser.version(), startupClock, playing, paused, stillPaused, resumed, stopped, restarted, switchedClock, switched, invalidCode });
            } catch (error) { results.push({ engine, status: 'FAIL', error: String(error.stack || error) }); }
            finally { if (browser) await browser.close(); }
            console.error('[audio-service] ' + JSON.stringify(results.at(-1)));
        }
        for (const file of files) assert.equal(hash(file), fingerprints[file], 'candidate drift: ' + file);
        const completed = results.length === 3 && results.every((result) => result.status === 'PASS');
        fs.writeFileSync(output, JSON.stringify({ startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root,
            scope: ['PG-05 BGM pause/resume/stop/volume with measured browser clock'], subset: true, completed, fingerprints, results }, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = completed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
