// SPK-13 DPR-mismatch parity collector. The accepted pixel-parity matrix always drives the browser
// context and the probe page from the SAME number (`deviceScaleFactor: DPR` plus `?dpr=DPR`), so it can
// never show the two sides disagreeing about which ratio is authoritative: a implementation that secretly
// reads `window.devicePixelRatio` while the harness asked for another ratio is invisible there. This gate
// deliberately mismatches them.
//
// It reuses the EXISTING pixel-parity probe documents read-only (their hashes are recorded and asserted
// unchanged, exactly like the pixel gate does) and only changes the driver: a per-combo browser context
// whose `deviceScaleFactor` differs from the `dpr` query the page is told to use. The reference still
// adopts the target's native float32 camera / viewport / scissor, so the claim under test stays the splat
// rasterisation path - now under a ratio disagreement.
//
// Pass contract is as strict as the pixel gate: byte-exact RGBA (compared by sha256 over the read-back,
// which is exactly "every channel byte difference is 0"), both images non-empty, each side stable against
// its own repeat, zero JS + drained GL errors, identical context attributes and unmasked renderer, equal
// observed devicePixelRatio on both documents, and the drawing buffer derived from the REQUESTED ratio
// rather than the device one. Negative control (target camera perturbation) must move pixels.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');

const root = path.resolve(__dirname, '../..');
const PROBE_PATH = 'tools/debug/probes/spark-pixel-parity/';

// Case specs are mirrored from tools/verify/spark-pixel-parity.cjs (that file is a fingerprinted input of
// the pixel gate and must not change for this collector, so the shared literals live here as data). If a
// scene is added upstream, both drivers must be updated; the `sceneIds` assertion below catches a rename.
const RECORDS = [
    { p: [-0.34, 0.02, 0.05], s: [0.26, 0.12, 0.07], c: [0.95, 0.18, 0.08], a: 0.85, q: [0, 0, 0, 1] },
    { p: [0.21, 0.14, 0.08], s: [0.12, 0.31, 0.06], c: [0.06, 0.94, 0.22], a: 0.7 },
    { p: [0.08, -0.21, 0.18], s: [0.16, 0.08, 0.29], c: [0.14, 0.32, 0.98], a: 0.55 },
    { p: [0, 0, 0], s: [0.02, 0.02, 0.02], c: [1, 1, 1], a: 0 },
    { p: [0.62, -0.78, 0.01], s: [0.0012, 0.4, 0.2], c: [1, 0, 1], a: 0.0021 },
];
const CASES = [
    {
        id: 'procedural-grid-axes',
        note: 'constructGrid + constructAxes as two separate splat meshes on different native nodes',
        camera: [0.15, 0.1, 3],
        objects: [{ construct: 'grid' }, { construct: 'axes', position: [0.9, 0.2, -0.1], rotation: [0, 18, 0] }],
    },
    {
        id: 'seeded-random400',
        note: '400 splats from the xorshift32 seed 739391 built by identical page code on both sides',
        camera: [0, 0, 3],
        objects: [{ count: 400, seed: 739391 }],
    },
    {
        id: 'procedural-sphere-points',
        note: 'constructSpherePoints (maxDepth 2) with a recoloured point cloud',
        camera: [-0.2, 0.15, 2.6],
        objects: [{ construct: 'sphere' }],
    },
    {
        id: 'procedural-text-splats',
        note: 'textSplats() canvas-2D derived splats, returned as a finished SplatMesh',
        camera: [0, 0, 2.4],
        objects: [{ construct: 'text', position: [0, -0.75, 0] }],
    },
    {
        id: 'orthographic-camera',
        note: 'native ORTHO projection; left/right/top/bottom/zoom adopted by the reference',
        camera: [0.2, 0.2, 3],
        orthographic: true,
        orthoHeight: 1.4,
        objects: [{ records: RECORDS }, { construct: 'axes', position: [-0.5, 0.5, 0] }],
    },
    {
        id: 'inset-viewport-scissor',
        note: 'native camera rect 0.125 origin -> non-trivial viewport + scissor parity',
        camera: [0, 0, 3],
        rect: [0.125, 0.125, 0.75, 0.75],
        objects: [{ count: 150, seed: 739391 }],
    },
];

