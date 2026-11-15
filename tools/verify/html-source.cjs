/* HTML texture capability / native paint / real input probe. Explicit local attempts, no canonical publication. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const { PNG } = require('pngjs');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
const { verifySourceBinding } = require('../build/source-binding.cjs');
const root = path.resolve(__dirname, '../..');
const args = Object.fromEntries(process.argv.slice(2).map((value) => value.replace(/^--/, '').split('=')));
assert(args.out, '--out=<new directory> required');
const mode = args.case || 'live',
    dpr = Number(args.dpr || 1);
assert(['live', 'nested', 'snapshot', 'no-snapshot'].includes(mode) && [1, 2].includes(dpr));
const out = path.resolve(root, args.out),
    bundle = path.resolve(root, args.bundle || 'build/cocosair.module.js');
assert(out.startsWith(root + path.sep) && !fs.existsSync(out), 'Use a new workspace output');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(
    path.join(out, 'index.html'),
    '<!doctype html><head><link rel="icon" href="data:,"><style>html,body{margin:0;width:100%;height:100%}canvas{width:128px;height:128px;display:block}</style></head><canvas id="GameCanvas" width="128" height="128"></canvas>',
);
const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inputs = [bundle, bundle + '.map', __filename, path.join(root, 'src/air/html-source.ts')];
const report = {
    completed: false,
    subset: true,
    scope: 'native HTML-in-Canvas paint/texture/input/dispose; local browser only',
    mode,
    dpr,
    keyboardControl: args['keyboard-control'] === '1',
    errors: [],
    fingerprints: Object.fromEntries(inputs.map((file) => [path.relative(root, file).replace(/\\/g, '/'), hash(file)])),
};
async function setup({ sdk, mode, keyboardControl }) {
    const m = await import(sdk);
    const canvas = document.querySelector('canvas');
    const app = await m.createAirApp({ canvas, renderer: 'webgl2' });
    const device = m.director.root.device,
        gl = device.gl;
    const nativeCapabilities = Object.fromEntries(
        [
            'requestPaint',
            'captureElementImage',
            'updateElementGeometry',
            'clearElementGeometry',
            'getElementImageDefaultSize',
        ].map((key) => [key, typeof canvas[key] === 'function']),
    );
    nativeCapabilities.upload = typeof gl.texElementSubImage2D === 'function';
    if (mode === 'no-snapshot')
        Object.defineProperty(canvas, 'captureElementImage', { configurable: true, value: undefined });
    const support = m.getAirHTMLSourceSupport(canvas);
    if (!support.supported) {
        await app.close();
        return { status: 'unsupported', nativeCapabilities, support };
    }
    const scene = new m.Scene('html-source-probe');
    const cameraNode = new m.Node('camera');
    scene.addChild(cameraNode);
    cameraNode.setPosition(0, 0, 3);
    const camera = cameraNode.addComponent(m.Camera);
    camera.projection = m.Camera.ProjectionType.ORTHO;
    camera.orthoHeight = 1;
    camera.visibility = m.Layers.Enum.DEFAULT;
    camera.clearFlags = m.Camera.ClearFlag.SOLID_COLOR;
    camera.clearColor = new m.Color(0, 0, 0, 255);
    const quad = new m.Node('html-screen');
    scene.addChild(quad);
    const geometry = m.primitives.quad({ width: 2, height: 2 });
    // HTML/Texture2D image rows start at the top; the generic primitive's V runs upward.
    geometry.uvs = geometry.uvs.map((value, index) => (index % 2 ? 1 - value : value));
    const mesh = m.utils.createMesh(geometry);
    const material = new m.Material();
    material.initialize({ effectName: 'builtin-unlit', defines: { USE_TEXTURE: true } });
    const texture = new m.Texture2D();
    texture.reset({ width: 1, height: 1, format: m.Texture2D.PixelFormat.RGBA8888 });
    material.setProperty('mainTexture', texture);
    const renderer = quad.addComponent(m.MeshRenderer);
    renderer.mesh = mesh;
    renderer.setSharedMaterial(material, 0);
    const element = document.createElement('div');
    element.style.cssText = 'width:32px;height:32px;background:rgb(255,0,0);position:absolute;left:0;top:0';
    const button = document.createElement('button');
    button.setAttribute('aria-label', 'HTML click target');
    button.textContent = 'TOP';
    button.style.cssText =
        'position:absolute;left:0;top:0;width:100%;height:50%;border:0;padding:0;background:inherit;color:white;font:8px monospace';
    element.appendChild(button);
    const wrapper = document.createElement('div');
    if (mode === 'nested') {
        wrapper.appendChild(element);
        canvas.appendChild(wrapper);
    } else canvas.appendChild(element);
    const originalAttributes = {
        content: canvas.getAttribute('content'),
        layoutsubtree: canvas.getAttribute('layoutsubtree'),
        drawable: element.getAttribute('drawable'),
    };
    let uploads = 0,
        clicks = 0,
        closes = 0;
    const events = [];
    for (const type of ['pointerdown', 'click', 'keydown', 'input'])
        canvas.addEventListener(
            type,
            (event) => {
                const row = { type, target: event.target.tagName, prevented: event.defaultPrevented };
                events.push(row);
                queueMicrotask(() => (row.prevented = event.defaultPrevented));
            },
            true,
        );
    const capture = canvas.captureElementImage;
    if (mode === 'snapshot' && capture)
        canvas.captureElementImage = function (...values) {
            const image = capture.apply(this, values),
                close = image.close;
            image.close = function () {
                ++closes;
                return close.call(this);
            };
            return image;
        };
    let source, clock, input, beforeTyping;
    const expect = (value, message) => {
        if (!value) throw Error(message);
    };
    const read = () => {
        const bytes = new Uint8Array(texture.width * texture.height * 4),
            region = new m.gfx.BufferTextureCopy();
        region.texExtent.width = texture.width;
        region.texExtent.height = texture.height;
        device.copyTextureToBuffers(texture.getGFXTexture(), [bytes], [region]);
        return bytes;
    };
    const wait = async (count) => {
        for (let i = 0; i < 120; ++i) {
            if (source.status === 'failed') throw source.error;
            if (source.status === 'ready' && uploads > count) return;
            await new Promise(requestAnimationFrame);
        }
        throw Error('HTML source did not complete paint');
    };
    button.addEventListener('click', () => {
        ++clicks;
        element.style.background = 'rgb(0,0,255)';
        source.update();
    });
    try {
        source = m.createAirHTMLSource({
            canvas,
            element,
            texture,
            snapshot: mode === 'snapshot',
            onUpdate: () => {
                ++uploads;
                material.setProperty('mainTexture', texture);
            },
        });
        app.run(scene);
        clock = m.createStepClock();
        clock.begin();
        await wait(0);
        await clock.step(0);
        const first = [...read().slice(0, 4)];
        expect(first[0] === 255 && first[2] === 0, 'First HTML paint must upload red: ' + first);
        source.updateGeometry({
            canvasTransform: {
                a: canvas.clientWidth / element.offsetWidth,
                d: canvas.clientHeight / element.offsetHeight,
                e: 0,
                f: 0,
            },
        });
        const rect = canvas.getBoundingClientRect(),
            point = { x: rect.left + rect.width * 0.8, y: rect.top + rect.height * 0.2 };
        window.__htmlProbe = {
            async present() {
                await new Promise((resolve, reject) => {
                    canvas.addEventListener(
                        'paint',
                        () => {
                            clock.step(0).then(resolve, reject);
                        },
                        { once: true },
                    );
                    canvas.requestPaint();
                });
            },
            state() {
                return {
                    events,
                    activeElement: document.activeElement?.outerHTML,
                    inputValue: input?.value,
                    inputBounds: input
                        ? {
                              x: input.getBoundingClientRect().x,
                              y: input.getBoundingClientRect().y,
                              width: input.getBoundingClientRect().width,
                              height: input.getBoundingClientRect().height,
                          }
                        : null,
                };
            },
            async afterInput(expected = 1) {
                await wait(1);
                await clock.step(0);
                const pixel = [...read().slice(0, 4)];
                expect(clicks === expected && pixel[2] === 255, 'Transformed real click did not update HTML texture');
                return { clicks, pixel, uploads };
            },
            async resize() {
                const before = uploads;
                element.style.width = '48px';
                source.update();
                await wait(before);
                await clock.step(0);
                source.updateGeometry({
                    canvasTransform: {
                        a: canvas.clientWidth / element.offsetWidth,
                        d: canvas.clientHeight / element.offsetHeight,
                        e: 0,
                        f: 0,
                    },
                });
                const size =
                    typeof canvas.getElementImageDefaultSize === 'function'
                        ? canvas.getElementImageDefaultSize(element)
                        : null;
                return {
                    width: texture.width,
                    height: texture.height,
                    nativeSize: size ? { width: size.width, height: size.height } : null,
                };
            },
            async prepareInput() {
                input = document.createElement('input');
                if (keyboardControl)
                    for (const type of ['keydown', 'keyup'])
                        input.addEventListener(type, (event) => event.stopPropagation());
                input.setAttribute('aria-label', 'HTML typing target');
                input.style.cssText =
                    'position:absolute;inset:0;box-sizing:border-box;width:100%;height:100%;border:0;padding:0;background:inherit;color:white;font:12px monospace';
                element.replaceChildren(input);
                const before = uploads;
                source.update();
                await wait(before);
                await clock.step(0);
                beforeTyping = read();
                return { value: input.value };
            },
            async afterTyping() {
                expect(input.value === 'AIR', 'Native input did not receive real keyboard typing');
                const before = uploads;
                source.update();
                await wait(before);
                await clock.step(0);
                const after = read();
                let changed = 0;
                for (let i = 0; i < after.length; ++i) if (after[i] !== beforeTyping[i]) ++changed;
                expect(changed > 10, 'Typed text did not change GPU texture pixels');
                return { value: input.value, changed };
            },
            async snapshot() {
                const before = uploads;
                element.style.background = 'rgb(0,0,255)';
                element.style.width = '48px';
                source.update();
                await wait(before);
                await clock.step(0);
                const pixel = [...read().slice(0, 4)];
                expect(pixel[0] === 255 && pixel[2] === 0, 'Snapshot must remain immutable');
                return { pixel, width: texture.width, height: texture.height };
            },
            async dispose() {
                source.dispose();
                source.dispose();
                const before = uploads;
                canvas.requestPaint();
                await new Promise(requestAnimationFrame);
                await new Promise(requestAnimationFrame);
                expect(uploads === before, 'Disposed listener still uploads');
                expect(mode !== 'snapshot' || closes === 1, 'Snapshot must close exactly once');
                expect(
                    gl.isTexture(texture.getGFXTexture().gpuTexture.glTexture),
                    'Source must not destroy borrowed texture',
                );
                const restored = {
                    content: canvas.getAttribute('content'),
                    layoutsubtree: canvas.getAttribute('layoutsubtree'),
                    drawable: element.getAttribute('drawable'),
                };
                expect(
                    JSON.stringify(restored) === JSON.stringify(originalAttributes),
                    'Original DOM attributes not restored',
                );
                if (mode === 'no-snapshot') {
                    let refused = false;
                    try {
                        m.createAirHTMLSource({ canvas, element, texture, snapshot: true });
                    } catch (error) {
                        refused = error.code === 'AIR_E_HTML_SOURCE_UNSUPPORTED';
                    }
                    expect(refused, 'Absent snapshot must reject only snapshot mode');
                }
                expect(gl.getError() === gl.NO_ERROR, 'Unexpected native GL error');
                clock.end();
                element.remove();
                wrapper.remove();
                await app.close();
                mesh.destroy();
                material.destroy();
                texture.destroy();
                return { uploads, closes, restored, borrowedTexturePreserved: true };
            },
        };
        return {
            status: 'ready',
            support,
            nativeCapabilities,
            first,
            width: texture.width,
            height: texture.height,
            point,
        };
    } catch (error) {
        source?.dispose();
        clock?.end();
        element.remove();
        wrapper.remove();
        await app.close();
        mesh.destroy();
        material.destroy();
        texture.destroy();
        throw error;
    }
}
(async () => {
    let browser, server, page;
    const timeout = setTimeout(async () => {
        report.failure = 'original 90s budget exceeded';
        process.exitCode = 1;
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
        setTimeout(() => process.exit(1), 4000).unref();
        await browser?.close({ reason: report.failure }).catch(() => {});
    }, 90000);
    try {
        report.sourceBinding = verifySourceBinding(root, bundle);
        assert.equal(report.sourceBinding.matches, true);
        server = await startExampleServer(root);
        const options = launchOptions('chromium');
        if (args.channel === 'chrome') {
            delete options.executablePath;
            options.channel = 'chrome';
        }
        if (args.experimental === '1') options.args.push('--enable-blink-features=CanvasDrawElement');
        report.launch = { channel: options.channel || null, args: options.args };
        browser = await require('playwright').chromium.launch({
            ...options,
            env: loopbackBrowserEnv(),
            headless: true,
        });
        report.browser = browser.version();
        page = await browser.newPage({ viewport: { width: 128, height: 128 }, deviceScaleFactor: dpr });
        page.on('console', (message) => {
            if (message.type() === 'error') report.errors.push(message.text());
        });
        page.on('pageerror', (error) => report.errors.push(String(error)));
        await page.goto(server.origin + '/' + path.relative(root, path.join(out, 'index.html')).replace(/\\/g, '/'));
        report.initial = await page.evaluate(setup, {
            sdk: '/' + path.relative(root, bundle).replace(/\\/g, '/'),
            mode,
            keyboardControl: report.keyboardControl,
        });
        if (
            report.initial.status === 'unsupported' &&
            report.initial.nativeCapabilities.requestPaint &&
            report.initial.nativeCapabilities.upload &&
            (mode !== 'snapshot' || report.initial.nativeCapabilities.captureElementImage)
        )
            throw Error(
                'Available native upload path was incorrectly rejected: ' + JSON.stringify(report.initial.support),
            );
        if (report.initial.status === 'ready') {
            await page.evaluate(() => window.__htmlProbe.present());
            const firstImage = path.join(out, 'first-frame.png');
            await page.screenshot({ path: firstImage });
            const firstPNG = PNG.sync.read(fs.readFileSync(firstImage));
            let topInk = 0,
                bottomInk = 0;
            for (let y = 0; y < firstPNG.height; ++y)
                for (let x = 0; x < firstPNG.width; ++x) {
                    const i = (y * firstPNG.width + x) * 4;
                    if (firstPNG.data[i] > 180 && firstPNG.data[i + 1] > 180 && firstPNG.data[i + 2] > 180) {
                        if (y < firstPNG.height / 2) ++topInk;
                        else ++bottomInk;
                    }
                }
            assert(
                topInk > 10 && bottomInk < 5,
                'HTML text must appear upright in the top half, not vertically flipped',
            );
            report.firstPresentation = { topInk, bottomInk, screenshot: 'first-frame.png', sha256: hash(firstImage) };
            if (mode === 'snapshot') {
                report.snapshot = await page.evaluate(() => window.__htmlProbe.snapshot());
                assert.equal(report.snapshot.width, report.initial.width);
                assert.equal(report.snapshot.height, report.initial.height);
            } else {
                await page.mouse.click(report.initial.point.x, report.initial.point.y);
                report.input = await page.evaluate(() => window.__htmlProbe.afterInput());
                report.resize = await page.evaluate(() => window.__htmlProbe.resize());
                assert(report.resize.width > report.initial.width, 'Resize must change the allocated texture');
                if (report.resize.nativeSize) {
                    assert.equal(report.resize.width, Math.ceil(report.resize.nativeSize.width));
                    assert.equal(report.resize.height, Math.ceil(report.resize.nativeSize.height));
                }
                await page.mouse.click(report.initial.point.x, report.initial.point.y);
                report.resizedInput = await page.evaluate(() => window.__htmlProbe.afterInput(2));
                await page.evaluate(() => window.__htmlProbe.prepareInput());
                await page.mouse.click(report.initial.point.x, report.initial.point.y);
                await page.keyboard.type('AIR');
                report.typing = await page.evaluate(() => window.__htmlProbe.afterTyping());
            }
            const screenshot = path.join(out, 'frame.png');
            await page.evaluate(() => window.__htmlProbe.present());
            await page.screenshot({ path: screenshot });
            const png = PNG.sync.read(fs.readFileSync(screenshot));
            const pixel = [
                ...png.data.slice(
                    (Math.floor(png.height * 0.8) * png.width + Math.floor(png.width * 0.8)) * 4,
                    (Math.floor(png.height * 0.8) * png.width + Math.floor(png.width * 0.8)) * 4 + 4,
                ),
            ];
            const expected = mode === 'snapshot' ? 0 : 2;
            assert(
                pixel[expected] > 180 && pixel[expected === 0 ? 2 : 0] < 10,
                'Compositor did not present expected HTML color: ' + pixel,
            );
            report.presentation = { pixel, screenshot: 'frame.png', sha256: hash(screenshot) };
            report.disposal = await page.evaluate(() => window.__htmlProbe.dispose());
        }
        assert.deepEqual(report.errors, []);
        for (const file of inputs)
            assert.equal(hash(file), report.fingerprints[path.relative(root, file).replace(/\\/g, '/')]);
        report.completed = true;
    } catch (error) {
        report.failure ??= String(error.stack || error);
        if (page) report.state = await page.evaluate(() => window.__htmlProbe?.state()).catch(() => undefined);
        process.exitCode = 1;
        if (page) await page.screenshot({ path: path.join(out, 'failure.png') }).catch(() => {});
    } finally {
        if (browser) await browser.close();
        if (server) await server.close();
        clearTimeout(timeout);
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        console.log(JSON.stringify(report));
    }
})();
