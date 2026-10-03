/** E01/E09 frozen behavioral, pixel and lifecycle checks. No build or canonical evidence writes. */
const fs = require('fs'),
    path = require('path'),
    http = require('http'),
    crypto = require('crypto');
const esbuild = require('esbuild'),
    { PNG } = require('pngjs'),
    playwright = require('playwright');
const root = path.resolve(__dirname, '../..');
const args = process.argv.slice(2);
const option = (name, fallback) =>
    args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const browserName = option('browser', 'chromium'),
    selected = option('scene', 'all');
const staticMode = args.includes('--static');
const sceneURL = (name, port) =>
    `http://127.0.0.1:${port}/${staticMode ? 'output/playwright/competitive-static' : 'examples'}/${name}/`;
const names = selected === 'all' ? ['starfield-galaxy', 'glass-refraction'] : [selected];
if (!names.every((name) => ['starfield-galaxy', 'glass-refraction'].includes(name)))
    throw new Error('unsupported scene');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const bundleHash = hash(fs.readFileSync(path.join(root, 'build/cocosair.module.js')));
const verifierHash = hash(fs.readFileSync(__filename));
const server = http.createServer((request, response) => {
    let file = path.resolve(root, '.' + decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname));
    if (!file.startsWith(root + path.sep)) {
        response.writeHead(403);
        response.end();
        return;
    }
    if (file.endsWith('favicon.ico')) {
        response.writeHead(204);
        response.end();
        return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
    if (!fs.existsSync(file) && file.endsWith('.js') && fs.existsSync(file.slice(0, -3) + '.ts'))
        file = file.slice(0, -3) + '.ts';
    if (!fs.existsSync(file)) {
        response.writeHead(404);
        response.end();
        return;
    }
    response.setHeader('cache-control', 'no-store');
    if (file.endsWith('.ts')) {
        response.setHeader('content-type', 'text/javascript');
        response.end(
            esbuild.transformSync(fs.readFileSync(file, 'utf8'), {
                loader: 'ts',
                format: 'esm',
                target: 'es2022',
                sourcefile: file,
            }).code,
        );
    } else {
        response.setHeader(
            'content-type',
            file.endsWith('.html')
                ? 'text/html'
                : file.endsWith('.js')
                  ? 'text/javascript'
                  : file.endsWith('.json')
                    ? 'application/json'
                    : 'application/octet-stream',
        );
        fs.createReadStream(file).pipe(response);
    }
});
const crop = (png, region = { x: 0, y: 0, w: 1, h: 1 }) => ({
    x: Math.round(region.x * png.width),
    y: Math.round(region.y * png.height),
    w: Math.round(region.w * png.width),
    h: Math.round(region.h * png.height),
});
function metrics(a, b, region) {
    const box = crop(a, region);
    let lit = 0,
        changed = 0,
        difference = 0;
    for (let y = box.y; y < box.y + box.h; y++)
        for (let x = box.x; x < box.x + box.w; x++) {
            const i = (y * a.width + x) * 4;
            if ((a.data[i] + a.data[i + 1] + a.data[i + 2]) / 3 > 40) lit++;
            if (b) {
                let delta = 0;
                for (let c = 0; c < 3; c++) delta += Math.abs(a.data[i + c] - b.data[i + c]);
                difference += delta;
                if (delta > 24) changed++;
            }
        }
    return {
        litRatio: lit / (box.w * box.h),
        changedRatio: changed / (box.w * box.h),
        changedPixels: changed,
        absoluteDifference: difference,
    };
}
let browser;
async function recordP2(browser, name, port) {
    const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
        recordVideo: { dir: path.join(root, 'output/playwright'), size: { width: 1280, height: 720 } },
    });
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    await page.goto(sceneURL(name, port));
    await page.waitForFunction(() => window.__appReady || window.__exampleError, null, { timeout: 10000 });
    // Fresh initial state, P1 precondition/action, then the frozen P2 window.
    await page.waitForTimeout(name === 'starfield-galaxy' ? 2500 : 3000);
    const initial = await page.evaluate(() => window.__bench.getState());
    const p1 = PNG.sync.read(await page.locator('#GameCanvas').screenshot());
    const p1ok =
        name === 'starfield-galaxy'
            ? initial.starCount >= 50000 &&
              initial.epoch === 0 &&
              Math.abs(initial.cameraDistance - 120) < 0.01 &&
              metrics(p1).litRatio >= 0.02
            : initial.selectedColor === 'diamond' &&
              initial.cameraDistance >= 9 &&
              initial.exportCount === 0 &&
              metrics(p1, undefined, { x: 0.36, y: 0.26, w: 0.28, h: 0.42 }).litRatio >= 0.08;
    if (name === 'starfield-galaxy') await page.waitForTimeout(500);
    const before = await page.evaluate(() => window.__bench.getState());
    const beforeImage = PNG.sync.read(await page.locator('#GameCanvas').screenshot());
    await page.waitForTimeout(name === 'starfield-galaxy' ? 2000 : 4000);
    const after = await page.evaluate(() => window.__bench.getState());
    let motion;
    if (name === 'starfield-galaxy')
        motion = metrics(beforeImage, PNG.sync.read(await page.locator('#GameCanvas').screenshot()), {
            x: 0.1,
            y: 0.1,
            w: 0.8,
            h: 0.8,
        });
    else {
        const first = PNG.sync.read(await page.locator('#GameCanvas').screenshot());
        await page.waitForTimeout(500);
        motion = metrics(first, PNG.sync.read(await page.locator('#GameCanvas').screenshot()), {
            x: 0.36,
            y: 0.26,
            w: 0.28,
            h: 0.42,
        });
    }
    const stateOk =
        name === 'starfield-galaxy'
            ? after.rotationPhase - before.rotationPhase > 0.001
            : after.rotationAngle - before.rotationAngle >= 50 &&
              Math.abs(after.rotationAngle - after.nativeRotation) < 0.01;
    const video = page.video();
    const videoPath = `output/playwright/${name}-${browserName}${staticMode ? '-static' : ''}-P2-clip.webm`;
    await page.close();
    await video.saveAs(path.join(root, videoPath));
    await video.delete();
    return {
        execution: 'independent fresh-state P1/P2 replay',
        recording: true,
        initial,
        before,
        after,
        motion,
        p1ok,
        stateOk,
        errors,
        videoPath,
        ok:
            p1ok &&
            stateOk &&
            motion.changedRatio >= 0.005 &&
            errors.length === 0 &&
            fs.statSync(path.join(root, videoPath)).size > 10000,
    };
}
(async () => {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    try {
        const launch = { headless: true };
        const executable = option('executable', '');
        if (executable) launch.executablePath = executable;
        else if (browserName === 'chromium' && !fs.existsSync(playwright.chromium.executablePath()))
            launch.executablePath = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
        browser = await playwright[browserName].launch(launch);
        const reports = [];
        if (staticMode) {
            const artifact = path.join(root, 'output/playwright/competitive-static');
            fs.mkdirSync(artifact, { recursive: true });
            fs.copyFileSync(path.join(root, 'build/cocosair.module.js'), path.join(artifact, 'cocosair.module.js'));
            for (const name of names) {
                const destination = path.join(artifact, name);
                fs.mkdirSync(destination, { recursive: true });
                esbuild.buildSync({
                    entryPoints: [path.join(root, 'examples', name, 'src/main.ts')],
                    bundle: true,
                    format: 'esm',
                    target: 'es2022',
                    platform: 'browser',
                    external: ['cocosair'],
                    outfile: path.join(destination, 'main.boot.js'),
                });
                const html = fs
                    .readFileSync(path.join(root, 'examples', name, 'index.html'), 'utf8')
                    .replace('./src/main.ts', './main.boot.js')
                    .replace('/build/cocosair.module.js', '../cocosair.module.js');
                fs.writeFileSync(path.join(destination, 'index.html'), html);
                if (name === 'starfield-galaxy')
                    fs.copyFileSync(
                        path.join(root, 'examples', name, 'galaxy.effect.json'),
                        path.join(destination, 'galaxy.effect.json'),
                    );
            }
        }
        for (const name of names) {
            const caseFiles = [
                'index.html',
                'example.json',
                'assets/benchmark-spec.json',
                ...fs.readdirSync(path.join(root, 'examples', name, 'src')).map((file) => `src/${file}`),
                ...(name === 'starfield-galaxy' ? ['galaxy.effect.json', 'galaxy.effect-spec.json'] : []),
            ];
            const sourceHashes = Object.fromEntries(
                caseFiles.map((file) => [
                    `examples/${name}/${file}`,
                    hash(fs.readFileSync(path.join(root, 'examples', name, file))),
                ]),
            );
            const page = await browser.newPage({
                viewport: { width: 1280, height: 720 },
                acceptDownloads: true,
            });
            const errors = [],
                checks = [],
                samples = [];
            const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), detail });
            page.on('pageerror', (error) => errors.push(String(error)));
            page.on('console', (message) => {
                if (message.type() === 'error') errors.push(message.text());
            });
            await page.addInitScript(() => {
                const original = WebGL2RenderingContext.prototype.drawArrays;
                WebGL2RenderingContext.prototype.drawArrays = function (mode, first, count) {
                    if (mode === 0 && count >= 50000)
                        window.__nativePointSubmission = {
                            mode,
                            count,
                            draws: (window.__nativePointSubmission?.draws || 0) + 1,
                        };
                    return original.call(this, mode, first, count);
                };
            });
            const started = Date.now();
            await page.goto(sceneURL(name, server.address().port));
            await page.waitForFunction(() => window.__appReady || window.__exampleError, null, { timeout: 10000 });
            check(
                'ready within 10s',
                (await page.evaluate(() => window.__appReadyAtMs)) < 10000 &&
                    !(await page.evaluate(() => window.__exampleError)),
                {
                    controllerElapsedMs: Date.now() - started,
                    pageReadyAtMs: await page.evaluate(() => window.__appReadyAtMs),
                },
            );
            const state = () => page.evaluate(() => window.__bench.getState());
            const shot = async (label) => {
                const buffer = await page.locator('#GameCanvas').screenshot();
                fs.mkdirSync(path.join(root, 'output/playwright'), { recursive: true });
                fs.writeFileSync(
                    path.join(
                        root,
                        `output/playwright/${name}-${browserName}${staticMode ? '-static' : ''}-${label}.png`,
                    ),
                    buffer,
                );
                return PNG.sync.read(buffer);
            };
            const sleep = (ms) => page.waitForTimeout(ms);
            if (name === 'starfield-galaxy') {
                await sleep(2500);
                const initial = await state(),
                    initialImage = await shot('P1');
                samples.push({ probe: 'P1', state: initial });
                check('E01 idle real render-loop fps >=30', initial.fps >= 30, initial.fps);
                check(
                    'P1 true >=50k native point submissions',
                    initial.starCount >= 50000 &&
                        (await page.evaluate(() => window.__nativePointSubmission?.count)) === initial.starCount,
                    await page.evaluate(() => window.__nativePointSubmission),
                );
                check('P1 nonblank galaxy', metrics(initialImage).litRatio >= 0.02, metrics(initialImage));
                await sleep(500);
                const before = await state(),
                    motionBefore = await shot('P2-before');
                await sleep(2000);
                const after = await state(),
                    motionAfter = await shot('P2-after');
                samples.push({ probe: 'P2', before, after });
                check(
                    'P2 phase and real galaxy motion',
                    after.rotationPhase - before.rotationPhase > 0.001 &&
                        metrics(motionBefore, motionAfter, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }).changedRatio >= 0.005,
                    metrics(motionBefore, motionAfter, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 }),
                );
                await page.mouse.move(640, 360);
                await page.mouse.move(870.4, 360);
                await sleep(400);
                const parallaxBefore = await state(),
                    parallaxImage = await shot('P3-before');
                await sleep(600);
                const parallaxAfter = await state(),
                    parallaxFinal = await shot('P3-after');
                samples.push({ probe: 'P3', before: parallaxBefore, after: parallaxAfter });
                check(
                    'P3 native parallax continues across frozen sample window',
                    parallaxBefore.parallaxOffset.x !== parallaxAfter.parallaxOffset.x &&
                        parallaxBefore.cameraPosition.x !== parallaxAfter.cameraPosition.x &&
                        metrics(parallaxImage, parallaxFinal).changedRatio >= 0.003,
                    metrics(parallaxImage, parallaxFinal),
                );
                await page.mouse.wheel(0, -600);
                await sleep(500);
                const wheelBefore = await state(),
                    wheelImage = await shot('P4-before');
                await sleep(300);
                const wheelAfter = await state(),
                    wheelFinal = await shot('P4-after');
                samples.push({ probe: 'P4', before: wheelBefore, after: wheelAfter });
                check(
                    'P4 camera cruise and pixels',
                    wheelAfter.cameraDistance < wheelBefore.cameraDistance - 5 &&
                        metrics(wheelImage, wheelFinal).changedRatio >= 0.01,
                    {
                        before: wheelBefore.cameraDistance,
                        after: wheelAfter.cameraDistance,
                        ...metrics(wheelImage, wheelFinal),
                    },
                );
                const hudRead = await page.evaluate(() => ({
                    state: window.__bench.getState(),
                    text: document.querySelector('#readout').textContent,
                }));
                const hudImage = PNG.sync.read(await page.locator('#hud').screenshot());
                const displayedFPS = Number(hudRead.text.match(/([\d.]+) FRAMES\/S/)[1]);
                check(
                    'P5 honest visible HUD pixels and synchronous numbers',
                    hudRead.state.hudVisible &&
                        (await page.locator('#hud').isVisible()) &&
                        hudRead.state.fps > 0 &&
                        hudRead.text.includes(String(hudRead.state.starCount)) &&
                        Math.abs(displayedFPS - hudRead.state.fps) <= 0.051 &&
                        metrics(hudImage).litRatio > 0.01,
                    { ...hudRead, displayedFPS, ...metrics(hudImage) },
                );
                const independent = await page.evaluate(
                    () =>
                        new Promise((resolve) => {
                            const timestamps = [];
                            const first = performance.now();
                            function tick(now) {
                                timestamps.push(now);
                                if (now - first >= 3000)
                                    resolve(((timestamps.length - 1) * 1000) / (timestamps.at(-1) - timestamps[0]));
                                else requestAnimationFrame(tick);
                            }
                            requestAnimationFrame(tick);
                        }),
                );
                const performanceState = await state();
                check(
                    'P6 real render-loop fps >=30 (not GPU/present)',
                    performanceState.fps >= 30 && independent >= 30,
                    { reported: performanceState.fps, independentRAF: independent },
                );
                await page.mouse.move(640, 360);
                const navigation = page.url();
                await page.getByRole('button', { name: 'reset', exact: true }).click();
                await sleep(800);
                const reset = await state();
                check(
                    'P7 reset without navigation',
                    reset.epoch >= 1 &&
                        Math.abs(reset.cameraDistance - 120) <= 5 &&
                        Math.abs(reset.parallaxOffset.x) < 0.01 &&
                        Math.abs(reset.parallaxOffset.y) < 0.01 &&
                        reset.rotationPhase < 0.1 &&
                        page.url() === navigation,
                    reset,
                );
                check('P7 still visibly renders', metrics(await shot('P7-reset')).litRatio >= 0.02);
            } else {
                const region = { x: 0.36, y: 0.26, w: 0.28, h: 0.42 };
                await sleep(3000);
                const initial = await state(),
                    first = await shot('P1');
                check(
                    'P1 faceted native crystal visible',
                    initial.selectedColor === 'diamond' &&
                        initial.cameraDistance >= 9 &&
                        initial.exportCount === 0 &&
                        initial.faceCount >= 60 &&
                        initial.faceCount <= 200 &&
                        metrics(first, undefined, region).litRatio >= 0.08,
                    { state: initial, ...metrics(first, undefined, region) },
                );
                samples.push({ probe: 'P1', state: initial });
                check('E09 real render-loop fps >=30', initial.fps >= 30, initial.fps);
                await sleep(4000);
                const rotating = await state(),
                    rotationBefore = await shot('P2-before');
                await sleep(500);
                const second = await shot('P2');
                check(
                    'P2 actual >=25deg/s native rotation and facet motion',
                    rotating.rotationAngle - initial.rotationAngle >= 50 &&
                        Math.abs(rotating.nativeRotation - rotating.rotationAngle) < 0.01 &&
                        metrics(rotationBefore, second, region).changedRatio > 0.005,
                    {
                        initial: initial.rotationAngle,
                        after: rotating.rotationAngle,
                        ...metrics(rotationBefore, second, region),
                    },
                );
                await page.getByRole('button', { name: 'ruby', exact: true }).click();
                await sleep(800);
                const ruby = await state(),
                    rubyImage = await shot('P3');
                check(
                    'P3 color absorption changes pixels',
                    ruby.selectedColor === 'ruby' && metrics(second, rubyImage, region).changedRatio > 0.005,
                    metrics(second, rubyImage, region),
                );
                await page.mouse.dblclick(640, 360);
                await sleep(350);
                const zoomMid = await state();
                await sleep(850);
                const close = await state();
                check(
                    'P4 >=600ms genuine camera transition',
                    zoomMid.cameraDistance > 6 && zoomMid.cameraDistance < 10 && close.cameraDistance <= 6,
                    { zoomMid, close },
                );
                await shot('P4-close');
                await page.mouse.dblclick(640, 360);
                await sleep(1200);
                const far = await state();
                check('P5 genuine camera return', far.cameraDistance >= 9, far);
                await shot('P5-far');
                await page.evaluate(async () => {
                    const { director, Director } = await import('cocosair');
                    const times = [];
                    const listener = () => times.push(performance.now());
                    director.on(Director.EVENT_AFTER_DRAW, listener);
                    window.__exportFrameTiming = {
                        times,
                        stop: () => director.off(Director.EVENT_AFTER_DRAW, listener),
                    };
                });
                for (let i = 1; i <= 2; i++) {
                    const downloading = page.waitForEvent('download');
                    await page.getByRole('button', { name: 'Export PNG', exact: true }).click();
                    const download = await downloading;
                    const file = path.join(
                        root,
                        `output/playwright/${name}-${browserName}${staticMode ? '-static' : ''}-export-${i}.png`,
                    );
                    await download.saveAs(file);
                    const bytes = fs.readFileSync(file),
                        png = PNG.sync.read(bytes),
                        current = await state(),
                        size = await page.evaluate(() => [
                            document.querySelector('canvas').width,
                            document.querySelector('canvas').height,
                        ]);
                    check(
                        `P${i === 1 ? '6' : '7'} real current-frame PNG download`,
                        bytes.length > 10240 &&
                            png.width === size[0] &&
                            png.height === size[1] &&
                            current.exportCount === i,
                        { bytes: bytes.length, size: [png.width, png.height], count: current.exportCount },
                    );
                }
                const beforeExport = await state();
                await sleep(600);
                check('P7 export did not freeze rotation', (await state()).rotationAngle > beforeExport.rotationAngle);
                const exportTiming = await page.evaluate(() => {
                    const timing = window.__exportFrameTiming;
                    timing.stop();
                    const gaps = timing.times.slice(1).map((time, i) => time - timing.times[i]);
                    return { frames: timing.times.length, maxGapMs: Math.max(...gaps) };
                });
                check(
                    'E09 PNG export main loop gaps stay below 200ms',
                    exportTiming.frames > 2 && exportTiming.maxGapMs <= 200,
                    exportTiming,
                );
                await page.getByRole('button', { name: 'reset', exact: true }).click();
                await sleep(1500);
                const reset = await state();
                check(
                    'P8 reset native appearance/camera/download counters',
                    reset.selectedColor === 'diamond' && reset.cameraDistance >= 9 && reset.exportCount === 0,
                    reset,
                );
                await page.evaluate(async () => {
                    (await import('cocosair')).director.pause();
                });
                for (const [name, key, target] of [
                    ['ior', 'End', 2.5],
                    ['transmission', 'Home', 0],
                    ['dispersion', 'End', 12],
                ]) {
                    const before = await shot(`control-${name}-before`);
                    await page.getByRole('slider', { name, exact: true }).press(key);
                    await sleep(250);
                    const nativeState = await state();
                    const after = await shot(`control-${name}-after`);
                    check(
                        `real ${name} slider changes native uniform and frozen pixels`,
                        Math.abs(nativeState[name] - target) < 0.001 &&
                            metrics(before, after, region).changedRatio > 0.001,
                        { value: nativeState[name], ...metrics(before, after, region) },
                    );
                    await page.evaluate(() => window.__bench.reset());
                    await sleep(100);
                }
                await page.evaluate(async () => {
                    (await import('cocosair')).director.resume();
                });
                const optical = await page.evaluate(async () => {
                    const { game, director, Vec4, SpotLight } = await import('cocosair');
                    game.pause();
                    director.pause();
                    const native = window.__glassNative,
                        material = native.material(),
                        renderer = native.renderer(),
                        gl = game.canvas.getContext('webgl2'),
                        canvas = game.canvas;
                    const handle = material.passes[0].getHandle('airTransmission'),
                        original = material.passes[0].getUniform(handle, new Vec4());
                    const read = () => {
                        for (let i = 0; i < 3; i++) game.step();
                        const pixels = new Uint8Array(canvas.width * canvas.height * 4);
                        gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
                        return pixels;
                    };
                    const diffs = {};
                    for (const [name, index, values] of [
                        ['transmission', 'x', [0, 1]],
                        ['ior', 'y', [1.1, 2.5]],
                        ['dispersion', 'w', [0, 12]],
                    ]) {
                        const a = new Vec4(original),
                            b = new Vec4(original);
                        a[index] = values[0];
                        b[index] = values[1];
                        material.setProperty('airTransmission', a);
                        const before = read();
                        material.setProperty('airTransmission', b);
                        const after = read();
                        let changed = 0,
                            delta = 0;
                        for (let i = 0; i < after.length; i += 4) {
                            let d = 0;
                            for (let c = 0; c < 3; c++) d += Math.abs(after[i + c] - before[i + c]);
                            delta += d;
                            if (d > 24) changed++;
                        }
                        diffs[name] = { changed, delta };
                    }
                    material.setProperty('airTransmission', original);
                    const litFrame = read();
                    const lightDiffs = {};
                    for (const light of native.cameraNode.scene.getComponentsInChildren(SpotLight)) {
                        light.enabled = false;
                        const darkFrame = read();
                        let changed = 0,
                            delta = 0;
                        // Gem region, excluding backdrop and HUD; each real light must contribute.
                        for (let y = Math.floor(canvas.height * 0.26); y < canvas.height * 0.68; ++y) {
                            for (let x = Math.floor(canvas.width * 0.36); x < canvas.width * 0.64; ++x) {
                                const i = (y * canvas.width + x) * 4;
                                let difference = 0;
                                for (let c = 0; c < 3; ++c) difference += Math.abs(litFrame[i + c] - darkFrame[i + c]);
                                delta += difference;
                                if (difference > 24) ++changed;
                            }
                        }
                        lightDiffs[light.node.name] = { changed, delta };
                        light.enabled = true;
                        read();
                    }
                    const stages = renderer.model.subModels[0].passes.map((pass, i) => {
                        const shader = renderer.model.subModels[0].shaders[i],
                            program = shader.gpuShader.glProgram;
                        return {
                            index: i,
                            forwardAdd: !!pass.defines.CC_FORWARD_ADD,
                            blend: pass.blendState.targets[0].blend,
                            sceneColorSamplerActive: gl.getUniformLocation(program, 'cc_sceneColorTex') !== null,
                        };
                    });
                    const error = gl.getError();
                    director.resume();
                    game.resume();
                    return { diffs, lightDiffs, stages, glError: error };
                });
                samples.push({ probe: 'native-optics', ...optical });
                for (const [name, value] of Object.entries(optical.diffs))
                    check(
                        `native ${name} changes frozen actual pixels`,
                        value.changed >= 50 && value.delta >= 1000,
                        value,
                    );
                check(
                    'refraction only sampled in base, additive lighting preserves blending',
                    optical.stages[0].sceneColorSamplerActive &&
                        optical.stages
                            .filter((stage) => stage.forwardAdd)
                            .every((stage) => stage.blend && !stage.sceneColorSamplerActive),
                    optical.stages,
                );
                check('no optical WebGL error', optical.glError === 0, optical.glError);
                for (const [name, value] of Object.entries(optical.lightDiffs))
                    check(`native ${name} contributes pixels`, value.changed >= 20 && value.delta >= 500, value);
            }
            const lifecycle = await page.evaluate(() => window.__lifecycle());
            check(
                'owned resources released and reacquired',
                lifecycle.released && lifecycle.reloaded && !lifecycle.errors.length,
                lifecycle,
            );
            await sleep(600);
            check('post-lifecycle visible frame', metrics(await shot('lifecycle')).litRatio >= 0.02);
            check('no runtime errors', errors.length === 0, errors);
            const spec = fs.readFileSync(path.join(root, 'examples', name, 'assets', 'benchmark-spec.json'));
            await page.close();
            const videoReplay = await recordP2(browser, name, server.address().port);
            const changedDuringRun =
                Object.entries(sourceHashes).some(
                    ([file, digest]) => hash(fs.readFileSync(path.join(root, file))) !== digest,
                ) || hash(fs.readFileSync(__filename)) !== verifierHash;
            check('independent recorded P1/P2 replay fulfills motion and preconditions', videoReplay.ok, videoReplay);
            const report = {
                recordedAt: new Date().toISOString(),
                scene: name,
                browser: browserName,
                browserVersion: browser.version(),
                artifactMode: staticMode
                    ? 'self-contained nested static bundle'
                    : 'source TS via read-only memory compilation',
                bundleSHA256: bundleHash,
                frozenSpecSHA256: hash(spec),
                sourceHashes,
                verifierSHA256: verifierHash,
                executions: { behaviorPerformance: { recording: false, checks, samples }, videoReplay },
                videoPath: videoReplay.videoPath,
                measurementPolicy:
                    'Behavior/performance and recorded P1/P2 are separate executions. No claim of a single all-green recorded run; full-recording WebKit fps failures retained separately.',
                changedDuringRun,
                checks,
                samples,
                errors,
                ok:
                    checks.every((c) => c.ok) &&
                    !changedDuringRun &&
                    hash(fs.readFileSync(path.join(root, 'build/cocosair.module.js'))) === bundleHash,
            };
            reports.push(report);
            fs.writeFileSync(
                path.join(
                    root,
                    `output/playwright/${name}-${browserName}${staticMode ? '-static' : ''}-verification.json`,
                ),
                JSON.stringify(report, null, 2),
            );
            console.log(
                JSON.stringify(
                    { scene: name, ok: report.ok, checks: checks.length, failed: checks.filter((c) => !c.ok) },
                    null,
                    2,
                ),
            );
        }
        if (reports.some((report) => !report.ok)) process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        await new Promise((resolve) => server.close(resolve));
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
