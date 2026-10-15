// SPK-13 CPU-parity collector: closes the last 口径替换 in `tools/verify/spark-data-parity.cjs`. The port
// repo's `tests/data-parity.mjs` compares its own `dist/spark-cocosairjs.js` against its own
// `dist/spark-reference.js` (package vs package). This gate instead compares the artifact THIS repo ships
// — the Spark body inside `build/spark.module.js`, reachable as `cc.sparkRuntime` — against that
// same frozen upstream reference package, inside a real browser, for the CPU codec families:
// the full 65536-pattern `fromHalf` sweep, the `toHalf` boundary edges, and 256
// `setPackedSplat` / `unpackSplat` / `utils.encodeExtSplat` vectors, plus the export-name surface and the
// dyno/utils/defines/generators/modifiers namespace key sets.
//
// Nothing is rendered, so no GPU claim is made here; the pixel contract stays with
// `tools/verify/spark-pixel-parity.cjs`. The export-surface rule asserts set equality against the
// registered §SPK-10 narrowing: every reference-only name must be one of the 27 SparkXr/hands exports,
// and the target must leak nothing the reference lacks.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const http = require('node:http');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');

const root = path.resolve(__dirname, '../..');
const PROBE_PATH = 'tools/debug/probes/spark-cpu-parity/';

// The registered §SPK-10 surface narrowing: the exports of `vendor/spark/src/SparkXr.ts` and
// `vendor/spark/src/hands.ts`, which `tools/build/spark-runtime-tree.cjs` deletes from the generated
// entry. Documented in docs/UPSTREAM.md and ai/ledgers/spark-integration.md.
const XR_EXCLUDED_EXPORTS = [
    'DEFAULT_CONTROLLER_FAST_MULTIPLIER',
    'DEFAULT_CONTROLLER_GETFAST',
    'DEFAULT_CONTROLLER_GETMOVE',
    'DEFAULT_CONTROLLER_GETROTATE',
    'DEFAULT_CONTROLLER_GETSLOW',
    'DEFAULT_CONTROLLER_MOVE_HEADING',
    'DEFAULT_CONTROLLER_MOVE_SPEED',
    'DEFAULT_CONTROLLER_ROLL_SPEED',
    'DEFAULT_CONTROLLER_ROTATE_SPEED',
    'DEFAULT_CONTROLLER_SLOW_MULTIPLIER',
    'FINGER_TIPS',
    'HANDS',
    'Hand',
    'HandMovement',
    'JOINT_IDS',
    'JOINT_INDEX',
    'JOINT_RADIUS',
    'JOINT_SEGMENTS',
    'JOINT_SEGMENT_STEPS',
    'JOINT_TIPS',
    'JointEnum',
    'JointSplats',
    'NUM_JOINTS',
    'SparkXr',
    'XrHand',
    'XrHands',
    'lerpHandsSnapshots',
].sort();

const NAMESPACES = ['dyno', 'utils', 'defines', 'generators', 'modifiers'];

// ---- source freeze digest (same directory set and skip rule as the pixel-parity collector) ---------
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
    let bytes = 0;
    for (const name of names) {
        aggregate.update(`${name}:${map.get(name)}\n`);
        bytes += fs.statSync(path.resolve(root, name)).size;
    }
    return { files: names.length, bytes, aggregateSha256: aggregate.digest('hex'), map };
}
function changedFiles(before, after) {
    const changed = [];
    for (const [name, hash] of after.map) if (before.map.get(name) !== hash) changed.push(name);
    for (const name of before.map.keys()) if (!after.map.has(name)) changed.push(`${name} (removed)`);
    return changed;
}

