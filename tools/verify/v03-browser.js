/* Playwright CLI callback. Run against serve-static.cjs on port 7464.
 * Throws on failure so the CLI caller must check its result before claiming PASS. */
async (page) => {
    const errors = [];
    const onError = (error) => errors.push(String(error));
    const onConsole = (message) => {
        if (message.type() === 'error' || (message.type() === 'warning' && /WebGL|shader/i.test(message.text()))) errors.push(message.text());
    };
    page.on('pageerror', onError); page.on('console', onConsole);
    const results = [];
    try {
        await page.setViewportSize({ width: 800, height: 600 });
        for (const variant of ['normal', 'minified']) {
            for (const example of ['starter', 'hello-cube', 'static-model', 'skinned-animation', 'gltf-viewer']) {
                const base = `http://127.0.0.1:7464/nested/demo/${variant}/`;
                const ready = [];
                const listen = (m) => ready.push(m.text());
                page.on('console', listen);
                await page.goto(`${base}${example}/`);
                if (example === 'gltf-viewer') await page.waitForFunction(() => window.gltfViewer);
                else {
                    await page.waitForFunction(async () => {
                        const { director } = await import('../build/cocosair.module.js'); return !!director.getScene();
                    });
                }
                page.off('console', listen);
                const result = await page.evaluate(async ({ variant, example }) => {
                    const cc = await import('../build/cocosair.module.js');
                    const { inspectRuntimeAssets, validateRuntimeAssets } = await import('../verify/runtime-assets.js');
                    const { game, director, Camera, MeshRenderer, Node, Vec3, Animation, AnimationClip, animation } = cc;
                    game.pause(); director.tick(0);
                    const scene = director.getScene();
                    const report = validateRuntimeAssets(scene, cc);
                    const canvas = document.querySelector('canvas');
                    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                    const capture = () => {
                        director.tick(0);
                        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                        const error = gl.getError(); if (error) throw new Error(`WebGL ${error}`);
                        return pixels;
                    };
                    const pixels = capture();
                    let foreground = 0;
                    for (let i = 0; i < pixels.length; i += 4) {
                        if (Math.abs(pixels[i] - pixels[0]) + Math.abs(pixels[i + 1] - pixels[1]) + Math.abs(pixels[i + 2] - pixels[2]) > 20) foreground++;
                    }
                    if (example !== 'starter' && foreground < 200) throw new Error(`${example} empty framebuffer (${foreground})`);
                    const details = {};
                    if (example === 'static-model') {
                        const camera = scene.getComponentsInChildren(Camera)[0];
                        const target = scene.getChildByName('StaticBox');
                        const material = target.getComponent(MeshRenderer).sharedMaterials[0];
                        material.setProperty('mainColor', new cc.Color(255, 32, 32, 255));
                        const red = capture();
                        material.setProperty('mainColor', new cc.Color(32, 255, 32, 255));
                        const green = capture();
                        let colorChanges = 0;
                        for (let i = 0; i < red.length; i += 4) if (Math.abs(red[i]-green[i])+Math.abs(red[i+1]-green[i+1]) > 30) colorChanges++;
                        if (colorChanges < 100) throw new Error('Material mainColor did not affect rendering');
                        material.setProperty('mainColor', new cc.Color(255,255,255,255));
                        const texture = material.getProperty('mainTexture');
                        material.setProperty('mainTexture', cc.builtinResMgr.get('white-texture'));
                        const white = capture(); material.setProperty('mainTexture', texture);
                        const textured = capture(); let textureChanges = 0;
                        for (let i = 0; i < white.length; i += 4) if (Math.abs(white[i]-textured[i])+Math.abs(white[i+1]-textured[i+1]) > 30) textureChanges++;
                        if (textureChanges < 100) throw new Error('Material texture did not affect rendering');
                        details.material = { colorChanges, textureChanges };
                        const parent = new Node('Camera Parent'); scene.addChild(parent); parent.setPosition(20, 0, 0);
                        const position = camera.node.worldPosition.clone(); camera.node.setParent(parent); camera.node.setWorldPosition(position);
                        camera.projection = Camera.ProjectionType.ORTHO; camera.orthoHeight = 0.01;
                        cc.frameObject(camera, target); director.tick(0);
                        const bounds = target.getComponent(MeshRenderer).model.worldBounds;
                        const center = camera.worldToScreen(bounds.center, new Vec3());
                        if (Math.abs(center.x - canvas.width / 2) > 2 || Math.abs(center.y - canvas.height / 2) > 2) throw new Error('Parented orthographic camera not centered');
                        if (camera.orthoHeight < bounds.halfExtents.length()) throw new Error('Orthographic bounds clipped');
                        details.framing = { center: [center.x, center.y], orthoHeight: camera.orthoHeight };
                    }
                    return { variant, example, api: gl.getParameter(gl.VERSION), foreground, counts: report.counts,
                        unchecked: report.unchecked, ...details };
                }, { variant, example });
                if (example === 'gltf-viewer') {
                    await page.getByRole('combobox', { name: '模型', exact: true }).selectOption('combined.glb');
                    await page.waitForFunction(() => window.gltfViewer?.name === 'combined.glb');
                    result.integration = await page.evaluate(async () => {
                        const cc = await import('../build/cocosair.module.js');
                        const { validateRuntimeAssets, inspectRuntimeAssets } = await import('../verify/runtime-assets.js');
                        const { asset } = window.gltfViewer;
                        const { game, director, Animation, AnimationClip, MeshRenderer, Node, animation } = cc;
                        game.pause();
                        const scene = director.getScene();
                        const baseline = asset.refCount;
                        const first = asset.instantiate(); const second = asset.instantiate();
                        scene.addChild(first.root); scene.addChild(second.root);
                        first.root.setPosition(-3, 0, 0); second.root.setPosition(3, 0, 0);
                        const a = first.root.getComponent(Animation); const b = second.root.getComponent(Animation);
                        const clip = first.animations[0]; if (!clip) throw new Error('No delivered animation');
                        a.play(clip.name); b.play(clip.name);
                        const stateA = a.getState(clip.name); const stateB = b.getState(clip.name);
                        stateA.time = 0; stateA.sample(); a.pause();
                        stateB.time = clip.duration * 0.37; stateB.sample(); b.pause();
                        if (stateA === stateB || stateA.time === stateB.time) throw new Error('Instances share playback state');
                        const good = validateRuntimeAssets(second.root, cc, asset);
                        const broken = new Node('Broken reference'); first.root.addChild(broken); broken.addComponent(MeshRenderer);
                        const brokenClip = new AnimationClip(); brokenClip.duration = 1; brokenClip.name = 'missing-target';
                        const track = new animation.VectorTrack(); track.path.toHierarchy('no-such-node').toProperty('position'); brokenClip.addTrack(track);
                        broken.addComponent(Animation).clips = [brokenClip];
                        const bad = inspectRuntimeAssets(first.root, cc);
                        const codes = bad.diagnostics.map((d) => d.code);
                        if (!codes.includes('MISSING_DEPENDENCY') || !codes.includes('ANIMATION_TARGET')) throw new Error('Invalid references were not detected');
                        first.dispose(); first.dispose(); director.tick(0); await Promise.resolve(); director.tick(0);
                        if (!second.root.isValid || asset.meshes.some((m) => !m.isValid) || asset.refCount !== baseline + 1) throw new Error('Disposing first instance broke shared resources');
                        const paused = stateB.time; game.resume();
                        // Deterministic engine ticks verify play/pause without wall-clock timing.
                        b.resume(); director.tick(0.1); director.tick(0.1); b.pause(); game.pause();
                        if (stateB.time === paused) throw new Error('Resume did not advance animation');
                        second.dispose(); director.tick(0); await Promise.resolve(); director.tick(0); brokenClip.destroy();
                        if (asset.refCount !== baseline) throw new Error('Instance refs did not return to baseline');
                        const canvas = document.querySelector('canvas'); const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
                        const capture = (t) => {
                            window.gltfViewer.sample(t); director.tick(0);
                            const p = new Uint8Array(canvas.width * canvas.height * 4); gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,p); return p;
                        };
                        const p0 = capture(0), p1 = capture(clip.duration * 0.37);
                        let changed = 0; for (let i = 0; i < p0.length; i += 4) if (Math.abs(p0[i]-p1[i])+Math.abs(p0[i+1]-p1[i+1])+Math.abs(p0[i+2]-p1[i+2]) > 15) changed++;
                        if (changed < 100 || gl.getError()) throw new Error('Animation framebuffer validation failed');
                        return { counts: good.counts, invalidCodes: codes, refs: [baseline, asset.refCount], changed, unchecked: good.unchecked };
                    });
                }
                await page.screenshot({ path: `output/playwright/v03-${variant}-${example}.png` });
                results.push(result);
            }
        }
        if (errors.length) throw new Error(JSON.stringify(errors));
        return { ok: true, results, errors };
    } finally { page.off('pageerror', onError); page.off('console', onConsole); }
}
