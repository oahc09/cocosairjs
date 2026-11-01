const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const oracle = require('./references/observations.cjs');
const { validateObservation, contractId, CASES, TASK_IDS, uvPoint, film, sourceOver, skinnedVertices, assertBounds } =
    oracle;
const root = path.resolve(__dirname, '../../..');
const pixel = [80, 100, 120, 255];
const hash = 'a'.repeat(64);
const clone = (value) => structuredClone(value);
// Every value below is synthetic CPU validator input, NEVER browser, reference or benchmark evidence.
function synthetic(id, engine = 'three') {
    const cases = CASES[id].map((name) => ({ id: name })),
        by = Object.fromEntries(cases.map((r) => [r.id, r]));
    const report = {
        schema: oracle.SCHEMA,
        taskId: id,
        contractId: contractId(id),
        engine,
        status: 'OBSERVED_NOT_VALIDATED',
        cases,
    };
    if (id === 'AU01') {
        Object.assign(by.load, {
            resourceSha256: '390bd62799e00d3ee72779835b3a2e0a23eabc37a02bfcb8df6b737780023568',
            sceneRoots: 1,
            meshes: 1,
            pixels: pixel,
        });
        Object.assign(by.failure, { httpStatus: 404, attachedRoots: 0, errorMessage: 'HTTP 404 synthetic fixture' });
    }
    if (id === 'AU02') {
        Object.assign(by['policy-matrix'], {
            prioritySchedulingClaim: false,
            origin: 'http://fixture.test',
            calls: ['auto', 'low', 'high'].flatMap((priority) =>
                ['default', 'no-store', 'reload', 'no-cache', 'force-cache', 'only-if-cached'].flatMap((cache) =>
                    ['document', 'buffer', 'image'].map((role) => ({
                        id: `${priority}/${cache}/${role}`,
                        priority,
                        cache,
                        role,
                        url: `http://fixture.test/${role}`,
                        mode: 'same-origin',
                    })),
                ),
            ),
        });
        by.override.effective = { priority: 'auto', cache: 'default', headers: { 'x-fixture': 'local' } };
        const roles = (extra) => ['document', 'buffer', 'image'].map((role) => ({ role, ...extra }));
        Object.assign(by.override, {
            credentialObservations: ['omit', 'same-origin', 'include'].map((requested) => ({
                requested,
                calls: roles({ credentials: requested, headers: { 'x-benchmark-fixture': 'public-synthetic' } }),
            })),
            headerSnapshotObservation: {
                mutatedOriginal: { 'x-fixture': 'after-configuration' },
                calls: roles({ headers: { 'x-fixture': 'before-configuration' } }),
            },
            configuredConsumerObservation: {
                sameAsset: false,
                sameRoot: false,
                nativeCacheHasConfiguredAsset: null,
                calls: [...roles({ cache: 'no-store' }), ...roles({ cache: 'no-store' })],
            },
            optionFreeNativeObservation: {
                api: 'GLTFLoader().loadAsync',
                sameAsset: false,
                sameRoot: false,
                nativeCacheEntryPresent: false,
                nativeCacheEnabled: false,
                calls: roles({}),
            },
        });
        by['policy-matrix'].httpCacheObservations = ['auto', 'low', 'high'].flatMap((priority) =>
            ['default', 'no-store', 'reload', 'no-cache', 'force-cache', 'only-if-cached'].map((cache) => ({
                priority,
                cache,
                serverEntriesBefore: 0,
                serverEntriesAfter: 3,
                requests: roles({}),
            })),
        );

        Object.assign(by['cross-origin'], { documentHeaders: { 'x-fixture': 'origin-only' }, dependencyHeaders: {} });
    }
    if (id === 'AU03')
        cases.forEach((r) =>
            Object.assign(r, {
                errorName: 'AbortError',
                abortedAttachedRoots: 0,
                lateAttachedRoots: 0,
                progressAfterAbort: 0,
                remainingOwnedResources: 0,
                retryAttachedRoots: 1,
                retryPixels: pixel,
                survivorAttachedRoots: 1,
                survivorBefore: { time: 0.75 },
                survivorAfter: { time: 0.75 },
            }),
        );
    if (id === 'AU04') {
        const instances = [0, 1, 2].map((i) => ({
            rootId: `root${i}`,
            skeletonId: `bones${i}`,
            mixerId: `mixer${i}`,
            geometryId: 'geometry',
            textureId: 'texture',
            clipId: 'clip',
            bone: [[0.25, 0.75, 1.5][i], 0, 0],
            weight: [0.125, 0.375, 0.75][i],
            ancestor: {
                position: [(i - 1) * 2.5, 0, 0],
                scale: [
                    [0.5, 0.5, 1],
                    [0.75, 0.3, 1],
                    [-0.5, 0.75, 1],
                ][i],
            },
        }));
        by['three-instances'].instances = instances;
        Object.assign(by['destroy-first'], {
            remaining: clone(instances.slice(1)),
            sharedResourceDisposeEvents: 0,
            pixels: pixel,
        });
    }
    if (id === 'AU05') {
        const transform = { offset: [0.2, -0.1], scale: [2, 0.5], rotation: 0.7 };
        Object.assign(by['owned-uv-transform'], {
            transform,
            points: [
                [0, 0],
                [1, 0],
                [0, 1],
                [0.25, 0.75],
            ].map((p) => uvPoint(p, transform)),
            unmodifiedBefore: [1, 0, 0],
            unmodifiedAfter: [1, 0, 0],
            ownedMaterialId: 'owned',
            sharedMaterialId: 'shared',
            mutatedPixels: [...pixel],
            freshPixels: [...pixel],
            initialPixels: [10, 30, 40, 255],
        });
    }
    if (id === 'AU06') {
        by['film-matrix'].samples = [false, true].flatMap((textured) =>
            [1, 1.2, 1.3, 2.33334, 2.5].map((ior) => ({
                id: `${textured}/${ior}`,
                state: [0.95, ior, 80, 670],
                mutatedPixels: [...pixel],
                freshPixels: [...pixel],
            })),
        );
        Object.assign(by['linear-rg'], film([64, 192, 128, 255]), {
            textureColorSpace: 'linear-data',
            noThicknessTexture: 670,
            volumeBefore: [0.95, 1.3, 80, 670],
            volumeAfter: [0.95, 1.3, 80, 670],
            texturedPixels: pixel,
            constantPixels: pixel,
            noThicknessPixels: pixel,
            noThicknessMinChangedPixels: pixel,
            volumeBeforePixels: pixel,
            volumeAfterPixels: pixel,
        });
        by['invalid-values'].attempts = [
            'negative-factor',
            'factor-over-one',
            'ior-below-one',
            'negative-thickness',
            'reversed-thickness',
            'nonfinite',
        ].map((name) => ({ id: name, rejected: true, before: [0.95, 1.3, 80, 670], after: [0.95, 1.3, 80, 670] }));
    }
    if (id === 'AU07') {
        for (const name of ['opaque-first', 'transparent-first'])
            Object.assign(by[name], {
                opaqueMaterialId: `${name}-a`,
                transparentMaterialId: `${name}-b`,
                opaqueAlone: [255, 0, 0, 255],
                opaqueTogether: [255, 0, 0, 255],
                transparentAlone: [0, 0, 128, 255],
                transparentTogether: [0, 0, 128, 255],
            });
        by['source-over-forward'].pixels = [64, 0, 128, 255];
        by['source-over-reverse'].pixels = [128, 0, 64, 255];
    }
    if (id === 'AU08') {
        Object.assign(by['same-size-A-B-A'], {
            targetIds: ['a', 'b'],
            cameraIds: ['ca', 'cb'],
            sizes: [
                [128, 64],
                [128, 64],
            ],
            sequence: [
                [255, 0, 0, 255],
                [0, 0, 255, 255],
                [255, 0, 0, 255],
            ],
        });
        Object.assign(by['resize-A'], {
            sizes: [
                [256, 128],
                [128, 64],
            ],
            cameraTargets: ['a', 'b'],
        });
        Object.assign(by['recreate-B'], { newId: 'b2', oldDisposeEvents: 1, pixels: [0, 0, 255, 255] });
    }
    if (id === 'AU09') {
        const state = (weight, x, scale) => ({
            weight,
            x,
            jointChains: [
                [
                    { position: [0.25, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0, 1] },
                    { position: [x, 0, 0], scale, rotation: [0, 0, 0, 1] },
                ],
                [
                    { position: [0.25, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0, 1] },
                    { position: [x, 0, 0], scale, rotation: [0, 0, 0, 1] },
                ],
            ],
            bounds: { min: [x - 2, -2, -0.01], max: [x + 2, 2, 0.01] },
            coloredPixels: x === 0 ? 90 : 0,
            drawCalls: x === 0 ? 1 : 0,
        });
        cases.forEach((r) => {
            r.camera = { position: [0, 0, 10], verticalHalfExtent: 4, aspect: 640 / 360 };
            r.instances = [0, 1, 2].map((i) =>
                state(
                    [0.125, 0.375, 0.75][i],
                    (i - 1) * 2.5,
                    [
                        [0.5, 0.5, 1],
                        [0.75, 0.3, 1],
                        [-0.5, 0.75, 1],
                    ][i],
                ),
            );
            r.frustum = [-1, 0, 1].flatMap((w) => [-8, 0, 8, 0].map((x) => state(w, x, [0.5, 0.5, 1])));
        });
    }
    if (id === 'AU10') {
        const baseline = { roots: 2, materials: 2, textures: 1, geometries: 1, listeners: 0 };
        Object.assign(by['thirty-cycles'], {
            baseline,
            survivorCount: 2,
            totalGpuMemoryBytes: null,
            cycles: Array.from({ length: 30 }, (_, cycle) => ({
                cycle,
                submissions: [cycle * 2, cycle * 2 + 1],
                retained: clone(baseline),
                releaseErrors: [],
                load: { completed: true, assetId: `asset${cycle}`, url: 'http://fixture.test/rig.gltf' },
                releaseCalls: 2,
                beforeChange: { time: 0 },
                afterChange: { time: 0.75 },
                survivorBefore: [{ time: 0.25 }, { time: 0.75 }],
                survivorAfter: [{ time: 0.25 }, { time: 0.75 }],
                survivorBeforePixels: [...pixel],
                survivorAfterPixels: [...pixel],
            })),
        });
    }
    if (id === 'AU11')
        cases.forEach((r) => {
            Object.assign(r, {
                businessBefore: { animation: 0, physics: 0, updates: 0 },
                businessAfter: { animation: 0, physics: 0, updates: 0 },
            });
            if (['shader-failure', 'context-lost'].includes(r.id))
                Object.assign(r, { terminal: 'FAILED', failureSource: r.id, presented: false });
            else
                Object.assign(r, {
                    terminal: 'READY',
                    stages: [
                        'engine-created',
                        'declared-resources',
                        'scene-passes',
                        'frame-submitted',
                        'browser-presented',
                    ],
                    submissionId: 'submit',
                    presentation: { submissionId: 'submit', source: 'browser-compositor', sha256: hash, pixels: pixel },
                    readbackPixels: pixel,
                    observerAuthority: { kind: 'receipt-only', render: false, compile: false, advance: false },
                });
        });
    if (id === 'AU12') {
        const commonModeIds = ['5.9.3/node16', '5.9.3/bundler'];
        const compatibilityModeIds = engine === 'cocosair' ? ['4.9.5/node', '4.9.5/node16'] : [];
        Object.assign(by['installed-esm'], {
            packageSha256: hash,
            resolutionOrigin: 'isolated-installed-package',
            engineModuleIdentities: ['one'],
        });
        Object.assign(by['strict-types'], {
            compilerContract: 'upstream-sdk-types/3',
            fixtureScope: 'paired-common/1',
            commonModeIds,
            compatibilityModeIds,
            strict: true,
            strictNullChecks: true,
            skipLibCheck: true,
            modes: [...compatibilityModeIds, ...commonModeIds].map((id) => ({
                id,
                strictNullChecks: true,
                skipLibCheck: true,
                diagnostics: [],
            })),
            diagnostics: [],
            declarationPackageSha256: hash,
        });
        Object.assign(by.vite, { exitCode: 0, runtimeErrors: [], pixels: pixel });
        Object.assign(by['dom-free-math'], {
            globalsBefore: {},
            globalsAfter: {},
            vectorLength: 13,
            matrixTransformedVector: [5, 7, 16],
            renderModuleImported: false,
        });
        const categories = [
            'nullable',
            'lifecycle-return',
            ...(engine === 'three' ? ['request-policy'] : []),
            'type-only-runtime-export',
            'math-entry-boundary',
            'native-input-shapes',
            ...(engine === 'cocosair' ? ['error-code', 'ownership-readonly'] : []),
        ];
        const types = by['strict-types'];
        types.negativeCategories = categories;
        types.negativeCases = engine === 'cocosair' ? 23 : 7;
        types.fixtureSource = {
            path:
                engine === 'cocosair'
                    ? 'test/fixtures/upstream-sdk/paired-common.ts'
                    : 'sdk-reference.cjs#threeTypeFixture',
            originalNegativeCases: engine === 'cocosair' ? 21 : 7,
            sha256: hash,
            generatedSha256: hash,
        };
        types.modes.forEach((mode) => {
            mode.negativeCases = types.negativeCases;
            mode.negativeCategories = categories;
            mode.negativeControls = Array.from({ length: types.negativeCases }, (_, i) => ({
                category: categories[i % categories.length],
                line: i + 1,
                description: 'synthetic negative',
                diagnostics: [{ code: 2322 }],
            }));
        });
        types.parity = types.modes.map((mode) => ({
            id: mode.id,
            missingRuntime: [],
            missingDeclaration: [],
            missingMathRuntime: [],
            missingMathDeclaration: [],
        }));
        const browser = (mode) => ({
            mode,
            engineModuleIdentities: ['one'],
            runtimeErrors: [],
            typeOnlyRuntimeExports: [],
            pixels: pixel,
            defaultRequests: [],
            closeReceipt: { closed: true },
            decoders: { declaredOrigin: 'http://fixture.test' },
            presentation: { source: 'browser-compositor', sha256: hash, pixels: pixel },
        });
        by['installed-esm'].browserModes = [browser('importmap-unminified')];
        if (engine === 'cocosair') by['installed-esm'].browserModes.push(browser('importmap-minified'));
        by.vite.browserModes = [browser('vite-development'), browser('vite-production')];
        Object.assign(by['decoder-paths'], {
            declaredOrigin: 'http://fixture.test',
            missingFiles: ['draco', 'meshopt', 'basis'].map((id) => ({ id, status: 404 })),
            missingProviders: ['draco', 'meshopt', 'basis'].map((id) => ({
                id,
                rejected: true,
                message: 'No decoder installed',
                ...(engine === 'cocosair' ? { code: 'GLTF_DECODER_MISSING' } : {}),
            })),
            resources: ['draco', 'meshopt', 'basis'].map((name) => ({
                id: name,
                origin: 'http://fixture.test',
                sha256: hash,
                status: 200,
            })),
        });
    }
    return clone(report);
}
const corruptions = {
    AU01: (r) => {
        r.cases[0].pixels = [0, 0, 0, 255];
    },
    AU02: (r) => {
        r.cases[0].calls[0].cache = 'reload';
    },
    AU03: (r) => {
        r.cases[0].lateAttachedRoots = 1;
    },
    AU04: (r) => {
        r.cases[0].instances[1].skeletonId = r.cases[0].instances[0].skeletonId;
    },
    AU05: (r) => {
        r.cases[0].points[0][0] += 0.01;
    },
    AU06: (r) => {
        r.cases[1].thickness = 80;
    },
    AU07: (r) => {
        r.cases[2].pixels = [128, 0, 64, 255];
    },
    AU08: (r) => {
        r.cases[0].targetIds[1] = 'a';
    },
    AU09: (r) => {
        r.cases[0].frustum[0].drawCalls = 1;
    },
    AU10: (r) => {
        r.cases[0].cycles[29].retained.listeners++;
    },
    AU11: (r) => {
        r.cases[0].observerAuthority.render = true;
    },
    AU12: (r) => {
        r.cases[0].engineModuleIdentities.push('duplicate');
    },
};
for (const id of TASK_IDS) {
    test(`${id}: accepts synthetic CPU oracle unit input, not execution evidence`, () =>
        assert.equal(validateObservation(synthetic(id)).validated, true));
    test(`${id}: rejects semantic corruption`, () => {
        const r = synthetic(id);
        corruptions[id](r);
        assert.throws(() => validateObservation(r));
    });
    test(`${id}: rejects missing/duplicate cases and wrong contract`, () => {
        const r = synthetic(id);
        r.cases.pop();
        assert.throws(() => validateObservation(r));
        const duplicate = synthetic(id);
        duplicate.cases.push(duplicate.cases[0]);
        assert.throws(() => validateObservation(duplicate));
        const version = synthetic(id);
        version.contractId += '-changed';
        assert.throws(() => validateObservation(version));
    });
}
test('independent scalar oracles match hand-derived known answers', () => {
    const uv = uvPoint([1, 0], { offset: [3, 4], scale: [2, 1], rotation: Math.PI / 2 });
    assert(Math.abs(uv[0] - 3) < 1e-12 && Math.abs(uv[1] - 6) < 1e-12);
    assert.deepEqual(sourceOver([1, 0, 0, 0.5], [0, 0, 1, 1]), [0.5, 0, 0.5, 1]);
    assert.deepEqual(film([255, 0, 0, 255]), { factor: 0.8, thickness: 80 });
    const joint = [{ position: [3, 0, 0], scale: [-2, 1, 1], rotation: [0, 0, 0, 1] }];
    assert.deepEqual(skinnedVertices([joint, joint], 0), [
        [5, -1, 0],
        [1, -1, 0],
        [3, 1, 0],
    ]);
    assert.throws(() => assertBounds({ min: [0, 0, 0], max: [1, 1, 1] }, [[2, 0, 0]]));
});
test('rejects NaN, relaxed pixels, missing cycle, fake total memory and readback-only presentation', () => {
    const uv = synthetic('AU05');
    uv.cases[0].points[0][0] = NaN;
    assert.throws(() => validateObservation(uv));
    const pixels = synthetic('AU05');
    pixels.cases[0].freshPixels[0] += 3;
    assert.throws(() => validateObservation(pixels));
    const cycles = synthetic('AU10');
    cycles.cases[0].cycles.pop();
    assert.throws(() => validateObservation(cycles));
    const memory = synthetic('AU10');
    memory.cases[0].totalGpuMemoryBytes = 100;
    assert.throws(() => validateObservation(memory));
    const first = synthetic('AU11');
    first.cases[0].presentation.source = 'gpu-readback';
    assert.throws(() => validateObservation(first));
});
const threeDir =
    process.env.THREE_REFERENCE_PACKAGE_DIR ||
    path.resolve(root, '../upstream-update-20261022-inputs/agent-input-preparation/three-0.186.1/package');
