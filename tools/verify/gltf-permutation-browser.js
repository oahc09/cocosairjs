/* playwright-cli run-code --filename=tools/verify/gltf-permutation-browser.js
 * T5 Gate G3 shader-permutation sweep: loads physical.glb (9 materials covering every
 * physical extension individually AND a kitchen-sink material with all seven extensions
 * plus every texture slot bound simultaneously) and asserts every material's shaders
 * compile+link on the live WebGL2 driver with zero GL errors and zero shader console
 * errors, with the expected effect matrix (identity stays standard, any physical
 * modifier selects air-gltf-physical). */
async (page) => {
    const errors = [];
    page.on('console', (m) => { if (/shader|WebGL|glTF/i.test(m.text()) && (m.type() === 'error' || m.type() === 'warning')) errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://127.0.0.1:7462/gltf-viewer/');
    await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('physical.glb');
    await page.waitForFunction(() => window.gltfViewer?.name === 'physical.glb', undefined, { timeout: 30000 });
    const result = await page.evaluate(async () => {
        await new Promise((r) => setTimeout(r, 1200));
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2');
        const frame = await new Promise((resolve) => requestAnimationFrame(() => {
            const px = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px); resolve(px);
        }));
        let lit = 0;
        for (let i = 0; i < frame.length; i += 4) { if (frame[i] + frame[i + 1] + frame[i + 2] > 150) lit++; }
        const matrix = {};
        for (const m of window.gltfViewer.asset.materials) { matrix[m.name] = m.effectAsset.name; }
        return { matrix, litPixels: lit > 10000, glError: gl.getError() };
    });
    await page.screenshot({ path: 'output/gltf-permutation-viewer.png' });
    const failures = [];
    if (errors.length) { failures.push('console errors: ' + errors.slice(0, 3).join(' | ')); }
    const expectedPhysical = ['ior2.5 + strength4', 'specular map', 'clearcoat red', 'brushed gold', 'iridescent film', 'bumpy gray', 'kitchen sink'];
    const expectedStandard = ['identity pbr', 'bare red'];
    for (const n of expectedPhysical) { if (result.matrix[n] !== 'air-gltf-physical') { failures.push(n + ': ' + result.matrix[n]); } }
    for (const n of expectedStandard) { if (result.matrix[n] !== 'air-gltf-standard') { failures.push(n + ': ' + result.matrix[n]); } }
    if (!result.litPixels) { failures.push('scene did not render'); }
    if (result.glError !== 0) { failures.push('GL error: ' + result.glError); }
    return JSON.stringify({ ok: failures.length === 0, failures, result }, null, 1);
}
