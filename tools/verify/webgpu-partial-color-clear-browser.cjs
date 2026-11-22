/* Focused, opt-in native WebGPU pixel probe. Prints a JSON result; does not publish evidence. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const root = path.resolve(__dirname, '../..');

async function rendererProbe(sdk) {
    const m = await import(sdk);
    const app = await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgpu' });
    const g = m.gfx;
    const dev = m.director.root.device;
    if (dev.gfxAPI !== g.API.WEBGPU) throw new Error('Native WebGPU backend required');
    const native = dev.nativeDevice;
    const info = native.adapterInfo;
    const adapter = {
        vendor: info?.vendor || dev.vendor,
        device: info?.device || dev.renderer,
        description: info?.description || null,
        isFallbackAdapter: info?.isFallbackAdapter ?? null,
    };
    const own = [];
    const allocate = (item) => {
        own.push(item);
        return item;
    };
    const scope = m.createStepClock();
    await scope.begin();
    const observations = [];
    const uncaptured = [];
    const onError = (event) => uncaptured.push(event.error.message);
    native.addEventListener('uncapturederror', onError);
    try {
        native.pushErrorScope('validation');
        try {
            const formats = [g.Format.RGBA8, g.Format.RGBA16F];
            const createTextures = () =>
                formats.map((format) =>
                    allocate(
                        dev.createTexture(
                            new g.TextureInfo(
                                g.TextureType.TEX2D,
                                g.TextureUsageBit.COLOR_ATTACHMENT | g.TextureUsageBit.TRANSFER_SRC,
                                format,
                                4,
                                4,
                            ),
                        ),
                    ),
                );
            const a = createTextures(),
                b = createTextures();
            const makeCommandBuffer = () => allocate(dev.createCommandBuffer(new g.CommandBufferInfo(dev.queue)));
            const seed = makeCommandBuffer();
            const cmd = makeCommandBuffer();
            const blue = new g.Color(0, 0, 1, 1);
            const red = new g.Color(1, 0, 0, 1);
            const green = new g.Color(0, 1, 0, 1);
            const whole = new g.Rect(0, 0, 4, 4),
                partial = new g.Rect(1, 1, 2, 2);
            const encodePass = (buffer, textures, choices, rect, colors) => {
                const attachments = formats.map((format, index) => {
                    const a = new g.ColorAttachment(format);
                    a.loadOp = choices[index] ? g.LoadOp.CLEAR : g.LoadOp.LOAD;
                    a.storeOp = g.StoreOp.STORE;
                    return a;
                });
                const pass = allocate(dev.createRenderPass(new g.RenderPassInfo(attachments)));
                const fb = allocate(dev.createFramebuffer(new g.FramebufferInfo(pass, textures)));
                buffer.beginRenderPass(pass, fb, rect, colors, 1, 0);
                buffer.endRenderPass();
            };
            const clear = (textures, choices, rect, colors) => {
                cmd.begin();
                encodePass(cmd, textures, choices, rect, colors);
                cmd.end();
            };
            const region = new g.BufferTextureCopy();
            region.texExtent.width = region.texExtent.height = 4;
            const read = async (textures) => {
                const u = new Uint8Array(64),
                    f = new Uint16Array(64);
                await dev.copyTextureToBuffersAsync(textures[0], [u], [region]);
                await dev.copyTextureToBuffersAsync(textures[1], [f], [region]);
                return [Array.from(u), Array.from(f)];
            };
            const expected = (isHalf, inside, outside, encoded) => {
                const max = isHalf ? 0x3c00 : 255;
                return Array.from({ length: 16 }, (_, ix) => {
                    const x = ix % 4,
                        y = Math.floor(ix / 4);
                    const pixel = x >= 1 && x <= 2 && y >= 1 && y <= 2 ? inside : outside;
                    return encoded ? pixel : pixel.map((value) => value * max);
                }).flat();
            };
            const check = async (name, paths, colors, encoded = false) => {
                const observed = await read(paths);
                observed.forEach((row, index) => {
                    const want = expected(index === 1, ...colors[index], encoded);
                    const offset = row.findIndex((value, i) => value !== want[i]);
                    if (offset !== -1) {
                        const x = Math.floor(offset / 4) % 4;
                        const y = Math.floor(offset / 16);
                        throw new Error(
                            `${name}: attachment ${index} pixel (${x}, ${y}) channel ${offset % 4}: expected ${want[offset]}, got ${row[offset]}`,
                        );
                    }
                });
                observations.push({ name, rgba8: observed[0], rgba16fBits: observed[1] });
            };
            const B = [0, 0, 1, 1],
                R = [1, 0, 0, 1],
                G = [0, 1, 0, 1];
            seed.begin();
            encodePass(seed, a, [true, true], whole, [blue, blue]);
            encodePass(seed, b, [true, true], whole, [red, red]);
            seed.end();
            clear(a, [true, false], partial, [green, green]);
            await check('A first pass CLEAR/LOAD', a, [
                [G, B],
                [B, B],
            ]);
            clear(b, [false, true], partial, [blue, blue]);
            await check('B first pass LOAD/CLEAR', b, [
                [R, R],
                [B, R],
            ]);
            await check('A unchanged by B', a, [
                [G, B],
                [B, B],
            ]);
            clear(a, [false, true], partial, [red, red]);
            await check('A first pass LOAD/CLEAR on return', a, [
                [G, B],
                [R, B],
            ]);

            cmd.begin();
            encodePass(cmd, a, [false, false], partial, [red, green]);
            cmd.end();
            await check('A partial LOAD/LOAD preserves both attachments', a, [
                [G, B],
                [R, B],
            ]);

            // Keep three scoped clears in one engine command buffer: RGBA8 -> RGBA16F -> RGBA8.
            // Two texture sets and different final colors preserve evidence of all three passes.
            cmd.begin();
            encodePass(cmd, a, [true, true], whole, [blue, blue]);
            encodePass(cmd, a, [true, false], partial, [green, red]);
            encodePass(cmd, a, [false, true], partial, [red, green]);
            encodePass(cmd, b, [true, false], partial, [blue, green]);
            cmd.end();
            await check('A later passes CLEAR/LOAD and LOAD/CLEAR', a, [
                [G, B],
                [G, B],
            ]);
            await check('B later CLEAR/LOAD after RGBA8 -> RGBA16F -> RGBA8', b, [
                [B, R],
                [B, R],
            ]);
            clear(b, [true, true], whole, [green, blue]);
            await check('B final whole-area CLEAR/CLEAR control', b, [
                [G, G],
                [B, B],
            ]);

            // Check identical signed/HDR inputs under the native full clear and scissored draw paths.
            // Compare raw component values against independently specified UNORM8 / binary16 encodings.
            const hdr = new g.Color(-0.5, 1.5, 2, 1);
            const hdr8 = [0, 255, 255, 255];
            const hdr16 = [0xb800, 0x3e00, 0x4000, 0x3c00];
            const red8 = [255, 0, 0, 255];
            const blue16 = [0, 0, 0x3c00, 0x3c00];
            clear(b, [true, true], whole, [hdr, hdr]);
            await check(
                'HDR full CLEAR/CLEAR native reference',
                b,
                [
                    [hdr8, hdr8],
                    [hdr16, hdr16],
                ],
                true,
            );
            clear(a, [true, true], whole, [red, blue]);
            cmd.begin();
            encodePass(cmd, a, [true, false], partial, [hdr, hdr]);
            encodePass(cmd, a, [false, true], partial, [hdr, hdr]);
            cmd.end();
            await check(
                'HDR partial CLEAR/LOAD and LOAD/CLEAR preserve signed half range',
                a,
                [
                    [hdr8, red8],
                    [hdr16, blue16],
                ],
                true,
            );
        } finally {
            const error = await native.popErrorScope();
            if (error) throw new Error('WebGPU validation: ' + error.message);
        }
    } finally {
        native.removeEventListener('uncapturederror', onError);
        for (const item of own.reverse()) item.destroy();
        scope.end();
        await app.close();
    }
    if (uncaptured.length) throw new Error('Uncaptured WebGPU error: ' + uncaptured.join('; '));
    return {
        status: 'PASS',
        backend: g.API.WEBGPU,
        adapter,
        checks: observations.map(({ name }) => name),
        observations,
    };
}

async function main() {
    const raw = process.argv.slice(2);
    assert(
        raw.every((arg) => /^--(?:browser|bundle|headed)=.+$/.test(arg)),
        'unknown probe argument',
    );
    const args = Object.fromEntries(
        raw.map((arg) => [arg.slice(2, arg.indexOf('=')), arg.slice(arg.indexOf('=') + 1)]),
    );
    assert.equal(Object.keys(args).length, raw.length, 'duplicate probe argument');
    assert(args.headed === undefined || args.headed === '1', '--headed=1');
    const engine = args.browser || 'chromium';
    assert(['chromium', 'firefox', 'webkit'].includes(engine), 'unknown browser');
    const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
    assert(bundle.startsWith(root + path.sep), 'candidate must be inside the checkout');
    const binding = verifySourceBinding(root, bundle);
    assert.equal(binding.matches, true, 'bundle must bind current sources');
    const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
    const bundleSha256 = sha256(bundle);
    let browser, server;
    try {
        server = await startExampleServer(root);
        // Reuse only executable resolution, not the shared WebGL software flags.
        const { executablePath } = launchOptions(engine);
        browser = await require('playwright')[engine].launch({
            headless: args.headed !== '1',
            executablePath,
            env: loopbackBrowserEnv(),
            timeout: 12000,
        });
        const page = await browser.newPage();
        await page.route('**/__mrt_partial.html', (route) =>
            route.fulfill({
                contentType: 'text/html',
                body: '<!doctype html><canvas id="GameCanvas" width="64" height="64"></canvas>',
            }),
        );
        await page.goto(server.origin + '/__mrt_partial.html');
        if (!(await page.evaluate(async () => !!(await navigator.gpu?.requestAdapter())))) {
            console.log(
                JSON.stringify({
                    status: 'BLOCKED',
                    browser: browser.version(),
                    reason: 'WebGPU adapter unavailable',
                    bundleSha256,
                    sourceBinding: binding,
                }),
            );
            process.exitCode = 2;
            return;
        }
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text());
        });
        const result = await page.evaluate(rendererProbe, '/' + path.relative(root, bundle).split(path.sep).join('/'));
        assert.deepEqual(errors, []);
        assert.equal(sha256(bundle), bundleSha256, 'bundle changed during probe');
        assert.deepEqual(verifySourceBinding(root, bundle), binding, 'source binding changed during probe');
        console.log(
            JSON.stringify({
                ...result,
                bundleSha256,
                sourceBinding: binding,
                browser: browser.version(),
                scope: 'native WebGPU; focused offscreen RGBA8 UNORM/RGBA16F MRT sample-1; no integer pixel coverage',
            }),
        );
    } finally {
        try {
            if (browser) await browser.close();
        } finally {
            if (server) await server.close();
        }
    }
}
main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
