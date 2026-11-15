/* Focused Chromium/WebGL2 regression, not canonical example evidence.
 * Start node tools/verify/serve-gltf.cjs, then:
 * playwright-cli open http://127.0.0.1:7462/gltf-viewer/
 * playwright-cli run-code --filename=tools/verify/gltf-sheen-browser.js
 * Requires a current main bundle. Writes output/gltf-sheen-browser.png.
 * Asserts real loader, uniforms, texture/UV effects and roughness effects. */
// prettier-ignore
async (page) => {
    const errors = [];
    const onError = (error) => errors.push(String(error));
    const onConsole = (message) => {
        if (message.type() === 'error') errors.push(message.text());
    };
    page.on('pageerror', onError);
    page.on('console', onConsole);
    try {
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto('http://127.0.0.1:7462/gltf-viewer/');
        await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('sheen.glb');
        await page.waitForFunction(() => window.gltfViewer?.name === 'sheen.glb');
        const result = await page.evaluate(async () => {
            const cc = await import('/build/cocosair.module.js');
            const asset = window.gltfViewer.asset;
            const byName = Object.fromEntries(asset.materials.map((material) => [material.name, material]));
            const soft = byName['sheen soft'],
                textured = byName['sheen textured UV1'];
            if (byName['bare control'].effectAsset.name !== 'air-gltf-standard') throw Error('bare material changed');
            if (asset.warnings.length) throw Error(asset.warnings.join('; '));
            const readUniform = (material, name) => {
                const pass = material.passes[0],
                    value = new cc.Vec4();
                if (!pass.getHandle(name)) throw Error(`missing uniform ${name}`);
                pass.getUniform(pass.getHandle(name), value);
                return value;
            };
            const colorUV = readUniform(textured, 'airSheenColorUV0');
            const roughUV = readUniform(textured, 'airSheenRoughnessUV0');
            if (colorUV.x !== 2 || colorUV.z !== 0.125 || roughUV.x !== 1) throw Error('UV transform mismatch');
            const original = readUniform(soft, 'airSheen');
            const gl = document.querySelector('canvas').getContext('webgl2');
            const clock = cc.createStepClock();
            const pixels = async () => {
                await clock.step();
                const data = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
                gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, data);
                return data;
            };
            const delta = (a, b) => {
                let count = 0;
                for (let i = 0; i < a.length; i += 4) {
                    if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 3)
                        count++;
                }
                return count;
            };
            clock.begin();
            try {
                const baseline = await pixels();
                soft.setProperty('airSheen', new cc.Vec4(0, 0, 0, original.w));
                const sheenPixels = delta(baseline, await pixels());
                soft.setProperty('airSheen', new cc.Vec4(original.x, original.y, original.z, 0.2));
                const roughnessPixels = delta(baseline, await pixels());
                soft.setProperty('airSheen', original);
                textured.setProperty(
                    'airSheenColorUV0',
                    new cc.Vec4(colorUV.x, colorUV.y, colorUV.z + 0.25, colorUV.w),
                );
                const colorTexturePixels = delta(baseline, await pixels());
                textured.setProperty('airSheenColorUV0', colorUV);
                textured.setProperty('airSheenRoughnessUV0', new cc.Vec4(roughUV.x, roughUV.y, 0.5, roughUV.w));
                const alphaTexturePixels = delta(baseline, await pixels());
                return { sheenPixels, roughnessPixels, colorTexturePixels, alphaTexturePixels, glError: gl.getError() };
            } finally {
                soft.setProperty('airSheen', original);
                textured.setProperty('airSheenColorUV0', colorUV);
                textured.setProperty('airSheenRoughnessUV0', roughUV);
                await clock.step();
                clock.end();
            }
        });
        await page.screenshot({ path: 'output/gltf-sheen-browser.png' });
        if (
            errors.length ||
            result.glError ||
            Object.entries(result).some(([key, value]) => key.endsWith('Pixels') && value < 100)
        ) {
            throw Error(JSON.stringify({ result, errors }));
        }
        return { ok: true, result };
    } finally {
        page.off('pageerror', onError);
        page.off('console', onConsole);
    }
}