test('exact three public API CPU primitives, no browser execution', { skip: !fs.existsSync(threeDir) }, async () => {
    assert.equal(JSON.parse(fs.readFileSync(path.join(threeDir, 'package.json'))).version, '0.186.1');
    const THREE = await import(pathToFileURL(path.join(threeDir, 'build/three.module.js')));
    const reference = await import(pathToFileURL(path.join(__dirname, 'references/three-reference.mjs')));
    const original = new THREE.MeshBasicMaterial({ map: new THREE.Texture() });
    const owned = original.clone();
    reference.ownedUV(owned, { offset: [0.2, -0.1], scale: [2, 0.5], rotation: 0.7 });
    assert.notEqual(owned.map, original.map);
    const actual = new THREE.Vector3(0.25, 0.75, 1).applyMatrix3(owned.map.matrix).toArray();
    const expected = uvPoint([0.25, 0.75], { offset: [0.2, -0.1], scale: [2, 0.5], rotation: 0.7 });
    expected.forEach((v, i) => assert(Math.abs(actual[i] - v) < 1e-12));
    const material = new THREE.MeshPhysicalMaterial();
    reference.setFilm(THREE, material, { intensity: 0.95, ior: 2.5, minimum: 80, maximum: 670 });
    assert.equal(material.iridescenceIOR, 2.5);
    assert.deepEqual(material.iridescenceThicknessRange, [80, 670]);
    assert.throws(() => reference.setFilm(THREE, material, { intensity: 0.95, ior: 0.9, minimum: 80, maximum: 670 }));
    assert.equal(material.iridescenceIOR, 2.5);
    const targets = reference.makeTargets(THREE);
    assert.notEqual(targets[0].texture, targets[1].texture);
    targets[0].setSize(256, 128);
    assert.equal(targets[1].width, 128);
    targets.forEach((t) => t.dispose());
    const state = reference.ownershipLedger();
    const object = {};
    state.own('materials', object);
    state.release('materials', object);
    state.release('materials', object);
    assert.equal(state.snapshot().materials, 0);
    assert.equal(state.totalGpuMemoryBytes, null);
});
test('request composition snapshots headers, scopes credentials, uses separate abort guards and disposes late output', async () => {
    const ref = await import(pathToFileURL(path.join(__dirname, 'references/three-reference.mjs')));
    const headers = { fixture: 'before' },
        init = ref.requestInit(
            { priority: 'high', httpCache: 'no-cache', headers },
            'http://a.test/mesh',
            'http://a.test/model',
            undefined,
        );
    headers.fixture = 'after';
    assert.equal(init.headers.get('fixture'), 'before');
    assert.equal(init.cache, 'no-cache');
    assert.equal(
        ref.requestInit({ headers }, 'http://b.test/image', 'http://a.test/model').headers.get('fixture'),
        null,
    );
    assert.throws(() => ref.requestInit({ httpCache: 'only-if-cached' }, 'http://b.test/image', 'http://a.test/model'));
    const controller = new AbortController();
    let disposed = 0;
    const asset = {
        scene: {
            traverse(fn) {
                fn({
                    geometry: {
                        dispose() {
                            disposed++;
                        },
                    },
                });
            },
        },
    };
    const loader = {
        async parseAsync() {
            controller.abort();
            return asset;
        },
    };
    await assert.rejects(
        ref.loadFixedDocument({
            loader,
            url: 'http://a.test/model',
            signal: controller.signal,
            fetchImpl: async () => new Response(JSON.stringify({ asset: { version: '2.0' } }), { status: 200 }),
        }),
        { name: 'AbortError' },
    );
    assert.equal(disposed, 1);
});
module.exports = { synthetic };