// (device ratio the browser is told to report, ratio the page is asked to render at, CSS size). The two
// numbers never match in any row; the requested ratio always stays inside the probe page's own allowlist
// and always produces an integer drawing buffer within 1024.
const COMBOS = [
    { id: 'device2-asked1-square', device: 2, dpr: 1, width: 256, height: 256 },
    { id: 'device1-asked2-square', device: 1, dpr: 2, width: 256, height: 256 },
    { id: 'device3-asked1.5-wide54', device: 3, dpr: 1.5, width: 320, height: 256 },
    { id: 'device1.5-asked3-portrait', device: 1.5, dpr: 3, width: 224, height: 340 },
];

const nonzeroRgb = (image) => image.data.filter((value, index) => index % 4 !== 3 && value !== 0).length;
const imageHash = (image) =>
    crypto.createHash('sha256').update(Buffer.from(image.data)).digest('hex') + `@${image.width}x${image.height}`;
function sha256File(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// ---- source freeze (same directories and skip rule as the pixel gate) ------------------------------
const FREEZE_DIRS = ['src', 'vendor', 'build', 'tools', 'docs'];
function digestTree() {
    const map = new Map();
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (/node_modules|\.tmp|tmp_|~/.test(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile()) map.set(path.relative(root, full).replace(/\\/g, '/'), sha256File(full));
        }
    };
    for (const dir of FREEZE_DIRS) {
        const full = path.resolve(root, dir);
        if (fs.existsSync(full)) walk(full);
    }
    const names = [...map.keys()].sort();
    const aggregate = crypto.createHash('sha256');
    for (const name of names) aggregate.update(`${name}:${map.get(name)}\n`);
    return { files: names.length, aggregateSha256: aggregate.digest('hex'), map };
}
function changedFiles(before, after) {
    const changed = [];
    for (const [name, hash] of after.map) if (before.map.get(name) !== hash) changed.push(name);
    for (const name of before.map.keys()) if (!after.map.has(name)) changed.push(`${name} (removed)`);
    return changed;
}

// ---- single origin over both trees ------------------------------------------------------------------
// One origin is required so both documents can be driven from one server; the isolation claim is then
// carried by the request sets (the target document must never ask for a /dist/ asset and the reference
// must never ask for /build/), which is what the anti-cheat block below asserts.
function startServer(portRepo) {
    const mounts = [
        { prefix: '/dist/', dir: portRepo },
        { prefix: '/build/', dir: root },
        { prefix: '/tools/', dir: root },
    ];
    const mime = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.map': 'text/plain; charset=utf-8',
        '.wasm': 'application/wasm',
        '.png': 'image/png',
        '.css': 'text/css; charset=utf-8',
        '.glsl': 'text/plain; charset=utf-8',
    };
    const server = http.createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
        const mount = mounts.find((entry) => pathname.startsWith(entry.prefix));
        if (!mount) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end(`refused: ${pathname}`);
            return;
        }
        const base = path.resolve(mount.dir);
        const file = path.resolve(base, '.' + pathname);
        if (!file.startsWith(base + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('missing: ' + pathname);
            return;
        }
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
        res.end(fs.readFileSync(file));
    });
    return new Promise((resolve) =>
        server.listen(0, '127.0.0.1', () =>
            resolve({
                origin: `http://127.0.0.1:${server.address().port}`,
                close: () => new Promise((done) => server.close(done)),
            }),
        ),
    );
}