function sha256File(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// ---- single-origin static server over two read-only trees -------------------------------------------
// One origin is required, not a convenience: `dist/spark-reference.js` comes from the port repo and the
// reference server adds no CORS headers, so a two-origin layout could not import both modules in one
// document. Both trees are served read-only; nothing is copied into this repo.
function startServer(portRepo) {
    const probeDir = path.resolve(root, PROBE_PATH);
    const mounts = [
        { prefix: '/dist/', dir: portRepo },
        { prefix: '/build/', dir: root },
        { prefix: '/tools/', dir: root },
    ];
    const mime = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.mjs': 'text/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.map': 'text/plain; charset=utf-8',
        '.wasm': 'application/wasm',
        '.png': 'image/png',
        '.css': 'text/css; charset=utf-8',
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
        // The prefix stays part of the path: /dist/ is relative to the port repo, /build/ and /tools/ to
        // this repo, and both are appended in full to their mount root.
        const file = path.resolve(base, '.' + pathname);
        if (!file.startsWith(base + path.sep)) {
            res.writeHead(403, { 'Content-Type': 'text/plain' });
            res.end('outside mount: ' + pathname);
            return;
        }
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
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

// ---- judgement ---------------------------------------------------------------------------------------
function judge(engine, measurement) {
    const checks = [];
    const add = (name, passed, detail) => checks.push({ name, passed: passed === true, detail: detail ?? null });

    const referenceNames = measurement.names.reference;
    const targetNames = measurement.names.target;
    const targetSet = new Set(targetNames);
    const referenceSet = new Set(referenceNames);
    const referenceOnly = referenceNames.filter((name) => !targetSet.has(name));
    const targetOnly = targetNames.filter((name) => !referenceSet.has(name));
    add(
        'surface/reference-only-is-exactly-the-registered-xr-narrowing',
        JSON.stringify(referenceOnly) === JSON.stringify(XR_EXCLUDED_EXPORTS),
        { referenceOnly, expected: XR_EXCLUDED_EXPORTS },
    );
    add('surface/target-only-is-empty', targetOnly.length === 0, { targetOnly });
    add(
        'surface/target-exports-everything-else',
        targetNames.every((name) => referenceSet.has(name)) &&
            targetNames.length + referenceOnly.length === referenceNames.length,
        { reference: referenceNames.length, target: targetNames.length },
    );

    for (const name of NAMESPACES) {
        const entry = measurement.namespaceKeys[name];
        add(`namespace/${name}`, JSON.stringify(entry.reference) === JSON.stringify(entry.target), {
            reference: entry.reference.length,
            target: entry.target.length,
            missingInTarget: entry.reference.filter((key) => !entry.target.includes(key)),
            extraInTarget: entry.target.filter((key) => !entry.reference.includes(key)),
        });
    }
    for (const [name, entry] of Object.entries(measurement.typeofSurface)) {
        add(`typeof/${name}`, entry.reference === 'function' && entry.target === 'function', entry);
    }

    const fromHalf = measurement.checks.fromHalf;
    add('fromHalf/all-65536-patterns-bit-identical', fromHalf.mismatches === 0 && fromHalf.compared === 65536, {
        compared: fromHalf.compared,
        mismatches: fromHalf.mismatches,
        firstMismatch: fromHalf.firstMismatch,
    });
    const toHalf = measurement.checks.toHalf;
    add('toHalf/boundary-edges-identical', toHalf.mismatches === 0 && toHalf.compared === 14, {
        compared: toHalf.compared,
        mismatches: toHalf.mismatches,
        edges: toHalf.edges.filter((edge) => !edge.equal),
    });
    const packed = measurement.checks.packed;
    add(
        'packed-set-unpack-extended/256-vectors-identical',
        packed.compared === 256 && packed.setWords === 0 && packed.unpackFields === 0 && packed.extWords === 0,
        { compared: packed.compared, ...packed, first: packed.first },
    );

    const controls = measurement.negativeControls;
    // The two implementations are byte-identical code, so a perturbed input cannot make THEM disagree.
    // Sensitivity is therefore proven two ways: feeding the half codec shifted inputs must disagree, and
    // within one implementation a perturbation above the quantisation step must move both the packed words
    // and every field walk, while the untouched vector keeps reporting zero.
    add(
        'negative-control/the-comparison-can-cry-wolf',
        controls.fromHalfOffsetOneMismatches > 0 &&
            controls.perturbationOwnCodecWordMismatches > 0 &&
            controls.perturbationUnpackFieldMismatches > 0 &&
            controls.crossImplAgreementOnPerturbedVector === 0 &&
            controls.packedUnperturbedWordMismatches === 0,
        controls,
    );
    return checks;
}

async function runEngine(pw, toolingError, engine, server, sdk, startedAt) {
    const result = { engine, status: 'FAIL', startedAt };
    const pageErrors = [];
    const consoleErrors = [];
    const requested = [];
    let browser;
    let stage = 'tooling';
    try {
        if (!pw) throw new Error(toolingError || 'Playwright unavailable');
        const options = launchOptions(engine);
        try {
            const matching = pw[engine].executablePath();
            if (engine !== 'chromium' && fs.existsSync(matching)) options.executablePath = matching;
        } catch {
            /* keep launchOptions fallback */
        }
        options.env = loopbackBrowserEnv();
        stage = 'launch';
        browser = await pw[engine].launch({ ...options, headless: true, timeout: 20000 });
        result.version = browser.version();
        result.executablePath = options.executablePath;
        const context = await browser.newContext();
        const page = await context.newPage();
        page.on('pageerror', (e) => pageErrors.push(String(e.stack || e)));
        page.on('console', (m) => {
            if (m.type() === 'error') consoleErrors.push(m.text());
        });
        page.on('request', (r) => requested.push(r.url()));
        stage = 'page';
        await page.goto(`${server.origin}/${PROBE_PATH}index.html?sdk=/${sdk}`, { timeout: 60000 });
        await page.waitForFunction(() => window.__sparkCpuParity?.ready || window.__sparkCpuParity?.fatal, null, {
            timeout: 120000,
        });
        stage = 'measure';
        const boot = await page.evaluate(() => ({
            fatal: window.__sparkCpuParity?.fatal || null,
            errors: window.__sparkCpuParity?.errors || [],
            measurement: window.__sparkCpuParity?.result || null,
        }));
        if (boot.fatal) throw new Error('page failed to boot: ' + boot.fatal);
        result.measurement = boot.measurement;
        result.pageErrors = [...pageErrors, ...boot.errors];
        result.consoleErrors = consoleErrors;
        stage = 'judge';
        const checks = judge(engine, boot.measurement);
        result.checks = checks;
        result.passed = checks.every((check) => check.passed) && !result.pageErrors.length && !consoleErrors.length;
        result.status = result.passed ? 'PASS' : 'FAIL';
        result.failedChecks = checks.filter((check) => !check.passed).map((check) => check.name);
        console.error(
            `[spark-cpu-parity] ${engine}: ${result.status} checks=${checks.length} failed=${result.failedChecks.length}` +
                `${result.failedChecks.length ? ' (' + result.failedChecks.join(',') + ')' : ''}`,
        );
    } catch (error) {
        result.error = { stage, message: String(error.stack || error) };
        result.pageErrors = pageErrors;
        result.consoleErrors = consoleErrors;
        result.status = stage === 'tooling' ? 'NOT_RUN' : 'FAIL';
        console.error(`[spark-cpu-parity] ${engine}: ${stage} ${error.message}`);
    } finally {
        result.requests = requested;
        if (browser) await browser.close();
    }
    return result;
}

function main() {
    const args = process.argv.slice(2);
    const allowed = /^(--out=|--browser=|--playwright=|--sdk=|--port-repo=)/;
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
    const sdk = args.find((a) => a.startsWith('--sdk='))?.slice(6) || 'build/spark.module.js';
    assert(/^build\/[a-zA-Z0-9_.-]+\.js$/.test(sdk), 'Invalid SDK path (build/<name>.js only)');
    assert(fs.existsSync(path.resolve(root, sdk)), `Missing SDK build: ${sdk}`);
    const portRepo = path.resolve(
        root,
        args.find((a) => a.startsWith('--port-repo='))?.slice(12) || '../spark-cocosairjs',
    );
    for (const file of ['dist/spark-reference.js', 'dist/three-reference.js']) {
        assert(fs.existsSync(path.join(portRepo, file)), `Missing ${file} under ${portRepo}`);
    }
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
    const fingerprintFiles = [
        'build/cocosair.module.js',
        sdk,
        `${PROBE_PATH}index.html`,
        `${PROBE_PATH}cpu-parity.js`,
        'tools/verify/spark-cpu-parity.cjs',
        'tools/verify/browser-engines.cjs',
        'tools/verify/loopback-browser-env.cjs',
        'ai/plans/spark-integration.md',
        'src/air/spark/generated/spark-runtime.js',
        'src/exports/spark.ts',
        'tools/build/spark-runtime-tree.cjs',
    ];
    const fingerprints = Object.fromEntries(fingerprintFiles.map((file) => [file, sha256(file)]));
    const referenceFiles = ['dist/spark-reference.js', 'dist/three-reference.js'];
    const referenceFingerprints = Object.fromEntries(
        referenceFiles.map((file) => [
            file,
            fs.existsSync(path.join(portRepo, file)) ? sha256File(path.join(portRepo, file)) : null,
        ]),
    );
    const git = (a) => {
        try {
            return cp.execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();
        } catch (error) {
            return `GIT_UNAVAILABLE: ${error.message}`;
        }
    };
    let playwrightVersion = null;
    try {
        playwrightVersion = require(path.join(path.dirname(toolingPath), 'package.json')).version;
    } catch {
        playwrightVersion = null;
    }
    return {
        engines,
        out,
        outAbs,
        pw,
        toolingError,
        sdk,
        portRepo,
        fingerprints,
        fingerprintFiles,
        sha256,
        identity: {
            head: git(['rev-parse', 'HEAD']),
            dirtyEntries: git(['status', '--porcelain']).split('\n').filter(Boolean).length,
            node: process.version,
            sdk: { path: sdk, sha256: fingerprints[sdk] },
            toolingPath: toolingPath || null,
            toolingError: toolingError || null,
            playwrightVersion,
        },
        referenceFingerprints,
    };
}

async function run() {
    const ctx = main();
    const startedAt = new Date().toISOString();
    const before = digestTree();
    const server = await startServer(ctx.portRepo);
    const results = [];
    try {
        for (const engine of ctx.engines) {
            results.push(await runEngine(ctx.pw, ctx.toolingError, engine, server, ctx.sdk, new Date().toISOString()));
        }
        const after = digestTree();
        const sourceChanged = changedFiles(before, after);
        const drift = ctx.fingerprintFiles.filter((file) => ctx.sha256(file) !== ctx.fingerprints[file]);
        const delivered = results.filter((r) => r.measurement && r.checks);
        const checks = delivered.length ? delivered[0].checks.map((check) => check.name) : [];
        const matrix = checks.map((name) => ({
            name,
            engines: results.map((result) => ({
                engine: result.engine,
                passed: result.checks ? result.checks.find((check) => check.name === name)?.passed === true : false,
            })),
            passed: results.every((result) => result.checks?.find((check) => check.name === name)?.passed === true),
        }));
        const passed =
            delivered.length === ctx.engines.length &&
            results.every((r) => r.status === 'PASS') &&
            matrix.every((row) => row.passed) &&
            !drift.length &&
            !sourceChanged.length;
        const report = {
            schemaVersion: 'spark-cpu-parity/1',
            startedAt,
            endedAt: new Date().toISOString(),
            task: 'SPK-13',
            scope: 'CPU JavaScript codec parity only: the Spark body shipped inside this repo bundle (cc.sparkRuntime) versus the frozen upstream reference package dist/spark-reference.js, both imported in one browser document on one loopback origin. No pixels, no WebGL, no worker, no XR session.',
            strictRule:
                'Object.is equality for all 65536 fromHalf patterns and the 14 toHalf boundary edges; byte-exact Uint32 words for 256 setPackedSplat and encodeExtSplat vectors and Object.is for every unpackSplat field; sorted export-name sets differ by exactly the registered 27 SparkXr/hands exclusions with nothing extra in the target; the five namespace key sets equal; negative controls must report mismatches while the real comparison reports none; zero page/console errors; source/asset digest unchanged.',
            claimLimit:
                'What ships in THIS repo versus the upstream package, on THIS machine, for these pure CPU functions. It is not a GPU or rendering claim (that is spark-pixel-parity), not a WASM decode claim (that is spark-data-parity), and not a release READY claim. The reference is served read-only from the port repo; no file was copied into this repo.',
            identity: ctx.identity,
            sdk: ctx.sdk,
            fingerprints: ctx.fingerprints,
            referenceOrigin: {
                root: ctx.portRepo,
                served: ['/dist/spark-reference.js', '/dist/three-reference.js'],
                note: 'read-only port repository over loopback, single origin shared with /build and /tools of this repo',
                fingerprints: ctx.referenceFingerprints,
            },
            xrNarrowing: {
                registeredIn: ['docs/UPSTREAM.md', 'ai/ledgers/spark-integration.md', 'ai/plans/spark-integration.md'],
                expectedReferenceOnlyExports: XR_EXCLUDED_EXPORTS,
                sourceModules: ['vendor/spark/src/SparkXr.ts', 'vendor/spark/src/hands.ts'],
                droppedBy: 'tools/build/spark-runtime-tree.cjs (EXCLUDED_MODULES)',
            },
            engines: ctx.engines,
            results,
            matrix,
            counts: {
                checks: checks.length,
                passed: matrix.filter((row) => row.passed).length,
                failed: matrix.filter((row) => !row.passed).length,
            },
            drift,
            sourceFreeze: {
                directories: FREEZE_DIRS,
                filesBefore: before.files,
                filesAfter: after.files,
                bytes: before.bytes,
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
            `[spark-cpu-parity] report=${ctx.out} passed=${passed} engines=${results.map((r) => `${r.engine}:${r.status}`).join(',')} drift=${drift.length} sourceUnchanged=${report.sourceUnchanged}`,
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
