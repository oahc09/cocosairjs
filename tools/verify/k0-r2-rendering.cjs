'use strict';
const fs = require('node:fs'),
    path = require('node:path'),
    os = require('node:os'),
    crypto = require('node:crypto'),
    assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const identity = (f) => {
    const b = fs.readFileSync(path.join(root, f));
    return { bytes: b.length, sha256: sha(b) };
};
const CASES = [
    'vertex-on',
    'vertex-off',
    'uv-missing-transparent',
    'uv-missing-opaque',
    'uv-present',
    'blend-background',
    'blend-alpha',
    'blend-add',
    'blend-opaque',
    'large',
    'mesh-startup',
    'mesh-populated',
    'mesh-partial',
    'mesh-empty',
    'cull-front',
    'cull-back',
    'cull-negative',
    'cull-none',
    'fog-on',
    'fog-off',
    'fog-enabled-first',
    'fog-restore',
    'scale-single',
    'scale-double',
    'instance-single',
    'instance-double',
    'bill-single',
    'bill-node-scale',
    'bill-width',
    'coordinates',
    'fox-default',
    'fox-single',
    'fox-scaled',
    'fox-loop',
    'fox-controller-overlap',
    'lights',
];
const FILES = [
    'build/cocosair.module.js',
    'build/cocosair.module.d.ts',
    'build/npm/cocosair.module.js',
    'src/air/builtin/builtin-effects.ts',
    'src/air/assets/gltf/asset.ts',
    'src/air/assets/gltf/material/standard-effect.ts',
    'src/air/rendering/engine-contracts.ts',
    'src/cocos/3d/assets/mesh.ts',
    'src/cocos/3d/misc/mesh-validation.ts',
    'src/cocos/render-scene/scene/fog.ts',
    'src/cocos/particle/billboard.ts',
    'src/cocos/scene-graph/node.ts',
    'tools/debug/probes/k0-r2-materials/main.js',
    'tools/debug/probes/k0-r2-materials/index.html',
    'tools/verify/k0-r2-rendering.cjs',
    'examples/gltf-viewer/assets/official/Fox.glb',
    'tools/verify/competitive-example-server.cjs',
    'tools/verify/browser-engines.cjs',
];
function pixels(png) {
    const { PNG } = require('pngjs');
    const p = PNG.sync.read(png);
    let count = 0,
        minX = p.width,
        minY = p.height,
        maxX = -1,
        maxY = -1;
    for (let y = 0; y < p.height; y++)
        for (let x = 0; x < p.width; x++) {
            const i = (y * p.width + x) * 4;
            if (p.data[i] + p.data[i + 1] + p.data[i + 2] > 35) {
                count++;
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
            }
        }
    const sample = (x, y) => [
        ...p.data.slice(
            (Math.floor(y) * p.width + Math.floor(x)) * 4,
            (Math.floor(y) * p.width + Math.floor(x)) * 4 + 4,
        ),
    ];
    return {
        width: p.width,
        height: p.height,
        count,
        bbox: count ? [minX, minY, maxX, maxY] : null,
        center: sample(p.width / 2, p.height / 2),
        corner: sample(2, 2),
    };
}
// Pure adjudicator: measurements below are recomputed from saved PNG bytes by
// validateFiles; missing/NaN fields cannot become a pass through truthiness.
function checkReport(r) {
    const errors = [],
        checked = [];
    const check = (id, fn) => {
        try {
            fn();
            checked.push(id);
        } catch (e) {
            errors.push(id + ': ' + e.message);
        }
    };
    const s = r.cases || {},
        v = (id) => {
            assert(s[id], id + ' missing');
            return s[id];
        };
    const color = (id, c) => {
        const a = v(id).pixels.center;
        assert(a[c] > 100 && a[c] > a[(c + 1) % 3] + 65 && a[c] > a[(c + 2) % 3] + 65, JSON.stringify(a));
    };
    const equal = (a, b) => assert.deepEqual(v(a).pixels.center, v(b).pixels.center);
    const ratio = (a, b, lo, hi) => {
        const x = v(a).pixels.count,
            y = v(b).pixels.count;
        assert(x > 100 && y / x > lo && y / x < hi, `${x} -> ${y}`);
    };
    for (const id of CASES)
        check('capture:' + id, () => {
            const a = v(id);
            if (id !== 'coordinates') {
                assert.equal(a.glError, 0);
                assert(a.pixels.width > 0);
                assert(a.pixels.center.every(Number.isFinite));
                assert.equal(a.pixels.center.length, 4);
                assert.deepEqual(a.center, a.pixels.center);
                assert(a.artifact?.sha256);
            }
        });
    check('N8/N9 vertex GPU', () => {
        color('vertex-on', 0);
        assert(
            v('vertex-off')
                .pixels.center.slice(0, 3)
                .every((c) => c > 100),
        );
        const i = v('vertex-on').inspection;
        assert(i.passes.some((p) => p.reflection === 'webgl-active' && p.activeAttributes.includes('a_color')));
        assert(v('vertex-off').inspection.issues.some((i) => i.code === 'AIR_W_VERTEX_COLOR_DISABLED'));
    });
    check('N11 UV positive/negative', () => {
        assert.equal(v('uv-missing-transparent').pixels.count, 0);
        color('uv-missing-opaque', 1);
        color('uv-present', 1);
        assert(v('uv-missing-transparent').inspection.issues.some((i) => i.code === 'AIR_W_TEXTURE_UV_MISSING'));
    });
    check('N12 native blend states', () => {
        color('blend-background', 1);
        color('blend-opaque', 0);
        const a = v('blend-alpha').pixels.center,
            b = v('blend-add').pixels.center;
        assert(a[0] > 60 && a[1] > 60 && a[2] < 10);
        assert(b[0] > 60 && b[1] > a[1] + 30 && b[2] < 10);
        for (const id of ['blend-alpha', 'blend-add'])
            assert(v(id).passStates.every((s) => s.blend === true && s.depthWrite === false));
    });
    check('N1 large visible', () => {
        assert.equal(v('large').vertices, 4096);
        assert.equal(v('large').indexCount, 23814);
        color('large', 0);
    });
    check('N4 device startup rejection', () => {
        assert.equal(v('mesh-startup').startupCode, 'AIR_E_MESH_NOT_READY');
        assert.equal(v('mesh-startup').initializedMeshIndexCount, 6);
        color('mesh-startup', 0);
    });
    check('N3 partial 100 updates', () => {
        const a = v('mesh-partial');
        assert.deepEqual(a.before, a.after);
        assert.equal(a.minX, 0.5);
        assert.equal(a.maxX, 1.5);
        assert(a.pixels.bbox[0] > v('mesh-populated').pixels.bbox[0] + 30);
    });
    check('N3 empty clears GPU', () => {
        assert.equal(v('mesh-empty').indexCount, 0);
        assert.equal(v('mesh-empty').unnotifiedIndexCount, 6);
        assert.equal(v('mesh-empty').assemblerIndexCount, 0);
        assert.equal(v('mesh-empty').pixels.count, 0);
        assert(v('mesh-populated').pixels.count > 100);
    });
    check('N10 winding/reflection/cull', () => {
        color('cull-front', 0);
        assert.equal(v('cull-back').pixels.count, 0);
        assert.equal(v('cull-negative').pixels.count, 0);
        equal('cull-none', 'cull-front');
    });
    check('N13 fog setter pixels/restore', () => {
        const on = v('fog-on').pixels.center;
        assert(on[2] > 60 && on[2] > v('fog-off').pixels.center[2] + 60);
        equal('fog-on', 'fog-enabled-first');
        equal('fog-off', 'fog-restore');
        color('fog-off', 0);
    });
    check('N14d mesh scale', () => ratio('scale-single', 'scale-double', 3.8, 4.2));
    check('N14d instanced scale', () => {
        ratio('instance-single', 'instance-double', 3.8, 4.2);
        assert.equal(v('instance-single').instancingEnabled, true);
    });
    check('N14d Billboard dimensions', () => {
        assert.equal(v('bill-single').pixels.count, v('bill-node-scale').pixels.count);
        ratio('bill-single', 'bill-width', 3.8, 4.2);
    });
    check('N14a DPR/canvas/viewport', () => {
        const a = v('coordinates');
        assert(a.rect.left > 0 && a.rect.top > 0);
        assert(a.dpr > 1);
        for (const p of a.points) {
            p.world.forEach((w, i) => assert(Math.abs(w - p.roundTrip[i]) < 1e-4));
            assert(Math.abs(p.client[0] - a.rect.left - (p.screen[0] * a.rect.width) / a.width) < 1e-7);
            assert(Math.abs(p.client[1] - a.rect.top - ((a.height - p.screen[1]) * a.rect.height) / a.height) < 1e-7);
        }
        assert(a.points[1].screen[1] > a.points[0].screen[1]);
        assert(a.points[1].client[1] < a.points[0].client[1]);
    });
    check('N5 skinned glTF material', () => {
        const a = v('fox-default');
        assert(a.skinnedCount > 0);
        assert(a.pixels.count > 500);
        assert(a.state.materials.every((m) => m.effect === 'air-gltf-standard'));
    });
    check('N14d skinned scale', () => ratio('fox-single', 'fox-scaled', 3.4, 4.6));
    check('N6/N7 native loop isolation', () => {
        const { first: a, second: b } = v('fox-loop');
        assert(a.a.playing && !a.b.playing);
        assert.equal(a.finished, 1);
        assert(a.a.time > a.duration * 2);
        assert(b.a.time > a.a.time);
        assert.deepEqual(a.b.pose, b.b.pose);
        assert.notDeepEqual(a.a.pose, b.a.pose);
        assert.deepEqual(a.sourceWrap, a.originalWrap);
        assert(a.sharedClip);
        assert.deepEqual(a.controllers, [1, 1]);
    });
    check('N7 duplicate controller warning', () => {
        const a = v('fox-controller-overlap');
        assert.equal(a.inspection.controllerCount, 2);
        assert(a.inspection.conflicts.length > 0);
        assert(a.diagnostics.some((d) => d.message.includes('AIR_W_ANIMATION_CONTROLLERS')));
    });
    check('N14c main light selection', () => {
        const a = v('lights');
        assert.equal(a.first.lights.length, 3);
        assert.equal(a.first.ordinaryDirectionalCapacity, 1);
        assert.equal(a.first.lights.filter((l) => l.effective).length, 1);
        assert.equal(a.disabled.lights.length, 2);
        assert.notEqual(a.disabled.mainLight, a.first.mainLight);
        assert.equal(a.removed.lights.length, 1);
        assert.notEqual(a.removed.mainLight, a.disabled.mainLight);
    });
    check('owned resources retired', () => {
        assert(r.cleanup);
        assert.equal(r.cleanup.receipt.status, 'released');
        assert(r.cleanup.refs.length > 10);
        for (const a of r.cleanup.refs) {
            assert.equal(a.initial, 1);
            assert.equal(a.before, 1);
            assert.equal(a.after, 0);
        }
        assert(r.cleanup.nodes.every((n) => n.valid === false));
        assert(r.cleanup.parsed.every((a) => a.refCount === 0 && a.valid === false));
    });
    check('no browser/console errors', () => {
        assert.deepEqual(r.pageErrors, []);
        assert.deepEqual(r.consoleErrors, []);
    });
    return { pass: errors.length === 0, checked, errors };
}
function validateFiles(report) {
    const errors = [];
    if (!Array.isArray(report.results) || !report.results.length) errors.push('No browser results');
    const expected = report.requestedEngines || [];
    if (
        !expected.length ||
        expected.length !== new Set(expected).size ||
        JSON.stringify(expected) !== JSON.stringify((report.results || []).map((r) => r.engine))
    )
        errors.push('Browser scope mismatch');
    if (report.error) errors.push('Collector error: ' + report.error);
    for (const result of report.results || []) {
        if (result.error) errors.push(result.engine + ': ' + result.error);
        if (report.installed && result.buildRequests?.length !== 0)
            errors.push(result.engine + ': repository runtime fallback');
        for (const [name, row] of Object.entries(result.cases || {})) {
            if (name === 'coordinates') continue;
            if (!row.artifact) {
                errors.push(result.engine + ': missing PNG ' + name);
                continue;
            }
            try {
                const b = fs.readFileSync(path.resolve(root, row.artifact.path));
                if (sha(b) !== row.artifact.sha256) errors.push('PNG drift: ' + row.artifact.path);
                row.pixels = pixels(b);
            } catch (e) {
                errors.push('PNG unavailable: ' + row.artifact.path + ' ' + e.message);
            }
        }
        errors.push(...checkReport(result).errors.map((e) => result.engine + ': ' + e));
    }
    for (const f of FILES) {
        const id = report.inputs?.[f];
        if (!id || identity(f).sha256 !== id.sha256) errors.push('input drift/missing: ' + f);
    }
    if (!Array.isArray(report.inputDrift) || report.inputDrift.length) errors.push('Candidate drift during collection');
    return { pass: errors.length === 0, errors };
}
async function installedRuntime() {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'air-k0-r2-consumer-'));
    const cleanup = () => {
        assert(path.resolve(temp).startsWith(path.resolve(os.tmpdir()) + path.sep));
        assert(path.basename(temp).startsWith('air-k0-r2-consumer-'));
        fs.rmSync(temp, { recursive: true, force: true });
    };
    try {
        const cli =
            process.env.npm_execpath || path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
        assert(fs.existsSync(cli));
        const run = (args) =>
            execFileSync(process.execPath, [cli, ...args], {
                cwd: args[0] === 'pack' ? root : temp,
                encoding: 'utf8',
                maxBuffer: 16 * 1024 * 1024,
            });
        const pack = JSON.parse(run(['pack', '--json', '--pack-destination=' + temp]))[0],
            tar = path.join(temp, pack.filename);
        fs.writeFileSync(path.join(temp, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
        const installOutput = run(['install', tar, '--offline', '--ignore-scripts', '--no-audit', '--no-fund']);
        const packageRoot = path.join(temp, 'node_modules/cocosair.js');
        const source =
            "import { Material, Node, GLTFLoader, Animation, Billboard, Camera, gfx } from 'cocosair.js';\nconst m=new Material();m.initialize({effectName:'builtin-unlit',defines:{USE_VERTEX_COLOR:true},states:{depthStencilState:{depthWrite:false},blendState:{targets:[{blend:true,blendSrc:gfx.BlendFactor.SRC_ALPHA,blendDst:gfx.BlendFactor.ONE_MINUS_SRC_ALPHA}]}}});const n=new Node();n.setScale(2,2,2);n.setRotationFromEuler(0,0,90);const camera=n.addComponent(Camera);camera.worldToScreen(n.position);const b=n.addComponent(Billboard);b.width=2;async function use(){const a=await new GLTFLoader().parseAsync(new ArrayBuffer(0));const i=a.instantiate();i.setAnimationLoop(true);i.root.getComponent(Animation)!.play();}\n";
        fs.writeFileSync(path.join(temp, 'consumer.ts'), source);
        fs.writeFileSync(
            path.join(temp, 'types.json'),
            JSON.stringify({
                compilerOptions: {
                    target: 'ES2022',
                    module: 'Node16',
                    moduleResolution: 'Node16',
                    strict: true,
                    noEmit: true,
                    skipLibCheck: true,
                    types: [],
                },
                files: ['consumer.ts'],
            }),
        );
        const tsc = path.join(root, 'node_modules/typescript/bin/tsc');
        const typeOutput = execFileSync(process.execPath, [tsc, '-p', path.join(temp, 'types.json'), '--listFiles'], {
            cwd: temp,
            encoding: 'utf8',
        });
        assert(
            typeOutput
                .replaceAll('\\', '/')
                .includes(packageRoot.replaceAll('\\', '/') + '/build/cocosair.legacy.d.ts'),
        );
        fs.writeFileSync(path.join(temp, 'runtime.js'), "export * from 'cocosair.js';\n");
        const built = await require('esbuild').build({
            entryPoints: [path.join(temp, 'runtime.js')],
            outdir: path.join(temp, 'chunks'),
            bundle: true,
            splitting: true,
            format: 'esm',
            platform: 'browser',
            target: 'es2022',
            write: false,
        });
        const contents = new Map(
            built.outputFiles.map((f) => ['/installed/' + path.basename(f.path), Buffer.from(f.contents)]),
        );
        assert(
            fs
                .readFileSync(path.join(packageRoot, 'build/npm/cocosair.module.js'))
                .equals(fs.readFileSync(path.join(root, 'build/npm/cocosair.module.js'))),
        );
        return {
            contents,
            cleanup,
            identity: {
                method: 'ACTUAL_TARBALL_OFFLINE_INSTALL',
                tarball: { bytes: fs.statSync(tar).size, sha256: sha(fs.readFileSync(tar)) },
                runtime: identity('build/npm/cocosair.module.js'),
                installOutput,
                typecheck: {
                    version: require(path.join(root, 'node_modules/typescript/package.json')).version,
                    exitCode: 0,
                    installedDeclarationsOnly: true,
                    rawOutput: typeOutput,
                },
                chunks: Object.fromEntries([...contents].map(([f, b]) => [f, { bytes: b.length, sha256: sha(b) }])),
            },
        };
    } catch (e) {
        cleanup();
        throw e;
    }
}
async function main() {
    const arg = process.argv.find((a) => a.startsWith('--out='));
    assert(arg, '--out=<new.json> required');
    const out = path.resolve(root, arg.slice(6));
    assert(!fs.existsSync(out), 'refusing existing report');
    const engine = process.argv.find((a) => a.startsWith('--browser='))?.slice(10) || 'all';
    assert(['all', 'chromium', 'firefox', 'webkit'].includes(engine));
    const useInstalled = process.argv.includes('--installed');
    const artifactDir = out.replace(/\.json$/, '') + '-artifacts';
    fs.mkdirSync(artifactDir, { recursive: true });
    const startedAt = new Date().toISOString(),
        inputs = Object.fromEntries(FILES.map((f) => [f, identity(f)]));
    const installed = useInstalled ? await installedRuntime() : null;
    const { startExampleServer } = require('./competitive-example-server.cjs'),
        { launchOptions } = require('./browser-engines.cjs'),
        { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');
    const server = await startExampleServer(root),
        pw = require('playwright'),
        results = [];
    try {
        for (const eng of engine === 'all' ? ['chromium', 'firefox', 'webkit'] : [engine]) {
            const browser = await pw[eng].launch({ ...launchOptions(eng), env: loopbackBrowserEnv(), headless: true });
            const result = {
                engine: eng,
                browserVersion: browser.version(),
                method: installed ? 'REAL_BROWSER_INSTALLED_PACKAGE' : 'REAL_BROWSER',
                cases: {},
                pageErrors: [],
                consoleErrors: [],
                buildRequests: [],
            };
            try {
                const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 2 });
                page.on('pageerror', (e) => result.pageErrors.push(String(e)));
                page.on('console', (m) => {
                    if (m.type() === 'error') result.consoleErrors.push(m.text());
                });
                page.on('request', (r) => {
                    if (new URL(r.url()).pathname.startsWith('/build/')) result.buildRequests.push(r.url());
                });
                if (installed) {
                    await page.route('**/installed/**', async (route) => {
                        const b = installed.contents.get(new URL(route.request().url()).pathname);
                        await route.fulfill({
                            status: b ? 200 : 404,
                            body: b || 'missing',
                            contentType: 'application/javascript',
                        });
                    });
                    await page.route('**/k0-r2-materials/index.html', (route) =>
                        route.fulfill({
                            body: fs
                                .readFileSync(path.join(root, 'tools/debug/probes/k0-r2-materials/index.html'), 'utf8')
                                .replace('/build/cocosair.module.js', '/installed/runtime.js'),
                            contentType: 'text/html',
                        }),
                    );
                }
                await page.goto(server.origin + '/tools/debug/probes/k0-r2-materials/index.html');
                await page.waitForFunction(() => window.__k0r2Materials, null, { timeout: 30000 });
                for (const name of CASES) {
                    const observation = await page.evaluate((n) => window.__k0r2Materials.run(n), name);
                    if (observation.png) {
                        const b = Buffer.from(observation.png.split(',')[1], 'base64');
                        delete observation.png;
                        const f = path.join(artifactDir, eng + '-' + name + '.png');
                        fs.writeFileSync(f, b, { flag: 'wx' });
                        observation.artifact = {
                            path: path.relative(root, f).replaceAll('\\', '/'),
                            sha256: sha(b),
                            bytes: b.length,
                            method: 'CANVAS_NATIVE',
                        };
                        observation.pixels = pixels(b);
                    }
                    result.cases[name] = observation;
                }
                result.cleanup = await page.evaluate(() => window.__k0r2Materials.close());
                if (installed && result.buildRequests.length)
                    throw Error('Repository /build runtime leaked into installed consumer');
            } catch (e) {
                result.error = String(e.stack || e);
            } finally {
                await browser.close();
            }
            result.validation = checkReport(result);
            result.pass = !result.error && result.validation.pass;
            results.push(result);
            console.log(
                eng +
                    ' ' +
                    (result.pass ? 'PASS' : 'FAIL') +
                    ' ' +
                    JSON.stringify(result.validation.errors) +
                    (result.error || ''),
            );
        }
    } finally {
        await server.close();
        installed?.cleanup();
    }
    const inputDrift = FILES.filter((f) => identity(f).sha256 !== inputs[f].sha256),
        scopePassed = results.every((r) => r.pass) && inputDrift.length === 0;
    const report = {
        schemaVersion: 'k0-r2-rendering/1',
        startedAt,
        endedAt: new Date().toISOString(),
        command: process.argv,
        cwd: root,
        exitCode: scopePassed ? 0 : 1,
        scopePassed,
        requestedEngines: engine === 'all' ? ['chromium', 'firefox', 'webkit'] : [engine],
        subset: true,
        completed: false,
        fullGalleryVerified: false,
        historicalK0Rerun: false,
        captureMethod: 'CANVAS_NATIVE',
        pageCompositorVerified: false,
        inputs,
        inputDrift,
        installed: installed?.identity || null,
        results,
    };
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
    process.exitCode = report.exitCode;
}
module.exports = { checkReport, validateFiles, pixels, CASES };
if (require.main === module)
    main().catch((e) => {
        console.error(e);
        process.exitCode = 1;
    });
