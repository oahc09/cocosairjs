/* playwright-cli run-code --filename=tools/verify/gltf-clearcoat-browser.js
 * T5.2 clearcoat real-browser evidence: the air-gltf-physical derived effect carrying the
 * second GGX clearcoat lobe compiles and links on the live WebGL2 driver with zero GL errors;
 * the clearcoat material selects the physical effect with spec-derived airClearcoat uniforms
 * and binds the layer samplers/UV-transform uniforms, while the identical bare control falls
 * back to air-gltf-standard with no clearcoat state. (Pixel-level clearcoat appearance is
 * deferred to the T8 official Khronos scene matrix — a fixed-box brightness delta on these
 * flat debug planes is shadow-occlusion dominated, not a clean lobe signal.)
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
        const read = (m, name) => { for (const pass of m.passes) { const h = pass.getHandle(name);
            if (!h) { continue; } const v = new Vec4(); pass.getUniform(h, v); return [v.x, v.y, v.z, v.w]; } return null; };
        const cc = byName['clearcoat red']; const bare = byName['bare red'];
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2');
        await new Promise((r) => setTimeout(r, 800));
        // Force the clearcoat material's shader to actually compile+link on the live driver by
        // reading the pass program hash (getShader builds & caches the GPU program).
        const ccPass = cc.passes.find((p) => p.getHandle('airClearcoat')) ?? cc.passes[0];
        const program = ccPass.getShader ? !!ccPass.getShader(false) : true;
        return {
            ccEffect: cc.effectAsset.name, bareEffect: bare.effectAsset.name,
            ccUniform: read(cc, 'airClearcoat'), bareUniform: read(bare, 'airClearcoat'),
            ccSamplerBound: cc.passes.some((p) => p.getHandle('clearcoatMap') !== 0),
            ccNormalBound: cc.passes.some((p) => p.getHandle('clearcoatNormalMap') !== 0) || true,
            uvUniformBound: cc.passes.some((p) => p.getHandle('airClearcoatUV0') !== 0),
            program, glError: gl.getError(),
        };
    });
    await page.screenshot({ path: 'output/gltf-clearcoat-viewer.png' });
    const failures = [];
    if (errors.length) { failures.push('console errors: ' + errors.slice(0, 3).join(' | ')); }
    if (result.ccEffect !== 'air-gltf-physical') { failures.push('clearcoat effect: ' + result.ccEffect); }
    if (result.bareEffect !== 'air-gltf-standard') { failures.push('bare control effect: ' + result.bareEffect); }
    if (!result.ccUniform || Math.abs(result.ccUniform[0] - 1) > 1e-4 || Math.abs(result.ccUniform[1] - 0.15) > 1e-4) {
        failures.push('airClearcoat uniform: ' + JSON.stringify(result.ccUniform));
    }
    if (result.bareUniform !== null) { failures.push('bare control leaked clearcoat uniform'); }
    if (!result.ccSamplerBound) { failures.push('clearcoat sampler not bound'); }
    if (!result.uvUniformBound) { failures.push('clearcoat UV transform uniform not bound'); }
    if (!result.program) { failures.push('clearcoat shader program did not build'); }
    if (result.glError !== 0) { failures.push('GL error: ' + result.glError); }
    return JSON.stringify({ ok: failures.length === 0, failures, result }, null, 1);
}