test(
    'reference receipt revalidates retained bytes and actual archive entry; synthetic CPU receipt is not browser evidence',
    { skip: !fs.existsSync(threeDir) },
    () => {
        const os = require('node:os');
        const contracts = require('./reference-contracts.cjs');
        const { freezeManifest } = require('./references/freeze-manifest.cjs');
        const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'protected-reference-contract-test-'));
        const copy = (relative) => {
            const destination = path.join(temp, relative);
            fs.mkdirSync(path.dirname(destination), { recursive: true });
            fs.copyFileSync(path.join(root, relative), destination);
        };
        const manifest = freezeManifest(threeDir);
        copy(manifest.publicInputManifest.path);
        const task = manifest.tasks.find((t) => t.taskId === 'AU07'),
            reference = task.references.three;
        for (const source of manifest.sources.filter(
            (s) => s.package === 'repository' && [...reference.sourceIds, task.validatorSourceId].includes(s.id),
        ))
            copy(source.path);
        fs.mkdirSync(path.dirname(path.join(temp, contracts.MANIFEST_PATH)), { recursive: true });
        fs.writeFileSync(path.join(temp, contracts.MANIFEST_PATH), JSON.stringify(manifest));
        const manifestSha256 = contracts.sha256(fs.readFileSync(path.join(temp, contracts.MANIFEST_PATH)));
        const artifactPath = path.resolve(threeDir, '../../three-0.186.1.tgz');
        const artifactHash = '8cd068708ea44f2c73c944b1cead2ba2f0d5c15c8fc194e5700f4e4f4a033fe7';
        const runtime = contracts.inspectArtifactRuntime(artifactPath, 'three', artifactHash);
        const observation = synthetic('AU07');
        fs.writeFileSync(path.join(temp, 'observation.json'), JSON.stringify(observation));
        const { PNG } = require('pngjs');
        const png = new PNG({ width: 2, height: 2 });
        for (let i = 0; i < png.data.length; i++) png.data[i] = pixel[i % 4];
        fs.writeFileSync(path.join(temp, 'compositor.png'), PNG.sync.write(png));
        const seed = task.repetitionSeeds[0];
        const invocation = {
            taskId: task.taskId,
            engine: 'three',
            exitCode: 0,
            browserClosed: true,
            serverClosed: true,
            modelCalls: 0,
            generatedTrial: false,
            collectorSha256: reference.collectorAdapter.sha256,
            engineArtifactSha256: artifactHash,
            runtimeModuleSha256: runtime.runtimeModuleSha256,
            commonInputSha256: task.commonInputSha256,
            seed,
            sourceFingerprints: Object.fromEntries(
                reference.sourceIds.map((id) => [id, manifest.sources.find((s) => s.id === id).sha256]),
            ),
        };
        fs.writeFileSync(path.join(temp, 'invocation.json'), JSON.stringify(invocation));
        const artifact = (name) => ({ path: name, sha256: contracts.sha256(fs.readFileSync(path.join(temp, name))) });
        const receipt = {
            schema: 'upstream-agent-reference-receipt/1',
            taskId: task.taskId,
            engine: 'three',
            seed,
            commonInputSha256: task.commonInputSha256,
            contractId: task.contractId,
            manifestSha256,
            engineArtifactSha256: artifactHash,
            runtimeModuleSha256: runtime.runtimeModuleSha256,
            collector: reference.collectorAdapter,
            provenance: {
                kind: 'protected-reference-browser-collection',
                generatedTrial: false,
                scriptedBenchmarkRun: false,
            },
            browser: {
                name: 'SYNTHETIC_CPU_TEST_NOT_BROWSER',
                version: 'unit',
                backend: 'webgl2',
                renderer: 'unit',
                device: 'unit',
            },
            startedAt: '2026-10-22T00:00:00Z',
            finishedAt: '2026-10-22T00:00:01Z',
            artifacts: {
                observation: artifact('observation.json'),
                compositor: artifact('compositor.png'),
                invocation: artifact('invocation.json'),
            },
        };
        const options = {
            root: temp,
            evidenceRoot: temp,
            threePackageDir: threeDir,
            engineArtifactPath: artifactPath,
            taskId: task.taskId,
            commonInputSha256: task.commonInputSha256,
            seed,
            engineArtifactSha256: artifactHash,
        };
        assert.equal(contracts.validateReferenceReceipt(receipt, options).validated, true);
        for (const [label, change] of [
            [
                'wrong frozen common input',
                (r) => {
                    r.commonInputSha256 = 'b'.repeat(64);
                },
            ],
            [
                'wrong runtime archive entry',
                (r) => {
                    r.runtimeModuleSha256 = 'b'.repeat(64);
                },
            ],
            [
                'generated output masquerading as reference',
                (r) => {
                    r.provenance.generatedTrial = true;
                },
            ],
            [
                'scripted benchmark score masquerading as reference',
                (r) => {
                    r.provenance.scriptedBenchmarkRun = true;
                },
            ],
            [
                'artifact path escape',
                (r) => {
                    r.artifacts.observation.path = '../outside.json';
                },
            ],
            [
                'no real source binding',
                (r) => {
                    r.collector.sha256 = 'b'.repeat(64);
                },
            ],
            [
                'wrong output bytes',
                (r) => {
                    r.artifacts.observation.sha256 = 'b'.repeat(64);
                },
            ],
        ]) {
            const altered = clone(receipt);
            change(altered);
            assert.throws(() => contracts.validateReferenceReceipt(altered, options), label);
        }
        assert.throws(
            () => contracts.validateReferenceReceipt(receipt, { ...options, seed: 1 }),
            'caller cannot authorize an unfrozen seed',
        );
        assert.throws(() =>
            contracts.validateReferenceReceipt(receipt, { ...options, engineArtifactSha256: 'b'.repeat(64) }),
        );
        fs.appendFileSync(path.join(temp, manifest.sources.find((s) => s.id === 'validator').path), '\n// changed\n');
        assert.throws(() => contracts.validateReferenceReceipt(receipt, options), /validator source changed/);
        // Temporary synthetic evidence is deliberately not exported as a retained reference receipt.
        fs.rmSync(temp, { recursive: true });
    },
);

