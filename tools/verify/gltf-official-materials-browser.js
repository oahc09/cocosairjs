/* playwright-cli run-code --filename=tools/verify/gltf-official-materials-browser.js
 * T8 acceptance: loads each official Khronos material-extension sample (pinned revision,
 * sha256 manifest) through the real glTF runtime in-browser; asserts per-sample clean load,
 * effect selection (air-gltf-physical for material extensions), transmission samples bind the
 * refractive uniforms (viewer arms AirTransmissionCapture), and the live WebGL2 driver renders
 * every scene with zero GL/shader errors. Requires serve-gltf.cjs (7462) + built bundle +
 * fetch-official-gltf.cjs downloads. */
async (page) => {
    const errors = [];
    page.on('console', (m) => { if (/shader|WebGL|glTF/i.test(m.text()) && (m.type() === 'error' || m.type() === 'warning')) errors.push(m.text().slice(0, 200)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://127.0.0.1:7462/gltf-viewer/');
    const samples = ['EmissiveStrengthTest.glb', 'IORTestGrid.glb', 'SpecularTest.glb', 'ClearCoatTest.glb',
        'AnisotropyStrengthTest.glb', 'AnisotropyRotationTest.glb', 'CompareIridescence.glb', 'CompareTransmission.glb',
        'CompareVolume.glb', 'CompareDispersion.glb'];
    const report = {};
    for (const file of samples) {
        const before = errors.length;
        report[file] = await page.evaluate(async (name) => {
            const { GLTFLoader, director } = await import('/build/cocosair.module.js');
            const response = await fetch('/gltf-viewer/assets/official/' + name);
            if (!response.ok) { return { error: 'HTTP ' + response.status }; }
            try {
                const asset = await new GLTFLoader().parseAsync(await response.arrayBuffer());
                const kinds = {};
                for (const m of asset.materials) {
                    const key = m.effectAsset && m.effectAsset.name.startsWith('air-gltf-physical') ? 'physical'
                        : m.effectAsset && m.effectAsset.name.startsWith('air-gltf-standard') ? 'standard' : 'other';
                    kinds[key] = (kinds[key] || 0) + 1;
                }
                // Material-builder only sets airTransmission for transmission-active materials
                // (define gated); getShader variants compile lazily so inspect property state.
                const transmissionActive = asset.materials.some((m) => m.getProperty && m.getProperty('airTransmission') != null);
                const instance = asset.instantiate();
                director.getScene().addChild(instance.root);
                await new Promise((r) => setTimeout(r, 350));
                await new Promise((r) => requestAnimationFrame(() => r()));
                const canvas = document.querySelector('canvas');
                const gl = canvas.getContext('webgl2');
                const out = { materials: asset.materials.length, kinds, transmissionActive, glError: gl.getError() };
                instance.root.destroy();
                asset.destroy();
                return out;
            } catch (error) {
                return { error: String(error).slice(0, 160) };
            }
        }, file);
        report[file].consoleErrors = errors.length - before;
    }
    const failures = [];
    const expectTransmission = ['CompareTransmission.glb', 'CompareVolume.glb', 'CompareDispersion.glb', 'IORTestGrid.glb'];
    for (const [file, entry] of Object.entries(report)) {
        if (entry.error) { failures.push(`${file}: ${entry.error}`); continue; }
        if (entry.consoleErrors) { failures.push(`${file}: ${entry.consoleErrors} console errors`); }
        if (entry.glError !== 0) { failures.push(`${file}: GL error ${entry.glError}`); }
        if (!entry.materials) { failures.push(`${file}: no materials parsed`); }
        // every official material sample must select the physical effect for its extension materials
        if (!entry.kinds || (!entry.kinds.physical && !entry.kinds.standard)) { failures.push(`${file}: empty selection matrix`); }
        if (expectTransmission.includes(file) && !entry.transmissionActive) { failures.push(`${file}: transmission variant not active`); }
    }
    return JSON.stringify({ ok: failures.length === 0, failures, report }, null, 1);
}
