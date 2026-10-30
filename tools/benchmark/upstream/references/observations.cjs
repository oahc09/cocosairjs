/** Protected independent AU observation oracle. No engine imports or generated answers.
 * Synthetic unit inputs exercise assertions only; they are never reference execution evidence.
 */
const assert = require('node:assert/strict');
const SCHEMA = 'upstream-agent-observation/1';
const THRESHOLDS = Object.freeze({ state: 1e-5, flatROIBytes: 2, aabbRelative: 1e-5, lifecycleCycles: 30 });
const TASK_IDS = Array.from({ length: 12 }, (_, i) => `AU${String(i + 1).padStart(2, '0')}`);
const CASES = Object.freeze({
    AU01: ['load', 'failure'],
    AU02: ['policy-matrix', 'override', 'cross-origin'],
    AU03: ['delayed-buffer', 'survivor-retry'],
    AU04: ['three-instances', 'destroy-first'],
    AU05: ['owned-uv-transform'],
    AU06: ['film-matrix', 'linear-rg', 'invalid-values'],
    AU07: ['opaque-first', 'transparent-first', 'source-over-forward', 'source-over-reverse'],
    AU08: ['same-size-A-B-A', 'resize-A', 'recreate-B'],
    AU09: ['RGB', 'RGBA'],
    AU10: ['thirty-cycles'],
    AU11: ['cold', 'delayed-resource', 'offscreen', 'shader-failure', 'context-lost'],
    AU12: ['installed-esm', 'strict-types', 'vite', 'dom-free-math', 'decoder-paths'],
});
function contractId(id) {
    assert(TASK_IDS.includes(id), 'unknown AU task');
    return `${SCHEMA}:${id}`;
}
function finite(v, label = 'finite scalar required') {
    assert(Number.isFinite(v), label);
    return v;
}
function vector(value, count, label) {
    assert(Array.isArray(value) && value.length === count, label || 'vector length');
    value.forEach((v) => finite(v));
    return value;
}
function near(a, b, tolerance = THRESHOLDS.state) {
    finite(a);
    finite(b);
    assert(Math.abs(a - b) <= tolerance, `${a} differs from ${b} by more than ${tolerance}`);
}
function sameVector(a, b, tolerance) {
    vector(a, b.length);
    a.forEach((v, i) => near(v, b[i], tolerance));
}
function pixels(value) {
    assert(Array.isArray(value) && value.length >= 4 && value.length % 4 === 0, 'RGBA8 flat ROI required');
    assert(
        value.every((v) => Number.isInteger(v) && v >= 0 && v <= 255),
        'RGBA8 byte range',
    );
    return value;
}
function pixelEqual(a, b) {
    pixels(a);
    pixels(b);
    assert.equal(a.length, b.length, 'same predeclared flat ROI');
    sameVector(a, b, THRESHOLDS.flatROIBytes);
}
function nonblank(value) {
    pixels(value);
    assert(
        value.some((v, i) => i % 4 !== 3 && v > 8),
        'blank RGB observation',
    );
}
function identity(value) {
    assert(typeof value === 'string' && value.length > 0, 'collector identity required');
    return value;
}
function sha(value) {
    assert(typeof value === 'string' && /^[0-9a-f]{64}$/.test(value), 'SHA256 required');
}
function exactIds(rows, ids) {
    assert(Array.isArray(rows), 'case rows required');
    assert.deepEqual(rows.map((r) => r.id).sort(), [...ids].sort(), 'exact duplicate-free case inventory');
}
/** glTF KHR_texture_transform convention, independently evaluated as scalar arithmetic. */
function uvPoint(point, { offset, scale, rotation }) {
    vector(point, 2);
    vector(offset, 2);
    vector(scale, 2);
    finite(rotation);
    const x = point[0] * scale[0],
        y = point[1] * scale[1];
    return [
        offset[0] + Math.cos(rotation) * x - Math.sin(rotation) * y,
        offset[1] + Math.sin(rotation) * x + Math.cos(rotation) * y,
    ];
}
function sourceOver(front, back) {
    vector(front, 4);
    vector(back, 4);
    const a = front[3];
    return [0, 1, 2].map((i) => front[i] * a + back[i] * (1 - a)).concat(a + back[3] * (1 - a));
}
function film(rgba, factor = 0.8, min = 80, max = 670) {
    pixels(rgba);
    assert.equal(rgba.length, 4);
    return { factor: (factor * rgba[0]) / 255, thickness: min + ((max - min) * rgba[1]) / 255 };
}
/** Scalar quaternion hierarchy; adapted from the pre-existing independent U05 oracle. */
function worldPoint(point, chain) {
    let [x, y, z] = vector(point, 3);
    assert(Array.isArray(chain));
    for (const node of chain) {
        const p = vector(node.position, 3),
            s = vector(node.scale, 3),
            q = vector(node.rotation, 4);
        x *= s[0];
        y *= s[1];
        z *= s[2];
        const tx = 2 * (q[1] * z - q[2] * y),
            ty = 2 * (q[2] * x - q[0] * z),
            tz = 2 * (q[0] * y - q[1] * x);
        [x, y, z] = [
            x + q[3] * tx + q[1] * tz - q[2] * ty + p[0],
            y + q[3] * ty + q[2] * tx - q[0] * tz + p[1],
            z + q[3] * tz + q[0] * ty - q[1] * tx + p[2],
        ];
    }
    return [x, y, z];
}
const BASE = [
    [-1, -1, 0],
    [1, -1, 0],
    [0, 1, 0],
];
const WEIGHTS = [
    [1, 0],
    [0, 1],
    [0.25, 0.75],
];
function skinnedVertices(chains, weight) {
    assert(Array.isArray(chains) && chains.length === 2);
    finite(weight);
    return BASE.map((position, i) => {
        const p = position.map((v, axis) => v + (i === 2 && axis === 1 ? 0.75 * weight : 0));
        const transformed = chains.map((chain) => worldPoint(p, chain));
        return [0, 1, 2].map((axis) => transformed[0][axis] * WEIGHTS[i][0] + transformed[1][axis] * WEIGHTS[i][1]);
    });
}
function assertBounds(bounds, vertices) {
    vector(bounds.min, 3);
    vector(bounds.max, 3);
    const min = [0, 1, 2].map((a) => Math.min(...vertices.map((p) => p[a])));
    const max = [0, 1, 2].map((a) => Math.max(...vertices.map((p) => p[a])));
    const tolerance = THRESHOLDS.aabbRelative * Math.max(1, Math.hypot(...min.map((v, a) => max[a] - v)));
    vertices.forEach((p) =>
        p.forEach((v, a) => {
            assert(bounds.min[a] <= bounds.max[a], 'reversed AABB');
            assert(
                v >= bounds.min[a] - tolerance && v <= bounds.max[a] + tolerance,
                'independent skinned vertex outside AABB',
            );
        }),
    );
    return tolerance;
}
function snapshot(s) {
    vector(s.bone, 3);
    finite(s.weight);
}
function settlement(row) {
    assert(Array.isArray(row.submissions) && row.submissions.length >= 2, 'two actual render submissions required');
    assert(row.submissions.every(Number.isSafeInteger));
    assert(row.submissions[1] > row.submissions[0], 'settlement cannot be same-frame or sleep-only');
}
function validateObservation(report) {
    assert.equal(report?.schema, SCHEMA);
    const id = report.taskId;
    assert.equal(report.contractId, contractId(id));
    assert(['cocosair', 'three'].includes(report.engine));
    assert.equal(report.status, 'OBSERVED_NOT_VALIDATED');
    exactIds(report.cases, CASES[id]);
    const rows = Object.fromEntries(report.cases.map((r) => [r.id, r]));
    switch (id) {
        case 'AU01': {
            const r = rows.load;
            assert.equal(r.resourceSha256, '390bd62799e00d3ee72779835b3a2e0a23eabc37a02bfcb8df6b737780023568');
            assert(r.sceneRoots > 0 && r.meshes > 0);
            nonblank(r.pixels);
            const f = rows.failure;
            assert(Number.isInteger(f.httpStatus) && f.httpStatus >= 400 && f.httpStatus <= 599);
            assert.equal(f.attachedRoots, 0);
            identity(f.errorMessage);
            break;
        }
        case 'AU02': {
            const r = rows['policy-matrix'];
            assert.equal(r.prioritySchedulingClaim, false, 'fetch priority is a hint, never speed proof');
            const expected = ['auto', 'low', 'high'].flatMap((priority) =>
                ['default', 'no-store', 'reload', 'no-cache', 'force-cache', 'only-if-cached'].flatMap((cache) =>
                    ['document', 'buffer', 'image'].map((role) => `${priority}/${cache}/${role}`),
                ),
            );
            exactIds(r.calls, expected);
            for (const call of r.calls) {
                const [priority, cache, role] = call.id.split('/');
                assert.equal(call.priority, priority);
                assert.equal(call.cache, cache);
                assert.equal(call.role, role);
                assert.equal(new URL(call.url).origin, r.origin);
                if (cache === 'only-if-cached') assert.equal(call.mode, 'same-origin');
            }
            assert.deepEqual(rows.override.effective, {
                priority: 'auto',
                cache: 'default',
                headers: { 'x-fixture': 'local' },
            });
            const overrides = rows.override;
            const roles = (calls) =>
                assert.deepEqual(calls.map((call) => call.role).sort(), ['buffer', 'document', 'image']);
            assert.deepEqual(overrides.credentialObservations.map((row) => row.requested).sort(), [
                'include',
                'omit',
                'same-origin',
            ]);
            for (const row of overrides.credentialObservations) {
                roles(row.calls);
                row.calls.forEach((call) => {
                    assert.equal(call.credentials, row.requested);
                    assert.equal(call.headers['x-benchmark-fixture'], 'public-synthetic');
                });
            }
            assert.equal(overrides.headerSnapshotObservation.mutatedOriginal['x-fixture'], 'after-configuration');
            roles(overrides.headerSnapshotObservation.calls);
            overrides.headerSnapshotObservation.calls.forEach((call) =>
                assert.equal(call.headers['x-fixture'], 'before-configuration'),
            );
            const isolated = overrides.configuredConsumerObservation;
            assert.equal(isolated.sameAsset, false);
            assert.equal(isolated.sameRoot, false);
            assert.equal(isolated.nativeCacheHasConfiguredAsset, report.engine === 'cocosair' ? false : null);
            assert.equal(isolated.calls.length, 6);
            isolated.calls.forEach((call) => assert.equal(call.cache, 'no-store'));
            const native = overrides.optionFreeNativeObservation;
            assert.equal(native.api, 'GLTFLoader().loadAsync');
            for (const name of ['sameAsset', 'sameRoot', 'nativeCacheEntryPresent'])
                assert.equal(typeof native[name], 'boolean');
            assert.equal(native.sameRoot, false);
            assert.equal(typeof native.nativeCacheEnabled, report.engine === 'three' ? 'boolean' : 'object');
            if (report.engine === 'cocosair') assert.equal(native.nativeCacheEnabled, null);
            assert(Array.isArray(native.calls), 'retain native actual requests without inventing cache equivalence');
            assert.equal(r.httpCacheObservations.length, 18);
            const matrixIDs = new Set();
            r.httpCacheObservations.forEach((row) => {
                matrixIDs.add(`${row.priority}/${row.cache}`);
                assert(Number.isSafeInteger(row.serverEntriesBefore) && row.serverEntriesBefore >= 0);
                assert(
                    Number.isSafeInteger(row.serverEntriesAfter) && row.serverEntriesAfter >= row.serverEntriesBefore,
                );
                roles(row.requests);
            });
            assert.deepEqual(
                [...matrixIDs].sort(),
                ['auto', 'low', 'high']
                    .flatMap((priority) =>
                        ['default', 'no-store', 'reload', 'no-cache', 'force-cache', 'only-if-cached'].map(
                            (cache) => `${priority}/${cache}`,
                        ),
                    )
                    .sort(),
            );
            assert.equal(rows['cross-origin'].documentHeaders['x-fixture'], 'origin-only');
            assert.equal(rows['cross-origin'].dependencyHeaders['x-fixture'], undefined);
            break;
        }
        case 'AU03': {
            for (const r of Object.values(rows)) {
                assert.equal(r.errorName, 'AbortError');
                assert.equal(r.abortedAttachedRoots, 0);
                assert.equal(r.lateAttachedRoots, 0);
                assert.equal(r.progressAfterAbort, 0);
                assert.equal(r.remainingOwnedResources, 0);
                assert.equal(r.retryAttachedRoots, 1);
                nonblank(r.retryPixels);
                if (r.id === 'survivor-retry') {
                    assert.equal(r.survivorAttachedRoots, 1);
                    assert.deepEqual(r.survivorBefore, r.survivorAfter);
                }
            }
            break;
        }
        case 'AU04': {
            const r = rows['three-instances'];
            assert.equal(r.instances.length, 3);
            for (const field of ['rootId', 'skeletonId', 'mixerId'])
                assert.equal(
                    new Set(r.instances.map((v) => identity(v[field]))).size,
                    3,
                    `${field} must be independent`,
                );
            for (const field of ['geometryId', 'textureId', 'clipId'])
                assert.equal(new Set(r.instances.map((v) => identity(v[field]))).size, 1, `${field} must be shared`);
            r.instances.forEach((v, i) => {
                snapshot(v);
                near(v.weight, [0.125, 0.375, 0.75][i]);
                near(v.bone[0], [0.25, 0.75, 1.5][i]);
                sameVector(v.ancestor.position, [(i - 1) * 2.5, 0, 0]);
                sameVector(
                    v.ancestor.scale,
                    [
                        [0.5, 0.5, 1],
                        [0.75, 0.3, 1],
                        [-0.5, 0.75, 1],
                    ][i],
                );
            });
            assert.equal(rows['destroy-first'].remaining.length, 2);
            rows['destroy-first'].remaining.forEach((v, i) => assert.deepEqual(v, r.instances[i + 1]));
            assert.equal(rows['destroy-first'].sharedResourceDisposeEvents, 0);
            nonblank(rows['destroy-first'].pixels);
            break;
        }
        case 'AU05': {
            const r = rows['owned-uv-transform'];
            const transform = { offset: [0.2, -0.1], scale: [2, 0.5], rotation: 0.7 };
            assert.deepEqual(r.transform, transform);
            assert.equal(r.points.length, 4);
            [
                [0, 0],
                [1, 0],
                [0, 1],
                [0.25, 0.75],
            ].forEach((p, i) => sameVector(r.points[i], uvPoint(p, transform)));
            assert.deepEqual(r.unmodifiedBefore, r.unmodifiedAfter);
            assert.notEqual(identity(r.ownedMaterialId), identity(r.sharedMaterialId));
            pixelEqual(r.mutatedPixels, r.freshPixels);
            nonblank(r.freshPixels);
            assert(r.initialPixels.some((v, i) => Math.abs(v - r.mutatedPixels[i]) > 2));
            break;
        }
        case 'AU06': {
            const r = rows['film-matrix'];
            const expected = [false, true].flatMap((textured) =>
                [1, 1.2, 1.3, 2.33334, 2.5].map((ior) => `${textured}/${ior}`),
            );
            exactIds(r.samples, expected);
            r.samples.forEach((s) => {
                const ior = Number(s.id.split('/')[1]);
                sameVector(s.state, [0.95, ior, 80, 670]);
                pixelEqual(s.mutatedPixels, s.freshPixels);
                nonblank(s.freshPixels);
            });
            const rg = rows['linear-rg'],
                oracle = film([64, 192, 128, 255]);
            near(rg.factor, oracle.factor);
            near(rg.thickness, oracle.thickness);
            assert.equal(rg.textureColorSpace, 'linear-data');
            near(rg.noThicknessTexture, 670);
            assert.deepEqual(rg.volumeBefore, rg.volumeAfter);
            pixelEqual(rg.texturedPixels, rg.constantPixels);
            pixelEqual(rg.noThicknessPixels, rg.noThicknessMinChangedPixels);
            pixelEqual(rg.volumeBeforePixels, rg.volumeAfterPixels);
            const invalid = rows['invalid-values'];
            exactIds(invalid.attempts, [
                'negative-factor',
                'factor-over-one',
                'ior-below-one',
                'negative-thickness',
                'reversed-thickness',
                'nonfinite',
            ]);
            invalid.attempts.forEach((s) => {
                assert.equal(s.rejected, true);
                assert.deepEqual(s.before, s.after);
            });
            break;
        }
        case 'AU07': {
            for (const name of ['opaque-first', 'transparent-first']) {
                const r = rows[name];
                assert.notEqual(identity(r.opaqueMaterialId), identity(r.transparentMaterialId));
                pixelEqual(r.opaqueAlone, r.opaqueTogether);
                pixelEqual(r.transparentAlone, r.transparentTogether);
                assert(r.opaqueAlone[0] > 240 && r.transparentAlone[2] > 110);
            }
            for (const reverse of [false, true]) {
                const a = 128 / 255,
                    red = [1, 0, 0, a],
                    blue = [0, 0, 1, a];
                const expected = sourceOver(reverse ? red : blue, sourceOver(reverse ? blue : red, [0, 0, 0, 1]));
                sameVector(
                    pixels(rows[`source-over-${reverse ? 'reverse' : 'forward'}`].pixels),
                    expected.map((v) => v * 255),
                    2,
                );
            }
            break;
        }
        case 'AU08': {
            const r = rows['same-size-A-B-A'];
            assert.notEqual(identity(r.targetIds[0]), identity(r.targetIds[1]));
            assert.notEqual(identity(r.cameraIds[0]), identity(r.cameraIds[1]));
            assert.deepEqual(r.sizes, [
                [128, 64],
                [128, 64],
            ]);
            assert.equal(r.sequence.length, 3);
            pixelEqual(r.sequence[0], r.sequence[2]);
            sameVector(r.sequence[0], [255, 0, 0, 255], 2);
            sameVector(r.sequence[1], [0, 0, 255, 255], 2);
            assert.deepEqual(rows['resize-A'].sizes, [
                [256, 128],
                [128, 64],
            ]);
            assert.deepEqual(rows['resize-A'].cameraTargets, r.targetIds);
            const replacement = rows['recreate-B'];
            assert.notEqual(identity(replacement.newId), r.targetIds[1]);
            assert.equal(replacement.oldDisposeEvents, 1);
            sameVector(replacement.pixels, [0, 0, 255, 255], 2);
            break;
        }
        case 'AU09': {
            for (const r of Object.values(rows)) {
                sameVector(r.camera.position, [0, 0, 10]);
                near(r.camera.verticalHalfExtent, 4);
                near(r.camera.aspect, 640 / 360);
                assert.equal(r.instances.length, 3);
                r.instances.forEach((s, i) => {
                    near(s.weight, [0.125, 0.375, 0.75][i]);
                    const parent = s.jointChains[0].at(-1);
                    sameVector(
                        parent.scale,
                        [
                            [0.5, 0.5, 1],
                            [0.75, 0.3, 1],
                            [-0.5, 0.75, 1],
                        ][i],
                    );
                    near(parent.position[0], (i - 1) * 2.5);
                    assertBounds(s.bounds, skinnedVertices(s.jointChains, s.weight));
                });
                assert.equal(r.frustum.length, 12);
                r.frustum.forEach((s, i) => {
                    const weight = [-1, 0, 1][Math.floor(i / 4)],
                        x = [-8, 0, 8, 0][i % 4];
                    near(s.weight, weight);
                    near(s.x, x);
                    sameVector(s.jointChains[0].at(-1).scale, [0.5, 0.5, 1]);
                    near(s.jointChains[0][0].position[0], 0.25);
                    assertBounds(s.bounds, skinnedVertices(s.jointChains, weight));
                    assert(Number.isSafeInteger(s.coloredPixels) && s.coloredPixels >= 0);
                    assert(
                        Number.isSafeInteger(s.drawCalls) && s.drawCalls >= 0,
                        'actual engine submission count required',
                    );
                    if (x === 0) {
                        assert(s.coloredPixels > 30);
                        assert(s.drawCalls > 0);
                    } else {
                        assert.equal(s.coloredPixels, 0);
                        assert.equal(s.drawCalls, 0, 'outside-frustum object must be culled before draw submission');
                    }
                });
            }
            break;
        }
        case 'AU10': {
            const r = rows['thirty-cycles'];
            assert.equal(r.totalGpuMemoryBytes, null, 'owned counters are not total GPU memory');
            assert.equal(r.cycles.length, THRESHOLDS.lifecycleCycles);
            assert.equal(r.survivorCount, 2);
            const keys = ['roots', 'materials', 'textures', 'geometries', 'listeners'];
            for (const key of keys)
                assert(r.baseline[key] === null || (Number.isSafeInteger(r.baseline[key]) && r.baseline[key] >= 0));
            for (const key of ['roots', 'materials', 'listeners'])
                assert.notEqual(r.baseline[key], null, 'explicitly owned handle count required');
            r.cycles.forEach((s, i) => {
                assert.equal(s.cycle, i);
                settlement(s);
                assert.equal(s.releaseErrors.length, 0);
                assert.equal(s.load?.completed, true);
                identity(s.load?.assetId);
                identity(s.load?.url);
                assert.equal(s.releaseCalls, 2);
                assert.notDeepEqual(s.beforeChange, s.afterChange, 'cycle must actually change state');
                assert.equal(s.survivorBefore?.length, 2);
                assert.deepEqual(s.survivorBefore, s.survivorAfter);
                pixelEqual(s.survivorBeforePixels, s.survivorAfterPixels);
                nonblank(s.survivorAfterPixels);
                for (const key of keys)
                    assert.equal(s.retained[key], r.baseline[key], `${key} retention at cycle ${i}`);
            });
            break;
        }
        case 'AU11': {
            for (const r of Object.values(rows)) {
                assert.deepEqual(r.businessBefore, r.businessAfter, 'observer advanced frozen business state');
                if (['shader-failure', 'context-lost'].includes(r.id)) {
                    assert.equal(r.terminal, 'FAILED');
                    assert.equal(r.failureSource, r.id);
                    assert.equal(r.presented, false);
                    continue;
                }
                assert.equal(r.terminal, 'READY');
                assert.deepEqual(r.stages, [
                    'engine-created',
                    'declared-resources',
                    'scene-passes',
                    'frame-submitted',
                    'browser-presented',
                ]);
                identity(r.submissionId);
                assert.equal(r.presentation.submissionId, r.submissionId);
                assert.equal(r.presentation.source, 'browser-compositor');
                sha(r.presentation.sha256);
                nonblank(r.presentation.pixels);
                pixelEqual(r.presentation.pixels, r.readbackPixels);
                assert.deepEqual(r.observerAuthority, {
                    kind: 'receipt-only',
                    render: false,
                    compile: false,
                    advance: false,
                });
            }
            break;
        }
        case 'AU12': {
            const esm = rows['installed-esm'];
            sha(esm.packageSha256);
            assert.equal(esm.resolutionOrigin, 'isolated-installed-package');
            assert.equal(esm.engineModuleIdentities.length, 1);
            identity(esm.engineModuleIdentities[0]);
            const types = rows['strict-types'];
            assert.equal(types.compilerContract, 'upstream-sdk-types/3', 'current SDK compiler contract required');
            assert.equal(types.fixtureScope, 'paired-common/1', 'paired common SDK fixture scope required');
            const commonModeIds = ['5.9.3/node16', '5.9.3/bundler'];
            // TS 4.9 is the Cocos compatibility floor, not the paired upstream compiler contract.
            const compatibilityModeIds = report.engine === 'cocosair' ? ['4.9.5/node', '4.9.5/node16'] : [];
            assert.deepEqual(types.commonModeIds, commonModeIds, 'exact common SDK compiler modes required');
            assert.deepEqual(
                types.compatibilityModeIds,
                compatibilityModeIds,
                'exact engine-specific SDK compatibility modes required',
            );
            const modeIds = [...compatibilityModeIds, ...commonModeIds];
            assert.equal(types.strictNullChecks, true);
            assert.equal(types.skipLibCheck, true);
            exactIds(types.modes, modeIds);
            const categories =
                report.engine === 'cocosair'
                    ? [
                          'nullable',
                          'lifecycle-return',
                          'type-only-runtime-export',
                          'error-code',
                          'math-entry-boundary',
                          'native-input-shapes',
                          'ownership-readonly',
                      ]
                    : [
                          'nullable',
                          'lifecycle-return',
                          'request-policy',
                          'type-only-runtime-export',
                          'math-entry-boundary',
                          'native-input-shapes',
                      ];
            assert.deepEqual([...types.negativeCategories].sort(), [...categories].sort());
            sha(types.fixtureSource.sha256);
            sha(types.fixtureSource.generatedSha256);
            if (report.engine === 'cocosair') {
                assert.equal(types.fixtureSource.path, 'test/fixtures/upstream-sdk/paired-common.ts');
                assert.equal(types.fixtureSource.originalNegativeCases, 21);
                assert.equal(
                    types.negativeCases,
                    23,
                    'retain all 21 paired native negatives plus two common type-only value probes',
                );
            }
            types.modes.forEach((mode) => {
                assert.equal(mode.strictNullChecks, true);
                assert.equal(mode.skipLibCheck, true);
                assert.equal(mode.diagnostics.length, 0);
                assert.equal(mode.negativeCases, types.negativeCases);
                assert.equal(mode.negativeControls.length, mode.negativeCases);
                assert.deepEqual([...mode.negativeCategories].sort(), [...categories].sort());
                assert.deepEqual(
                    [...new Set(mode.negativeControls.map((row) => row.category))].sort(),
                    [...categories].sort(),
                );
                mode.negativeControls.forEach((control) => {
                    assert(Number.isSafeInteger(control.line) && control.line > 0);
                    identity(control.description);
                    assert(
                        control.diagnostics.length > 0,
                        'removed @ts-expect-error directive must produce a real compiler diagnostic',
                    );
                    control.diagnostics.forEach((diagnostic) =>
                        assert(Number.isSafeInteger(diagnostic.code) && diagnostic.code > 0),
                    );
                });
            });
            assert.equal(types.diagnostics.length, 0);
            exactIds(types.parity, modeIds);
            types.parity.forEach((row) =>
                ['missingRuntime', 'missingDeclaration', 'missingMathRuntime', 'missingMathDeclaration'].forEach(
                    (key) => assert.deepEqual(row[key], []),
                ),
            );
            sha(types.declarationPackageSha256);
            assert.equal(rows.vite.exitCode, 0);
            assert.equal(rows.vite.runtimeErrors.length, 0);
            nonblank(rows.vite.pixels);
            const browsers = [...esm.browserModes, ...rows.vite.browserModes];
            assert.deepEqual(
                browsers.map((row) => row.mode).sort(),
                (report.engine === 'cocosair'
                    ? ['importmap-unminified', 'importmap-minified', 'vite-development', 'vite-production']
                    : ['importmap-unminified', 'vite-development', 'vite-production']
                ).sort(),
            );
            browsers.forEach((row) => {
                assert.equal(row.engineModuleIdentities.length, 1);
                identity(row.engineModuleIdentities[0]);
                assert.deepEqual(row.runtimeErrors, []);
                assert.deepEqual(row.typeOnlyRuntimeExports, []);
                assert.equal(row.presentation.source, 'browser-compositor');
                sha(row.presentation.sha256);
                pixelEqual(row.pixels, row.presentation.pixels);
                nonblank(row.presentation.pixels);
                assert(row.closeReceipt, 'actual native fixture close result required');
                row.defaultRequests.forEach((url) =>
                    assert.equal(
                        new URL(url).origin,
                        row.decoders.declaredOrigin,
                        'undeclared decoder/CDN network fallback',
                    ),
                );
            });
            const math = rows['dom-free-math'];
            assert.deepEqual(math.globalsBefore, math.globalsAfter);
            near(math.vectorLength, 13);
            sameVector(math.matrixTransformedVector, [5, 7, 16]);
            assert.equal(math.renderModuleImported, false);
            const decoders = rows['decoder-paths'];
            exactIds(decoders.resources, ['draco', 'meshopt', 'basis']);
            exactIds(decoders.missingFiles, ['draco', 'meshopt', 'basis']);
            exactIds(decoders.missingProviders, ['draco', 'meshopt', 'basis']);
            decoders.missingFiles.forEach((row) => assert.equal(row.status, 404));
            decoders.missingProviders.forEach((row) => {
                assert.equal(row.rejected, true);
                identity(row.message);
                if (report.engine === 'cocosair') assert.equal(row.code, 'GLTF_DECODER_MISSING');
            });
            decoders.resources.forEach((r) => {
                assert.equal(r.origin, decoders.declaredOrigin);
                sha(r.sha256);
                assert.equal(r.status, 200);
            });
            break;
        }
    }
    return {
        validated: true,
        contractId: contractId(id),
        thresholds: THRESHOLDS,
        scope: 'Observation validation only. Does not authenticate provenance or establish browser/reference execution.',
    };
}
module.exports = {
    SCHEMA,
    TASK_IDS,
    CASES,
    THRESHOLDS,
    contractId,
    uvPoint,
    sourceOver,
    film,
    worldPoint,
    skinnedVertices,
    assertBounds,
    validateObservation,
};
