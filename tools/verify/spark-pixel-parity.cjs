// SPK-13 pixel-parity collector: renders the same deterministic gaussian-splat scene twice in ONE
// browser engine — once with the real three.js + upstream @sparkjsdev/spark 2.3.1 oracle (served
// read-only from the port repo, never copied into this repo) and once through this repo's bundle with
// the AIR Spark integration layer — then byte-compares the RGBA8 read-back.
//
// Strict pass contract (ai/plans/spark-integration.md §SPK-13): every RGBA8 channel byte difference
// must be 0, the image must be non-empty on both sides, each side must repeat stably against itself,
// JS + drained GL errors must be empty, and the source/asset digest must not change during the run.
// Evidence is per-engine only: a PASS on this machine's GPU is explicitly NOT generalised to other
// GPUs or devices (see report.claimLimit).
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const http = require('node:http');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const { startExampleServer } = require('./competitive-example-server.cjs');
const { launchOptions } = require('./browser-engines.cjs');
const { loopbackBrowserEnv } = require('./loopback-browser-env.cjs');

const root = path.resolve(__dirname, '../..');
const PROBE_PATH = 'tools/debug/probes/spark-pixel-parity/';
// Overridable via --width/--height/--dpr so the acceptance sweep is not trapped in one 1:1 / DPR-1
// window. The same values are sent as a query string to BOTH documents; the shared probe page derives
// the canvas backing store (and the engine pixel-ratio cap) from them.
let WIDTH = 256;
let HEIGHT = 256;
let DPR = 1;

// ---- strict RGBA8 comparator (same contract as the port's tests/comparator.mjs) -------------------
function validateImage(image, label) {
    assert(image && typeof image === 'object', `${label}: image object required`);
    assert(Number.isInteger(image.width) && image.width > 0, `${label}: positive integer width required`);
    assert(Number.isInteger(image.height) && image.height > 0, `${label}: positive integer height required`);
    assert(
        Array.isArray(image.data) || image.data instanceof Uint8Array || image.data instanceof Uint8ClampedArray,
        `${label}: byte array required`,
    );
    const bytes = image.width * image.height * 4;
    assert(image.data.length === bytes, `${label}: data length ${image.data.length} !== ${bytes}`);
    for (let index = 0; index < bytes; index++) {
        const value = image.data[index];
        assert(Number.isInteger(value) && value >= 0 && value <= 255, `${label}: byte ${index} is ${value}`);
    }
    return image;
}

