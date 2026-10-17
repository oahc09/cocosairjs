/* Browser contract probe. Writes only output/webgpu-backend/; never labels software GPU as hardware support.
 * NODE_PATH=<configured Playwright packages> node tools/verify/webgpu-backend.cjs
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const playwright = require('playwright');
const { launchOptions } = require('./browser-engines.cjs');
const { transformSync } = require('esbuild');
const { PNG } = require('pngjs');
const resourceContracts = require('./webgpu-resource-contracts.cjs');
const customPipeline = require('./webgpu-custom-pipeline.cjs');

const root = path.resolve(__dirname, '../..');
const engine = process.argv.find((arg) => arg.startsWith('--engine='))?.slice(9) || 'chromium';
if (!['chromium', 'edge', 'firefox', 'webkit'].includes(engine)) throw Error('Unknown browser engine');
const packageRoot = process.argv.find((arg) => arg.startsWith('--package-root='))?.slice(15);
const bundleName = process.argv.includes('--min') ? 'cocosair.module.min.js' : 'cocosair.module.js';
const artifactDirectory = packageRoot ? path.join(packageRoot, 'build/npm') : path.join(root, 'build');
const output = path.join(
    root,
    'output/webgpu-backend',
    packageRoot
        ? process.argv.includes('--min')
            ? 'package-min'
            : 'package'
        : process.argv.includes('--min')
          ? 'min'
          : engine === 'chromium'
            ? '.'
            : engine,
);
let forcedRenderer;
function sourceFingerprint() {
    const files = [
        ...new Set(
            execFileSync(
                'git',
                [
                    'ls-files',
                    '-c',
                    '-o',
                    '--exclude-standard',
                    '--',
                    'src',
                    'tools/build',
                    'package.json',
                    'tsconfig.json',
                    'vendor/webgpu/manifest.json',
                    'vendor/builtin-source',
                    ...[
                        'webgpu-basic',
                        'gltf-basic',
                        'gltf-skin',
                        'gltf-morph',
                        'ui-components',
                        'sprite-mask-blend',
                        'render-composite',
                        'shared',
                    ].map((name) => 'examples/' + name),
                ],
                { cwd: root, encoding: 'utf8' },
            )
                .trim()
                .split(/\r?\n/),
        ),
    ].sort();
    const hash = crypto.createHash('sha256');
    for (const file of files) {
        const absolute = path.join(root, file);
        if (fs.existsSync(absolute) && fs.statSync(absolute).isFile())
            hash.update(file).update(fs.readFileSync(absolute));
    }
    return hash.digest('hex');
}
function checkBuildSources() {
    const filename = path.join(root, 'build', bundleName + '.map');
    const map = JSON.parse(fs.readFileSync(filename, 'utf8'));
    let compared = 0;
    const mismatches = [];
    map.sources.forEach((source, index) => {
        const file = path.resolve(root, 'build', source);
        if (!/\.[jt]s$/.test(source) || !fs.existsSync(file) || !map.sourcesContent?.[index]) return;
        compared++;
        if (fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') !== map.sourcesContent[index].replace(/\r\n/g, '\n'))
            mismatches.push(source);
    });
    return {
        compared,
        mismatches,
        sha256: crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'),
    };
}
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/__webgpu-probe.html') {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><canvas id="GameCanvas" width="640" height="480"></canvas>');
        return;
    }
    if (pathname === '/favicon.ico') {
        response.writeHead(204).end();
        return;
    }
    let file = path.resolve(root, '.' + pathname);
    if (!file.startsWith(root + path.sep)) {
        response.writeHead(403).end();
        return;
    }
    if (pathname === '/build/cocosair.module.js') file = path.join(artifactDirectory, bundleName);
    else if (packageRoot && pathname.startsWith('/build/webgpu/'))
        file = path.join(artifactDirectory, pathname.slice('/build/'.length));
    if (!fs.existsSync(file) && file.endsWith('.js')) file = file.slice(0, -3) + '.ts';
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        response.writeHead(404).end();
        return;
    }
    const type = {
        '.html': 'text/html',
        '.ts': 'text/javascript',
        '.js': 'text/javascript',
        '.wasm': 'application/wasm',
    }[path.extname(file)];
    response.setHeader('Content-Type', type || 'application/octet-stream');
    const bytes = fs.readFileSync(file);
    let source = bytes.toString();
    if (
        /\.[jt]s$/.test(file) &&
        file.startsWith(path.join(root, 'examples') + path.sep) &&
        forcedRenderer &&
        !file.includes(`${path.sep}webgpu-basic${path.sep}`)
    ) {
        source = source.replace(/\bcreateAirApp\(\s*\{/g, `createAirApp({ renderer: '${forcedRenderer}',`);
    }
    response.end(
        file.endsWith('.ts')
            ? transformSync(source, { loader: 'ts', format: 'esm', target: 'esnext' }).code
            : file.endsWith('.js')
              ? source
              : bytes,
    );
});

(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const report = {
        measuredAt: new Date().toISOString(),
        completed: false,
        artifact: { packageRoot, bundleName },
        bundleSha256: crypto
            .createHash('sha256')
            .update(fs.readFileSync(path.join(artifactDirectory, bundleName)))
            .digest('hex'),
        cases: [],
    };
    report.sourceSha256 = sourceFingerprint();
    report.buildSources = checkBuildSources();
    report.probeSha256 = crypto
        .createHash('sha256')
        .update(fs.readFileSync(__filename))
        .update(fs.readFileSync(path.join(__dirname, 'webgpu-resource-contracts.cjs')))
        .update(fs.readFileSync(path.join(__dirname, 'webgpu-custom-pipeline.cjs')))
        .digest('hex');
    report.assetsManifestSha256 = crypto
        .createHash('sha256')
        .update(fs.readFileSync(path.join(root, 'vendor/webgpu/manifest.json')))
        .digest('hex');
    let browser;
    try {
        browser =
            engine === 'edge'
                ? await playwright.chromium.launch({ channel: 'msedge', headless: true })
                : await playwright[engine].launch({ ...launchOptions(engine), headless: true });
        report.browser = { engine, version: browser.version() };
        const capabilityPage = await browser.newPage();
        await capabilityPage.goto(`${base}/__webgpu-probe.html`);
        report.webgpuAvailability = await capabilityPage.evaluate(async () => ({
            apiAvailable: !!navigator.gpu,
            adapterAvailable: !!(await navigator.gpu?.requestAdapter()),
        }));
        await capabilityPage.close();
        const scenarios = [
            { renderer: 'webgl2', example: 'webgpu-basic' },
            { renderer: 'webgpu', example: 'webgpu-basic' },
        ];
        if (process.argv.includes('--examples') || process.argv.includes('--shadows')) {
            scenarios.push({ renderer: 'webgl2', example: 'webgpu-basic', variant: 'shadows' });
            scenarios.push({ renderer: 'webgpu', example: 'webgpu-basic', variant: 'shadows' });
            scenarios.push({ renderer: 'webgl2', example: 'webgpu-basic', variant: 'csm' });
            scenarios.push({ renderer: 'webgpu', example: 'webgpu-basic', variant: 'csm' });
        }
        if (process.argv.includes('--examples')) {
            scenarios.push({ renderer: 'webgl2', example: 'gltf-skin' });
            for (const example of [
                'gltf-basic',
                'gltf-skin',
                'gltf-morph',
                'ui-components',
                'sprite-mask-blend',
                'render-composite',
            ]) {
                scenarios.push({ renderer: 'webgpu', example });
            }
        }
        if (process.argv.includes('--custom')) {
            scenarios.push({ renderer: 'webgl2', example: 'native-custom' });
            scenarios.push({ renderer: 'webgpu', example: 'native-custom' });
        }
        for (const { renderer, example, variant } of scenarios) {
            const started = Date.now();
            forcedRenderer = renderer;
            const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
            if (renderer === 'webgpu' && !report.webgpuAvailability.adapterAvailable) {
                await page.goto(`${base}/__webgpu-probe.html`);
                const rejection = await page.evaluate(async () => {
                    const contexts = [];
                    const original = HTMLCanvasElement.prototype.getContext;
                    HTMLCanvasElement.prototype.getContext = function (kind, ...args) {
                        contexts.push(kind);
                        return original.call(this, kind, ...args);
                    };
                    const m = await import('/build/cocosair.module.js');
                    let code;
                    try {
                        await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgpu' });
                    } catch (error) {
                        code = error.code;
                    }
                    return { code, contexts };
                });
                report.cases.push({
                    renderer,
                    example,
                    variant,
                    blocked: true,
                    reason: 'No native WebGPU adapter in this browser environment.',
                    rejection,
                });
                console.log(JSON.stringify(report.cases.at(-1)));
                await page.close();
                continue;
            }
            const errors = [],
                requests = [];
            await page.addInitScript(() => {
                window.__gpuErrors = [];
                if (typeof GPUAdapter !== 'undefined') {
                    const original = GPUAdapter.prototype.requestDevice;
                    GPUAdapter.prototype.requestDevice = async function (...args) {
                        const device = await original.apply(this, args);
                        device.addEventListener('uncapturederror', (event) =>
                            window.__gpuErrors.push(event.error.message),
                        );
                        return device;
                    };
                }
            });
            page.on('pageerror', (error) => errors.push(String(error.stack || error)));
            page.on('console', (message) => {
                if (message.type() === 'error') errors.push(message.text());
            });
            page.on('request', (request) => {
                if (request.url().includes('/webgpu/')) requests.push(request.url());
            });
            await page.goto(
                example === 'native-custom'
                    ? `${base}/__webgpu-probe.html`
                    : `${base}/examples/${example}/index.html?renderer=${renderer}${variant ? '&shadows=' + (variant === 'csm' ? 'csm' : '1') : ''}`,
            );
            let custom;
            if (example === 'native-custom') {
                custom = await page.evaluate(customPipeline, renderer).catch((error) => {
                    errors.push(error.message);
                    return null;
                });
            }
            await page
                .waitForFunction(() => window.__airApp, null, { timeout: 45000 })
                .catch((error) => errors.push(error.message));
            await page
                .waitForFunction(
                    async () => {
                        const m = await import('/build/cocosair.module.js');
                        return !!m.director.getScene();
                    },
                    null,
                    { timeout: 15000 },
                )
                .catch((error) => errors.push(error.message));
            if (example === 'gltf-skin') {
                await page
                    .waitForFunction(() => window.__skinState?.skeletons > 0, null, { timeout: 30000 })
                    .catch((error) => errors.push(error.message));
            }
            await page
                .evaluate(async () => {
                    const m = await import('/build/cocosair.module.js');
                    const clock = m.createStepClock();
                    clock.begin();
                    for (let index = 0; index < 3; index++) await clock.step();
                    await m.director.root.device.nativeDevice?.queue.onSubmittedWorkDone();
                })
                .catch((error) => errors.push(error.message));
            const resources =
                example === 'webgpu-basic' && !variant
                    ? await page.evaluate(resourceContracts).catch((error) => {
                          errors.push(error.message);
                          return null;
                      })
                    : null;
            const state = await page.evaluate(async () => {
                const m = await import('/build/cocosair.module.js');
                const adapter = await navigator.gpu?.requestAdapter();
                return {
                    app: !!window.__airApp,
                    api: m.director.root?.device.gfxAPI,
                    expectedApi: m.gfx.API.WEBGPU,
                    health: window.__airApp?.contextHealth.snapshot(),
                    gpuErrors: window.__gpuErrors,
                    adapter: adapter && {
                        vendor: adapter.info.vendor,
                        architecture: adapter.info.architecture,
                        device: adapter.info.device,
                        description: adapter.info.description,
                        isFallbackAdapter: adapter.isFallbackAdapter ?? adapter.info.isFallbackAdapter ?? null,
                    },
                };
            });
            state.startupAndProbeMs = Date.now() - started;
            state.gpuTimestampMs = null; // No timestamp-query benchmark is requested or enabled.
            const capture = `${example}${variant ? '-' + variant : ''}-${renderer}.png`;
            await page.screenshot({ path: path.join(output, capture) });
            const png = PNG.sync.read(fs.readFileSync(path.join(output, capture)));
            if (example === 'gltf-skin') {
                await page.evaluate(async () => {
                    const m = await import('/build/cocosair.module.js');
                    const clock = m.createStepClock();
                    clock.begin();
                    for (let i = 0; i < 30; i++) await clock.step(1 / 60);
                    await m.director.root.device.nativeDevice?.queue.onSubmittedWorkDone();
                });
                const animated = PNG.sync.read(
                    await page.screenshot({ path: path.join(output, `gltf-skin-animated-${renderer}.png`) }),
                );
                let changed = 0;
                for (let i = 0; i < png.data.length; i += 4) {
                    if (Math.max(...[0, 1, 2].map((c) => Math.abs(png.data[i + c] - animated.data[i + c]))) > 12)
                        changed++;
                }
                state.skinAnimationChangedPixels = changed;
                state.gpuErrors = await page.evaluate(() => window.__gpuErrors);
                if (changed < 100) errors.push('Skinned animation did not deform visible geometry.');
            }
            if (example === 'native-custom' && custom) {
                const differences = (a, b) => {
                    let changed = 0,
                        maxDelta = 0;
                    for (let i = 0; i < a.data.length; i += 4) {
                        const delta = Math.max(...[0, 1, 2].map((c) => Math.abs(a.data[i + c] - b.data[i + c])));
                        if (delta > 12) changed++;
                        maxDelta = Math.max(maxDelta, delta);
                    }
                    return { changed, maxDelta };
                };
                custom.effectsAB = {};
                for (const effect of ['bloom', 'fxaa', 'grading']) {
                    const set = async (enabled) => {
                        await page.evaluate(
                            async ({ effect, enabled }) => {
                                const m = await import('/build/cocosair.module.js');
                                window.__nativePost[effect].enabled = enabled;
                                const clock = m.createStepClock();
                                clock.begin();
                                for (let i = 0; i < 3; i++) await clock.step();
                                await m.director.root.device.nativeDevice?.queue.onSubmittedWorkDone();
                            },
                            { effect, enabled },
                        );
                        const name = `native-${effect}-${enabled ? 'on' : 'restore'}-${renderer}.png`;
                        const bytes = await page.screenshot({ path: path.join(output, name) });
                        return PNG.sync.read(bytes);
                    };
                    const enabled = await set(true);
                    const restored = await set(false);
                    const on = differences(png, enabled),
                        restore = differences(png, restored);
                    custom.effectsAB[effect] = { on, restore };
                    if (on.changed < 50 || restore.maxDelta > 1) errors.push(`Native ${effect} A/B or restore failed.`);
                    if (effect === 'grading') {
                        const point = await page.evaluate(() => {
                            const { camera, patch } = window.__nativePost;
                            const p = camera.worldToScreen(patch.worldPosition);
                            return { x: Math.round(p.x), y: Math.round(innerHeight - p.y) };
                        });
                        const index = (point.y * png.width + point.x) * 4;
                        const off = Array.from(png.data.slice(index, index + 3));
                        const actual = Array.from(enabled.data.slice(index, index + 3));
                        const expected = [off[1], Math.round((Math.min(off[2] / 4, 63) * 255) / 63), off[0]];
                        custom.gradingOracle = { point, off, actual, expected };
                        if (actual.some((value, i) => Math.abs(value - expected[i]) > 2))
                            errors.push('Native LUT channel oracle failed.');
                    }
                }
                state.gpuErrors = await page.evaluate(() => window.__gpuErrors);
                if (!custom.custom) errors.push('Native custom pipeline was not selected.');
            }
            let visiblePixels = 0;
            for (let index = 0; index < png.data.length; index += 4) {
                if (
                    Math.abs(png.data[index] - 30) +
                        Math.abs(png.data[index + 1] - 40) +
                        Math.abs(png.data[index + 2] - 60) >
                        40 &&
                    png.data[index] + png.data[index + 1] + png.data[index + 2] > 80
                )
                    visiblePixels++;
            }
            let shadowChangedPixels;
            if (variant === 'shadows' || variant === 'csm') {
                state.shadow = await page.evaluate(async () => {
                    const m = await import('/build/cocosair.module.js');
                    const scene = m.director.getScene(),
                        pipeline = m.director.root.pipeline;
                    const framebuffer = pipeline.pipelineSceneData.shadowFrameBufferMap.values().next().value;
                    let shadowMap;
                    if (
                        framebuffer?.colorTextures[0] &&
                        (m.director.root.device.gfxAPI !== m.gfx.API.WEBGPU ||
                            framebuffer.colorTextures[0].usage & m.gfx.TextureUsageBit.TRANSFER_SRC)
                    ) {
                        const texture = framebuffer.colorTextures[0],
                            g = m.gfx;
                        const region = new g.BufferTextureCopy();
                        region.texExtent.width = texture.width;
                        region.texExtent.height = texture.height;
                        const bytes = new Uint8Array(
                            g.FormatInfos[texture.format].size * texture.width * texture.height,
                        );
                        await m.director.root.device.copyTextureToBuffersAsync(texture, [bytes], [region]);
                        const data = texture.format === g.Format.R32F ? new Float32Array(bytes.buffer) : bytes;
                        let min = Infinity,
                            max = -Infinity;
                        for (const value of data) {
                            min = Math.min(min, value);
                            max = Math.max(max, value);
                        }
                        shadowMap = { format: g.Format[texture.format], min, max };
                    }
                    return {
                        enabled: scene.globals.shadows.enabled,
                        shadowMap,
                        castObjects: pipeline.pipelineSceneData.csmLayers.castShadowObjects.length,
                        layerObjects: pipeline.pipelineSceneData.csmLayers.specialLayer.shadowObjects.length,
                        phase: m.getPhaseID?.('shadow-caster'),
                        queues: pipeline.flows
                            .filter((flow) => flow.name === 'ShadowFlow')
                            .map((flow) =>
                                flow.stages.map((stage) => stage._additiveShadowQueue?._subModelsArray.length),
                            ),
                        runtimeEnabled: pipeline.pipelineSceneData.shadows.enabled,
                        macros: {
                            shadow: pipeline.macros.CC_SHADOW_TYPE,
                            dir: pipeline.macros.CC_DIR_LIGHT_SHADOW_TYPE,
                        },
                        framebuffers: pipeline.pipelineSceneData.shadowFrameBufferMap.size,
                        models: scene.getComponentsInChildren(m.MeshRenderer).map((renderer) => ({
                            cast: renderer.model?.castShadow,
                            receive: renderer.model?.receiveShadow,
                            receiveDirLight: renderer.model?.receiveDirLight,
                            passes: renderer.model?.subModels[0].passes.map((pass) => ({
                                phase: pass.phase,
                                program: pass.program,
                                defines: pass.defines,
                            })),
                        })),
                    };
                });
                await page.evaluate(async () => {
                    const m = await import('/build/cocosair.module.js');
                    m.director.getScene().globals.shadows.enabled = false;
                    const clock = m.createStepClock();
                    clock.begin();
                    for (let index = 0; index < 3; index++) await clock.step();
                    await m.director.root.device.nativeDevice?.queue.onSubmittedWorkDone();
                });
                const without = PNG.sync.read(
                    await page.screenshot({ path: path.join(output, 'shadows-disabled.png') }),
                );
                shadowChangedPixels = 0;
                for (let index = 0; index < png.data.length; index += 4) {
                    if (
                        Math.abs(png.data[index] - without.data[index]) +
                            Math.abs(png.data[index + 1] - without.data[index + 1]) +
                            Math.abs(png.data[index + 2] - without.data[index + 2]) >
                        15
                    )
                        shadowChangedPixels++;
                }
                if (shadowChangedPixels < 100)
                    errors.push('Shadow enable/disable did not change visible receiver pixels.');
                state.gpuErrors = await page.evaluate(() => window.__gpuErrors);
            }
            report.cases.push({
                renderer,
                example,
                variant,
                state,
                resources,
                shadowChangedPixels,
                custom,
                visiblePixels,
                errors,
                translatorRequests: requests,
                capture,
            });
            if (renderer === 'webgpu' && example === 'webgpu-basic' && !variant) {
                const lost = await page
                    .evaluate(async () => {
                        const m = await import('/build/cocosair.module.js');
                        const device = m.director.root.device;
                        device.nativeDevice.destroy();
                        await device.nativeDevice.lost;
                        await Promise.resolve();
                        const health = window.__airApp.contextHealth.snapshot();
                        let submissionRejected = false;
                        try {
                            device.commandBuffer.begin();
                        } catch (error) {
                            submissionRejected = error.message.includes('WEBGPU_DEVICE_LOST');
                        }
                        return { health, submissionRejected };
                    })
                    .catch((error) => {
                        errors.push(error.message);
                        return null;
                    });
                report.cases[report.cases.length - 1].deviceLost = lost;
                if (!lost || lost.health.state !== 'failed' || !lost.submissionRejected)
                    errors.push('Device-loss contract failed.');
            }
            console.log(
                JSON.stringify({
                    renderer,
                    example,
                    api: state.api,
                    resources,
                    visiblePixels,
                    errors: errors.map((error) => error.slice(0, 800)),
                    gpuErrors: state.gpuErrors.map((error) => error.slice(0, 800)),
                }),
            );
            await page.close();
        }
        report.failures = [];
        const failureCases = [
            ['unsupported', 'WEBGPU_UNSUPPORTED'],
            ['no-adapter', 'WEBGPU_ADAPTER_UNAVAILABLE'],
            ['device-rejected', 'WEBGPU_DEVICE_REQUEST_FAILED'],
            ['assets-missing', 'WEBGPU_SHADER_ASSETS_FAILED'],
        ];
        for (const [failure, expectedCode] of report.webgpuAvailability.adapterAvailable
            ? failureCases
            : failureCases.slice(0, 1)) {
            const page = await browser.newPage();
            await page.addInitScript((failure) => {
                window.__contextRequests = [];
                const original = HTMLCanvasElement.prototype.getContext;
                HTMLCanvasElement.prototype.getContext = function (type, ...args) {
                    window.__contextRequests.push(type);
                    return original.call(this, type, ...args);
                };
                if (failure === 'unsupported') Object.defineProperty(navigator, 'gpu', { value: undefined });
                else if (failure === 'no-adapter') navigator.gpu.requestAdapter = async () => null;
                else if (failure === 'device-rejected')
                    GPUAdapter.prototype.requestDevice = async () => {
                        throw new Error('probe-device-rejected');
                    };
            }, failure);
            await page.goto(`${base}/__webgpu-probe.html`);
            const actual = await page.evaluate(async (failure) => {
                const m = await import('/build/cocosair.module.js');
                const options = {
                    canvas: '#GameCanvas',
                    renderer: 'webgpu',
                    ...(failure === 'assets-missing' ? { webgpu: { assetBaseUrl: '/missing/' } } : {}),
                };
                let code, retryCode;
                try {
                    await m.createAirApp(options);
                } catch (error) {
                    code = error.code;
                }
                try {
                    await m.createAirApp(options);
                } catch (error) {
                    retryCode = error.code;
                }
                return { code, retryCode, contexts: window.__contextRequests };
            }, failure);
            const ok =
                actual.code === expectedCode &&
                actual.retryCode === 'AIR_E_APP_RELOAD_REQUIRED' &&
                !actual.contexts.includes('webgl2') &&
                !actual.contexts.includes('webgl');
            report.failures.push({ failure, expectedCode, actual, ok });
            await page.close();
        }
        report.completed = true;
        report.sourceUnchanged = report.sourceSha256 === sourceFingerprint();
        process.exitCode =
            !report.sourceUnchanged ||
            !report.buildSources.compared ||
            report.buildSources.mismatches.length > 0 ||
            report.cases.some(
                (item) =>
                    item.blocked ||
                    !item.state.app ||
                    item.visiblePixels < 500 ||
                    item.errors.length ||
                    item.state.gpuErrors.length ||
                    (item.renderer === 'webgpu' && item.state.api !== item.state.expectedApi) ||
                    (item.renderer === 'webgl2' && item.translatorRequests.length),
            ) ||
            report.failures.some((item) => !item.ok)
                ? 1
                : 0;
        report.status = report.cases.some((item) => item.blocked)
            ? 'BLOCKED'
            : process.exitCode === 0
              ? 'PASS'
              : 'FAIL';
        report.exitCode = process.exitCode;
    } finally {
        await browser?.close();
        server.close();
        fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
})().catch((error) => {
    console.error(error);
    server.close();
    process.exitCode = 1;
});
