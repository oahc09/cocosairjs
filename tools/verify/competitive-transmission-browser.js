/* playwright-cli -s=competitive run-code --filename=tools/verify/competitive-transmission-browser.js
 * Requires the static glTF server on 7483 and the current runtime bundle.
 * Measures rendered factor 0/1 on the SAME glass material, after stopping the real frame clock.
 * The baseline shader has a bound uniform but no factor assignment: this must fail there.
 * Writes only output/playwright/, never canonical release evidence.
 */
async (page) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto('http://127.0.0.1:7483/gltf-viewer/');
    await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('physical.glb');
    await page.waitForFunction(() => window.gltfViewer?.name === 'physical.glb');
    const result = await page.evaluate(async () => {
        const { MeshRenderer, Vec4, game } = await import('/build/cocosair.module.js');
        const viewer = window.gltfViewer;
        const renderer = viewer.instance.root.getComponentsInChildren(MeshRenderer)
            .find((item) => item.node.name.startsWith('transmissive glass'));
        if (!renderer) throw new Error('transmissive glass renderer missing');
        const material = renderer.getMaterialInstance(0);
        const handle = material.passes[0].getHandle('airTransmission');
        const original = new Vec4();
        material.passes[0].getUniform(handle, original);
        const canvas = document.querySelector('canvas');
        const gl = canvas.getContext('webgl2');
        game.pause();
        const read = () => {
            for (let frame = 0; frame < 4; ++frame) game.step();
            const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            return pixels;
        };
        material.setProperty('airTransmission', new Vec4(0, original.y, original.z, original.w));
        const opaque = read();
        const opaqueUniform = new Vec4();
        material.passes[0].getUniform(handle, opaqueUniform);
        material.setProperty('airTransmission', new Vec4(1, original.y, original.z, original.w));
        const glass = read();
        const capture = material.getProperty('cc_sceneColorTex');
        const glassUniform = new Vec4();
        material.passes[0].getUniform(handle, glassUniform);
        let changedPixels = 0;
        let absoluteDifference = 0;
        for (let index = 0; index < glass.length; index += 4) {
            let difference = 0;
            for (let channel = 0; channel < 3; ++channel) difference += Math.abs(glass[index + channel] - opaque[index + channel]);
            absoluteDifference += difference;
            if (difference > 9) ++changedPixels;
        }
        const difference = (a, b) => {
            let pixels = 0, sum = 0;
            for (let i = 0; i < a.length; i += 4) {
                let delta = 0;
                for (let c = 0; c < 3; ++c) delta += Math.abs(a[i + c] - b[i + c]);
                sum += delta;
                if (delta > 9) ++pixels;
            }
            return { changedPixels: pixels, absoluteDifference: sum };
        };
        material.setProperty('airTransmission', new Vec4(1, original.y, 0, 0));
        const thin = read();
        material.setProperty('airTransmission', new Vec4(1, original.y, original.z, 0));
        const volume = read();
        // A flat, thin fixture has a sub-byte spectral signal. Use a valid high-IOR,
        // thick medium for this independent dispersion comparison, keeping all
        // other inputs identical between the two frames.
        material.setProperty('airTransmission', new Vec4(1, 2.4, 3, 0));
        const dispersionControl = read();
        material.setProperty('airTransmission', new Vec4(1, 2.4, 3, original.w));
        const dispersed = read();
        const volumeDifference = difference(thin, volume);
        const dispersionDifference = difference(dispersionControl, dispersed);
        material.setProperty('airTransmission', original);
        read();
        const fixed = material.effectAsset.shaders.some((shader) => shader.glsl3?.frag.includes('airTrFactorTex = airTransmission.x;'));
        return { fixed, effect: material.effectAsset.name, changedPixels, absoluteDifference,
            volumeDifference, dispersionDifference,
            dispersionInputs: { ior: 2.4, thickness: 3, factors: [0, original.w] },
            uniforms: [opaqueUniform.x, glassUniform.x], transmissionEnabled: material.passes[0].defines.USE_AIR_TRANSMISSION,
            pixelSum: glass.reduce((sum, value) => sum + value, 0),
            glError: gl.getError(), size: [canvas.width, canvas.height],
            sceneColorBound: !!capture && capture.width > 1 && capture.height > 1 };
    });
    await page.screenshot({ path: `output/playwright/competitive-transmission-${result.fixed ? 'fixed' : 'baseline'}.png` });
    const failures = [];
    if (errors.length) failures.push(...errors);
    if (!result.sceneColorBound) failures.push('Scene color not bound on rendered material');
    if (result.glError !== 0) failures.push(`WebGL error: ${result.glError}`);
    if (result.changedPixels < 50 || result.absoluteDifference < 1000) failures.push('Transmission factor 0/1 has no meaningful rendered difference');
    if (result.volumeDifference.changedPixels < 50) failures.push('Volume thickness/attenuation has no rendered difference');
    if (result.dispersionDifference.changedPixels < 20) failures.push('Dispersion has no rendered difference');
    return JSON.stringify({ ok: failures.length === 0, result, failures });
}
