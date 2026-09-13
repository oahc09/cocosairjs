/* playwright-cli run-code --filename=tools/verify/gltf-iridescence-browser.js
 * T5.2 iridescence real-browser evidence: the thin-film Airy helper (per-RGB spectral F0
 * on the dielectric base) compiles on the live WebGL2 driver with zero GL errors; the
 * iridescent material selects air-gltf-physical with the packed airIridescence uniform
 * (factor, filmIor, min, max) and the scene renders. Spectral appearance comparison with
 * the official Khronos film samples is deferred to T8.
 * Requires: node tools/verify/serve-gltf.cjs (port 7462) and a built ESM bundle. */
async (page) => {
    const errors = [];
    page.on('console', (m) => { if (/shader|WebGL|glTF/i.test(m.text()) && (m.type() === 'error' || m.type() === 'warning')) errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://127.0.0.1:7462/gltf-viewer/');
    await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('physical.glb');
    await page.waitForFunction(() => window.gltfViewer?.name === 'physical.glb', undefined, { timeout: 30000 });
    const result = await page.evaluate(async () => {
        const { Vec4 } = await import('/build/cocosair.module.js');
        const viewer = window.gltfViewer;
        const byName = {};
        for (const m of viewer.asset.materials) { byName[m.name] = m; }
        const film = byName['iridescent film'];
        const read = (m) => { for (const pass of m.passes) { const h = pass.getHandle('airIridescence');
            if (!h) { continue; } const v = new Vec4(); pass.getUniform(h, v); return [v.x, v.y, v.z, v.w]; } return null; };
        await new Promise((r) => setTimeout(r, 800));
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2');
        const frame = await new Promise((resolve) => requestAnimationFrame(() => {
            const px = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px); resolve(px);
        }));
        let lit = 0;
        for (let i = 0; i < frame.length; i += 4) { if (frame[i] + frame[i + 1] + frame[i + 2] > 150) lit++; }
        return { effect: film.effectAsset.name, uniform: read(film),
            samplerBound: film.passes.some((p) => p.getHandle('airIridescenceUV0') !== 0),
            compiled: lit > 10000, glError: gl.getError() };
    });
    await page.screenshot({ path: 'output/gltf-iridescence-viewer.png' });
    const failures = [];
    if (errors.length) { failures.push('console errors: ' + errors.slice(0, 3).join(' | ')); }
    if (result.effect !== 'air-gltf-physical') { failures.push('film effect: ' + result.effect); }
    if (!result.uniform || Math.abs(result.uniform[0] - 1) > 1e-4 || Math.abs(result.uniform[1] - 1.8) > 1e-4
        || Math.abs(result.uniform[2] - 200) > 1 || Math.abs(result.uniform[3] - 450) > 1) {
        failures.push('airIridescence uniform: ' + JSON.stringify(result.uniform));
    }
    if (!result.samplerBound) { failures.push('iridescence UV uniforms not bound'); }
    if (!result.compiled) { failures.push('scene did not render lit pixels'); }
    if (result.glError !== 0) { failures.push('GL error: ' + result.glError); }
    return JSON.stringify({ ok: failures.length === 0, failures, result }, null, 1);
}