test('protected collector serves exact frozen HTTP resources and parseable bootstrap without opening a browser', async () => {
    const { startReferenceServer } = require('./references/collect-reference.cjs');
    const inputs = JSON.parse(fs.readFileSync(path.join(root, 'tools/benchmark/upstream/public-inputs.json')));
    const server = await startReferenceServer({
        root,
        threePackageDir: threeDir,
        runtimeFile: path.join(root, 'build/cocosair.module.js'),
        task: inputs.tasks.find((t) => t.id === 'AU05'),
        publicInputs: inputs,
        engine: 'three',
    });
    try {
        for (const resource of inputs.resources) {
            const response = await fetch(server.origin + '/' + resource.publicPath);
            assert.equal(response.status, 200);
            const actual = Buffer.from(await response.arrayBuffer());
            assert.equal(require('./reference-contracts.cjs').sha256(actual), resource.sha256);
        }
        for (const page of ['/paired-reference.html', '/paired-readiness.html?case=cold']) {
            const html = await (await fetch(server.origin + page)).text();
            const source = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
            assert(source, 'native module bootstrap required');
            require('esbuild').transformSync(source, { loader: 'js', format: 'esm' });
        }
        assert.equal((await fetch(server.origin + '/three/../../../../etc/passwd')).status, 404);
    } finally {
        await server.close();
    }
});

