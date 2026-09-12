/* Official Khronos assets only. Run via playwright-cli run-code --filename. */
async (page) => {
    const webgl1 = page.url().includes('webgl=1');
    const errors = [];
    const compatibilityWarnings = [];
    const expectedDiagnostics = [];
    const onConsole = (message) => {
        if (webgl1 && message.text() === 'This device does not support WebGL2') { expectedDiagnostics.push(message.text()); return; }
        if (webgl1 && /^\[glTF\] texture \d+: WebGL1 NPOT sampler changed to clamp\/no mipmaps$/.test(message.text())) {
            compatibilityWarnings.push(message.text()); return;
        }
        if (message.type() === 'error' || (message.type() === 'warning' && /WebGL|shader|glTF/i.test(message.text()))) errors.push(message.text().slice(0, 1000));
    };
    const onError = (error) => errors.push(String(error));
    page.on('console', onConsole); page.on('pageerror', onError);
    const results = [];
    try {
        await page.addInitScript(() => {
            if (location.search.includes('webgl=1')) {
                const original = HTMLCanvasElement.prototype.getContext;
                HTMLCanvasElement.prototype.getContext = function (name, ...args) {
                    return name === 'webgl2' ? null : original.call(this, name, ...args);
                };
            }
        });
        await page.setViewportSize({ width: 1280, height: 800 });
        await page.goto(`http://127.0.0.1:7462/gltf-viewer/${webgl1 ? '?webgl=1' : ''}`);
        for (const name of ['BoxTextured.glb', 'SimpleSkin.gltf', 'AnimatedMorphCube.glb',
            'official/SimpleSparseAccessor.gltf', 'official/InterpolationTest.glb', 'official/VertexColorTest.glb', 'official/Material_AlphaBlend_00.gltf']) {
            const errorStart = errors.length;
            try {
                await page.getByRole('combobox', { name: '模型', exact: true }).selectOption(name);
                await page.waitForFunction((selected) => window.gltfViewer?.name === selected || document.querySelector('#status').hasAttribute('data-error'), name);
                const result = await page.evaluate(async (selected) => {
                    const error = document.querySelector('#status');
                    if (error.hasAttribute('data-error')) throw new Error(error.textContent);
                    const { game, director, Animation, AnimationClip, MeshRenderer, Vec3, Texture2D } = await import('/build/cocosair.module.js');
                    game.pause();
                    const viewer = window.gltfViewer;
                    if (viewer.name !== selected) throw new Error('Wrong model selected');
                    const canvas = document.querySelector('canvas');
                    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                    const capture = () => {
                        director.tick(0);
                        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                        const code = gl.getError();
                        if (code !== gl.NO_ERROR) throw new Error(`WebGL error ${code}`);
                        return pixels;
                    };
                    const initial = capture();
                    const samplers = viewer.asset.textures.map((texture) => ({ width: texture.width, height: texture.height, sampler: texture.getSamplerInfo() }));
                    if (viewer.asset.warnings.some((warning) => warning.includes('NPOT sampler changed'))) {
                        for (const entry of samplers) {
                            if ((entry.width & (entry.width - 1)) || (entry.height & (entry.height - 1))) {
                                if (entry.sampler.addressU !== Texture2D.WrapMode.CLAMP_TO_EDGE || entry.sampler.addressV !== Texture2D.WrapMode.CLAMP_TO_EDGE
                                    || entry.sampler.mipFilter !== Texture2D.Filter.NONE) throw new Error('NPOT fallback does not match its diagnostic');
                            }
                        }
                    }
                    const alphaProbes = [];
                    if (selected.endsWith('Material_AlphaBlend_00.gltf')) {
                        const renderer = viewer.instance.root.getComponentsInChildren(MeshRenderer)[0];
                        const positions = renderer.mesh.readAttribute(0, 'a_position');
                        const colors = renderer.mesh.readAttribute(0, 'a_color');
                        const material = renderer.getMaterialInstance(0);
                        material.recompileShaders({ AIR_GLTF_OPAQUE: true });
                        const opaque = capture();
                        material.recompileShaders({ AIR_GLTF_OPAQUE: false }); capture();
                        for (const [x, y] of [[-0.25, 0.2], [0.25, -0.2]]) {
                            let alpha;
                            for (let i = 0; i < positions.length / 3; i += 3) {
                                const ax = positions[i*3], ay = positions[i*3+1], bx = positions[(i+1)*3], by = positions[(i+1)*3+1], cx = positions[(i+2)*3], cy = positions[(i+2)*3+1];
                                const denominator = (by-cy)*(ax-cx)+(cx-bx)*(ay-cy);
                                const a = ((by-cy)*(x-cx)+(cx-bx)*(y-cy))/denominator;
                                const b = ((cy-ay)*(x-cx)+(ax-cx)*(y-cy))/denominator;
                                const c = 1-a-b;
                                if (Math.min(a,b,c) >= -1e-6) { alpha = a*colors[i*4+3]+b*colors[(i+1)*4+3]+c*colors[(i+2)*4+3]; break; }
                            }
                            const point = new Vec3(x, y, 0); Vec3.transformMat4(point, point, renderer.node.worldMatrix); viewer.camera.worldToScreen(point, point);
                            const offset = (Math.floor(point.y)*canvas.width+Math.floor(point.x))*4;
                            const actual = Array.from(initial.slice(offset, offset+3));
                            const expected = [0,1,2].map((channel) => Math.round(opaque[offset+channel]*alpha+initial[channel]*(1-alpha)));
                            if (!Number.isFinite(alpha) || actual.some((v,i) => Math.abs(v-expected[i]) > 3)) throw new Error(`Vertex alpha mismatch: ${JSON.stringify({alpha,actual,expected})}`);
                            alphaProbes.push({alpha,actual,expected});
                        }
                    }
                    let foreground = 0;
                    for (let i = 0; i < initial.length; i += 4) {
                        if (Math.abs(initial[i] - initial[0]) + Math.abs(initial[i+1] - initial[1]) + Math.abs(initial[i+2] - initial[2]) > 15) foreground++;
                    }
                    const animations = [];
                    const scene = viewer.instance.root.parent;
                    viewer.instance.root.active = false;
                    try {
                        for (const clip of viewer.instance.animations) {
                            // Each clip gets a fresh rest pose; a prior clip cannot contaminate the next one.
                            const instance = viewer.asset.instantiate(); scene.addChild(instance.root);
                            try {
                                const animation = instance.root.getComponent(Animation);
                                instance.animations.find((candidate) => candidate.name === clip.name).wrapMode = AnimationClip.WrapMode.Normal;
                                animation.play(clip.name); animation.pause();
                                const state = animation.getState(clip.name);
                                const frame = (time) => { state.time = time; state.sample(); return capture(); };
                                const first = frame(0);
                                const samples = [];
                                for (const fraction of [0.13, 0.37, 0.63, 0.89, 1]) {
                                    const pixels = frame(clip.duration * fraction);
                                    let changed = 0;
                                    for (let i = 0; i < first.length; i += 4) {
                                        if (Math.abs(first[i] - pixels[i]) + Math.abs(first[i+1] - pixels[i+1]) + Math.abs(first[i+2] - pixels[i+2]) > 15) changed++;
                                    }
                                    samples.push({ time: clip.duration * fraction, changed });
                                }
                                animations.push({ name: clip.name, duration: clip.duration, passed: samples.some((s) => s.changed > 50), samples });
                            } finally { instance.dispose(); director.tick(0); }
                        }
                    } finally { viewer.instance.root.active = true; director.tick(0); }
                    return { name: viewer.name, api: gl.getParameter(gl.VERSION), foreground,
                        renderers: viewer.instance.root.getComponentsInChildren(MeshRenderer).length,
                        materials: viewer.asset.materials.length, warnings: viewer.asset.warnings, samplers, alphaProbes, animations,
                        passed: foreground > 100 && animations.every((animation) => animation.passed) };
                }, name);
                await page.screenshot({ path: `output/playwright/official-${name.split('/').pop().replace(/\.(gltf|glb)$/, '')}-webgl${webgl1 ? 1 : 2}.png` });
                result.errors = errors.slice(errorStart); result.passed = result.passed && result.errors.length === 0;
                results.push(result);
            } catch (error) { results.push({ name, passed: false, error: String(error), errors: errors.slice(errorStart) }); }
        }
        return { passed: results.every((result) => result.passed) && errors.length === 0, webgl: webgl1 ? 1 : 2, results, errors, compatibilityWarnings, expectedDiagnostics };
    } finally { page.off('console', onConsole); page.off('pageerror', onError); }
}