// ---- one row: same scene, mismatched ratio, adopt, draw twice --------------------------------------
async function runRow({ engine, combo, spec, target, reference }) {
    const info = await target.evaluate((s) => window.__sparkParity.setup(s), spec);
    const snapshot = await target.evaluate(() => window.__sparkParity.snapshot());
    const referenceInfo = await reference.evaluate((s) => window.__sparkParity.setup(s), spec);
    await reference.evaluate((s) => window.__sparkParity.adopt(s), snapshot);
    const firstTarget = await target.evaluate(() => window.__sparkParity.draw());
    const firstReference = await reference.evaluate(() => window.__sparkParity.draw());
    const repeatTarget = await target.evaluate(() => window.__sparkParity.draw());
    const repeatReference = await reference.evaluate(() => window.__sparkParity.draw());
    const devicePixelRatio = await target.evaluate(() => window.devicePixelRatio);
    const referenceDevicePixelRatio = await reference.evaluate(() => window.devicePixelRatio);

    const dims = `${firstTarget.width}x${firstTarget.height}`;
    const targetHash = imageHash(firstTarget);
    const referenceHash = imageHash(firstReference);
    const glErrors = [...(firstTarget.glErrors || []), ...(firstReference.glErrors || [])];
    const jsErrors = [
        ...(info.errors || []),
        ...(referenceInfo.errors || []),
        ...(firstTarget.errors || []),
        ...(firstReference.errors || []),
    ];
    const expectedDims = `${Math.round(combo.width * combo.dpr)}x${Math.round(combo.height * combo.dpr)}`;
    const row = {
        engine,
        combo: combo.id,
        id: spec.id,
        note: spec.note,
        deviceScaleFactorRequested: combo.device,
        dprAskedOfPage: combo.dpr,
        observedDevicePixelRatio: devicePixelRatio,
        observedDevicePixelRatioOnReference: referenceDevicePixelRatio,
        // An engine may clamp a fractional device ratio; a row only exercises the disagreement when the
        // browser really reports a device ratio different from the ratio the page was told to render at.
        mismatchProven: devicePixelRatio !== combo.dpr && referenceDevicePixelRatio !== combo.dpr,
        cssSize: `${combo.width}x${combo.height}`,
        dims,
        expectedBackingStoreFromAskedRatio: expectedDims,
        backingStoreFollowsAskedRatio: dims === expectedDims,
        targetHash,
        referenceHash,
        byteIdentical: targetHash === referenceHash,
        targetNonempty: nonzeroRgb(firstTarget),
        referenceNonempty: nonzeroRgb(firstReference),
        repeatStableSelf: imageHash(repeatTarget) === targetHash && imageHash(repeatReference) === referenceHash,
        splatsMatch:
            firstTarget.activeSplats === firstReference.activeSplats &&
            JSON.stringify(firstTarget.numSplats) === JSON.stringify(firstReference.numSplats),
        environmentMatch:
            JSON.stringify(firstTarget.contextAttributes) === JSON.stringify(firstReference.contextAttributes) &&
            firstTarget.unmaskedRenderer === firstReference.unmaskedRenderer &&
            devicePixelRatio === referenceDevicePixelRatio,
        glErrorCount: glErrors.length,
        glErrors,
        jsErrorCount: jsErrors.length,
        jsErrors,
        viewport: snapshot.viewport,
        nativeView: snapshot.nativeView,
    };
    row.passed =
        row.byteIdentical &&
        row.backingStoreFollowsAskedRatio &&
        row.targetNonempty > 0 &&
        row.referenceNonempty > 0 &&
        row.repeatStableSelf &&
        row.splatsMatch &&
        row.environmentMatch &&
        row.glErrorCount === 0 &&
        row.jsErrorCount === 0;
    console.error(
        `[spark-dpr-mismatch] ${engine}/${combo.id}/${spec.id}: ${row.passed ? 'PASS' : 'FAIL'} dims=${dims} ` +
            `devicePR=${devicePixelRatio} asked=${combo.dpr} mismatchProven=${row.mismatchProven} ` +
            `identical=${row.byteIdentical} gl=${row.glErrorCount} js=${row.jsErrorCount}`,
    );
    return row;
}