test('common oracle rejects omitted request snapshot/credentials/native comparison and wrong frozen ancestor/camera', () => {
    for (const corrupt of [
        (r) => {
            r.cases[1].credentialObservations[0].calls[1].credentials = 'include';
        },
        (r) => {
            delete r.cases[1].optionFreeNativeObservation;
        },
        (r) => {
            r.cases[1].headerSnapshotObservation.calls[0].headers['x-fixture'] = 'after-configuration';
        },
        (r) => {
            r.cases[0].httpCacheObservations.pop();
        },
    ]) {
        const r = synthetic('AU02');
        corrupt(r);
        assert.throws(() => validateObservation(r));
    }
    const ancestor = synthetic('AU04');
    ancestor.cases[0].instances[2].ancestor.scale[0] = 0.5;
    assert.throws(() => validateObservation(ancestor));
    const camera = synthetic('AU09');
    camera.cases[0].camera.verticalHalfExtent = 2;
    assert.throws(() => validateObservation(camera));
    const frustum = synthetic('AU09');
    frustum.cases[0].frustum[0].jointChains[0][0].position[0] = 0;
    assert.throws(() => validateObservation(frustum));
});

test('request collector bootstrap and gateway retain native same-origin resources without a browser', async () => {
    const { startReferenceServer } = require('./references/collect-reference.cjs');
    const { startRequestReferenceServer } = require('./references/request-server.cjs');
    const inputs = JSON.parse(fs.readFileSync(path.join(root, 'tools/benchmark/upstream/public-inputs.json')));
    for (const engine of ['cocosair', 'three']) {
        const server = await startReferenceServer({
            root,
            threePackageDir: threeDir,
            runtimeFile: path.join(root, 'build/cocosair.module.js'),
            task: inputs.tasks.find((t) => t.id === 'AU02'),
            publicInputs: inputs,
            engine,
        });
        let gateway;
        try {
            gateway = await startRequestReferenceServer({ root, staticOrigin: server.origin });
            const config = await (await fetch(gateway.origin + '/__paired-request/config')).json();
            assert.equal(config.primaryOrigin, gateway.origin);
            const source = (await (await fetch(gateway.origin + '/paired-reference.html')).text()).match(
                /<script type="module">([\s\S]*?)<\/script>/,
            )[1];
            require('esbuild').transformSync(source, { loader: 'js', format: 'esm' });
            assert(source.includes('runRequestReference'));
            const response = await fetch(config.basicURL);
            assert.equal(response.status, 200);
            assert.equal(
                require('./reference-contracts.cjs').sha256(Buffer.from(await response.arrayBuffer())),
                config.resourceHashes['model.gltf'],
            );
            assert(gateway.receipts().sessions.base.entries.length > 0);
        } finally {
            if (gateway) await gateway.close();
            await server.close();
        }
    }
});

