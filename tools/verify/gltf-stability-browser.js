/* playwright-cli run-code --filename=tools/verify/gltf-stability-browser.js
 * V0.5 G5 §10 stability: 12 cycles of parse -> instantiate -> render frame -> full destroy of
 * the byte-verified official BoxTextured.glb. Asserts per cycle that engine scene model counts
 * return to the baseline after teardown (no model/node leak), that createObjectURL/Blob usage
 * stays balanced (revoke in finally), and that the JS heap delta between the first and last
 * cycles stays within noise. Failures exit non-zero via ok:false.
 * Requires serve-gltf.cjs on 7462 + built bundle. */
async (page) => {
    const errors = [];
    page.on('console', (m) => { if (/shader|WebGL|glTF/i.test(m.text()) && (m.type() === 'error' || m.type() === 'warning')) errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto('http://127.0.0.1:7462/gltf-viewer/');
    const result = await page.evaluate(async () => {
        const { GLTFLoader, director } = await import('/build/cocosair.module.js');
        const scene = director.getScene();
        // wrap createObjectURL to audit balance
        const nativeCreate = URL.createObjectURL.bind(URL);
        let created = 0; let revoked = 0;
        URL.createObjectURL = (b) => { created++; return nativeCreate(b); };
        const nativeRevoke = URL.revokeObjectURL.bind(URL);
        URL.revokeObjectURL = (u) => { revoked++; return nativeRevoke(u); };
        const heap = () => (performance.memory ? performance.memory.usedJSHeapSize : 0);
        const renderScene = scene._renderScene || (director.root && director.root.activeScene && director.root.activeScene._renderScene);
        const modelCount = () => (renderScene && renderScene.models ? renderScene.models.length : scene.children.length);
        const samples = [];
        // Cycle 0 is warmup: the pipeline lazily registers the skybox model into the
        // render scene on first draw, a constant +1 baseline, not a per-cycle leak.
        for (let cycle = 0; cycle < 12; cycle++) {
            const bytes = await (await fetch('/gltf-viewer/assets/BoxTextured.glb?c=' + cycle, { cache: 'no-store' })).arrayBuffer();
            const asset = await new GLTFLoader().parseAsync(bytes);
            const before = modelCount();
            const instance = asset.instantiate();
            scene.addChild(instance.root);
            await new Promise((r) => setTimeout(r, 60));
            await new Promise((r) => requestAnimationFrame(() => r()));
            const peak = modelCount();
            instance.root.destroy();
            asset.destroy();
            // deferred destruction flush (engine does it on next frames; force idle wait)
            await new Promise((r) => setTimeout(r, 120));
            samples.push({ cycle, before, peak, after: modelCount(), rootAlive: instance.root.isValid, urlBalance: created - revoked, heapMB: Math.round(heap() / 1048576 * 10) / 10 });
        }
        const first = samples.slice(0, 3).reduce((s, x) => s + x.heapMB, 0) / 3;
        const last = samples.slice(-3).reduce((s, x) => s + x.heapMB, 0) / 3;
        return { samples, leakedModels: samples.filter((sample) => sample.cycle > 0 && sample.after > sample.before).length,
            urlUnbalanced: samples.some((s) => s.urlBalance !== 0),
            heapFirstMB: Math.round(first * 10) / 10, heapLastMB: Math.round(last * 10) / 10,
            heapDeltaMB: Math.round((last - first) * 10) / 10, glError: document.querySelector('canvas').getContext('webgl2').getError() };
    });
    const failures = [];
    if (errors.length) { failures.push('console errors: ' + errors.slice(0, 2).join(' | ')); }
    if (result.leakedModels !== 0) { failures.push('models leaked in ' + result.leakedModels + ' cycles'); }
    if (result.urlUnbalanced) { failures.push('createObjectURL/revoke imbalance detected'); }
    if (result.samples.some((sample) => sample.rootAlive)) { failures.push('destroyed instance root still alive'); }
    if (result.heapDeltaMB > 8) { failures.push('heap grew ' + result.heapDeltaMB + 'MB over cycles'); }
    if (result.glError !== 0) { failures.push('GL error ' + result.glError); }
    return JSON.stringify({ ok: failures.length === 0, failures, result }, null, 1);
}
