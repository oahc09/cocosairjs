const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SCOPE, RECIPES, CASES } = require('../benchmark/recipes/competitive-batching.cjs');
const ROOT = path.resolve(__dirname, '..', '..');
const fullHash = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inputPaths = [
    'build/cocosair.module.js',
    'build/cocosair.module.d.ts',
    'examples/shared/batching-routes.ts',
    'examples/shared/asset-lifecycle.js',
    'tools/benchmark/recipes/competitive-batching.cjs',
    'tools/benchmark/recipes/run-competitive-batching.cjs',
    'tools/verify/competitive-batching-evidence.cjs',
    'tools/verify/competitive-batching-gate.cjs',
    'tools/verify/recipe-review-gate.cjs',
    'tools/verify/browser-engines.cjs',
    'tools/verify/loopback-browser-env.cjs',
    'tools/dev/resolve-script.cjs',
    ...['shared', 'merged', 'dynamic'].flatMap((route) =>
        ['index.html', 'src/main.ts', 'example.json'].map((file) => `examples/batching-${route}/${file}`),
    ),
];
function fingerprints(root = ROOT) {
    return inputPaths.map((file) => ({
        path: file,
        bytes: fs.statSync(path.join(root, file)).size,
        sha256: fullHash(path.join(root, file)),
    }));
}
function validateEvidence(document, options = {}) {
    const errors = [];
    const root = options.root || ROOT;
    const current = options.fingerprints || fingerprints(root);
    const artifact =
        options.artifact ||
        ((record) => {
            const abs = path.resolve(root, record.path);
            const allowed = path.join(root, 'docs', 'evidence', 'recipes', SCOPE) + path.sep;
            return (
                abs.startsWith(allowed) &&
                fs.existsSync(abs) &&
                fs.statSync(abs).size === record.bytes &&
                fullHash(abs) === record.sha256
            );
        });
    if (!document || document.scope !== SCOPE || document.schema !== 'competitive-batching-evidence-v1')
        return ['wrong or missing evidence scope/schema'];
    if (document.completed !== true) errors.push('evidence incomplete');
    if (document.captureErrors?.length || document.errors?.length || (document.result && document.result !== 'PASS'))
        errors.push('collector reported failure');
    if (!document.runId || !document.measuredAt) errors.push('missing run identity/time');
    if (JSON.stringify(document.fingerprints) !== JSON.stringify(current))
        errors.push('current input fingerprints differ from captured candidate');
    if (
        !Array.isArray(document.recipes) ||
        document.recipes.length !== RECIPES.length ||
        RECIPES.some((r) => !document.recipes.includes(r.id))
    )
        errors.push('must cover the three scoped recipes');
    const rows = Array.isArray(document.records) ? document.records : [];
    if (rows.length !== CASES.length || new Set(rows.map((r) => r?.id)).size !== CASES.length)
        errors.push('case count or duplicate IDs');
    for (const expected of CASES) {
        const row = rows.find((r) => r?.id === expected.id);
        const fail = (reason) => errors.push(`${expected.id}: ${reason}`);
        if (!row) {
            fail('missing case');
            continue;
        }
        if (row.route !== expected.route || row.count !== expected.count || row.instancing !== expected.instancing)
            fail('wrong requested route/count/instancing');
        const recipe = RECIPES.find((r) => r.route === expected.route);
        if (
            row.recipeId !== recipe.id ||
            row.recipeVersion !== recipe.version ||
            row.compositeBenchmarkId !== recipe.compositeBenchmarkId
        )
            fail('recipe definition/version/source binding mismatch');
        if (!Array.isArray(row.errors) || row.errors.length) fail('runtime/network error');
        const g = row.geometry || {};
        if (
            g.rendererCount !== (expected.route === 'shared' ? expected.count : 1) ||
            g.meshCount !== 1 ||
            g.materialCount !== 1 ||
            g.cameraCount !== 1
        )
            fail('fixed geometry/material/camera conditions violated');
        if (
            !Array.isArray(g.materials) ||
            g.materials.length !== 1 ||
            g.materials.some(
                (m) =>
                    m?.effect !== 'builtin-unlit' ||
                    m.passCount !== 1 ||
                    m.blend !== false ||
                    m.batchingScheme !== (expected.instancing ? 1 : 0),
            )
        )
            fail('material/pass not the controlled opaque unlit condition');
        if (
            !Array.isArray(g.meshes) ||
            g.meshes.length !== 1 ||
            g.meshes.some(
                (m) =>
                    m?.primitiveCount !== 1 ||
                    m.vertices !== (expected.route === 'shared' ? 4 : expected.count * 4) ||
                    m.indices !== (expected.route === 'shared' ? 6 : expected.count * 6),
            )
        )
            fail('actual vertex/index/primitive count mismatch');
        const pixels = row.pixels || {};
        if (
            !Number.isFinite(pixels.lit) ||
            pixels.lit <= 300 ||
            pixels.width !== 1280 ||
            pixels.height !== 720 ||
            pixels.dpr !== 1
        )
            fail('actual pixels/framebuffer missing or empty');
        if (expected.route === 'dynamic' && (!Number.isFinite(pixels.changed) || pixels.changed <= 100))
            fail('dynamic geometry has no actual frame change');
        const stats = row.measurement || {};
        if (
            stats.samples !== 120 ||
            stats.warmupFrames !== 30 ||
            stats.count !== expected.count ||
            stats.route !== expected.route ||
            stats.instancing !== expected.instancing
        )
            fail('measurement scope/sample count mismatch');
        if (!Array.isArray(stats.draws) || stats.draws[0] !== expected.draws || stats.draws[1] !== expected.draws)
            fail('actual draw range mismatch');
        for (const key of ['frameIntervalMs', 'cpuRenderSubmissionMs', 'cpuDynamicUpdateMs']) {
            if (
                !stats[key] ||
                !Number.isFinite(stats[key].p50) ||
                !Number.isFinite(stats[key].p95) ||
                stats[key].p50 < 0 ||
                stats[key].p95 < stats[key].p50
            )
                fail(`${key} invalid finite statistics`);
        }
        if (stats.gpuTimeMs !== null || stats.presentTiming !== null || !String(stats.timingScope).includes('no GPU'))
            fail('CPU/rAF scope must explicitly disclose unavailable GPU/present');
        if (
            !Array.isArray(row.rawSamples) ||
            row.rawSamples.length !== 120 ||
            row.rawSamples.some(
                (s) =>
                    !Number.isFinite(s.intervalMs) ||
                    s.intervalMs <= 0 ||
                    !Number.isFinite(s.submissionMs) ||
                    s.submissionMs < 0 ||
                    s.draws !== expected.draws,
            )
        )
            fail('120 finite actual frame samples required');
        const life = row.lifecycle || {};
        if (
            life.held !== 2 ||
            life.released !== true ||
            life.reloaded !== true ||
            !Array.isArray(life.leaked) ||
            life.leaked.length ||
            !Array.isArray(life.errors) ||
            life.errors.length ||
            !Number.isFinite(row.restoredPixels) ||
            row.restoredPixels <= 300
        )
            fail('owned assets release/rebuild not proven');
        if (!row.screenshot || !artifact(row.screenshot)) fail('missing or stale screenshot bytes');
    }
    return errors;
}
module.exports = { SCOPE, RECIPES, CASES, ROOT, fingerprints, validateEvidence, fullHash };