for (const engine of ['cocosair', 'three']) {
    test(`SDK oracle accepts ${engine} common compiler modes with only its own compatibility modes`, () => {
        const report = synthetic('AU12', engine);
        const types = report.cases.find((row) => row.id === 'strict-types');
        const expected =
            engine === 'cocosair'
                ? ['4.9.5/node', '4.9.5/node16', '5.9.3/node16', '5.9.3/bundler']
                : ['5.9.3/node16', '5.9.3/bundler'];
        assert.deepEqual(
            types.modes.map((row) => row.id),
            expected,
        );
        assert.deepEqual(
            types.parity.map((row) => row.id),
            expected,
        );
        assert.equal(validateObservation(report).validated, true);
    });

    test(`SDK oracle rejects absent or stale ${engine} compiler contracts`, () => {
        for (const contract of [
            undefined,
            null,
            'upstream-sdk-types/1',
            'upstream-sdk-types/2',
            'upstream-sdk-types/4',
        ]) {
            const report = synthetic('AU12', engine);
            const types = report.cases.find((row) => row.id === 'strict-types');
            if (contract === undefined) delete types.compilerContract;
            else types.compilerContract = contract;
            assert.throws(() => validateObservation(report), /current SDK compiler contract required/);
        }
    });

    test(`SDK oracle rejects ${engine} candidate-only, missing, stale and unknown fixture scopes`, () => {
        for (const scope of [undefined, null, 'paired-common/0', 'candidate-u06-extension/1', 'unknown/1']) {
            const report = synthetic('AU12', engine);
            const types = report.cases.find((row) => row.id === 'strict-types');
            assert.equal(validateObservation(report).validated, true, 'otherwise complete common observation');
            if (scope === undefined) delete types.fixtureScope;
            else types.fixtureScope = scope;
            assert.throws(() => validateObservation(report), /paired common SDK fixture scope required/);
        }
    });

    test(`SDK oracle rejects missing, duplicate or mislabeled ${engine} common coverage`, () => {
        for (const id of ['5.9.3/node16', '5.9.3/bundler']) {
            for (const field of ['commonModeIds', 'modes', 'parity']) {
                for (const corruption of ['missing', 'duplicate', 'mislabeled']) {
                    const report = synthetic('AU12', engine);
                    const types = report.cases.find((row) => row.id === 'strict-types');
                    const index = types[field].findIndex((row) => (field === 'commonModeIds' ? row : row.id) === id);
                    if (corruption === 'missing') types[field].splice(index, 1);
                    else if (corruption === 'duplicate') types[field].push(clone(types[field][index]));
                    else if (field === 'commonModeIds') types[field][index] = '5.9.3/node';
                    else types[field][index].id = '5.9.3/node';
                    assert.throws(() => validateObservation(report), `${field}: ${corruption} ${id}`);
                }
            }
        }
        for (const field of ['commonModeIds', 'compatibilityModeIds']) {
            const report = synthetic('AU12', engine);
            delete report.cases.find((row) => row.id === 'strict-types')[field];
            assert.throws(() => validateObservation(report), `absent ${field}`);
        }
    });

    test(`SDK oracle retains ${engine} strict negatives and runtime parity checks in every compiler mode`, () => {
        const baseline = synthetic('AU12', engine);
        const baselineTypes = baseline.cases.find((row) => row.id === 'strict-types');
        for (const id of baselineTypes.modes.map((mode) => mode.id)) {
            for (const field of ['strictNullChecks', 'skipLibCheck']) {
                const report = clone(baseline);
                report.cases.find((row) => row.id === 'strict-types').modes.find((mode) => mode.id === id)[field] =
                    false;
                assert.throws(() => validateObservation(report), `${id}: relaxed ${field}`);
            }
            for (const category of baselineTypes.negativeCategories) {
                const report = clone(baseline);
                const types = report.cases.find((row) => row.id === 'strict-types');
                const mode = types.modes.find((mode) => mode.id === id);
                mode.negativeControls.find((control) => control.category === category).diagnostics = [];
                assert.throws(() => validateObservation(report), `${id}: vacuous ${category} negative`);
            }
            for (const field of [
                'missingRuntime',
                'missingDeclaration',
                'missingMathRuntime',
                'missingMathDeclaration',
            ]) {
                const report = clone(baseline);
                report.cases.find((row) => row.id === 'strict-types').parity.find((row) => row.id === id)[field] = [
                    'unexpected',
                ];
                assert.throws(() => validateObservation(report), `${id}: ${field}`);
            }
        }
    });
}

