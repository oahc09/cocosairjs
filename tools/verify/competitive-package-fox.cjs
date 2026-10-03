/** CB05: actual offline npm installation, pinned Fox, workspace/package/min pixels and native effect control. */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const playwright = require('playwright');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const root = path.resolve(__dirname, '../..');
const option = (name) => process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3);
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const modes = ['air-gltf-standard', 'air-gltf-shadow-map', 'builtin-standard-control'];
const sources = [
    'examples/gltf-viewer/main.js',
    'examples/gltf-viewer/index.html',
    'examples/shared/scene-kit.js',
    'examples/shared/asset-lifecycle.js',
    path.relative(root, __filename),
];
const sourceSha256 = Object.fromEntries(sources.map((file) => [file.replace(/\\/g, '/'), hash(path.join(root, file))]));
const packageRoot = path.resolve(
    option('package-root') || 'output/competitive-benchmark/final-fox-package-consumer/node_modules/cocosair.js',
);
const tarball = path.resolve(option('tarball') || 'output/competitive-benchmark/candidate/cocosair.js-1.0.0.tgz');
const tarballSha256 = hash(tarball);
const output = path.resolve(option('out') || 'output/competitive-benchmark/final-package-fox/browser.json');
const candidates = [
    { name: 'workspace', bundle: path.join(root, 'build/cocosair.module.js') },
    { name: 'installed-package', bundle: path.join(packageRoot, 'build/npm/cocosair.module.js') },
    { name: 'installed-package-min', bundle: path.join(packageRoot, 'build/npm/cocosair.module.min.js') },
].map((candidate) => ({ ...candidate, sha256: hash(candidate.bundle) }));
const binary = {
    chromium: ['chromium-1228', 'chrome-win64/chrome.exe'],
    firefox: ['firefox-1543', 'firefox/firefox.exe'],
    webkit: ['webkit-2336', 'Playwright.exe'],
};