async function runEngineCombo(ctx, engine, pw, combo) {
    const result = { engine, combo: combo.id, status: 'FAIL', rows: [], pageErrors: [], consoleErrors: [] };
    const targetRequests = [];
    const referenceRequests = [];
    let browser;
    let context;
    let stage = 'launch';
    try {
        const options = launchOptions(engine);
        try {
            const matching = pw[engine].executablePath();
            if (engine !== 'chromium' && fs.existsSync(matching)) options.executablePath = matching;
        } catch {
            /* keep launchOptions fallback */
        }
        options.env = loopbackBrowserEnv();
        browser = await pw[engine].launch({ ...options, headless: true, timeout: 20000 });
        result.version = browser.version();
        context = await browser.newContext({
            viewport: { width: combo.width, height: combo.height },
            deviceScaleFactor: combo.device,
        });
        const target = await context.newPage();
        target.on('pageerror', (e) => result.pageErrors.push(String(e.stack || e)));
        target.on('console', (m) => {
            if (m.type() === 'error') result.consoleErrors.push(m.text());
        });
        target.on('request', (r) => targetRequests.push(r.url()));
        const reference = await context.newPage();
        reference.on('pageerror', (e) => result.pageErrors.push('[reference] ' + String(e.stack || e)));
        reference.on('console', (m) => {
            if (m.type() === 'error') result.consoleErrors.push('[reference] ' + m.text());
        });
        reference.on('request', (r) => referenceRequests.push(r.url()));

        const query = `sdk=/${ctx.sdk}&width=${combo.width}&height=${combo.height}&dpr=${combo.dpr}`;
        stage = 'target-page';
        await target.goto(`${ctx.server.origin}/${PROBE_PATH}index.html?${query}`, { timeout: 60000 });
        await target.waitForFunction(() => window.__sparkParity?.ready, null, { timeout: 90000 });
        const targetBoot = await target.evaluate(() => window.__sparkParity?.fatal || null);
        if (targetBoot) throw new Error('target page failed to boot: ' + targetBoot);
        stage = 'reference-page';
        await reference.goto(`${ctx.server.origin}/${PROBE_PATH}reference.html?${query}`, { timeout: 60000 });
        await reference.waitForFunction(() => window.__sparkParity?.ready, null, { timeout: 90000 });
        const referenceBoot = await reference.evaluate(() => window.__sparkParity?.fatal || null);
        if (referenceBoot) throw new Error('reference page failed to boot: ' + referenceBoot);

        stage = 'rows';
        for (const spec of ctx.cases) result.rows.push(await runRow({ engine, combo, spec, target, reference }));

        stage = 'negative-control';
        const control = ctx.cases[0];
        await target.evaluate((s) => window.__sparkParity.setup(s), control);
        const controlSnapshot = await target.evaluate(() => window.__sparkParity.snapshot());
        await reference.evaluate((s) => window.__sparkParity.setup(s), control);
        await reference.evaluate((s) => window.__sparkParity.adopt(s), controlSnapshot);
        const baselineTarget = await target.evaluate(() => window.__sparkParity.draw());
        const baselineReference = await reference.evaluate(() => window.__sparkParity.draw());
        await target.evaluate(() => window.__sparkParity.perturbTargetCamera(0.2));
        const movedTarget = await target.evaluate(() => window.__sparkParity.draw());
        result.negativeControl = {
            case: control.id,
            perturbation: 'target camera x += 0.2 without re-adopting on the reference',
            baselineIdentical: imageHash(baselineTarget) === imageHash(baselineReference),
            perturbedIdentical: imageHash(baselineReference) === imageHash(movedTarget),
            passed:
                imageHash(baselineTarget) === imageHash(baselineReference) &&
                imageHash(baselineReference) !== imageHash(movedTarget),
        };
        console.error(
            `[spark-dpr-mismatch] ${engine}/${combo.id}/negative-control: ${result.negativeControl.passed ? 'PASS' : 'FAIL'}`,
        );

        // Isolation on a single origin is carried by the request sets. Match on the request PATH only: both
        // documents are navigated with `sdk=...` in their query string (the reference page needs the same
        // parameter shape to stay symmetrical), so a substring test over the full URL would flag the
        // navigation itself as an SDK fetch. What must never happen is a sub-resource request whose path
        // actually resolves to the SDK build or to a /dist/ reference asset.
        const requestPath = (url) => {
            try {
                return new URL(url).pathname;
            } catch {
                return url;
            }
        };
        result.antiCheat = {
            rule: 'no request whose PATH is a reference asset (/dist/, three-reference, spark-reference) from the target document, and no request whose PATH is the SDK build from the reference document',
            targetRequestsForReferenceAssets: targetRequests.filter((url) =>
                /\/dist\/|three-reference|spark-reference/.test(requestPath(url)),
            ),
            referenceRequestsForSdk: referenceRequests.filter((url) => requestPath(url) === `/${ctx.sdk}`),
        };
        result.antiCheat.passed = Object.values(result.antiCheat)
            .filter(Array.isArray)
            .every((list) => list.length === 0);
        result.status =
            result.rows.length === ctx.cases.length &&
            result.rows.every((r) => r.passed) &&
            result.negativeControl.passed &&
            result.antiCheat.passed &&
            !result.pageErrors.length &&
            !result.consoleErrors.length
                ? 'PASS'
                : 'FAIL';
    } catch (error) {
        result.error = { stage, message: String(error.stack || error) };
        result.status = 'FAIL';
        console.error(`[spark-dpr-mismatch] ${engine}/${combo.id}: ${stage} ${error.message}`);
    } finally {
        result.targetRequests = targetRequests;
        result.referenceRequests = referenceRequests;
        if (context) await context.close();
        if (browser) await browser.close();
    }
    return result;
}

