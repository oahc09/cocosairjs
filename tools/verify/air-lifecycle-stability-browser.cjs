const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs'), { launchOptions } = require('./browser-engines.cjs');
const root = path.resolve(__dirname, '../..');
const hash = (f) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, f))).digest('hex');
function verifyRelease(r, timeout = false) {
    assert(r.samePromise); assert.equal(r.runCode, 'AIR_E_SCENE_RELEASING'); assert.equal(r.tokenCurrent, false);
    assert.equal(r.receipt.status, timeout ? 'failed' : 'released');
    assert.equal(r.after.scene, null); assert.equal(r.after.ownedCount, 0);
    assert.equal(r.after.sharedRefs, 1); assert(r.after.sharedValid);
    assert(r.assetsValid.every(v => !v));
    assert.equal(r.after.businessHits, r.before.businessHits); assert.equal(r.settled.businessHits, r.after.businessHits);
    assert.equal(r.after.frames, r.settled.frames); assert.equal(r.after.updates, r.settled.updates);
    assert.deepEqual(r.after.draws, r.settled.draws);
    if (timeout) { assert(r.elapsedMs >= 4900 && r.elapsedMs < 6500); assert(r.receipt.pending.some(v => v.startsWith('intentional-unresolved'))); }
    else { assert(r.elapsedMs < 5000); assert.deepEqual(r.receipt.pending, []); assert.deepEqual(r.receipt.failures, []); }
}
async function main() {
    const args = process.argv.slice(2), out = args.find(v => v.startsWith('--out='))?.slice(6);
    assert(out, '--out required'); const output = path.resolve(root, out); assert(!fs.existsSync(output), 'new report required');
    const bundle = args.find(v => v.startsWith('--bundle='))?.slice(9) ?? 'build/cocosair.module.js';
    assert(path.resolve(root, bundle).startsWith(root + path.sep), 'bundle must be inside repository');
    const duration = Number(args.find(v => v.startsWith('--duration-ms='))?.slice(14) ?? 600000);
    assert(Number.isInteger(duration) && duration >= 1000 && duration <= 600000);
    const contextOnly = args.includes('--context-only'), startedAt = new Date().toISOString();
    const files = [bundle, 'src/air/app.ts', 'src/air/session-scope.ts', 'src/air/context-health.ts',
        'test/fixtures/lifecycle-stability/main.ts', 'test/fixtures/lifecycle-stability/index.html', 'tools/verify/air-lifecycle-stability-browser.cjs'];
    const fingerprints = Object.fromEntries(files.map(f => [f, hash(f)]));
    const built = await require('esbuild').build({ entryPoints: [path.join(root, 'test/fixtures/lifecycle-stability/main.ts')],
        bundle: true, write: false, format: 'esm', target: 'es2022', alias: { cocosair: '/' + bundle }, external: ['/' + bundle] });
    const server = await startExampleServer(root), pw = require('playwright');
    async function run(engine) {
        let browser, observation; const cases = [], errors = [];
        try {
            browser = await pw[engine].launch({ ...launchOptions(engine), headless: true });
            const open = async () => {
                const page = await browser.newPage({ viewport: { width: 320, height: 240 } }); page.on('pageerror', e => errors.push(String(e)));
                await page.route('**/main.ts', route => route.fulfill({ contentType: 'text/javascript', body: built.outputFiles[0].text }));
                await page.goto(server.origin + '/test/fixtures/lifecycle-stability/');
                await page.waitForFunction(() => window.__lifecycle?.ready, null, { timeout: 60000 }); return page;
            };
            for (const kind of ['never-run', 'paused', 'lost', 'restored', 'timeout']) {
                const page = await open(); const row = await page.evaluate(kind => window.__lifecycle.contextCase(kind), kind); cases.push(row);
                assert(!row.notRun, row.notRun); assert.equal(row.beforeGate, false); verifyRelease(row.result, kind === 'timeout');
                assert(row.sameClose); assert.equal(row.sharedRefs, 0);
                if (kind === 'lost' || kind === 'restored') {
                    assert.equal(row.lostBefore.health.state, 'lost'); assert.equal(row.lostBefore.health.isContextLost, true);
                    assert.equal(row.lostBefore.health.gamePaused, true); assert.equal(row.lostBefore.frames, row.lostAfter.frames);
                    assert.equal(row.lostBefore.updates, row.lostAfter.updates); assert.deepEqual(row.lostBefore.draws, row.lostAfter.draws);
                    assert.equal(row.health.state, kind === 'lost' ? 'lost' : 'failed');
                    if (kind === 'lost') { assert(row.health.isContextLost); assert.equal(row.health.restoredCount, 0); }
                    else { assert(row.health.timeline.some(e => e.type === 'restoring')); assert.equal(row.reloads, 1); assert(row.reloadGate); }
                }
                if (kind === 'timeout') assert.equal(row.failedRunCode, 'AIR_E_SCENE_RELEASE_FAILED');
                assert.equal(row.close.status, kind === 'timeout' ? 'failed' : 'released');
                console.error(JSON.stringify({ engine, kind, status: 'PASS', elapsedMs: row.result.elapsedMs })); await page.close();
            }
            if (!contextOnly) {
                const page = await open(); console.error(JSON.stringify({ engine, stability: 'START', durationMs: duration }));
                observation = await page.evaluate(duration => window.__lifecycle.stability(duration), duration);
                assert(observation.elapsedMs >= duration); assert(observation.final.frames > 30); assert(observation.final.updates > 30);
                assert.equal(observation.sharedRefs, 0); assert.equal(observation.close.status, 'released');
                assert(observation.cycles.length >= Math.max(1, Math.floor(duration / 35000)));
                for (const c of observation.cycles) {
                    assert(c.active.frames > c.result.before.frames - 1); assert.equal(c.active.sharedRefs, 2); assert.equal(c.active.ownedCount, 1);
                    assert(c.active.pixel[0] > 180 && c.active.pixel[1] < 30 && c.active.pixel[2] < 30); verifyRelease(c.result);
                }
                assert(observation.diagnostics.every(v => v.severity !== 'error')); await page.close();
            }
            assert.deepEqual(errors, []); console.error(JSON.stringify({ engine, status: 'PASS', cycles: observation?.cycles.length, elapsedMs: observation?.elapsedMs }));
            return { engine, status: 'PASS', version: browser.version(), cases, observation, errors };
        } catch (e) { console.error(JSON.stringify({ engine, status: 'FAIL', error: String(e) }));
            return { engine, status: 'FAIL', cases, observation, errors, error: String(e.stack || e) }; }
        finally { await browser?.close(); }
    }
    try {
        const results = await Promise.all(['chromium', 'firefox', 'webkit'].map(run));
        for (const f of files) assert.equal(hash(f), fingerprints[f], 'candidate drift: ' + f);
        const passed = results.every(r => r.status === 'PASS');
        fs.writeFileSync(output, JSON.stringify({ startedAt, endedAt: new Date().toISOString(), command: process.argv, cwd: root,
            method: 'REAL_BROWSER', subset: true, completed: false, scopePassed: passed, fingerprints,
            scope: { contextCases: 5, tenMinute: !contextOnly && duration === 600000, requestedDurationMs: contextOnly ? 0 : duration },
            measurements: { gpuMemory: 'unavailable', jsHeap: 'only when browser exposes performance.memory' }, results }, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = passed ? 0 : 1;
    } finally { await server.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