(async () => {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    const server = await startExampleServer(root);
    const records = [];
    try {
        for (const [engine, executable] of Object.entries(binary)) {
            const browser = await playwright[engine].launch({
                headless: true,
                executablePath: path.join(process.env.LOCALAPPDATA, 'ms-playwright', ...executable),
                env: loopbackBrowserEnv(),
            });
            try {
                for (const candidate of candidates) {
                    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
                    const errors = [];
                    page.on('pageerror', (error) => errors.push(String(error)));
                    page.on('console', (message) => {
                        if (message.type() === 'error') errors.push(message.text());
                    });
                    await page.route('**/build/cocosair.module.js', (route) =>
                        route.fulfill({ path: candidate.bundle, contentType: 'application/javascript' }),
                    );
                    try {
                        await page.goto(`${server.origin}/examples/gltf-viewer/`);
                        await page
                            .getByRole('combobox', { name: '模型', exact: true })
                            .selectOption('official/Fox.glb');
                        await page.waitForFunction(() => window.gltfViewer?.name === 'official/Fox.glb', null, {
                            timeout: 30000,
                        });
                        for (const effect of modes) {
                            const pixels = await page.evaluate(async (mode) => {
                                const { game, director, MeshRenderer, Material, DirectionalLight } =
                                    await import('/build/cocosair.module.js');
                                const viewer = window.gltfViewer;
                                game.pause();
                                viewer.sample(0);
                                const scene = director.getScene();
                                const shadowMap = mode === 'air-gltf-shadow-map';
                                scene.globals.shadows.enabled = shadowMap;
                                if (shadowMap) {
                                    // Native ShadowType.ShadowMap is 1; not a standalone SDK export.
                                    scene.globals.shadows.type = 1;
                                    const light = scene.getComponentsInChildren(DirectionalLight)[0];
                                    const extent = Math.max(10, viewer.camera.near * 1000);
                                    light.shadowEnabled = true;
                                    light.shadowFixedArea = true;
                                    light.shadowNear = 0.1;
                                    light.shadowFar = extent * 12;
                                    light.shadowOrthoSize = extent * 4;
                                    light.node.setWorldPosition(viewer.camera.node.worldPosition);
                                    for (const renderer of viewer.instance.root.getComponentsInChildren(MeshRenderer)) {
                                        renderer.shadowCastingMode = 1;
                                        renderer.receiveShadow = true;
                                    }
                                }
                                if (mode === 'builtin-standard-control') {
                                    const replacements = new Map();
                                    for (const renderer of viewer.instance.root.getComponentsInChildren(MeshRenderer)) {
                                        renderer.sharedMaterials = renderer.sharedMaterials.map((source) => {
                                            if (!source) return source;
                                            if (replacements.has(source)) return replacements.get(source);
                                            const material = new Material();
                                            material.initialize({
                                                effectName: 'builtin-standard',
                                                defines: { USE_ALBEDO_MAP: true },
                                            });
                                            for (const name of [
                                                'albedo',
                                                'albedoScaleAndCutoff',
                                                'pbrParams',
                                                'emissive',
                                                'emissiveScaleParam',
                                                'mainTexture',
                                            ]) {
                                                const value = source.getProperty(name);
                                                if (value != null) material.setProperty(name, value);
                                            }
                                            replacements.set(source, material);
                                            return material;
                                        });
                                    }
                                }
                                const canvas = document.querySelector('canvas');
                                const gl = canvas.getContext('webgl2');
                                const read = () => {
                                    for (let frame = 0; frame < 3; ++frame) game.step();
                                    const bytes = new Uint8Array(canvas.width * canvas.height * 4);
                                    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
                                    return bytes;
                                };
                                viewer.instance.root.active = false;
                                const background = read();
                                viewer.instance.root.active = true;
                                viewer.sample(0);
                                const frame = read();
                                let visible = 0,
                                    lit = 0;
                                const rgb = [0, 0, 0];
                                for (let i = 0; i < frame.length; i += 4) {
                                    if (
                                        Math.abs(frame[i] - background[i]) +
                                            Math.abs(frame[i + 1] - background[i + 1]) +
                                            Math.abs(frame[i + 2] - background[i + 2]) <=
                                        12
                                    )
                                        continue;
                                    ++visible;
                                    if (frame[i] + frame[i + 1] + frame[i + 2] > 60) ++lit;
                                    for (let c = 0; c < 3; ++c) rgb[c] += frame[i + c];
                                }
                                const renderers = viewer.instance.root.getComponentsInChildren(MeshRenderer);
                                return {
                                    visible,
                                    lit,
                                    litRatio: lit / Math.max(visible, 1),
                                    meanRGB: rgb.map((sum) => sum / Math.max(visible, 1)),
                                    meshes: viewer.asset.meshes.length,
                                    textures: viewer.asset.textures.length,
                                    animations: viewer.asset.animations.length,
                                    effects: [
                                        ...new Set(
                                            renderers.flatMap((renderer) =>
                                                renderer.sharedMaterials.map((material) => material?.effectAsset?.name),
                                            ),
                                        ),
                                    ],
                                    albedoTextureBound: renderers.every((renderer) =>
                                        renderer.sharedMaterials.every((material) =>
                                            viewer.asset.textures.includes(material?.getProperty('mainTexture')),
                                        ),
                                    ),
                                    activeAlbedoSampler: renderers.every((renderer) =>
                                        renderer.model.subModels.every(
                                            (subModel) =>
                                                gl.getUniformLocation(
                                                    subModel.shaders[0].gpuShader.glProgram,
                                                    'albedoMap',
                                                ) !== null,
                                        ),
                                    ),
                                    shadowMapEnabled:
                                        shadowMap && scene.globals.shadows.enabled && scene.globals.shadows.type === 1,
                                    activeShadowSampler:
                                        shadowMap &&
                                        renderers.every((renderer) =>
                                            renderer.model.subModels.every(
                                                (subModel) =>
                                                    gl.getUniformLocation(
                                                        subModel.shaders[0].gpuShader.glProgram,
                                                        'cc_shadowMap',
                                                    ) !== null,
                                            ),
                                        ),
                                    glError: gl.getError(),
                                };
                            }, effect);
                            const screenshot = path.join(
                                path.dirname(output),
                                `fox-${engine}-${candidate.name}-${effect}.png`,
                            );
                            await page.locator('canvas').screenshot({ path: screenshot });
                            records.push({
                                engine,
                                browserVersion: browser.version(),
                                candidate: candidate.name,
                                bundleSha256: candidate.sha256,
                                effect,
                                pixels,
                                errors: [...errors],
                                screenshot: path.relative(root, screenshot).replace(/\\/g, '/'),
                                screenshotSha256: hash(screenshot),
                                ok:
                                    errors.length === 0 &&
                                    pixels.glError === 0 &&
                                    pixels.visible > 1000 &&
                                    pixels.litRatio > (effect === 'air-gltf-shadow-map' ? 0.1 : 0.7) &&
                                    pixels.albedoTextureBound &&
                                    pixels.activeAlbedoSampler &&
                                    (effect !== 'air-gltf-shadow-map' ||
                                        (pixels.shadowMapEnabled && pixels.activeShadowSampler)),
                            });
                        }
                    } finally {
                        await page.close();
                    }
                }
            } finally {
                await browser.close();
            }
        }
    } finally {
        await server.close();
    }
    const comparisons = [];
    for (const engine of Object.keys(binary))
        for (const effect of modes) {
            const workspace = records.find(
                (row) => row.engine === engine && row.candidate === 'workspace' && row.effect === effect,
            );
            for (const name of ['installed-package', 'installed-package-min']) {
                const installed = records.find(
                    (row) => row.engine === engine && row.candidate === name && row.effect === effect,
                );
                const maxRGBDifference = Math.max(
                    ...workspace.pixels.meanRGB.map((value, index) =>
                        Math.abs(value - installed.pixels.meanRGB[index]),
                    ),
                );
                comparisons.push({
                    engine,
                    effect,
                    candidate: name,
                    maxRGBDifference,
                    ok: maxRGBDifference <= 1 && workspace.pixels.visible === installed.pixels.visible,
                });
            }
        }
    const drift =
        candidates.some((candidate) => hash(candidate.bundle) !== candidate.sha256) ||
        sources.some((file) => hash(path.join(root, file)) !== sourceSha256[file.replace(/\\/g, '/')]) ||
        hash(tarball) !== tarballSha256;
    const report = {
        schema: 'competitive-installed-fox-v1',
        measuredAt: new Date().toISOString(),
        scope: 'CB05 pinned Fox, fixed viewer camera/light/time, actual npm installed current package incl min; native builtin effect as diagnostic control, not general equivalence',
        tarball: { path: path.relative(root, tarball).replace(/\\/g, '/'), sha256: tarballSha256 },
        sourceSha256,
        installedPackage: {
            path: packageRoot,
            version: JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8')).version,
        },
        runnerSha256: hash(__filename),
        modelSha256: hash(path.join(root, 'examples/gltf-viewer/assets/official/Fox.glb')),
        candidates,
        records,
        comparisons,
        candidateDrift: drift,
        ok: records.length === 27 && records.every((row) => row.ok) && comparisons.every((row) => row.ok) && !drift,
    };
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify({ ok: report.ok, records: records.length, comparisons, output }, null, 2));
    if (!report.ok) process.exitCode = 1;
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