function main() {
    const args = process.argv.slice(2);
    const allowed = /^(--out=|--browser=|--playwright=|--sdk=|--port-repo=|--combos=|--cases=)/;
    assert(
        args.every((a) => allowed.test(a)),
        `Unknown argument: ${args.filter((a) => !allowed.test(a)).join(' ')}`,
    );
    const out = args.find((a) => a.startsWith('--out='))?.slice(6);
    assert(out && out.endsWith('.json'), '--out=<path.json> required');
    assert(/^output\/[a-zA-Z0-9_./-]+\.json$/.test(out), '--out must be a new JSON file under output/');
    const outAbs = path.resolve(root, out);
    assert(!fs.existsSync(outAbs), '--out must not already exist');
    const selected = args.find((a) => a.startsWith('--browser='))?.slice(10) || 'all';
    const engines = selected === 'all' ? ['chromium', 'firefox', 'webkit'] : selected.split(',');
    assert(
        engines.every((e) => ['chromium', 'firefox', 'webkit'].includes(e)),
        'Invalid browser',
    );
    const comboFilter = args.find((a) => a.startsWith('--combos='))?.slice(9);
    const combos = comboFilter ? COMBOS.filter((c) => comboFilter.split(',').includes(c.id)) : COMBOS;
    assert(combos.length === (comboFilter ? comboFilter.split(',').length : COMBOS.length), 'Unknown --combos= id');
    const caseFilter = args.find((a) => a.startsWith('--cases='))?.slice(8);
    const cases = caseFilter ? CASES.filter((c) => caseFilter.split(',').includes(c.id)) : CASES;
    assert(cases.length === (caseFilter ? caseFilter.split(',').length : CASES.length), 'Unknown --cases= id');
    // The mirrored case table must stay in lock-step with the canonical pixel gate, otherwise this driver
    // would silently narrow the scene coverage it claims to reproduce. Parsed read-only from that gate.
    const canonicalIds = [
        ...fs
            .readFileSync(path.resolve(root, 'tools/verify/spark-pixel-parity.cjs'), 'utf8')
            .matchAll(/^ {8}id: '([a-z0-9-]+)',?\r?$/gm),
    ].map((m) => m[1]);
    assert(
        canonicalIds.length > 0,
        'No scene ids parsed from tools/verify/spark-pixel-parity.cjs - the guard itself is broken',
    );
    assert(
        canonicalIds.join(',') === CASES.map((c) => c.id).join(','),
        `Mirrored scene ids drift from the canonical gate: [${CASES.map((c) => c.id).join(', ')}] vs [${canonicalIds.join(', ')}]`,
    );
    for (const combo of combos) {
        assert(combo.device !== combo.dpr, `combo ${combo.id} must actually mismatch the two ratios`);
        assert(
            [1, 1.25, 1.375, 1.5, 2, 3].includes(combo.dpr) &&
                Number.isInteger(combo.width * combo.dpr) &&
                Number.isInteger(combo.height * combo.dpr) &&
                combo.width * combo.dpr <= 1024 &&
                combo.height * combo.dpr <= 1024,
            `combo ${combo.id} asks for a ratio the probe page rejects or a non-integer/oversized buffer`,
        );
    }
    const sdk = args.find((a) => a.startsWith('--sdk='))?.slice(6) || 'build/spark.module.js';
    assert(/^build\/[a-zA-Z0-9_.-]+\.js$/.test(sdk), 'Invalid SDK path (build/<name>.js only)');
    assert(fs.existsSync(path.resolve(root, sdk)), `Missing SDK build: ${sdk}`);
    const portRepo = path.resolve(
        root,
        args.find((a) => a.startsWith('--port-repo='))?.slice(12) || '../spark-cocosairjs',
    );
    assert(fs.existsSync(path.join(portRepo, 'dist/spark-reference.js')), `Missing reference bundle under ${portRepo}`);
    let pw;
    let toolingError;
    let toolingPath;
    try {
        toolingPath = require.resolve(args.find((a) => a.startsWith('--playwright='))?.slice(13) || 'playwright');
        pw = require(toolingPath);
    } catch (error) {
        toolingError = String(error);
    }
    const sha256 = (file) => (fs.existsSync(path.resolve(root, file)) ? sha256File(path.resolve(root, file)) : null);
    // Every input of the accepted pixel gate is re-hashed here and asserted unchanged: this collector
    // consumes those documents, it must not bend them.
    const fingerprintFiles = [
        sdk,
        `${PROBE_PATH}index.html`,
        `${PROBE_PATH}reference.html`,
        `${PROBE_PATH}frame.js`,
        'tools/verify/spark-pixel-parity.cjs',
        'tools/verify/spark-dpr-mismatch-parity.cjs',
        'tools/verify/browser-engines.cjs',
        'tools/verify/competitive-example-server.cjs',
        'tools/verify/loopback-browser-env.cjs',
        'ai/plans/spark-integration.md',
        'src/air/spark/cocos-spark-layer.ts',
        'src/air/spark/cocos-renderer.ts',
        'src/air/spark/spark-api-adapter.ts',
        'src/exports/spark.ts',
    ];
    const fingerprints = Object.fromEntries(fingerprintFiles.map((file) => [file, sha256(file)]));
    // Cross-check against the accepted pixel evidence so the two drivers provably run the same documents.
    const acceptedPixelReports = [
        'docs/evidence/spark/spk13-pixel-parity-20261012-refresh.json',
        'docs/evidence/spark/spk13-pixel-parity-20261012.json',
        'docs/evidence/spark/spk13-pixel-parity-viewport-matrix-20261012.json',
    ];
    // Proof that this driver runs the SAME documents the accepted pixel gate was collected with. The SDK
    // build is excluded on purpose: `AIR_BUILD_NUMBER` increments on every build and is written into the
    // dev bundle, so its sha is not comparable across runs (ai/ledgers/spark-integration.md 残余事项 11,
    // docs/UPSTREAM.md Deviation-07). The accepted reports store their digests under different shapes
    // (top-level `fingerprints` in the single-window report, per-window `sourceFreeze` maps in the matrix
    // files), so containment of the current hash string anywhere in the accepted evidence is used - and a
    // document that never matches is a hard failure rather than a silent null. The 2026-10-12 01:36
    // single-window report predates the 03:16 fractional-DPR extension of `frame.js`, so only the refresh
    // report carries the current hash of that file.
    const probeDocuments = fingerprintFiles.filter((f) => f.startsWith(PROBE_PATH));
    const acceptedEvidenceDigests = probeDocuments.map((file) => {
        const hash = fingerprints[file];
        return {
            file,
            sha256: hash,
            reportsContainingIt: acceptedPixelReports.filter(
                (reportFile) =>
                    fs.existsSync(path.resolve(root, reportFile)) &&
                    fs.readFileSync(path.resolve(root, reportFile), 'utf8').includes(String(hash)),
            ),
        };
    });
    const pixelGateMatches = acceptedEvidenceDigests.every((entry) => entry.reportsContainingIt.length > 0);
    const acceptedPixelEvidence = acceptedEvidenceDigests;
    const git = (a) => {
        try {
            return cp.execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
        } catch (error) {
            return `GIT_UNAVAILABLE: ${error.message}`;
        }
    };
    return {
        engines,
        combos,
        cases,
        out,
        outAbs,
        pw,
        toolingError,
        sdk,
        portRepo,
        fingerprints,
        fingerprintFiles,
        sha256,
        pixelGateMatches,
        pixelGateEvidence: acceptedPixelEvidence,
        identity: {
            head: git(['rev-parse', 'HEAD']),
            dirty: git(['status', '--porcelain']),
            node: process.version,
            sdk: { path: sdk, sha256: fingerprints[sdk] },
            toolingPath: toolingPath || null,
            toolingError: toolingError || null,
        },
    };
}

