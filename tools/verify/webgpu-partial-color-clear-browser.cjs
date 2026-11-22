/* Focused, opt-in native WebGPU pixel probe. Prints a JSON result; does not publish evidence. */
const assert = require('node:assert/strict');
const path = require('node:path');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const root = path.resolve(__dirname, '../..');

async function rendererProbe(sdk) {
    const m = await import(sdk);
    const app = await m.createAirApp({ canvas: '#GameCanvas', renderer: 'webgpu' });
    const g = m.gfx;
    const dev = m.director.root.device;
    if (dev.gfxAPI !== g.API.WEBGPU) throw new Error('Native WebGPU backend required');
    const native = dev.nativeDevice;
    const own = [];
    const allocate = (item) => {
        own.push(item);
        return item;
    };
    const scope = m.createStepClock();
    await scope.begin();
    const actual = [];
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
            const cmd = allocate(dev.createCommandBuffer(new g.CommandBufferInfo(dev.queue)));
            const blue = new g.Color(0, 0, 1, 1);
            const red = new g.Color(1, 0, 0, 1);
            const green = new g.Color(0, 1, 0, 1);
            const whole = new g.Rect(0, 0, 4, 4),
                partial = new g.Rect(1, 1, 2, 2);
            const clear = (textures, choices, rect, colors) => {
                const attachments = formats.map((format, index) => {
                    const a = new g.ColorAttachment(format);
                    a.loadOp = choices[index] ? g.LoadOp.CLEAR : g.LoadOp.LOAD;
                    a.storeOp = g.StoreOp.STORE;
                    return a;
                });
                const pass = allocate(dev.createRenderPass(new g.RenderPassInfo(attachments)));
                const fb = allocate(dev.createFramebuffer(new g.FramebufferInfo(pass, textures)));
                cmd.begin();
                cmd.beginRenderPass(pass, fb, rect, colors, 1, 0);
                cmd.endRenderPass();
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
            const expected = (isHalf, inside, outside) => {
                const max = isHalf ? 0x3c00 : 255;
                return Array.from({ length: 16 }, (_, ix) => {
                    const x = ix % 4,
                        y = Math.floor(ix / 4);
                    return (x >= 1 && x <= 2 && y >= 1 && y <= 2 ? inside : outside).map((value) => value * max);
                }).flat();
            };
            const check = async (name, paths, colors) => {
                const observed = await read(paths);
                observed.forEach((row, index) => {
                    const want = expected(index === 1, ...colors[index]);
                    if (row.some((value, i) => value !== want[i]))
                        throw new Error(name + ': attachment ' + index + ' pixels differed');
                });
                actual.push(name);
            };
            const B = [0, 0, 1, 1],
                R = [1, 0, 0, 1],
                G = [0, 1, 0, 1];
            clear(a, [true, true], whole, [blue, blue]);
            clear(b, [true, true], whole, [red, red]);
            clear(a, [true, false], partial, [green, green]);
            await check('A CLEAR/LOAD', a, [
                [G, B],
                [B, B],
            ]);
            clear(b, [false, true], partial, [blue, blue]);
            await check('B LOAD/CLEAR', b, [
                [R, R],
                [B, R],
            ]);
            await check('A unchanged by B', a, [
                [G, B],
                [B, B],
            ]);
            clear(a, [false, true], partial, [red, red]);
            await check('A LOAD/CLEAR on return', a, [
                [G, B],
                [R, B],
            ]);
        } finally {
            const error = await native.popErrorScope();
            if (error) throw new Error('WebGPU validation: ' + error.message);
        }
    } finally {
        for (const item of own.reverse()) item.destroy();
        scope.end();
        app.dispose();
    }
    return { status: 'PASS', checks: actual };
}

async function main() {
    const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
    const engine = args.browser || 'chromium';
    assert(['chromium', 'firefox', 'webkit'].includes(engine), 'unknown browser');
    const bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
    assert(bundle.startsWith(root + path.sep), 'candidate must be inside the checkout');
    let browser, server;
    try {
        server = await startExampleServer(root);
        browser = await require('playwright')[engine].launch({
            headless: true,
            ...launchOptions(engine),
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
                JSON.stringify({ status: 'BLOCKED', browser: browser.version(), reason: 'WebGPU adapter unavailable' }),
            );
            process.exitCode = 2;
            return;
        }
        const binding = verifySourceBinding(root, bundle);
        assert.equal(binding.matches, true, 'bundle must bind current sources');
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        const result = await page.evaluate(rendererProbe, '/' + path.relative(root, bundle).split(path.sep).join('/'));
        assert.deepEqual(errors, []);
        console.log(
            JSON.stringify({
                ...result,
                browser: browser.version(),
                scope: 'native WebGPU; focused offscreen MRT sample-1 only',
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