test('SDK oracle requires the dedicated Cocos common fixture and its complete native negative inventory', () => {
    for (const path of ['test/fixtures/upstream-sdk/contracts.ts', 'unknown.ts', undefined]) {
        const report = synthetic('AU12', 'cocosair');
        report.cases.find((row) => row.id === 'strict-types').fixtureSource.path = path;
        assert.throws(() => validateObservation(report), `non-common fixture path: ${path}`);
    }
    for (const count of [20, 22, 33, undefined]) {
        const report = synthetic('AU12', 'cocosair');
        report.cases.find((row) => row.id === 'strict-types').fixtureSource.originalNegativeCases = count;
        assert.throws(() => validateObservation(report), `wrong original common negative count: ${count}`);
    }
    for (const count of [22, 24, 36]) {
        const report = synthetic('AU12', 'cocosair');
        const types = report.cases.find((row) => row.id === 'strict-types');
        types.negativeCases = count;
        types.modes.forEach((mode) => {
            mode.negativeCases = count;
            mode.negativeControls = Array.from({ length: count }, (_, i) =>
                clone(mode.negativeControls[i % mode.negativeControls.length]),
            );
        });
        assert.throws(() => validateObservation(report), /retain all 21 paired native negatives/);
    }
});

test('SDK oracle retains every Cocos common native category without accepting candidate request-policy coverage', () => {
    const baseline = synthetic('AU12', 'cocosair');
    const baselineTypes = baseline.cases.find((row) => row.id === 'strict-types');
    assert.equal(baselineTypes.negativeCategories.includes('request-policy'), false);
    for (const category of baselineTypes.negativeCategories) {
        const report = clone(baseline);
        const types = report.cases.find((row) => row.id === 'strict-types');
        types.negativeCategories = types.negativeCategories.filter((value) => value !== category);
        types.modes.forEach((mode) => {
            mode.negativeCategories = [...types.negativeCategories];
            mode.negativeControls.forEach((control) => {
                if (control.category === category) control.category = types.negativeCategories[0];
            });
        });
        assert.throws(() => validateObservation(report), `self-consistently removed ${category}`);
    }
    const report = clone(baseline);
    const types = report.cases.find((row) => row.id === 'strict-types');
    types.negativeCategories.push('request-policy');
    types.modes.forEach((mode) => {
        mode.negativeCategories = [...types.negativeCategories];
        mode.negativeControls[mode.negativeControls.length - 1].category = 'request-policy';
    });
    assert.throws(() => validateObservation(report), 'candidate request-policy cannot change the paired scope');
});

