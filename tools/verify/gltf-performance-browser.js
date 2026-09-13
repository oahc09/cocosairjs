/* playwright-cli run-code --filename=tools/verify/gltf-performance-browser.js
 * V0.5 G5 §10 measurement: 30 cold-cache loads of the byte-verified official BoxTextured.glb
 * through the public parse entry (fetch bytes -> parseAsync resolving after buffer/texture
 * decode), reporting median/p5/p95 as the frozen V0.5 delivery baseline (G0 recorded no timing
 * number, so the baseline is established here per plan: re-measure and freeze the delivery
 * baseline when the original environment cannot be reproduced). Also proves the §10 capability
 * clause: loading an uncompressed model initializes no WebAssembly module and no Worker —
 * counters wrap the APIs before any glTF work and must stay at zero.
 * Requires serve-gltf.cjs on 7462 + built bundle. */
async (page) => {
    const errors = [];
    page.on('console', (m) => { if (/shader|WebGL|glTF/i.test(m.text()) && (m.type() === 'error' || m.type() === 'warning')) errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.goto('http://127.0.0.1:7462/gltf-viewer/');
    const result = await page.evaluate(async () => {
        const { createAirApp } = await import('/build/cocosair.module.js');
        void createAirApp; // engine already running from the viewer page
        // Wrap capability probes BEFORE any glTF load.
        const counts = { wasmInstantiate: 0, wasmCompile: 0, workers: 0 };
        const nativeInstantiate = WebAssembly.instantiate.bind(WebAssembly);
        WebAssembly.instantiate = (...args) => { counts.wasmInstantiate++; return nativeInstantiate(...args); };
        if (WebAssembly.compile) {
            const nativeCompile = WebAssembly.compile.bind(WebAssembly);
            WebAssembly.compile = (...args) => { counts.wasmCompile++; return nativeCompile(...args); };
        }
        const NativeWorker = window.Worker;
        window.Worker = function (...args) { counts.workers++; return new NativeWorker(...args); };

        const { GLTFLoader } = await import('/build/cocosair.module.js');
        const url = '/gltf-viewer/assets/BoxTextured.glb';
        const runs = [];
        for (let i = 0; i < 30; i++) {
            const response = await fetch(url + '?run=' + i, { cache: 'no-store' });
            const bytes = await response.arrayBuffer();
            const loader = new GLTFLoader();
            const start = performance.now();
            const asset = await loader.parseAsync(bytes);
            runs.push(performance.now() - start);
            asset.destroy();
            await new Promise((r) => setTimeout(r, 20));
        }
        const sorted = [...runs].sort((a, b) => a - b);
        const at = (q) => { const idx = Math.round(q * (sorted.length - 1)); return Math.round(sorted[idx] * 100) / 100; };
        return {
            runsMs: runs.map((r) => Math.round(r * 100) / 100),
            median: at(0.5), p5: at(0.05), p95: at(0.95), min: sorted[0], max: sorted[sorted.length - 1],
            wasmAfterUncompressedLoad: counts,
            ua: navigator.userAgent.slice(0, 120),
            webgl2: !!document.querySelector('canvas').getContext('webgl2'),
        };
    });
    return JSON.stringify({ ok: errors.length === 0, errors: errors.slice(0, 3), result }, null, 1);
}