function compare(a, b) {
    validateImage(a, 'a');
    validateImage(b, 'b');
    assert(
        a.width === b.width && a.height === b.height,
        `dimension mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    );
    let channelMismatch = 0;
    let pixelMismatch = 0;
    let maxError = 0;
    let sum = 0;
    const diff = new Uint8Array(a.data.length);
    for (let i = 0; i < a.data.length; i += 4) {
        let mismatch = false;
        for (let c = 0; c < 4; c++) {
            const d = Math.abs(a.data[i + c] - b.data[i + c]);
            diff[i + c] = c === 3 ? 255 : Math.min(255, d * 8);
            if (d !== 0) {
                channelMismatch++;
                mismatch = true;
                maxError = Math.max(maxError, d);
                sum += d;
            }
        }
        if (mismatch) pixelMismatch++;
    }
    const pixels = a.width * a.height;
    return {
        channelMismatch,
        pixelMismatch,
        maxError,
        meanAbsoluteError: channelMismatch ? sum / channelMismatch : 0,
        pixelsCompared: pixels,
        pass: channelMismatch === 0,
        diff: { width: a.width, height: a.height, data: diff },
    };
}

// A comparison that refuses to invent metrics: a broken/invalid/differently-sized image FAILS the case
// instead of throwing the whole engine run away.
function safeCompare(a, b) {
    try {
        return compare(a, b);
    } catch (error) {
        return {
            channelMismatch: null,
            pixelMismatch: null,
            maxError: null,
            meanAbsoluteError: null,
            pass: false,
            diff: null,
            compareError: String(error.message || error),
        };
    }
}

// Rejects a broken comparator: NaN/Infinity/out-of-range/half bytes, truncated or empty buffers,
// wrong container types, dimension mismatch, zero dimensions, and single-channel +/-1 deltas. Every
// entry is a positive assertion, so `passed: true` means the comparator behaved.
function comparatorControls() {
    const checks = [];
    const check = (name, fn) => {
        let passed = false;
        let detail;
        try {
            fn();
            passed = true;
        } catch (error) {
            detail = String(error.message || error);
        }
        checks.push(detail ? { name, passed, detail } : { name, passed });
    };
    const good = { width: 2, height: 1, data: [0, 10, 20, 255, 30, 40, 50, 128] };
    const rejects = (name, image) =>
        check(name, () =>
            assert.throws(
                () => compare(image, good),
                () => true,
                `${name} must be rejected`,
            ),
        );
    rejects('rejects undefined image', undefined);
    rejects('rejects NaN byte', { ...good, data: [NaN, 1, 2, 3, 4, 5, 6, 7] });
    rejects('rejects Infinity byte', { ...good, data: [Infinity, 1, 2, 3, 4, 5, 6, 7] });
    rejects('rejects -1 byte', { ...good, data: [-1, 1, 2, 3, 4, 5, 6, 7] });
    rejects('rejects 256 byte', { ...good, data: [256, 1, 2, 3, 4, 5, 6, 7] });
    rejects('rejects fractional byte', { ...good, data: [1.5, 1, 2, 3, 4, 5, 6, 7] });
    rejects('rejects null byte', { ...good, data: [null, 1, 2, 3, 4, 5, 6, 7] });
    rejects('rejects string byte', { ...good, data: ['3', 1, 2, 3, 4, 5, 6, 7] });
    rejects('rejects truncated data', { ...good, data: [0, 1, 2, 3] });
    rejects('rejects empty data', { width: 2, height: 1, data: [] });
    rejects('rejects wrong container', { ...good, data: [0, 1, 2, 3, 4, 5, 6, 7].map(String) });
    rejects('rejects zero width', { width: 0, height: 1, data: [] });
    rejects('rejects dimension mismatch', { width: 1, height: 2, data: good.data });
    check('single channel delta fails', () => {
        const result = compare(good, { width: 2, height: 1, data: [1, 10, 20, 255, 30, 40, 50, 128] });
        assert(
            result.channelMismatch === 1 &&
                result.pixelMismatch === 1 &&
                result.maxError === 1 &&
                result.pass === false,
        );
    });
    check('alpha delta counts', () => {
        const result = compare(good, { width: 2, height: 1, data: [0, 10, 20, 254, 30, 40, 50, 128] });
        assert(result.channelMismatch === 1 && result.pass === false);
    });
    check('identical buffers pass', () => {
        const result = compare(good, { width: 2, height: 1, data: good.data.slice() });
        assert(result.channelMismatch === 0 && result.pass === true && result.maxError === 0);
    });
    return checks;
}

// ---- minimal PNG writer (no third-party dependency) -----------------------------------------------
const CRC_TABLE = (() => {
    const table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c;
    }
    return table;
})();
function crc32(buffer) {
    let c = -1;
    for (let index = 0; index < buffer.length; index++) c = CRC_TABLE[(c ^ buffer[index]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}
function pngChunk(type, data) {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body), 0);
    return Buffer.concat([length, body, checksum]);
}
function writePng(file, image) {
    validateImage(image, file);
    const { width, height, data } = image;
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y++) {
        // GL read-back rows are bottom-up; PNG rows are top-down.
        const source = (height - 1 - y) * stride;
        raw[y * (stride + 1)] = 0;
        for (let x = 0; x < stride; x++) raw[y * (stride + 1) + 1 + x] = data[source + x];
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const png = Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        pngChunk('IHDR', header),
        pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
    fs.writeFileSync(file, png);
    return path.relative(root, file).replace(/\\/g, '/');
}

// ---- case set: procedural splat constructors + seeded records, no fixture files ------------------
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

// ---- read-only reference-origin server (port repo + the probe page files) ------------------------
const REFERENCE_MIME = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.wasm': 'application/wasm',
};
function startReferenceServer(portRepo, probeDir) {
    const server = http.createServer((req, res) => {
        const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
        let file = null;
        if (pathname.startsWith('/' + PROBE_PATH)) {
            file = path.resolve(probeDir, '.' + pathname.slice(PROBE_PATH.length));
            assert(file.startsWith(probeDir + path.sep) || file === probeDir, 'probe path outside the probe dir');
        } else if (pathname.startsWith('/dist/')) {
            file = path.resolve(portRepo, '.' + pathname);
            assert(file.startsWith(portRepo + path.sep), 'reference path outside the port repo');
        }
        if (!file || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('refused: ' + pathname);
            return;
        }
        res.writeHead(200, { 'Content-Type': REFERENCE_MIME[path.extname(file)] || 'application/octet-stream' });
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

// ---- source / asset freeze digest ---------------------------------------------------------------
const FREEZE_DIRS = ['src', 'vendor', 'build', 'tools', 'docs'];
function digestTree() {
    const files = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (/node_modules|\.tmp|tmp_|~/.test(entry.name)) continue;
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile()) files.push(full);
        }
    };
    for (const dir of FREEZE_DIRS) {
        const full = path.join(root, dir);
        if (fs.existsSync(full)) walk(full);
    }
    files.sort();
    const hashes = files.map((file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
    const map = new Map(files.map((file, index) => [path.relative(root, file).replace(/\\/g, '/'), hashes[index]]));
    return {
        files: files.length,
        bytes: files.reduce((total, file) => total + fs.statSync(file).size, 0),
        aggregateSha256: crypto
            .createHash('sha256')
            .update([...map].map(([name, hash]) => `${name}:${hash}\n`).join(''))
            .digest('hex'),
        map,
    };
}
function changedFiles(before, after) {
    const changed = [];
    for (const [name, hash] of after.map) if (before.map.get(name) !== hash) changed.push(name);
    for (const name of before.map.keys()) if (!after.map.has(name)) changed.push(`${name} (removed)`);
    return changed;
}

function main() {
    const args = process.argv.slice(2);
    const allowed = /^(--out=|--browser=|--playwright=|--sdk=|--cases=|--port-repo=|--width=|--height=|--dpr=)/;
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
    const explicit = args.find((a) => a.startsWith('--playwright='))?.slice(13);
    const sdk = args.find((a) => a.startsWith('--sdk='))?.slice(6) || 'build/spark.module.js';
    assert(/^build\/[a-zA-Z0-9_.-]+\.js$/.test(sdk), 'Invalid SDK path (build/<name>.js only)');
    const readNumber = (prefix, fallback) => {
        const raw = args.find((a) => a.startsWith(prefix))?.slice(prefix.length);
        if (raw === undefined) return fallback;
        const value = Number(raw);
        return Number.isFinite(value) ? value : assert.fail(`${prefix} expects a number, got ${raw}`);
    };
    const requestedWidth = readNumber('--width=', 256);
    const requestedHeight = readNumber('--height=', 256);
    const requestedDpr = readNumber('--dpr=', 1);
    assert(
        Number.isInteger(requestedWidth) &&
            Number.isInteger(requestedHeight) &&
            requestedWidth >= 64 &&
            requestedHeight >= 64 &&
            requestedWidth <= 1024 &&
            requestedHeight <= 1024,
        '--width/--height must be integers in [64, 1024]',
    );
    assert(
        [1, 1.25, 1.375, 1.5, 2, 3].includes(requestedDpr),
        '--dpr must be one of 1, 1.25, 1.375, 1.5, 2, 3 (frame.js mirrors this allowlist)',
    );
    assert(
        Number.isInteger(requestedWidth * requestedDpr) &&
            Number.isInteger(requestedHeight * requestedDpr) &&
            requestedWidth * requestedDpr <= 1024 &&
            requestedHeight * requestedDpr <= 1024,
        '--width/--height must give integer device pixels within 1024 at the requested --dpr',
    );
    WIDTH = requestedWidth;
    HEIGHT = requestedHeight;
    DPR = requestedDpr;
    const only = args.find((a) => a.startsWith('--cases='))?.slice(8);
    const cases = only ? only.split(',') : CASES.map((c) => c.id);
    assert(
        cases.every((c) => CASES.some((entry) => entry.id === c)),
        `Unknown case: ${cases.filter((c) => !CASES.some((entry) => entry.id === c)).join(',')}`,
    );
    assert(fs.existsSync(path.resolve(root, sdk)), `Missing SDK build: ${sdk}`);
    const portRepo = path.resolve(
        root,
        args.find((a) => a.startsWith('--port-repo='))?.slice(12) || '../spark-cocosairjs',
    );
    assert(
        fs.existsSync(path.join(portRepo, 'dist/spark-reference.js')),
        `Missing upstream Spark bundle under ${portRepo}`,
    );

    let pw;
    let toolingError;
    let toolingPath;
    try {
        toolingPath = require.resolve(explicit || 'playwright');
        pw = require(toolingPath);
    } catch (error) {
        toolingError = String(error);
    }

    const sha256 = (file) =>
        fs.existsSync(path.join(root, file))
            ? crypto
                  .createHash('sha256')
                  .update(fs.readFileSync(path.join(root, file)))
                  .digest('hex')
            : null;
    const fingerprintFiles = [
        'build/cocosair.module.js',
        sdk,
        `${PROBE_PATH}index.html`,
        `${PROBE_PATH}reference.html`,
        `${PROBE_PATH}frame.js`,
        'tools/verify/spark-pixel-parity.cjs',
        'tools/verify/browser-engines.cjs',
        'tools/verify/competitive-example-server.cjs',
        'tools/verify/loopback-browser-env.cjs',
        'ai/plans/spark-integration.md',
        'src/air/spark/cocos-spark-layer.ts',
        'src/air/spark/cocos-renderer.ts',
        'src/air/spark/spark-api-adapter.ts',
        'src/exports/spark.ts',
    ];
    const fingerprints = Object.fromEntries(fingerprintFiles.map((f) => [f, sha256(f)]));
    const referenceFiles = [
        'dist/three-reference.js',
        'dist/three.core.js',
        'dist/spark-reference.js',
        'dist/reference-addons/postprocessing/Pass.js',
    ];
    const referenceFingerprints = Object.fromEntries(
        referenceFiles.map((f) => [
            f,
            fs.existsSync(path.join(portRepo, f))
                ? crypto
                      .createHash('sha256')
                      .update(fs.readFileSync(path.join(portRepo, f)))
                      .digest('hex')
                : null,
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
    const identity = {
        head: git(['rev-parse', 'HEAD']),
        dirty: git(['status', '--porcelain']),
        node: process.version,
        sdk: { path: sdk, sha256: fingerprints[sdk] },
        toolingPath: toolingPath || null,
        toolingError: toolingError || null,
        playwrightVersion,
    };
    return {
        engines,
        cases: CASES.filter((c) => cases.includes(c.id)),
        out,
        outAbs,
        pw,
        toolingError,
        identity,
        fingerprints,
        fingerprintFiles,
        sha256,
        sdk,
        portRepo,
        referenceFingerprints,
    };
}

const nonzeroRgb = (image) => image.data.filter((value, index) => index % 4 !== 3 && value !== 0).length;

const nativeIdentityOk = (identity) =>
    !!identity &&
    identity.rendererClassName === 'CocosRenderer' &&
    identity.layerClassName === 'CocosSparkLayer' &&
    identity.rendererDeviceIsNativeGfxDevice === true &&
    identity.webglContextIsNativeDeviceGl === true &&
    identity.nativePipelineIsRenderPipeline === true &&
    identity.cameraWindowIsAppMainWindow === true &&
    identity.layerOwnsApp === false;

function summarize(name, result) {
    return { name, channelMismatch: result.channelMismatch, maxError: result.maxError, pass: result.pass };
}

async function runCase({ engine, target, reference, spec, artifactDir }) {
    const info = await target.evaluate((s) => window.__sparkParity.setup(s), spec);
    const snapshot = await target.evaluate(() => window.__sparkParity.snapshot());
    const referenceInfo = await reference.evaluate((s) => window.__sparkParity.setup(s), spec);
    await reference.evaluate((s) => window.__sparkParity.adopt(s), snapshot);
    const firstTarget = await target.evaluate(() => window.__sparkParity.draw());
    const firstReference = await reference.evaluate(() => window.__sparkParity.draw());
    const repeatTarget = await target.evaluate(() => window.__sparkParity.draw());
    const repeatReference = await reference.evaluate(() => window.__sparkParity.draw());

    const difference = safeCompare(firstReference, firstTarget);
    const targetRepeat = safeCompare(firstTarget, repeatTarget);
    const referenceRepeat = safeCompare(firstReference, repeatReference);
    const glErrors = [...(firstTarget.glErrors || []), ...(firstReference.glErrors || [])];
    const jsErrors = [
        ...(info.errors || []),
        ...(referenceInfo.errors || []),
        ...(firstTarget.errors || []),
        ...(firstReference.errors || []),
    ];

    const caseDir = path.join(artifactDir, spec.id);
    fs.mkdirSync(caseDir, { recursive: true });
    const artifacts = {
        target: writePng(path.join(caseDir, 'target.png'), firstTarget),
        reference: writePng(path.join(caseDir, 'reference.png'), firstReference),
    };
    if (difference.diff) artifacts.diff = writePng(path.join(caseDir, 'diff.png'), difference.diff);

    const environmentMatch =
        JSON.stringify(firstTarget.contextAttributes ?? null) ===
            JSON.stringify(firstReference.contextAttributes ?? null) &&
        firstTarget.unmaskedRenderer === firstReference.unmaskedRenderer;
    const splatsMatch =
        firstTarget.activeSplats === firstReference.activeSplats &&
        JSON.stringify(firstTarget.numSplats) === JSON.stringify(firstReference.numSplats);
    const nativeIdentity = info.nativeIdentity || null;
    const passed =
        difference.pass === true &&
        nonzeroRgb(firstTarget) > 0 &&
        nonzeroRgb(firstReference) > 0 &&
        targetRepeat.channelMismatch === 0 &&
        referenceRepeat.channelMismatch === 0 &&
        glErrors.length === 0 &&
        jsErrors.length === 0 &&
        splatsMatch &&
        environmentMatch &&
        nativeIdentityOk(nativeIdentity);

    const row = {
        engine,
        id: spec.id,
        note: spec.note,
        passed,
        dims: `${firstTarget.width}x${firstTarget.height}`,
        nativeIdentity,
        nativeIdentityPassed: nativeIdentityOk(nativeIdentity),
        channelMismatch: difference.channelMismatch,
        compareError: difference.compareError || null,
        pixelMismatch: difference.pixelMismatch,
        maxError: difference.maxError,
        meanAbsoluteError: difference.meanAbsoluteError,
        targetNonempty: nonzeroRgb(firstTarget),
        referenceNonempty: nonzeroRgb(firstReference),
        repeatStableSelf: targetRepeat.channelMismatch === 0 && referenceRepeat.channelMismatch === 0,
        repeatTarget: summarize('target-repeat', targetRepeat),
        repeatReference: summarize('reference-repeat', referenceRepeat),
        targetActiveSplats: firstTarget.activeSplats,
        referenceActiveSplats: firstReference.activeSplats,
        targetNumSplats: firstTarget.numSplats,
        referenceNumSplats: firstReference.numSplats,
        splatsMatch,
        glErrorCount: glErrors.length,
        glErrors,
        jsErrorCount: jsErrors.length,
        jsErrors,
        environmentMatch,
        contextAttributes: firstTarget.contextAttributes,
        referenceContextAttributes: firstReference.contextAttributes,
        unmaskedRenderer: firstTarget.unmaskedRenderer,
        artifacts,
        targetMatrices: snapshot.camera,
        viewport: snapshot.viewport,
        nativeView: snapshot.nativeView,
        nativeProjection: snapshot.nativeProjection,
        // Diagnostic only (never a gate): how far the engine's float32 camera matrices sit from the
        // ones three.js builds from the same pose parameters. Adoption removes this before rendering.
        cameraConstructionDelta: (() => {
            const constructed = referenceInfo.constructed;
            if (!constructed) return null;
            const delta = (a, b) => Math.max(...a.map((value, index) => Math.abs(value - b[index])));
            return {
                projectionMaxAbsDelta: delta(constructed.projectionMatrix, snapshot.camera.projectionMatrix),
                viewMaxAbsDelta: delta(constructed.matrixWorldInverse, snapshot.camera.matrixWorldInverse),
                notAGate: true,
            };
        })(),
    };
    if (!passed) {
        row.firstMismatch = (() => {
            if (!difference.diff) return null;
            const out = [];
            for (let i = 0; i < firstTarget.data.length && out.length < 8; i++) {
                if (firstTarget.data[i] !== firstReference.data[i]) {
                    out.push({
                        byte: i,
                        pixel: [Math.floor(i / 4) % firstTarget.width, Math.floor(i / 4 / firstTarget.width)],
                        channel: i % 4,
                        target: firstTarget.data[i],
                        reference: firstReference.data[i],
                    });
                }
            }
            return out;
        })();
    }
    console.error(
        `[spark-pixel-parity] ${engine}/${spec.id}: ${passed ? 'PASS' : 'FAIL'} channelMismatch=${row.channelMismatch} targetNonempty=${row.targetNonempty} referenceNonempty=${row.referenceNonempty} repeat=${row.repeatStableSelf} glErrors=${row.glErrorCount} jsErrors=${row.jsErrorCount} nativeGfx=${row.nativeIdentityPassed}`,
    );
    return row;
}

async function runEngine(ctx, engine, targetServer, referenceServer, startedAt) {
    const { pw, toolingError, sdk } = ctx;
    const artifactRoot = path.resolve(ctx.outAbs, '..', `${path.basename(ctx.outAbs, '.json')}-artifacts`);
    const artifactDir = path.join(artifactRoot, engine);
    fs.mkdirSync(artifactDir, { recursive: true });
    let browser;
    let stage = 'tooling';
    const result = { engine, status: 'FAIL', cases: [], pageErrors: [], consoleErrors: [] };
    const targetRequests = [];
    const referenceRequests = [];
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
        const context = await browser.newContext({
            viewport: { width: WIDTH, height: HEIGHT },
            deviceScaleFactor: DPR,
        });
        // Live arrays: attached before navigation so a mid-run throw still reports what was requested.
        result.targetRequests = targetRequests;
        result.referenceRequests = referenceRequests;
        stage = 'target-page';
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

        const sizeQuery = `width=${WIDTH}&height=${HEIGHT}&dpr=${DPR}`;
        await target.goto(`${targetServer.origin}/${PROBE_PATH}?sdk=/${sdk}&${sizeQuery}`, { timeout: 60000 });
        await target.waitForFunction(() => window.__sparkParity?.ready, null, { timeout: 90000 });
        const targetBoot = await target.evaluate(() => ({ fatal: window.__sparkParity.fatal || null }));
        if (targetBoot.fatal) throw new Error('target page failed to boot: ' + targetBoot.fatal);

        stage = 'reference-page';
        await reference.goto(`${referenceServer.origin}/${PROBE_PATH}reference.html?${sizeQuery}`, { timeout: 60000 });
        await reference.waitForFunction(() => window.__sparkParity?.ready, null, { timeout: 90000 });
        const referenceBoot = await reference.evaluate(() => ({ fatal: window.__sparkParity.fatal || null }));
        if (referenceBoot.fatal) throw new Error('reference page failed to boot: ' + referenceBoot.fatal);

        // Anti-cheat: the two documents live on different loopback origins, so any leakage is a request.
        const referenceOrigin = new URL(referenceServer.origin).origin;
        const targetOrigin = new URL(targetServer.origin).origin;
        const forbidden = /three-reference|three\.core|reference-addons|node_modules\/three|spark-reference/;
        result.antiCheat = {
            targetRequestsToReferenceOrigin: targetRequests.filter((url) => new URL(url).origin === referenceOrigin),
            targetRequestsMatchingReferenceFiles: targetRequests.filter((url) => forbidden.test(url)),
            referenceRequestsToTargetOrigin: referenceRequests.filter((url) => new URL(url).origin === targetOrigin),
            referenceRequestsMatchingSdk: referenceRequests.filter((url) => url.includes(sdk)),
        };
        result.antiCheat.passed = Object.values(result.antiCheat)
            .filter((value) => Array.isArray(value))
            .every((list) => list.length === 0);
        result.targetRequests = targetRequests;
        result.referenceRequests = referenceRequests;

        stage = 'cases';
        for (const spec of ctx.cases)
            result.cases.push(await runCase({ engine, target, reference, spec, artifactDir }));

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
        const baselineMismatch = safeCompare(baselineReference, baselineTarget).channelMismatch;
        const perturbedMismatch = safeCompare(baselineReference, movedTarget).channelMismatch;
        result.negativeControl = {
            case: control.id,
            perturbation: 'target camera x += 0.2 without re-adopting on the reference',
            baselineMismatch,
            perturbedMismatch,
            passed: baselineMismatch === 0 && perturbedMismatch > 0,
        };
        writePng(path.join(artifactDir, 'negative-control-target.png'), movedTarget);
        console.error(
            `[spark-pixel-parity] ${engine}/negative-control: baseline=${baselineMismatch} perturbed=${perturbedMismatch} -> ${result.negativeControl.passed ? 'PASS' : 'FAIL'}`,
        );

        stage = 'environment';
        const environment = await target.evaluate(() => window.__sparkParity.info());
        const referenceEnvironment = await reference.evaluate(() => window.__sparkParity.info());
        result.gpu = {
            unmaskedRenderer: environment.unmaskedRenderer,
            unmaskedVendor: environment.unmaskedVendor,
            version: environment.version,
            contextAttributes: environment.contextAttributes,
            drawingBufferColorSpace: environment.drawingBufferColorSpace,
            contextAttributesMatched:
                JSON.stringify(environment.contextAttributes) ===
                JSON.stringify(referenceEnvironment.contextAttributes),
            unmaskedRendererMatched: environment.unmaskedRenderer === referenceEnvironment.unmaskedRenderer,
        };
        result.status =
            result.cases.every((c) => c.passed) &&
            result.negativeControl.passed &&
            result.antiCheat.passed &&
            !result.pageErrors.length &&
            !result.consoleErrors.length &&
            result.gpu.contextAttributesMatched &&
            result.gpu.unmaskedRendererMatched
                ? 'PASS'
                : 'FAIL';
    } catch (error) {
        result.error = { stage, message: String(error.stack || error) };
        result.status = stage === 'tooling' ? 'NOT_RUN' : 'FAIL';
        console.error(`[spark-pixel-parity] ${engine}: ${stage} ${error.message}`);
    } finally {
        if (browser) await browser.close();
    }
    result.startedAt = startedAt;
    return result;
}

async function run() {
    const ctx = main();
    const startedAt = new Date().toISOString();
    const controlChecks = comparatorControls();
    const comparatorSelfTest = controlChecks.every((c) => c.passed);
    const before = digestTree();
    const results = [];
    const targetServer = await startExampleServer(root);
    const referenceServer = await startReferenceServer(ctx.portRepo, path.resolve(root, PROBE_PATH));
    try {
        for (const engine of ctx.engines) {
            results.push(await runEngine(ctx, engine, targetServer, referenceServer, new Date().toISOString()));
        }
        const after = digestTree();
        const sourceChanged = changedFiles(before, after);
        const drift = ctx.fingerprintFiles.filter((file) => ctx.sha256(file) !== ctx.fingerprints[file]);
        const enginesDelivered = results.every((r) => r.cases.length === ctx.cases.length && r.gpu);
        const cases = ctx.cases.map((spec) => {
            const perEngine = ctx.engines.map((engine) => {
                const result = results.find((r) => r.engine === engine);
                return { engine, row: result?.cases.find((c) => c.id === spec.id) || null };
            });
            const delivered = perEngine.filter((entry) => entry.row);
            return {
                id: spec.id,
                note: spec.note,
                engines: perEngine.map((entry) => ({
                    engine: entry.engine,
                    channelMismatch: entry.row ? entry.row.channelMismatch : null,
                    maxError: entry.row ? entry.row.maxError : null,
                    targetNonempty: entry.row ? entry.row.targetNonempty : null,
                    referenceNonempty: entry.row ? entry.row.referenceNonempty : null,
                    repeatStableSelf: entry.row ? entry.row.repeatStableSelf : null,
                    nativeIdentityPassed: entry.row ? entry.row.nativeIdentityPassed : null,
                    passed: entry.row ? entry.row.passed : false,
                })),
                referenceNonempty:
                    delivered.length === perEngine.length && delivered.every((e) => e.row.referenceNonempty > 0),
                targetNonempty:
                    delivered.length === perEngine.length && delivered.every((e) => e.row.targetNonempty > 0),
                channelMismatch: delivered.map((e) => e.row.channelMismatch),
                maxChannelError: delivered.map((e) => e.row.maxError),
                repeatStableSelf:
                    delivered.length === perEngine.length && delivered.every((e) => e.row.repeatStableSelf),
                jsErrorCount: delivered.reduce((total, e) => total + e.row.jsErrorCount, 0),
                glErrorCount: delivered.reduce((total, e) => total + e.row.glErrorCount, 0),
                passed: delivered.length === perEngine.length && delivered.every((e) => e.row.passed),
            };
        });
        const passed =
            comparatorSelfTest &&
            enginesDelivered &&
            cases.every((c) => c.passed) &&
            results.every((r) => r.status === 'PASS') &&
            !drift.length &&
            !sourceChanged.length;
        const report = {
            schemaVersion: 'spark-pixel-parity/1',
            startedAt,
            endedAt: new Date().toISOString(),
            task: 'SPK-13',
            scope: 'Browser behaviour and pixels: the same deterministic gaussian-splat scene rendered twice per engine in one Playwright browser context - reference = real three.js + upstream @sparkjsdev/spark 2.3.1 (read-only port-repo bundles), target = this repo bundle through cc.CocosSparkLayer/cc.CocosRenderer/cc.sparkRuntime - with byte-exact RGBA8 read-back comparison. Scenes are procedural only (no .spz/.ply fixtures).',
            strictRule:
                'Every RGBA8 channel byte difference must be 0; both images non-empty; each side stable against its own repeat; zero JS errors and zero drained GL errors; identical context attributes and unmasked renderer inside one engine; source/asset digest unchanged; negative control must move pixels. No tolerance.',
            claimLimit:
                'Evidence is per-engine on THIS machine only (see results[].gpu). Nothing here generalises to other GPUs, drivers, devices or browsers not listed; no "works everywhere" claim is made. The reference adopts the target native float32 camera/mesh matrices and viewport, so this evidence covers the splat rasterisation/sort/blend path, while camera-matrix construction is covered by SPK-04 math parity.',
            identity: ctx.identity,
            sdk: ctx.sdk,
            fingerprints: ctx.fingerprints,
            referenceOrigin: {
                root: ctx.portRepo,
                served: ['/dist/three-reference.js', '/dist/spark-reference.js', '/dist/reference-addons/'],
                note: 'read-only port repository, served over loopback from its original path; no file was copied into this repo',
                fingerprints: ctx.referenceFingerprints,
            },
            viewport: {
                width: WIDTH,
                height: HEIGHT,
                deviceScaleFactor: DPR,
                cssAspect: `${WIDTH}:${HEIGHT}`,
                backingStore: `${Math.round(WIDTH * DPR)}x${Math.round(HEIGHT * DPR)}`,
                note: 'same query string drives both documents; the probe derives canvas.width/height, Spark renderSize, the three renderer pixel ratio and the engine pixelRatioCap from it',
            },
            engines: ctx.engines,
            comparator: {
                selfTestPassed: comparatorSelfTest,
                checks: controlChecks,
                rule: 'channelMismatch === 0 (alpha included); dimensions and byte domains validated before compare',
            },
            drift,
            cases,
            results,
            gpu: results.map((r) => ({ engine: r.engine, ...(r.gpu || {}), version: r.version })),
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
            artifactDir: path
                .relative(root, path.resolve(ctx.outAbs, '..', `${path.basename(ctx.outAbs, '.json')}-artifacts`))
                .replace(/\\/g, '/'),
            passed,
        };
        fs.mkdirSync(path.dirname(ctx.outAbs), { recursive: true });
        fs.writeFileSync(ctx.outAbs, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
        console.error(
            `[spark-pixel-parity] report=${ctx.out} passed=${passed} engines=${results.map((r) => `${r.engine}:${r.status}`).join(',')} drift=${drift.length} sourceUnchanged=${report.sourceUnchanged}`,
        );
        process.exitCode = passed ? 0 : 1;
    } finally {
        await referenceServer.close();
        await targetServer.close();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
