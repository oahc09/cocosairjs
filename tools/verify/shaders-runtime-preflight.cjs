'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const ROOT = path.resolve(__dirname, '../..');
const outArg = process.argv.find(arg => arg.startsWith('--out='));
const OUT = outArg && path.resolve(outArg.slice(6));
const HTML = '<!doctype html><html><head><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}canvas{display:block;width:100%;height:100%}</style></head><body><canvas id="GameCanvas"></canvas></body></html>';
const profiles = [
    { id: '720p', viewport: { width: 1280, height: 720 }, dpr: 1 },
    { id: '1080p', viewport: { width: 1920, height: 1080 }, dpr: 1 },
    { id: 'mobile-dpr', viewport: { width: 390, height: 844 }, dpr: 2 },
];
const fingerprint = file => {
    const bytes = fs.readFileSync(path.join(ROOT, file));
    return { path: file, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
};
async function main() {
    if (!OUT) throw new Error('Explicit --out=<new.json> is required.');
    if (fs.existsSync(OUT)) throw new Error('Preflight output exists; use a new attempt path.');
    const report = {
        schemaVersion: 'shaders-wave0-runtime-preflight/1',
        method: 'REAL_BROWSER_NATIVE_EMPTY_SCENE',
        executionChannel: 'Lead',
        startedAt: new Date().toISOString(),
        command: [process.execPath, ...process.argv.slice(1)],
        cwd: ROOT,
        subset: true,
        completed: false,
        effectEngineGates: 'NOT_RUN',
        agentGate: 'NOT_RUN',
        fingerprintsBefore: ['build/cocosair.module.js', 'build/cocosair.module.d.ts', 'build/npm/cocosair.module.js', 'tools/verify/shaders-runtime-preflight.cjs'].map(fingerprint),
        rows: [],
        limitations: ['Headless browser profiles, not physical mobile devices.', 'Empty native scene startup only; no effect correctness, shader gate, resource-100 or performance benchmark claimed.', 'Timer extension discovery does not constitute a measured GPU timestamp.'],
    };
    const server = await startExampleServer(ROOT);
    try {
        for (const engine of ['chromium', 'firefox', 'webkit']) {
            let browser;
            try {
                browser = await require('playwright')[engine].launch({ ...launchOptions(engine), headless: true });
                for (const profile of profiles) {
                    const page = await browser.newPage({ viewport: profile.viewport, deviceScaleFactor: profile.dpr });
                    const row = { engine, browserVersion: browser.version(), profile, startedAt: new Date().toISOString(), pageErrors: [], consoleErrors: [] };
                    report.rows.push(row);
                    page.on('pageerror', error => row.pageErrors.push(String(error.stack || error)));
                    page.on('console', message => { if (message.type() === 'error') row.consoleErrors.push(message.text()); });
                    try {
                        await page.route('**/__shaders_wave0__', route => route.fulfill({ contentType: 'text/html', body: HTML }));
                        await page.goto(server.origin + '/__shaders_wave0__');
                        row.observation = await page.evaluate(async () => {
                            const cc = await import('/build/cocosair.module.js');
                            const app = await cc.createAirApp({ canvas: '#GameCanvas' });
                            let result;
                            try {
                                const scene = new cc.Scene('ShadersWave0EnvironmentOnly');
                                app.run(scene);
                                const clock = cc.createStepClock();
                                clock.begin();
                                const receipt = await clock.step(1 / 60);
                                const canvas = document.getElementById('GameCanvas');
                                // Inspect the engine-owned context; no independent GL drawing or second canvas.
                                const gl = canvas.getContext('webgl2');
                                const rect = canvas.getBoundingClientRect();
                                result = {
                                    sceneIsNative: app.getScene() === scene,
                                    steppedFrame: receipt,
                                    enginePaused: cc.game.isPaused(),
                                    canvasCount: document.querySelectorAll('canvas').length,
                                    css: { width: rect.width, height: rect.height },
                                    backing: { width: canvas.width, height: canvas.height },
                                    devicePixelRatio,
                                    webglVersion: gl?.getParameter(gl.VERSION),
                                    timerExtensionAvailable: !!gl?.getExtension('EXT_disjoint_timer_query_webgl2'),
                                    gpuTimestamp: { status: 'NOT_RUN', reason: 'Environment discovery only; no timer query submitted.' },
                                };
                            } finally {
                                const closeA = app.close();
                                const closeB = app.close();
                                const closeReceipt = await closeA;
                                if (result) result.close = { samePromise: closeA === closeB, receipt: closeReceipt, sceneCleared: app.getScene() === null };
                            }
                            return result;
                        });
                        const o = row.observation;
                        row.status = o.sceneIsNative && o.enginePaused && o.canvasCount === 1 && o.steppedFrame.afterDraw === true && o.close.samePromise && o.close.sceneCleared && /WebGL 2/.test(o.webglVersion) && row.pageErrors.length === 0 && row.consoleErrors.length === 0 ? 'PASS' : 'FAIL';
                    } catch (error) {
                        row.status = 'FAIL';
                        row.error = String(error.stack || error);
                    } finally {
                        row.endedAt = new Date().toISOString();
                        await page.close();
                    }
                    process.stdout.write(JSON.stringify({ engine, profile: profile.id, status: row.status, error: row.error }) + '\n');
                }
            } catch (error) {
                report.rows.push({ engine, status: 'FAIL', failureStage: 'environment', error: String(error.stack || error) });
            } finally {
                if (browser) await browser.close();
            }
        }
    } finally {
        await server.close();
        report.fingerprintsAfter = report.fingerprintsBefore.map(f => fingerprint(f.path));
        report.inputsUnchanged = JSON.stringify(report.fingerprintsBefore) === JSON.stringify(report.fingerprintsAfter);
        report.endedAt = new Date().toISOString();
        report.scopePassed = report.rows.length === 9 && report.rows.every(r => r.status === 'PASS') && report.inputsUnchanged;
        report.exitCode = report.scopePassed ? 0 : 1;
        fs.mkdirSync(path.dirname(OUT), { recursive: true });
        fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        process.exitCode = report.exitCode;
    }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
