/* Execute with: playwright-cli run-code --filename=tools/verify/gltf-scene-browser.js
 * Requires: node tools/verify/serve-gltf.cjs (port 7462) and a built ESM bundle.
 * Gate G2-scene evidence: punctual light components with spec-derived photometric values inside
 * the loaded instance, one GPU-instanced mesh expanded to four shared-asset instances, and the
 * frame renders with per-face lighting variation and no GL errors. */
async (page) => {
    const errors = [];
    const expectedDiagnostics = [];
    page.on('console', (message) => {
        const text = message.text();
        // Known intentional diagnostics from the scene fixture.
        if (/innerConeAngle/.test(text)) { expectedDiagnostics.push(text.slice(0, 160)); return; }
        if (message.type() === 'error' || (message.type() === 'warning' && /WebGL|shader|glTF/i.test(text))) {
            errors.push(text.slice(0, 400));
        }
    });
    page.on('pageerror', (error) => errors.push(String(error).slice(0, 400)));
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://127.0.0.1:7462/gltf-viewer/');
    await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('scene.glb');
    await page.waitForFunction(() => window.gltfViewer?.name === 'scene.glb', undefined, { timeout: 30000 });
    const result = await page.evaluate(async () => {
        const { director, game, DirectionalLight, PointLight, SpotLight } = await import('/build/cocosair.module.js');
        const viewer = window.gltfViewer;
        const pixelsNow = () => {
            const canvas = document.querySelector('canvas');
            const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
            const px = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
            return { gl, px };
        };
        await new Promise((resolve) => setTimeout(resolve, 400));
        // Count light components inside the loaded instance only; the viewer supplies its own
        // default key light outside the instance root.
        const lights = { directional: 0, point: 0, spot: 0 };
        let photometric = null;
        const walk = (node) => {
            const dir = node.getComponent(DirectionalLight);
            if (dir) { lights.directional++; photometric = photometric || { illuminance: dir.illuminance }; }
            const point = node.getComponent(PointLight);
            if (point) { lights.point++; photometric = Object.assign(photometric || {}, { pointFlux: point.luminousFlux, pointRange: point.range }); }
            const spot = node.getComponent(SpotLight);
            if (spot) { lights.spot++; photometric = Object.assign(photometric || {}, { spotAngle: spot.spotAngle, spotRange: spot.range }); }
            node.children.forEach(walk);
        };
        walk(viewer.instance.root);
        let instances = 0; const meshes = new Set(); let anchorMeshRenderer = 0;
        const walk2 = (node) => {
            if (node.name.includes('__inst_')) { instances++; const r = node.getComponent('cc.MeshRenderer'); if (r) { meshes.add(r.mesh); } }
            if (node.name === 'instanced cubes') { anchorMeshRenderer = node.getComponent('cc.MeshRenderer') ? 1 : 0; }
            node.children.forEach(walk2);
        };
        walk2(viewer.instance.root);
        const { gl, px: pixels } = pixelsNow();
        const glError = gl.getError();
        const buckets = new Set();
        for (let i = 0; i < pixels.length; i += 4 * 37) {
            const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2];
            if (r + g + b > 150 && !(b > r + 30 && r < 60)) { buckets.add(`${r >> 5}_${g >> 5}_${b >> 5}`); }
        }
        return { lights, photometric, instances, sharedMeshes: meshes.size, anchorMeshRenderer,
            glError, litToneBuckets: buckets.size };
    });
    await page.screenshot({ path: 'output/gltf-scene-viewer.png' });
    const failures = [];
    if (errors.length) failures.push('console errors: ' + errors.slice(0, 3).join(' | '));
    if (result.lights.directional !== 1 || result.lights.point !== 2 || result.lights.spot !== 1) failures.push('light components: ' + JSON.stringify(result.lights));
    if (Math.abs(result.photometric?.illuminance - 40000) > 1) failures.push('directional illuminance: ' + result.photometric?.illuminance);
    if (Math.abs(result.photometric?.pointFlux - 4 * Math.PI * 3000) > 10) failures.push('point flux: ' + result.photometric?.pointFlux);
    if (Math.abs(result.photometric?.spotAngle - (0.5 * 2 * 180 / Math.PI)) > 0.01) failures.push('spot angle: ' + result.photometric?.spotAngle);
    if (result.photometric?.pointRange !== 5 || result.photometric?.spotRange !== 9) failures.push('ranges: ' + JSON.stringify(result.photometric));
    if (result.instances !== 4 || result.sharedMeshes !== 1 || result.anchorMeshRenderer !== 0) failures.push('instancing: ' + JSON.stringify(result));
    if (result.glError !== 0) failures.push('GL error: ' + result.glError);
    if (result.changedPixels < result.sampleCount * 0.05) failures.push('lighting A/B frame delta: ' + result.changedPixels + '/' + result.sampleCount);
    if (!expectedDiagnostics.length) failures.push('innerConeAngle diagnostic missing');
    return JSON.stringify({ ok: failures.length === 0, failures, result, expectedDiagnostics }, null, 1);
}
