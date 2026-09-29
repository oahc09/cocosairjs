/* Execute with: playwright-cli -s=gltf run-code --filename=tools/verify/gltf-browser.js
 * Requires tools/verify/serve-gltf.cjs and a built SDK. This is a Playwright CLI callback. */
async (page) => {
    const errors = [];
    const expectedDiagnostics = [];
    const onConsole = (message) => {
        if (page.url().includes('webgl=1') && message.text() === 'This device does not support WebGL2') {
            expectedDiagnostics.push(message.text()); return;
        }
        if (message.type() === 'error' || (message.type() === 'warning' && /WebGL|shader|glTF/i.test(message.text()))) errors.push(message.text().slice(0, 500));
    };
    const onError = (error) => errors.push(String(error));
    page.on('console', onConsole); page.on('pageerror', onError);
    try {
        await page.addInitScript(() => {
            if (new URL(location.href).searchParams.get('webgl') === '1') {
                const getContext = HTMLCanvasElement.prototype.getContext;
                HTMLCanvasElement.prototype.getContext = function (type, ...args) {
                    return type === 'webgl2' ? null : getContext.call(this, type, ...args);
                };
            }
        });
        await page.setViewportSize({ width: 1280, height: 800 });
        const webgl1 = page.url().includes('webgl=1');
        if (webgl1) throw new Error('WEBGL2_REQUIRED: WebGL 1 verification mode is retired; use the WebGL 2 mode.');
        await page.goto(`http://127.0.0.1:7462/gltf-viewer/${webgl1 ? '?webgl=1' : ''}`);
        const results = [];
        for (const name of ['BoxTextured.glb', 'SimpleSkin.gltf', 'AnimatedMorphCube.glb', 'diagnostics.glb', 'combined.glb']) {
            await page.getByRole('combobox', { name: '模型', exact: true }).selectOption(name);
            await page.waitForFunction((model) => window.gltfViewer?.name === model, name, { timeout: 30000 });
            const result = await page.evaluate(async () => {
                const { director, game, MeshRenderer, Vec3 } = await import('/build/cocosair.module.js');
                game.pause();
                const viewer = window.gltfViewer;
                const canvas = document.querySelector('canvas');
                const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                const api = gl.getParameter(gl.VERSION);
                const capture = (time) => {
                    viewer.sample(time); director.tick(0);
                    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                    const error = gl.getError();
                    if (error !== gl.NO_ERROR) throw new Error(`WebGL error: ${error}`);
                    return pixels;
                };
                const first = capture(0);
                const duration = viewer.instance.animations[0]?.duration || 0;
                const second = capture(duration ? duration * 0.37 : 0);
                const probes = [];
                if (viewer.name === 'diagnostics.glb') {
                    // Sample actual canvas pixels, excluding the HTML controls overlay.
                    for (const renderer of viewer.instance.root.getComponentsInChildren(MeshRenderer)) {
                        const point = new Vec3(-0.35, 0.325, 0);
                        Vec3.transformMat4(point, point, renderer.node.worldMatrix);
                        viewer.camera.worldToScreen(point, point);
                        const offset = (Math.floor(point.y) * canvas.width + Math.floor(point.x)) * 4;
                        probes.push(Array.from(second.slice(offset, offset + 4)));
                    }
                    if (!(probes[0][0] > 100 && probes[0][1] < 30 && probes[1][1] > 100 && probes[1][0] < 30
                        && probes[5][0] > 100 && probes[5][1] < 30)) throw new Error(`UV orientation/winding failure: ${JSON.stringify(probes)}`);
                    if (!(probes[2][0] > 30 && probes[2][0] < probes[0][0])) throw new Error('BLEND alpha did not reduce the red channel');
                }
                let foreground = 0; let changed = 0;
                for (let i = 0; i < first.length; i += 4) {
                    if (Math.abs(first[i] - first[0]) + Math.abs(first[i + 1] - first[1]) + Math.abs(first[i + 2] - first[2]) > 15) foreground++;
                    if (Math.abs(first[i] - second[i]) + Math.abs(first[i + 1] - second[i + 1]) + Math.abs(first[i + 2] - second[i + 2]) > 15) changed++;
                }
                return { name: viewer.name, api, foreground, changed, duration, probes, status: document.querySelector('#status').textContent,
                    renderers: viewer.instance.root.getComponentsInChildren(MeshRenderer).length };
            });
            if (result.foreground < 100) throw new Error(`${name}: empty frame`);
            if (result.duration && result.changed < 50) throw new Error(`${name}: animation did not change pixels`);
            await page.screenshot({ path: `output/playwright/${name.replace(/\.(gltf|glb)$/, '')}${webgl1 ? '-webgl1' : ''}.png` });
            results.push(result);
        }
        // Playback controls must work as well as explicit time sampling.
        await page.getByRole('button', { name: '播放', exact: true }).click();
        await page.evaluate(async () => {
            const { game, Animation } = await import('/build/cocosair.module.js');
            window.gltfPlaybackState = window.gltfViewer.instance.root.getComponent(Animation).getState(document.querySelector('#clip').value);
            window.gltfPlaybackStart = window.gltfPlaybackState.time;
            game.resume();
        });
        await page.waitForFunction(() => window.gltfPlaybackState.time > window.gltfPlaybackStart + 0.05);
        await page.getByRole('button', { name: '暂停', exact: true }).click();
        const pausedTime = await page.evaluate(() => {
            if (!window.gltfPlaybackState.isPaused) throw new Error('Animation did not pause');
            return window.gltfPlaybackState.time;
        });
        await page.waitForTimeout(120);
        if (await page.evaluate(() => window.gltfPlaybackState.time) !== pausedTime) throw new Error('Paused animation time advanced');
        if (errors.length) throw new Error(errors.join('\n'));
        const report = { passed: true, webgl: webgl1 ? 1 : 2, results, errors, expectedDiagnostics };
        await page.evaluate((value) => { window.gltfVerification = value; }, report);
        return report;
    } finally { page.off('console', onConsole); page.off('pageerror', onError); }
}
