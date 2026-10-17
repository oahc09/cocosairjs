const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const root = process.cwd();
const { BrowserRuntime } = require(path.join(root, 'tools/benchmark/runner/browser-runtime.cjs'));
const { sourceFingerprint } = require(path.join(root, 'tools/verify/webgpu-candidate.cjs'));
const workspace = path.join(__dirname, 'workspace');
fs.mkdirSync(workspace);
let html = fs.readFileSync(path.join(root, 'examples/profiler-overlay/index.html'), 'utf8');
html = html.replace('</body>', '<script src="/__bench-prelude.js"></script></body>');
fs.writeFileSync(path.join(workspace, 'index.html'), html);
const source = fs.readFileSync(path.join(root, 'examples/profiler-overlay/main.js'), 'utf8');
if (!source.includes('createAirApp({ canvas })')) throw Error('Profiler fixture changed');
fs.writeFileSync(path.join(workspace, 'main.js'), source.replace('createAirApp({ canvas })', "createAirApp({ canvas, renderer: 'webgpu' })"));
const runtime = new BrowserRuntime({ repo: root, esbuild: require(path.join(root, 'node_modules/esbuild')) });
const startedAt = new Date().toISOString();
const sourceSha256 = sourceFingerprint(root);
(async () => {
    let report;
    try {
        await runtime.start({ paths: { workspace } });
        await runtime.page.waitForFunction(() => typeof window.__probe === 'function', null, { polling: 50 });
        const gpuErrors = [];
        await runtime.page.evaluate(async () => {
            const m = await import('/build/cocosair.module.js');
            window.__utilityGpuErrors = [];
            m.director.root.device.nativeDevice.addEventListener('uncapturederror', e => window.__utilityGpuErrors.push(e.error.message));
            const clock = m.createStepClock();
            clock.begin();
            for (let i = 0; i < 5; i++) await clock.step();
            await m.director.root.device.nativeDevice.queue.onSubmittedWorkDone();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        const state = await runtime.page.evaluate(async () => {
            const m = await import('/build/cocosair.module.js');
            const adapter = await navigator.gpu.requestAdapter();
            return { api: m.director.root.device.gfxAPI, paused: m.game.isPaused(), probe: await window.__probe(), gpuErrors: window.__utilityGpuErrors, isFallbackAdapter: adapter.isFallbackAdapter ?? false };
        });
        gpuErrors.push(...state.gpuErrors);
        const png = await runtime.page.screenshot({ path: path.join(__dirname, 'profiler-webgpu.png') });
        const errors = [...runtime.pageErrors, ...runtime.consoleErrors];
        const { PNG } = require('pngjs');
        const pixels = PNG.sync.read(png);
        let hudPixels = 0;
        for (let y = pixels.height - 95; y < pixels.height - 8; y++) for (let x = 15; x < 150; x++) {
            const i = (y * pixels.width + x) * 4;
            if (pixels.data[i] > 160 && pixels.data[i+1] > 160 && pixels.data[i+2] > 160) hudPixels++;
        }
        const passed = state.api === 8 && state.paused && state.probe.overlayActive && Object.keys(state.probe.counters).length > 0 && !state.isFallbackAdapter && !gpuErrors.length && !errors.length && hudPixels > 50;
        report = { completed: true, passed, startedAt, finishedAt: new Date().toISOString(), sourceSha256, sourceUnchanged: sourceFingerprint(root) === sourceSha256, browserVersion: runtime.browser.version(), fixture: 'Existing profiler-overlay source with only explicit renderer selection in a temporary workspace', state, errors, hudPixels, pngSha256: crypto.createHash('sha256').update(png).digest('hex') };
        fs.writeFileSync(path.join(__dirname, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report));
        process.exitCode = passed && report.sourceUnchanged ? 0 : 1;
    } finally { await runtime.stop(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
