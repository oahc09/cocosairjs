const { validateEvidence, CASES, RECIPES, SCOPE } = require('../../tools/verify/competitive-batching-evidence.cjs');

const inputFiles = [{ path: 'candidate', bytes: 1, sha256: 'a'.repeat(64) }];
function valid() {
    return {
        schema: 'competitive-batching-evidence-v1',
        scope: SCOPE,
        completed: true,
        runId: 'negative-control-fixture',
        measuredAt: '2026-10-03T00:00:00Z',
        result: 'PASS',
        errors: [],
        fingerprints: JSON.parse(JSON.stringify(inputFiles)),
        recipes: RECIPES.map((r: any) => r.id),
        records: CASES.map((c: any) => {
            const recipe = RECIPES.find((r: any) => r.route === c.route);
            return {
                ...c,
                recipeId: recipe.id,
                recipeVersion: recipe.version,
                compositeBenchmarkId: recipe.compositeBenchmarkId,
                errors: [],
                geometry: {
                    rendererCount: c.route === 'shared' ? c.count : 1,
                    meshCount: 1,
                    materialCount: 1,
                    cameraCount: 1,
                    materials: [
                        { effect: 'builtin-unlit', passCount: 1, blend: false, batchingScheme: c.instancing ? 1 : 0 },
                    ],
                    meshes: [
                        {
                            primitiveCount: 1,
                            vertices: c.route === 'shared' ? 4 : c.count * 4,
                            indices: c.route === 'shared' ? 6 : c.count * 6,
                        },
                    ],
                },
                pixels: { lit: 1000, changed: 200, width: 1280, height: 720, dpr: 1 },
                measurement: {
                    count: c.count,
                    route: c.route,
                    instancing: c.instancing,
                    samples: 120,
                    warmupFrames: 30,
                    draws: [c.draws, c.draws],
                    frameIntervalMs: { p50: 16, p95: 17 },
                    cpuRenderSubmissionMs: { p50: 1, p95: 2 },
                    cpuDynamicUpdateMs: { p50: 0, p95: 1 },
                    gpuTimeMs: null,
                    presentTiming: null,
                    timingScope: 'no GPU timing',
                },
                rawSamples: Array.from({ length: 120 }, () => ({ intervalMs: 16, submissionMs: 1, draws: c.draws })),
                lifecycle: { held: 2, released: true, reloaded: true, leaked: [], errors: [] },
                restoredPixels: 1000,
                screenshot: { path: 'fixture.png', bytes: 10, sha256: 'b'.repeat(64) },
            };
        }),
    };
}
const validate = (data: any, artifact = () => true) => validateEvidence(data, { fingerprints: inputFiles, artifact });

describe('competitive batching scoped evidence gate', () => {
    test('accepts only complete fixed-condition evidence for the three recipes and eight cases', () => {
        expect(validate(valid())).toEqual([]);
        const missing = valid();
        missing.records.pop();
        expect(validate(missing).length).toBeGreaterThan(0);
        const duplicate = valid();
        duplicate.records[1] = duplicate.records[0];
        expect(validate(duplicate).length).toBeGreaterThan(0);
    });
    test.each([
        'draw',
        'vertices',
        'material',
        'pass',
        'pixel',
        'motion',
        'samples',
        'nan',
        'life',
        'version',
        'capture',
    ])('rejects corrupted %s evidence', (kind) => {
        const data = valid();
        const row = data.records.find((r: any) => r.route === 'dynamic');
        if (kind === 'draw') row.measurement.draws = [2, 2];
        if (kind === 'vertices') row.geometry.meshes[0].vertices = 1;
        if (kind === 'material') row.geometry.materialCount = 2;
        if (kind === 'pass') row.geometry.materials[0].passCount = 2;
        if (kind === 'pixel') row.pixels.lit = 0;
        if (kind === 'motion') row.pixels.changed = 0;
        if (kind === 'samples') row.rawSamples.pop();
        if (kind === 'nan') row.rawSamples[0].submissionMs = NaN;
        if (kind === 'life') row.lifecycle.leaked = ['live asset'];
        if (kind === 'version') row.recipeVersion = 'wrong';
        if (kind === 'capture') data.captureErrors = ['changed candidate'];
        expect(validate(data).length).toBeGreaterThan(0);
    });
    test('stale candidate and missing screenshot cannot pass', () => {
        const data = valid();
        data.fingerprints[0] = { ...data.fingerprints[0], sha256: 'changed' };
        expect(validate(data).length).toBeGreaterThan(0);
        expect(validate(valid(), () => false).length).toBeGreaterThan(0);
    });
    test('does not treat legacy or incomplete scope as current three-recipe verification', () => {
        const data = valid();
        data.scope = 'legacy30';
        expect(validate(data).length).toBeGreaterThan(0);
        data.scope = SCOPE;
        data.completed = false;
        expect(validate(data).length).toBeGreaterThan(0);
    });
});