test('SDK oracle rejects either removed Cocos legacy check, including a self-consistent reduced inventory', () => {
    for (const id of ['4.9.5/node', '4.9.5/node16']) {
        for (const field of ['compatibilityModeIds', 'modes', 'parity', 'all']) {
            const report = synthetic('AU12', 'cocosair');
            const types = report.cases.find((row) => row.id === 'strict-types');
            for (const key of field === 'all' ? ['compatibilityModeIds', 'modes', 'parity'] : [field]) {
                types[key] = types[key].filter((row) => (key === 'compatibilityModeIds' ? row : row.id) !== id);
            }
            assert.throws(() => validateObservation(report), `${field}: removed ${id}`);
        }
    }
});

test('SDK oracle rejects Three legacy checks even when its declared modes and parity agree', () => {
    for (const id of ['4.9.5/node', '4.9.5/node16']) {
        for (const field of ['compatibilityModeIds', 'modes', 'parity', 'all']) {
            const report = synthetic('AU12');
            const types = report.cases.find((row) => row.id === 'strict-types');
            for (const key of field === 'all' ? ['compatibilityModeIds', 'modes', 'parity'] : [field]) {
                types[key].push(key === 'compatibilityModeIds' ? id : { ...clone(types[key][0]), id });
            }
            assert.throws(() => validateObservation(report), `${field}: incorrectly applied ${id}`);
        }
    }
});

test('SDK oracle rejects vacuous negative types, DOM math drift and readback-only claims', () => {
    for (const mutate of [
        (r) => {
            r.cases[1].modes[0].negativeControls[0].diagnostics = [];
        },
        (r) => {
            r.cases[1].negativeCategories = ['nullable'];
        },
        (r) => {
            r.cases[1].parity[0].missingRuntime = ['unexpected'];
        },
        (r) => {
            r.cases[3].matrixTransformedVector = [0, 0, 0];
        },
        (r) => {
            r.cases[0].browserModes[0].presentation.source = 'readback';
        },
        (r) => {
            r.cases[4].missingProviders[0].rejected = false;
        },
    ]) {
        const report = synthetic('AU12');
        mutate(report);
        assert.throws(() => validateObservation(report));
    }
});

test('package tree verification rejects modified transitive modules even when public entry bytes match', () => {
    const os = require('node:os'),
        { execFileSync } = require('node:child_process');
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-tree-integrity-')),
        tree = path.join(temp, 'package');
    try {
        fs.mkdirSync(tree);
        fs.writeFileSync(path.join(tree, 'package.json'), '{}');
        fs.writeFileSync(path.join(tree, 'entry.js'), "import './dependency.js';\n");
        fs.writeFileSync(path.join(tree, 'dependency.js'), 'export const value=1;\n');
        const archive = path.join(temp, 'synthetic.tgz');
        execFileSync('tar', ['-czf', archive, 'package'], { cwd: temp });
        const { verifyExtractedArtifact } = require('./reference-contracts.cjs');
        assert.equal(verifyExtractedArtifact(archive, tree).files, 3);
        fs.appendFileSync(path.join(tree, 'dependency.js'), '// substituted transitive implementation\n');
        assert.throws(() => verifyExtractedArtifact(archive, tree), /transitive module/);
    } finally {
        fs.rmSync(temp, { recursive: true });
    }
});
