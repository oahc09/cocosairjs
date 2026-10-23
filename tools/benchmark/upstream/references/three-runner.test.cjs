/** CPU-only admission tests. No test below is browser/reference execution evidence. */
const assert = require('node:assert/strict');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const load = () => import(pathToFileURL(path.join(__dirname, 'three-runner.mjs')).href);

test('import and coverage inspection do not require a browser or invoke rendering', async () => {
    const runner = await load();
    const coverage = runner.threeReferenceCoverage();
    assert.deepEqual(coverage.executableTaskIds, ['AU04', 'AU05', 'AU06', 'AU07', 'AU08', 'AU09', 'AU10']);
    assert.equal(coverage.browserExecution, 'NOT_EXECUTED_BY_SOURCE_PREPARATION');
    assert.match(coverage.filmScalarScope, /not physical-shader instrumentation/);
    assert.match(coverage.lifecycleScope, /not total renderer or GPU memory/);
    coverage.executableTaskIds.length = 0;
    assert.equal(runner.threeReferenceCoverage().executableTaskIds.length, 7);
});

test('every unsupported task fails before accessing THREE or canvas', async () => {
    const { runThreeReference, UnsupportedThreeReferenceError, threeReferenceCoverage } = await load();
    const options = new Proxy(
        {},
        {
            get() {
                throw new Error('Unsupported task accessed runtime options');
            },
        },
    );
    for (const taskId of Object.keys(threeReferenceCoverage().unsupportedTasks)) {
        await assert.rejects(runThreeReference(taskId, options), (error) => {
            assert(error instanceof UnsupportedThreeReferenceError);
            assert.equal(error.taskId, taskId);
            assert.equal(error.code, 'THREE_REFERENCE_UNSUPPORTED');
            return true;
        });
    }
});

test('unknown task IDs cannot fall through to any renderer', async () => {
    const { runThreeReference } = await load();
    await assert.rejects(runThreeReference('AU00'), /Unknown task ID/);
    await assert.rejects(runThreeReference('AU13'), /Unknown task ID/);
});

test('resource tasks require the pinned native GLTFLoader instead of substituting generated assets', async () => {
    const { runThreeReference } = await load();
    for (const id of ['AU04', 'AU05', 'AU06', 'AU09', 'AU10']) {
        await assert.rejects(runThreeReference(id), /pinned public GLTFLoader/);
    }
});

test('AU05 fails closed for missing checker resource before requiring a browser', async () => {
    const { runThreeReference } = await load();
    await assert.rejects(
        runThreeReference('AU05', {
            GLTFLoader: function NeverConstructed() {
                throw new Error('Loader unexpectedly constructed');
            },
            resourceURLs: { 'inspection-rig': '/assets/showroom/inspection-rig.gltf' },
        }),
        /resourceURLs\['checker'\]/,
    );
});

test('AU06 requires the frozen linear film resource rather than synthesizing its pixel', async () => {
    const { runThreeReference } = await load();
    await assert.rejects(
        runThreeReference('AU06', {
            GLTFLoader: function NeverConstructed() {
                throw new Error('Loader unexpectedly constructed');
            },
            resourceURLs: {
                'inspection-rig': '/assets/showroom/inspection-rig.gltf',
                checker: '/assets/showroom/checker.png',
            },
        }),
        /resourceURLs\['linear-film-rg'\]/,
    );
});

test('skinned tasks require SkeletonUtils.clone before any browser side effects', async () => {
    const { runThreeReference } = await load();
    for (const id of ['AU04', 'AU09', 'AU10']) {
        await assert.rejects(
            runThreeReference(id, {
                GLTFLoader: function NeverConstructed() {
                    throw new Error('Loader unexpectedly constructed');
                },
                resourceURLs: { 'skin-rig': '/assets/skinning/rig.gltf' },
            }),
            /SkeletonUtils.clone/,
        );
    }
});