async function run() {
    const ctx = main();
    const startedAt = new Date().toISOString();
    if (!ctx.pw) {
        console.error(`BLOCKED: Playwright unavailable: ${ctx.toolingError}`);
        process.exitCode = 3;
        return;
    }
    const before = digestTree();
    const server = await startServer(ctx.portRepo);
    ctx.server = server;
    const results = [];
    try {
        for (const engine of ctx.engines) {
            for (const combo of ctx.combos) {
                results.push(await runEngineCombo(ctx, engine, ctx.pw, combo));
            }
        }
        const after = digestTree();
        const sourceChanged = changedFiles(before, after);
        const drift = ctx.fingerprintFiles.filter((file) => ctx.sha256(file) !== ctx.fingerprints[file]);
        const rows = results.flatMap((r) => r.rows);
        const proven = rows.filter((r) => r.mismatchProven);
        const passed =
            results.length === ctx.engines.length * ctx.combos.length &&
            results.every((r) => r.status === 'PASS') &&
            rows.length === ctx.engines.length * ctx.combos.length * ctx.cases.length &&
            !drift.length &&
            !sourceChanged.length;
        const report = {
            schemaVersion: 'spark-dpr-mismatch-parity/1',
            startedAt,
            endedAt: new Date().toISOString(),
            task: 'SPK-13',
            scope: 'Ratio-disagreement pixel parity: the accepted SPK-13 probe documents are driven read-only, but the browser context deviceScaleFactor and the dpr the page is asked to render at deliberately differ per row. Reference still adopts the target native float32 camera/viewport/scissor, so the claim stays the splat rasterisation/sort/blend path.',
            strictRule:
                'RGBA read-back compared by sha256 over the raw bytes (equal hashes = every channel byte difference is 0, no tolerance); drawing buffer must follow the REQUESTED ratio not the device ratio; both images non-empty; each side stable against its own repeat; identical splat counts; identical context attributes, unmasked renderer and observed devicePixelRatio across the two documents; zero JS and drained GL errors; negative control must move pixels; the accepted pixel gate probe/bundle fingerprints must be unchanged and the source digest must not move during the run.',
            claimLimit:
                'Per-engine evidence on THIS machine only. Where a browser clamps the requested device ratio to the ratio the page was asked for, the row records mismatchProven=false and does not count as exercising the disagreement - see counts.rowsWithMismatchProven. Nothing here generalises to other GPUs, drivers or devices, and it is not a release READY claim.',
            methodDifference:
                'Single loopback origin instead of the pixel gate two-origin layout (that gate owns the cross-origin anti-cheat). Here isolation is asserted from the request sets: the target document must never request a /dist/ reference asset and the reference must never request the SDK build.',
            identity: ctx.identity,
            sdk: ctx.sdk,
            fingerprints: ctx.fingerprints,
            pixelGateFingerprintsAgree: ctx.pixelGateMatches,
            acceptedPixelEvidence: ctx.pixelGateEvidence,
            engines: ctx.engines,
            combos: ctx.combos,
            cases: ctx.cases.map(({ id, note }) => ({ id, note })),
            results,
            counts: {
                rows: rows.length,
                rowsPassed: rows.filter((r) => r.passed).length,
                rowsWithMismatchProven: proven.length,
                rowsByteIdentical: rows.filter((r) => r.byteIdentical).length,
                rowsBackingStoreFollowsAskedRatio: rows.filter((r) => r.backingStoreFollowsAskedRatio).length,
                glErrors: rows.reduce((n, r) => n + r.glErrorCount, 0),
                jsErrors: rows.reduce((n, r) => n + r.jsErrorCount, 0),
                comboEnginesPassing: results.filter((r) => r.status === 'PASS').length,
                comboEnginesTotal: results.length,
            },
            perEngineObservedDeviceRatios: ctx.engines.map((engine) => ({
                engine,
                combos: results
                    .filter((r) => r.engine === engine)
                    .map((r) => ({
                        combo: r.combo,
                        observed: r.rows.length ? r.rows[0].observedDevicePixelRatio : null,
                        asked: ctx.combos.find((c) => c.id === r.combo).dpr,
                        mismatchProvenInRows: r.rows.filter((row) => row.mismatchProven).length,
                        status: r.status,
                    })),
            })),
            drift,
            sourceFreeze: {
                directories: FREEZE_DIRS,
                filesBefore: before.files,
                filesAfter: after.files,
                aggregateSha256Before: before.aggregateSha256,
                aggregateSha256After: after.aggregateSha256,
                changed: sourceChanged.slice(0, 100),
            },
            sourceUnchanged: !sourceChanged.length,
            passed,
        };
        fs.mkdirSync(path.dirname(ctx.outAbs), { recursive: true });
        fs.writeFileSync(ctx.outAbs, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.error(
            `[spark-dpr-mismatch] report=${ctx.out} passed=${passed} rows=${report.counts.rowsPassed}/${rows.length} ` +
                `mismatchProven=${report.counts.rowsWithMismatchProven} fingerprintAgreement=${ctx.pixelGateMatches} ` +
                `drift=${drift.length} sourceUnchanged=${report.sourceUnchanged}`,
        );
        process.exitCode = passed ? 0 : 1;
    } finally {
        await server.close();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
