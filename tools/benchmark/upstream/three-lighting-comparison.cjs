/* Opt-in external source comparison. Does not fetch, publish, or read canonical scoring artifacts. */
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { buildSync, version: esbuild } = require('esbuild');
const { webkit } = require('playwright');
const { launchOptions } = require('../../verify/browser-engines.cjs');
const { loopbackBrowserEnv } = require('../../verify/loopback-browser-env.cjs');
const lock = require('./three-experiment-2026-11-18.json');
const pins = lock.experiments.find(({ id }) => id === 'physical-indirect-specular');
const arms = { before: pins.before, transition: pins.introduced, rollback: pins.after };
const backends = { fallback: 'WebGLBackend', classic: 'classic WebGLRenderer' };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digest = (file) => sha(fs.readFileSync(file));
const fixtureFile = path.join(__dirname, 'three-lighting-fixture.mjs');
const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 10000 }).trim();
const index =
    '<!doctype html><meta charset="utf-8"><style>html,body{margin:0}canvas{display:block}</style><script type="module" src="fixture.mjs"></script>';

function inspectArm(name, checkout) {
    const commit = git(checkout, ['rev-parse', 'HEAD']);
    assert.equal(commit, arms[name], name + ': wrong Three commit');
    assert.equal(git(checkout, ['status', '--porcelain', '--untracked-files=all', '--', 'src', 'package.json']), '');
    return { commit, sourceTree: git(checkout, ['rev-parse', 'HEAD:src']) };
}

function verifyConsumedSources(checkout, inputs) {
    const tree = execFileSync('git', ['ls-tree', '-rz', 'HEAD', '--', 'src'], {
        cwd: checkout,
        encoding: 'utf8',
        timeout: 10000,
    });
    const resolved = new Map(
        tree
            .split('\0')
            .filter(Boolean)
            .map((line) => {
                const tab = line.indexOf('\t');
                return [line.slice(tab + 1), line.slice(0, tab).split(' ')[2]];
            }),
    );
    const raw = execFileSync('git', ['hash-object', '--no-filters', '--stdin-paths'], {
        cwd: checkout,
        input: inputs.join('\n') + '\n',
        encoding: 'utf8',
        timeout: 10000,
    });
    const observed = raw.trim().split('\n');
    assert.equal(observed.length, inputs.length);
    inputs.forEach((file, i) => assert.equal(observed[i], resolved.get(file), 'Consumed Three bytes differ: ' + file));
}

function validate(r) {
    assert.deepEqual(r.errors, []);
    assert.equal(r.glVersion, 'WebGL 2.0');
    assert.equal(r.backend, backends[r.target]);
    assert.deepEqual(
        [r.width, r.height, r.dpr, r.colorSpace, r.toneMapping, r.toneMappingExposure],
        [640, 320, 1, 'srgb', 'Reinhard', 1],
    );
    const before = r.arm === 'before';
    const transitional = r.arm === 'transition';
    const red = (row) => row.rgba[0];
    const rgb = (row, value) => assert.deepEqual(row.rgba, [value, value, value, 255]);
    rgb(r.furnace.background, r.target === 'classic' ? 255 : 188);
    assert.equal(r.furnace.spheres.length, 22);
    for (const [i, sphere] of r.furnace.spheres.entries()) {
        assert.equal(sphere.roughness, (i % 11) / 10);
        assert.equal(sphere.metalness, i < 11 ? 1 : 0);
        if (i < 11 || !before) rgb(sphere, before ? 0 : 188);
        else assert.ok(red(sphere) >= 183 && red(sphere) <= 187);
    }
    assert.deepEqual(
        r.lightProbe.map((p) => [p.envOn, p.probeOn]),
        [
            [false, false],
            [false, true],
            [true, false],
            [true, true],
        ],
    );
    assert.deepEqual(
        r.hemisphere.map((row) => row.lightOn),
        [false, true],
    );
    const [dark, hemi] = r.hemisphere.map((row) => row.spheres);
    for (const [i, [metal, roughness]] of [
        [1, 0.1],
        [0, 0.1],
        [1, 0.7],
        [0, 0.7],
    ].entries()) {
        for (const row of [dark[i], hemi[i]]) assert.deepEqual([row.metalness, row.roughness], [metal, roughness]);
        rgb(dark[i], 0);
        if (metal) {
            if (before) rgb(hemi[i], 0);
            else assert.ok(red(hemi[i]) > 100, 'Hemisphere-only metal response not visible');
        } else assert.ok(red(hemi[i]) > 100, 'Hemisphere diffuse positive control absent');
    }
    const [none, probe, env, both] = r.lightProbe.map((p) => p.spheres.map(red));
    for (const i of [0, 2]) {
        assert.equal(none[i], 0);
        assert.ok(env[i] > 0);
        if (transitional) {
            assert.ok(probe[i] > 100 && both[i] > env[i]);
        } else assert.deepEqual([probe[i], both[i]], [0, env[i]]);
    }
    for (const i of [1, 3]) assert.ok(probe[i] > none[i] && both[i] > env[i], 'Diffuse probe response must persist');
}

