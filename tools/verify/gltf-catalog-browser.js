/* Browser acceptance for the catalog. Network failures remain visible in the report. */
async (page) => {
    const failures = [];
    const check = (value, message) => { if (!value) throw new Error(message); };
    const onError = (error) => failures.push(String(error));
    page.on('pageerror', onError);
    const result = {};
    try {
        await page.setViewportSize({ width: 1600, height: 1000 });
        await page.goto('http://127.0.0.1:7462/gltf-catalog/');
        const index = await (await page.request.get('http://127.0.0.1:7462/gltf-catalog/catalog.json')).json();
        await page.waitForFunction(() => document.querySelector('#air-state').textContent === 'READY');
        result.catalog = await page.evaluate(() => ({ total: Number(document.querySelector('#total-count').textContent),
            rows: document.querySelectorAll('.model-row').length, local: document.querySelector('#filter option[value=local]').textContent,
            external: document.querySelector('#official-link').href, asset: document.querySelector('#asset-link').href,
            referenceInitiallyBlank: document.querySelector('#reference-preview').getAttribute('src') === 'about:blank' }));
        check(result.catalog.total === index.models.length && result.catalog.rows === index.models.length, 'Incomplete official index');
        check(result.catalog.referenceInitiallyBlank, 'Official renderer should load on demand');
        const airFrame = () => page.frames().find((frame) => frame.url().includes('/gltf-viewer/?embed=1'));
        const before = await airFrame().evaluate(() => { const p = window.gltfViewer.camera.node.worldPosition; return { x:p.x, y:p.y, z:p.z }; });
        const canvas = await airFrame().locator('canvas').boundingBox();
        await page.mouse.move(canvas.x + canvas.width * 0.5, canvas.y + canvas.height * 0.45);
        await page.mouse.down(); await page.mouse.move(canvas.x + canvas.width * 0.6, canvas.y + canvas.height * 0.55, { steps: 8 }); await page.mouse.up();
        const after = await airFrame().evaluate(() => { const p = window.gltfViewer.camera.node.worldPosition; return { x:p.x,y:p.y,z:p.z }; });
        check(Math.abs(after.x-before.x)+Math.abs(after.y-before.y)+Math.abs(after.z-before.z) > 0.1, 'Orbit control did not rotate');
        await page.getByRole('button', { name: '重置视角' }).click();
        await airFrame().waitForFunction((p) => { const v=window.gltfViewer.camera.node.worldPosition; return Math.hypot(v.x-p.x,v.y-p.y,v.z-p.z)<0.001; }, before);
        result.orbitAndReset = true;

        await page.getByRole('combobox', { name: '模型分类' }).selectOption('local');
        check(await page.locator('.model-row').count() === Object.keys(index.local).length, 'Local filter did not match byte-verified copies');
        await page.getByRole('searchbox', { name: '搜索官方模型' }).fill('morph');
        check(await page.locator('.model-row').count() === 1, 'Search/filter intersection is incorrect');
        await page.getByRole('button', { name: 'Animated Morph Cube', exact: true }).click();
        await page.waitForFunction(() => document.querySelector('#air-state').textContent === 'READY' && document.querySelector('#model-title').textContent === 'Animated Morph Cube');
        const morph = await airFrame().evaluate(async () => {
            const { MeshRenderer } = await import('/build/cocosair.module.js');
            window.gltfViewer.sample(0.8);
            return { animations:window.gltfViewer.instance.animations.length, renderers:window.gltfViewer.instance.root.getComponentsInChildren(MeshRenderer).length };
        });
        check(morph.animations > 0 && morph.renderers > 0, 'Selected local model did not render'); result.localMorph = morph;
        await page.getByRole('searchbox', { name: '搜索官方模型' }).fill('no-such-model-4921');
        check(await page.locator('#empty').isVisible(), 'Empty search has no feedback');

        await page.getByRole('searchbox', { name: '搜索官方模型' }).fill('TriangleWithout');
        await page.getByRole('combobox', { name: '模型分类' }).selectOption('all');
        await page.getByRole('button', { name:'Triangle Without Indices', exact:true }).click();
        await page.waitForFunction(() => ['READY','ERROR'].includes(document.querySelector('#air-state').textContent), null, { timeout:45000 });
        result.remote = await page.evaluate(() => ({ state:document.querySelector('#air-state').textContent, status:document.querySelector('#load-status').textContent, source:document.querySelector('#asset-link').href }));
        check(result.remote.state === 'READY', `Remote core model failed: ${result.remote.status}`);
        await page.getByRole('combobox', { name:'文件格式' }).selectOption('glTF-Embedded');
        await page.waitForFunction(() => ['READY','ERROR'].includes(document.querySelector('#air-state').textContent), null, { timeout:45000 });
        check(await page.locator('#air-state').textContent() === 'READY', 'Embedded variant failed');
        result.variant = await page.locator('#asset-link').getAttribute('href');
        check(result.variant.includes('/glTF-Embedded/'), 'Variant URL did not change');

        // Isolated fault injection checks error messaging; it is not a claim about this official model.
        await page.route(result.variant, (route) => route.fulfill({ status:200, contentType:'model/gltf+json',
            body:JSON.stringify({asset:{version:'2.0'},extensionsRequired:['KHR_draco_mesh_compression']}) }));
        await page.getByRole('combobox', { name:'文件格式' }).selectOption('glTF');
        await page.waitForFunction(() => document.querySelector('#air-state').textContent === 'READY');
        await page.getByRole('combobox', { name:'文件格式' }).selectOption('glTF-Embedded');
        await page.waitForFunction(() => document.querySelector('#air-state').textContent === 'ERROR');
        result.injectedError = await page.locator('#load-status').textContent();
        check(result.injectedError.includes('KHR_draco_mesh_compression') && await page.locator('#official-link').getAttribute('href'), 'Unsupported extension feedback/link missing');
        await page.unroute(result.variant);

        await page.getByRole('searchbox', { name:'搜索官方模型' }).fill('BoxTextured');
        await page.getByRole('button', { name:'Box Textured', exact:true }).click();
        await page.waitForFunction(() => document.querySelector('#air-state').textContent === 'READY');
        await page.screenshot({ path:'output/playwright/gltf-catalog-desktop.png' });
        await page.getByRole('button', { name:'开启官方对照' }).click();
        result.comparison = await page.evaluate(() => {
            const ref = new URL(document.querySelector('#reference-preview').src);
            return { sameSource:ref.searchParams.get('model') === document.querySelector('#asset-link').href,
                visible:!document.querySelector('#reference-stage').hidden, url:ref.href };
        });
        check(result.comparison.sameSource && result.comparison.visible, 'Comparison uses a different model/variant');
        const reference = page.frames().find((frame) => frame.url().startsWith('https://github.khronos.org/'));
        if (reference) {
            await reference.waitForSelector('canvas', { timeout:45000 });
            result.comparison.canvas = true;
        }
        await page.screenshot({ path:'output/playwright/gltf-catalog-compare.png' });
        await page.getByRole('button', { name:'关闭官方对照' }).click();
        await page.setViewportSize({ width:390, height:844 });
        await page.waitForTimeout(200);
        result.mobile = await page.evaluate(() => ({ width:innerWidth, scrollWidth:document.documentElement.scrollWidth }));
        check(result.mobile.scrollWidth <= result.mobile.width, 'Mobile layout overflows horizontally');
        await page.screenshot({ path:'output/playwright/gltf-catalog-mobile.png', fullPage:true });
        check(failures.length === 0, failures.join('\n'));
        return { passed:true, result, failures };
    } finally { page.off('pageerror', onError); }
}
