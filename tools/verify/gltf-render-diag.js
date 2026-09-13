/* playwright-cli run-code --filename=tools/verify/gltf-render-diag.js
 * Compares rendered pixels for lights ON vs OFF (disable via component.enabled) to prove
 * whether punctual lights affect the frame. Requires viewer server on 7462. */
async (page) => {
    await page.goto('http://127.0.0.1:7462/gltf-viewer/');
    await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('scene.glb');
    await page.waitForFunction(() => window.gltfViewer?.name === 'scene.glb', undefined, { timeout: 30000 });
    const out = await page.evaluate(async () => {
        const { director, PointLight, SpotLight, DirectionalLight, game } = await import('/build/cocosair.module.js');
        const viewer = window.gltfViewer;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        const grab = () => { const px = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
        const stats = (px) => { let bright = 0, sum = 0; for (let i = 0; i < px.length; i += 4) { const v = px[i] + px[i + 1] + px[i + 2]; sum += v; if (v > 200) bright++; } return { bright, mean: Math.round(sum / (px.length / 4)) }; };
        game.pause();
        director.tick(0);
        const withLights = stats(grab());
        const disabled = [];
        const isLight = (c) => c instanceof PointLight || c instanceof SpotLight || c instanceof DirectionalLight;
        const walk = (n) => { for (const c of n.components) { if (isLight(c)) { c.enabled = false; disabled.push(c.constructor.name); } } n.children.forEach(walk); };
        walk(viewer.instance.root);
        director.tick(0);
        const lightsOff = stats(grab());
        // restore
        const walk2 = (n) => { for (const c of n.components) { if (isLight(c)) { c.enabled = true; } } n.children.forEach(walk2); };
        walk2(viewer.instance.root);
        // unlit override test: force every gltf material to unlit via property check instead —
        // simpler probe: sample pixel histogram at cube area (center band)
        const px = grab();
        const cubeColors = {};
        for (let y = Math.floor(canvas.height * 0.45); y < canvas.height * 0.75; y += 5) {
            for (let x = Math.floor(canvas.width * 0.3); x < canvas.width * 0.72; x += 5) {
                const i = (y * canvas.width + x) * 4;
                if (px[i] + px[i + 1] + px[i + 2] < 90) { continue; }
                const key = `${px[i] >> 4}_${px[i + 1] >> 4}_${px[i + 2] >> 4}`;
                cubeColors[key] = (cubeColors[key] || 0) + 1;
            }
        }
        void game;
        return { withLights, lightsOff, disabled, cubeColors: Object.entries(cubeColors).sort((a, b) => b[1] - a[1]).slice(0, 6) };
    });
    return JSON.stringify(out, null, 1);
}