async function main() {
    const args = process.argv.slice(2);
    assert.equal(args.length, 4, 'Specify --before=DIR --transition=DIR --rollback=DIR --out=NEW_DIR');
    const opts = Object.fromEntries(
        args.map((arg) => {
            const match = /^--(before|transition|rollback|out)=(.+)$/.exec(arg);
            assert.ok(match, 'Invalid argument: ' + arg);
            return [match[1], path.resolve(match[2])];
        }),
    );
    assert.equal(Object.keys(opts).length, 4, 'Duplicate option');
    const out = opts.out;
    const sources = Object.fromEntries(Object.keys(arms).map((a) => [a, inspectArm(a, opts[a])]));
    fs.mkdirSync(out); // Never overwrite a prior run.
    const site = path.join(out, 'site');
    fs.mkdirSync(site);
    fs.writeFileSync(path.join(site, 'index.html'), index);
    fs.copyFileSync(fixtureFile, path.join(site, 'fixture.mjs'));
    const result = {
        scope: 'exploratory-render-correctness-only',
        contributesToAgentScore: false,
        updatesProtectedBaseline: false,
        status: 'FAIL',
        notValidated: ['native-webgpu', 'timestamp-batching', 'gpu-timing', 'physical-display'],
        esbuild,
        playwright: require('playwright/package.json').version,
        fixtureSha256: digest(fixtureFile),
        collectorSha256: digest(__filename),
        sources,
        runs: [],
    };
    let server, browser;
    try {
        const bundles = {};
        for (const [arm, source] of Object.entries(sources)) {
            for (const renderer of Object.keys(backends)) {
                const name = arm + (renderer === 'classic' ? '-classic' : '') + '.mjs';
                const outfile = path.join(site, name);
                const { metafile } = buildSync({
                    entryPoints: [renderer === 'classic' ? 'src/Three.js' : 'src/Three.WebGPU.js'],
                    absWorkingDir: opts[arm],
                    outfile,
                    bundle: true,
                    metafile: true,
                    format: 'esm',
                    platform: 'browser',
                    target: 'safari18',
                    ignoreAnnotations: true,
                });
                const inputs = Object.keys(metafile.inputs);
                assert.ok(inputs.length > 0);
                for (const input of inputs) {
                    assert.ok(!/\r|\n/.test(input));
                    assert.ok(input.startsWith('src/'), 'Non-source Three input: ' + input);
                    assert.ok(
                        fs
                            .realpathSync(path.join(opts[arm], input))
                            .startsWith(fs.realpathSync(path.join(opts[arm], 'src')) + path.sep),
                    );
                }
                verifyConsumedSources(opts[arm], inputs);
                fs.writeFileSync(path.join(out, name + '.meta.json'), JSON.stringify(metafile, null, 2) + '\n');
                bundles[name] = digest(outfile);
            }
            assert.deepEqual(inspectArm(arm, opts[arm]), source, 'Three source changed during build');
        }
        server = http.createServer((req, res) => {
            const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
            if (name !== 'index.html' && name !== 'fixture.mjs' && !Object.hasOwn(bundles, name))
                return res.writeHead(404).end();
            res.setHeader('Content-Type', name.endsWith('.mjs') ? 'text/javascript' : 'text/html');
            fs.createReadStream(path.join(site, name)).pipe(res);
        });
        await new Promise((ok, fail) => {
            server.once('error', fail);
            server.listen(0, '127.0.0.1', ok);
        });
        browser = await webkit.launch({ ...launchOptions('webkit'), headless: true, env: loopbackBrowserEnv() });
        result.browserVersion = browser.version();
        for (const renderer of Object.keys(backends)) {
            for (const arm of Object.keys(arms)) {
                const page = await browser.newPage({ viewport: { width: 640, height: 320 }, deviceScaleFactor: 1 });
                const errors = [];
                page.on('pageerror', (error) => errors.push(error.message));
                page.on('console', (message) => {
                    if (message.type() === 'error') errors.push(message.text());
                });
                try {
                    const origin = 'http://127.0.0.1:' + server.address().port;
                    const bundle = arm + (renderer === 'classic' ? '-classic' : '') + '.mjs';
                    const [served] = await Promise.all([
                        page.waitForResponse(origin + '/' + bundle),
                        page.goto(origin + '/?arm=' + arm + '&renderer=' + renderer),
                    ]);
                    assert.ok(served.ok(), 'Three bundle HTTP request failed');
                    assert.equal(sha(await served.body()), bundles[bundle], 'HTTP bundle bytes differ');
                    await page.waitForFunction(() => Boolean(window.__report), {}, { timeout: 25000 });
                    const row = await page.evaluate(() => window.__report);
                    assert.equal(row.arm, arm);
                    assert.equal(row.target, renderer);
                    const raw = path.join(out, renderer + '-' + arm + '.json');
                    const screenshot = path.join(out, renderer + '-' + arm + '.png');
                    row.errors = errors;
                    row.commit = sources[arm].commit;
                    row.bundleSha256 = bundles[bundle];
                    fs.writeFileSync(raw, JSON.stringify(row, null, 2) + '\n');
                    await page.locator('canvas').screenshot({ path: screenshot, timeout: 20000 });
                    validate(row);
                    result.runs.push({
                        renderer,
                        arm,
                        commit: row.commit,
                        bundleSha256: row.bundleSha256,
                        rawSha256: digest(raw),
                        screenshotSha256: digest(screenshot),
                        nativeWebGPUAdapter: row.webgpuAdapter,
                        nativeTimestampQuery: row.webgpuTimestampQuery,
                        backend: row.backend,
                        rendererString: row.unmaskedRenderer,
                    });
                } catch (error) {
                    throw Error(
                        renderer + '/' + arm + ': ' + error.message + (errors.length ? ' | ' + errors.join(' | ') : ''),
                    );
                } finally {
                    await page.close();
                }
            }
        }
        result.status = 'PASS_WEBGL2_CONTROLS';
    } catch (error) {
        result.error = error.message;
        throw error;
    } finally {
        try {
            if (browser) await browser.close();
        } finally {
            try {
                if (server?.listening)
                    await new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
            } finally {
                fs.writeFileSync(path.join(out, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
            }
        }
    }
}
main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
});
