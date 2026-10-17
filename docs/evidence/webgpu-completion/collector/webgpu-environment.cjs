/* Native browser preflight, independent of the AIR bundle. Writes only a new --out directory.
 * NODE_PATH=<Playwright tooling> node tools/verify/webgpu-environment.cjs --out=output/webgpu-environment
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const playwright = require('playwright');
const { launchOptions } = require('./browser-engines.cjs');

const directory = process.argv.find((value) => value.startsWith('--out='))?.slice(6);
if (!directory || fs.existsSync(directory))
    throw Error('Pass --out=<new directory>; previous diagnostics are preserved.');
fs.mkdirSync(directory, { recursive: true });
const report = {
    measuredAt: new Date().toISOString(),
    platform: process.platform,
    playwright: require('playwright/package.json').version,
    completed: false,
    profiles: [],
};
const server = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><canvas width="64" height="64"></canvas>');
});

async function nativeProbe() {
    const result = { secure: isSecureContext, apiAvailable: !!navigator.gpu, adapterAvailable: false };
    if (!navigator.gpu) return result;
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) return result;
    result.adapterAvailable = true;
    const info = adapter.info || (await adapter.requestAdapterInfo?.());
    result.adapter = info && {
        vendor: info.vendor,
        architecture: info.architecture,
        device: info.device,
        description: info.description,
        isFallbackAdapter: adapter.isFallbackAdapter ?? info.isFallbackAdapter ?? null,
    };
    result.features = Array.from(adapter.features);
    result.limits = {
        maxBindGroups: adapter.limits.maxBindGroups,
        maxUniformBuffersPerShaderStage: adapter.limits.maxUniformBuffersPerShaderStage,
    };
    const device = await adapter.requestDevice();
    try {
        device.pushErrorScope('validation');
        const canvas = document.querySelector('canvas');
        const context = canvas.getContext('webgpu');
        const format = navigator.gpu.getPreferredCanvasFormat();
        context.configure({
            device,
            format,
            alphaMode: 'opaque',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
        });
        const target = context.getCurrentTexture();
        const staging = device.createBuffer({
            size: 256 * 64,
            usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
        });
        try {
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginRenderPass({
                colorAttachments: [
                    {
                        view: target.createView(),
                        clearValue: { r: 0.25, g: 0.5, b: 0.75, a: 1 },
                        loadOp: 'clear',
                        storeOp: 'store',
                    },
                ],
            });
            pass.end();
            encoder.copyTextureToBuffer({ texture: target }, { buffer: staging, bytesPerRow: 256 }, [64, 64]);
            device.queue.submit([encoder.finish()]);
            await staging.mapAsync(GPUMapMode.READ);
            result.rawPixel = Array.from(new Uint8Array(staging.getMappedRange()).slice(0, 4));
            result.format = format;
            const expected = format.startsWith('bgra') ? [191, 128, 64, 255] : [64, 128, 191, 255];
            result.nativeReadback = result.rawPixel.every((value, i) => Math.abs(value - expected[i]) <= 1);
        } finally {
            staging.unmap();
            staging.destroy();
        }
        result.validationError = (await device.popErrorScope())?.message || null;
        await device.queue.onSubmittedWorkDone();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        context.unconfigure();
    } finally {
        device.destroy();
    }
    return result;
}

(async () => {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const profiles = [
        { name: 'firefox-headless', engine: 'firefox', headless: true },
        { name: 'firefox-headed', engine: 'firefox', headless: false },
        {
            name: 'firefox-headless-gpu-process',
            engine: 'firefox',
            headless: true,
            firefoxUserPrefs: { 'layers.gpu-process.allow-headless': true },
        },
        { name: 'webkit-headless', engine: 'webkit', headless: true },
        { name: 'webkit-headed', engine: 'webkit', headless: false },
    ];
    try {
        for (const profile of profiles) {
            let browser;
            const options = {
                ...launchOptions(profile.engine),
                headless: profile.headless,
                ...(profile.firefoxUserPrefs ? { firefoxUserPrefs: profile.firefoxUserPrefs } : {}),
            };
            const observation = { name: profile.name, options };
            report.profiles.push(observation);
            try {
                browser = await playwright[profile.engine].launch(options);
                observation.version = browser.version();
                const page = await browser.newPage();
                page.setDefaultTimeout(15000);
                await page.goto(`http://127.0.0.1:${server.address().port}/`);
                let timeout;
                try {
                    observation.native = await Promise.race([
                        page.evaluate(nativeProbe),
                        new Promise((_, reject) => {
                            timeout = setTimeout(() => reject(Error('Native preflight timeout')), 20000);
                        }),
                    ]);
                } finally {
                    clearTimeout(timeout);
                }
                if (profile.engine === 'firefox' && process.argv.includes('--graphics')) {
                    await page.goto('about:support', { waitUntil: 'commit' });
                    await page.waitForSelector('#graphics-features-tbody tr');
                    observation.graphics = await page.evaluate(() =>
                        [
                            'graphics-features-tbody',
                            'graphics-decisions-tbody',
                            'graphics-failures-tbody',
                            'graphics-diagnostics-tbody',
                        ]
                            .map((id) => ({ id, text: document.getElementById(id)?.innerText }))
                            .filter((item) => item.text),
                    );
                }
            } catch (error) {
                observation.error = String(error.stack || error);
            } finally {
                await browser?.close();
            }
            console.log(
                JSON.stringify({ name: observation.name, native: observation.native, error: observation.error }),
            );
        }
        report.completed = true;
    } finally {
        server.close();
        report.probeSha256 = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
        fs.writeFileSync(path.join(directory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
    server.close();
});
