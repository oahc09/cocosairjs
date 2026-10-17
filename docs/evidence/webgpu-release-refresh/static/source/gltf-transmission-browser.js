/* playwright-cli run-code --filename=tools/verify/gltf-transmission-browser.js
 * T6 scene-color transmission real-browser evidence: the viewer arms an AirTransmissionCapture
 * (offscreen WebGL2 camera) at startup, so the transmissive glass selects air-gltf-physical
 * with the airTransmission/airAttenuation/cc_sceneColorTex uniforms bound and the refractive
 * lobe compiles on the live driver (zero GL errors). The glass is placed in front of the bright
 * brushed-gold plane and must render measurably different from the bare control.
 * Requires: node tools/verify/serve-gltf.cjs (port 7462) + built ESM bundle. */
async (page) => {
    const errors = [];
    page.on('console', (m) => { if (/shader|WebGL|glTF/i.test(m.text()) && (m.type() === 'error' || m.type() === 'warning')) errors.push(m.text().slice(0, 300)); });
    page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://127.0.0.1:7462/gltf-viewer/');
    await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('physical.glb');
    await page.waitForFunction(() => window.gltfViewer?.name === 'physical.glb', undefined, { timeout: 30000 });
    const result = await page.evaluate(async () => {
        const { Vec4, director } = await import('/build/cocosair.module.js');
        const viewer = window.gltfViewer;
        const byName = {};
        for (const m of viewer.asset.materials) { byName[m.name] = m; }
        const glass = byName['transmissive glass'];
        const read = (m, name) => { for (const pass of m.passes) { const h = pass.getHandle(name);
            if (!h) { continue; } const v = new Vec4(); pass.getUniform(h, v); return [v.x, v.y, v.z, v.w]; } return null; };
        await new Promise((r) => setTimeout(r, 1000));
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2');
        const frame = await new Promise((resolve) => requestAnimationFrame(() => {
            const px = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px); resolve(px);
        }));
        let lit = 0;
        for (let i = 0; i < frame.length; i += 4) { if (frame[i] + frame[i + 1] + frame[i + 2] > 150) lit++; }
        // Glass screen bbox (measured at 1280x800): sample a center box.
        let gR = 0, gG = 0, gB = 0, gN = 0;
        const rowStride = canvas.width * 4;
        for (let py = 430; py < 540; py++) {
            for (let px = 640; px < 700; px++) {
                const i = (canvas.height - py - 1) * rowStride + px * 4;
                gR += frame[i]; gG += frame[i + 1]; gB += frame[i + 2]; gN++;
            }
        }
        const glassRGB = [Math.round(gR / gN), Math.round(gG / gN), Math.round(gB / gN)];
        // glass plane world pos (mesh 9) vs its node layer (must carry the transmission bit)
        let glassNode = null;
        const walk = (node) => { if (node.name.startsWith('transmissive glass')) { glassNode = node; } node.children.forEach(walk); };
        walk(viewer.instance.root);
        // Review fix #1/#9 assertion: the scene color must be bound on the *rendered* material
        // instance (renderer.getMaterialInstance), not only on the shared template material.
        const renderer = glassNode ? glassNode.getComponent('cc.MeshRenderer') : null;
        const instance = renderer ? renderer.getMaterialInstance(0) : null;
        const instanceTexture = instance && instance.getProperty ? instance.getProperty('cc_sceneColorTex') : null;
        const infoValue = instance ? read(instance, 'airSceneColorInfo') : null;
        return {
            effect: glass.effectAsset.name,
            armed: (() => { for (const pass of glass.passes) { if (pass.getHandle('airTransmission') !== 0) { return true; } } return false; })(),
            transmission: read(glass, 'airTransmission'),
            attenuation: read(glass, 'airAttenuation'),
            sceneColorBound: glass.passes.some((p) => { const h = p.getHandle('cc_sceneColorTex'); return h !== 0; }),
            instanceSceneColorBound: !!(instanceTexture && instanceTexture.width > 1 && instanceTexture.height > 1),
            instanceInfoMatchesViewport: !!infoValue && Math.abs(infoValue[0] - canvas.width) < 2 && Math.abs(infoValue[1] - canvas.height) < 2,
            transmissionLayer: glassNode ? (glassNode.layer & (1 << 26)) !== 0 : false,
            glassRGB, lit: lit > 10000, glError: gl.getError(),
        };
    });
    await page.screenshot({ path: 'output/gltf-transmission-viewer.png' });
    const failures = [];
    if (errors.length) { failures.push('console errors: ' + errors.slice(0, 3).join(' | ')); }
    if (!result.effect.startsWith('air-gltf-physical')) { failures.push('glass effect: ' + result.effect); }
    if (!result.armed) { failures.push('airTransmission uniform not bound (capture not armed?)'); }
    if (!result.transmission || Math.abs(result.transmission[0] - 1) > 1e-4 || Math.abs(result.transmission[1] - 1.5) > 1e-4) {
        failures.push('airTransmission: ' + JSON.stringify(result.transmission));
    }
    if (!result.attenuation || Math.abs(result.attenuation[2] - 0.9) > 1e-4) { failures.push('airAttenuation: ' + JSON.stringify(result.attenuation)); }
    if (!result.sceneColorBound) { failures.push('cc_sceneColorTex not bound'); }
    if (!result.instanceSceneColorBound) { failures.push('scene color not bound on the rendered material instance'); }
    if (!result.instanceInfoMatchesViewport) { failures.push('airSceneColorInfo on the instance does not match the viewport'); }
    if (!result.transmissionLayer) { failures.push('glass node missing TRANSMISSION layer bit'); }
    if (!result.lit) { failures.push('scene did not render'); }
    // Refracted through the blue attenuated glass the center must read bluish-bright,
    // distinctly different from both the white base albedo (unarmed) and a black hole.
    const [r, g, b] = result.glassRGB;
    if (!(b > 40 && b > r && (r + g + b) > 60)) { failures.push('glass refraction color: ' + JSON.stringify(result.glassRGB)); }
    if (result.glError !== 0) { failures.push('GL error: ' + result.glError); }
    return JSON.stringify({ ok: failures.length === 0, failures, result }, null, 1);
}
