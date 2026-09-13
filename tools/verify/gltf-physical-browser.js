/* playwright-cli run-code --filename=tools/verify/gltf-physical-browser.js
 * T5.1 real-browser physical material evidence: the derived air-gltf-physical shaders
 * compile on the live WebGL2 driver (string-injected GLSL), extension materials select the
 * variant with spec-derived uniform values while the identity control keeps the base effect,
 * and an airPhysicalParams A/B swap changes rendered pixels (uniform path is live).
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
        const materials = viewer.asset.materials;
        const byName = {};
        for (const m of materials) { byName[m.name] = m; }
        const readParams = (m) => { for (const pass of m.passes) { const h = pass.getHandle('airPhysicalParams');
            if (!h) { continue; } const v = new Vec4(); pass.getUniform(h, v); return [v.x, v.y, v.z, v.w]; } return null; };
        const ext = byName['ior2.5 + strength4']; const control = byName['identity pbr']; const mapped = byName['specular map'];
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2');
        const grab = () => { const px = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
        // Read at the rAF callback: the back buffer is still intact before the compositor swaps.
        const grabAtFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(grab())));
        await new Promise((r) => setTimeout(r, 500));
        const original = readParams(ext);
        // Emissive A/B on the live rendered instance: the extension plane's emissive carries
        // strength 4 (x=4 in airPhysicalParams). Dropping x to 1 must darken its face; the
        // ior term alone is a grazing-angle Fresnel effect (sub-quantization on flat faces),
        // so emissive strength provides the frame-delta proof that the uniform reaches shading.
        let target = null;
        const walk = (node) => { const r = node.getComponent('cc.MeshRenderer');
            if (r && node.name.startsWith('ior2.5')) { target = r; } node.children.forEach(walk); };
        walk(viewer.instance.root);
        const live = target.getMaterialInstance(0);
        live.setProperty('airPhysicalParams', new Vec4(1, original[1], original[2], 1));
        await new Promise((r) => setTimeout(r, 300));
        const frameA = await grabAtFrame();
        live.setProperty('airPhysicalParams', new Vec4(original[0], original[1], original[2], 1));
        await new Promise((r) => setTimeout(r, 300));
        const frameB = await grabAtFrame();
        let changed = 0;
        for (let i = 0; i < frameA.length; i += 4) {
            const d = Math.abs(frameA[i] - frameB[i]) + Math.abs(frameA[i + 1] - frameB[i + 1]) + Math.abs(frameA[i + 2] - frameB[i + 2]);
            if (d > 24) { changed++; }
        }
        return {
            effects: { ext: ext.effectAsset.name, control: control.effectAsset.name, mapped: mapped.effectAsset.name },
            paramsOriginal: original, paramsControl: readParams(control),
            specularMapBound: !!mapped.passes[0].getHandle('specularMap'),
            uvUniformBound: !!mapped.passes[0].getHandle('airSpecularUV0'),
            changedPixels: changed, totalPixels: frameA.length / 4, glError: gl.getError(),
        };
    });

    await page.screenshot({ path: 'output/gltf-physical-viewer.png' });
    const failures = [];
    if (errors.length) { failures.push('console errors: ' + errors.slice(0, 3).join(' | ')); }
    if (result.effects.ext !== 'air-gltf-physical') { failures.push('extension effect: ' + result.effects.ext); }
    if (result.effects.control !== 'air-gltf-standard') { failures.push('control effect: ' + result.effects.control); }
    if (result.effects.mapped !== 'air-gltf-physical') { failures.push('mapped effect: ' + result.effects.mapped); }
    if (Math.abs(result.paramsOriginal[0] - 4) > 1e-4) { failures.push('emissive strength: ' + result.paramsOriginal); }
    const expectedY = Math.pow(1.5 / 3.5, 2) / 0.04;
    if (Math.abs(result.paramsOriginal[1] - expectedY) > 0.05) { failures.push(`ior F0 ratio: ${result.paramsOriginal[1]} != ${expectedY}`); }
    if (Math.abs(result.paramsOriginal[2] - 1) > 1e-4) { failures.push('specular factor: ' + result.paramsOriginal); }
    if (result.paramsControl !== null) { failures.push('control leaked physical uniform'); }
    if (!result.specularMapBound || !result.uvUniformBound) { failures.push('specular sampler: ' + JSON.stringify(result)); }
    if (result.changedPixels < 5000) { failures.push('emissive strength A/B delta: ' + result.changedPixels + '/' + result.totalPixels); }
    if (result.glError !== 0) { failures.push('GL error: ' + result.glError); }
    return JSON.stringify({ ok: failures.length === 0, failures, result }, null, 1);
}