test('unbound or wrong-revision runtime does not masquerade as the pinned package', async () => {
    const { runThreeReference } = await load();
    await assert.rejects(runThreeReference('AU07'), /separately hash-verified public three@0.186.1/);
    await assert.rejects(runThreeReference('AU08', { THREE: { REVISION: '180' } }), /three@0.186.1/);
});

test('supported resource-free task still requires an actual caller canvas', async () => {
    const { runThreeReference } = await load();
    await assert.rejects(runThreeReference('AU07', { THREE: { REVISION: '186' } }), /caller-owned browser canvas/);
});

const loadReadiness = () => import(pathToFileURL(path.join(__dirname, 'three-readiness-reference.mjs')).href);

test('readiness source exposes a frozen receipt-only observer authority without importing a browser', async () => {
    const { THREE_READINESS_OBSERVER_AUTHORITY: authority, startThreeReadiness } = await loadReadiness();
    assert(Object.isFrozen(authority));
    assert.deepEqual(authority, { kind: 'receipt-only', render: false, compile: false, advance: false });
    assert.throws(() => startThreeReadiness({ mode: 'unknown' }), /Unknown three readiness mode/);
    assert.throws(() => startThreeReadiness({}), /Pinned public three@0.186.1/);
});

test('readiness missing frozen resources is rejected before creating a WebGL context', async () => {
    const { startThreeReadiness } = await loadReadiness();
    assert.throws(
        () =>
            startThreeReadiness({
                THREE: { REVISION: '186' },
                GLTFLoader() {
                    throw new Error('Must not construct loader');
                },
                canvas: {
                    getContext() {
                        throw new Error('Must not create context');
                    },
                },
                resourceURLs: { 'inspection-rig': '/rig.gltf' },
            }),
        /Missing frozen resourceURLs\['checker'\]/,
    );
});

test('receipt-only observer consumes synthetic promises without gaining renderer or tick authority', async () => {
    const { observeThreeReadinessReceipts } = await loadReadiness();
    const never = new Promise(() => {});
    const business = { animationTime: 0, applicationUpdateCount: 0 };
    let snapshotCalls = 0;
    const report = await observeThreeReadinessReceipts({
        mode: 'cold',
        engine: Promise.resolve({}),
        resources: Promise.resolve({ fixture: 'synthetic-unit' }),
        passes: Promise.resolve({ status: 'available', scope: 'synthetic unit input, never browser evidence' }),
        submission: Promise.resolve({ id: 'synthetic-submission' }),
        presentation: Promise.resolve({ source: 'synthetic-unit-input', submissionId: 'synthetic-submission' }),
        fault: never,
        timeout: never,
        snapshotBusiness() {
            snapshotCalls++;
            return business;
        },
        readSubmission: () => ({ pixels: [1, 2, 3, 255] }),
    });
    assert.equal(report.terminal, 'READY');
    assert.equal(snapshotCalls, 2);
    assert.deepEqual(report.businessBefore, report.businessAfter);
    assert.deepEqual(report.stages, [
        'engine-created',
        'declared-resources',
        'scene-passes',
        'frame-submitted',
        'browser-presented',
    ]);
    assert.equal(report.observerAuthority.render, false);
    assert.equal(report.observerRenderCalls, undefined);
});

test('receipt-only observer preserves a synthetic explicit native-fault classification', async () => {
    const { observeThreeReadinessReceipts } = await loadReadiness();
    const never = new Promise(() => {});
    const report = await observeThreeReadinessReceipts({
        mode: 'shader-failure',
        engine: never,
        resources: never,
        passes: never,
        submission: never,
        presentation: never,
        timeout: never,
        fault: Promise.resolve(
            Object.assign(new Error('Synthetic fault, not real GLSL evidence'), { source: 'shader-failure' }),
        ),
        snapshotBusiness: () => ({ animationTime: 0 }),
        readSubmission: () => ({ pixels: null }),
    });
    assert.equal(report.terminal, 'FAILED');
    assert.equal(report.failureSource, 'shader-failure');
    assert.equal(report.presented, false);
    assert.deepEqual(report.businessBefore, report.businessAfter);
});
