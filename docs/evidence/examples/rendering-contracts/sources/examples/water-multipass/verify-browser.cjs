/** Focused reproducible checks, writes only explicit output; never rebuilds the SDK. */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { PNG } = require('pngjs');
const playwright = require('playwright');
const { launchOptions } = require('../../tools/verify/browser-engines.cjs');
const { loopbackBrowserEnv } = require('../../tools/verify/loopback-browser-env.cjs');
const args = process.argv.slice(2);
const engine = args.find((value) => value.startsWith('--browser='))?.slice(10) || 'chromium';
if (!['chromium', 'firefox', 'webkit'].includes(engine)) throw new Error('unknown browser');
const url = args.find((value) => value.startsWith('--url='))?.slice(6);
const out = path.resolve(args.find((value) => value.startsWith('--out='))?.slice(6) || 'output/water-multipass');
const hash = (data) => crypto.createHash('sha256').update(data).digest('hex');
function sourceFiles(directory = __dirname, prefix = '') {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const local = path.join(directory, entry.name),
                relative = `${prefix}${entry.name}`;
            return entry.isDirectory()
                ? sourceFiles(local, `${relative}/`)
                : [{ path: relative, sha256: hash(fs.readFileSync(local)) }];
        })
        .sort((a, b) => a.path.localeCompare(b.path));
}
async function run() {
    const sourceStart = sourceFiles();
    const candidateStart = fs.existsSync('build/cocosair.module.js')
        ? hash(fs.readFileSync('build/cocosair.module.js'))
        : null;
    fs.mkdirSync(out, { recursive: true });
    const browser = await playwright[engine].launch({
        ...launchOptions(engine),
        env: loopbackBrowserEnv(),
        headless: true,
    });
    const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
    const errors = [],
        checks = [],
        snapshots = [];
    let runtimeCompleted = false;
    const check = (name, ok, detail) => {
        checks.push({ name, ok, detail });
        if (!ok) throw new Error(`${name}: ${JSON.stringify(detail)}`);
    };
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    try {
        await page.goto('about:blank');
        const definitions = ['scene', 'water', 'caustic', 'debug', 'overlay'].map((id) => ({
            id,
            value: JSON.parse(fs.readFileSync(path.join(__dirname, `${id}.effect.json`), 'utf8')),
        }));
        const shaders = await page.evaluate((definitions) => {
            const gl = document.createElement('canvas').getContext('webgl2');
            if (!gl) throw new Error('WebGL2 required');
            return definitions.map(({ id, value }) => {
                const compile = (type, code) => {
                    const shader = gl.createShader(type);
                    gl.shaderSource(shader, '#version 300 es\n' + code);
                    gl.compileShader(shader);
                    return {
                        shader,
                        ok: gl.getShaderParameter(shader, gl.COMPILE_STATUS),
                        log: gl.getShaderInfoLog(shader),
                    };
                };
                const vertex = compile(gl.VERTEX_SHADER, value.shaders[0].glsl3.vert);
                const fragment = compile(gl.FRAGMENT_SHADER, value.shaders[0].glsl3.frag);
                const program = gl.createProgram();
                gl.attachShader(program, vertex.shader);
                gl.attachShader(program, fragment.shader);
                gl.linkProgram(program);
                const result = {
                    id,
                    vertex: vertex.ok,
                    fragment: fragment.ok,
                    linked: gl.getProgramParameter(program, gl.LINK_STATUS),
                    logs: [vertex.log, fragment.log, gl.getProgramInfoLog(program)].filter(Boolean),
                };
                gl.deleteProgram(program);
                gl.deleteShader(vertex.shader);
                gl.deleteShader(fragment.shader);
                return result;
            });
        }, definitions);
        check(
            'five GLSL3 programs compile and link',
            shaders.every((item) => item.vertex && item.fragment && item.linked),
            shaders,
        );
        if (url) {
            await page.goto(url, { waitUntil: 'networkidle' });
            await page.waitForFunction(() => window.__appReady === true, { timeout: 30000 });
            const frame = async () => {
                await page.evaluate(
                    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
                );
            };
            const probe = () => page.evaluate(() => window.__probe());
            const capture = async (name) => {
                await frame();
                const glErrors = await page.evaluate(() => {
                    const gl = document.getElementById('GameCanvas').getContext('webgl2');
                    if (!gl) throw new Error('runtime canvas WebGL2 context missing');
                    const errors = [];
                    for (let i = 0; i < 16; i++) {
                        const error = gl.getError();
                        if (error === gl.NO_ERROR) break;
                        errors.push(error);
                    }
                    return errors;
                });
                check(`${name}: no WebGL errors`, glErrors.length === 0, glErrors);
                const buffer = await page.locator('#GameCanvas').screenshot();
                fs.writeFileSync(path.join(out, `${name}.png`), buffer);
                const digest = hash(buffer);
                snapshots.push({ name, sha256: digest });
                return digest;
            };
            await page.evaluate(() => window.__water.setTime(1.25));
            const initial = await probe();
            check(
                'requested/effective HDR and complete attachments',
                Object.values(initial.targets).every(
                    (item) => item.framebufferComplete && item.effective.colorFormat === 'rgba16f',
                ),
                initial.targets,
            );
            check(
                'real geometry and transparent depth state',
                initial.geometry.waterTriangles === 20000 &&
                    initial.geometry.fish === 3 &&
                    initial.overlayState.every((item) => item.blend && !item.depthWrite),
                initial,
            );
            const initialHash = await capture('final-fixed');
            const channelStats = await page.evaluate(() =>
                Object.fromEntries(
                    Object.entries(window.__water.targets()).map(([name, target]) => {
                        const data = target.readColor();
                        let min = Infinity,
                            max = -Infinity,
                            finite = true,
                            distinct = new Set(),
                            orange = 0,
                            cyan = 0;
                        for (let i = 0; i < data.length; i += 4) {
                            finite = finite && Number.isFinite(data[i]);
                            min = Math.min(min, data[i]);
                            max = Math.max(max, data[i]);
                            distinct.add(Math.round(data[i] * 128));
                            if (data[i] > 0.45 && data[i + 1] < 0.4 && data[i + 2] < 0.2) orange++;
                            if (data[i] < 0.15 && data[i + 1] > 0.4 && data[i + 2] > 0.32) cyan++;
                        }
                        return [name, { min, max, finite, distinct: distinct.size, orange, cyan }];
                    }),
                ),
            );
            check(
                'three genuine targets contain finite nonuniform pixels',
                Object.values(channelStats).every(
                    (item) => item.finite && item.distinct > 4 && item.max > item.min + 0.03,
                ),
                channelStats,
            );
            check(
                'above/below markers remain in correct clipped captures',
                channelStats.reflection.orange > 30 &&
                    channelStats.refraction.cyan > 30 &&
                    channelStats.refraction.orange < channelStats.reflection.orange * 0.05,
                channelStats,
            );
            const channels = {};
            for (const channel of ['reflection', 'refraction', 'depth', 'caustics']) {
                await page.evaluate((channel) => window.__water.setChannel(channel), channel);
                channels[channel] = await capture(`channel-${channel}`);
            }
            check('depth/reflection/refraction/caustics differ', new Set(Object.values(channels)).size === 4, channels);
            await page.evaluate(() => window.__water.setChannel('depth'));
            await frame();
            const depthPNG = PNG.sync.read(await page.locator('#GameCanvas').screenshot());
            const expectedDepth = await page.evaluate(() => window.__water.expectedDepthSamples());
            const depthChecks = expectedDepth.map((sample) => ({
                ...sample,
                measured: depthPNG.data[(sample.y * depthPNG.width + sample.x) * 4] / 255,
            }));
            check(
                'linear depth at three known world-space floor points',
                depthChecks.every(
                    (sample) => Number.isFinite(sample.measured) && Math.abs(sample.measured - sample.expected) < 0.012,
                ),
                depthChecks,
            );
            await page.evaluate(() => window.__water.setChannel('final'));
            check(
                'fixed state reproduces byte-identical canvas',
                (await capture('final-repeat')) === initialHash,
                snapshots,
            );
            const isolated = {};
            for (const flag of ['reflection', 'refraction', 'depth', 'caustics', 'overlays']) {
                await page.evaluate((flag) => window.__water.setFlag(flag, false), flag);
                isolated[flag] = await capture(`without-${flag}`);
                await page.evaluate((flag) => window.__water.setFlag(flag, true), flag);
            }
            check(
                'each optical/transparent channel changes final pixels',
                Object.values(isolated).every((value) => value !== initialHash),
                isolated,
            );
            const pixelAt = (png, sample) =>
                Array.from(
                    png.data.subarray((sample.y * png.width + sample.x) * 4, (sample.y * png.width + sample.x) * 4 + 3),
                ).map((value) => value / 255);
            const finSamples = await page.evaluate(() => window.__water.finSamples());
            await page.evaluate(() => window.__water.setFlag('overlays', false));
            await capture('fin-background');
            const finBackground = PNG.sync.read(fs.readFileSync(path.join(out, 'fin-background.png')));
            await page.evaluate(() => window.__water.setFlag('overlays', true));
            await capture('fin-with-depth');
            const finForeground = PNG.sync.read(fs.readFileSync(path.join(out, 'fin-with-depth.png')));
            const upper = finSamples[0],
                lower = finSamples[1];
            const backgroundRGB = pixelAt(finBackground, upper),
                foregroundRGB = pixelAt(finForeground, upper);
            const expectedRGB = backgroundRGB.map(
                (value, i) => value * (1 - upper.alpha) + upper.tint[i] * upper.alpha,
            );
            check(
                'fin performs source-over alpha blending',
                foregroundRGB.every((value, i) => Math.abs(value - expectedRGB[i]) < 0.035),
                { upper, backgroundRGB, foregroundRGB, expectedRGB },
            );
            const lowerBackground = pixelAt(finBackground, lower),
                lowerForeground = pixelAt(finForeground, lower);
            check(
                'submerged fin is depth-occluded by water',
                lowerForeground.every((value, i) => Math.abs(value - lowerBackground[i]) < 0.012),
                { lower, lowerBackground, lowerForeground },
            );
            await page.evaluate(() => window.__water.setFinDepthTest(false));
            await capture('fin-no-depth-negative-control');
            const noDepthRGB = pixelAt(
                PNG.sync.read(fs.readFileSync(path.join(out, 'fin-no-depth-negative-control.png'))),
                lower,
            );
            check(
                'depth-off negative control exposes submerged fin',
                noDepthRGB.some((value, i) => Math.abs(value - lowerForeground[i]) > 0.03),
                { lowerForeground, noDepthRGB },
            );
            await page.evaluate(() => window.__water.setFinDepthTest(true));
            await page.mouse.move(440, 380);
            const mouse = await probe();
            check('real pointer reaches water', mouse.mouseHits > 0, mouse.mouseHits);
            check(
                'pointer ripple changes pixels at fixed time',
                (await capture('pointer-ripple')) !== initialHash,
                snapshots,
            );
            await page.evaluate(() => window.__water.setFlag('overlays', false));
            const dryWater = await capture('rain-disabled-no-overlays');
            await page.evaluate(() => window.__water.setFlag('rain', true));
            const wetWater = await capture('rain-enabled-no-overlays');
            check('rain changes actual water pixels independently of overlay rain geometry', wetWater !== dryWater, {
                dryWater,
                wetWater,
            });
            await page.evaluate(() => window.__water.setFlag('overlays', true));
            await page.evaluate(() => {
                window.__water.setFlag('rain', true);
                window.__water.setTime(1.65);
            });
            check('24 real rain geometries', (await probe()).geometry.rainDrops === 24, await probe());
            await capture('rain');
            const generation = (await probe()).targets.refraction.generation;
            await page.setViewportSize({ width: 640, height: 480 });
            await frame();
            await frame();
            const resized = await probe();
            check(
                'resize recreates targets, keeps current resolved bindings',
                resized.targets.refraction.generation > generation &&
                    resized.targets.refraction.width === Math.round(640 * 0.75),
                resized.targets,
            );
            await capture('resized');
            const lifecycle = await page.evaluate(() => window.__lifecycle());
            check(
                'owned resources released and rebuilt',
                lifecycle.released && lifecycle.reloaded && !lifecycle.errors.length && !lifecycle.leaked.length,
                lifecycle,
            );
            check('no runtime or WebGL errors', errors.length === 0, errors);
            check(
                'candidate and all example inputs stayed unchanged',
                candidateStart === hash(fs.readFileSync('build/cocosair.module.js')) &&
                    JSON.stringify(sourceStart) === JSON.stringify(sourceFiles()),
                { candidateStart, sourceStart },
            );
            runtimeCompleted = true;
        }
    } catch (error) {
        errors.push(error.message || String(error));
        throw error;
    } finally {
        const report = {
            scope: url ? 'water-multipass-runtime' : 'water-multipass-shader-only',
            browser: engine,
            completed: runtimeCompleted && checks.every((item) => item.ok),
            checks,
            errors,
            snapshots,
            candidate: fs.existsSync('build/cocosair.module.js')
                ? hash(fs.readFileSync('build/cocosair.module.js'))
                : null,
            source: hash(fs.readFileSync(path.join(__dirname, 'src/main.ts'))),
            sourceFiles: sourceStart,
            candidateStart,
        };
        fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
        await browser.close();
        console.log(JSON.stringify(report, null, 2));
    }
}
run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
